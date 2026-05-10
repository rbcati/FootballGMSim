import { describe, expect, it } from 'vitest';
import { buildPlayerDevelopmentModel } from '../../src/core/playerDevelopmentModel.js';

describe('playerDevelopmentModel', () => {
  it('returns safe unknown payload for missing player', () => {
    const m = buildPlayerDevelopmentModel(null);
    expect(m.devStage).toBe('unknown');
    expect(m.arcType).toBe('unknown');
    expect(m.confidence).toBe('low');
    expect(m.reasons.length).toBeGreaterThan(0);
  });

  it('classifies rookie/prime/veteran stages by age', () => {
    expect(buildPlayerDevelopmentModel({ id: 1, name: 'Y', pos: 'WR', age: 21, ovr: 72, potential: 82 }).devStage).toBe('rookie');
    expect(buildPlayerDevelopmentModel({ id: 2, name: 'P', pos: 'WR', age: 27, ovr: 80, potential: 82 }).devStage).toBe('prime');
    expect(buildPlayerDevelopmentModel({ id: 3, name: 'V', pos: 'WR', age: 35, ovr: 78, potential: 78 }).devStage).toBe('declining');
    expect(buildPlayerDevelopmentModel({ id: 4, name: 'VD', pos: 'WR', age: 39, ovr: 70, potential: 70 }).devStage).toBe('veteran_depth');
  });

  it('labels late bloomer when older player gains with upside gap', () => {
    const m = buildPlayerDevelopmentModel({
      id: 'x',
      pos: 'QB',
      age: 27,
      ovr: 76,
      potential: 86,
      progressionDelta: 3,
    });
    expect(m.arcType).toBe('late_bloomer');
    expect(m.devTrend).toBe('rising');
  });

  it('labels capped_out when near potential', () => {
    const m = buildPlayerDevelopmentModel({
      id: 'y',
      pos: 'CB',
      age: 28,
      ovr: 84,
      potential: 85,
      progressionDelta: 0,
    });
    expect(m.arcType).toBe('capped_out');
  });

  it('does not mutate player input', () => {
    const p = { id: 1, pos: 'RB', age: 24, ovr: 70, potential: 85 };
    const copy = { ...p };
    buildPlayerDevelopmentModel(p);
    expect(p).toEqual(copy);
  });
});
