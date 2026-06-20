/**
 * teamIdentityEngine.unit.test.js
 * Pure-function unit tests for the Jersey Retirement & Championship Wall engine.
 */

import { describe, it, expect } from 'vitest';
import {
  createDefaultTeamIdentity,
  retireJerseyNumber,
  appendChampionshipYear,
  isRetiredNumber,
  findAvailableJerseyNumber,
  buildRetiredNumberDisplay,
  derivePreferredJerseyNumber,
} from './teamIdentityEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTeam(overrides = {}) {
  return { id: 1, abbr: 'PIT', name: 'Pittsburgh', retiredNumbers: [], championshipYears: [], ...overrides };
}

function makePlayer(overrides = {}) {
  return { id: 'p1', name: 'Test Player', pos: 'QB', jerseyNumber: 12, ...overrides };
}

// ── createDefaultTeamIdentity ─────────────────────────────────────────────────

describe('createDefaultTeamIdentity', () => {
  it('returns empty retiredNumbers array', () => {
    const identity = createDefaultTeamIdentity();
    expect(Array.isArray(identity.retiredNumbers)).toBe(true);
    expect(identity.retiredNumbers).toHaveLength(0);
  });

  it('returns empty championshipYears array', () => {
    const identity = createDefaultTeamIdentity();
    expect(Array.isArray(identity.championshipYears)).toBe(true);
    expect(identity.championshipYears).toHaveLength(0);
  });

  it('returns a fresh object on each call', () => {
    const a = createDefaultTeamIdentity();
    const b = createDefaultTeamIdentity();
    expect(a).not.toBe(b);
    a.retiredNumbers.push(1);
    expect(b.retiredNumbers).toHaveLength(0);
  });
});

// ── retireJerseyNumber ────────────────────────────────────────────────────────

describe('retireJerseyNumber', () => {
  it('appends a valid jersey number to retiredNumbers', () => {
    const team = makeTeam();
    const player = makePlayer({ jerseyNumber: 12 });
    const result = retireJerseyNumber(team, player);
    expect(result.retiredNumbers).toContain(12);
  });

  it('does not mutate the original team object', () => {
    const team = makeTeam();
    const player = makePlayer({ jerseyNumber: 12 });
    retireJerseyNumber(team, player);
    expect(team.retiredNumbers).toHaveLength(0);
  });

  it('ignores duplicate numbers — no duplication', () => {
    const team = makeTeam({ retiredNumbers: [12] });
    const player = makePlayer({ jerseyNumber: 12 });
    const result = retireJerseyNumber(team, player);
    expect(result.retiredNumbers.filter((n) => n === 12)).toHaveLength(1);
  });

  it('returns same reference when duplicate found', () => {
    const team = makeTeam({ retiredNumbers: [12] });
    const player = makePlayer({ jerseyNumber: 12 });
    const result = retireJerseyNumber(team, player);
    expect(result).toBe(team);
  });

  it('rejects jersey number 0', () => {
    const team = makeTeam();
    const result = retireJerseyNumber(team, makePlayer({ jerseyNumber: 0 }));
    expect(result.retiredNumbers).toHaveLength(0);
  });

  it('rejects jersey number 100', () => {
    const team = makeTeam();
    const result = retireJerseyNumber(team, makePlayer({ jerseyNumber: 100 }));
    expect(result.retiredNumbers).toHaveLength(0);
  });

  it('rejects negative numbers', () => {
    const team = makeTeam();
    const result = retireJerseyNumber(team, makePlayer({ jerseyNumber: -5 }));
    expect(result.retiredNumbers).toHaveLength(0);
  });

  it('rejects fractional numbers', () => {
    const team = makeTeam();
    const result = retireJerseyNumber(team, makePlayer({ jerseyNumber: 12.5 }));
    expect(result.retiredNumbers).toHaveLength(0);
  });

  it('rejects null jerseyNumber', () => {
    const team = makeTeam();
    const result = retireJerseyNumber(team, makePlayer({ jerseyNumber: null }));
    expect(result.retiredNumbers).toHaveLength(0);
  });

  it('rejects undefined jerseyNumber', () => {
    const team = makeTeam();
    const result = retireJerseyNumber(team, makePlayer({ jerseyNumber: undefined }));
    expect(result.retiredNumbers).toHaveLength(0);
  });

  it('sorts retiredNumbers ascending', () => {
    const team = makeTeam({ retiredNumbers: [80, 12] });
    const result = retireJerseyNumber(team, makePlayer({ jerseyNumber: 32 }));
    expect(result.retiredNumbers).toEqual([12, 32, 80]);
  });

  it('accepts boundary value 1', () => {
    const team = makeTeam();
    const result = retireJerseyNumber(team, makePlayer({ jerseyNumber: 1 }));
    expect(result.retiredNumbers).toContain(1);
  });

  it('accepts boundary value 99', () => {
    const team = makeTeam();
    const result = retireJerseyNumber(team, makePlayer({ jerseyNumber: 99 }));
    expect(result.retiredNumbers).toContain(99);
  });
});

