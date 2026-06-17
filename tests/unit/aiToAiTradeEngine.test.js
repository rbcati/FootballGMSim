import { describe, it, expect } from 'vitest';
import {
  classifyTeam,
  findStarterGap,
  findTradableAsset,
  computeCapImpact,
  validateTradeBalance,
  attemptAIToAITrade,
  runWeeklyAIToAITrading,
  applyAIToAITrade,
  MAX_TRADES_PER_WEEK,
  TRADING_WEEKS,
} from '../../src/core/trades/aiToAiTradeEngine.js';

function makeTeam(id, ovr) {
  return { id, name: `Team${id}`, overallRating: ovr, capSpace: 20, picks: [] };
}

function makePlayer(id, teamId, pos, ovr, extra = {}) {
  return { id, teamId, pos, ovr, name: `Player${id}`, contract: { baseAnnual: 5 }, ...extra };
}

describe('classifyTeam', () => {
  const teams = [
    makeTeam(1, 90), makeTeam(2, 85), makeTeam(3, 80), makeTeam(4, 75), makeTeam(5, 70),
    makeTeam(6, 65), makeTeam(7, 60), makeTeam(8, 55), makeTeam(9, 50), makeTeam(10, 45),
  ];

  it('returns contender for top 40% by rating', () => {
    expect(classifyTeam(teams[0], teams)).toBe('contender'); // rank 1/10 → 90th pct
    expect(classifyTeam(teams[3], teams)).toBe('contender'); // rank 4/10 → 60th pct
  });

  it('returns rebuilder for bottom 40%', () => {
    expect(classifyTeam(teams[9], teams)).toBe('rebuilder'); // rank 10/10 → 10th pct
    expect(classifyTeam(teams[7], teams)).toBe('rebuilder'); // rank 8/10 → 30th pct (below 40%)
  });

  it('returns mid for middle band', () => {
    // rank 5/10 (0-indexed idx=4): percentile = 1 - 4/10 = 0.6 → exactly at contender boundary (>=0.60 = contender)
    // rank 6/10 (0-indexed idx=5): percentile = 1 - 5/10 = 0.5 → mid (between 0.40 and 0.60)
    expect(classifyTeam(teams[5], teams)).toBe('mid'); // 50th percentile → mid
  });

  it('returns mid for null team', () => {
    expect(classifyTeam(null, teams)).toBe('mid');
  });

  it('returns mid when team not found', () => {
    expect(classifyTeam(makeTeam(99, 80), teams)).toBe('mid');
  });
});

describe('findStarterGap', () => {
  const team = makeTeam(1, 80);

  it('returns severe when no OVR>=74 at position', () => {
    const roster = [makePlayer(1, 1, 'QB', 70), makePlayer(2, 1, 'QB', 65)];
    const result = findStarterGap(team, roster, 'QB');
    expect(result.hasGap).toBe(true);
    expect(result.gapSeverity).toBe('severe');
  });

  it('returns moderate when starter exists but no backup', () => {
    const roster = [makePlayer(1, 1, 'QB', 75)]; // one starter OVR>=66 but no backup OVR>=56
    const result = findStarterGap(team, roster, 'QB');
    expect(result.hasGap).toBe(true);
    expect(result.gapSeverity).toBe('moderate');
  });

  it('returns none when 2+ starters OVR>=66', () => {
    const roster = [makePlayer(1, 1, 'QB', 75), makePlayer(2, 1, 'QB', 70)];
    const result = findStarterGap(team, roster, 'QB');
    expect(result.hasGap).toBe(false);
    expect(result.gapSeverity).toBe('none');
  });

  it('filters players by team id', () => {
    // Player on different team should not count
    const roster = [makePlayer(1, 2, 'QB', 75), makePlayer(2, 2, 'QB', 70)];
    const result = findStarterGap(team, roster, 'QB');
    expect(result.gapSeverity).toBe('severe'); // no players on team 1
  });
});

