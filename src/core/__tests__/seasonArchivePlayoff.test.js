import { describe, it, expect } from 'vitest';
import { buildSeasonArchiveSummary } from '../league-memory.js';

describe('buildSeasonArchiveSummary playoff snapshot', () => {
  it('stores a compact playoff bracket snapshot from full season games', () => {
    const games = [
      { id: 'g-r1', week: 1, homeId: 1, awayId: 2, homeScore: 21, awayScore: 20, isPlayoff: false },
      { id: 'g-wc', week: 19, homeId: 1, awayId: 2, homeScore: 30, awayScore: 17, isPlayoff: true, playoffRound: 'wildcard' },
      { id: 'g-sb', week: 22, homeId: 1, awayId: 2, homeScore: 27, awayScore: 24, isPlayoff: true, playoffRound: 'superbowl' },
    ];
    const teams = [
      { id: 1, name: 'Dallas', abbr: 'DAL', wins: 12, losses: 5 },
      { id: 2, name: 'New York', abbr: 'NYG', wins: 10, losses: 7 },
    ];
    const summary = buildSeasonArchiveSummary({
      year: 2030,
      seasonId: 's1',
      standings: teams.map((t) => ({ id: t.id, name: t.name, abbr: t.abbr, wins: t.wins, losses: t.losses, ties: 0, pf: 400, pa: 320 })),
      awards: {},
      leaders: {},
      champion: { id: 1, name: 'Dallas', abbr: 'DAL' },
      runnerUp: { id: 2, name: 'New York', abbr: 'NYG' },
      userTeamId: 1,
      games,
      teams,
      seasonStats: [],
      championshipGameId: 'g-sb',
    });
    expect(summary.playoffBracketSnapshot?.mode).toBe('rounds');
    const labels = (summary.playoffBracketSnapshot?.rounds ?? []).map((r) => r.label);
    expect(labels).toContain('Wild Card');
    expect(labels).toContain('Championship');
  });
});
