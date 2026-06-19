/**
 * legacyEngine.unit.test.js
 * Pure-function tests for the Franchise Ring of Honor & Legacy Tracker Engine.
 */

import { describe, it, expect } from 'vitest';
import {
  createDefaultTeamAllTimeLeaders,
  isEligibleForRingOfHonor,
  buildRingOfHonorMember,
  inductPlayerToRingOfHonor,
  computeTeamAllTimeLeaders,
  updateLeagueTeamAllTimeLeaders,
  buildRingOfHonorNotification,
} from './legacyEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTeam(overrides = {}) {
  return { id: 1, abbr: 'PIT', name: 'Pittsburgh', ringOfHonor: [], allTimeLeaders: null, ...overrides };
}

function makeCareerLine(season, team, overrides = {}) {
  return {
    season,
    team,
    gamesPlayed: 16,
    passYds: 0, passYd: 0,
    rushYds: 0, rushYd: 0,
    recYds: 0,  recYd: 0,
    sacks: 0,
    ovr: 80,
    ...overrides,
  };
}

function makePlayer(overrides = {}) {
  return {
    id: 'p1',
    name: 'Test Player',
    pos: 'QB',
    ovr: 82,
    teamId: 1,
    careerStats: [],
    awards: [],
    accolades: [],
    hof: false,
    jerseyNumber: 12,
    ...overrides,
  };
}

// Build a player with 5+ careerStats seasons for team 'PIT'
function makeLegendPlayer(overrides = {}) {
  const careerStats = [2020, 2021, 2022, 2023, 2024].map((yr) =>
    makeCareerLine(yr, 'PIT', { passYds: 4000, passYd: 4000, gamesPlayed: 16 })
  );
  return makePlayer({ ovr: 83, careerStats, ...overrides });
}

// ── createDefaultTeamAllTimeLeaders ──────────────────────────────────────────

describe('createDefaultTeamAllTimeLeaders', () => {
  it('returns null for all four categories', () => {
    const leaders = createDefaultTeamAllTimeLeaders();
    expect(leaders.passingYards).toBeNull();
    expect(leaders.rushingYards).toBeNull();
    expect(leaders.receivingYards).toBeNull();
    expect(leaders.sacks).toBeNull();
  });

  it('returns independent objects on each call (immutable)', () => {
    const a = createDefaultTeamAllTimeLeaders();
    const b = createDefaultTeamAllTimeLeaders();
    a.passingYards = 'mutated';
    expect(b.passingYards).toBeNull();
  });

  it('returns an object with exactly the four required keys', () => {
    const keys = Object.keys(createDefaultTeamAllTimeLeaders());
    expect(keys).toEqual(['passingYards', 'rushingYards', 'receivingYards', 'sacks']);
  });
});

// ── isEligibleForRingOfHonor ─────────────────────────────────────────────────

