/**
 * combineEngine.js
 * Pure, deterministic combine and private workout simulation for the NFL Draft.
 * Uses LCG-based seeding — no Math.random.
 */

export const POSITION_ATHLETIC_PROFILES = {
  speed: {
    positions: ['WR', 'CB', 'RB', 'S'],
    fortyYardDash: {
      elite:   { attr_min: 90, range: [4.28, 4.38] },
      good:    { attr_min: 75, range: [4.38, 4.50] },
      average: { attr_min: 55, range: [4.50, 4.62] },
      below:   { attr_min: 0,  range: [4.62, 4.78] },
    },
    threeCone: {
      elite:   { attr_min: 90, range: [6.45, 6.65] },
      good:    { attr_min: 75, range: [6.65, 6.90] },
      average: { attr_min: 55, range: [6.90, 7.15] },
      below:   { attr_min: 0,  range: [7.15, 7.50] },
    },
  },
  big_skill: {
    positions: ['QB', 'TE', 'LB', 'OLB'],
    fortyYardDash: {
      elite:   { attr_min: 85, range: [4.50, 4.62] },
      good:    { attr_min: 70, range: [4.62, 4.75] },
      average: { attr_min: 50, range: [4.75, 4.90] },
      below:   { attr_min: 0,  range: [4.90, 5.10] },
    },
    threeCone: {
      elite:   { attr_min: 85, range: [6.70, 6.90] },
      good:    { attr_min: 70, range: [6.90, 7.10] },
      average: { attr_min: 50, range: [7.10, 7.35] },
      below:   { attr_min: 0,  range: [7.35, 7.70] },
    },
  },
  linemen: {
    positions: ['OL', 'DL', 'DE', 'NT', 'C', 'G', 'T'],
    fortyYardDash: {
      elite:   { attr_min: 75, range: [4.78, 4.92] },
      good:    { attr_min: 60, range: [4.92, 5.08] },
      average: { attr_min: 40, range: [5.08, 5.25] },
      below:   { attr_min: 0,  range: [5.25, 5.55] },
    },
    threeCone: {
      elite:   { attr_min: 75, range: [7.20, 7.50] },
      good:    { attr_min: 60, range: [7.50, 7.80] },
      average: { attr_min: 40, range: [7.80, 8.20] },
      below:   { attr_min: 0,  range: [8.20, 8.70] },
    },
  },
};

export const BENCH_PRESS_PROFILE = {
  elite:   { attr_min: 90, range: [30, 40] },
  good:    { attr_min: 70, range: [20, 30] },
  average: { attr_min: 50, range: [12, 20] },
  below:   { attr_min: 0,  range: [5, 12] },
};

export const VERTICAL_JUMP_PROFILE = {
  elite:   { attr_min: 90, range: [38, 45] },
  good:    { attr_min: 70, range: [32, 38] },
  average: { attr_min: 50, range: [26, 32] },
  below:   { attr_min: 0,  range: [18, 26] },
};

export const COMBINE_GRADE_THRESHOLDS = {
  athletic_freak: 8.5,
  bust: 4.0,
};

function lcgStep(seed) {
  const next = (seed * 1664525 + 1013904223) >>> 0;
  return { value: next / 0x100000000, nextSeed: next };
}

function combineSeed(a, b, c) {
  return ((a * 2654435761 + b * 40503 + c * 12345) >>> 0);
}

export function getPositionGroup(position) {
  const pos = String(position).toUpperCase();
  if (['WR', 'CB', 'RB', 'S'].includes(pos)) return 'speed';
  if (['QB', 'TE', 'LB', 'OLB'].includes(pos)) return 'big_skill';
  return 'linemen';
}

function pickTierValue(attr, profile, lcgValue) {
  const tiers = ['elite', 'good', 'average', 'below'];
  for (const tier of tiers) {
    if (attr >= profile[tier].attr_min) {
      const [lo, hi] = profile[tier].range;
      return lo + lcgValue * (hi - lo);
    }
  }
  const [lo, hi] = profile.below.range;
  return lo + lcgValue * (hi - lo);
}

