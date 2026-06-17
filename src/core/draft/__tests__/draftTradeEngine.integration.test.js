/**
 * draftTradeEngine.integration.test.js
 *
 * Integration tests: verify the engine functions interact correctly as a system.
 * Tests combine metrics persistence, pick ownership transfers, trade record
 * creation, user-offer flow, decline guard, and legacy-save compatibility.
 *
 * No cache, no worker, no DB — pure function calls only.
 */

import { describe, it, expect } from 'vitest';
import {
  DRAFT_TRADE_CONFIG,
  isCombineStandout,
  findDraftTradeUpOpportunity,
  applyDraftTradeUp,
} from '../draftTradeEngine.js';
import {
  generateCombineMetricsForClass,
} from '../combineEngine.js';

// ── Shared fixtures ────────────────────────────────────────────────────────────

function makeTeam(overrides = {}) {
  return {
    id: 1,
    name: 'Default Team',
    abbr: 'DFT',
    ovr: 75,
    capSpace: 25.0,
    capRoom: 25.0,
    wins: 8,
    losses: 8,
    ...overrides,
  };
}

function makePlayer(overrides = {}) {
  return {
    id: 100,
    name: 'Roster Player',
    pos: 'WR',
    ovr: 80,
    status: 'active',
    teamId: 1,
    ...overrides,
  };
}

function makePick(overrides = {}) {
  return {
    overall: 1,
    round: 1,
    pick: 1,
    teamId: 1,
    playerId: null,
    ...overrides,
  };
}

function makeFuturePick(overrides = {}) {
  return {
    id: 'fp1',
    round: 2,
    season: 2026,
    currentOwner: 20,
    teamId: 20,
    ...overrides,
  };
}

function buildMinimalState({
  picks = [],
  currentPickIndex = 0,
  draftPool = [],
  teams = [],
  rosters = [],
  futurePicks = [],
  userTeamId = 99,
  year = 2025,
  extraMeta = {},
} = {}) {
  return {
    meta: {
      userTeamId,
      year,
      draftState: { picks, currentPickIndex },
      tradeOffers: [],
      ...extraMeta,
    },
    teams,
    rosters,
    draftPool,
    futurePicks,
  };
}

// ── 1. Combine metrics persisted onto draft prospects before draft stage ────────

describe('integration — combine metrics on draft prospects', () => {
  it('generateCombineMetricsForClass attaches combineGrade to each draft_eligible prospect', () => {
    const prospects = [
      { id: 1, name: 'A', pos: 'WR', age: 22, ovr: 85, trueOvr: 85, status: 'draft_eligible',
        ratings: { speed: 92, agility: 88, acceleration: 85 }, scoutedRanges: {} },
      { id: 2, name: 'B', pos: 'QB', age: 21, ovr: 78, trueOvr: 78, status: 'draft_eligible',
        ratings: { speed: 72, agility: 68 }, scoutedRanges: {} },
    ];

    const result = generateCombineMetricsForClass(prospects, 2025);

    expect(result).toHaveLength(2);
    result.forEach((p) => {
      expect(p.combineMetrics).not.toBeNull();
      expect(p.combineMetrics).not.toBeUndefined();
      expect(p.combineMetrics.combineGrade).toBeTypeOf('number');
      expect(p.combineMetrics.fortyYardDash).toBeTypeOf('number');
      expect(p.combineMetrics.benchPressReps).toBeTypeOf('number');
    });
  });

  it('a prospect with combineGrade >= 8.5 passes isCombineStandout', () => {
    const base = { id: 1, name: 'A', pos: 'WR', age: 22, ovr: 90, trueOvr: 90, status: 'draft_eligible',
      ratings: { speed: 95, agility: 92, acceleration: 90 }, scoutedRanges: {} };
    const [withMetrics] = generateCombineMetricsForClass([base], 2025);

    // Whether or not this specific seed yields >= 8.5, isCombineStandout must not throw
    expect(() => isCombineStandout(withMetrics)).not.toThrow();
    // A prospect with explicitly high grade is a standout
    const highGrade = { ...withMetrics, combineMetrics: { combineGrade: 9.5 } };
    expect(isCombineStandout(highGrade)).toBe(true);
  });
});

