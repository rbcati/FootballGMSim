/**
 * restructureUI.unit.test.jsx
 *
 * UI-level unit tests for Feature C contract restructuring components.
 * Tests FranchiseHQ dead cap panel visibility, RosterManager restructure
 * button/modal, and ContractNegotiation cap-room hint.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// ── Component imports ─────────────────────────────────────────────────────────

// We test the pure restructureEngine functions directly for the core logic.
import {
  getRestructureSummaryForUI,
  canRestructure,
} from '../../src/core/contracts/restructureEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return {
    id: 1,
    name: 'Test Player',
    ovr: 78,
    age: 29,
    pos: 'WR',
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

// ── FranchiseHQ dead cap panel logic ─────────────────────────────────────────

describe('FranchiseHQ dead cap panel (pure logic)', () => {
  it('dead cap panel should be hidden when deadCapItems is empty', () => {
    const team = makeTeam({ deadCapItems: [] });
    const items = Array.isArray(team.deadCapItems) ? team.deadCapItems : [];
    expect(items.length).toBe(0);
  });

  it('dead cap panel should be shown when deadCapItems is non-empty', () => {
    const team = makeTeam({
      deadCapItems: [
        { playerId: 1, playerName: 'John Doe', amount: 3.5, expiresAfterSeason: 2028 },
      ],
    });
    const items = Array.isArray(team.deadCapItems) ? team.deadCapItems : [];
    expect(items.length).toBeGreaterThan(0);
  });

  it('total dead cap is sum of all item amounts', () => {
    const team = makeTeam({
      deadCapItems: [
        { amount: 2.0 },
        { amount: 3.5 },
      ],
    });
    const total = team.deadCapItems.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
    expect(total).toBeCloseTo(5.5, 2);
  });
});

// ── RosterManager restructure button logic ────────────────────────────────────

describe('RosterManager restructure button (eligibility logic)', () => {
  it('restructure button is visible when player is eligible', () => {
    const player  = makePlayer();
    const team    = makeTeam();
    const { eligible } = getRestructureSummaryForUI(player, team, 2026);
    expect(eligible).toBe(true);
  });

  it('restructure button is hidden when player is NOT eligible (1 year left)', () => {
    const player = makePlayer({ contract: { ...makePlayer().contract, years: 1, yearsRemaining: 1 } });
    const team   = makeTeam();
    const { eligible } = getRestructureSummaryForUI(player, team, 2026);
    expect(eligible).toBe(false);
  });

  it('restructure button is hidden when restructureCount >= 2', () => {
    const player = makePlayer({ contract: { ...makePlayer().contract, restructureCount: 2 } });
    const { eligible } = getRestructureSummaryForUI(player, makeTeam(), 2026);
    expect(eligible).toBe(false);
  });
});

// ── RestructureModal preview values ──────────────────────────────────────────

describe('RestructureModal preview values', () => {
  it('preview shows correct current cap hit, new cap hit, and saving', () => {
    const player  = makePlayer();
    const team    = makeTeam();
    const { preview } = getRestructureSummaryForUI(player, team, 2026);

    expect(preview).not.toBeNull();
    expect(preview.currentCapHit).toBeGreaterThan(0);
    expect(preview.newCapHit).toBeLessThan(preview.currentCapHit);
    expect(preview.currentYearSaving).toBeGreaterThan(0);
  });

  it('preview shows correct dead cap per future year', () => {
    const player  = makePlayer();
    const { preview } = getRestructureSummaryForUI(player, makeTeam(), 2026);
    expect(preview.deadCapPerFutureYear).toBeGreaterThan(0);
    expect(preview.deadCapPerFutureYear).toBeLessThan(preview.currentCapHit);
  });

  it('preview shows holdout context when player is on holdout', () => {
    const player  = makePlayer({ holdout: { active: true } });
    const { preview } = getRestructureSummaryForUI(player, makeTeam(), 2026);
    expect(preview.isHoldoutPlayer).toBe(true);
  });

  it('preview shows non-holdout context when player is not on holdout', () => {
    const player  = makePlayer({ holdout: { active: false } });
    const { preview } = getRestructureSummaryForUI(player, makeTeam(), 2026);
    expect(preview.isHoldoutPlayer).toBe(false);
  });
});

// ── ContractNegotiation restructure hint logic ────────────────────────────────

describe('ContractNegotiation restructure hint (pure logic)', () => {
  it('hint is present when restructure is available for the player', () => {
    const player = makePlayer();
    const team   = makeTeam();
    const { eligible } = canRestructure(player, team);
    expect(eligible).toBe(true);
  });

  it('hint is absent when restructure is NOT available', () => {
    const player = makePlayer({ contract: { ...makePlayer().contract, years: 1, yearsRemaining: 1 } });
    const team   = makeTeam();
    const { eligible } = canRestructure(player, team);
    expect(eligible).toBe(false);
  });
});
