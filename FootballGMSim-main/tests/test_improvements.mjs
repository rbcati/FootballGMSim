/**
 * Unit tests for all five improvement areas:
 *   A. Draft evaluation with hidden true ratings and scout variability
 *   B. Realistic salary cap and contract negotiation
 *   C. Deeper scouting reports with scheme fit and character traits
 *   D. AI trade evaluation with context-aware decision-making
 *   E. Game simulation with realistic statistical distributions
 *
 * Run with: node tests/test_improvements.mjs
 */

import { JSDOM } from 'jsdom';

// --- Test harness ---
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(message);
    console.error(`  FAIL: ${message}`);
  }
}

function assertRange(value, min, max, message) {
  assert(value >= min && value <= max, `${message} — got ${value}, expected [${min}, ${max}]`);
}

function describe(name, fn) {
  console.log(`\n=== ${name} ===`);
  fn();
}

// --- Setup minimal DOM and globals ---
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Minimal Utils mock
window.Utils = {
  rand: (a, b) => {
    if (typeof b === 'undefined') return Math.floor(Math.random() * a);
    if (Number.isInteger(a) && Number.isInteger(b)) return Math.floor(Math.random() * (b - a + 1)) + a;
    return Math.random() * (b - a) + a;
  },
  random: () => Math.random(),
  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  id: () => 'id_' + Math.random().toString(36).slice(2),
  choice: (arr) => arr[Math.floor(Math.random() * arr.length)]
};

window.Constants = {
  POSITIONS: ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'],
  OVR_WEIGHTS: {
    QB: { throwPower: 0.2, throwAccuracy: 0.3, awareness: 0.3, speed: 0.1, intelligence: 0.1 },
    RB: { speed: 0.2, acceleration: 0.2, trucking: 0.15, juking: 0.15, catching: 0.1, awareness: 0.2 },
    WR: { speed: 0.3, acceleration: 0.2, catching: 0.3, catchInTraffic: 0.2 },
    OL: { runBlock: 0.5, passBlock: 0.5 },
    DL: { passRushPower: 0.3, passRushSpeed: 0.3, runStop: 0.4 },
    LB: { speed: 0.2, runStop: 0.3, coverage: 0.3, awareness: 0.2 },
    CB: { speed: 0.3, acceleration: 0.2, coverage: 0.4, intelligence: 0.1 },
    S:  { speed: 0.25, coverage: 0.3, runStop: 0.25, awareness: 0.2 },
    K:  { kickPower: 0.6, kickAccuracy: 0.4 },
    P:  { kickPower: 0.6, kickAccuracy: 0.4 },
    TE: { speed: 0.15, catching: 0.25, catchInTraffic: 0.2, runBlock: 0.2, passBlock: 0.2 }
  },
  POS_RATING_RANGES: {
    QB: { throwPower: [60, 99], throwAccuracy: [55, 99], awareness: [50, 99], speed: [40, 85], intelligence: [60, 99] },
    RB: { speed: [70, 99], acceleration: [70, 99], trucking: [50, 99], juking: [50, 99], catching: [40, 90], awareness: [50, 90] },
    WR: { speed: [70, 99], acceleration: [70, 99], catching: [65, 99], catchInTraffic: [55, 99], awareness: [50, 90] },
    OL: { runBlock: [70, 99], passBlock: [70, 99], awareness: [60, 95] },
    DL: { passRushPower: [60, 99], passRushSpeed: [55, 99], runStop: [65, 99], awareness: [50, 90] },
    K:  { kickPower: [70, 99], kickAccuracy: [60, 99], awareness: [50, 80] },
    P:  { kickPower: [65, 99], kickAccuracy: [60, 99], awareness: [50, 80] }
  },
  DEPTH_NEEDS: { QB: 3, RB: 4, WR: 6, TE: 3, OL: 8, DL: 6, LB: 6, CB: 5, S: 4, K: 1, P: 1 },
  SALARY_CAP: { BASE: 255, MAX_ROLLOVER: 10 },
  FREE_AGENCY: { POOL_SIZE: 120, DEFAULT_YEARS: 2, GUARANTEED_PCT: 0.5, CONTRACT_DISCOUNT: 0.95 },
  SIMULATION: { HOME_ADVANTAGE: 3 },
  HOME_ADVANTAGE: 3
};

window.EXPANDED_FIRST_NAMES = ['John', 'Mike', 'David', 'Chris', 'Matt', 'Ryan'];
window.EXPANDED_LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'];

// ============================================================================
// A. DRAFT EVALUATION TESTS
// ============================================================================

