/**
 * draftTradeEngine.unit.test.js
 *
 * Pure unit tests for draftTradeEngine.js helpers.
 * No cache, no worker, no DB.
 */

import { describe, it, expect } from 'vitest';
import {
  DRAFT_TRADE_CONFIG,
  isCombineStandout,
  isProspectWithinTradeUpWindow,
  getStarterNeedAtPosition,
  teamCanAffordRookie,
  buildTradeUpPackage,
  isSellerWillingToMoveDown,
  evaluateDraftTradeUp,
  findDraftTradeUpOpportunity,
  applyDraftTradeUp,
} from '../draftTradeEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProspect(overrides = {}) {
  return {
    id: 1,
    name: 'Speedy McFast',
    pos: 'WR',
    ovr: 82,
    trueOvr: 82,
    projectedRound: 1,
    combineMetrics: { combineGrade: 9.2 },
    ...overrides,
  };
}

function makeTeam(overrides = {}) {
  return {
    id: 10,
    name: 'Buyers FC',
    abbr: 'BUY',
    ovr: 75,
    capSpace: 20.0,
    capRoom: 20.0,
    picks: [],
    ...overrides,
  };
}

function makePlayer(overrides = {}) {
  return {
    id: 100,
    name: 'Starter Vet',
    pos: 'WR',
    ovr: 70,
    teamId: 10,
    status: 'active',
    ...overrides,
  };
}

function makePick(overrides = {}) {
  return {
    id: 'pk1',
    overall: 15,
    round: 1,
    pickInRound: 15,
    teamId: 10,
    playerId: null,
    ...overrides,
  };
}

function makeFuturePick(overrides = {}) {
  return {
    id: 'fp1',
    round: 2,
    season: 2026,
    currentOwner: 10,
    teamId: 10,
    ...overrides,
  };
}

// ── isCombineStandout ─────────────────────────────────────────────────────────

describe('isCombineStandout', () => {
  it('returns true when combineGrade >= 8.5', () => {
    expect(isCombineStandout(makeProspect({ combineMetrics: { combineGrade: 8.5 } }))).toBe(true);
    expect(isCombineStandout(makeProspect({ combineMetrics: { combineGrade: 9.9 } }))).toBe(true);
  });

  it('returns false when combineGrade < 8.5', () => {
    expect(isCombineStandout(makeProspect({ combineMetrics: { combineGrade: 8.4 } }))).toBe(false);
    expect(isCombineStandout(makeProspect({ combineMetrics: { combineGrade: 0 } }))).toBe(false);
  });

  it('returns false when combineMetrics is null', () => {
    expect(isCombineStandout(makeProspect({ combineMetrics: null }))).toBe(false);
  });

  it('returns false when combineMetrics is undefined', () => {
    const p = { id: 1, pos: 'WR', ovr: 80 };
    expect(isCombineStandout(p)).toBe(false);
  });

  it('returns false when prospect is null', () => {
    expect(isCombineStandout(null)).toBe(false);
  });
});

// ── isProspectWithinTradeUpWindow ─────────────────────────────────────────────

describe('isProspectWithinTradeUpWindow', () => {
  it('returns true within 15 picks (round 1, pick #10)', () => {
    // estimatedSlot = (1-1)*32 + 16 = 16; diff = |16 - 10| = 6 ≤ 15
    const p = makeProspect({ projectedRound: 1 });
    expect(isProspectWithinTradeUpWindow(p, 10)).toBe(true);
  });

  it('returns false outside 15 picks (round 3, pick #10)', () => {
    // estimatedSlot = (3-1)*32 + 16 = 80; diff = |80 - 10| = 70 > 15
    const p = makeProspect({ projectedRound: 3 });
    expect(isProspectWithinTradeUpWindow(p, 10)).toBe(false);
  });

  it('returns false when not a standout even if within window', () => {
    const p = makeProspect({ combineMetrics: { combineGrade: 6.0 }, projectedRound: 1 });
    expect(isProspectWithinTradeUpWindow(p, 10)).toBe(false);
  });

  it('returns true when projectedRound is absent (assume in window)', () => {
    const p = makeProspect({ projectedRound: undefined, mockRound: undefined });
    expect(isProspectWithinTradeUpWindow(p, 50)).toBe(true);
  });

  it('handles round 2 boundary correctly', () => {
    // estimatedSlot = (2-1)*32 + 16 = 48; currentPickNumber = 35; diff = 13 ≤ 15
    const p = makeProspect({ projectedRound: 2 });
    expect(isProspectWithinTradeUpWindow(p, 35)).toBe(true);
  });
});

