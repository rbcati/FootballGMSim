import { describe, expect, it } from 'vitest';
import { validateCustomRoster, validateDraftClass, validateLeagueFile } from '../modding/schemaValidation.js';

describe('modding schema validation', () => {
  it('accepts a valid custom roster payload', () => {
    const result = validateCustomRoster({
      players: [{ name: 'Test QB', age: 24, pos: 'QB', ovr: 80, potential: 86, teamId: 0 }],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects invalid roster entries', () => {
    const result = validateCustomRoster({ players: [{ name: '', pos: '??' }] });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('accepts draft class schema', () => {
    const result = validateDraftClass({ prospects: [{ name: 'Rookie', age: 21, pos: 'WR', ovr: 72, potential: 89 }] });
    expect(result.ok).toBe(true);
  });

  it('validates full league file shape', () => {
    const result = validateLeagueFile({
      meta: { name: 'League' },
      snapshot: { meta: {}, teams: [], players: [] },
    });
    expect(result.ok).toBe(true);
  });
});
