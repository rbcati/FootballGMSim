/**
 * deriveNegotiationContext.js — Display-only negotiation stance derivation (V1)
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS
 * ──────────────────────────────────────────────────────────────────────────
 * A pure, deterministic, *presentational* selector. Given a player, the user's
 * team, and league state, it derives a human-readable "negotiation stance"
 * (EAGER / NEUTRAL / RELUCTANT / UNAVAILABLE) plus a short list of plain-language
 * "front-office context" reasons, for display on the Free Agency and re-sign /
 * extension surfaces.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS NOT
 * ──────────────────────────────────────────────────────────────────────────
 * It is NOT contract logic. It does not — and must never — influence asking
 * price, willingness gating, cap-legal checks, acceptance logic, simulation
 * scoring, trade valuation, owner pressure, or any persisted save data. It lives
 * under `ui/selectors/` (not `engine/contracts/`) precisely so this intent is
 * structurally visible: nothing here feeds back into gameplay.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * SAVE COMPATIBILITY (Scope D)
 * ──────────────────────────────────────────────────────────────────────────
 * This is derived at render time only. There is NO migration and NO new
 * persistence. Every field read is defensive: missing / undefined fields cause
 * the relevant reason code to be skipped silently and the stance to fall back to
 * NEUTRAL. The function must never throw on old save data.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * PURITY GUARANTEE
 * ──────────────────────────────────────────────────────────────────────────
 * Inputs are never mutated. Same inputs → same output, always (no Math.random,
 * no Date, no I/O). Only fields that are reliably populated across the codebase
 * are read (see the A0 field-discovery classification in the PR description).
 */

// ── Stance constants ──────────────────────────────────────────────────────────

export const NEGOTIATION_STANCES = Object.freeze({
  EAGER: 'EAGER',
  NEUTRAL: 'NEUTRAL',
  RELUCTANT: 'RELUCTANT',
  UNAVAILABLE: 'UNAVAILABLE',
});

const STANCE_LABELS = Object.freeze({
  EAGER: 'Eager to re-sign',
  NEUTRAL: 'Open to discussions',
  RELUCTANT: 'Hesitant on a new deal',
  UNAVAILABLE: 'Not available to re-sign',
});

// Front-office persona keys (mirrors core/ai/frontOfficePersonaEngine.js, read-only).
const PERSONA = Object.freeze({
  WIN_NOW: 'WIN_NOW',
  PATIENT_BUILDER: 'PATIENT_BUILDER',
  CAP_HOARDER: 'CAP_HOARDER',
  PLAYER_LOYALIST: 'PLAYER_LOYALIST',
});

// "Key contributor" / star caliber threshold. OVR is a reliably populated field;
// this mirrors the OVR>=78 cut the spec already sanctions for CAP_HOARDER_FRICTION.
const STAR_OVR = 78;

// A win% "clearly below" a competitive line. Only evaluated once real games exist,
// so an unplayed 0-0 season never trips this (its win% is treated as undefined).
const REBUILDER_WIN_PCT = 0.35;

// ── Reason code catalogue (SUPPORTED codes only — V1) ─────────────────────────
//
// polarity: 'positive' pulls toward EAGER, 'negative' pulls toward RELUCTANT.
// label:    plain-language front-office framing. No label asserts a player's
//           internal emotion or intent — the game tracks no mood value here.
// priority: lower = stronger signal, surfaced first.

export const REASON_CODES = Object.freeze({
  WIN_NOW_URGENCY: 'WIN_NOW_URGENCY',
  LOYALTY_PERSONA: 'LOYALTY_PERSONA',
  LOYAL_TENURE: 'LOYAL_TENURE',
  VETERAN_LOYALTY: 'VETERAN_LOYALTY',
  REBUILDER_FRICTION: 'REBUILDER_FRICTION',
  CAP_HOARDER_FRICTION: 'CAP_HOARDER_FRICTION',
});

const REASON_META = Object.freeze({
  [REASON_CODES.WIN_NOW_URGENCY]: {
    polarity: 'positive',
    priority: 1,
    label: 'The front office is committed to winning now.',
  },
  [REASON_CODES.LOYALTY_PERSONA]: {
    polarity: 'positive',
    priority: 2,
    label: 'The front office values player loyalty.',
  },
  [REASON_CODES.LOYAL_TENURE]: {
    polarity: 'positive',
    priority: 3,
    label: 'He has history with this franchise.',
  },
  [REASON_CODES.VETERAN_LOYALTY]: {
    polarity: 'positive',
    priority: 4,
    label: 'He feels a bond with this team late in his career.',
  },
  [REASON_CODES.REBUILDER_FRICTION]: {
    polarity: 'negative',
    priority: 5,
    label: 'He may prefer a more competitive situation.',
  },
  [REASON_CODES.CAP_HOARDER_FRICTION]: {
    polarity: 'negative',
    priority: 6,
    label: "He may be uncertain about the front office's commitment.",
  },
});

const MAX_REASONS = 3;

// ── Defensive readers (never throw on partial / old-save shapes) ──────────────

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Current-team win fraction, or null when it cannot be reliably determined
 * (no games played yet → an unplayed record must not read as a rebuild).
 */
function resolveWinPct(team) {
  const wins = num(team?.wins);
  const losses = num(team?.losses);
  const ties = num(team?.ties);
  const games = wins + losses + ties;
  if (games <= 0) return null;
  return (wins + ties * 0.5) / games;
}

