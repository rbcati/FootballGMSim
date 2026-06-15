/**
 * coachingEngine.js — Coaching Carousel V1
 *
 * Pure, deterministic coaching module. GM decision layer for hiring, firing,
 * and coordinator management. Produces visible, persistent footprints on
 * player morale, team culture, and negotiation leverage.
 *
 * Design constraints:
 *  - Pure functions only. No side effects.
 *  - No imports from worker, UI, news, morale, holdout, HOF, or sim engine.
 *  - No Math.random — seeded determinism only.
 *  - Fully deterministic given same inputs.
 */

// ── Role constants ─────────────────────────────────────────────────────────────

export const COACH_ROLES = Object.freeze({
  HEAD_COACH: 'headCoach',
  OC: 'offensiveCoordinator',
  DC: 'defensiveCoordinator',
});

// ── Scheme types (mirrors coaching-philosophy-effects.js enums) ───────────────

export const SCHEME_TYPES = Object.freeze({
  // Offensive
  SPREAD:       'SPREAD',
  WEST_COAST:   'WEST_COAST',
  VERTICAL:     'VERTICAL',
  POWER_RUN:    'POWER_RUN',
  BALANCED:     'BALANCED',
  // Defensive
  BLITZ_HEAVY:  'BLITZ_HEAVY',
  COVER_2:      'COVER_2',
  MAN_COVERAGE: 'MAN_COVERAGE',
  HYBRID:       'HYBRID',
});

const ALL_SCHEMES = [
  'SPREAD', 'WEST_COAST', 'VERTICAL', 'POWER_RUN', 'BALANCED',
  'BLITZ_HEAVY', 'COVER_2', 'MAN_COVERAGE', 'HYBRID',
];

const ELITE_SCHEMES = ['SPREAD', 'WEST_COAST', 'BLITZ_HEAVY', 'MAN_COVERAGE'];

// ── Seeded LCG — no Math.random ───────────────────────────────────────────────

function makeLCG(seed) {
  let s = ((seed | 0) >>> 0) || 1;
  return {
    next() {
      s = ((1664525 * s + 1013904223) | 0) >>> 0;
      return s / 0x100000000;
    },
    nextInt(min, max) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },
    choice(arr) {
      return arr[Math.floor(this.next() * arr.length)];
    },
  };
}

// ── Name pools ────────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'Mike', 'John', 'Bill', 'Tom', 'Jim', 'Dave', 'Steve', 'Dan', 'Ron', 'Joe',
  'Matt', 'Kyle', 'Sean', 'Andy', 'Rex', 'Gary', 'Bob', 'Ray', 'Ken', 'Hal',
  'Art', 'Don', 'Ted', 'Vic', 'Al', 'Sam', 'Pat', 'Chip', 'Wade', 'Doug',
  'Frank', 'Hank', 'Clint', 'Bud', 'Earl', 'Norm', 'Russ', 'Gus', 'Fritz', 'Wes',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller', 'Wilson',
  'Moore', 'Taylor', 'Anderson', 'Jackson', 'White', 'Harris', 'Martin', 'Garcia',
  'Martinez', 'Clark', 'Lewis', 'Lee', 'Walker', 'Hall', 'Allen', 'Young', 'King',
  'Wright', 'Scott', 'Hill', 'Green', 'Adams', 'Baker', 'Rivera', 'Campbell',
  'Roberts', 'Carter', 'Phillips', 'Evans', 'Turner', 'Torres', 'Parker',
];

// ── generateCoachingMarket ────────────────────────────────────────────────────

/**
 * Generate the coaching market for a new season.
 * Deterministic: same season + firedCoaches inputs always produce the same market.
 *
 * Rating distribution: 2 elite (75–90), 4 solid (55–74), remainder average (35–54).
 * Total coaches: 8–12.
 * Fired coaches from previous season re-enter with overallRating − 5 (min 30).
 *
 * @param {number} season        - Current season number (used as seed base)
 * @param {Array}  firedCoaches  - Fired coaches: [{ id, name, scheme, overallRating, yearsExperience, formerTeamId }]
 * @returns {Array<CoachProfile>}
 */
