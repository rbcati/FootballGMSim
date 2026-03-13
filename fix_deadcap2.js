const fs = require('fs');
let content = fs.readFileSync('src/core/ai-logic.js', 'utf8');

const oldStr4 = `                // Calculate dead cap (all remaining prorated bonus — preseason = pre-June-1)
                const c           = p.contract;
                const annualBonus = (c?.signingBonus ?? 0) / (c?.yearsTotal || 1);
                const deadMoney   = annualBonus * (c?.years ?? 1);

                cache.updatePlayer(p.id, { teamId: null, status: 'free_agent' });
                if (deadMoney > 0) {
                    const t = cache.getTeam(team.id);
                    cache.updateTeam(team.id, { deadCap: (t.deadCap ?? 0) + deadMoney });
                }`;

const newStr4 = `                // Calculate dead cap (Preseason is Post-June 1)
                const c           = p.contract;
                const annualBonus = (c?.signingBonus ?? 0) / (c?.yearsTotal || 1);
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
    content = content.replace(`details: { playerId: p.id, deadCap: deadMoney, aiCapCut: true },`, `details: { playerId: p.id, deadCap: currentYearDead, aiCapCut: true },`);
    fs.writeFileSync('src/core/ai-logic.js', content);
    console.log('Fixed preseason AI cap management dead cap in ai-logic.js');
}
