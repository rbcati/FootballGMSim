const fs = require('fs');

let content = fs.readFileSync('src/worker/worker.js', 'utf8');

const regex = /\/\/ Phase 4 Opus: Narrative Events([\s\S]*?)for \(const p of userRoster\) \{([\s\S]*?)\/\/ 1% chance per week for low morale players to holdout([\s\S]*?)if \(p\.morale < 30 && p\.ovr > 80 && Math\.random\(\) < 0\.01\) \{([\s\S]*?)\/\/ 0\.5% chance per week for any player to get a conduct fine([\s\S]*?)if \(Math\.random\(\) < 0\.005\) \{([\s\S]*?)\}\n  \}/g;

const replaceWith = `// Phase 4 Opus: Narrative Events
  if (meta.phase === 'regular' || meta.phase === 'preseason') {
      const userRoster = cache.getPlayersByTeam(meta.userTeamId);
      const team = cache.getTeam(meta.userTeamId);
      for (const p of userRoster) {
          const isDivisive = p.personality?.traits?.includes('Divisive');
          const holdoutProb = isDivisive ? 0.03 : 0.01;
          const conductProb = isDivisive ? 0.02 : 0.005;

          // chance per week for low morale players to holdout
          if (p.morale < 30 && p.ovr > 80 && Math.random() < holdoutProb) {
              await NewsEngine.logNarrative(p, 'HOLDOUT', team?.abbr || 'FA');
              // Could also apply a temporary OVR penalty or status change here
          }
          // chance per week for any player to get a conduct fine
          if (Math.random() < conductProb) {
              await NewsEngine.logNarrative(p, 'CONDUCT', team?.abbr || 'FA');
              // Apply morale hit
              cache.updatePlayer(p.id, { morale: Math.max(0, p.morale - 10) });
          }
      }
  }`;

content = content.replace(/\/\/ Phase 4 Opus: Narrative Events[\s\S]*?\n  \}/, replaceWith);
fs.writeFileSync('src/worker/worker.js', content);
console.log('Fixed Narrative Events probabilities based on Divisive trait');
