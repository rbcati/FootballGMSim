/**
 * SimulationError surface-and-rethrow contract.
 *
 * Covers:
 *  1. SimulationError class structure — name, message, details
 *  2. assertGameProducedScoring helper — throws on null / 0-0 scores
 *  3. simulateBatch integration — never silently returns 0-0
 *  4. Worker reducer: real workerReducer handles ERROR correctly
 */

import { describe, it, expect } from 'vitest';
import { SimulationError, assertGameProducedScoring, simulateBatch } from '../../src/core/game-simulator.js';
import { workerReducer, INITIAL_WORKER_STATE } from '../../src/ui/hooks/useWorker.js';
import { toUI } from '../../src/worker/protocol.js';

// ── 1. SimulationError class ──────────────────────────────────────────────────

describe('SimulationError', () => {
  it('has name SimulationError', () => {
    const err = new SimulationError('boom');
    expect(err.name).toBe('SimulationError');
  });

  it('carries the message passed to the constructor', () => {
    const err = new SimulationError('No scoring after retries');
    expect(err.message).toContain('No scoring after retries');
  });

  it('carries structured details', () => {
    const details = { week: 1, home: { abbr: 'KC', rosterSize: 0, avgOvr: 0 }, away: { abbr: 'BUF', rosterSize: 0, avgOvr: 0 } };
    const err = new SimulationError('msg', details);
    expect(err.details).toBe(details);
    expect(err.details.home.abbr).toBe('KC');
    expect(err.details.away.abbr).toBe('BUF');
  });

  it('is an instance of Error', () => {
    expect(new SimulationError('x')).toBeInstanceOf(Error);
  });

  it('defaults to an empty details object when not provided', () => {
    const err = new SimulationError('plain');
    expect(err.details).toBeDefined();
    expect(typeof err.details).toBe('object');
  });
});

// ── 2. assertGameProducedScoring — direct tests against the exported helper ───

describe('assertGameProducedScoring', () => {
  it('throws SimulationError when gameScores is null', () => {
    expect(() =>
      assertGameProducedScoring(null, { home: { abbr: 'HOM' }, away: { abbr: 'AWY' }, week: 1 }),
    ).toThrow(SimulationError);
  });

  it('throws SimulationError when homeScore and awayScore are both 0', () => {
    expect(() =>
      assertGameProducedScoring(
        { homeScore: 0, awayScore: 0 },
        { home: { abbr: 'HOM' }, away: { abbr: 'AWY' }, week: 1 },
      ),
    ).toThrow(SimulationError);
  });

  it('error message contains team abbreviations and week', () => {
    let caught;
    try {
      assertGameProducedScoring(
        { homeScore: 0, awayScore: 0 },
        { home: { abbr: 'AAA' }, away: { abbr: 'BBB' }, week: 5 },
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SimulationError);
    expect(caught.message).toContain('AAA');
    expect(caught.message).toContain('BBB');
    expect(caught.message).toContain('5');
  });

  it('error details carry structured team snapshot', () => {
    let caught;
    try {
      assertGameProducedScoring(
        { homeScore: 0, awayScore: 0 },
        { home: { abbr: 'HOM', rosterSize: 0, avgOvr: 0 }, away: { abbr: 'AWY', rosterSize: 0, avgOvr: 0 }, week: 1 },
      );
    } catch (err) {
      caught = err;
    }
    expect(caught.details.home.abbr).toBe('HOM');
    expect(caught.details.away.abbr).toBe('AWY');
    expect(typeof caught.details.home.rosterSize).toBe('number');
  });

  it('does not throw when homeScore > 0', () => {
    expect(() => assertGameProducedScoring({ homeScore: 21, awayScore: 14 }, {})).not.toThrow();
  });

  it('does not throw when only awayScore > 0', () => {
    expect(() => assertGameProducedScoring({ homeScore: 0, awayScore: 7 }, {})).not.toThrow();
  });
});

// ── 3. simulateBatch integration — real production code, no mocks ─────────────

describe('simulateBatch — integration (no mocks)', () => {
  it('never silently returns homeScore: 0, awayScore: 0', () => {
    const home = { id: 'h1', abbr: 'HOM', roster: [] };
    const away = { id: 'a1', abbr: 'AWY', roster: [] };
    const leagueFixture = { id: 'test-league', week: 1, teams: [home, away] };

    let result;
    try {
      result = simulateBatch([{ home, away }], { league: leagueFixture });
    } catch (err) {
      // SimulationError is the only acceptable non-return path
      expect(err).toBeInstanceOf(SimulationError);
      return;
    }

    // If it returned, the score must not be fabricated 0-0
    expect(Array.isArray(result)).toBe(true);
    const game = result[0];
    expect(game.homeScore === 0 && game.awayScore === 0).toBe(false);
  });
});

// ── 4. Worker reducer: real workerReducer handles ERROR correctly ──────────────

describe('Worker reducer: toUI.ERROR clears busy state', () => {
  it('ERROR action sets busy to false', () => {
    const next = workerReducer(
      { ...INITIAL_WORKER_STATE, busy: true },
      { type: toUI.ERROR, message: 'Game produced no scoring for HOM vs AWY in week 1.' },
    );
    expect(next.busy).toBe(false);
  });

  it('ERROR action sets simulating to false', () => {
    const next = workerReducer(
      { ...INITIAL_WORKER_STATE, simulating: true },
      { type: toUI.ERROR, message: 'sim error' },
    );
    expect(next.simulating).toBe(false);
  });

  it('ERROR action sets error to the message string', () => {
    const msg = 'Game produced no scoring for HOM vs AWY in week 1.';
    const next = workerReducer(INITIAL_WORKER_STATE, { type: toUI.ERROR, message: msg });
    expect(next.error).toBe(msg);
  });

  it('ERROR action with messageType updates lastWorkerMessageType', () => {
    const next = workerReducer(INITIAL_WORKER_STATE, {
      type: toUI.ERROR,
      message: 'error',
      messageType: 'ADVANCE_WEEK',
    });
    expect(next.lastWorkerMessageType).toBe('ADVANCE_WEEK');
  });

  it('FULL_STATE after ERROR clears busy and simulating (app not stuck)', () => {
    const afterError = workerReducer(
      { ...INITIAL_WORKER_STATE, busy: true, simulating: true },
      { type: toUI.ERROR, message: 'sim error' },
    );
    expect(afterError.busy).toBe(false);
    expect(afterError.simulating).toBe(false);

    const recovered = workerReducer(afterError, {
      type: toUI.FULL_STATE,
      payload: { week: 2, teams: [] },
    });
    expect(recovered.busy).toBe(false);
    expect(recovered.simulating).toBe(false);
  });

  it('STATE_UPDATE after ERROR clears busy (app not stuck)', () => {
    const afterError = workerReducer(
      { ...INITIAL_WORKER_STATE, busy: true, simulating: true },
      { type: toUI.ERROR, message: 'sim error' },
    );
    const recovered = workerReducer(afterError, {
      type: toUI.STATE_UPDATE,
      payload: { week: 2 },
    });
    expect(recovered.busy).toBe(false);
  });
});
