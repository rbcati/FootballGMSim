import { describe, it, expect } from 'vitest';
import {
  buildLeagueRecordsRows,
  filterRecordRows,
  SCOPE_OPTIONS,
  CATEGORY_OPTIONS,
} from '../../src/ui/utils/leagueRecordsViewModel.js';

describe('leagueRecordsViewModel', () => {
  // ── buildLeagueRecordsRows ──────────────────────────────────────────────────

  it('normalizes single-season rows from V1 record book', () => {
    const recordBook = {
      singleSeasonV1: {
        passingYards: {
          recordKey: 'passingYards',
          label: 'Passing yards',
          value: 5100,
          playerId: 'qb1',
          playerName: 'Air Raid',
          position: 'QB',
          teamId: 1,
          teamAbbr: 'DAL',
          year: 2030,
          source: 'archivedSeason',
        },
      },
    };

    const rows = buildLeagueRecordsRows(recordBook);
    const ssRow = rows.find((r) => r.scope === 'singleSeason' && r.recordKey === 'passingYards');

    expect(ssRow).toBeDefined();
    expect(ssRow.scope).toBe('singleSeason');
    expect(ssRow.category).toBe('passing');
    expect(ssRow.value).toBe(5100);
    expect(ssRow.playerId).toBe('qb1');
    expect(ssRow.playerName).toBe('Air Raid');
    expect(ssRow.teamAbbr).toBe('DAL');
    expect(ssRow.year).toBe(2030);
    expect(ssRow.rank).toBeNull();
    expect(ssRow.id).toBe('ss-passingYards');
  });

  it('normalizes career leader rows with rank from V1 record book', () => {
    const recordBook = {
      careerLeadersV1: {
        rushingYards: [
          { recordKey: 'rushingYards', label: 'Rushing yards', value: 15000, playerId: 'rb1', playerName: 'Thunder', position: 'RB', source: 'careerStats' },
          { recordKey: 'rushingYards', label: 'Rushing yards', value: 12000, playerId: 'rb2', playerName: 'Bolt', position: 'RB', source: 'careerStats' },
        ],
      },
    };

    const rows = buildLeagueRecordsRows(recordBook);
    const careerRows = rows.filter((r) => r.scope === 'career' && r.recordKey === 'rushingYards');

    expect(careerRows).toHaveLength(2);
    expect(careerRows[0].rank).toBe(1);
    expect(careerRows[0].playerId).toBe('rb1');
    expect(careerRows[0].value).toBe(15000);
    expect(careerRows[0].category).toBe('rushing');
    expect(careerRows[0].id).toBe('career-rushingYards-0');
    expect(careerRows[1].rank).toBe(2);
    expect(careerRows[1].playerId).toBe('rb2');
  });

  it('normalizes team record rows from V1 record book', () => {
    const recordBook = {
      teamSeasonV1: {
        wins: {
          recordKey: 'wins',
          label: 'Most wins in a season',
          value: 15,
          teamId: 1,
          teamName: 'High',
          teamAbbr: 'HI',
          year: 2028,
          source: 'archivedSeason',
        },
        pointsFor: {
          recordKey: 'pointsFor',
          label: 'Most points scored (season)',
          value: 500,
          teamId: 2,
          teamAbbr: 'SC',
          year: 2027,
          source: 'archivedSeason',
        },
      },
    };

    const rows = buildLeagueRecordsRows(recordBook);
    const teamRows = rows.filter((r) => r.scope === 'team');

    expect(teamRows.length).toBeGreaterThanOrEqual(2);
    const winsRow = teamRows.find((r) => r.recordKey === 'wins');
    expect(winsRow).toBeDefined();
    expect(winsRow.value).toBe(15);
    expect(winsRow.teamAbbr).toBe('HI');
    expect(winsRow.category).toBe('team');
    expect(winsRow.playerId).toBeNull();
    expect(winsRow.id).toBe('team-wins');
  });

  it('formats winPct to 3 decimal places', () => {
    const recordBook = {
      teamSeasonV1: {
        winPct: { value: 0.882, teamAbbr: 'HI', label: 'Best win percentage', source: 'archivedSeason' },
      },
    };
    const rows = buildLeagueRecordsRows(recordBook);
    const row = rows.find((r) => r.recordKey === 'winPct');
    expect(row).toBeDefined();
    expect(row.displayValue).toBe('0.882');
  });

  it('does not crash on null or undefined record book', () => {
    expect(() => buildLeagueRecordsRows(null)).not.toThrow();
    expect(() => buildLeagueRecordsRows(undefined)).not.toThrow();
    expect(() => buildLeagueRecordsRows({})).not.toThrow();
    expect(buildLeagueRecordsRows(null)).toEqual([]);
    expect(buildLeagueRecordsRows(undefined)).toEqual([]);
    expect(buildLeagueRecordsRows({})).toEqual([]);
  });

  it('does not crash on sparse legacy record book (missing keys)', () => {
    const sparse = {
      singleSeasonV1: {
        passingYards: null,
        rushingYards: undefined,
      },
      careerLeadersV1: {
        passingYards: null,
        rushingYards: [null, undefined, { value: 0, playerId: 'x' }],
      },
      teamSeasonV1: {
        wins: { value: null },
        winPct: {},
      },
    };
    expect(() => buildLeagueRecordsRows(sparse)).not.toThrow();
    const rows = buildLeagueRecordsRows(sparse);
    expect(Array.isArray(rows)).toBe(true);
  });

  it('skips rows with zero or negative values', () => {
    const recordBook = {
      singleSeasonV1: {
        passingYards: { value: 0, playerId: 'qb1', playerName: 'None', label: 'Passing yards', source: 'archivedSeason' },
        rushingYards: { value: -5, playerId: 'rb1', playerName: 'Neg', label: 'Rushing yards', source: 'archivedSeason' },
      },
      teamSeasonV1: {
        wins: { value: 0, teamAbbr: 'XX', label: 'Wins' },
      },
    };
    const rows = buildLeagueRecordsRows(recordBook);
    expect(rows).toHaveLength(0);
  });

  it('produces rows from a full V1 book with all three scopes', () => {
    const recordBook = {
      singleSeasonV1: {
        passingYards: { value: 5000, playerId: 'qb1', playerName: 'QB', label: 'Passing yards', source: 'archivedSeason' },
      },
      careerLeadersV1: {
        passingYards: [{ value: 40000, playerId: 'qb2', playerName: 'Legend', label: 'Passing yards', source: 'careerStats' }],
      },
      teamSeasonV1: {
        wins: { value: 14, teamId: 1, teamAbbr: 'HI', label: 'Most wins in a season', source: 'archivedSeason' },
      },
    };
    const rows = buildLeagueRecordsRows(recordBook);
    expect(rows.some((r) => r.scope === 'singleSeason')).toBe(true);
    expect(rows.some((r) => r.scope === 'career')).toBe(true);
    expect(rows.some((r) => r.scope === 'team')).toBe(true);
  });

  // ── filterRecordRows ────────────────────────────────────────────────────────

  it('filters rows by scope', () => {
    const recordBook = {
      singleSeasonV1: {
        passingYards: { value: 5000, playerId: 'qb1', playerName: 'QB', label: 'Passing yards', source: 'archivedSeason' },
      },
      careerLeadersV1: {
        passingYards: [{ value: 40000, playerId: 'qb2', playerName: 'Legend', label: 'Passing yards', source: 'careerStats' }],
      },
      teamSeasonV1: {
        wins: { value: 14, teamId: 1, teamAbbr: 'HI', label: 'Most wins', source: 'archivedSeason' },
      },
    };
    const rows = buildLeagueRecordsRows(recordBook);

    const ssOnly = filterRecordRows(rows, { scope: 'singleSeason' });
    expect(ssOnly.length).toBeGreaterThan(0);
    expect(ssOnly.every((r) => r.scope === 'singleSeason')).toBe(true);

    const careerOnly = filterRecordRows(rows, { scope: 'career' });
    expect(careerOnly.length).toBeGreaterThan(0);
    expect(careerOnly.every((r) => r.scope === 'career')).toBe(true);

    const teamOnly = filterRecordRows(rows, { scope: 'team' });
    expect(teamOnly.length).toBeGreaterThan(0);
    expect(teamOnly.every((r) => r.scope === 'team')).toBe(true);

    const all = filterRecordRows(rows, { scope: 'all' });
    expect(all.length).toBe(rows.length);
  });

  it('filters rows by category', () => {
    const recordBook = {
      singleSeasonV1: {
        passingYards: { value: 5000, playerId: 'qb1', playerName: 'QB', label: 'Passing yards', source: 'archivedSeason' },
        rushingYards: { value: 2000, playerId: 'rb1', playerName: 'RB', label: 'Rushing yards', source: 'archivedSeason' },
        fieldGoalsMade: { value: 30, playerId: 'k1', playerName: 'Kicker', label: 'FG made', source: 'archivedSeason' },
      },
    };
    const rows = buildLeagueRecordsRows(recordBook);

    const passing = filterRecordRows(rows, { category: 'passing' });
    expect(passing.every((r) => r.category === 'passing')).toBe(true);
    expect(passing.length).toBeGreaterThan(0);

    const rushing = filterRecordRows(rows, { category: 'rushing' });
    expect(rushing.every((r) => r.category === 'rushing')).toBe(true);

    const kicking = filterRecordRows(rows, { category: 'kicking' });
    expect(kicking.every((r) => r.category === 'kicking')).toBe(true);
  });

  it('search works for player name', () => {
    const recordBook = {
      singleSeasonV1: {
        passingYards: { value: 5000, playerId: 'qb1', playerName: 'Air Raid', label: 'Passing yards', teamAbbr: 'DAL', year: 2030, source: 'archivedSeason' },
        rushingYards: { value: 2000, playerId: 'rb1', playerName: 'Thunder Bolt', label: 'Rushing yards', teamAbbr: 'NYG', year: 2028, source: 'archivedSeason' },
      },
    };
    const rows = buildLeagueRecordsRows(recordBook);

    const result = filterRecordRows(rows, { search: 'Air' });
    expect(result.some((r) => r.playerName === 'Air Raid')).toBe(true);
    expect(result.every((r) => r.playerName !== 'Thunder Bolt')).toBe(true);
  });

  it('search works for team abbreviation', () => {
    const recordBook = {
      singleSeasonV1: {
        passingYards: { value: 5000, playerId: 'qb1', playerName: 'QB', label: 'Passing yards', teamAbbr: 'DAL', year: 2030, source: 'archivedSeason' },
        rushingYards: { value: 2000, playerId: 'rb1', playerName: 'RB', label: 'Rushing yards', teamAbbr: 'NYG', year: 2028, source: 'archivedSeason' },
      },
    };
    const rows = buildLeagueRecordsRows(recordBook);

    const dal = filterRecordRows(rows, { search: 'DAL' });
    expect(dal.every((r) => r.teamAbbr === 'DAL')).toBe(true);
  });

  it('search works for year', () => {
    const recordBook = {
      singleSeasonV1: {
        passingYards: { value: 5000, playerId: 'qb1', playerName: 'QB', label: 'Passing yards', year: 2030, source: 'archivedSeason' },
        rushingYards: { value: 2000, playerId: 'rb1', playerName: 'RB', label: 'Rushing yards', year: 2028, source: 'archivedSeason' },
      },
    };
    const rows = buildLeagueRecordsRows(recordBook);

    const y2028 = filterRecordRows(rows, { search: '2028' });
    expect(y2028.every((r) => r.year === 2028)).toBe(true);
    expect(y2028.length).toBeGreaterThan(0);
  });

  it('search returns empty for non-matching query', () => {
    const recordBook = {
      singleSeasonV1: {
        passingYards: { value: 5000, playerId: 'qb1', playerName: 'QB', label: 'Passing yards', source: 'archivedSeason' },
      },
    };
    const rows = buildLeagueRecordsRows(recordBook);
    expect(filterRecordRows(rows, { search: 'zzz-not-found' })).toHaveLength(0);
  });

  it('empty search / no filters returns all rows', () => {
    const recordBook = {
      singleSeasonV1: {
        passingYards: { value: 5000, playerId: 'qb1', playerName: 'QB', label: 'Passing yards', source: 'archivedSeason' },
      },
    };
    const rows = buildLeagueRecordsRows(recordBook);
    expect(filterRecordRows(rows)).toHaveLength(rows.length);
    expect(filterRecordRows(rows, {})).toHaveLength(rows.length);
    expect(filterRecordRows(rows, { scope: 'all', category: 'all', search: '' })).toHaveLength(rows.length);
  });

  it('filterRecordRows handles null/empty rows safely', () => {
    expect(() => filterRecordRows(null)).not.toThrow();
    expect(filterRecordRows(null)).toEqual([]);
    expect(filterRecordRows([])).toEqual([]);
  });

  // ── SCOPE_OPTIONS / CATEGORY_OPTIONS ─────────────────────────────────────────

  it('SCOPE_OPTIONS includes all expected scope values', () => {
    const values = SCOPE_OPTIONS.map((o) => o.value);
    expect(values).toContain('all');
    expect(values).toContain('singleSeason');
    expect(values).toContain('career');
    expect(values).toContain('team');
  });

  it('CATEGORY_OPTIONS includes all expected category values', () => {
    const values = CATEGORY_OPTIONS.map((o) => o.value);
    expect(values).toContain('passing');
    expect(values).toContain('rushing');
    expect(values).toContain('receiving');
    expect(values).toContain('defense');
    expect(values).toContain('kicking');
    expect(values).toContain('team');
  });
});
