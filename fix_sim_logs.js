const fs = require('fs');

let content = fs.readFileSync('src/core/game-simulator.js', 'utf8');
content = content.replace(/if \(verbose\) console\.log\(/g, 'if (false) console.log(');
content = content.replace(/if \(verbose && updatedHome\) console\.log\(/g, 'if (false) console.log(');
content = content.replace(/if \(verbose && updatedAway\) console\.log\(/g, 'if (false) console.log(');
content = content.replace(/\/\/ console\.log\(\`\[SIM-DEBUG\] Scheduled game updated:/g, '');

fs.writeFileSync('src/core/game-simulator.js', content);
console.log('Disabled debug logs in game-simulator.js');
