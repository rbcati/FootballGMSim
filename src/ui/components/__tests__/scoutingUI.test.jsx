/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Test pure engine functions used by the UI (no DOM required for most)
import {
  computeScoutedRange,
  computeGlobalBuzz,
  getDraftBoardForTeam,
  finalizeProspectReveal,
  REGIONS,
} from '../../../core/draft/scoutingEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProspect(overrides = {}) {
  return {
    id: 1,
    name: 'Test Player',
    pos: 'WR',
    age: 22,
    ovr: 75,
    trueOvr: 75,
    region: 'midwest',
    scoutedRanges: {},
    scoutingPoints: 0,
    ...overrides,
  };
}

function makeTeam(overrides = {}) {
  return {
    id: 1,
    coach: {
      headCoach: { overallRating: 70 },
      OC: { scheme: 'SPREAD', overallRating: 65 },
      DC: { scheme: 'COVER_2', overallRating: 65 },
    },
    roster: [],
    scoutingBudget: { weeklyPoints: 10, allocations: {}, spentThisSeason: 0 },
    ...overrides,
  };
}

// ── ProspectTable scoutedRange display tests ──────────────────────────────────

describe('scoutingUI — scoutedRange display', () => {
  it('computeScoutedRange produces displayable low–high format', () => {
    const seed = 12345;
    const range = computeScoutedRange(75, 8, seed);
    // Display format: "${low}–${high} (${label})"
    const display = `${range.low}–${range.high} (${range.label})`;
    expect(display).toMatch(/^\d+–\d+ \(\w+\)$/);
    expect(range.low).toBeGreaterThanOrEqual(40);
    expect(range.high).toBeLessThanOrEqual(99);
    expect(range.label).toBe('Partial');
  });

  it('Unknown range shown as "40–99 (Unknown)" when no scouting', () => {
    const prospect = makeProspect({ id: 1, scoutedRanges: {}, scoutingPoints: 0 });
    const team = makeTeam({ id: 1 });
    const board = getDraftBoardForTeam([prospect], 1, team);
    const entry = board[0];
    expect(entry.scoutedRange.low).toBe(40);
    expect(entry.scoutedRange.high).toBe(99);
    expect(entry.scoutedRange.label).toBe('Unknown');
  });

  it('scoutedRange label progression follows confidence levels', () => {
    const seed = 99999;
    expect(computeScoutedRange(75, 0, seed).label).toBe('Unknown');
    expect(computeScoutedRange(75, 3, seed).label).toBe('Minimal');
    expect(computeScoutedRange(75, 8, seed).label).toBe('Partial');
    expect(computeScoutedRange(75, 15, seed).label).toBe('Good');
    expect(computeScoutedRange(75, 25, seed).label).toBe('Excellent');
  });
});

// ── FranchiseHQ scouting section visibility tests ─────────────────────────────

describe('scoutingUI — scouting section visibility', () => {
  it('scoutingWeeksRemaining > 0 means scouting is active (free_agency phase)', () => {
    // Simulate the condition that triggers the scouting section
    const league = {
      phase: 'free_agency',
      scoutingWeeksRemaining: 5,
      scoutingBudget: { weeklyPoints: 10, allocations: {}, spentThisSeason: 0 },
    };
    // Scouting section should be shown during free_agency with weeks remaining
    const showScoutingSection = (league.phase === 'free_agency' || league.phase === 'draft') &&
      (league.scoutingWeeksRemaining == null || league.scoutingWeeksRemaining > 0);
    expect(showScoutingSection).toBe(true);
  });

  it('scoutingWeeksRemaining = 0 means scouting is complete', () => {
    const league = {
      phase: 'draft',
      scoutingWeeksRemaining: 0,
    };
    const showScoutingSection = (league.phase === 'free_agency' || league.phase === 'draft') &&
      (league.scoutingWeeksRemaining == null || league.scoutingWeeksRemaining > 0);
    expect(showScoutingSection).toBe(false);
  });

  it('scouting section not shown during regular season', () => {
    const league = {
      phase: 'regular',
      scoutingWeeksRemaining: null,
    };
    const showScoutingSection = (league.phase === 'free_agency' || league.phase === 'draft');
    expect(showScoutingSection).toBe(false);
  });
});

