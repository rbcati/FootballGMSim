import { describe, it, expect } from 'vitest';
import { deriveLeaders, deriveQuarterScores, deriveScoringSummary } from './boxScorePresentation.js';

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
});
