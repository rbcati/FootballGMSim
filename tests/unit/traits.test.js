import { describe, expect, it } from 'vitest';
import { generateTraits, TRAITS } from '../../src/core/traits.js';
import { generateInjury } from '../../src/core/injury-core.js';

describe('traits unit coverage', () => {
  it('generateTraits returns valid position-compatible trait ids', () => {
    const qbTraits = generateTraits('QB', 95, 5);
    expect(Array.isArray(qbTraits)).toBe(true);
    for (const id of qbTraits) {
      expect(TRAITS[id]).toBeTruthy();
      expect(TRAITS[id].positions.includes('QB') || TRAITS[id].positions.includes('ALL')).toBe(true);
    }

    const olTraits = generateTraits('OL', 95, 5);
    for (const id of olTraits) {
      expect(TRAITS[id].positions.includes('OL') || TRAITS[id].positions.includes('ALL')).toBe(true);
      expect(TRAITS[id].positions.includes('QB')).toBe(false);
    }
  });

  it('ironman trait reduces injury probability over large sample', () => {
    const pNormal = { pos: 'LB', age: 25, traits: [] };
    const pIron = { pos: 'LB', age: 25, traits: [TRAITS.IRONMAN.id] };

    let normalInjuries = 0;
    let ironInjuries = 0;
    const samples = 5000;

    for (let i = 0; i < samples; i += 1) {
      if (generateInjury(pNormal)) normalInjuries += 1;
      if (generateInjury(pIron)) ironInjuries += 1;
    }

    expect(ironInjuries).toBeLessThan(normalInjuries);
    expect(ironInjuries).toBeLessThan(normalInjuries * 0.75);
  });
});