// ── 2. AI-to-AI trade-up swaps pick ownership correctly ───────────────────────

describe('integration — AI-to-AI pick ownership swap', () => {
  it('applyDraftTradeUp transfers currentPick.teamId to buyer and buyer later pick to seller', () => {
    // capSpace=50 clears round-1 rookie contract at pick #3 (~$33.3M from ROOKIE_SCALE max=35).
    const seller = makeTeam({ id: 5, name: 'Sellers', abbr: 'SEL', wins: 5, losses: 11, capSpace: 50 });
    const buyer  = makeTeam({ id: 10, name: 'Buyers', abbr: 'BUY', wins: 5, losses: 11, capSpace: 50 });
    const allTeams = [seller, buyer];

    const picks = [
      makePick({ overall: 3, round: 1, pick: 3, teamId: 5 }),   // current — seller
      makePick({ overall: 8, round: 1, pick: 8, teamId: 10 }),  // buyer's later pick
    ];

    const standout = {
      id: 77, name: 'Speedy', pos: 'WR', ovr: 88, projectedRound: 1,
      combineMetrics: { combineGrade: 9.0 },
    };

    // Seller has a WR starter (ovr>=75) → isSellerWillingToMoveDown returns true (already covered).
    // Buyer has a weak WR → severe need → buyer wants to trade up.
    const rosters = [
      makePlayer({ id: 200, pos: 'WR', ovr: 68, teamId: 10, status: 'active' }),
      makePlayer({ id: 201, pos: 'WR', ovr: 80, teamId: 5,  status: 'active' }),
    ];

    const futurePick = makeFuturePick({ id: 'fp1', round: 2, currentOwner: 10, teamId: 10 });

    const state = buildMinimalState({
      picks,
      currentPickIndex: 0,
      draftPool: [standout],
      teams: allTeams,
      rosters,
      futurePicks: [futurePick],
      userTeamId: 99,
    });

    const opportunity = findDraftTradeUpOpportunity(state);
    expect(opportunity).not.toBeNull();
    expect(opportunity.type).toBe('ai_to_ai');

    const result = applyDraftTradeUp(opportunity, state);
    const newPicks = result.state.meta.draftState.picks;

    // Pick #3 (overall=3) should now belong to buyer (10)
    expect(newPicks[0].teamId).toBe(10);
    // Pick #8 (overall=8, buyer's later pick) should now belong to seller (5)
    expect(newPicks[1].teamId).toBe(5);
  });
});

// ── 3. Transferred future pick remains indexed to buyer/seller correctly ────────

describe('integration — future pick transfer', () => {
  it('applyDraftTradeUp updates currentOwner of future pick to sellerTeamId', () => {
    const seller = makeTeam({ id: 5, abbr: 'SEL', wins: 5, losses: 11, capSpace: 50 });
    const buyer  = makeTeam({ id: 10, abbr: 'BUY', wins: 5, losses: 11, capSpace: 50 });

    const picks = [
      makePick({ overall: 3, round: 1, teamId: 5 }),
      makePick({ overall: 8, round: 1, teamId: 10 }),
    ];

    const standout = {
      id: 77, name: 'Speedy', pos: 'WR', ovr: 88, projectedRound: 1,
      combineMetrics: { combineGrade: 9.2 },
    };

    const rosters = [
      makePlayer({ id: 200, pos: 'WR', ovr: 68, teamId: 10, status: 'active' }),
      makePlayer({ id: 201, pos: 'WR', ovr: 80, teamId: 5,  status: 'active' }),
    ];

    const futurePick = makeFuturePick({ id: 'fp_future', round: 2, season: 2026, currentOwner: 10, teamId: 10 });

    const state = buildMinimalState({
      picks, currentPickIndex: 0,
      draftPool: [standout], teams: [seller, buyer],
      rosters, futurePicks: [futurePick],
      userTeamId: 99,
    });

    const opp = findDraftTradeUpOpportunity(state);
    expect(opp).not.toBeNull();

    const result = applyDraftTradeUp(opp, state);

    const movedFp = result.state.futurePicks.find((fp) => fp.id === 'fp_future');
    expect(movedFp).toBeDefined();
    // Future pick should now be owned by seller (5)
    expect(movedFp.currentOwner).toBe(5);
    expect(movedFp.teamId).toBe(5);
  });
});

