import { resolveMatchup, DEFAULT_NORMALIZATION_CONSTANT } from '../core/sim/matchupEngine.ts';

function makeRng(seed = 1) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildInitialGameState(payload = {}) {
  return {
    homeScore: 0,
    awayScore: 0,
    quarter: 1,
    clockSec: 900,
    down: 1,
    distance: 10,
    yardLine: 25,
    possession: 'home',
    normalizationConstant: payload.normalizationConstant ?? DEFAULT_NORMALIZATION_CONSTANT,
  };
}

function applyResultToState(state, result) {
  const nextState = {
    ...state,
    clockSec: Math.max(0, state.clockSec - result.clockElapsedSec),
    down: result.nextDown,
    distance: result.nextDistance,
    yardLine: result.nextYardLine,
  };

  const points = result.nextYardLine >= 99 ? 7 : 0;
  if (state.possession === 'home') nextState.homeScore += points;
  else nextState.awayScore += points;

  if (nextState.down >= 4 && !result.success) {
    nextState.possession = state.possession === 'home' ? 'away' : 'home';
    nextState.down = 1;
    nextState.distance = 10;
    nextState.yardLine = Math.max(20, 100 - nextState.yardLine);
  }

  if (nextState.clockSec <= 0 && nextState.quarter < 4) {
    nextState.quarter += 1;
    nextState.clockSec = 900;
  }

  return nextState;
}

function summarizeFlatGame({ gameId, homeTeamId, awayTeamId, state, totals, reasons }) {
  return {
    gameId,
    homeTeamId,
    awayTeamId,
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    totalPlays: totals.plays,
    homePassYards: totals.homePassYards,
    awayPassYards: totals.awayPassYards,
    homeSuccessRate: totals.homePlays ? Number((totals.homeSuccess / totals.homePlays).toFixed(3)) : 0,
    awaySuccessRate: totals.awayPlays ? Number((totals.awaySuccess / totals.awayPlays).toFixed(3)) : 0,
    normalizationConstant: totals.normalizationConstant,
    topReason1: reasons[0] ?? null,
    topReason2: reasons[1] ?? null,
  };
}

function runSingleGame(payload = {}) {
  const rng = makeRng(payload.seed ?? 1);
  let state = buildInitialGameState(payload);

  const totals = {
    plays: 0,
    homePlays: 0,
    awayPlays: 0,
    homePassYards: 0,
    awayPassYards: 0,
    homeSuccess: 0,
    awaySuccess: 0,
    normalizationConstant: state.normalizationConstant,
  };
  const reasonsMap = new Map();

  while (state.quarter <= 4 && totals.plays < 180) {
    const offense = state.possession === 'home' ? payload.homeOffense : payload.awayOffense;
    const defense = state.possession === 'home' ? payload.awayDefense : payload.homeDefense;
    if (!offense || !defense) break;

    const result = resolveMatchup(offense, defense, {
      down: state.down,
      distance: state.distance,
      yardLine: state.yardLine,
      quarter: state.quarter,
      clockSec: state.clockSec,
      weather: payload.weather,
      playType: 'pass',
      normalizationConstant: state.normalizationConstant,
      fatigueFactor: totals.plays / 220,
    }, rng);

    totals.plays += 1;
    reasonsMap.set(result.reason, (reasonsMap.get(result.reason) ?? 0) + 1);

    if (state.possession === 'home') {
      totals.homePlays += 1;
      totals.homePassYards += result.yardsGained;
      totals.homeSuccess += result.success ? 1 : 0;
    } else {
      totals.awayPlays += 1;
      totals.awayPassYards += result.yardsGained;
      totals.awaySuccess += result.success ? 1 : 0;
    }

    state = applyResultToState(state, result);
  }

  const reasons = [...reasonsMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason]) => reason)
    .slice(0, 2);

  return summarizeFlatGame({
    gameId: payload.gameId,
    homeTeamId: payload.homeTeamId,
    awayTeamId: payload.awayTeamId,
    state,
    totals,
    reasons,
  });
}

self.onmessage = (event) => {
  const { type, payload = {}, id } = event.data ?? {};

  if (type !== 'SIM_SINGLE_GAME') {
    self.postMessage({
      type: 'SIM_WORKER_ERROR',
      id,
      payload: { message: `Unsupported message type: ${type}` },
    });
    return;
  }

  const summary = runSingleGame(payload);
  self.postMessage({
    type: 'SIM_SINGLE_GAME_COMPLETE',
    id,
    payload: summary,
  });
};
