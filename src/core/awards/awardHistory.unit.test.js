/**
 * awardHistory.unit.test.js — Awards & Honors Expansion V2 ledger module.
 */
import { describe, it, expect } from 'vitest';
import {
  LEAGUE_LEADER_CATEGORIES,
  computeLeagueLeaders,
  buildAwardHistoryEntry,
  appendAwardHistory,
  hydrateAwardHistory,
  getCareerHonorCounts,
  aggregateCareerHonors,
  summarizeSeasonAwards,
} from './awardHistory.js';
import { AWARD_TYPES } from './awardEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TEAMS = { 1: { id: 1, abbr: 'AAA' }, 2: { id: 2, abbr: 'BBB' } };
const teamResolver = (id) => TEAMS[id] ?? null;

function statRow(playerId, pos, totals, name = `P${playerId}`, teamId = 1) {
  return { playerId, name, pos, teamId, totals };
}

function award(type, playerId, pos, opts = {}) {
  return { type, playerId, name: opts.name ?? `P${playerId}`, pos, teamId: opts.teamId ?? 1, score: opts.score ?? 100 };
}

function honor(type, playerId, pos, opts = {}) {
  return { type, playerId, playerName: opts.name ?? `P${playerId}`, pos, teamId: opts.teamId ?? 1, prestigePos: opts.prestigePos ?? pos };
}

// ── computeLeagueLeaders ────────────────────────────────────────────────────

describe('computeLeagueLeaders', () => {
  it('exposes the documented leader categories', () => {
    const keys = LEAGUE_LEADER_CATEGORIES.map((c) => c.key);
    expect(keys).toEqual([
      'passYd', 'passTD', 'rushYd', 'rushTD', 'recYd', 'recTD', 'sacks', 'defInt', 'totalTD',
    ]);
  });

  it('picks the highest value per category with team snapshot', () => {
    const stats = [
      statRow('a', 'QB', { passYd: 5000, passTD: 40 }, 'Ace', 1),
      statRow('b', 'QB', { passYd: 4000, passTD: 45 }, 'Bo', 2),
    ];
    const leaders = computeLeagueLeaders(stats, teamResolver);
    expect(leaders.passYd.playerId).toBe('a');
    expect(leaders.passYd.value).toBe(5000);
    expect(leaders.passYd.teamAbbr).toBe('AAA');
    expect(leaders.passTD.playerId).toBe('b');
    expect(leaders.passTD.teamAbbr).toBe('BBB');
  });

  it('breaks ties deterministically by ascending playerId', () => {
    const stats = [
      statRow('zeta', 'WR', { recYd: 1200 }),
      statRow('alpha', 'WR', { recYd: 1200 }),
    ];
    const leaders = computeLeagueLeaders(stats, teamResolver);
    expect(leaders.recYd.playerId).toBe('alpha');
  });

  it('counts defensive interceptions only for defensive players', () => {
    const stats = [
      statRow('qb', 'QB', { interceptions: 18 }),   // INTs thrown — must NOT count
      statRow('cb', 'CB', { interceptions: 7 }),    // defensive INTs
    ];
    const leaders = computeLeagueLeaders(stats, teamResolver);
    expect(leaders.defInt.playerId).toBe('cb');
    expect(leaders.defInt.value).toBe(7);
  });

  it('totalTD sums passing/rushing/receiving touchdowns', () => {
    const stats = [statRow('rb', 'RB', { rushTD: 12, recTD: 3 })];
    const leaders = computeLeagueLeaders(stats, teamResolver);
    expect(leaders.totalTD.value).toBe(15);
  });

  it('returns null for a category with no positive data and never crashes', () => {
    expect(() => computeLeagueLeaders(null, teamResolver)).not.toThrow();
    const leaders = computeLeagueLeaders([statRow('x', 'QB', {})], teamResolver);
    expect(leaders.passYd).toBeNull();
    expect(leaders.sacks).toBeNull();
  });

  it('is deterministic across repeated calls', () => {
    const stats = [statRow('a', 'QB', { passYd: 4000 }), statRow('b', 'QB', { passYd: 4200 })];
    expect(computeLeagueLeaders(stats, teamResolver)).toEqual(computeLeagueLeaders(stats, teamResolver));
  });
});

// ── buildAwardHistoryEntry ──────────────────────────────────────────────────

