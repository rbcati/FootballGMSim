import { describe, it, expect } from 'vitest';
import { getPlayerGameLogs, recordedPlayerSeasonTotals } from './playerGameLogs.js';

const league = {
  seasonId: '2026',
  teamById: { 1: { abbr: 'AAA' }, 2: { abbr: 'BBB' }, 3: { abbr: 'CCC' } },
  schedule: { weeks: [
    { week: 1, games: [{ played: true, gameId:'2026_w1_1_2', home: 1, away: 2, homeScore: 24, awayScore: 17, playerStats: { home: { '12': { stats: { passAtt: 30, passComp: 20, passYd: 250, passTD: 2, interceptions: 1 } }, '33': { stats: { rushAtt: 15, rushYd: 90, rushTD: 1, receptions:2 } } }, away: { '44': { stats: { tackles: 8, sacks: 1, interceptions: 1 } } } } }] },
  ] },
};

describe('getPlayerGameLogs', () => {
  it.each(['__proto__', 'constructor', 'prototype', 'toString'])('uses only owned rows for a restored away player with ID %s', (id) => {
    const restored = JSON.parse(JSON.stringify({ ...league, schedule: { weeks: [{ week: 1, games: [{
      played: true, home: 1, away: 2, homeScore: 24, awayScore: 17,
      playerStats: { home: {}, away: Object.fromEntries([[id, { stats: { receptions: 2, recYd: 17 } }]]) },
    }] }] } }));
    const [row] = getPlayerGameLogs(restored, { id, teamId: 2, pos: 'WR' });
    expect(row.stats.recYd).toBe(17);
    expect(row.opponentId).toBe(1);
    expect(row.result).toBe('L 17-24');
    expect(getPlayerGameLogs(league, { id, teamId: 2 })).toEqual([]);
  });

  it('extracts QB stats', () => {
    const logs = getPlayerGameLogs(league, { id: 12, teamId: 1, pos: 'QB' });
    expect(logs[0].stats.passYd).toBe(250);
    expect(logs[0].stats.rate).not.toBeNull();
  });
  it('extracts RB/WR stats', () => {
    const logs = getPlayerGameLogs(league, { id: 33, teamId: 1, pos: 'RB' });
    expect(logs[0].stats.rushAtt).toBe(15);
  });
  it('extracts defense stats', () => {
    const logs = getPlayerGameLogs(league, { id: 44, teamId: 2, pos: 'LB' });
    expect(logs[0].stats.tackles).toBe(8);
  });

  it('retains the represented team after a trade and separates playoff log scope', () => {
    const traded = getPlayerGameLogs(league, { id: 12, teamId: 3, pos: 'QB' });
    expect(traded[0].opponentId).toBe(2);
    expect(traded[0].result).toBe('W 24-17');
    expect(traded[0].statScope).toBe('regular');
    const playoffLeague = { ...league, schedule: { weeks: [{ ...league.schedule.weeks[0], week: 19 }] } };
    expect(getPlayerGameLogs(playoffLeague, { id: 12, teamId: 1 })[0].statScope).toBe('playoffs');
  });

  it('uses the canonical current-season record ahead of partial logs or historical seasons', () => {
    const rows = [{ seasonId: '2025', totals: { passYd: 1000 } }, { seasonId: '2026', totals: { passYd: 300 } }];
    expect(recordedPlayerSeasonTotals(league, { seasonStats: { passYd: 10 } }, rows)).toBe(rows[1].totals);
    expect(recordedPlayerSeasonTotals(league, { seasonStats: { passYd: 300 } })).toEqual({ passYd: 300 });
    expect(recordedPlayerSeasonTotals(league, {}, [rows[0]])).toBeNull();
  });
});
