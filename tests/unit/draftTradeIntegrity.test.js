import { describe, it, expect } from 'vitest';
import {
  getPickIdentity,
  getPickOwnerId,
  getPickOriginalTeamId,
  getPickSeason,
  getPickRound,
  getPickValueKey,
  buildPickOwnershipIndex,
  validatePickOwnership,
  validateTradePickAssets,
  getPickLabel,
} from '../../src/core/trades/draftPickIntegrity.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePick(overrides = {}) {
  return {
    id: 'pick-1',
    round: 1,
    season: 2028,
    originalOwner: 10,
    currentOwner: 10,
    ...overrides,
  };
}

function makeLeague(teamPickMap = {}) {
  // teamPickMap: { teamId: [pick, ...] }
  const teams = Object.entries(teamPickMap).map(([id, picks]) => ({
    id: Number(id),
    abbr: `T${id}`,
    picks,
  }));
  return { teams };
}

// ── Accessor helpers ──────────────────────────────────────────────────────────

describe('getPickIdentity', () => {
  it('returns all canonical fields from a complete pick', () => {
    const id = getPickIdentity(makePick());
    expect(id.id).toBe('pick-1');
    expect(id.round).toBe(1);
    expect(id.season).toBe(2028);
    expect(id.originalOwner).toBe(10);
    expect(id.currentOwner).toBe(10);
  });

  it('falls back to year for season', () => {
    const id = getPickIdentity({ id: 'x', round: 2, year: 2027, originalOwner: 5, currentOwner: 5 });
    expect(id.season).toBe(2027);
  });

  it('returns nulls for missing fields', () => {
    const id = getPickIdentity({});
    expect(id.id).toBeNull();
    expect(id.round).toBeNull();
    expect(id.season).toBeNull();
    expect(id.originalOwner).toBeNull();
    expect(id.currentOwner).toBeNull();
  });

  it('handles null input gracefully', () => {
    const id = getPickIdentity(null);
    expect(id.id).toBeNull();
  });
});

describe('getPickOwnerId', () => {
  it('returns numeric currentOwner', () => {
    expect(getPickOwnerId({ currentOwner: '7' })).toBe(7);
    expect(getPickOwnerId({ currentOwner: 3 })).toBe(3);
  });

  it('returns null when missing', () => {
    expect(getPickOwnerId({})).toBeNull();
    expect(getPickOwnerId(null)).toBeNull();
  });
});

describe('getPickOriginalTeamId', () => {
  it('returns numeric originalOwner', () => {
    expect(getPickOriginalTeamId({ originalOwner: '12' })).toBe(12);
  });

  it('returns null when missing', () => {
    expect(getPickOriginalTeamId({})).toBeNull();
  });
});

describe('getPickSeason', () => {
  it('prefers season over year', () => {
    expect(getPickSeason({ season: 2029, year: 2028 })).toBe(2029);
  });

  it('falls back to year', () => {
    expect(getPickSeason({ year: 2027 })).toBe(2027);
  });

  it('returns null for missing', () => {
    expect(getPickSeason({})).toBeNull();
  });
});

describe('getPickRound', () => {
  it('returns numeric round', () => {
    expect(getPickRound({ round: '3' })).toBe(3);
  });

  it('returns null when missing', () => {
    expect(getPickRound({})).toBeNull();
  });
});

describe('getPickValueKey', () => {
  it('builds correct key for complete pick', () => {
    const pick = makePick({ season: 2029, round: 2, originalOwner: 5 });
    expect(getPickValueKey(pick)).toBe('2029-2-5');
  });

  it('uses year fallback', () => {
    expect(getPickValueKey({ year: 2027, round: 1, originalOwner: 3 })).toBe('2027-1-3');
  });

  it('uses x placeholders for missing fields', () => {
    expect(getPickValueKey({})).toBe('x-x-x');
    expect(getPickValueKey({ season: 2028 })).toBe('2028-x-x');
  });
});

// ── buildPickOwnershipIndex ───────────────────────────────────────────────────

