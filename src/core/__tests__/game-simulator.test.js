import { describe, it, expect } from 'vitest';
import {
  applyResult,
  calculateMomentumSwing,
  calculateQuarterbackRating,
  commitGameResult,
  decideLateGameSequence,
  getSimulationSpeedDelay,
  groupPlayersByPosition,
  initializePlayerStats,
  updateTeamStandings,
} from '../game-simulator.js';

describe('groupPlayersByPosition', () => {
  it('sorts by depthOrder first, then ovr descending', () => {
    const roster = [
      { id: 1, pos: 'QB', ovr: 89 },
      { id: 2, pos: 'QB', ovr: 82, depthOrder: 1 },
      { id: 3, pos: 'QB', ovr: 86, depthOrder: 2 },
    ];

    const grouped = groupPlayersByPosition(roster);
    expect(grouped.QB.map((p) => p.id)).toEqual([2, 3, 1]);
  });

  it('returns empty map for null roster', () => {
    expect(groupPlayersByPosition(null)).toEqual({});
  });
});

describe('initializePlayerStats', () => {
  it('creates game/season/career stat buckets when missing', () => {
    const player = {};
    initializePlayerStats(player);

    expect(player.stats).toBeTruthy();
    expect(player.stats.game).toBeTruthy();
    expect(player.stats.season).toBeTruthy();
    expect(player.stats.career).toBeTruthy();
  });
});

describe('updateTeamStandings', () => {
  it('increments wins/losses/points and syncs record alias fields', () => {
    const league = {
      teams: [{ id: 7, wins: 1, losses: 1, ties: 0, ptsFor: 40, ptsAgainst: 30 }],
    };

    const updated = updateTeamStandings(league, 7, {
      wins: 1,
      pf: 24,
      pa: 17,
    });

    expect(updated.wins).toBe(2);
    expect(updated.losses).toBe(1);
    expect(updated.ptsFor).toBe(64);
    expect(updated.ptsAgainst).toBe(47);
    expect(updated.record).toEqual({ w: 2, l: 1, t: 0, pf: 64, pa: 47 });
  });

  it('returns null when team id is unknown', () => {
    const league = { teams: [{ id: 1 }] };
    expect(updateTeamStandings(league, 999, { wins: 1 })).toBeNull();
  });
});

describe('applyResult', () => {
  it('marks game played and updates winner/loser standings and head-to-head', () => {
    const home = { id: 10, abbr: 'HOM' };
    const away = { id: 11, abbr: 'AWY' };
    const league = { teams: [home, away] };
    const game = { home, away, played: false };

    applyResult(league, game, 28, 17);

    expect(game.played).toBe(true);
    expect(game.homeScore).toBe(28);
    expect(game.awayScore).toBe(17);
    expect(home.wins).toBe(1);
    expect(away.losses).toBe(1);
    expect(home.headToHead[11].wins).toBe(1);
    expect(away.headToHead[10].losses).toBe(1);
  });
});

