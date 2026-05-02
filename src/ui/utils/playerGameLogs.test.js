import { describe, it, expect } from 'vitest';
import { getPlayerGameLogs } from './playerGameLogs.js';

const league = {
  seasonId: '2026',
  teamById: { 1: { abbr: 'AAA' }, 2: { abbr: 'BBB' }, 3: { abbr: 'CCC' } },
  schedule: { weeks: [
    { week: 1, games: [{ played: true, gameId:'2026_w1_1_2', home: 1, away: 2, homeScore: 24, awayScore: 17, playerStats: { home: { '12': { stats: { passAtt: 30, passComp: 20, passYd: 250, passTD: 2, interceptions: 1 } }, '33': { stats: { rushAtt: 15, rushYd: 90, rushTD: 1, receptions:2 } } }, away: { '44': { stats: { tackles: 8, sacks: 1, interceptions: 1 } } } } }] },
  ] },
};

describe('getPlayerGameLogs', () => {
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
});
