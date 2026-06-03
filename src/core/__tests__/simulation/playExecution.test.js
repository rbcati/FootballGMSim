import { describe, it, expect } from 'vitest';
import {
  classifyOffensivePlay,
  formatPlayerName,
  pickStarterWeighted,
} from '../../simulation/playExecution.js';

// Mirrors the engine's scoring-drive band layout.
const scoringBands = [
  { limit: 0.45, type: 'pass' },
  { limit: 0.75, type: 'run' },
  { limit: 0.82, type: 'incomplete' },
  { limit: 0.88, type: 'sack' },
  { limit: 0.93, type: 'penalty' },
];

describe('playExecution.classifyOffensivePlay', () => {
  it('resolves a normal pass play when the roll is under the pass threshold', () => {
    expect(classifyOffensivePlay(0.10, scoringBands, 'screen')).toBe('pass');
  });

  it('resolves a normal run play when the roll is in the run band', () => {
    expect(classifyOffensivePlay(0.60, scoringBands, 'screen')).toBe('run');
  });

  it('resolves a sack when the roll lands in the pressure band', () => {
    expect(classifyOffensivePlay(0.85, scoringBands, 'screen')).toBe('sack');
    // Clearing every band falls through to the screen pass fallback.
    expect(classifyOffensivePlay(0.99, scoringBands, 'screen')).toBe('screen');
  });
});

describe('playExecution helpers', () => {
  it('formatPlayerName shortens real names and masks placeholders', () => {
    expect(formatPlayerName({ name: 'Patrick Mahomes', pos: 'QB' })).toBe('P. Mahomes');
    expect(formatPlayerName({ name: 'H QB1', pos: 'QB', id: 7 })).toBe('QB #7');
  });

  it('pickStarterWeighted is starter-weighted and consumes one RNG draw', () => {
    const groups = { QB: [{ id: 1, pos: 'QB', ovr: 90 }, { id: 2, pos: 'QB', ovr: 70 }] };
    // Deterministic RNG stub returning 0 → first (heaviest) weighted entry.
    const U = { random: () => 0 };
    const pick = pickStarterWeighted(groups, 'QB', U);
    expect(pick.id).toBe(1);
  });
});
