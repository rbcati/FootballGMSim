import { describe, it, expect } from 'vitest';
import { buildLeagueHistoryModel, buildCurrentSeasonSnapshot, deriveAwardWinnersFromStats, deriveLeagueRecords, buildTeamYearHistory, archiveCompletedSeasonIfNeeded } from './leagueHistory.js';

describe('leagueHistory utils', () => {
  it('handles missing league.history', () => {
    const model = buildLeagueHistoryModel({ seasonId: 2026, week: 1 });
    expect(model.seasons).toEqual([]);
    expect(model.warnings.length).toBeGreaterThan(0);
  });
  it('buildCurrentSeasonSnapshot uses current fields', () => {
    const s = buildCurrentSeasonSnapshot({ seasonId: 2026, week: 2, standings: [{ id: 1 }] });
    expect(s.season).toBe(2026);
    expect(s.standings).toHaveLength(1);
  });
  it('archiveCompletedSeasonIfNeeded creates history and avoids duplicates', () => {
    const league = { seasonId: 2026, standings: [{ id: 1, wins: 11 }], playerStats: [{ name: 'Star', position: 'QB', stats: { passYd: 3500, passTD: 28 } }] };
    const once = archiveCompletedSeasonIfNeeded(league);
    expect(once.history.seasons).toHaveLength(1);
    const twice = archiveCompletedSeasonIfNeeded(once);
    expect(twice.history.seasons).toHaveLength(1);
    expect(twice.history.seasons[0].awards?.source).toBe('derived');
  });
  it('award derivation avoids zero stat players and labels derived', () => {
    const awards = deriveAwardWinnersFromStats({ playerRows: [{ name: 'Zero', position: 'QB', stats: { passYd: 0 } }, { name: 'Star', position: 'QB', stats: { passYd: 3000, passTD: 30 } }] });
    expect(awards.mvp.name).toBe('Star');
    expect(awards.derivedLabel).toMatch(/Derived/);
  });
  it('records ignore zero values', () => {
    const recs = deriveLeagueRecords([], [{ name: 'A', stats: { passYd: 0 } }, { name: 'B', stats: { passYd: 100 } }]);
    expect(recs.find((r) => r.key === 'passYd')?.player).toBe('B');
  });
  it('team history computes from archived data only', () => {
    const rows = buildTeamYearHistory([{ year: 2025, champion: { id: 1 }, standings: [{ id: 1, abbr: 'AAA', wins: 12, losses: 5 }] }], { teams: [{ id: 1, abbr: 'AAA' }] });
    expect(rows[0].championships).toBe(1);
  });
});
