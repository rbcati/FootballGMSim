const fs = require('fs');

let content = fs.readFileSync('src/core/trade-logic.js', 'utf8');

const regex = /export function calculatePlayerValue\(player\) \{([\s\S]*?)return Math\.max\(0, rawValue - agePenalty - contractPenalty\);\n\}/;

const replaceWith = `export function calculatePlayerValue(player) {
  const ovr = player.ovr       ?? 60;
  const pot = player.potential  ?? player.ovr ?? 60;
  const age = player.age        ?? 26;

  // Position multiplier (from Constants.POSITION_VALUES)
  const posValues  = Constants?.POSITION_VALUES ?? {};
  const posMult    = posValues[player.pos] ?? 1.0;

  // Age Curve - Opus Phase 4 - Realism adjustments
  // Sharp drop-off post 28, especially for RBs
  let agePenalty = 0;
  if (player.pos === 'RB' && age >= 27) {
      agePenalty = Math.pow(1.15, age - 26) * 10;
  } else if (age >= 30) {
      agePenalty = Math.pow(1.10, age - 29) * 8;
  }

  // Contract cost penalty (expensive players are harder to trade for)
  const annualSalary  = player.contract?.baseAnnual ?? 0;
  const capHitPct = annualSalary / Constants.SALARY_CAP.HARD_CAP;
  const contractPenalty = capHitPct * 200; // Adjust penalty based on cap percentage

  // Base calculation heavily rewards potential for young players
  const potWeight = age <= 25 ? 1.2 : 0.5;
  const ovrWeight = age <= 25 ? 0.8 : 1.5;

  const rawValue = ((ovr * ovrWeight) + (pot * potWeight)) * posMult;
  return Math.max(0, rawValue - agePenalty - contractPenalty);
}`;

if (content.includes('export function calculatePlayerValue(player) {')) {
    content = content.replace(regex, replaceWith);
    fs.writeFileSync('src/core/trade-logic.js', content);
    console.log('Improved Trade AI logic in trade-logic.js');
}
