import { describe, it, expect } from 'vitest';
import {
  MOBILE_NAV_HEIGHT,
  MOBILE_NAV_GAP,
  resolveSafeAreaInset,
  getMobileBottomClearance,
  getStickyActionOffset,
  contentFitsAboveNav,
} from './shellLayout.js';

describe('shellLayout — safe-area aware spacing', () => {
  it('resolves numeric and px-string safe-area insets', () => {
    expect(resolveSafeAreaInset(34)).toBe(34);
    expect(resolveSafeAreaInset('34px')).toBe(34);
    expect(resolveSafeAreaInset('0')).toBe(0);
  });

  it('falls back without crashing when the safe-area env value is missing or garbage', () => {
    // This is the "missing safe-area env fallback does not crash layout logic" case.
    expect(resolveSafeAreaInset(undefined)).toBe(0);
    expect(resolveSafeAreaInset(null)).toBe(0);
    expect(resolveSafeAreaInset(NaN)).toBe(0);
    expect(resolveSafeAreaInset('not-a-length')).toBe(0);
    expect(resolveSafeAreaInset(-10)).toBe(0);
    expect(resolveSafeAreaInset(undefined, 8)).toBe(8);
    // And the higher-level helpers must stay finite even with bad input.
    expect(Number.isFinite(getMobileBottomClearance({ safeAreaBottom: undefined }))).toBe(true);
    expect(Number.isFinite(getMobileBottomClearance({ safeAreaBottom: 'oops' }))).toBe(true);
  });

  it('reserves at least the nav height + gap so primary controls are never obscured', () => {
    const flat = getMobileBottomClearance({ safeAreaBottom: 0 });
    expect(flat).toBeGreaterThanOrEqual(MOBILE_NAV_HEIGHT + MOBILE_NAV_GAP);
  });

  it('grows the clearance by the device safe-area inset (notched phones / PWA)', () => {
    const flat = getMobileBottomClearance({ safeAreaBottom: 0 });
    const notched = getMobileBottomClearance({ safeAreaBottom: 34 });
    expect(notched).toBe(flat + 34);
  });

  it('places sticky action bars above the bottom nav clearance', () => {
    const clearance = getMobileBottomClearance({ safeAreaBottom: 20 });
    expect(getStickyActionOffset({ safeAreaBottom: 20 })).toBeGreaterThan(clearance);
  });

  it('reports whether content fits above the nav and never throws on bad input', () => {
    // 800px tall viewport, content ending at 600px clears the nav.
    expect(contentFitsAboveNav(600, 800, { safeAreaBottom: 0 })).toBe(true);
    // Content ending flush with the viewport bottom is obscured by the nav.
    expect(contentFitsAboveNav(800, 800, { safeAreaBottom: 0 })).toBe(false);
    // Defensive: garbage inputs resolve to false rather than throwing.
    expect(contentFitsAboveNav(undefined, NaN)).toBe(false);
  });
});