/**
 * UNAVAILABLE flag: agent negotiations frozen for the current season.
 * `negotiationState.negotiationsFrozenUntilSeason` is initialised on every
 * player (core/player.js), so this read is safe on new and old saves alike.
 * When no current season is supplied, we cannot assert unavailability → false.
 */
function isUnavailable(player, league) {
  const frozenUntil = player?.negotiationState?.negotiationsFrozenUntilSeason;
  if (frozenUntil == null) return false;
  const currentSeason = league?.seasonId ?? league?.year ?? null;
  if (currentSeason == null) return false;
  return frozenUntil === currentSeason;
}

// ── Reason derivation (SUPPORTED codes only) ──────────────────────────────────

/**
 * Collects every SUPPORTED reason code whose trigger fires for this
 * player/team. Pure: reads only, returns a fresh array of code strings.
 */
function collectReasonCodes(player, team) {
  const codes = [];

  const tenure = num(player?.tenureYears);
  const age = num(player?.age);
  const ovr = num(player?.ovr);
  const persona = team?.frontOffice?.persona ?? null;
  const winPct = resolveWinPct(team);

  // Positive — loyalty / tenure signals
  if (tenure >= 3) codes.push(REASON_CODES.LOYAL_TENURE);
  if (age >= 32 && tenure >= 2) codes.push(REASON_CODES.VETERAN_LOYALTY);
  if (persona === PERSONA.PLAYER_LOYALIST) codes.push(REASON_CODES.LOYALTY_PERSONA);

  // Positive — front office committed to winning now around a key contributor
  if (persona === PERSONA.WIN_NOW && ovr >= STAR_OVR) {
    codes.push(REASON_CODES.WIN_NOW_URGENCY);
  }

  // Negative — friction signals for a quality player
  if (persona === PERSONA.CAP_HOARDER && ovr >= STAR_OVR) {
    codes.push(REASON_CODES.CAP_HOARDER_FRICTION);
  }
  if (winPct != null && winPct < REBUILDER_WIN_PCT && ovr >= STAR_OVR) {
    codes.push(REASON_CODES.REBUILDER_FRICTION);
  }

  return codes;
}

/**
 * Resolve the stance from fired reason codes.
 * Priority order (per spec):
 *   1. UNAVAILABLE handled before this point.
 *   2. EAGER     — 2+ positive codes, 0 negative.
 *   3. RELUCTANT — 1+ negative code (a friction signal outweighs positives).
 *   4. NEUTRAL   — default.
 */
function resolveStance(codes) {
  let positives = 0;
  let negatives = 0;
  for (const code of codes) {
    const polarity = REASON_META[code]?.polarity;
    if (polarity === 'positive') positives += 1;
    else if (polarity === 'negative') negatives += 1;
  }
  if (positives >= 2 && negatives === 0) return NEGOTIATION_STANCES.EAGER;
  if (negatives >= 1) return NEGOTIATION_STANCES.RELUCTANT;
  return NEGOTIATION_STANCES.NEUTRAL;
}

/**
 * Order fired codes so the reasons matching the resolved stance's polarity lead,
 * then by signal strength (priority). Deterministic; caps at MAX_REASONS.
 */
function orderReasonCodes(codes, stance) {
  const leadPolarity =
    stance === NEGOTIATION_STANCES.RELUCTANT ? 'negative' : 'positive';
  return [...codes]
    .sort((a, b) => {
      const ma = REASON_META[a];
      const mb = REASON_META[b];
      const aLead = ma?.polarity === leadPolarity ? 0 : 1;
      const bLead = mb?.polarity === leadPolarity ? 0 : 1;
      if (aLead !== bLead) return aLead - bLead;
      return (ma?.priority ?? 99) - (mb?.priority ?? 99);
    })
    .slice(0, MAX_REASONS);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @typedef {object} NegotiationContext
 * @property {'EAGER'|'NEUTRAL'|'RELUCTANT'|'UNAVAILABLE'} stance
 * @property {string}   stanceLabel    Always a non-empty human-readable string.
 * @property {string[]} reasons        Raw reason codes (0–3). For testing/logic.
 * @property {string[]} reasonLabels   Plain-language labels (0–3). For display.
 */

/**
 * Derive display-only negotiation context for a player relative to a team.
 *
 * Pure and deterministic. Mutates nothing. Never throws on partial input.
 *
 * @param {object} params
 * @param {object} [params.player]  Player at FA / re-sign render time.
 * @param {object} [params.team]    The user's team (record, frontOffice persona).
 * @param {object} [params.league]  League / season state (for current season).
 * @returns {NegotiationContext}
 */
export function deriveNegotiationContext({ player, team, league } = {}) {
  // UNAVAILABLE short-circuits everything — no reasons surfaced.
  if (isUnavailable(player, league)) {
    return {
      stance: NEGOTIATION_STANCES.UNAVAILABLE,
      stanceLabel: STANCE_LABELS.UNAVAILABLE,
      reasons: [],
      reasonLabels: [],
    };
  }

  const firedCodes = collectReasonCodes(player ?? {}, team ?? {});
  const stance = resolveStance(firedCodes);
  const orderedCodes = orderReasonCodes(firedCodes, stance);

  return {
    stance,
    stanceLabel: STANCE_LABELS[stance] ?? STANCE_LABELS.NEUTRAL,
    reasons: orderedCodes,
    reasonLabels: orderedCodes.map((code) => REASON_META[code]?.label).filter(Boolean),
  };
}

export default deriveNegotiationContext;
