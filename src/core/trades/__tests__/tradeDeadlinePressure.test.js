import { describe, expect, it } from 'vitest';
import {
  DEADLINE_POSTURE,
  DEADLINE_PHASE,
  classifyDeadlinePosture,
  getTradeDeadlinePressure,
  applyDeadlinePressureModifiers,
  buildDeadlinePulseItem,
  buildDeadlineMemoryEvent,
} from '../tradeDeadlinePressure.js';

// ─── 1. Team posture classification ─────────────────────────────────────────

describe('classifyDeadlinePosture', () => {
  it('returns MIDDLE when sample is too small', () => {
    const posture = classifyDeadlinePosture({ wins: 2, losses: 1, ties: 0 }, {});
    expect(posture).toBe(DEADLINE_POSTURE.MIDDLE);
  });

  it('classifies a strong-record team as contender', () => {
    const posture = classifyDeadlinePosture({ wins: 8, losses: 2, ties: 0 }, {});
    expect(posture).toBe(DEADLINE_POSTURE.CONTENDER);
  });

  it('classifies a bubble team (above .500 but not dominant) as playoff_hunt', () => {
    const posture = classifyDeadlinePosture({ wins: 5, losses: 4, ties: 0 }, {});
    expect(posture).toBe(DEADLINE_POSTURE.PLAYOFF_HUNT);
  });

  it('classifies a mediocre (near-.500) team as middle', () => {
    // 4-5: winPct = 0.444, not below 0.38, not above 0.45 → MIDDLE
    const posture = classifyDeadlinePosture({ wins: 4, losses: 5, ties: 0 }, {});
    expect(posture).toBe(DEADLINE_POSTURE.MIDDLE);
  });

  it('classifies a poor-record young-roster team as rebuild', () => {
    const roster = Array.from({ length: 40 }, () => ({ age: 23 }));
    const posture = classifyDeadlinePosture({ wins: 2, losses: 8, ties: 0, roster }, {});
    expect(posture).toBe(DEADLINE_POSTURE.REBUILD);
  });

  it('classifies a poor-record older-roster team as seller', () => {
    const roster = Array.from({ length: 40 }, () => ({ age: 30 }));
    const posture = classifyDeadlinePosture({ wins: 2, losses: 8, ties: 0, roster }, {});
    expect(posture).toBe(DEADLINE_POSTURE.SELLER);
  });

  it('uses gamesPlayed field when wins/losses are absent', () => {
    // 0.625 win pct with gamesPlayed provided
    const posture = classifyDeadlinePosture({ record: { wins: 10, losses: 6, ties: 0, gamesPlayed: 16 } }, {});
    expect(posture).toBe(DEADLINE_POSTURE.CONTENDER);
  });

  it('is deterministic: same inputs produce same result', () => {
    const team = { wins: 6, losses: 4, ties: 0, roster: [{ age: 26 }] };
    expect(classifyDeadlinePosture(team, {})).toBe(classifyDeadlinePosture(team, {}));
  });
});

// ─── 2. Pressure timing ──────────────────────────────────────────────────────

