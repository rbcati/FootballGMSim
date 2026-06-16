/**
 * scoutingEngine.js — Scouting System V1
 * Pure, deterministic module. No side effects.
 * No imports from worker, UI, news, morale, holdout, HOF, coaching, FA, or sim engine.
 * No Math.random — all randomness via seeded LCG.
 */

export const REGIONS = ['northeast', 'southeast', 'midwest', 'southwest', 'west', 'national'];

export const CONFIDENCE_BANDS = Object.freeze({
  0:  { rangeWidth: 18, label: 'Unknown'   },
  3:  { rangeWidth: 12, label: 'Minimal'   },
  8:  { rangeWidth: 7,  label: 'Partial'   },
  15: { rangeWidth: 4,  label: 'Good'      },
  25: { rangeWidth: 2,  label: 'Excellent' },
});

// ── Local copies of scheme data (no import from coachingEngine) ───────────────
const OFFENSIVE_POS = new Set(['QB','RB','FB','HB','WR','TE','OL','OT','OG','C','G','T','LT','RT','LG','RG']);
const DEFENSIVE_POS = new Set(['DL','DE','DT','NT','EDGE','LB','ILB','OLB','MLB','CB','DB','S','FS','SS']);

const SCHEME_FIT_MAP = {
  SPREAD:       new Set(['QB','WR','TE']),
  WEST_COAST:   new Set(['QB','WR','TE']),
  VERTICAL:     new Set(['QB','WR','TE']),
  POWER_RUN:    new Set(['RB','FB','HB','OL','OT','OG','C','G','T','LT','RT','LG','RG']),
  BALANCED:     null,
  BLITZ_HEAVY:  new Set(['DL','DE','DT','NT','EDGE','LB','ILB','OLB','MLB']),
  COVER_2:      new Set(['CB','DB','S','FS','SS']),
  MAN_COVERAGE: new Set(['CB','DB','S','FS','SS']),
  HYBRID:       null,
};

// ── LCG seeded RNG ────────────────────────────────────────────────────────────

/**
 * Compute a numeric seed from prospectId, teamId, and season.
 */
export function computeSeed(prospectId, teamId, season) {
  const a = Number(prospectId) || 0;
  const b = Number(teamId) || 0;
  const c = Number(season) || 0;
  return Math.abs((a * 2654435761 + b * 40503 + c * 12345) >>> 0);
}

/**
 * LCG step: returns a pseudo-random value in [0, 1) from a given seed.
 * Returns { value, nextSeed }.
 */
function lcgStep(seed) {
  const next = (seed * 1664525 + 1013904223) >>> 0;
  return { value: next / 0x100000000, nextSeed: next };
}

// ── Core scouting functions ───────────────────────────────────────────────────

/**
 * Get the CONFIDENCE_BANDS entry for a given number of points invested.
 * Returns the entry whose threshold is the highest value <= pointsInvested.
 */
function getBand(pointsInvested) {
  const thresholds = [0, 3, 8, 15, 25];
  let best = 0;
  for (const t of thresholds) {
    if (pointsInvested >= t) best = t;
  }
  return { ...CONFIDENCE_BANDS[best], threshold: best };
}

/**
 * Compute the scouted range for a prospect.
 * @param {number} trueOvr - true overall rating
 * @param {number} pointsInvested - total scouting points invested
 * @param {number} seed - deterministic seed
 * @returns {{ low, high, confidence, label }}
 */
export function computeScoutedRange(trueOvr, pointsInvested, seed) {
  const band = getBand(pointsInvested);
  const half = band.rangeWidth / 2;

  // Seeded center shift ±1-2
  const { value: r1, nextSeed: s2 } = lcgStep(seed);
  const { value: r2 } = lcgStep(s2);

  // Shift in range [-2, 2]
  const centerShift = Math.round((r1 - 0.5) * 4);

  let low  = Math.max(40, Math.round(trueOvr - half + centerShift));
  let high = Math.min(99, Math.round(trueOvr + half + centerShift));

  // Ensure high > low
  if (high <= low) {
    high = Math.min(99, low + 1);
  }
  if (low >= high) {
    low = Math.max(40, high - 1);
  }

  // Confidence: the threshold (0-25)
  const confidence = band.threshold;

  return { low, high, confidence, label: band.label };
}

