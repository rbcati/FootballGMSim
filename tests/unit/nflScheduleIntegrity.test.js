import { describe, it, expect } from 'vitest';
import { buildDefaultLeague } from '../../src/data/defaultLeague.ts';
import { DEFAULT_TEAMS } from '../../src/data/default-teams.js';
import { materializeTemplateSchedule, validateMaterializedTemplateSchedule } from '../../src/data/nflScheduleTemplates.js';

function assertOpponents(weeks, teams, readHome = g => g.home, readAway = g => g.away) {
  for (const team of teams) {
    const opponents = new Map();
    for (const week of weeks) for (const game of week.games) {
      const h = readHome(game), a = readAway(game);
      if (h === team.id || a === team.id) {
        const opp = h === team.id ? a : h;
        opponents.set(opp, (opponents.get(opp) ?? 0) + 1);
      }
    }
    for (const other of teams.filter(t => t.id !== team.id)) {
      const count = opponents.get(other.id) ?? 0;
      if (other.conf === team.conf && other.div === team.div) expect(count, `${team.abbr} vs ${other.abbr}`).toBe(2);
      else expect(count, `${team.abbr}: nondivision ${other.abbr} appears ${count} times`).toBeLessThanOrEqual(1);
    }
    expect([...opponents.values()].reduce((a,b) => a+b, 0)).toBe(17);
    expect(opponents.size).toBe(14);
  }
}

describe('NFL schedule integrity regressions', () => {
  it('gives Pittsburgh six rivalry games, eleven other opponents, and one bye', () => {
    const league = buildDefaultLeague({ userTeamId: 7 });
    assertOpponents(league.schedule.weeks, league.teams);
    expect(league.schedule.weeks.filter(w => w.teamsWithBye?.includes(7))).toHaveLength(1);
  });
  it('enforces complete opponent multiplicities for every generated template', () => {
    for (let season = 0; season < 4; season++) {
      const weeks = materializeTemplateSchedule(DEFAULT_TEAMS, season);
      assertOpponents(weeks, DEFAULT_TEAMS, g => g.homeTid, g => g.awayTid);
    }
  });
  it('rejects seventeen games against one nondivisional opponent despite valid weekly counts', () => {
    const weeks = Array.from({ length: 18 }, (_, i) => ({
      week: i + 1,
      teamsWithBye: i === 7 ? DEFAULT_TEAMS.map(t => t.id) : [],
      games: i === 7 ? [] : Array.from({ length: 16 }, (_, j) => ({ homeTid: j, awayTid: j + 16 })),
    }));
    expect(() => validateMaterializedTemplateSchedule(weeks, 32)).toThrow();
  });
});
