import { describe, it, expect } from 'vitest';
import { runEngineSoak, evaluateGate, SOAK_THRESHOLDS } from '../../scripts/engineSoak.js';
import { DEFAULT_LEAGUE_SETTINGS } from '../../src/core/leagueSettings.js';

// Wave 3 regression coverage: the engine soak is the gate that decides whether
// useNewSimulationEngine may be flipped. These tests pin the gate logic and the
// matchup engine's realism so a future change can't silently regress the engine
// (or the flip) without turning this suite red.

describe('engineSoak gate logic', () => {
  const passing = {
    topQuartileWinPct: 0.70, passYdsPerGame: 240, rushYdsPerGame: 115,
    pointsPerGame: 24, scoreStdDev: 12, msPerGame: 3, crashes: 0, minTeamScore: 3,
    finalTieRate: 0,
  };
  const legacy = { scoreStdDev: 11 };

  it('passes when every metric is in range', () => {
    const { passed, checks } = evaluateGate(passing, legacy);
    expect(passed).toBe(true);
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it('fails on unrealistic scoring (the original matchupEngine defect)', () => {
    const broken = { ...passing, pointsPerGame: 6.7, passYdsPerGame: 56, rushYdsPerGame: 33 };
    const { passed } = evaluateGate(broken, legacy);
    expect(passed).toBe(false);
  });

  it('fails when favourites win too deterministically', () => {
    const tooDominant = { ...passing, topQuartileWinPct: 0.85 };
    expect(evaluateGate(tooDominant, legacy).passed).toBe(false);
  });

  it('fails when PBP variance falls below the legacy engine', () => {
    const flat = { ...passing, scoreStdDev: 9 };
    expect(evaluateGate(flat, { scoreStdDev: 11 }).passed).toBe(false);
  });

  it('fails when the rich engine still returns tied finals (OT must resolve ties)', () => {
    const tying = { ...passing, finalTieRate: 0.045 };
    const { passed, checks } = evaluateGate(tying, legacy);
    expect(passed).toBe(false);
    expect(checks.find((c) => c.name.includes('Final tie rate'))?.pass).toBe(false);
  });

  it('labels the minTeamScore check as a floor regression check, not a scoring-health gate', () => {
    const { checks } = evaluateGate(passing, legacy);
    const floorCheck = checks.find((c) => c.name.includes('Floor regression check'));
    expect(floorCheck).toBeDefined();
    expect(floorCheck.name).toContain('not a scoring-health gate');
  });

  it('exposes the documented threshold bands', () => {
    expect(SOAK_THRESHOLDS.pointsPerGame).toEqual({ min: 20, max: 27 });
    expect(SOAK_THRESHOLDS.passYdsPerGame).toEqual({ min: 220, max: 280 });
    expect(SOAK_THRESHOLDS.rushYdsPerGame).toEqual({ min: 100, max: 130 });
    expect(SOAK_THRESHOLDS.topQuartileWinPct).toEqual({ min: 0.68, max: 0.76 });
    expect(SOAK_THRESHOLDS.maxFinalTieRate).toBe(0.01);
  });
});

describe('engineSoak end-to-end gate (deterministic)', () => {
  it('matchup engine passes all soak gate checks', () => {
    const report = runEngineSoak({ seasons: 4, seed: 20260605 });
    expect(report.matchup.crashes).toBe(0);
    expect(report.legacy.crashes).toBe(0);
    // Stat realism (stable even on a short run).
    expect(report.matchup.pointsPerGame).toBeGreaterThanOrEqual(20);
    expect(report.matchup.pointsPerGame).toBeLessThanOrEqual(27);
    expect(report.matchup.passYdsPerGame).toBeGreaterThanOrEqual(220);
    expect(report.matchup.passYdsPerGame).toBeLessThanOrEqual(280);
    expect(report.matchup.rushYdsPerGame).toBeGreaterThanOrEqual(100);
    expect(report.matchup.rushYdsPerGame).toBeLessThanOrEqual(130);
    // PBP variance must beat the legacy engine.
    expect(report.matchup.scoreStdDev).toBeGreaterThanOrEqual(report.legacy.scoreStdDev);
    // OT resolves every tie; the underlying regulation tie tendency stays visible.
    expect(report.matchup.finalTieRate).toBe(0);
    expect(report.matchup.regulationTieRate).not.toBeNull();
    expect(report.matchup.preFloorShutoutRate).not.toBeNull();
    // All gate checks must pass — no documented open defects remain.
    expect(report.gate.passed).toBe(true);
  }, 30000);

  it('soak is deterministic for a fixed seed (globalSeed pinned for the legacy engine)', () => {
    // msPerGame is wall-clock and excluded. Both engines must reproduce: the
    // matchup engine via per-game seeded RNG, the legacy engine because the
    // soak now pins league.globalSeed (previously Math.random per-save entropy,
    // which made the comparative variance gate flaky across identical runs).
    const omitTiming = ({ msPerGame, ...rest }) => rest;
    const a = runEngineSoak({ seasons: 2, seed: 4242 });
    const b = runEngineSoak({ seasons: 2, seed: 4242 });
    expect(omitTiming(a.matchup)).toEqual(omitTiming(b.matchup));
    expect(omitTiming(a.legacy)).toEqual(omitTiming(b.legacy));
  }, 30000);
});

describe('engine flip', () => {
  it('useNewSimulationEngine default is enabled (soak passed)', () => {
    expect(DEFAULT_LEAGUE_SETTINGS.useNewSimulationEngine).toBe(true);
  });
});
