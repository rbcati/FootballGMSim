import { describe, it, expect } from 'vitest';
import {
  DEADLINE_CONFIG,
  DEADLINE_VALUATION_MODIFIERS,
  DEADLINE_RANK_THRESHOLDS,
  isDeadlineWindow,
  isTradeWindowOpen,
  getWeeklyAttemptCount,
  computeDeadlineValuationModifier,
  validateTradeBalance,
  runWeeklyAIToAITrading,
  TRADING_WEEKS,
} from '../aiToAiTradeEngine.js';

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeTeam(id, ovr = 75) {
  return { id, ovr, overallRating: ovr, name: `Team${id}` };
}

function makePlayer({ ovr = 82, age = 27 } = {}) {
  return { id: 99, name: 'Star Player', pos: 'WR', ovr, age };
}

function make20Teams() {
  // 20 teams ranked by descending OVR: ids 1–20, OVR 95 down to 76
  return Array.from({ length: 20 }, (_, i) => makeTeam(i + 1, 95 - i));
}

// ── DEADLINE_CONFIG exports ────────────────────────────────────────────────────

describe('DEADLINE_CONFIG', () => {
  it('deadline_week is 10', () => expect(DEADLINE_CONFIG.deadline_week).toBe(10));
  it('tension_start_week is 8', () => expect(DEADLINE_CONFIG.tension_start_week).toBe(8));
  it('default attempts is 3', () => expect(DEADLINE_CONFIG.attempts_by_week.default).toBe(3));
  it('week_8 attempts is 6', () => expect(DEADLINE_CONFIG.attempts_by_week.week_8).toBe(6));
  it('week_9_10 attempts is 10', () => expect(DEADLINE_CONFIG.attempts_by_week.week_9_10).toBe(10));
  it('is frozen', () => expect(Object.isFrozen(DEADLINE_CONFIG)).toBe(true));
});

// ── isTradeWindowOpen ──────────────────────────────────────────────────────────

describe('isTradeWindowOpen', () => {
  it('returns true for week 1', () => expect(isTradeWindowOpen(1)).toBe(true));
  it('returns true for week 5', () => expect(isTradeWindowOpen(5)).toBe(true));
  it('returns true for week 9', () => expect(isTradeWindowOpen(9)).toBe(true));
  it('returns true for week 10 (deadline week)', () => expect(isTradeWindowOpen(10)).toBe(true));
  it('returns false for week 11', () => expect(isTradeWindowOpen(11)).toBe(false));
  it('returns false for week 16', () => expect(isTradeWindowOpen(16)).toBe(false));
});

// ── isDeadlineWindow ──────────────────────────────────────────────────────────

describe('isDeadlineWindow', () => {
  it('returns false for week 1', () => expect(isDeadlineWindow(1)).toBe(false));
  it('returns false for week 7', () => expect(isDeadlineWindow(7)).toBe(false));
  it('returns true for week 8', () => expect(isDeadlineWindow(8)).toBe(true));
  it('returns true for week 9', () => expect(isDeadlineWindow(9)).toBe(true));
  it('returns true for week 10', () => expect(isDeadlineWindow(10)).toBe(true));
  it('returns false for week 11', () => expect(isDeadlineWindow(11)).toBe(false));
  it('returns false for week 15', () => expect(isDeadlineWindow(15)).toBe(false));
});

// ── getWeeklyAttemptCount ──────────────────────────────────────────────────────

describe('getWeeklyAttemptCount', () => {
  it('returns 3 for weeks 1–7', () => {
    for (let w = TRADING_WEEKS.start; w <= 7; w++) {
      expect(getWeeklyAttemptCount(w)).toBe(3);
    }
  });
  it('returns 6 for week 8', () => expect(getWeeklyAttemptCount(8)).toBe(6));
  it('returns 10 for week 9', () => expect(getWeeklyAttemptCount(9)).toBe(10));
  it('returns 10 for week 10', () => expect(getWeeklyAttemptCount(10)).toBe(10));
  it('returns 0 for week 11 (outside TRADING_WEEKS)', () => expect(getWeeklyAttemptCount(11)).toBe(0));
  it('returns 0 for week 0 (outside TRADING_WEEKS)', () => expect(getWeeklyAttemptCount(0)).toBe(0));
});

// ── computeDeadlineValuationModifier ──────────────────────────────────────────

