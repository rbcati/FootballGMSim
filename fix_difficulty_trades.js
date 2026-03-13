const fs = require('fs');

let content = fs.readFileSync('src/worker/worker.js', 'utf8');

const regexTrade = /\/\/ AI accepts if it gets at least 85 % of what it gives\n  const threshold   = offerVal \* 0\.85;\n  const accepted    = receiveVal >= threshold;/g;

const replaceTrade = `// AI acceptance threshold scales by difficulty
  const meta = cache.getMeta();
  const diff = meta.difficulty || 'Normal';
  let diffMult = 1.0;
  if (diff === 'Easy') diffMult = 0.9; // AI accepts at 90% of what user offers
  if (diff === 'Hard') diffMult = 1.15; // AI demands 15% more
  if (diff === 'Legendary') diffMult = 1.30; // AI demands 30% more

  // E.g. User (fromTeam) offers 1000 value, wants 1000 value.
  // On Normal, AI wants 1000 * 1.0 = 1000 in return (offerVal >= receiveVal * 1.0)
  // Let's refine the logic: AI is "toTeam". It is receiving "offering" and giving up "receiving".
  // AI accepts if offering >= receiving * diffMult

  const threshold = receiveVal * diffMult;
  const accepted = offerVal >= threshold;`;

if (content.includes('// AI accepts if it gets at least 85 % of what it gives')) {
    content = content.replace(regexTrade, replaceTrade);
    fs.writeFileSync('src/worker/worker.js', content);
    console.log('Fixed trade difficulty scaling in worker.js');
}
