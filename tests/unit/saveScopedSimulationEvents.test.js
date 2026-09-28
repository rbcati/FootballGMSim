import { describe, expect, it } from 'vitest';
import { INITIAL_WORKER_STATE, syncAcceptedSimulationScope, workerReducer } from '../../src/ui/hooks/useWorker.js';
import { handleWorkerMessage, toUI } from '../../src/worker/workerApi.js';
import {
  captureSimulationScope,
  shouldAcceptSimulationScope,
  withSimulationScope,
} from '../../src/worker/simulationScope.js';
import { createFranchiseGenerationId, ensureFranchiseGenerationId, prepareCopiedLeagueSnapshot, shouldCopyLeagueForSave } from '../../src/state/franchiseGeneration.js';

const league = (activeLeagueId, epoch, overrides = {}) => ({
  activeLeagueId, franchiseGenerationId: 'gen_B', _stateEpoch: epoch, seasonId: `season-${epoch}`, year: 2026,
  week: 1, phase: 'regular', userTeamId: 10,
  teams: [{ id: 10, abbr: 'PIT', wins: 0, losses: 0 }, { id: 11, abbr: 'CLE' }],
  schedule: { weeks: [{ week: 1, games: [{ home: 10, away: 11, played: false }] }] },
  ...overrides,
});

function scoped(type, scope, payload = {}) {
  return { type, payload: withSimulationScope(payload, scope) };
}

function applyIfCurrent(state, message) {
  const baseline = { stateEpoch: state.league?._stateEpoch, activeLeagueId: state.league?.activeLeagueId, franchiseGenerationId: state.league?.franchiseGenerationId };
  if (!shouldAcceptSimulationScope(message.payload, baseline)) return state;
  let next = state;
  handleWorkerMessage(message, action => { next = workerReducer(next, action); });
  return next;
}

