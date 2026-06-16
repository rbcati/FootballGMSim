/**
 * aiFaEngine.js — Free Agent Bidding Wars V1
 *
 * AI teams compete for the same free agents using the same leverage,
 * morale, holdout, HOF, coaching, and negotiation modifier systems.
 *
 * Design constraints:
 *  - Pure functions only. No side effects.
 *  - No imports from worker, UI, news, morale, holdout, HOF, coaching, or sim engine.
 *  - Receives computed context (adjustedDemand, posture, etc.) as arguments.
 *  - No Math.random — seeded LCG only (same pattern as coachingEngine).
 *  - Fully deterministic: same inputs → same outputs.
 */

import { classifyDeadlinePosture, DEADLINE_POSTURE } from '../trades/tradeDeadlinePressure.js';

// ── Bid factor constants per posture ──────────────────────────────────────────

/**
 * Per-posture thresholds and bid multipliers.
 *   impactThreshold – minimum player.ovr for AI to consider pursuing
 *   bidMultiplier   – amount = adjustedDemand × bidMultiplier
 */
export const AI_POSTURE_BID_FACTORS = Object.freeze({
  contender:    { impactThreshold: 75, bidMultiplier: 1.05 },
  playoff_hunt: { impactThreshold: 70, bidMultiplier: 1.00 },
  middle:       { impactThreshold: 68, bidMultiplier: 0.96 },
  rebuild:      { impactThreshold: 60, bidMultiplier: 0.90 },
  seller:       { impactThreshold: 999, bidMultiplier: 0.85 },
});

// ── Internal helpers ──────────────────────────────────────────────────────────

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Seeded LCG — no Math.random, matches coachingEngine.js pattern */
function makeLCG(seed) {
  let s = ((seed | 0) >>> 0) || 1;
  return {
    next() {
      s = ((1664525 * s + 1013904223) | 0) >>> 0;
      return s / 0x100000000;
    },
  };
}

/** Deterministic unsigned integer hash of multiple values */
function seedHash(...values) {
  let h = 2166136261 >>> 0;
  for (const v of values) {
    const n = Math.abs(Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) : 0);
    h = (((h ^ n) >>> 0) * 16777619) >>> 0;
  }
  return h;
}

// ── Inline scheme-misfit logic (no coaching engine import) ───────────────────
// Mirrors isPositionMisfitForScheme from coachingEngine.js without the import.

const OFFENSIVE_FA_POSITIONS = new Set([
  'QB', 'RB', 'FB', 'HB', 'WR', 'TE',
  'OL', 'OT', 'OG', 'C', 'G', 'T', 'LT', 'RT', 'LG', 'RG',
]);

const DEFENSIVE_FA_POSITIONS = new Set([
  'DL', 'DE', 'DT', 'NT', 'EDGE',
  'LB', 'ILB', 'OLB', 'MLB',
  'CB', 'DB', 'S', 'FS', 'SS',
]);

const FA_SCHEME_FIT_MAP = {
  SPREAD:       new Set(['QB', 'WR', 'TE']),
  WEST_COAST:   new Set(['QB', 'WR', 'TE']),
  VERTICAL:     new Set(['QB', 'WR', 'TE']),
  POWER_RUN:    new Set(['RB', 'FB', 'HB', 'OL', 'OT', 'OG', 'C', 'G', 'T', 'LT', 'RT', 'LG', 'RG']),
  BALANCED:     null,
  BLITZ_HEAVY:  new Set(['DL', 'DE', 'DT', 'NT', 'EDGE', 'LB', 'ILB', 'OLB', 'MLB']),
  COVER_2:      new Set(['CB', 'DB', 'S', 'FS', 'SS']),
  MAN_COVERAGE: new Set(['CB', 'DB', 'S', 'FS', 'SS']),
  HYBRID:       null,
};

const OFFENSIVE_SCHEMES = new Set(['SPREAD', 'WEST_COAST', 'VERTICAL', 'POWER_RUN']);
const DEFENSIVE_SCHEMES = new Set(['BLITZ_HEAVY', 'COVER_2', 'MAN_COVERAGE']);

