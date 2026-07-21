const fs = require('fs');
let css = fs.readFileSync('src/ui/styles/components.css', 'utf8');

// Update .btn:active
css = css.replace(/\.btn:active \{\s*[^}]*\}/g, `.btn:active {
  transform: scale(0.95) translateY(1px) !important;
  box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.2) !important;
  filter: brightness(0.95);
}`);

// Update .btn:hover
css = css.replace(/@media \(hover: hover\) and \(pointer: fine\) \{\s*\.btn:hover \{\s*[^}]*\}/g, `@media (hover: hover) and (pointer: fine) {
  .btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    filter: brightness(1.05);
  }`);

fs.writeFileSync('src/ui/styles/components.css', css);
