const fs = require('fs');

let content = fs.readFileSync('src/worker/worker.js', 'utf8');
if (!content.includes('// Phase 4 Opus: Narrative Events')) {
    const aiTradeHookStr = `  // --- AI-to-AI Trades (regular season only) ---`;

    const newEventsStr = `  // Phase 4 Opus: Narrative Events
  if (meta.phase === 'regular' || meta.phase === 'preseason') {
      const userRoster = cache.getPlayersByTeam(meta.userTeamId);
      const team = cache.getTeam(meta.userTeamId);
      for (const p of userRoster) {
          // 1% chance per week for low morale players to holdout
          if (p.morale < 30 && p.ovr > 80 && Math.random() < 0.01) {
              await NewsEngine.logNarrative(p, 'HOLDOUT', team?.abbr || 'FA');
              // Could also apply a temporary OVR penalty or status change here
          }
          // 0.5% chance per week for any player to get a conduct fine
          if (Math.random() < 0.005) {
              await NewsEngine.logNarrative(p, 'CONDUCT', team?.abbr || 'FA');
              // Apply morale hit
              cache.updatePlayer(p.id, { morale: Math.max(0, p.morale - 10) });
          }
      }
  }

  // --- AI-to-AI Trades (regular season only) ---`;

    content = content.replace(aiTradeHookStr, newEventsStr);
    fs.writeFileSync('src/worker/worker.js', content);
    console.log('Hooked up Narrative Events to worker');
}