// ── 4. AI-to-AI trade-up emits formatted milestone headline ───────────────────

describe('integration — headline format', () => {
  it('headline text matches the DRAFT SHOCK format with buyer team name and prospect', () => {
    const seller = makeTeam({ id: 5, name: 'Coastal Sharks', abbr: 'COS', wins: 5, losses: 11, capSpace: 50 });
    const buyer  = makeTeam({ id: 10, name: 'Mountain Lions', abbr: 'MTN', wins: 5, losses: 11, capSpace: 50 });

    const picks = [
      makePick({ overall: 5, round: 1, teamId: 5 }),
      makePick({ overall: 12, round: 1, teamId: 10 }),
    ];

    const standout = {
      id: 33, name: 'Flash Gordon', pos: 'WR', ovr: 90, projectedRound: 1,
      combineMetrics: { combineGrade: 9.5 },
    };

    const rosters = [
      makePlayer({ id: 200, pos: 'WR', ovr: 60, teamId: 10, status: 'active' }),
      makePlayer({ id: 201, pos: 'WR', ovr: 80, teamId: 5,  status: 'active' }),
    ];

    const futurePick = makeFuturePick({ id: 'fp1', round: 3, currentOwner: 10, teamId: 10 });

    const state = buildMinimalState({
      picks, currentPickIndex: 0,
      draftPool: [standout], teams: [seller, buyer],
      rosters, futurePicks: [futurePick],
      userTeamId: 99,
    });

    const opp = findDraftTradeUpOpportunity(state);
    expect(opp).not.toBeNull();

    const result = applyDraftTradeUp(opp, state);
    expect(result.headline).not.toBeNull();
    expect(result.headline.text).toContain('DRAFT SHOCK');
    expect(result.headline.text).toContain('Mountain Lions');
    expect(result.headline.text).toContain('Flash Gordon');
    expect(result.headline.category).toBe('MILESTONE');
  });
});

// ── 5. AI-to-AI trade-up creates draft ticker payload ─────────────────────────

describe('integration — ticker payload', () => {
  it('ticker text contains TRADE-UP and buyer abbr and pick number', () => {
    const seller = makeTeam({ id: 5, name: 'Coastal Sharks', abbr: 'COS', wins: 5, losses: 11, capSpace: 50 });
    const buyer  = makeTeam({ id: 10, name: 'Mountain Lions', abbr: 'MTN', wins: 5, losses: 11, capSpace: 50 });

    const picks = [
      makePick({ overall: 5, round: 1, teamId: 5 }),
      makePick({ overall: 12, round: 1, teamId: 10 }),
    ];

    const standout = {
      id: 33, name: 'Flash Gordon', pos: 'WR', ovr: 90, projectedRound: 1,
      combineMetrics: { combineGrade: 9.5 },
    };

    const rosters = [
      makePlayer({ id: 200, pos: 'WR', ovr: 60, teamId: 10, status: 'active' }),
      makePlayer({ id: 201, pos: 'WR', ovr: 80, teamId: 5,  status: 'active' }),
    ];

    const futurePick = makeFuturePick({ id: 'fp1', round: 3, currentOwner: 10, teamId: 10 });

    const state = buildMinimalState({
      picks, currentPickIndex: 0,
      draftPool: [standout], teams: [seller, buyer],
      rosters, futurePicks: [futurePick],
      userTeamId: 99,
    });

    const opp = findDraftTradeUpOpportunity(state);
    expect(opp).not.toBeNull();

    const result = applyDraftTradeUp(opp, state);
    expect(result.ticker).not.toBeNull();
    expect(result.ticker.text).toContain('TRADE-UP');
    expect(result.ticker.text).toContain('MTN');
    expect(result.ticker.text).toContain('5');
    expect(result.ticker.type).toBe('draft_trade_up');
    expect(result.state.meta.draftLastTradeUp).toEqual(result.ticker);
  });
});

