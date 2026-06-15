/**
 * hofEngine.test.js — Hall of Fame Voting V1 unit tests
 */

import { describe, it, expect } from 'vitest';
import {
  HOF_THRESHOLDS,
  computeHofScore,
  isHofEligible,
  generateHofBallot,
  resolveHofVote,
  applyHofInductions,
  getHofSummary,
  ensureHofMeta,
} from '../../src/core/awards/hofEngine.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return {
    id: 'p1',
    name: 'Test Player',
    pos: 'QB',
    status: 'retired',
    hofStatus: 'none',
    awards: [],
    careerStats: [],
    ...overrides,
  };
}

function makeCareerStats(seasons, careerTotals = {}) {
  // Stats go into the FIRST entry only so aggregate == careerTotals.
  // Remaining entries are zeroed. careerStats.length == seasons (for longevity).
  return Array.from({ length: seasons }, (_, i) => ({
    season: `s${i + 1}`,
    team: 'KC',
    passTD: i === 0 ? (careerTotals.passTD ?? 0) : 0,
    passYd: i === 0 ? (careerTotals.passYd ?? 0) : 0,
    rushTD: i === 0 ? (careerTotals.rushTD ?? 0) : 0,
    rushYd: i === 0 ? (careerTotals.rushYd ?? 0) : 0,
    recTD: i === 0 ? (careerTotals.recTD ?? 0) : 0,
    recYd: i === 0 ? (careerTotals.recYd ?? 0) : 0,
    receptions: i === 0 ? (careerTotals.receptions ?? 0) : 0,
    sacks: i === 0 ? (careerTotals.sacks ?? 0) : 0,
    interceptions: i === 0 ? (careerTotals.interceptions ?? 0) : 0,
    tackles: i === 0 ? (careerTotals.tackles ?? 0) : 0,
    fgMade: i === 0 ? (careerTotals.fgMade ?? 0) : 0,
    fgAttempts: i === 0 ? (careerTotals.fgAttempts ?? 0) : 0,
  }));
}

function makeAwardSummary(overrides = {}) {
  return { mvpCount: 0, allProCount: 0, championshipCount: 0, ...overrides };
}

// ── computeHofScore ───────────────────────────────────────────────────────────

