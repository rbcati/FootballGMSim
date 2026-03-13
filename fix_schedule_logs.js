const fs = require('fs');

let content = fs.readFileSync('src/core/schedule.js', 'utf8');
content = content.replace(/console\.log\('Creating NFL-style schedule\.\.\.'\);/g, '');
content = content.replace(/console\.log\('Generated NFL-style schedule successfully'\);/g, '');
content = content.replace(/console\.log\('Fixing schedule completely\.\.\.'\);/g, '');
content = content.replace(/console\.log\('Schedule fixed successfully'\);/g, '');
content = content.replace(/console\.log\('Schedule Statistics:'\);/g, '');
content = content.replace(/console\.log\('- Weeks:', schedule\.weeks\.length\);/g, '');
content = content.replace(/console\.log\('- Games per team:', Object\.values\(teamGameCount\)\);/g, '');
content = content.replace(/console\.log\('- Bye week distribution:',/g, '');
content = content.replace(/Object\.values\(byeWeeks\)\.reduce\(\(acc, w\) => \{ acc\[w\] = \(acc\[w\] \|\| 0\) \+ 1; return acc; \}, \{\}\)\);/g, '');
content = content.replace(/console\.log\('Creating simple fallback schedule\.\.\.'\);/g, '');

fs.writeFileSync('src/core/schedule.js', content);
console.log('Removed logs from schedule.js');
