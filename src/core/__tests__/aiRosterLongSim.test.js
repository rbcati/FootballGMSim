import { describe, expect, it } from 'vitest';
import { buildAiTeamStrategy } from '../aiTeamStrategy.js';

function makeRoster(seed = 0) {
  const positions = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];
  const roster = [];
  let id = 1;
  for (const pos of positions) {
    const count = ['OL'].includes(pos) ? 7 : ['WR', 'DL', 'LB', 'CB'].includes(pos) ? 5 : ['S', 'RB'].includes(pos) ? 3 : 2;
    for (let i = 0; i < count; i += 1) {
      const base = 62 + ((seed + i * 7 + pos.charCodeAt(0)) % 23);
      roster.push({
        id: `${seed}-${id++}`,
        pos,
        age: 22 + ((seed + i * 3) % 12),
        ovr: base,
        potential: Math.min(99, base + 3 + ((seed + i) % 8)),
        contract: { years: 1 + ((seed + i) % 4), yearsRemaining: 1 + ((seed + i) % 4), baseAnnual: 1 + ((seed + i) % 14) },
      });
    }
  }
  return roster;
}

describe('AI roster long-sim sanity', () => {
  it('builds stable strategy outputs across multi-cycle simulation loop', () => {
    const teams = Array.from({ length: 12 }).map((_, index) => ({
      id: index + 1,
      abbr: `T${index + 1}`,
      wins: index % 8,
      losses: 17 - (index % 8),
      capRoom: 5 + (index % 18),
      capUsed: 276 + (index % 30),
      deadCap: index % 14,
      picks: [{ id: `p-${index}`, round: 1 + (index % 4), season: 2030 }],
    }));

    for (let cycle = 0; cycle < 5; cycle += 1) {
      for (const team of teams) {
        const roster = makeRoster(team.id + cycle);
        const strategy = buildAiTeamStrategy({
          team,
          roster,
          league: { year: 2030 + cycle, phase: cycle < 2 ? 'regular' : 'offseason_resign' },
        });
        expect(strategy.archetype).toBeTruthy();
        expect(Number.isFinite(strategy.capHealth)).toBe(true);
        expect(strategy.positionalNeeds.length).toBeGreaterThan(0);
        expect(strategy.positionalNeeds[0].priority).toBeGreaterThanOrEqual(0);
      }
      teams.forEach((team, idx) => {
        team.wins = (team.wins + idx + cycle) % 14;
        team.losses = 17 - team.wins;
        team.capRoom = Math.max(-8, team.capRoom + ((cycle % 2 === 0) ? -2 : 3));
        team.deadCap = Math.max(0, (team.deadCap + cycle + idx) % 18);
      });
    }
  });
});

