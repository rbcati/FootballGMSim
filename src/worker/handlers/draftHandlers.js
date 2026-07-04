/**
 * draftHandlers.js — GET_DRAFT_STATE.
 *
 * Extracted from worker.js (Worker Handler Registry V1); behavior unchanged.
 * Draft execution (START_DRAFT, MAKE_DRAFT_PICK, sim picks, trades) stays in
 * worker.js — this handler only reads the draft view, lazily initializing the
 * draft through ctx.startDraft when the phase requires it.
 */
import { toUI } from '../protocol.js';
import { ensureDynastyMeta } from '../../core/dynasty-story.js';

// ── Handler: GET_DRAFT_STATE ──────────────────────────────────────────────────

export async function handleGetDraftState(payload, id, ctx) {
  try {
    const meta = ensureDynastyMeta(ctx.cache.getMeta());
    if (meta?.phase === 'draft' && !meta?.draftState) {
      await ctx.startDraft({}, null);
    }
    ctx.post(toUI.DRAFT_STATE, ctx.buildDraftStateView(), id);
  } catch (error) {
    ctx.post(toUI.ERROR, { message: `Draft state unavailable. Retry or cancel sim. (${error?.message ?? 'unknown error'})` }, id);
  }
}
