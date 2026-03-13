const fs = require('fs');
let content = fs.readFileSync('src/core/progression-logic.js', 'utf8');

const strToReplace = `    const devTrait = player.devTrait ?? 'Normal';
    const traitMods = DEV_TRAIT_MULTIPLIERS[devTrait] ?? DEV_TRAIT_MULTIPLIERS.Normal;
    const effectiveBreakoutProb = GROWTH_BREAKOUT_PROB + traitMods.breakoutBonus;
    const effectiveBustProb     = GROWTH_BREAKOUT_PROB + GROWTH_BUST_PROB; // bust range end`;

const newStr = `    const devTrait = player.devTrait ?? 'Normal';
    const traitMods = DEV_TRAIT_MULTIPLIERS[devTrait] ?? DEV_TRAIT_MULTIPLIERS.Normal;
    let effectiveBreakoutProb = GROWTH_BREAKOUT_PROB + traitMods.breakoutBonus;
    let effectiveBustProb     = GROWTH_BREAKOUT_PROB + GROWTH_BUST_PROB; // bust range end

    // Personality Trait Modifiers
    if (player.personality?.traits) {
        if (player.personality.traits.includes('High Work Ethic')) {
            effectiveBreakoutProb += 0.15; // 15% higher chance of positive roll/breakout
        }
        if (player.personality.traits.includes('Low Work Ethic')) {
            effectiveBustProb += 0.15; // 15% higher chance of negative roll/bust
        }
    }`;

if (content.includes(strToReplace)) {
    content = content.replace(strToReplace, newStr);
    fs.writeFileSync('src/core/progression-logic.js', content);
    console.log('Added Work Ethic traits to progression-logic.js');
} else {
    console.log('Could not find the target string in progression-logic.js');
}
