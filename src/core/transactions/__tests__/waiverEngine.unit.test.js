/**
 * waiverEngine.unit.test.js — Comprehensive unit tests for waiverEngine.js
 *
 * No Math.random usage. All tests are deterministic.
 */

import { describe, it, expect } from 'vitest';
import {
  isWaiverWindowOpen,
  buildWaiverPriorityList,
  sendPlayerToWaivers,
  canTeamClaimWaiverPlayer,
  submitWaiverClaim,
  findHighestPriorityClaim,
  processWaivers,
  shouldAIClaimWaiverPlayer,
  generateAIWaiverClaims,
} from '../waiverEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTeam(overrides = {}) {
  return {
    id: 1,
    name: 'Test Team',
    wins: 5,
    losses: 5,
    ties: 0,
    ptsFor: 200,
    ptsAgainst: 200,
    capUsed: 150,
    capRoom: 50,
    capTotal: 200,
    ...overrides,
  };
}

function makePlayer(overrides = {}) {
  return {
    id: 1,
    name: 'Test Player',
    pos: 'WR',
    ovr: 75,
    age: 26,
    teamId: 1,
    status: 'active',
    contract: {
      baseAnnual: 5,
      signingBonus: 10,
      yearsTotal: 2,
      years: 2,
    },
    ...overrides,
  };
}

function makeClaim(overrides = {}) {
  return {
    playerId: '1',
    teamId: 1,
    submittedWeek: 11,
    origin: 'user',
    ...overrides,
  };
}

// ── isWaiverWindowOpen ────────────────────────────────────────────────────────

describe('isWaiverWindowOpen', () => {
  it('returns true for week 11', () => {
    expect(isWaiverWindowOpen(11)).toBe(true);
  });

  it('returns true for week 12', () => {
    expect(isWaiverWindowOpen(12)).toBe(true);
  });

  it('returns true for week 13', () => {
    expect(isWaiverWindowOpen(13)).toBe(true);
  });

  it('returns true for week 14', () => {
    expect(isWaiverWindowOpen(14)).toBe(true);
  });

  it('returns false for week 10', () => {
    expect(isWaiverWindowOpen(10)).toBe(false);
  });

  it('returns false for week 15', () => {
    expect(isWaiverWindowOpen(15)).toBe(false);
  });

  it('returns false for week 1', () => {
    expect(isWaiverWindowOpen(1)).toBe(false);
  });

  it('returns false for week 0', () => {
    expect(isWaiverWindowOpen(0)).toBe(false);
  });

  it('handles null/undefined gracefully', () => {
    expect(isWaiverWindowOpen(null)).toBe(false);
    expect(isWaiverWindowOpen(undefined)).toBe(false);
  });
});

// ── buildWaiverPriorityList ───────────────────────────────────────────────────