// ── appendChampionshipYear ────────────────────────────────────────────────────

describe('appendChampionshipYear', () => {
  it('appends a valid year to championshipYears', () => {
    const team = makeTeam();
    const result = appendChampionshipYear(team, 2026);
    expect(result.championshipYears).toContain(2026);
  });

  it('does not mutate the original team object', () => {
    const team = makeTeam();
    appendChampionshipYear(team, 2026);
    expect(team.championshipYears).toHaveLength(0);
  });

  it('ignores duplicate years', () => {
    const team = makeTeam({ championshipYears: [2026] });
    const result = appendChampionshipYear(team, 2026);
    expect(result.championshipYears.filter((y) => y === 2026)).toHaveLength(1);
  });

  it('returns same reference when duplicate year found', () => {
    const team = makeTeam({ championshipYears: [2026] });
    const result = appendChampionshipYear(team, 2026);
    expect(result).toBe(team);
  });

  it('sorts years ascending (oldest first)', () => {
    const team = makeTeam({ championshipYears: [2030, 2024] });
    const result = appendChampionshipYear(team, 2027);
    expect(result.championshipYears).toEqual([2024, 2027, 2030]);
  });

  it('handles team with no existing championshipYears gracefully', () => {
    const team = { id: 1, name: 'Test' }; // no championshipYears key
    const result = appendChampionshipYear(team, 2025);
    expect(result.championshipYears).toContain(2025);
  });
});

// ── isRetiredNumber ───────────────────────────────────────────────────────────

describe('isRetiredNumber', () => {
  it('returns true when number is in retiredNumbers', () => {
    const team = makeTeam({ retiredNumbers: [12, 32] });
    expect(isRetiredNumber(team, 12)).toBe(true);
  });

  it('returns false when number is not in retiredNumbers', () => {
    const team = makeTeam({ retiredNumbers: [12, 32] });
    expect(isRetiredNumber(team, 88)).toBe(false);
  });

  it('returns false when retiredNumbers is empty', () => {
    const team = makeTeam();
    expect(isRetiredNumber(team, 12)).toBe(false);
  });

  it('returns false for non-finite input', () => {
    const team = makeTeam({ retiredNumbers: [12] });
    expect(isRetiredNumber(team, NaN)).toBe(false);
  });

  it('handles team without retiredNumbers property', () => {
    expect(isRetiredNumber({}, 12)).toBe(false);
  });
});

// ── findAvailableJerseyNumber ─────────────────────────────────────────────────

describe('findAvailableJerseyNumber', () => {
  it('returns preferredNumber when valid and not retired or used', () => {
    const result = findAvailableJerseyNumber(12, [], []);
    expect(result).toBe(12);
  });

  it('skips retired numbers and scans from 1 for first available', () => {
    // 12 is retired → falls back to scan from 1 → 1 is available
    const result = findAvailableJerseyNumber(12, [12], []);
    expect(result).toBe(1);
  });

  it('skips used numbers and scans from 1 for first available', () => {
    // 12 is used → falls back to scan from 1 → 1 is available
    const result = findAvailableJerseyNumber(12, [], [12]);
    expect(result).toBe(1);
  });

  it('skips both retired and used numbers scanning from 1', () => {
    // 12 retired, 1 used → return 2 (first scan from 1 that avoids both)
    const result = findAvailableJerseyNumber(12, [12], [1]);
    expect(result).toBe(2);
  });

  it('scans from 1 when preferred is invalid (0)', () => {
    const result = findAvailableJerseyNumber(0, [], []);
    expect(result).toBe(1);
  });

  it('returns null only when all 99 numbers are taken', () => {
    const all = Array.from({ length: 99 }, (_, i) => i + 1);
    const result = findAvailableJerseyNumber(1, all, []);
    expect(result).toBeNull();
  });

  it('handles empty arrays as defaults', () => {
    const result = findAvailableJerseyNumber(55);
    expect(result).toBe(55);
  });

  it('result is always deterministic — same input same output', () => {
    const r1 = findAvailableJerseyNumber(12, [12, 13, 14], [15]);
    const r2 = findAvailableJerseyNumber(12, [12, 13, 14], [15]);
    expect(r1).toBe(r2);
    expect(r1).toBe(1);
  });

  it('preferred number 99 is accepted when available', () => {
    expect(findAvailableJerseyNumber(99, [], [])).toBe(99);
  });

  it('preferred number 100 is invalid, falls back to scan from 1', () => {
    const result = findAvailableJerseyNumber(100, [], []);
    expect(result).toBe(1);
  });
});