// ── 6. Trade-up blocked when buyer cap insufficient for rookie slot ─────────────

describe('integration — cap gate', () => {
  it('findDraftTradeUpOpportunity returns null when buyer has no cap space', () => {
    const seller = makeTeam({ id: 5, abbr: 'SEL', wins: 5, losses: 11, capSpace: 50 });
    const buyer  = makeTeam({
      id: 10, abbr: 'BUY', wins: 5, losses: 11,
      capSpace: 0,   // broke — intentionally 0 to verify the cap gate
      capRoom: 0,
    });

    const picks = [
      makePick({ overall: 3, round: 1, teamId: 5 }),
      makePick({ overall: 9, round: 1, teamId: 10 }),
    ];

    const standout = {
      id: 77, name: 'Speedy', pos: 'WR', ovr: 88, projectedRound: 1,
      combineMetrics: { combineGrade: 9.0 },
    };

    // Seller has a WR starter → isSellerWillingToMoveDown returns true (ensures we reach the cap check).
    const rosters = [
      makePlayer({ id: 200, pos: 'WR', ovr: 60, teamId: 10, status: 'active' }),
      makePlayer({ id: 201, pos: 'WR', ovr: 80, teamId: 5,  status: 'active' }),
    ];

    const futurePick = makeFuturePick({ id: 'fp1', round: 2, currentOwner: 10, teamId: 10 });

    const state = buildMinimalState({
      picks, currentPickIndex: 0,
      draftPool: [standout], teams: [seller, buyer],
      rosters, futurePicks: [futurePick],
      userTeamId: 99,
    });

    const opp = findDraftTradeUpOpportunity(state);
    expect(opp).toBeNull();
  });
});

// ── 7. When user holds pick, type is 'ai_to_user' ─────────────────────────────

describe('integration — ai_to_user offer', () => {
  it('returns type ai_to_user when seller is the user team', () => {
    const userTeamId = 1;
    const seller = makeTeam({ id: userTeamId, abbr: 'USR', wins: 8, losses: 8, capSpace: 50 });
    const buyer  = makeTeam({ id: 10, abbr: 'BUY', wins: 5, losses: 11, capSpace: 50 });

    const picks = [
      makePick({ overall: 4, round: 1, teamId: userTeamId }),
      makePick({ overall: 11, round: 1, teamId: 10 }),
    ];

    const standout = {
      id: 55, name: 'JetSpeed', pos: 'WR', ovr: 89, projectedRound: 1,
      combineMetrics: { combineGrade: 9.1 },
    };

    // Seller (user team) already has a WR starter → willing to move down (sell the pick).
    const rosters = [
      makePlayer({ id: 300, pos: 'WR', ovr: 65, teamId: 10,         status: 'active' }),
      makePlayer({ id: 301, pos: 'WR', ovr: 80, teamId: userTeamId, status: 'active' }),
    ];

    const futurePick = makeFuturePick({ id: 'fp1', round: 2, currentOwner: 10, teamId: 10 });

    const state = buildMinimalState({
      picks, currentPickIndex: 0,
      draftPool: [standout], teams: [seller, buyer],
      rosters, futurePicks: [futurePick],
      userTeamId,
    });

    const opp = findDraftTradeUpOpportunity(state);
    expect(opp).not.toBeNull();
    expect(opp.type).toBe('ai_to_user');
    expect(opp.sellerTeamId).toBe(userTeamId);
    expect(opp.buyerTeamId).toBe(10);
  });

  it('applyDraftTradeUp returns pausedForUserOffer=true for ai_to_user type', () => {
    const userTeamId = 1;
    const seller = makeTeam({ id: userTeamId, abbr: 'USR', wins: 8, losses: 8, capSpace: 50 });
    const buyer  = makeTeam({ id: 10, abbr: 'BUY', wins: 5, losses: 11, capSpace: 50 });

    const picks = [
      makePick({ overall: 4, round: 1, teamId: userTeamId }),
      makePick({ overall: 11, round: 1, teamId: 10 }),
    ];

    const standout = {
      id: 55, name: 'JetSpeed', pos: 'WR', ovr: 89, projectedRound: 1,
      combineMetrics: { combineGrade: 9.1 },
    };

    const rosters = [
      makePlayer({ id: 300, pos: 'WR', ovr: 65, teamId: 10,         status: 'active' }),
      makePlayer({ id: 301, pos: 'WR', ovr: 80, teamId: userTeamId, status: 'active' }),
    ];

    const futurePick = makeFuturePick({ id: 'fp1', round: 2, currentOwner: 10, teamId: 10 });

    const state = buildMinimalState({
      picks, currentPickIndex: 0,
      draftPool: [standout], teams: [seller, buyer],
      rosters, futurePicks: [futurePick],
      userTeamId,
    });

    const opp = findDraftTradeUpOpportunity(state);
    const result = applyDraftTradeUp(opp, state);
    expect(result.pausedForUserOffer).toBe(true);
  });
});

