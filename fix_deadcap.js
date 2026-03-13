const fs = require('fs');

const fixDeadCap = (path) => {
  let content = fs.readFileSync(path, 'utf8');

  // In ai-logic.js
  if (path.includes('ai-logic.js')) {
    const oldStr = `                // Calculate Dead Cap
                const c = p.contract;
                const annualBonus = (c?.signingBonus ?? 0) / (c?.yearsTotal || 1);
                const deadCap = annualBonus * (c?.years || 1);`;

    const newStr = `                // Calculate Dead Cap (post-June 1 rules for preseason)
                const c = p.contract;
                const annualBonus = (c?.signingBonus ?? 0) / (c?.yearsTotal || 1);
                const yearsRemaining = c?.years || 1;
                const currentYearDead = annualBonus;
                const futureYearsDead = annualBonus * Math.max(0, yearsRemaining - 1);`;

    if (content.includes(oldStr)) {
        content = content.replace(oldStr, newStr);

        const oldStr2 = `                // Update Team Dead Cap
                if (deadCap > 0) {
                    const freshTeam = cache.getTeam(team.id);
                    const newDead = (freshTeam.deadCap ?? 0) + deadCap;
                    cache.updateTeam(team.id, { deadCap: newDead });
                }`;

        const newStr2 = `                // Update Team Dead Cap (Preseason cutdowns are post-June 1)
                const freshTeam = cache.getTeam(team.id);
                if (currentYearDead > 0) {
                    cache.updateTeam(team.id, { deadCap: (freshTeam.deadCap ?? 0) + currentYearDead });
                }
                if (futureYearsDead > 0) {
                    cache.updateTeam(team.id, { deadMoneyNextYear: (freshTeam.deadMoneyNextYear ?? 0) + futureYearsDead });
                }`;
        content = content.replace(oldStr2, newStr2);

        const oldStr3 = `details: { playerId: p.id, deadCap }`;
        const newStr3 = `details: { playerId: p.id, deadCap: currentYearDead }`;
        content = content.replace(oldStr3, newStr3);
        console.log('Fixed preseason AI cutdowns dead cap in ai-logic.js');
    }

    const oldStr4 = `                // Calculate dead cap (all remaining prorated bonus — preseason = pre-June-1)
                const deadMoney   = annualBonus * (c?.years ?? 1);

                cache.updatePlayer(p.id, { teamId: null, status: 'free_agent' });
                if (deadMoney > 0) {
                    const t = cache.getTeam(team.id);
                    cache.updateTeam(team.id, { deadCap: (t.deadCap ?? 0) + deadMoney });
                }`;

    const newStr4 = `                // Calculate dead cap (Preseason is Post-June 1)
                const yearsRemaining = c?.years || 1;
                const currentYearDead = annualBonus;
                const futureYearsDead = annualBonus * Math.max(0, yearsRemaining - 1);

                cache.updatePlayer(p.id, { teamId: null, status: 'free_agent' });
                const t = cache.getTeam(team.id);
                if (currentYearDead > 0) {
                    cache.updateTeam(team.id, { deadCap: (t.deadCap ?? 0) + currentYearDead });
                }
                if (futureYearsDead > 0) {
                    cache.updateTeam(team.id, { deadMoneyNextYear: (t.deadMoneyNextYear ?? 0) + futureYearsDead });
                }`;

    if (content.includes(oldStr4)) {
         content = content.replace(oldStr4, newStr4);
         const oldStr5 = `details: { playerId: p.id, deadCap: deadMoney, aiCapCut: true },`;
         const newStr5 = `details: { playerId: p.id, deadCap: currentYearDead, aiCapCut: true },`;
         content = content.replace(oldStr5, newStr5);
         console.log('Fixed preseason AI cap management dead cap in ai-logic.js');
    }
  }

  fs.writeFileSync(path, content);
}

fixDeadCap('src/core/ai-logic.js');
