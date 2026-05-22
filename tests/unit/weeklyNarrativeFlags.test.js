import { describe, it, expect } from 'vitest';
import { deriveNarrativeFlags, narrativeFlagLabels } from '../../src/core/weeklyNarrativeFlags.js';

const makeGame = (overrides = {}) => ({
  homeScore: 24,
  awayScore: 17,
  home: 1,
  away: 2,
  injuries: [],
  quarterScores: null,
  ot: 0,
  ...overrides,
});

const makeTeams = (overrides = []) => [
  { id: 1, wins: 5, losses: 3, conf: 0, div: 0, recentResults: ['W', 'W', 'L', 'W', 'W'] },
  { id: 2, wins: 8, losses: 0, conf: 0, div: 1, recentResults: ['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'] },
  ...overrides,
];

describe('deriveNarrativeFlags — overtimeGame', () => {
  it('detects overtime via ot flag', () => {
    const flags = deriveNarrativeFlags(makeGame({ ot: 1 }), makeTeams());
    expect(flags.overtimeGame).toBe(true);
  });

  it('detects overtime via overtimePeriods', () => {
    const flags = deriveNarrativeFlags(makeGame({ overtimePeriods: 1 }), makeTeams());
    expect(flags.overtimeGame).toBe(true);
  });

  it('detects overtime via quarterScores length > 4', () => {
    const game = makeGame({ quarterScores: [[7, 0, 7, 10, 3], [7, 3, 7, 10, 0]] });
    const flags = deriveNarrativeFlags(game, makeTeams());
    expect(flags.overtimeGame).toBe(true);
  });

  it('returns false when no OT', () => {
    const flags = deriveNarrativeFlags(makeGame(), makeTeams());
    expect(flags.overtimeGame).toBe(false);
  });
});

describe('deriveNarrativeFlags — blowoutLoss', () => {
  it('flags blowout loss for user team', () => {
    const flags = deriveNarrativeFlags(
      makeGame({ homeScore: 10, awayScore: 42 }),
      makeTeams(),
      { userTeamId: 1 }, // home team (loser)
    );
    expect(flags.blowoutLoss).toBe(true);
  });

  it('does not flag blowout loss when user team won', () => {
    const flags = deriveNarrativeFlags(
      makeGame({ homeScore: 42, awayScore: 10 }),
      makeTeams(),
      { userTeamId: 1 },
    );
    expect(flags.blowoutLoss).toBe(false);
  });

  it('does not flag when margin is < 21', () => {
    const flags = deriveNarrativeFlags(
      makeGame({ homeScore: 10, awayScore: 27 }),
      makeTeams(),
      { userTeamId: 1 },
    );
    expect(flags.blowoutLoss).toBe(false);
  });
});

describe('deriveNarrativeFlags — divisionGame', () => {
  it('detects division rivalry (same conf and div)', () => {
    const teams = [
      { id: 1, wins: 4, losses: 4, conf: 0, div: 0 },
      { id: 2, wins: 6, losses: 2, conf: 0, div: 0 },
    ];
    const flags = deriveNarrativeFlags(makeGame({ home: 1, away: 2 }), teams);
    expect(flags.divisionGame).toBe(true);
  });

  it('does not flag cross-division game', () => {
    const teams = [
      { id: 1, wins: 4, losses: 4, conf: 0, div: 0 },
      { id: 2, wins: 6, losses: 2, conf: 0, div: 1 },
    ];
    const flags = deriveNarrativeFlags(makeGame({ home: 1, away: 2 }), teams);
    expect(flags.divisionGame).toBe(false);
  });
});

