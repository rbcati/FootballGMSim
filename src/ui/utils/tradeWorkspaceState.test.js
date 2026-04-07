import { describe, expect, it } from 'vitest';
import { mergeTradeWorkspaceState, toBuilderSeed } from './tradeWorkspaceState.js';

describe('trade workspace shared state', () => {
  it('preserves finder-selected partner and outgoing assets for builder seed', () => {
    const state = mergeTradeWorkspaceState({}, { partnerTeamId: 3, outgoingPlayerIds: [11, 14], outgoingPickIds: ['2028-2-foo'] });
    expect(toBuilderSeed(state)).toEqual({ partnerTeamId: 3, outgoingPlayerIds: [11, 14], outgoingPickIds: ['2028-2-foo'] });
  });

  it('keeps previous values when patch omits fields', () => {
    const prev = { partnerTeamId: 9, outgoingPlayerIds: [1], outgoingPickIds: [2], incomingPlayerIds: [8], helperReason: 'x' };
    const next = mergeTradeWorkspaceState(prev, { helperReason: 'updated' });
    expect(next.partnerTeamId).toBe(9);
    expect(next.outgoingPlayerIds).toEqual([1]);
    expect(next.helperReason).toBe('updated');
  });
});
