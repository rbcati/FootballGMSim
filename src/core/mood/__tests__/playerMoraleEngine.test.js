import { describe, it, expect } from 'vitest';
import {
  MORALE_EVENTS,
  MORALE_DELTAS,
  MORALE_LABELS,
  MORALE_DEFAULT,
  MORALE_MIN,
  MORALE_MAX,
  MORALE_EVENTS_CAP,
  MORALE_LOW_THRESHOLD,
  MORALE_ALERT_THRESHOLD,
  DEADLINE_FRUSTRATION_SEASON_CAP,
  applyMoraleEvent,
  getPlayerMoraleSummary,
  applyWeeklyMoraleEffects,
} from '../playerMoraleEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return {
    id: 42,
    name: 'Test Player',
    age: 27,
    ovr: 78,
    morale: 70,
    teamId: 1,
    traits: [],
    ...overrides,
  };
}

function makeEvent(overrides = {}) {
  return {
    type:  MORALE_EVENTS.TRADED_TO_CONTENDER,
    delta: MORALE_DELTAS[MORALE_EVENTS.TRADED_TO_CONTENDER],
    season: 1,
    week:   3,
    reason: 'Traded to a contender',
    source: 'trade',
    dedupeKey: 'TRADED_TO_CONTENDER-42-1-3-2',
    ...overrides,
  };
}

// ── MORALE_DELTAS sanity ───────────────────────────────────────────────────────

describe('MORALE_DELTAS', () => {
  it('defines correct delta for each event type', () => {
    expect(MORALE_DELTAS[MORALE_EVENTS.TRADED_TO_CONTENDER]).toBe(10);
    expect(MORALE_DELTAS[MORALE_EVENTS.TRADED_TO_REBUILDER]).toBe(-6);
    expect(MORALE_DELTAS[MORALE_EVENTS.CONTRACT_EXTENDED]).toBe(10);
    expect(MORALE_DELTAS[MORALE_EVENTS.TRADE_REQUEST_DENIED]).toBe(-12);
    expect(MORALE_DELTAS[MORALE_EVENTS.STARTER_ROLE_LOST]).toBe(-8);
    expect(MORALE_DELTAS[MORALE_EVENTS.VETERAN_LEADER_BONUS]).toBe(3);
    expect(MORALE_DELTAS[MORALE_EVENTS.DEADLINE_SELL_FRUSTRATION]).toBe(-3);
  });

  it('TRADED_TO_CONTENDER raises morale', () => {
    expect(MORALE_DELTAS[MORALE_EVENTS.TRADED_TO_CONTENDER]).toBeGreaterThan(0);
  });

  it('TRADED_TO_REBUILDER lowers morale', () => {
    expect(MORALE_DELTAS[MORALE_EVENTS.TRADED_TO_REBUILDER]).toBeLessThan(0);
  });

  it('CONTRACT_EXTENDED raises morale', () => {
    expect(MORALE_DELTAS[MORALE_EVENTS.CONTRACT_EXTENDED]).toBeGreaterThan(0);
  });

  it('DEADLINE_SELL_FRUSTRATION lowers morale', () => {
    expect(MORALE_DELTAS[MORALE_EVENTS.DEADLINE_SELL_FRUSTRATION]).toBeLessThan(0);
  });
});

// ── applyMoraleEvent ──────────────────────────────────────────────────────────

