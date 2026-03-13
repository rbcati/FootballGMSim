const fs = require('fs');
let content = fs.readFileSync('src/core/player.js', 'utf8');

const oldGenPers = `function generatePersonality() {
    const traits = [];
    const numTraits = U.rand(1, 2);
    const possibleTraits = ['Winner', 'Loyal', 'Greedy', 'Clutch', 'Leader', 'Mentor', 'Injury Prone', 'Iron Man'];
    for (let i = 0; i < numTraits; i++) {
        const trait = U.choice(possibleTraits);
        if (!traits.includes(trait)) traits.push(trait);
    }
    return { traits };
}`;

const newGenPers = `function generatePersonality() {
    const traits = [];
    const numTraits = U.rand(1, 2);
    const possibleTraits = ['High Work Ethic', 'Low Work Ethic', 'Leadership', 'Divisive', 'Clutch', 'Loyal', 'Greedy', 'Mentor'];

    // Prevent conflicting traits
    const addTrait = (trait) => {
        if (trait === 'High Work Ethic' && traits.includes('Low Work Ethic')) return false;
        if (trait === 'Low Work Ethic' && traits.includes('High Work Ethic')) return false;
        if (trait === 'Leadership' && traits.includes('Divisive')) return false;
        if (trait === 'Divisive' && traits.includes('Leadership')) return false;
        if (!traits.includes(trait)) {
            traits.push(trait);
            return true;
        }
        return false;
    };

    let attempts = 0;
    while (traits.length < numTraits && attempts < 10) {
        addTrait(U.choice(possibleTraits));
        attempts++;
    }
    return { traits };
}`;

content = content.replace(oldGenPers, newGenPers);
fs.writeFileSync('src/core/player.js', content);
console.log('Fixed generatePersonality in player.js');