describe('buildWaiverPriorityList', () => {
  it('returns empty array for empty teams', () => {
    expect(buildWaiverPriorityList([])).toEqual([]);
  });

  it('sorts worst record first', () => {
    const teams = [
      makeTeam({ id: 1, wins: 8, losses: 2, ties: 0 }),
      makeTeam({ id: 2, wins: 2, losses: 8, ties: 0 }),
      makeTeam({ id: 3, wins: 5, losses: 5, ties: 0 }),
    ];
    const list = buildWaiverPriorityList(teams);
    expect(list[0]).toBe(2); // worst record first
    expect(list[1]).toBe(3);
    expect(list[2]).toBe(1); // best record last
  });

  it('uses point differential as tiebreaker', () => {
    const teams = [
      makeTeam({ id: 1, wins: 5, losses: 5, ties: 0, ptsFor: 200, ptsAgainst: 180 }),
      makeTeam({ id: 2, wins: 5, losses: 5, ties: 0, ptsFor: 150, ptsAgainst: 200 }),
    ];
    const list = buildWaiverPriorityList(teams);
    // Team 2 has worse point diff (-50 vs +20), so goes first
    expect(list[0]).toBe(2);
    expect(list[1]).toBe(1);
  });

  it('uses team id as final stable tiebreaker', () => {
    const teams = [
      makeTeam({ id: 10, wins: 5, losses: 5, ties: 0, ptsFor: 200, ptsAgainst: 200 }),
      makeTeam({ id: 2, wins: 5, losses: 5, ties: 0, ptsFor: 200, ptsAgainst: 200 }),
      makeTeam({ id: 5, wins: 5, losses: 5, ties: 0, ptsFor: 200, ptsAgainst: 200 }),
    ];
    const list = buildWaiverPriorityList(teams);
    // String sort: "10" < "2" < "5"
    expect(list[0]).toBe(10);
    expect(list[1]).toBe(2);
    expect(list[2]).toBe(5);
  });

  it('counts ties as 0.5 win in win percentage', () => {
    const teams = [
      makeTeam({ id: 1, wins: 4, losses: 4, ties: 2, ptsFor: 200, ptsAgainst: 200 }), // pct = (4+1)/10 = 0.5
      makeTeam({ id: 2, wins: 3, losses: 7, ties: 0, ptsFor: 200, ptsAgainst: 200 }), // pct = 3/10 = 0.3
    ];
    const list = buildWaiverPriorityList(teams);
    expect(list[0]).toBe(2); // worse record first
    expect(list[1]).toBe(1);
  });

  it('handles 0-0-0 record gracefully', () => {
    const teams = [
      makeTeam({ id: 1, wins: 0, losses: 0, ties: 0 }),
      makeTeam({ id: 2, wins: 0, losses: 0, ties: 0 }),
    ];
    const list = buildWaiverPriorityList(teams);
    expect(list.length).toBe(2);
    // Should be stable via id tiebreaker
    expect(list[0]).toBe(1);
    expect(list[1]).toBe(2);
  });

  it('returns IDs in same type as team.id', () => {
    const teams = [
      makeTeam({ id: 5, wins: 3, losses: 7, ties: 0 }),
    ];
    const list = buildWaiverPriorityList(teams);
    expect(list[0]).toBe(5);
  });
});

// ── sendPlayerToWaivers ───────────────────────────────────────────────────────

describe('sendPlayerToWaivers', () => {
  it('sets waiverStatus to ACTIVE', () => {
    const player = makePlayer();
    const result = sendPlayerToWaivers(player, 11, 3);
    expect(result.waiverStatus).toBe('ACTIVE');
  });

  it('sets waiverWeekExpires to currentWeek + 1', () => {
    const player = makePlayer();
    const result = sendPlayerToWaivers(player, 11, 3);
    expect(result.waiverWeekExpires).toBe(12);
  });

  it('shallow copies contract to waiverContract', () => {
    const player = makePlayer();
    const result = sendPlayerToWaivers(player, 11, 3);
    expect(result.waiverContract).toEqual(player.contract);
    expect(result.waiverContract).not.toBe(player.contract); // different reference
  });

  it('sets previousTeamId', () => {
    const player = makePlayer();
    const result = sendPlayerToWaivers(player, 11, 7);
    expect(result.previousTeamId).toBe(7);
  });

  it('sets waiverContract to null if player has no contract', () => {
    const player = makePlayer({ contract: null });
    const result = sendPlayerToWaivers(player, 11, 3);
    expect(result.waiverContract).toBeNull();
  });

  it('does not mutate the original player', () => {
    const player = makePlayer();
    const original = { ...player };
    sendPlayerToWaivers(player, 11, 3);
    expect(player).toEqual(original);
  });

  it('preserves all other player fields', () => {
    const player = makePlayer({ ovr: 85, pos: 'QB' });
    const result = sendPlayerToWaivers(player, 11, 3);
    expect(result.ovr).toBe(85);
    expect(result.pos).toBe('QB');
    expect(result.name).toBe(player.name);
  });

  it('sets previousTeamId to null when not provided', () => {
    const player = makePlayer();
    const result = sendPlayerToWaivers(player, 11, null);
    expect(result.previousTeamId).toBeNull();
  });
});

// ── canTeamClaimWaiverPlayer ──────────────────────────────────────────────────

