/**
 * shellLayout.js — Mobile shell spacing helpers
 *
 * Single source of truth (mirrored in CSS tokens in base.css) for the
 * floating bottom-nav footprint. Keeping the math here — as pure, fallback-safe
 * functions — lets layout decisions be unit-tested and reused without relying
 * on the browser to resolve `env(safe-area-inset-*)`, which is `0`/undefined in
 * non-iOS contexts and in jsdom.
 *
 * These values match the CSS custom properties:
 *   --mobile-nav-height, --mobile-nav-gap, --mobile-bottom-clearance.
 */

// Floating nav min-height (px). Mirrors --mobile-nav-height.
export const MOBILE_NAV_HEIGHT = 60;
// Gap between the floating nav and the viewport bottom edge (px). Mirrors --mobile-nav-gap.
export const MOBILE_NAV_GAP = 10;
// Extra breathing room between page content and the nav (px).
export const MOBILE_BOTTOM_GUTTER = 12;

/**
 * Resolve a safe-area inset to a usable, non-negative number.
 *
 * Accepts numbers, numeric strings (e.g. "34", "34px") or undefined/null/NaN
 * and always returns a finite number — never throws — so a missing
 * `env(safe-area-inset-bottom)` value can never crash layout logic.
 */
export function resolveSafeAreaInset(value, fallback = 0) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }
  return fallback;
}

/**
 * Total vertical space (px) the floating bottom nav occupies from the viewport
 * bottom, including the device safe-area inset. Pages reserve at least this much
 * bottom padding so the last row of content / primary controls is never hidden
 * behind the nav.
 */
export function getMobileBottomClearance({
  navHeight = MOBILE_NAV_HEIGHT,
  gap = MOBILE_NAV_GAP,
  gutter = MOBILE_BOTTOM_GUTTER,
  safeAreaBottom,
} = {}) {
  const safe = resolveSafeAreaInset(safeAreaBottom, 0);
  return navHeight + gap + gutter + safe;
}

/**
 * Bottom offset (px) a page-local sticky action bar should sit at so it rests
 * just above the floating nav rather than colliding with it.
 */
export function getStickyActionOffset(options = {}) {
  const { extra = 8 } = options;
  return getMobileBottomClearance(options) + extra;
}

/**
 * Whether a given content height fits above the nav within the viewport without
 * being obscured. Defensive: bad inputs resolve to a safe `false` rather than
 * throwing.
 */
export function contentFitsAboveNav(contentBottom, viewportHeight, options = {}) {
  const cb = Number(contentBottom);
  const vh = Number(viewportHeight);
  if (!Number.isFinite(cb) || !Number.isFinite(vh)) return false;
  return cb <= vh - getMobileBottomClearance(options);
}
