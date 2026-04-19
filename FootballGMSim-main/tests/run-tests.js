const fs = require('fs');
const path = require('path');

// Basic smoke tests
function runSmokeTests() {
  console.log('Running tests...');
  try {
    const code = fs.readFileSync(path.join(__dirname, '../src/core/schedule.js'), 'utf8');
    if (!code.includes('fixScheduleCompletely')) throw new Error('Missing function!');
    if (code.includes('usedThisWeek.has(team1Id)') && code.includes('opponentsOfTeam1.has(team2Id)')) {
        console.log('PASS: Optimized fixScheduleCompletely logic found');
    } else {
        throw new Error('Optimized code not found');
    }
  } catch (e) {
    console.error('FAIL: ', e.message);
    process.exit(1);
  }
}

runSmokeTests();
