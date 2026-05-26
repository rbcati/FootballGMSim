import { describe, it, expect } from 'vitest';
import { buildAdvancedStatsLeadersView, ADVANCED_LEADER_DEFS } from '../../src/ui/utils/advancedStatsLeadersViewModel.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeArchive(entries) {
  const archive = {};
  for (const { pid, seasons } of entries) {
    archive[pid] = {};
    for (const [year, stats] of Object.entries(seasons)) {
      archive[pid][year] = stats;
    }
  }
  return archive;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('buildAdvancedStatsLeadersView', () => {

  // 1. Missing / falsy archive returns empty state
  it('returns hasData=false when archive is null', () => {
    const result = buildAdvancedStatsLeadersView({ archive: null });
    expect(result.hasData).toBe(false);
    expect(result.leaderboards).toEqual({});
  });

  it('returns hasData=false when archive is an array (malformed)', () => {
    expect(buildAdvancedStatsLeadersView({ archive: [] }).hasData).toBe(false);
  });

  it('returns hasData=false when called with no arguments', () => {
    expect(buildAdvancedStatsLeadersView().hasData).toBe(false);
  });

  it('returns hasData=false when archive is a non-empty object with only zero stats', () => {
    const archive = { 11: { 2031: { targets: 0, drops: 0 } } };
    const result = buildAdvancedStatsLeadersView({ archive });
    expect(result.hasData).toBe(false);
    for (const def of ADVANCED_LEADER_DEFS) {
      expect(result.leaderboards[def.statKey] ?? []).toHaveLength(0);
    }
  });

  // 2. __meta / archivedGameIds are ignored at top level and player level
  it('ignores top-level __meta and archivedGameIds keys', () => {
    const archive = {
      __meta: { version: 1 },
      archivedGameIds: { 'g1': true },
      11: { 2031: { targets: 7 } },
    };
    const result = buildAdvancedStatsLeadersView({ archive });
    expect(result.hasData).toBe(true);
    expect(result.leaderboards.targets).toHaveLength(1);
    expect(result.leaderboards.targets[0].value).toBe(7);
  });

  it('ignores player-level __meta and archivedGameIds seasons', () => {
    const archive = {
      11: {
        __meta: { source: 'test' },
        archivedGameIds: { g1: true },
        2031: { targets: 5, drops: 2 },
      },
    };
    const result = buildAdvancedStatsLeadersView({ archive });
    expect(result.leaderboards.targets[0].value).toBe(5);
    expect(result.leaderboards.drops[0].value).toBe(2);
    expect(result.leaderboards.targets).toHaveLength(1);
  });

  // 3. String and numeric player IDs both work
  it('resolves string and numeric player IDs from archive and players list', () => {
    const archive = {
      11: { 2031: { sacksMade: 4 } },
      '22': { 2031: { sacksMade: 6 } },
    };
    const players = [
      { id: 11, name: 'Alice', pos: 'DL', teamId: 1 },
      { id: '22', name: 'Bob', pos: 'EDGE', teamId: 2 },
    ];
    const teams = [
      { id: 1, abbr: 'AAA' },
      { id: 2, abbr: 'BBB' },
    ];
    const result = buildAdvancedStatsLeadersView({ archive, players, teams });
    const rows = result.leaderboards.sacksMade;
    expect(rows[0].playerName).toBe('Bob');
    expect(rows[0].teamAbbr).toBe('BBB');
    expect(rows[1].playerName).toBe('Alice');
    expect(rows[1].teamAbbr).toBe('AAA');
  });

  // 4. Career totals are summed correctly across seasons
  it('sums career totals across multiple seasons', () => {
    const archive = makeArchive([{
      pid: 'p1',
      seasons: {
        2029: { targets: 11, drops: 2, sacksMade: 1 },
        2030: { coverageTargets: 14, coverageCompletionsAllowed: 6 },
        2031: { targets: 9, drops: 1, sacksAllowed: 3, receptionsAllowed: 5 },
      },
    }]);
    const result = buildAdvancedStatsLeadersView({ archive });
    const lb = result.leaderboards;
    expect(lb.targets[0].value).toBe(20);
    expect(lb.drops[0].value).toBe(3);
    expect(lb.sacksMade[0].value).toBe(1);
    expect(lb.coverageTargets[0].value).toBe(14);
    expect(lb.coverageCompletionsAllowed[0].value).toBe(6);
    expect(lb.sacksAllowed[0].value).toBe(3);
    expect(lb.receptionsAllowed[0].value).toBe(5);
  });

  // 5. Leaderboard sorts descending by value
  it('returns rows sorted descending', () => {
    const archive = makeArchive([
      { pid: 'a', seasons: { 2031: { targets: 5 } } },
      { pid: 'b', seasons: { 2031: { targets: 15 } } },
      { pid: 'c', seasons: { 2031: { targets: 10 } } },
    ]);
    const rows = buildAdvancedStatsLeadersView({ archive }).leaderboards.targets;
    expect(rows.map((r) => r.value)).toEqual([15, 10, 5]);
  });

  it('assigns ranks 1, 2, 3 in descending order', () => {
    const archive = makeArchive([
      { pid: 'x', seasons: { 2031: { drops: 8 } } },
      { pid: 'y', seasons: { 2031: { drops: 3 } } },
    ]);
    const rows = buildAdvancedStatsLeadersView({ archive }).leaderboards.drops;
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
  });

  // 6. maxRows cap enforced
  it('caps the leaderboard at maxRows', () => {
    const entries = Array.from({ length: 15 }, (_, i) => ({
      pid: String(i + 1),
      seasons: { 2031: { battedPasses: 20 - i } },
    }));
    const archive = makeArchive(entries);
    const rows = buildAdvancedStatsLeadersView({ archive, maxRows: 5 }).leaderboards.battedPasses;
    expect(rows).toHaveLength(5);
    expect(rows[0].value).toBe(20);
    expect(rows[4].value).toBe(16);
  });

  it('defaults to 10 rows when maxRows is not provided', () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      pid: String(i + 1),
      seasons: { 2031: { sacksMade: 30 - i } },
    }));
    const archive = makeArchive(entries);
    const rows = buildAdvancedStatsLeadersView({ archive }).leaderboards.sacksMade;
    expect(rows).toHaveLength(10);
  });

  // 7. Ties are deterministic (alphabetical name, then pid)
  it('breaks ties alphabetically by player name', () => {
    const archive = {
      '1': { 2031: { coverageTargets: 10 } },
      '2': { 2031: { coverageTargets: 10 } },
    };
    const players = [
      { id: '1', name: 'Zara', pos: 'CB' },
      { id: '2', name: 'Aaron', pos: 'CB' },
    ];
    const rows = buildAdvancedStatsLeadersView({ archive, players }).leaderboards.coverageTargets;
    expect(rows[0].playerName).toBe('Aaron');
    expect(rows[1].playerName).toBe('Zara');
  });

  it('breaks ties by pid when both names are missing', () => {
    const archive = {
      '100': { 2031: { receptionsAllowed: 7 } },
      '20': { 2031: { receptionsAllowed: 7 } },
    };
    const rows = buildAdvancedStatsLeadersView({ archive }).leaderboards.receptionsAllowed;
    // pid "100" < "20" lexicographically → "100" should come first
    expect(rows[0].playerId).toBe('100');
    expect(rows[1].playerId).toBe('20');
  });

  // 8. Player/team labels resolve safely from players and teams arrays
  it('resolves player name and position from players list', () => {
    const archive = { '5': { 2031: { sacksAllowed: 3 } } };
    const players = [{ id: 5, name: 'Charlie', pos: 'OT', teamId: 10 }];
    const teams = [{ id: 10, abbr: 'CHI' }];
    const rows = buildAdvancedStatsLeadersView({ archive, players, teams }).leaderboards.sacksAllowed;
    expect(rows[0].playerName).toBe('Charlie');
    expect(rows[0].pos).toBe('OT');
    expect(rows[0].teamAbbr).toBe('CHI');
    expect(rows[0].teamId).toBe(10);
  });

  it('resolves teamAbbr via teamId when player does not carry abbr directly', () => {
    const archive = { '7': { 2031: { drops: 4 } } };
    const players = [{ id: 7, name: 'Dan', pos: 'WR', teamId: 3 }];
    const teams = [{ id: 3, abbr: 'DEN' }];
    const rows = buildAdvancedStatsLeadersView({ archive, players, teams }).leaderboards.drops;
    expect(rows[0].teamAbbr).toBe('DEN');
  });

  // 9. Missing player/team falls back safely
  it('falls back to "—" for missing player name, pos, and teamAbbr', () => {
    const archive = { '99': { 2031: { targets: 5 } } };
    const rows = buildAdvancedStatsLeadersView({ archive }).leaderboards.targets;
    expect(rows[0].playerName).toBe('—');
    expect(rows[0].pos).toBe('—');
    expect(rows[0].teamAbbr).toBe('—');
    expect(rows[0].teamId).toBeNull();
  });

  it('does not crash when teams array is missing', () => {
    const archive = { '1': { 2031: { sacksMade: 2 } } };
    expect(() => buildAdvancedStatsLeadersView({ archive, teams: null })).not.toThrow();
  });

  // 10. No mutation of archive, players, or teams
  it('does not mutate archive', () => {
    const archive = {
      p1: { 2031: { targets: '6', drops: 2 } },
      __meta: { v: 1 },
    };
    const snapshot = JSON.parse(JSON.stringify(archive));
    buildAdvancedStatsLeadersView({ archive });
    expect(archive).toEqual(snapshot);
  });

  it('does not mutate players or teams arrays', () => {
    const players = [{ id: 1, name: 'Eve', pos: 'WR', teamId: 1 }];
    const teams = [{ id: 1, abbr: 'EVE' }];
    const playersCopy = JSON.parse(JSON.stringify(players));
    const teamsCopy = JSON.parse(JSON.stringify(teams));
    const archive = { '1': { 2031: { targets: 3 } } };
    buildAdvancedStatsLeadersView({ archive, players, teams });
    expect(players).toEqual(playersCopy);
    expect(teams).toEqual(teamsCopy);
  });

  // 11. Season filter works
  it('filters to a specific season when season is provided', () => {
    const archive = makeArchive([{
      pid: 'p1',
      seasons: {
        2030: { targets: 20 },
        2031: { targets: 5 },
      },
    }]);
    const rows = buildAdvancedStatsLeadersView({ archive, season: 2031 }).leaderboards.targets;
    expect(rows[0].value).toBe(5);
  });

  it('returns hasData=false when season filter matches no data', () => {
    const archive = makeArchive([{ pid: 'p1', seasons: { 2031: { targets: 5 } } }]);
    const result = buildAdvancedStatsLeadersView({ archive, season: 1999 });
    expect(result.hasData).toBe(false);
  });

  // 12. ADVANCED_LEADER_DEFS has exactly 8 metrics
  it('exports exactly 8 ADVANCED_LEADER_DEFS with unique statKeys', () => {
    expect(ADVANCED_LEADER_DEFS).toHaveLength(8);
    const keys = new Set(ADVANCED_LEADER_DEFS.map((d) => d.statKey));
    expect(keys.size).toBe(8);
  });

  // 13. Each leaderboard row has the expected shape
  it('each leaderboard row has the correct shape', () => {
    const archive = { '42': { 2031: { sacksMade: 7 } } };
    const players = [{ id: 42, name: 'Frank', pos: 'DE', teamId: 5 }];
    const teams = [{ id: 5, abbr: 'FRK' }];
    const rows = buildAdvancedStatsLeadersView({ archive, players, teams }).leaderboards.sacksMade;
    const row = rows[0];
    expect(row).toMatchObject({
      rank: 1,
      playerId: '42',
      playerName: 'Frank',
      pos: 'DE',
      teamAbbr: 'FRK',
      teamId: 5,
      statKey: 'sacksMade',
      statLabel: 'Sacks Made',
      value: 7,
    });
  });

  // 14. Players not in archive do not appear in any leaderboard
  it('players not in archive do not appear in any leaderboard', () => {
    const archive = { '1': { 2031: { targets: 8 } } };
    const players = [
      { id: 1, name: 'Alice', pos: 'WR', teamId: 1 },
      { id: 2, name: 'NotInArchive', pos: 'TE', teamId: 1 },
    ];
    const teams = [{ id: 1, abbr: 'TST' }];
    const result = buildAdvancedStatsLeadersView({ archive, players, teams });
    for (const def of ADVANCED_LEADER_DEFS) {
      const lb = result.leaderboards[def.statKey] ?? [];
      expect(lb.every((r) => r.playerName !== 'NotInArchive')).toBe(true);
    }
  });
});