/**
 * Local implementation of isPositionMisfitForScheme (no coachingEngine import).
 */
function _isPositionMisfitForScheme(pos, scheme) {
  if (!scheme) return false;
  const schemeFitSet = SCHEME_FIT_MAP[String(scheme).toUpperCase()];
  if (schemeFitSet === null || schemeFitSet === undefined) return false; // BALANCED, HYBRID
  return !schemeFitSet.has(pos);
}

/**
 * Apply scheme bonus/penalty to a scouted range.
 * @param {Object} prospect - { pos, position }
 * @param {Object} team - { coach: { OC, DC } }
 * @param {{ low, high, confidence, label }} scoutedRange
 * @returns {{ adjustedLow, adjustedHigh, schemeFit, fitNote }}
 */
export function applySchemeBonus(prospect, team, scoutedRange) {
  const pos = prospect.pos ?? prospect.position ?? '';
  const isOff = OFFENSIVE_POS.has(pos);
  const isDef = DEFENSIVE_POS.has(pos);

  let adjustedLow  = scoutedRange.low;
  let adjustedHigh = scoutedRange.high;
  let schemeFit    = 'neutral';
  let fitNote      = '';

  if (!isOff && !isDef) {
    // Special teams / unknown — no adjustment
    return { adjustedLow, adjustedHigh, schemeFit: 'neutral', fitNote: 'ST/special position' };
  }

  const scheme = isOff
    ? (team?.coach?.OC?.scheme ?? null)
    : (team?.coach?.DC?.scheme ?? null);

  if (!scheme) {
    return { adjustedLow, adjustedHigh, schemeFit: 'neutral', fitNote: 'No scheme set' };
  }

  const isMisfit = _isPositionMisfitForScheme(pos, scheme);

  if (!isMisfit) {
    // Fits the scheme
    adjustedLow  = Math.min(99, adjustedLow  + 2);
    adjustedHigh = Math.min(99, adjustedHigh + 2);
    schemeFit    = 'fit';
    fitNote      = `Fits ${scheme}`;
  } else {
    // Misfit
    adjustedLow  = Math.max(40, adjustedLow  - 1);
    adjustedHigh = Math.max(40, adjustedHigh - 1);
    schemeFit    = 'misfit';
    fitNote      = `Misfit for ${scheme}`;
  }

  // Ensure high > low after adjustments
  if (adjustedHigh <= adjustedLow) {
    adjustedHigh = Math.min(99, adjustedLow + 1);
  }

  return { adjustedLow, adjustedHigh, schemeFit, fitNote };
}

/**
 * Validate scouting point allocations against a budget.
 * @param {{ weeklyPoints: number }} budget
 * @param {{ [target: string]: number }} allocations - keys are REGIONS entries or numeric strings
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function allocateScoutingPoints(budget, allocations) {
  const errors = [];
  const weeklyPoints = Number(budget?.weeklyPoints ?? 10);

  let total = 0;
  for (const [target, points] of Object.entries(allocations)) {
    const pts = Number(points);
    if (!Number.isFinite(pts) || pts < 0) {
      errors.push(`Invalid points for target "${target}": ${points}`);
      continue;
    }
    // Key must be a REGIONS entry or a numeric string (prospectId)
    const isRegion = REGIONS.includes(target);
    const isNumeric = /^\d+$/.test(target);
    if (!isRegion && !isNumeric) {
      errors.push(`Unknown target "${target}" — must be a region (${REGIONS.join(', ')}) or a prospect ID`);
      continue;
    }
    total += pts;
  }

  if (total > weeklyPoints) {
    errors.push(`Total allocated (${total}) exceeds weekly budget (${weeklyPoints})`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Process weekly scouting for the user's team.
 * Does NOT mutate inputs — returns new objects.
 * @param {Object} team - must have id, coach, scoutingBudget
 * @param {Array} prospects - all draft_eligible players
 * @param {number} season
 * @param {number} week
 * @returns {{ updatedProspects: Array, updatedBudget: Object }}
 */
