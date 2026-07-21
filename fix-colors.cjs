const fs = require('fs');

function replaceColors(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(/#ef4444/gi, 'var(--danger)');
  content = content.replace(/#f59e0b/gi, 'var(--warning)');
  // We only replace specific exact matches for the others

  if (filePath.includes('style.css')) {
    content = content.replace(/#34C759/gi, 'var(--success)');
    content = content.replace(/#FF453A/gi, 'var(--danger)');
    content = content.replace(/#0A84FF/gi, 'var(--accent)');
  }

  if (filePath.includes('stadium-theme.css')) {
    content = content.replace(/#34C759/gi, 'var(--success)');
    content = content.replace(/#FF453A/gi, 'var(--danger)');
  }

  // base.css fixes
  if (filePath.includes('base.css')) {
    content = content.replace(/,\s*monospace/g, ''); // removes monospace fallback
  }

  fs.writeFileSync(filePath, content);
}

replaceColors('src/ui/styles/components.css');
replaceColors('src/ui/styles/ui-enhancements.css');
replaceColors('src/ui/styles/base.css');
replaceColors('src/ui/styles/hub.css');
replaceColors('src/ui/styles/style.css');
replaceColors('src/ui/styles/stadium-theme.css');