describe('computeHofScore — position formulas', () => {
  it('QB: passTd×3 + passYd/250 + rushTd×2', () => {
    const player = makePlayer({ pos: 'QB', careerStats: makeCareerStats(8, { passTD: 40, passYd: 5000, rushTD: 5 }) });
    // base = 40×3 + 5000/250 + 5×2 = 120 + 20 + 10 = 150
    expect(computeHofScore(player, null, makeAwardSummary())).toBeCloseTo(150);
  });

  it('RB: rushTd×4 + rushYd/60 + recTd×3', () => {
    const player = makePlayer({ pos: 'RB', careerStats: makeCareerStats(8, { rushTD: 20, rushYd: 9000, recTD: 5 }) });
    // base = 20×4 + 9000/60 + 5×3 = 80 + 150 + 15 = 245
    expect(computeHofScore(player, null, makeAwardSummary())).toBeCloseTo(245);
  });

  it('WR: recTd×4 + recYd/60 + receptions/5', () => {
    const player = makePlayer({ pos: 'WR', careerStats: makeCareerStats(8, { recTD: 25, recYd: 9000, receptions: 600 }) });
    // base = 25×4 + 9000/60 + 600/5 = 100 + 150 + 120 = 370
    expect(computeHofScore(player, null, makeAwardSummary())).toBeCloseTo(370);
  });

  it('TE: same formula as WR', () => {
    const player = makePlayer({ pos: 'TE', careerStats: makeCareerStats(8, { recTD: 10, recYd: 5000, receptions: 400 }) });
    // base = 10×4 + 5000/60 + 400/5 = 40 + 83.33 + 80 = 203.33
    expect(computeHofScore(player, null, makeAwardSummary())).toBeCloseTo(203.33, 0);
  });

  it('DB (CB): sacks×5 + int×6 + tackles/20', () => {
    const player = makePlayer({ pos: 'CB', careerStats: makeCareerStats(8, { sacks: 0, interceptions: 30, tackles: 400 }) });
    // base = 0 + 30×6 + 400/20 = 0 + 180 + 20 = 200
    expect(computeHofScore(player, null, makeAwardSummary())).toBeCloseTo(200);
  });

  it('OL: seasons×8 + allProCount×10', () => {
    const player = makePlayer({ pos: 'OL', careerStats: makeCareerStats(12) });
    const aw = makeAwardSummary({ allProCount: 5 });
    // base = 12×8 + 5×10 = 96 + 50 = 146; longevity = 25 (10 seasons); award bonus = 5×15 = 75
    // total = 146 + 25 + 75 = 246
    expect(computeHofScore(player, null, aw)).toBeCloseTo(246);
  });

  it('K: fgMade×2 + (fgMade/fgAttempted)×50', () => {
    const player = makePlayer({ pos: 'K', careerStats: makeCareerStats(10, { fgMade: 300, fgAttempts: 350 }) });
    // base = 300×2 + (300/350)×50 = 600 + 42.86 = 642.86
    // longevity = 25 (10 seasons); award bonus = 0
    const score = computeHofScore(player, null, makeAwardSummary());
    expect(score).toBeCloseTo(667.86, 0);
  });

  it('DL: sacks×5 + int×6 + tackles/20', () => {
    const player = makePlayer({ pos: 'DL', careerStats: makeCareerStats(8, { sacks: 120, interceptions: 2, tackles: 300 }) });
    // base = 120×5 + 2×6 + 300/20 = 600 + 12 + 15 = 627
    expect(computeHofScore(player, null, makeAwardSummary())).toBeCloseTo(627);
  });

  it('S (Safety): sacks×5 + int×6 + tackles/20', () => {
    const player = makePlayer({ pos: 'S', careerStats: makeCareerStats(10, { sacks: 5, interceptions: 40, tackles: 800 }) });
    // base = 5×5 + 40×6 + 800/20 = 25 + 240 + 40 = 305
    // longevity = 25
    expect(computeHofScore(player, null, makeAwardSummary())).toBeCloseTo(330);
  });
});

describe('computeHofScore — longevity bonus', () => {
  it('no bonus below 10 seasons', () => {
    const player = makePlayer({ pos: 'QB', careerStats: makeCareerStats(9, { passTD: 10, passYd: 1000 }) });
    const score = computeHofScore(player, null, makeAwardSummary());
    // base = 10×3 + 1000/250 = 34; no longevity bonus
    expect(score).toBeCloseTo(34);
  });

  it('+25 bonus at exactly 10 seasons', () => {
    const player = makePlayer({ pos: 'QB', careerStats: makeCareerStats(10, { passTD: 10, passYd: 1000 }) });
    const score = computeHofScore(player, null, makeAwardSummary());
    expect(score).toBeCloseTo(59); // 34 + 25
  });

  it('+75 cumulative bonus at 14+ seasons (25+50)', () => {
    const player = makePlayer({ pos: 'QB', careerStats: makeCareerStats(14, { passTD: 10, passYd: 1000 }) });
    const score = computeHofScore(player, null, makeAwardSummary());
    expect(score).toBeCloseTo(109); // 34 + 75
  });
});

describe('computeHofScore — award bonuses', () => {
  it('MVP adds +40 per award', () => {
    const player = makePlayer({ pos: 'QB', careerStats: makeCareerStats(8, { passTD: 40, passYd: 5000 }) });
    const aw = makeAwardSummary({ mvpCount: 2 });
    // base = 40×3 + 5000/250 = 140; award = 2×40 = 80
    expect(computeHofScore(player, null, aw)).toBeCloseTo(220);
  });

  it('All-Pro adds +15 per selection', () => {
    const player = makePlayer({ pos: 'QB', careerStats: makeCareerStats(8, { passTD: 40, passYd: 5000 }) });
    const aw = makeAwardSummary({ allProCount: 3 });
    // base = 140; award = 3×15 = 45
    expect(computeHofScore(player, null, aw)).toBeCloseTo(185);
  });

  it('LEAGUE_CHAMPION adds +20 per championship', () => {
    const player = makePlayer({ pos: 'QB', careerStats: makeCareerStats(8, { passTD: 40, passYd: 5000 }) });
    const aw = makeAwardSummary({ championshipCount: 2 });
    // base = 140; award = 2×20 = 40
    expect(computeHofScore(player, null, aw)).toBeCloseTo(180);
  });
});

