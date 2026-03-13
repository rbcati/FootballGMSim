const fs = require('fs');

let content = fs.readFileSync('src/core/strategy.js', 'utf8');

const regex = /\/\/ Merge risk modifiers([\s\S]*?)Object\.keys\(risk\.modifiers\)\.forEach\(key => \{([\s\S]*?)if \(mods\[key\]\) \{([\s\S]*?)mods\[key\] \*= risk\.modifiers\[key\];([\s\S]*?)\} else \{([\s\S]*?)mods\[key\] = risk\.modifiers\[key\];([\s\S]*?)\}([\s\S]*?)\}\);/g;

const newBlock = `    // Merge risk modifiers
    Object.keys(risk.modifiers).forEach(key => {
        if (mods[key]) {
            mods[key] *= risk.modifiers[key];
        } else {
            mods[key] = risk.modifiers[key];
        }
    });`;

if (content.includes('// Merge risk modifiers')) {
   console.log('Merge risk modifiers found');
}
