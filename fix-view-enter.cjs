const fs = require('fs');

let css = fs.readFileSync('src/ui/styles/ui-enhancements.css', 'utf8');
css = css.replace(/@keyframes view-enter \{\s*0% \{\s*opacity: 0;\s*transform: translateY\([^)]*\);\s*\}\s*100% \{\s*opacity: 1;\s*transform: translateY\(0\);\s*\}\s*\}/g, `@keyframes view-enter {
  0% {
    opacity: 0;
    transform: translateY(10px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}`);

// Check if view-exit is there
if (!css.includes('@keyframes view-exit')) {
  css += `

/* Smooth View Exit Transition */
@keyframes view-exit {
  0% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-10px); }
}

.view-exit {
  animation: view-exit 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
`;
}
fs.writeFileSync('src/ui/styles/ui-enhancements.css', css);