describe('canTeamClaimWaiverPlayer', () => {
  it('returns true when team has enough cap room', () => {
    const team = makeTeam({ capRoom: 20 });
    const player = makePlayer({
      waiverContract: { baseAnnual: 5, signingBonus: 10, yearsTotal: 2 },
    });
    // capHit = 5 + 10/2 = 10
    expect(canTeamClaimWaiverPlayer(team, player)).toBe(true);
  });

  it('returns false when team lacks cap room', () => {
    const team = makeTeam({ capRoom: 5 });
    const player = makePlayer({
      waiverContract: { baseAnnual: 5, signingBonus: 10, yearsTotal: 2 },
    });
    // capHit = 5 + 10/2 = 10, room is 5
    expect(canTeamClaimWaiverPlayer(team, player)).toBe(false);
  });

  it('returns true when team has exactly enough cap room', () => {
    const team = makeTeam({ capRoom: 10 });
    const player = makePlayer({
      waiverContract: { baseAnnual: 5, signingBonus: 10, yearsTotal: 2 },
    });
    // capHit = 10
    expect(canTeamClaimWaiverPlayer(team, player)).toBe(true);
  });

  it('returns true when player has no waiverContract', () => {
    const team = makeTeam({ capRoom: 0 });
    const player = makePlayer({ waiverContract: null });
    expect(canTeamClaimWaiverPlayer(team, player)).toBe(true);
  });

  it('returns true when player has undefined waiverContract', () => {
    const team = makeTeam({ capRoom: 0 });
    const player = makePlayer();
    delete player.waiverContract;
    expect(canTeamClaimWaiverPlayer(team, player)).toBe(true);
  });

  it('handles team with null capRoom as 0', () => {
    const team = makeTeam({ capRoom: null });
    const player = makePlayer({
      waiverContract: { baseAnnual: 1, signingBonus: 0, yearsTotal: 1 },
    });
    expect(canTeamClaimWaiverPlayer(team, player)).toBe(false);
  });

  it('handles missing baseAnnual/signingBonus in contract', () => {
    const team = makeTeam({ capRoom: 100 });
    const player = makePlayer({
      waiverContract: { yearsTotal: 2 }, // no baseAnnual or signingBonus
    });
    // capHit = 0 + 0/2 = 0
    expect(canTeamClaimWaiverPlayer(team, player)).toBe(true);
  });
});

// ── submitWaiverClaim ────────────────────────────────────────────────────────

describe('submitWaiverClaim', () => {
  it('adds a new claim to empty array', () => {
    const result = submitWaiverClaim([], makeClaim());
    expect(result.length).toBe(1);
  });

  it('adds a new claim without duplicates', () => {
    const existing = [makeClaim({ playerId: '1', teamId: 1 })];
    const newClaim = makeClaim({ playerId: '2', teamId: 1 });
    const result = submitWaiverClaim(existing, newClaim);
    expect(result.length).toBe(2);
  });

  it('does not add a duplicate (same playerId + teamId)', () => {
    const existing = [makeClaim({ playerId: '1', teamId: 1 })];
    const dup = makeClaim({ playerId: '1', teamId: 1 });
    const result = submitWaiverClaim(existing, dup);
    expect(result.length).toBe(1);
  });

  it('compares playerId and teamId as strings', () => {
    const existing = [makeClaim({ playerId: '1', teamId: 1 })];
    const dup = makeClaim({ playerId: 1, teamId: '1' }); // different types, same values
    const result = submitWaiverClaim(existing, dup);
    expect(result.length).toBe(1); // still a duplicate
  });

  it('does not mutate the original array', () => {
    const existing = [makeClaim()];
    const newClaim = makeClaim({ playerId: '99' });
    submitWaiverClaim(existing, newClaim);
    expect(existing.length).toBe(1); // unchanged
  });

  it('handles null/undefined claims array gracefully', () => {
    const result = submitWaiverClaim(null, makeClaim());
    expect(result.length).toBe(1);
  });
});

// ── findHighestPriorityClaim ──────────────────────────────────────────────────

describe('findHighestPriorityClaim', () => {
  it('returns null for empty claims', () => {
    expect(findHighestPriorityClaim([], [1, 2, 3])).toBeNull();
  });

  it('returns null for empty priority list', () => {
    expect(findHighestPriorityClaim([makeClaim()], [])).toBeNull();
  });

  it('returns the claim with lowest priority list index', () => {
    const claims = [
      makeClaim({ teamId: 3, playerId: '1' }),
      makeClaim({ teamId: 1, playerId: '1' }),
      makeClaim({ teamId: 2, playerId: '1' }),
    ];
    const priorityList = [1, 2, 3]; // team 1 has highest priority (index 0)
    const result = findHighestPriorityClaim(claims, priorityList);
    expect(result.teamId).toBe(1);
  });

  it('skips teams not in priority list', () => {
    const claims = [
      makeClaim({ teamId: 99, playerId: '1' }), // not in priority list
      makeClaim({ teamId: 2, playerId: '1' }),
    ];
    const priorityList = [1, 2, 3];
    const result = findHighestPriorityClaim(claims, priorityList);
    expect(result.teamId).toBe(2);
  });

  it('returns null when no claims are in priority list', () => {
    const claims = [makeClaim({ teamId: 99 })];
    const priorityList = [1, 2, 3];
    const result = findHighestPriorityClaim(claims, priorityList);
    expect(result).toBeNull();
  });

  it('handles string vs number teamId comparison', () => {
    const claims = [makeClaim({ teamId: '2', playerId: '1' })];
    const priorityList = [1, 2, 3]; // teamId 2 is at index 1
    const result = findHighestPriorityClaim(claims, priorityList);
    expect(String(result.teamId)).toBe('2');
  });
});

