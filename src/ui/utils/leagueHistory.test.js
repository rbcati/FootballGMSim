import { describe, it, expect } from 'vitest';
import { buildLeagueHistoryModel, buildCurrentSeasonSnapshot, deriveAwardWinnersFromStats, deriveLeagueRecords, buildTeamYearHistory, archiveCompletedSeasonIfNeeded, ensureLeagueHistoryContainer } from '../../core/leagueHistory.js';

describe('leagueHistory utils', () => {
  it('ensure container handles missing history', () => {
    expect(ensureLeagueHistoryContainer({}).history.seasons).toEqual([]);
  });
  it('buildCurrentSeasonSnapshot uses normalized fields', () => {
    const s = buildCurrentSeasonSnapshot({ seasonId: 2026, week: 2, standings: [{ id: 1 }], leaders: [{ name: 'A' }] });
    expect(s.year).toBe(2026);
    expect(s.playerStats).toBeDefined();
  });
  it('archive preserves richer existing season and duplicate variants', () => {
    const league = { seasonId: '2026', history: { seasons: [{ id: 2026, champion: { name: 'Richer' }, playoffResults: [{ round: 'F' }], standings: [{ id: 1 }] }] }, standings: [{ id: 1 }] };
    const next = archiveCompletedSeasonIfNeeded(league, { season: 2026 });
    expect(next.history.seasons).toHaveLength(1);
    expect(next.history.seasons[0].champion.name).toBe('Richer');
  });
  it('archive snapshot includes core fields and warnings', () => {
    const once = archiveCompletedSeasonIfNeeded({ seasonId: 2026, standings: [{ id: 1, wins: 11 }], champion: { id: 1 }, runnerUp: { id: 2 }, playoffResults: [{ round: 'F' }], leaders: [{ name: 'Star', stats: { passYd: 3500 } }], playerStats: [{ name: 'Star', position: 'QB', stats: { passYd: 3500, passTD: 28 } }] });
    const row = once.history.seasons[0];
    expect(row.champion).toBeTruthy();
    expect(row.runnerUp).toBeTruthy();
    expect(row.playoffResults.length).toBe(1);
    expect(row.leaders.length).toBe(1);
    expect(row.awards).toBeTruthy();
    expect(Array.isArray(row.warnings)).toBe(true);
  });
  it('old leagueHistory fallback still works and exposes new model sections', () => {
    const model = buildLeagueHistoryModel({ leagueHistory: [{ year: 2025, champion: { name: 'Sharks' }, standings: [{ id: 1, wins: 10, losses: 7 }], awards: { mvp: { name: 'M' } }, warnings: ['partial'] }] });
    expect(model.seasonSummaries.length).toBe(1);
    expect(model.teamHistory.length).toBeGreaterThan(0);
    expect(model.archiveWarnings.length).toBe(1);
  });
  it('award derivation avoids zero stat players and labels derived', () => {
    const awards = deriveAwardWinnersFromStats({ playerRows: [{ name: 'Zero', position: 'QB', stats: { passYd: 0 } }, { name: 'Star', position: 'QB', stats: { passYd: 3000, passTD: 30 } }] });
    expect(awards.mvp.name).toBe('Star');
    expect(awards.derivedLabel).toMatch(/Derived/);
  });
  it('records and team history still work', () => {
    const recs = deriveLeagueRecords([], [{ name: 'B', stats: { passYd: 100 } }]);
    expect(recs.find((r) => r.key === 'passYd')?.player).toBe('B');
    const rows = buildTeamYearHistory([{ year: 2025, champion: { id: 1 }, standings: [{ id: 1, abbr: 'AAA', wins: 12, losses: 5 }] }], { teams: [{ id: 1, abbr: 'AAA' }] });
    expect(rows[0].championships).toBe(1);
  });
});
