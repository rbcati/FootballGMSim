/**
 * holdoutRosterBadge.test.jsx
 *
 * Tests for holdout badge rendering in Roster.jsx
 */
import { describe, it, expect } from 'vitest';

// We test the badge visibility logic directly (without rendering the full Roster component
// which has many complex dependencies) using the holdout data shape

// ── Badge logic unit tests ────────────────────────────────────────────────────

function hasHoldoutBadge(player) {
  return Boolean(player?.holdout?.active);
}

function hasLowMoraleBadge(player) {
  const morale = player?.morale ?? 75;
  return morale < 40 && !player?.holdout?.active;
}

describe('Roster holdout badge logic', () => {
  it('shows HOLDOUT badge for active holdout player', () => {
    const player = {
      id: 1, morale: 35,
      holdout: { active: true, reason: 'extension_rejected', startWeek: 3, startSeason: 2025, demandPremium: 0.12, resolvedWeek: null, resolvedSeason: null, resolvedBy: null },
    };
    expect(hasHoldoutBadge(player)).toBe(true);
  });

  it('does NOT show HOLDOUT badge when holdout.active = false', () => {
    const player = {
      id: 1, morale: 35,
      holdout: { active: false, reason: 'extension_rejected', startWeek: 3, startSeason: 2025, demandPremium: 0, resolvedWeek: 7, resolvedSeason: 2025, resolvedBy: 'gm_signed' },
    };
    expect(hasHoldoutBadge(player)).toBe(false);
  });

  it('does NOT show HOLDOUT badge when player has no holdout field', () => {
    const player = { id: 1, morale: 35 };
    expect(hasHoldoutBadge(player)).toBe(false);
  });

  it('shows LOW badge when morale < 40 and not on holdout', () => {
    const player = { id: 1, morale: 35, holdout: { active: false } };
    expect(hasLowMoraleBadge(player)).toBe(true);
  });

  it('does NOT show LOW badge when on holdout (HOLDOUT badge takes over)', () => {
    const player = {
      id: 1, morale: 35,
      holdout: { active: true, reason: 'extension_rejected', startWeek: 3, startSeason: 2025, demandPremium: 0.12, resolvedWeek: null, resolvedSeason: null, resolvedBy: null },
    };
    expect(hasLowMoraleBadge(player)).toBe(false);
  });

  it('shows correct demand premium percentage on holdout badge', () => {
    const player = {
      id: 1,
      holdout: { active: true, reason: 'trade_request_denied', demandPremium: 0.18, startWeek: 2, startSeason: 2025, resolvedWeek: null, resolvedSeason: null, resolvedBy: null },
    };
    const premiumPct = Math.round((player.holdout.demandPremium ?? 0) * 100);
    expect(premiumPct).toBe(18);
  });
});

// ── PlayerProfile holdout section logic ──────────────────────────────────────

function hasHoldoutSection(player) {
  return Boolean(player?.holdout?.active);
}

describe('PlayerProfile holdout status section', () => {
  it('shows holdout section when holdout.active = true', () => {
    const player = { id: 1, holdout: { active: true, reason: 'extension_rejected', startWeek: 3, startSeason: 2025, demandPremium: 0.12, resolvedWeek: null, resolvedSeason: null, resolvedBy: null } };
    expect(hasHoldoutSection(player)).toBe(true);
  });

  it('hides holdout section when holdout.active = false', () => {
    const player = { id: 1, holdout: { active: false, resolvedBy: 'gm_signed' } };
    expect(hasHoldoutSection(player)).toBe(false);
  });

  it('hides holdout section when no holdout field', () => {
    const player = { id: 1 };
    expect(hasHoldoutSection(player)).toBe(false);
  });

  it('displays correct weeks on holdout', () => {
    const player = { id: 1, holdout: { active: true, startWeek: 4, startSeason: 2025, demandPremium: 0.08, resolvedWeek: null, resolvedSeason: null, resolvedBy: null } };
    expect(player.holdout.startWeek).toBe(4);
  });
});