describe('getTradeDeadlinePressure', () => {
  const DEFAULT_DEADLINE = 9;

  it('is inactive early in the season (week 1, deadline 9)', () => {
    const result = getTradeDeadlinePressure({
      currentWeek: 1, deadlineWeek: DEFAULT_DEADLINE,
      teamPosture: DEADLINE_POSTURE.CONTENDER,
    });
    expect(result.active).toBe(false);
    expect(result.phase).toBe(DEADLINE_PHASE.NONE);
    expect(result.urgency).toBe(0);
    expect(result.buyerAggression).toBe(0);
  });

  it('is active in the approaching window (3 weeks before deadline)', () => {
    const result = getTradeDeadlinePressure({
      currentWeek: 6, deadlineWeek: DEFAULT_DEADLINE,
      teamPosture: DEADLINE_POSTURE.CONTENDER,
    });
    expect(result.active).toBe(true);
    expect(result.phase).toBe(DEADLINE_PHASE.APPROACHING);
    expect(result.urgency).toBeGreaterThan(0);
    expect(result.urgency).toBeLessThan(1);
  });

  it('reaches maximum urgency on deadline week', () => {
    const result = getTradeDeadlinePressure({
      currentWeek: DEFAULT_DEADLINE, deadlineWeek: DEFAULT_DEADLINE,
      teamPosture: DEADLINE_POSTURE.CONTENDER,
    });
    expect(result.active).toBe(true);
    expect(result.phase).toBe(DEADLINE_PHASE.DEADLINE_WEEK);
    expect(result.urgency).toBe(1.0);
  });

  it('is closed after the deadline', () => {
    const result = getTradeDeadlinePressure({
      currentWeek: 12, deadlineWeek: DEFAULT_DEADLINE,
      teamPosture: DEADLINE_POSTURE.CONTENDER,
    });
    expect(result.active).toBe(false);
    expect(result.phase).toBe(DEADLINE_PHASE.CLOSED);
    expect(result.urgency).toBe(0);
  });

  it('urgency increases as deadline approaches', () => {
    const at3 = getTradeDeadlinePressure({
      currentWeek: 6, deadlineWeek: DEFAULT_DEADLINE,
      teamPosture: DEADLINE_POSTURE.CONTENDER,
    });
    const at1 = getTradeDeadlinePressure({
      currentWeek: 8, deadlineWeek: DEFAULT_DEADLINE,
      teamPosture: DEADLINE_POSTURE.CONTENDER,
    });
    expect(at1.urgency).toBeGreaterThan(at3.urgency);
  });

  it('buyers have buyerAggression > 0, sellerAggression = 0 during deadline', () => {
    const result = getTradeDeadlinePressure({
      currentWeek: DEFAULT_DEADLINE, deadlineWeek: DEFAULT_DEADLINE,
      teamPosture: DEADLINE_POSTURE.CONTENDER,
    });
    expect(result.buyerAggression).toBeGreaterThan(0);
    expect(result.sellerAggression).toBe(0);
  });

  it('sellers have sellerAggression > 0, buyerAggression = 0 during deadline', () => {
    const result = getTradeDeadlinePressure({
      currentWeek: DEFAULT_DEADLINE, deadlineWeek: DEFAULT_DEADLINE,
      teamPosture: DEADLINE_POSTURE.SELLER,
    });
    expect(result.sellerAggression).toBeGreaterThan(0);
    expect(result.buyerAggression).toBe(0);
  });

  it('middle team has zero buyer and seller aggression', () => {
    const result = getTradeDeadlinePressure({
      currentWeek: DEFAULT_DEADLINE, deadlineWeek: DEFAULT_DEADLINE,
      teamPosture: DEADLINE_POSTURE.MIDDLE,
    });
    expect(result.buyerAggression).toBe(0);
    expect(result.sellerAggression).toBe(0);
  });

  it('is deterministic: same inputs produce same result', () => {
    const params = { currentWeek: 8, deadlineWeek: 9, teamPosture: DEADLINE_POSTURE.PLAYOFF_HUNT };
    const a = getTradeDeadlinePressure(params);
    const b = getTradeDeadlinePressure(params);
    expect(a).toEqual(b);
  });

  it('explanation string is non-empty when active', () => {
    const result = getTradeDeadlinePressure({
      currentWeek: DEFAULT_DEADLINE, deadlineWeek: DEFAULT_DEADLINE,
      teamPosture: DEADLINE_POSTURE.CONTENDER,
    });
    expect(typeof result.explanation).toBe('string');
    expect(result.explanation.length).toBeGreaterThan(0);
  });
});

// ─── 3. Trade valuation behavior ─────────────────────────────────────────────