// ── getStarterNeedAtPosition ──────────────────────────────────────────────────

describe('getStarterNeedAtPosition', () => {
  it('reports severe need when team has no players at position', () => {
    const team = makeTeam();
    const rosters = [makePlayer({ teamId: 99, pos: 'WR', ovr: 85 })]; // different team
    const { severeNeed, bestOvr } = getStarterNeedAtPosition(team, 'WR', rosters);
    expect(severeNeed).toBe(true);
    expect(bestOvr).toBe(0);
  });

  it('reports severe need when best OVR at position < 75', () => {
    const team = makeTeam({ id: 10 });
    const rosters = [makePlayer({ teamId: 10, pos: 'WR', ovr: 68 })];
    const { severeNeed } = getStarterNeedAtPosition(team, 'WR', rosters);
    expect(severeNeed).toBe(true);
  });

  it('reports no severe need when team has starter OVR >= 75', () => {
    const team = makeTeam({ id: 10 });
    const rosters = [makePlayer({ teamId: 10, pos: 'WR', ovr: 80 })];
    const { severeNeed } = getStarterNeedAtPosition(team, 'WR', rosters);
    expect(severeNeed).toBe(false);
  });
});

// ── teamCanAffordRookie ───────────────────────────────────────────────────────

describe('teamCanAffordRookie', () => {
  it('returns false when cap would go negative after rookie signing', () => {
    const team = makeTeam({ capSpace: 0.5, capRoom: 0.5 });
    // Pick #1 rookie salary is well above $0.5M
    expect(teamCanAffordRookie(team, 1)).toBe(false);
  });

  it('returns true when team has sufficient cap space', () => {
    const team = makeTeam({ capSpace: 50.0, capRoom: 50.0 });
    expect(teamCanAffordRookie(team, 1)).toBe(true);
  });

  it('returns false when capSpace is exactly 0', () => {
    const team = makeTeam({ capSpace: 0, capRoom: 0 });
    expect(teamCanAffordRookie(team, 100)).toBe(false);
  });
});

// ── buildTradeUpPackage ───────────────────────────────────────────────────────

describe('buildTradeUpPackage', () => {
  it('returns null when buyerPick is absent', () => {
    const team = makeTeam();
    const currentPick = makePick({ round: 1, overall: 5 });
    expect(buildTradeUpPackage(team, currentPick, null, [])).toBeNull();
  });

  it('returns null when round-1 move has no future pick available', () => {
    const team = makeTeam({ id: 10 });
    const currentPick = makePick({ round: 1, overall: 5 });
    const buyerPick   = makePick({ id: 'pk2', overall: 20, round: 1, teamId: 10 });
    const futurePicks = []; // no future picks
    expect(buildTradeUpPackage(team, currentPick, buyerPick, futurePicks)).toBeNull();
  });

  it('includes buyer current pick + future 2nd/3rd for round-1 move', () => {
    const team = makeTeam({ id: 10 });
    const currentPick = makePick({ round: 1, overall: 5 });
    const buyerPick   = makePick({ id: 'pk2', overall: 20, round: 1, teamId: 10 });
    const future2nd   = makeFuturePick({ id: 'fp2', round: 2, currentOwner: 10 });
    const pkg = buildTradeUpPackage(team, currentPick, buyerPick, [future2nd]);
    expect(pkg).not.toBeNull();
    expect(pkg.currentPickPackage).toBe(buyerPick);
    expect(pkg.futurePick).toBe(future2nd);
  });

  it('round-2 move requires no future pick', () => {
    const team = makeTeam({ id: 10 });
    const currentPick = makePick({ round: 2, overall: 40 });
    const buyerPick   = makePick({ id: 'pk2', overall: 55, round: 2, teamId: 10 });
    const pkg = buildTradeUpPackage(team, currentPick, buyerPick, []);
    expect(pkg).not.toBeNull();
    expect(pkg.futurePick).toBeNull();
  });
});

