/**
 * tradeDeadlinePressure.js
 *
 * Trade Deadline Pressure V1 — pure, stateless, deterministic.
 *
 * Provides:
 *  1. classifyDeadlinePosture  – 5-way team classification
 *  2. getTradeDeadlinePressure – urgency/phase helper
 *  3. applyDeadlinePressureModifiers – value adjustment for buyers and sellers
 *
 * Design constraints:
 *  - No I/O, no cache access, no mutations.
 *  - All multipliers are clamped so deadline pressure biases, but never
 *    replaces, core trade logic. Fairness checks in trade-logic.js still apply.
 *  - Deterministic: same inputs → same outputs.
 */

// ── Posture constants ─────────────────────────────────────────────────────────

export const DEADLINE_POSTURE = Object.freeze({
  CONTENDER:    'contender',
  PLAYOFF_HUNT: 'playoff_hunt',
  MIDDLE:       'middle',
  REBUILD:      'rebuild',
  SELLER:       'seller',
});

// ── Phase constants ───────────────────────────────────────────────────────────

export const DEADLINE_PHASE = Object.freeze({
  NONE:          'none',
  APPROACHING:   'approaching',
  DEADLINE_WEEK: 'deadline_week',
  CLOSED:        'closed',
});

// ── Classifier defaults ───────────────────────────────────────────────────────

export const DEADLINE_PRESSURE_DEFAULTS = Object.freeze({
  minGamesForClassification: 4,
  contenderWinPctMin:  0.60,
  playoffHuntWinPctMin: 0.45,
  middleWinPctMax:     0.55,
  rebuilderWinPctMax:  0.38,
  sellerAvgAgeMin:     27.0,
  approachingWeeksOut: 3,
  maxBuyerBoost:       0.25,
  maxSellerBoost:      0.25,
  youngPlayerAgeMax:   24,
  upsideDeltaMin:      4,
  agingVeteranAgeMin:  30,
});

// ── Internal helpers ──────────────────────────────────────────────────────────

