const fs = require('fs');

let content = fs.readFileSync('src/core/trade-logic.js', 'utf8');

// Replace getPlayerTradeValue with calculatePlayerValue
content = content.replace(/getPlayerTradeValue/g, 'calculatePlayerValue');

fs.writeFileSync('src/core/trade-logic.js', content);
console.log('Fixed function name in trade-logic.js');
