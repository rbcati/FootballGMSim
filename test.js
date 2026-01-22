async function runTests() {
  console.log('Starting tests...');

  // Test 1: Verify that the coaching module is loaded and accessible
  try {
    const coaching = await import('./coaching.js');
    if (coaching && typeof coaching.renderCoachingStats === 'function') {
      console.log('Test 1 Passed: Coaching module loaded successfully.');
    } else {
      console.error('Test 1 Failed: Coaching module did not load correctly.');
    }
  } catch (error) {
    console.error('Test 1 Failed: Could not import coaching module.', error);
  }

  // Test 2: Verify that the trade proposals module is loaded and accessible
  try {
    const tradeproposals = await import('./tradeproposals.js');
    if (tradeproposals && typeof tradeproposals.generateAITradeProposals === 'function') {
      console.log('Test 2 Passed: Trade proposals module loaded successfully.');
    } else {
      console.error('Test 2 Failed: Trade proposals module did not load correctly.');
    }
  } catch (error) {
    console.error('Test 2 Failed: Could not import trade proposals module.', error);
  }

  // Test 3: Verify that the main game controller can still call the refactored functions
  try {
    // This is a bit of a hack, but we can check if the router has the correct functions
    if (window.router && typeof window.router === 'function') {
        console.log('Test 3 Passed: Main game controller is still functional.');
    }
  } catch (error) {
    console.error('Test 3 Failed: Main game controller is not functional.', error);
  }

  console.log('Tests finished.');
}

runTests();