describe('applyDeadlinePressureModifiers', () => {
  const activePressure = getTradeDeadlinePressure({
    currentWeek: 9, deadlineWeek: 9, teamPosture: DEADLINE_POSTURE.CONTENDER,
  });
  const inactivePressure = getTradeDeadlinePressure({
    currentWeek: 1, deadlineWeek: 9, teamPosture: DEADLINE_POSTURE.CONTENDER,
  });
  const sellerPressure = getTradeDeadlinePressure({
    currentWeek: 9, deadlineWeek: 9, teamPosture: DEADLINE_POSTURE.SELLER,
  });

  it('returns baseValue unchanged when pressure is inactive', () => {
    const player = { assetType: 'player', age: 28, ovr: 82 };
    expect(applyDeadlinePressureModifiers(player, 200, DEADLINE_POSTURE.CONTENDER, inactivePressure)).toBe(200);
  });

  it('contender values a prime player higher during deadline week', () => {
    const player = { assetType: 'player', age: 28, ovr: 82 };
    const base = applyDeadlinePressureModifiers(player, 200, DEADLINE_POSTURE.CONTENDER, inactivePressure);
    const boosted = applyDeadlinePressureModifiers(player, 200, DEADLINE_POSTURE.CONTENDER, activePressure);
    expect(boosted).toBeGreaterThan(base);
  });

  it('contender boost is capped (max 25% over base)', () => {
    const player = { assetType: 'player', age: 25, ovr: 90 };
    const boosted = applyDeadlinePressureModifiers(player, 200, DEADLINE_POSTURE.CONTENDER, activePressure);
    expect(boosted).toBeLessThanOrEqual(Math.round(200 * 1.25) + 1);
  });

  it('seller values picks more during deadline week', () => {
    const pick = { assetType: 'pick', round: 1 };
    const base = applyDeadlinePressureModifiers(pick, 200, DEADLINE_POSTURE.SELLER, inactivePressure);
    const boosted = applyDeadlinePressureModifiers(pick, 200, DEADLINE_POSTURE.SELLER, sellerPressure);
    expect(boosted).toBeGreaterThan(base);
  });

  it('seller values young high-upside players more during deadline week', () => {
    const youngPlayer = { assetType: 'player', age: 22, ovr: 72, potential: 85 };
    const sellerInactive = getTradeDeadlinePressure({ currentWeek: 1, deadlineWeek: 9, teamPosture: DEADLINE_POSTURE.SELLER });
    const base = applyDeadlinePressureModifiers(youngPlayer, 150, DEADLINE_POSTURE.SELLER, sellerInactive);
    const boosted = applyDeadlinePressureModifiers(youngPlayer, 150, DEADLINE_POSTURE.SELLER, sellerPressure);
    expect(boosted).toBeGreaterThan(base);
  });

  it('seller discounts aging veterans during deadline week', () => {
    const agingVet = { assetType: 'player', age: 34, ovr: 80 };
    const base = applyDeadlinePressureModifiers(agingVet, 200, DEADLINE_POSTURE.SELLER, inactivePressure);
    const discounted = applyDeadlinePressureModifiers(agingVet, 200, DEADLINE_POSTURE.SELLER, sellerPressure);
    expect(discounted).toBeLessThan(base);
  });

  it('middle team receives no adjustment during deadline week', () => {
    const middlePressure = getTradeDeadlinePressure({
      currentWeek: 9, deadlineWeek: 9, teamPosture: DEADLINE_POSTURE.MIDDLE,
    });
    const player = { assetType: 'player', age: 28, ovr: 82 };
    const result = applyDeadlinePressureModifiers(player, 200, DEADLINE_POSTURE.MIDDLE, middlePressure);
    expect(result).toBe(200);
  });

  it('contender does not boost low-OVR players during deadline', () => {
    const scrub = { assetType: 'player', age: 25, ovr: 65 };
    const result = applyDeadlinePressureModifiers(scrub, 100, DEADLINE_POSTURE.CONTENDER, activePressure);
    expect(result).toBe(100);
  });

  it('multiplier never drops below 0.85 of base (floor guard)', () => {
    const agingVet = { assetType: 'player', age: 36, ovr: 75 };
    const result = applyDeadlinePressureModifiers(agingVet, 200, DEADLINE_POSTURE.SELLER, sellerPressure);
    expect(result).toBeGreaterThanOrEqual(Math.round(200 * 0.85));
  });

  it('is deterministic: same inputs produce same result', () => {
    const player = { assetType: 'player', age: 27, ovr: 80 };
    const a = applyDeadlinePressureModifiers(player, 200, DEADLINE_POSTURE.CONTENDER, activePressure);
    const b = applyDeadlinePressureModifiers(player, 200, DEADLINE_POSTURE.CONTENDER, activePressure);
    expect(a).toBe(b);
  });
});

// ─── 4. League Pulse / UI transparency ───────────────────────────────────────

