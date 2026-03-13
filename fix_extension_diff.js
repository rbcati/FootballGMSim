const fs = require('fs');

let content = fs.readFileSync('src/core/player.js', 'utf8');

const regex = /function calculateExtensionDemand\(player\) \{/g;
const replace = `function calculateExtensionDemand(player, difficulty = 'Normal') {`;

const regex2 = /    \/\/ Apply Extension Premium \(10-15\%\)\n    const premiumMult = 1\.15;/g;
const replace2 = `    // Apply Extension Premium & Difficulty Modifier
    let diffMult = 1.0;
    if (difficulty === 'Easy') diffMult = 0.9;
    if (difficulty === 'Hard') diffMult = 1.1;
    if (difficulty === 'Legendary') diffMult = 1.25;

    const premiumMult = 1.15 * diffMult;`;

if (content.includes('function calculateExtensionDemand(player) {')) {
    content = content.replace(regex, replace);
    content = content.replace(regex2, replace2);
    fs.writeFileSync('src/core/player.js', content);
    console.log('Updated calculateExtensionDemand in player.js');
}
