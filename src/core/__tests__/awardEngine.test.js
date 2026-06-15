import { describe, it, expect } from 'vitest';
import {
  AWARD_TYPES,
  SEASON_END,
  determineSeasonAwards,
  applySeasonAwards,
  getPlayerAwardSummary,
  checkCareerMilestones,
} from '../awards/awardEngine.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQBStats(playerId, teamId, passYd, passTD, gp = 17) {
  return { playerId, name: `QB${playerId}`, pos: 'QB', teamId, totals: { gamesPlayed: gp, passYd, passTD, interceptions: 5, passAtt: 500, passComp: 330 } };
}
function makeRBStats(playerId, teamId, rushYd, rushTD, gp = 17) {
  return { playerId, name: `RB${playerId}`, pos: 'RB', teamId, totals: { gamesPlayed: gp, rushYd, rushTD, recYd: 300, recTD: 2 } };
}
function makeWRStats(playerId, teamId, recYd, recTD, gp = 17) {
  return { playerId, name: `WR${playerId}`, pos: 'WR', teamId, totals: { gamesPlayed: gp, recYd, recTD, receptions: 80 } };
}
function makeLBStats(playerId, teamId, tackles, sacks, gp = 17) {
  return { playerId, name: `LB${playerId}`, pos: 'LB', teamId, totals: { gamesPlayed: gp, tackles, sacks, interceptions: 2 } };
}
function makeKStats(playerId, teamId, fgMade, xpMade = 30, gp = 17) {
  return { playerId, name: `K${playerId}`, pos: 'K', teamId, totals: { gamesPlayed: gp, fgMade, xpMade } };
}

const teams = [
  { id: 1, wins: 13, ovr: 85 },
  { id: 2, wins: 9, ovr: 72 },
  { id: 3, wins: 5, ovr: 68 },
];

const season = 2025;

// ── determineSeasonAwards ─────────────────────────────────────────────────────