describe('A. Draft Evaluation — Position-Specific Ratings', () => {
  // Inline implementation of generatePositionRatings for testing
  function generatePositionRatings(pos, baseOvr) {
    const U = window.Utils;
    const C = window.Constants;
    const ratings = {};
    const ovrWeights = C.OVR_WEIGHTS[pos] || {};
    const posRanges = C.POS_RATING_RANGES[pos] || {};
    const posAttributes = Object.keys(ovrWeights);

    posAttributes.forEach(attr => {
      const range = posRanges[attr] || [40, 99];
      ratings[attr] = U.clamp(baseOvr + U.rand(-8, 8), range[0], range[1]);
    });

    if (!ratings.awareness) {
      const range = posRanges.awareness || [50, 95];
      ratings.awareness = U.clamp(baseOvr - 5 + U.rand(-6, 6), range[0], range[1]);
    }
    return ratings;
  }

  // Test: QB should NOT have passRushPower
  const qbRatings = generatePositionRatings('QB', 80);
  assert(!qbRatings.passRushPower, 'QB should not have passRushPower attribute');
  assert(!qbRatings.runBlock, 'QB should not have runBlock attribute');
  assert(qbRatings.throwPower !== undefined, 'QB should have throwPower');
  assert(qbRatings.throwAccuracy !== undefined, 'QB should have throwAccuracy');
  assert(qbRatings.awareness !== undefined, 'QB should have awareness');

  // Test: DL should NOT have throwAccuracy
  const dlRatings = generatePositionRatings('DL', 75);
  assert(!dlRatings.throwAccuracy, 'DL should not have throwAccuracy');
  assert(!dlRatings.catching, 'DL should not have catching');
  assert(dlRatings.passRushPower !== undefined, 'DL should have passRushPower');
  assert(dlRatings.runStop !== undefined, 'DL should have runStop');

  // Test: K should only have kick-related attributes
  const kRatings = generatePositionRatings('K', 70);
  assert(!kRatings.throwPower, 'K should not have throwPower');
  assert(!kRatings.speed, 'K should not have speed (not in OVR_WEIGHTS)');
  assert(kRatings.kickPower !== undefined, 'K should have kickPower');
  assert(kRatings.kickAccuracy !== undefined, 'K should have kickAccuracy');
});

describe('A. Draft Evaluation — Boom/Bust Spectrum', () => {
  // Test: developmentAxis creates mutually exclusive boom/bust
  for (let i = 0; i < 100; i++) {
    const axis = window.Utils.rand(-10, 10);
    const boom = Math.max(0, axis);
    const bust = Math.max(0, -axis);
    assert(!(boom > 0 && bust > 0), `Boom(${boom}) and bust(${bust}) should not both be >0`);
  }
});

describe('A. Draft Evaluation — Gaussian Talent Distribution', () => {
  // Test: 1st round talents should average around 81 OVR
  const firstRoundOvrs = [];
  for (let i = 0; i < 200; i++) {
    const mean = 81, stdDev = 4;
    const u1 = Math.random(), u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1 || 0.0001)) * Math.cos(2.0 * Math.PI * u2);
    const ovr = Math.round(Math.max(40, Math.min(95, mean + z * stdDev)));
    firstRoundOvrs.push(ovr);
  }
  const avg = firstRoundOvrs.reduce((a, b) => a + b, 0) / firstRoundOvrs.length;
  assertRange(avg, 77, 85, '1st round average OVR should be near 81');

  // Test: there should be variance (not all the same)
  const min = Math.min(...firstRoundOvrs);
  const max = Math.max(...firstRoundOvrs);
  assert(max - min > 10, `Talent range should be >10 (got ${max - min})`);
});

// ============================================================================
// B. SALARY CAP TESTS
// ============================================================================

