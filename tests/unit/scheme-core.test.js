import { describe, expect, it } from 'vitest';
import { OFFENSIVE_SCHEMES as O, DEFENSIVE_SCHEMES as D, calculatePlayerSchemeFit as fit,
  calculateOffensiveSchemeFit, calculateDefensiveSchemeFit, computeTeamSchemeFits,
  resolveOffensiveScheme, resolveDefensiveScheme, normalizeSchemePosition, recalcTeamSchemeFit,
} from '../../src/core/scheme-core.js';
import { ensureAttributesV2 } from '../../src/core/migration/attributeMigrator.ts';

const ratings = { throwAccuracy: 84, awareness: 72, intelligence: 64, throwPower: 96,
  speed: 88, acceleration: 82, catching: 76, catchInTraffic: 68, juking: 71, trucking: 80,
  passBlock: 81, runBlock: 69, runStop: 74, coverage: 79, passRushPower: 86, passRushSpeed: 91 };
const frozen = (p) => Object.freeze({ ...p, ratings: p.ratings && Object.freeze(p.ratings), attributesV2: p.attributesV2 && Object.freeze(p.attributesV2) });

describe('scheme-core evidence integrity', () => {
  it('preserves complete legacy-only and migrated evaluations (recorded before patch)', () => {
    const qb = { pos: 'QB', ratings };
    expect(Object.values(O).map((s) => fit(qb, s))).toEqual([78, 85, 77]);
    expect(Object.values(O).map((s) => fit(ensureAttributesV2(qb), s))).toEqual([78, 85, 77]);
    expect(Object.values(D).map((s) => fit({ pos: 'DL', ratings }, s))).toEqual([82, 83, 84]);
  });
  it('uses exact V2 attributes for QB and receiver without inventing speed/awareness', () => {
    const qb = frozen({ pos: 'QB', attributesV2: { throwPower: 91, throwAccuracyShort: 20, pocketPresence: 10 } });
    expect(fit(qb, O.VERTICAL)).toBe(91);
    const wr = frozen({ pos: 'WR', attributesV2: { catchInTraffic: 83, routeRunning: 99, separation: 2, ballTracking: 1 } });
    expect(fit(wr, O.WEST_COAST)).toBe(83);
    expect(fit({ pos: 'WR', attributesV2: { routeRunning: 99, separation: 99 } }, O.VERTICAL)).toBe(50);
  });
  it('does not invent a defensive projection from distinct modern coverage/rush skills', () => {
    const defender = frozen({ pos: 'DE', attributesV2: { passRush: 99, pressCoverage: 92, zoneCoverage: 89 } });
    expect(Object.values(D).map((s) => fit(defender, s))).toEqual([50, 50, 50]);
  });
  it('uses valid nested legacy, then flat, then exact V2 evidence per key', () => {
    const p = frozen({ pos: 'QB', ratings: { throwPower: 60 }, attributesV2: { throwPower: 99 } });
    expect(fit(p, O.VERTICAL)).toBe(60);
    expect(fit({ ...p, ratings: { throwPower: NaN }, throwPower: 77 }, O.VERTICAL)).toBe(77);
    expect(fit({ ...p, ratings: {}, throwPower: undefined }, O.VERTICAL)).toBe(99);
  });
  it.each([undefined, null, NaN, Infinity, -Infinity, 0, -1, 101, 1e20, '90'])('rejects invalid evidence %s without mutation or NaN', (value) => {
    const p = frozen({ pos: 'QB', ratings: { throwPower: value } });
    expect(fit(p, O.VERTICAL)).toBe(50);
    expect(fit({ ...p, attributesV2: { throwPower: 88 } }, O.VERTICAL)).toBe(88);
  });
  it.each([
    ['VERTICAL', ['vertical', 'Vertical', 'Vertical / Air Raid', 'Air Raid', 'Pass Heavy']],
    ['WEST_COAST', ['West Coast', 'west-coast', 'Balanced']],
    ['SMASHMOUTH', ['Smashmouth', 'Run Heavy']],
  ])('normalizes offensive aliases for %s', (id, aliases) => {
    for (const alias of [id, ...aliases]) {
      expect(resolveOffensiveScheme(alias)).toBe(O[id]);
      expect(calculateOffensiveSchemeFit({ pos: 'QB', ratings }, alias)).toBe(fit({ pos: 'QB', ratings }, O[id]));
    }
  });
  it.each([
    ['COVER_2', ['Cover 2', '4-3 Cover 2', '4-3', 'Conservative']],
    ['BLITZ_34', ['3-4 Blitz', '3-4', 'Aggressive']],
    ['MAN_COVERAGE', ['Man Coverage', 'Nickel']],
  ])('normalizes defensive aliases for %s', (id, aliases) => {
    for (const alias of [id, ...aliases]) {
      expect(resolveDefensiveScheme(alias)).toBe(D[id]);
      expect(calculateDefensiveSchemeFit({ pos: 'LB', ratings }, alias)).toBe(fit({ pos: 'LB', ratings }, D[id]));
    }
  });
  it.each(['unknown', '', null, undefined, 'Vertical Spread', '3-4 Zone', 'Tampa 2', 'Pro Style', 'SPREAD', 'POWER_RUN', 'BLITZ_HEAVY', 'HYBRID'])('preserves unknown identifier defaults: %s', (id) => {
    expect(resolveOffensiveScheme(id)).toBe(O.WEST_COAST);
    expect(resolveDefensiveScheme(id)).toBe(D.COVER_2);
  });
  it.each([
    ['HB', 'RB'], ['FB', 'RB'], ['FL', 'WR'], ['SE', 'WR'],
    ...['LT', 'LG', 'C', 'RG', 'RT', 'OT', 'OG'].map((p) => [p, 'OL']),
    ...['DE', 'DT', 'NT', 'EDGE', 'IDL'].map((p) => [p, 'DL']),
    ...['MLB', 'OLB', 'ILB'].map((p) => [p, 'LB']),
    ['NCB', 'CB'], ['DB', 'CB'], ['FS', 'S'], ['SS', 'S'],
  ])('normalizes %s to %s without affecting eligibility', (alias, group) => {
    expect(normalizeSchemePosition(` ${alias.toLowerCase()} `)).toBe(group);
    for (const scheme of [...Object.values(O), ...Object.values(D)])
      expect(fit({ pos: alias, ratings }, scheme)).toBe(fit({ pos: group, ratings }, scheme));
  });
  it.each(['K', 'PK', 'P', 'RS', 'unknown'])('keeps %s neutral', (pos) => {
    for (const scheme of [...Object.values(O), ...Object.values(D)]) expect(fit({ pos, ratings }, scheme)).toBe(50);
  });
  it('evaluates the supplied roster once per request and respects pure inputs', () => {
    const roster = Object.freeze([frozen({ id: 1, pos: 'LT', ovr: 80, ratings }), frozen({ id: 2, pos: 'MLB', ratings })]);
    const before = structuredClone(roster);
    const result = computeTeamSchemeFits(roster, 'Vertical', '3-4 Blitz');
    expect(result.map((p) => p.schemeFit)).toEqual([fit(roster[0], O.VERTICAL), fit(roster[1], D.BLITZ_34)]);
    expect(computeTeamSchemeFits(roster, 'VERTICAL', 'BLITZ_34')).toEqual(result);
    expect(roster).toEqual(before);
    expect(computeTeamSchemeFits([{ ...roster[0], ratings: { passBlock: 30 } }], 'Vertical', '3-4 Blitz')[0].schemeFit).toBe(30);
  });
  it('retains legacy simulation cache contract and invalidates on explicit recalc', () => {
    const team = { roster: [{ pos: 'QB', ratings: { throwPower: 80 } }], _cachedMorale: 90 };
    const first = recalcTeamSchemeFit(team);
    team.roster[0].ratings.throwPower = 40;
    const next = recalcTeamSchemeFit(team);
    expect(next.offensiveSchemeFit).toBe(40);
    expect(first.offensiveSchemeFit).toBe(80);
    expect(team._cachedSchemeFit).toBe(next);
    expect(team.schemeFit).toBe(next);
    expect(team._cachedMorale).toBeUndefined();
  });
});

it('tooltips identify observed evidence rather than a missing highest-weight skill', () => {
  expect(computeTeamSchemeFits([{ id: 1, pos: 'QB', attributesV2: { throwPower: 90 } }], 'West Coast')[0].topAttr).toBe('throwPower');
  expect(computeTeamSchemeFits([{ id: 2, pos: 'DE', attributesV2: { passRush: 90 } }], undefined, 'BLITZ_34')[0].topAttr).toBeNull();
});