const num = (v, fb = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── 1. Team deadline posture classifier ──────────────────────────────────────

/**
 * Classify a team into one of 5 deadline postures.
 *
 * @param {object} teamState   – team data: wins, losses, ties, roster[]
 * @param {object} leagueCtx   – league context: numTeams, playoffTeams, currentSeason
 * @param {object} opts        – optional overrides for DEADLINE_PRESSURE_DEFAULTS
 * @returns {string}  One of DEADLINE_POSTURE values
 */
export function classifyDeadlinePosture(teamState = {}, leagueCtx = {}, opts = {}) {
  const cfg = { ...DEADLINE_PRESSURE_DEFAULTS, ...opts };

  const wins   = num(teamState?.wins   ?? teamState?.record?.wins,   null);
  const losses = num(teamState?.losses ?? teamState?.record?.losses, null);
  const ties   = num(teamState?.ties   ?? teamState?.record?.ties,   0) ?? 0;
  const gamesPlayedRaw = num(teamState?.gamesPlayed ?? teamState?.record?.gamesPlayed, null);
  const gamesPlayed    = gamesPlayedRaw ?? ((wins != null && losses != null) ? wins + losses + ties : null);

  if (gamesPlayed == null || gamesPlayed < cfg.minGamesForClassification || wins == null) {
    return DEADLINE_POSTURE.MIDDLE;
  }

  const winPct = (wins + ties * 0.5) / gamesPlayed;

  // Compute roster average age (optional — falls back gracefully).
  const roster = Array.isArray(teamState?.roster) ? teamState.roster : [];
  const ages   = roster.map((p) => num(p?.age, null)).filter((a) => a != null);
  const avgAge = ages.length ? ages.reduce((s, a) => s + a, 0) / ages.length : null;

  // ── Classification ────────────────────────────────────────────────────────

  // Contender: strong record, not rebuilding.
  if (winPct >= cfg.contenderWinPctMin) {
    return DEADLINE_POSTURE.CONTENDER;
  }

  // Rebuilder/seller: poor record.
  if (winPct <= cfg.rebuilderWinPctMax) {
    // Seller: old or expensive roster — they'll trade veterans for picks.
    if (avgAge != null && avgAge >= cfg.sellerAvgAgeMin) {
      return DEADLINE_POSTURE.SELLER;
    }
    return DEADLINE_POSTURE.REBUILD;
  }

  // Playoff hunt: above 45%, below contender threshold.
  if (winPct >= cfg.playoffHuntWinPctMin) {
    return DEADLINE_POSTURE.PLAYOFF_HUNT;
  }

  // Everyone else stays cautious.
  return DEADLINE_POSTURE.MIDDLE;
}

// ── 2. Deadline urgency/phase calculator ─────────────────────────────────────

/**
 * Compute the current trade deadline pressure state.
 *
 * @param {object} params
 * @param {number}  params.currentWeek        – current league week
 * @param {number}  params.deadlineWeek        – configured trade deadline week (default 9)
 * @param {number}  [params.seasonLength]      – total regular season weeks (default 17)
 * @param {string}  [params.teamPosture]       – one of DEADLINE_POSTURE values
 * @param {object}  [params.opts]              – optional override defaults
 *
 * @returns {{
 *   active:           boolean,
 *   phase:            string,
 *   urgency:          number,
 *   buyerAggression:  number,
 *   sellerAggression: number,
 *   weeksToDeadline:  number,
 *   explanation:      string,
 * }}
 */
export function getTradeDeadlinePressure({
  currentWeek   = 1,
  deadlineWeek  = 9,
  seasonLength  = 17,
  teamPosture   = DEADLINE_POSTURE.MIDDLE,
  opts          = {},
} = {}) {
  const cfg = { ...DEADLINE_PRESSURE_DEFAULTS, ...opts };

  const week     = num(currentWeek,  1);
  const deadline = num(deadlineWeek, 9);
  const weeksToDeadline = deadline - week;

  const isBuyer  = teamPosture === DEADLINE_POSTURE.CONTENDER
                || teamPosture === DEADLINE_POSTURE.PLAYOFF_HUNT;
  const isSeller = teamPosture === DEADLINE_POSTURE.SELLER
                || teamPosture === DEADLINE_POSTURE.REBUILD;

  // ── Phase determination ───────────────────────────────────────────────────

  let phase;
  if (weeksToDeadline < 0) {
    phase = DEADLINE_PHASE.CLOSED;
  } else if (weeksToDeadline === 0) {
    phase = DEADLINE_PHASE.DEADLINE_WEEK;
  } else if (weeksToDeadline <= cfg.approachingWeeksOut) {
    phase = DEADLINE_PHASE.APPROACHING;
  } else {
    phase = DEADLINE_PHASE.NONE;
  }

  const active = phase === DEADLINE_PHASE.APPROACHING || phase === DEADLINE_PHASE.DEADLINE_WEEK;

  if (!active) {
    return {
      active:           false,
      phase,
      urgency:          0,
      buyerAggression:  0,
      sellerAggression: 0,
      weeksToDeadline,
      explanation:      phase === DEADLINE_PHASE.CLOSED
        ? 'Trade window is closed.'
        : 'Trade deadline is not yet in range.',
    };
  }

  // ── Urgency (0 → 1) ──────────────────────────────────────────────────────
  //   approaching:   scales linearly from 0.30 at 3 weeks out → 0.70 at 1 week out
  //   deadline_week: 1.0

  let urgency;
  if (phase === DEADLINE_PHASE.DEADLINE_WEEK) {
    urgency = 1.0;
  } else {
    urgency = clamp(1 - (weeksToDeadline / (cfg.approachingWeeksOut + 1)), 0.30, 0.70);
  }

  // ── Aggression multipliers ────────────────────────────────────────────────
  //   Range: 0..maxBuyerBoost / 0..maxSellerBoost
  //   Multiplied by urgency so peak is at deadline week.

  const buyerAggression  = isBuyer  ? clamp(urgency * cfg.maxBuyerBoost,  0, cfg.maxBuyerBoost)  : 0;
  const sellerAggression = isSeller ? clamp(urgency * cfg.maxSellerBoost, 0, cfg.maxSellerBoost) : 0;

  // ── Human-readable explanation ────────────────────────────────────────────

  const postureLabel = {
    [DEADLINE_POSTURE.CONTENDER]:    'contender',
    [DEADLINE_POSTURE.PLAYOFF_HUNT]: 'playoff-hunt team',
    [DEADLINE_POSTURE.MIDDLE]:       'middle-of-pack team',
    [DEADLINE_POSTURE.REBUILD]:      'rebuilding team',
    [DEADLINE_POSTURE.SELLER]:       'seller',
  }[teamPosture] ?? 'team';

  let explanation;
  if (phase === DEADLINE_PHASE.DEADLINE_WEEK) {
    if (isBuyer)  explanation = `Deadline week: ${postureLabel} urgently seeking upgrades.`;
    else if (isSeller) explanation = `Deadline week: ${postureLabel} looking to move veterans for picks.`;
    else          explanation = 'Deadline week: middle-of-pack teams remain cautious.';
  } else {
    if (isBuyer)  explanation = `${weeksToDeadline} week(s) to deadline: ${postureLabel} beginning to shop.`;
    else if (isSeller) explanation = `${weeksToDeadline} week(s) to deadline: ${postureLabel} may become more willing to trade veterans.`;
    else          explanation = `${weeksToDeadline} week(s) to deadline: no significant pressure change for this team.`;
  }

  return {
    active,
    phase,
    urgency,
    buyerAggression,
    sellerAggression,
    weeksToDeadline,
    explanation,
  };
}

// ── 3. Value modifier (apply deadline pressure to an asset value) ─────────────

/**
 * Adjust an asset's value based on team posture and current deadline pressure.
 *
 * Called from the perspective of the RECEIVING team: how much do they want this?
 *
 * Bounds:
 *  - When pressure is inactive, returns baseValue unchanged.
 *  - Middle-of-pack teams receive no adjustment.
 *  - Value may be BOOSTED (buyers on quality players, sellers on picks/young players)
 *    or DISCOUNTED (buyers on picks, sellers on aging veterans).
 *  - The multiplier is hard-clamped to [0.85, 1 + maxBoost] so pressure can never
 *    drop value below 0.85× base or boost it above 1.25× base (default).
 *  - Existing fairness/cap checks in trade-logic.js still run after this modifier.
 *
 * @param {object} asset       – player or pick asset { assetType, age, ovr, potential, season, year }
 * @param {number} baseValue   – value before deadline adjustment
 * @param {string} teamPosture – DEADLINE_POSTURE value
 * @param {object} pressure    – result of getTradeDeadlinePressure()
 * @param {object} opts        – optional override defaults
 * @returns {number}
 */
export function applyDeadlinePressureModifiers(asset = {}, baseValue = 0, teamPosture, pressure = {}, opts = {}) {
  const cfg     = { ...DEADLINE_PRESSURE_DEFAULTS, ...opts };
  const base    = num(baseValue, 0);
  if (!Number.isFinite(base) || base <= 0) return Math.max(0, base);
  if (!pressure?.active) return base;

  const isBuyer  = teamPosture === DEADLINE_POSTURE.CONTENDER
                || teamPosture === DEADLINE_POSTURE.PLAYOFF_HUNT;
  const isSeller = teamPosture === DEADLINE_POSTURE.SELLER
                || teamPosture === DEADLINE_POSTURE.REBUILD;

  let multiplier = 1.0;

  if (isBuyer && pressure.buyerAggression > 0) {
    if (asset?.assetType === 'player') {
      const age = num(asset?.age, 27);
      const ovr = num(asset?.ovr, 70);
      // Buyers value proven, immediately-useful veterans.
      // Only boost players who can actually help now (OVR ≥ 75, not ancient).
      if (ovr >= 75 && age <= 32) {
        multiplier += clamp(pressure.buyerAggression, 0, cfg.maxBuyerBoost);
      }
    }
    // Buyers mildly discount picks (opportunity cost of waiting).
    if (asset?.assetType === 'pick') {
      multiplier -= clamp(pressure.buyerAggression * 0.5, 0, 0.10);
    }
  }

  if (isSeller && pressure.sellerAggression > 0) {
    if (asset?.assetType === 'pick') {
      // Sellers value picks more — future resources for the rebuild.
      multiplier += clamp(pressure.sellerAggression, 0, cfg.maxSellerBoost);
    }
    if (asset?.assetType === 'player') {
      const age = num(asset?.age, 27);
      const ovr = num(asset?.ovr, 70);
      const pot = num(asset?.potential ?? asset?.pot, ovr);
      // Sellers value young high-upside players similarly to picks.
      if (age <= cfg.youngPlayerAgeMax && (pot - ovr) >= cfg.upsideDeltaMin) {
        multiplier += clamp(pressure.sellerAggression * 0.8, 0, cfg.maxSellerBoost * 0.8);
      }
      // Sellers discount aging veterans — they want to move these.
      if (age >= cfg.agingVeteranAgeMin) {
        multiplier -= clamp(pressure.sellerAggression * 0.6, 0, 0.15);
      }
    }
  }

  // Hard clamp: [0.85, 1 + maxBoost]. Pressure can reduce below base (discounts) but never below 0.85×.
  const maxBoost = Math.max(cfg.maxBuyerBoost, cfg.maxSellerBoost);
  multiplier = clamp(multiplier, 0.85, 1 + maxBoost);

  return Math.round(base * multiplier);
}

// ── 4. League Pulse item generator ───────────────────────────────────────────

/**
 * Build a League Pulse item for the trade deadline window opening.
 * Returns null if the deadline is not in the approaching/deadline_week phase.
 *
 * The item is deterministic: same season/week → same dedupeKey.
 *
 * @param {object} params
 * @param {number} params.season
 * @param {number} params.week
 * @param {string} params.phase          – DEADLINE_PHASE value
 * @param {number} params.weeksToDeadline
 * @param {number} params.deadlineWeek
 * @param {string} params.userTeamId
 * @param {string} [params.userPosture]  – user team's DEADLINE_POSTURE
 * @returns {object|null}
 */
export function buildDeadlinePulseItem({
  season,
  week,
  phase,
  weeksToDeadline,
  deadlineWeek,
  userTeamId,
  userPosture = DEADLINE_POSTURE.MIDDLE,
} = {}) {
  if (phase !== DEADLINE_PHASE.APPROACHING && phase !== DEADLINE_PHASE.DEADLINE_WEEK) {
    return null;
  }

  const isBuyer = userPosture === DEADLINE_POSTURE.CONTENDER
               || userPosture === DEADLINE_POSTURE.PLAYOFF_HUNT;
  const isSeller = userPosture === DEADLINE_POSTURE.SELLER
                || userPosture === DEADLINE_POSTURE.REBUILD;

  let headline;
  let body;
  const importance = phase === DEADLINE_PHASE.DEADLINE_WEEK ? 100 : 75;

  if (phase === DEADLINE_PHASE.DEADLINE_WEEK) {
    headline = 'Trade Deadline Day';
    body = isBuyer
      ? 'This is your last chance to make a move. Contenders are paying a premium for proven talent.'
      : isSeller
        ? 'Deadline day: other GMs are calling. Consider moving veterans for future picks before the window closes.'
        : 'The trade window closes after this week. Review your roster before the deadline passes.';
  } else {
    headline = `Trade Deadline in ${weeksToDeadline} Week${weeksToDeadline !== 1 ? 's' : ''}`;
    body = isBuyer
      ? `Week ${deadlineWeek} deadline approaching. Buyers are active — now is the time to close a deal.`
      : isSeller
        ? `Week ${deadlineWeek} deadline approaching. Teams are looking to sell veterans for picks.`
        : `Week ${deadlineWeek} deadline coming up. Evaluate your roster before the window closes.`;
  }

  return {
    id:            `deadline-${season}-${week}-${String(userTeamId)}`,
    season:        Number(season),
    week:          Number(week),
    type:          'transaction',
    headline,
    body,
    importance,
    relatedTeamId: String(userTeamId),
    source:        'tradeDeadline',
    dedupeKey:     `${season}-${week}-tradeDeadline-${String(userTeamId)}-X-${headline}`,
  };
}

// ── 5. League Memory event builder ────────────────────────────────────────────

/**
 * Build a small league-memory event for deadline pressure activation.
 * Only call this if the posture changed or the deadline window just opened.
 *
 * @param {object} params
 * @param {string|number} params.teamId
 * @param {string} params.posture       – DEADLINE_POSTURE value
 * @param {number} params.week
 * @param {object} params.pressure      – result of getTradeDeadlinePressure()
 * @returns {object}
 */
export function buildDeadlineMemoryEvent({ teamId, posture, week, pressure = {} }) {
  return {
    type:     'TRADE_DEADLINE_PRESSURE',
    teamId:   String(teamId),
    posture,
    week:     Number(week),
    urgency:  pressure.urgency ?? 0,
    phase:    pressure.phase ?? DEADLINE_PHASE.NONE,
  };
}