export function generateCoachingMarket(season, firedCoaches = []) {
  const rng = makeLCG(Number(season) * 7919 + 31337);

  // Pick a count of 8–12 fresh coaches
  const freshCount = rng.nextInt(8, 12);
  const market = [];

  // 1. Two elite coaches
  for (let i = 0; i < 2; i++) {
    market.push({
      id:               `cch_${season}_${i}`,
      name:             `${rng.choice(FIRST_NAMES)} ${rng.choice(LAST_NAMES)}`,
      scheme:           rng.choice(ELITE_SCHEMES),
      overallRating:    rng.nextInt(75, 90),
      yearsExperience:  rng.nextInt(10, 25),
      formerTeamId:     null,
    });
  }

  // 2. Four solid coaches
  for (let i = 2; i < 6; i++) {
    market.push({
      id:               `cch_${season}_${i}`,
      name:             `${rng.choice(FIRST_NAMES)} ${rng.choice(LAST_NAMES)}`,
      scheme:           rng.choice(ALL_SCHEMES),
      overallRating:    rng.nextInt(55, 74),
      yearsExperience:  rng.nextInt(5, 15),
      formerTeamId:     null,
    });
  }

  // 3. Fill remainder with average coaches (up to freshCount)
  for (let i = 6; i < freshCount; i++) {
    market.push({
      id:               `cch_${season}_${i}`,
      name:             `${rng.choice(FIRST_NAMES)} ${rng.choice(LAST_NAMES)}`,
      scheme:           rng.choice(ALL_SCHEMES),
      overallRating:    rng.nextInt(35, 54),
      yearsExperience:  rng.nextInt(1, 10),
      formerTeamId:     null,
    });
  }

  // 4. Re-enter fired coaches from previous season
  const safeFired = Array.isArray(firedCoaches) ? firedCoaches : [];
  for (const fired of safeFired) {
    if (!fired?.name) continue;
    market.push({
      id:               fired.id ?? `cch_fired_${season}_${String(fired.name).replace(/\s/g, '_')}`,
      name:             fired.name,
      scheme:           fired.scheme ?? 'BALANCED',
      overallRating:    Math.max(30, (Number(fired.overallRating) || 50) - 5),
      yearsExperience:  Number(fired.yearsExperience) || 5,
      formerTeamId:     fired.formerTeamId ?? null,
      firedPrevSeason:  true,
    });
  }

  return market;
}

// ── evaluateHotSeat ───────────────────────────────────────────────────────────

/**
 * Evaluate whether the head coach should be on the hot seat.
 *
 * Hot seat: win% < 0.35 AND coach has been with team >= 2 seasons.
 * Resets to false if win% >= 0.500.
 *
 * @param {object} team         - team data; reads team.coach.headCoach.hiredSeason
 * @param {object} seasonRecord - { w: number, l: number } for the completed season
 * @param {number} currentSeason
 * @returns {boolean}
 */
export function evaluateHotSeat(team, seasonRecord, currentSeason) {
  const hc = team?.coach?.headCoach;
  if (!hc) return false;

  const w = Number(seasonRecord?.w ?? 0);
  const l = Number(seasonRecord?.l ?? 0);
  const total = w + l;
  if (total === 0) return false;

  const winPct = w / total;

  // Always reset hot seat if win% >= 0.500
  if (winPct >= 0.500) return false;

  const hiredSeason = Number(hc.hiredSeason ?? 0);
  const season      = Number(currentSeason ?? 0);
  const tenure      = season > 0 && hiredSeason > 0 ? season - hiredSeason : 0;

  return winPct < 0.35 && tenure >= 2;
}

// ── getCoachSchemeMultiplier ──────────────────────────────────────────────────

/**
 * Return the scheme execution multiplier for a coach's overall rating.
 *
 * rating >= 80 → ×1.08
 * rating 65–79 → ×1.00 (baseline)
 * rating 50–64 → ×0.94
 * rating < 50  → ×0.88
 *
 * @param {number} coachRating - 1–100
 * @returns {number}
 */
export function getCoachSchemeMultiplier(coachRating) {
  const r = Number(coachRating ?? 65);
  if (r >= 80) return 1.08;
  if (r >= 65) return 1.00;
  if (r >= 50) return 0.94;
  return 0.88;
}

// ── getCoachingInstabilityPenalty ─────────────────────────────────────────────

/**
 * Return the coaching instability penalty for FA negotiations, or null.
 *
 * Fires if team.coachHistory has >= 3 coaching changes in the last `lookbackSeasons` seasons.
 * Stacks with existing franchise reputation modifiers (subject to ±25% cap in caller).
 *
 * @param {Array}  coachHistory    - team.coachHistory entries: [{ season, ... }]
 * @param {number} lookbackSeasons - how many past seasons to inspect (default 3)
 * @returns {{ penalty: number, reason: string } | null}
 */
export function getCoachingInstabilityPenalty(coachHistory, lookbackSeasons = 3) {
  if (!Array.isArray(coachHistory) || coachHistory.length === 0) return null;

  const maxSeason = coachHistory.reduce(
    (max, e) => Math.max(max, Number(e?.season ?? 0)),
    0,
  );
  const cutoff = maxSeason - Number(lookbackSeasons) + 1;

  const recentChanges = coachHistory.filter(
    (e) => Number(e?.season ?? 0) >= cutoff,
  ).length;

  if (recentChanges < 3) return null;

  return {
    penalty: 0.06,
    reason:  'Franchise instability — frequent coaching changes',
  };
}

