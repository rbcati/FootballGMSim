import { describe, expect, it } from 'vitest';
import { normalizePlayLogs } from '../gameEvents.js';
import {
  buildDriveSummaryFromSimulation,
  buildQuarterScoresFromScoring,
  buildScoringSummaryFromSimulation,
} from '../gameSummary.js';

describe('game summary pipeline', () => {
  const context = { homeId: 1, awayId: 2, homeAbbr: 'HME', awayAbbr: 'AWY' };
  const rawLogs = [
    { quarter: 1, clock: '12:15', possession: 'home', text: 'QB finds WR for 12 yds.', type: 'pass', yards: 12, passer: { id: 10, name: 'QB' }, receiver: { id: 11, name: 'WR' }, homeScore: 0, awayScore: 0 },
    { quarter: 1, clock: '10:08', possession: 'home', text: 'TOUCHDOWN! 8-yard pass.', type: 'touchdown', isTouchdown: true, homeScore: 7, awayScore: 0, passer: { id: 10 }, receiver: { id: 11 } },
    { quarter: 2, clock: '04:41', possession: 'away', text: 'AWY field goal attempt... GOOD!', type: 'field_goal', homeScore: 7, awayScore: 3 },
  ];

  it('normalizes play logs with structured ids/team refs', () => {
    const logs = normalizePlayLogs(rawLogs, context);
    expect(logs[0].offenseTeamId).toBe(1);
    expect(logs[0].defenseTeamId).toBe(2);
    expect(logs[0].playType).toBe('pass');
    expect(logs[0].scoreHomeAfter).toBe(0);
  });

  it('builds explicit scoring summaries and quarter arrays', () => {
    const logs = normalizePlayLogs(rawLogs, context);
    const scoring = buildScoringSummaryFromSimulation(logs, context);
    const quarterScores = buildQuarterScoresFromScoring(scoring, context);
    expect(scoring).toHaveLength(2);
    expect(scoring[0].scoreType).toBe('touchdown');
    expect(scoring[0].passerId).toBe(10);
    expect(quarterScores.home[0]).toBe(7);
    expect(quarterScores.away[1]).toBe(3);
  });

  it('builds structured drive summaries', () => {
    const drives = buildDriveSummaryFromSimulation(normalizePlayLogs(rawLogs, context), context);
    expect(drives.length).toBeGreaterThan(0);
    expect(drives[0]).toEqual(expect.objectContaining({
      teamId: expect.any(Number),
      startClock: expect.any(String),
      startFieldPos: expect.anything(),
      plays: expect.any(Number),
      yards: expect.any(Number),
      result: expect.any(String),
      points: expect.any(Number),
    }));
  });
});
