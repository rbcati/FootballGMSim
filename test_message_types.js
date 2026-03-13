const fs = require('fs');

let content = fs.readFileSync('src/worker/worker.js', 'utf8');
const match = content.match(/case toWorker\.([A-Z_]+):/g);
if (match) {
    console.log(match.join('\n'));
}
