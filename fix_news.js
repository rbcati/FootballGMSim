const fs = require('fs');
let content = fs.readFileSync('src/core/news-engine.js', 'utf8');

if (!content.includes('logFeat')) {
    const addFeatStr = `    static async logFeat(player, teamAbbr, opponentAbbr, featDescription, statValue) {
        if (!player) return;
        const text = \`Feat: \${player.name} recorded \${statValue} \${featDescription} against \${opponentAbbr}.\`;
        await this.logNews('FEAT', text, player.teamId, {
            playerId: player.id,
            featDescription,
            statValue
        });
    }

    static async logGameEvent(game) {`;

    content = content.replace('    static async logGameEvent(game) {', addFeatStr);
    fs.writeFileSync('src/core/news-engine.js', content);
    console.log('Added logFeat to NewsEngine');
}
