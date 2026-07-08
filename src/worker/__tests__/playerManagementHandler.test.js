/**
 * playerManagementHandler.test.js — regression guards for
 * handleUpdatePlayerManagement (toWorker.UPDATE_PLAYER_MANAGEMENT).
 *
 * worker.js is a monolith whose handlers are not exported, so these follow the
 * repo's source-sentinel pattern (see releaseHandlerGuards.test.js): read the
 * source and assert the load-bearing lines exist.
 *
 * Contract locked down (Let Walk durable intent V1):
 *  1. extensionDecision = 'let_walk' is a valid value and is persisted onto
 *     the player patch — the Roster Decision Board pre-populates from the
 *     persisted field on mount, so losing this line silently breaks intent
 *     durability across navigation.
 *  2. An explicit `extensionDecision: null` clears the persisted intent (the
 *     board's reviewed clear-intent flow). Only a literal null clears; an
 *     absent/undefined field must never touch the stored decision, which the
 *     string-typeof guard on the set-path already enforces.
 *  3. The patch persists through cache.updatePlayer + flushDirty and the
 *     handler replies with a STATE_UPDATE carrying the request id, so the
 *     client roster reflects the new value on the next view state.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workerSource = readFileSync(resolve(process.cwd(), 'src/worker/worker.js'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  expect(start, `${name} must exist in worker.js`).toBeGreaterThan(-1);
  // Slice to the next top-level function declaration — good enough for sentinels.
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n(async )?function \w+\(/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe('handleUpdatePlayerManagement extensionDecision persistence', () => {
  const fn = extractFunction(workerSource, 'handleUpdatePlayerManagement');

  it("accepts 'let_walk' as a valid extensionDecision value", () => {
    const validSet = fn.match(/validExtensionDecisions = new Set\(\[([^\]]*)\]\)/);
    expect(validSet, 'validExtensionDecisions allowlist must exist').toBeTruthy();
    expect(validSet[1]).toContain("'let_walk'");
  });

  it('persists a validated string extensionDecision onto the player patch', () => {
    expect(fn.includes(
      "if (typeof updates.extensionDecision === 'string' && validExtensionDecisions.has(updates.extensionDecision))",
    )).toBe(true);
    expect(fn.includes('patch.extensionDecision = updates.extensionDecision')).toBe(true);
  });

  it('clears the persisted intent ONLY for an explicit null, not for undefined', () => {
    // The clear branch must be the else-if of the string set-path, so an
    // absent field falls through both branches and never touches the value.
    const clearBranch = fn.match(/} else if \(updates\.extensionDecision === null\) \{[\s\S]*?patch\.extensionDecision = null;/);
    expect(clearBranch, 'explicit-null clear branch must exist').toBeTruthy();
    expect(fn.includes('updates.extensionDecision === undefined')).toBe(false);
  });

  it('writes the patch through cache.updatePlayer and flushes before replying', () => {
    const updateIdx = fn.indexOf('cache.updatePlayer(player.id, patch)');
    const flushIdx = fn.indexOf('await flushDirty()');
    const replyIdx = fn.indexOf('post(toUI.STATE_UPDATE, buildViewState(), id)');
    expect(updateIdx).toBeGreaterThan(-1);
    expect(flushIdx).toBeGreaterThan(updateIdx);
    expect(replyIdx).toBeGreaterThan(flushIdx);
  });

  it('rejects a payload with no valid updates instead of writing an empty patch', () => {
    const emptyGuardIdx = fn.indexOf('if (Object.keys(patch).length === 0)');
    const updateIdx = fn.indexOf('cache.updatePlayer(player.id, patch)');
    expect(emptyGuardIdx).toBeGreaterThan(-1);
    expect(emptyGuardIdx).toBeLessThan(updateIdx);
    const guardBody = fn.slice(emptyGuardIdx, updateIdx);
    expect(guardBody.includes('post(toUI.ERROR')).toBe(true);
    expect(guardBody.includes('return;')).toBe(true);
  });
});
