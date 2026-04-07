import { describe, it, expect } from 'vitest';
import {
  ensureLeagueMemoryMeta,
  updateFranchiseHistory,
  updateRecordBook,
  evaluateHallOfFameCandidate,
  buildSeasonArchiveSummary,
  buildSeasonStorylineSnapshot,
} from '../../src/core/league-memory.js';

describe('league memory helpers', () => {
  it('adds defaults for old saves', () => {
    const meta = ensureLeagueMemoryMeta({ year: 2030 });
    expect(Array.isArray(meta.leagueHistory)).toBe(true);
    expect(meta.recordBook.singleSeason.passYd.value).toBe(0);
    expect(Array.isArray(meta.hallOfFame.classes)).toBe(true);
  });

  it('persists franchise timeline milestones and totals', () => {
    let meta = ensureLeagueMemoryMeta({});
    const season = buildSeasonArchiveSummary({
      year: 2031,
      seasonId: 's7',
      standings: [{ id: 0, name: 'Boston', abbr: 'BOS', wins: 13, losses: 4, ties: 0, pf: 410, pa: 280 }],
      awards: {},
      leaders: {},
      champion: { id: 0, name: 'Boston', abbr: 'BOS' },
      runnerUp: null,
      userTeamId: 0,
    });
    meta = updateFranchiseHistory(meta, season, []);
    expect(meta.franchiseHistoryByTeam['0'].totals.championships).toBe(1);
    expect(meta.franchiseHistoryByTeam['0'].milestones.length).toBe(1);
  });

  it('updates record book and hall evaluations', () => {
    let meta = ensureLeagueMemoryMeta({});
    meta = updateRecordBook(meta, {
      seasonStats: [{ playerId: 'p1', name: 'Ace QB', teamId: 0, totals: { passYd: 5200, passTD: 45 } }],
      allPlayers: [{ id: 'p1', name: 'Ace QB', teamId: 0, careerStats: [{ passYds: 5200, passTDs: 45 }] }],
      year: 2032,
      standings: [{ id: 0, abbr: 'BOS', wins: 14 }],
    });
    expect(meta.recordBook.singleSeason.passYd.value).toBe(5200);
    expect(meta.recordBook.career.passYd.value).toBe(5200);

    const hof = evaluateHallOfFameCandidate({ pos: 'QB', accolades: [{ type: 'MVP' }], careerStats: Array.from({ length: 12 }).map(() => ({ passYds: 1200, ovr: 90 })) }, 2032);
    expect(hof.inducted).toBe(true);
  });

  it('builds dynasty/drought storyline cards', () => {
    const meta = ensureLeagueMemoryMeta({
      leagueHistory: [{ year: 2035, champion: { id: 1, name: 'Sharks', abbr: 'SHK' } }],
      franchiseHistoryByTeam: {
        '1': { totals: { championships: 3, playoffAppearances: 8 }, bestSeason: { wins: 15, losses: 2 }, lastChampionshipYear: 2035 },
        '2': { totals: {}, lastChampionshipYear: 2028 },
      },
    });
    const cards = buildSeasonStorylineSnapshot(meta, [{ id: 1, abbr: 'SHK', name: 'Sharks' }, { id: 2, abbr: 'COL', name: 'Colts' }], 1);
    expect(cards.length).toBeGreaterThan(1);
  });
});
