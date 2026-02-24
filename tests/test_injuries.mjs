// tests/test_injuries.mjs
import { generateInjury, canPlayerPlay, INJURY_TYPES } from '../src/core/injury-core.js';
import { autoSortDepthChart } from '../src/core/depth-chart.js';
import { groupPlayersByPosition } from '../src/core/game-simulator.js';
import { Utils } from '../src/core/utils.js';

console.log('Running Injury Logic Tests...');

// 1. Test Injury Generation
const injury = generateInjury('QB');
if (!injury.type || !injury.weeksOut || !injury.severity) {
    console.error('FAIL: generateInjury returned invalid object', injury);
    process.exit(1);
}
console.log('PASS: generateInjury:', injury);

// 2. Test canPlayerPlay
const player = {
    id: 1,
    name: 'Test Player',
    injured: true,
    injuries: [{ type: 'Sprained Ankle', weeksRemaining: 2 }]
};

if (canPlayerPlay(player)) {
    console.error('FAIL: canPlayerPlay should return false for injured player');
    process.exit(1);
}

player.injuries[0].weeksRemaining = 0;
if (!canPlayerPlay(player)) {
    console.error('FAIL: canPlayerPlay should return true for healed player');
    process.exit(1);
}
console.log('PASS: canPlayerPlay logic');

// 3. Test Auto-Sort Depth Chart
const team = {
    roster: [
        { id: 1, name: 'Injured Star', pos: 'QB', ovr: 90, injuries: [{ weeksRemaining: 2 }], injured: true },
        { id: 2, name: 'Healthy Backup', pos: 'QB', ovr: 75, injuries: [], injured: false },
        { id: 3, name: 'Healthy Scrub', pos: 'QB', ovr: 60, injuries: [], injured: false }
    ]
};

// Before sort
// Index 0: 90 OVR Injured
// Index 1: 75 OVR Healthy

autoSortDepthChart(team);

// After sort
// Index 0 should be Healthy Backup (75)
// Index 1 should be Healthy Scrub (60)
// Index 2 should be Injured Star (90)

if (team.roster[0].id !== 2) {
    console.error('FAIL: autoSortDepthChart did not prioritize healthy player. Top is:', team.roster[0].name);
    process.exit(1);
}
if (team.roster[2].id !== 1) {
    console.error('FAIL: autoSortDepthChart did not demote injured player. Bottom is:', team.roster[2].name);
    process.exit(1);
}
console.log('PASS: autoSortDepthChart logic');

// 4. Test Simulator Grouping Logic
// Reset roster order to test grouping independently
team.roster = [
    { id: 1, name: 'Injured Star', pos: 'QB', ovr: 90, injuries: [{ weeksRemaining: 2 }], injured: true },
    { id: 2, name: 'Healthy Backup', pos: 'QB', ovr: 75, injuries: [], injured: false },
    { id: 3, name: 'Healthy Scrub', pos: 'QB', ovr: 60, injuries: [], injured: false }
];

const groups = groupPlayersByPosition(team.roster);
const qbs = groups['QB'];
if (qbs[0].id !== 2) { // Healthy Backup
    console.error('FAIL: groupPlayersByPosition did not prioritize healthy player. Top is:', qbs[0].name);
    process.exit(1);
}
console.log('PASS: groupPlayersByPosition logic');

console.log('All Injury Tests Passed!');
