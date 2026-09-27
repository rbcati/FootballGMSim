import { toUI } from './protocol.js';

export const SCOPED_SIMULATION_MESSAGE_TYPES = Object.freeze(new Set([
  toUI.SIM_PROGRESS,
  toUI.SIM_BATCH_PROGRESS,
  toUI.SIM_BATCH_STATUS,
  toUI.WEEK_COMPLETE,
  toUI.PROMPT_USER_GAME,
  toUI.PLAY_LOGS,
  toUI.GAME_EVENT,
]));

export function isScopedSimulationMessage(type) {
  return SCOPED_SIMULATION_MESSAGE_TYPES.has(type);
}

export function captureSimulationScope({ stateEpoch, activeLeagueId, seasonId, week } = {}) {
  return Object.freeze({
    stateEpoch: Number.isFinite(Number(stateEpoch)) ? Number(stateEpoch) : null,
    activeLeagueId: activeLeagueId ?? null,
    seasonId: seasonId ?? null,
    week: week ?? null,
  });
}

export function withSimulationScope(payload = {}, scope) {
  return { ...payload, _simulationScope: scope };
}

export function shouldAcceptSimulationScope(payload = {}, baseline = {}) {
  const baselineEpoch = baseline?.stateEpoch;
  // Before an epoch-bearing FULL_STATE, retain worker-start compatibility.
  if (baselineEpoch == null || Number(baselineEpoch) <= 0) return true;
  const scope = payload?._simulationScope;
  if (!scope || scope.stateEpoch == null) return false;
  if (Number(scope.stateEpoch) !== Number(baselineEpoch)) return false;
  const currentLeagueId = baseline?.activeLeagueId ?? null;
  return currentLeagueId == null || scope.activeLeagueId == null
    ? currentLeagueId === scope.activeLeagueId
    : String(scope.activeLeagueId) === String(currentLeagueId);
}
