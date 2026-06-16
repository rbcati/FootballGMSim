import { describe, it, expect } from 'vitest';
import {
  REGIONS,
  CONFIDENCE_BANDS,
  computeSeed,
  computeScoutedRange,
  applySchemeBonus,
  allocateScoutingPoints,
  processWeeklyScoutingForTeam,
  processAIScoutingForTeam,
  getDraftBoardForTeam,
  computeGlobalBuzz,
  finalizeProspectReveal,
} from '../scoutingEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProspect(overrides = {}) {
  return {
    id: 1,
    name: 'Test Player',
    pos: 'WR',
    position: 'WR',
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

// ── computeSeed ───────────────────────────────────────────────────────────────

describe('computeSeed', () => {
  it('returns a number', () => {
    expect(typeof computeSeed(1, 1, 2025)).toBe('number');
  });

  it('is deterministic', () => {
    expect(computeSeed(42, 7, 2025)).toBe(computeSeed(42, 7, 2025));
  });

  it('produces different values for different inputs', () => {
    expect(computeSeed(1, 1, 2025)).not.toBe(computeSeed(2, 1, 2025));
    expect(computeSeed(1, 1, 2025)).not.toBe(computeSeed(1, 2, 2025));
  });
});

// ── computeScoutedRange ───────────────────────────────────────────────────────

describe('computeScoutedRange', () => {
  const seed = computeSeed(1, 1, 2025);

  it('at 0 points uses rangeWidth 18 (Unknown band)', () => {
    const r = computeScoutedRange(75, 0, seed);
    expect(r.label).toBe('Unknown');
    expect(r.high - r.low).toBeGreaterThanOrEqual(1);
    expect(r.high - r.low).toBeLessThanOrEqual(20); // rangeWidth 18 + shift variance
  });

  it('at 3 points uses Minimal band', () => {
    const r = computeScoutedRange(75, 3, seed);
    expect(r.label).toBe('Minimal');
    expect(r.confidence).toBe(3);
  });

  it('at 8 points uses Partial band', () => {
    const r = computeScoutedRange(75, 8, seed);
    expect(r.label).toBe('Partial');
    expect(r.confidence).toBe(8);
  });

  it('at 15 points uses Good band', () => {
    const r = computeScoutedRange(75, 15, seed);
    expect(r.label).toBe('Good');
    expect(r.confidence).toBe(15);
  });

  it('at 25 points uses Excellent band', () => {
    const r = computeScoutedRange(75, 25, seed);
    expect(r.label).toBe('Excellent');
    expect(r.confidence).toBe(25);
  });

  it('never reveals exact ovr at < 25 points (low != high always)', () => {
    for (let pts = 0; pts < 25; pts++) {
      const r = computeScoutedRange(75, pts, seed);
      expect(r.high).toBeGreaterThan(r.low);
    }
  });

  it('clamped to [40, 99]', () => {
    const rLow  = computeScoutedRange(40, 0, seed);
    const rHigh = computeScoutedRange(99, 0, seed);
    expect(rLow.low).toBeGreaterThanOrEqual(40);
    expect(rHigh.high).toBeLessThanOrEqual(99);
  });

  it('is deterministic (same seed → same range)', () => {
    const r1 = computeScoutedRange(75, 10, seed);
    const r2 = computeScoutedRange(75, 10, seed);
    expect(r1).toEqual(r2);
  });

  it('different seeds produce potentially different ranges', () => {
    const seed2 = computeSeed(99, 5, 2025);
    const r1 = computeScoutedRange(75, 10, seed);
    const r2 = computeScoutedRange(75, 10, seed2);
    // Not guaranteed to differ but covers the code path
    expect(typeof r1.low).toBe('number');
    expect(typeof r2.low).toBe('number');
  });
});

// ── applySchemeBonus ──────────────────────────────────────────────────────────

describe('applySchemeBonus', () => {
  const baseRange = { low: 70, high: 80, confidence: 15, label: 'Good' };

  it('fit: +2/+2 adjustment for WR in SPREAD scheme', () => {
    const prospect = makeProspect({ pos: 'WR' });
    const team = makeTeam(); // OC: SPREAD
    const result = applySchemeBonus(prospect, team, baseRange);
    expect(result.schemeFit).toBe('fit');
    expect(result.adjustedLow).toBe(72);
    expect(result.adjustedHigh).toBe(82);
  });

  it('misfit: -1/-1 adjustment for RB in SPREAD scheme', () => {
    const prospect = makeProspect({ pos: 'RB' });
    const team = makeTeam(); // OC: SPREAD
    const result = applySchemeBonus(prospect, team, baseRange);
    expect(result.schemeFit).toBe('misfit');
    expect(result.adjustedLow).toBe(69);
    expect(result.adjustedHigh).toBe(79);
  });

  it('defensive position uses DC scheme', () => {
    const prospect = makeProspect({ pos: 'CB' });
    const team = makeTeam(); // DC: COVER_2 (CB fits)
    const result = applySchemeBonus(prospect, team, baseRange);
    expect(result.schemeFit).toBe('fit');
    expect(result.adjustedLow).toBe(72);
    expect(result.adjustedHigh).toBe(82);
  });

  it('misfit for defensive position', () => {
    const prospect = makeProspect({ pos: 'DE' });
    const team = makeTeam(); // DC: COVER_2 (DE does not fit)
    const result = applySchemeBonus(prospect, team, baseRange);
    expect(result.schemeFit).toBe('misfit');
  });

  it('clamped to [40, 99]', () => {
    const highRange = { low: 98, high: 99, confidence: 25, label: 'Excellent' };
    const prospect = makeProspect({ pos: 'WR' });
    const team = makeTeam();
    const result = applySchemeBonus(prospect, team, highRange);
    expect(result.adjustedHigh).toBeLessThanOrEqual(99);
    expect(result.adjustedLow).toBeLessThanOrEqual(99);
  });

  it('low range clamped to 40', () => {
    const lowRange = { low: 40, high: 41, confidence: 0, label: 'Unknown' };
    const prospect = makeProspect({ pos: 'RB' }); // misfit for SPREAD
    const team = makeTeam();
    const result = applySchemeBonus(prospect, team, lowRange);
    expect(result.adjustedLow).toBeGreaterThanOrEqual(40);
  });

  it('ST position gets no bonus/penalty', () => {
    const prospect = makeProspect({ pos: 'K' });
    const team = makeTeam();
    const result = applySchemeBonus(prospect, team, baseRange);
    expect(result.schemeFit).toBe('neutral');
    expect(result.adjustedLow).toBe(baseRange.low);
    expect(result.adjustedHigh).toBe(baseRange.high);
  });

  it('no adjustment when team has no scheme', () => {
    const prospect = makeProspect({ pos: 'WR' });
    const team = { id: 1, coach: {} };
    const result = applySchemeBonus(prospect, team, baseRange);
    expect(result.schemeFit).toBe('neutral');
  });

  it('BALANCED scheme: everyone fits (null fitSet)', () => {
    const prospect = makeProspect({ pos: 'RB' });
    const team = makeTeam({ coach: { headCoach: { overallRating: 70 }, OC: { scheme: 'BALANCED' }, DC: { scheme: 'HYBRID' } } });
    const result = applySchemeBonus(prospect, team, baseRange);
    expect(result.schemeFit).toBe('fit');
  });
});

// ── allocateScoutingPoints ────────────────────────────────────────────────────

describe('allocateScoutingPoints', () => {
  const budget = { weeklyPoints: 10, allocations: {}, spentThisSeason: 0 };

  it('valid when total <= weeklyPoints', () => {
    const result = allocateScoutingPoints(budget, { midwest: 5, northeast: 5 });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('invalid when total > weeklyPoints', () => {
    const result = allocateScoutingPoints(budget, { midwest: 6, northeast: 6 });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('exceeds weekly budget'))).toBe(true);
  });

  it('valid for direct prospect ID allocation', () => {
    const result = allocateScoutingPoints(budget, { '42': 8 });
    expect(result.valid).toBe(true);
  });

  it('invalid for unknown target (non-region, non-numeric)', () => {
    const result = allocateScoutingPoints(budget, { foobar: 5 });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Unknown target'))).toBe(true);
  });

  it('invalid for negative points', () => {
    const result = allocateScoutingPoints(budget, { midwest: -3 });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Invalid points'))).toBe(true);
  });

  it('all REGIONS are valid targets', () => {
    for (const region of REGIONS) {
      const result = allocateScoutingPoints(budget, { [region]: 1 });
      expect(result.valid).toBe(true);
    }
  });
});

// ── processWeeklyScoutingForTeam ──────────────────────────────────────────────

describe('processWeeklyScoutingForTeam', () => {
  it('accumulates points correctly for direct prospect allocation', () => {
    const prospect = makeProspect({ id: 42, scoutingPoints: 0, scoutedRanges: {} });
    const team = makeTeam({
      id: 1,
      scoutingBudget: { weeklyPoints: 10, allocations: { '42': 8 }, spentThisSeason: 0 },
    });

    const { updatedProspects } = processWeeklyScoutingForTeam(team, [prospect], 2025, 1);
    const updated = updatedProspects.find(p => p.id === 42);
    expect(updated.scoutingPoints).toBe(8);
    expect(updated.scoutedRanges[1].pointsInvested).toBe(8);
  });

  it('accumulates on top of existing points', () => {
    const prospect = makeProspect({
      id: 42,
      scoutingPoints: 5,
      scoutedRanges: { 1: { low: 70, high: 82, confidence: 3, label: 'Minimal', pointsInvested: 5 } },
    });
    const team = makeTeam({
      id: 1,
      scoutingBudget: { weeklyPoints: 10, allocations: { '42': 8 }, spentThisSeason: 0 },
    });

    const { updatedProspects } = processWeeklyScoutingForTeam(team, [prospect], 2025, 1);
    const updated = updatedProspects.find(p => p.id === 42);
    expect(updated.scoutedRanges[1].pointsInvested).toBe(13);
    expect(updated.scoutingPoints).toBe(13);
  });

  it('regional distribution distributes points evenly', () => {
    const p1 = makeProspect({ id: 1, region: 'midwest', scoutingPoints: 0, scoutedRanges: {} });
    const p2 = makeProspect({ id: 2, region: 'midwest', scoutingPoints: 0, scoutedRanges: {} });
    const team = makeTeam({
      id: 1,
      scoutingBudget: { weeklyPoints: 10, allocations: { midwest: 10 }, spentThisSeason: 0 },
    });

    const { updatedProspects } = processWeeklyScoutingForTeam(team, [p1, p2], 2025, 1);
    const u1 = updatedProspects.find(p => p.id === 1);
    const u2 = updatedProspects.find(p => p.id === 2);
    expect(u1.scoutingPoints).toBe(5);
    expect(u2.scoutingPoints).toBe(5);
  });

  it('does not mutate inputs', () => {
    const prospect = makeProspect({ id: 42, scoutingPoints: 0, scoutedRanges: {} });
    const originalPoints = prospect.scoutingPoints;
    const team = makeTeam({
      id: 1,
      scoutingBudget: { weeklyPoints: 10, allocations: { '42': 8 }, spentThisSeason: 0 },
    });

    processWeeklyScoutingForTeam(team, [prospect], 2025, 1);
    expect(prospect.scoutingPoints).toBe(originalPoints);
  });

  it('updates spentThisSeason in budget', () => {
    const prospect = makeProspect({ id: 42, scoutingPoints: 0, scoutedRanges: {} });
    const team = makeTeam({
      id: 1,
      scoutingBudget: { weeklyPoints: 10, allocations: { '42': 8 }, spentThisSeason: 20 },
    });

    const { updatedBudget } = processWeeklyScoutingForTeam(team, [prospect], 2025, 1);
    expect(updatedBudget.spentThisSeason).toBe(28);
  });

  it('prospects not in allocation are unchanged', () => {
    const p1 = makeProspect({ id: 1, scoutingPoints: 0, scoutedRanges: {} });
    const p2 = makeProspect({ id: 2, scoutingPoints: 3, scoutedRanges: {} });
    const team = makeTeam({
      id: 1,
      scoutingBudget: { weeklyPoints: 10, allocations: { '1': 8 }, spentThisSeason: 0 },
    });

    const { updatedProspects } = processWeeklyScoutingForTeam(team, [p1, p2], 2025, 1);
    const u2 = updatedProspects.find(p => p.id === 2);
    expect(u2.scoutingPoints).toBe(3);
  });
});

// ── processAIScoutingForTeam ──────────────────────────────────────────────────

describe('processAIScoutingForTeam', () => {
  it('high-rated coach (>=75) invests 8 points total', () => {
    const prospects = [
      makeProspect({ id: 1, pos: 'WR', ovr: 80, trueOvr: 80, scoutingPoints: 0, scoutedRanges: {} }),
      makeProspect({ id: 2, pos: 'WR', ovr: 75, trueOvr: 75, scoutingPoints: 0, scoutedRanges: {} }),
    ];
    const team = makeTeam({ id: 5, coach: { headCoach: { overallRating: 80 }, OC: { scheme: 'SPREAD' }, DC: { scheme: 'COVER_2' } }, roster: [] });

    const updated = processAIScoutingForTeam(team, prospects, 2025, 1);
    const totalNew = updated.reduce((sum, p) => sum + (p.scoutingPoints ?? 0), 0);
    expect(totalNew).toBeCloseTo(8, 0);
  });

  it('medium-rated coach (55-74) invests 6 points total', () => {
    const prospects = [
      makeProspect({ id: 1, pos: 'RB', ovr: 75, trueOvr: 75, scoutingPoints: 0, scoutedRanges: {} }),
    ];
    const team = makeTeam({ id: 5, coach: { headCoach: { overallRating: 65 }, OC: { scheme: 'SPREAD' }, DC: { scheme: 'COVER_2' } }, roster: [] });

    const updated = processAIScoutingForTeam(team, prospects, 2025, 1);
    const totalNew = updated.reduce((sum, p) => sum + (p.scoutingPoints ?? 0), 0);
    expect(totalNew).toBeCloseTo(6, 0);
  });

  it('low-rated coach (<55) invests 4 points total', () => {
    const prospects = [
      makeProspect({ id: 1, pos: 'QB', ovr: 75, trueOvr: 75, scoutingPoints: 0, scoutedRanges: {} }),
    ];
    const team = makeTeam({ id: 5, coach: { headCoach: { overallRating: 40 }, OC: { scheme: 'SPREAD' }, DC: { scheme: 'COVER_2' } }, roster: [] });

    const updated = processAIScoutingForTeam(team, prospects, 2025, 1);
    const totalNew = updated.reduce((sum, p) => sum + (p.scoutingPoints ?? 0), 0);
    expect(totalNew).toBeCloseTo(4, 0);
  });

  it('is deterministic (same inputs → same output)', () => {
    const prospects = [
      makeProspect({ id: 1, pos: 'WR', ovr: 80, trueOvr: 80, scoutingPoints: 0, scoutedRanges: {} }),
    ];
    const team = makeTeam({ id: 5, roster: [] });

    const r1 = processAIScoutingForTeam(team, prospects, 2025, 1);
    const r2 = processAIScoutingForTeam(team, [...prospects.map(p => ({ ...p }))], 2025, 1);
    expect(r1[0].scoutingPoints).toBe(r2[0].scoutingPoints);
  });

  it('does not mutate input prospects', () => {
    const p = makeProspect({ id: 1, pos: 'WR', ovr: 80, trueOvr: 80, scoutingPoints: 0, scoutedRanges: {} });
    const team = makeTeam({ id: 5, roster: [] });
    processAIScoutingForTeam(team, [p], 2025, 1);
    expect(p.scoutingPoints).toBe(0);
  });
});

// ── getDraftBoardForTeam ──────────────────────────────────────────────────────

describe('getDraftBoardForTeam', () => {
  it('sorted by adjustedHigh desc', () => {
    const p1 = makeProspect({ id: 1, pos: 'WR', trueOvr: 80, scoutedRanges: { 1: { low: 75, high: 85, confidence: 15, label: 'Good', pointsInvested: 15 } }, scoutingPoints: 15 });
    const p2 = makeProspect({ id: 2, pos: 'WR', trueOvr: 70, scoutedRanges: { 1: { low: 65, high: 75, confidence: 15, label: 'Good', pointsInvested: 15 } }, scoutingPoints: 15 });
    const team = makeTeam({ id: 1 });

    const board = getDraftBoardForTeam([p2, p1], 1, team);
    expect(board[0].id).toBe(1);
    expect(board[1].id).toBe(2);
  });

  it('uses Unknown range when no scouting done', () => {
    const p = makeProspect({ id: 1, pos: 'WR', trueOvr: 80, scoutedRanges: {}, scoutingPoints: 0 });
    const team = makeTeam({ id: 1 });

    const board = getDraftBoardForTeam([p], 1, team);
    expect(board[0].scoutedRange.label).toBe('Unknown');
    expect(board[0].scoutedRange.low).toBe(40);
    expect(board[0].scoutedRange.high).toBe(99);
  });

  it('applies scheme bonus in adjustedHigh/adjustedLow', () => {
    const p = makeProspect({ id: 1, pos: 'WR', trueOvr: 75, scoutedRanges: { 1: { low: 70, high: 80, confidence: 15, label: 'Good', pointsInvested: 15 } }, scoutingPoints: 15 });
    const team = makeTeam({ id: 1 }); // OC: SPREAD, WR fits

    const board = getDraftBoardForTeam([p], 1, team);
    expect(board[0].schemeFit).toBe('fit');
    expect(board[0].adjustedHigh).toBe(82);
    expect(board[0].adjustedLow).toBe(72);
  });

  it('returns id, name, pos, region, scoutedRange, adjustedLow, adjustedHigh, schemeFit, fitNote, globalBuzz', () => {
    const p = makeProspect({ id: 1, pos: 'WR', trueOvr: 75, scoutedRanges: {}, scoutingPoints: 0 });
    const team = makeTeam({ id: 1 });

    const board = getDraftBoardForTeam([p], 1, team);
    const entry = board[0];
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('name');
    expect(entry).toHaveProperty('pos');
    expect(entry).toHaveProperty('region');
    expect(entry).toHaveProperty('scoutedRange');
    expect(entry).toHaveProperty('adjustedLow');
    expect(entry).toHaveProperty('adjustedHigh');
    expect(entry).toHaveProperty('schemeFit');
    expect(entry).toHaveProperty('fitNote');
    expect(entry).toHaveProperty('globalBuzz');
  });
});

// ── computeGlobalBuzz ─────────────────────────────────────────────────────────

describe('computeGlobalBuzz', () => {
  it('unknown at 0 points', () => {
    const { buzzLevel } = computeGlobalBuzz({ scoutingPoints: 0 });
    expect(buzzLevel).toBe('unknown');
  });

  it('low at 1-14 points', () => {
    expect(computeGlobalBuzz({ scoutingPoints: 1 }).buzzLevel).toBe('low');
    expect(computeGlobalBuzz({ scoutingPoints: 14 }).buzzLevel).toBe('low');
  });

  it('medium at 15-39 points', () => {
    expect(computeGlobalBuzz({ scoutingPoints: 15 }).buzzLevel).toBe('medium');
    expect(computeGlobalBuzz({ scoutingPoints: 39 }).buzzLevel).toBe('medium');
  });

  it('high at >= 40 points', () => {
    expect(computeGlobalBuzz({ scoutingPoints: 40 }).buzzLevel).toBe('high');
    expect(computeGlobalBuzz({ scoutingPoints: 100 }).buzzLevel).toBe('high');
  });

  it('totalPoints matches scoutingPoints', () => {
    const { totalPoints } = computeGlobalBuzz({ scoutingPoints: 25 });
    expect(totalPoints).toBe(25);
  });

  it('handles missing scoutingPoints as 0', () => {
    const { buzzLevel } = computeGlobalBuzz({});
    expect(buzzLevel).toBe('unknown');
  });
});

// ── finalizeProspectReveal ────────────────────────────────────────────────────

describe('finalizeProspectReveal', () => {
  it('wasAccurate true when trueOvr in range', () => {
    const prospect = makeProspect({
      trueOvr: 75,
      scoutedRanges: { 1: { low: 70, high: 80, confidence: 15, label: 'Good' } },
    });
    const { wasAccurate } = finalizeProspectReveal(prospect, 1);
    expect(wasAccurate).toBe(true);
  });

  it('wasAccurate false when trueOvr below range', () => {
    const prospect = makeProspect({
      trueOvr: 65,
      scoutedRanges: { 1: { low: 70, high: 80, confidence: 15, label: 'Good' } },
    });
    const { wasAccurate } = finalizeProspectReveal(prospect, 1);
    expect(wasAccurate).toBe(false);
  });

  it('wasAccurate false when trueOvr above range', () => {
    const prospect = makeProspect({
      trueOvr: 85,
      scoutedRanges: { 1: { low: 70, high: 80, confidence: 15, label: 'Good' } },
    });
    const { wasAccurate } = finalizeProspectReveal(prospect, 1);
    expect(wasAccurate).toBe(false);
  });

  it('delta is positive when trueOvr above midpoint', () => {
    const prospect = makeProspect({
      trueOvr: 80,
      scoutedRanges: { 1: { low: 70, high: 80, confidence: 15, label: 'Good' } },
    });
    const { delta } = finalizeProspectReveal(prospect, 1);
    // midpoint = 75, delta = 80 - 75 = 5
    expect(delta).toBe(5);
  });

  it('delta is negative when trueOvr below midpoint', () => {
    const prospect = makeProspect({
      trueOvr: 65,
      scoutedRanges: { 1: { low: 70, high: 80, confidence: 15, label: 'Good' } },
    });
    const { delta } = finalizeProspectReveal(prospect, 1);
    // midpoint = 75, delta = 65 - 75 = -10
    expect(delta).toBe(-10);
  });

  it('uses default {low:40, high:99} when no scouting data', () => {
    const prospect = makeProspect({ trueOvr: 75, scoutedRanges: {} });
    const { wasAccurate } = finalizeProspectReveal(prospect, 1);
    // trueOvr 75 is in [40, 99]
    expect(wasAccurate).toBe(true);
  });

  it('returns the trueOvr', () => {
    const prospect = makeProspect({ trueOvr: 82, scoutedRanges: {} });
    const { trueOvr } = finalizeProspectReveal(prospect, 1);
    expect(trueOvr).toBe(82);
  });
});
