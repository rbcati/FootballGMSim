export interface PrepInsightFlags {
  weakSecondary?: boolean;
  weakRunDefense?: boolean;
  elitePassRush?: boolean;
  explosiveOpponentOffense?: boolean;
  balancedMatchup?: boolean;
}

export interface PrepCompletionState {
  lineupChecked?: boolean;
  injuriesReviewed?: boolean;
  opponentScouted?: boolean;
  planReviewed?: boolean;
}

export interface WeeklyPrepStateLike {
  insights?: PrepInsightFlags;
  completion?: PrepCompletionState;
  hasTracking?: boolean;
}

export interface GamePlanLike {
  runPassBalance?: number;
  aggressionLevel?: number;
  deepShortBalance?: number;
}

export interface TeamReadinessContext {
  hasBlockingLineupIssue?: boolean;
  majorInjuryStress?: boolean;
}

export interface DerivedGamePlanMultipliers {
  passSuccessDelta: number;
  rushSuccessDelta: number;
  explosivePlayDelta: number;
  turnoverAvoidanceDelta: number;
  redZoneDelta: number;
  fatigueDisciplineDelta: number;
  chemistryPenalty: number;
  score: number;
  netImpact: number;
  severity: 'ready' | 'minor_risk' | 'major_risk';
  activeReasons: string[];
}