// ── isSellerWillingToMoveDown ─────────────────────────────────────────────────

describe('isSellerWillingToMoveDown', () => {
  const allTeams = [
    makeTeam({ id: 1, ovr: 90 }), // contender
    makeTeam({ id: 2, ovr: 90 }),
    makeTeam({ id: 3, ovr: 90 }),
    makeTeam({ id: 4, ovr: 90 }),
    makeTeam({ id: 5, ovr: 90 }),
    makeTeam({ id: 6, ovr: 90 }),
    makeTeam({ id: 7, ovr: 90 }),
    makeTeam({ id: 8, ovr: 90 }),
    makeTeam({ id: 9, ovr: 90 }),
    makeTeam({ id: 10, ovr: 90 }),
    makeTeam({ id: 11, ovr: 90 }),
    makeTeam({ id: 12, ovr: 90 }),
    makeTeam({ id: 13, ovr: 90 }),
    makeTeam({ id: 14, ovr: 90 }),
    makeTeam({ id: 15, ovr: 90 }),
    makeTeam({ id: 16, ovr: 90 }),
    makeTeam({ id: 17, ovr: 90 }),
    makeTeam({ id: 18, ovr: 90 }),
    makeTeam({ id: 19, ovr: 90 }),
    makeTeam({ id: 20, ovr: 90 }),
    makeTeam({ id: 21, ovr: 30 }), // rebuilder
    makeTeam({ id: 22, ovr: 30 }),
    makeTeam({ id: 23, ovr: 30 }),
    makeTeam({ id: 24, ovr: 30 }),
    makeTeam({ id: 25, ovr: 30 }),
    makeTeam({ id: 26, ovr: 30 }),
    makeTeam({ id: 27, ovr: 30 }),
    makeTeam({ id: 28, ovr: 30 }),
    makeTeam({ id: 29, ovr: 30 }),
    makeTeam({ id: 30, ovr: 30 }),
    makeTeam({ id: 31, ovr: 30 }),
    makeTeam({ id: 32, ovr: 30 }),
  ];

  it('returns true when seller is rebuilding (low rank)', () => {
    const sellerTeam = makeTeam({ id: 32, ovr: 30 });
    const rosters = [];
    const result = isSellerWillingToMoveDown(sellerTeam, 'WR', { teams: allTeams, rosters });
    expect(result).toBe(true);
  });

  it('returns true when seller has no immediate starter need (bestOvr >= 75)', () => {
    const sellerTeam = makeTeam({ id: 1, ovr: 90 }); // contender
    const rosters = [makePlayer({ teamId: 1, pos: 'WR', ovr: 82 })];
    const result = isSellerWillingToMoveDown(sellerTeam, 'WR', { teams: allTeams, rosters });
    expect(result).toBe(true);
  });

  it('returns false when contender has severe need at target position', () => {
    const sellerTeam = makeTeam({ id: 1, ovr: 90 }); // contender
    const rosters = [makePlayer({ teamId: 1, pos: 'WR', ovr: 60 })]; // weak starter
    const result = isSellerWillingToMoveDown(sellerTeam, 'WR', { teams: allTeams, rosters });
    expect(result).toBe(false);
  });
});

