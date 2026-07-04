/**
 * saveHandlers.js — SAVE_NOW.
 *
 * Extracted from worker.js (Worker Handler Registry V1); behavior unchanged.
 * Dirty-flush accumulator internals stay in the worker — this handler only
 * asks the context to flush and reports the outcome.
 */
import { toUI } from '../protocol.js';

// ── Handler: SAVE_NOW ─────────────────────────────────────────────────────────

export async function handleSaveNow(payload, id, ctx) {
  // Verify the DB connection is still alive before attempting a flush.
  // On iOS/Safari, the connection can be silently killed after backgrounding.
  // openDB() re-opens if needed; if it rejects, the catch below surfaces the error.
  try {
    if (ctx.getActiveLeagueId()) await ctx.openDB();
    await ctx.flushDirty();
    ctx.post(toUI.SAVED, {}, id);
  } catch (err) {
    console.error('[Worker] SAVE_NOW failed:', err.message);
    ctx.post(toUI.ERROR, { message: `Save failed: ${err.message}` }, id);
  }
}
