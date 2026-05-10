import { describe, it, expect } from 'vitest';
import {
  normalizeRawTransaction,
  dedupeNormalizedTransactions,
  filterNormalizedTransactions,
  rankMajorMovesForTeam,
  compactRowsForArchive,
  collectPlayerIdsFromRaw,
  tradeDedupeFingerprint,
  rawTypeToBucket,
  normalizeArchivedMajorTransactions,
  stripInternalTimelineFields,
} from '../../src/core/transactionTimeline.js';

const teams = [
  { id: 1, abbr: 'AAA' },
  { id: 2, abbr: 'BBB' },
];
const teamsById = new Map(teams.map((t) => [t.id, t]));
const players = [
  { id: 10, name: 'Alice QB', pos: 'QB' },
  { id: 20, name: 'Bob WR', pos: 'WR' },
];
const playersById = new Map(players.map((p) => [p.id, p]));

const baseCtx = { teams, teamsById, players, playersById, year: 2026, phase: 'regular' };

describe('transactionTimeline', () => {
  it('maps internal types to buckets', () => {
    expect(rawTypeToBucket('SIGN')).toBe('signing');
    expect(rawTypeToBucket('EXTEND')).toBe('extension');
    expect(rawTypeToBucket('DRAFT')).toBe('draft');
    expect(rawTypeToBucket('RETIREMENT')).toBe('retirement');
  });

  it('normalizes signing with contract summary', () => {
    const tx = {
      id: 1,
      type: 'SIGN',
      seasonId: 's1',
      week: 5,
      teamId: 1,
      details: {
        playerId: 10,
        contract: { yearsTotal: 3, baseAnnual: 12, signingBonus: 6 },
      },
    };
    const r = normalizeRawTransaction(tx, baseCtx);
    expect(r.type).toBe('signing');
    expect(r.playerId).toBe(10);
    expect(r.playerName).toBe('Alice QB');
    expect(r.teamAbbr).toBe('AAA');
    expect(r.headline).toContain('signed');
    expect(r.contractSummary).toContain('3y');
  });

  it('normalizes TRADE with toTeam alias (AI trade shape)', () => {
    const tx = {
      id: 2,
      type: 'TRADE',
      seasonId: 's1',
      week: 8,
      teamId: 1,
      details: {
        playerId: 10,
        direction: 'sent',
        toTeam: 2,
        receivedPlayerId: 20,
      },
    };
    const r = normalizeRawTransaction(tx, baseCtx);
    expect(r.type).toBe('trade');
    expect(r.toTeamId).toBe(2);
    expect(r.toTeamAbbr).toBe('BBB');
    expect(collectPlayerIdsFromRaw(tx).sort()).toEqual([10, 20]);
  });

  it('collectPlayerIdsFromRaw includes offering/receiving package', () => {
    const tx = {
      type: 'TRADE',
      details: {
        fromTeamId: 1,
        toTeamId: 2,
        offering: { playerIds: [10], pickIds: ['p1'] },
        receiving: { playerIds: [20], pickIds: [] },
      },
    };
    expect(collectPlayerIdsFromRaw(tx).sort((a, b) => a - b)).toEqual([10, 20]);
  });

  it('dedupes mirrored AI trade rows by fingerprint', () => {
    const txA = {
      id: 100,
      type: 'TRADE',
      seasonId: 's1',
      week: 3,
      teamId: 1,
      details: { playerId: 10, receivedPlayerId: 20, toTeam: 2 },
    };
    const txB = {
      id: 101,
      type: 'TRADE',
      seasonId: 's1',
      week: 3,
      teamId: 2,
      details: { playerId: 20, receivedPlayerId: 10, toTeam: 1 },
    };
    expect(tradeDedupeFingerprint(txA)).toBe(tradeDedupeFingerprint(txB));
    const n1 = normalizeRawTransaction(txA, baseCtx);
    const n2 = normalizeRawTransaction(txB, baseCtx);
    const deduped = dedupeNormalizedTransactions([n1, n2]);
    expect(deduped).toHaveLength(1);
  });

  it('filterNormalizedTransactions filters by playerId (package trade)', () => {
    const tx = {
      id: 3,
      type: 'TRADE',
      seasonId: 's9',
      week: 1,
      teamId: 1,
      details: {
        fromTeamId: 1,
        toTeamId: 2,
        offering: { playerIds: [10], pickIds: [] },
        receiving: { playerIds: [20], pickIds: [] },
      },
    };
    const n = normalizeRawTransaction(tx, baseCtx);
    const rows = [n];
    expect(filterNormalizedTransactions(rows, { playerId: 10 }).length).toBe(1);
    expect(filterNormalizedTransactions(rows, { playerId: 20 }).length).toBe(1);
    expect(filterNormalizedTransactions(rows, { playerId: 99 }).length).toBe(0);
  });

  it('filterNormalizedTransactions teamId matches from or to', () => {
    const tx = {
      id: 4,
      type: 'TRADE',
      seasonId: 's1',
      week: 2,
      teamId: 1,
      details: { fromTeamId: 1, toTeamId: 2, offering: { playerIds: [10], pickIds: [] }, receiving: { playerIds: [20], pickIds: [] } },
    };
    const n = normalizeRawTransaction(tx, baseCtx);
    expect(filterNormalizedTransactions([n], { teamId: 1 }).length).toBe(1);
    expect(filterNormalizedTransactions([n], { teamId: 2 }).length).toBe(1);
    expect(filterNormalizedTransactions([n], { teamId: 3 }).length).toBe(0);
  });

  it('compactRowsForArchive strips internal fields', () => {
    const tx = {
      id: 5,
      type: 'RELEASE',
      seasonId: 's1',
      week: 4,
      teamId: 2,
      details: { playerId: 20 },
    };
    const n = normalizeRawTransaction(tx, baseCtx);
    const compact = compactRowsForArchive([n], 10)[0];
    expect(compact._internalType).toBeUndefined();
    expect(compact._playerIds).toBeUndefined();
    expect(compact.legacyType).toBe('RELEASE');
    const stripped = stripInternalTimelineFields([n])[0];
    expect(stripped._tradeFp).toBeUndefined();
  });

  it('normalizeArchivedMajorTransactions handles empty', () => {
    expect(normalizeArchivedMajorTransactions(null, baseCtx)).toEqual([]);
    expect(normalizeArchivedMajorTransactions([], baseCtx)).toEqual([]);
  });

  it('rankMajorMovesForTeam returns bounded list', () => {
    const rows = [
      normalizeRawTransaction({ id: 1, type: 'SIGN', seasonId: 's', week: 1, teamId: 1, details: { playerId: 10, contract: { yearsTotal: 1, baseAnnual: 1 } } }, baseCtx),
      normalizeRawTransaction({ id: 2, type: 'TRADE', seasonId: 's', week: 2, teamId: 1, details: { fromTeamId: 1, toTeamId: 2, offering: { playerIds: [10], pickIds: [] }, receiving: { playerIds: [20], pickIds: [] } } }, baseCtx),
      normalizeRawTransaction({ id: 3, type: 'RELEASE', seasonId: 's', week: 3, teamId: 2, details: { playerId: 20 } }, baseCtx),
    ];
    const major = rankMajorMovesForTeam(rows, 1, 5);
    expect(major.length).toBeLessThanOrEqual(5);
    expect(major.every((r) => num(r.teamId) === 1 || num(r.fromTeamId) === 1 || num(r.toTeamId) === 1)).toBe(true);
  });
});

function num(v) {
  return Number(v ?? 0);
}