describe('buildPickOwnershipIndex', () => {
  it('indexes all picks by id', () => {
    const league = makeLeague({
      10: [makePick({ id: 'p1', currentOwner: 10 })],
      20: [makePick({ id: 'p2', currentOwner: 20, originalOwner: 10 })],
    });
    const idx = buildPickOwnershipIndex(league);
    expect(idx.size).toBe(2);
    expect(idx.get('p1').teamId).toBe(10);
    expect(idx.get('p2').teamId).toBe(20);
  });

  it('skips picks without an id', () => {
    const league = makeLeague({ 5: [{ round: 1, season: 2028 }] });
    expect(buildPickOwnershipIndex(league).size).toBe(0);
  });

  it('handles empty teams array', () => {
    expect(buildPickOwnershipIndex({ teams: [] }).size).toBe(0);
    expect(buildPickOwnershipIndex({}).size).toBe(0);
    expect(buildPickOwnershipIndex(null).size).toBe(0);
  });

  it('stores the pick object and teamId together', () => {
    const pick = makePick({ id: 'pk-42', currentOwner: 7 });
    const idx = buildPickOwnershipIndex(makeLeague({ 7: [pick] }));
    const entry = idx.get('pk-42');
    expect(entry.pick).toBe(pick);
    expect(entry.teamId).toBe(7);
  });
});

// ── validatePickOwnership ─────────────────────────────────────────────────────

describe('validatePickOwnership — happy path', () => {
  it('passes when all teams have distinct well-formed picks', () => {
    const league = makeLeague({
      10: [makePick({ id: 'p1', round: 1, season: 2028, originalOwner: 10, currentOwner: 10 })],
      20: [makePick({ id: 'p2', round: 2, season: 2028, originalOwner: 20, currentOwner: 20 })],
    });
    const result = validatePickOwnership(league);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes when a pick was traded (currentOwner ≠ originalOwner, but matches containing team)', () => {
    const league = makeLeague({
      20: [makePick({ id: 'p1', round: 1, season: 2028, originalOwner: 10, currentOwner: 20 })],
    });
    const result = validatePickOwnership(league);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes for empty picks arrays', () => {
    const league = makeLeague({ 1: [], 2: [] });
    expect(validatePickOwnership(league).valid).toBe(true);
  });

  it('passes when no teams exist', () => {
    expect(validatePickOwnership({}).valid).toBe(true);
    expect(validatePickOwnership({ teams: [] }).valid).toBe(true);
  });
});

describe('validatePickOwnership — duplicate_pick_id', () => {
  it('detects the same pick ID on two different teams', () => {
    const league = makeLeague({
      10: [makePick({ id: 'dup', currentOwner: 10 })],
      20: [makePick({ id: 'dup', currentOwner: 20 })],
    });
    const result = validatePickOwnership(league);
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.code === 'duplicate_pick_id');
    expect(err).toBeTruthy();
    expect(err.context.pickId).toBe('dup');
  });

  it('skips picks without an id field', () => {
    const league = makeLeague({
      10: [{ round: 1, season: 2028 }],
      20: [{ round: 2, season: 2028 }],
    });
    expect(validatePickOwnership(league).valid).toBe(true);
  });
});

describe('validatePickOwnership — pick_owner_mismatch', () => {
  it('detects when currentOwner disagrees with the containing team', () => {
    const league = makeLeague({
      10: [makePick({ id: 'stale', currentOwner: 99 })],
    });
    const result = validatePickOwnership(league);
    const err = result.errors.find((e) => e.code === 'pick_owner_mismatch');
    expect(err).toBeTruthy();
    expect(err.context.teamId).toBe(10);
    expect(err.context.currentOwner).toBe(99);
  });

  it('does not flag when currentOwner is absent (legacy picks with no owner field)', () => {
    const league = makeLeague({
      10: [{ id: 'legacy', round: 1, season: 2028, originalOwner: 10 }],
    });
    const result = validatePickOwnership(league);
    const mismatch = result.errors.find((e) => e.code === 'pick_owner_mismatch');
    expect(mismatch).toBeUndefined();
  });
});

