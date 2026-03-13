const fs = require('fs');
let content = fs.readFileSync('src/core/game-simulator.js', 'utf8');

const regex = /            if \(q >= 4 && Math\.abs\(teamScore - oppScore\) <= 8\) \{/g;
const replaceWith = `            let clutchBonus = qb.personality?.traits?.includes('Clutch') ? 1.05 : 1.0;
            if (q >= 4 && Math.abs(teamScore - oppScore) <= 8) {
                // Incorporate clutch trait bonus
                mod *= clutchBonus;`;

if (content.includes('            if (q >= 4 && Math.abs(teamScore - oppScore) <= 8) {')) {
    content = content.replace(regex, replaceWith);
    fs.writeFileSync('src/core/game-simulator.js', content);
    console.log('Added clutch trait to game-simulator.js pass accuracy logic');
}
