import { describe, it, expect } from 'vitest';
import { applyResult, commitGameResult, groupPlayersByPosition, initializePlayerStats, updateTeamStandings } from '../game-simulator.js';

describe('groupPlayersByPosition', () => {
  it('sorts by depthOrder first, then ovr descending', () => {
    const roster = [
      { id: 1, pos: 'QB', ovr: 89 },
      { id: 2, pos: 'QB', ovr: 82, depthOrder: 1 },
      { id: 3, pos: 'QB', ovr: 86, depthOrder: 2 },
    ];

    const grouped = groupPlayersByPosition(roster);
    expect(grouped.QB.map((p) => p.id)).toEqual([2, 3, 1]);
  });

  it('returns empty map for null roster', () => {
    expect(groupPlayersByPosition(null)).toEqual({});
  });
});

describe('initializePlayerStats', () => {
  it('creates game/season/career stat buckets when missing', () => {
    const player = {};
    initializePlayerStats(player);

    expect(player.stats).toBeTruthy();
    expect(player.stats.game).toBeTruthy();
    expect(player.stats.season).toBeTruthy();
    expect(player.stats.career).toBeTruthy();
  });
});

describe('updateTeamStandings', () => {
  it('increments wins/losses/points and syncs record alias fields', () => {
    const league = {
      teams: [{ id: 7, wins: 1, losses: 1, ties: 0, ptsFor: 40, ptsAgainst: 30 }],
    };

    const updated = updateTeamStandings(league, 7, {
      wins: 1,
      pf: 24,
      pa: 17,
    });

    expect(updated.wins).toBe(2);
    expect(updated.losses).toBe(1);
    expect(updated.ptsFor).toBe(64);
    expect(updated.ptsAgainst).toBe(47);
    expect(updated.record).toEqual({ w: 2, l: 1, t: 0, pf: 64, pa: 47 });
  });

  it('returns null when team id is unknown', () => {
    const league = { teams: [{ id: 1 }] };
    expect(updateTeamStandings(league, 999, { wins: 1 })).toBeNull();
  });
});

describe('applyResult', () => {
  it('marks game played and updates winner/loser standings and head-to-head', () => {
    const home = { id: 10, abbr: 'HOM' };
    const away = { id: 11, abbr: 'AWY' };
    const league = { teams: [home, away] };
    const game = { home, away, played: false };

    applyResult(league, game, 28, 17);

    expect(game.played).toBe(true);
    expect(game.homeScore).toBe(28);
    expect(game.awayScore).toBe(17);
    expect(home.wins).toBe(1);
    expect(away.losses).toBe(1);
    expect(home.headToHead[11].wins).toBe(1);
    expect(away.headToHead[10].losses).toBe(1);
  });
});

describe('commitGameResult archive shape', () => {
  it('stores structured summaries when provided by simulation output', () => {
    const league = {
      week: 1,
      year: 2030,
      teams: [
        { id: 1, name: 'Home', abbr: 'HME', roster: [] },
        { id: 2, name: 'Away', abbr: 'AWY', roster: [] },
      ],
      resultsByWeek: { 0: [] },
    };
    const result = commitGameResult(league, {
      homeTeamId: 1,
      awayTeamId: 2,
      homeScore: 24,
      awayScore: 17,
      stats: { home: { players: {} }, away: { players: {} } },
      playLogs: [{ quarter: 1, text: 'play' }],
      scoringSummary: [{ quarter: 1, teamId: 1, scoreType: 'touchdown', points: 7, text: 'TD' }],
      driveSummary: [{ teamId: 1, quarter: 1, startClock: '12:00', plays: 6, yards: 75, result: 'TD', points: 7 }],
      quarterScores: { home: [7, 7, 3, 7], away: [3, 7, 0, 7] },
    }, { persist: false });

    expect(result.scoringSummary).toHaveLength(1);
    expect(result.driveSummary).toHaveLength(1);
    expect(result.quarterScores.home[0]).toBe(7);
  });
});
