const fs = require('fs');

let content = fs.readFileSync('src/core/state.js', 'utf8');
content = content.replace(/console\.log\(`\[QA-AUDIT\] saveState.*?\n.*?\n.*?\n.*?\n.*?\}\n/gs, '');
fs.writeFileSync('src/core/state.js', content);
console.log('Removed QA-AUDIT logs from state.js');
