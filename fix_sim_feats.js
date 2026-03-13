const fs = require('fs');
let content = fs.readFileSync('src/core/game-simulator.js', 'utf8');

const featCheckStr = `            // Finalize Game Result via Commit`;
const newFeatCheckStr = `
            // -- Feats Check --
            const checkFeats = (teamStats, teamAbbr, oppAbbr) => {
                const feats = [];
                for (const p of Object.values(teamStats)) {
                    const f = [];
                    // Passing
                    if (p.passYd >= 400 || p.passTD >= 5) {
                        if (p.passYd >= 400 && p.passTD >= 5) f.push(\`\${p.passYd} passing yards and \${p.passTD} passing TDs\`);
                        else if (p.passYd >= 400) f.push(\`\${p.passYd} passing yards\`);
                        else f.push(\`\${p.passTD} passing TDs\`);
                    }
                    // Rushing
                    if (p.rushYd >= 150 || p.rushTD >= 3) {
                        if (p.rushYd >= 150 && p.rushTD >= 3) f.push(\`\${p.rushYd} rushing yards and \${p.rushTD} rushing TDs\`);
                        else if (p.rushYd >= 150) f.push(\`\${p.rushYd} rushing yards\`);
                        else f.push(\`\${p.rushTD} rushing TDs\`);
                    }
                    // Receiving
                    if (p.recYd >= 200 || p.receptions >= 12 || p.recTD >= 3) {
                        const recF = [];
                        if (p.recYd >= 200) recF.push(\`\${p.recYd} receiving yards\`);
                        if (p.receptions >= 12) recF.push(\`\${p.receptions} receptions\`);
                        if (p.recTD >= 3) recF.push(\`\${p.recTD} receiving TDs\`);
                        f.push(recF.join(', '));
                    }
                    // Defense
                    if (p.sacks >= 3.0 || p.interceptions >= 2) {
                        const defF = [];
                        if (p.sacks >= 3.0) defF.push(\`\${p.sacks} sacks\`);
                        if (p.interceptions >= 2) defF.push(\`\${p.interceptions} interceptions\`);
                        f.push(defF.join(', '));
                    }
                    // Special Teams
                    if (p.longestFG >= 55) {
                        f.push(\`a \${p.longestFG}-yard field goal\`);
                    }

                    if (f.length > 0) {
                        feats.push({
                            playerId: p.id || p.playerId || Object.keys(teamStats).find(key => teamStats[key] === p),
                            name: p.name,
                            pos: p.pos,
                            teamAbbr: teamAbbr,
                            opponentAbbr: oppAbbr,
                            featDescription: f.join(' and '),
                            statValue: '' // We embed values in the description for multiple feats
                        });
                    }
                }
                return feats;
            };

            const homeFeats = checkFeats(homePlayerStats, home.abbr, away.abbr);
            const awayFeats = checkFeats(awayPlayerStats, away.abbr, home.abbr);
            const allFeats = [...homeFeats, ...awayFeats];

            // Defensive Shutout (Team Feat)
            if (sA === 0) allFeats.push({ name: \`\${home.abbr} Defense\`, teamAbbr: home.abbr, opponentAbbr: away.abbr, featDescription: 'a defensive shutout', statValue: '' });
            if (sH === 0) allFeats.push({ name: \`\${away.abbr} Defense\`, teamAbbr: away.abbr, opponentAbbr: home.abbr, featDescription: 'a defensive shutout', statValue: '' });

            // Finalize Game Result via Commit`;

if (content.includes(featCheckStr) && !content.includes('// -- Feats Check --')) {
    content = content.replace(featCheckStr, newFeatCheckStr);

    // add feats to resultObj
    const commitGameStr = `            const resultObj = commitGameResult(league, gameData, { persist: false });`;
    const newCommitGameStr = `            const resultObj = commitGameResult(league, gameData, { persist: false });
            if (resultObj) {
                resultObj.feats = allFeats;
            }`;
    content = content.replace(commitGameStr, newCommitGameStr);

    fs.writeFileSync('src/core/game-simulator.js', content);
    console.log('Added Feats logic to game-simulator.js');
}