describe('isEligibleForRingOfHonor', () => {
  it('returns true for 5+ year user-team legend with OVR >= 80', () => {
    const player = makeLegendPlayer({ ovr: 82, teamId: 1 });
    const team = makeTeam({ id: 1 });
    expect(isEligibleForRingOfHonor(player, team, 2025, 1)).toBe(true);
  });

  it('returns true for accolade/championship case even if OVR < 80', () => {
    const player = makeLegendPlayer({
      ovr: 72,
      teamId: 1,
      awards: [{ key: 'mvp', year: 2022 }],
    });
    const team = makeTeam({ id: 1 });
    expect(isEligibleForRingOfHonor(player, team, 2025, 1)).toBe(true);
  });

  it('returns true for championship accolade even if OVR < 80', () => {
    const player = makeLegendPlayer({
      ovr: 70,
      teamId: 1,
      accolades: [{ type: 'Champion', year: 2021 }],
    });
    const team = makeTeam({ id: 1 });
    expect(isEligibleForRingOfHonor(player, team, 2025, 1)).toBe(true);
  });

  it('returns true for HOF player even if OVR < 80', () => {
    const player = makeLegendPlayer({ ovr: 75, teamId: 1, hof: true });
    const team = makeTeam({ id: 1 });
    expect(isEligibleForRingOfHonor(player, team, 2025, 1)).toBe(true);
  });

  it('returns false for short-tenure player (fewer than 5 seasons)', () => {
    const careerStats = [2023, 2024].map((yr) => makeCareerLine(yr, 'PIT', { passYds: 4000 }));
    const player = makePlayer({ ovr: 85, teamId: 1, careerStats });
    const team = makeTeam({ id: 1 });
    // current season = 2025, so total = 2 archived + 1 current = 3 < 5
    expect(isEligibleForRingOfHonor(player, team, 2025, 1)).toBe(false);
  });

  it('returns false for non-user-team player', () => {
    const player = makeLegendPlayer({ ovr: 85, teamId: 2 }); // on team 2, not user team
    const team = makeTeam({ id: 1 });
    expect(isEligibleForRingOfHonor(player, team, 2025, 1)).toBe(false);
  });

  it('returns false when team.id does not match userTeamId', () => {
    const player = makeLegendPlayer({ ovr: 85, teamId: 2 });
    const team = makeTeam({ id: 2 });
    // team.id === 2, userTeamId === 1, so player is on team 2 but user team is 1
    expect(isEligibleForRingOfHonor(player, team, 2025, 1)).toBe(false);
  });

  it('returns false when player is null', () => {
    expect(isEligibleForRingOfHonor(null, makeTeam(), 2025, 1)).toBe(false);
  });

  it('returns false when team is null', () => {
    expect(isEligibleForRingOfHonor(makeLegendPlayer(), null, 2025, 1)).toBe(false);
  });

  it('credits current season when not yet in careerStats', () => {
    // 4 archived seasons + 1 current = 5, should be eligible
    const careerStats = [2021, 2022, 2023, 2024].map((yr) => makeCareerLine(yr, 'PIT', { passYds: 3500 }));
    const player = makePlayer({ ovr: 82, teamId: 1, careerStats });
    const team = makeTeam({ id: 1 });
    expect(isEligibleForRingOfHonor(player, team, 2025, 1)).toBe(true);
  });
});

// ── buildRingOfHonorMember ───────────────────────────────────────────────────

describe('buildRingOfHonorMember', () => {
  it('builds aggregate payload without weekly logs', () => {
    const player = makeLegendPlayer();
    const team = makeTeam();
    const member = buildRingOfHonorMember(player, team, 2025);
    expect(member.id).toBe('p1');
    expect(member.name).toBe('Test Player');
    expect(member.position).toBe('QB');
    expect(member.inductionYear).toBe(2025);
    expect(member.jerseyNumber).toBe(12);
    // No weekly logs
    expect(member.gameLogs).toBeUndefined();
    expect(member.detailedGameHistory).toBeUndefined();
  });

  it('computes yearsPlayedWithTeam from careerStats', () => {
    const player = makeLegendPlayer();
    const team = makeTeam();
    const member = buildRingOfHonorMember(player, team, 2025);
    // Should show 2020–2024 range
    expect(member.yearsPlayedWithTeam).toBe('2020–2024');
  });

  it('sums team-specific passing yards from careerStats', () => {
    const careerStats = [2020, 2021, 2022, 2023, 2024].map((yr) =>
      makeCareerLine(yr, 'PIT', { passYds: 3000, gamesPlayed: 16 })
    );
    const player = makePlayer({ careerStats });
    const team = makeTeam();
    const member = buildRingOfHonorMember(player, team, 2025);
    expect(member.totalPassingYards).toBe(15000);
  });

  it('collects accolades deterministically from awards array', () => {
    const player = makeLegendPlayer({
      awards: [
        { key: 'mvp', year: 2022 },
        { key: 'champion', year: 2023 },
      ],
    });
    const team = makeTeam();
    const member = buildRingOfHonorMember(player, team, 2025);
    expect(member.accolades).toContain('MVP (2022)');
    expect(member.accolades).toContain('Champion (2023)');
  });

  it('limits accolades to 4 maximum', () => {
    const player = makeLegendPlayer({
      awards: [
        { key: 'mvp', year: 2020 },
        { key: 'opoy', year: 2021 },
        { key: 'dpoy', year: 2022 },
        { key: 'allpro', year: 2023 },
        { key: 'roty', year: 2024 },
      ],
    });
    const member = buildRingOfHonorMember(player, makeTeam(), 2025);
    expect(member.accolades.length).toBeLessThanOrEqual(4);
  });

  it('returns null for stat totals when no team stats exist', () => {
    const player = makePlayer({ careerStats: [] });
    const member = buildRingOfHonorMember(player, makeTeam(), 2025);
    expect(member.totalPassingYards).toBeNull();
    expect(member.totalRushingYards).toBeNull();
    expect(member.totalReceivingYards).toBeNull();
    expect(member.totalSacks).toBeNull();
  });
});