export function processWeeklyScoutingForTeam(team, prospects, season, week) {
  const teamId = team.id;
  const budget = team.scoutingBudget ?? { weeklyPoints: 10, allocations: {}, spentThisSeason: 0 };
  const allocations = budget.allocations ?? {};

  // Build a map of prospectId -> new points to invest
  const pointsToAdd = new Map(); // prospectId (string) -> number

  for (const [target, rawPts] of Object.entries(allocations)) {
    const pts = Number(rawPts ?? 0);
    if (pts <= 0) continue;

    if (REGIONS.includes(target)) {
      // Regional: distribute evenly to prospects in that region
      const regional = prospects.filter(p => (p.region ?? '') === target);
      if (regional.length === 0) continue;
      const perProspect = pts / regional.length;
      for (const p of regional) {
        const existing = pointsToAdd.get(String(p.id)) ?? 0;
        pointsToAdd.set(String(p.id), existing + perProspect);
      }
    } else {
      // Direct prospect ID
      const existing = pointsToAdd.get(target) ?? 0;
      pointsToAdd.set(target, existing + pts);
    }
  }

  // Apply points to prospects
  const updatedProspects = prospects.map(p => {
    const addPts = pointsToAdd.get(String(p.id)) ?? 0;
    if (addPts <= 0) return p;

    const existingRanges = p.scoutedRanges ?? {};
    const existingEntry  = existingRanges[teamId] ?? {};
    const prevPoints     = existingEntry.pointsInvested ?? 0;
    const newPoints      = prevPoints + addPts;
    const seed           = computeSeed(p.id, teamId, season);
    const range          = computeScoutedRange(p.trueOvr ?? p.ovr ?? 60, newPoints, seed);

    return {
      ...p,
      scoutedRanges: {
        ...existingRanges,
        [teamId]: { ...range, pointsInvested: newPoints },
      },
      scoutingPoints: (p.scoutingPoints ?? 0) + addPts,
    };
  });

  // Compute total new points spent
  let totalNewPoints = 0;
  for (const v of pointsToAdd.values()) totalNewPoints += v;

  const updatedBudget = {
    ...budget,
    spentThisSeason: (budget.spentThisSeason ?? 0) + totalNewPoints,
  };

  return { updatedProspects, updatedBudget };
}

/**
 * Process weekly AI scouting for a team.
 * AI automatically scouts prospects at thin roster positions.
 * @param {Object} team - AI team
 * @param {Array} prospects - all draft_eligible players
 * @param {number} season
 * @param {number} week
 * @returns {Array} updatedProspects (only those that changed)
 */
