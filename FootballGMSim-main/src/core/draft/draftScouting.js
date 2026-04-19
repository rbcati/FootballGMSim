import { Utils as U } from '../utils.js';

const DEFAULT_COMBINE = {
  fortyTime: 4.72,
  benchPress: 20,
  verticalLeap: 32,
  agility: 7.2,
  broadJump: 116,
};

const OFFENSE_POS = new Set(['QB', 'RB', 'WR', 'TE', 'OL', 'K', 'P']);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function simulateCombineResults(pos, ratings = {}) {
  const speed = Number(ratings?.speed ?? 70);
  const accel = Number(ratings?.acceleration ?? 70);
  const strength = Number((ratings?.runBlock ?? ratings?.passRushPower ?? ratings?.trucking ?? 70));
  const explosion = Number((ratings?.jumping ?? ratings?.agility ?? accel ?? 70));
  const agilityRating = Number(ratings?.agility ?? 70);

  const fortyTime = Number(clamp((5.45 - ((speed + accel) / 220)) + U.rand(-6, 6) / 100, 4.2, 5.4).toFixed(2));
  const benchPress = clamp(Math.round((strength - 40) * 0.45 + U.rand(8, 26)), 6, 45);
  const verticalLeap = clamp(Math.round((explosion - 45) * 0.35 + U.rand(24, 40)), 20, 46);
  const agility = Number(clamp((7.95 - (agilityRating / 130)) + U.rand(-7, 7) / 100, 6.5, 8.3).toFixed(2));
  const broadJump = clamp(Math.round(96 + (explosion - 40) * 0.55 + U.rand(-8, 14)), 92, 142);

  return { ...DEFAULT_COMBINE, fortyTime, benchPress, verticalLeap, agility, broadJump, pos };
}

export function generateCollegeStats(pos, trueOvr = 68, potential = 74) {
  const baseImpact = clamp(((Number(trueOvr) + Number(potential)) / 2) - 52, 4, 46);
  const games = U.rand(11, 14);

  if (pos === 'QB') {
    return {
      games,
      passYards: Math.round(baseImpact * U.rand(65, 92)),
      passTD: clamp(Math.round(baseImpact / 1.7 + U.rand(8, 18)), 8, 56),
      interceptions: clamp(Math.round(22 - baseImpact / 2 + U.rand(-3, 6)), 2, 22),
      completionPct: clamp(Math.round(52 + baseImpact * 0.52 + U.rand(-4, 4)), 50, 79),
      rushYards: clamp(Math.round(U.rand(20, 600) + baseImpact * 5), 0, 1200),
      rushTD: clamp(Math.round(U.rand(0, 12) + baseImpact / 9), 0, 18),
    };
  }

  if (pos === 'RB') {
    return {
      games,
      rushYards: Math.round(420 + baseImpact * 31 + U.rand(-140, 220)),
      rushTD: clamp(Math.round(4 + baseImpact / 4 + U.rand(0, 8)), 2, 30),
      receptions: clamp(Math.round(U.rand(8, 52) + baseImpact / 3), 4, 80),
      receivingYards: clamp(Math.round(U.rand(70, 760) + baseImpact * 6), 30, 1200),
      fumbles: clamp(Math.round(U.rand(0, 6) + (80 - trueOvr) / 18), 0, 10),
    };
  }

  if (pos === 'WR' || pos === 'TE') {
    return {
      games,
      receptions: clamp(Math.round(20 + baseImpact * 1.4 + U.rand(-8, 20)), 8, 128),
      receivingYards: clamp(Math.round(320 + baseImpact * 17 + U.rand(-90, 260)), 160, 1900),
      receivingTD: clamp(Math.round(3 + baseImpact / 5 + U.rand(0, 8)), 1, 22),
      dropRate: clamp(Math.round(14 - baseImpact / 5 + U.rand(-2, 4)), 1, 18),
    };
  }

  if (!OFFENSE_POS.has(pos)) {
    return {
      games,
      tackles: clamp(Math.round(26 + baseImpact * 1.8 + U.rand(-10, 24)), 18, 170),
      sacks: clamp(Number((U.rand(0, 12) + baseImpact / 8).toFixed(1)), 0, 20),
      tfl: clamp(Math.round(4 + baseImpact / 3 + U.rand(0, 10)), 2, 34),
      interceptions: clamp(Math.round(U.rand(0, 6) + baseImpact / 20), 0, 9),
      passDeflections: clamp(Math.round(U.rand(1, 9) + baseImpact / 8), 1, 20),
    };
  }

  return { games, starts: clamp(Math.round(games - U.rand(0, 3)), 8, 14) };
}