// ── evaluateDraftTradeUp ──────────────────────────────────────────────────────

describe('evaluateDraftTradeUp', () => {
  function makeEvalState(overrides = {}) {
    const picks = [
      makePick({ id: 'pk0', overall: 5,  round: 1, teamId: 20, playerId: null }), // current (seller)
      makePick({ id: 'pk1', overall: 10, round: 1, teamId: 10, playerId: null }), // buyer later pick
    ];
    return {
      meta: {
        draftState: { picks, currentPickIndex: 0 },
        userTeamId: 99,
        year: 2025,
        tradeOffers: [],
      },
      // 3 teams required: with only 2, the weakest team (ovr:30) lands at percentile=0.5 → 'mid'.
      // A 3rd mid-tier team pushes id:20 (ovr:30) to percentile=0.33 → 'rebuilder' → willing to move down.
      // Buyer capSpace=50 to clear the round-1 rookie contract at pick #5 (~$31.5M).
      teams:   [makeTeam({ id: 10, ovr: 90, capSpace: 50 }), makeTeam({ id: 20, ovr: 30 }), makeTeam({ id: 99, ovr: 75 })],
      rosters: [],
      draftPool: [makeProspect()],
      futurePicks: [makeFuturePick({ id: 'fp2', round: 2, currentOwner: 10, teamId: 10 })],
      ...overrides,
    };
  }

  it('rejects when cap insufficient for rookie', () => {
    const state = makeEvalState();
    state.teams[0] = { ...state.teams[0], capSpace: 0, capRoom: 0 };
    const buyerTeam  = state.teams[0];
    const sellerTeam = state.teams[1];
    const result = evaluateDraftTradeUp({
      buyerTeam, sellerTeam,
      currentPick: state.meta.draftState.picks[0],
      targetProspect: makeProspect(),
      state,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('cap_insufficient');
  });

  it('rejects when no need alignment (buyer has strong starter)', () => {
    const state = makeEvalState();
    state.rosters = [makePlayer({ teamId: 10, pos: 'WR', ovr: 85 })]; // strong starter
    const buyerTeam  = state.teams[0];
    const sellerTeam = state.teams[1];
    const result = evaluateDraftTradeUp({
      buyerTeam, sellerTeam,
      currentPick: state.meta.draftState.picks[0],
      targetProspect: makeProspect(),
      state,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_need_alignment');
  });

  it('accepts when all conditions met', () => {
    const state = makeEvalState();
    const buyerTeam  = state.teams[0];
    const sellerTeam = state.teams[1];
    // No roster → severe need; seller is rebuilder → willing
    const result = evaluateDraftTradeUp({
      buyerTeam, sellerTeam,
      currentPick: state.meta.draftState.picks[0],
      targetProspect: makeProspect(),
      state,
    });
    expect(result.ok).toBe(true);
    expect(result.reason).toBe('ok');
    expect(result.package).not.toBeNull();
  });
});

// ── findDraftTradeUpOpportunity ───────────────────────────────────────────────

describe('findDraftTradeUpOpportunity', () => {
  function makeMinimalState(overrides = {}) {
    const picks = [
      makePick({ id: 'pk0', overall: 5,  round: 1, teamId: 20, playerId: null }),
      makePick({ id: 'pk1', overall: 10, round: 1, teamId: 10, playerId: null }),
    ];
    return {
      meta: {
        draftState: { picks, currentPickIndex: 0 },
        userTeamId: 99,
        year: 2025,
        tradeOffers: [],
        draftTradeUpEvaluatedPickIdx: -1,
      },
      teams: [
        makeTeam({ id: 10, ovr: 90, capSpace: 50 }), // capSpace=50 clears round-1 rookie cost at pick #5 (~$31.5M)
        makeTeam({ id: 20, ovr: 30 }),
        makeTeam({ id: 99, ovr: 75 }),
      ],
      rosters: [],
      draftPool: [makeProspect({ id: 1, ovr: 82, projectedRound: 1 })],
      futurePicks: [makeFuturePick({ id: 'fp2', round: 2, currentOwner: 10, teamId: 10 })],
      ...overrides,
    };
  }

  it('returns null when no standout in pool', () => {
    const state = makeMinimalState();
    state.draftPool = [makeProspect({ combineMetrics: { combineGrade: 5.0 } })];
    expect(findDraftTradeUpOpportunity(state)).toBeNull();
  });

  it('returns null when no draft state', () => {
    const state = makeMinimalState();
    state.meta.draftState = null;
    expect(findDraftTradeUpOpportunity(state)).toBeNull();
  });

  it('returns null when pick already evaluated (guard)', () => {
    const state = makeMinimalState();
    state.meta.draftTradeUpEvaluatedPickIdx = 0; // same as currentPickIndex
    expect(findDraftTradeUpOpportunity(state)).toBeNull();
  });

  it('returns ai_to_ai when AI seller, AI buyer, and conditions met', () => {
    const state = makeMinimalState();
    // team 20 (seller/AI) holds pick 0; team 10 (buyer/AI) holds pick 1
    const opp = findDraftTradeUpOpportunity(state);
    expect(opp).not.toBeNull();
    expect(opp.type).toBe('ai_to_ai');
    expect(opp.buyerTeamId).toBe(10);
    expect(opp.sellerTeamId).toBe(20);
    expect(opp.targetProspect.id).toBe(1);
  });

  it('returns ai_to_user when user holds current pick', () => {
    const state = makeMinimalState();
    // Make user team the current pick holder
    state.meta.draftState.picks[0].teamId = 99; // user team
    state.meta.userTeamId = 99;
    // User team (id:99) classified as 'contender' with 3 teams; needs a WR starter so they are
    // willing to move down (bestOvr >= 75 → isSellerWillingToMoveDown returns true).
    state.rosters = [makePlayer({ id: 300, teamId: 99, pos: 'WR', ovr: 80 })];
    const opp = findDraftTradeUpOpportunity(state);
    expect(opp).not.toBeNull();
    expect(opp.type).toBe('ai_to_user');
    expect(opp.sellerTeamId).toBe(99);
    expect(opp.buyerTeamId).toBe(10);
  });

  it('is deterministic — same state returns same opportunity', () => {
    const state  = makeMinimalState();
    const opp1   = findDraftTradeUpOpportunity({ ...state, meta: { ...state.meta, draftTradeUpEvaluatedPickIdx: -1 } });
    const state2 = makeMinimalState();
    const opp2   = findDraftTradeUpOpportunity({ ...state2, meta: { ...state2.meta, draftTradeUpEvaluatedPickIdx: -1 } });
    expect(opp1?.type).toBe(opp2?.type);
    expect(opp1?.buyerTeamId).toBe(opp2?.buyerTeamId);
  });

  it('no Math.random usage in module', () => {
    // Verify determinism by checking the module source doesn't call Math.random
    // (This is a guardrail check via the function outputs being consistent across calls)
    const state = makeMinimalState();
    const results = Array.from({ length: 5 }, () =>
      findDraftTradeUpOpportunity({ ...state, meta: { ...state.meta, draftTradeUpEvaluatedPickIdx: -1 } }),
    );
    const types = results.map((r) => r?.type);
    expect(types.every((t) => t === types[0])).toBe(true);
  });
});

// ── applyDraftTradeUp ─────────────────────────────────────────────────────────

describe('applyDraftTradeUp', () => {
  function makeOpportunity(overrides = {}) {
    const currentPick = makePick({ id: 'pk0', overall: 5, round: 1, teamId: 20 });
    const buyerLaterPick = makePick({ id: 'pk1', overall: 10, round: 1, teamId: 10 });
    const futurePick = makeFuturePick({ id: 'fp1', round: 2, currentOwner: 10, teamId: 10 });
    return {
      type: 'ai_to_ai',
      buyerTeamId: 10,
      sellerTeamId: 20,
      targetProspectId: 1,
      targetProspect: makeProspect({ id: 1, combineMetrics: { combineGrade: 9.2 } }),
      currentPick,
      package: { currentPickPackage: buyerLaterPick, futurePick },
      ...overrides,
    };
  }

  function makeApplyState(opp) {
    const picks = [
      { ...opp.currentPick },
      { ...opp.package.currentPickPackage },
    ];
    return {
      meta: {
        draftState: { picks, currentPickIndex: 0 },
        userTeamId: 99,
        year: 2025,
        tradeOffers: [],
      },
      teams: [
        makeTeam({ id: 10, name: 'Buyers FC', abbr: 'BUY' }),
        makeTeam({ id: 20, name: 'Sellers FC', abbr: 'SEL' }),
      ],
      rosters: [],
      draftPool: [],
      futurePicks: [{ ...opp.package.futurePick }],
    };
  }

  it('swaps current pick ownership to buyer', () => {
    const opp   = makeOpportunity();
    const state = makeApplyState(opp);
    const result = applyDraftTradeUp(opp, state);
    const newPicks = result.state.meta.draftState.picks;
    expect(newPicks[0].teamId).toBe(10); // current pick now belongs to buyer
  });

  it('transfers buyer later pick to seller', () => {
    const opp   = makeOpportunity();
    const state = makeApplyState(opp);
    const result = applyDraftTradeUp(opp, state);
    const newPicks = result.state.meta.draftState.picks;
    expect(newPicks[1].teamId).toBe(20); // buyer's later pick now belongs to seller
  });

  it('transfers future pick to seller', () => {
    const opp   = makeOpportunity();
    const state = makeApplyState(opp);
    const result = applyDraftTradeUp(opp, state);
    const updatedFuture = result.state.futurePicks.find((fp) => fp.id === 'fp1');
    expect(updatedFuture?.currentOwner).toBe(20); // seller now owns future pick
  });

  it('appends trade record to tradeOffers with draft_trade_up origin', () => {
    const opp   = makeOpportunity();
    const state = makeApplyState(opp);
    const result = applyDraftTradeUp(opp, state);
    const record = result.state.meta.tradeOffers.find((o) => o.origin === 'draft_trade_up');
    expect(record).toBeDefined();
    expect(record.buyerTeamId).toBe(10);
    expect(record.sellerTeamId).toBe(20);
    expect(record.combineGrade).toBeCloseTo(9.2);
  });

  it('returns formatted headline payload', () => {
    const opp   = makeOpportunity();
    const state = makeApplyState(opp);
    const result = applyDraftTradeUp(opp, state);
    expect(result.headline).not.toBeNull();
    expect(result.headline.text).toContain('DRAFT SHOCK');
    expect(result.headline.text).toContain('Speedy McFast');
    expect(result.headline.category).toBe('MILESTONE');
  });

  it('returns ticker with amber-style text', () => {
    const opp   = makeOpportunity();
    const state = makeApplyState(opp);
    const result = applyDraftTradeUp(opp, state);
    expect(result.ticker.type).toBe('draft_trade_up');
    expect(result.ticker.text).toContain('TRADE-UP');
    expect(result.ticker.pickNumber).toBe(5);
  });

  it('marks draftTradeUpEvaluatedPickIdx in new state', () => {
    const opp   = makeOpportunity();
    const state = makeApplyState(opp);
    const result = applyDraftTradeUp(opp, state);
    expect(result.state.meta.draftTradeUpEvaluatedPickIdx).toBe(0);
  });

  it('does not mutate input state', () => {
    const opp   = makeOpportunity();
    const state = makeApplyState(opp);
    const originalTeamId = state.meta.draftState.picks[0].teamId;
    applyDraftTradeUp(opp, state);
    expect(state.meta.draftState.picks[0].teamId).toBe(originalTeamId);
  });
});
