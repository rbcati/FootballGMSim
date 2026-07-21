const fs = require('fs');

function removeBtnOverrides(filepath) {
  let css = fs.readFileSync(filepath, 'utf8');

  // Remove basic .btn overrides
  css = css.replace(/\.btn:active \{\s*[^}]*\}/g, '');
  css = css.replace(/\.btn:hover \{\s*[^}]*\}/g, '');
  css = css.replace(/\.btn:hover::before \{\s*[^}]*\}/g, '');

  // Also remove group declarations where .btn is part of it
  // Example: .btn:hover, button:hover { ... }
  // We'll replace '.btn:hover, ' with '' and let it be. But easier to do manually for specific ones.
  fs.writeFileSync(filepath, css);
}

removeBtnOverrides('src/ui/styles/ui-enhancements.css');
removeBtnOverrides('src/ui/styles/app-mobile.css');
removeBtnOverrides('src/ui/styles/style.css');
