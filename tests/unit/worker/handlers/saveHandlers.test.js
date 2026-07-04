/**
 * SAVE_NOW handler — extracted behavior parity.
 *
 * The monolith handler: (1) re-opens the DB when a league is active (iOS
 * connection liveness), (2) flushes dirty state, (3) posts SAVED echoing the
 * requestId — or posts ERROR with the `Save failed: …` prefix and the same
 * requestId when anything rejects.
 */
import { describe, expect, it, vi } from 'vitest';
import { toUI } from '../../../../src/worker/protocol.js';
import { handleSaveNow } from '../../../../src/worker/handlers/saveHandlers.js';
import { makeFakeCache, makeCtx } from './testContext.js';

describe('handleSaveNow', () => {
  it('re-opens the DB, flushes, and posts SAVED with the requestId', async () => {
    const ctx = makeCtx(makeFakeCache());
    await handleSaveNow({}, 'msg_save_1', ctx);

    expect(ctx.openDB).toHaveBeenCalledTimes(1);
    expect(ctx.flushDirty).toHaveBeenCalledTimes(1);
    expect(ctx.posts).toEqual([{ type: toUI.SAVED, payload: {}, id: 'msg_save_1' }]);
  });

  it('skips the DB liveness check when no league is active', async () => {
    const ctx = makeCtx(makeFakeCache(), { getActiveLeagueId: () => null });
    await handleSaveNow({}, 'msg_save_2', ctx);

    expect(ctx.openDB).not.toHaveBeenCalled();
    expect(ctx.flushDirty).toHaveBeenCalledTimes(1);
    expect(ctx.posts).toEqual([{ type: toUI.SAVED, payload: {}, id: 'msg_save_2' }]);
  });

  it('posts ERROR with the original requestId when the flush rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = makeCtx(makeFakeCache(), {
      flushDirty: vi.fn(async () => { throw new Error('disk unhappy'); }),
    });
    await handleSaveNow({}, 'msg_save_3', ctx);

    expect(ctx.posts).toEqual([
      { type: toUI.ERROR, payload: { message: 'Save failed: disk unhappy' }, id: 'msg_save_3' },
    ]);
    consoleError.mockRestore();
  });

  it('posts ERROR when re-opening the DB rejects (connection killed)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = makeCtx(makeFakeCache(), {
      openDB: vi.fn(async () => { throw new Error('connection is closing'); }),
    });
    await handleSaveNow({}, 'msg_save_4', ctx);

    expect(ctx.flushDirty).not.toHaveBeenCalled();
    expect(ctx.posts).toEqual([
      { type: toUI.ERROR, payload: { message: 'Save failed: connection is closing' }, id: 'msg_save_4' },
    ]);
    consoleError.mockRestore();
  });
});
