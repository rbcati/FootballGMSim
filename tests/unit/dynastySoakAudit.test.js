import { describe, expect, it } from 'vitest';
import {
  runDynastySoakAudit,
  validatePlayerSeasonStatsV1Shape,
  validateTransactionTimelineV1Shape,
  STAT_LEADER_WARN,
} from '../../src/core/dynastySoakAudit.js';
import { buildAiTeamStrategy } from '../../src/core/aiTeamStrategy.js';

function baseView(overrides = {}) {
  const mkRoster = (prefix, qbId) => {
    const out = [
      { id: qbId, pos: 'QB', age: 26, ovr: 78, potential: 82, contract: { yearsRemaining: 2, baseAnnual: 5 } },
    ];
    for (let i = 0; i < 44; i += 1) {
      const pos = ['OL', 'WR', 'CB', 'DL', 'LB', 'S', 'TE', 'RB'][i % 8];
      out.push({
        id: `${prefix}${i}`,
        pos,
        age: 23 + (i % 8),
        ovr: 68 + (i % 10),
        potential: 75,
        contract: { yearsRemaining: 2, baseAnnual: 2 },
      });
    }
    return out;
  };
  const teams = [
    {
      id: 0,
      abbr: 'AAA',
      wins: 8,
      losses: 8,
      ptsFor: 300,
      ptsAgainst: 280,
      capUsed: 200,
      capRoom: 100,
      capTotal: 301,
      roster: mkRoster('a', 'p1'),
    },
    {
      id: 1,
      abbr: 'BBB',
      wins: 7,
      losses: 9,
      ptsFor: 280,
      ptsAgainst: 300,
      capUsed: 210,
      capRoom: 90,
      capTotal: 301,
      roster: mkRoster('b', 'p8'),
    },
  ];
  return {
    phase: 'preseason',
    year: 2028,
    userTeamId: 0,
    seasonId: 's3',
    schedule: { weeks: [{ week: 1, games: [{ home: 0, away: 1 }] }] },
    standings: [{ id: 0, wins: 8, losses: 8 }],
    leagueHistory: [
      {
        id: 's2',
        year: 2027,
        champion: { id: 0, abbr: 'AAA' },
        standings: [{ id: 0, wins: 10, losses: 6 }],
        playerSeasonStatsV1: { schemaVersion: 1, rows: [{ playerId: 'p1', pos: 'QB', totals: { passYds: 4000, gamesPlayed: 16 } }] },
        transactionTimelineV1: { schemaVersion: 1, rows: [{ rawId: 1, type: 'draft', seasonId: 's2' }] },
        playerStatLeaders: {
          passingYards: { value: 4000 },
          rushingYards: { value: 900 },
          receivingYards: { value: 1100 },
        },
      },
    ],
    recordBook: { schemaVersion: 1 },
    hallOfFameClasses: [],
    teams,
    ...overrides,
  };
}