describe('findTradableAsset', () => {
  it('returns null when no suitable asset for rebuilder', () => {
    const team = makeTeam(1, 80);
    const result = findTradableAsset(team, [], [], 'QB', 'rebuilder', 42);
    expect(result).toBeNull();
  });

  it('returns null for rebuilder when no qualifying player at position', () => {
    const team = makeTeam(2, 40);
    const roster = [makePlayer(1, 2, 'QB', 72, { onTradeBlock: true })]; // OVR too low
    const result = findTradableAsset(team, roster, [], 'QB', 'rebuilder', 42);
    expect(result).toBeNull();
  });

  it('returns player for rebuilder when tradable player exists', () => {
    const team = makeTeam(2, 40);
    const player = makePlayer(1, 2, 'QB', 80, { onTradeBlock: true });
    const result = findTradableAsset(team, [player], [], 'QB', 'rebuilder', 42);
    expect(result).not.toBeNull();
    expect(result.type).toBe('player');
    expect(result.player.id).toBe(1);
  });

  it('returns null for contender when no assets available', () => {
    const team = makeTeam(1, 90);
    const result = findTradableAsset(team, [], [], 'QB', 'contender', 42);
    expect(result).toBeNull();
  });
});

describe('computeCapImpact', () => {
  it('isLegal false when trade pushes team over cap', () => {
    const team = { ...makeTeam(1, 80), capSpace: 5 };
    const incoming = { ...makePlayer(1, 2, 'QB', 85), contract: { baseAnnual: 20 } };
    const outgoing = { ...makePlayer(2, 1, 'QB', 70), contract: { baseAnnual: 8 } };
    const result = computeCapImpact(team, incoming, outgoing);
    expect(result.isLegal).toBe(false);
  });

  it('isLegal true when cap space remains', () => {
    const team = { ...makeTeam(1, 80), capSpace: 30 };
    const incoming = { ...makePlayer(1, 2, 'QB', 85), contract: { baseAnnual: 10 } };
    const outgoing = { ...makePlayer(2, 1, 'QB', 70), contract: { baseAnnual: 5 } };
    const result = computeCapImpact(team, incoming, outgoing);
    expect(result.isLegal).toBe(true);
    expect(result.postTradeCap).toBe(25); // 30 - 10 + 5
  });

  it('handles null outgoing player', () => {
    const team = { ...makeTeam(1, 80), capSpace: 30 };
    const incoming = { ...makePlayer(1, 2, 'QB', 85), contract: { baseAnnual: 10 } };
    const result = computeCapImpact(team, incoming, null);
    expect(result.postTradeCap).toBe(20); // 30 - 10 + 0
  });
});

describe('validateTradeBalance', () => {
  it('passes when both formulas satisfied', () => {
    // contenderGives=80, contenderReceives=100 → 100 > 80*0.95=76 ✓
    // rebuilderGives=96, rebuilderReceives=110 → 110 > 96*1.05=100.8 ✓
    const result = validateTradeBalance(80, 100, 96, 110);
    expect(result.valid).toBe(true);
  });

  it('passes when rebuilder gets sufficient return', () => {
    // contender receives 96 > 100*0.95=95 ✓ (just barely)
    // rebuilder receives 110 > 96*1.05=100.8 ✓
    const result = validateTradeBalance(100, 96, 96, 110);
    expect(result.valid).toBe(true);
  });

  it('fails when contender formula not met', () => {
    const result = validateTradeBalance(100, 90, 90, 100);
    // contender receives 90 > 100*0.95=95 → ✗
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('contender_threshold_not_met');
  });

  it('fails when rebuilder formula not met', () => {
    const result = validateTradeBalance(80, 100, 100, 80);
    // contender receives 100 > 80*0.95=76 ✓
    // rebuilder receives 80 > 100*1.05=105 ✗
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('rebuilder_threshold_not_met');
  });
});

describe('attemptAIToAITrade', () => {
  it('returns null when only one team', () => {
    const teams = [makeTeam(1, 90)]; // only one team, can't have both contenders and rebuilders
    const result = attemptAIToAITrade(teams, [], [], 1, 5, 42);
    expect(result).toBeNull();
  });

  it('returns null when empty teams', () => {
    const result = attemptAIToAITrade([], [], [], 1, 5, 42);
    expect(result).toBeNull();
  });

  it('is deterministic (same seed → same result)', () => {
    const teams = Array.from({ length: 10 }, (_, i) => makeTeam(i + 1, 90 - i * 5));
    const players = teams.flatMap(t =>
      ['QB', 'WR', 'RB', 'CB'].map((pos, pi) =>
        makePlayer(t.id * 100 + pi, t.id, pos, 60 + pi * 5, { onTradeBlock: pi === 0 })
      )
    );
    const result1 = runWeeklyAIToAITrading(teams, players, [], 2025, 5, 42);
    const result2 = runWeeklyAIToAITrading(teams, players, [], 2025, 5, 42);
    expect(result1.length).toBe(result2.length);
    if (result1.length > 0) {
      expect(result1[0].offerId).toBe(result2[0].offerId);
    }
  });

  it('returns null when pair already used', () => {
    const teams = Array.from({ length: 10 }, (_, i) => makeTeam(i + 1, 90 - i * 5));
    const players = teams.flatMap(t =>
      ['QB'].map((pos, pi) =>
        makePlayer(t.id * 100 + pi, t.id, pos, 80, { onTradeBlock: true })
      )
    );
    // Pre-populate usedPairs with all possible combos to force null
    const usedPairs = new Set();
    for (let a = 1; a <= 10; a++) {
      for (let b = 1; b <= 10; b++) {
        usedPairs.add(`${Math.min(a, b)}_${Math.max(a, b)}`);
      }
    }
    const result = attemptAIToAITrade(teams, players, [], 2025, 5, 42, usedPairs);
    expect(result).toBeNull();
  });
});

