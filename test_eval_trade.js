const fs = require('fs');
const content = fs.readFileSync('src/core/trade-logic.js', 'utf8');

const match = content.match(/function evaluateTrade\s*\([\s\S]*?\{([\s\S]*?)\}/);
if (match) {
    console.log("Found evaluateTrade function.");
} else {
    console.log("Did not find evaluateTrade function.");
}
