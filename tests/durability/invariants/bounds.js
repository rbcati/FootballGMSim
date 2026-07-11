/**
 * Long-Save Durability Harness — safety bounds.
 *
 * These bounds are SANITY / STATE-INTEGRITY guards, NOT gameplay-balance rules.
 * Every value is sourced from production (src/core/constants.js) or derived from
 * the production league format, and each carries a documented rationale so a
 * future contributor understands why a violation means "state corruption",
 * not "the balance is off".
 *
 * If a production constant changes, update the SOURCE reference here — do not
 * silently drift.
 */

// SOURCE: constants.js ROSTER_LIMITS { OFFSEASON: 90, REGULAR_SEASON: 53 }
export const ROSTER = Object.freeze({
  REGULAR_SEASON_MAX: 53,
  OFFSEASON_MAX: 90,
  // Regular-season legal minimum is 53 in production, but retirement / early FA
  // can transiently dip a roster below it. The harness treats a stable-phase
  // roster below this floor as corruption, and uses a generous transitional
  // floor during offseason churn to avoid false positives.
  REGULAR_SEASON_MIN: 53,
  TRANSITIONAL_FLOOR: 1, // during offseason a team must still own >=1 player
  // Absolute upper safety bound (offseason max + slack for pending/rookie churn).
  ABSOLUTE_MAX: 120,
});

// SOURCE: constants.js SALARY_CAP.HARD_CAP = 301.2 (millions)
export const CAP = Object.freeze({
  HARD_CAP: 301.2,
  // Cap usage is a floating aggregate; we only assert finiteness + a generous
  // non-negative / not-absurd envelope. Production may momentarily exceed the
  // hard cap during offseason (dead money, pending restructures), so the
  // harness uses a wide ceiling and never re-derives cap legality itself.
  MAX_REASONABLE_USED: 2000,
});

// SOURCE: constants.js PLAYER_CONFIG { MIN_OVR: 40, MAX_OVR: 99 }
export const RATING = Object.freeze({
  MIN_OVR: 40,
  MAX_OVR: 99,
  // Individual rating fields (ratings/trueRatings/visibleRatings) live on 0..100.
  MIN_ATTR: 0,
  MAX_ATTR: 100,
});

// SOURCE: constants.js PLAYER_CONFIG.FORCED_RETIREMENT_AGE 38 / PLAYER_RETIREMENT_AGE_MAX 40
export const AGE = Object.freeze({
  ROOKIE_MIN: 21,
  // Harness safety ceiling for an ACTIVE player. Forced retirement is 38 and the
  // retirement max is 40; we allow generous slack (45) so a legitimately old
  // holdover never false-positives, while a 60/NaN age still trips.
  ACTIVE_MAX: 45,
  ABSOLUTE_MIN: 15,
  ABSOLUTE_MAX: 60,
});

// SOURCE: constants.js DRAFT_CONFIG { ROUNDS: 7, TEAMS: 32, TOTAL_PROSPECTS: 250 }
export const DRAFT = Object.freeze({
  ROUNDS: 7,
  TEAMS: 32,
  BASE_PICKS: 7 * 32, // 224 base selections before compensatory picks
  // Compensatory picks can pad a class; cap the safety envelope generously.
  MAX_PICKS_ENVELOPE: 7 * 32 + 64,
  TOTAL_PROSPECTS: 250,
  DRAFT_CLASS_MAX: 400, // TOTAL_PROSPECTS + slack
});

// League format: 32 teams. Derived player-pool envelope.
export const POOL = Object.freeze({
  TEAM_COUNT: 32,
  // Lower bound: every team must be able to field a legal-ish roster.
  //   32 teams * ~40 minimum durable players ~= 1280 floor.
  MIN_PLAYERS: 32 * 40,
  // Upper bound: 32 * 90 (offseason max) rosters + a large FA pool + draft class.
  //   Chosen wide so normal churn never trips; exponential growth still trips.
  MAX_PLAYERS: 32 * 90 + 4000,
});