describe('runWeeklyAIToAITrading', () => {
  it('returns <= MAX_TRADES_PER_WEEK results', () => {
    const teams = Array.from({ length: 32 }, (_, i) => makeTeam(i + 1, 90 - i * 2));
    const players = teams.flatMap(t =>
      ['QB', 'WR', 'RB', 'CB'].map((pos, pi) =>
        makePlayer(t.id * 100 + pi, t.id, pos, 60 + pi * 5, { onTradeBlock: true })
      )
    );
    const result = runWeeklyAIToAITrading(teams, players, [], 2025, 5, 99);
    expect(result.length).toBeLessThanOrEqual(MAX_TRADES_PER_WEEK);
  });

  it('returns [] outside weeks 1–10', () => {
    const teams = Array.from({ length: 10 }, (_, i) => makeTeam(i + 1, 90 - i * 5));
    const players = [];
    expect(runWeeklyAIToAITrading(teams, players, [], 2025, 0, 42)).toEqual([]);
    expect(runWeeklyAIToAITrading(teams, players, [], 2025, 11, 42)).toEqual([]);
    expect(runWeeklyAIToAITrading(teams, players, [], 2025, 18, 42)).toEqual([]);
  });

  it('returns [] when no suitable teams', () => {
    const result = runWeeklyAIToAITrading([], [], [], 2025, 5, 42);
    expect(result).toEqual([]);
  });

  it('completes within 30ms on worst-case input', () => {
    const teams = Array.from({ length: 32 }, (_, i) => makeTeam(i + 1, 90 - i));
    const players = teams.flatMap(t =>
      Array.from({ length: 15 }, (_, pi) => makePlayer(t.id * 100 + pi, t.id, 'QB', 60 + (pi % 20), { onTradeBlock: pi < 3 }))
    );
    const start = Date.now();
    runWeeklyAIToAITrading(teams, players, [], 2025, 5, 1234);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(30);
  });

  it('respects TRADING_WEEKS bounds', () => {
    const teams = Array.from({ length: 10 }, (_, i) => makeTeam(i + 1, 90 - i * 5));
    expect(runWeeklyAIToAITrading(teams, [], [], 2025, TRADING_WEEKS.start, 42).length).toBeGreaterThanOrEqual(0);
    expect(runWeeklyAIToAITrading(teams, [], [], 2025, TRADING_WEEKS.end, 42).length).toBeGreaterThanOrEqual(0);
    expect(runWeeklyAIToAITrading(teams, [], [], 2025, TRADING_WEEKS.start - 1, 42)).toEqual([]);
    expect(runWeeklyAIToAITrading(teams, [], [], 2025, TRADING_WEEKS.end + 1, 42)).toEqual([]);
  });
});