describe('computeDeadlineValuationModifier', () => {
  const allTeams = make20Teams(); // 20 teams, ids 1–20, OVR 95–76
  // Top-8: ids 1–8 (OVR 95–88), Bottom-8: ids 13–20 (OVR 83–76)

  const topTeam = allTeams[0];    // id 1, OVR 95 — top 8
  const midTeam = allTeams[9];    // id 10, OVR 86 — mid tier (idx 9, not top-8 nor bottom-8 when n=20 → bottom-8 starts at idx 12)
  const botTeam = allTeams[12];   // id 13, OVR 83 — bottom 8 (idx 12 >= 20-8=12)

  it('returns 1.0/1.0 for weeks 1–7 (outside deadline window)', () => {
    const mods = computeDeadlineValuationModifier(topTeam, makePlayer(), 'buyer', allTeams, 5);
    expect(mods).toEqual({ incomingMultiplier: 1.0, outgoingMultiplier: 1.0 });
  });

  it('returns 1.0/1.0 when allTeams is empty', () => {
    const mods = computeDeadlineValuationModifier(topTeam, makePlayer(), 'buyer', [], 9);
    expect(mods).toEqual({ incomingMultiplier: 1.0, outgoingMultiplier: 1.0 });
  });

  it('returns 1.0/1.0 when team is not in allTeams', () => {
    const mods = computeDeadlineValuationModifier(makeTeam(999, 90), makePlayer(), 'buyer', allTeams, 9);
    expect(mods).toEqual({ incomingMultiplier: 1.0, outgoingMultiplier: 1.0 });
  });

  it('returns 1.25/0.85 for top-8 contender buying OVR>=82, age<=29', () => {
    const mods = computeDeadlineValuationModifier(topTeam, makePlayer({ ovr: 84, age: 27 }), 'buyer', allTeams, 9);
    expect(mods.incomingMultiplier).toBe(1.25);
    expect(mods.outgoingMultiplier).toBe(0.85);
  });

  it('returns 1.0/1.0 for top-8 contender buying OVR < 82 (trigger not met)', () => {
    const mods = computeDeadlineValuationModifier(topTeam, makePlayer({ ovr: 80, age: 27 }), 'buyer', allTeams, 9);
    expect(mods).toEqual({ incomingMultiplier: 1.0, outgoingMultiplier: 1.0 });
  });

  it('returns 1.0/1.0 for top-8 contender buying age > 29 (trigger not met)', () => {
    const mods = computeDeadlineValuationModifier(topTeam, makePlayer({ ovr: 85, age: 31 }), 'buyer', allTeams, 9);
    expect(mods).toEqual({ incomingMultiplier: 1.0, outgoingMultiplier: 1.0 });
  });

  it('returns 0.80/1.20 for bottom-8 rebuilder shedding OVR>=80, age>=29', () => {
    const mods = computeDeadlineValuationModifier(botTeam, makePlayer({ ovr: 82, age: 31 }), 'seller', allTeams, 9);
    expect(mods.incomingMultiplier).toBe(0.80);
    expect(mods.outgoingMultiplier).toBe(1.20);
  });

  it('returns 1.0/1.0 for bottom-8 rebuilder but player age < 29 (trigger not met)', () => {
    const mods = computeDeadlineValuationModifier(botTeam, makePlayer({ ovr: 82, age: 27 }), 'seller', allTeams, 9);
    expect(mods).toEqual({ incomingMultiplier: 1.0, outgoingMultiplier: 1.0 });
  });

  it('returns 1.0/1.0 for bottom-8 rebuilder but player OVR < 80 (trigger not met)', () => {
    const mods = computeDeadlineValuationModifier(botTeam, makePlayer({ ovr: 78, age: 31 }), 'seller', allTeams, 9);
    expect(mods).toEqual({ incomingMultiplier: 1.0, outgoingMultiplier: 1.0 });
  });

  it('returns 1.0/1.0 for mid-tier team regardless of player profile', () => {
    const buyer = computeDeadlineValuationModifier(midTeam, makePlayer({ ovr: 90, age: 25 }), 'buyer', allTeams, 9);
    const seller = computeDeadlineValuationModifier(midTeam, makePlayer({ ovr: 85, age: 32 }), 'seller', allTeams, 9);
    expect(buyer).toEqual({ incomingMultiplier: 1.0, outgoingMultiplier: 1.0 });
    expect(seller).toEqual({ incomingMultiplier: 1.0, outgoingMultiplier: 1.0 });
  });

  it('is deterministic — same inputs produce same output', () => {
    const r1 = computeDeadlineValuationModifier(topTeam, makePlayer({ ovr: 84, age: 27 }), 'buyer', allTeams, 9);
    const r2 = computeDeadlineValuationModifier(topTeam, makePlayer({ ovr: 84, age: 27 }), 'buyer', allTeams, 9);
    expect(r1).toEqual(r2);
  });

  it('week 10 (deadline week) still activates modifiers', () => {
    const mods = computeDeadlineValuationModifier(topTeam, makePlayer({ ovr: 85, age: 28 }), 'buyer', allTeams, 10);
    expect(mods.incomingMultiplier).toBe(1.25);
  });
});

// ── validateTradeBalance with deadlineModifiers ────────────────────────────────

