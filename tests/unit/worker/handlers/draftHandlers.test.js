/**
 * GET_DRAFT_STATE handler — extracted behavior parity.
 *
 * Pins the lazy draft initialization (startDraft only when phase is 'draft'
 * with no draftState yet), the DRAFT_STATE reply with requestId echo, and the
 * handler-local error path (this handler catches its own errors and posts the
 * specific "Draft state unavailable" message instead of the generic one).
 */
import { describe, expect, it, vi } from 'vitest';
import { toUI } from '../../../../src/worker/protocol.js';
import { handleGetDraftState } from '../../../../src/worker/handlers/draftHandlers.js';
import { makeFakeCache, makeCtx, makeFaMeta } from './testContext.js';

describe('handleGetDraftState', () => {
  it('posts DRAFT_STATE from ctx.buildDraftStateView with the requestId echoed', async () => {
    const cache = makeFakeCache({ meta: makeFaMeta({ phase: 'regular' }) });
    const ctx = makeCtx(cache);
    await handleGetDraftState({}, 'msg_draft_1', ctx);

    expect(ctx.startDraft).not.toHaveBeenCalled();
    expect(ctx.posts).toEqual([
      { type: toUI.DRAFT_STATE, payload: { draftState: 'stub' }, id: 'msg_draft_1' },
    ]);
  });

  it('lazily starts the draft when phase is draft and no draftState exists', async () => {
    const cache = makeFakeCache({ meta: makeFaMeta({ phase: 'draft', draftState: undefined }) });
    const ctx = makeCtx(cache);
    await handleGetDraftState({}, 'msg_draft_2', ctx);

    expect(ctx.startDraft).toHaveBeenCalledTimes(1);
    expect(ctx.startDraft).toHaveBeenCalledWith({}, null);
    expect(ctx.posts.at(-1).type).toBe(toUI.DRAFT_STATE);
  });

  it('does not re-start the draft when draftState already exists', async () => {
    const cache = makeFakeCache({ meta: makeFaMeta({ phase: 'draft', draftState: { round: 2 } }) });
    const ctx = makeCtx(cache);
    await handleGetDraftState({}, 'msg_draft_3', ctx);

    expect(ctx.startDraft).not.toHaveBeenCalled();
  });

  it('posts the specific draft-unavailable ERROR when the view build throws', async () => {
    const cache = makeFakeCache({ meta: makeFaMeta({ phase: 'regular' }) });
    const ctx = makeCtx(cache, {
      buildDraftStateView: vi.fn(() => { throw new Error('view exploded'); }),
    });
    await handleGetDraftState({}, 'msg_draft_4', ctx);

    expect(ctx.posts).toEqual([
      {
        type: toUI.ERROR,
        payload: { message: 'Draft state unavailable. Retry or cancel sim. (view exploded)' },
        id: 'msg_draft_4',
      },
    ]);
  });
});