describe('commitGameResult archive shape', () => {
  it('stores structured summaries when provided by simulation output', () => {
    const league = {
      week: 1,
      year: 2030,
      teams: [
        { id: 1, name: 'Home', abbr: 'HME', roster: [] },
        { id: 2, name: 'Away', abbr: 'AWY', roster: [] },
      ],
      resultsByWeek: { 0: [] },
    };
    const result = commitGameResult(league, {
      homeTeamId: 1,
      awayTeamId: 2,
      homeScore: 24,
      awayScore: 17,
      stats: { home: { players: {} }, away: { players: {} } },
      playLogs: [{ quarter: 1, text: 'play' }],
      scoringSummary: [{ quarter: 1, teamId: 1, scoreType: 'touchdown', points: 7, text: 'TD' }],
      driveSummary: [{ teamId: 1, quarter: 1, startClock: '12:00', plays: 6, yards: 75, result: 'TD', points: 7 }],
      quarterScores: { home: [7, 7, 3, 7], away: [3, 7, 0, 7] },
    }, { persist: false });

    expect(result.scoringSummary).toHaveLength(1);
    expect(result.driveSummary).toHaveLength(1);
    expect(result.quarterScores.home[0]).toBe(7);
  });

  it('persists canonical player and team box score stats for future aggregation', () => {
    const league = {
      week: 1,
      year: 2030,
      teams: [
        {
          id: 1,
          name: 'Home',
          abbr: 'HME',
          roster: [
            { id: 'qb1', name: 'Home QB', pos: 'QB' },
            { id: 'rb1', name: 'Home RB', pos: 'RB' },
            { id: 'k1', name: 'Home K', pos: 'K' },
          ],
        },
        {
          id: 2,
          name: 'Away',
          abbr: 'AWY',
          roster: [
            { id: 'qb2', name: 'Away QB', pos: 'QB' },
            { id: 'edge2', name: 'Away Edge', pos: 'DL' },
            { id: 'p2', name: 'Away P', pos: 'P' },
          ],
        },
      ],
      resultsByWeek: { 0: [] },
    };

    const result = commitGameResult(league, {
      homeTeamId: 1,
      awayTeamId: 2,
      homeScore: 20,
      awayScore: 13,
      stats: {
        home: {
          players: {
            qb1: { passComp: 18, passAtt: 28, passYd: 220, passTD: 0, interceptions: 2, sacks: 3 },
            rb1: { rushAtt: 17, rushYd: 84, rushTD: 1, fumbles: 1 },
            k1: { fgMade: 2, fgAttempts: 2, xpMade: 2, xpAttempts: 2 },
          },
        },
        away: {
          players: {
            qb2: { passComp: 16, passAtt: 31, passYd: 188, passTD: 1, interceptions: 0 },
            edge2: { tackles: 6, sacks: 3, tacklesForLoss: 2, forcedFumbles: 1, fumbleRecs: 1 },
            p2: { punts: 4, puntYards: 184, avgPuntYards: 46, longestPunt: 58 },
          },
        },
      },
      scoringSummary: [{ quarter: 4, teamId: 1, scoreType: 'field_goal', points: 3, text: 'Late FG' }],
      quarterScores: { home: [7, 3, 7, 3], away: [0, 7, 3, 3] },
    }, { persist: false });

    expect(result.playerStats.home.qb1.teamId).toBe(1);
    expect(result.playerStats.home.qb1.playerId).toBe('qb1');
    expect(result.playerStats.home.qb1.stats.passerRating).toBeGreaterThan(0);
    expect(result.playerStats.home.qb1.stats.sacked).toBe(3);
    expect(result.playerStats.home.k1.stats.fieldGoalsMade).toBe(2);
    expect(result.playerStats.away.edge2.stats.fumbleRecoveries).toBe(1);
    expect(result.teamStats.home.passYards).toBe(220);
    expect(result.teamStats.home.turnovers).toBe(3);
    expect(result.teamStats.home.sacksAllowed).toBe(3);
    expect(result.resultSchemaVersion).toBe(1);
    expect(result.winnerTeamId).toBe(1);
    expect(Array.isArray(result.gameNarrative)).toBe(true);
    expect(result.gameNarrative.length).toBeGreaterThan(0);
    expect(result.topPerformers?.offenseLabel || result.topPerformers?.offense).toBeTruthy();
    const homeQb = result.boxScore.home.qb1;
    expect(homeQb.stats.passAtt).toBe(28);
    expect(homeQb.stats.receptions).toBeUndefined();
    const awayEdge = result.boxScore.away.edge2;
    expect(awayEdge.stats.tfl).toBe(2);
    expect(awayEdge.stats.sacks).toBe(3);
  });
});

describe('calculateQuarterbackRating', () => {
  it('returns 0 when there are no pass attempts', () => {
    expect(calculateQuarterbackRating({ completions: 0, attempts: 0, yards: 0, touchdowns: 0, interceptions: 0 })).toBe(0);
  });

  it('handles zero passing touchdowns and multiple interceptions without throwing', () => {
    const rating = calculateQuarterbackRating({
      completions: 20,
      attempts: 40,
      yards: 180,
      touchdowns: 0,
      interceptions: 3,
    });
    expect(Number.isFinite(rating)).toBe(true);
    expect(rating).toBeLessThan(80);
  });

  it('returns an elevated rating for efficient high-TD games', () => {
    const rating = calculateQuarterbackRating({
      completions: 26,
      attempts: 32,
      yards: 320,
      touchdowns: 4,
      interceptions: 0,
    });
    expect(rating).toBeGreaterThan(110);
  });
});

describe('immersive play helpers', () => {
  it('maps simulation speed options to expected delay values', () => {
    expect(getSimulationSpeedDelay('slow')).toBe(1400);
    expect(getSimulationSpeedDelay('medium')).toBe(800);
    expect(getSimulationSpeedDelay('instant')).toBe(0);
    expect(getSimulationSpeedDelay('unknown')).toBe(800);
  });

  it('calculates momentum swings with turnover and scoring context', () => {
    const tdSwing = calculateMomentumSwing({ yards: 18, isScoringPlay: true, offenseIsHome: true });
    const turnoverSwing = calculateMomentumSwing({ yards: 4, turnover: true, offenseIsHome: true });
    const awayExplosive = calculateMomentumSwing({ yards: 24, isExplosive: true, offenseIsHome: false });

    expect(tdSwing).toBeGreaterThan(10);
    expect(turnoverSwing).toBeLessThan(0);
    expect(awayExplosive).toBeLessThan(0);
  });

  it('returns realistic late-game decision hints', () => {
    const trailingFourthDown = decideLateGameSequence({
      quarter: 4,
      clockSeconds: 95,
      scoreDiff: -6,
      down: 4,
      distance: 1,
      yardLine: 63,
      timeouts: 1,
    });
    expect(trailingFourthDown.fourthDownChoice).toBe('go');
    expect(trailingFourthDown.useTimeout).toBe(true);
    expect(trailingFourthDown.goForTwo).toBe(false);

    const tieBreaker = decideLateGameSequence({
      quarter: 4,
      clockSeconds: 105,
      scoreDiff: -1,
      down: 3,
      distance: 5,
      yardLine: 70,
      timeouts: 2,
    });
    expect(tieBreaker.goForTwo).toBe(true);
  });
});
