const fs = require('fs');

let content = fs.readFileSync('src/core/state.js', 'utf8');

content = content.replace(`    // [QA-AUDIT]
    if (stateObj && stateObj.league) {

    if (!stateObj) {`, `
    if (!stateObj) {`);

fs.writeFileSync('src/core/state.js', content);
console.log('Fixed syntax error in state.js');
