/**
 * Pure, deterministic player development arc context from visible save data only.
 * Does not mutate the player object.
 */

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function toNum(v, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function normalizeDepthOrder(player) {
  return toNum(player?.depthChart?.order ?? player?.depthOrder ?? 99, 99);
}

/**
 * @param {object|null} player
 * @param {object} [context]
 * @param {object} [context.developmentContext] — optional preseason/training snapshot from profile
 * @param {object} [context.team] — optional team for staff hint only
 */
export function buildPlayerDevelopmentModel(player = null, context = {}) {
  const reasons = [];
  const growthSignals = [];
  const regressionRisks = [];

  if (!player || typeof player !== 'object') {
    return {
      playerId: null,
      name: null,
      age: null,
      pos: null,
      currentOvr: null,
      potential: null,
      devStage: 'unknown',
      devTrend: 'unknown',
      arcType: 'unknown',
      ceilingBand: 'unknown',
      floorBand: 'unknown',
      growthSignals: [],
      regressionRisks: [],
      staffImpact: null,
      trainingImpact: null,
      playingTimeImpact: null,
      confidence: 'low',
      summary: 'Insufficient player data for a development read.',
      reasons: ['No player record'],
    };
  }

  const playerId = player.id ?? null;
  const name = player.name ?? null;
  const age = toNum(player.age, 27);
  const pos = String(player.pos ?? player.position ?? '').toUpperCase() || null;
  const currentOvr = toNum(player.ovr, toNum(player.ratings?.overall, 60));
  const potential = toNum(player.potential, currentOvr);
  const delta = toNum(player.progressionDelta, 0);
  const upsideGap = clamp(potential - currentOvr, 0, 99);
  const injuryWeeks = toNum(player.injuryWeeksRemaining ?? player.injury?.weeksRemaining, 0);
  const schemeFit = toNum(player.schemeFit, 50);
  const depthOrder = normalizeDepthOrder(player);
  const devCtx = context.developmentContext ?? player.developmentContext ?? null;
  const staffMod = devCtx?.staffDevelopmentModifier != null ? toNum(devCtx.staffDevelopmentModifier, 0) : null;
  const trainingFocus = devCtx?.trainingFocus ?? null;
  const playingMod = devCtx?.playingTimeModifier != null ? String(devCtx.playingTimeModifier) : null;

  const history = Array.isArray(player.developmentHistory) ? player.developmentHistory : [];
  const historyLen = history.length;

  /** @type {'rookie'|'developing'|'prime'|'late_prime'|'declining'|'veteran_depth'|'unknown'} */
  let devStage = 'unknown';
  if (age <= 22) {
    devStage = 'rookie';
    reasons.push(`Age ${age}: early-career profile.`);
  } else if (age <= 25) {
    devStage = 'developing';
    reasons.push(`Age ${age}: typical development window.`);
  } else if (age <= 29) {
    devStage = 'prime';
    reasons.push(`Age ${age}: prime window for most positions.`);
  } else if (age <= 33) {
    devStage = 'late_prime';
    reasons.push(`Age ${age}: late-prime / maintenance phase.`);
  } else if (age <= 37) {
    devStage = 'declining';
    reasons.push(`Age ${age}: regression risk rises without ideal usage.`);
  } else {
    devStage = 'veteran_depth';
    reasons.push(`Age ${age}: depth / roster-ballast phase unless elite production exists.`);
  }

  /** @type {'rising'|'stable'|'falling'|'unknown'} */
  let devTrend = 'stable';
  if (delta >= 2) {
    devTrend = 'rising';
    growthSignals.push(`Recent OVR trend +${delta} vs prior checkpoint.`);
  } else if (delta <= -2) {
    devTrend = 'falling';
    regressionRisks.push(`Recent OVR trend ${delta}.`);
  } else if (delta === 0 && historyLen >= 2) {
    devTrend = 'stable';
    reasons.push('Flat progression snapshot across logged history.');
  } else {
    reasons.push(`Progression delta ${delta >= 0 ? '+' : ''}${delta} (small move).`);
  }

  /** @type {'early_breakout'|'late_bloomer'|'steady_developer'|'boom_bust'|'capped_out'|'aging_veteran'|'unknown'} */
  let arcType = 'steady_developer';
  if (age >= 32) {
    arcType = 'aging_veteran';
    reasons.push(currentOvr >= 78 ? 'Late-career arc with remaining high-end profile.' : 'Late-career arc; durability and role drive value.');
  } else if (upsideGap <= 2 && age >= 27) {
    arcType = 'capped_out';
    reasons.push(`OVR (${currentOvr}) near listed potential (${potential}) — limited projected gains.`);
  } else if (age >= 26 && delta >= 2 && upsideGap >= 4) {
    arcType = 'late_bloomer';
    growthSignals.push('Older developmental window still showing gains vs listed upside.');
  } else if (age <= 24 && delta >= 3) {
    arcType = 'early_breakout';
    growthSignals.push('Young profile with a sharp recent progression signal.');
  } else if (upsideGap >= 12 && Math.abs(delta) <= 1 && age <= 24) {
    arcType = 'boom_bust';
    regressionRisks.push('Large upside gap but flat recent progression — outcome uncertainty.');
  } else if (age <= 26 && (delta >= 1 || upsideGap >= 6)) {
    arcType = 'steady_developer';
    growthSignals.push('Room to grow vs listed potential while age supports development.');
  } else {
    reasons.push('Steady trajectory — few extreme arc signals in visible data.');
  }

  const ceil = clamp(Math.round(potential), 40, 99);
  const floorGuess = clamp(Math.round(currentOvr - Math.max(0, upsideGap * 0.35)), 40, ceil);
  const ceilingBand = `${ceil - 2}–${ceil}`;
  const floorBand = `${floorGuess}–${clamp(floorGuess + 4, floorGuess, ceil)}`;

  if (schemeFit >= 72) growthSignals.push(`Scheme fit ${schemeFit} supports development environment.`);
  else if (schemeFit <= 42) regressionRisks.push(`Scheme fit ${schemeFit} may cap weekly impact.`);

  if (injuryWeeks > 0) regressionRisks.push(`Injury timeline (${injuryWeeks}w) limits developmental reps.`);

  if (depthOrder >= 3 && age <= 25 && currentOvr >= 68) {
    regressionRisks.push('Buried on depth chart — fewer live reps for growth.');
  }

  let staffImpact = null;
  if (staffMod != null && staffMod !== 0) {
    staffImpact = `Staff development modifier ${staffMod >= 0 ? '+' : ''}${staffMod}% (from training snapshot).`;
    reasons.push(staffImpact);
  } else {
    staffImpact = 'Staff impact not flagged in save data.';
  }

  let trainingImpact = null;
  if (trainingFocus) {
    trainingImpact = `Training focus: ${String(trainingFocus).replace(/_/g, ' ')}.`;
    reasons.push(trainingImpact);
  } else {
    trainingImpact = 'Training focus not logged for this snapshot.';
  }

  let playingTimeImpact = null;
  if (playingMod) {
    playingTimeImpact = `Playing-time modifier from progression context: ${playingMod}.`;
    reasons.push(playingTimeImpact);
  } else if (depthOrder <= 2) {
    playingTimeImpact = 'Early depth — starter-path snaps likely.';
    growthSignals.push(playingTimeImpact);
  } else if (depthOrder >= 4) {
    playingTimeImpact = 'Deep rotation — fewer developmental snaps.';
    regressionRisks.push(playingTimeImpact);
  } else {
    playingTimeImpact = 'Playing-time impact not explicitly logged.';
  }

  /** @type {'high'|'medium'|'low'} */
  let confidence = 'medium';
  const signalCount =
    (historyLen >= 2 ? 1 : 0) +
    (player.progressionDelta != null && Number.isFinite(Number(player.progressionDelta)) ? 1 : 0) +
    (devCtx ? 1 : 0) +
    (schemeFit !== 50 ? 1 : 0);
  if (signalCount >= 4) confidence = 'high';
  else if (signalCount <= 1) confidence = 'low';

  const summary = `${name ?? 'Player'} — ${devStage.replace(/_/g, ' ')}, ${arcType.replace(/_/g, ' ')}, trend ${devTrend}.`;

  return {
    playerId,
    name,
    age,
    pos,
    currentOvr,
    potential,
    devStage,
    devTrend,
    arcType,
    ceilingBand,
    floorBand,
    growthSignals: growthSignals.slice(0, 5),
    regressionRisks: regressionRisks.slice(0, 5),
    staffImpact,
    trainingImpact,
    playingTimeImpact,
    confidence,
    summary,
    reasons: reasons.slice(0, 8),
  };
}