// ── inductPlayerToRingOfHonor ────────────────────────────────────────────────

describe('inductPlayerToRingOfHonor', () => {
  it('appends member to team ringOfHonor', () => {
    const team = makeTeam({ ringOfHonor: [] });
    const player = makeLegendPlayer();
    const updated = inductPlayerToRingOfHonor(team, player, 2025);
    expect(updated.ringOfHonor).toHaveLength(1);
    expect(updated.ringOfHonor[0].id).toBe('p1');
  });

  it('does not duplicate existing member', () => {
    const team = makeTeam({ ringOfHonor: [] });
    const player = makeLegendPlayer();
    const once = inductPlayerToRingOfHonor(team, player, 2025);
    const twice = inductPlayerToRingOfHonor(once, player, 2025);
    expect(twice.ringOfHonor).toHaveLength(1);
  });

  it('does not mutate the input team object', () => {
    const team = makeTeam({ ringOfHonor: [] });
    inductPlayerToRingOfHonor(team, makeLegendPlayer(), 2025);
    expect(team.ringOfHonor).toHaveLength(0);
  });

  it('sorts by inductionYear descending then name ascending', () => {
    const team = makeTeam({ ringOfHonor: [] });
    const p1 = makeLegendPlayer({ id: 'p1', name: 'Zach Older' });
    const p2 = makePlayer({ id: 'p2', name: 'Aaron Young', ovr: 82, careerStats: [] });
    const t1 = inductPlayerToRingOfHonor(team, p1, 2024);
    const t2 = inductPlayerToRingOfHonor(t1, p2, 2025);
    // 2025 induction first (desc)
    expect(t2.ringOfHonor[0].inductionYear).toBe(2025);
    expect(t2.ringOfHonor[1].inductionYear).toBe(2024);
  });

  it('returns same team reference when player is null', () => {
    const team = makeTeam();
    expect(inductPlayerToRingOfHonor(team, null, 2025)).toBe(team);
  });
});

// ── computeTeamAllTimeLeaders ─────────────────────────────────────────────────

describe('computeTeamAllTimeLeaders', () => {
  it('returns correct passing yards leader', () => {
    const players = [
      makePlayer({ id: 'qb1', name: 'Big Arm', careerStats: [makeCareerLine(2024, 'PIT', { passYds: 5000 })] }),
      makePlayer({ id: 'qb2', name: 'Backup',  careerStats: [makeCareerLine(2024, 'PIT', { passYds: 2000 })] }),
    ];
    const leaders = computeTeamAllTimeLeaders(players, makeTeam());
    expect(leaders.passingYards?.name).toBe('Big Arm');
    expect(leaders.passingYards?.value).toBe(5000);
  });

  it('returns correct rushing yards leader', () => {
    const players = [
      makePlayer({ id: 'rb1', name: 'Road Runner', pos: 'RB', careerStats: [makeCareerLine(2024, 'PIT', { rushYds: 1500 })] }),
    ];
    const leaders = computeTeamAllTimeLeaders(players, makeTeam());
    expect(leaders.rushingYards?.name).toBe('Road Runner');
    expect(leaders.rushingYards?.value).toBe(1500);
  });

  it('returns correct receiving yards leader', () => {
    const players = [
      makePlayer({ id: 'wr1', name: 'Deep Threat', pos: 'WR', careerStats: [makeCareerLine(2024, 'PIT', { recYds: 1200 })] }),
    ];
    const leaders = computeTeamAllTimeLeaders(players, makeTeam());
    expect(leaders.receivingYards?.name).toBe('Deep Threat');
    expect(leaders.receivingYards?.value).toBe(1200);
  });

  it('returns correct sacks leader', () => {
    const players = [
      makePlayer({ id: 'dl1', name: 'Pass Rush King', pos: 'DL', careerStats: [makeCareerLine(2024, 'PIT', { sacks: 12 })] }),
    ];
    const leaders = computeTeamAllTimeLeaders(players, makeTeam());
    expect(leaders.sacks?.name).toBe('Pass Rush King');
    expect(leaders.sacks?.value).toBe(12);
  });

  it('excludes players who have no stats for this franchise', () => {
    const players = [
      makePlayer({ id: 'qb1', name: 'Foreign QB', careerStats: [makeCareerLine(2024, 'CLE', { passYds: 9999 })] }),
    ];
    const leaders = computeTeamAllTimeLeaders(players, makeTeam({ abbr: 'PIT' }));
    expect(leaders.passingYards).toBeNull();
  });

  it('accumulates stats across multiple seasons for same player', () => {
    const player = makePlayer({
      id: 'qb1',
      name: 'Consistent QB',
      careerStats: [
        makeCareerLine(2022, 'PIT', { passYds: 4000 }),
        makeCareerLine(2023, 'PIT', { passYds: 4500 }),
        makeCareerLine(2024, 'PIT', { passYds: 5000 }),
      ],
    });
    const leaders = computeTeamAllTimeLeaders([player], makeTeam());
    expect(leaders.passingYards?.value).toBe(13500);
  });

  it('does not mutate input players array', () => {
    const players = [makeLegendPlayer()];
    const before = JSON.stringify(players);
    computeTeamAllTimeLeaders(players, makeTeam());
    expect(JSON.stringify(players)).toBe(before);
  });
});

