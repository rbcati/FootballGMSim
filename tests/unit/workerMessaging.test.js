/**
 * Regression tests for the Worker Message Serialization & Transferable Payload System.
 *
 * Covers:
 *  1. Float32Array rating matrix packing / unpacking
 *  2. Int32Array schedule buffer packing / round-trip
 *  3. ArrayBuffer detachment after simulated Transferable transfer
 *  4. serializeLeagueDelta — only changed fields appear in the delta
 *  5. applyLeagueDelta — state remains consistent after patch application
 *  6. Full-state hydration fallback (no _isDelta, full replace)
 *  7. Payload hardening — JSON path triggered above 2 MB threshold
 *  8. estimatePayloadBytes — returns a reasonable byte estimate
 */

import { describe, it, expect } from 'vitest';
import {
  buildRatingMatrix,
  buildScheduleBuffer,
  unpackScheduleBuffer,
  serializeLeagueDelta,
  applyLeagueDelta,
  estimatePayloadBytes,
  serializePayloadForPost,
  PLAYER_RATING_STRIDE,
  GAME_SCHEDULE_STRIDE,
  JSON_SERIALIZATION_THRESHOLD,
} from '../../src/worker/serialization.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayers(n = 5, teamId = 1) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p_${i}`,
    teamId,
    ovr: 70 + i,
    age: 24 + i,
    pot: 80 + i,
    speed: 85,
    strength: 72,
    awareness: 68,
    agility: 79,
  }));
}

function makeSchedule(weekCount = 2, gamesPerWeek = 2) {
  const weeks = Array.from({ length: weekCount }, (_, wi) => ({
    week: wi + 1,
    games: Array.from({ length: gamesPerWeek }, (_, gi) => ({
      home: gi * 2,
      away: gi * 2 + 1,
      homeScore: 21 + gi,
      awayScore: 14,
      played: gi === 0,
    })),
  }));
  return { weeks };
}

function makeViewState(overrides = {}) {
  return {
    activeLeagueId: 'lg_1',
    seasonId: 'season_1',
    year: 2024,
    week: 1,
    phase: 'regular',
    userTeamId: 0,
    ownerApproval: 75,
    fanApproval: 65,
    nextGameStakes: 3,
    draftStarted: false,
    draftLifecycleStatus: 'not_available',
    offseasonProgressionDone: false,
    championTeamId: null,
    godMode: false,
    commissionerMode: false,
    commissionerEverEnabled: false,
    settings: { autoSave: true, difficulty: 'normal' },
    economy: { currentSalaryCap: 255000000 },
    freeAgencyState: null,
    contractMarket: null,
    tradeDeadline: { open: true },
    playoffSeeds: null,
    standingsContext: { phase: 'regular', mode: 'live_regular' },
    standings: [],
    records: null,
    recordBook: null,
    newsItems: [],
    ownerGoals: [],
    incomingTradeOffers: [],
    retiredPlayers: [],
    leagueHistory: [],
    franchiseChronicle: [],
    franchiseSeasonReviews: [],
    hallOfFameClasses: [],
    weeklyHeadlines: [],
    commissionerLog: [],
    seasonStorylines: [],
    teams: [
      { id: 0, name: 'Team A', abbr: 'TMA', wins: 0, losses: 0, ties: 0,
        capUsed: 100000, ovr: 78, fanApproval: 62, rosterCount: 2,
        roster: makePlayers(2, 0) },
    ],
    schedule: makeSchedule(2, 2),
    ...overrides,
  };
}

// ── 1. Rating Matrix ──────────────────────────────────────────────────────────

describe('buildRatingMatrix', () => {
  it('creates a Float32Array with correct stride and count', () => {
    const players = makePlayers(4);
    const { buffer, playerIds } = buildRatingMatrix(players);

    expect(buffer).toBeInstanceOf(Float32Array);
    expect(buffer.length).toBe(4 * PLAYER_RATING_STRIDE);
    expect(playerIds).toHaveLength(4);
  });

  it('packs player fields in the correct slot order', () => {
    const player = {
      id: 'qb1', teamId: 3, ovr: 88, age: 27, pot: 91,
      speed: 82, strength: 74, awareness: 90, agility: 76,
    };
    const { buffer, playerIds } = buildRatingMatrix([player]);

    expect(playerIds[0]).toBe('qb1');
    expect(buffer[0]).toBe(3);   // teamId
    expect(buffer[1]).toBe(88);  // ovr
    expect(buffer[2]).toBe(27);  // age
    expect(buffer[3]).toBe(91);  // potential
    expect(buffer[4]).toBe(82);  // speed
    expect(buffer[5]).toBe(74);  // strength
    expect(buffer[6]).toBe(90);  // awareness
    expect(buffer[7]).toBe(76);  // agility
  });

  it('falls back gracefully when optional fields are absent', () => {
    const { buffer } = buildRatingMatrix([{ id: 'x', ovr: 72 }]);
    expect(buffer[1]).toBe(72);  // ovr
    expect(buffer[4]).toBe(70);  // speed fallback
  });

  it('handles zero players without throwing', () => {
    const { buffer, playerIds } = buildRatingMatrix([]);
    expect(buffer.length).toBe(0);
    expect(playerIds).toHaveLength(0);
  });
});