describe('buildDeadlinePulseItem', () => {
  it('returns null when deadline is not approaching', () => {
    const result = buildDeadlinePulseItem({
      season: 2027, week: 3, phase: DEADLINE_PHASE.NONE,
      weeksToDeadline: 6, deadlineWeek: 9, userTeamId: '1',
    });
    expect(result).toBeNull();
  });

  it('returns null when deadline is closed', () => {
    const result = buildDeadlinePulseItem({
      season: 2027, week: 12, phase: DEADLINE_PHASE.CLOSED,
      weeksToDeadline: -3, deadlineWeek: 9, userTeamId: '1',
    });
    expect(result).toBeNull();
  });

  it('returns an item during the approaching phase', () => {
    const item = buildDeadlinePulseItem({
      season: 2027, week: 7, phase: DEADLINE_PHASE.APPROACHING,
      weeksToDeadline: 2, deadlineWeek: 9, userTeamId: '1',
    });
    expect(item).not.toBeNull();
    expect(item.type).toBe('transaction');
    expect(item.headline).toContain('2 Week');
    expect(item.source).toBe('tradeDeadline');
  });

  it('returns an item on deadline week with higher importance', () => {
    const item = buildDeadlinePulseItem({
      season: 2027, week: 9, phase: DEADLINE_PHASE.DEADLINE_WEEK,
      weeksToDeadline: 0, deadlineWeek: 9, userTeamId: '1',
    });
    expect(item).not.toBeNull();
    expect(item.headline).toContain('Deadline');
    expect(item.importance).toBe(100);
  });

  it('deadline week item mentions urgency for buyer', () => {
    const item = buildDeadlinePulseItem({
      season: 2027, week: 9, phase: DEADLINE_PHASE.DEADLINE_WEEK,
      weeksToDeadline: 0, deadlineWeek: 9, userTeamId: '1',
      userPosture: DEADLINE_POSTURE.CONTENDER,
    });
    expect(item.body.toLowerCase()).toContain('last chance');
  });

  it('deadline week item mentions selling for seller posture', () => {
    const item = buildDeadlinePulseItem({
      season: 2027, week: 9, phase: DEADLINE_PHASE.DEADLINE_WEEK,
      weeksToDeadline: 0, deadlineWeek: 9, userTeamId: '1',
      userPosture: DEADLINE_POSTURE.SELLER,
    });
    expect(item.body.toLowerCase()).toMatch(/veteran|pick/);
  });

  it('dedupeKey is deterministic', () => {
    const params = {
      season: 2027, week: 7, phase: DEADLINE_PHASE.APPROACHING,
      weeksToDeadline: 2, deadlineWeek: 9, userTeamId: '5',
    };
    const a = buildDeadlinePulseItem(params);
    const b = buildDeadlinePulseItem(params);
    expect(a?.dedupeKey).toBe(b?.dedupeKey);
  });

  it('dedupeKey differs for different weeks (no spam across refreshes)', () => {
    const base = { season: 2027, phase: DEADLINE_PHASE.APPROACHING, deadlineWeek: 9, userTeamId: '5' };
    const wk7 = buildDeadlinePulseItem({ ...base, week: 7, weeksToDeadline: 2 });
    const wk8 = buildDeadlinePulseItem({ ...base, week: 8, weeksToDeadline: 1 });
    expect(wk7?.dedupeKey).not.toBe(wk8?.dedupeKey);
  });
});

// ─── 5. Fairness / cap guard regression ──────────────────────────────────────
//
// These tests prove that even at maximum deadline-week pressure the modifier
// cannot close a large enough value gap to make an unfair trade pass the
// ±10% VALUE_TOLERANCE check used in runAIToAITrades.

