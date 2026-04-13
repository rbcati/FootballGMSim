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

  it('keeps backward compatibility with legacy stats.playLogs archives', () => {
    const game = normalizeArchivedGamePayload({
      id: 'legacy',
      homeId: 1,
      awayId: 2,
      homeScore: 13,
      awayScore: 10,
      stats: { playLogs: [{ quarter: 1, text: 'Legacy touchdown', homeScore: 7, awayScore: 0 }] },
    });
    expect(Array.isArray(game.playLog)).toBe(true);
    expect(game.playLog).toHaveLength(1);
    expect(game.archiveQuality).toBe('partial');
  });

  it('normalizes newly simulated archives into a canonical rich payload', () => {
    const game = normalizeArchivedGamePayload({
      id: '2033_w2_4_9',
      seasonId: '2033',
      week: 2,
      homeId: 4,
      awayId: 9,
      homeScore: 31,
      awayScore: 27,
      quarterScores: { home: [7, 10, 7, 7], away: [3, 14, 3, 7] },
      recap: 'Home team survived a late comeback.',
      teamStats: { home: { totalYards: 401 }, away: { totalYards: 366 } },
      playerStats: {
        home: { qb1: { name: 'QB One', pos: 'QB', stats: { passYd: 305 } } },
        away: { qb2: { name: 'QB Two', pos: 'QB', stats: { passYd: 289 } } },
      },
      scoringSummary: [{ quarter: 1, teamId: 4, text: 'Opening TD' }],
      driveSummary: [{ teamId: 4, quarter: 4, result: 'FG' }],
      playLog: [{ quarter: 4, teamId: 4, text: 'Clock-killing first down' }],
    });

    expect(game.archiveQuality).toBe('full');
    expect(game.scoringSummary).toHaveLength(1);
    expect(game.driveSummary).toHaveLength(1);
    expect(game.playLog).toHaveLength(1);
    expect(game.playerStats?.home?.qb1?.stats?.passYd).toBe(305);
  });
});
