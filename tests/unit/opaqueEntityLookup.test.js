import { describe, it, expect } from 'vitest';
import { findEntityById } from '../../src/core/referenceIntegrity.js';

describe('read-only canonical entity lookup', () => {
  const players = [{ id: 0 }, { id: 7 }, { id: '007' }, { id: 'alpha' }, { id: 'beta' }];
  for (const source of [players, new Map(players.map(p => [p.id, p])), new Map(players.map(p => [String(p.id), p]))]) {
    it(`resolves numeric aliases and distinct opaque IDs from ${source instanceof Map ? 'maps' : 'arrays'}`, () => {
      expect(findEntityById(source, '0')).toBe(players[0]);
      expect(findEntityById(source, '7')).toBe(players[1]);
      expect(findEntityById(source, '007')).toBe(players[2]);
      expect(findEntityById(source, 'alpha')).toBe(players[3]);
      expect(findEntityById(source, 'beta')).toBe(players[4]);
      expect(findEntityById(source, 'unknown')).toBeNull();
      for (const id of [null, undefined, '', ' ', true, {}, [], NaN, Infinity]) expect(findEntityById(source, id)).toBeNull();
      expect(players.map(p => p.id)).toEqual([0, 7, '007', 'alpha', 'beta']);
    });
  }
  it('never resolves invalid references through collapsed map keys', () => {
    expect(findEntityById(new Map([[NaN, players[4]], [null, players[3]]]), NaN)).toBeNull();
    expect(findEntityById(new Map([[NaN, players[4]], [null, players[3]]]), null)).toBeNull();
  });
});
