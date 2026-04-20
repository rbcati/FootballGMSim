import { afterEach, describe, expect, it, vi } from 'vitest';
import { processPlayerProgression } from '../progression-logic.js';
import { Utils } from '../utils.js';

function buildPlayer(overrides = {}) {
  return {
    id: 1,
    name: 'Test Player',
    teamId: 1,
    pos: 'QB',
    age: 23,
    ovr: 75,
    potential: 82,
    devTrait: 'Normal',
    ratings: {
      throwPower: 75,
      accuracyShort: 75,
      accuracyMedium: 75,
      accuracyDeep: 75,
      awareness: 75,
      speed: 75,
      agility: 75,
      acceleration: 75,
    },
    ...overrides,
  };
}

describe('processPlayerProgression', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips retired and draft eligible players', () => {
    const retired = buildPlayer({ id: 2, status: 'retired' });
    const prospect = buildPlayer({ id: 3, status: 'draft_eligible' });

    const result = processPlayerProgression([retired, prospect]);
    expect(result.gainers).toHaveLength(0);
    expect(result.regressors).toHaveLength(0);
    expect(result.breakouts).toHaveLength(0);
  });

  it('applies breakout growth and raises potential floor for young players', () => {
    const player = buildPlayer({ personality: { traits: ['High Work Ethic'] } });

    vi.spyOn(Utils, 'random').mockReturnValue(0.01); // trigger breakout path
    vi.spyOn(Utils, 'rand').mockImplementation((min, max) => max);

    const result = processPlayerProgression([player]);

    expect(player.ovr).toBeGreaterThanOrEqual(70);
    expect(player.potential).toBeGreaterThanOrEqual(player.ovr);
    expect(result.breakouts).toHaveLength(1);
  });

  it('caps ratings within valid bounds after severe decline', () => {
    const veteran = buildPlayer({
      age: 33,
      ovr: 90,
      devTrait: 'Normal',
      ratings: {
        throwPower: 99,
        accuracyShort: 99,
        accuracyMedium: 99,
        accuracyDeep: 99,
        awareness: 99,
        speed: 99,
      },
    });

    vi.spyOn(Utils, 'random').mockReturnValue(0.1); // trigger cliff
    vi.spyOn(Utils, 'rand').mockImplementation((min) => min);

    processPlayerProgression([veteran]);

    const allRatings = Object.values(veteran.ratings);
    expect(Math.min(...allRatings)).toBeGreaterThanOrEqual(40);
    expect(Math.max(...allRatings)).toBeLessThanOrEqual(99);
  });
});
