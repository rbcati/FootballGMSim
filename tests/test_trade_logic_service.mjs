import { TradeLogicService } from '../trade-logic-service.js';

console.log('Running Trade Logic Service Tests...');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

function assertClose(actual, expected, tolerance = 0.1, message) {
    const diff = Math.abs(actual - expected);
    const valid = diff <= (expected * tolerance) || diff < 5; // tolerance or absolute small diff
    if (valid) {
        console.log(`✅ PASS: ${message} (Expected ~${expected}, Got ${actual})`);
        passed++;
    } else {
        console.error(`❌ FAIL: ${message} (Expected ~${expected}, Got ${actual})`);
        failed++;
    }
}

// 1. Draft Pick Valuation
console.log('\n--- Draft Pick Valuation ---');
assert(TradeLogicService.calculatePickValue(1, 1) === 3000, 'Pick 1.1 should be 3000');
assert(TradeLogicService.calculatePickValue(1, 16) === 1000, 'Pick 1.16 should be 1000');
assert(TradeLogicService.calculatePickValue(1, 32) === 590, 'Pick 1.32 should be 590');

// Future Discount
const currentVal = TradeLogicService.calculatePickValue(1, 1, 0);
const futureVal = TradeLogicService.calculatePickValue(1, 1, 1);
assertClose(futureVal, currentVal * 0.75, 0.01, 'Future pick (1 year) should be discounted by 25%');

// 2. Player Valuation
console.log('\n--- Player Valuation ---');

// Base Performance (99 OVR -> ~4000, 75 OVR -> ~800)
// We calculate expected salary dynamically to ensure 0 surplus for base value testing.
const expectedSalary99 = TradeLogicService.getExpectedSalary(99, 'QB');
const expectedSalary75 = TradeLogicService.getExpectedSalary(75, 'QB');

const p99 = { ovr: 99, age: 24, pos: 'QB', baseAnnual: expectedSalary99 }; // Prime age, exact fair contract
const val99 = TradeLogicService.calculatePlayerValue(p99);
console.log(`99 OVR Value: ${val99}`);
assertClose(val99, 4200, 0.1, '99 OVR Prime QB Fair Contract ~4200'); // Formula produces ~4260

const p75 = { ovr: 75, age: 24, pos: 'QB', baseAnnual: expectedSalary75 }; // Prime age, exact fair contract
const val75 = TradeLogicService.calculatePlayerValue(p75);
console.log(`75 OVR Value: ${val75}`);
assertClose(val75, 800, 0.1, '75 OVR Prime QB Fair Contract ~800'); // Formula produces ~813

// Age Decay
console.log('\n--- Age Decay ---');
// RB at 29 should be significantly lower than RB at 25
const rbSalary = TradeLogicService.getExpectedSalary(85, 'RB');
const rb25 = { ovr: 85, age: 25, pos: 'RB', baseAnnual: rbSalary };
const rb29 = { ovr: 85, age: 29, pos: 'RB', baseAnnual: rbSalary };

const valRB25 = TradeLogicService.calculatePlayerValue(rb25);
const valRB29 = TradeLogicService.calculatePlayerValue(rb29);

console.log(`RB 25 Value: ${valRB25}, RB 29 Value: ${valRB29}`);
assert(valRB29 < valRB25 * 0.85, 'RB at 29 should be significantly less valuable than at 25');

// QB at 33 should handle age better
const qbSalary = TradeLogicService.getExpectedSalary(85, 'QB');
const qb28 = { ovr: 85, age: 28, pos: 'QB', baseAnnual: qbSalary };
const qb33 = { ovr: 85, age: 33, pos: 'QB', baseAnnual: qbSalary };
const valQB28 = TradeLogicService.calculatePlayerValue(qb28);
const valQB33 = TradeLogicService.calculatePlayerValue(qb33);

console.log(`QB 28 Value: ${valQB28}, QB 33 Value: ${valQB33}`);
// QB decay starts at 32 (0.9), 33 (0.9^2 = 0.81).
assertClose(valQB33, valQB28 * 0.81, 0.1, 'QB at 33 should retain approx 81% value of prime');

// Contract Surplus
console.log('\n--- Contract Surplus ---');
// 80 OVR Player. Expected Salary ~8-10M depending on pos.
// Let's use WR. Multiplier 1.1. Base ~ (80-60)^2 * 0.017 = 400 * 0.017 = 6.8M. Total ~7.5M.
const wrFair = { ovr: 80, age: 26, pos: 'WR', baseAnnual: 7.5 };
const wrCheap = { ovr: 80, age: 26, pos: 'WR', baseAnnual: 2.0 }; // Surplus ~5.5M -> +550 pts
const wrExpensive = { ovr: 80, age: 26, pos: 'WR', baseAnnual: 15.0 }; // Deficit ~7.5M -> -750 pts

const vFair = TradeLogicService.calculatePlayerValue(wrFair);
const vCheap = TradeLogicService.calculatePlayerValue(wrCheap);
const vExpensive = TradeLogicService.calculatePlayerValue(wrExpensive);

console.log(`WR Fair: ${vFair}, WR Cheap: ${vCheap}, WR Expensive: ${vExpensive}`);
assert(vCheap > vFair + 400, 'Cheap contract should add significant value');
assert(vExpensive < vFair - 600, 'Expensive contract should subtract significant value');

// 3. Trade Acceptance
console.log('\n--- Trade Acceptance ---');
// AI gives: Pick 1.1 (3000)
// User must give: > 3150 (3000 * 1.05)

const aiAssets = [{ kind: 'pick', round: 1, pickInRound: 1, yearOffset: 0 }];
const userOfferGood = [{ kind: 'pick', round: 1, pickInRound: 1, yearOffset: 0 }, { kind: 'pick', round: 3, pickInRound: 1, yearOffset: 0 }]; // 3000 + 265 > 3150
const userOfferBad = [{ kind: 'pick', round: 1, pickInRound: 2, yearOffset: 0 }]; // 2600 < 3150

const evalGood = TradeLogicService.evaluateTrade(userOfferGood, aiAssets);
assert(evalGood.accepted === true, 'Trade with sufficient value should be accepted');
assert(evalGood.userValue >= evalGood.requiredValue, 'User value >= required value');

const evalBad = TradeLogicService.evaluateTrade(userOfferBad, aiAssets);
assert(evalBad.accepted === false, 'Trade with insufficient value should be rejected');
assert(evalBad.userValue < evalBad.requiredValue, 'User value < required value');

// Summary
console.log(`\nTests Completed: ${passed} Passed, ${failed} Failed.`);
if (failed > 0) process.exit(1);
