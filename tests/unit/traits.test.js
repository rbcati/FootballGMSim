
import { generateTraits, TRAITS } from '../../src/core/traits.js';
import { generateInjury } from '../../src/core/injury-core.js';
import assert from 'assert';

console.log('Running Traits Unit Tests...');

// 1. Test generateTraits
{
    console.log('Testing generateTraits...');
    const qbTraits = generateTraits('QB', 95, 10); // Force generation if possible, but count is just a limit?
    // Ah, generateTraits(pos, ovr, count) - count overrides logic.
    const t = generateTraits('QB', 95, 5);
    assert(Array.isArray(t), 'Should return array');
    t.forEach(id => {
        assert(TRAITS[id], `Invalid trait ID: ${id}`);
        assert(TRAITS[id].positions.includes('QB') || TRAITS[id].positions.includes('ALL'), `Invalid position for trait ${id}`);
    });

    const olTraits = generateTraits('OL', 95, 5);
    olTraits.forEach(id => {
        assert(TRAITS[id].positions.includes('OL') || TRAITS[id].positions.includes('ALL'));
        assert(!TRAITS[id].positions.includes('QB'), 'OL should not have QB traits');
    });
    console.log('PASS: generateTraits');
}

// 2. Test Injury Logic (Ironman)
{
    console.log('Testing Injury Logic...');
    const pNormal = { pos: 'LB', age: 25, traits: [] };
    const pIron = { pos: 'LB', age: 25, traits: [TRAITS.IRONMAN.id] };

    let nInj = 0;
    let iInj = 0;
    const N = 10000;

    for(let i=0; i<N; i++) {
        if (generateInjury(pNormal)) nInj++;
        if (generateInjury(pIron)) iInj++;
    }

    console.log(`Normal: ${nInj}, Ironman: ${iInj}`);
    assert(iInj < nInj, 'Ironman should reduce injuries');
    assert(iInj < nInj * 0.7, 'Ironman should reduce injuries significantly (~50%)');
    console.log('PASS: Injury Logic');
}

console.log('ALL TESTS PASSED');
