import { describe, it, expect } from 'vitest';
import { resolveCompletedGameId } from './gameResultIdentity.js';

describe('resolveCompletedGameId', () => {
  it('prefers canonical id from result payload', () => {
    expect(resolveCompletedGameId({ gameId: '2028_w4_1_2' })).toBe('2028_w4_1_2');
  });

  it('uses canonical id from generic id field when available', () => {
    expect(resolveCompletedGameId({ id: '2028_w4_1_2' })).toBe('2028_w4_1_2');
  });

  it('builds canonical id when only week/team context is present', () => {
    expect(resolveCompletedGameId({ homeId: 3, awayId: 4 }, { seasonId: '2028', week: 7 })).toBe('2028_w7_3_4');
  });

  it('returns null when canonical fields are missing', () => {
    expect(resolveCompletedGameId({ homeId: 1 }, { seasonId: '2028' })).toBe(null);
  });
});
