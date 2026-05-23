import { describe, it, expect } from 'vitest';
import { buildGameFlowSummary, GAME_FLOW_VERSION } from '../../src/core/sim/gameFlowSummary.js';
import { simulateRichGame } from '../../src/core/sim/richGameSimulator.ts';
import { mapOverallToAttributesV2 } from '../../src/core/migration/attributeMigrator.ts';

// ── Minimal game fixtures ────────────────────────────────────────────────────

function makeMinimalGame(overrides = {}) {
  return {
    homeScore: 24,
    awayScore: 17,
    homeTeamId: 1,
    awayTeamId: 2,
    scoringSummary: [
      { quarter: 1, teamId: 1, points: 7, scoreAfter: { home: 7, away: 0 }, type: 'Touchdown', text: 'Home scores.' },
      { quarter: 2, teamId: 2, points: 7, scoreAfter: { home: 7, away: 7 }, type: 'Touchdown', text: 'Away ties it.' },
      { quarter: 3, teamId: 1, points: 3, scoreAfter: { home: 10, away: 7 }, type: 'Field Goal', text: 'Home takes the lead.' },
      { quarter: 4, teamId: 1, points: 7, scoreAfter: { home: 17, away: 7 }, type: 'Touchdown', text: 'Home extends.' },
      { quarter: 4, teamId: 2, points: 7, scoreAfter: { home: 17, away: 14 }, type: 'Touchdown', text: 'Away cuts it.' },
      { quarter: 4, teamId: 1, points: 7, scoreAfter: { home: 24, away: 14 }, type: 'Touchdown', text: 'Home seals it.' },
      { quarter: 4, teamId: 2, points: 3, scoreAfter: { home: 24, away: 17 }, type: 'Field Goal', text: 'Away final score.' },
    ],
    playDigest: [
      { quarter: 2, clockSec: 420, team: 'away', type: 'turnover', text: 'Interception flips possession.', homeScore: 7, awayScore: 7 },
      { quarter: 3, clockSec: 600, team: 'home', type: 'lead_change', text: 'Home regains the lead.', homeScore: 10, awayScore: 7 },
      { quarter: 4, clockSec: 180, team: 'away', type: 'swing', text: 'Away mounts a comeback.', homeScore: 17, awayScore: 14 },
      { quarter: 4, clockSec: 60, team: 'home', type: 'final_takeaway', text: 'Home defense seals the win.', homeScore: 24, awayScore: 17 },
    ],
    teamStats: {
      home: { passTD: 2, rushTD: 1, fieldGoalsMade: 1, turnovers: 0, redZoneTrips: 4, redZoneScores: 3, explosivePlays: 5 },
      away: { passTD: 2, rushTD: 0, fieldGoalsMade: 1, turnovers: 1, redZoneTrips: 2, redZoneScores: 2, explosivePlays: 3 },
    },
    ...overrides,
  };
}

function buildRichPayload(seed = 42) {
  return {
    gameId: `gfs-audit-${seed}`,
    homeTeamId: 10,
    awayTeamId: 20,
    seed,
    weather: 'clear',
    homeOffense: mapOverallToAttributesV2(82, 5.5, `h-off-${seed}`),
    awayOffense: mapOverallToAttributesV2(80, 5.5, `a-off-${seed}`),
    homeDefense: mapOverallToAttributesV2(79, 5.5, `h-def-${seed}`),
    awayDefense: mapOverallToAttributesV2(78, 5.5, `a-def-${seed}`),
  };
}

// ── Core contract tests ──────────────────────────────────────────────────────