// ── 2. Schedule Buffer ────────────────────────────────────────────────────────

describe('buildScheduleBuffer', () => {
  it('creates an Int32Array with correct stride and game count', () => {
    const schedule = makeSchedule(2, 4); // 2 weeks × 4 games = 8 entries
    const buf = buildScheduleBuffer(schedule);

    expect(buf).toBeInstanceOf(Int32Array);
    expect(buf.length).toBe(8 * GAME_SCHEDULE_STRIDE);
  });

  it('packs week/home/away/scores/played flags correctly', () => {
    const schedule = {
      weeks: [{ week: 5, games: [{ home: 10, away: 20, homeScore: 28, awayScore: 14, played: true }] }],
    };
    const buf = buildScheduleBuffer(schedule);

    expect(buf[0]).toBe(5);   // week
    expect(buf[1]).toBe(10);  // homeId
    expect(buf[2]).toBe(20);  // awayId
    expect(buf[3]).toBe(28);  // homeScore
    expect(buf[4]).toBe(14);  // awayScore
    expect(buf[5]).toBe(1);   // played = true → 1
  });

  it('encodes unplayed games with played=0', () => {
    const buf = buildScheduleBuffer({
      weeks: [{ week: 1, games: [{ home: 0, away: 1, played: false }] }],
    });
    expect(buf[5]).toBe(0);
  });

  it('returns an empty Int32Array for missing weeks', () => {
    expect(buildScheduleBuffer(null).length).toBe(0);
    expect(buildScheduleBuffer({}).length).toBe(0);
  });
});

// ── 3. Schedule Round-Trip ────────────────────────────────────────────────────

describe('unpackScheduleBuffer', () => {
  it('round-trips schedule data without loss', () => {
    const original = makeSchedule(3, 4);
    const buf = buildScheduleBuffer(original);
    const recovered = unpackScheduleBuffer(buf);

    expect(recovered.weeks).toHaveLength(3);

    // Compare a specific game
    const w2orig = original.weeks[1];
    const w2rec = recovered.weeks.find(w => w.week === w2orig.week);
    expect(w2rec).toBeDefined();
    expect(w2rec.games).toHaveLength(w2orig.games.length);

    const g0orig = w2orig.games[0];
    const g0rec = w2rec.games[0];
    expect(g0rec.home).toBe(g0orig.home);
    expect(g0rec.away).toBe(g0orig.away);
    expect(g0rec.played).toBe(g0orig.played);
  });

  it('returns empty weeks for an empty buffer', () => {
    const result = unpackScheduleBuffer(new Int32Array(0));
    expect(result.weeks).toHaveLength(0);
  });
});

// ── 4. Transferable Detachment ────────────────────────────────────────────────

describe('binary buffer transferability', () => {
  it('ArrayBuffer becomes detached (byteLength → 0) after structuredClone transfer', () => {
    const players = makePlayers(10);
    const { buffer } = buildRatingMatrix(players);
    const ab = buffer.buffer; // underlying ArrayBuffer

    expect(ab.byteLength).toBeGreaterThan(0);

    // Simulate the Transferable transfer — structuredClone with transfer list
    // behaves identically to postMessage transfer: the source buffer is detached.
    structuredClone({}, { transfer: [ab] });

    expect(ab.byteLength).toBe(0); // detached
  });

  it('schedule Int32Array underlying buffer is detachable', () => {
    const buf = buildScheduleBuffer(makeSchedule(4, 4));
    const ab = buf.buffer;

    expect(ab.byteLength).toBeGreaterThan(0);
    structuredClone({}, { transfer: [ab] });
    expect(ab.byteLength).toBe(0);
  });
});

// ── 5. serializeLeagueDelta ───────────────────────────────────────────────────