// ── Position-scheme fit ────────────────────────────────────────────────────────

const OFFENSIVE_POS = new Set([
  'QB', 'RB', 'FB', 'HB', 'WR', 'TE',
  'OL', 'OT', 'OG', 'C', 'G', 'T', 'LT', 'RT', 'LG', 'RG',
]);

const DEFENSIVE_POS = new Set([
  'DL', 'DE', 'DT', 'NT', 'EDGE',
  'LB', 'ILB', 'OLB', 'MLB',
  'CB', 'DB', 'S', 'FS', 'SS',
]);

// Positions that are a GOOD FIT for each scheme
const SCHEME_FIT = {
  SPREAD:       new Set(['QB', 'WR', 'TE']),
  WEST_COAST:   new Set(['QB', 'WR', 'TE']),
  VERTICAL:     new Set(['QB', 'WR', 'TE']),
  POWER_RUN:    new Set(['RB', 'FB', 'HB', 'OL', 'OT', 'OG', 'C', 'G', 'T', 'LT', 'RT', 'LG', 'RG']),
  BALANCED:     null, // everyone fits
  BLITZ_HEAVY:  new Set(['DL', 'DE', 'DT', 'NT', 'EDGE', 'LB', 'ILB', 'OLB', 'MLB']),
  COVER_2:      new Set(['CB', 'DB', 'S', 'FS', 'SS']),
  MAN_COVERAGE: new Set(['CB', 'DB', 'S', 'FS', 'SS']),
  HYBRID:       null, // everyone fits
};

/**
 * True if a player's position does NOT fit the given scheme.
 * Only evaluates offensive and defensive players; special teams / nulls are never misfits.
 *
 * @param {string} position
 * @param {string} scheme
 * @returns {boolean}
 */
export function isPositionMisfitForScheme(position, scheme) {
  if (!position || !scheme) return false;
  const pos = String(position).toUpperCase();

  // ST and unknown positions — not affected by scheme changes
  if (!OFFENSIVE_POS.has(pos) && !DEFENSIVE_POS.has(pos)) return false;

  // BALANCED and HYBRID — no misfits
  const fitSet = SCHEME_FIT[scheme];
  if (!fitSet) return false;

  const isOffScheme = OFFENSIVE_POS.has(pos) && !DEFENSIVE_POS.has(pos);
  const isDefScheme = DEFENSIVE_POS.has(pos) && !OFFENSIVE_POS.has(pos);

  const schemeIsOffensive = ['SPREAD', 'WEST_COAST', 'VERTICAL', 'POWER_RUN'].includes(scheme);
  const schemeIsDefensive = ['BLITZ_HEAVY', 'COVER_2', 'MAN_COVERAGE'].includes(scheme);

  // Defensive players are unaffected by offensive scheme changes (and vice versa)
  if (schemeIsOffensive && !isOffScheme) return false;
  if (schemeIsDefensive && !isDefScheme) return false;

  return !fitSet.has(pos);
}

// ── ensureCoachSchema ─────────────────────────────────────────────────────────

const DEFAULT_HC = Object.freeze({
  id:               null,
  name:             null,
  scheme:           'BALANCED',
  contractYearsLeft: 3,
  overallRating:    65,
  hotSeat:          false,
  firedSeason:      null,
  hiredSeason:      null,
});

const DEFAULT_COORD = Object.freeze({
  id:               null,
  name:             null,
  scheme:           'BALANCED',
  contractYearsLeft: 3,
  overallRating:    65,
});

/**
 * Hydrate a team with the V1 coach schema if not already present.
 * Safe on old saves — never overwrites existing data.
 *
 * @param {object} team
 * @returns {object} team with coach schema defaults applied (new reference)
 */
export function ensureCoachSchema(team) {
  if (!team) return team;

  const existing = team.coach ?? {};

  return {
    ...team,
    coach: {
      headCoach: existing.headCoach
        ? { ...DEFAULT_HC, ...existing.headCoach }
        : { ...DEFAULT_HC },
      offensiveCoordinator: existing.offensiveCoordinator
        ? { ...DEFAULT_COORD, ...existing.offensiveCoordinator }
        : { ...DEFAULT_COORD },
      defensiveCoordinator: existing.defensiveCoordinator
        ? { ...DEFAULT_COORD, ...existing.defensiveCoordinator }
        : { ...DEFAULT_COORD },
    },
    coachHistory: Array.isArray(team.coachHistory) ? team.coachHistory : [],
  };
}