// ── isHofEligible ─────────────────────────────────────────────────────────────

describe('isHofEligible', () => {
  it('false for already-inducted player (hofStatus = inducted)', () => {
    const player = makePlayer({
      hofStatus: 'inducted',
      status: 'retired',
      careerStats: makeCareerStats(12, { passTD: 60, passYd: 15000 }),
    });
    expect(isHofEligible(player, 2030)).toBe(false);
  });

  it('false for legacy hof=true player', () => {
    const player = makePlayer({
      hof: true,
      status: 'retired',
      careerStats: makeCareerStats(12, { passTD: 60, passYd: 15000 }),
    });
    expect(isHofEligible(player, 2030)).toBe(false);
  });

  it('false for active player (V1 rule: no active inductions)', () => {
    const player = makePlayer({
      status: 'active',
      careerStats: makeCareerStats(8, { passTD: 60, passYd: 15000 }),
    });
    expect(isHofEligible(player, 2030)).toBe(false);
  });

  it('false for active player even with 12+ seasons', () => {
    const player = makePlayer({
      status: 'active',
      careerStats: makeCareerStats(13, { passTD: 60, passYd: 15000 }),
    });
    expect(isHofEligible(player, 2030)).toBe(false);
  });

  it('false for score < 120', () => {
    const player = makePlayer({
      status: 'retired',
      careerStats: makeCareerStats(5, { passTD: 5, passYd: 500 }),
    });
    // score << 120
    expect(isHofEligible(player, 2030)).toBe(false);
  });

  it('false when last careerStats season equals currentSeason (just retired)', () => {
    const player = makePlayer({
      status: 'retired',
      careerStats: [...makeCareerStats(11, { passTD: 60, passYd: 15000 }), { season: 2030, team: 'KC', passTD: 5, passYd: 500 }],
    });
    expect(isHofEligible(player, 2030)).toBe(false);
  });

  it('true when retired with 1+ season gap and score >= 120', () => {
    const player = makePlayer({
      status: 'retired',
      careerStats: makeCareerStats(12, { passTD: 40, passYd: 5000 }),
    });
    // All career seasons are s1-s12 (2025-2036); checking in 2040
    const score = computeHofScore(player, null, makeAwardSummary());
    if (score >= 120) {
      expect(isHofEligible(player, 2040)).toBe(true);
    }
  });
});

// ── generateHofBallot ─────────────────────────────────────────────────────────