describe('validateTradeBalance — deadline modifiers', () => {
  // Reference: contender threshold = 0.95, rebuilder threshold = 1.05
  // A "clean pass" case: cGives=100, cReceives=110 (110 > 100*0.95), rGives=100, rReceives=110 (110 > 100*1.05)

  it('no modifier: returns valid when both sides meet thresholds', () => {
    // Contender: 110 > 100*0.95=95 ✓  Rebuilder: 110 > 100*1.05=105 ✓
    expect(validateTradeBalance(100, 110, 100, 110, null).valid).toBe(true);
  });

  it('no modifier (undefined): returns valid when both sides meet thresholds', () => {
    expect(validateTradeBalance(100, 110, 100, 110).valid).toBe(true);
  });

  it('contender formula uses multiplied values — makes borderline trade pass', () => {
    // Without modifiers: cGives=200, cReceives=188 → 188 <= 200*0.95=190 → contender FAILS
    // Rebuilder side: rGives=100, rReceives=110 → 110 > 105 → passes
    const noMod = validateTradeBalance(200, 188, 100, 110, null);
    expect(noMod.valid).toBe(false);

    const withMod = validateTradeBalance(200, 188, 100, 110, {
      contender: { incomingMultiplier: 1.25, outgoingMultiplier: 0.85 },
      rebuilder:  { incomingMultiplier: 1.0,  outgoingMultiplier: 1.0 },
    });
    // adjCReceives=188*1.25=235, adjCGives=200*0.85=170 → 235 > 170*0.95=161.5 ✓
    // Rebuilder unchanged: 110 > 100*1.05=105 ✓
    expect(withMod.valid).toBe(true);
  });

  it('rebuilder formula uses multiplied values — makes borderline trade pass', () => {
    // Without modifiers: cGives=100, cReceives=110 → passes; rGives=100, rReceives=104 → 104 <= 105 → FAILS
    const noMod = validateTradeBalance(100, 110, 100, 104, null);
    expect(noMod.valid).toBe(false);

    const withMod = validateTradeBalance(100, 110, 100, 104, {
      contender: { incomingMultiplier: 1.0,  outgoingMultiplier: 1.0 },
      rebuilder:  { incomingMultiplier: 0.80, outgoingMultiplier: 1.20 },
    });
    // adjRReceives=104*1.20=124.8, adjRGives=100*0.80=80 → 124.8 > 80*1.05=84 ✓
    // Contender unchanged: 110 > 100*0.95=95 ✓
    expect(withMod.valid).toBe(true);
  });

  it('flat modifiers (1.0/1.0) produce same result as no modifier', () => {
    const flat = {
      contender: { incomingMultiplier: 1.0, outgoingMultiplier: 1.0 },
      rebuilder:  { incomingMultiplier: 1.0, outgoingMultiplier: 1.0 },
    };
    const noMod   = validateTradeBalance(100, 110, 100, 110, null);
    const flatMod = validateTradeBalance(100, 110, 100, 110, flat);
    expect(noMod.valid).toBe(flatMod.valid);
  });
});

// ── runWeeklyAIToAITrading — attempt count behaviour ──────────────────────────

describe('runWeeklyAIToAITrading — deadline gating', () => {
  it('returns [] immediately for week 11 (isTradeWindowOpen = false)', () => {
    const result = runWeeklyAIToAITrading([], [], [], 2025, 11, 42);
    expect(result).toEqual([]);
  });

  it('returns [] for week 16 (deep post-deadline)', () => {
    const result = runWeeklyAIToAITrading([], [], [], 2025, 16, 42);
    expect(result).toEqual([]);
  });

  it('does not throw for week 5 with empty teams', () => {
    expect(() => runWeeklyAIToAITrading([], [], [], 2025, 5, 42)).not.toThrow();
  });

  it('does not throw for week 8 with empty teams', () => {
    expect(() => runWeeklyAIToAITrading([], [], [], 2025, 8, 42)).not.toThrow();
  });

  it('does not throw for week 10 with empty teams', () => {
    expect(() => runWeeklyAIToAITrading([], [], [], 2025, 10, 42)).not.toThrow();
  });
});

// ── Source-level guardrails ────────────────────────────────────────────────────

describe('source guardrails', () => {
  it('computeDeadlineValuationModifier is deterministic across 10 calls', () => {
    const allTeams = make20Teams();
    const team = allTeams[0];
    const player = makePlayer({ ovr: 85, age: 27 });
    const results = Array.from({ length: 10 }, () =>
      computeDeadlineValuationModifier(team, player, 'buyer', allTeams, 9),
    );
    const first = JSON.stringify(results[0]);
    expect(results.every(r => JSON.stringify(r) === first)).toBe(true);
  });

  it('getWeeklyAttemptCount is deterministic', () => {
    const r1 = getWeeklyAttemptCount(8);
    const r2 = getWeeklyAttemptCount(8);
    expect(r1).toBe(r2);
  });
});
