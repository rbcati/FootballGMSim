import { describe, it, expect } from 'vitest';
import {
  normalizePosition,
  getPositionGroup,
  getPositionCompatibility,
  getPositionalPenaltyProfile,
  calculateEffectiveAttributes,
  inferAssignedPositionFromDepthSlot,
  getEffectivePlayerForRole,
} from '../sim/positionalMultipliers.js';

describe('positionalMultipliers', () => {
  it('keeps same-position assignments at no penalty', () => {
    expect(normalizePosition('hb')).toBe('RB');
    expect(getPositionGroup('RG')).toBe('OL');
    expect(getPositionCompatibility('QB', 'QB')).toBe('same');
    expect(getPositionalPenaltyProfile('QB', 'QB').technicalMultiplier).toBe(1);
  });

  it('applies lighter penalty for related moves than cross-family moves', () => {
    const wrToTe = getPositionalPenaltyProfile('WR', 'TE');
    const wrToDt = getPositionalPenaltyProfile('WR', 'DT');
    expect(wrToTe.technicalMultiplier).toBeGreaterThan(wrToDt.technicalMultiplier);

    const cbToS = getPositionalPenaltyProfile('CB', 'S');
    const cbToOl = getPositionalPenaltyProfile('CB', 'OL');
    expect(cbToS.technicalMultiplier).toBeGreaterThan(cbToOl.technicalMultiplier);
  });

  it('severely penalizes specialists in non-specialist roles and handles unknown safely', () => {
    expect(getPositionCompatibility('K', 'QB')).toBe('cross');
    expect(getPositionalPenaltyProfile('QB', null).technicalMultiplier).toBe(1);
  });

  it('calculates effective attributes without mutating player source', () => {
    const player = {
      pos: 'QB',
      ovr: 90,
      pass: 92,
      block: 34,
      speed: 78,
      awareness: 88,
      ratings: { pass: 95, speed: 80, awareness: 90 },
    };
    const result = calculateEffectiveAttributes(player, 'OT');

    expect(result).not.toBe(player);
    expect(player.pass).toBe(92);
    expect(result.pass).toBeLessThan(player.pass);
    expect(result.speed).toBeGreaterThan(result.pass);
    expect(result.ratings.pass).toBeLessThan(player.ratings.pass);
  });

  it('maps depth slot roles into canonical assigned positions safely', () => {
    expect(inferAssignedPositionFromDepthSlot('LT')).toBe('OT');
    expect(inferAssignedPositionFromDepthSlot('RG')).toBe('OG');
    expect(inferAssignedPositionFromDepthSlot('CB')).toBe('CB');
    expect(inferAssignedPositionFromDepthSlot(null)).toBe(null);
  });

  it('defaults safely when assigned role is unknown', () => {
    const player = { pos: 'WR', routeRunning: 87 };
    const result = getEffectivePlayerForRole(player, undefined);
    expect(result).not.toBe(player);
    expect(result.routeRunning).toBe(87);
  });
});