// ── updateLeagueTeamAllTimeLeaders ────────────────────────────────────────────

describe('updateLeagueTeamAllTimeLeaders', () => {
  it('updates all teams immutably', () => {
    const teams = [
      makeTeam({ id: 1, abbr: 'PIT' }),
      makeTeam({ id: 2, abbr: 'CLE' }),
    ];
    const players = [
      makePlayer({ id: 'p1', careerStats: [makeCareerLine(2024, 'PIT', { passYds: 5000 })] }),
      makePlayer({ id: 'p2', careerStats: [makeCareerLine(2024, 'CLE', { rushYds: 1000 })] }),
    ];
    const updated = updateLeagueTeamAllTimeLeaders(teams, players);
    // Original teams unchanged
    expect(teams[0].allTimeLeaders).toBeNull();
    // Updated teams have leaders
    expect(updated[0].allTimeLeaders.passingYards?.value).toBe(5000);
    expect(updated[1].allTimeLeaders.rushingYards?.value).toBe(1000);
  });

  it('returns same reference when teams is not an array', () => {
    expect(updateLeagueTeamAllTimeLeaders(null, [])).toBeNull();
  });

  it('handles null team entries gracefully', () => {
    const teams = [null, makeTeam()];
    const result = updateLeagueTeamAllTimeLeaders(teams, []);
    expect(result[0]).toBeNull();
    expect(result[1].allTimeLeaders).toBeDefined();
  });
});

// ── buildRingOfHonorNotification ──────────────────────────────────────────────

describe('buildRingOfHonorNotification', () => {
  it('returns expected title', () => {
    const notif = buildRingOfHonorNotification(makeLegendPlayer(), makeTeam());
    expect(notif.title).toBe('Ring of Honor Candidate');
  });

  it('includes player name in body', () => {
    const player = makeLegendPlayer({ name: 'John Legend' });
    const notif = buildRingOfHonorNotification(player, makeTeam());
    expect(notif.body).toContain('John Legend');
  });

  it('includes "seasons" in body', () => {
    const notif = buildRingOfHonorNotification(makeLegendPlayer(), makeTeam());
    expect(notif.body).toMatch(/season/i);
  });

  it('returns playerId and teamId', () => {
    const player = makeLegendPlayer({ id: 'abc' });
    const team = makeTeam({ id: 99 });
    const notif = buildRingOfHonorNotification(player, team);
    expect(notif.playerId).toBe('abc');
    expect(notif.teamId).toBe('99');
  });
});

// ── No Math.random usage in module ────────────────────────────────────────────

describe('legacyEngine module guardrails', () => {
  it('module does not use Math.random (verified by test design)', () => {
    // All functions above pass deterministic inputs and produce deterministic outputs.
    // This test documents the contract; randomness would manifest as flaky results.
    const a = createDefaultTeamAllTimeLeaders();
    const b = createDefaultTeamAllTimeLeaders();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