describe('deadline pressure cannot bypass fairness guard', () => {
  const VALUE_TOLERANCE = 0.10;

  function wouldPassFairnessCheck(valueA, valueB) {
    const ratio = valueA / valueB;
    return ratio >= (1 - VALUE_TOLERANCE) && ratio <= (1 + VALUE_TOLERANCE);
  }

  it('3:1 lopsided trade stays unfair even with max buyer boost', () => {
    const deadline = getTradeDeadlinePressure({
      currentWeek: 9, deadlineWeek: 9, teamPosture: DEADLINE_POSTURE.CONTENDER,
    });
    const elitePlayer = { assetType: 'player', age: 27, ovr: 88 };
    const scrubPlayer = { assetType: 'player', age: 27, ovr: 72 };

    // Team A (contender) receiving elite player worth 300 — deadline boosts their valuation.
    const teamAContextual = applyDeadlinePressureModifiers(elitePlayer, 300, DEADLINE_POSTURE.CONTENDER, deadline);
    // Team B receiving a scrub worth 100 — even with max boost it stays near 100.
    const teamBContextual = applyDeadlinePressureModifiers(scrubPlayer, 100, DEADLINE_POSTURE.MIDDLE, { active: false });

    // Even at max 1.25x, teamAContextual = 300 * 1.25 = 375 ≠ close to teamBContextual ≈ 100.
    expect(wouldPassFairnessCheck(teamAContextual, teamBContextual)).toBe(false);
  });

  it('seller discount on vet cannot make them overpay to acquire', () => {
    const deadline = getTradeDeadlinePressure({
      currentWeek: 9, deadlineWeek: 9, teamPosture: DEADLINE_POSTURE.SELLER,
    });
    const pick = { assetType: 'pick', round: 1 };
    const agingVet = { assetType: 'player', age: 34, ovr: 80 };

    // Seller's inflated valuation of the pick they are receiving.
    const pickContextual = applyDeadlinePressureModifiers(pick, 175, DEADLINE_POSTURE.SELLER, deadline);
    // They discount the aging vet they'd have to give up.
    const vetContextual = applyDeadlinePressureModifiers(agingVet, 175, DEADLINE_POSTURE.SELLER, deadline);

    // Discount on the vet should be bounded (floor 0.85x); the values must remain
    // within at most 25% of each other for a trade to happen. A heavily discounted
    // vet against a highly valued pick could still open a gap — confirm the
    // modifier values stay within the floor/ceiling contract.
    expect(pickContextual).toBeLessThanOrEqual(Math.round(175 * 1.25) + 1);
    expect(vetContextual).toBeGreaterThanOrEqual(Math.round(175 * 0.85));
  });

  it('maximum buyer boost is capped and cannot exceed 1.25x base', () => {
    const deadline = getTradeDeadlinePressure({
      currentWeek: 9, deadlineWeek: 9, teamPosture: DEADLINE_POSTURE.CONTENDER,
    });
    const player = { assetType: 'player', age: 25, ovr: 92 };
    const boosted = applyDeadlinePressureModifiers(player, 400, DEADLINE_POSTURE.CONTENDER, deadline);
    expect(boosted).toBeLessThanOrEqual(Math.round(400 * 1.25) + 1);
    // Confirm it did actually boost (verifies the cap is active, not that boosts are missing).
    expect(boosted).toBeGreaterThan(400);
  });

  it('floor guard prevents seller discount from driving value below 0.85x', () => {
    const deadline = getTradeDeadlinePressure({
      currentWeek: 9, deadlineWeek: 9, teamPosture: DEADLINE_POSTURE.SELLER,
    });
    const veryOldVet = { assetType: 'player', age: 38, ovr: 78 };
    const discounted = applyDeadlinePressureModifiers(veryOldVet, 200, DEADLINE_POSTURE.SELLER, deadline);
    expect(discounted).toBeGreaterThanOrEqual(Math.round(200 * 0.85));
  });

  it('a moderately unequal trade (2:1 gap) still fails the fairness ratio', () => {
    const deadline = getTradeDeadlinePressure({
      currentWeek: 9, deadlineWeek: 9, teamPosture: DEADLINE_POSTURE.CONTENDER,
    });
    const goodPlayer  = { assetType: 'player', age: 28, ovr: 84 };
    const weakPlayer  = { assetType: 'player', age: 28, ovr: 74 };

    const teamAContextual = applyDeadlinePressureModifiers(goodPlayer, 240, DEADLINE_POSTURE.CONTENDER, deadline);
    const teamBContextual = applyDeadlinePressureModifiers(weakPlayer, 120, DEADLINE_POSTURE.MIDDLE, { active: false });

    // Even 1.25x on teamAContextual: 240*1.25=300, teamBContextual=120 → ratio 2.5 → fails ±10%.
    expect(wouldPassFairnessCheck(teamAContextual, teamBContextual)).toBe(false);
  });
});

// ─── 7. League Memory event ───────────────────────────────────────────────────

describe('buildDeadlineMemoryEvent', () => {
  it('produces the expected event shape', () => {
    const pressure = getTradeDeadlinePressure({
      currentWeek: 9, deadlineWeek: 9, teamPosture: DEADLINE_POSTURE.SELLER,
    });
    const event = buildDeadlineMemoryEvent({ teamId: 7, posture: DEADLINE_POSTURE.SELLER, week: 9, pressure });
    expect(event.type).toBe('TRADE_DEADLINE_PRESSURE');
    expect(event.teamId).toBe('7');
    expect(event.posture).toBe(DEADLINE_POSTURE.SELLER);
    expect(event.urgency).toBe(1.0);
    expect(event.phase).toBe(DEADLINE_PHASE.DEADLINE_WEEK);
  });
});
