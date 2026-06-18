/**
 * waiverEngine.integration.test.js — Structural integration tests for waiver wire wiring in worker.js
 *
 * Uses readFileSync pattern to validate structural correctness of worker.js changes.
 * No actual worker execution needed.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workerSource = readFileSync(resolve(process.cwd(), 'src/worker/worker.js'), 'utf8');
const protocolSource = readFileSync(resolve(process.cwd(), 'src/worker/protocol.js'), 'utf8');

describe('Waiver Wire — protocol.js integration', () => {
  it('exports SUBMIT_WAIVER_CLAIM in toWorker', () => {
    expect(protocolSource.includes("SUBMIT_WAIVER_CLAIM:          'SUBMIT_WAIVER_CLAIM'")).toBe(true);
  });

  it('exports CANCEL_WAIVER_CLAIM in toWorker', () => {
    expect(protocolSource.includes("CANCEL_WAIVER_CLAIM:          'CANCEL_WAIVER_CLAIM'")).toBe(true);
  });

  it('exports WAIVER_DATA in toUI', () => {
    expect(protocolSource.includes("WAIVER_DATA:        'WAIVER_DATA'")).toBe(true);
  });
});

describe('Waiver Wire — worker.js imports', () => {
  it('imports isWaiverWindowOpen from waiverEngine', () => {
    expect(workerSource.includes('isWaiverWindowOpen')).toBe(true);
  });

  it('imports buildWaiverPriorityList from waiverEngine', () => {
    expect(workerSource.includes('buildWaiverPriorityList')).toBe(true);
  });

  it('imports sendPlayerToWaivers from waiverEngine', () => {
    expect(workerSource.includes('sendPlayerToWaivers')).toBe(true);
  });

  it('imports canTeamClaimWaiverPlayer from waiverEngine', () => {
    expect(workerSource.includes('canTeamClaimWaiverPlayer')).toBe(true);
  });

  it('imports submitWaiverClaim from waiverEngine', () => {
    expect(workerSource.includes('submitWaiverClaim')).toBe(true);
  });

  it('imports processWaivers from waiverEngine', () => {
    expect(workerSource.includes('processWaivers')).toBe(true);
  });

  it('imports generateAIWaiverClaims from waiverEngine', () => {
    expect(workerSource.includes('generateAIWaiverClaims')).toBe(true);
  });
});

describe('Waiver Wire — worker.js handler functions', () => {
  it('defines handleSubmitWaiverClaim function', () => {
    expect(workerSource.includes('async function handleSubmitWaiverClaim')).toBe(true);
  });

  it('defines handleCancelWaiverClaim function', () => {
    expect(workerSource.includes('async function handleCancelWaiverClaim')).toBe(true);
  });

  it('dispatches SUBMIT_WAIVER_CLAIM in switch statement', () => {
    expect(workerSource.includes('case toWorker.SUBMIT_WAIVER_CLAIM: return await handleSubmitWaiverClaim')).toBe(true);
  });

  it('dispatches CANCEL_WAIVER_CLAIM in switch statement', () => {
    expect(workerSource.includes('case toWorker.CANCEL_WAIVER_CLAIM: return await handleCancelWaiverClaim')).toBe(true);
  });
});

describe('Waiver Wire — buildViewState includes waiver fields', () => {
  it('includes waiverWindowOpen in buildViewState return', () => {
    expect(workerSource.includes('waiverWindowOpen: isWaiverWindowOpen')).toBe(true);
  });

  it('includes waiverPriorityPosition in buildViewState return', () => {
    expect(workerSource.includes('waiverPriorityPosition:')).toBe(true);
  });

  it('includes waiverPlayers in buildViewState return', () => {
    expect(workerSource.includes('waiverPlayers: cache.getAllPlayers()')).toBe(true);
  });

  it('includes userWaiverClaims in buildViewState return', () => {
    expect(workerSource.includes('userWaiverClaims: (meta?.activeWaiverClaims ?? [])')).toBe(true);
  });
});

describe('Waiver Wire — releasePlayerWithValidation sends to waivers', () => {
  it('checks isWaiverWindowOpen in release path', () => {
    expect(workerSource.includes('if (isWaiverWindowOpen(meta.currentWeek ?? 0))')).toBe(true);
  });

  it('calls sendPlayerToWaivers on release during waiver window', () => {
    expect(workerSource.includes('const waiverPlayer = sendPlayerToWaivers')).toBe(true);
  });

  it('sets status to waiver for released players during waiver window', () => {
    expect(workerSource.includes("status: 'waiver'")).toBe(true);
  });
});

describe('Waiver Wire — handleAdvanceWeek processes waivers', () => {
  it('calls generateAIWaiverClaims in advance week', () => {
    expect(workerSource.includes('const claimsAfterAI = generateAIWaiverClaims')).toBe(true);
  });

  it('calls processWaivers in advance week', () => {
    expect(workerSource.includes('const waiverResult = processWaivers')).toBe(true);
  });

  it('calls buildWaiverPriorityList when priority list is empty', () => {
    expect(workerSource.includes('const priority = buildWaiverPriorityList')).toBe(true);
  });

  it('emits news for waiver awards', () => {
    expect(workerSource.includes('await NewsEngine.logWaiverAward')).toBe(true);
  });

  it('emits news for waiver clearances', () => {
    expect(workerSource.includes('await NewsEngine.logWaiverClear')).toBe(true);
  });

  it('checks outbid scenario and logs it', () => {
    expect(workerSource.includes('await NewsEngine.logWaiverOutbid')).toBe(true);
  });
});

describe('Waiver Wire — meta hydration on load', () => {
  it('hydrates waiverPriorityList on load-save', () => {
    expect(workerSource.includes('waiverPriorityList: meta?.waiverPriorityList ?? []')).toBe(true);
  });

  it('hydrates activeWaiverClaims on load-save', () => {
    expect(workerSource.includes('activeWaiverClaims: meta?.activeWaiverClaims ?? []')).toBe(true);
  });
});