export function generateInterviewReport(player = {}) {
  const persona = player?.personalityProfile ?? {};
  const leadership = Number(persona?.leadership ?? U.rand(45, 90));
  const discipline = Number(persona?.discipline ?? U.rand(45, 90));
  const workEthic = Number(persona?.workEthic ?? U.rand(45, 95));
  const coachability = clamp(Math.round((leadership + discipline + workEthic) / 3 + U.rand(-8, 8)), 40, 99);
  const footballIQ = clamp(Math.round((Number(player?.ratings?.awareness ?? 60) + Number(player?.ratings?.intelligence ?? 60)) / 2 + U.rand(-6, 6)), 40, 99);
  const riskScore = clamp(Math.round(100 - ((coachability + footballIQ) / 2) + U.rand(-4, 8)), 5, 85);

  const summary = riskScore <= 25
    ? 'High-character interview. Staff projects quick adaptation to the pro locker room.'
    : riskScore <= 45
      ? 'Mostly positive interview with manageable maturity concerns.'
      : 'Inconsistent interview. Team should expect a longer development runway.';

  return {
    leadership,
    discipline,
    workEthic,
    coachability,
    footballIQ,
    riskScore,
    summary,
  };
}

export function getScoutingRangeFromProfile({ trueRating, scoutSkill = 70, scoutingLevel = 1, scoutingBudget = 1, fogStrength = 55, scoutProgress = 0 }) {
  const normalizedSkill = clamp(Number(scoutSkill) / 100, 0.2, 0.99);
  const normalizedBudget = clamp(Number(scoutingBudget), 0.5, 2.25);
  const levelLift = clamp((Number(scoutingLevel) - 1) * 0.06, 0, 0.3);
  const progressLift = clamp(Number(scoutProgress) / 180, 0, 0.3);
  const fogPenalty = clamp(Number(fogStrength) / 300, 0, 0.45);
  const confidence = clamp(0.35 + normalizedSkill * 0.35 + (normalizedBudget - 1) * 0.12 + levelLift + progressLift - fogPenalty, 0.22, 0.97);
  const spread = clamp(Math.round((1 - confidence) * 26), 2, 22);
  const center = clamp(Math.round(Number(trueRating) + U.rand(-spread, spread)), 40, 99);
  return {
    confidence,
    low: clamp(center - spread, 35, 99),
    high: clamp(center + spread, 36, 99),
    estimated: center,
    spread,
  };
}

export function scoreDraftBoardEntry(prospect, team, context = {}) {
  const teamNeeds = context?.teamNeeds ?? {};
  const needMult = Number(teamNeeds?.[prospect?.pos] ?? 1);
  const schemePreference = String(team?.staff?.headCoach?.schemePreference ?? '').toLowerCase();
  const schemeFit = Number(prospect?.schemeFit ?? 65);
  const combine = prospect?.combineResults ?? {};
  const interview = prospect?.interviewReport ?? {};
  const collegeBoost = Number(prospect?.collegeProductionScore ?? 0);
  const potential = Number(prospect?.potential ?? prospect?.truePotential ?? 60);
  const estimated = Number(prospect?.ovr ?? prospect?.scoutedOvr ?? 60);
  const riskPenalty = Number(interview?.riskScore ?? 40) * -0.24;
  const fitBoost = schemePreference && (prospect?.archetypeTag ?? '').toLowerCase().includes(schemePreference) ? 7 : 0;
  const combineBoost = ((5.35 - Number(combine?.fortyTime ?? 4.9)) * 8) + ((Number(combine?.verticalLeap ?? 30) - 28) * 0.45) + ((32 - Number(combine?.agility ?? 7.4)) * 3.5);

  const value = Math.round(
    estimated * 0.42 +
    potential * 0.35 +
    needMult * 12 +
    schemeFit * 0.12 +
    fitBoost +
    combineBoost +
    collegeBoost * 0.55 +
    riskPenalty
  );

  return {
    playerId: prospect?.id,
    teamId: team?.id,
    score: value,
    reason: `Need x${needMult.toFixed(2)} · Pot ${potential} · Risk ${interview?.riskScore ?? 40}`,
  };
}
