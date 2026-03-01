const fs = require('fs');
let code = fs.readFileSync('src/ui/components/NewsFeed.jsx', 'utf8');

code = code.replace(
  "News.getRecent(10).then(setNews).catch(console.error);",
  "if (league?.id) {\n            configureActiveLeague(league.id);\n            News.getRecent(10).then(setNews).catch(console.error);\n        }"
);

fs.writeFileSync('src/ui/components/NewsFeed.jsx', code);
