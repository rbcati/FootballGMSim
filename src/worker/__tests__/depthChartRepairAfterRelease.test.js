/**
 * depthChartRepairAfterRelease.test.js — regression guards for Depth Chart
 * Repair After Player Release V1.
 *
 * worker.js is a monolith whose handlers are not exported, so these follow the
 * repo's source-sentinel pattern (see releaseHandlerGuards.test.js): read the
 * source and assert the load-bearing lines exist, and in the required order.
 *
 * Confirmed-live bug this locks down: three AI-driven roster-removal paths
 * (preseason cutdowns, AI cap-management cuts, AI offseason roster cuts) set
 * a released player's `teamId` to null directly without ever repairing
 * `team.depthChart`, so the cut player's id lingered as a dangling
 * starter/backup reference until an unrelated later rebuild (the next
 * `validateAndRepairAllTeamDepthCharts('pre-sim')` pass) happened to run.
 *
 * The single/bulk player-release commands (handleReleasePlayer /
 * handleBulkReleasePlayers, via releasePlayerWithValidation) already called
 * ensureTeamDepthChart immediately after every mutation — those assertions
 * here are regression locks, not new behavior.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerSource = readFileSync(resolve(__dirname, '../worker.js'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  expect(start, `${name} must exist in worker.js`).toBeGreaterThan(-1);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n(async )?function \w+\(/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe('releasePlayerWithValidation — depth chart repair (already-fixed primary release path)', () => {
  const fn = extractFunction(workerSource, 'releasePlayerWithValidation');

  it('repairs the depth chart on the waivers branch', () => {
    const waiverBranch = fn.slice(fn.indexOf("isWaiverWindowOpen"), fn.indexOf('return { ok: true, playerId: player.id };'));
    expect(waiverBranch.includes('ensureTeamDepthChart(teamId')).toBe(true);
  });

  it('repairs the depth chart on the immediate free-agent branch', () => {
    const immediateBranch = fn.slice(fn.lastIndexOf("cache.updatePlayer(player.id, { teamId: null, status: 'free_agent'"));
    expect(immediateBranch.includes('ensureTeamDepthChart(teamId')).toBe(true);
  });

  it('repairs the depth chart after the roster mutation, not before', () => {
    const mutationIdx = fn.lastIndexOf("cache.updatePlayer(player.id, { teamId: null, status: 'free_agent'");
    const repairIdx = fn.indexOf('ensureTeamDepthChart(teamId', mutationIdx);
    expect(mutationIdx).toBeGreaterThan(-1);
    expect(repairIdx).toBeGreaterThan(mutationIdx);
  });
});

describe('AI preseason cutdowns / cap management — depth chart repair', () => {
  const fn = extractFunction(workerSource, 'handleAdvanceWeek');

  it('calls the canonical depth-chart repair after AI cutdowns and cap management', () => {
    const cutdownIdx = fn.indexOf('AiLogic.executeAICutdowns()');
    const capMgmtIdx = fn.indexOf('AiLogic.executeAICapManagement()');
    const repairIdx = fn.indexOf("validateAndRepairAllTeamDepthCharts('post-ai-cutdown')");

    expect(cutdownIdx).toBeGreaterThan(-1);
    expect(capMgmtIdx).toBeGreaterThan(cutdownIdx);
    expect(repairIdx).toBeGreaterThan(capMgmtIdx);
  });

  it('repairs depth charts before the phase-transition flush so the cleanup persists', () => {
    const repairIdx = fn.indexOf("validateAndRepairAllTeamDepthCharts('post-ai-cutdown')");
    const flushIdx = fn.indexOf('await flushDirty()', repairIdx);
    expect(repairIdx).toBeGreaterThan(-1);
    expect(flushIdx).toBeGreaterThan(repairIdx);
  });

  it('does not introduce a new post() call (response shape for this phase transition is unchanged)', () => {
    const repairIdx = fn.indexOf("validateAndRepairAllTeamDepthCharts('post-ai-cutdown')");
    const nextLineEnd = fn.indexOf('\n', repairIdx);
    const line = fn.slice(repairIdx, nextLineEnd);
    expect(line.includes('post(')).toBe(false);
  });
});

describe('AI offseason roster cuts — depth chart repair', () => {
  const fn = extractFunction(workerSource, 'handleAdvanceOffseason');

  it('calls the canonical depth-chart repair immediately after AI offseason cuts', () => {
    const cutsIdx = fn.indexOf('AiLogic.executeOffseasonRosterCuts()');
    const repairIdx = fn.indexOf("validateAndRepairAllTeamDepthCharts('post-ai-offseason-cuts')");
    expect(cutsIdx).toBeGreaterThan(-1);
    expect(repairIdx).toBeGreaterThan(cutsIdx);
  });

  it('repairs depth charts before the free_agency phase transition is flushed', () => {
    const repairIdx = fn.indexOf("validateAndRepairAllTeamDepthCharts('post-ai-offseason-cuts')");
    const setMetaIdx = fn.indexOf("phase: 'free_agency'", repairIdx);
    const flushIdx = fn.indexOf('await flushDirty()', repairIdx);
    expect(repairIdx).toBeGreaterThan(-1);
    expect(setMetaIdx).toBeGreaterThan(repairIdx);
    expect(flushIdx).toBeGreaterThan(setMetaIdx);
  });
});

describe('ensureTeamDepthChart / validateAndRepairAllTeamDepthCharts — single canonical implementation', () => {
  it('there is exactly one repairDepthChart-backed batch entry point (no second implementation introduced)', () => {
    const matches = [...workerSource.matchAll(/function validateAndRepairAllTeamDepthCharts\(/g)];
    expect(matches.length).toBe(1);
  });

  it('the batch repair delegates to ensureTeamDepthChart (same per-team utility used by manual release)', () => {
    const start = workerSource.indexOf('function validateAndRepairAllTeamDepthCharts(');
    const body = workerSource.slice(start, workerSource.indexOf('\nfunction ', start + 1));
    expect(body.includes('ensureTeamDepthChart(team.id')).toBe(true);
  });
});
