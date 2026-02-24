
import { calculateExtensionDemand } from '../src/core/player.js';
import { Utils } from '../src/core/utils.js';

// Initialize constants mock if needed, but player.js imports them.
// In Node environment, we rely on imports working.

function testContracts() {
    console.log('Starting Contract Logic Verification...');
    let failures = 0;

    const mockPlayer = {
        id: 1,
        pos: 'QB',
        age: 25,
        ovr: 90,
        ratings: {},
        contract: { years: 1, baseAnnual: 20 }
    };

    const demand = calculateExtensionDemand(mockPlayer);

    console.log('Extension Demand for 90 OVR QB Age 25:', demand);

    if (!demand) {
        console.error('FAIL: No demand generated');
        failures++;
    } else {
        if (demand.years < 4) { console.error('FAIL: Young elite QB should want long term deal'); failures++; }
        if (demand.baseAnnual < 20) { console.error('FAIL: Elite QB demand too low'); failures++; }
        if (!demand.signingBonus) { console.error('FAIL: Signing bonus missing'); failures++; }
    }

    const oldPlayer = { ...mockPlayer, age: 35, ovr: 75 };
    const oldDemand = calculateExtensionDemand(oldPlayer);
    console.log('Extension Demand for 75 OVR QB Age 35:', oldDemand);

    if (oldDemand.years > 2) { console.error('FAIL: Old player should want short term deal'); failures++; }

    if (failures === 0) console.log('✅ Contract Logic Verified');
    else console.error(`❌ Contract Verification Failed with ${failures} errors`);
}

testContracts();
