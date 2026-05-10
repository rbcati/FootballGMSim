import { describe, expect, it } from 'vitest';
import { buildAiTeamStrategy, __internal } from '../aiTeamStrategy.js';

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
});