describe('save-scoped simulation events', () => {
  it('rejects the reproduced same-slot WEEK_COMPLETE race', () => {
    const oldScope = captureSimulationScope({ stateEpoch: 10, activeLeagueId: 'save_slot_1', franchiseGenerationId: 'gen_A', seasonId: 'old', week: 8 });
    let state = { ...INITIAL_WORKER_STATE, league: league('save_slot_1', 10, { franchiseGenerationId: 'gen_A', week: 8 }), lastResults: [{ awayAbbr: 'HOU' }], lastSimWeek: 8 };
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
    const stale = scoped(toUI.WEEK_COMPLETE, captureSimulationScope({ stateEpoch: 3, activeLeagueId: 'save_slot_1', franchiseGenerationId: 'gen_A' }), { week: 8, nextWeek: 9, results: ['old'] });
    expect(applyIfCurrent(state, stale)).toBe(state);
    const current = scoped(toUI.WEEK_COMPLETE, captureSimulationScope({ stateEpoch: 4, activeLeagueId: 'save_slot_2', franchiseGenerationId: 'gen_B' }), { week: 1, nextWeek: 2, phase: 'regular', results: ['CLE'], standings: [{ id: 10, wins: 1 }] });
    expect(applyIfCurrent(state, current)).toMatchObject({ lastResults: ['CLE'], lastSimWeek: 1, league: { week: 2, teams: [{ id: 10, wins: 1 }] } });
  });

  it.each([
    [toUI.PLAY_LOGS, { logs: ['old'] }, 'userGameLogs', null],
    [toUI.GAME_EVENT, { gameId: 'old' }, 'gameEvents', []],
    [toUI.PROMPT_USER_GAME, {}, 'promptUserGame', false],
    [toUI.SIM_PROGRESS, { done: 9, total: 10 }, 'simProgress', 0],
  ])('rejects delayed %s', (type, payload, field, expected) => {
    const state = { ...INITIAL_WORKER_STATE, league: league('save_slot_1', 11) };
    const old = scoped(type, captureSimulationScope({ stateEpoch: 10, activeLeagueId: 'save_slot_1', franchiseGenerationId: 'gen_A' }), payload);
    expect(applyIfCurrent(state, old)[field]).toEqual(expected);
  });

  it('requires exact epoch and scope after hydration but permits pre-baseline compatibility', () => {
    expect(shouldAcceptSimulationScope({}, { stateEpoch: 11, activeLeagueId: 'save_slot_1' })).toBe(false);
    expect(shouldAcceptSimulationScope(withSimulationScope({}, { stateEpoch: 12, activeLeagueId: 'save_slot_1', franchiseGenerationId: 'gen_B' }), { stateEpoch: 11, activeLeagueId: 'save_slot_1', franchiseGenerationId: 'gen_B' })).toBe(false);
    expect(shouldAcceptSimulationScope({}, { stateEpoch: 0 })).toBe(true);
  });

  it('captures operation scope immutably at start', () => {
    const scope = captureSimulationScope({ stateEpoch: 20, activeLeagueId: 'save_slot_1', franchiseGenerationId: 'gen_A', week: 8 });
    const currentWorkerEpoch = 21;
    expect(withSimulationScope({}, scope)._simulationScope.stateEpoch).toBe(20);
    expect(currentWorkerEpoch).toBe(21);
    expect(Object.isFrozen(scope)).toBe(true);
  });

  it('preserves current results across a routine same-franchise FULL_STATE', () => {
    const currentResult = [{ id: 'current-game' }];
    const currentEvents = [{ id: 'current-event' }];
    const state = { ...INITIAL_WORKER_STATE, league: league('save_slot_1', 10), lastResults: currentResult, lastSimWeek: 8, gameEvents: currentEvents };
    const refreshed = workerReducer(state, { type: 'FULL_STATE', payload: league('save_slot_1', 11) });
    expect(refreshed.lastResults).toBe(currentResult);
    expect(refreshed.lastSimWeek).toBe(8);
    expect(refreshed.gameEvents).toBe(currentEvents);
  });

  it('preserves WEEK_COMPLETE results through REQUEST_FULL_STATE or sim-final snapshots', () => {
    let state = { ...INITIAL_WORKER_STATE, league: league('save_slot_1', 10) };
    state = applyIfCurrent(state, scoped(toUI.WEEK_COMPLETE, captureSimulationScope({
      stateEpoch: 10,
      activeLeagueId: 'save_slot_1',
      franchiseGenerationId: 'gen_B',
    }), { week: 1, nextWeek: 2, phase: 'regular', results: [{ id: 'pit-cle' }] }));
    const refreshed = workerReducer(state, { type: 'FULL_STATE', payload: league('save_slot_1', 11, { week: 2 }) });
    expect(refreshed.lastResults).toEqual([{ id: 'pit-cle' }]);
    expect(refreshed.lastSimWeek).toBe(1);
  });

  it('clears every save-scoped transient for a same-slot new franchise', () => {
    const state = {
      ...INITIAL_WORKER_STATE, league: league('save_slot_1', 10, { franchiseGenerationId: 'gen_A' }),
      lastResults: ['old'], lastSimWeek: 8, gameEvents: ['old'], promptUserGame: true,
      userGameLogs: ['old'], userGameLiveStats: {}, userGamePlayerStats: {}, userGameTeamStats: {},
      userGameCanonicalEvents: [], userGameScoringSummary: [], userGameQuarterScores: {}, userGameReasoningFlags: [],
      simProgress: 75, batchSim: { status: 'running' }, draftTradeProposal: {},
    };
    const replaced = workerReducer(state, { type: 'FULL_STATE', payload: league('save_slot_1', 11) });
    expect(replaced).toMatchObject({ lastResults: null, lastSimWeek: null, gameEvents: [], promptUserGame: false, userGameLogs: null, simProgress: 0, batchSim: null, draftTradeProposal: null });
    expect(replaced.userGameLiveStats).toBeNull();
    expect(replaced.userGamePlayerStats).toBeNull();
    expect(replaced.userGameTeamStats).toBeNull();
  });

  it('clears transients on a cross-slot FULL_STATE regardless of generation', () => {
    const state = { ...INITIAL_WORKER_STATE, league: league('save_slot_1', 10), lastResults: ['old'] };
    expect(workerReducer(state, { type: 'FULL_STATE', payload: league('save_slot_2', 11) }).lastResults).toBeNull();
  });

  it('separately rejects stale generation and stale epoch, then accepts an exact match', () => {
    const baseline = { stateEpoch: 11, activeLeagueId: 'save_slot_1', franchiseGenerationId: 'gen_B' };
    const payload = (stateEpoch, franchiseGenerationId) => withSimulationScope({}, { stateEpoch, activeLeagueId: 'save_slot_1', franchiseGenerationId });
    expect(shouldAcceptSimulationScope(payload(11, 'gen_A'), baseline)).toBe(false);
    expect(shouldAcceptSimulationScope(payload(10, 'gen_B'), baseline)).toBe(false);
    expect(shouldAcceptSimulationScope(payload(11, 'gen_B'), baseline)).toBe(true);
  });

  it('backfills a legacy generation once and reuses it on reload', () => {
    const migrated = ensureFranchiseGenerationId({}, () => 'gen_legacy');
    expect(migrated).toMatchObject({ franchiseGenerationId: 'gen_legacy', created: true });
    expect(ensureFranchiseGenerationId(migrated.meta, () => 'wrong')).toMatchObject({ franchiseGenerationId: 'gen_legacy', created: false });
  });

  it('mints distinct identities for two same-slot franchise creations', () => {
    expect(createFranchiseGenerationId()).not.toBe(createFranchiseGenerationId());
  });

  it('synchronizes NEW_LEAGUE -> SAVE_SLOT scope so current Week 1 events are accepted', () => {
    let baseline = { stateEpoch: 10, activeLeagueId: 'temporary_id', franchiseGenerationId: 'gen_A' };
    baseline = syncAcceptedSimulationScope(baseline, {
      _stateEpoch: 10,
      activeLeagueId: 'save_slot_1',
      // A delta may omit the unchanged generation.
    });
    expect(baseline).toEqual({ stateEpoch: 10, activeLeagueId: 'save_slot_1', franchiseGenerationId: 'gen_A' });
    const scope = captureSimulationScope(baseline);
    expect(shouldAcceptSimulationScope(withSimulationScope({ done: 1, total: 1 }, scope), baseline)).toBe(true);

    let state = { ...INITIAL_WORKER_STATE, league: league('save_slot_1', 10, { franchiseGenerationId: 'gen_A' }), simulating: true };
    state = applyIfCurrent(state, scoped(toUI.WEEK_COMPLETE, scope, {
      week: 1, nextWeek: 2, phase: 'regular', results: [{ id: 'week-1' }],
    }));
    expect(state).toMatchObject({ lastResults: [{ id: 'week-1' }], lastSimWeek: 1, simulating: false, league: { week: 2 } });
  });

  it('preserves generation for bootstrap/quick saves and skips same-slot database copying', () => {
    const snapshot = { meta: [{ id: 'league', franchiseGenerationId: 'gen_A' }] };
    expect(prepareCopiedLeagueSnapshot(snapshot, 'preserve')).toBe(snapshot);
    expect(shouldCopyLeagueForSave('temporary_id', 'save_slot_1')).toBe(true);
    expect(shouldCopyLeagueForSave('save_slot_1', 'save_slot_1')).toBe(false);
  });

  it('mints generation only for duplicate-style copies', () => {
    const snapshot = { meta: [{ id: 'league', franchiseGenerationId: 'gen_A' }] };
    const duplicate = prepareCopiedLeagueSnapshot(snapshot, 'mint', () => 'gen_B');
    expect(duplicate.meta[0].franchiseGenerationId).toBe('gen_B');
    expect(snapshot.meta[0].franchiseGenerationId).toBe('gen_A');
  });
});
