const fs = require('fs');

let content = fs.readFileSync('src/core/coach-system.js', 'utf8');
content = content.replace(/console\.log\(/g, '// console.log(');

fs.writeFileSync('src/core/coach-system.js', content);
console.log('Disabled debug logs in coach-system.js');
