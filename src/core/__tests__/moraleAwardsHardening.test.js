/**
 * moraleAwardsHardening.test.js
 *
 * Combined hardening pass for:
 *   - Player Morale Causality V1 (#1587)
 *   - Historical Awards & Dynasty Records V1 (#1588)
 *
 * Coverage:
 *   M1 – Contract extension double-application guard
 *   M2 – Trade morale double-application guard
 *   M3 – Weekly advance double-application guard
 *   M4 – Morale save/load persistence
 *   M5 – LeaguePulse / news morale dedupe
 *   A1 – Season advance double-application guard
 *   A2 – Awards save/load persistence
 *   A3 – All-Pro team integrity
 *   A4 – Award news/pulse dedupe
 *   SL – Source-level guardrail checks
 */

import { describe, it, expect } from 'vitest';
import {
  MORALE_EVENTS,
  MORALE_DELTAS,
  MORALE_DEFAULT,
  MORALE_EVENTS_CAP,
  DEADLINE_FRUSTRATION_SEASON_CAP,
  applyMoraleEvent,
  applyWeeklyMoraleEffects,
  getPlayerMoraleSummary,
} from '../mood/playerMoraleEngine.js';

import {
  AWARD_TYPES,
  SEASON_END,
  determineSeasonAwards,
  applySeasonAwards,
  getPlayerAwardSummary,
  checkCareerMilestones,
} from '../awards/awardEngine.js';

import {
  generateLeaguePulseItems,
  mergeLeaguePulseItems,
} from '../leaguePulse.js';

// ── Shared fixtures ───────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return {
    id: 42,
    name: 'Test Player',
    age: 27,
    ovr: 78,
    morale: MORALE_DEFAULT,
    teamId: 1,
    traits: [],
    ...overrides,
  };
}

function makeVeteranLeader(overrides = {}) {
  return makePlayer({ age: 32, traits: ['mentor'], morale: 70, ...overrides });
}

function makeQBStats(playerId, teamId, passYd = 4800, passTD = 38) {
  return {
    playerId,
    name: `QB${playerId}`,
    pos: 'QB',
    teamId,
    totals: { gamesPlayed: 17, passYd, passTD, interceptions: 5 },
  };
}

function makeRBStats(playerId, teamId, rushYd = 1600, rushTD = 14) {
  return {
    playerId,
    name: `RB${playerId}`,
    pos: 'RB',
    teamId,
    totals: { gamesPlayed: 17, rushYd, rushTD, recYd: 300, recTD: 2 },
  };
}

function makeWRStats(playerId, teamId, recYd = 1500, recTD = 12) {
  return {
    playerId,
    name: `WR${playerId}`,
    pos: 'WR',
    teamId,
    totals: { gamesPlayed: 17, recYd, recTD, receptions: 80 },
  };
}

const SEASON = 2025;
const TEAMS = [
  { id: 1, wins: 13, ovr: 85 },
  { id: 2, wins: 8,  ovr: 72 },
  { id: 3, wins: 4,  ovr: 65 },
];

// ─────────────────────────────────────────────────────────────────────────────
// M1 – Contract extension double-application guard
// ─────────────────────────────────────────────────────────────────────────────

