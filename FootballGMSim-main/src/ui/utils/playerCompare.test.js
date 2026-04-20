import { describe, expect, it } from 'vitest';
import { nextCompareIds } from './playerCompare';

describe('playerCompare selection', () => {
  it('adds/removes and caps compare list at two players', () => {
    expect(nextCompareIds([], 10, 2)).toEqual([10]);
    expect(nextCompareIds([10], 22, 2)).toEqual([10, 22]);
    expect(nextCompareIds([10, 22], 35, 2)).toEqual([22, 35]);
    expect(nextCompareIds([22, 35], 22, 2)).toEqual([35]);
  });
});
