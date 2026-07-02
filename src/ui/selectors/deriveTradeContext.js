/**
 * deriveTradeContext.js — Display-only trade offer readability (V1)
 *
 * ──────────────────────────────────────────────────────────────────────────
 * GUARDRAIL
 * ──────────────────────────────────────────────────────────────────────────
 * Display-only selector. Do not import into trade valuation, trade acceptance,
 * AI trade behavior, cap legality, simulation, or save migration logic.
 * It may only be imported by UI components and tests.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS
 * ──────────────────────────────────────────────────────────────────────────
 * A pure, deterministic, *presentational* selector for the trade builder.
 * Given the current offer as the UI already sees it (players/picks on each
 * side, the display-only value figures the ValueBar already renders, the
 * other team's visible needs list, and the user's before/after cap room),
 * it derives:
 *
 *   - a plain-language read on which way the package leans (userBalance),
 *   - up to two cautious "why they might listen" motivation labels, and
 *   - an optional user-side cap note.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS NOT
 * ──────────────────────────────────────────────────────────────────────────
 * This is NOT the trade acceptance brain and must never feed it. It does not
 * compute valuation — it interprets numbers the screen already displays. It
 * is deliberately separate from deriveNegotiationContext.js, which covers
 * contract / FA / re-sign stance only.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * SAVE COMPATIBILITY / PURITY
 * ──────────────────────────────────────────────────────────────────────────
 * Derived at render time only — no persistence, no migration. Every field
 * read is defensive: missing or malformed fields cause the relevant signal to
 * be skipped silently. Inputs are never mutated; same inputs → same output.
 */

// ── Public constants ──────────────────────────────────────────────────────────

export const TRADE_BALANCE = Object.freeze({
  FAVORABLE: 'FAVORABLE',
  EVEN: 'EVEN',
  UNFAVORABLE: 'UNFAVORABLE',
  UNKNOWN: 'UNKNOWN',
});

const BALANCE_LABELS = Object.freeze({
  [TRADE_BALANCE.FAVORABLE]: 'This package leans in your favor.',
  [TRADE_BALANCE.EVEN]: 'This package looks close to even.',
  [TRADE_BALANCE.UNFAVORABLE]: 'You are giving up more than you are getting back.',
  [TRADE_BALANCE.UNKNOWN]: 'Not enough selected to read this deal yet.',
});

export const MOTIVATION_CODES = Object.freeze({
  NEEDS_POSITION: 'NEEDS_POSITION',
  WIN_NOW_ACQUIRE: 'WIN_NOW_ACQUIRE',
  REBUILDER_SHED: 'REBUILDER_SHED',
  SHEDDING_CAP: 'SHEDDING_CAP',
  PICK_ACCUMULATION: 'PICK_ACCUMULATION',
  ACQUIRING_YOUTH: 'ACQUIRING_YOUTH',
});

// Front-office persona keys (mirrors core/ai/frontOfficePersonaEngine.js,
// read-only — mirrored rather than imported so this file never pulls in
// engine code).
const PERSONA = Object.freeze({
  WIN_NOW: 'WIN_NOW',
  PATIENT_BUILDER: 'PATIENT_BUILDER',
  CAP_HOARDER: 'CAP_HOARDER',
});

// ── Tuning thresholds (display heuristics only) ──────────────────────────────

// Mirrors the ValueBar fairness band: within ±15% of total value reads "even".
const EVEN_BAND = 0.15;
// "High-OVR" cut, consistent with the STAR_OVR convention used elsewhere in UI.
const STAR_OVR = 78;
// "Veteran" age, consistent with the aging-core cut in teamIntelligence.
const VETERAN_AGE = 30;
// Average-age gap (years) before a package reads as a youth acquisition.
const YOUTH_AGE_GAP = 3;
// Net salary ($M) the other team must shed before it reads as a cap dump.
const CAP_SHED_MIN = 5;
// Projected user cap room ($M) under which a worsening move reads as pressure
// (mirrors the "tight" threshold in CapImpactSummary).
const TIGHT_CAP_ROOM = 5;
// Cap room gain ($M) before a move reads as creating flexibility.
const CAP_RELIEF_MIN = 3;

const MAX_MOTIVATION_LABELS = 2;

const CAP_NOTES = Object.freeze({
  PRESSURE: 'This tightens your cap picture.',
  RELIEF: 'This creates cap flexibility.',
});