// ── 8. User offer stored in meta.tradeOffers with origin 'draft_trade_up' ──────

describe('integration — trade offer record', () => {
  it('applyDraftTradeUp appends a record with origin: draft_trade_up to tradeOffers', () => {
    const seller = makeTeam({ id: 5, abbr: 'SEL', wins: 5, losses: 11, capSpace: 50 });
    const buyer  = makeTeam({ id: 10, abbr: 'BUY', wins: 5, losses: 11, capSpace: 50 });

    const picks = [
      makePick({ overall: 3, round: 1, teamId: 5 }),
      makePick({ overall: 8, round: 1, teamId: 10 }),
    ];

    const standout = {
      id: 77, name: 'Speedy', pos: 'WR', ovr: 88, projectedRound: 1,
      combineMetrics: { combineGrade: 9.0 },
    };

    const rosters = [
      makePlayer({ id: 200, pos: 'WR', ovr: 68, teamId: 10, status: 'active' }),
      makePlayer({ id: 201, pos: 'WR', ovr: 80, teamId: 5,  status: 'active' }),
    ];

    const futurePick = makeFuturePick({ id: 'fp1', round: 2, currentOwner: 10, teamId: 10 });

    const state = buildMinimalState({
      picks, currentPickIndex: 0,
      draftPool: [standout], teams: [seller, buyer],
      rosters, futurePicks: [futurePick],
      userTeamId: 99,
    });

    const opp = findDraftTradeUpOpportunity(state);
    const result = applyDraftTradeUp(opp, state);

    const offers = result.state.meta.tradeOffers;
    expect(Array.isArray(offers)).toBe(true);
    expect(offers.length).toBe(1);

    const offer = offers[0];
    expect(offer.origin).toBe('draft_trade_up');
    expect(offer.offerId).toMatch(/^dtup_/);
    expect(offer.buyerTeamId).toBe(10);
    expect(offer.sellerTeamId).toBe(5);
    expect(offer.pickNumber).toBe(3);
  });
});

// ── 9. Draft loop does not double-evaluate same pick after decline ──────────────

