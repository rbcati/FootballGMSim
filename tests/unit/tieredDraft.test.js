import { describe, it, expect, beforeEach } from 'vitest';
import { Utils } from '../../src/core/utils.js';
import { generateDraftClass } from '../../src/core/player.js';

// Wave 4 Fix 1: draft classes must use weighted dev-trait bands (not 25% each)
// and tier target OVR/potential by draft slot.

describe('tiered draft talent distribution', () => {
  beforeEach(() => Utils.setSeed(20260605));

  it('weights dev traits toward the bottom of the talent pyramid', () => {
    const draft = generateDraftClass(2026, { classSize: 2000 });
    const counts = { Normal: 0, Star: 0, Superstar: 0, XFactor: 0 };
    for (const p of draft) counts[p.devTrait] = (counts[p.devTrait] ?? 0) + 1;
    const pct = (k) => counts[k] / draft.length;

    // Elite traits must be rare; Normal must dominate. (Old flat roll = 25% each.)
    expect(pct('XFactor')).toBeLessThan(0.05);
    expect(pct('Superstar')).toBeLessThan(0.14);
    expect(pct('Star')).toBeGreaterThan(0.12);
    expect(pct('Star')).toBeLessThan(0.28);
    expect(pct('Normal')).toBeGreaterThan(0.6);
    // Sanity: not the old uniform distribution.
    expect(pct('XFactor')).toBeLessThan(pct('Normal'));
  });

  it('tiers OVR and potential by draft position', () => {
    const draft = generateDraftClass(2026, { classSize: 250 });
    // Class is sorted best-first.
    const top5 = draft.slice(0, 5);
    const late = draft.slice(150, 200);

    const avg = (arr, key) => arr.reduce((s, p) => s + p[key], 0) / arr.length;
    expect(avg(top5, 'ovr')).toBeGreaterThan(avg(late, 'ovr') + 10);
    // Blue-chip picks carry real ceilings.
    expect(avg(top5, 'potential')).toBeGreaterThan(82);
    // Potential never below current OVR.
    expect(draft.every((p) => p.potential >= p.ovr)).toBe(true);
  });
});
