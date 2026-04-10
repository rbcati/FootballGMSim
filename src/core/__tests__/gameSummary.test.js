import { describe, it, expect } from 'vitest';
import {
  buildDriveSummaryFromSimulation,
  buildGameNarrativeSummary,
  buildPlayerLeadersFromArchive,
  buildScoringSummaryFromSimulation,
  buildTeamStatComparisonFromArchive,
  buildTurningPointsFromGameEvents,
  classifyGameScript,
} from '../gameSummary.js';

const context = { homeId: 1, awayId: 2, homeAbbr: 'HME', awayAbbr: 'AWY' };

const shootoutLogs = [
  { quarter: 1, clock: '12:20', possession: 'home', text: 'TOUCHDOWN! WR Ace catches 25-yard TD pass from QB One!', tdType: 'pass', homeScore: 7, awayScore: 0, yards: 25 },
  { quarter: 1, clock: '08:44', possession: 'away', text: 'AWY field goal attempt... GOOD!', homeScore: 7, awayScore: 3 },
  { quarter: 4, clock: '02:10', possession: 'away', text: 'INTERCEPTION by CB Lock! Picks off QB One. AWY ball.', homeScore: 31, awayScore: 27, yardLine: 82 },
  { quarter: 4, clock: '01:31', possession: 'away', text: 'TOUCHDOWN! AWY passing TD!', tdType: 'pass', homeScore: 31, awayScore: 34 },
];

const boxScore = {
  home: {
    11: { name: 'QB One', pos: 'QB', stats: { passYd: 322, passTD: 3, interceptions: 1, passComp: 24, passAtt: 35 } },
    12: { name: 'RB Home', pos: 'RB', stats: { rushYd: 121, rushTD: 1 } },
  },
  away: {
    21: { name: 'WR Away', pos: 'WR', stats: { recYd: 141, recTD: 2, receptions: 9 } },
    22: { name: 'EDGE Away', pos: 'LB', stats: { sacks: 2, tackles: 7 } },
  },
};

describe('game summary builders', () => {
  it('builds scoring summary with event typing and score after', () => {
    const summary = buildScoringSummaryFromSimulation(shootoutLogs, context);
    expect(summary.length).toBeGreaterThanOrEqual(3);
    expect(summary[0].eventType).toBe('touchdown');
    expect(summary[0].scoreAfter).toEqual({ home: 7, away: 0 });
  });

  it('builds turning points from realistic late logs', () => {
    const points = buildTurningPointsFromGameEvents(shootoutLogs, context);
    expect(points.some((p) => /turnover|go-ahead|momentum/i.test(p.text))).toBe(true);
  });

  it('builds player leaders and player of the game', () => {
    const leaders = buildPlayerLeadersFromArchive(boxScore, context);
    expect(leaders.categories.passing?.name).toBe('QB One');
    expect(leaders.categories.rushing?.name).toBe('RB Home');
    expect(leaders.playerOfGame).toBeTruthy();
    expect(leaders.standouts.length).toBeGreaterThan(1);
  });

  it('builds team stat comparison totals', () => {
    const team = buildTeamStatComparisonFromArchive(boxScore, context);
    expect(team.home.totalYards).toBe(443);
    expect(team.away.sacks).toBe(2);
  });

  it('classifies game scripts and creates narrative copy', () => {
    expect(classifyGameScript({ homeScore: 41, awayScore: 38 })).toBe('shootout');
    expect(classifyGameScript({ homeScore: 13, awayScore: 10 })).toBe('defensive_struggle');
    expect(classifyGameScript({ homeScore: 38, awayScore: 10 })).toBe('blowout');

    const leaders = buildPlayerLeadersFromArchive(boxScore, context);
    const summary = buildGameNarrativeSummary({
      homeTeam: { id: 1, abbr: 'HME' },
      awayTeam: { id: 2, abbr: 'AWY' },
      homeScore: 41,
      awayScore: 38,
      gameScript: 'shootout',
      leaders,
      whyWon: 'HME controlled explosive passing downs.',
      isPlayoff: true,
      rivalry: true,
    });
    expect(summary).toContain('shootout');
    expect(summary).toContain('rivalry');
  });

  it('builds possession/drive summaries from play logs', () => {
    const drives = buildDriveSummaryFromSimulation(shootoutLogs, context);
    expect(drives.length).toBeGreaterThan(1);
    expect(drives[0]).toHaveProperty('plays');
  });
});