describe('buildGameFlowSummary', () => {
  it('returns null for null input', () => {
    expect(buildGameFlowSummary(null)).toBeNull();
    expect(buildGameFlowSummary(undefined)).toBeNull();
    expect(buildGameFlowSummary(42)).toBeNull();
    expect(buildGameFlowSummary('string')).toBeNull();
  });

  it('returns null when no score fields are present', () => {
    expect(buildGameFlowSummary({})).toBeNull();
    expect(buildGameFlowSummary({ week: 5 })).toBeNull();
  });

  it('returns null when score exists but no timeline/digest/teamStats data', () => {
    expect(buildGameFlowSummary({ homeScore: 14, awayScore: 7 })).toBeNull();
  });

  it('returns a summary with correct version for a full game', () => {
    const result = buildGameFlowSummary(makeMinimalGame());
    expect(result).not.toBeNull();
    expect(result.version).toBe(GAME_FLOW_VERSION);
    expect(result.version).toBe(1);
  });

  it('does not mutate the input object', () => {
    const game = makeMinimalGame();
    const frozen = JSON.parse(JSON.stringify(game));
    buildGameFlowSummary(game);
    expect(game).toEqual(frozen);
  });

  it('output is serializable (no functions or circular refs)', () => {
    const result = buildGameFlowSummary(makeMinimalGame());
    expect(() => JSON.stringify(result)).not.toThrow();
    const roundtripped = JSON.parse(JSON.stringify(result));
    expect(roundtripped.version).toBe(result.version);
  });

  it('omits driveSummary (deferred — not supported by current sim output)', () => {
    const result = buildGameFlowSummary(makeMinimalGame());
    expect(result).not.toHaveProperty('driveSummary');
  });

  // ── scoringTimeline ──────────────────────────────────────────────────────

  describe('scoringTimeline', () => {
    it('derives timeline from scoringSummary', () => {
      const result = buildGameFlowSummary(makeMinimalGame());
      expect(Array.isArray(result.scoringTimeline)).toBe(true);
      expect(result.scoringTimeline).toHaveLength(7);
    });

    it('each entry has required shape', () => {
      const result = buildGameFlowSummary(makeMinimalGame());
      for (const entry of result.scoringTimeline) {
        expect(typeof entry.quarter).toBe('number');
        expect(typeof entry.points).toBe('number');
        expect(typeof entry.label).toBe('string');
        expect(typeof entry.description).toBe('string');
        expect(typeof entry.scoreAfter).toBe('object');
        expect(typeof entry.scoreAfter.home).toBe('number');
        expect(typeof entry.scoreAfter.away).toBe('number');
      }
    });

    it('scoring timeline reconciles with final score (last entry scoreAfter matches final)', () => {
      const game = makeMinimalGame();
      const result = buildGameFlowSummary(game);
      const last = result.scoringTimeline[result.scoringTimeline.length - 1];
      expect(last.scoreAfter.home).toBe(game.homeScore);
      expect(last.scoreAfter.away).toBe(game.awayScore);
    });

    it('returns empty timeline when scoringSummary is absent', () => {
      const game = makeMinimalGame({ scoringSummary: undefined });
      const result = buildGameFlowSummary(game);
      // Should still return a non-null summary if playDigest/teamStats have data
      if (result) {
        expect(Array.isArray(result.scoringTimeline)).toBe(true);
        expect(result.scoringTimeline).toHaveLength(0);
      }
    });

    it('handles malformed scoringSummary entries gracefully', () => {
      const game = makeMinimalGame({
        scoringSummary: [null, undefined, { quarter: 'x', points: null }, { quarter: 2, teamId: 1, points: 7, scoreAfter: { home: 7, away: 0 }, type: 'Touchdown', text: 'TD' }],
      });
      const result = buildGameFlowSummary(game);
      expect(result).not.toBeNull();
      // null/undefined entries filtered; malformed quarter coerces to 0 then defaults to 1
      const validEntries = result.scoringTimeline.filter((e) => e.points > 0 || e.label !== 'score');
      expect(validEntries.length).toBeGreaterThan(0);
    });
  });

  // ── turningPoints ────────────────────────────────────────────────────────

  describe('turningPoints', () => {
    it('derives turning points from playDigest', () => {
      const result = buildGameFlowSummary(makeMinimalGame());
      expect(Array.isArray(result.turningPoints)).toBe(true);
      expect(result.turningPoints.length).toBeGreaterThan(0);
    });

    it('only includes turning-point event types (lead_change, turnover, swing, final_takeaway)', () => {
      const result = buildGameFlowSummary(makeMinimalGame());
      const ALLOWED = new Set(['lead_change', 'turnover', 'swing', 'final_takeaway']);
      for (const tp of result.turningPoints) {
        expect(ALLOWED.has(tp.type)).toBe(true);
      }
    });

    it('each turning point has required shape', () => {
      const result = buildGameFlowSummary(makeMinimalGame());
      for (const tp of result.turningPoints) {
        expect(typeof tp.quarter).toBe('number');
        expect(typeof tp.type).toBe('string');
        expect(typeof tp.label).toBe('string');
        expect(typeof tp.description).toBe('string');
        expect(typeof tp.scoreContext).toBe('object');
        expect(typeof tp.scoreContext.home).toBe('number');
        expect(typeof tp.scoreContext.away).toBe('number');
      }
    });

    it('maps team side to teamId correctly', () => {
      const game = makeMinimalGame();
      const result = buildGameFlowSummary(game);
      const awayTurnover = result.turningPoints.find((tp) => tp.type === 'turnover');
      expect(awayTurnover).toBeDefined();
      // 'away' team in digest → awayTeamId = 2
      expect(awayTurnover.teamId).toBe(game.awayTeamId);
    });

    it('omits non-turning-point digest events (touchdowns, sacks, explosive_play)', () => {
      const game = makeMinimalGame({
        playDigest: [
          { quarter: 1, clockSec: 800, team: 'home', type: 'touchdown', text: 'TD.', homeScore: 7, awayScore: 0 },
          { quarter: 2, clockSec: 400, team: 'away', type: 'sack', text: 'Sack!', homeScore: 7, awayScore: 0 },
          { quarter: 3, clockSec: 600, team: 'home', type: 'turnover', text: 'Fumble.', homeScore: 10, awayScore: 7 },
        ],
      });
      const result = buildGameFlowSummary(game);
      // Only the turnover is a turning point; touchdown and sack are excluded
      expect(result.turningPoints).toHaveLength(1);
      expect(result.turningPoints[0].type).toBe('turnover');
    });

    it('returns empty array when playDigest is absent', () => {
      const game = makeMinimalGame({ playDigest: undefined });
      const result = buildGameFlowSummary(game);
      if (result) {
        expect(result.turningPoints).toEqual([]);
      }
    });
  });

  // ── teamFlow ─────────────────────────────────────────────────────────────

  describe('teamFlow', () => {
    it('derives teamFlow from teamStats', () => {
      const result = buildGameFlowSummary(makeMinimalGame());
      expect(result.teamFlow).not.toBeNull();
    });

    it('teamFlow is keyed by stringified teamId', () => {
      const game = makeMinimalGame();
      const result = buildGameFlowSummary(game);
      expect(result.teamFlow[String(game.homeTeamId)]).toBeDefined();
      expect(result.teamFlow[String(game.awayTeamId)]).toBeDefined();
    });

    it('each teamFlow entry has required fields', () => {
      const result = buildGameFlowSummary(makeMinimalGame());
      for (const entry of Object.values(result.teamFlow)) {
        expect(typeof entry.scoringDrives).toBe('number');
        expect(typeof entry.turnovers).toBe('number');
        expect(typeof entry.redZoneTrips).toBe('number');
        expect(typeof entry.redZoneScores).toBe('number');
        expect(typeof entry.explosivePlays).toBe('number');
      }
    });

    it('scoringDrives = passTD + rushTD + fieldGoalsMade', () => {
      const game = makeMinimalGame();
      const result = buildGameFlowSummary(game);
      const homeFlow = result.teamFlow[String(game.homeTeamId)];
      const { passTD, rushTD, fieldGoalsMade } = game.teamStats.home;
      expect(homeFlow.scoringDrives).toBe(passTD + rushTD + fieldGoalsMade);
    });

    it('omits longestDriveYards (deferred — no per-drive tracking)', () => {
      const result = buildGameFlowSummary(makeMinimalGame());
      for (const entry of Object.values(result.teamFlow)) {
        expect(entry).not.toHaveProperty('longestDriveYards');
      }
    });

    it('returns null teamFlow when no teamStats', () => {
      const game = makeMinimalGame({ teamStats: undefined });
      const result = buildGameFlowSummary(game);
      if (result) {
        expect(result.teamFlow).toBeNull();
      }
    });

    it('accepts legacy homeId/awayId field names', () => {
      const game = {
        homeScore: 14,
        awayScore: 7,
        homeId: 5,
        awayId: 6,
        teamStats: {
          home: { passTD: 1, rushTD: 1, fieldGoalsMade: 0, turnovers: 0, redZoneTrips: 2, redZoneScores: 2, explosivePlays: 2 },
          away: { passTD: 1, rushTD: 0, fieldGoalsMade: 0, turnovers: 1, redZoneTrips: 1, redZoneScores: 1, explosivePlays: 1 },
        },
        scoringSummary: [
          { quarter: 1, teamId: 5, points: 7, scoreAfter: { home: 7, away: 0 }, type: 'Touchdown', text: 'TD' },
        ],
      };
      const result = buildGameFlowSummary(game);
      expect(result).not.toBeNull();
      expect(result.teamFlow['5']).toBeDefined();
      expect(result.teamFlow['6']).toBeDefined();
    });
  });

  // ── determinism ──────────────────────────────────────────────────────────

  describe('determinism', () => {
    it('same input produces identical output', () => {
      const game = makeMinimalGame();
      const a = buildGameFlowSummary(game);
      const b = buildGameFlowSummary(game);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('different inputs produce different outputs', () => {
      const game1 = makeMinimalGame();
      // Different scoringSummary so the timelines differ
      const game2 = makeMinimalGame({
        scoringSummary: [
          { quarter: 1, teamId: 2, points: 7, scoreAfter: { home: 0, away: 7 }, type: 'Touchdown', text: 'Away opens scoring.' },
          { quarter: 4, teamId: 2, points: 14, scoreAfter: { home: 0, away: 21 }, type: 'Touchdown', text: 'Away runs away with it.' },
        ],
      });
      const a = buildGameFlowSummary(game1);
      const b = buildGameFlowSummary(game2);
      expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    });

    it('output from richGameSimulator is stable across two calls with same seed', () => {
      const payload = buildRichPayload(777);
      const game1 = simulateRichGame(payload);
      const game2 = simulateRichGame(payload);
      const s1 = buildGameFlowSummary(game1);
      const s2 = buildGameFlowSummary(game2);
      expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
    });
  });

  // ── richGameSimulator integration ────────────────────────────────────────

  describe('richGameSimulator integration', () => {
    it('returns a valid summary from real sim output', () => {
      const result = simulateRichGame(buildRichPayload(1));
      const summary = buildGameFlowSummary(result);
      expect(summary).not.toBeNull();
      expect(summary.version).toBe(GAME_FLOW_VERSION);
    });

    it('scoringTimeline matches the sim scoringSummary length', () => {
      const result = simulateRichGame(buildRichPayload(2));
      const summary = buildGameFlowSummary(result);
      expect(summary.scoringTimeline.length).toBe(result.scoringSummary.length);
    });

    it('teamFlow keys match homeTeamId and awayTeamId', () => {
      const payload = buildRichPayload(3);
      const result = simulateRichGame(payload);
      const summary = buildGameFlowSummary(result);
      if (summary.teamFlow) {
        expect(summary.teamFlow[String(payload.homeTeamId)]).toBeDefined();
        expect(summary.teamFlow[String(payload.awayTeamId)]).toBeDefined();
      }
    });

    it('richGameSimulator determinism is unaffected by summary derivation', () => {
      const payload = buildRichPayload(42);
      const before = simulateRichGame(payload);
      buildGameFlowSummary(before); // derive and discard
      const after = simulateRichGame(payload);
      expect(before.homeScore).toBe(after.homeScore);
      expect(before.awayScore).toBe(after.awayScore);
      expect(JSON.stringify(before.quarterScores)).toBe(JSON.stringify(after.quarterScores));
      expect(JSON.stringify(before.teamStats)).toBe(JSON.stringify(after.teamStats));
    });

    it('summary does not attach to or modify the sim result object', () => {
      const payload = buildRichPayload(99);
      const result = simulateRichGame(payload);
      const frozen = JSON.parse(JSON.stringify(result));
      buildGameFlowSummary(result);
      expect(result).toEqual(frozen);
    });
  });

  // ── legacy / partial data safety ─────────────────────────────────────────

  describe('legacy and partial game data safety', () => {
    it('handles score-only game without crashing', () => {
      // Minimal legacy-style object with only final scores
      const game = { homeScore: 21, awayScore: 14, homeId: 1, awayId: 2 };
      expect(() => buildGameFlowSummary(game)).not.toThrow();
    });

    it('handles legacy finalScore shape', () => {
      const game = {
        finalScore: { home: 21, away: 14 },
        homeTeamId: 1,
        awayTeamId: 2,
        scoringSummary: [
          { quarter: 1, teamId: 1, points: 7, scoreAfter: { home: 7, away: 0 }, type: 'Touchdown', text: 'TD' },
        ],
      };
      const result = buildGameFlowSummary(game);
      expect(result).not.toBeNull();
    });

    it('handles empty arrays gracefully — returns summary with zero-value teamFlow', () => {
      // teamStats with all zeros still produces a valid teamFlow entry (team played, just 0 stats)
      // scoringSummary/playDigest empty → empty timelines, but teamFlow is non-null
      const game = makeMinimalGame({ scoringSummary: [], playDigest: [] });
      const result = buildGameFlowSummary(game);
      expect(result).not.toBeNull();
      expect(result.scoringTimeline).toEqual([]);
      expect(result.turningPoints).toEqual([]);
      expect(result.teamFlow).not.toBeNull();
    });

    it('returns null when game has score but absolutely no derived content', () => {
      // No scoringSummary, no playDigest, no teamStats at all
      const game = { homeScore: 14, awayScore: 7, homeTeamId: 1, awayTeamId: 2 };
      expect(buildGameFlowSummary(game)).toBeNull();
    });

    it('handles deeply null/undefined nested fields', () => {
      const game = {
        homeScore: 10,
        awayScore: 3,
        homeTeamId: 1,
        awayTeamId: 2,
        teamStats: { home: null, away: null },
        scoringSummary: [{ quarter: 1, teamId: 1, points: 3, scoreAfter: null, type: null, text: null }],
      };
      expect(() => buildGameFlowSummary(game)).not.toThrow();
      const result = buildGameFlowSummary(game);
      expect(result?.scoringTimeline[0].scoreAfter).toEqual({ home: 0, away: 0 });
    });
  });
});