describe('serializeLeagueDelta', () => {
  it('marks the output as a delta', () => {
    const { delta } = serializeLeagueDelta(makeViewState(), null);
    expect(delta._isDelta).toBe(true);
  });

  it('includes all scalar fields on the first call (no previous state)', () => {
    const state = makeViewState({ week: 7, phase: 'playoffs' });
    const { delta } = serializeLeagueDelta(state, null);

    expect(delta.week).toBe(7);
    expect(delta.phase).toBe('playoffs');
    expect(delta.year).toBe(2024);
  });

  it('omits unchanged scalar fields when diffing against previous state', () => {
    const prev = makeViewState({ week: 3, phase: 'regular', ownerApproval: 70 });
    const curr = { ...prev, week: 4 }; // only week advanced
    const { delta } = serializeLeagueDelta(curr, prev);

    expect(delta.week).toBe(4);
    expect(delta.phase).toBeUndefined(); // unchanged → omitted
    expect(delta.year).toBeUndefined();  // unchanged → omitted
    expect(delta.ownerApproval).toBeUndefined();
  });

  it('includes newsItems when the array grows', () => {
    const prev = makeViewState({ newsItems: [] });
    const curr = { ...prev, newsItems: [{ id: 1, text: 'Breaking news' }] };
    const { delta } = serializeLeagueDelta(curr, prev);

    expect(delta.newsItems).toHaveLength(1);
  });

  it('omits newsItems when unchanged', () => {
    const items = [{ id: 1, text: 'Old news' }];
    const prev = makeViewState({ newsItems: items });
    const curr = { ...prev, newsItems: items };
    const { delta } = serializeLeagueDelta(curr, prev);

    expect(delta.newsItems).toBeUndefined();
  });

  it('includes teams when win/loss record changes', () => {
    const prev = makeViewState();
    const curr = {
      ...prev,
      teams: [{ ...prev.teams[0], wins: 1 }],
    };
    const { delta } = serializeLeagueDelta(curr, prev);
    expect(delta.teams).toBeDefined();
    expect(delta.teams[0].wins).toBe(1);
  });

  it('omits teams when records are unchanged', () => {
    const state = makeViewState();
    const { delta } = serializeLeagueDelta(state, state);
    expect(delta.teams).toBeUndefined();
  });

  it('returns a ratingMatrix when players are present', () => {
    const { ratingMatrix } = serializeLeagueDelta(makeViewState(), null);
    expect(ratingMatrix).not.toBeNull();
    expect(ratingMatrix.buffer).toBeInstanceOf(Float32Array);
    expect(ratingMatrix.playerIds).toBeInstanceOf(Array);
  });

  it('returns a scheduleBuffer when schedule is present', () => {
    const { scheduleBuffer } = serializeLeagueDelta(makeViewState(), null);
    expect(scheduleBuffer).toBeInstanceOf(Int32Array);
    expect(scheduleBuffer.length).toBeGreaterThan(0);
  });

  it('returns null ratingMatrix when no teams have rosters', () => {
    const state = makeViewState({ teams: [] });
    const { ratingMatrix } = serializeLeagueDelta(state, null);
    expect(ratingMatrix).toBeNull();
  });
});

// ── 6. applyLeagueDelta ───────────────────────────────────────────────────────