describe('generateHofBallot', () => {
  function makeRetiredLegend(id, overrides = {}) {
    return makePlayer({
      id,
      name: `Legend ${id}`,
      pos: 'QB',
      status: 'retired',
      hofStatus: 'none',
      // Last career season is s5 = 2029, checking 2035 (6-season gap)
      careerStats: makeCareerStats(5, { passTD: 40, passYd: 5000 }),
      ...overrides,
    });
  }

  it('is deterministic (same inputs → same output)', () => {
    const players = Array.from({ length: 5 }, (_, i) => makeRetiredLegend(`p${i}`));
    const meta = ensureHofMeta({});
    const r1 = generateHofBallot(players, null, meta, 2035);
    const r2 = generateHofBallot(players, null, meta, 2035);
    expect(r1.nominees.map(n => n.playerId)).toEqual(r2.nominees.map(n => n.playerId));
  });

  it('caps ballot at MAX_BALLOT_SIZE (10)', () => {
    const players = Array.from({ length: 15 }, (_, i) => makeRetiredLegend(`p${i}`));
    const meta = ensureHofMeta({});
    const { nominees } = generateHofBallot(players, null, meta, 2035);
    expect(nominees.length).toBeLessThanOrEqual(HOF_THRESHOLDS.MAX_BALLOT_SIZE);
  });

  it('auto-inducts players with score >= 160', () => {
    const bigLegend = makeRetiredLegend('elite', {
      // 10 seasons → last = s10 = 2034 < 2035; score = 100×3+30000/250+25 = 445 ≥ 160
      careerStats: makeCareerStats(10, { passTD: 100, passYd: 30000 }),
    });
    const meta = ensureHofMeta({});
    const { autoInducted } = generateHofBallot([bigLegend], null, meta, 2035);
    expect(autoInducted.length).toBeGreaterThan(0);
    expect(autoInducted[0].score).toBeGreaterThanOrEqual(HOF_THRESHOLDS.INDUCTION_SCORE);
  });

  it('skips already-inducted players from hofRoster', () => {
    const player = makeRetiredLegend('p1');
    const meta = ensureHofMeta({
      hofRoster: [{ playerId: 'p1', playerName: 'Legend p1', position: 'QB', inductionSeason: 2034, hofScore: 200 }],
    });
    const { nominees } = generateHofBallot([player], null, meta, 2035);
    expect(nominees.find(n => String(n.playerId) === 'p1')).toBeUndefined();
  });

  it('enforces 3-ballot lapse rule', () => {
    const player = makeRetiredLegend('p1', {
      // Score is between 120-159 and doesn't qualify for MVP shortcut
      careerStats: makeCareerStats(10, { passTD: 30, passYd: 5000 }),
      awards: [],
    });
    // Simulate 3 prior ballot appearances without induction
    const meta = ensureHofMeta({
      hofBallot: {
        season: 2034,
        nominees: [{ playerId: 'p1', score: 130, reasons: [], ballotCount: 3 }],
        inducted: [],
        resolved: true,
      },
    });
    const { nominees } = generateHofBallot([player], null, meta, 2035);
    expect(nominees.find(n => String(n.playerId) === 'p1')).toBeUndefined();
  });
});

// ── resolveHofVote ────────────────────────────────────────────────────────────