// ── buildRetiredNumberDisplay ─────────────────────────────────────────────────

describe('buildRetiredNumberDisplay', () => {
  it('returns empty array when retiredNumbers is empty', () => {
    const team = makeTeam();
    const result = buildRetiredNumberDisplay(team, []);
    expect(result).toHaveLength(0);
  });

  it('links surname when ROH member jerseyNumber matches', () => {
    const team = makeTeam({ retiredNumbers: [12] });
    const roh = [{ id: 'p1', name: 'Dan Legend', jerseyNumber: 12 }];
    const result = buildRetiredNumberDisplay(team, roh);
    expect(result).toHaveLength(1);
    expect(result[0].jerseyNumber).toBe(12);
    expect(result[0].surname).toBe('Legend');
  });

  it('returns null surname when no ROH match found', () => {
    const team = makeTeam({ retiredNumbers: [88] });
    const roh = [{ id: 'p1', name: 'Dan Legend', jerseyNumber: 12 }];
    const result = buildRetiredNumberDisplay(team, roh);
    expect(result[0].jerseyNumber).toBe(88);
    expect(result[0].surname).toBeNull();
  });

  it('handles team without retiredNumbers property', () => {
    const result = buildRetiredNumberDisplay({}, []);
    expect(result).toHaveLength(0);
  });

  it('handles empty ringOfHonor array', () => {
    const team = makeTeam({ retiredNumbers: [12] });
    const result = buildRetiredNumberDisplay(team, []);
    expect(result[0].surname).toBeNull();
  });

  it('handles missing name on ROH member gracefully', () => {
    const team = makeTeam({ retiredNumbers: [12] });
    const roh = [{ id: 'p1', jerseyNumber: 12 }]; // no name
    const result = buildRetiredNumberDisplay(team, roh);
    expect(result[0].surname).toBeNull();
  });

  it('extracts last name correctly from multi-part name', () => {
    const team = makeTeam({ retiredNumbers: [32] });
    const roh = [{ id: 'p2', name: 'John Michael Smith', jerseyNumber: 32 }];
    const [entry] = buildRetiredNumberDisplay(team, roh);
    expect(entry.surname).toBe('Smith');
  });

  it('returns an entry for every retired number', () => {
    const team = makeTeam({ retiredNumbers: [12, 32, 80] });
    const result = buildRetiredNumberDisplay(team, []);
    expect(result).toHaveLength(3);
  });
});

// ── No Math.random guard ──────────────────────────────────────────────────────

describe('teamIdentityEngine — no Math.random usage', () => {
  it('module exports are deterministic (calling twice gives same result)', () => {
    const team = makeTeam();
    const r1 = retireJerseyNumber(team, makePlayer({ jerseyNumber: 12 }));
    const r2 = retireJerseyNumber(team, makePlayer({ jerseyNumber: 12 }));
    expect(r1.retiredNumbers).toEqual(r2.retiredNumbers);

    const y1 = appendChampionshipYear(team, 2026);
    const y2 = appendChampionshipYear(team, 2026);
    expect(y1.championshipYears).toEqual(y2.championshipYears);

    const n1 = findAvailableJerseyNumber(12, [12], [13]);
    const n2 = findAvailableJerseyNumber(12, [12], [13]);
    expect(n1).toBe(n2);
  });
});

// ── derivePreferredJerseyNumber ───────────────────────────────────────────────

describe('derivePreferredJerseyNumber', () => {
  it('returns a number in 1–99 range for known positions', () => {
    ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'].forEach((pos) => {
      const n = derivePreferredJerseyNumber(pos, 'player_1');
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(99);
    });
  });

  it('returns a number in 1–99 for unknown position', () => {
    const n = derivePreferredJerseyNumber('UNKNOWN', 'player_1');
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(99);
  });

  it('is deterministic for the same inputs', () => {
    expect(derivePreferredJerseyNumber('QB', 'player_abc')).toBe(
      derivePreferredJerseyNumber('QB', 'player_abc')
    );
  });
});
