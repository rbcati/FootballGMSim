import { describe, it, expect } from 'vitest';
import {
  buildPlayerSeasonStatsArchiveRows,
  normalizeArchivedPlayerStatRow,
  getArchivedPlayerSeasonRows,
  summarizePlayerSeasonRows,
  groupArchivedPlayerStatsByPlayer,
  defensiveIntsFromTotalsForArchive,
  passIntsThrownFromTotals,
  singleSeasonStatValueFromV1Row,
  buildLeagueHistoryTopPerformers,
} from '../../src/core/playerSeasonStatsArchive.js';
import { RECORD_KEYS } from '../../src/core/recordBookV1.js';

describe('playerSeasonStatsArchive', () => {
  it('builds compact rows and omits statless players', () => {
    const populated = [
      {
        playerId: 'a',
        seasonId: 's1',
        name: 'Statless',
        pos: 'WR',
        teamId: 1,
        totals: { gamesPlayed: 0 },
      },
      {
        playerId: 'b',
        seasonId: 's1',
        name: 'Busy',
        pos: 'QB',
        teamId: 1,
        age: 24,
        totals: { gamesPlayed: 12, passYd: 3200, passTD: 22, interceptions: 8 },
      },
    ];
    const arch = buildPlayerSeasonStatsArchiveRows(populated, {
      teams: [{ id: 1, abbr: 'ZZ' }],
      year: 2033,
      seasonId: 's1',
    });
    expect(arch.rows).toHaveLength(1);
    expect(arch.rows[0].playerId).toBe('b');
    expect(arch.rows[0].passInts).toBe(8);
    expect(arch.rows[0].defInts).toBe(0);
    expect(arch.meta.source).toBe('seasonStats');
  });

  it('does not treat QB picks as defensive INTs', () => {
    const populated = [{
      playerId: 'qb1',
      seasonId: 's1',
      name: 'Thrower',
      pos: 'QB',
      teamId: 2,
      totals: { gamesPlayed: 10, passYd: 2000, interceptions: 14 },
    }];
    const arch = buildPlayerSeasonStatsArchiveRows(populated, { teams: [], year: 1, seasonId: 's1' });
    expect(arch.rows[0].defInts).toBe(0);
    expect(arch.rows[0].passInts).toBe(14);
  });

  it('uses defensive-specific INT fields when present', () => {
    const populated = [{
      playerId: 's1',
      pos: 'S',
      teamId: 1,
      name: 'Safety',
      totals: { gamesPlayed: 10, interceptions: 1, defInterceptions: 5 },
    }];
    const arch = buildPlayerSeasonStatsArchiveRows(populated, { teams: [], year: 1, seasonId: 's1' });
    expect(arch.rows[0].defInts).toBe(5);
  });

  it('normalizes stat aliases on rows', () => {
    const r = normalizeArchivedPlayerStatRow({
      playerId: 'x',
      playerName: 'N',
      pos: 'RB',
      teamId: 3,
      passYds: 0,
      rushYds: 100,
      passInts: 0,
      defInts: 0,
    });
    expect(r.rushYds).toBe(100);
  });

  it('getArchivedPlayerSeasonRows returns empty for legacy seasons', () => {
    expect(getArchivedPlayerSeasonRows({ year: 1 })).toEqual([]);
  });

  it('summarizePlayerSeasonRows and groupArchivedPlayerStatsByPlayer', () => {
    const base = { playerId: 'p1', seasonId: 's1', year: 2030, pos: 'RB', teamId: 1 };
    const rows = [
      normalizeArchivedPlayerStatRow({ ...base, gamesPlayed: 2, passYds: 100 }),
      normalizeArchivedPlayerStatRow({ ...base, gamesPlayed: 1, rushYds: 50 }),
    ].filter(Boolean);
    expect(summarizePlayerSeasonRows(rows).rowCount).toBe(2);
    expect(groupArchivedPlayerStatsByPlayer(rows).get('p1').length).toBe(2);
  });

  it('singleSeasonStatValueFromV1Row reads defensive INT from defInts only', () => {
    const row = normalizeArchivedPlayerStatRow({
      playerId: 'lb',
      seasonId: 's2',
      pos: 'LB',
      passInts: 0,
      defInts: 3,
      passYds: 0,
      gamesPlayed: 10,
    });
    expect(singleSeasonStatValueFromV1Row(RECORD_KEYS.interceptions, row)).toBe(3);
  });

  it('buildLeagueHistoryTopPerformers returns null without snapshots', () => {
    expect(buildLeagueHistoryTopPerformers({ year: 1 })).toBe(null);
  });

  it('defensiveIntsFromTotalsForArchive matches QB vs LB behavior', () => {
    expect(defensiveIntsFromTotalsForArchive('QB', { interceptions: 12 })).toBe(0);
    expect(defensiveIntsFromTotalsForArchive('LB', { interceptions: 4 })).toBe(4);
    expect(passIntsThrownFromTotals('QB', { interceptions: 4 })).toBe(4);
    expect(passIntsThrownFromTotals('LB', { interceptions: 4 })).toBe(0);
  });
});
