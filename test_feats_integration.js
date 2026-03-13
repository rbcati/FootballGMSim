const fs = require('fs');

const wPath = 'src/worker/worker.js';
let wContent = fs.readFileSync(wPath, 'utf8');

const regex = /const gameId = \`\$\{seasonId\}_w\$\{week\}_\$\{hId\}_\$\{aId\}\`;/g;
if (wContent.includes("const gameId = \`\$\{seasonId\}_w\$\{week\}_\$\{hId\}_\$\{aId\}\`;")) {
    wContent = wContent.replace(regex, `
  // Process feats
  if (result.feats && result.feats.length > 0) {
    for (const feat of result.feats) {
      if (feat.playerId) {
        const p = cache.getPlayer(feat.playerId);
        NewsEngine.logFeat(p || { id: feat.playerId, name: feat.name, teamId: p?.teamId }, feat.teamAbbr, feat.opponentAbbr, feat.featDescription, '');
      } else {
         // Team Feats
         const t = cache.getTeam(feat.teamAbbr);
         NewsEngine.logNews('FEAT', \`Feat: \${feat.name} recorded \${feat.featDescription} against \${feat.opponentAbbr}.\`, t?.id);
      }
    }
  }

  const gameId = \`\$\{seasonId\}_w\$\{week\}_\$\{hId\}_\$\{aId\}\`;`);
    fs.writeFileSync(wPath, wContent);
    console.log("Feats integration added to worker.js");
}