describe('determineSeasonAwards', () => {
  it('returns correct MVP winner (top QB on winning team)', () => {
    const stats = [
      makeQBStats(1, 1, 4800, 38),
      makeQBStats(2, 2, 4200, 30),
      makeRBStats(3, 1, 1800, 18),
    ];
    const { playerAwards } = determineSeasonAwards([], teams, season, { stats, coaches: [], championTeamId: null });
    const mvp = playerAwards.find(a => a.type === AWARD_TYPES.MVP);
    expect(mvp).toBeTruthy();
    expect(mvp.playerId).toBe(1);
    expect(mvp.season).toBe(season);
    expect(mvp.week).toBe(SEASON_END);
    expect(mvp.dedupeKey).toBe(`MVP_${season}`);
  });

  it('returns correct OFFENSIVE_POY (non-QB)', () => {
    const stats = [
      makeQBStats(1, 1, 5000, 42),
      makeRBStats(2, 1, 2000, 20),
      makeWRStats(3, 1, 1800, 16),
    ];
    const { playerAwards } = determineSeasonAwards([], teams, season, { stats });
    const opoy = playerAwards.find(a => a.type === AWARD_TYPES.OFFENSIVE_POY);
    expect(opoy).toBeTruthy();
    expect(opoy.playerId).not.toBe(1); // no QB
    expect([2, 3]).toContain(opoy.playerId);
  });

  it('returns correct DEFENSIVE_POY', () => {
    const stats = [
      makeQBStats(1, 1, 4800, 38),
      makeLBStats(10, 1, 120, 14),
      makeLBStats(11, 2, 90, 8),
    ];
    const { playerAwards } = determineSeasonAwards([], teams, season, { stats });
    const dpoy = playerAwards.find(a => a.type === AWARD_TYPES.DEFENSIVE_POY);
    expect(dpoy).toBeTruthy();
    expect(dpoy.playerId).toBe(10);
  });

  it('returns correct ROOKIE_OF_YEAR for first-year player', () => {
    const players = [
      { id: 20, year: season, age: 22 },
      { id: 21, year: season - 1, age: 23 },
    ];
    const stats = [
      makeQBStats(20, 1, 3500, 28),
      makeQBStats(21, 1, 4200, 32),
    ];
    const { playerAwards } = determineSeasonAwards(players, teams, season, { stats });
    const roty = playerAwards.find(a => a.type === AWARD_TYPES.ROOKIE_OF_YEAR);
    expect(roty).toBeTruthy();
    expect(roty.playerId).toBe(20);
  });

  it('emits LEAGUE_CHAMPION franchise award when championTeamId provided', () => {
    const stats = [makeQBStats(1, 1, 4800, 38)];
    const { franchiseAwards } = determineSeasonAwards([], teams, season, { stats, championTeamId: 1 });
    const champ = franchiseAwards.find(a => a.type === AWARD_TYPES.LEAGUE_CHAMPION);
    expect(champ).toBeTruthy();
    expect(champ.teamId).toBe(1);
    expect(champ.season).toBe(season);
  });

  it('emits COACH_OF_YEAR franchise award for overperforming team', () => {
    const overTeams = [
      { id: 1, wins: 14, ovr: 70 }, // expected ~8.5 → overperforms +5.5
      { id: 2, wins: 8, ovr: 85 },  // expected ~11.5 → underperforms
    ];
    const stats = [makeQBStats(1, 1, 4000, 30)];
    const coaches = [{ teamId: 1, name: 'Coach Smith' }];
    const { franchiseAwards } = determineSeasonAwards([], overTeams, season, { stats, coaches, championTeamId: null });
    const coy = franchiseAwards.find(a => a.type === AWARD_TYPES.COACH_OF_YEAR);
    expect(coy).toBeTruthy();
    expect(coy.teamId).toBe(1);
    expect(coy.coachName).toBe('Coach Smith');
  });

  it('All-Pro team has exactly one player per single-slot position', () => {
    const stats = [
      makeQBStats(1, 1, 5000, 42),
      makeRBStats(2, 1, 1800, 18),
      makeWRStats(3, 1, 1600, 14),
      makeWRStats(4, 2, 1400, 12),
      { playerId: 5, name: 'TE5', pos: 'TE', teamId: 1, totals: { gamesPlayed: 17, recYd: 900, recTD: 10, receptions: 70 } },
      makeKStats(6, 1, 35),
      { playerId: 7, name: 'P7', pos: 'P', teamId: 1, totals: { gamesPlayed: 17, punts: 60, puntYards: 2760 } },
      { playerId: 8, name: 'S8', pos: 'S', teamId: 1, totals: { gamesPlayed: 17, interceptions: 6, tackles: 80 } },
    ];
    const { allProTeam } = determineSeasonAwards([], teams, season, { stats });
    const qbs = allProTeam.filter(a => a.type === AWARD_TYPES.ALL_PRO_QB);
    const rbs = allProTeam.filter(a => a.type === AWARD_TYPES.ALL_PRO_RB);
    const tes = allProTeam.filter(a => a.type === AWARD_TYPES.ALL_PRO_TE);
    const ks = allProTeam.filter(a => a.type === AWARD_TYPES.ALL_PRO_K);
    const ps = allProTeam.filter(a => a.type === AWARD_TYPES.ALL_PRO_P);
    const ss = allProTeam.filter(a => a.type === AWARD_TYPES.ALL_PRO_S);
    expect(qbs).toHaveLength(1);
    expect(rbs).toHaveLength(1);
    expect(tes).toHaveLength(1);
    expect(ks).toHaveLength(1);
    expect(ps).toHaveLength(1);
    expect(ss).toHaveLength(1);
  });

  it('All-Pro WR slots have at most 2 players with no duplicates', () => {
    const stats = [
      makeWRStats(3, 1, 1600, 14),
      makeWRStats(4, 2, 1400, 12),
      makeWRStats(5, 3, 1200, 10),
    ];
    const { allProTeam } = determineSeasonAwards([], teams, season, { stats });
    const wrs = allProTeam.filter(a => a.type === AWARD_TYPES.ALL_PRO_WR);
    expect(wrs.length).toBeLessThanOrEqual(2);
    const ids = wrs.map(a => a.playerId);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
  });

  it('is deterministic: same input → same output', () => {
    const stats = [
      makeQBStats(1, 1, 4800, 38),
      makeRBStats(2, 2, 1600, 15),
      makeLBStats(10, 1, 100, 12),
    ];
    const context = { stats, coaches: [], championTeamId: 1 };
    const result1 = determineSeasonAwards([], teams, season, context);
    const result2 = determineSeasonAwards([], teams, season, context);
    expect(result1.playerAwards.map(a => a.playerId)).toEqual(result2.playerAwards.map(a => a.playerId));
    expect(result1.franchiseAwards).toEqual(result2.franchiseAwards);
    expect(result1.allProTeam.map(a => a.playerId)).toEqual(result2.allProTeam.map(a => a.playerId));
  });

  it('excludes players below minimum games threshold', () => {
    const stats = [
      { ...makeQBStats(99, 1, 9000, 80), totals: { gamesPlayed: 1, passYd: 9000, passTD: 80 } },
      makeQBStats(1, 1, 4800, 38),
    ];
    const { playerAwards } = determineSeasonAwards([], teams, season, { stats });
    const mvp = playerAwards.find(a => a.type === AWARD_TYPES.MVP);
    expect(mvp?.playerId).toBe(1); // not 99 (only 1 game)
  });

  it('returns empty arrays for empty stats input', () => {
    const result = determineSeasonAwards([], teams, season, { stats: [] });
    expect(result.playerAwards).toEqual([]);
    expect(result.allProTeam).toEqual([]);
  });

  it('dedupeKey format is stable: `${type}_${season}`', () => {
    const stats = [makeQBStats(1, 1, 4800, 38)];
    const { playerAwards } = determineSeasonAwards([], teams, season, { stats });
    const mvp = playerAwards.find(a => a.type === AWARD_TYPES.MVP);
    expect(mvp.dedupeKey).toBe(`MVP_${season}`);
  });

  it('statSnapshot includes ovr and relevant stats', () => {
    const stats = [makeQBStats(1, 1, 4800, 38)];
    const { playerAwards } = determineSeasonAwards([], teams, season, { stats });
    const mvp = playerAwards.find(a => a.type === AWARD_TYPES.MVP);
    expect(mvp.statSnapshot).toBeDefined();
    expect(Object.keys(mvp.statSnapshot)).toContain('ovr');
  });
});

