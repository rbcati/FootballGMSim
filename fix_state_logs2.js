const fs = require('fs');
let content = fs.readFileSync('src/core/state.js', 'utf8');

content = content.replace(/console\.log\('Initializing fresh state\.\.\.'\);/g, '');
content = content.replace(/console\.log\('Fresh state created'\);/g, '');
content = content.replace(/console\.log\('Migrating state from version:', oldVersion, 'to', this\.init\(\)\.version\);/g, '');
content = content.replace(/console\.log\('State migration complete'\);/g, '');
content = content.replace(/console\.log\('Applying v4\.0\.0 migration\.\.\.'\);/g, '');
content = content.replace(/console\.log\('Resetting state\.\.\.'\);/g, '');
content = content.replace(/console\.log\('Loading state\.\.\.'\);/g, '');
content = content.replace(/console\.log\('No saved state found'\);/g, '');
content = content.replace(/console\.log\('Outdated state version, migrating\.\.\.'\);/g, '');
content = content.replace(/console\.log\('Valid state loaded'\);/g, '');
content = content.replace(/console\.log\('State saved successfully'\);/g, '');
content = content.replace(/console\.log\('Saved state cleared for slot', normalizedSlot\);/g, '');
content = content.replace(/console\.log\('Auto-save hook installed'\);/g, '');
content = content.replace(/console\.log\('Creating initial global state \(no save found\)\.\.\.'\);/g, '');
content = content.replace(/console\.log\('Global state already exists, skipping initialization\.'\);/g, '');
content = content.replace(/console\.log\('✅ State-Save Manager loaded\. Full state persistence is active\.'\);/g, '');

fs.writeFileSync('src/core/state.js', content);
console.log('Removed more logs from state.js');
