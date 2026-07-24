const fs = require('fs');

let css = fs.readFileSync('src/ui/styles/style.css', 'utf8');
css = css.replace(/\.btn:hover, button:hover \{\s*[^}]*\}/g, 'button:hover {\n  /* btn removed to avoid override */\n}');
css = css.replace(/\.btn:active, button:active \{\s*[^}]*\}/g, 'button:active {\n  /* btn removed to avoid override */\n}');
fs.writeFileSync('src/ui/styles/style.css', css);

css = fs.readFileSync('src/ui/styles/app-mobile.css', 'utf8');
css = css.replace(/\.btn:hover:not\(:disabled\) \{\s*[^}]*\}/g, '');
css = css.replace(/\.btn:active:not\(:disabled\) \{\s*[^}]*\}/g, '');
fs.writeFileSync('src/ui/styles/app-mobile.css', css);
