import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('load pipeline regression guards', () => {
  it('does not reference removed contract normalization helper in load path', () => {
    const workerSource = readFileSync(resolve(process.cwd(), 'src/worker/worker.js'), 'utf8');
    expect(workerSource.includes('normalizeContract(p)')).toBe(false);
    expect(workerSource.includes('normalizeContractLoading')).toBe(false);
  });

  it('hydrates contracts before cap recalculation in load-save flow', () => {
    const workerSource = readFileSync(resolve(process.cwd(), 'src/worker/worker.js'), 'utf8');
    const repairRosterIdx = workerSource.indexOf("repairRosterAndTeamLinks({ reason: 'load-save' })");
    const normalizeContractsIdx = workerSource.indexOf('const normalizedContractCount = normalizeLeagueContractsInCache()');
    const recalcIdx = workerSource.indexOf("recalculateTeamCap(team.id, { debugReason: 'load-save' })");
    expect(repairRosterIdx).toBeGreaterThan(-1);
    expect(normalizeContractsIdx).toBeGreaterThan(repairRosterIdx);
    expect(recalcIdx).toBeGreaterThan(normalizeContractsIdx);
  });

  it('does not block load on cap_limit issues', () => {
    const workerSource = readFileSync(resolve(process.cwd(), 'src/worker/worker.js'), 'utf8');
    expect(workerSource.includes("issue?.severity === 'error' && issue?.code !== 'cap_limit'")).toBe(true);
  });

  it('returns explicit structured load result states', () => {
    const workerSource = readFileSync(resolve(process.cwd(), 'src/worker/worker.js'), 'utf8');
    expect(workerSource.includes("buildLoadResult('success'")).toBe(true);
    expect(workerSource.includes("buildLoadResult('repaired_with_warning'")).toBe(true);
    expect(workerSource.includes("buildLoadResult(recoverable ? 'recoverable_error' : 'fatal_error'")).toBe(true);
  });
});
