const fs = require('fs');

let content = fs.readFileSync('src/core/news-engine.js', 'utf8');
if (!content.includes('logNarrative')) {
    const newMethod = `    static async logNarrative(player, type, teamAbbr) {
        if (!player) return;
        let text = '';
        if (type === 'HOLDOUT') text = \`\${player.name} (\${teamAbbr}) is holding out for a new contract.\`;
        if (type === 'SUSPENSION') text = \`\${player.name} (\${teamAbbr}) has been suspended by the league.\`;
        if (type === 'CONDUCT') text = \`\${player.name} (\${teamAbbr}) was fined for conduct detrimental to the team.\`;

        if (text) {
             await this.logNews('NARRATIVE', text, player.teamId, { playerId: player.id });
        }
    }`;
    content = content.replace('    static async logGameEvent(game) {', newMethod + '\n\n    static async logGameEvent(game) {');
    fs.writeFileSync('src/core/news-engine.js', content);
    console.log('Added logNarrative to NewsEngine');
}
