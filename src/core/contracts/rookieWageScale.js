/**
 * rookieWageScale.js
 *
 * Deterministic rookie contract generator. Produces a fully-slotted,
 * fixed contract the moment a player is drafted — bypassing any
 * negotiation or free-agency phase.
 *
 * The decay curve is continuous at round boundaries: the last pick of
 * round N receives exactly the same base salary as the first pick of
 * round N+1, guaranteeing a smooth, monotonic scale from #1 to #224.
 *
 * Compensatory picks beyond #224 receive the round-7 minimum slot value.
 * Global cap constants are never mutated.
 */

import { ROOKIE_SCALE } from '../constants.js';

const YEARS = 4;
const BASE_YEAR = 2025;
const CAP_GROWTH_RATE = 0.04;
const LEAGUE_MIN = 0.75;
const PICKS_PER_ROUND = 32;
const MAX_ROUNDS = 7;
const MAX_STANDARD_PICK = MAX_ROUNDS * PICKS_PER_ROUND; // 224

// Segment anchors: each round's slot begins at ROOKIE_SCALE[round].max.
// Interpolation inside a round decays toward the NEXT round's anchor,
// which equals ROOKIE_SCALE[round+1].max. For round 7, the endpoint is
// ROOKIE_SCALE[7].min (the absolute floor of the standard draft).
//
// Because ROOKIE_SCALE[R+1].max < ROOKIE_SCALE[R].max for every R,
// the curve is globally monotonically non-increasing — including across
// all round boundaries — regardless of the mid-round min/max ranges.
const SEGMENT_END = (() => {
  const ends = {};
  for (let r = 1; r < MAX_ROUNDS; r++) {
    ends[r] = ROOKIE_SCALE[r + 1].max;
  }
  ends[MAX_ROUNDS] = ROOKIE_SCALE[MAX_ROUNDS].min;
  return ends;
})();

function getRoundFromOverall(overall) {
  return Math.min(MAX_ROUNDS, Math.max(1, Math.ceil(overall / PICKS_PER_ROUND)));
}

/**
 * Returns baseAnnual ($M) for the given overall pick using a piecewise-linear
 * decay anchored at ROOKIE_SCALE[round].max for the first pick of each round.
 *
 * The segment for round R spans picks [(R-1)*32+1 … R*32] and decays from
 * ROOKIE_SCALE[R].max toward ROOKIE_SCALE[R+1].max, ensuring:
 *   - Last pick of round R  > first pick of round R+1 (strict within rounds)
 *   - First pick of round R+1 < last pick of round R  (decreasing at boundaries)
 * → The full curve from pick 1 to pick 224 is monotonically non-increasing.
 */
function getInterpolatedAnnual(overall) {
  const clamped = Math.min(overall, MAX_STANDARD_PICK);
  const round = getRoundFromOverall(clamped);
  const roundStart = (round - 1) * PICKS_PER_ROUND + 1;
  const pickInRound = clamped - roundStart + 1; // 1-indexed, 1..32
  const segmentFraction = (pickInRound - 1) / PICKS_PER_ROUND; // 0 at first pick, 31/32 at last
  const startValue = ROOKIE_SCALE[round].max;
  const endValue = SEGMENT_END[round];
  return Math.max(LEAGUE_MIN, startValue - segmentFraction * (startValue - endValue));
}

/**
 * Generate the fully-slotted rookie contract for a given draft pick.
 *
 * @param {number} overallPickNumber - 1-based overall pick number (1 = #1 pick).
 *   Values beyond 224 are treated as round-7 compensatory picks.
 * @param {number} [draftYear=2025] - Calendar year of the draft. Applies a
 *   4% annual compound growth factor relative to the 2025 baseline.
 *
 * @returns {Object} A ContractDetails-shaped object that is already
 *   canonical (no further normalization required, but safe to pass through
 *   normalizeContractDetails without change).
 */
export function generateSlottedRookieContract(overallPickNumber, draftYear = BASE_YEAR) {
  const pick = Math.max(1, Math.round(Number(overallPickNumber) || 1));
  const effectivePick = Math.min(pick, MAX_STANDARD_PICK);
  const round = getRoundFromOverall(effectivePick);

  const rawAnnual = getInterpolatedAnnual(effectivePick);

  const year = Number(draftYear) || BASE_YEAR;
  const yearFactor = Math.max(1, Math.pow(1 + CAP_GROWTH_RATE, year - BASE_YEAR));
  const baseAnnual = Math.round(rawAnnual * yearFactor * 100) / 100;

  // Signing bonus and guarantee tiers by round group
  let bonusFraction;
  let guaranteedPct;

  if (round === 1) {
    bonusFraction = 0.20;
    // Picks 1-10: fully guaranteed. Picks 11-32: taper from ~0.99 to 0.70.
    guaranteedPct = pick <= 10
      ? 1.0
      : Math.round(Math.max(0.70, 1.0 - ((pick - 10) / 22) * 0.30) * 100) / 100;
  } else if (round <= 3) {
    bonusFraction = 0.10;
    guaranteedPct = 0.50;
  } else {
    bonusFraction = 0.03;
    guaranteedPct = 0.10;
  }

  const signingBonus = Math.round(baseAnnual * bonusFraction * YEARS * 100) / 100;
  const guaranteedMoney = Math.round(
    (baseAnnual * YEARS + signingBonus) * guaranteedPct * 100,
  ) / 100;

  return {
    years: YEARS,
    yearsTotal: YEARS,
    yearsRemaining: YEARS,
    baseAnnual,
    signingBonus,
    guaranteedPct,
    guaranteedMoney,
    optionBonus: 0,
    optionYear: 0,
    hasNoTradeClause: false,
    tagType: 'none',
    rookieScale: true,
    fifthYearOptionEligible: round === 1,
    fifthYearOptionExercised: false,
    restrictedFreeAgent: false,
    incentives: [],
  };
}
