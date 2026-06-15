/**
 * holdoutUI.test.jsx — Holdout premium display logic tests
 *
 * Tests the holdout demand premium visibility logic without full component
 * rendering (consistent with holdoutRosterBadge.test.jsx approach).
 */
import { describe, it, expect } from 'vitest';

// Mirror the exact conditional from ContractNegotiation.jsx
function shouldShowHoldoutPremium(player) {
  return Boolean(player?.holdout?.active);
}

function getHoldoutPremiumPct(player) {
  return Math.round((player?.holdout?.demandPremium ?? 0) * 100);
}

// ── ContractNegotiation holdout premium ──────────────────────────────────────

describe('ContractNegotiation — holdout demand premium line', () => {
  it('shows holdout premium when player.holdout.active = true', () => {
    const player = {
      id: 1, name: 'Test Player', pos: 'WR', ovr: 80,
      baseAnnual: 10, morale: 70, moraleEvents: [], awards: [],
      holdout: { active: true, reason: 'extension_rejected', startWeek: 3, startSeason: 2025, demandPremium: 0.12, resolvedWeek: null, resolvedSeason: null, resolvedBy: null },
    };
    expect(shouldShowHoldoutPremium(player)).toBe(true);
    expect(getHoldoutPremiumPct(player)).toBe(12);
  });

  it('does NOT show holdout premium when holdout.active = false', () => {
    const player = {
      id: 1, name: 'Test Player', pos: 'WR', ovr: 80,
      baseAnnual: 10, morale: 70, moraleEvents: [], awards: [],
      holdout: { active: false, reason: null, startWeek: null, startSeason: null, demandPremium: 0, resolvedWeek: 5, resolvedSeason: 2025, resolvedBy: 'gm_signed' },
    };
    expect(shouldShowHoldoutPremium(player)).toBe(false);
  });

  it('does NOT show holdout premium when player has no holdout field', () => {
    const player = { id: 1, name: 'Test Player', pos: 'WR', ovr: 80, baseAnnual: 10, morale: 70, moraleEvents: [], awards: [] };
    expect(shouldShowHoldoutPremium(player)).toBe(false);
  });

  it('shows correct premium percentage for trade_request_denied (18%)', () => {
    const player = {
      id: 1,
      holdout: { active: true, reason: 'trade_request_denied', demandPremium: 0.18, startWeek: 2, startSeason: 2025, resolvedWeek: null, resolvedSeason: null, resolvedBy: null },
    };
    expect(shouldShowHoldoutPremium(player)).toBe(true);
    expect(getHoldoutPremiumPct(player)).toBe(18);
  });

  it('shows correct premium percentage for starter_role_lost (8%)', () => {
    const player = {
      id: 1,
      holdout: { active: true, reason: 'starter_role_lost', demandPremium: 0.08, startWeek: 1, startSeason: 2025, resolvedWeek: null, resolvedSeason: null, resolvedBy: null },
    };
    expect(shouldShowHoldoutPremium(player)).toBe(true);
    expect(getHoldoutPremiumPct(player)).toBe(8);
  });
});
