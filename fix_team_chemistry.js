const fs = require('fs');

let content = fs.readFileSync('src/core/scheme-core.js', 'utf8');

const regex = /  const avgOffensiveRating = offensiveCount > 0 \? offensiveRating \/ offensiveCount : 0;\n  const avgDefensiveRating = defensiveCount > 0 \? defensiveRating \/ defensiveCount : 0;\n  const avgOffensiveFit = offensiveCount > 0 \? offensiveFitTotal \/ offensiveCount : 50;\n  const avgDefensiveFit = defensiveCount > 0 \? defensiveFitTotal \/ defensiveCount : 50;/g;

const newStr = `  let avgOffensiveRating = offensiveCount > 0 ? offensiveRating / offensiveCount : 0;
  let avgDefensiveRating = defensiveCount > 0 ? defensiveRating / defensiveCount : 0;
  const avgOffensiveFit = offensiveCount > 0 ? offensiveFitTotal / offensiveCount : 50;
  const avgDefensiveFit = defensiveCount > 0 ? defensiveFitTotal / defensiveCount : 50;

  // Apply Personality Traits (Chemistry)
  // Leadership gives a +5 boost to team chemistry (reflected as rating boost)
  // Divisive gives a -5 penalty
  let chemistryBonus = 0;
  let hasLeader = false;
  let hasDivisive = false;

  // Ideally we only check starters, but for now we check top 22 players by OVR
  const topPlayers = [...team.roster].sort((a, b) => b.ovr - a.ovr).slice(0, 22);
  for (const p of topPlayers) {
      if (p.personality?.traits?.includes('Leadership')) hasLeader = true;
      if (p.personality?.traits?.includes('Divisive')) hasDivisive = true;
  }

  if (hasLeader) chemistryBonus += 5;
  if (hasDivisive) chemistryBonus -= 5;

  avgOffensiveRating += chemistryBonus;
  avgDefensiveRating += chemistryBonus;
`;

if (content.includes('const avgOffensiveRating = offensiveCount > 0 ? offensiveRating / offensiveCount : 0;')) {
    content = content.replace(regex, newStr);
    fs.writeFileSync('src/core/scheme-core.js', content);
    console.log('Added Team Chemistry logic to scheme-core.js');
}