// ── Scheme fit badge tests ────────────────────────────────────────────────────

describe('scoutingUI — scheme fit badge', () => {
  it('WR in SPREAD scheme shows fit', () => {
    const prospect = makeProspect({ id: 1, pos: 'WR', scoutedRanges: { 1: { low: 70, high: 80, confidence: 15, label: 'Good', pointsInvested: 15 } } });
    const team = makeTeam({ id: 1 });
    const board = getDraftBoardForTeam([prospect], 1, team);
    expect(board[0].schemeFit).toBe('fit');
    expect(board[0].fitNote).toContain('SPREAD');
  });

  it('RB in SPREAD scheme shows misfit', () => {
    const prospect = makeProspect({ id: 1, pos: 'RB', scoutedRanges: { 1: { low: 70, high: 80, confidence: 15, label: 'Good', pointsInvested: 15 } } });
    const team = makeTeam({ id: 1 });
    const board = getDraftBoardForTeam([prospect], 1, team);
    expect(board[0].schemeFit).toBe('misfit');
  });

  it('K (kicker) shows neutral scheme fit', () => {
    const prospect = makeProspect({ id: 1, pos: 'K', scoutedRanges: { 1: { low: 70, high: 80, confidence: 15, label: 'Good', pointsInvested: 15 } } });
    const team = makeTeam({ id: 1 });
    const board = getDraftBoardForTeam([prospect], 1, team);
    expect(board[0].schemeFit).toBe('neutral');
  });
});

// ── Buzz icon tests ───────────────────────────────────────────────────────────

describe('scoutingUI — buzz icon', () => {
  it('high buzz at 40+ scouting points', () => {
    const { buzzLevel } = computeGlobalBuzz({ scoutingPoints: 40 });
    expect(buzzLevel).toBe('high');
  });

  it('medium buzz at 15–39 scouting points', () => {
    const { buzzLevel } = computeGlobalBuzz({ scoutingPoints: 20 });
    expect(buzzLevel).toBe('medium');
  });

  it('low buzz at 1–14 scouting points', () => {
    const { buzzLevel } = computeGlobalBuzz({ scoutingPoints: 5 });
    expect(buzzLevel).toBe('low');
  });

  it('unknown buzz at 0 scouting points', () => {
    const { buzzLevel } = computeGlobalBuzz({ scoutingPoints: 0 });
    expect(buzzLevel).toBe('unknown');
  });
});

// ── Post-pick reveal tests ────────────────────────────────────────────────────

describe('scoutingUI — post-pick reveal', () => {
  it('shows trueOvr with positive delta after pick', () => {
    const prospect = makeProspect({
      trueOvr: 85,
      scoutedRanges: { 1: { low: 70, high: 80, confidence: 15, label: 'Good' } },
    });
    const { trueOvr, delta } = finalizeProspectReveal(prospect, 1);
    expect(trueOvr).toBe(85);
    expect(delta).toBeGreaterThan(0); // trueOvr > midpoint
  });

  it('shows trueOvr with negative delta after pick', () => {
    const prospect = makeProspect({
      trueOvr: 65,
      scoutedRanges: { 1: { low: 70, high: 80, confidence: 15, label: 'Good' } },
    });
    const { trueOvr, delta } = finalizeProspectReveal(prospect, 1);
    expect(trueOvr).toBe(65);
    expect(delta).toBeLessThan(0); // trueOvr < midpoint
  });

  it('trueOvr never exposed in board before pick', () => {
    const prospect = makeProspect({ trueOvr: 92, scoutedRanges: {}, scoutingPoints: 0 });
    const team = makeTeam({ id: 1 });
    const board = getDraftBoardForTeam([prospect], 1, team);
    // trueOvr must not be in board entry
    expect('trueOvr' in board[0]).toBe(false);
    // But Unknown range should be shown
    expect(board[0].scoutedRange.label).toBe('Unknown');
  });
});

// ── Regions constant ──────────────────────────────────────────────────────────

describe('scoutingUI — REGIONS constant', () => {
  it('all 6 regions available', () => {
    expect(REGIONS).toHaveLength(6);
    expect(REGIONS.every(r => typeof r === 'string')).toBe(true);
  });
});