describe('integration — double-evaluation guard', () => {
  it('findDraftTradeUpOpportunity returns null when draftTradeUpEvaluatedPickIdx matches currentPickIndex', () => {
    const seller = makeTeam({ id: 5, abbr: 'SEL', wins: 5, losses: 11, capSpace: 50 });
    const buyer  = makeTeam({ id: 10, abbr: 'BUY', wins: 5, losses: 11, capSpace: 50 });

    const picks = [
      makePick({ overall: 3, round: 1, teamId: 5 }),
      makePick({ overall: 8, round: 1, teamId: 10 }),
    ];

    const standout = {
      id: 77, name: 'Speedy', pos: 'WR', ovr: 88, projectedRound: 1,
      combineMetrics: { combineGrade: 9.0 },
    };

    const rosters = [
      makePlayer({ id: 200, pos: 'WR', ovr: 68, teamId: 10, status: 'active' }),
      makePlayer({ id: 201, pos: 'WR', ovr: 80, teamId: 5,  status: 'active' }),
    ];

    const futurePick = makeFuturePick({ id: 'fp1', round: 2, currentOwner: 10, teamId: 10 });

    // Simulate: pick index 0 was already evaluated
    const state = buildMinimalState({
      picks, currentPickIndex: 0,
      draftPool: [standout], teams: [seller, buyer],
      rosters, futurePicks: [futurePick],
      userTeamId: 99,
      extraMeta: { draftTradeUpEvaluatedPickIdx: 0 },
    });

    const opp = findDraftTradeUpOpportunity(state);
    expect(opp).toBeNull();
  });

  it('applyDraftTradeUp sets draftTradeUpEvaluatedPickIdx on the returned state', () => {
    const seller = makeTeam({ id: 5, abbr: 'SEL', wins: 5, losses: 11, capSpace: 50 });
    const buyer  = makeTeam({ id: 10, abbr: 'BUY', wins: 5, losses: 11, capSpace: 50 });

    const picks = [
      makePick({ overall: 3, round: 1, teamId: 5 }),
      makePick({ overall: 8, round: 1, teamId: 10 }),
    ];

    const standout = {
      id: 77, name: 'Speedy', pos: 'WR', ovr: 88, projectedRound: 1,
      combineMetrics: { combineGrade: 9.0 },
    };

    const rosters = [
      makePlayer({ id: 200, pos: 'WR', ovr: 68, teamId: 10, status: 'active' }),
      makePlayer({ id: 201, pos: 'WR', ovr: 80, teamId: 5,  status: 'active' }),
    ];

    const futurePick = makeFuturePick({ id: 'fp1', round: 2, currentOwner: 10, teamId: 10 });

    const state = buildMinimalState({
      picks, currentPickIndex: 0,
      draftPool: [standout], teams: [seller, buyer],
      rosters, futurePicks: [futurePick],
      userTeamId: 99,
    });

    const opp = findDraftTradeUpOpportunity(state);
    expect(opp).not.toBeNull();

    const result = applyDraftTradeUp(opp, state);
    expect(result.state.meta.draftTradeUpEvaluatedPickIdx).toBe(0);
  });
});

// ── 10. Legacy save without combineMetrics does not crash ──────────────────────

describe('integration — legacy save graceful handling', () => {
  it('findDraftTradeUpOpportunity returns null when no prospects have combineMetrics', () => {
    const seller = makeTeam({ id: 5, abbr: 'SEL', wins: 5, losses: 11, capSpace: 30 });
    const buyer  = makeTeam({ id: 10, abbr: 'BUY', wins: 5, losses: 11, capSpace: 30 });

    const picks = [
      makePick({ overall: 3, round: 1, teamId: 5 }),
      makePick({ overall: 8, round: 1, teamId: 10 }),
    ];

    // No combineMetrics — old save format
    const legacyProspects = [
      { id: 1, name: 'OldSave Player A', pos: 'WR', ovr: 88, projectedRound: 1 },
      { id: 2, name: 'OldSave Player B', pos: 'QB', ovr: 85, projectedRound: 1 },
    ];

    const state = buildMinimalState({
      picks, currentPickIndex: 0,
      draftPool: legacyProspects,
      teams: [seller, buyer],
      rosters: [],
      futurePicks: [],
      userTeamId: 99,
    });

    let result;
    expect(() => { result = findDraftTradeUpOpportunity(state); }).not.toThrow();
    expect(result).toBeNull();
  });

  it('isCombineStandout returns false (not throws) when combineMetrics is undefined', () => {
    const legacyProspect = { id: 1, name: 'OldSave', pos: 'WR', ovr: 90 };
    expect(() => isCombineStandout(legacyProspect)).not.toThrow();
    expect(isCombineStandout(legacyProspect)).toBe(false);
  });

  it('isCombineStandout returns false when combineMetrics exists but combineGrade is null', () => {
    const prospect = { id: 1, name: 'Partial', pos: 'WR', ovr: 88, combineMetrics: { combineGrade: null } };
    expect(isCombineStandout(prospect)).toBe(false);
  });
});