// ── processWaivers ───────────────────────────────────────────────────────────

describe('processWaivers', () => {
  function makeLeagueState(overrides = {}) {
    const teams = [
      makeTeam({ id: 1, name: 'Team A', capRoom: 50 }),
      makeTeam({ id: 2, name: 'Team B', capRoom: 50 }),
      makeTeam({ id: 3, name: 'Team C', capRoom: 50 }),
    ];
    const player = makePlayer({
      id: 10,
      name: 'Waiver Player',
      waiverStatus: 'ACTIVE',
      waiverWeekExpires: 12,
      waiverContract: { baseAnnual: 5, signingBonus: 0, yearsTotal: 1 },
      teamId: null,
      status: 'waiver',
    });
    return {
      players: [player],
      teams,
      activeWaiverClaims: [],
      waiverPriorityList: [1, 2, 3],
      currentWeek: 12,
      ...overrides,
    };
  }

  it('awards player to highest priority claimant', () => {
    const state = makeLeagueState({
      activeWaiverClaims: [
        makeClaim({ playerId: '10', teamId: 2 }),
        makeClaim({ playerId: '10', teamId: 1 }),
      ],
    });
    const result = processWaivers(state);
    const awarded = result.players.find(p => p.id === 10);
    expect(awarded.teamId).toBe(1); // team 1 is highest priority
    expect(awarded.status).toBe('active');
    expect(result.awards.length).toBe(1);
    expect(result.awards[0].teamId).toBe(1);
  });

  it('clears player to free agent when no claims', () => {
    const state = makeLeagueState({ activeWaiverClaims: [] });
    const result = processWaivers(state);
    const cleared = result.players.find(p => p.id === 10);
    expect(cleared.teamId).toBeNull();
    expect(cleared.status).toBe('free_agent');
    expect(result.clearances.length).toBe(1);
  });

  it('skips claimants who fail cap check', () => {
    const state = makeLeagueState({
      teams: [
        makeTeam({ id: 1, name: 'Team A', capRoom: 0 }), // can't afford
        makeTeam({ id: 2, name: 'Team B', capRoom: 50 }),
      ],
      waiverPriorityList: [1, 2],
      activeWaiverClaims: [
        makeClaim({ playerId: '10', teamId: 1 }),
        makeClaim({ playerId: '10', teamId: 2 }),
      ],
    });
    const result = processWaivers(state);
    const awarded = result.players.find(p => p.id === 10);
    expect(awarded.teamId).toBe(2); // team 1 skipped, team 2 wins
  });

  it('moves winning team to bottom of priority list', () => {
    const state = makeLeagueState({
      waiverPriorityList: [1, 2, 3],
      activeWaiverClaims: [makeClaim({ playerId: '10', teamId: 1 })],
    });
    const result = processWaivers(state);
    expect(result.waiverPriorityList[0]).toBe(2);
    expect(result.waiverPriorityList[result.waiverPriorityList.length - 1]).toBe(1);
  });

  it('sets contract from waiverContract when awarding', () => {
    const waiverContract = { baseAnnual: 8, signingBonus: 4, yearsTotal: 2, years: 2 };
    const state = makeLeagueState({
      players: [makePlayer({
        id: 10,
        waiverStatus: 'ACTIVE',
        waiverWeekExpires: 12,
        waiverContract,
        teamId: null,
        status: 'waiver',
      })],
      activeWaiverClaims: [makeClaim({ playerId: '10', teamId: 1 })],
    });
    const result = processWaivers(state);
    const awarded = result.players.find(p => p.id === 10);
    expect(awarded.contract).toEqual(waiverContract);
  });

  it('clears waiverStatus/waiverWeekExpires/waiverContract/previousTeamId on award', () => {
    const state = makeLeagueState({
      activeWaiverClaims: [makeClaim({ playerId: '10', teamId: 1 })],
    });
    const result = processWaivers(state);
    const awarded = result.players.find(p => p.id === 10);
    expect(awarded.waiverStatus).toBeUndefined();
    expect(awarded.waiverWeekExpires).toBeUndefined();
    expect(awarded.waiverContract).toBeUndefined();
    expect(awarded.previousTeamId).toBeUndefined();
  });

  it('only processes players with waiverStatus ACTIVE', () => {
    const state = makeLeagueState({
      players: [
        makePlayer({ id: 10, waiverStatus: 'ACTIVE', waiverWeekExpires: 12, waiverContract: { baseAnnual: 5, yearsTotal: 1 }, teamId: null, status: 'waiver' }),
        makePlayer({ id: 11, waiverStatus: null, status: 'active', teamId: 1 }), // not on waivers
      ],
      activeWaiverClaims: [
        makeClaim({ playerId: '10', teamId: 1 }),
      ],
    });
    const result = processWaivers(state);
    const p11 = result.players.find(p => p.id === 11);
    expect(p11.teamId).toBe(1); // unchanged
    expect(p11.status).toBe('active'); // unchanged
  });

  it('only processes players where waiverWeekExpires <= currentWeek', () => {
    const state = makeLeagueState({
      players: [
        makePlayer({ id: 10, waiverStatus: 'ACTIVE', waiverWeekExpires: 13, waiverContract: { baseAnnual: 5, yearsTotal: 1 }, teamId: null, status: 'waiver' }),
      ],
      currentWeek: 12, // expires next week
      activeWaiverClaims: [makeClaim({ playerId: '10', teamId: 1 })],
    });
    const result = processWaivers(state);
    const p = result.players.find(p => p.id === 10);
    // Not yet processed
    expect(p.waiverStatus).toBe('ACTIVE');
    expect(result.awards.length).toBe(0);
  });

  it('removes processed claims from activeWaiverClaims', () => {
    const state = makeLeagueState({
      activeWaiverClaims: [
        makeClaim({ playerId: '10', teamId: 1 }),
        makeClaim({ playerId: '10', teamId: 2 }),
        makeClaim({ playerId: '99', teamId: 1 }), // different player, should remain
      ],
    });
    const result = processWaivers(state);
    // Claims for player 10 should be removed
    const remainingForP10 = result.activeWaiverClaims.filter(c => c.playerId === '10');
    expect(remainingForP10.length).toBe(0);
    // Claim for player 99 should remain
    const remainingForP99 = result.activeWaiverClaims.filter(c => c.playerId === '99');
    expect(remainingForP99.length).toBe(1);
  });

  it('does not mutate input arrays', () => {
    const state = makeLeagueState({
      activeWaiverClaims: [makeClaim({ playerId: '10', teamId: 1 })],
    });
    const originalPlayers = [...state.players];
    const originalClaims = [...state.activeWaiverClaims];
    processWaivers(state);
    expect(state.players).toEqual(originalPlayers);
    expect(state.activeWaiverClaims).toEqual(originalClaims);
  });

  it('returns proper playerName and teamName in awards', () => {
    const state = makeLeagueState({
      activeWaiverClaims: [makeClaim({ playerId: '10', teamId: 1 })],
    });
    const result = processWaivers(state);
    expect(result.awards[0].playerName).toBe('Waiver Player');
    expect(result.awards[0].teamName).toBe('Team A');
  });

  it('handles empty inputs gracefully', () => {
    const result = processWaivers({
      players: [],
      teams: [],
      activeWaiverClaims: [],
      waiverPriorityList: [],
      currentWeek: 12,
    });
    expect(result.players).toEqual([]);
    expect(result.awards).toEqual([]);
    expect(result.clearances).toEqual([]);
  });

  it('processes multiple players in one call', () => {
    const state = {
      players: [
        makePlayer({ id: 10, name: 'Player A', waiverStatus: 'ACTIVE', waiverWeekExpires: 12, waiverContract: { baseAnnual: 5, yearsTotal: 1 }, teamId: null, status: 'waiver' }),
        makePlayer({ id: 11, name: 'Player B', waiverStatus: 'ACTIVE', waiverWeekExpires: 12, waiverContract: { baseAnnual: 5, yearsTotal: 1 }, teamId: null, status: 'waiver' }),
      ],
      teams: [
        makeTeam({ id: 1, name: 'Team A', capRoom: 100 }),
        makeTeam({ id: 2, name: 'Team B', capRoom: 100 }),
      ],
      activeWaiverClaims: [
        makeClaim({ playerId: '10', teamId: 1 }),
        makeClaim({ playerId: '11', teamId: 2 }),
      ],
      waiverPriorityList: [1, 2],
      currentWeek: 12,
    };
    const result = processWaivers(state);
    expect(result.awards.length).toBe(2);
    expect(result.clearances.length).toBe(0);
  });
});

