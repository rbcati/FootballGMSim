/**
 * Invariant registry.
 *
 * Each module exports { id, check(ctx) -> Result[] }. The runner iterates this
 * list; adding a new invariant category is a one-line registration here plus a
 * new module — no orchestrator edits (see docs "How to add a new invariant").
 *
 * `saveReload` is registered but only produces results when the driver has
 * populated ctx.saveReload; otherwise it self-skips.
 */
import * as roster from './roster.js';
import * as cap from './cap.js';
import * as draft from './draft.js';
import * as freeAgency from './freeAgency.js';
import * as schedule from './schedule.js';
import * as progression from './progression.js';
import * as retirement from './retirement.js';
import * as history from './history.js';
import * as references from './references.js';
import * as numericSafety from './numericSafety.js';
import * as saveReload from './saveReload.js';

export const INVARIANT_MODULES = [
  roster,
  cap,
  schedule,
  progression,
  retirement,
  draft,
  freeAgency,
  history,
  references,
  numericSafety,
  saveReload,
];

/**
 * Run every registered invariant against a context.
 * @param {object} ctx
 * @returns {object[]} flat list of structured invariant results
 */
export function runInvariants(ctx) {
  const results = [];
  for (const mod of INVARIANT_MODULES) {
    let modResults;
    try {
      modResults = mod.check(ctx) || [];
    } catch (err) {
      modResults = [{
        id: `${mod.id}.checker-threw`,
        status: 'fail',
        season: ctx?.season ?? null,
        phase: ctx?.phase ?? null,
        week: ctx?.week ?? null,
        entityType: 'harness',
        entityId: mod.id,
        message: `Invariant module "${mod.id}" threw: ${err?.message ?? err}`,
        details: { stack: String(err?.stack ?? '').split('\n').slice(0, 4).join('\n') },
      }];
    }
    // Enforce: skips must carry a reason.
    for (const r of modResults) {
      if (r.status === 'skip' && (!r.message || !String(r.message).trim())) {
        r.status = 'fail';
        r.message = `Reasonless skip from ${r.id} (harness bug: skips must document a reason)`;
      }
    }
    results.push(...modResults);
  }
  return results;
}

export { roster, cap, draft, freeAgency, schedule, progression, retirement, history, references, numericSafety, saveReload };
