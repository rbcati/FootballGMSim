/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  normalizeSlot,
  getActiveSaveSlot,
  setActiveSaveSlot,
  saveKeyFor,
  getSaveMetadata,
  listSaveSlots,
  SAVE_KEY_BASE,
  MAX_SAVE_SLOTS,
} from '../../src/state/saveSlotStorage.js';
import { setLegacyState } from '../../src/state/legacyStateBridge.js';

// These keys are the on-disk save compatibility contract. If one of these
// assertions fails, existing player saves would be orphaned.

beforeEach(() => {
  window.localStorage.clear();
  delete window.state;
});

afterEach(() => {
  window.localStorage.clear();
  delete window.state;
});

describe('saveSlotStorage — key contract', () => {
  it('keeps the historical save key names byte-identical', () => {
    expect(SAVE_KEY_BASE).toBe('nflGM4.league');
    expect(saveKeyFor(1)).toBe('nflGM4.league.slot1');
    expect(saveKeyFor(5)).toBe('nflGM4.league.slot5');
  });

  it('saveKeyFor normalizes out-of-range slots like the legacy code did', () => {
    expect(saveKeyFor(0)).toBe(`${SAVE_KEY_BASE}.slot1`);
    expect(saveKeyFor(99)).toBe(`${SAVE_KEY_BASE}.slot${MAX_SAVE_SLOTS}`);
    expect(saveKeyFor('not-a-slot')).toBe(`${SAVE_KEY_BASE}.slot1`);
  });
});

describe('saveSlotStorage — normalizeSlot', () => {
  it('preserves legacy normalization exactly', () => {
    expect(normalizeSlot(1)).toBe(1);
    expect(normalizeSlot('3')).toBe(3);
    expect(normalizeSlot(MAX_SAVE_SLOTS)).toBe(MAX_SAVE_SLOTS);
    // clamped / defaulted
    expect(normalizeSlot(0)).toBe(1);
    expect(normalizeSlot(-2)).toBe(1);
    expect(normalizeSlot(MAX_SAVE_SLOTS + 3)).toBe(MAX_SAVE_SLOTS);
    expect(normalizeSlot(undefined)).toBe(1);
    expect(normalizeSlot(null)).toBe(1);
    expect(normalizeSlot('junk')).toBe(1);
    // parseInt semantics, not Number(): '2abc' parses to 2
    expect(normalizeSlot('2abc')).toBe(2);
  });
});

describe('saveSlotStorage — active slot persistence', () => {
  it('defaults to slot 1 when nothing is stored', () => {
    expect(getActiveSaveSlot()).toBe(1);
  });

  it('round-trips through the legacy localStorage key', () => {
    expect(setActiveSaveSlot(3)).toBe(3);
    expect(window.localStorage.getItem('nflGM4.activeSlot')).toBe('3');
    expect(getActiveSaveSlot()).toBe(3);
  });

  it('normalizes before persisting', () => {
    expect(setActiveSaveSlot(42)).toBe(MAX_SAVE_SLOTS);
    expect(getActiveSaveSlot()).toBe(MAX_SAVE_SLOTS);
  });

  it('mirrors the slot onto legacy state only when it exists', () => {
    // No legacy state installed: must not create one
    setActiveSaveSlot(2);
    expect(window.state).toBeUndefined();

    // Legacy state installed: saveSlot is patched in place
    const legacy = setLegacyState({ saveSlot: 1 });
    setActiveSaveSlot(4);
    expect(window.state).toBe(legacy);
    expect(window.state.saveSlot).toBe(4);
  });
});

describe('saveSlotStorage — save metadata', () => {
  it('returns null for empty or corrupt slots', () => {
    expect(getSaveMetadata(1)).toBeNull();
    window.localStorage.setItem(saveKeyFor(2), '{not json');
    expect(getSaveMetadata(2)).toBeNull();
  });

  it('summarizes a stored save', () => {
    window.localStorage.setItem(saveKeyFor(2), JSON.stringify({
      lastSaved: '2026-01-01T00:00:00.000Z',
      season: 3,
      namesMode: 'real',
      userTeamId: 1,
      league: { teams: [{ name: 'A' }, { name: 'B' }] },
    }));

    expect(getSaveMetadata(2)).toEqual({
      slot: 2,
      lastSaved: '2026-01-01T00:00:00.000Z',
      team: 'B',
      season: 3,
      mode: 'real',
    });
  });

  it('lists all slots with nulls for empty ones', () => {
    window.localStorage.setItem(saveKeyFor(3), JSON.stringify({ season: 7 }));
    const slots = listSaveSlots();
    expect(slots).toHaveLength(MAX_SAVE_SLOTS);
    expect(slots[0]).toBeNull();
    expect(slots[2]).toMatchObject({ slot: 3, season: 7 });
  });
});
