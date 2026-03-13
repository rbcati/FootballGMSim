const fs = require('fs');

let content = fs.readFileSync('src/worker/worker.js', 'utf8');
if (!content.includes('hof:')) {
    const retirementStr = `    if (willRetire) {
      retired.push({ id: player.id, name: player.name, pos: player.pos, age, ovr: player.ovr });
      if (player.teamId != null) recalculateTeamCap(player.teamId);
      // Mark as retired instead of deleting — keeps the player record in DB
      // so GET_PLAYER_CAREER can still resolve name/pos/ovr for history views.
      cache.updatePlayer(player.id, { status: 'retired', teamId: null, age });
    }`;

    const hofRetirementStr = `    if (willRetire) {
      retired.push({ id: player.id, name: player.name, pos: player.pos, age, ovr: player.ovr });
      if (player.teamId != null) recalculateTeamCap(player.teamId);

      // Calculate Hall of Fame induction
      // Very basic heuristic for now
      let isHof = false;
      if (player.accolades && player.accolades.length > 0) {
          let score = player.ovr;
          for (const a of player.accolades) {
              if (a.type === 'MVP') score += 10;
              if (a.type === 'SB_MVP') score += 5;
              if (a.type === 'OPOY' || a.type === 'DPOY') score += 5;
              if (a.type === 'PRO_BOWL') score += 2;
          }
          if (score > 120) isHof = true; // Needs some accolades and high ovr
      }

      if (isHof) {
          NewsEngine.logNews('HOF', \`⭐️ \${player.pos} \${player.name} has been inducted into the Hall of Fame!\`);
      }

      // Mark as retired instead of deleting — keeps the player record in DB
      // so GET_PLAYER_CAREER can still resolve name/pos/ovr for history views.
      cache.updatePlayer(player.id, { status: 'retired', teamId: null, age, hof: isHof });
    }`;

    content = content.replace(retirementStr, hofRetirementStr);
    fs.writeFileSync('src/worker/worker.js', content);
    console.log('Added HOF logic to worker.js');
}