describe('M1 — Contract extension double-application guard', () => {
  function applyExtension(player, season = 2025) {
    const dedupeKey = `${MORALE_EVENTS.CONTRACT_EXTENDED}-${player.id}-${season}-0`;
    return applyMoraleEvent(
      player,
      {
        type:   MORALE_EVENTS.CONTRACT_EXTENDED,
        delta:  MORALE_DELTAS[MORALE_EVENTS.CONTRACT_EXTENDED],
        season,
        week:   0,
        reason: 'Contract extended',
        source: String(player.id),
        dedupeKey,
      },
      { season, week: 0 },
    );
  }

  it('player starts at morale 70 and no moraleEvents', () => {
    const p = makePlayer({ morale: 70 });
    expect(p.morale).toBe(70);
    expect(p.moraleEvents).toBeUndefined();
  });

  it('first CONTRACT_EXTENDED raises morale by +10', () => {
    const p = makePlayer({ morale: 70 });
    const updated = applyExtension(p);
    expect(updated.morale).toBe(80);
    expect(updated.moraleEvents).toHaveLength(1);
    expect(updated.moraleEvents[0].type).toBe(MORALE_EVENTS.CONTRACT_EXTENDED);
  });

  it('second extension call for same player/season does NOT re-apply (dedupeKey guard)', () => {
    const p = makePlayer({ morale: 70 });
    const once = applyExtension(p);
    const twice = applyExtension(once);

    expect(twice.morale).toBe(80);                  // no second +10
    expect(twice.moraleEvents).toHaveLength(1);     // still just 1 event
    expect(twice).toBe(once);                       // same object reference returned
  });

  it('extension in a different season DOES apply again', () => {
    const p = makePlayer({ morale: 70 });
    const after2025 = applyExtension(p, 2025);
    const after2026 = applyExtension(after2025, 2026);

    expect(after2026.morale).toBe(90);              // +10 each year
    expect(after2026.moraleEvents).toHaveLength(2);
  });

  it('player with no morale field defaults to 70 before extension', () => {
    const p = { id: 10, name: 'Unknown Morale' };
    const updated = applyExtension(p);
    expect(updated.morale).toBe(MORALE_DEFAULT + MORALE_DELTAS[MORALE_EVENTS.CONTRACT_EXTENDED]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M2 – Trade morale double-application guard
// ─────────────────────────────────────────────────────────────────────────────

describe('M2 — Trade morale double-application guard', () => {
  function applyTrade(player, type, season = 2025, week = 5, destTeamId = 2) {
    const dedupeKey = `${type}-${player.id}-${season}-${week}-${destTeamId}`;
    return applyMoraleEvent(
      player,
      {
        type,
        delta:  MORALE_DELTAS[type],
        season,
        week,
        source: String(destTeamId),
        dedupeKey,
      },
      { season, week },
    );
  }

  it('TRADED_TO_CONTENDER applies exactly once', () => {
    const p = makePlayer({ morale: 70 });
    const after = applyTrade(p, MORALE_EVENTS.TRADED_TO_CONTENDER);
    expect(after.morale).toBe(80);
    expect(after.moraleEvents).toHaveLength(1);
  });

  it('TRADED_TO_REBUILDER applies exactly once', () => {
    const p = makePlayer({ morale: 70 });
    const after = applyTrade(p, MORALE_EVENTS.TRADED_TO_REBUILDER);
    expect(after.morale).toBe(64);
    expect(after.moraleEvents).toHaveLength(1);
  });

  it('same player/week/destination cannot accumulate duplicate events — contender', () => {
    const p = makePlayer({ morale: 70 });
    const once = applyTrade(p, MORALE_EVENTS.TRADED_TO_CONTENDER);
    const twice = applyTrade(once, MORALE_EVENTS.TRADED_TO_CONTENDER);
    expect(twice.morale).toBe(80);
    expect(twice.moraleEvents).toHaveLength(1);
    expect(twice).toBe(once);
  });

  it('same player/week/destination cannot accumulate duplicate events — rebuilder', () => {
    const p = makePlayer({ morale: 70 });
    const once = applyTrade(p, MORALE_EVENTS.TRADED_TO_REBUILDER);
    const twice = applyTrade(once, MORALE_EVENTS.TRADED_TO_REBUILDER);
    expect(twice.morale).toBe(64);
    expect(twice.moraleEvents).toHaveLength(1);
  });

  it('trade to a different destination in the same week uses a different dedupeKey', () => {
    const p = makePlayer({ morale: 70 });
    const toTeam2 = applyTrade(p, MORALE_EVENTS.TRADED_TO_CONTENDER, 2025, 5, 2);
    // If somehow traded again to team 3 (different key) — this is a separate event
    const toTeam3 = applyTrade(toTeam2, MORALE_EVENTS.TRADED_TO_CONTENDER, 2025, 5, 3);
    expect(toTeam3.moraleEvents).toHaveLength(2);
  });

  it('existing trade cap guardrail: dedupeKey blocks re-application', () => {
    const sharedKey = `${MORALE_EVENTS.TRADED_TO_CONTENDER}-42-2025-5-99`;
    const p = makePlayer({ morale: 70 });
    const event = {
      type: MORALE_EVENTS.TRADED_TO_CONTENDER,
      delta: MORALE_DELTAS[MORALE_EVENTS.TRADED_TO_CONTENDER],
      season: 2025,
      week: 5,
      dedupeKey: sharedKey,
    };
    const once = applyMoraleEvent(p, event, { season: 2025, week: 5 });
    const twice = applyMoraleEvent(once, event, { season: 2025, week: 5 });
    expect(twice).toBe(once);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M3 – Weekly advance double-application guard
// ─────────────────────────────────────────────────────────────────────────────

describe('M3 — Weekly advance double-application guard', () => {
  const baseCtx = {
    season: 2025,
    week: 7,
    deadlineWeek: 9,
    phase: 'regular',
    teamPostureMap: { '1': 'contender', '2': 'seller', '3': 'playoff_hunt' },
  };

  it('VETERAN_LEADER_BONUS applies once per player per week', () => {
    const player = makeVeteranLeader({ id: 1, teamId: 1, morale: 70 });
    const [after] = applyWeeklyMoraleEffects([player], baseCtx);
    const bonus = after.moraleEvents.filter((e) => e.type === MORALE_EVENTS.VETERAN_LEADER_BONUS);
    expect(bonus).toHaveLength(1);
    expect(after.morale).toBe(73);
  });

  it('DEADLINE_SELL_FRUSTRATION applies once per player per week', () => {
    const player = makePlayer({ id: 2, teamId: 2, morale: 70 });
    const [after] = applyWeeklyMoraleEffects([player], baseCtx);
    const dsf = after.moraleEvents.filter((e) => e.type === MORALE_EVENTS.DEADLINE_SELL_FRUSTRATION);
    expect(dsf).toHaveLength(1);
    expect(after.morale).toBe(67);
  });

  it('calling advance TWICE (stale state replay) does not double-apply VETERAN_LEADER_BONUS', () => {
    const player = makeVeteranLeader({ id: 3, teamId: 1, morale: 70 });
    const [first] = applyWeeklyMoraleEffects([player], baseCtx);
    const [second] = applyWeeklyMoraleEffects([first], baseCtx);

    expect(second.morale).toBe(first.morale);
    expect(second).toBe(first);

    const bonuses = second.moraleEvents.filter((e) => e.type === MORALE_EVENTS.VETERAN_LEADER_BONUS);
    expect(bonuses).toHaveLength(1);
  });

  it('calling advance TWICE does not double-apply DEADLINE_SELL_FRUSTRATION', () => {
    const player = makePlayer({ id: 4, teamId: 2, morale: 70 });
    const [first] = applyWeeklyMoraleEffects([player], baseCtx);
    const [second] = applyWeeklyMoraleEffects([first], baseCtx);

    expect(second.morale).toBe(first.morale);
    expect(second).toBe(first);
  });

  it('advancing to a new week applies a fresh VETERAN_LEADER_BONUS event', () => {
    const player = makeVeteranLeader({ id: 5, teamId: 1, morale: 70 });
    const [week7] = applyWeeklyMoraleEffects([player], { ...baseCtx, week: 7 });
    const [week8] = applyWeeklyMoraleEffects([week7], { ...baseCtx, week: 8 });

    expect(week8.morale).toBe(76);  // +3 at week 7 + 3 at week 8
    const bonuses = week8.moraleEvents.filter((e) => e.type === MORALE_EVENTS.VETERAN_LEADER_BONUS);
    expect(bonuses).toHaveLength(2);
    expect(bonuses[0].week).not.toBe(bonuses[1].week);
  });

  it('advancing to a new week applies a fresh DEADLINE_SELL_FRUSTRATION event', () => {
    const player = makePlayer({ id: 6, teamId: 2, morale: 70 });
    const [week7] = applyWeeklyMoraleEffects([player], { ...baseCtx, week: 7 });
    const [week8] = applyWeeklyMoraleEffects([week7], { ...baseCtx, week: 8 });

    // Cap is 12; two applications of -3 = -6 total
    const dsf = week8.moraleEvents.filter((e) => e.type === MORALE_EVENTS.DEADLINE_SELL_FRUSTRATION);
    expect(dsf).toHaveLength(2);
    expect(week8.morale).toBe(64);
  });

  it('DEADLINE_SELL_FRUSTRATION per-season cap of 12 is respected across 5 weeks', () => {
    let player = makePlayer({ id: 7, teamId: 2, morale: 70 });
    // Apply weeks 7–11, each -3, total without cap would be -15
    for (let w = 7; w <= 11; w++) {
      [player] = applyWeeklyMoraleEffects([player], { ...baseCtx, week: w });
    }
    const totalDelta = player.moraleEvents
      .filter((e) => e.type === MORALE_EVENTS.DEADLINE_SELL_FRUSTRATION)
      .reduce((sum, e) => sum + e.delta, 0);
    // Cap is 12; cannot exceed -12
    expect(Math.abs(totalDelta)).toBeLessThanOrEqual(DEADLINE_FRUSTRATION_SEASON_CAP);
    expect(player.morale).toBeGreaterThanOrEqual(70 - DEADLINE_FRUSTRATION_SEASON_CAP);
  });

  it('non-regular phase skips all weekly effects', () => {
    const player = makeVeteranLeader({ id: 8, teamId: 1, morale: 70 });
    const players = [player];
    const result = applyWeeklyMoraleEffects(players, { ...baseCtx, phase: 'playoffs' });
    expect(result).toBe(players);
    expect(result[0]).toBe(player);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M4 – Morale save/load persistence
// ─────────────────────────────────────────────────────────────────────────────

describe('M4 — Morale save/load persistence', () => {
  function jsonRoundTrip(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  it('player with morale and moraleEvents survives JSON round-trip', () => {
    let p = makePlayer({ id: 1, morale: 70 });
    // Apply two distinct events
    p = applyMoraleEvent(p, {
      type:      MORALE_EVENTS.TRADED_TO_CONTENDER,
      delta:     MORALE_DELTAS[MORALE_EVENTS.TRADED_TO_CONTENDER],
      season:    2025,
      week:      5,
      reason:    'Trade',
      source:    'trade',
      dedupeKey: 'TC-1-2025-5',
    });
    p = applyMoraleEvent(p, {
      type:      MORALE_EVENTS.VETERAN_LEADER_BONUS,
      delta:     MORALE_DELTAS[MORALE_EVENTS.VETERAN_LEADER_BONUS],
      season:    2025,
      week:      6,
      reason:    'Vet bonus',
      source:    'weekly_advance',
      dedupeKey: 'VLB-1-2025-6',
    });

    const loaded = jsonRoundTrip(p);
    expect(loaded.morale).toBe(p.morale);
    expect(loaded.moraleEvents).toHaveLength(2);
    expect(loaded.moraleEvents[0].dedupeKey).toBe('TC-1-2025-5');
    expect(loaded.moraleEvents[1].dedupeKey).toBe('VLB-1-2025-6');
  });

  it('moraleEvents order is preserved after round-trip', () => {
    let p = makePlayer({ id: 2, morale: 70 });
    const dedupeKeys = [];
    for (let i = 0; i < 5; i++) {
      const key = `test-event-${i}`;
      dedupeKeys.push(key);
      p = applyMoraleEvent(p, {
        type:      MORALE_EVENTS.VETERAN_LEADER_BONUS,
        delta:     1,
        season:    2025,
        week:      i,
        dedupeKey: key,
      });
    }

    const loaded = jsonRoundTrip(p);
    loaded.moraleEvents.forEach((e, i) => {
      expect(e.dedupeKey).toBe(dedupeKeys[i]);
    });
  });

  it('rolling cap of MORALE_EVENTS_CAP (10) survives round-trip', () => {
    let p = makePlayer({ id: 3, morale: 70 });
    for (let i = 0; i < 15; i++) {
      p = applyMoraleEvent(p, {
        type:      MORALE_EVENTS.VETERAN_LEADER_BONUS,
        delta:     1,
        dedupeKey: `rolling-${i}`,
      });
    }
    const loaded = jsonRoundTrip(p);
    expect(loaded.moraleEvents).toHaveLength(MORALE_EVENTS_CAP);
  });

  it('dedupeKeys survive round-trip and still prevent re-application', () => {
    let p = makePlayer({ id: 4, morale: 70 });
    const event = {
      type:      MORALE_EVENTS.CONTRACT_EXTENDED,
      delta:     10,
      season:    2025,
      week:      0,
      dedupeKey: 'CE-4-2025-0',
    };
    p = applyMoraleEvent(p, event);
    const loaded = jsonRoundTrip(p);
    const afterReapply = applyMoraleEvent(loaded, event);
    expect(afterReapply).toBe(loaded);   // same reference = blocked
    expect(afterReapply.morale).toBe(loaded.morale);
  });

  it('old save without morale fields hydrates safely to defaults', () => {
    const oldSave = { id: 5, name: 'Old Player', pos: 'QB', ovr: 88, age: 34 };
    const loaded = jsonRoundTrip(oldSave);
    const summary = getPlayerMoraleSummary(loaded);
    expect(summary.score).toBe(MORALE_DEFAULT);
    expect(summary.label).toBe('Settled');
    expect(summary.topEvent).toBeNull();
    expect(summary.isLow).toBe(false);
    expect(summary.isAlert).toBe(false);
  });

  it('PlayerProfile renders Neutral/70 when morale is absent', () => {
    const summary = getPlayerMoraleSummary({});
    expect(summary.score).toBe(70);
    expect(summary.label).toBe('Settled');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M5 – LeaguePulse and news morale dedupe
// ─────────────────────────────────────────────────────────────────────────────

describe('M5 — LeaguePulse / news morale dedupe', () => {
  const meta = { season: 2025, week: 7, phase: 'regular', userTeamId: '1' };

  it('Locker Room Watch emits once when player crosses below alert threshold', () => {
    const player = makePlayer({ id: 10, teamId: 1, morale: 30 });
    const items = generateLeaguePulseItems(meta, { players: [player] });
    const watches = items.filter((i) => i.headline === 'Locker Room Watch');
    expect(watches).toHaveLength(1);
  });

  it('re-generating LeaguePulse for same season/week/player does not duplicate Locker Room Watch', () => {
    const player = makePlayer({ id: 11, teamId: 1, morale: 20 });
    const batch1 = generateLeaguePulseItems(meta, { players: [player] });
    const batch2 = generateLeaguePulseItems(meta, { players: [player] });

    // Each batch on its own emits exactly 1 watch
    expect(batch1.filter((i) => i.headline === 'Locker Room Watch')).toHaveLength(1);

    // mergeLeaguePulseItems deduplication holds
    const merged = mergeLeaguePulseItems(batch1, batch2);
    const mergedWatches = merged.filter((i) => i.headline === 'Locker Room Watch');
    expect(mergedWatches).toHaveLength(1);
  });

  it('Veteran Presence item is deterministic across calls', () => {
    const player = makePlayer({
      id: 20,
      name: 'Vet Leader',
      teamId: 1,
      morale: 73,
      moraleEvents: [{
        type:      MORALE_EVENTS.VETERAN_LEADER_BONUS,
        delta:     3,
        season:    2025,
        week:      7,
        dedupeKey: 'VLB-20-2025-7',
      }],
    });
    const items1 = generateLeaguePulseItems(meta, { players: [player] });
    const items2 = generateLeaguePulseItems(meta, { players: [player] });

    const presence1 = items1.find((i) => i.headline === 'Veteran Presence');
    const presence2 = items2.find((i) => i.headline === 'Veteran Presence');

    expect(presence1).toBeDefined();
    expect(presence1.dedupeKey).toBe(presence2.dedupeKey);
    expect(presence1.importance).toBe(presence2.importance);
    expect(presence1.type).toBe(presence2.type);
  });

  it('morale-drop news dedupeKey is stable across repeated refreshes', async () => {
    const { buildMoraleDropDedupeKey } = await import('../news-engine.js');
    const k1 = buildMoraleDropDedupeKey(42, 2025, 7);
    const k2 = buildMoraleDropDedupeKey(42, 2025, 7);
    expect(k1).toBe(k2);
    expect(k1).toContain('42');
    expect(k1).toContain('2025');
    expect(k1).toContain('7');
  });

  it('Locker Room Watch dedupeKey is stable (same player/season/week)', () => {
    const player = makePlayer({ id: 55, teamId: 1, morale: 10 });
    const i1 = generateLeaguePulseItems({ ...meta, season: 3, week: 9 }, { players: [player] });
    const i2 = generateLeaguePulseItems({ ...meta, season: 3, week: 9 }, { players: [player] });
    const k1 = i1.find((i) => i.headline === 'Locker Room Watch')?.dedupeKey;
    const k2 = i2.find((i) => i.headline === 'Locker Room Watch')?.dedupeKey;
    expect(k1).toBeDefined();
    expect(k1).toBe(k2);
  });

  it('mergeLeaguePulseItems deduplication works on Veteran Presence across batches', () => {
    const player = makePlayer({
      id: 21,
      name: 'VP Leader',
      teamId: 1,
      morale: 73,
      moraleEvents: [{
        type:   MORALE_EVENTS.VETERAN_LEADER_BONUS,
        delta:  3,
        season: 2025,
        week:   7,
        dedupeKey: 'VLB-21-2025-7',
      }],
    });
    const batch1 = generateLeaguePulseItems(meta, { players: [player] });
    const batch2 = generateLeaguePulseItems(meta, { players: [player] });
    const merged = mergeLeaguePulseItems(batch1, batch2);
    const presences = merged.filter((i) => i.headline === 'Veteran Presence');
    expect(presences).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A1 – Season advance double-application guard
// ─────────────────────────────────────────────────────────────────────────────

describe('A1 — Season advance double-application guard', () => {
  const stats = [makeQBStats(1, 1, 4800, 38)];
  const awardResults = determineSeasonAwards([], TEAMS, SEASON, { stats, championTeamId: 1 });

  it('applying determineSeasonAwards returns awards exactly once per season', () => {
    const playerMap = new Map([['1', { id: 1, name: 'QB1', pos: 'QB' }]]);
    const { playerUpdates } = applySeasonAwards(playerMap, {}, awardResults);
    const awards = playerUpdates.get('1')?.awards ?? [];
    const mvps = awards.filter((a) => a.type === AWARD_TYPES.MVP);
    expect(mvps).toHaveLength(1);
  });

  it('calling archiveSeason twice (same awardResults) does not double-award', () => {
    const playerMap = new Map([['1', { id: 1, name: 'QB1', pos: 'QB' }]]);

    // First application
    const first = applySeasonAwards(playerMap, {}, awardResults);
    const playerAfter1 = { id: 1, name: 'QB1', pos: 'QB', awards: first.playerUpdates.get('1')?.awards ?? [] };
    const playerMap2 = new Map([['1', playerAfter1]]);

    // Second application (same awardResults = same season)
    const second = applySeasonAwards(playerMap2, { franchiseAwards: first.updatedFranchiseAwards }, awardResults);

    const finalAwards = second.playerUpdates.get('1')?.awards ?? playerAfter1.awards;
    const mvps = finalAwards.filter((a) => a.type === AWARD_TYPES.MVP);
    expect(mvps).toHaveLength(1);

    // Franchise awards must also not duplicate
    const champs = second.updatedFranchiseAwards.filter(
      (a) => a.type === AWARD_TYPES.LEAGUE_CHAMPION && a.season === SEASON,
    );
    expect(champs).toHaveLength(1);
  });

  it('dedupeKey prevents re-application of individual award', () => {
    const mvpKey = `MVP_${SEASON}`;
    const existingPlayer = {
      id: 1,
      name: 'QB1',
      pos: 'QB',
      awards: [{ type: AWARD_TYPES.MVP, season: SEASON, dedupeKey: mvpKey }],
    };
    const playerMap = new Map([['1', existingPlayer]]);
    const { playerUpdates } = applySeasonAwards(playerMap, {}, awardResults);
    // No new update entry because MVP is already present
    const updatedAwards = playerUpdates.get('1')?.awards ?? existingPlayer.awards;
    const mvps = updatedAwards.filter((a) => a.type === AWARD_TYPES.MVP);
    expect(mvps).toHaveLength(1);
  });

  it('franchise awards deduplication blocks repeat LEAGUE_CHAMPION for same season', () => {
    const champAward = { type: AWARD_TYPES.LEAGUE_CHAMPION, season: SEASON, teamId: 1 };
    const ar = { playerAwards: [], franchiseAwards: [champAward], allProTeam: [] };

    const first = applySeasonAwards(new Map(), {}, ar);
    const second = applySeasonAwards(new Map(), { franchiseAwards: first.updatedFranchiseAwards }, ar);
    const champs = second.updatedFranchiseAwards.filter(
      (a) => a.type === AWARD_TYPES.LEAGUE_CHAMPION && a.season === SEASON,
    );
    expect(champs).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A2 – Awards save/load persistence
// ─────────────────────────────────────────────────────────────────────────────

describe('A2 — Awards save/load persistence', () => {
  function jsonRoundTrip(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  it('player.awards survives LOAD_SAVE round-trip with full fidelity', () => {
    const stats = [makeQBStats(1, 1, 4800, 38)];
    const awardResults = determineSeasonAwards([], TEAMS, SEASON, { stats });
    const playerMap = new Map([['1', { id: 1, name: 'QB1', pos: 'QB' }]]);
    const { playerUpdates } = applySeasonAwards(playerMap, {}, awardResults);
    const updatedPlayer = { id: 1, name: 'QB1', pos: 'QB', awards: playerUpdates.get('1')?.awards ?? [] };

    const loaded = jsonRoundTrip(updatedPlayer);
    expect(Array.isArray(loaded.awards)).toBe(true);
    expect(loaded.awards.length).toBe(updatedPlayer.awards.length);

    for (const award of loaded.awards) {
      expect(award.type).toBeDefined();
      expect(award.season).toBe(SEASON);
      expect(award.week).toBe(SEASON_END);
      expect(award.dedupeKey).toBeDefined();
      expect(award.statSnapshot).toBeDefined();
      expect(award.teamId !== undefined).toBe(true);
    }
  });

  it('meta.franchiseAwards survives LOAD_SAVE round-trip', () => {
    const ar = {
      playerAwards: [],
      franchiseAwards: [{ type: AWARD_TYPES.LEAGUE_CHAMPION, season: SEASON, teamId: 1 }],
      allProTeam: [],
    };
    const { updatedFranchiseAwards } = applySeasonAwards(new Map(), {}, ar);
    const loaded = jsonRoundTrip({ franchiseAwards: updatedFranchiseAwards });

    expect(Array.isArray(loaded.franchiseAwards)).toBe(true);
    expect(loaded.franchiseAwards[0].type).toBe(AWARD_TYPES.LEAGUE_CHAMPION);
    expect(loaded.franchiseAwards[0].season).toBe(SEASON);
    expect(loaded.franchiseAwards[0].teamId).toBe(1);
  });

  it('old save without award fields hydrates safely to []', () => {
    const oldPlayer = { id: 5, name: 'Veteran QB', pos: 'QB', ovr: 88, age: 34 };
    const playerMap = new Map([['5', oldPlayer]]);
    const ar = { playerAwards: [], franchiseAwards: [], allProTeam: [] };
    const { playerUpdates } = applySeasonAwards(playerMap, {}, ar);
    // No update if no awards to apply
    expect(playerUpdates.has('5')).toBe(false);
    // getPlayerAwardSummary handles missing awards field
    const summary = getPlayerAwardSummary(oldPlayer);
    expect(summary.totalAwards).toBe(0);
    expect(summary.highlights).toEqual([]);
  });

  it('meta without franchiseAwards field hydrates to [] safely', () => {
    const oldMeta = { year: SEASON, season: 1 };
    const ar = {
      playerAwards: [],
      franchiseAwards: [{ type: AWARD_TYPES.COACH_OF_YEAR, season: SEASON, teamId: 2 }],
      allProTeam: [],
    };
    const { updatedFranchiseAwards } = applySeasonAwards(new Map(), oldMeta, ar);
    expect(Array.isArray(updatedFranchiseAwards)).toBe(true);
    expect(updatedFranchiseAwards).toHaveLength(1);
  });

  it('PlayerProfile trophy shelf: getPlayerAwardSummary correct after reload', () => {
    const player = {
      awards: [
        { type: AWARD_TYPES.MVP, season: SEASON, dedupeKey: `MVP_${SEASON}`, teamId: 1 },
        { type: AWARD_TYPES.ALL_PRO_QB, season: SEASON, dedupeKey: `ALL_PRO_QB_${SEASON}`, teamId: 1 },
        { type: AWARD_TYPES.LEAGUE_CHAMPION, season: SEASON, dedupeKey: `LEAGUE_CHAMPION_${SEASON}`, teamId: 1 },
      ],
    };
    const loaded = jsonRoundTrip(player);
    const summary = getPlayerAwardSummary(loaded);
    expect(summary.mvpCount).toBe(1);
    expect(summary.allProCount).toBe(1);
    expect(summary.championshipCount).toBe(1);
    expect(summary.totalAwards).toBe(3);
    expect(summary.summaryLine).toContain('MVP');
    expect(summary.summaryLine).toContain('All-Pro');
    expect(summary.summaryLine).toContain('Champion');
  });

  it('dedupeKey on reloaded awards still blocks re-application', () => {
    const stats = [makeQBStats(1, 1, 4800, 38)];
    const awardResults = determineSeasonAwards([], TEAMS, SEASON, { stats });
    const playerMap = new Map([['1', { id: 1, name: 'QB1', pos: 'QB' }]]);
    const first = applySeasonAwards(playerMap, {}, awardResults);
    const updatedPlayer = jsonRoundTrip({ id: 1, name: 'QB1', pos: 'QB', awards: first.playerUpdates.get('1')?.awards ?? [] });

    const reloadedMap = new Map([['1', updatedPlayer]]);
    const second = applySeasonAwards(reloadedMap, {}, awardResults);
    const awards2 = second.playerUpdates.get('1')?.awards ?? updatedPlayer.awards;
    const mvps2 = awards2.filter((a) => a.type === AWARD_TYPES.MVP);
    expect(mvps2).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A3 – All-Pro team integrity
// ─────────────────────────────────────────────────────────────────────────────

describe('A3 — All-Pro team integrity', () => {
  const richStats = [
    makeQBStats(1, 1, 5000, 42),
    makeRBStats(2, 1, 1800, 18),
    makeWRStats(3, 1, 1700, 15),
    makeWRStats(4, 2, 1500, 13),
    { playerId: 5, name: 'TE5', pos: 'TE', teamId: 1,  totals: { gamesPlayed: 17, recYd: 900, recTD: 10, receptions: 70 } },
    { playerId: 6, name: 'OL6', pos: 'OL', teamId: 1,  totals: { gamesPlayed: 17 }, ovr: 88 },
    { playerId: 7, name: 'OL7', pos: 'OT', teamId: 2,  totals: { gamesPlayed: 17 }, ovr: 85 },
    { playerId: 8, name: 'DL8', pos: 'DL', teamId: 1,  totals: { gamesPlayed: 17, sacks: 14, tackles: 50, pressures: 30, forcedFumbles: 2 } },
    { playerId: 9, name: 'DL9', pos: 'DE', teamId: 2,  totals: { gamesPlayed: 17, sacks: 12, tackles: 45, pressures: 28, forcedFumbles: 3 } },
    { playerId: 10, name: 'LB10', pos: 'LB', teamId: 1, totals: { gamesPlayed: 17, tackles: 110, sacks: 8, interceptions: 3 } },
    { playerId: 11, name: 'LB11', pos: 'LB', teamId: 2, totals: { gamesPlayed: 17, tackles: 95, sacks: 6, interceptions: 2 } },
    { playerId: 12, name: 'CB12', pos: 'CB', teamId: 1, totals: { gamesPlayed: 17, defInterceptions: 6, passesDefended: 15, tackles: 40, forcedFumbles: 1 } },
    { playerId: 13, name: 'CB13', pos: 'CB', teamId: 2, totals: { gamesPlayed: 17, defInterceptions: 5, passesDefended: 12, tackles: 35, forcedFumbles: 1 } },
    { playerId: 14, name: 'S14', pos: 'S',  teamId: 1, totals: { gamesPlayed: 17, interceptions: 5, passesDefended: 10, tackles: 70, forcedFumbles: 2 } },
    { playerId: 15, name: 'K15', pos: 'K',  teamId: 1, totals: { gamesPlayed: 17, fgMade: 36, xpMade: 44 } },
    { playerId: 16, name: 'P16', pos: 'P',  teamId: 1, totals: { gamesPlayed: 17, punts: 65, puntYards: 3000 } },
  ];

  const { allProTeam } = determineSeasonAwards([], TEAMS, SEASON, { stats: richStats });

  it('no player is assigned to two positions', () => {
    const counts = {};
    for (const entry of allProTeam) {
      counts[entry.playerId] = (counts[entry.playerId] ?? 0) + 1;
    }
    // Allow OL/DL/LB/CB multi-slot entries (each has a unique dedupeKey per player)
    // But no single player should appear in two *different* type slots
    const byPlayer = {};
    for (const entry of allProTeam) {
      if (!byPlayer[entry.playerId]) byPlayer[entry.playerId] = new Set();
      byPlayer[entry.playerId].add(entry.type);
    }
    for (const [pid, types] of Object.entries(byPlayer)) {
      expect(types.size).toBe(1); // each player appears in only one position type
    }
  });

  it('each position type appears at most its allowed slot count', () => {
    const SLOT_COUNTS = {
      [AWARD_TYPES.ALL_PRO_QB]: 1,
      [AWARD_TYPES.ALL_PRO_RB]: 1,
      [AWARD_TYPES.ALL_PRO_WR]: 2,
      [AWARD_TYPES.ALL_PRO_TE]: 1,
      [AWARD_TYPES.ALL_PRO_OL]: 2,
      [AWARD_TYPES.ALL_PRO_DL]: 2,
      [AWARD_TYPES.ALL_PRO_LB]: 2,
      [AWARD_TYPES.ALL_PRO_CB]: 2,
      [AWARD_TYPES.ALL_PRO_S]:  1,
      [AWARD_TYPES.ALL_PRO_K]:  1,
      [AWARD_TYPES.ALL_PRO_P]:  1,
    };
    for (const [type, max] of Object.entries(SLOT_COUNTS)) {
      const entries = allProTeam.filter((e) => e.type === type);
      expect(entries.length).toBeLessThanOrEqual(max);
    }
  });

  it('single-slot positions have exactly 1 entry when eligible players exist', () => {
    const singleSlots = [
      AWARD_TYPES.ALL_PRO_QB,
      AWARD_TYPES.ALL_PRO_RB,
      AWARD_TYPES.ALL_PRO_TE,
      AWARD_TYPES.ALL_PRO_S,
      AWARD_TYPES.ALL_PRO_K,
      AWARD_TYPES.ALL_PRO_P,
    ];
    for (const type of singleSlots) {
      const entries = allProTeam.filter((e) => e.type === type);
      expect(entries).toHaveLength(1);
    }
  });

  it('no position slot is empty (given sufficient players)', () => {
    // All positions have ≥ 1 eligible player in richStats
    const coveredTypes = new Set(allProTeam.map((e) => e.type));
    for (const type of Object.values(AWARD_TYPES)) {
      if (type.startsWith('ALL_PRO_')) {
        expect(coveredTypes.has(type)).toBe(true);
      }
    }
  });

  it('empty stats produce empty allProTeam', () => {
    const { allProTeam: empty } = determineSeasonAwards([], TEAMS, SEASON, { stats: [] });
    expect(empty).toEqual([]);
  });

  it('determineSeasonAwards is deterministic: same inputs → same allProTeam', () => {
    const r1 = determineSeasonAwards([], TEAMS, SEASON, { stats: richStats });
    const r2 = determineSeasonAwards([], TEAMS, SEASON, { stats: richStats });
    expect(r1.allProTeam.map((e) => e.playerId)).toEqual(r2.allProTeam.map((e) => e.playerId));
    expect(r1.allProTeam.map((e) => e.type)).toEqual(r2.allProTeam.map((e) => e.type));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A4 – Award news/pulse dedupe
// ─────────────────────────────────────────────────────────────────────────────

describe('A4 — Award news/pulse dedupe', () => {
  it('MVP dedupeKey is stable across repeated season advances', () => {
    const stats = [makeQBStats(1, 1, 4800, 38)];
    const r1 = determineSeasonAwards([], TEAMS, SEASON, { stats });
    const r2 = determineSeasonAwards([], TEAMS, SEASON, { stats });
    const mvp1 = r1.playerAwards.find((a) => a.type === AWARD_TYPES.MVP);
    const mvp2 = r2.playerAwards.find((a) => a.type === AWARD_TYPES.MVP);
    expect(mvp1.dedupeKey).toBe(mvp2.dedupeKey);
    expect(mvp1.dedupeKey).toBe(`MVP_${SEASON}`);
  });

  it('League champion pulse item does not duplicate across two apply calls', () => {
    const champAward = { type: AWARD_TYPES.LEAGUE_CHAMPION, season: SEASON, teamId: 1 };
    const ar = { playerAwards: [], franchiseAwards: [champAward], allProTeam: [] };
    const first = applySeasonAwards(new Map(), {}, ar);
    const second = applySeasonAwards(new Map(), { franchiseAwards: first.updatedFranchiseAwards }, ar);
    const champs = second.updatedFranchiseAwards.filter(
      (a) => a.type === AWARD_TYPES.LEAGUE_CHAMPION && a.season === SEASON,
    );
    expect(champs).toHaveLength(1);
  });

  it('300 TD career milestone fires exactly once at threshold crossing', () => {
    const player = {
      id: 99,
      name: 'Legend QB',
      pos: 'QB',
      age: 33,
      careerStats: [
        { season: 's1', passTDs: 150, rushTDs: 10, recTDs: 0 },
        { season: 's2', passTDs: 141, rushTDs: 0,  recTDs: 0 }, // crosses exactly 301
      ],
    };
    const milestone = checkCareerMilestones(player, SEASON);
    expect(milestone).not.toBeNull();
    expect(milestone.type).toBe('300_CAREER_TDs');
  });

  it('300 TD milestone does NOT fire after threshold was already crossed in prior season', () => {
    const player = {
      id: 100,
      name: 'Veteran QB',
      pos: 'QB',
      age: 35,
      careerStats: [
        { season: 's1', passTDs: 310, rushTDs: 0, recTDs: 0 }, // already past 300
        { season: 's2', passTDs: 30,  rushTDs: 0, recTDs: 0 }, // this season = no new crossing
      ],
    };
    const milestone = checkCareerMilestones(player, SEASON);
    // HOF check may fire but TD milestone must not
    expect(milestone?.type).not.toBe('300_CAREER_TDs');
  });

  it('300 TD milestone does not fire on every advance after threshold', () => {
    const player = {
      id: 101,
      name: 'GOAT QB',
      pos: 'QB',
      age: 38,
      status: 'active',
      careerStats: [
        { season: 's1', passTDs: 300, rushTDs: 0, recTDs: 0 },
        { season: 's2', passTDs: 10,  rushTDs: 0, recTDs: 0 }, // s2: prev=300 >= 300 → no cross
      ],
    };
    const m1 = checkCareerMilestones(player, 2026);
    expect(m1?.type).not.toBe('300_CAREER_TDs');
  });

  it('same season awards produce a unique dedupeKey per type', () => {
    const stats = [makeQBStats(1, 1, 4800, 38), makeRBStats(2, 2, 1800, 18)];
    const { playerAwards } = determineSeasonAwards([], TEAMS, SEASON, { stats });
    const keys = playerAwards.map((a) => a.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length); // all dedupeKeys unique
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SL – Source-level guardrail checks
// ─────────────────────────────────────────────────────────────────────────────

describe('SL — Source-level guardrail checks', () => {
  it('awardEngine.js has no imports from worker, UI, news, or mood modules', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(
      new URL('../awards/awardEngine.js', import.meta.url),
      'utf8',
    );
    // Must not import anything from worker, UI layers, news engine, or mood engine
    expect(src).not.toMatch(/from ['"].*worker/);
    expect(src).not.toMatch(/from ['"].*\/ui\//);
    expect(src).not.toMatch(/from ['"].*news-engine/);
    expect(src).not.toMatch(/from ['"].*playerMoraleEngine/);
    expect(src).not.toMatch(/from ['"].*mood\//);
  });

  it('playerMoraleEngine.js has no imports from worker, UI, news, or awards', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(
      new URL('../mood/playerMoraleEngine.js', import.meta.url),
      'utf8',
    );
    expect(src).not.toMatch(/from ['"].*worker/);
    expect(src).not.toMatch(/from ['"].*\/ui\//);
    expect(src).not.toMatch(/from ['"].*news-engine/);
    expect(src).not.toMatch(/from ['"].*awardEngine/);
    expect(src).not.toMatch(/from ['"].*awards\//);
  });

  it('awardEngine.js contains no Math.random() call', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(
      new URL('../awards/awardEngine.js', import.meta.url),
      'utf8',
    );
    // Check for actual call site, not comment references
    expect(src).not.toMatch(/Math\.random\s*\(/);
  });

  it('playerMoraleEngine.js contains no Math.random() call', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(
      new URL('../mood/playerMoraleEngine.js', import.meta.url),
      'utf8',
    );
    // The comment "No Math.random" is fine; the call Math.random() must not exist
    expect(src).not.toMatch(/Math\.random\s*\(/);
  });

  it('richGameSimulator.ts does not import playerMoraleEngine', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(
      new URL('../sim/richGameSimulator.ts', import.meta.url),
      'utf8',
    );
    expect(src).not.toMatch(/playerMoraleEngine/);
  });

  it('richGameSimulator.ts does not import awardEngine', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(
      new URL('../sim/richGameSimulator.ts', import.meta.url),
      'utf8',
    );
    expect(src).not.toMatch(/awardEngine/);
  });
});
