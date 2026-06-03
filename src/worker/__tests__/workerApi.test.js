import { describe, it, expect, vi } from 'vitest';
import {
  WorkerMessages,
  withRequestId,
  createRequestId,
  getRequestId,
  handleWorkerMessage,
  toUI,
} from '../workerApi.js';

describe('WorkerMessages contract', () => {
  it('exposes the canonical command constants', () => {
    expect(WorkerMessages.SIM_GAME).toBe('SIM_GAME');
    expect(WorkerMessages.SIM_SEASON).toBe('SIM_SEASON');
    expect(WorkerMessages.SIM_PLAYOFFS).toBe('SIM_PLAYOFFS');
    expect(WorkerMessages.ADVANCE_WEEK).toBe('ADVANCE_WEEK');
  });

  it('is frozen so the contract cannot be mutated at runtime', () => {
    expect(Object.isFrozen(WorkerMessages)).toBe(true);
  });
});

describe('requestId helpers', () => {
  it('attaches a fresh requestId when none is present', () => {
    const msg = withRequestId({ type: 'ADVANCE_WEEK', payload: {} });
    expect(msg.requestId).toBeTruthy();
    // id is kept in sync for the legacy correlation map.
    expect(msg.id).toBe(msg.requestId);
  });

  it('reuses an existing id as the requestId so responses can echo it', () => {
    const msg = withRequestId({ type: 'INIT', payload: {}, id: 'msg_7' });
    expect(msg.requestId).toBe('msg_7');
    expect(getRequestId(msg)).toBe('msg_7');
  });

  it('mints unique ids', () => {
    expect(createRequestId()).not.toBe(createRequestId());
  });
});

describe('handleWorkerMessage routing', () => {
  it('routes a WEEK_COMPLETE message to a reducer action', () => {
    const setState = vi.fn();
    const handled = handleWorkerMessage(
      { type: toUI.WEEK_COMPLETE, payload: { week: 4, results: [], nextWeek: 5, phase: 'regular', standings: [] } },
      setState,
    );
    expect(handled).toBe(true);
    expect(setState).toHaveBeenCalledWith(expect.objectContaining({ type: 'WEEK_COMPLETE', week: 4, nextWeek: 5 }));
  });

  it('returns false for stateful messages it intentionally leaves to the hook', () => {
    const setState = vi.fn();
    expect(handleWorkerMessage({ type: toUI.FULL_STATE, payload: {} }, setState)).toBe(false);
    expect(handleWorkerMessage({ type: toUI.STATE_UPDATE, payload: {} }, setState)).toBe(false);
    expect(handleWorkerMessage({ type: toUI.ERROR, payload: {} }, setState)).toBe(false);
    expect(setState).not.toHaveBeenCalled();
  });
});
