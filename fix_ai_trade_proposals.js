const fs = require('fs');
const path = 'src/core/trade-logic.js';
let content = fs.readFileSync(path, 'utf8');

// Need to inject a method to generate AI trade proposals for the user
if (!content.includes('generateAITradeProposalsForUser')) {
    const aiTradeStr = `
/**
 * Phase 4 Opus: AI-Initiated Trade Proposals
 * The AI evaluates the user's roster for surplus and needs, and generates
 * 1-2 trade proposals from AI teams that match those needs.
 */
export function generateAITradeProposalsForUser() {
    const meta = cache.getMeta();
    if (!meta || meta.phase !== 'regular') return [];

    const userTeamId = meta.userTeamId;
    if (!userTeamId) return [];

    const allTeams = cache.getAllTeams();
    const userTeam = allTeams.find(t => t.id === userTeamId);
    if (!userTeam) return [];

    const aiTeams = allTeams.filter(t => t.id !== userTeamId);
    const userNeeds = getTeamNeeds(userTeamId);
    const userSurplus = getSurplusPlayers(userTeamId);

    const proposals = [];

    // The AI looks for what the user needs and offers it, asking for user surplus in return
    for (const aiTeam of aiTeams) {
        if (proposals.length >= 2) break; // Max 2 proposals per week

        const aiSurplus = getSurplusPlayers(aiTeam.id);
        const aiNeeds = getTeamNeeds(aiTeam.id);

        for (const userNeed of userNeeds) {
            const aiOffer = aiSurplus.find(p => p.pos === userNeed.pos && getPlayerTradeValue(p) >= 40);
            if (aiOffer) {
                // Find what the AI wants in return
                for (const aiNeed of aiNeeds) {
                    const userAsset = userSurplus.find(p => p.pos === aiNeed.pos);
                    if (userAsset) {
                        const valA = getPlayerTradeValue(aiOffer);
                        const valB = getPlayerTradeValue(userAsset);

                        // Check if values are close enough (AI is willing to overpay slightly or underpay slightly)
                        if (valA > 0 && valB > 0 && Math.abs(valA - valB) / Math.max(valA, valB) <= 0.20) {
                            proposals.push({
                                offeringTeamId: aiTeam.id,
                                offeringTeamAbbr: aiTeam.abbr,
                                offeringPlayerId: aiOffer.id,
                                offeringPlayerName: aiOffer.name,
                                receivingPlayerId: userAsset.id,
                                receivingPlayerName: userAsset.name,
                                timestamp: Date.now()
                            });
                            // Remove from surplus to prevent duplicate logic
                            aiSurplus.splice(aiSurplus.indexOf(aiOffer), 1);
                            userSurplus.splice(userSurplus.indexOf(userAsset), 1);
                            break; // Move to next team
                        }
                    }
                }
            }
            if (proposals.some(p => p.offeringTeamId === aiTeam.id)) break;
        }
    }

    return proposals;
}
`;
    content += aiTradeStr;
    fs.writeFileSync(path, content);
    console.log('Added generateAITradeProposalsForUser to trade-logic.js');
}