describe('applyLeagueDelta', () => {
  it('patches only the fields present in the delta', () => {
    const prev = makeViewState({ week: 3, phase: 'regular', fanApproval: 60 });
    const delta = { _isDelta: true, week: 4, fanApproval: 65 };

    const next = applyLeagueDelta(prev, delta);

    expect(next.week).toBe(4);
    expect(next.fanApproval).toBe(65);
    expect(next.phase).toBe('regular'); // untouched
    expect(next.year).toBe(prev.year);  // untouched
  });

  it('preserves the full teams array when teams are not in the delta', () => {
    const prev = makeViewState();
    const delta = { _isDelta: true, week: 5 };

    const next = applyLeagueDelta(prev, delta);

    expect(next.teams).toBe(prev.teams); // reference unchanged
  });

  it('replaces teams when teams are in the delta', () => {
    const prev = makeViewState();
    const newTeams = [{ ...prev.teams[0], wins: 3 }];
    const delta = { _isDelta: true, teams: newTeams };

    const next = applyLeagueDelta(prev, delta);

    expect(next.teams[0].wins).toBe(3);
  });

  it('returns a new object (does not mutate the input)', () => {
    const prev = makeViewState();
    const delta = { _isDelta: true, week: 10 };
    const next = applyLeagueDelta(prev, delta);

    expect(next).not.toBe(prev);
    expect(prev.week).toBe(1); // original unchanged
  });

  it('rejects malformed patch when _isDelta is absent and requests full reload', () => {
    const prev = makeViewState({ week: 1 });
    const malformed = { week: 9 };

    const next = applyLeagueDelta(prev, malformed);

    expect(next.week).toBe(1);
    expect(next._requiresFullState).toBe(true);
  });



  it('preserves history arrays across multi-tick deltas unless changed', () => {
    const history = [{ year: 2024, champ: 'A' }];
    const chronicle = [{ id: 'c1', text: 'Started franchise' }];
    let state = makeViewState({ leagueHistory: history, franchiseChronicle: chronicle, week: 1 });

    state = applyLeagueDelta(state, { _isDelta: true, week: 2 });
    expect(state.leagueHistory).toBe(history);
    expect(state.franchiseChronicle).toBe(chronicle);

    const nextHistory = [...history, { year: 2025, champ: 'B' }];
    state = applyLeagueDelta(state, { _isDelta: true, week: 3, leagueHistory: nextHistory });
    expect(state.leagueHistory).toEqual(nextHistory);
    expect(state.franchiseChronicle).toBe(chronicle);
  });

  it('flags non-object deltas for full reload', () => {
    const prev = makeViewState({ week: 1 });
    const next = applyLeagueDelta(prev, 'bad_payload');
    expect(next._requiresFullState).toBe(true);
    expect(next.week).toBe(1);
  });

  it('returns currentState unchanged when delta is null', () => {
    const prev = makeViewState();
    const next = applyLeagueDelta(prev, null);
    expect(next).toBe(prev);
  });

  it('state remains consistent after a full delta patch cycle', () => {
    // Simulate several tick-update cycles and verify no fields drift.
    let state = makeViewState({ week: 1, phase: 'regular' });
    const deltas = [
      { _isDelta: true, week: 2 },
      { _isDelta: true, week: 3, fanApproval: 72 },
      { _isDelta: true, phase: 'playoffs', week: 19 },
      { _isDelta: true, week: 20, championTeamId: 5 },
    ];

    for (const delta of deltas) {
      state = applyLeagueDelta(state, delta);
    }

    expect(state.week).toBe(20);
    expect(state.phase).toBe('playoffs');
    expect(state.fanApproval).toBe(72);
    expect(state.championTeamId).toBe(5);
    // Untouched original fields must survive all patches
    expect(state.year).toBe(2024);
    expect(state.userTeamId).toBe(0);
    expect(state.settings).toEqual({ autoSave: true, difficulty: 'normal' });
  });
});

// ── 7. Payload Hardening ──────────────────────────────────────────────────────

describe('serializePayloadForPost', () => {
  it('returns data as-is for small payloads', () => {
    const payload = { type: 'ping', value: 42 };
    const { data, isJson, bytes } = serializePayloadForPost(payload);

    expect(isJson).toBe(false);
    expect(data).toBe(payload);
    expect(bytes).toBeLessThan(JSON_SERIALIZATION_THRESHOLD);
  });

  it('uses JSON string path when payload exceeds the 2 MB threshold', () => {
    // Construct a payload guaranteed to exceed 2 MB (≥ 1M UTF-16 chars → ~2 MB)
    const bigString = 'x'.repeat(1_100_000);
    const payload = { data: bigString };
    const { data, isJson, bytes } = serializePayloadForPost(payload);

    expect(isJson).toBe(true);
    expect(typeof data).toBe('string');
    expect(bytes).toBeGreaterThan(JSON_SERIALIZATION_THRESHOLD);
    // Verify the JSON string is parseable and round-trips correctly
    expect(JSON.parse(data).data).toBe(bigString);
  });

  it('threshold constant is 2 MB', () => {
    expect(JSON_SERIALIZATION_THRESHOLD).toBe(2 * 1024 * 1024);
  });
});

// ── 8. estimatePayloadBytes ───────────────────────────────────────────────────

describe('estimatePayloadBytes', () => {
  it('returns a number proportional to payload size', () => {
    const small = estimatePayloadBytes({ x: 1 });
    const large = estimatePayloadBytes({ data: 'a'.repeat(10_000) });

    expect(typeof small).toBe('number');
    expect(large).toBeGreaterThan(small);
  });

  it('returns Infinity for non-serialisable payloads', () => {
    const circular = {};
    circular.self = circular;
    expect(estimatePayloadBytes(circular)).toBe(Infinity);
  });

  it('scales with UTF-16 two-byte estimate', () => {
    const str = 'ab'; // 2 chars → 4 bytes per JSON.stringify (including quotes overhead)
    const bytes = estimatePayloadBytes(str);
    // '"ab"' = 4 chars × 2 = 8 bytes minimum
    expect(bytes).toBeGreaterThanOrEqual(8);
  });
});
