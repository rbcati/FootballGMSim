/**
 * Reference-integrity ID semantics — unit coverage for the shared helper that
 * underpins the post-rollover schedule/champion/save-reload contracts.
 */
import { describe, it, expect } from 'vitest';
import {
  canonicalIdKey,
  sameEntityId,
  isValidIdRef,
  stableIdCompare,
  sortIdsStable,
  resolveTeamRefId,
} from '../../src/core/referenceIntegrity.js';

describe('canonicalIdKey', () => {
  it('treats team id 0 as a valid reference (never missing)', () => {
    expect(canonicalIdKey(0)).toBe('0');
    expect(canonicalIdKey('0')).toBe('0');
    expect(isValidIdRef(0)).toBe(true);
  });

  it('maps numeric and numeric-string aliases to the same key', () => {
    expect(canonicalIdKey(5)).toBe('5');
    expect(canonicalIdKey('5')).toBe('5');
    expect(canonicalIdKey(31)).toBe('31');
  });

  it('keeps opaque rookie string ids intact', () => {
    expect(canonicalIdKey('hbot8q4lum1u')).toBe('hbot8q4lum1u');
    expect(canonicalIdKey('rookie-s2-10')).toBe('rookie-s2-10');
  });

  it('rejects null/undefined/empty/NaN/objects as invalid references', () => {
    expect(canonicalIdKey(null)).toBeNull();
    expect(canonicalIdKey(undefined)).toBeNull();
    expect(canonicalIdKey('')).toBeNull();
    expect(canonicalIdKey('   ')).toBeNull();
    expect(canonicalIdKey(NaN)).toBeNull();
    expect(canonicalIdKey({ id: 3 })).toBeNull();
    expect(isValidIdRef(null)).toBe(false);
    expect(isValidIdRef(undefined)).toBe(false);
  });
});

describe('sameEntityId', () => {
  it('numeric 5 and string "5" are the same entity; 0 and "0" are the same', () => {
    expect(sameEntityId(5, '5')).toBe(true);
    expect(sameEntityId(0, '0')).toBe(true);
    expect(sameEntityId(0, 0)).toBe(true);
  });

  it('distinct legitimate ids are never merged', () => {
    expect(sameEntityId(5, 6)).toBe(false);
    expect(sameEntityId('rookie-1', 'rookie-2')).toBe(false);
    expect(sameEntityId(0, null)).toBe(false);
    expect(sameEntityId('007', 7)).toBe(false); // padded string is a different id
  });
});

describe('stableIdCompare', () => {
  it('never returns NaN for mixed numeric/string ids', () => {
    const ids = [1, 2, 'rookie-s2-1', 'rookie-s2-10', '1003', 0];
    for (const a of ids) for (const b of ids) {
      expect(Number.isNaN(stableIdCompare(a, b))).toBe(false);
    }
  });

  it('is a deterministic total order (numeric asc, then opaque lexicographic)', () => {
    const ids = ['rookie-s2-10', 2, '1003', 'hbot8q4lum1u', 1, 0, 'rookie-s2-1'];
    const sorted = sortIdsStable(ids);
    expect(sorted).toEqual([0, 1, 2, '1003', 'hbot8q4lum1u', 'rookie-s2-1', 'rookie-s2-10']);
  });

  it('produces identical ordering regardless of input order (reflexive/stable)', () => {
    const a = [ '78bd47pujuge', 3, 'brkx8bumltiy', 1, 0, 'hbot8q4lum1u', 2 ];
    const b = [ 2, 'hbot8q4lum1u', 0, 1, 'brkx8bumltiy', 3, '78bd47pujuge' ];
    expect(sortIdsStable(a)).toEqual(sortIdsStable(b));
  });

  it('numeric-string alias sorts by numeric value, not lexicographically', () => {
    // "10" must come after 9, not after "1" (which lexicographic sort would do).
    expect(sortIdsStable([ '10', '9', '1', '2' ])).toEqual([ '1', '2', '9', '10' ]);
  });

  it('reports equality for the same entity expressed as number vs string', () => {
    expect(stableIdCompare(7, '7')).toBe(0);
    expect(stableIdCompare(0, '0')).toBe(0);
  });
});

describe('resolveTeamRefId', () => {
  it('resolves a scalar id (including 0)', () => {
    expect(resolveTeamRefId(0)).toBe('0');
    expect(resolveTeamRefId(6)).toBe('6');
    expect(resolveTeamRefId('6')).toBe('6');
  });

  it('resolves a champion display snapshot object to its id (never [object Object])', () => {
    expect(resolveTeamRefId({ id: 6, name: 'Cleveland Browns', abbr: 'CLE', wins: 14 })).toBe('6');
    expect(resolveTeamRefId({ id: 0, abbr: 'ARI' })).toBe('0');
  });

  it('honors explicit *TeamId fields over a generic id', () => {
    expect(resolveTeamRefId({ championTeamId: 12, id: 99 })).toBe('12');
    expect(resolveTeamRefId({ teamId: 3 })).toBe('3');
    expect(resolveTeamRefId({ tid: 8 })).toBe('8');
  });

  it('returns null for an unresolved/malformed champion (honest unavailable)', () => {
    expect(resolveTeamRefId(null)).toBeNull();
    expect(resolveTeamRefId({})).toBeNull();
    expect(resolveTeamRefId({ name: 'Unknown' })).toBeNull();
  });
});
