import { describe, it, expect, vi } from 'vitest';
import { getAssetValue } from '../../src/core/trades/assetValuation.js';
import { calculatePackageAdjustedValue, applyPackagePickContext } from '../../src/core/trades/packageValuation.js';
import { getPickBaseValueFromMatrix } from '../../src/core/trades/tradeValuationModifiers.js';
import { TEAM_STRATEGIC_POSTURE } from '../../src/core/trades/teamStrategicDirection.js';

const player = { id: 1, assetType: 'player', pos: 'QB', ovr: 82, potential: 84, age: 27, contract: { yearsRemaining: 3, years: 3, yearsTotal: 3, baseAnnual: 18, signingBonus: 6 } };
const rb = { id: 2, assetType: 'player', pos: 'RB', ovr: 72, potential: 73, age: 29, contract: { yearsRemaining: 1, years: 1, yearsTotal: 1, baseAnnual: 5, signingBonus: 0 } };
const baseContext = { week: 7, teamDirection: 'balanced', teamPosture: TEAM_STRATEGIC_POSTURE.NEUTRAL, currentSeason: 2026 };

function legacyPickValue(pick, context = baseContext) {
  const raw = getPickBaseValueFromMatrix(pick?.round);
  return applyPackagePickContext(raw, pick, context);
}

describe('package valuation adapter', () => {
  it('is deterministic and does not mutate inputs', () => {
    const pick = { id: 'p1', round: 1, season: 2026, projectedRange: 'early' };
    const players = [player];
    const picks = [pick];
    const before = JSON.stringify({ players, picks });
    const a = calculatePackageAdjustedValue({ players, picks }, baseContext);
    const b = calculatePackageAdjustedValue({ players, picks }, baseContext);
    expect(a).toBe(b);
    expect(JSON.stringify({ players, picks })).toBe(before);
    expect(Number.isFinite(a)).toBe(true);
    expect(a).toBeGreaterThanOrEqual(0);
  });

  it('routes player raw values through getAssetValue-compatible dependency', () => {
    const getRawAssetValue = vi.fn(() => 100);
    calculatePackageAdjustedValue({ players: [player], picks: [] }, baseContext, { getRawAssetValue });
    expect(getRawAssetValue).toHaveBeenCalledWith(player, null, baseContext);
  });

  it('routes pick raw values through canonical asset valuation source without duplicating future decay by default', () => {
    const futurePick = { id: 'f1', round: 1, season: 2028 };
    const getRawAssetValue = vi.fn((asset, league, context) => getAssetValue(asset, league, context));
    const actual = calculatePackageAdjustedValue({ picks: [futurePick] }, baseContext, { getRawAssetValue });
    expect(getRawAssetValue).toHaveBeenCalledWith(expect.objectContaining({ assetType: 'pick', round: 1 }), null, expect.objectContaining({ currentSeason: null }));
    expect(actual).toBe(Math.round(legacyPickValue(futurePick)));
  });

  it('applies worker-only pick modifiers exactly once', () => {
    const pick = { id: 'p', round: 2, season: 2026, projectedRange: 'early', isCompensatory: true };
    const context = { ...baseContext, week: 10, teamDirection: 'rebuilding', marketMode: 'draft_board' };
    const raw = getPickBaseValueFromMatrix(2);
    const expected = Math.round(raw * 1.22 * 1.1 * 1.15 * 1.2 * 0.84);
    expect(calculatePackageAdjustedValue({ picks: [pick] }, context)).toBe(expected);
  });

  it('preserves draft-board player protection modifiers', () => {
    const normal = calculatePackageAdjustedValue({ players: [rb] }, baseContext);
    const draftBoard = calculatePackageAdjustedValue({ players: [rb] }, { ...baseContext, marketMode: 'draft_board' });
    expect(draftBoard).toBeLessThan(normal);
  });

  it('preserves package diminishing returns for multi-asset packages', () => {
    const single = calculatePackageAdjustedValue({ players: [player] }, baseContext);
    const multi = calculatePackageAdjustedValue({ players: [player, rb], picks: [{ id: 'p3', round: 3, season: 2026 }, { id: 'p4', round: 4, season: 2026 }] }, baseContext);
    const linear = [player, rb].reduce((sum, p) => sum + getAssetValue(p, null, baseContext), 0) + getPickBaseValueFromMatrix(3) + getPickBaseValueFromMatrix(4);
    expect(multi).toBeGreaterThan(single);
    expect(multi).toBeLessThan(linear);
  });

  it.each([
    ['current first', { round: 1, season: 2026 }],
    ['future first', { round: 1, season: 2028 }],
    ['second round', { round: 2, season: 2026 }],
    ['late round', { round: 7, season: 2026 }],
    ['projected slot', { round: 1, season: 2026, projectedRange: 'late' }],
    ['no projected slot', { round: 1, season: 2026 }],
    ['compensatory', { round: 4, season: 2026, isCompensatory: true }],
  ])('matches legacy worker pick path for %s', (_label, pick) => {
    expect(calculatePackageAdjustedValue({ picks: [pick] }, baseContext)).toBe(Math.round(legacyPickValue(pick)));
  });
});