// Priority: lower = more specific / stronger signal, surfaced first.
const MOTIVATION_PRIORITY = Object.freeze({
  [MOTIVATION_CODES.NEEDS_POSITION]: 1,
  [MOTIVATION_CODES.WIN_NOW_ACQUIRE]: 2,
  [MOTIVATION_CODES.REBUILDER_SHED]: 3,
  [MOTIVATION_CODES.SHEDDING_CAP]: 4,
  [MOTIVATION_CODES.PICK_ACCUMULATION]: 5,
  [MOTIVATION_CODES.ACQUIRING_YOUTH]: 6,
});

// ── Defensive readers (never throw on partial / old-save shapes) ──────────────

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function playerPos(player) {
  const raw = player?.pos ?? player?.position;
  return raw ? String(raw).toUpperCase() : null;
}

function sumSalary(players) {
  return players.reduce((sum, p) => sum + num(p?.contract?.baseAnnual), 0);
}

/** Average age across players with a finite age, or null when none have one. */
function avgAge(players) {
  const ages = players.map((p) => Number(p?.age)).filter((n) => Number.isFinite(n) && n > 0);
  if (!ages.length) return null;
  return ages.reduce((sum, n) => sum + n, 0) / ages.length;
}

// ── Balance ───────────────────────────────────────────────────────────────────

function resolveBalance({ hasAssets, userOfferValue, otherOfferValue }) {
  if (!hasAssets) return TRADE_BALANCE.UNKNOWN;
  const gives = Number(userOfferValue);
  const gets = Number(otherOfferValue);
  if (!Number.isFinite(gives) || !Number.isFinite(gets)) return TRADE_BALANCE.UNKNOWN;
  const total = gives + gets;
  if (total <= 0) return TRADE_BALANCE.UNKNOWN;
  const diff = gets - gives;
  if (Math.abs(diff) < total * EVEN_BAND) return TRADE_BALANCE.EVEN;
  return diff > 0 ? TRADE_BALANCE.FAVORABLE : TRADE_BALANCE.UNFAVORABLE;
}

// ── Motivation signals (all SUPPORTED-only, all from visible offer data) ──────

/**
 * Collects fired motivation codes with their display labels.
 * "They" is always the other team: they receive what the user gives.
 */
function collectMotivations({
  theyGetPlayers,
  theySendPlayers,
  theyGetPicks,
  otherTeamNeeds,
  persona,
}) {
  const fired = [];

  // NEEDS_POSITION — a player they receive matches a visible roster need.
  const needsSet = new Set(
    arr(otherTeamNeeds).map((n) => String(n).toUpperCase()).filter(Boolean),
  );
  const neededPos = theyGetPlayers.map(playerPos).find((pos) => pos && needsSet.has(pos));
  if (neededPos) {
    fired.push({
      code: MOTIVATION_CODES.NEEDS_POSITION,
      label: `They may need help at ${neededPos}.`,
    });
  }

  // WIN_NOW_ACQUIRE — win-now front office receiving a high-OVR player.
  if (persona === PERSONA.WIN_NOW && theyGetPlayers.some((p) => num(p?.ovr) >= STAR_OVR)) {
    fired.push({
      code: MOTIVATION_CODES.WIN_NOW_ACQUIRE,
      label: 'This fits a win-now roster push.',
    });
  }

  // REBUILDER_SHED — patient/cap-focused front office sending a high-OVR veteran.
  if (
    (persona === PERSONA.PATIENT_BUILDER || persona === PERSONA.CAP_HOARDER) &&
    theySendPlayers.some((p) => num(p?.ovr) >= STAR_OVR && num(p?.age) >= VETERAN_AGE)
  ) {
    fired.push({
      code: MOTIVATION_CODES.REBUILDER_SHED,
      label: 'They may be pivoting toward a longer-term build.',
    });
  }

  // SHEDDING_CAP — they send meaningfully more salary than they take back.
  if (sumSalary(theySendPlayers) - sumSalary(theyGetPlayers) >= CAP_SHED_MIN) {
    fired.push({
      code: MOTIVATION_CODES.SHEDDING_CAP,
      label: 'They may be looking to clear cap space.',
    });
  }

  // PICK_ACCUMULATION — they move players out and take draft capital back.
  if (theySendPlayers.length > 0 && theyGetPicks.length > 0) {
    fired.push({
      code: MOTIVATION_CODES.PICK_ACCUMULATION,
      label: 'They are collecting future draft capital.',
    });
  }

  // ACQUIRING_YOUTH — the players they receive are meaningfully younger than
  // the players they send (both sides need known ages).
  const getAge = avgAge(theyGetPlayers);
  const sendAge = avgAge(theySendPlayers);
  if (getAge != null && sendAge != null && sendAge - getAge >= YOUTH_AGE_GAP) {
    fired.push({
      code: MOTIVATION_CODES.ACQUIRING_YOUTH,
      label: 'They appear to be acquiring for the future.',
    });
  }

  fired.sort(
    (a, b) => (MOTIVATION_PRIORITY[a.code] ?? 99) - (MOTIVATION_PRIORITY[b.code] ?? 99),
  );
  return fired;
}

