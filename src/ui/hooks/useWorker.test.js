import { describe, it, expect } from 'vitest';
import { INITIAL_WORKER_STATE, shouldAcceptBootScopedPayload, workerReducer } from './useWorker.js';

describe('workerReducer', () => {
  it('preserves league state on WORKER_READY while clearing busy', () => {
    const league = {
      activeLeagueId: 'save_slot_1',
      year: 2028,
      week: 3,
      phase: 'regular',
      userTeamId: 7,
      teams: [{ id: 7, abbr: 'BOS' }],
    };
    const state = {
      ...INITIAL_WORKER_STATE,
      busy: true,
      workerReady: false,
      league,
    };

    const next = workerReducer(state, { type: 'WORKER_READY', hasSave: true });

    expect(next.league).toBe(league);
    expect(next.workerReady).toBe(true);
    expect(next.hasSave).toBe(true);
    expect(next.busy).toBe(false);
  });

  it('rejects stale boot-scoped payloads after a boot id is invalidated', () => {
    expect(shouldAcceptBootScopedPayload({ bootRequestId: 'boot_1' }, null, ['boot_1'])).toBe(false);
    expect(shouldAcceptBootScopedPayload({ bootRequestId: 'boot_1' }, 'safe_boot_1', [])).toBe(false);
    expect(shouldAcceptBootScopedPayload({ bootRequestId: 'safe_boot_1' }, 'safe_boot_1', ['boot_1'])).toBe(true);
    expect(shouldAcceptBootScopedPayload({ phase: 'regular' }, null, ['boot_1'])).toBe(true);
  });
});

it('transports and clears watched-game canonical player and team stats together', () => {
  const playerStats = { home: { qb: { stats: { passYd: 250 } } }, away: {} };
  const teamStats = { home: { passYards: 250, firstDowns: 20 }, away: { passYards: 180, firstDowns: 15 } };
  const played = workerReducer(INITIAL_WORKER_STATE, { type: 'PLAY_LOGS', logs: [], playerStats, teamStats });
  expect(played.userGamePlayerStats).toBe(playerStats);
  expect(played.userGameTeamStats).toBe(teamStats);

  const cleared = workerReducer(played, { type: 'CLEAR_USER_GAME' });
  expect(cleared.userGamePlayerStats).toBeNull();
  expect(cleared.userGameTeamStats).toBeNull();

  const restarted = workerReducer(played, { type: 'SIM_START' });
  expect(restarted.userGamePlayerStats).toBeNull();
  expect(restarted.userGameTeamStats).toBeNull();
});