describe('validatePickOwnership — missing metadata', () => {
  it('flags missing round', () => {
    const league = makeLeague({
      10: [{ id: 'p1', season: 2028, originalOwner: 10, currentOwner: 10 }],
    });
    const errs = validatePickOwnership(league).errors;
    expect(errs.some((e) => e.code === 'pick_missing_round')).toBe(true);
  });

  it('flags missing season/year', () => {
    const league = makeLeague({
      10: [{ id: 'p1', round: 1, originalOwner: 10, currentOwner: 10 }],
    });
    const errs = validatePickOwnership(league).errors;
    expect(errs.some((e) => e.code === 'pick_missing_season')).toBe(true);
  });

  it('flags missing originalOwner', () => {
    const league = makeLeague({
      10: [{ id: 'p1', round: 1, season: 2028, currentOwner: 10 }],
    });
    const errs = validatePickOwnership(league).errors;
    expect(errs.some((e) => e.code === 'pick_missing_original_owner')).toBe(true);
  });

  it('uses legacy year field to satisfy season check', () => {
    const league = makeLeague({
      10: [{ id: 'p1', round: 2, year: 2027, originalOwner: 10, currentOwner: 10 }],
    });
    const errs = validatePickOwnership(league).errors;
    expect(errs.some((e) => e.code === 'pick_missing_season')).toBe(false);
  });
});

describe('validatePickOwnership — duplicate_pick_identity', () => {
  it('detects two picks with the same season+round+originalOwner', () => {
    const league = makeLeague({
      10: [makePick({ id: 'a', season: 2028, round: 1, originalOwner: 10, currentOwner: 10 })],
      20: [makePick({ id: 'b', season: 2028, round: 1, originalOwner: 10, currentOwner: 20 })],
    });
    const result = validatePickOwnership(league);
    const err = result.errors.find((e) => e.code === 'duplicate_pick_identity');
    expect(err).toBeTruthy();
    expect(err.context.valueKey).toBe('2028-1-10');
  });
});

// ── validateTradePickAssets ───────────────────────────────────────────────────

describe('validateTradePickAssets — happy path', () => {
  it('passes when team owns all outgoing picks', () => {
    const league = makeLeague({
      10: [
        makePick({ id: 'pk1', currentOwner: 10 }),
        makePick({ id: 'pk2', round: 2, currentOwner: 10 }),
      ],
    });
    const result = validateTradePickAssets(league, ['pk1', 'pk2'], 10);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes when outgoingPickIds is empty', () => {
    const result = validateTradePickAssets(makeLeague({}), [], 10);
    expect(result.valid).toBe(true);
  });

  it('passes when outgoingPickIds is undefined', () => {
    const result = validateTradePickAssets(makeLeague({}), undefined, 10);
    expect(result.valid).toBe(true);
  });
});

describe('validateTradePickAssets — wrong owner', () => {
  it('fails when pick is owned by a different team', () => {
    const league = makeLeague({
      20: [makePick({ id: 'stolen', currentOwner: 20 })],
    });
    const result = validateTradePickAssets(league, ['stolen'], 10);
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.code === 'pick_asset_wrong_owner');
    expect(err).toBeTruthy();
    expect(err.context.actualOwner).toBe(20);
    expect(err.context.teamId).toBe(10);
  });

  it('fails when pick was already traded away (not on any team)', () => {
    const league = makeLeague({ 10: [] });
    const result = validateTradePickAssets(league, ['ghost'], 10);
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.code === 'pick_asset_not_found');
    expect(err).toBeTruthy();
    expect(err.context.pickId).toBe('ghost');
  });

  it('flags null pick IDs in the outgoing list', () => {
    const result = validateTradePickAssets(makeLeague({}), [null], 10);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('pick_asset_null_id');
  });
});

