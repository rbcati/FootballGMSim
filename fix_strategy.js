const fs = require('fs');

let content = fs.readFileSync('src/core/strategy.js', 'utf8');

const regex = /\/\/ Apply Diminishing Returns \(Task 5\)([\s\S]*?)defUsage > 3 && defPlan\.modifiers\[key\]\)\) \{([\s\S]*?)mods\[key\] = 1\.0 \+ \(mods\[key\] - 1\.0\) \* penaltyFactor;([\s\S]*?)\}/g;
const replaceWith = `// Apply Diminishing Returns (Task 5)
    // If a plan is used frequently, opponents adapt.
    const offUsage = usageHistory && usageHistory[offPlanId] ? usageHistory[offPlanId] : 0;
    const defUsage = usageHistory && usageHistory[defPlanId] ? usageHistory[defPlanId] : 0;

    // Check overuse (progressive penalty)
    const applyPenalty = (usage, planMods, currentMods, key) => {
        if (usage > 3 && planMods[key]) {
            // Every week beyond 3 reduces the bonus further (max 90% reduction)
            const penaltyFactor = Math.max(0.1, 1.0 - ((usage - 3) * 0.15));
            if (currentMods[key] > 1.0) {
                currentMods[key] = 1.0 + (currentMods[key] - 1.0) * penaltyFactor;
            } else if (currentMods[key] < 1.0) {
                 // If it's a penalty (< 1.0), it gets WORSE with overuse
                 currentMods[key] = currentMods[key] - ((1.0 - currentMods[key]) * (1.0 - penaltyFactor));
            }
        }
    };

    Object.keys(mods).forEach(key => {
        applyPenalty(offUsage, offPlan.modifiers, mods, key);
        applyPenalty(defUsage, defPlan.modifiers, mods, key);
    });`;

if (content.includes('// Apply Diminishing Returns (Task 5)')) {
    const oldBlock = `    // Apply Diminishing Returns (Task 5)
    // If a plan is used frequently, opponents adapt.
    const offUsage = usageHistory && usageHistory[offPlanId] ? usageHistory[offPlanId] : 0;
    const defUsage = usageHistory && usageHistory[defPlanId] ? usageHistory[defPlanId] : 0;

    // Check overuse
    if (offUsage > 3 || defUsage > 3) {
        const penaltyFactor = 0.9;
         Object.keys(mods).forEach(key => {
            // Apply penalty only if the modifier comes from the overused plan
            // Heuristic: Check if modifier exists in the specific plan
            if ((offUsage > 3 && offPlan.modifiers[key]) || (defUsage > 3 && defPlan.modifiers[key])) {
                if (mods[key] > 1.0) {
                    mods[key] = 1.0 + (mods[key] - 1.0) * penaltyFactor;
                }
            }
        });
    }`;
    content = content.replace(oldBlock, replaceWith);
    fs.writeFileSync('src/core/strategy.js', content);
    console.log('Fixed strategy overuse in strategy.js');
}
