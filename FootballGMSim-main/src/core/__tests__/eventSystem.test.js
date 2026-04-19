import { describe, expect, it } from 'vitest';
import { generateDynamicEvents, calculateSeasonAwards } from '../events/eventSystem.js';

function makePlayer(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    name: overrides.name ?? 'Player',
    pos: overrides.pos ?? 'WR',
    teamId: overrides.teamId ?? 1,
    status: 'active',
    morale: 42,
    contract: { baseAnnual: 6, years: 2 },
    extensionAsk: { baseAnnual: 18 },
    personalityProfile: { holdoutRisk: 92, diva: 85, discipline: 30, offFieldRisk: 70 },
    ...overrides,
  };
}

describe('eventSystem dynamic event generation', () => {
  it('generates holdout/trade pressure for volatile underpaid stars', () => {
    const players = [makePlayer()];
    const teams = [{ id: 1, abbr: 'USR', wins: 2, losses: 7 }];
    const events = generateDynamicEvents({ players, teams, week: 8, phase: 'regular', rng: () => 0.01 });
    const types = events.map((e) => e.type);
    expect(types).toContain('holdout');
    expect(types).toContain('trade_demand');
  });

  it('emits draft rumor events in draft phase', () => {
    const events = generateDynamicEvents({ players: [makePlayer()], teams: [{ id: 1, name: 'User', abbr: 'USR' }], phase: 'draft', rng: () => 0.1 });
    expect(events.some((e) => e.type === 'draft_rumor')).toBe(true);
  });
});

describe('season awards', () => {
  it('computes MVP/ROTY/COY and all-pro teams', () => {
    const stats = [
      { playerId: 1, name: 'Veteran QB', pos: 'QB', age: 29, teamId: 1, totals: { passYd: 4800, passTD: 42 } },
      { playerId: 2, name: 'Rookie WR', pos: 'WR', age: 22, teamId: 2, totals: { recYd: 1400, recTD: 12 } },
    ];
    const teams = [{ id: 1, wins: 13, abbr: 'AAA' }, { id: 2, wins: 11, abbr: 'BBB' }];
    const awards = calculateSeasonAwards({ stats, teams, year: 2030, coaches: [{ teamId: 1, name: 'Coach One' }] });
    expect(awards.mvp?.playerId).toBe(1);
    expect(awards.roty?.playerId).toBe(2);
    expect(awards.coachOfTheYear?.teamId).toBe(1);
    expect(awards.allPro.firstTeamOffense.length).toBeGreaterThan(0);
  });
});
