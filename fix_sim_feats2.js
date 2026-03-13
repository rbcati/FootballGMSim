const fs = require('fs');
let content = fs.readFileSync('src/core/game-simulator.js', 'utf8');

const regex = /const checkFeats = \(teamStats, teamAbbr, oppAbbr\) => \{([\s\S]*?)return feats;/g;
const replaceWith = `const checkFeats = (teamStats, teamAbbr, oppAbbr) => {
                const feats = [];
                for (const [pid, p] of Object.entries(teamStats)) {
                    const featList = [];
                    // Passing
                    if (p.passYd >= 400 || p.passTD >= 5) {
                        const sub = [];
                        if (p.passYd >= 400) sub.push(\`\${p.passYd} passing yards\`);
                        if (p.passTD >= 5) sub.push(\`\${p.passTD} passing TDs\`);
                        featList.push(sub.join(' and '));
                    }
                    // Rushing
                    if (p.rushYd >= 150 || p.rushTD >= 3) {
                        const sub = [];
                        if (p.rushYd >= 150) sub.push(\`\${p.rushYd} rushing yards\`);
                        if (p.rushTD >= 3) sub.push(\`\${p.rushTD} rushing TDs\`);
                        featList.push(sub.join(' and '));
                    }
                    // Receiving
                    if (p.recYd >= 200 || p.receptions >= 12 || p.recTD >= 3) {
                        const sub = [];
                        if (p.recYd >= 200) sub.push(\`\${p.recYd} receiving yards\`);
                        if (p.receptions >= 12) sub.push(\`\${p.receptions} receptions\`);
                        if (p.recTD >= 3) sub.push(\`\${p.recTD} receiving TDs\`);
                        featList.push(sub.join(', '));
                    }
                    // Defense
                    if (p.sacks >= 3.0 || p.interceptions >= 2 || p.defTDs > 0) {
                        const sub = [];
                        if (p.sacks >= 3.0) sub.push(\`\${p.sacks} sacks\`);
                        if (p.interceptions >= 2) sub.push(\`\${p.interceptions} interceptions\`);
                        if (p.defTDs > 0) sub.push(\`\${p.defTDs} defensive TDs\`);
                        featList.push(sub.join(' and '));
                    }
                    // Special Teams
                    if (p.longestFG >= 55) {
                        featList.push(\`a \${p.longestFG}-yard field goal\`);
                    }
                    if (p.returnTDs > 0) {
                        featList.push(\`a return TD\`);
                    }

                    if (featList.length > 0) {
                        feats.push({
                            playerId: pid,
                            name: p.name,
                            pos: p.pos,
                            teamAbbr: teamAbbr,
                            opponentAbbr: oppAbbr,
                            featDescription: featList.join(', '),
                        });
                    }
                }
                return feats;`;

content = content.replace(regex, replaceWith);
fs.writeFileSync('src/core/game-simulator.js', content);
console.log('Fixed Feats loop logic in simulator');