describe('buildAwardHistoryEntry', () => {
  const awardResults = {
    playerAwards: [
      award(AWARD_TYPES.MVP, 'qb1', 'QB', { name: 'Star QB', score: 320 }),
      award(AWARD_TYPES.OFFENSIVE_POY, 'rb1', 'RB', { name: 'Star RB' }),
      award(AWARD_TYPES.DEFENSIVE_POY, 'dl1', 'DL', { name: 'Star DL' }),
      award(AWARD_TYPES.OFF_ROOKIE_OF_YEAR, 'wr9', 'WR', { name: 'Rook WR' }),
      award(AWARD_TYPES.DEF_ROOKIE_OF_YEAR, 'lb9', 'LB', { name: 'Rook LB' }),
    ],
    franchiseAwards: [{ type: AWARD_TYPES.COACH_OF_YEAR, teamId: 2, coachName: 'Coach K' }],
    allProTeam: [
      { type: AWARD_TYPES.ALL_PRO_QB, playerId: 'qb1', name: 'Star QB', pos: 'QB', teamId: 1 },
      { type: AWARD_TYPES.ALL_PRO_LB, playerId: 'lb1', name: 'Star LB', pos: 'LB', teamId: 2 },
    ],
  };
  const prestige = [
    honor('SECOND_TEAM_ALL_PRO', 'qb2', 'QB'),
    honor('PRO_BOWL', 'qb1', 'QB'),
    honor('PRO_BOWL', 'qb2', 'QB'),
  ];
  const stats = [statRow('qb1', 'QB', { passYd: 5000, passTD: 40 }, 'Star QB')];

  it('builds the documented compact shape', () => {
    const entry = buildAwardHistoryEntry({ year: 2030, seasonId: 's6', awardResults, prestigeAssignments: prestige, stats, teamResolver });
    expect(entry.year).toBe(2030);
    expect(entry.seasonId).toBe('s6');
    expect(entry.awards.MVP).toEqual({ playerId: 'qb1', playerName: 'Star QB', teamId: 1, teamAbbr: 'AAA', pos: 'QB', score: 320 });
    expect(entry.awards.OPOY.playerId).toBe('rb1');
    expect(entry.awards.DPOY.playerId).toBe('dl1');
    expect(entry.awards.ORoy.playerId).toBe('wr9');
    expect(entry.awards.DRoy.playerId).toBe('lb9');
    expect(entry.awards.COY).toEqual({ teamId: 2, teamAbbr: 'BBB', coachName: 'Coach K' });
  });

  it('sources firstTeam from the positional All-Pro team (expanded positions)', () => {
    const entry = buildAwardHistoryEntry({ year: 2030, awardResults, prestigeAssignments: prestige, stats, teamResolver });
    const posSet = entry.allPro.firstTeam.map((h) => h.pos);
    expect(posSet).toContain('QB');
    expect(posSet).toContain('LB'); // expanded positional honor surfaced
    expect(entry.allPro.secondTeam.map((h) => h.playerId)).toEqual(['qb2']);
    expect(entry.proBowl.map((h) => h.playerId).sort()).toEqual(['qb1', 'qb2']);
  });

  it('falls back to combined ROOKIE_OF_YEAR for ORoy when split award is absent', () => {
    const legacy = {
      playerAwards: [award(AWARD_TYPES.ROOKIE_OF_YEAR, 'r1', 'RB', { name: 'Legacy Rook' })],
      franchiseAwards: [],
      allProTeam: [],
    };
    const entry = buildAwardHistoryEntry({ year: 2031, awardResults: legacy, prestigeAssignments: [], stats: [], teamResolver });
    expect(entry.awards.ORoy.playerId).toBe('r1');
    expect(entry.awards.DRoy).toBeNull();
  });

  it('degrades safely with empty inputs', () => {
    const entry = buildAwardHistoryEntry({ year: 2032 });
    expect(entry.awards.MVP).toBeNull();
    expect(entry.allPro.firstTeam).toEqual([]);
    expect(entry.proBowl).toEqual([]);
    expect(Object.values(entry.leaders).every((v) => v === null)).toBe(true);
  });

  it('is deterministic', () => {
    const a = buildAwardHistoryEntry({ year: 2030, awardResults, prestigeAssignments: prestige, stats, teamResolver });
    const b = buildAwardHistoryEntry({ year: 2030, awardResults, prestigeAssignments: prestige, stats, teamResolver });
    expect(a).toEqual(b);
  });
});

// ── appendAwardHistory ──────────────────────────────────────────────────────

describe('appendAwardHistory', () => {
  const e = (year) => ({ year, awards: {}, allPro: { firstTeam: [], secondTeam: [] }, proBowl: [], leaders: {} });

  it('appends one entry and keeps chronological order', () => {
    let h = [];
    h = appendAwardHistory(h, e(2025));
    h = appendAwardHistory(h, e(2026));
    expect(h.map((x) => x.year)).toEqual([2025, 2026]);
  });

  it('replaces (never duplicates) an entry for the same year', () => {
    let h = appendAwardHistory([], e(2025));
    h = appendAwardHistory(h, { ...e(2025), proBowl: [{ playerId: 'x' }] });
    expect(h).toHaveLength(1);
    expect(h[0].proBowl).toHaveLength(1);
  });

  it('does not mutate the input array', () => {
    const before = [e(2025)];
    const after = appendAwardHistory(before, e(2026));
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(2);
  });

  it('ignores entries without a year', () => {
    const h = appendAwardHistory([e(2025)], { awards: {} });
    expect(h).toHaveLength(1);
  });

  it('grows by at most one per season over a long run (bounded)', () => {
    let h = [];
    for (let y = 2025; y < 2075; y++) h = appendAwardHistory(h, e(y));
    for (let y = 2025; y < 2075; y++) h = appendAwardHistory(h, e(y)); // replay all
    expect(h).toHaveLength(50);
  });
});