// ── applySeasonAwards ─────────────────────────────────────────────────────────

describe('applySeasonAwards', () => {
  it('writes awards to correct player objects', () => {
    const stats = [makeQBStats(1, 1, 4800, 38)];
    const awardResults = determineSeasonAwards([], teams, season, { stats });
    const playerMap = new Map([['1', { id: 1, name: 'QB1', pos: 'QB', awards: [] }]]);
    const { playerUpdates } = applySeasonAwards(playerMap, {}, awardResults);
    expect(playerUpdates.has('1')).toBe(true);
    const updated = playerUpdates.get('1');
    expect(Array.isArray(updated.awards)).toBe(true);
    expect(updated.awards.length).toBeGreaterThan(0);
  });

  it('does not duplicate award if dedupeKey already exists', () => {
    const stats = [makeQBStats(1, 1, 4800, 38)];
    const awardResults = determineSeasonAwards([], teams, season, { stats });
    const existingAward = { type: AWARD_TYPES.MVP, season, dedupeKey: `MVP_${season}` };
    const playerMap = new Map([['1', { id: 1, name: 'QB1', pos: 'QB', awards: [existingAward] }]]);
    const { playerUpdates } = applySeasonAwards(playerMap, {}, awardResults);
    const updated = playerUpdates.get('1');
    if (updated) {
      const mvps = updated.awards.filter(a => a.type === AWARD_TYPES.MVP);
      expect(mvps.length).toBe(1);
    }
  });

  it('appends to franchiseAwards without duplicating', () => {
    const awardResults = {
      playerAwards: [],
      franchiseAwards: [{ type: AWARD_TYPES.LEAGUE_CHAMPION, season, teamId: 1 }],
      allProTeam: [],
    };
    const currentMeta = { franchiseAwards: [] };
    const { updatedFranchiseAwards } = applySeasonAwards(new Map(), currentMeta, awardResults);
    expect(updatedFranchiseAwards).toHaveLength(1);
    expect(updatedFranchiseAwards[0].type).toBe(AWARD_TYPES.LEAGUE_CHAMPION);

    // Apply again — should not duplicate
    const { updatedFranchiseAwards: again } = applySeasonAwards(
      new Map(),
      { franchiseAwards: updatedFranchiseAwards },
      awardResults,
    );
    expect(again).toHaveLength(1);
  });

  it('handles player with no awards field safely', () => {
    const stats = [makeQBStats(1, 1, 4800, 38)];
    const awardResults = determineSeasonAwards([], teams, season, { stats });
    // Player with no awards field at all
    const playerMap = new Map([['1', { id: 1, name: 'QB1', pos: 'QB' }]]);
    expect(() => applySeasonAwards(playerMap, {}, awardResults)).not.toThrow();
    const { playerUpdates } = applySeasonAwards(playerMap, {}, awardResults);
    const updated = playerUpdates.get('1');
    expect(Array.isArray(updated?.awards)).toBe(true);
  });

  it('handles undefined currentMeta safely', () => {
    const awardResults = { playerAwards: [], franchiseAwards: [], allProTeam: [] };
    expect(() => applySeasonAwards(new Map(), undefined, awardResults)).not.toThrow();
    const { updatedFranchiseAwards } = applySeasonAwards(new Map(), undefined, awardResults);
    expect(updatedFranchiseAwards).toEqual([]);
  });
});

