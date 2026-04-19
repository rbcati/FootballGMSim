import { describe, it, expect } from 'vitest';
import { isValidSaveId, normalizeSaveEntry, sanitizeSaveList } from '../saveIntegrity.js';

describe('saveIntegrity', () => {
  it('validates safe save ids', () => {
    expect(isValidSaveId('save_slot_1')).toBe(true);
    expect(isValidSaveId('abc-123_DEF')).toBe(true);
    expect(isValidSaveId('')).toBe(false);
    expect(isValidSaveId('bad id')).toBe(false);
    expect(isValidSaveId('../escape')).toBe(false);
  });

  it('normalizes valid save entries', () => {
    const normalized = normalizeSaveEntry({
      id: 'save_slot_1',
      name: '  My Save  ',
      year: '2031',
      teamAbbr: '',
      lastPlayed: '12345',
    });
    expect(normalized).toEqual({
      id: 'save_slot_1',
      name: 'My Save',
      year: 2031,
      teamId: null,
      teamAbbr: '???',
      lastPlayed: 12345,
    });
  });

  it('sanitizes and deduplicates save list', () => {
    const { saves, dropped } = sanitizeSaveList([
      { id: 'save_slot_1', name: 'A', lastPlayed: 1 },
      { id: 'save_slot_1', name: 'B', lastPlayed: 2 },
      { id: 'bad id', name: 'Nope' },
      null,
      { id: 'save_slot_2', name: 'C', lastPlayed: 0 },
    ]);

    expect(saves.map((s) => s.id)).toEqual(['save_slot_1', 'save_slot_2']);
    expect(saves[0].name).toBe('B');
    expect(dropped.length).toBe(2);
  });
});