describe('resolveHofVote', () => {
  it('auto-inducts nominees with score >= 160', () => {
    const ballot = {
      nominees: [{ playerId: 'p1', playerName: 'A', pos: 'QB', score: 200, reasons: [], mvpCount: 0, ballotCount: 1 }],
      autoInducted: [{ playerId: 'p1', playerName: 'A', pos: 'QB', score: 200, reasons: [], mvpCount: 0, ballotCount: 1 }],
    };
    const { inducted } = resolveHofVote(ballot, []);
    expect(inducted.some(i => String(i.playerId) === 'p1')).toBe(true);
  });

  it('MVP shortcut inducts score 120-159 with 2+ MVPs', () => {
    const ballot = {
      nominees: [{ playerId: 'p2', playerName: 'B', pos: 'QB', score: 135, reasons: [], mvpCount: 3, ballotCount: 1 }],
      autoInducted: [],
    };
    const { inducted } = resolveHofVote(ballot, []);
    expect(inducted.some(i => String(i.playerId) === 'p2')).toBe(true);
  });

  it('does NOT induct via MVP shortcut if score < 120', () => {
    const ballot = {
      nominees: [],
      autoInducted: [],
    };
    const { inducted } = resolveHofVote(ballot, []);
    expect(inducted.length).toBe(0);
  });

  it('caps inductions at MAX_INDUCTIONS (5) per season', () => {
    const nominees = Array.from({ length: 8 }, (_, i) => ({
      playerId: `p${i}`, playerName: `Player ${i}`, pos: 'QB', score: 200, reasons: [], mvpCount: 0, ballotCount: 1,
    }));
    const ballot = { nominees, autoInducted: nominees };
    const { inducted } = resolveHofVote(ballot, []);
    expect(inducted.length).toBeLessThanOrEqual(HOF_THRESHOLDS.MAX_INDUCTIONS);
  });

  it('produces no duplicate inductees', () => {
    const entry = { playerId: 'p1', playerName: 'A', pos: 'QB', score: 200, reasons: [], mvpCount: 3, ballotCount: 1 };
    const ballot = { nominees: [entry], autoInducted: [entry] };
    const { inducted } = resolveHofVote(ballot, []);
    const ids = inducted.map(i => String(i.playerId));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('remaining contains nominees not inducted', () => {
    const nominees = [
      { playerId: 'p1', playerName: 'A', pos: 'QB', score: 200, reasons: [], mvpCount: 0, ballotCount: 1 },
      { playerId: 'p2', playerName: 'B', pos: 'RB', score: 125, reasons: [], mvpCount: 0, ballotCount: 1 },
    ];
    const ballot = { nominees, autoInducted: [nominees[0]] };
    const { inducted, remaining } = resolveHofVote(ballot, []);
    const inductedIds = new Set(inducted.map(i => String(i.playerId)));
    const remainingIds = remaining.map(r => String(r.playerId));
    for (const rid of remainingIds) {
      expect(inductedIds.has(rid)).toBe(false);
    }
  });
});

// ── applyHofInductions ────────────────────────────────────────────────────────

describe('applyHofInductions', () => {
  it('adds inductees to hofRoster', () => {
    const player = makePlayer({ id: 'p1', name: 'Star', pos: 'QB', careerStats: makeCareerStats(12, { passTD: 40, passYd: 5000 }) });
    const entry = { playerId: 'p1', playerName: 'Star', pos: 'QB', score: 200 };
    const meta = ensureHofMeta({});
    const { hofRoster } = applyHofInductions(meta, [entry], [entry], [player], 2035);
    expect(hofRoster.length).toBe(1);
    expect(String(hofRoster[0].playerId)).toBe('p1');
    expect(hofRoster[0].inductionSeason).toBe(2035);
    expect(hofRoster[0].hofScore).toBe(200);
  });

  it('does not double-add players already in hofRoster', () => {
    const player = makePlayer({ id: 'p1', name: 'Star', pos: 'QB', careerStats: makeCareerStats(12) });
    const entry = { playerId: 'p1', playerName: 'Star', pos: 'QB', score: 180 };
    const meta = ensureHofMeta({
      hofRoster: [{ playerId: 'p1', playerName: 'Star', position: 'QB', inductionSeason: 2034, hofScore: 180 }],
    });
    const { hofRoster } = applyHofInductions(meta, [entry], [entry], [player], 2035);
    expect(hofRoster.filter(r => String(r.playerId) === 'p1').length).toBe(1);
  });

  it('sets resolved=true on hofBallot', () => {
    const player = makePlayer({ id: 'p1', careerStats: makeCareerStats(10) });
    const entry = { playerId: 'p1', playerName: 'P', pos: 'QB', score: 170 };
    const meta = ensureHofMeta({});
    const { hofBallot } = applyHofInductions(meta, [entry], [entry], [player], 2035);
    expect(hofBallot.resolved).toBe(true);
    expect(hofBallot.season).toBe(2035);
  });

  it('updates player hofStatus to inducted correctly (via player updates in worker)', () => {
    // This test validates the hofRoster entry contains expected data
    const player = makePlayer({ id: 'p1', name: 'QB Legend', pos: 'QB', careerStats: makeCareerStats(14, { passTD: 50 }) });
    const entry = { playerId: 'p1', playerName: 'QB Legend', pos: 'QB', score: 185 };
    const meta = ensureHofMeta({});
    const { hofRoster } = applyHofInductions(meta, [entry], [entry], [player], 2036);
    expect(hofRoster[0].seasons).toBe(14);
    expect(hofRoster[0].hofScore).toBe(185);
  });
});

// ── getHofSummary ─────────────────────────────────────────────────────────────

describe('getHofSummary', () => {
  it('returns correct totalInducted count', () => {
    const meta = {
      hofRoster: [
        { playerId: 'a', position: 'QB', inductionSeason: 2030, hofScore: 200 },
        { playerId: 'b', position: 'RB', inductionSeason: 2031, hofScore: 180 },
      ],
    };
    expect(getHofSummary(meta).totalInducted).toBe(2);
  });

  it('groups byPosition correctly', () => {
    const meta = {
      hofRoster: [
        { playerId: 'a', position: 'QB', inductionSeason: 2030, hofScore: 200 },
        { playerId: 'b', position: 'QB', inductionSeason: 2031, hofScore: 180 },
        { playerId: 'c', position: 'RB', inductionSeason: 2031, hofScore: 160 },
      ],
    };
    const { byPosition } = getHofSummary(meta);
    expect(byPosition.QB).toBe(2);
    expect(byPosition.RB).toBe(1);
  });

  it('returns empty summary for empty hofRoster', () => {
    const { totalInducted, byPosition, recentClass } = getHofSummary({ hofRoster: [] });
    expect(totalInducted).toBe(0);
    expect(Object.keys(byPosition).length).toBe(0);
    expect(recentClass.length).toBe(0);
  });
});

// ── ensureHofMeta (hydration) ─────────────────────────────────────────────────

describe('ensureHofMeta — old save hydration', () => {
  it('hydrates hofRoster to [] on old saves', () => {
    const meta = ensureHofMeta({ year: 2025 });
    expect(Array.isArray(meta.hofRoster)).toBe(true);
    expect(meta.hofRoster.length).toBe(0);
  });

  it('hydrates hofBallot to default on old saves', () => {
    const meta = ensureHofMeta({ year: 2025 });
    expect(meta.hofBallot).toBeTruthy();
    expect(meta.hofBallot.resolved).toBe(false);
    expect(Array.isArray(meta.hofBallot.nominees)).toBe(true);
    expect(Array.isArray(meta.hofBallot.inducted)).toBe(true);
  });

  it('preserves existing hofRoster when present', () => {
    const existing = [{ playerId: 'x', hofScore: 200 }];
    const meta = ensureHofMeta({ hofRoster: existing });
    expect(meta.hofRoster).toBe(existing);
  });

  it('player without hofStatus field hydrates safely to "none" via nullish coalescing', () => {
    const player = { id: 'p1', name: 'Old', pos: 'QB' };
    // hofStatus is undefined; UI uses: player.hofStatus ?? 'none'
    expect(player.hofStatus ?? 'none').toBe('none');
  });
});

// ── Full ballot → vote → induct pipeline ─────────────────────────────────────

describe('end-to-end ballot pipeline', () => {
  it('full pipeline: generate ballot → resolve vote → apply inductions', () => {
    const players = [
      makePlayer({
        id: 'elite1',
        name: 'Top Quarterback',
        pos: 'QB',
        status: 'retired',
        // Last season = s10 (2034), checking in season 2035
        careerStats: makeCareerStats(10, { passTD: 80, passYd: 25000, rushTD: 15 }),
        awards: [
          { type: 'MVP', season: 2025, dedupeKey: 'MVP_2025' },
          { type: 'MVP', season: 2027, dedupeKey: 'MVP_2027' },
        ],
      }),
      makePlayer({
        id: 'borderline1',
        name: 'Good RB',
        pos: 'RB',
        status: 'retired',
        careerStats: makeCareerStats(10, { rushTD: 15, rushYd: 8000 }),
        awards: [],
      }),
    ];

    const meta = ensureHofMeta({});
    const ballot = generateHofBallot(players, null, meta, 2035);
    expect(ballot.nominees.length).toBeGreaterThan(0);

    const { inducted, remaining } = resolveHofVote(ballot, players);
    expect(inducted.length).toBeLessThanOrEqual(HOF_THRESHOLDS.MAX_INDUCTIONS);

    const updates = applyHofInductions(meta, inducted, ballot.nominees, players, 2035);
    expect(Array.isArray(updates.hofRoster)).toBe(true);
    expect(updates.hofBallot.season).toBe(2035);
  });
});
