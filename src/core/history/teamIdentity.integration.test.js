/**
 * teamIdentity.integration.test.js
 * Integration tests for jersey retirement & championship wall engine wiring.
 * Tests are pure-JS (no worker/DOM) — they operate directly on engine functions
 * and the migrateLeague schema from state.js.
 */

import { describe, it, expect } from 'vitest';
import {
  retireJerseyNumber,
  appendChampionshipYear,
  isRetiredNumber,
  findAvailableJerseyNumber,
  buildRetiredNumberDisplay,
  createDefaultTeamIdentity,
} from './teamIdentityEngine.js';
import { State } from '../../core/state.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTeam(overrides = {}) {
  return {
    id: 1,
    abbr: 'PIT',
    name: 'Pittsburgh',
    ringOfHonor: [],
    retiredNumbers: [],
    championshipYears: [],
    roster: [],
    picks: [],
    ...overrides,
  };
}

function makePlayer(overrides = {}) {
  return {
    id: 'p1',
    name: 'Dan Legend',
    pos: 'QB',
    jerseyNumber: 12,
    teamId: 1,
    ...overrides,
  };
}

function makeLegacyTeam(overrides = {}) {
  return {
    id: 1,
    abbr: 'PIT',
    name: 'Pittsburgh',
    ringOfHonor: [],
    roster: [],
    picks: [],
    // deliberately missing retiredNumbers and championshipYears
    ...overrides,
  };
}

// ── Old saves hydration ───────────────────────────────────────────────────────

describe('Schema hydration — old saves', () => {
  it('migrateLeague adds retiredNumbers to teams that lack it', () => {
    const league = {
      teams: [makeLegacyTeam(), makeLegacyTeam({ id: 2, abbr: 'GB' })],
      historyLedger: [],
      recordBook: {},
    };
    const migrated = State.migrateLeague(league);
    migrated.teams.forEach((t) => {
      expect(Array.isArray(t.retiredNumbers)).toBe(true);
    });
  });

  it('migrateLeague adds championshipYears to teams that lack it', () => {
    const league = {
      teams: [makeLegacyTeam(), makeLegacyTeam({ id: 2, abbr: 'GB' })],
      historyLedger: [],
      recordBook: {},
    };
    const migrated = State.migrateLeague(league);
    migrated.teams.forEach((t) => {
      expect(Array.isArray(t.championshipYears)).toBe(true);
    });
  });

  it('migrateLeague preserves existing retiredNumbers without clearing them', () => {
    const league = {
      teams: [{ ...makeLegacyTeam(), retiredNumbers: [12, 32] }],
      historyLedger: [],
      recordBook: {},
    };
    const migrated = State.migrateLeague(league);
    expect(migrated.teams[0].retiredNumbers).toEqual([12, 32]);
  });

  it('migrateLeague preserves existing championshipYears without clearing them', () => {
    const league = {
      teams: [{ ...makeLegacyTeam(), championshipYears: [2024, 2026] }],
      historyLedger: [],
      recordBook: {},
    };
    const migrated = State.migrateLeague(league);
    expect(migrated.teams[0].championshipYears).toEqual([2024, 2026]);
  });

  it('does not crash when teams array is empty', () => {
    const league = { teams: [], historyLedger: [], recordBook: {} };
    expect(() => State.migrateLeague(league)).not.toThrow();
  });
});

// ── Championship year harvesting ──────────────────────────────────────────────

describe('appendChampionshipYear — season rollover semantics', () => {
  it('appends the current year once on first championship', () => {
    const team = makeTeam();
    const result = appendChampionshipYear(team, 2025);
    expect(result.championshipYears).toEqual([2025]);
  });

  it('does not duplicate year if called again for same year (idempotent re-run)', () => {
    const team = makeTeam({ championshipYears: [2025] });
    const result = appendChampionshipYear(team, 2025);
    expect(result.championshipYears).toEqual([2025]);
    expect(result).toBe(team); // same reference = no mutation needed
  });

  it('records multiple championships in ascending order', () => {
    let team = makeTeam();
    team = appendChampionshipYear(team, 2026);
    team = appendChampionshipYear(team, 2024);
    team = appendChampionshipYear(team, 2028);
    expect(team.championshipYears).toEqual([2024, 2026, 2028]);
  });

  it('does not affect other teams (isolated)', () => {
    const teamA = makeTeam({ id: 1 });
    const teamB = makeTeam({ id: 2 });
    const updatedA = appendChampionshipYear(teamA, 2025);
    expect(teamB.championshipYears).toHaveLength(0);
    expect(updatedA.championshipYears).toContain(2025);
  });
});

// ── RETIRE_JERSEY_NUMBER semantics ─────────────────────────────────────────────