function isFaSchemeMisfit(position, scheme) {
  if (!position || !scheme) return false;
  const pos = String(position).toUpperCase();
  if (!OFFENSIVE_FA_POSITIONS.has(pos) && !DEFENSIVE_FA_POSITIONS.has(pos)) return false;
  const fitSet = FA_SCHEME_FIT_MAP[scheme];
  if (!fitSet) return false;  // BALANCED / HYBRID — no misfits
  const isOff = OFFENSIVE_FA_POSITIONS.has(pos) && !DEFENSIVE_FA_POSITIONS.has(pos);
  const isDef = DEFENSIVE_FA_POSITIONS.has(pos) && !OFFENSIVE_FA_POSITIONS.has(pos);
  if (OFFENSIVE_SCHEMES.has(scheme) && !isOff) return false;
  if (DEFENSIVE_SCHEMES.has(scheme) && !isDef) return false;
  return !fitSet.has(pos);
}

// ── shouldAITeamPursuePlayer ──────────────────────────────────────────────────

/**
 * Determine whether an AI team should pursue a free agent.
 *
 * @param {object} team           – team data (reads team.id, team.wins, team.losses)
 * @param {object} player         – player data (reads player.ovr, player.age, player.pos)
 * @param {number} adjustedDemand – baseAnnual of the adjusted demand (market price)
 * @param {number} capSpace       – team's effective cap space (after pending reservations)
 * @param {object} context        – { posture, season, week, scheme }
 * @returns {boolean}
 */
export function shouldAITeamPursuePlayer(team, player, adjustedDemand, capSpace, context = {}) {
  const { posture = 'middle', season = 0, week = 0, scheme = 'BALANCED' } = context;

  // Sellers never pursue
  if (posture === 'seller') return false;

  // Cap guard: must have 5% buffer over demand
  const demand = safeNum(adjustedDemand);
  const capRequired = demand * 1.05;
  if (safeNum(capSpace) < capRequired) return false;

  // OVR threshold by posture
  const factors = AI_POSTURE_BID_FACTORS[posture] ?? AI_POSTURE_BID_FACTORS.middle;
  const ovr = safeNum(player?.ovr, 0);
  if (ovr < factors.impactThreshold) return false;

  // Rebuilder: only pursues younger players (age <= 27)
  if (posture === 'rebuild') {
    const age = safeNum(player?.age, 30);
    if (age > 27) return false;
  }

  // Scheme misfit: seeded RNG — 30% of the time a misfit blocks pursuit
  if (isFaSchemeMisfit(player?.pos, scheme)) {
    const rng = makeLCG(seedHash(safeNum(player?.id), safeNum(season), safeNum(week), safeNum(team?.id)));
    if (rng.next() >= 0.7) return false;
  }

  return true;
}

// ── computeAIOffer ────────────────────────────────────────────────────────────

/**
 * Compute the AI team's offer amount and years for a free agent.
 *
 * @param {object} team           – team data (reads team.id)
 * @param {object} player         – player data (reads player.age)
 * @param {number} adjustedDemand – baseAnnual of the adjusted demand
 * @param {object} context        – { posture, capSpace }
 * @returns {{ amount: number, years: number, teamId: number }}
 */
export function computeAIOffer(team, player, adjustedDemand, context = {}) {
  const { posture = 'middle', capSpace = 0 } = context;
  const factors = AI_POSTURE_BID_FACTORS[posture] ?? AI_POSTURE_BID_FACTORS.middle;
  const demand = safeNum(adjustedDemand);

  // Base: demand × posture multiplier
  let amount = Math.round(demand * factors.bidMultiplier * 10) / 10;

  // Cap at 35% of capSpace (no team spends > 35% cap on one player)
  const capCeil = Math.round(safeNum(capSpace) * 0.35 * 10) / 10;
  if (capCeil > 0) amount = Math.min(amount, capCeil);

  // Floor: AI never low-balls by more than 15%
  const floor = Math.round(demand * 0.85 * 10) / 10;
  amount = Math.max(amount, floor);

  // Minimum veteran floor
  amount = Math.max(0.75, amount);

  // Years: deterministic from player age
  const age = safeNum(player?.age, 28);
  let years;
  if (age <= 25)       years = 4;
  else if (age <= 29)  years = 3;
  else if (age <= 32)  years = 2;
  else                 years = 1;

  return {
    amount: Math.round(amount * 10) / 10,
    years,
    teamId: Number(team?.id),
  };
}

// ── resolvePlayerChoice ───────────────────────────────────────────────────────

/** Bonus for contender preference (in $M) */
const CONTENDER_BONUS_M = 0.5;
/** Bonus for scheme fit (in $M) */
const SCHEME_FIT_BONUS_M = 0.2;