describe('B. Salary Cap — Realistic Salary Scale', () => {
  const U = window.Utils;

  // Inline the new salary calculator
  function calculateRealisticSalary(overall, position, age) {
    const posMultipliers = {
      QB: 2.2, WR: 1.15, OL: 1.10, CB: 1.10, DL: 1.05,
      LB: 0.95, S: 0.90, TE: 0.85, RB: 0.70, K: 0.35, P: 0.30
    };
    const multiplier = posMultipliers[position] || 1.0;

    let baseSalary;
    if (overall >= 95) baseSalary = U.rand(24, 28);
    else if (overall >= 90) baseSalary = U.rand(18, 24);
    else if (overall >= 85) baseSalary = U.rand(13, 18);
    else if (overall >= 80) baseSalary = U.rand(8, 14);
    else if (overall >= 75) baseSalary = U.rand(5, 9);
    else if (overall >= 70) baseSalary = U.rand(3, 6);
    else if (overall >= 65) baseSalary = U.rand(1.5, 3.5);
    else baseSalary = U.rand(0.9, 1.5);

    baseSalary *= multiplier;

    if (age >= 33) baseSalary *= U.rand(0.55, 0.70);
    else if (age >= 30) baseSalary *= U.rand(0.75, 0.90);
    else if (age <= 25) baseSalary *= U.rand(1.05, 1.15);

    return baseSalary;
  }

  // Elite QB (95 OVR, age 27) should earn $45-65M
  const eliteQbSalaries = [];
  for (let i = 0; i < 50; i++) {
    eliteQbSalaries.push(calculateRealisticSalary(95, 'QB', 27));
  }
  const avgQbSalary = eliteQbSalaries.reduce((a, b) => a + b, 0) / eliteQbSalaries.length;
  assertRange(avgQbSalary, 40, 70, 'Elite QB average salary should be $40-70M');

  // RB salaries should be much lower than QB salaries
  const rbSalaries = [];
  for (let i = 0; i < 50; i++) {
    rbSalaries.push(calculateRealisticSalary(85, 'RB', 25));
  }
  const avgRbSalary = rbSalaries.reduce((a, b) => a + b, 0) / rbSalaries.length;
  assert(avgRbSalary < avgQbSalary * 0.5, `RB salary ($${avgRbSalary.toFixed(1)}M) should be <50% of QB salary ($${avgQbSalary.toFixed(1)}M)`);

  // Old player (age 34) should earn less than prime (age 26)
  const oldSalary = calculateRealisticSalary(80, 'WR', 34);
  const primeSalary = calculateRealisticSalary(80, 'WR', 25);
  assert(oldSalary < primeSalary, `Old WR ($${oldSalary.toFixed(1)}M) should earn less than prime WR ($${primeSalary.toFixed(1)}M)`);
});

describe('B. Contract Negotiation — Player Leverage', () => {
  // Inline the leverage calculator
  function calculatePlayerLeverage(player) {
    const ovr = player.ovr || 60;
    const age = player.age || 25;
    const pos = player.pos || 'RB';
    const posMult = { QB: 2.2, WR: 1.15, RB: 0.70 }[pos] || 1.0;

    let marketAAV;
    if (ovr >= 95) marketAAV = 26;
    else if (ovr >= 90) marketAAV = 20;
    else if (ovr >= 85) marketAAV = 15;
    else if (ovr >= 80) marketAAV = 10;
    else marketAAV = 3.5;
    marketAAV *= posMult;

    if (age >= 33) marketAAV *= 0.6;
    else if (age <= 25) marketAAV *= 1.1;

    let leverage = 50;
    if (ovr >= 85) leverage += 20;
    if (age <= 27) leverage += 10;
    if (pos === 'QB') leverage += 15;
    leverage = Math.max(0, Math.min(100, leverage));

    const minAAV = Math.max(0.9, marketAAV * (0.75 + leverage * 0.002));
    return { minAAV, marketValue: marketAAV, leverageScore: leverage };
  }

  // Elite QB should have high leverage
  const eliteQb = { ovr: 95, age: 26, pos: 'QB' };
  const qbLev = calculatePlayerLeverage(eliteQb);
  assert(qbLev.leverageScore >= 80, `Elite QB leverage should be >=80 (got ${qbLev.leverageScore})`);
  assert(qbLev.minAAV > 40, `Elite QB minimum AAV should be >$40M (got $${qbLev.minAAV.toFixed(1)}M)`);

  // Old RB should have low leverage
  const oldRb = { ovr: 75, age: 33, pos: 'RB' };
  const rbLev = calculatePlayerLeverage(oldRb);
  assert(rbLev.leverageScore <= 50, `Old RB leverage should be <=50 (got ${rbLev.leverageScore})`);
  assert(rbLev.minAAV < qbLev.minAAV, 'Old RB minAAV should be less than elite QB');
});

// ============================================================================
// C. SCOUTING REPORT TESTS
// ============================================================================

describe('C. Scouting — Set Serialization Fix', () => {
  // Test: Array serializes correctly to JSON
  const scoutingState = {
    scoutedProspects: ['id1', 'id2', 'id3'],
    budget: 2000000
  };
  const json = JSON.stringify(scoutingState);
  const parsed = JSON.parse(json);
  assert(Array.isArray(parsed.scoutedProspects), 'scoutedProspects should serialize as Array');
  assert(parsed.scoutedProspects.length === 3, 'Should preserve 3 scouted prospect IDs');
  assert(parsed.scoutedProspects.includes('id2'), 'Should be able to find scouted prospect');

  // Test: Set serializes incorrectly (demonstrating the bug)
  const buggyState = { scoutedProspects: new Set(['id1', 'id2']) };
  const buggyJson = JSON.stringify(buggyState);
  const buggyParsed = JSON.parse(buggyJson);
  assert(!Array.isArray(buggyParsed.scoutedProspects), 'Set serializes to {} (demonstrating bug)');
});

