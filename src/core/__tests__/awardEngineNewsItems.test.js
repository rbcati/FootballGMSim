import { describe, it, expect } from 'vitest';
import {
  AWARD_TYPES,
  SEASON_END,
  determineSeasonAwards,
  applySeasonAwards,
} from '../awards/awardEngine.js';

// Minimal shared fixtures
const teams = [
  { id: 1, wins: 13, ovr: 78 },
  { id: 2, wins: 9, ovr: 72 },
];
const season = 2026;

function makeQB(id, teamId, passYd = 4800, passTD = 38) {
  return { playerId: id, name: `QB${id}`, pos: 'QB', teamId, totals: { gamesPlayed: 17, passYd, passTD, interceptions: 8 } };
}
function makeWR(id, teamId, recYd = 1600, recTD = 14) {
  return { playerId: id, name: `WR${id}`, pos: 'WR', teamId, totals: { gamesPlayed: 17, recYd, recTD, receptions: 90 } };
}

describe('MVP award dedupeKey stability', () => {
  it('MVP dedupeKey is always MVP_{season}', () => {
    const stats = [makeQB(1, 1)];
    const { playerAwards } = determineSeasonAwards([], teams, season, { stats });
    const mvp = playerAwards.find(a => a.type === AWARD_TYPES.MVP);
    expect(mvp?.dedupeKey).toBe(`MVP_${season}`);
  });

  it('same season cannot produce two MVP entries', () => {
    const stats = [makeQB(1, 1, 5000, 42), makeQB(2, 2, 4000, 30)];
    const awardResults = determineSeasonAwards([], teams, season, { stats });
    const mvps = awardResults.playerAwards.filter(a => a.type === AWARD_TYPES.MVP);
    expect(mvps.length).toBe(1);
  });
});

describe('LEAGUE_CHAMPION pulse dedupeKey stability', () => {
  it('champion franchise award dedupeKey is stable', () => {
    const stats = [makeQB(1, 1)];
    const { franchiseAwards } = determineSeasonAwards([], teams, season, { stats, championTeamId: 1 });
    const champ = franchiseAwards.find(a => a.type === AWARD_TYPES.LEAGUE_CHAMPION);
    expect(champ).toBeDefined();
    // dedupeKey on franchise awards = `${type}_${season}`
    expect(`${champ.type}_${champ.season}`).toBe(`LEAGUE_CHAMPION_${season}`);
  });
});

describe('All-Pro news item covers all positions', () => {
  it('allProTeam includes entries for each expected position when players exist', () => {
    const stats = [
      makeQB(1, 1),
      { playerId: 2, name: 'RB2', pos: 'RB', teamId: 1, totals: { gamesPlayed: 17, rushYd: 1600, rushTD: 15 } },
      makeWR(3, 1),
      makeWR(4, 2, 1400, 12),
      { playerId: 5, name: 'TE5', pos: 'TE', teamId: 1, totals: { gamesPlayed: 17, recYd: 900, recTD: 8, receptions: 70 } },
      { playerId: 6, name: 'K6', pos: 'K', teamId: 1, totals: { gamesPlayed: 17, fgMade: 35, xpMade: 40 } },
      { playerId: 7, name: 'P7', pos: 'P', teamId: 1, totals: { gamesPlayed: 17, punts: 60, puntYards: 2760 } },
    ];
    const { allProTeam } = determineSeasonAwards([], teams, season, { stats });
    const types = allProTeam.map(a => a.type);
    expect(types).toContain(AWARD_TYPES.ALL_PRO_QB);
    expect(types).toContain(AWARD_TYPES.ALL_PRO_RB);
    expect(types).toContain(AWARD_TYPES.ALL_PRO_WR);
    expect(types).toContain(AWARD_TYPES.ALL_PRO_TE);
    expect(types).toContain(AWARD_TYPES.ALL_PRO_K);
    expect(types).toContain(AWARD_TYPES.ALL_PRO_P);
  });
});

describe('award application does not duplicate same season', () => {
  it('applying same awardResults twice does not produce duplicates', () => {
    const stats = [makeQB(1, 1)];
    const awardResults = determineSeasonAwards([], teams, season, { stats });
    const playerMap = new Map([['1', { id: 1, name: 'QB1', pos: 'QB' }]]);

    // First apply
    const first = applySeasonAwards(playerMap, {}, awardResults);
    const updatedPlayer = { id: 1, name: 'QB1', pos: 'QB', awards: first.playerUpdates.get('1')?.awards ?? [] };
    const playerMap2 = new Map([['1', updatedPlayer]]);

    // Second apply — should not add duplicates
    const second = applySeasonAwards(playerMap2, { franchiseAwards: first.updatedFranchiseAwards }, awardResults);
    const finalAwards = second.playerUpdates.get('1')?.awards ?? updatedPlayer.awards;
    const mvpEntries = finalAwards.filter(a => a.type === AWARD_TYPES.MVP);
    expect(mvpEntries.length).toBeLessThanOrEqual(1);
  });
});
