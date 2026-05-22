import { describe, it, expect } from 'vitest';
import { buildPostgameEmotionalFrame } from '../../src/ui/utils/postgameEmotionalFrame.js';

const makeResult = (overrides = {}) => ({
  homeScore: 28,
  awayScore: 17,
  homeTeam: { id: 1 },
  awayTeam: { id: 2 },
  userTeamId: 1,
  week: 5,
  phase: 'regular',
  teamStats: {
    home: { passYds: 280, rushYds: 110, turnovers: 0 },
    away: { passYds: 190, rushYds: 70, turnovers: 2 },
  },
  ...overrides,
});

describe('buildPostgameEmotionalFrame — null safety', () => {
  it('returns null when gameResult is null', () => {
    expect(buildPostgameEmotionalFrame(null)).toBeNull();
  });

  it('returns null when gameResult is undefined', () => {
    expect(buildPostgameEmotionalFrame(undefined)).toBeNull();
  });

  it('builds frame from minimal valid gameResult', () => {
    const frame = buildPostgameEmotionalFrame({ homeScore: 21, awayScore: 14, userTeamId: 1, homeTeam: { id: 1 } });
    expect(frame).toBeTruthy();
    expect(frame.momentumDirection).toBeTruthy();
  });
});

describe('buildPostgameEmotionalFrame — biggestPositive', () => {
  it('returns null positive when tied', () => {
    const frame = buildPostgameEmotionalFrame(makeResult({ homeScore: 17, awayScore: 17 }));
    expect(frame.biggestPositive).toBeNull();
  });

  it('labels dominant win for large margin', () => {
    const frame = buildPostgameEmotionalFrame(makeResult({ homeScore: 42, awayScore: 7 }));
    expect(frame.biggestPositive?.label).toMatch(/dominant/i);
  });

  it('labels gutsy win for margin ≤ 3', () => {
    const frame = buildPostgameEmotionalFrame(makeResult({ homeScore: 17, awayScore: 14 }));
    expect(frame.biggestPositive?.label).toMatch(/gutsy/i);
  });

  it('labels comeback win when trailing 3 quarters and winning', () => {
    const result = makeResult({
      homeScore: 17,
      awayScore: 10,
      quarterScores: [[0, 0, 0, 17], [7, 3, 0, 0]],
    });
    const frame = buildPostgameEmotionalFrame(result);
    expect(frame.biggestPositive?.label).toMatch(/comeback/i);
  });

  it('returns null biggestPositive when user lost', () => {
    const frame = buildPostgameEmotionalFrame(makeResult({ homeScore: 7, awayScore: 35 }));
    expect(frame.biggestPositive).toBeNull();
  });
});

describe('buildPostgameEmotionalFrame — biggestConcern', () => {
  it('surfaces star injury as top concern', () => {
    const injuries = [{ name: 'Jake Reeves', injuryWeeksRemaining: 6, pos: 'QB' }];
    const frame = buildPostgameEmotionalFrame(makeResult(), [], injuries);
    expect(frame.biggestConcern?.label).toMatch(/injury/i);
    expect(frame.biggestConcern?.detail).toContain('Jake Reeves');
  });

  it('flags turnover problem when defense allows 3+', () => {
    const result = makeResult({
      teamStats: {
        home: { passYds: 220, rushYds: 90, turnovers: 3 },
        away: { passYds: 200, rushYds: 80, turnovers: 0 },
      },
    });
    const frame = buildPostgameEmotionalFrame(result);
    expect(frame.biggestConcern?.label).toMatch(/turnover/i);
  });

  it('flags stalled offense when both pass and rush yards are low', () => {
    const result = makeResult({
      teamStats: {
        home: { passYds: 100, rushYds: 60, turnovers: 0 },
        away: { passYds: 300, rushYds: 120, turnovers: 0 },
      },
    });
    const frame = buildPostgameEmotionalFrame(result);
    expect(frame.biggestConcern?.label).toMatch(/offense/i);
  });

  it('returns null concern on clean dominant win', () => {
    const result = makeResult({
      homeScore: 42,
      awayScore: 7,
      teamStats: {
        home: { passYds: 380, rushYds: 190, turnovers: 0 },
        away: { passYds: 120, rushYds: 40, turnovers: 0 },
      },
    });
    const frame = buildPostgameEmotionalFrame(result, [], []);
    expect(frame.biggestConcern).toBeNull();
  });
});

describe('buildPostgameEmotionalFrame — momentumDirection', () => {
  it('marks rising momentum on back-to-back wins', () => {
    const frame = buildPostgameEmotionalFrame(
      makeResult(),
      [],
      [],
      3, // positive momentumChange
      ['W', 'W'],
    );
    expect(frame.momentumDirection.icon).toBe('↑');
    expect(frame.momentumDirection.tone).toBe('ok');
  });

  it('marks pressure on consecutive losses', () => {
    const frame = buildPostgameEmotionalFrame(
      makeResult({ homeScore: 10, awayScore: 28 }),
      [],
      [],
      -3,
      ['L', 'L'],
    );
    expect(frame.momentumDirection.tone).toBe('danger');
  });

  it('marks balanced momentum when mixed recent results', () => {
    const frame = buildPostgameEmotionalFrame(
      makeResult(),
      [],
      [],
      0,
      ['W', 'L', 'W'],
    );
    expect(frame.momentumDirection.icon).toBe('→');
  });
});

describe('buildPostgameEmotionalFrame — standoutPlayer', () => {
  it('returns first leader as standout', () => {
    const leaders = [
      { name: 'Marcus Cole', pos: 'QB', statLine: '312 yds, 3 TD' },
      { name: 'Damon Wells', pos: 'RB', statLine: '112 yds' },
    ];
    const frame = buildPostgameEmotionalFrame(makeResult(), leaders);
    expect(frame.standoutPlayer?.name).toBe('Marcus Cole');
  });

  it('returns null when no leaders', () => {
    const frame = buildPostgameEmotionalFrame(makeResult(), []);
    expect(frame.standoutPlayer).toBeNull();
  });
});
