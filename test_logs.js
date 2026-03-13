const fs = require('fs');

function hasLogs(file) {
    const content = fs.readFileSync(file, 'utf8');
    const matches = content.match(/console\.log\(/g);
    if (matches) {
         console.log(file + ' still has ' + matches.length + ' console.logs');
    } else {
         console.log(file + ' is clean.');
    }
}

hasLogs('src/core/state.js');
hasLogs('src/core/schedule.js');
hasLogs('src/core/game-simulator.js');
hasLogs('src/core/coach-system.js');
hasLogs('src/core/ai-logic.js');
hasLogs('src/core/league.js');