// ── getPlayerAwardSummary ─────────────────────────────────────────────────────

describe('getPlayerAwardSummary', () => {
  it('counts MVP, allPro, and championship correctly', () => {
    const player = {
      awards: [
        { type: AWARD_TYPES.MVP, season: 2023, dedupeKey: 'MVP_2023', teamId: 1 },
        { type: AWARD_TYPES.MVP, season: 2024, dedupeKey: 'MVP_2024', teamId: 1 },
        { type: AWARD_TYPES.ALL_PRO_QB, season: 2023, dedupeKey: 'ALL_PRO_QB_2023', teamId: 1 },
        { type: AWARD_TYPES.LEAGUE_CHAMPION, season: 2024, dedupeKey: 'LEAGUE_CHAMPION_2024', teamId: 1 },
      ],
    };
    const summary = getPlayerAwardSummary(player);
    expect(summary.mvpCount).toBe(2);
    expect(summary.allProCount).toBe(1);
    expect(summary.championshipCount).toBe(1);
    expect(summary.totalAwards).toBe(4);
    expect(summary.summaryLine).toContain('MVP');
    expect(summary.summaryLine).toContain('All-Pro');
    expect(summary.summaryLine).toContain('Champion');
  });

  it('returns safe defaults for player with no awards field', () => {
    const summary = getPlayerAwardSummary({ id: 1, name: 'Test' });
    expect(summary.totalAwards).toBe(0);
    expect(summary.mvpCount).toBe(0);
    expect(summary.allProCount).toBe(0);
    expect(summary.championshipCount).toBe(0);
    expect(summary.highlights).toEqual([]);
    expect(summary.summaryLine).toBeNull();
  });

  it('returns safe defaults for null player', () => {
    const summary = getPlayerAwardSummary(null);
    expect(summary.totalAwards).toBe(0);
    expect(summary.summaryLine).toBeNull();
  });

  it('highlights are capped at 5 entries, sorted newest first', () => {
    const awards = Array.from({ length: 8 }, (_, i) => ({
      type: AWARD_TYPES.MVP,
      season: 2020 + i,
      dedupeKey: `MVP_${2020 + i}`,
      teamId: 1,
    }));
    const summary = getPlayerAwardSummary({ awards });
    expect(summary.highlights.length).toBe(5);
    // Newest first
    expect(summary.highlights[0].season).toBeGreaterThan(summary.highlights[1].season);
  });
});