export function processAIScoutingForTeam(team, prospects, season, week) {
  const teamId = team.id;
  const headCoachRating = Number(team?.coach?.headCoach?.overallRating ?? 50);

  let weeklyPoints;
  if (headCoachRating >= 75) weeklyPoints = 8;
  else if (headCoachRating >= 55) weeklyPoints = 6;
  else weeklyPoints = 4;

  // Seed from team+season+week
  const baseSeed = computeSeed(teamId, season, week);

  // Find thin positions on the roster (fewest players)
  const roster = Array.isArray(team.roster) ? team.roster : [];
  const posCounts = new Map();
  for (const p of roster) {
    const pos = p.pos ?? p.position ?? 'UNK';
    posCounts.set(pos, (posCounts.get(pos) ?? 0) + 1);
  }

  // All positions on the draft board
  const prospectPositions = [...new Set(prospects.map(p => p.pos ?? p.position ?? 'UNK'))];
  const thinPositions = prospectPositions
    .map(pos => ({ pos, count: posCounts.get(pos) ?? 0 }))
    .sort((a, b) => a.count - b.count)
    .slice(0, 3)
    .map(x => x.pos);

  // Top-N prospects at those positions (by existing scoutingPoints desc)
  const targetProspects = prospects
    .filter(p => thinPositions.includes(p.pos ?? p.position ?? 'UNK'))
    .sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0))
    .slice(0, Math.max(2, Math.ceil(weeklyPoints / 2)));

  if (targetProspects.length === 0) return prospects;

  const ptsPerProspect = weeklyPoints / targetProspects.length;
  const targetIds = new Set(targetProspects.map(p => String(p.id)));

  return prospects.map(p => {
    if (!targetIds.has(String(p.id))) return p;

    const existingRanges = p.scoutedRanges ?? {};
    const existingEntry  = existingRanges[teamId] ?? {};
    const prevPoints     = existingEntry.pointsInvested ?? 0;
    const newPoints      = prevPoints + ptsPerProspect;
    const seed           = computeSeed(p.id, teamId, season) ^ baseSeed;
    const range          = computeScoutedRange(p.trueOvr ?? p.ovr ?? 60, newPoints, seed);

    return {
      ...p,
      scoutedRanges: {
        ...existingRanges,
        [teamId]: { ...range, pointsInvested: newPoints },
      },
      scoutingPoints: (p.scoutingPoints ?? 0) + ptsPerProspect,
    };
  });
}

/**
 * Compute global buzz level for a prospect.
 * @param {Object} prospect
 * @returns {{ buzzLevel: string, totalPoints: number }}
 */
export function computeGlobalBuzz(prospect) {
  const totalPoints = prospect.scoutingPoints ?? 0;
  let buzzLevel;
  if (totalPoints >= 40) buzzLevel = 'high';
  else if (totalPoints >= 15) buzzLevel = 'medium';
  else if (totalPoints >= 1) buzzLevel = 'low';
  else buzzLevel = 'unknown';

  return { buzzLevel, totalPoints };
}

/**
 * Get the team's scouting draft board.
 * @param {Array} prospects
 * @param {string|number} teamId
 * @param {Object} team
 * @returns {Array} RankedProspect[]
 */
export function getDraftBoardForTeam(prospects, teamId, team) {
  return prospects
    .map(p => {
      const existingRanges = p.scoutedRanges ?? {};
      const entry = existingRanges[teamId];
      const scoutedRange = entry
        ? { low: entry.low, high: entry.high, confidence: entry.confidence, label: entry.label, pointsInvested: entry.pointsInvested ?? 0 }
        : { low: 40, high: 99, label: 'Unknown', confidence: 'unknown', pointsInvested: 0 };

      const { adjustedLow, adjustedHigh, schemeFit, fitNote } = applySchemeBonus(p, team, scoutedRange);
      const { buzzLevel, totalPoints } = computeGlobalBuzz(p);

      return {
        id:          p.id,
        name:        p.name,
        position:    p.position ?? p.pos,
        pos:         p.pos ?? p.position,
        region:      p.region ?? null,
        scoutedRange,
        adjustedLow,
        adjustedHigh,
        schemeFit,
        fitNote,
        globalBuzz:  { buzzLevel, totalPoints },
      };
    })
    .sort((a, b) => b.adjustedHigh - a.adjustedHigh);
}

/**
 * Finalize the prospect reveal when a pick is made.
 * Returns data only; caller handles DB writes.
 * @param {Object} prospect
 * @param {string|number} teamId
 * @returns {{ trueOvr, wasAccurate, delta }}
 */
export function finalizeProspectReveal(prospect, teamId) {
  const trueOvr = prospect.trueOvr ?? prospect.ovr ?? 60;
  const entry = prospect.scoutedRanges?.[teamId];
  const low  = entry?.low  ?? 40;
  const high = entry?.high ?? 99;

  const wasAccurate = trueOvr >= low && trueOvr <= high;
  const delta = trueOvr - (low + high) / 2;

  return { trueOvr, wasAccurate, delta };
}