// ── shouldAIClaimWaiverPlayer ─────────────────────────────────────────────────

describe('shouldAIClaimWaiverPlayer', () => {
  function makeLeagueState(overrides = {}) {
    return {
      players: [],
      teams: [],
      activeWaiverClaims: [],
      ...overrides,
    };
  }

  it('returns false when player is null', () => {
    const team = makeTeam();
    expect(shouldAIClaimWaiverPlayer(team, null, makeLeagueState())).toBe(false);
  });

  it('returns false when team is null', () => {
    const player = makePlayer({ ovr: 80 });
    expect(shouldAIClaimWaiverPlayer(null, player, makeLeagueState())).toBe(false);
  });

  it('returns false when team lacks cap room', () => {
    const team = makeTeam({ capRoom: 0 });
    const player = makePlayer({
      ovr: 80,
      pos: 'WR',
      waiverContract: { baseAnnual: 10, signingBonus: 0, yearsTotal: 1 },
    });
    expect(shouldAIClaimWaiverPlayer(team, player, makeLeagueState())).toBe(false);
  });

  it('returns false when team already has a claim for this player', () => {
    const team = makeTeam({ id: 1, capRoom: 100 });
    const player = makePlayer({ id: 5, ovr: 80, pos: 'WR', waiverContract: null });
    const leagueState = makeLeagueState({
      activeWaiverClaims: [makeClaim({ playerId: '5', teamId: 1 })],
    });
    expect(shouldAIClaimWaiverPlayer(team, player, leagueState)).toBe(false);
  });

  it('returns true when player OVR is greater than starter OVR minus 3', () => {
    const team = makeTeam({ id: 1, capRoom: 100 });
    const player = makePlayer({ id: 5, ovr: 80, pos: 'WR', waiverContract: null });
    const leagueState = makeLeagueState({
      players: [
        makePlayer({ id: 10, teamId: 1, pos: 'WR', ovr: 75 }), // starter at 75
      ],
    });
    // player.ovr (80) > starterOvr (75) - 3 = 72 → true
    expect(shouldAIClaimWaiverPlayer(team, player, leagueState)).toBe(true);
  });

  it('returns false when player OVR is not better enough than starter', () => {
    const team = makeTeam({ id: 1, capRoom: 100 });
    const player = makePlayer({ id: 5, ovr: 70, pos: 'WR', waiverContract: null });
    const leagueState = makeLeagueState({
      players: [
        makePlayer({ id: 10, teamId: 1, pos: 'WR', ovr: 85 }), // high OVR starter
      ],
    });
    // player.ovr (70) > starterOvr (85) - 3 = 82 → false
    expect(shouldAIClaimWaiverPlayer(team, player, leagueState)).toBe(false);
  });

  it('returns true when team has no player at that position (starterOvr = 0)', () => {
    const team = makeTeam({ id: 1, capRoom: 100 });
    const player = makePlayer({ id: 5, ovr: 60, pos: 'K', waiverContract: null });
    const leagueState = makeLeagueState({
      players: [], // no kicker
    });
    // player.ovr (60) > starterOvr (0) - 3 = -3 → true
    expect(shouldAIClaimWaiverPlayer(team, player, leagueState)).toBe(true);
  });

  it('uses highest OVR player at position as starter', () => {
    const team = makeTeam({ id: 1, capRoom: 100 });
    const player = makePlayer({ id: 5, ovr: 80, pos: 'QB', waiverContract: null });
    const leagueState = makeLeagueState({
      players: [
        makePlayer({ id: 10, teamId: 1, pos: 'QB', ovr: 75 }),
        makePlayer({ id: 11, teamId: 1, pos: 'QB', ovr: 90 }), // best QB
        makePlayer({ id: 12, teamId: 1, pos: 'QB', ovr: 60 }),
      ],
    });
    // player.ovr (80) > starterOvr (90) - 3 = 87 → false
    expect(shouldAIClaimWaiverPlayer(team, player, leagueState)).toBe(false);
  });
});