describe('validateTradePickAssets — traded pick cannot be re-traded', () => {
  it('rejects a pick that moved to another team (previously traded away)', () => {
    // Team 10 originally owned 'orig-pick' but it was traded to team 20.
    const league = makeLeague({
      10: [],
      20: [makePick({ id: 'orig-pick', originalOwner: 10, currentOwner: 20 })],
    });
    // Team 10 tries to include 'orig-pick' in a new trade — must fail.
    const result = validateTradePickAssets(league, ['orig-pick'], 10);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('pick_asset_wrong_owner');
    expect(result.errors[0].context.actualOwner).toBe(20);
  });
});

// ── getPickLabel ──────────────────────────────────────────────────────────────

describe('getPickLabel — basic formatting', () => {
  it('formats a round-1 pick for 2028', () => {
    expect(getPickLabel(makePick({ season: 2028, round: 1 }))).toBe('2028 1st Round');
  });

  it('formats all rounds with correct ordinals', () => {
    expect(getPickLabel(makePick({ season: 2028, round: 2 }))).toBe('2028 2nd Round');
    expect(getPickLabel(makePick({ season: 2028, round: 3 }))).toBe('2028 3rd Round');
    expect(getPickLabel(makePick({ season: 2028, round: 4 }))).toBe('2028 4th Round');
    expect(getPickLabel(makePick({ season: 2028, round: 5 }))).toBe('2028 5th Round');
    expect(getPickLabel(makePick({ season: 2028, round: 6 }))).toBe('2028 6th Round');
    expect(getPickLabel(makePick({ season: 2028, round: 7 }))).toBe('2028 7th Round');
  });

  it('returns "Future pick" for null input', () => {
    expect(getPickLabel(null)).toBe('Future pick');
    expect(getPickLabel(undefined)).toBe('Future pick');
  });

  it('omits season prefix when season is absent', () => {
    expect(getPickLabel({ round: 2 })).toBe('2nd Round');
  });
});

describe('getPickLabel — via suffix when ownership changed', () => {
  it('shows "via TEAM" when originalOwner differs from currentOwner', () => {
    const pick = makePick({ season: 2028, round: 1, originalOwner: 99, currentOwner: 7 });
    const teamLookup = new Map([[99, { abbr: 'PIT' }]]);
    expect(getPickLabel(pick, teamLookup)).toBe('2028 1st Round via PIT');
  });

  it('shows "via team:ID" when team lookup has no abbr entry', () => {
    const pick = makePick({ season: 2028, round: 2, originalOwner: 99, currentOwner: 7 });
    expect(getPickLabel(pick, null)).toBe('2028 2nd Round via team:99');
    expect(getPickLabel(pick, new Map())).toBe('2028 2nd Round via team:99');
  });

  it('does NOT show via suffix when ownership has not changed', () => {
    const pick = makePick({ season: 2028, round: 1, originalOwner: 10, currentOwner: 10 });
    const teamLookup = new Map([[10, { abbr: 'DAL' }]]);
    expect(getPickLabel(pick, teamLookup)).toBe('2028 1st Round');
  });

  it('does NOT show via suffix when originalOwner is absent', () => {
    const pick = { id: 'pk', round: 1, season: 2028, currentOwner: 5 };
    expect(getPickLabel(pick, new Map([[10, { abbr: 'TB' }]]))).toBe('2028 1st Round');
  });

  it('works with plain-object teamLookup (not a Map)', () => {
    const pick = makePick({ season: 2029, round: 3, originalOwner: 4, currentOwner: 8 });
    const lookup = { 4: { abbr: 'GB' } };
    expect(getPickLabel(pick, lookup)).toBe('2029 3rd Round via GB');
  });
});

describe('getPickLabel — uses legacy year field', () => {
  it('uses year when season is absent', () => {
    const pick = { id: 'p', round: 2, year: 2027, originalOwner: 3, currentOwner: 3 };
    expect(getPickLabel(pick)).toBe('2027 2nd Round');
  });

  it('prefers season over year', () => {
    const pick = { id: 'p', round: 1, season: 2030, year: 2027, originalOwner: 3, currentOwner: 3 };
    expect(getPickLabel(pick)).toBe('2030 1st Round');
  });
});

// ── Trade transfer simulation ─────────────────────────────────────────────────

