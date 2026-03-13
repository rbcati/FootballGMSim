const fs = require('fs');

let content = fs.readFileSync('src/ui/components/NewsFeed.jsx', 'utf8');
if (!content.includes('TRADE_PROPOSAL')) {
    content = content.replace(`  if (item.type === "INJURY") {`, `  if (item.type === "INJURY") {
    icon = "🚑";
    color = "var(--danger)";
  } else if (item.type === "TRADE_PROPOSAL") {
    icon = "🚨";
    color = "var(--accent)";
  } else if (item.type === "FEAT" || item.type === "MILESTONE") {
    icon = "⭐";
    color = "var(--warning)";
  } else if (item.type === "NARRATIVE") {
    icon = "🎭";
    color = "var(--text)";
  } else if (item.type === "INJURY") { // Re-trigger to avoid syntax issue`);
    fs.writeFileSync('src/ui/components/NewsFeed.jsx', content);
    console.log('Added missing NewsFeed types');
}
