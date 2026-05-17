import { describe, it, expect } from 'vitest';
import { buildBoxScoreViewModel, unwrapBoxScoreResponse } from './boxScoreViewModel.js';
import { buildGameBookStory } from './gameBookStory.js';

describe('buildBoxScoreViewModel', () => {
  it('unwraps BOX_SCORE envelopes with explicit null payload game values', () => {
    expect(unwrapBoxScoreResponse({ type: 'BOX_SCORE', payload: { game: null, error: 'not found' } })).toBeNull();
  });

  it('unwraps top-level explicit null game values', () => {
    expect(unwrapBoxScoreResponse({ game: null })).toBeNull();
  });

  it('unwraps valid payload.game and top-level game values', () => {
    const payloadGame = { homeScore: 14, awayScore: 10 };
    const topLevelGame = { homeScore: 21, awayScore: 17 };
    expect(unwrapBoxScoreResponse({ type: 'BOX_SCORE', payload: { game: payloadGame } })).toBe(payloadGame);
    expect(unwrapBoxScoreResponse({ game: topLevelGame })).toBe(topLevelGame);
  });

  it('classifies full detail when major sections exist', () => {
    const vm = buildBoxScoreViewModel({ game: { played: true, homeId: 1, awayId: 2, homeScore: 21, awayScore: 17, quarterScores: { home: [7,7,7,0], away: [3,7,0,7] }, teamStats: { home: { passYards: 220 }, away: { passYards: 200 } }, playerStats: { home: { '10': { name: 'QB', stats: { passAtt: 20 } } }, away: {} } } });
    expect(vm.archiveQuality).toBe('Full detail');
    expect(vm.detailWarning).toBeNull();
  });

  it('classifies partial detail warning copy', () => {
    const vm = buildBoxScoreViewModel({ game: { played: true, homeScore: 10, awayScore: 7, teamStats: { home: { passYards: 100 }, away: {} } } });
    expect(vm.archiveQuality).toBe('Partial detail');
    expect(vm.detailWarning).toContain('Partial archive');
  });

  it('classifies score only data warning copy', () => {
    const vm = buildBoxScoreViewModel({ game: { played: true, homeScore: 3, awayScore: 0 } });
    expect(vm.archiveQuality).toBe('Score only');
    expect(vm.detailWarning).toContain('Detailed box score data');
  });

  it('classifies missing detail when score unavailable', () => {
    const vm = buildBoxScoreViewModel({});
    expect(vm.archiveQuality).toBe('Missing detail');
  });

  it('builds factual game story bullets from available data only', () => {
    const vm = buildBoxScoreViewModel({ game: { homeId: 1, awayId: 2, homeScore: 17, awayScore: 20, teamStats: { home: { turnovers: 2, totalYards: 290 }, away: { turnovers: 0, totalYards: 350 } }, playerStats: { away: { 1: { name: 'A QB', stats: { passYd: 294, passTD: 3 } } }, home: {} } } });
    const story = buildGameBookStory(vm).join(' ');
    expect(story).toContain('turnover battle');
    expect(story).toContain('294 passing yards');
  });

  it('builds final score headline and team comparison rows from existing stats only', () => {
    const vm = buildBoxScoreViewModel({
      league: { teams: [{ id: 1, abbr: 'KC' }, { id: 2, abbr: 'BUF' }] },
      game: {
        played: true,
        homeId: 1,
        awayId: 2,
        homeScore: 24,
        awayScore: 27,
        teamStats: { home: { totalYards: 330, turnovers: 2 }, away: { totalYards: 360, turnovers: 0 } },
      },
    });
    expect(vm.finalScoreLine).toBe('BUF 27 - 24 KC');
    expect(vm.headlineSummary).toBe('BUF defeated KC by 3');
    expect(vm.teamComparisonRows.map((row) => row.label)).toEqual(['Total Yards', 'Turnovers']);
    expect(vm.teamComparisonRows.find((row) => row.key === 'turnovers')?.winner).toBe('away');
  });

  it('uses the completed schedule result as score source of truth over stale archive scores', () => {
    const vm = buildBoxScoreViewModel({
      league: { teams: [{ id: 1, abbr: 'PIT' }, { id: 2, abbr: 'MIN' }] },
      game: { gameId: '2031_w4_1_2', homeId: 1, awayId: 2, homeScore: 0, awayScore: 0, playerStats: { home: {}, away: {} } },
      scheduleGame: { gameId: '2031_w4_1_2', home: { id: 1, abbr: 'PIT' }, away: { id: 2, abbr: 'MIN' }, homeScore: 13, awayScore: 24, played: true, week: 4 },
    });
    expect(vm.finalScore).toEqual({ home: 13, away: 24 });
    expect(vm.finalScoreLine).toBe('MIN 24 - 13 PIT');
  });

  it('builds sorted player stat sections with stable defaults', () => {
    const vm = buildBoxScoreViewModel({
      game: {
        homeId: 1,
        awayId: 2,
        homeScore: 14,
        awayScore: 10,
        playerStats: {
          home: {
            10: { name: 'Lower QB', stats: { passAtt: 20, passYd: 150 } },
            11: { name: 'Higher QB', stats: { passAtt: 25, passYd: 240 } },
          },
          away: {
            20: { name: 'Away RB', stats: { rushAtt: 15, rushYd: 80 } },
          },
        },
      },
    });
    const passing = vm.playerStatSections.find((section) => section.key === 'passing');
    expect(passing?.showingLabel).toBe('Showing 2 passers');
    expect(passing?.teams.home.map((player) => player.name)).toEqual(['Higher QB', 'Lower QB']);
    expect(vm.playerStatSections.find((section) => section.key === 'rushing')?.teams.away[0].name).toBe('Away RB');
  });


  it('builds deterministic top performer cards for passing/rushing/receiving/defense/kicking only from recorded stats', () => {
    const vm = buildBoxScoreViewModel({
      game: {
        homeId: 1,
        awayId: 2,
        homeScore: 31,
        awayScore: 24,
        playerStats: {
          home: {
            11: { name: 'Home QB', stats: { passAtt: 31, passYd: 280, passTD: 2 } },
            22: { name: 'Home WR', stats: { targets: 9, receptions: 7, recYd: 118, recTD: 1 } },
            44: { name: 'Home K', stats: { fieldGoalsAttempted: 2, fieldGoalsMade: 2, extraPointsAttempted: 3, extraPointsMade: 3, points: 9 } },
          },
          away: {
            33: { name: 'Away RB', stats: { rushAtt: 18, rushYd: 121, rushTD: 1 } },
            55: { name: 'Away Edge', stats: { tackles: 5, sacks: 2, forcedFumbles: 1 } },
          },
        },
      },
    });
    expect(vm.statLeaderCards.map((card) => card.key)).toEqual(['passing', 'rushing', 'receiving', 'defense', 'kicking']);
    expect(vm.statLeaderCards.find((card) => card.key === 'passing')?.line).toContain('Home QB');
    expect(vm.statLeaderCards.find((card) => card.key === 'rushing')?.line).toContain('Away RB');
    expect(vm.statLeaderCards.find((card) => card.key === 'receiving')?.line).toContain('Home WR');
    expect(vm.statLeaderCards.find((card) => card.key === 'defense')?.line).toContain('Away Edge');
    expect(vm.statLeaderCards.find((card) => card.key === 'kicking')?.line).toContain('Home K');
  });

  it('marks stat leader cards unavailable instead of fabricating missing groups', () => {
    const vm = buildBoxScoreViewModel({ game: { homeId: 1, awayId: 2, homeScore: 13, awayScore: 10, playerStats: { home: {}, away: {} } } });
    expect(vm.statLeaderCards).toHaveLength(5);
    expect(vm.statLeaderCards.every((card) => card.available === false && card.line === 'Not recorded')).toBe(true);
  });

  it('does not render quarter/scoring availability when old archives omit those sections', () => {
    const vm = buildBoxScoreViewModel({ game: { homeId: 1, awayId: 2, homeScore: 6, awayScore: 3 } });
    expect(vm.archiveQuality).toBe('Score only');
    expect(vm.availableData.quarterScores).toBe(false);
    expect(vm.availableData.scoringSummary).toBe(false);
    expect(vm.playerStatSections).toEqual([]);
  });

  it('normalizes drive, play, turning point, notable performance, and injury rows from rich archives', () => {
    const vm = buildBoxScoreViewModel({
      league: { teams: [{ id: 1, abbr: 'KC' }, { id: 2, abbr: 'BUF' }] },
      game: {
        gameId: 'rich-game',
        homeId: 1,
        awayId: 2,
        homeScore: 27,
        awayScore: 24,
        driveSummary: [
          { driveId: 'd1', teamId: 1, quarter: 4, startClock: '5:12', endClock: '1:02', result: 'TD', plays: 8, yards: 75, points: 7 },
        ],
        playLog: [
          { id: 'p1', quarter: 4, clock: '5:12', teamId: 1, text: 'Pass complete for 22 yards', yards: 22, scoreHomeAfter: 20, scoreAwayAfter: 24 },
          { id: 'p2', quarter: 4, clock: '1:02', teamId: 1, text: 'Touchdown pass gives KC the lead', isTouchdown: true, scoreHomeAfter: 27, scoreAwayAfter: 24 },
        ],
        turningPoints: [
          { id: 't1', quarter: 4, clock: '1:02', teamId: 1, text: 'Go-ahead touchdown capped the final scoring drive.' },
        ],
        notablePerformances: [
          { playerId: 11, name: 'Home QB', teamId: 1, label: 'QB', text: 'Three touchdown passes' },
        ],
        injuries: [
          { playerId: 22, name: 'Away RB', teamId: 2, injury: 'Ankle', duration: '2 weeks' },
        ],
      },
    });
    expect(vm.driveSummaryRows[0]).toMatchObject({ teamAbbr: 'KC', result: 'TD', plays: 8, yards: 75, points: 7 });
    expect(vm.playByPlayRows.map((row) => row.teamAbbr)).toEqual(['KC', 'KC']);
    expect(vm.playByPlayRows[0].tags).toContain('explosive');
    expect(vm.playByPlayRows[1].tags).toContain('scoring');
    expect(vm.turningPointRows[0]).toMatchObject({ source: 'recorded', inferred: false, teamAbbr: 'KC' });
    expect(vm.notablePerformanceRows[0]).toMatchObject({ name: 'Home QB', teamAbbr: 'KC' });
    expect(vm.injuryRows[0]).toMatchObject({ name: 'Away RB', teamAbbr: 'BUF', detail: 'Ankle' });
    expect(vm.availableData).toMatchObject({ drives: true, playByPlay: true, turningPoints: true, notablePerformances: true, injuries: true });
  });

  it('does not throw on malformed story-layer arrays and keeps score-only fallback arrays empty', () => {
    expect(() => buildBoxScoreViewModel({
      game: {
        homeId: 1,
        awayId: 2,
        homeScore: 3,
        awayScore: 0,
        driveSummary: 'bad',
        playLog: { bad: true },
        turningPoints: null,
        notablePerformances: 'bad',
        injuries: 42,
      },
    })).not.toThrow();
    const vm = buildBoxScoreViewModel({
      game: { homeId: 1, awayId: 2, homeScore: 3, awayScore: 0, driveSummary: 'bad', playLog: { bad: true } },
    });
    expect(vm.archiveQuality).toBe('Score only');
    expect(vm.driveSummaryRows).toEqual([]);
    expect(vm.playByPlayRows).toEqual([]);
    expect(vm.turningPointRows).toEqual([]);
    expect(vm.notablePerformanceRows).toEqual([]);
    expect(vm.injuryRows).toEqual([]);
  });

  it('conservatively infers turning points from recorded scoring and key play rows', () => {
    const vm = buildBoxScoreViewModel({
      league: { teams: [{ id: 1, abbr: 'KC' }, { id: 2, abbr: 'BUF' }] },
      game: {
        homeId: 1,
        awayId: 2,
        homeScore: 20,
        awayScore: 17,
        scoringSummary: [
          { quarter: 4, time: '0:44', teamAbbr: 'KC', type: 'FG', scoreAfter: { home: 20, away: 17 } },
        ],
        playLog: [
          { id: 'late-sack', quarter: 4, clock: '1:10', teamId: 1, text: 'Sack forces third and long', yards: -8 },
        ],
      },
    });
    expect(vm.turningPointRows.length).toBeGreaterThan(0);
    expect(vm.turningPointRows[0].source).toBe('inferred');
  });

  it('uses eventDigest as a play-by-play fallback with side and clock normalization', () => {
    const vm = buildBoxScoreViewModel({
      league: { teams: [{ id: 1, abbr: 'HME' }, { id: 2, abbr: 'AWY' }] },
      game: {
        homeId: 1,
        awayId: 2,
        homeScore: 20,
        awayScore: 24,
        eventDigest: [
          { quarter: 4, clockSec: 89, team: 'away', type: 'turnover', text: 'Late interception seals it', awayScore: 24, homeScore: 20, turnover: true },
        ],
      },
    });
    expect(vm.playByPlayRows[0]).toMatchObject({ teamAbbr: 'AWY', clock: '1:29', text: 'Late interception seals it' });
    expect(vm.playByPlayRows[0].tags).toContain('turnover');
  });
});