// ── checkCareerMilestones ─────────────────────────────────────────────────────

describe('checkCareerMilestones', () => {
  it('fires 300_CAREER_TDs milestone when threshold crossed this season', () => {
    const player = {
      id: 1, name: 'QB Test', pos: 'QB', age: 32,
      careerStats: [
        { season: 's1', passTDs: 150, rushTDs: 10, recTDs: 0 },
        { season: 's2', passTDs: 140, rushTDs: 0, recTDs: 0 }, // total = 300
      ],
    };
    const milestone = checkCareerMilestones(player, 2025);
    expect(milestone).not.toBeNull();
    expect(milestone.type).toBe('300_CAREER_TDs');
    expect(milestone.totalTDs).toBe(300);
  });

  it('does not fire 300_CAREER_TDs if threshold was crossed in a prior season', () => {
    const player = {
      id: 1, name: 'QB Test', pos: 'QB', age: 35,
      careerStats: [
        { season: 's1', passTDs: 310, rushTDs: 0, recTDs: 0 },
        { season: 's2', passTDs: 30, rushTDs: 0, recTDs: 0 },
      ],
    };
    const milestone = checkCareerMilestones(player, 2025);
    // Was already at 310 before this season → no crossing this season
    expect(milestone?.type).not.toBe('300_CAREER_TDs');
  });

  it('fires HOF_ELIGIBLE for retired player age 35+ with OVR 85+', () => {
    const player = {
      id: 2, name: 'Ret Player', pos: 'QB', age: 36, ovr: 88,
      status: 'retired',
      awards: [],
      careerStats: [{ season: 's1', passTDs: 10, rushTDs: 0, recTDs: 0 }],
    };
    const milestone = checkCareerMilestones(player, 2025);
    expect(milestone).not.toBeNull();
    expect(milestone.type).toBe('HALL_OF_FAME_ELIGIBLE');
  });

  it('does not fire HOF_ELIGIBLE for active player', () => {
    const player = {
      id: 3, name: 'Active', pos: 'QB', age: 36, ovr: 88,
      status: 'active',
      awards: [],
      careerStats: [{ season: 's1', passTDs: 10 }],
    };
    const milestone = checkCareerMilestones(player, 2025);
    expect(milestone?.type).not.toBe('HALL_OF_FAME_ELIGIBLE');
  });

  it('returns null for player with no careerStats', () => {
    const player = { id: 4, name: 'Rookie', pos: 'QB', age: 22 };
    expect(checkCareerMilestones(player, 2025)).toBeNull();
  });

  it('returns null for null player', () => {
    expect(checkCareerMilestones(null, 2025)).toBeNull();
  });

  it('fires HOF_ELIGIBLE when 3+ MVP/DPOY even with OVR < 85', () => {
    const player = {
      id: 5, name: 'Legend', pos: 'QB', age: 37, ovr: 80,
      status: 'retired',
      awards: [
        { type: AWARD_TYPES.MVP, season: 2020, dedupeKey: 'MVP_2020' },
        { type: AWARD_TYPES.MVP, season: 2021, dedupeKey: 'MVP_2021' },
        { type: AWARD_TYPES.MVP, season: 2022, dedupeKey: 'MVP_2022' },
      ],
      careerStats: [{ season: 's1', passTDs: 50 }],
    };
    const milestone = checkCareerMilestones(player, 2025);
    expect(milestone?.type).toBe('HALL_OF_FAME_ELIGIBLE');
  });
});

// ── SEASON_END constant ───────────────────────────────────────────────────────

describe('SEASON_END constant', () => {
  it('is a non-empty string', () => {
    expect(typeof SEASON_END).toBe('string');
    expect(SEASON_END.length).toBeGreaterThan(0);
  });

  it('is used as the week field in player award entries', () => {
    const stats = [makeQBStats(1, 1, 4800, 38)];
    const { playerAwards } = determineSeasonAwards([], teams, season, { stats });
    for (const a of playerAwards) {
      expect(a.week).toBe(SEASON_END);
    }
  });
});
