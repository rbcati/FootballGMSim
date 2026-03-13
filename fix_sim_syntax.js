const fs = require('fs');

let content = fs.readFileSync('src/core/game-simulator.js', 'utf8');
content = content.replace(/         \$\{home\.abbr\} vs \$\{away\.abbr\}\`\);/g, '');
fs.writeFileSync('src/core/game-simulator.js', content);
console.log('Fixed syntax error in game-simulator.js');