/**
 * Determine the winning offer in a competitive bidding situation.
 *
 * @param {object} player  – player data (reads player.id, player.age)
 * @param {Array}  offers  – [{ amount, years, teamId, isUserTeam, isContender, isSchemeFit }]
 * @param {object} context – { adjustedDemand, season, week }
 * @returns {{ winningOffer: object|null, reason: string }}
 */
export function resolvePlayerChoice(player, offers, context = {}) {
  const { adjustedDemand = 0, season = 0, week = 0 } = context;
  const demand = safeNum(adjustedDemand);

  if (!Array.isArray(offers) || offers.length === 0) {
    return { winningOffer: null, reason: 'No offers submitted' };
  }

  // Score every offer
  const evaluated = offers.map((offer) => {
    const amount = safeNum(offer?.amount);
    const ratio = demand > 0 ? amount / demand : 1;

    let tier;
    if (ratio >= 1.0)         tier = 'acceptable';
    else if (ratio >= 0.9)    tier = 'borderline';
    else                       tier = 'rejected';

    const contenderBonus = offer?.isContender  ? CONTENDER_BONUS_M  : 0;
    const schemeFitBonus = offer?.isSchemeFit  ? SCHEME_FIT_BONUS_M : 0;
    const score          = amount + contenderBonus + schemeFitBonus;

    return { ...offer, tier, score };
  });

  // Only acceptable offers (at or above demand) can win
  const acceptable = evaluated.filter((o) => o.tier === 'acceptable');

  if (acceptable.length === 0) {
    return { winningOffer: null, reason: 'All offers below market — player re-enters market' };
  }

  // Sort by score descending
  acceptable.sort((a, b) => b.score - a.score);

  // Tiebreaker: seeded hash of playerId + season + week (fully deterministic)
  const topScore = acceptable[0].score;
  const tied = acceptable.filter((o) => Math.abs(o.score - topScore) < 0.001);

  let winner;
  if (tied.length === 1) {
    winner = tied[0];
  } else {
    const tieSeed = seedHash(safeNum(player?.id), safeNum(season), safeNum(week));
    const rng = makeLCG(tieSeed);
    winner = tied[Math.floor(rng.next() * tied.length)];
  }

  const reason = winner.isUserTeam
    ? 'Accepted your offer — best value overall'
    : `Signed with team ${winner.teamId} — highest competitive offer`;

  return { winningOffer: winner, reason };
}

// ── getAIFaTargets ────────────────────────────────────────────────────────────

/**
 * For each non-user AI team, identify which free agents to target this day.
 * Performs a coarse pre-filter; fine-grained decisions happen in shouldAITeamPursuePlayer.
 *
 * @param {Array}  allTeams         – all league teams
 * @param {Array}  availablePlayers – current free agent pool
 * @param {object} meta             – league meta: { userTeamId }
 * @param {number} season
 * @param {number} week
 * @returns {Map<number, object[]>} teamId → player[] candidates
 */
export function getAIFaTargets(allTeams, availablePlayers, meta, season = 1, week = 0) {
  const userTeamId = Number(meta?.userTeamId ?? -1);
  const result = new Map();

  const safeTeams = Array.isArray(allTeams) ? allTeams : [];
  const safeFA    = Array.isArray(availablePlayers) ? availablePlayers : [];

  for (const team of safeTeams) {
    if (!team?.id || Number(team.id) === userTeamId) continue;

    const posture = classifyDeadlinePosture(
      { wins: safeNum(team.wins), losses: safeNum(team.losses), ties: safeNum(team.ties) },
      { numTeams: safeTeams.length },
    );

    // Sellers never pursue free agents
    if (posture === DEADLINE_POSTURE.SELLER) continue;

    const capRoom = safeNum(team.capRoom, 0);
    if (capRoom <= 0) continue;

    const factors = AI_POSTURE_BID_FACTORS[posture] ?? AI_POSTURE_BID_FACTORS.middle;

    const targets = safeFA.filter((player) => {
      if (!player?.id) return false;
      // Coarse OVR gate by posture
      if (safeNum(player.ovr, 0) < factors.impactThreshold) return false;
      // Rebuilder: skip veterans
      if (posture === DEADLINE_POSTURE.REBUILD && safeNum(player.age, 30) > 27) return false;
      return true;
    });

    if (targets.length > 0) {
      result.set(Number(team.id), targets);
    }
  }

  return result;
}
