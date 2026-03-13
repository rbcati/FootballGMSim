const fs = require('fs');
let sim = fs.readFileSync('src/core/game-simulator.js', 'utf8');

// Verify that the verbose flag actually works. All debug logs are wrapped in "if (verbose)".
const isVerboseSafe = !sim.match(/console\.log\(`\[SIM-DEBUG\](?!.*if \(verbose\))/g);
console.log('Game Simulator debug logs safe:', isVerboseSafe);