const TUNING = Object.freeze({
  PASS_SYNERGY_BONUS: 0.03,
  PASS_EXPLOSIVE_BONUS: 0.012,
  RUN_SYNERGY_BONUS: 0.03,
  PROTECTION_PASS_BONUS: 0.015,
  PROTECTION_TURNOVER_BONUS: 0.02,
  TEMPO_CONTROL_TURNOVER_BONUS: 0.016,
  TEMPO_CONTROL_DISCIPLINE_BONUS: 0.016,
  RED_ZONE_EXECUTION_BONUS: 0.01,

  PLAN_REVIEW_MISS_PENALTY: 0.008,
  LINEUP_REVIEW_MISS_PENALTY: 0.012,
  INJURY_REVIEW_MISS_PENALTY: 0.015,
  INJURY_REVIEW_MISS_CHEMISTRY: 0.02,
  UNCHECKED_OPPONENT_SCOUT_PENALTY: 0.006,

  INJURY_STRESS_PENALTY: 0.012,
  INVALID_LINEUP_PENALTY: 0.024,
  INVALID_LINEUP_CHEMISTRY_PENALTY: 0.055,

  EXTREME_UNSUPPORTED_PLAN_PENALTY: 0.01,

  MAX_TOTAL_PREP_BONUS: 0.06,
  MAX_TOTAL_PREP_PENALTY: 0.08,
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function capPositive(value: number): number {
  return clamp(value, 0, TUNING.MAX_TOTAL_PREP_BONUS);
}

function capNegative(value: number): number {
  return clamp(value, -TUNING.MAX_TOTAL_PREP_PENALTY, 0);
}

function pushReason(reasons: string[], reason: string): void {
  if (!reason || reasons.includes(reason)) return;
  reasons.push(reason);
}

export function deriveGamePlanMultipliers({
  weeklyPrepState,
  gamePlan,
  teamContext,
}: {
  weeklyPrepState?: WeeklyPrepStateLike | null;
  gamePlan?: GamePlanLike | null;
  teamContext?: TeamReadinessContext | null;
  opponentContext?: TeamReadinessContext | null;
}): DerivedGamePlanMultipliers {
  const prep = weeklyPrepState ?? {};
  const insights = prep.insights ?? {};
  const completion = prep.completion ?? {};
  const hasTracking = Boolean(prep.hasTracking);

  const runPassBalance = toNumber(gamePlan?.runPassBalance, 50);
  const aggressionLevel = toNumber(gamePlan?.aggressionLevel, 50);
  const deepShortBalance = toNumber(gamePlan?.deepShortBalance, 50);

  const passHeavy = runPassBalance >= 60;
  const runHeavy = runPassBalance <= 40;
  const quickGame = deepShortBalance <= 42;
  const conservativeTempo = aggressionLevel <= 45;
  const extremePlan = Math.abs(runPassBalance - 50) >= 30;

  let passSuccessDelta = 0;
  let rushSuccessDelta = 0;
  let explosivePlayDelta = 0;
  let turnoverAvoidanceDelta = 0;
  let redZoneDelta = 0;
  let fatigueDisciplineDelta = 0;
  let chemistryPenalty = 0;

  const reasons: string[] = [];
  let synergyApplied = false;

  // --- Matchup synergy family: scouting report aligned with chosen game plan ---
  if (insights.weakSecondary && passHeavy) {
    synergyApplied = true;
    passSuccessDelta += TUNING.PASS_SYNERGY_BONUS;
    explosivePlayDelta += TUNING.PASS_EXPLOSIVE_BONUS;
    pushReason(reasons, 'Pass Attack Edge: pass-heavy plan aligns with opponent weak secondary.');
  }

  if (insights.weakRunDefense && runHeavy) {
    synergyApplied = true;
    rushSuccessDelta += TUNING.RUN_SYNERGY_BONUS;
    redZoneDelta += TUNING.RED_ZONE_EXECUTION_BONUS;
    pushReason(reasons, 'Run Matchup Advantage: run-heavy script targets a soft front.');
  }

  if (insights.elitePassRush && quickGame) {
    synergyApplied = true;
    passSuccessDelta += TUNING.PROTECTION_PASS_BONUS;
    turnoverAvoidanceDelta += TUNING.PROTECTION_TURNOVER_BONUS;
    fatigueDisciplineDelta += TUNING.PROTECTION_PASS_BONUS;
    pushReason(reasons, 'Protection Plan Active: quick-game focus offsets elite pass rush pressure.');
  }

  if (insights.explosiveOpponentOffense && conservativeTempo && runPassBalance <= 55) {
    synergyApplied = true;
    turnoverAvoidanceDelta += TUNING.TEMPO_CONTROL_TURNOVER_BONUS;
    fatigueDisciplineDelta += TUNING.TEMPO_CONTROL_DISCIPLINE_BONUS;
    pushReason(reasons, 'Strategy Synergy: lower-variance tempo helps contain an explosive opponent offense.');
  }

  if (insights.balancedMatchup && extremePlan && !synergyApplied) {
    chemistryPenalty -= TUNING.EXTREME_UNSUPPORTED_PLAN_PENALTY;
    pushReason(reasons, 'No scouting support for an extreme plan in a balanced matchup.');
  }

  // --- Readiness penalty family: skipped workflow checks and lineup stress ---
  if (hasTracking && completion.planReviewed === false) {
    passSuccessDelta -= TUNING.PLAN_REVIEW_MISS_PENALTY;
    rushSuccessDelta -= TUNING.PLAN_REVIEW_MISS_PENALTY;
    pushReason(reasons, 'Readiness Penalty Active: game plan review not completed.');
  }

  if (hasTracking && completion.lineupChecked === false) {
    chemistryPenalty -= TUNING.LINEUP_REVIEW_MISS_PENALTY;
    pushReason(reasons, 'Lineup Risk: lineup readiness check was skipped.');
  }

  if (hasTracking && completion.opponentScouted === false) {
    passSuccessDelta -= TUNING.UNCHECKED_OPPONENT_SCOUT_PENALTY;
    rushSuccessDelta -= TUNING.UNCHECKED_OPPONENT_SCOUT_PENALTY;
    pushReason(reasons, 'Scouting gap: opponent tendencies were not reviewed this week.');
  }

  if (teamContext?.majorInjuryStress) {
    fatigueDisciplineDelta -= TUNING.INJURY_STRESS_PENALTY;
    pushReason(reasons, 'Injury stress is active in key position groups.');
    if (hasTracking && completion.injuriesReviewed === false) {
      turnoverAvoidanceDelta -= TUNING.INJURY_REVIEW_MISS_PENALTY;
      chemistryPenalty -= TUNING.INJURY_REVIEW_MISS_CHEMISTRY;
      pushReason(reasons, 'Injury Review Missing: key injury impacts were not reviewed.');
    }
  }

  if (teamContext?.hasBlockingLineupIssue) {
    passSuccessDelta -= TUNING.INVALID_LINEUP_PENALTY;
    rushSuccessDelta -= TUNING.INVALID_LINEUP_PENALTY;
    chemistryPenalty -= TUNING.INVALID_LINEUP_CHEMISTRY_PENALTY;
    pushReason(reasons, 'Major Lineup Risk: depth chart blockers are unresolved.');
  }

  passSuccessDelta = capNegative(passSuccessDelta) + capPositive(passSuccessDelta);
  rushSuccessDelta = capNegative(rushSuccessDelta) + capPositive(rushSuccessDelta);
  explosivePlayDelta = capNegative(explosivePlayDelta) + capPositive(explosivePlayDelta);
  turnoverAvoidanceDelta = capNegative(turnoverAvoidanceDelta) + capPositive(turnoverAvoidanceDelta);
  redZoneDelta = capNegative(redZoneDelta) + capPositive(redZoneDelta);
  fatigueDisciplineDelta = capNegative(fatigueDisciplineDelta) + capPositive(fatigueDisciplineDelta);
  chemistryPenalty = capNegative(chemistryPenalty);

  const score = Number((
    passSuccessDelta
    + rushSuccessDelta
    + explosivePlayDelta
    + turnoverAvoidanceDelta
    + redZoneDelta
    + fatigueDisciplineDelta
    + chemistryPenalty
  ).toFixed(4));

  const severity: DerivedGamePlanMultipliers['severity'] = score <= -0.055
    ? 'major_risk'
    : score <= -0.015
      ? 'minor_risk'
      : 'ready';

  return {
    passSuccessDelta: Number(passSuccessDelta.toFixed(4)),
    rushSuccessDelta: Number(rushSuccessDelta.toFixed(4)),
    explosivePlayDelta: Number(explosivePlayDelta.toFixed(4)),
    turnoverAvoidanceDelta: Number(turnoverAvoidanceDelta.toFixed(4)),
    redZoneDelta: Number(redZoneDelta.toFixed(4)),
    fatigueDisciplineDelta: Number(fatigueDisciplineDelta.toFixed(4)),
    chemistryPenalty: Number(chemistryPenalty.toFixed(4)),
    score,
    netImpact: score,
    severity,
    activeReasons: reasons,
  };
}

export function getGamePlanSynergySummary(multipliers: DerivedGamePlanMultipliers | null | undefined) {
  const safe = multipliers ?? deriveGamePlanMultipliers({});
  const positive = [
    safe.passSuccessDelta,
    safe.rushSuccessDelta,
    safe.explosivePlayDelta,
    safe.turnoverAvoidanceDelta,
    safe.redZoneDelta,
    safe.fatigueDisciplineDelta,
  ].reduce((sum, value) => sum + Math.max(0, value), 0);
  const negative = Math.abs(
    [
      safe.passSuccessDelta,
      safe.rushSuccessDelta,
      safe.explosivePlayDelta,
      safe.turnoverAvoidanceDelta,
      safe.redZoneDelta,
      safe.fatigueDisciplineDelta,
      safe.chemistryPenalty,
    ].reduce((sum, value) => sum + Math.min(0, value), 0),
  );

  const status = safe.severity === 'major_risk'
    ? 'Major risk'
    : safe.severity === 'minor_risk'
      ? 'Minor risk'
      : 'Ready';

  return {
    status,
    severity: safe.severity,
    positive: Number(positive.toFixed(4)),
    negative: Number(negative.toFixed(4)),
    netImpact: safe.netImpact,
    reasons: safe.activeReasons,
  };
}
