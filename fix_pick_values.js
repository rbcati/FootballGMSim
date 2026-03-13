const fs = require('fs');

let content = fs.readFileSync('src/worker/worker.js', 'utf8');
const regex = /const PICK_VALUES = \[0, 800, 300, 150, 60, 25, 10, 3\];/g;
// Opus Phase 4 - Late round picks should hold very little value to avoid spamming them for stars
const replace = `const PICK_VALUES = [0, 800, 300, 100, 40, 15, 5, 2];`;

content = content.replace(regex, replace);
fs.writeFileSync('src/worker/worker.js', content);
console.log('Fixed pick values in worker.js');
