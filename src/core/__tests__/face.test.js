import { describe, it, expect } from 'vitest';
import { ensureFaceConfig, generateFaceConfig } from '../face.js';

describe('face config helpers', () => {
  it('generates a valid face payload', () => {
    const face = generateFaceConfig('player-123');
    expect(face).toBeTruthy();
    expect(typeof face).toBe('object');
    expect(face.body).toBeTruthy();
  });

  it('adds missing face to entity without replacing existing face', () => {
    const player = { id: 'p1', name: 'Test Player' };
    const withFace = ensureFaceConfig(player, 'player');
    expect(withFace.face).toBeTruthy();
    const same = ensureFaceConfig(withFace, 'player');
    expect(same.face).toEqual(withFace.face);
  });
});
