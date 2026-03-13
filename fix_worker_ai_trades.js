const fs = require('fs');

let content = fs.readFileSync('src/worker/worker.js', 'utf8');

if (!content.includes('generateAITradeProposalsForUser')) {
    content = content.replace(`import { runAIToAITrades }          from '../core/trade-logic.js';`, `import { runAIToAITrades, generateAITradeProposalsForUser }          from '../core/trade-logic.js';`);

    const aiTradeHookStr = `  // --- AI-to-AI Trades (regular season only) ---
  // Runs after standings/scores are finalised so AI decisions reflect current rosters.
  // Max 2 trades per week — see trade-logic.js for full guardrails.
  if (meta.phase === 'regular') {
    try {
      await runAIToAITrades();

      // Also generate trade proposals for the user
      const tradeProposals = generateAITradeProposalsForUser();
      if (tradeProposals.length > 0) {
         // Create a news item or notification for the UI
         for (const prop of tradeProposals) {
            NewsEngine.logNews('TRADE_PROPOSAL', \`🚨 \${prop.offeringTeamAbbr} has offered \${prop.offeringPlayerName} in exchange for \${prop.receivingPlayerName}.\`, null, { isProposal: true, ...prop });
         }
      }
    } catch (tradeErr) {
      // Trade engine errors should never crash the week advance.
      console.warn('[Worker] AI trade engine error (non-fatal):', tradeErr.message);
    }
  }`;

    content = content.replace(`  // --- AI-to-AI Trades (regular season only) ---
  // Runs after standings/scores are finalised so AI decisions reflect current rosters.
  // Max 2 trades per week — see trade-logic.js for full guardrails.
  if (meta.phase === 'regular') {
    try {
      await runAIToAITrades();
    } catch (tradeErr) {
      // Trade engine errors should never crash the week advance.
      console.warn('[Worker] AI trade engine error (non-fatal):', tradeErr.message);
    }
  }`, aiTradeHookStr);

    fs.writeFileSync('src/worker/worker.js', content);
    console.log('Hooked up AI Trade Proposals to worker');
}