describe('applyMoraleEvent', () => {
  it('returns same reference when player or event is null', () => {
    const p = makePlayer();
    expect(applyMoraleEvent(null, makeEvent())).toBeNull();
    expect(applyMoraleEvent(p, null)).toBe(p);
    expect(applyMoraleEvent(p, {})).toBe(p);
  });

  it('applies TRADED_TO_CONTENDER: raises morale by correct delta', () => {
    const p = makePlayer({ morale: 70 });
    const updated = applyMoraleEvent(p, makeEvent({
      type: MORALE_EVENTS.TRADED_TO_CONTENDER,
      delta: MORALE_DELTAS[MORALE_EVENTS.TRADED_TO_CONTENDER],
      dedupeKey: 'TC-42-1-3-2',
    }), { season: 1, week: 3 });
    expect(updated.morale).toBe(70 + 10);
    expect(updated).not.toBe(p);
  });

  it('applies TRADED_TO_REBUILDER: lowers morale by correct delta', () => {
    const p = makePlayer({ morale: 70 });
    const updated = applyMoraleEvent(p, makeEvent({
      type: MORALE_EVENTS.TRADED_TO_REBUILDER,
      delta: MORALE_DELTAS[MORALE_EVENTS.TRADED_TO_REBUILDER],
      dedupeKey: 'TR-42-1-3-2',
    }), { season: 1, week: 3 });
    expect(updated.morale).toBe(70 - 6);
  });

  it('applies CONTRACT_EXTENDED: raises morale', () => {
    const p = makePlayer({ morale: 70 });
    const updated = applyMoraleEvent(p, makeEvent({
      type: MORALE_EVENTS.CONTRACT_EXTENDED,
      delta: MORALE_DELTAS[MORALE_EVENTS.CONTRACT_EXTENDED],
      dedupeKey: 'CE-42-1-0',
    }), {});
    expect(updated.morale).toBe(80);
  });

  it('applies TRADE_REQUEST_DENIED: lowers morale significantly', () => {
    const p = makePlayer({ morale: 70 });
    const updated = applyMoraleEvent(p, makeEvent({
      type: MORALE_EVENTS.TRADE_REQUEST_DENIED,
      delta: MORALE_DELTAS[MORALE_EVENTS.TRADE_REQUEST_DENIED],
      dedupeKey: 'TRD-42-1-3',
    }), { season: 1, week: 3 });
    expect(updated.morale).toBe(70 - 12);
  });

  it('applies VETERAN_LEADER_BONUS: raises morale by 3', () => {
    const p = makePlayer({ morale: 70 });
    const updated = applyMoraleEvent(p, makeEvent({
      type: MORALE_EVENTS.VETERAN_LEADER_BONUS,
      delta: MORALE_DELTAS[MORALE_EVENTS.VETERAN_LEADER_BONUS],
      dedupeKey: 'VLB-42-1-3',
    }), {});
    expect(updated.morale).toBe(73);
  });

  it('clamps morale to [0, 100] — upper bound', () => {
    const p = makePlayer({ morale: 95 });
    const updated = applyMoraleEvent(p, makeEvent({
      type: MORALE_EVENTS.TRADED_TO_CONTENDER,
      delta: 10,
      dedupeKey: 'clamped-hi-1',
    }), {});
    expect(updated.morale).toBe(MORALE_MAX);
    expect(updated.morale).toBeLessThanOrEqual(100);
  });

  it('clamps morale to [0, 100] — lower bound', () => {
    const p = makePlayer({ morale: 5 });
    const updated = applyMoraleEvent(p, makeEvent({
      type: MORALE_EVENTS.TRADE_REQUEST_DENIED,
      delta: -12,
      dedupeKey: 'clamped-lo-1',
    }), {});
    expect(updated.morale).toBe(MORALE_MIN);
    expect(updated.morale).toBeGreaterThanOrEqual(0);
  });

  it('defaults morale to MORALE_DEFAULT (70) when absent', () => {
    const p = { id: 1, name: 'No Morale' };
    const updated = applyMoraleEvent(p, makeEvent({
      type: MORALE_EVENTS.VETERAN_LEADER_BONUS,
      delta: 3,
      dedupeKey: 'default-morale-1',
    }), {});
    expect(updated.morale).toBe(MORALE_DEFAULT + 3);
  });

  it('deduplicate: same dedupeKey never applies twice', () => {
    const p = makePlayer({ morale: 70 });
    const event = makeEvent({ dedupeKey: 'UNIQUE-KEY-1' });
    const ctx = { season: 1, week: 1 };
    const first  = applyMoraleEvent(p, event, ctx);
    const second = applyMoraleEvent(first, event, ctx);
    expect(first.morale).toBe(80);
    expect(second.morale).toBe(80);        // unchanged
    expect(second).toBe(first);            // same reference returned
    expect(second.moraleEvents).toHaveLength(1);
  });

  it('enforces rolling cap of MORALE_EVENTS_CAP (10) entries', () => {
    let p = makePlayer({ morale: 70 });
    for (let i = 0; i < 15; i++) {
      p = applyMoraleEvent(p, makeEvent({
        type: MORALE_EVENTS.VETERAN_LEADER_BONUS,
        delta: 1,
        dedupeKey: `vl-${i}`,
      }), {});
    }
    expect(p.moraleEvents).toHaveLength(MORALE_EVENTS_CAP);
  });

  it('event entries include all required fields', () => {
    const p = makePlayer({ morale: 70 });
    const updated = applyMoraleEvent(p, makeEvent({
      type: MORALE_EVENTS.CONTRACT_EXTENDED,
      delta: 10,
      season: 2,
      week: 5,
      reason: 'Deal done',
      source: 'contract',
      dedupeKey: 'CE-full-fields',
    }), { season: 2, week: 5 });
    const entry = updated.moraleEvents[0];
    expect(entry).toMatchObject({
      type:     MORALE_EVENTS.CONTRACT_EXTENDED,
      delta:    10,
      season:   2,
      week:     5,
      reason:   'Deal done',
      source:   'contract',
      dedupeKey: 'CE-full-fields',
    });
  });

  it('DEADLINE_SELL_FRUSTRATION: caps total per season at DEADLINE_FRUSTRATION_SEASON_CAP (12)', () => {
    let p = makePlayer({ morale: 70 });
    // Apply 5 events of -3 each = 15 total delta, but cap is 12
    for (let week = 7; week <= 11; week++) {
      p = applyMoraleEvent(p, {
        type:  MORALE_EVENTS.DEADLINE_SELL_FRUSTRATION,
        delta: MORALE_DELTAS[MORALE_EVENTS.DEADLINE_SELL_FRUSTRATION],
        season: 1,
        week,
        reason: 'Seller team',
        source: 'weekly_advance',
        dedupeKey: `DSF-42-1-${week}`,
      }, { season: 1, week });
    }
    // Accumulated applied delta must not exceed -12
    const totalDelta = p.moraleEvents
      .filter((e) => e.type === MORALE_EVENTS.DEADLINE_SELL_FRUSTRATION)
      .reduce((sum, e) => sum + e.delta, 0);
    expect(totalDelta).toBeGreaterThanOrEqual(-DEADLINE_FRUSTRATION_SEASON_CAP);
    expect(p.morale).toBeGreaterThanOrEqual(70 - DEADLINE_FRUSTRATION_SEASON_CAP);
  });

  it('generates a stable dedupeKey from context when none is provided', () => {
    const p = makePlayer({ morale: 70 });
    const event = { type: MORALE_EVENTS.VETERAN_LEADER_BONUS, delta: 3, source: 'weekly_advance' };
    const ctx = { season: 2, week: 4 };
    const updated = applyMoraleEvent(p, event, ctx);
    const entry = updated.moraleEvents[0];
    expect(entry.dedupeKey).toBe(`${MORALE_EVENTS.VETERAN_LEADER_BONUS}-weekly_advance-2-4`);
  });
});

