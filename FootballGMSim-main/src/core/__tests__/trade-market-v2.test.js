import { describe, expect, it } from 'vitest';
import { classifyTeamDirection } from '../trade-logic.js';

describe('classifyTeamDirection', () => {
  it('labels high-performing teams as contenders', () => {
    expect(classifyTeamDirection({ wins: 9, losses: 3 }, 12)).toBe('contender');
  });

  it('labels low-performing teams as rebuilding later in season', () => {
    expect(classifyTeamDirection({ wins: 3, losses: 9 }, 12)).toBe('rebuilding');
  });

  it('labels mid-late underperformers as desperate', () => {
    expect(classifyTeamDirection({ wins: 5, losses: 7 }, 12)).toBe('desperate');
  });
});