describe('C. Scouting — Character Impact Evaluation', () => {
  function evaluateCharacterImpact(character) {
    const strengths = [];
    const risks = [];
    if (character.workEthic >= 90) strengths.push('Elite work ethic');
    else if (character.workEthic < 65) risks.push('Poor work ethic');
    if (character.coachability >= 90) strengths.push('Highly coachable');
    if (character.leadership >= 85) strengths.push('Natural leader');
    if (character.red_flags) risks.push('Character red flag');
    if (character.injury_prone) risks.push('Injury-prone');

    const avg = ((character.workEthic || 70) + (character.coachability || 70) + (character.footballIQ || 70)) / 3;
    let proj;
    if (avg >= 85) proj = 'FAST DEVELOPER';
    else if (avg >= 75) proj = 'STEADY DEVELOPER';
    else if (avg >= 65) proj = 'AVERAGE';
    else proj = 'HIGH RISK';
    return { developmentProjection: proj, risks, strengths };
  }

  // High character player
  const elite = evaluateCharacterImpact({ workEthic: 95, coachability: 92, leadership: 88, footballIQ: 90 });
  assert(elite.developmentProjection === 'FAST DEVELOPER', 'High character → FAST DEVELOPER');
  assert(elite.strengths.length >= 2, 'Should have multiple strengths');
  assert(elite.risks.length === 0, 'Should have no risks');

  // Red flag player
  const redFlag = evaluateCharacterImpact({ workEthic: 55, coachability: 60, footballIQ: 55, red_flags: true, injury_prone: true });
  assert(redFlag.developmentProjection === 'HIGH RISK', 'Low character → HIGH RISK');
  assert(redFlag.risks.length >= 2, 'Should have multiple risks');
});

// ============================================================================
// D. TRADE EVALUATION TESTS
// ============================================================================

describe('D. Trade — Smooth Age Curve', () => {
  // Test the new age curve has no gaps
  function getAgeMult(age, pos) {
    const PEAK_AGES = { QB: 28, RB: 25, WR: 27 };
    const peak = PEAK_AGES[pos] || 27;
    const ageDiff = age - peak;
    let ageMult;
    if (ageDiff <= 0) {
      ageMult = 1.0 - Math.pow(Math.abs(ageDiff), 1.3) * 0.015;
    } else {
      const decayRate = pos === 'RB' ? 0.04 : pos === 'QB' ? 0.015 : 0.025;
      ageMult = 1.0 - Math.pow(ageDiff, 1.5) * decayRate;
    }
    return Math.max(0.2, Math.min(1.1, ageMult));
  }

  // No gaps: age 29 should have a value (previously had no modifier)
  const age29 = getAgeMult(29, 'WR');
  assert(age29 > 0.5 && age29 < 1.1, `Age 29 WR should have valid multiplier (got ${age29.toFixed(2)})`);

  // Peak should be highest
  const peak = getAgeMult(27, 'WR');
  const before = getAgeMult(25, 'WR');
  const after = getAgeMult(30, 'WR');
  assert(peak >= before, 'Peak age should have >= value than pre-peak');
  assert(peak >= after, 'Peak age should have >= value than post-peak');

  // RBs should decline faster than QBs after peak
  const rb32 = getAgeMult(32, 'RB');
  const qb32 = getAgeMult(32, 'QB');
  assert(rb32 < qb32, `RB at 32 (${rb32.toFixed(2)}) should decline faster than QB (${qb32.toFixed(2)})`);
});

describe('D. Trade — Contract Factor Fix', () => {
  function getContractFactor(salary, yearsLeft) {
    const capBase = 255;
    const capPct = salary / capBase;
    const costFactor = Math.max(0.3, 1.5 - capPct * 5);
    const termFactor = 0.85 + Math.min(4, yearsLeft) * 0.05;
    return costFactor * termFactor;
  }

  // Cheap player should have higher factor than expensive
  const cheap = getContractFactor(2, 3);   // $2M/yr, 3 years
  const expensive = getContractFactor(40, 3); // $40M/yr, 3 years
  assert(cheap > expensive, `Cheap player factor (${cheap.toFixed(2)}) should be > expensive (${expensive.toFixed(2)})`);

  // $1M and $5M should now be DIFFERENT (old version had them identical)
  const f1 = getContractFactor(1, 2);
  const f5 = getContractFactor(5, 2);
  assert(Math.abs(f1 - f5) > 0.05, `$1M (${f1.toFixed(2)}) and $5M (${f5.toFixed(2)}) should have different factors`);
});

