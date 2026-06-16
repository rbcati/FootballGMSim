/**
 * restructureEngine.unit.test.js
 *
 * Unit tests for the Contract Restructuring V1 pure engine.
 * Covers canRestructure, computeRestructure, applyRestructure,
 * getRestructureSummaryForUI, and holdout resolution path.
 *
 * No worker/UI/cache/DB imports — pure module only.
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_RESTRUCTURES,
  canRestructure,
  computeRestructure,
  applyRestructure,
  getRestructureSummaryForUI,
} from '../../src/core/contracts/restructureEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return {
    id: 101,
    name: 'John Doe',
    age: 29,
    pos: 'WR',
    ovr: 78,
    contract: {
      baseAnnual:       15,
      signingBonus:      5,
      years:             3,
      yearsRemaining:    3,
      yearsTotal:        3,
      restructureCount:  0,
    },
    holdout: { active: false },
    ...overrides,
  };
}

function makeTeam(overrides = {}) {
  return {
    id: 10,
    name: 'Test FC',
    capRoom: 50,
    deadCapItems: [],
    ...overrides,
  };
}

// ── canRestructure ────────────────────────────────────────────────────────────

describe('canRestructure', () => {
  it('returns eligible: true for a valid player/team pair', () => {
    const { eligible } = canRestructure(makePlayer(), makeTeam());
    expect(eligible).toBe(true);
  });

  it('returns false when yearsRemaining < 2', () => {
    const player = makePlayer({ contract: { ...makePlayer().contract, years: 1, yearsRemaining: 1 } });
    const { eligible } = canRestructure(player, makeTeam());
    expect(eligible).toBe(false);
  });

  it('returns false when restructureCount >= MAX_RESTRUCTURES (2)', () => {
    const player = makePlayer({
      contract: { ...makePlayer().contract, restructureCount: MAX_RESTRUCTURES },
    });
    const { eligible } = canRestructure(player, makeTeam());
    expect(eligible).toBe(false);
  });

  it('returns false when baseAnnual is 0', () => {
    const player = makePlayer({ contract: { ...makePlayer().contract, baseAnnual: 0 } });
    const { eligible } = canRestructure(player, makeTeam());
    expect(eligible).toBe(false);
  });

  it('returns false when team dead cap threshold exceeded', () => {
    // capRoom = 10, threshold = 0.15 * 10 = 1.5; existing dead cap = 2 (> threshold)
    const team = makeTeam({
      capRoom: 10,
      deadCapItems: [{ amount: 2, playerId: 99, playerName: 'Other Guy' }],
    });
    const { eligible } = canRestructure(makePlayer(), team);
    expect(eligible).toBe(false);
  });

  it('returns true even when player is on active holdout (restructure is the resolution path)', () => {
    const player = makePlayer({ holdout: { active: true } });
    const { eligible } = canRestructure(player, makeTeam());
    expect(eligible).toBe(true);
  });
});

// ── computeRestructure ────────────────────────────────────────────────────────

describe('computeRestructure', () => {
  it('currentYearSaving = 40% of cap hit', () => {
    const capHit  = 20;
    const preview = computeRestructure(makePlayer(), capHit, 3);
    expect(preview.currentYearSaving).toBeCloseTo(capHit * 0.40, 2);
  });

  it('conversionAmount = 40% of cap hit', () => {
    const capHit  = 15;
    const preview = computeRestructure(makePlayer(), capHit, 2);
    expect(preview.conversionAmount).toBeCloseTo(capHit * 0.40, 2);
  });

  it('deadCapPerFutureYear = conversionAmount / yearsLeft', () => {
    const capHit  = 20;
    const yrs     = 4;
    const preview = computeRestructure(makePlayer(), capHit, yrs);
    const expected = Math.round(capHit * 0.40 / yrs * 100) / 100;
    expect(preview.deadCapPerFutureYear).toBeCloseTo(expected, 2);
  });

  it('voidYearDeadCap = deadCapPerFutureYear', () => {
    const preview = computeRestructure(makePlayer(), 20, 3);
    expect(preview.voidYearDeadCap).toBeCloseTo(preview.deadCapPerFutureYear, 2);
  });

  it('newCapHit = currentCapHit - conversionAmount + deadCapPerFutureYear', () => {
    const capHit  = 20;
    const yrs     = 3;
    const preview = computeRestructure(makePlayer(), capHit, yrs);
    const expected = Math.round((capHit - preview.conversionAmount + preview.deadCapPerFutureYear) * 100) / 100;
    expect(preview.newCapHit).toBeCloseTo(expected, 2);
  });

  it('expiresAfterSeason = season + yearsLeft', () => {
    const preview = computeRestructure(makePlayer(), 15, 3, 2026);
    expect(preview.expiresAfterSeason).toBe(2026 + 3);
  });
});

// ── applyRestructure ──────────────────────────────────────────────────────────

describe('applyRestructure', () => {
  it('increments restructureCount', () => {
    const player  = makePlayer();
    const preview = computeRestructure(player, 20, 3, 2026);
    const { updatedPlayer } = applyRestructure(player, makeTeam(), preview, 2026);
    expect(updatedPlayer.contract.restructureCount).toBe(1);
  });

  it('adds deadCapItem to team.deadCapItems', () => {
    const player  = makePlayer();
    const preview = computeRestructure(player, 20, 3, 2026);
    const { updatedTeam } = applyRestructure(player, makeTeam(), preview, 2026);
    expect(updatedTeam.deadCapItems.length).toBe(1);
    expect(updatedTeam.deadCapItems[0].playerId).toBe(player.id);
    expect(updatedTeam.deadCapItems[0].amount).toBeCloseTo(preview.voidYearDeadCap, 2);
  });

  it('does NOT mutate input player object', () => {
    const player  = makePlayer();
    const originalCount = player.contract.restructureCount;
    const preview = computeRestructure(player, 20, 3, 2026);
    applyRestructure(player, makeTeam(), preview, 2026);
    expect(player.contract.restructureCount).toBe(originalCount);
  });

  it('does NOT mutate input team object', () => {
    const team    = makeTeam();
    const origLen = team.deadCapItems.length;
    const preview = computeRestructure(makePlayer(), 20, 3, 2026);
    applyRestructure(makePlayer(), team, preview, 2026);
    expect(team.deadCapItems.length).toBe(origLen);
  });

  it('newBase = baseAnnual - conversionAmount', () => {
    const player     = makePlayer();
    const baseAnnual = player.contract.baseAnnual; // 15
    const preview    = computeRestructure(player, 20, 3, 2026);
    const { updatedPlayer } = applyRestructure(player, makeTeam(), preview, 2026);
    const expectedBase = Math.round((baseAnnual - preview.conversionAmount) * 100) / 100;
    expect(updatedPlayer.contract.baseAnnual).toBeCloseTo(expectedBase, 2);
  });

  it('void year in team.deadCapItems has correct expiresAfterSeason', () => {
    const preview = computeRestructure(makePlayer(), 15, 3, 2026);
    const { updatedTeam } = applyRestructure(makePlayer(), makeTeam(), preview, 2026);
    expect(updatedTeam.deadCapItems[0].expiresAfterSeason).toBe(preview.expiresAfterSeason);
  });

  it('old save without deadCapItems hydrates safely (deadCapItems starts empty)', () => {
    const team    = { id: 1, name: 'Legacy FC', capRoom: 50 }; // no deadCapItems field
    const preview = computeRestructure(makePlayer(), 15, 3, 2026);
    expect(() => applyRestructure(makePlayer(), team, preview, 2026)).not.toThrow();
    const { updatedTeam } = applyRestructure(makePlayer(), team, preview, 2026);
    expect(Array.isArray(updatedTeam.deadCapItems)).toBe(true);
    expect(updatedTeam.deadCapItems.length).toBe(1);
  });

  it('old save without restructureCount hydrates to 0 then increments to 1', () => {
    const player = makePlayer();
    delete player.contract.restructureCount; // simulate old save
    const preview = computeRestructure(player, 15, 3, 2026);
    const { updatedPlayer } = applyRestructure(player, makeTeam(), preview, 2026);
    expect(updatedPlayer.contract.restructureCount).toBe(1);
  });
});

// ── getRestructureSummaryForUI ────────────────────────────────────────────────

describe('getRestructureSummaryForUI', () => {
  it('returns eligible: true with a preview for a valid player', () => {
    const summary = getRestructureSummaryForUI(makePlayer(), makeTeam(), 2026);
    expect(summary.eligible).toBe(true);
    expect(summary.preview).not.toBeNull();
  });

  it('returns eligible: false with reason for ineligible player', () => {
    const player  = makePlayer({ contract: { ...makePlayer().contract, years: 1, yearsRemaining: 1 } });
    const summary = getRestructureSummaryForUI(player, makeTeam(), 2026);
    expect(summary.eligible).toBe(false);
    expect(typeof summary.reason).toBe('string');
    expect(summary.reason.length).toBeGreaterThan(0);
    expect(summary.preview).toBeNull();
  });

  it('isHoldoutPlayer is true when player has active holdout', () => {
    const player  = makePlayer({ holdout: { active: true } });
    const summary = getRestructureSummaryForUI(player, makeTeam(), 2026);
    expect(summary.eligible).toBe(true);
    expect(summary.preview.isHoldoutPlayer).toBe(true);
  });

  it('restructuresRemaining = MAX_RESTRUCTURES - restructureCount', () => {
    const player  = makePlayer({ contract: { ...makePlayer().contract, restructureCount: 1 } });
    const summary = getRestructureSummaryForUI(player, makeTeam(), 2026);
    expect(summary.preview.restructuresRemaining).toBe(MAX_RESTRUCTURES - 1);
  });
});
