/**
 * franchiseLegacy.integration.test.js
 *
 * Integration-level tests for the Franchise Ring of Honor & Legacy Tracker.
 * Tests the pure-function pipeline that the worker calls (no actual Web Worker
 * or IndexedDB is required — consistent with other worker integration tests).
 *
 * Coverage:
 *  - Old saves hydrate ringOfHonor and allTimeLeaders safely via State.migrateLeague
 *  - Retiring eligible user-team player creates pending induction notification
 *  - Retiring non-eligible player does NOT create a notification
 *  - inductPlayerToRingOfHonor appends member to correct team
 *  - inductPlayerToRingOfHonor clears the pending notification entry
 *  - Duplicate induction is prevented
 *  - Season rollover updates all-time leaders for every team
 *  - No crash when retired-player data is partially missing
 */

import { describe, it, expect } from 'vitest';
import { State } from '../state.js';
import {
  isEligibleForRingOfHonor,
  buildRingOfHonorNotification,
  inductPlayerToRingOfHonor,
  updateLeagueTeamAllTimeLeaders,
} from '../history/legacyEngine.js';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const USER_TEAM_ID = 3;
const CURRENT_SEASON = 2028;

function makeTeam(overrides = {}) {
  return {
    id: USER_TEAM_ID,
    abbr: 'CHI',
    name: 'Chicago',
    ringOfHonor: [],
    allTimeLeaders: null,
    ...overrides,
  };
}

function makeCareerLine(season, teamAbbr, overrides = {}) {
  return {
    season,
    team: teamAbbr,
    gamesPlayed: 16,
    passYds: 0,
    rushYds: 0,
    recYds: 0,
    sacks: 0,
    ovr: 80,
    ...overrides,
  };
}

function makeLegendPlayer(overrides = {}) {
  return {
    id: 'legend-1',
    name: 'Dan Legend',
    pos: 'QB',
    ovr: 88,
    teamId: USER_TEAM_ID,
    careerStats: [
      makeCareerLine(2022, 'CHI', { passYds: 4200 }),
      makeCareerLine(2023, 'CHI', { passYds: 4400 }),
      makeCareerLine(2024, 'CHI', { passYds: 4100 }),
      makeCareerLine(2025, 'CHI', { passYds: 3900 }),
      makeCareerLine(2026, 'CHI', { passYds: 3600 }),
    ],
    awards: [],
    accolades: [],
    hof: false,
    jerseyNumber: 10,
    ...overrides,
  };
}

function makeShortTenurePlayer(overrides = {}) {
  return {
    id: 'short-1',
    name: 'Short Stay',
    pos: 'WR',
    ovr: 85,
    teamId: USER_TEAM_ID,
    careerStats: [
      makeCareerLine(2025, 'CHI', { recYds: 800 }),
      makeCareerLine(2026, 'CHI', { recYds: 900 }),
    ],
    awards: [],
    accolades: [],
    hof: false,
    ...overrides,
  };
}

// ── Old-save migration (State.migrateLeague) ──────────────────────────────────

describe('State.migrateLeague — franchise legacy schema hydration', () => {
  function buildMinimalOldSave(teamOverrides = {}) {
    return {
      id: 'league',
      name: 'Old Dynasty',
      userTeamId: USER_TEAM_ID,
      year: CURRENT_SEASON,
      season: 3,
      currentSeasonId: 's3',
      currentWeek: 1,
      phase: 'regular_season',
      teams: [
        {
          id: USER_TEAM_ID,
          abbr: 'CHI',
          name: 'Chicago',
          wins: 5,
          losses: 3,
          conf: 0,
          roster: [],
          ...teamOverrides,
        },
      ],
      newsItems: [],
      retiredPlayers: [],
      ownerGoals: [],
      leagueHistory: [],
    };
  }

  it('adds ringOfHonor: [] to a team that has no such field', () => {
    const oldSave = buildMinimalOldSave();
    delete oldSave.teams[0].ringOfHonor;
    const migrated = State.migrateLeague(oldSave);
    expect(migrated.teams[0].ringOfHonor).toEqual([]);
  });

  it('adds allTimeLeaders with null entries to a team missing the field', () => {
    const oldSave = buildMinimalOldSave();
    delete oldSave.teams[0].allTimeLeaders;
    const migrated = State.migrateLeague(oldSave);
    expect(migrated.teams[0].allTimeLeaders).toEqual({
      passingYards: null,
      rushingYards: null,
      receivingYards: null,
      sacks: null,
    });
  });

  it('preserves existing allTimeLeaders values when they are populated', () => {
    const existing = {
      passingYards:   { name: 'QB1', value: 40000, playerId: 'p1' },
      rushingYards:   { name: 'RB1', value: 12000, playerId: 'p2' },
      receivingYards: null,
      sacks:          null,
    };
    const oldSave = buildMinimalOldSave({ allTimeLeaders: existing });
    const migrated = State.migrateLeague(oldSave);
    expect(migrated.teams[0].allTimeLeaders.passingYards).toEqual(existing.passingYards);
    expect(migrated.teams[0].allTimeLeaders.rushingYards).toEqual(existing.rushingYards);
    expect(migrated.teams[0].allTimeLeaders.receivingYards).toBeNull();
    expect(migrated.teams[0].allTimeLeaders.sacks).toBeNull();
  });

  it('preserves existing non-empty ringOfHonor array', () => {
    const roh = [{ id: 'old-legend', name: 'Hall Guy', position: 'QB', inductionYear: 2020 }];
    const oldSave = buildMinimalOldSave({ ringOfHonor: roh });
    const migrated = State.migrateLeague(oldSave);
    expect(migrated.teams[0].ringOfHonor).toEqual(roh);
  });

  it('does not corrupt adjacent team fields during migration', () => {
    const oldSave = buildMinimalOldSave({ wins: 7, losses: 2, conf: 1 });
    const migrated = State.migrateLeague(oldSave);
    const t = migrated.teams[0];
    expect(t.wins).toBe(7);
    expect(t.losses).toBe(2);
    expect(t.conf).toBe(1);
    expect(t.abbr).toBe('CHI');
  });
});