// ── getPlayerMoraleSummary ────────────────────────────────────────────────────

describe('getPlayerMoraleSummary', () => {
  it('returns Thriving label at 85+', () => {
    expect(getPlayerMoraleSummary({ morale: 85 }).label).toBe('Thriving');
    expect(getPlayerMoraleSummary({ morale: 100 }).label).toBe('Thriving');
  });

  it('returns Settled label at 70–84', () => {
    expect(getPlayerMoraleSummary({ morale: 70 }).label).toBe('Settled');
    expect(getPlayerMoraleSummary({ morale: 84 }).label).toBe('Settled');
  });

  it('returns Neutral label at 55–69', () => {
    expect(getPlayerMoraleSummary({ morale: 55 }).label).toBe('Neutral');
    expect(getPlayerMoraleSummary({ morale: 69 }).label).toBe('Neutral');
  });

  it('returns Frustrated label at 40–54', () => {
    expect(getPlayerMoraleSummary({ morale: 40 }).label).toBe('Frustrated');
    expect(getPlayerMoraleSummary({ morale: 54 }).label).toBe('Frustrated');
  });

  it('returns Disgruntled label below 40', () => {
    expect(getPlayerMoraleSummary({ morale: 39 }).label).toBe('Disgruntled');
    expect(getPlayerMoraleSummary({ morale: 0 }).label).toBe('Disgruntled');
  });

  it('defaults to Settled/70 when morale is absent', () => {
    const result = getPlayerMoraleSummary({});
    expect(result.score).toBe(MORALE_DEFAULT);
    expect(result.label).toBe('Settled');
  });

  it('returns null topEvent when no events', () => {
    expect(getPlayerMoraleSummary({ morale: 70 }).topEvent).toBeNull();
  });

  it('returns the most recent event as topEvent', () => {
    const events = [
      { type: 'OLDER', dedupeKey: 'a' },
      { type: MORALE_EVENTS.CONTRACT_EXTENDED, dedupeKey: 'b' },
    ];
    const result = getPlayerMoraleSummary({ morale: 80, moraleEvents: events });
    expect(result.topEvent.type).toBe(MORALE_EVENTS.CONTRACT_EXTENDED);
  });

  it('flags isLow correctly at boundary (39 vs 40)', () => {
    expect(getPlayerMoraleSummary({ morale: 39 }).isLow).toBe(true);
    expect(getPlayerMoraleSummary({ morale: 40 }).isLow).toBe(false);
  });

  it('flags isAlert correctly below MORALE_ALERT_THRESHOLD (35)', () => {
    expect(getPlayerMoraleSummary({ morale: 34 }).isAlert).toBe(true);
    expect(getPlayerMoraleSummary({ morale: 35 }).isAlert).toBe(false);
  });
});