describe('dynastySoakAudit', () => {
  it('marks a healthy preseason snapshot as passing', () => {
    const r = runDynastySoakAudit({
      viewState: baseView(),
      seasonIndex: 1,
      allSeasons: [{ id: 's2', year: 2027 }],
      transactions: [{ type: 'DRAFT', seasonId: 's2', teamId: 0, details: { playerId: 1, overall: 1 } }],
      recordsPayload: { records: {}, recordBook: { schemaVersion: 1 } },
      hofPayload: { players: [], classes: [] },
      draftClassesPayload: { classes: [{ seasonId: 's2', year: 2027, pickCount: 1, teamIds: [0] }] },
    });
    expect(r.passed).toBe(true);
    expect(r.failures.length).toBe(0);
    expect(['ok', 'warn']).toContain(r.summary.rosterHealth);
    expect(r.reportSummary?.teamCount).toBe(2);
    expect(r.reportSummary?.archetypeDistribution).toBeDefined();
    expect(r.reportSummary?.transactionCountsByType?.DRAFT).toBeGreaterThanOrEqual(1);
  });

  it('fails on empty roster', () => {
    const v = baseView({
      teams: [{ id: 0, abbr: 'BAD', wins: 0, losses: 0, ptsFor: 0, ptsAgainst: 0, capUsed: 0, capRoom: 300, capTotal: 301, roster: [] }],
    });
    const r = runDynastySoakAudit({ viewState: v, seasonIndex: 1 });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'roster_empty')).toBe(true);
  });

  it('fails when two teams lack a QB', () => {
    const teams = [
      { id: 0, abbr: 'A', wins: 0, losses: 0, ptsFor: 0, ptsAgainst: 0, capUsed: 10, capRoom: 290, capTotal: 301, roster: [{ id: 'x', pos: 'RB', age: 22, ovr: 70, potential: 75, contract: { yearsRemaining: 1, baseAnnual: 1 } }] },
      { id: 1, abbr: 'B', wins: 0, losses: 0, ptsFor: 0, ptsAgainst: 0, capUsed: 10, capRoom: 290, capTotal: 301, roster: [{ id: 'y', pos: 'WR', age: 23, ovr: 70, potential: 75, contract: { yearsRemaining: 1, baseAnnual: 1 } }] },
    ];
    const r = runDynastySoakAudit({
      viewState: baseView({ teams, userTeamId: 0 }),
      seasonIndex: 1,
    });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'multi_team_no_qb')).toBe(true);
  });

  it('fails on NaN cap', () => {
    const teams = baseView().teams;
    teams[0].capUsed = NaN;
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 1 });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'cap_nan')).toBe(true);
  });

  it('warns on one team without QB', () => {
    const teams = baseView().teams;
    teams[1] = {
      ...teams[1],
      roster: Array.from({ length: 45 }, (_, i) => ({
        id: `z${i}`,
        pos: 'RB',
        age: 22,
        ovr: 70,
        potential: 75,
        contract: { yearsRemaining: 1, baseAnnual: 1 },
      })),
    };
    const r = runDynastySoakAudit({ viewState: baseView({ teams }), seasonIndex: 1 });
    expect(r.warnings.some((w) => w.code === 'one_team_no_qb')).toBe(true);
  });

  it('validates playerSeasonStatsV1 shape', () => {
    expect(validatePlayerSeasonStatsV1Shape(null).ok).toBe(true);
    expect(validatePlayerSeasonStatsV1Shape({ schemaVersion: 1, rows: [{ playerId: 'a' }] }).ok).toBe(true);
    expect(validatePlayerSeasonStatsV1Shape({ rows: 'nope' }).ok).toBe(false);
  });

  it('validates transactionTimelineV1 shape', () => {
    expect(validateTransactionTimelineV1Shape({ schemaVersion: 1, rows: [] }).ok).toBe(true);
    expect(validateTransactionTimelineV1Shape({ rows: {} }).ok).toBe(false);
  });

  it('buildAiTeamStrategy returns safe output for every team snapshot', () => {
    for (const t of baseView().teams) {
      const s = buildAiTeamStrategy({
        team: { id: t.id, abbr: t.abbr, wins: t.wins, losses: t.losses, capRoom: t.capRoom, capUsed: t.capUsed, deadCap: 0, picks: [] },
        roster: (t.roster || []).map((p) => ({
          id: p.id,
          pos: p.pos,
          age: p.age,
          ovr: p.ovr,
          potential: p.potential,
          contract: p.contract,
        })),
        league: { year: 2028, phase: 'preseason' },
      });
      expect(s.archetype).toBeTruthy();
      expect(Number.isFinite(s.capHealth)).toBe(true);
    }
  });

  it('exposes broad stat leader warn bounds', () => {
    expect(STAT_LEADER_WARN.passYds.max).toBeGreaterThan(STAT_LEADER_WARN.passYds.min);
  });

  it('keeps empty young Hall of Fame as a warning, not a failure', () => {
    const r = runDynastySoakAudit({
      viewState: baseView({ hallOfFameClasses: [] }),
      seasonIndex: 1,
      hofPayload: { players: [], classes: [] },
    });
    expect(r.warnings.some((w) => w.code === 'hof_empty_young')).toBe(true);
    expect(r.failures.some((f) => f.code === 'hof_empty_young')).toBe(false);
  });

  it('reports missing economy offer/trade inputs as skipped/unknown without failing', () => {
    const r = runDynastySoakAudit({
      viewState: baseView(),
      seasonIndex: 0,
    });
    expect(r.passed).toBe(true);
    expect(r.reportSummary.economyRegressionSnapshot.skippedReasons.some((row) => row.code === 'pending_offers_missing')).toBe(true);
    expect(r.reportSummary.economyRegressionSnapshot.skippedReasons.some((row) => row.code === 'trades_missing')).toBe(true);
  });

  it('detects duplicate season archives and malformed game rows', () => {
    const season = {
      id: 's2',
      year: 2027,
      champion: { id: 0, abbr: 'AAA' },
      standings: [{ id: 0, wins: 10, losses: 6 }],
      playoffBracketSnapshot: { rounds: [] },
      playerSeasonStatsV1: { schemaVersion: 1, rows: [{ playerId: 'p1', pos: 'QB', totals: {} }] },
      transactionTimelineV1: { schemaVersion: 1, rows: [] },
      games: [{ id: 'g1', homeScore: -1, awayScore: 20, boxScore: [] }],
    };
    const r = runDynastySoakAudit({
      viewState: baseView({ leagueHistory: [season, { ...season }] }),
      seasonIndex: 2,
    });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.code === 'season_archive_duplicate')).toBe(true);
    expect(r.failures.some((f) => f.code === 'game_archive_score_malformed')).toBe(true);
    expect(r.failures.some((f) => f.code === 'box_score_archive_malformed')).toBe(true);
  });

});
