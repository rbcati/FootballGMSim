/**
 * Worker integration tests for the award engine.
 * Tests the pure functions that the worker calls — no actual worker needed.
 */
import { describe, it, expect } from 'vitest';
import {
  AWARD_TYPES,
  SEASON_END,
  determineSeasonAwards,
  applySeasonAwards,
} from '../awards/awardEngine.js';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const season = 2025;
const teams = [
  { id: 1, wins: 14, ovr: 80 },
  { id: 2, wins: 8, ovr: 72 },
];

function qbStat(id, teamId) {
  return {
    playerId: id,
    name: `QB${id}`,
    pos: 'QB',
    teamId,
    totals: { gamesPlayed: 17, passYd: 4800, passTD: 38, interceptions: 8 },
  };
}

// ── Season advance emits awards after stats ───────────────────────────────────

describe('season advance via determineSeasonAwards', () => {
  it('emits player awards after stats finalization', () => {
    const stats = [qbStat(1, 1)];
    const result = determineSeasonAwards([], teams, season, { stats, coaches: [], championTeamId: 1 });
    expect(result.playerAwards.length).toBeGreaterThan(0);
    expect(result.franchiseAwards.length).toBeGreaterThan(0);
  });

  it('award does not apply twice for the same season', () => {
    const stats = [qbStat(1, 1)];
    const awardResults = determineSeasonAwards([], teams, season, { stats });
    const playerMap = new Map([['1', { id: 1, name: 'QB1', pos: 'QB' }]]);

    // First application
    const first = applySeasonAwards(playerMap, {}, awardResults);
    const playerAfterFirst = { id: 1, name: 'QB1', pos: 'QB', awards: first.playerUpdates.get('1')?.awards ?? [] };
    const playerMap2 = new Map([['1', playerAfterFirst]]);

    // Second application (same season)
    const second = applySeasonAwards(playerMap2, { franchiseAwards: first.updatedFranchiseAwards }, awardResults);

    // Player awards — MVP dedupeKey should only appear once
    const finalAwards = second.playerUpdates.get('1')?.awards ?? playerAfterFirst.awards;
    const mvps = finalAwards.filter(a => a.type === AWARD_TYPES.MVP);
    expect(mvps.length).toBeLessThanOrEqual(1);

    // Franchise awards — LEAGUE_CHAMPION should not duplicate
    // (only if championTeamId was set — rerun without it for clarity)
    const { updatedFranchiseAwards: fa1 } = applySeasonAwards(
      new Map(),
      {},
      { playerAwards: [], franchiseAwards: [{ type: AWARD_TYPES.LEAGUE_CHAMPION, season, teamId: 1 }], allProTeam: [] },
    );
    const { updatedFranchiseAwards: fa2 } = applySeasonAwards(
      new Map(),
      { franchiseAwards: fa1 },
      { playerAwards: [], franchiseAwards: [{ type: AWARD_TYPES.LEAGUE_CHAMPION, season, teamId: 1 }], allProTeam: [] },
    );
    expect(fa2.filter(a => a.type === AWARD_TYPES.LEAGUE_CHAMPION && a.season === season)).toHaveLength(1);
  });
});

// ── Awards survive LOAD_SAVE round-trip ───────────────────────────────────────

describe('awards persist through save/load simulation', () => {
  it('player.awards survives JSON serialization round-trip', () => {
    const stats = [qbStat(1, 1)];
    const awardResults = determineSeasonAwards([], teams, season, { stats });
    const playerMap = new Map([['1', { id: 1, name: 'QB1', pos: 'QB' }]]);
    const { playerUpdates } = applySeasonAwards(playerMap, {}, awardResults);
    const updatedPlayer = { id: 1, name: 'QB1', pos: 'QB', awards: playerUpdates.get('1')?.awards ?? [] };

    // Simulate save/load JSON round-trip
    const saved = JSON.stringify(updatedPlayer);
    const loaded = JSON.parse(saved);

    expect(Array.isArray(loaded.awards)).toBe(true);
    expect(loaded.awards.length).toBe(updatedPlayer.awards.length);
    for (const award of loaded.awards) {
      expect(award.type).toBeDefined();
      expect(award.season).toBe(season);
      expect(award.week).toBe(SEASON_END);
      expect(award.dedupeKey).toBeDefined();
    }
  });

  it('meta.franchiseAwards survives JSON serialization round-trip', () => {
    const awardResults = {
      playerAwards: [],
      franchiseAwards: [{ type: AWARD_TYPES.LEAGUE_CHAMPION, season, teamId: 1 }],
      allProTeam: [],
    };
    const { updatedFranchiseAwards } = applySeasonAwards(new Map(), {}, awardResults);
    const saved = JSON.stringify({ franchiseAwards: updatedFranchiseAwards });
    const loaded = JSON.parse(saved);
    expect(Array.isArray(loaded.franchiseAwards)).toBe(true);
    expect(loaded.franchiseAwards[0].type).toBe(AWARD_TYPES.LEAGUE_CHAMPION);
    expect(loaded.franchiseAwards[0].season).toBe(season);
  });
});

