import { describe, expect, it } from 'vitest';
import { runDynastySoakAudit } from '../../src/core/dynastySoakAudit.js';

/**
 * Integration-style check without loading the game worker (full worker soak is
 * `npm run audit:dynasty`, which can take a long time on a 32-team save).
 */
describe('dynasty soak integration (audit fixture)', () => {
  it('passes audit on a compact multi-season-shaped snapshot', () => {
    const viewState = {
      phase: 'preseason',
      year: 2030,
      userTeamId: 0,
      seasonId: 's5',
      schedule: { weeks: [{ week: 1, games: [{ home: 0, away: 1 }] }] },
      standings: [{ id: 0, wins: 9, losses: 7 }],
      leagueHistory: [
        {
          id: 's4',
          year: 2029,
          champion: { id: 0, abbr: 'BUF' },
          standings: [{ id: 0, wins: 11, losses: 5 }],
          playerSeasonStatsV1: {
            schemaVersion: 1,
            rows: [
              { playerId: 'qb1', pos: 'QB', totals: { passYds: 3800, passInts: 12, gamesPlayed: 16 } },
            ],
          },
          transactionTimelineV1: {
            schemaVersion: 1,
            rows: [{ rawId: 10, type: 'draft', seasonId: 's4', teamId: 0 }],
          },
        },
      ],
      recordBook: { schemaVersion: 1 },
      hallOfFameClasses: [],
      teams: [
        {
          id: 0,
          abbr: 'BUF',
          wins: 12,
          losses: 4,
          ptsFor: 0,
          ptsAgainst: 0,
          capUsed: 180,
          capRoom: 120,
          capTotal: 301,
          roster: Array.from({ length: 45 }).map((_, i) => ({
            id: `pl${i}`,
            pos: i === 0 ? 'QB' : i < 10 ? 'OL' : i < 18 ? 'WR' : i < 26 ? 'CB' : 'DL',
            age: 24 + (i % 6),
            ovr: 68 + (i % 8),
            potential: 75,
            contract: { yearsRemaining: 2, baseAnnual: 2 },
          })),
        },
        {
          id: 1,
          abbr: 'MIA',
          wins: 5,
          losses: 11,
          ptsFor: 0,
          ptsAgainst: 0,
          capUsed: 190,
          capRoom: 110,
          capTotal: 301,
          roster: Array.from({ length: 45 }).map((_, i) => ({
            id: `m${i}`,
            pos: i === 0 ? 'QB' : 'RB',
            age: 25,
            ovr: 70,
            potential: 76,
            contract: { yearsRemaining: 2, baseAnnual: 2 },
          })),
        },
      ],
    };

    const r = runDynastySoakAudit({
      viewState,
      seasonIndex: 3,
      allSeasons: [{ id: 's4', year: 2029 }, { id: 's5', year: 2030 }],
      transactions: [
        { type: 'DRAFT', seasonId: 's4', teamId: 0, details: { playerId: 101, overall: 5, round: 1 } },
        { type: 'RETIREMENT', seasonId: 's4', teamId: 0, details: { playerId: 99 } },
      ],
      recordsPayload: { records: {}, recordBook: { schemaVersion: 1 } },
      hofPayload: { players: [], classes: [] },
      draftClassesPayload: { classes: [{ seasonId: 's4', year: 2029, pickCount: 20, teamIds: [0, 1] }] },
    });

    expect(r.passed).toBe(true);
    expect(['ok', 'warn']).toContain(r.severity);
  });
});