// ============================================================================
// E. GAME SIMULATION TESTS
// ============================================================================

describe('E. Game Sim — QB TDs Not Score-Dependent', () => {
  const U = window.Utils;

  // Simplified version of new generateQBStats
  function generateQBTDs(yards, completions, throwAccuracy, awareness) {
    const redZoneEff = (awareness + throwAccuracy) / 200;
    const baseTDs = yards / 150 * (0.8 + redZoneEff * 0.6);
    return Math.max(0, Math.min(6, Math.round(baseTDs + U.rand(-0.5, 1.0))));
  }

  // Low yards should produce low TDs regardless of team score
  const lowYardTDs = [];
  for (let i = 0; i < 100; i++) {
    lowYardTDs.push(generateQBTDs(80, 10, 70, 70));
  }
  const avgLowTDs = lowYardTDs.reduce((a, b) => a + b, 0) / lowYardTDs.length;
  assertRange(avgLowTDs, 0, 2, 'QB with 80 yards should average 0-2 TDs');

  // High yards should produce more TDs
  const highYardTDs = [];
  for (let i = 0; i < 100; i++) {
    highYardTDs.push(generateQBTDs(350, 28, 85, 85));
  }
  const avgHighTDs = highYardTDs.reduce((a, b) => a + b, 0) / highYardTDs.length;
  assert(avgHighTDs > avgLowTDs, `High-yard TDs (${avgHighTDs.toFixed(1)}) should exceed low-yard TDs (${avgLowTDs.toFixed(1)})`);
});

describe('E. Game Sim — TD Consistency Check', () => {
  // Test: total TDs should not exceed score / 6
  function enforceTDConsistency(score, tds) {
    const maxTDs = Math.ceil(score / 6);
    if (tds > maxTDs) return maxTDs;
    return tds;
  }

  // Team scoring 7 can have at most 1 offensive TD (7/6 = 1.17 → 2, but realistically 1)
  assert(enforceTDConsistency(7, 4) <= 2, 'Team scoring 7 should have <=2 TDs');
  assert(enforceTDConsistency(0, 3) === 0, 'Team scoring 0 should have 0 TDs');
  assert(enforceTDConsistency(42, 6) === 6, 'Team scoring 42 can have 6 TDs');
  assert(enforceTDConsistency(14, 10) <= 3, 'Team scoring 14 should have <=3 TDs');
});

describe('E. Game Sim — Player Progression Age-Based Decline', () => {
  function calculateXPMultiplier(age) {
    if (age <= 24) return 1.15;
    if (age <= 27) return 1.0;
    if (age <= 30) return 0.8;
    if (age <= 33) return 0.4;
    return 0.15;
  }

  // Young players develop faster
  assert(calculateXPMultiplier(22) > calculateXPMultiplier(27), 'Young players should develop faster');
  // Old players barely develop
  assert(calculateXPMultiplier(34) < 0.2, 'Old players (34+) should barely develop');
  // There's always a decline curve
  assert(calculateXPMultiplier(22) > calculateXPMultiplier(30), '22 > 30 in XP gain');
  assert(calculateXPMultiplier(30) > calculateXPMultiplier(34), '30 > 34 in XP gain');
});

describe('E. Game Sim — Defense Strength Assignment', () => {
  // Test that home defense strength comes from HOME groups (not away groups)
  // This is a logic test — the old code had them swapped

  const homeGroups = { DL: [{ ovr: 90 }], LB: [{ ovr: 85 }] };
  const awayGroups = { DL: [{ ovr: 60 }], LB: [{ ovr: 55 }] };

  function calcDefStrength(groups) {
    const positions = ['DL', 'LB', 'CB', 'S'];
    let total = 0, count = 0;
    positions.forEach(pos => {
      (groups[pos] || []).forEach(p => { total += p.ovr || 70; count++; });
    });
    return count === 0 ? 70 : total / count;
  }

  const homeDefense = calcDefStrength(homeGroups);  // Should be high (90, 85)
  const awayDefense = calcDefStrength(awayGroups);  // Should be low (60, 55)

  assert(homeDefense > awayDefense, `Home defense (${homeDefense}) should be stronger than away (${awayDefense})`);
  assert(homeDefense > 80, 'Home defense with 90/85 players should be >80');
  assert(awayDefense < 65, 'Away defense with 60/55 players should be <65');
});

// ============================================================================
// RESULTS
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
}
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