// ── Old save hydration ────────────────────────────────────────────────────────

describe('old save hydration', () => {
  it('player without awards field hydrates to [] without corrupting other fields', () => {
    const oldPlayer = { id: 5, name: 'Veteran', pos: 'QB', ovr: 88, age: 34, accolades: [{ type: 'MVP', year: 2020 }] };
    // Simulate what applySeasonAwards does when player has no awards field
    const playerMap = new Map([['5', oldPlayer]]);
    const awardResults = { playerAwards: [], franchiseAwards: [], allProTeam: [] };
    const { playerUpdates } = applySeasonAwards(playerMap, {}, awardResults);
    // No awards to apply → no update needed
    expect(playerUpdates.has('5')).toBe(false);
    // Original player is untouched
    expect(oldPlayer.accolades).toHaveLength(1);
    expect(oldPlayer.ovr).toBe(88);
  });

  it('applying awards to player without awards field creates awards array safely', () => {
    const oldPlayer = { id: 5, name: 'Veteran', pos: 'QB', ovr: 88, age: 34 };
    const playerMap = new Map([['5', oldPlayer]]);
    const awardResults = {
      playerAwards: [{ type: AWARD_TYPES.MVP, playerId: 5, name: 'Veteran', pos: 'QB', teamId: 1, season, week: SEASON_END, statSnapshot: { ovr: 88 }, dedupeKey: `MVP_${season}` }],
      franchiseAwards: [],
      allProTeam: [],
    };
    const { playerUpdates } = applySeasonAwards(playerMap, {}, awardResults);
    const updated = playerUpdates.get('5');
    expect(Array.isArray(updated?.awards)).toBe(true);
    expect(updated.awards[0].type).toBe(AWARD_TYPES.MVP);
    // Verify no pollution of adjacent fields
    expect(updated.awards[0].ovr).toBeUndefined();
  });

  it('meta without franchiseAwards field hydrates to [] safely', () => {
    const oldMeta = { year: 2025, season: 1 }; // no franchiseAwards
    const awardResults = {
      playerAwards: [],
      franchiseAwards: [{ type: AWARD_TYPES.COACH_OF_YEAR, season, teamId: 2 }],
      allProTeam: [],
    };
    const { updatedFranchiseAwards } = applySeasonAwards(new Map(), oldMeta, awardResults);
    expect(Array.isArray(updatedFranchiseAwards)).toBe(true);
    expect(updatedFranchiseAwards).toHaveLength(1);
  });
});

// ── Career milestone emits at correct threshold ───────────────────────────────

describe('career milestone threshold', () => {
  it('300 TD milestone fires when careerStats crosses threshold this season', async () => {
    const { checkCareerMilestones } = await import('../awards/awardEngine.js');
    const player = {
      id: 99,
      name: 'Legend QB',
      pos: 'QB',
      age: 33,
      careerStats: [
        { season: 's1', passTDs: 150, rushTDs: 10, recTDs: 0 },
        { season: 's2', passTDs: 141, rushTDs: 0, recTDs: 0 }, // crosses 300 (= 301 total)
      ],
    };
    const milestone = checkCareerMilestones(player, season);
    expect(milestone).not.toBeNull();
    expect(milestone.type).toBe('300_CAREER_TDs');
    expect(milestone.totalTDs).toBeGreaterThanOrEqual(300);
  });

  it('300 TD milestone does not fire for non-scoring positions', async () => {
    const { checkCareerMilestones } = await import('../awards/awardEngine.js');
    const lineman = {
      id: 50, name: 'Big OL', pos: 'OL', age: 28,
      careerStats: [{ season: 's1', passTDs: 0 }],
    };
    expect(checkCareerMilestones(lineman, season)).toBeNull();
  });
});