describe('applyAIToAITrade', () => {
  it('moves player to correct roster', () => {
    const teams = [makeTeam(1, 90), makeTeam(2, 40)];
    const player = makePlayer(200, 2, 'QB', 80, { onTradeBlock: true });
    const rosters = [player, makePlayer(101, 1, 'WR', 65)];
    const state = { teams, rosters, picks: [], meta: { tradeOffers: [] } };
    const trade = {
      offerId: 'test_trade',
      teamAId: 1, teamAName: 'Team1',
      teamBId: 2, teamBName: 'Team2',
      playerId: 200, playerName: 'Player200', playerPos: 'QB', playerOvr: 80,
      offeredPicks: [], offeredPlayers: [],
      rebuilderAsset: { value: 100, player: player },
      contenderAsset: { value: 80, player: null },
      season: 2025, week: 5,
    };
    const updated = applyAIToAITrade(trade, state);
    const movedPlayer = updated.rosters.find(p => p.id === 200);
    expect(movedPlayer.teamId).toBe(1);
  });

  it('transfers pick ownership', () => {
    const teams = [makeTeam(1, 90), makeTeam(2, 40)];
    const player = makePlayer(200, 2, 'QB', 80, { onTradeBlock: true });
    const pick = { id: 'pk1', round: 1, currentTeamId: 1, teamId: 1 };
    const state = { teams, rosters: [player], picks: [pick], meta: { tradeOffers: [] } };
    const trade = {
      offerId: 'test_trade',
      teamAId: 1, teamAName: 'Team1',
      teamBId: 2, teamBName: 'Team2',
      playerId: 200, playerName: 'Player200', playerPos: 'QB', playerOvr: 80,
      offeredPicks: [pick], offeredPlayers: [],
      rebuilderAsset: { value: 100, player: player },
      contenderAsset: { value: 80, pick: pick, player: null },
      season: 2025, week: 5,
    };
    const updated = applyAIToAITrade(trade, state);
    const movedPick = updated.picks.find(pk => pk.id === 'pk1');
    expect(movedPick.currentTeamId).toBe(2);
  });

  it('updates capSpace on both teams', () => {
    const player = { ...makePlayer(200, 2, 'QB', 80, { onTradeBlock: true }), contract: { baseAnnual: 15 } };
    const teams = [{ ...makeTeam(1, 90), capSpace: 20 }, { ...makeTeam(2, 40), capSpace: 10 }];
    const state = { teams, rosters: [player], picks: [], meta: { tradeOffers: [] } };
    const trade = {
      offerId: 'cap_test',
      teamAId: 1, teamAName: 'Team1',
      teamBId: 2, teamBName: 'Team2',
      playerId: 200, playerName: 'Player200', playerPos: 'QB', playerOvr: 80,
      offeredPicks: [], offeredPlayers: [],
      rebuilderAsset: { value: 100, player: player },
      contenderAsset: { value: 80, player: null },
      season: 2025, week: 5,
    };
    const updated = applyAIToAITrade(trade, state);
    // Team A gets player with salary 15; outgoing is null (salary 0) → capSpace = 20 - 15 + 0 = 5
    const teamA = updated.teams.find(t => t.id === 1);
    expect(teamA.capSpace).toBe(5);
  });

  it('does not mutate inputs', () => {
    const player = makePlayer(200, 2, 'QB', 80, { onTradeBlock: true });
    const teams = [makeTeam(1, 90), makeTeam(2, 40)];
    const rosters = [player];
    const originalTeamsCopy = JSON.stringify(teams);
    const originalRostersCopy = JSON.stringify(rosters);
    const state = { teams, rosters, picks: [], meta: { tradeOffers: [] } };
    const trade = {
      offerId: 'mut_test',
      teamAId: 1, teamAName: 'Team1',
      teamBId: 2, teamBName: 'Team2',
      playerId: 200, playerName: 'Player200', playerPos: 'QB', playerOvr: 80,
      offeredPicks: [], offeredPlayers: [],
      rebuilderAsset: { value: 100, player: player },
      contenderAsset: { value: 80, player: null },
      season: 2025, week: 5,
    };
    applyAIToAITrade(trade, state);
    expect(JSON.stringify(teams)).toBe(originalTeamsCopy);
    expect(JSON.stringify(rosters)).toBe(originalRostersCopy);
  });

  it('records trade in meta.tradeOffers with origin ai_to_ai', () => {
    const player = makePlayer(200, 2, 'QB', 80, { onTradeBlock: true });
    const state = { teams: [makeTeam(1, 90), makeTeam(2, 40)], rosters: [player], picks: [], meta: { tradeOffers: [] } };
    const trade = {
      offerId: 'rec_test',
      teamAId: 1, teamAName: 'Team1',
      teamBId: 2, teamBName: 'Team2',
      playerId: 200, playerName: 'Player200', playerPos: 'QB', playerOvr: 80,
      offeredPicks: [], offeredPlayers: [],
      rebuilderAsset: { value: 100, player: player },
      contenderAsset: { value: 80, player: null },
      season: 2025, week: 5,
    };
    const updated = applyAIToAITrade(trade, state);
    expect(updated.meta.tradeOffers.length).toBe(1);
    expect(updated.meta.tradeOffers[0].origin).toBe('ai_to_ai');
    expect(updated.meta.tradeOffers[0].status).toBe('accepted');
    expect(updated.meta.tradeOffers[0].targetTeamId).toBeNull();
  });
});