describe('deriveNarrativeFlags — upsetWin', () => {
  it('flags upset when underdog wins by wide record gap', () => {
    const teams = [
      { id: 1, wins: 2, losses: 6, conf: 0, div: 0 }, // winner (underdog)
      { id: 2, wins: 7, losses: 1, conf: 0, div: 1 }, // loser (favourite)
    ];
    const flags = deriveNarrativeFlags(
      makeGame({ home: 1, away: 2, homeScore: 28, awayScore: 21 }),
      teams,
    );
    expect(flags.upsetWin).toBe(true);
  });

  it('does not flag when teams have similar records', () => {
    const teams = [
      { id: 1, wins: 5, losses: 3 },
      { id: 2, wins: 6, losses: 2 },
    ];
    const flags = deriveNarrativeFlags(makeGame({ home: 1, away: 2 }), teams);
    expect(flags.upsetWin).toBe(false);
  });
});

describe('deriveNarrativeFlags — comebackWin', () => {
  it('detects comeback from large Q3 deficit', () => {
    // Home team was trailing 0-10 after 3 quarters but wins 17-10
    const game = makeGame({
      homeScore: 17,
      awayScore: 10,
      quarterScores: [
        [0, 0, 0, 17], // home
        [7, 3, 0, 0],  // away
      ],
    });
    const flags = deriveNarrativeFlags(game, makeTeams(), { userTeamId: 1 });
    expect(flags.comebackWin).toBe(true);
  });

  it('does not flag when team was never trailing', () => {
    const game = makeGame({
      homeScore: 31,
      awayScore: 7,
      quarterScores: [
        [10, 7, 7, 7],
        [0, 0, 7, 0],
      ],
    });
    const flags = deriveNarrativeFlags(game, makeTeams(), { userTeamId: 1 });
    expect(flags.comebackWin).toBe(false);
  });
});

describe('deriveNarrativeFlags — starPlayerInjury', () => {
  it('flags when a high-OVR player sustains a long injury', () => {
    const game = makeGame({
      injuries: [{ playerId: 42, playerOvr: 85, duration: 8, seasonEnding: false }],
    });
    const flags = deriveNarrativeFlags(game, makeTeams());
    expect(flags.starPlayerInjury).toBe(true);
  });

  it('does not flag when injured player has low OVR', () => {
    const game = makeGame({
      injuries: [{ playerId: 99, playerOvr: 65, duration: 8, seasonEnding: false }],
    });
    const flags = deriveNarrativeFlags(game, makeTeams());
    expect(flags.starPlayerInjury).toBe(false);
  });

  it('does not flag short injuries', () => {
    const game = makeGame({
      injuries: [{ playerId: 42, playerOvr: 90, duration: 2, seasonEnding: false }],
    });
    const flags = deriveNarrativeFlags(game, makeTeams());
    expect(flags.starPlayerInjury).toBe(false);
  });
});

describe('narrativeFlagLabels', () => {
  it('returns empty array when no flags set', () => {
    const labels = narrativeFlagLabels({
      upsetWin: false, divisionGame: false, overtimeGame: false, comebackWin: false,
      blowoutLoss: false, starPlayerInjury: false, playoffClinched: false, playoffEliminated: false,
    });
    expect(labels).toHaveLength(0);
  });

  it('returns correct labels for multiple flags', () => {
    const labels = narrativeFlagLabels({
      upsetWin: true, divisionGame: true, overtimeGame: false, comebackWin: false,
      blowoutLoss: false, starPlayerInjury: true, playoffClinched: false, playoffEliminated: false,
    });
    expect(labels).toContain('Upset');
    expect(labels).toContain('Division');
    expect(labels).toContain('Key Injury');
  });
});

describe('deriveNarrativeFlags — safe defaults', () => {
  it('returns all false when game has no data', () => {
    const flags = deriveNarrativeFlags({}, []);
    expect(flags.overtimeGame).toBe(false);
    expect(flags.divisionGame).toBe(false);
    expect(flags.upsetWin).toBe(false);
    expect(flags.comebackWin).toBe(false);
    expect(flags.blowoutLoss).toBe(false);
    expect(flags.starPlayerInjury).toBe(false);
    expect(flags.playoffClinched).toBe(false);
    expect(flags.playoffEliminated).toBe(false);
  });

  it('handles null game gracefully', () => {
    expect(() => deriveNarrativeFlags(null, [])).not.toThrow();
  });
});