// ── Cap note (user side only) ─────────────────────────────────────────────────

function resolveCapNote({ userCapRoomBefore, userCapRoomAfter }) {
  const before = Number(userCapRoomBefore);
  const after = Number(userCapRoomAfter);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  if (after < before && after < TIGHT_CAP_ROOM) return CAP_NOTES.PRESSURE;
  if (after - before >= CAP_RELIEF_MIN) return CAP_NOTES.RELIEF;
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @typedef {object} TradeContext
 * @property {'FAVORABLE'|'EVEN'|'UNFAVORABLE'|'UNKNOWN'} userBalance
 * @property {string}   userBalanceLabel     Always a non-empty string.
 * @property {string[]} otherTeamMotivation  Raw codes (for tests/tools only).
 * @property {string[]} motivationLabels     Plain-language labels (max 2).
 * @property {string|null} capNote           User-side cap note, when relevant.
 */

/**
 * Derive display-only readability context for the trade offer currently on
 * screen. Pure and deterministic; mutates nothing; never throws on partial
 * input (old/incomplete saves included).
 *
 * All value/cap figures are the display numbers the trade screen already
 * computes and shows — this selector interprets them, it does not price assets.
 *
 * @param {object} params
 * @param {object[]} [params.userGivesPlayers]  Players the user sends (they receive).
 * @param {object[]} [params.userGetsPlayers]   Players the user receives (they send).
 * @param {object[]} [params.userGivesPicks]    Picks the user sends (they receive).
 * @param {object[]} [params.userGetsPicks]     Picks the user receives (they send).
 * @param {number}   [params.userOfferValue]    Display value of what the user gives.
 * @param {number}   [params.otherOfferValue]   Display value of what the user gets.
 * @param {object}   [params.otherTeam]         Partner team (frontOffice persona).
 * @param {string[]} [params.otherTeamNeeds]    Partner's visible need positions.
 * @param {number}   [params.userCapRoomBefore] User cap room before the trade ($M).
 * @param {number}   [params.userCapRoomAfter]  Projected user cap room after ($M).
 * @returns {TradeContext}
 */
export function deriveTradeContext({
  userGivesPlayers,
  userGetsPlayers,
  userGivesPicks,
  userGetsPicks,
  userOfferValue,
  otherOfferValue,
  otherTeam,
  otherTeamNeeds,
  userCapRoomBefore,
  userCapRoomAfter,
} = {}) {
  const theyGetPlayers = arr(userGivesPlayers).filter(Boolean);
  const theySendPlayers = arr(userGetsPlayers).filter(Boolean);
  const theyGetPicks = arr(userGivesPicks).filter(Boolean);
  const theySendPicks = arr(userGetsPicks).filter(Boolean);

  const hasAssets =
    theyGetPlayers.length > 0 ||
    theySendPlayers.length > 0 ||
    theyGetPicks.length > 0 ||
    theySendPicks.length > 0;

  const userBalance = resolveBalance({ hasAssets, userOfferValue, otherOfferValue });

  const motivations = hasAssets
    ? collectMotivations({
        theyGetPlayers,
        theySendPlayers,
        theyGetPicks,
        otherTeamNeeds,
        persona: otherTeam?.frontOffice?.persona ?? null,
      })
    : [];

  return {
    userBalance,
    userBalanceLabel: BALANCE_LABELS[userBalance] ?? BALANCE_LABELS[TRADE_BALANCE.UNKNOWN],
    otherTeamMotivation: motivations.map((m) => m.code),
    motivationLabels: motivations.slice(0, MAX_MOTIVATION_LABELS).map((m) => m.label),
    capNote: hasAssets ? resolveCapNote({ userCapRoomBefore, userCapRoomAfter }) : null,
  };
}

export default deriveTradeContext;