// ── hydrateAwardHistory (backward compatibility) ────────────────────────────

describe('hydrateAwardHistory', () => {
  it('returns [] for an old save with no awardHistory field', () => {
    expect(hydrateAwardHistory({ year: 2025 })).toEqual([]);
    expect(hydrateAwardHistory(null)).toEqual([]);
    expect(hydrateAwardHistory(undefined)).toEqual([]);
  });

  it('passes through a valid ledger and filters malformed entries', () => {
    const meta = { awardHistory: [{ year: 2025, awards: {} }, null, {}, { awards: {} }] };
    const out = hydrateAwardHistory(meta);
    expect(out).toHaveLength(1);
    expect(out[0].year).toBe(2025);
  });
});

// ── Career honor aggregation ────────────────────────────────────────────────

describe('career honor aggregation', () => {
  function mkEntry(year, { mvp, opoy, dpoy, oroy, droy, first = [], second = [], pro = [] } = {}) {
    return {
      year,
      awards: {
        MVP: mvp ? { playerId: mvp, playerName: mvp } : null,
        OPOY: opoy ? { playerId: opoy } : null,
        DPOY: dpoy ? { playerId: dpoy } : null,
        ORoy: oroy ? { playerId: oroy } : null,
        DRoy: droy ? { playerId: droy } : null,
      },
      allPro: {
        firstTeam: first.map((id) => ({ playerId: id })),
        secondTeam: second.map((id) => ({ playerId: id })),
      },
      proBowl: pro.map((id) => ({ playerId: id })),
    };
  }

  const history = [
    mkEntry(2025, { mvp: 'star', first: ['star'], pro: ['star', 'role'] }),
    mkEntry(2026, { mvp: 'star', dpoy: 'dman', second: ['star'], pro: ['star'] }),
    mkEntry(2027, { opoy: 'star', oroy: 'rook', droy: 'drook', first: ['star'], pro: ['rook'] }),
  ];

  it('aggregates a single player correctly (retire-safe)', () => {
    const counts = getCareerHonorCounts(history, 'star');
    expect(counts.mvp).toBe(2);
    expect(counts.opoy).toBe(1);
    expect(counts.firstTeamAllPro).toBe(2);
    expect(counts.secondTeamAllPro).toBe(1);
    expect(counts.allPro).toBe(3);
    expect(counts.proBowl).toBe(2);
  });

  it('aggregateCareerHonors matches per-player helper for every player', () => {
    const agg = aggregateCareerHonors(history);
    for (const [pid, counts] of agg) {
      expect(getCareerHonorCounts(history, pid)).toEqual(counts);
    }
    expect(agg.get('rook').oroy).toBe(1);
    expect(agg.get('drook').droy).toBe(1);
  });

  it('handles missing/empty history without crashing', () => {
    expect(getCareerHonorCounts(null, 'x')).toEqual(getCareerHonorCounts([], 'x'));
    expect(getCareerHonorCounts(history, null).mvp).toBe(0);
    expect(aggregateCareerHonors(undefined).size).toBe(0);
  });

  it('tolerates retired/missing player refs inside entries', () => {
    const corrupt = [
      { year: 2025, awards: { MVP: null }, allPro: { firstTeam: [null, { playerId: 'a' }] }, proBowl: [undefined] },
      { year: 2026 }, // no awards/allPro/proBowl
    ];
    expect(() => aggregateCareerHonors(corrupt)).not.toThrow();
    expect(() => getCareerHonorCounts(corrupt, 'a')).not.toThrow();
    expect(getCareerHonorCounts(corrupt, 'a').firstTeamAllPro).toBe(1);
  });
});

// ── summarizeSeasonAwards (UI helper) ───────────────────────────────────────

describe('summarizeSeasonAwards', () => {
  it('produces compact major-award + leader rows', () => {
    const entry = buildAwardHistoryEntry({
      year: 2040,
      awardResults: {
        playerAwards: [award(AWARD_TYPES.MVP, 'q', 'QB', { name: 'Q' })],
        franchiseAwards: [],
        allProTeam: [{ type: 'ALL_PRO_QB', playerId: 'q', name: 'Q', pos: 'QB', teamId: 1 }],
      },
      prestigeAssignments: [honor('PRO_BOWL', 'q', 'QB')],
      stats: [statRow('q', 'QB', { passYd: 4800, passTD: 38 }, 'Q')],
      teamResolver,
    });
    const summary = summarizeSeasonAwards(entry);
    expect(summary.year).toBe(2040);
    expect(summary.majorAwards.find((r) => r.key === 'MVP').playerName).toBe('Q');
    expect(summary.firstTeamCount).toBe(1);
    expect(summary.proBowlCount).toBe(1);
    expect(summary.leaders.find((l) => l.key === 'passYd').value).toBe(4800);
  });

  it('returns a safe empty summary for missing entries', () => {
    const s = summarizeSeasonAwards(undefined);
    expect(s.majorAwards).toEqual([]);
    expect(s.leaders).toEqual([]);
    expect(s.firstTeamCount).toBe(0);
  });
});
