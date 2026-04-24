import { describe, expect, it } from 'vitest';
import { getLatestUserCompletedGame, getLastGameDisplay, getNextOpponentDisplay } from './hqGameDisplay.js';

describe('hqGameDisplay helpers', () => {
  it('returns null when schedule is missing', () => {
    expect(getLatestUserCompletedGame({ userTeamId: 1 })).toBeNull();
  });

  it('finds the latest completed user game from unsorted schedule weeks', () => {
    const league = {
      userTeamId: 10,
      week: 6,
      schedule: {
        weeks: [
          { week: 5, games: [{ id: 'w5g1', played: true, home: { id: 10 }, away: { id: 22 }, homeScore: 20, awayScore: 17 }] },
          { week: 3, games: [{ id: 'w3g1', played: true, home: { id: 22 }, away: { id: 10 }, homeScore: 24, awayScore: 21 }] },
        ],
      },
    };
    expect(getLatestUserCompletedGame(league)?.id).toBe('w5g1');
  });

  it('builds last game display from home perspective', () => {
    const display = getLastGameDisplay({ homeId: 10, awayId: 11, homeAbbr: 'CHI', awayAbbr: 'DET', homeScore: 27, awayScore: 17 }, 10);
    expect(display.heroLine).toContain('W');
    expect(display.heroLine).toContain('27-17 vs DET');
  });

  it('builds last game display from away perspective including overtime tie', () => {
    const display = getLastGameDisplay({ homeId: 11, awayId: 10, homeAbbr: 'DET', awayAbbr: 'CHI', homeScore: 24, awayScore: 24, overtimePeriods: 1 }, 10);
    expect(display.heroLine).toContain('T (OT)');
    expect(display.heroLine).toContain('24-24 OT @ DET');
  });

  it('handles missing score/opponent data safely', () => {
    const display = getLastGameDisplay({ homeId: 11, awayId: 10 }, 10);
    expect(display.heroLine).toContain('0-0 @ TBD');
  });

  it('returns no-game fallback copy', () => {
    expect(getLastGameDisplay(null, 10).overviewLine).toContain('No completed game yet');
  });

  it('builds next opponent fallback and populated labels', () => {
    expect(getNextOpponentDisplay(null).opponentAbbr).toBe('TBD');
    const next = getNextOpponentDisplay({ isHome: false, opp: { abbr: 'GB', wins: 8, losses: 2, ties: 0 } });
    expect(next.heading).toContain('@ GB');
    expect(next.detail).toContain('(8-2)');
  });
});
