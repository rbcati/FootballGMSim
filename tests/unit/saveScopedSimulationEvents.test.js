import { describe, expect, it } from 'vitest';
import { INITIAL_WORKER_STATE, workerReducer } from '../../src/ui/hooks/useWorker.js';
import { handleWorkerMessage, toUI } from '../../src/worker/workerApi.js';
import {
  captureSimulationScope,
  shouldAcceptSimulationScope,
  withSimulationScope,
} from '../../src/worker/simulationScope.js';

const league = (activeLeagueId, epoch, overrides = {}) => ({
  activeLeagueId, _stateEpoch: epoch, seasonId: `season-${epoch}`, year: 2026,
  week: 1, phase: 'regular', userTeamId: 10,
  teams: [{ id: 10, abbr: 'PIT', wins: 0, losses: 0 }, { id: 11, abbr: 'CLE' }],
  schedule: { weeks: [{ week: 1, games: [{ home: 10, away: 11, played: false }] }] },
  ...overrides,
});

function scoped(type, scope, payload = {}) {
  return { type, payload: withSimulationScope(payload, scope) };
}

function applyIfCurrent(state, message) {
  const baseline = { stateEpoch: state.league?._stateEpoch, activeLeagueId: state.league?.activeLeagueId };
  if (!shouldAcceptSimulationScope(message.payload, baseline)) return state;
  let next = state;
  handleWorkerMessage(message, action => { next = workerReducer(next, action); });
  return next;
}

describe('save-scoped simulation events', () => {
  it('rejects the reproduced same-slot WEEK_COMPLETE race', () => {
    const oldScope = captureSimulationScope({ stateEpoch: 10, activeLeagueId: 'save_slot_1', seasonId: 'old', week: 8 });
    let state = { ...INITIAL_WORKER_STATE, league: league('save_slot_1', 10, { week: 8 }), lastResults: [{ awayAbbr: 'HOU' }], lastSimWeek: 8 };
    state = workerReducer(state, { type: 'FULL_STATE', payload: league('save_slot_1', 11) });
    expect(state.lastResults).toBeNull();
    state = applyIfCurrent(state, scoped(toUI.WEEK_COMPLETE, oldScope, {
      week: 8, nextWeek: 9, phase: 'regular', standings: [{ id: 10, wins: 3 }],
      results: [{ homeId: 10, awayId: 12, homeAbbr: 'PIT', awayAbbr: 'HOU', homeScore: 7, awayScore: 28 }],
    }));
    expect(state.league.week).toBe(1);
    expect(state.league.teams[0]).toMatchObject({ wins: 0, losses: 0 });
    expect(state.lastResults).toBeNull();
    expect(state.lastSimWeek).toBeNull();
  });

  it('rejects a cross-slot stale result and accepts a matching current result', () => {
    const state = { ...INITIAL_WORKER_STATE, league: league('save_slot_2', 4) };
    const stale = scoped(toUI.WEEK_COMPLETE, captureSimulationScope({ stateEpoch: 3, activeLeagueId: 'save_slot_1' }), { week: 8, nextWeek: 9, results: ['old'] });
    expect(applyIfCurrent(state, stale)).toBe(state);
    const current = scoped(toUI.WEEK_COMPLETE, captureSimulationScope({ stateEpoch: 4, activeLeagueId: 'save_slot_2' }), { week: 1, nextWeek: 2, phase: 'regular', results: ['CLE'], standings: [{ id: 10, wins: 1 }] });
    expect(applyIfCurrent(state, current)).toMatchObject({ lastResults: ['CLE'], lastSimWeek: 1, league: { week: 2, teams: [{ id: 10, wins: 1 }] } });
  });

  it.each([
    [toUI.PLAY_LOGS, { logs: ['old'] }, 'userGameLogs', null],
    [toUI.GAME_EVENT, { gameId: 'old' }, 'gameEvents', []],
    [toUI.PROMPT_USER_GAME, {}, 'promptUserGame', false],
    [toUI.SIM_PROGRESS, { done: 9, total: 10 }, 'simProgress', 0],
  ])('rejects delayed %s', (type, payload, field, expected) => {
    const state = { ...INITIAL_WORKER_STATE, league: league('save_slot_1', 11) };
    const old = scoped(type, captureSimulationScope({ stateEpoch: 10, activeLeagueId: 'save_slot_1' }), payload);
    expect(applyIfCurrent(state, old)[field]).toEqual(expected);
  });

  it('requires exact epoch and scope after hydration but permits pre-baseline compatibility', () => {
    expect(shouldAcceptSimulationScope({}, { stateEpoch: 11, activeLeagueId: 'save_slot_1' })).toBe(false);
    expect(shouldAcceptSimulationScope(withSimulationScope({}, { stateEpoch: 12, activeLeagueId: 'save_slot_1' }), { stateEpoch: 11, activeLeagueId: 'save_slot_1' })).toBe(false);
    expect(shouldAcceptSimulationScope({}, { stateEpoch: 0 })).toBe(true);
  });

  it('captures operation scope immutably at start', () => {
    const scope = captureSimulationScope({ stateEpoch: 20, activeLeagueId: 'save_slot_1', week: 8 });
    const currentWorkerEpoch = 21;
    expect(withSimulationScope({}, scope)._simulationScope.stateEpoch).toBe(20);
    expect(currentWorkerEpoch).toBe(21);
    expect(Object.isFrozen(scope)).toBe(true);
  });
});
