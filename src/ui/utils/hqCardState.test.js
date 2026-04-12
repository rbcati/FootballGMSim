import { describe, it, expect, vi } from 'vitest';
import { HQ_CARD_STATE_KEY, persistHqCollapsedState, readHqCollapsedState } from './hqCardState.js';

describe('hq card collapsed state', () => {
  it('returns defaults when state is missing', () => {
    const storage = { getItem: vi.fn(() => null) };
    expect(readHqCollapsedState(storage)).toEqual({ leagueNews: true, statLeaders: true });
  });

  it('persists collapsed state to localStorage', () => {
    const setItem = vi.fn();
    const storage = { setItem };
    const next = { leagueNews: false, statLeaders: true };
    persistHqCollapsedState(next, storage);
    expect(setItem).toHaveBeenCalledWith(HQ_CARD_STATE_KEY, JSON.stringify(next));
  });
});
