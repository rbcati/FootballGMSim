import { describe, it, expect } from 'vitest';
import { deriveTeamCapSnapshot } from './numberFormatting.js';

describe('deriveTeamCapSnapshot', () => {
  it('derives stable cap totals from shared fields', () => {
    const team = { capTotal: 300, capUsed: 248.6, deadCap: 12.4 };
    const snap = deriveTeamCapSnapshot(team, { fallbackCapTotal: 255 });
    expect(snap.capTotal).toBe(300);
    expect(snap.capUsed).toBe(248.6);
    expect(snap.capRoom).toBeCloseTo(51.4, 4);
    expect(snap.activeCap).toBeCloseTo(236.2, 4);
  });

  it('uses capRoom as canonical fallback when capUsed missing', () => {
    const team = { capTotal: 300, capRoom: 24.2, deadCap: 5 };
    const snap = deriveTeamCapSnapshot(team);
    expect(snap.capUsed).toBeCloseTo(275.8, 4);
    expect(snap.capRoom).toBeCloseTo(24.2, 4);
  });
});