describe('ownership index after simulated trade transfer', () => {
  it('reflects exactly one owner after a pick moves from team A to team B', () => {
    // Before trade: team 10 owns pick-X.
    const before = makeLeague({
      10: [makePick({ id: 'pick-X', currentOwner: 10 })],
      20: [],
    });
    const idxBefore = buildPickOwnershipIndex(before);
    expect(idxBefore.get('pick-X').teamId).toBe(10);

    // Simulate transferPickOwnership: remove from 10, add to 20 with updated currentOwner.
    const after = makeLeague({
      10: [],
      20: [makePick({ id: 'pick-X', originalOwner: 10, currentOwner: 20 })],
    });
    const idxAfter = buildPickOwnershipIndex(after);
    expect(idxAfter.get('pick-X').teamId).toBe(20);
    expect(idxAfter.get('pick-X').pick.currentOwner).toBe(20);
    expect(idxAfter.get('pick-X').pick.originalOwner).toBe(10);

    // Ownership validation should pass in both states.
    expect(validatePickOwnership(before).valid).toBe(true);
    expect(validatePickOwnership(after).valid).toBe(true);
  });

  it('detects duplicate if transfer is applied incorrectly (pick left on both teams)', () => {
    // Bug scenario: pick was "copied" to receiving team but not removed from sending team.
    const bugged = makeLeague({
      10: [makePick({ id: 'pick-X', currentOwner: 10 })],
      20: [makePick({ id: 'pick-X', currentOwner: 20 })],
    });
    const result = validatePickOwnership(bugged);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'duplicate_pick_id')).toBe(true);
  });
});

describe('full-cycle: build, trade, validate, label', () => {
  it('tracks a 2028 R1 pick from DAL to PIT end-to-end', () => {
    const teamLookup = new Map([
      [1, { abbr: 'DAL' }],
      [2, { abbr: 'PIT' }],
    ]);

    // Initial state: DAL owns their own 2028 R1 pick.
    const initial = makeLeague({
      1: [makePick({ id: '2028-r1-dal', round: 1, season: 2028, originalOwner: 1, currentOwner: 1 })],
      2: [],
    });

    // Ownership index shows DAL as owner.
    const idx0 = buildPickOwnershipIndex(initial);
    expect(idx0.get('2028-r1-dal').teamId).toBe(1);

    // Validate outgoing trade assets for DAL offering this pick.
    const tradeCheck = validateTradePickAssets(initial, ['2028-r1-dal'], 1);
    expect(tradeCheck.valid).toBe(true);

    // PIT cannot claim to be offering this pick — they don't own it.
    const badCheck = validateTradePickAssets(initial, ['2028-r1-dal'], 2);
    expect(badCheck.valid).toBe(false);
    expect(badCheck.errors[0].code).toBe('pick_asset_wrong_owner');

    // After trade: pick moves to PIT.
    const afterTrade = makeLeague({
      1: [],
      2: [makePick({ id: '2028-r1-dal', round: 1, season: 2028, originalOwner: 1, currentOwner: 2 })],
    });

    expect(validatePickOwnership(afterTrade).valid).toBe(true);

    // Label shows "via DAL" since PIT now holds the original DAL pick.
    const pick = afterTrade.teams[1].picks[0];
    expect(getPickLabel(pick, teamLookup)).toBe('2028 1st Round via DAL');

    // DAL can no longer offer that pick — it now belongs to PIT.
    const reTradeCheck = validateTradePickAssets(afterTrade, ['2028-r1-dal'], 1);
    expect(reTradeCheck.valid).toBe(false);
    // The pick still exists (on PIT), so the error is wrong_owner rather than not_found.
    expect(reTradeCheck.errors[0].code).toBe('pick_asset_wrong_owner');
  });
});

// ── soak: duplicate pick detection maps to expected code ─────────────────────

