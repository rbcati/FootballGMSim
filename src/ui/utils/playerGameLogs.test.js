import { describe, it, expect } from 'vitest';
import { getPlayerGameLogs } from './playerGameLogs.js';

describe('getPlayerGameLogs', () => {
  it('returns only games that include the selected player', () => {
    const league = {
      seasonId: '2026',
      teamById: { 1: { abbr: 'AAA' }, 2: { abbr: 'BBB' }, 3: { abbr: 'CCC' } },
      schedule: {
        weeks: [
          { week: 1, games: [{ played: true, home: 1, away: 2, homeScore: 24, awayScore: 17, playerStats: { home: { '12': { stats: { passAtt: 30, passComp: 20, passYd: 250, passTD: 2, interceptions: 1 } } }, away: {} } }] },
          { week: 2, games: [{ played: true, home: 3, away: 1, homeScore: 10, awayScore: 21, playerStats: { home: {}, away: { '99': { stats: { rushAtt: 10, rushYd: 54 } } } } }] },
        ],
      },
    };
    const logs = getPlayerGameLogs(league, { id: 12, teamId: 1, pos: 'QB' });
    expect(logs).toHaveLength(1);
    expect(logs[0].week).toBe(1);
    expect(logs[0].opponentAbbr).toBe('BBB');
    expect(logs[0].result).toBe('W 24-17');
  });
});
