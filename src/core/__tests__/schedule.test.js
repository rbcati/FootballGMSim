import { describe, expect, it } from 'vitest';
import { makeAccurateSchedule } from '../schedule.js';

function createTeams(n, withStructure = true) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Team ${i + 1}`,
    ...(withStructure
      ? {
          conf: Math.floor(i / 16),
          div: Math.floor((i % 16) / 4),
        }
      : {}),
  }));
}

function summarizeSchedule(schedule) {
  const gamesPerTeam = new Map();
  const byesPerTeam = new Map();

  for (const week of schedule.weeks) {
    for (const id of week.teamsWithBye)
      byesPerTeam.set(id, (byesPerTeam.get(id) ?? 0) + 1);
    for (const game of week.games) {
      gamesPerTeam.set(game.home, (gamesPerTeam.get(game.home) ?? 0) + 1);
      gamesPerTeam.set(game.away, (gamesPerTeam.get(game.away) ?? 0) + 1);
    }
  }

  return { gamesPerTeam, byesPerTeam };
}

describe('makeAccurateSchedule', () => {
  it('builds an 18 week schedule for a 32-team league', () => {
    const schedule = makeAccurateSchedule(createTeams(32));
    expect(schedule.weeks).toHaveLength(18);
    expect(schedule.metadata.type).toBe('nfl-canonical-v1');
  });

  it('ensures each team gets exactly 17 games and 1 bye in 32-team mode', () => {
    const teams = createTeams(32);
    const schedule = makeAccurateSchedule(teams);
    const { gamesPerTeam, byesPerTeam } = summarizeSchedule(schedule);

    for (const team of teams) {
      expect(gamesPerTeam.get(team.id)).toBe(17);
      expect(byesPerTeam.get(team.id)).toBe(1);
    }
  });

  it('falls back safely when team count is not 32', () => {
    const schedule = makeAccurateSchedule(createTeams(8));
    expect(schedule.metadata.type).toBe('custom-round-robin');
    expect(schedule.weeks).toHaveLength(18);
  });

  it('falls back safely when league structure is not NFL-style', () => {
    const schedule = makeAccurateSchedule(createTeams(32, false));
    expect(schedule.weeks).toHaveLength(18);
    expect(schedule.metadata.type).toBe('custom-round-robin');
  });

  it('advances season rotations and remains deterministic', () => {
    const teams = createTeams(32);
    const season1 = makeAccurateSchedule(teams, 1);
    const season2 = makeAccurateSchedule(teams, 2);
    const season4 = makeAccurateSchedule(teams, 4);
    expect(season1).toEqual(makeAccurateSchedule([...teams].reverse(), 1));
    expect(season1.metadata.rotation.sameMask).not.toBe(
      season2.metadata.rotation.sameMask
    );
    expect(season1.metadata.rotation.mainOffset).not.toBe(
      season4.metadata.rotation.mainOffset
    );
  });
});
