import { describe, it, expect } from 'vitest';
import {
  deriveLeaders,
  deriveQuarterScores,
  deriveScoringSummary,
  deriveStandoutStorylines,
  deriveTeamLeaders,
  getGameDetailSections,
  groupScoringByPeriod,
} from './boxScorePresentation.js';

describe('box score presentation fallback', () => {
  it('builds quarter scores from logs when quarterScores missing', () => {
    const game = { homeId: 1, awayId: 2 };
    const logs = [
      { quarter: 1, teamId: 2, text: 'Field goal', points: 3 },
      { quarter: 2, teamId: 1, isTouchdown: true, points: 6 },
      { quarter: 4, teamId: 1, text: 'extra point', points: 1 },
    ];
    const out = deriveQuarterScores(game, logs);
    expect(out.away[0]).toBe(3);
    expect(out.home[1]).toBe(6);
    expect(out.home[3]).toBe(1);
  });

  it('renders scoring summary entries from partial logs', () => {
    const rows = deriveScoringSummary([{ quarter: 3, clock: '2:11', text: 'Touchdown pass', teamId: 2 }], { 2: { abbr: 'BUF' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].teamAbbr).toBe('BUF');
    expect(rows[0].type).toBe('TD');
  });

  it('groups scoring rows by quarter for section rendering', () => {
    const groups = groupScoringByPeriod([
      { id: '1', quarter: 1, text: 'TD' },
      { id: '2', quarter: 1, text: 'FG' },
      { id: '3', quarter: 5, text: 'OT FG' },
    ]);
    expect(groups[0].period).toBe('Q1');
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].period).toBe('OT1');
  });

  it('uses archived summary leaders when detailed box stats are missing', () => {
    const leaders = deriveLeaders({
      summary: {
        leaders: {
          pass: { name: 'A. QB', pos: 'QB', stats: { passYd: 278, passTD: 2 } },
        },
      },
    });
    expect(leaders.pass?.name).toBe('A. QB');
    expect(leaders.pass?.stats?.passYd).toBe(278);
  });

  it('handles missing optional archive fields without crashing', () => {
    expect(getGameDetailSections({ homeScore: 10, awayScore: 7 }).quarterByQuarter).toBe(true);
    expect(getGameDetailSections({}).playLog).toBe(false);
  });

  it('keeps scoring summary ordering stable by quarter then game clock', () => {
    const rows = deriveScoringSummary([
      { quarter: 2, clock: '1:05', text: 'Touchdown pass', teamId: 2 },
      { quarter: 1, clock: '0:59', text: 'Field goal', teamId: 1 },
      { quarter: 2, clock: '10:30', text: 'Field goal', teamId: 1 },
    ], { 1: { abbr: 'KC' }, 2: { abbr: 'BUF' } });
    expect(rows.map((row) => `${row.quarter}-${row.clock}`)).toEqual(['1-0:59', '2-10:30', '2-1:05']);
  });

  it('derives per-team leaders and deterministic data-driven storylines', () => {
    const game = {
      awayId: 2,
      homeId: 1,
      awayScore: 27,
      homeScore: 20,
      topReason1: 'Pocket survived pressure',
      playerStats: {
        away: {
          20: { name: 'Away QB', pos: 'QB', stats: { passComp: 22, passAtt: 31, passYd: 288, passTD: 2 } },
          21: { name: 'Away RB', pos: 'RB', stats: { rushAtt: 18, rushYd: 92, rushTD: 1 } },
          22: { name: 'Away WR', pos: 'WR', stats: { receptions: 7, recYd: 118, recTD: 1 } },
          23: { name: 'Away LB', pos: 'LB', stats: { tackles: 9, sacks: 2, interceptions: 1 } },
          24: { name: 'Away K', pos: 'K', stats: { fieldGoalsMade: 2, fieldGoalsAttempted: 2, extraPointsMade: 3, extraPointsAttempted: 3 } },
        },
        home: {
          10: { name: 'Home QB', pos: 'QB', stats: { passComp: 18, passAtt: 30, passYd: 236, passTD: 1, interceptions: 2 } },
          11: { name: 'Home LB', pos: 'LB', stats: { tackles: 8, sacks: 1 } },
        },
      },
    };
    const teamLeaders = deriveTeamLeaders(game);
    expect(teamLeaders.away.passing?.name).toBe('Away QB');
    expect(teamLeaders.away.kicking?.name).toBe('Away K');

    const storylineInput = {
      game,
      awayTeam: { abbr: 'BUF' },
      homeTeam: { abbr: 'KC' },
      teamTotals: {
        away: { turnovers: 1, sacks: 4, totalYards: 410, passYards: 288, rushYards: 122, thirdDownMade: 8, thirdDownAtt: 12 },
        home: { turnovers: 3, sacks: 2, totalYards: 338, passYards: 236, rushYards: 102, thirdDownMade: 4, thirdDownAtt: 14 },
      },
      driveStats: {
        away: { redZoneScores: 3, redZoneTrips: 4, explosivePlays: 6 },
        home: { redZoneScores: 1, redZoneTrips: 3, explosivePlays: 3 },
      },
    };
    const firstRun = deriveStandoutStorylines(storylineInput);
    const secondRun = deriveStandoutStorylines(storylineInput);
    expect(firstRun).toEqual(secondRun);
    expect(firstRun.length).toBeGreaterThanOrEqual(3);
    expect(firstRun.join(' ')).toContain('critical third-down conversion battle');
    expect(firstRun.join(' ')).toContain('red-zone finishing');
  });

  it('fails safely with partial or malformed payloads', () => {
    const storylines = deriveStandoutStorylines({ game: { id: 'test' } });
    expect(Array.isArray(storylines)).toBe(true);

    const leaders = deriveLeaders(null);
    expect(leaders).toBeDefined();

    const scoring = deriveScoringSummary(undefined);
    expect(scoring).toEqual([]);
  });
});