describe('retireJerseyNumber — handler semantics', () => {
  it('adds number to correct team', () => {
    const team = makeTeam({ id: 1 });
    const player = makePlayer({ jerseyNumber: 12 });
    const updated = retireJerseyNumber(team, player);
    expect(updated.retiredNumbers).toContain(12);
  });

  it('prevents duplicate retirement', () => {
    const team = makeTeam({ retiredNumbers: [12] });
    const player = makePlayer({ jerseyNumber: 12 });
    const updated = retireJerseyNumber(team, player);
    expect(updated.retiredNumbers.filter((n) => n === 12)).toHaveLength(1);
  });

  it('does not crash with legacy player missing jerseyNumber', () => {
    const team = makeTeam();
    const player = makePlayer({ jerseyNumber: undefined });
    expect(() => retireJerseyNumber(team, player)).not.toThrow();
    expect(team.retiredNumbers).toHaveLength(0); // no mutation
  });
});

// ── Jersey assignment guard — drafted players ─────────────────────────────────

describe('jersey assignment guard — draft path', () => {
  it('returns preferred number when available', () => {
    const team = makeTeam();
    const assigned = findAvailableJerseyNumber(12, team.retiredNumbers, []);
    expect(assigned).toBe(12);
  });

  it('skips retired number and assigns next available', () => {
    const team = makeTeam({ retiredNumbers: [12] });
    const rosterNums = [13, 14];
    const assigned = findAvailableJerseyNumber(12, team.retiredNumbers, rosterNums);
    expect(assigned).toBe(1);
  });

  it('active roster players keep existing numbers (no retroactive change)', () => {
    // Guard only applies when assigning a new number — existing active players
    // are not passed through findAvailableJerseyNumber again.
    const team = makeTeam({ retiredNumbers: [12] });
    const existingActivePlayer = makePlayer({ jerseyNumber: 12 });
    // The guard would only run on draft/sign path, not on retirement of a number.
    // Verify that retireJerseyNumber doesn't touch the active roster.
    const updated = retireJerseyNumber(team, existingActivePlayer);
    expect(updated.retiredNumbers).toContain(12);
    // The existing active player's jerseyNumber is not changed by the engine
    expect(existingActivePlayer.jerseyNumber).toBe(12);
  });
});

// ── Jersey assignment guard — FA signing path ─────────────────────────────────

describe('jersey assignment guard — free agency path', () => {
  it('assigns a new number when FA existing number is retired', () => {
    const team = makeTeam({ retiredNumbers: [88] });
    const faPlayer = makePlayer({ jerseyNumber: 88, pos: 'WR' });
    const rosterNums = [80, 81];
    const preferred = Number(faPlayer.jerseyNumber);
    const assigned = findAvailableJerseyNumber(preferred, team.retiredNumbers, rosterNums);
    expect(assigned).not.toBe(88);
    expect(team.retiredNumbers).not.toContain(assigned);
  });

  it('keeps FA existing number when not retired', () => {
    const team = makeTeam({ retiredNumbers: [12] });
    const faPlayer = makePlayer({ jerseyNumber: 32 });
    const assigned = findAvailableJerseyNumber(32, team.retiredNumbers, []);
    expect(assigned).toBe(32);
  });
});

// ── buildRetiredNumberDisplay — UI integration ────────────────────────────────

describe('buildRetiredNumberDisplay — UI display integration', () => {
  it('links surname to ROH member when jerseyNumber matches', () => {
    const team = makeTeam({ retiredNumbers: [12] });
    const roh = [{ id: 'p1', name: 'Dan Legend', jerseyNumber: 12 }];
    const display = buildRetiredNumberDisplay(team, roh);
    expect(display[0].surname).toBe('Legend');
    expect(display[0].jerseyNumber).toBe(12);
  });

  it('returns null surname when no ROH member matches', () => {
    const team = makeTeam({ retiredNumbers: [99] });
    const roh = [{ id: 'p1', name: 'Dan Legend', jerseyNumber: 12 }];
    const display = buildRetiredNumberDisplay(team, roh);
    expect(display[0].jerseyNumber).toBe(99);
    expect(display[0].surname).toBeNull();
  });

  it('returns empty array when no numbers are retired', () => {
    const team = makeTeam();
    const display = buildRetiredNumberDisplay(team, []);
    expect(display).toHaveLength(0);
  });
});

// ── createDefaultTeamIdentity integration ─────────────────────────────────────

describe('createDefaultTeamIdentity — hydration compatibility', () => {
  it('fills missing fields on a legacy team object', () => {
    const legacy = makeLegacyTeam();
    const identity = createDefaultTeamIdentity();
    const hydrated = { ...legacy, ...identity };
    expect(Array.isArray(hydrated.retiredNumbers)).toBe(true);
    expect(Array.isArray(hydrated.championshipYears)).toBe(true);
    expect(hydrated.retiredNumbers).toHaveLength(0);
    expect(hydrated.championshipYears).toHaveLength(0);
  });
});
