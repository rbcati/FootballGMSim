import { describe, it, expect } from 'vitest';
import {
  normalizeDraftPickRow,
  picksFromDraftTransactions,
  mergePlayerFieldFallbackPicks,
  buildDraftClassModel,
  assignOutcomeTier,
  findPlayerDraftOrigin,
  indexDraftClassesFromTransactions,
} from '../../src/core/draftClassHistory.js';
import { buildLegacyScoreReport } from '../../src/core/legacyScore.js';

const teams = [{ id: 1, abbr: 'AAA' }, { id: 2, abbr: 'BBB' }];
const teamsById = new Map(teams.map((t) => [t.id, t]));

describe('draftClassHistory', () => {
  it('normalizes DRAFT transaction rows', () => {
    const raw = {
      type: 'DRAFT',
      seasonId: 's2030',
      teamId: 1,
      playerId: 50,
      details: { playerId: 50, overall: 12, round: 1, pickInRound: 12 },
    };
    const row = normalizeDraftPickRow(raw, { teamsById, players: [{ id: 50, name: 'Joe', pos: 'WR' }] });
    expect(row.playerId).toBe(50);
    expect(row.overall).toBe(12);
    expect(row.draftTeamAbbr).toBe('AAA');
  });

  it('builds a draft class from transaction rows', () => {
    const txs = [
      { type: 'DRAFT', seasonId: 's1', teamId: 1, details: { playerId: 1, overall: 1, round: 1, pickInRound: 1 } },
      { type: 'DRAFT', seasonId: 's1', teamId: 2, details: { playerId: 2, overall: 2, round: 1, pickInRound: 2 } },
    ];
    const p1 = {
      id: 1,
      name: 'Late Gem',
      pos: 'RB',
      teamId: 1,
      status: 'retired',
      careerStats: Array.from({ length: 8 }, (_, i) => ({ season: 2030 + i, gamesPlayed: 16, rushYds: 900, ovr: 88 })),
      accolades: [{ type: 'MVP', year: 2035 }],
    };
    const p2 = {
      id: 2,
      name: 'Early Reach',
      pos: 'QB',
      teamId: 2,
      status: 'retired',
      careerStats: Array.from({ length: 3 }, (_, i) => ({ season: 2030 + i, gamesPlayed: 10, passYds: 2200, ovr: 72 })),
      accolades: [],
    };
    const playersById = new Map([
      [1, p1],
      [2, p2],
    ]);
    const model = buildDraftClassModel({
      year: 2030,
      seasonId: 's1',
      draftTransactions: txs,
      playersById,
      currentLeagueYear: 2045,
      recordBook: null,
      archivedSeasons: [],
      teams,
    });
    expect(model.picks.length).toBe(2);
    const gem = model.picks.find((p) => p.playerId === 1);
    const reach = model.picks.find((p) => p.playerId === 2);
    expect(gem.redraftRank).toBeLessThan(reach.redraftRank);
    expect(Number(gem.legacyScore ?? 0)).toBeGreaterThan(Number(reach.legacyScore ?? 0));
    expect(model.redraftTop10.length).toBeGreaterThan(0);
    expect(model.classSummary.totalPicks).toBe(2);
  });

  it('player fields fallback when transactions missing', () => {
    const players = [
      {
        id: 9,
        name: 'Solo',
        pos: 'TE',
        draftYear: 2028,
        draftTeamId: 1,
        draftTeamAbbr: 'AAA',
        draftRound: 3,
        draftPick: 5,
        teamId: 1,
        status: 'active',
        careerStats: [{ season: 2028, gamesPlayed: 14, recYds: 200 }],
        accolades: [],
      },
    ];
    const fb = mergePlayerFieldFallbackPicks(2028, players, new Set(), { teamsById });
    expect(fb.length).toBe(1);
    expect(fb[0].playerId).toBe(9);
  });

  it('recent class avoids bust-heavy labeling', () => {
    const rookie = {
      id: 3,
      name: 'Rook',
      pos: 'WR',
      status: 'active',
      careerStats: [{ season: 2044, gamesPlayed: 8, recYds: 120 }],
      accolades: [],
    };
    const report = buildLegacyScoreReport(rookie, { recordBook: null, archivedSeasons: [], teams, year: 2044 });
    const out = assignOutcomeTier(rookie, report, 0, { isDevelopingClass: true });
    expect(out.tier).not.toBe('BUST');
  });

  it('findPlayerDraftOrigin prefers transaction', () => {
    const txs = [{ type: 'DRAFT', teamId: 2, details: { playerId: 5, overall: 99, round: 3, pickInRound: 40 } }];
    const player = { id: 5, name: 'X', draftYear: 2020, draftTeamId: 1, draftRound: 1, draftPick: 1 };
    const o = findPlayerDraftOrigin(player, txs);
    expect(o.source).toBe('transaction');
    expect(o.draftTeamId).toBe(2);
  });

  it('indexes draft classes by season', () => {
    const txs = [
      { type: 'DRAFT', seasonId: 'a', teamId: 1, details: { playerId: 1 } },
      { type: 'DRAFT', seasonId: 'a', teamId: 2, details: { playerId: 2 } },
      { type: 'DRAFT', seasonId: 'b', teamId: 1, details: { playerId: 3 } },
    ];
    const idx = indexDraftClassesFromTransactions(txs, [{ id: 'a', year: 2031 }, { id: 'b', year: 2032 }]);
    expect(idx.length).toBe(2);
    expect(idx[0].year).toBe(2032);
    expect(idx[0].teamIds).toContain(1);
  });
});
