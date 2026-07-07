import { describe, expect, it } from 'vitest';
import {
  HIDDEN_DEV_TRAIT_REVEAL_SEASONS,
  getProSeasonsCompleted,
  shouldRevealHiddenDevTrait,
  getHiddenDevTraitLabel,
} from '../draftVariance.js';

const history = (n) =>
  Array.from({ length: n }, (_, i) => ({ season: 2030 + i, ovr: 70 + i, age: 22 + i }));

// ── getProSeasonsCompleted ────────────────────────────────────────────────────

describe('getProSeasonsCompleted', () => {
  it('counts ovrHistory entries (one appended per completed pro season)', () => {
    expect(getProSeasonsCompleted({ ovrHistory: [] })).toBe(0);
    expect(getProSeasonsCompleted({ ovrHistory: history(1) })).toBe(1);
    expect(getProSeasonsCompleted({ ovrHistory: history(3) })).toBe(3);
  });

  it('ovrHistory wins over the draftYear path when both exist', () => {
    const player = { ovrHistory: history(1), draftYear: 2020 };
    expect(getProSeasonsCompleted(player, { currentSeason: 2030 })).toBe(1);
  });

  it('falls back to currentSeason - draftYear when ovrHistory is absent', () => {
    expect(getProSeasonsCompleted({ draftYear: 2028 }, { currentSeason: 2031 })).toBe(3);
    expect(getProSeasonsCompleted({ draftYear: 2028 }, { year: 2029 })).toBe(1);
    expect(getProSeasonsCompleted({ draftYear: 2028 }, { season: 2028 })).toBe(0);
  });

  it('never returns a negative count from a bad draftYear', () => {
    expect(getProSeasonsCompleted({ draftYear: 2035 }, { currentSeason: 2030 })).toBe(0);
  });

  it('returns null when nothing is derivable', () => {
    expect(getProSeasonsCompleted({}, {})).toBeNull();
    expect(getProSeasonsCompleted({ draftYear: 2028 }, {})).toBeNull();
    expect(getProSeasonsCompleted({ draftYear: 2028 }, { currentSeason: 's2031' })).toBeNull();
    expect(getProSeasonsCompleted({}, { currentSeason: 2031 })).toBeNull();
    expect(getProSeasonsCompleted(null, null)).toBeNull();
  });
});

// ── shouldRevealHiddenDevTrait ────────────────────────────────────────────────

describe('shouldRevealHiddenDevTrait', () => {
  it('is false without a hiddenDevTrait, regardless of experience', () => {
    expect(shouldRevealHiddenDevTrait({ ovrHistory: history(5), age: 30 })).toBe(false);
    expect(shouldRevealHiddenDevTrait({}, {})).toBe(false);
    expect(shouldRevealHiddenDevTrait(null)).toBe(false);
  });

  it('is false for draft-eligible prospects even with a trait', () => {
    const prospect = { hiddenDevTrait: 'superstar', status: 'draft_eligible', age: 30, ovrHistory: history(5) };
    expect(shouldRevealHiddenDevTrait(prospect)).toBe(false);
  });

  it('reveals at the seasons threshold via ovrHistory', () => {
    const base = { hiddenDevTrait: 'normal', age: 22 };
    expect(shouldRevealHiddenDevTrait({ ...base, ovrHistory: history(0) })).toBe(false);
    expect(shouldRevealHiddenDevTrait({ ...base, ovrHistory: history(1) })).toBe(false);
    expect(shouldRevealHiddenDevTrait({ ...base, ovrHistory: history(HIDDEN_DEV_TRAIT_REVEAL_SEASONS) })).toBe(true);
    expect(shouldRevealHiddenDevTrait({ ...base, ovrHistory: history(6) })).toBe(true);
  });

  it('an ovrHistory below threshold blocks reveal even for an old player', () => {
    // The seasons signal is authoritative; the age proxy only applies when
    // no seasons signal exists at all.
    expect(shouldRevealHiddenDevTrait({ hiddenDevTrait: 'bust', age: 29, ovrHistory: history(1) })).toBe(false);
  });

  it('reveals via draftYear + season context when ovrHistory is absent', () => {
    const player = { hiddenDevTrait: 'late_bloomer', draftYear: 2028, age: 22 };
    expect(shouldRevealHiddenDevTrait(player, { currentSeason: 2029 })).toBe(false);
    expect(shouldRevealHiddenDevTrait(player, { currentSeason: 2030 })).toBe(true);
  });

  it('falls back to age >= 24 when no seasons signal exists', () => {
    expect(shouldRevealHiddenDevTrait({ hiddenDevTrait: 'normal', age: 23 })).toBe(false);
    expect(shouldRevealHiddenDevTrait({ hiddenDevTrait: 'normal', age: 24 })).toBe(true);
    expect(shouldRevealHiddenDevTrait({ hiddenDevTrait: 'normal', age: 31 })).toBe(true);
  });

  it('defaults to not revealed when age and context are both missing', () => {
    expect(shouldRevealHiddenDevTrait({ hiddenDevTrait: 'superstar' })).toBe(false);
    expect(shouldRevealHiddenDevTrait({ hiddenDevTrait: 'superstar' }, {})).toBe(false);
    expect(shouldRevealHiddenDevTrait({ hiddenDevTrait: 'superstar', age: 'unknown' }, null)).toBe(false);
  });
});

// ── getHiddenDevTraitLabel ────────────────────────────────────────────────────

describe('getHiddenDevTraitLabel', () => {
  const revealed = { ovrHistory: history(2), age: 24 };

  it('returns null when hiddenDevTrait is missing', () => {
    expect(getHiddenDevTraitLabel({ ...revealed })).toBeNull();
    expect(getHiddenDevTraitLabel({}, {})).toBeNull();
    expect(getHiddenDevTraitLabel(null)).toBeNull();
  });

  it('returns "Hidden" before the reveal threshold', () => {
    expect(getHiddenDevTraitLabel({ hiddenDevTrait: 'superstar', ovrHistory: history(1), age: 22 })).toBe('Hidden');
    expect(getHiddenDevTraitLabel({ hiddenDevTrait: 'bust' })).toBe('Hidden');
  });

  it('maps every known trait to its label once revealed', () => {
    expect(getHiddenDevTraitLabel({ ...revealed, hiddenDevTrait: 'normal' })).toBe('Normal');
    expect(getHiddenDevTraitLabel({ ...revealed, hiddenDevTrait: 'late_bloomer' })).toBe('Late Bloomer');
    expect(getHiddenDevTraitLabel({ ...revealed, hiddenDevTrait: 'superstar' })).toBe('Superstar');
    expect(getHiddenDevTraitLabel({ ...revealed, hiddenDevTrait: 'bust' })).toBe('Bust');
  });

  it('returns null for unknown trait values once revealed', () => {
    expect(getHiddenDevTraitLabel({ ...revealed, hiddenDevTrait: 'x_factor' })).toBeNull();
    expect(getHiddenDevTraitLabel({ ...revealed, hiddenDevTrait: 'Star' })).toBeNull();
  });
});
