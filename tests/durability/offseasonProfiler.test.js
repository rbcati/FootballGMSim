import { describe, it, expect } from 'vitest';
import { OffseasonProfiler } from '../../src/worker/offseasonProfiler.js';

describe('OffseasonProfiler', () => {
  it('is disabled by default and can reset between runs', () => {
    const p = new OffseasonProfiler();
    p.count('x');
    expect(p.report().stages).toEqual([]);
    p.enable({ seed: 1 }); p.count('x'); expect(p.report().stages[0].calls).toBe(1);
    p.reset(); p.enable(); expect(p.report().stages).toEqual([]);
  });
  it('aggregates repeated and nested stages in stable order', async () => {
    const p = new OffseasonProfiler(); p.enable();
    const outer = p.start('outer');
    p.count('inner', { items: 2 }); p.count('inner', { items: 3 });
    p.end(outer);
    const r = p.report();
    expect(r.stages.find(s => s.name === 'inner').calls).toBe(2);
    expect(r.stages.find(s => s.name === 'inner').items).toBe(5);
    expect(r.stages.find(s => s.name === 'outer').calls).toBe(1);
    expect(r.stages.every(s => Number.isFinite(s.share))).toBe(true);
  });
  it('identifies incomplete active stage and preserves metadata', () => {
    const p = new OffseasonProfiler(); p.enable({ seed: 1684 });
    p.start('draft.pick', { teamId: 7 });
    const r = p.report({ completed: false });
    expect(r.firstIncompleteStage).toBe('draft.pick');
    expect(r.seed).toBe(1684);
  });
  it('records iterations and JSON-safe report values', () => {
    const p = new OffseasonProfiler(); p.enable();
    p.addIteration({ kind: 'draft-pick', pickNumber: 1 });
    p.count('bad', { items: Number.NaN });
    const json = JSON.stringify(p.report());
    expect(json).not.toMatch(/NaN|Infinity/);
    expect(JSON.parse(json).iterationSeries[0].pickNumber).toBe(1);
  });
});
