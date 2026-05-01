import { describe, it, expect } from 'vitest';
import { INITIAL_WORKER_STATE, workerReducer } from './useWorker.js';

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
});
