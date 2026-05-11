import { describe, expect, it } from 'vitest';
import { buildAiTeamStrategy, mapPlayerPosToNeedGroup, __internal } from '../aiTeamStrategy.js';

function makePlayer({ pos, ovr, age = 27, potential = ovr + 2, yearsLeft = 2 }) {
  return {
    id: `${pos}-${ovr}-${age}-${Math.random()}`,
    pos,
    ovr,
    potential,
    age,
    contract: { years: yearsLeft, yearsRemaining: yearsLeft, baseAnnual: 6 },
  };
}

describe('buildAiTeamStrategy', () => {
  it('classifies contender profile deterministically', () => {
    const team = { id: 1, abbr: 'DAL', wins: 13, losses: 4, capRoom: 18, capUsed: 275, deadCap: 6 };
    const roster = [
      makePlayer({ pos: 'QB', ovr: 86 }),
      ...Array.from({ length: 8 }, () => makePlayer({ pos: 'WR', ovr: 80 })),
      ...Array.from({ length: 8 }, () => makePlayer({ pos: 'OL', ovr: 79 })),
      ...Array.from({ length: 8 }, () => makePlayer({ pos: 'DL', ovr: 80 })),
    ];
    const out = buildAiTeamStrategy({ team, roster, league: { year: 2030, phase: 'regular' } });
    expect(out.archetype).toBe('contender');
    expect(out.shouldBuy).toBe(true);
    expect(out.riskTolerance).toBe('high');
  });

  it('flags rebuild/development when record and QB need are poor', () => {
    const team = { id: 2, abbr: 'NYG', wins: 3, losses: 14, capRoom: 2, capUsed: 300, deadCap: 20 };
    const roster = [
      makePlayer({ pos: 'QB', ovr: 61, potential: 66, age: 30 }),
      ...Array.from({ length: 5 }, () => makePlayer({ pos: 'WR', ovr: 66 })),
      ...Array.from({ length: 6 }, () => makePlayer({ pos: 'OL', ovr: 64 })),
    ];
    const out = buildAiTeamStrategy({ team, roster, league: { year: 2030, phase: 'regular' } });
    expect(['rebuild', 'development', 'retool']).toContain(out.archetype);
    expect(out.positionalNeeds[0].priority).toBeGreaterThan(55);
    expect(out.shouldDevelop).toBe(true);
  });

  it('returns safe output for old saves with sparse data', () => {
    const out = buildAiTeamStrategy({ team: {}, roster: null, league: {} });
    expect(out.archetype).toBeTruthy();
    expect(Array.isArray(out.positionalNeeds)).toBe(true);
    expect(out.positionalNeeds.length).toBeGreaterThan(0);
    expect(out.teamId).toBe(null);
  });

  it('weights QB need above non-premium positions', () => {
    const roster = [
      makePlayer({ pos: 'QB', ovr: 60, potential: 66 }),
      makePlayer({ pos: 'K', ovr: 60, potential: 66 }),
      makePlayer({ pos: 'P', ovr: 60, potential: 66 }),
    ];
    const qbNeed = __internal.buildPositionalNeed('QB', roster, 'middle');
    const kpNeed = __internal.buildPositionalNeed('KP', roster, 'middle');
    expect(qbNeed.priority).toBeGreaterThan(kpNeed.priority);
  });

  it('maps granular positions to strategy need groups for draft/FA scoring', () => {
    expect(mapPlayerPosToNeedGroup('DE')).toBe('DL_EDGE');
    expect(mapPlayerPosToNeedGroup('OT')).toBe('OL');
    expect(mapPlayerPosToNeedGroup('K')).toBe('KP');
    expect(mapPlayerPosToNeedGroup('QB')).toBe('QB');
  });

  it('classifies elite roster with playoff pace as contender', () => {
    const team = { id: 3, abbr: 'BUF', wins: 10, losses: 7, capRoom: 14, capUsed: 278, deadCap: 4 };
    const roster = [
      makePlayer({ pos: 'QB', ovr: 84 }),
      ...Array.from({ length: 6 }, () => makePlayer({ pos: 'WR', ovr: 79 })),
      ...Array.from({ length: 8 }, () => makePlayer({ pos: 'OL', ovr: 78 })),
      ...Array.from({ length: 10 }, () => makePlayer({ pos: 'DL', ovr: 79 })),
      ...Array.from({ length: 6 }, () => makePlayer({ pos: 'CB', ovr: 78 })),
    ];
    const out = buildAiTeamStrategy({ team, roster, league: { year: 2031, phase: 'regular' } });
    expect(out.archetype).toBe('contender');
  });

  it('classifies weak-but-not-empty roster as development instead of defaulting everyone to rebuild', () => {
    const team = { id: 4, abbr: 'CAR', wins: 7, losses: 10, capRoom: 22, capUsed: 260, deadCap: 2 };
    const roster = [
      makePlayer({ pos: 'QB', ovr: 72, age: 28 }),
      ...Array.from({ length: 4 }, () => makePlayer({ pos: 'WR', ovr: 67 })),
      ...Array.from({ length: 5 }, () => makePlayer({ pos: 'OL', ovr: 66 })),
      ...Array.from({ length: 6 }, () => makePlayer({ pos: 'DL', ovr: 65 })),
    ];
    const out = buildAiTeamStrategy({ team, roster, league: { year: 2031, phase: 'regular' } });
    expect(['development', 'middle', 'retool']).toContain(out.archetype);
  });

  it('surfaces QB context in strategy reasons', () => {
    const weakQbRoster = [
      makePlayer({ pos: 'QB', ovr: 58, potential: 62 }),
      makePlayer({ pos: 'WR', ovr: 82 }),
    ];
    const out = buildAiTeamStrategy({
      team: { id: 5, abbr: 'TEN', wins: 8, losses: 9, capRoom: 12, capUsed: 270, deadCap: 0 },
      roster: weakQbRoster,
      league: { year: 2032, phase: 'regular' },
    });
    expect(out.reasons.some((r) => /QB/i.test(r))).toBe(true);
  });
});

