const fs = require('fs');
let css = fs.readFileSync('src/ui/styles/ui-enhancements.css', 'utf8');

// The CSS has some hardcoded colors for .game-event-overlay and multiple definitions of the same animation.
// Let's replace the colors in `.game-event-overlay` and `.game-event-overlay *` rules
// Specifically looking for hardcoded hex and replacing them, but also fixing the animations.

css = css.replace(/\.game-event-overlay\.goal \.event-text\s*\{\s*animation: [^;]*;\s*color: [^;]*;\s*text-shadow: [^;]*;\s*transform-origin: [^;]*;\s*\}/g, `.game-event-overlay.goal .event-text {
  animation: goal-celebration 1s ease-out !important;
  color: var(--accent) !important;
  text-shadow: 0 0 25px var(--accent), 0 0 45px var(--success) !important;
  transform-origin: center center;
}`);

css = css.replace(/\.game-event-overlay\.kick \.event-text\s*\{\s*animation: [^;]*;\s*color: [^;]*;\s*text-shadow: [^;]*;\s*transform-origin: [^;]*;\s*\}/g, `.game-event-overlay.kick .event-text {
  animation: pulse-score-strong 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
  color: var(--accent) !important;
  text-shadow: 0 0 20px var(--accent) !important;
  transform-origin: center center;
}`);

css = css.replace(/\.game-event-overlay\.save::before\s*\{\s*animation: [^;]*;\s*filter: [^;]*;\s*transform-origin: [^;]*;\s*\}/g, `.game-event-overlay.save::before {
  animation: shield-pop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
  filter: drop-shadow(0 0 15px var(--danger)) !important;
  transform-origin: center center;
}`);

// Also clean up any other duplicates in earlier parts of the file
css = css.replace(/\.game-event-overlay\.goal \.event-text\s*\{[^}]*\}/g, match => {
    if (match.includes('!important')) return match; // Keep the one we just fixed
    return ''; // Remove others
});
css = css.replace(/\.game-event-overlay\.kick \.event-text\s*\{[^}]*\}/g, match => {
    if (match.includes('!important')) return match; // Keep the one we just fixed
    return ''; // Remove others
});
css = css.replace(/\.game-event-overlay\.save::before\s*\{[^}]*\}/g, match => {
    if (match.includes('!important')) return match; // Keep the one we just fixed
    return ''; // Remove others
});


fs.writeFileSync('src/ui/styles/ui-enhancements.css', css);