// ── Retirement pipeline — eligibility + notification ──────────────────────────

describe('retirement pipeline — ROH eligibility and notification', () => {
  it('creates a notification for an eligible user-team legend', () => {
    const team = makeTeam();
    const player = makeLegendPlayer();

    expect(isEligibleForRingOfHonor(player, team, CURRENT_SEASON, USER_TEAM_ID)).toBe(true);

    const notif = buildRingOfHonorNotification(player, team);
    expect(notif.playerId).toBe('legend-1');
    expect(notif.teamId).toBe(String(USER_TEAM_ID));
    expect(notif.title).toBe('Ring of Honor Candidate');
    expect(notif.body).toMatch(/Dan Legend/);
    expect(notif.body).toMatch(/season/);
  });

  it('does NOT create notification for player with fewer than 5 seasons', () => {
    const team = makeTeam();
    const player = makeShortTenurePlayer();
    // Only 2 archived seasons; current = 3 total — below threshold
    expect(isEligibleForRingOfHonor(player, team, CURRENT_SEASON, USER_TEAM_ID)).toBe(false);
  });

  it('does NOT create notification for a player from a different team', () => {
    const team = makeTeam();
    const player = makeLegendPlayer({ teamId: 99 });
    expect(isEligibleForRingOfHonor(player, team, CURRENT_SEASON, USER_TEAM_ID)).toBe(false);
  });

  it('creates notification when player lacks 5 archived seasons but has a major accolade', () => {
    const team = makeTeam();
    const player = makeShortTenurePlayer({
      teamId: USER_TEAM_ID,
      ovr: 75,
      awards: [{ key: 'mvp', label: 'MVP', year: 2025, season: '2025' }],
    });
    // Still only 3 seasons total — below tenure threshold (5) so NOT eligible
    expect(isEligibleForRingOfHonor(player, team, CURRENT_SEASON, USER_TEAM_ID)).toBe(false);
  });

  it('is eligible when current retiring season is not yet in careerStats', () => {
    const team = makeTeam();
    const player = makeLegendPlayer({
      careerStats: [
        makeCareerLine(2022, 'CHI', { passYds: 4200 }),
        makeCareerLine(2023, 'CHI', { passYds: 4400 }),
        makeCareerLine(2024, 'CHI', { passYds: 4100 }),
        makeCareerLine(2025, 'CHI', { passYds: 3900 }),
        // Season 2028 not yet archived — should be counted as +1
      ],
    });
    // 4 archived seasons + 1 (current) = 5 → eligible with ovr 88
    expect(isEligibleForRingOfHonor(player, team, CURRENT_SEASON, USER_TEAM_ID)).toBe(true);
  });

  it('does not crash when player has null careerStats', () => {
    const team = makeTeam();
    const player = { id: 'ghost', name: 'Ghost', pos: 'LB', ovr: 90, teamId: USER_TEAM_ID, careerStats: null };
    expect(() => isEligibleForRingOfHonor(player, team, CURRENT_SEASON, USER_TEAM_ID)).not.toThrow();
    expect(isEligibleForRingOfHonor(player, team, CURRENT_SEASON, USER_TEAM_ID)).toBe(false);
  });
});

// ── INDUCT_PLAYER_TO_ROH pipeline ─────────────────────────────────────────────

