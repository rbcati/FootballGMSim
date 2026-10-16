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

  it('scheme fit remains an attribute evaluation regardless of need or tendencies', () => {
    const qb = { pos: 'QB', ovr: 80, schemeFit: 55, ratings: { throwAccuracy: 80, throwPower: 80 } };
    const fit = deriveSchemeFit(qb, { needsNow: [{ pos: 'QB' }] }, { passRate: 62 }, ['QB']);
    expect(fit.score).toBe(55);
    expect(fit.tier).toBe('Neutral');
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

it('player evaluation uses current scheme identity and V2 evidence over stale readout fit', () => {
  const qb = Object.freeze({ pos: 'QB', schemeFit: 25, attributesV2: Object.freeze({ throwPower: 92 }) });
  for (const offSchemeId of ['VERTICAL', 'Vertical']) {
    expect(deriveSchemeFit(qb, { strategies: { offSchemeId } }, { passRate: 90 }, ['QB']).score).toBe(92);
  }
});

it('preserves worker-evaluated fit on compact DTOs without fabricating evidence', () => {
  const context = { strategies: { offSchemeId: 'VERTICAL', defSchemeId: 'BLITZ_34' } };
  expect(deriveSchemeFit({ id: 1, pos: 'QB', schemeFit: 88 }, context).score).toBe(88);
  expect(deriveSchemeFit({ id: 2, pos: 'LT', schemeFit: 72 }, context).score).toBe(72);
  expect(deriveSchemeFit({ id: 3, pos: 'CB', schemeFit: 42 }, context).score).toBe(42);
  expect(deriveSchemeFit({ id: 4, pos: 'QB' }, context).score).toBe(50);
  // A real modern model with no exact defensive evidence stays neutral even
  // when it has a stale stored fit; this is not an attribute-stripped view.
  expect(deriveSchemeFit({ pos: 'CB', schemeFit: 88, attributesV2: { zoneCoverage: 95 } }, context).score).toBe(50);
  expect(deriveSchemeFit({ pos: 'K', schemeFit: 88 }, context).score).toBe(50);
});
