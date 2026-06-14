import { describe, expect, it } from 'vitest';
import { deriveFeatsFromRichGame } from '../sim/featDerivation.js';

function makeResult(overrides = {}) {
  return {
    boxScore: {
      home: {},
      away: {},
    },
    ...overrides,
  };
}

describe('deriveFeatsFromRichGame', () => {
  it('returns empty array when result has no boxScore', () => {
    expect(deriveFeatsFromRichGame({})).toEqual([]);
    expect(deriveFeatsFromRichGame(null)).toEqual([]);
    expect(deriveFeatsFromRichGame(undefined)).toEqual([]);
  });

  it('returns empty array when no player meets a threshold', () => {
    const result = makeResult({
      boxScore: {
        home: {
          'qb-1': { name: 'Home QB', pos: 'QB', stats: { passYd: 299, rushYd: 0 } },
        },
        away: {
          'rb-1': { name: 'Away RB', pos: 'RB', stats: { rushYd: 99, recYd: 0 } },
        },
      },
    });
    expect(deriveFeatsFromRichGame(result)).toEqual([]);
  });

  it('derives a passing-yard feat at exactly 300 yards (boundary)', () => {
    const result = makeResult({
      boxScore: {
        home: {
          'qb-1': { name: 'Home QB', pos: 'QB', stats: { passYd: 300 } },
        },
        away: {},
      },
    });
    const feats = deriveFeatsFromRichGame(result);
    expect(feats).toHaveLength(1);
    expect(feats[0]).toMatchObject({
      playerId: 'qb-1',
      name: 'Home QB',
      teamSide: 'home',
      statValue: '300',
      featDescription: 'passing yards',
    });
  });

  it('derives a rushing-yard feat at exactly 100 yards (boundary)', () => {
    const result = makeResult({
      boxScore: {
        home: {},
        away: {
          'rb-2': { name: 'Away RB', pos: 'RB', stats: { rushYd: 100 } },
        },
      },
    });
    const feats = deriveFeatsFromRichGame(result);
    expect(feats).toHaveLength(1);
    expect(feats[0]).toMatchObject({
      playerId: 'rb-2',
      name: 'Away RB',
      teamSide: 'away',
      statValue: '100',
      featDescription: 'rushing yards',
    });
  });

  it('derives a receiving-yard feat at exactly 100 yards (boundary)', () => {
    const result = makeResult({
      boxScore: {
        home: {
          'wr-1': { name: 'Home WR', pos: 'WR', stats: { recYd: 100 } },
        },
        away: {},
      },
    });
    const feats = deriveFeatsFromRichGame(result);
    expect(feats).toHaveLength(1);
    expect(feats[0]).toMatchObject({
      playerId: 'wr-1',
      name: 'Home WR',
      teamSide: 'home',
      statValue: '100',
      featDescription: 'receiving yards',
    });
  });

  it('can derive multiple feat types for a single player (e.g. QB with 300+ pass and 100+ rush)', () => {
    const result = makeResult({
      boxScore: {
        home: {
          'qb-1': { name: 'Home QB', pos: 'QB', stats: { passYd: 350, rushYd: 112 } },
        },
        away: {},
      },
    });
    const feats = deriveFeatsFromRichGame(result);
    expect(feats).toHaveLength(2);
    const types = feats.map((f) => f.featDescription);
    expect(types).toContain('passing yards');
    expect(types).toContain('rushing yards');
  });

  it('derives feats from both home and away sides independently', () => {
    const result = makeResult({
      boxScore: {
        home: { 'qb-1': { name: 'H QB', pos: 'QB', stats: { passYd: 320 } } },
        away: { 'rb-1': { name: 'A RB', pos: 'RB', stats: { rushYd: 130 } } },
      },
    });
    const feats = deriveFeatsFromRichGame(result);
    expect(feats).toHaveLength(2);
    expect(feats.find((f) => f.teamSide === 'home')?.name).toBe('H QB');
    expect(feats.find((f) => f.teamSide === 'away')?.name).toBe('A RB');
  });

  it('is deterministic — same input produces identical output', () => {
    const result = makeResult({
      boxScore: {
        home: {
          'qb-1': { name: 'QB1', pos: 'QB', stats: { passYd: 302 } },
          'rb-1': { name: 'RB1', pos: 'RB', stats: { rushYd: 105 } },
        },
        away: {
          'wr-1': { name: 'WR1', pos: 'WR', stats: { recYd: 120 } },
        },
      },
    });
    expect(deriveFeatsFromRichGame(result)).toEqual(deriveFeatsFromRichGame(result));
  });

  it('does not generate feat news from rich-engine result when no threshold is met (no-fake-output guard)', () => {
    // Simulates a standard low-scoring defensive game — no player crests a feat threshold
    const result = makeResult({
      boxScore: {
        home: {
          'qb-1': { name: 'QB1', pos: 'QB', stats: { passYd: 180, rushYd: 12 } },
          'rb-1': { name: 'RB1', pos: 'RB', stats: { rushYd: 68 } },
          'wr-1': { name: 'WR1', pos: 'WR', stats: { recYd: 55 } },
        },
        away: {
          'qb-2': { name: 'QB2', pos: 'QB', stats: { passYd: 201, rushYd: 0 } },
          'rb-2': { name: 'RB2', pos: 'RB', stats: { rushYd: 71 } },
        },
      },
    });
    expect(deriveFeatsFromRichGame(result)).toHaveLength(0);
  });

  it('handles missing or malformed player entries gracefully', () => {
    const result = makeResult({
      boxScore: {
        home: {
          'p-null': null,
          'p-no-stats': { name: 'NoStats', pos: 'LB' },
          'p-good': { name: 'Good QB', pos: 'QB', stats: { passYd: 305 } },
        },
        away: null,
      },
    });
    const feats = deriveFeatsFromRichGame(result);
    expect(feats).toHaveLength(1);
    expect(feats[0].name).toBe('Good QB');
  });
});