describe('soak audit backward-compat: duplicate_draft_pick_id code is still emitted', () => {
  it('dynastySoakAudit still emits duplicate_draft_pick_id for cross-team duplicate picks', async () => {
    const { runDynastySoakAudit } = await import('../../src/core/dynastySoakAudit.js');

    function mkRoster(prefix) {
      return [
        { id: `${prefix}qb`, pos: 'QB', age: 26, ovr: 78, potential: 82, contract: { yearsRemaining: 2, baseAnnual: 5 } },
        ...Array.from({ length: 44 }, (_, i) => ({
          id: `${prefix}${i}`,
          pos: ['OL', 'WR', 'CB', 'DL', 'LB', 'S', 'TE', 'RB'][i % 8],
          age: 23,
          ovr: 70,
          potential: 75,
          contract: { yearsRemaining: 2, baseAnnual: 2 },
        })),
      ];
    }

    const teams = [
      {
        id: 0, abbr: 'AAA', wins: 8, losses: 8, ptsFor: 300, ptsAgainst: 280,
        capUsed: 200, capRoom: 100, capTotal: 301,
        roster: mkRoster('a'),
        picks: [{ id: 'DUPID', round: 1, season: 2028, originalOwner: 0, currentOwner: 0 }],
      },
      {
        id: 1, abbr: 'BBB', wins: 7, losses: 9, ptsFor: 280, ptsAgainst: 300,
        capUsed: 210, capRoom: 90, capTotal: 301,
        roster: mkRoster('b'),
        picks: [{ id: 'DUPID', round: 1, season: 2028, originalOwner: 0, currentOwner: 1 }],
      },
    ];

    const viewState = {
      phase: 'preseason', year: 2028, userTeamId: 0, seasonId: 's3',
      schedule: { weeks: [{ week: 1, games: [{ home: 0, away: 1 }] }] },
      standings: [{ id: 0, wins: 8, losses: 8 }],
      leagueHistory: [], recordBook: { schemaVersion: 1 }, hallOfFameClasses: [],
      teams,
    };

    const result = runDynastySoakAudit({ viewState, seasonIndex: 1 });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.code === 'duplicate_draft_pick_id')).toBe(true);
  });
});

// ── soak: new ownership invariants ───────────────────────────────────────────

describe('soak audit: pick_owner_mismatch is reported', () => {
  it('emits pick_owner_mismatch when currentOwner disagrees with containing team', async () => {
    const { runDynastySoakAudit } = await import('../../src/core/dynastySoakAudit.js');

    function mkRoster(prefix) {
      return [
        { id: `${prefix}qb`, pos: 'QB', age: 26, ovr: 78, potential: 82, contract: { yearsRemaining: 2, baseAnnual: 5 } },
        ...Array.from({ length: 44 }, (_, i) => ({
          id: `${prefix}${i}`,
          pos: ['OL', 'WR', 'CB', 'DL', 'LB', 'S', 'TE', 'RB'][i % 8],
          age: 23, ovr: 70, potential: 75, contract: { yearsRemaining: 2, baseAnnual: 2 },
        })),
      ];
    }

    const teams = [
      {
        id: 0, abbr: 'AAA', wins: 8, losses: 8, ptsFor: 300, ptsAgainst: 280,
        capUsed: 200, capRoom: 100, capTotal: 301,
        roster: mkRoster('a'),
        // Pick says currentOwner: 99 but is in team 0's array — stale ownership field.
        picks: [{ id: 'stale-pk', round: 2, season: 2028, originalOwner: 0, currentOwner: 99 }],
      },
      {
        id: 1, abbr: 'BBB', wins: 7, losses: 9, ptsFor: 280, ptsAgainst: 300,
        capUsed: 210, capRoom: 90, capTotal: 301,
        roster: mkRoster('b'),
        picks: [],
      },
    ];

    const viewState = {
      phase: 'preseason', year: 2028, userTeamId: 0, seasonId: 's3',
      schedule: { weeks: [{ week: 1, games: [{ home: 0, away: 1 }] }] },
      standings: [{ id: 0, wins: 8, losses: 8 }],
      leagueHistory: [], recordBook: { schemaVersion: 1 }, hallOfFameClasses: [],
      teams,
    };

    const result = runDynastySoakAudit({ viewState, seasonIndex: 1 });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.code === 'pick_owner_mismatch')).toBe(true);
  });
});
