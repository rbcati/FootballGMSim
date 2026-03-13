const fs = require('fs');

// Add to protocol.js
let pContent = fs.readFileSync('src/worker/protocol.js', 'utf8');
if (!pContent.includes('RELOCATE_TEAM')) {
    pContent = pContent.replace(/  NEW_LEAGUE:\s+'NEW_LEAGUE',/g, `  NEW_LEAGUE:         'NEW_LEAGUE',\n  RELOCATE_TEAM:      'RELOCATE_TEAM',`);
    fs.writeFileSync('src/worker/protocol.js', pContent);
    console.log('Added RELOCATE_TEAM to protocol.js');
}

// Add RELOCATE_TEAM to worker.js switch statement
let wContent = fs.readFileSync('src/worker/worker.js', 'utf8');
if (!wContent.includes('case toWorker.RELOCATE_TEAM:')) {
    const regex = /case toWorker\.NEW_LEAGUE:         return await handleNewLeague\(payload, id\);/g;
    wContent = wContent.replace(regex, `case toWorker.NEW_LEAGUE:         return await handleNewLeague(payload, id);\n      case toWorker.RELOCATE_TEAM:      return await handleRelocateTeam(payload, id);`);
    fs.writeFileSync('src/worker/worker.js', wContent);
    console.log('Hooked RELOCATE_TEAM in worker.js main loop');
}