// ── generateAIWaiverClaims ────────────────────────────────────────────────────

describe('generateAIWaiverClaims', () => {
  it('returns unchanged claims when no waiver players', () => {
    const result = generateAIWaiverClaims({
      teams: [makeTeam({ id: 1 })],
      players: [makePlayer({ id: 1, status: 'active', waiverStatus: null })],
      waiverPriorityList: [1],
      activeWaiverClaims: [],
      currentWeek: 11,
      userTeamId: 99,
    });
    expect(result).toEqual([]);
  });

  it('skips user team', () => {
    const userTeam = makeTeam({ id: 1, capRoom: 100 });
    const waiverPlayer = makePlayer({
      id: 5,
      ovr: 80,
      pos: 'WR',
      waiverStatus: 'ACTIVE',
      teamId: null,
      waiverContract: null,
    });
    const result = generateAIWaiverClaims({
      teams: [userTeam],
      players: [waiverPlayer],
      waiverPriorityList: [1],
      activeWaiverClaims: [],
      currentWeek: 11,
      userTeamId: 1, // skip this team
    });
    expect(result.length).toBe(0);
  });

  it('generates claims for eligible AI teams', () => {
    const aiTeam = makeTeam({ id: 2, capRoom: 100 });
    const waiverPlayer = makePlayer({
      id: 5,
      ovr: 80,
      pos: 'WR',
      waiverStatus: 'ACTIVE',
      teamId: null,
      waiverContract: null,
    });
    const result = generateAIWaiverClaims({
      teams: [aiTeam],
      players: [waiverPlayer],
      waiverPriorityList: [2],
      activeWaiverClaims: [],
      currentWeek: 11,
      userTeamId: 1,
    });
    expect(result.length).toBe(1);
    expect(result[0].teamId).toBe(2);
    expect(String(result[0].playerId)).toBe('5');
    expect(result[0].origin).toBe('ai');
  });

  it('does not add duplicate claims', () => {
    const aiTeam = makeTeam({ id: 2, capRoom: 100 });
    const waiverPlayer = makePlayer({
      id: 5,
      ovr: 80,
      pos: 'WR',
      waiverStatus: 'ACTIVE',
      teamId: null,
      waiverContract: null,
    });
    const existingClaims = [
      { playerId: '5', teamId: 2, submittedWeek: 11, origin: 'ai' },
    ];
    const result = generateAIWaiverClaims({
      teams: [aiTeam],
      players: [waiverPlayer],
      waiverPriorityList: [2],
      activeWaiverClaims: existingClaims,
      currentWeek: 11,
      userTeamId: 1,
    });
    // Should not add another claim for same player+team
    const claimsForP5 = result.filter(c => String(c.playerId) === '5' && String(c.teamId) === '2');
    expect(claimsForP5.length).toBe(1);
  });

  it('processes teams in waiverPriorityList order', () => {
    const teams = [
      makeTeam({ id: 1, capRoom: 100 }),
      makeTeam({ id: 2, capRoom: 100 }),
    ];
    const waiverPlayer = makePlayer({
      id: 5,
      ovr: 50,
      pos: 'WR',
      waiverStatus: 'ACTIVE',
      teamId: null,
      waiverContract: null,
    });
    const result = generateAIWaiverClaims({
      teams,
      players: [waiverPlayer],
      waiverPriorityList: [2, 1], // team 2 first
      activeWaiverClaims: [],
      currentWeek: 11,
      userTeamId: 99, // neither team is user
    });
    // Both teams should claim (player is better than no starter)
    expect(result.length).toBe(2);
  });

  it('handles empty inputs gracefully', () => {
    const result = generateAIWaiverClaims({
      teams: [],
      players: [],
      waiverPriorityList: [],
      activeWaiverClaims: [],
      currentWeek: 11,
      userTeamId: 1,
    });
    expect(result).toEqual([]);
  });
});