export function generateCombineMetrics(prospect, season) {
  const group = getPositionGroup(prospect.pos);
  const profile = POSITION_ATHLETIC_PROFILES[group];

  const speedAttr     = prospect.ratings?.speed ?? 70;
  const agilityAttr   = prospect.ratings?.agility ?? 70;
  const strengthAttr  = prospect.ratings?.runBlock ?? prospect.ratings?.passRushPower ?? prospect.ratings?.trucking ?? 50;
  const explosionAttr = prospect.ratings?.agility ?? prospect.ratings?.acceleration ?? 60;

  const prospectId = Number(prospect.id) || 0;
  const trueOvr    = prospect.trueOvr ?? prospect.ovr ?? 60;
  const baseSeed   = combineSeed(prospectId, trueOvr, season);

  const { value: v0 } = lcgStep((baseSeed ^ 0) >>> 0);
  const { value: v1 } = lcgStep((baseSeed ^ 1) >>> 0);
  const { value: v2 } = lcgStep((baseSeed ^ 2) >>> 0);
  const { value: v3 } = lcgStep((baseSeed ^ 3) >>> 0);

  const fortyRaw   = pickTierValue(speedAttr, profile.fortyYardDash, v0);
  const threeConeRaw = pickTierValue(agilityAttr, profile.threeCone, v1);
  const benchRaw   = pickTierValue(strengthAttr, BENCH_PRESS_PROFILE, v2);
  const verticalRaw = pickTierValue(explosionAttr, VERTICAL_JUMP_PROFILE, v3);

  const fortyYardDash  = Math.round(fortyRaw * 100) / 100;
  const threeCone      = Math.round(threeConeRaw * 100) / 100;
  const benchPressReps = Math.round(benchRaw);
  const verticalJump   = Math.round(verticalRaw * 10) / 10;

  const metrics = { fortyYardDash, threeCone, benchPressReps, verticalJump };
  const combineGrade = computeCombineGrade(metrics, prospect.pos);

  return {
    fortyYardDash,
    threeCone,
    benchPressReps,
    verticalJump,
    combineGrade,
    generatedAt: 'combine_week',
  };
}

export function computeCombineGrade(metrics, position) {
  const group = getPositionGroup(position);

  const fortyFullRanges = {
    speed:     { worst: 4.78, best: 4.28 },
    big_skill: { worst: 5.10, best: 4.50 },
    linemen:   { worst: 5.55, best: 4.78 },
  };
  const threeConeFullRanges = {
    speed:     { worst: 7.50, best: 6.45 },
    big_skill: { worst: 7.70, best: 6.70 },
    linemen:   { worst: 8.70, best: 7.20 },
  };

  const fortyRange     = fortyFullRanges[group];
  const threeConeRange = threeConeFullRanges[group];

  const fortyPct     = Math.min(1, Math.max(0, (fortyRange.worst - metrics.fortyYardDash) / (fortyRange.worst - fortyRange.best)));
  const threeConePct = Math.min(1, Math.max(0, (threeConeRange.worst - metrics.threeCone) / (threeConeRange.worst - threeConeRange.best)));
  const benchPct     = Math.min(1, Math.max(0, (metrics.benchPressReps - 5) / (40 - 5)));
  const verticalPct  = Math.min(1, Math.max(0, (metrics.verticalJump - 18) / (45 - 18)));

  let weights;
  if (group === 'speed') {
    weights = { forty: 0.40, threeCone: 0.30, vertical: 0.20, bench: 0.10 };
  } else if (group === 'big_skill') {
    weights = { forty: 0.30, threeCone: 0.30, vertical: 0.25, bench: 0.15 };
  } else {
    weights = { bench: 0.40, forty: 0.25, threeCone: 0.20, vertical: 0.15 };
  }

  const grade =
    fortyPct     * weights.forty +
    threeConePct * weights.threeCone +
    verticalPct  * weights.vertical +
    benchPct     * weights.bench;

  return Math.min(10, Math.max(0, grade * 10));
}

export function generateCombineMetricsForClass(prospects, season) {
  return prospects.map((prospect) => {
    if (prospect.combineMetrics !== null && prospect.combineMetrics !== undefined) {
      return prospect;
    }
    const combineMetrics = generateCombineMetrics(prospect, season);
    return { ...prospect, combineMetrics };
  });
}

export function applyPrivateWorkout(prospect, teamId, season) {
  const trueOvr = prospect.trueOvr ?? prospect.ovr ?? 60;
  const existingRanges = prospect.scoutedRanges ?? {};
  return {
    ...prospect,
    workoutCompleted: true,
    scoutedRanges: {
      ...existingRanges,
      [teamId]: { low: trueOvr, high: trueOvr, confidence: 1.0, label: 'Verified' },
    },
  };
}

export function getAIDraftBoardAdjustment(prospect) {
  if (prospect.combineMetrics === null || prospect.combineMetrics === undefined) {
    return { slots: 0, reason: 'none' };
  }
  const grade = prospect.combineMetrics.combineGrade;
  if (grade > COMBINE_GRADE_THRESHOLDS.athletic_freak) {
    return { slots: 15, reason: 'athletic_freak' };
  }
  if (grade < COMBINE_GRADE_THRESHOLDS.bust) {
    return { slots: -15, reason: 'combine_bust' };
  }
  return { slots: 0, reason: 'none' };
}
