import { describe, expect, it } from 'vitest';
import {
  classifyArchiveQuality,
  normalizeArchivedGamePayload,
  recoverArchivedGameFromSchedule,
  summarizeArchiveDefects,
} from '../gameArchive.js';

describe('gameArchive helpers', () => {
  it('classifies full archives only when core sections exist', () => {
    const game = normalizeArchivedGamePayload({
      id: '2030_w3_1_2',
      seasonId: '2030',
      week: 3,
      homeId: 1,
      awayId: 2,
      homeScore: 28,
      awayScore: 17,
      teamStats: { home: { totalYards: 380 }, away: { totalYards: 301 } },
      playerStats: { home: { p1: { stats: { passYd: 280 } } }, away: { p2: { stats: { passYd: 245 } } } },
      scoringSummary: [{ quarter: 1, teamId: 1, text: 'TD' }],
      playLog: [{ quarter: 1, teamId: 1, text: 'TD pass' }],
    });
    expect(classifyArchiveQuality(game)).toBe('full');
  });

  it('keeps missing team stats as unavailable instead of fake zeros', () => {
    const game = normalizeArchivedGamePayload({
      id: '2030_w4_3_8',
      seasonId: '2030',
      week: 4,
      homeId: 3,
      awayId: 8,
      homeScore: 21,
      awayScore: 20,
      recap: 'Legacy row only',
    });
    expect(game.teamStats?.home).toBeNull();
    expect(game.archiveQuality).toBe('partial');
  });

  it('recovers schedule fallback as partial archive', () => {
    const recovered = recoverArchivedGameFromSchedule('2031_w7_5_6', {
      schedule: { weeks: [{ week: 7, games: [{ home: 5, away: 6, homeScore: 14, awayScore: 10, played: true }] }] },
    });
    expect(recovered?.archiveQuality).toBe('partial');
    expect(recovered?.homeScore).toBe(14);
  });

  it('flags contradictory full markers on validation summaries', () => {
    const defects = summarizeArchiveDefects({
      id: 'x',
      seasonId: '2030',
      week: 2,
      homeId: 1,
      awayId: 2,
      homeScore: 10,
      awayScore: 7,
      archiveQuality: 'full',
    });
    expect(defects.some((d) => d.includes('full_without_team_stats'))).toBe(true);
  });
});