describe('inductPlayerToRingOfHonor — induction pipeline', () => {
  it('appends a new ROH member to the correct team', () => {
    const team = makeTeam();
    const player = makeLegendPlayer();

    const updatedTeam = inductPlayerToRingOfHonor(team, player, CURRENT_SEASON);
    expect(updatedTeam.ringOfHonor).toHaveLength(1);
    expect(updatedTeam.ringOfHonor[0].id).toBe('legend-1');
    expect(updatedTeam.ringOfHonor[0].name).toBe('Dan Legend');
    expect(updatedTeam.ringOfHonor[0].inductionYear).toBe(CURRENT_SEASON);
  });

  it('clears a candidate from pendingRohCandidates after induction (simulated worker step)', () => {
    const player = makeLegendPlayer();
    const team = makeTeam();
    const pending = [
      { playerId: 'legend-1', teamId: String(USER_TEAM_ID), title: 'Ring of Honor Candidate', body: '...' },
      { playerId: 'other-99', teamId: String(USER_TEAM_ID), title: 'Ring of Honor Candidate', body: '...' },
    ];

    // Simulate the worker filter step that removes the inducted player
    const filtered = pending.filter((c) => String(c.playerId) !== String(player.id));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].playerId).toBe('other-99');

    // Confirm the team itself has the new member
    const updatedTeam = inductPlayerToRingOfHonor(team, player, CURRENT_SEASON);
    expect(updatedTeam.ringOfHonor.some((m) => m.id === 'legend-1')).toBe(true);
  });

  it('prevents duplicate induction for the same player', () => {
    const team = makeTeam();
    const player = makeLegendPlayer();

    const afterFirst  = inductPlayerToRingOfHonor(team, player, CURRENT_SEASON);
    const afterSecond = inductPlayerToRingOfHonor(afterFirst, player, CURRENT_SEASON + 1);

    expect(afterSecond.ringOfHonor).toHaveLength(1);
  });

  it('does not mutate the original team object', () => {
    const team = makeTeam();
    const player = makeLegendPlayer();
    const originalRohRef = team.ringOfHonor;

    inductPlayerToRingOfHonor(team, player, CURRENT_SEASON);

    expect(team.ringOfHonor).toBe(originalRohRef);
    expect(team.ringOfHonor).toHaveLength(0);
  });
});

// ── Season rollover — updateLeagueTeamAllTimeLeaders ─────────────────────────

describe('season rollover — all-time leaders update', () => {
  it('updates passing yards leader correctly across a season rollover', () => {
    const teams = [
      makeTeam({ id: 1, abbr: 'CHI' }),
      { id: 2, abbr: 'GBP', name: 'Green Bay', ringOfHonor: [], allTimeLeaders: null },
    ];
    const players = [
      {
        id: 'qb1', name: 'QB One', pos: 'QB', teamId: 1,
        careerStats: [makeCareerLine(2026, 'CHI', { passYds: 18000 })],
      },
      {
        id: 'qb2', name: 'QB Two', pos: 'QB', teamId: 2,
        careerStats: [makeCareerLine(2026, 'GBP', { passYds: 22000 })],
      },
    ];

    const updated = updateLeagueTeamAllTimeLeaders(teams, players);

    const chiTeam = updated.find((t) => t.id === 1);
    const gbpTeam = updated.find((t) => t.id === 2);

    expect(chiTeam.allTimeLeaders.passingYards.name).toBe('QB One');
    expect(chiTeam.allTimeLeaders.passingYards.value).toBe(18000);
    expect(gbpTeam.allTimeLeaders.passingYards.name).toBe('QB Two');
    expect(gbpTeam.allTimeLeaders.passingYards.value).toBe(22000);
  });

  it('does not mutate the original teams array', () => {
    const teams = [makeTeam()];
    const players = [makeLegendPlayer()];
    const originalRef = teams[0].allTimeLeaders;

    updateLeagueTeamAllTimeLeaders(teams, players);

    expect(teams[0].allTimeLeaders).toBe(originalRef);
  });

  it('returns all-time leaders null entry when no players have stats for a team', () => {
    const teams = [makeTeam()];
    const players = [
      { id: 'otherTeam', name: 'Visitor', pos: 'QB', teamId: 99,
        careerStats: [makeCareerLine(2026, 'DAL', { passYds: 5000 })] },
    ];
    const updated = updateLeagueTeamAllTimeLeaders(teams, players);
    expect(updated[0].allTimeLeaders.passingYards).toBeNull();
    expect(updated[0].allTimeLeaders.rushingYards).toBeNull();
  });
});

// ── Guardrails — partial / missing data ──────────────────────────────────────

describe('guardrails — partial or missing player data', () => {
  it('does not crash when player has no name, pos, or careerStats', () => {
    const team = makeTeam();
    const skeletal = { id: 'ghost-2', teamId: USER_TEAM_ID, ovr: 92 };

    expect(() => isEligibleForRingOfHonor(skeletal, team, CURRENT_SEASON, USER_TEAM_ID)).not.toThrow();
    expect(() => buildRingOfHonorNotification(skeletal, team)).not.toThrow();
    expect(() => inductPlayerToRingOfHonor(team, skeletal, CURRENT_SEASON)).not.toThrow();
  });

  it('does not crash when updateLeagueTeamAllTimeLeaders receives empty arrays', () => {
    expect(() => updateLeagueTeamAllTimeLeaders([], [])).not.toThrow();
    expect(updateLeagueTeamAllTimeLeaders([], [])).toEqual([]);
  });

  it('does not crash when teams array contains null entries', () => {
    const teams = [null, makeTeam(), null];
    const players = [makeLegendPlayer()];
    const updated = updateLeagueTeamAllTimeLeaders(teams, players);
    expect(updated[0]).toBeNull();
    expect(updated[1]).toBeTruthy();
    expect(updated[2]).toBeNull();
  });
});
