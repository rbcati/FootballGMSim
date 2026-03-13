const fs = require('fs');

let content = fs.readFileSync('src/worker/worker.js', 'utf8');
const strToReplace = `      phase:           'regular',
      settings:        options.settings ?? {},`;

const newStr = `      phase:           'regular',
      difficulty:      options.difficulty ?? 'Normal',
      settings:        options.settings ?? {},`;

content = content.replace(strToReplace, newStr);
fs.writeFileSync('src/worker/worker.js', content);
console.log('Added difficulty to meta in worker.js');