// ── applyWeeklyMoraleEffects ──────────────────────────────────────────────────

describe('applyWeeklyMoraleEffects', () => {
  const ctx = {
    season: 1,
    week: 7,
    deadlineWeek: 9,
    phase: 'regular',
    teamPostureMap: { '1': 'contender', '2': 'seller', '3': 'playoff_hunt', '4': 'middle' },
  };

  it('returns same array reference for non-regular phase', () => {
    const players = [makePlayer()];
    const result = applyWeeklyMoraleEffects(players, { ...ctx, phase: 'playoffs' });
    expect(result).toBe(players);
  });

  it('returns same array when input is not an array', () => {
    expect(applyWeeklyMoraleEffects(null, ctx)).toBeNull();
  });

  it('applies VETERAN_LEADER_BONUS to veteran leader on contender team', () => {
    const player = makePlayer({ id: 1, age: 32, teamId: 1, traits: ['mentor'], morale: 70 });
    const [updated] = applyWeeklyMoraleEffects([player], ctx);
    expect(updated.morale).toBe(73);
    expect(updated.moraleEvents[0].type).toBe(MORALE_EVENTS.VETERAN_LEADER_BONUS);
  });

  it('applies VETERAN_LEADER_BONUS to veteran with loyal trait on playoff_hunt team', () => {
    const player = makePlayer({ id: 2, age: 31, teamId: 3, traits: ['loyal'], morale: 70 });
    const [updated] = applyWeeklyMoraleEffects([player], ctx);
    expect(updated.morale).toBe(73);
  });

  it('applies VETERAN_LEADER_BONUS via leadership score >= 65', () => {
    const player = makePlayer({
      id: 3, age: 30, teamId: 1, traits: [],
      personalityProfile: { leadership: 70 },
      morale: 70,
    });
    const [updated] = applyWeeklyMoraleEffects([player], ctx);
    expect(updated.morale).toBe(73);
  });

  it('does NOT apply VETERAN_LEADER_BONUS on seller team', () => {
    const player = makePlayer({ id: 4, age: 32, teamId: 2, traits: ['mentor'], morale: 70 });
    // Only deadline frustration may apply, not veteran bonus
    const [updated] = applyWeeklyMoraleEffects([player], ctx);
    expect(updated.moraleEvents.filter((e) => e.type === MORALE_EVENTS.VETERAN_LEADER_BONUS)).toHaveLength(0);
  });

  it('does NOT apply VETERAN_LEADER_BONUS for player under 30', () => {
    const player = makePlayer({ id: 5, age: 29, teamId: 1, traits: ['mentor'], morale: 70 });
    const [updated] = applyWeeklyMoraleEffects([player], ctx);
    expect((updated.moraleEvents ?? []).filter((e) => e.type === MORALE_EVENTS.VETERAN_LEADER_BONUS)).toHaveLength(0);
  });

  it('applies DEADLINE_SELL_FRUSTRATION to seller team player near deadline', () => {
    // week 7, deadline 9 → weeksToDeadline 2 → in window
    const player = makePlayer({ id: 10, age: 28, teamId: 2, morale: 70 });
    const [updated] = applyWeeklyMoraleEffects([player], ctx);
    expect(updated.morale).toBe(67);
    expect(updated.moraleEvents[0].type).toBe(MORALE_EVENTS.DEADLINE_SELL_FRUSTRATION);
  });

  it('does NOT apply DEADLINE_SELL_FRUSTRATION outside the deadline window', () => {
    // week 4, deadline 9 → weeksToDeadline 5 → outside window
    const player = makePlayer({ id: 11, teamId: 2, morale: 70 });
    const [updated] = applyWeeklyMoraleEffects([player], { ...ctx, week: 4 });
    // No change expected — same reference returned
    expect(updated).toBe(player);
    expect((updated.moraleEvents ?? [])).toHaveLength(0);
  });

  it('does NOT apply DEADLINE_SELL_FRUSTRATION to middle-of-pack team', () => {
    const player = makePlayer({ id: 12, teamId: 4, morale: 70 });
    const [updated] = applyWeeklyMoraleEffects([player], ctx);
    expect((updated.moraleEvents ?? []).filter((e) => e.type === MORALE_EVENTS.DEADLINE_SELL_FRUSTRATION)).toHaveLength(0);
  });

  it('weekly advance does not double-apply events (same dedupeKey)', () => {
    const player = makePlayer({ id: 20, age: 32, teamId: 1, traits: ['mentor'], morale: 70 });
    const [first] = applyWeeklyMoraleEffects([player], ctx);
    const [second] = applyWeeklyMoraleEffects([first], ctx);
    expect(second.morale).toBe(first.morale);
    expect(second.moraleEvents).toHaveLength(first.moraleEvents.length);
  });

  it('DEADLINE_SELL_FRUSTRATION weekly cap: stops accumulating after DEADLINE_FRUSTRATION_SEASON_CAP', () => {
    let player = makePlayer({ id: 30, teamId: 2, morale: 70 });
    // Apply 5 weeks of frustration (5 × -3 = -15), cap is -12
    for (let w = 7; w <= 11; w++) {
      [player] = applyWeeklyMoraleEffects([player], { ...ctx, week: w });
    }
    const totalFrustration = player.moraleEvents
      .filter((e) => e.type === MORALE_EVENTS.DEADLINE_SELL_FRUSTRATION)
      .reduce((sum, e) => sum + e.delta, 0);
    expect(totalFrustration).toBeGreaterThanOrEqual(-DEADLINE_FRUSTRATION_SEASON_CAP);
    expect(player.morale).toBeGreaterThanOrEqual(70 - DEADLINE_FRUSTRATION_SEASON_CAP);
  });

  it('returns unchanged reference for players with no matching conditions', () => {
    // Young player on middle team, week 4 (no deadline window)
    const player = makePlayer({ id: 99, age: 22, teamId: 4, morale: 70 });
    const [result] = applyWeeklyMoraleEffects([player], { ...ctx, week: 4 });
    expect(result).toBe(player);
  });

  it('TRADE_REQUEST_DENIED dedupeKey follows stable pattern', () => {
    const dedupeKey = `${MORALE_EVENTS.TRADE_REQUEST_DENIED}-42-1-5`;
    const p = makePlayer({ morale: 70 });
    const updated = applyMoraleEvent(p, {
      type: MORALE_EVENTS.TRADE_REQUEST_DENIED,
      delta: MORALE_DELTAS[MORALE_EVENTS.TRADE_REQUEST_DENIED],
      season: 1,
      week: 5,
      source: '42',
      dedupeKey,
    }, { season: 1, week: 5 });
    expect(updated.moraleEvents[0].dedupeKey).toBe(dedupeKey);
  });
});
