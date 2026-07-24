const fs = require('fs');
let css = fs.readFileSync('src/ui/styles/ui-enhancements.css', 'utf8');

// There are more hardcoded colors in .save .event-text, .touchdown, etc. Let's fix them if any remain.
css = css.replace(/rgba\(255, 69, 58, 0.8\)/g, 'rgba(var(--danger-rgb), 0.8)');
// wait, the app might not have var(--danger-rgb). Let's just use var(--danger) or ignore the opacity if it's drop shadow.
// Actually `0 0 30px var(--danger)` is fine for box shadow.
css = css.replace(/box-shadow: 0 0 30px rgba\(255, 69, 58, 0.8\);/g, 'box-shadow: 0 0 30px var(--danger);');

fs.writeFileSync('src/ui/styles/ui-enhancements.css', css);
