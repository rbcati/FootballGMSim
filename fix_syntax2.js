const fs = require('fs');

let content = fs.readFileSync('src/core/schedule.js', 'utf8');

content = content.replace(/    \n    \n    \n    \n        schedule\.weeks\.slice\(4, 12\)\.map\(\(week, i\) =>\n            `Week \$\{i\+5\}: \$\{week\.teamsWithBye\.length\} teams`\n        \)\.join\(', '\)\n    \);\n\}/g, '}');

fs.writeFileSync('src/core/schedule.js', content);
console.log('Fixed syntax error in schedule.js');
