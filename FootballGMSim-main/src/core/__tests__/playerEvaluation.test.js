import { describe, expect, it } from 'vitest';
import {
  buildPlayerEvaluation,
  derivePlayerArchetype,
  derivePlayerRoleProjection,
  deriveSchemeFit,
} from '../playerEvaluation.js';

describe('playerEvaluation', () => {
  it('derives archetype for deep threat profile', () => {
    const player = { pos: 'WR', ovr: 82, ratings: { speed: 91, ballTracking: 78, catching: 72 } };
    const archetype = derivePlayerArchetype(player, 'RECEIVER');
    expect(archetype.archetype).toBe('Deep Threat');
  });

  it('scheme fit responds to team need and game plan tendencies', () => {
    const qb = { pos: 'QB', ovr: 80, schemeFit: 55, ratings: { throwAccuracy: 80, throwPower: 80 } };
    const fit = deriveSchemeFit(qb, { needsNow: [{ pos: 'QB' }] }, { passRate: 62 }, ['QB']);
    expect(fit.score).toBeGreaterThan(65);
    expect(['Strong', 'Excellent']).toContain(fit.tier);
  });

  it('role projection is safe for older save structures', () => {
    const role = derivePlayerRoleProjection({ pos: 'CB', ovr: 68, age: 24, potential: 78 }, { roster: undefined });
    expect(role.role).toBeTypeOf('string');
    expect(role.replaceContext).toBeTypeOf('string');
  });

  it('buildPlayerEvaluation returns grouped output', () => {
    const evalData = buildPlayerEvaluation({ pos: 'LB', ovr: 75, age: 25, ratings: { passRush: 81, runStop: 79, speed: 78 } }, { rosterContext: { roster: [] } });
    expect(evalData.archetype.archetype).toBeTruthy();
    expect(evalData.schemeFit.score).toBeGreaterThanOrEqual(0);
    expect(evalData.attributeBuckets.focus.length).toBeGreaterThan(0);
  });
});
