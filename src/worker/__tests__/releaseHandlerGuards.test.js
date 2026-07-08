/**
 * releaseHandlerGuards.test.js — regression guards for the release / bulk
 * release worker handlers and the view-state hidden-field sanitizer.
 *
 * worker.js is a monolith whose handlers are not exported, so these follow the
 * repo's source-sentinel pattern (see loadPipelineRegression.test.js): read the
 * source and assert the load-bearing lines exist in the required order.
 *
 * Bugs these lock down:
 *  1. handleReleasePlayer ignored the releasePlayerWithValidation outcome — a
 *     failed release (stale roster view, wrong team, double release) posted a
 *     normal STATE_UPDATE and looked like a success to the UI.
 *  2. handleBulkReleasePlayers posted STATE_UPDATE with the request id BEFORE
 *     the SUCCESS message. The useWorker pending-promise map resolves on the
 *     FIRST message carrying the id, so callers resolved with the view-state
 *     payload (no `ok`), and Roster.jsx reported every successful bulk release
 *     as a failure.
 *  3. `toUI.SUCCESS` was posted by worker.js without being defined in
 *     protocol.js, so those messages went out with `type: undefined`.
 *  4. buildViewState serialized raw cache players (including the internal-only
 *     hiddenTrueOvr draft-variance anchor) into league.teams[].roster.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { toUI } from '../protocol.js';

const workerSource = readFileSync(resolve(process.cwd(), 'src/worker/worker.js'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  expect(start, `${name} must exist in worker.js`).toBeGreaterThan(-1);
  // Slice to the next top-level function declaration — good enough for sentinels.
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n(async )?function \w+\(/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe('protocol contract', () => {
  it('defines toUI.SUCCESS so bulk mutation results are not posted with type undefined', () => {
    expect(toUI.SUCCESS).toBe('SUCCESS');
  });

  it('worker.js never posts an undefined toUI member', () => {
    const used = [...workerSource.matchAll(/toUI\.(\w+)/g)].map((m) => m[1]);
    const undefinedMembers = [...new Set(used)].filter((name) => toUI[name] === undefined);
    expect(undefinedMembers).toEqual([]);
  });
});

describe('handleReleasePlayer outcome guard', () => {
  const fn = extractFunction(workerSource, 'handleReleasePlayer');

  it('checks the releasePlayerWithValidation outcome instead of discarding it', () => {
    expect(fn.includes('const outcome = await releasePlayerWithValidation')).toBe(true);
    expect(fn.includes('if (!outcome.ok)')).toBe(true);
  });

  it('posts an ERROR (and no STATE_UPDATE success signal) when validation fails', () => {
    const failBranch = fn.slice(fn.indexOf('if (!outcome.ok)'), fn.indexOf('recalcSchemeFitForTeams'));
    expect(failBranch.includes('post(toUI.ERROR')).toBe(true);
    expect(failBranch.includes('STATE_UPDATE')).toBe(false);
    expect(failBranch.includes('return;')).toBe(true);
  });
});

describe('handleBulkReleasePlayers message ordering', () => {
  const fn = extractFunction(workerSource, 'handleBulkReleasePlayers');

  it('posts SUCCESS with the request id BEFORE the follow-up STATE_UPDATE', () => {
    const successIdx = fn.indexOf("post(toUI.SUCCESS, { ok: true, released }, id)");
    const stateUpdateIdx = fn.lastIndexOf('post(toUI.STATE_UPDATE');
    expect(successIdx).toBeGreaterThan(-1);
    expect(stateUpdateIdx).toBeGreaterThan(successIdx);
  });

  it('does not attach the request id to the refresh STATE_UPDATE posts', () => {
    const statePosts = [...fn.matchAll(/post\(toUI\.STATE_UPDATE[^;]+;/g)].map((m) => m[0]);
    expect(statePosts.length).toBeGreaterThan(0);
    for (const call of statePosts) {
      expect(call.includes(', id)')).toBe(false);
    }
  });

  it('rejects the caller with the released-count context on a partial stop', () => {
    expect(fn.includes('Bulk release stopped after ${released.length} release(s)')).toBe(true);
  });
});

describe('buildViewState hidden-field sanitizer', () => {
  it('routes every team roster through sanitizeRosterForClient', () => {
    expect(workerSource.includes('sanitizeRosterForClient(attachSeasonStatsToRoster(')).toBe(true);
  });

  it('imports the sanitizer from viewStateStats', () => {
    expect(workerSource.includes("import { attachSeasonStatsToRoster, sanitizeRosterForClient } from './viewStateStats.js'")).toBe(true);
  });
});
