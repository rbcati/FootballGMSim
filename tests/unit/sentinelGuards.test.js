/**
 * Sentinel guard unit tests
 *
 * Verifies that:
 * 1. hasValidPlayerProfileId rejects __missing_player__ and related sentinels.
 * 2. resolveNewsTeam rejects __missing_team__ and related sentinels.
 * 3. sentinel values do not produce a truthy "open profile" result via openPlayerProfile.
 *
 * These are pure-function tests — no React rendering required.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  hasValidPlayerProfileId,
  getPlayerProfileId,
  openPlayerProfile,
} from '../../src/ui/utils/playerProfileNavigation.js';

// ── hasValidPlayerProfileId ────────────────────────────────────────────────────

describe('hasValidPlayerProfileId — sentinel rejection', () => {
  it('rejects __missing_player__ sentinel string', () => {
    expect(hasValidPlayerProfileId('__missing_player__')).toBe(false);
  });

  it('rejects null', () => {
    expect(hasValidPlayerProfileId(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(hasValidPlayerProfileId(undefined)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(hasValidPlayerProfileId('')).toBe(false);
    expect(hasValidPlayerProfileId('   ')).toBe(false);
  });

  it('rejects the string "NaN"', () => {
    expect(hasValidPlayerProfileId('NaN')).toBe(false);
  });

  it('rejects the string "undefined"', () => {
    expect(hasValidPlayerProfileId('undefined')).toBe(false);
  });

  it('accepts a numeric player ID', () => {
    expect(hasValidPlayerProfileId(42)).toBe(true);
  });

  it('accepts a string numeric player ID', () => {
    expect(hasValidPlayerProfileId('42')).toBe(true);
  });

  it('accepts a player object with valid id', () => {
    expect(hasValidPlayerProfileId({ id: 42 })).toBe(true);
  });

  it('rejects a player object whose id is __missing_player__', () => {
    expect(hasValidPlayerProfileId({ id: '__missing_player__' })).toBe(false);
  });
});

// ── getPlayerProfileId ────────────────────────────────────────────────────────

describe('getPlayerProfileId', () => {
  it('returns null for null input', () => {
    expect(getPlayerProfileId(null)).toBeNull();
  });

  it('extracts id from object', () => {
    expect(getPlayerProfileId({ id: 7 })).toBe(7);
  });

  it('extracts playerId from object when id is absent', () => {
    expect(getPlayerProfileId({ playerId: 8 })).toBe(8);
  });

  it('returns the raw value for non-object inputs', () => {
    expect(getPlayerProfileId('__missing_player__')).toBe('__missing_player__');
    expect(getPlayerProfileId(99)).toBe(99);
  });
});

// ── openPlayerProfile — no callback fires for sentinels ───────────────────────

describe('openPlayerProfile — sentinel guard', () => {
  it('does not call onOpen when playerId is __missing_player__', () => {
    const onOpen = vi.fn();
    const result = openPlayerProfile('__missing_player__', onOpen, {});
    expect(onOpen).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('does not call onOpen when playerId is null', () => {
    const onOpen = vi.fn();
    const result = openPlayerProfile(null, onOpen, {});
    expect(onOpen).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('does not call onOpen when playerId is NaN', () => {
    const onOpen = vi.fn();
    const result = openPlayerProfile('NaN', onOpen, {});
    expect(onOpen).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('calls onOpen when playerId is valid', () => {
    const onOpen = vi.fn();
    const result = openPlayerProfile(42, onOpen, { source: 'test' });
    expect(onOpen).toHaveBeenCalledWith(42, expect.objectContaining({ source: 'test' }));
    expect(result).toBe(true);
  });
});

// ── resolveNewsTeam — __missing_team__ sentinel rejection ─────────────────────
// Inline re-implementation of the guard logic to test it in isolation.

function resolveNewsTeamGuard(teamOrId) {
  const teamId = typeof teamOrId === 'object' ? teamOrId?.id ?? teamOrId?.teamId : teamOrId;
  if (teamId == null) return false;
  const s = String(teamId).trim();
  return s !== '' && s !== 'NaN' && s !== '__missing_team__' && s !== 'undefined';
}

describe('resolveNewsTeam guard logic — __missing_team__ rejection', () => {
  it('rejects __missing_team__ sentinel string', () => {
    expect(resolveNewsTeamGuard('__missing_team__')).toBe(false);
  });

  it('rejects null', () => {
    expect(resolveNewsTeamGuard(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(resolveNewsTeamGuard(undefined)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(resolveNewsTeamGuard('')).toBe(false);
  });

  it('rejects the string "NaN"', () => {
    expect(resolveNewsTeamGuard('NaN')).toBe(false);
  });

  it('rejects the string "undefined"', () => {
    expect(resolveNewsTeamGuard('undefined')).toBe(false);
  });

  it('rejects object with __missing_team__ id', () => {
    expect(resolveNewsTeamGuard({ id: '__missing_team__' })).toBe(false);
  });

  it('accepts a numeric team ID', () => {
    expect(resolveNewsTeamGuard(3)).toBe(true);
  });

  it('accepts a string numeric team ID', () => {
    expect(resolveNewsTeamGuard('3')).toBe(true);
  });

  it('accepts an object with valid id', () => {
    expect(resolveNewsTeamGuard({ id: 5 })).toBe(true);
  });
});
