const fs = require('fs');
let content = fs.readFileSync('src/ui/hooks/useWorker.js', 'utf8');

if (!content.includes('applyFranchiseTag')) {
    const newHook = `    restructureContract: (playerId, teamId) =>
      request(toWorker.RESTRUCTURE_CONTRACT, { playerId, teamId }),

    /** Applies the franchise tag to a pending free agent (returns a Promise) */
    applyFranchiseTag: (playerId, teamId) =>
      request(toWorker.APPLY_FRANCHISE_TAG, { playerId, teamId }),`;

    content = content.replace(`    restructureContract: (playerId, teamId) =>\n      request(toWorker.RESTRUCTURE_CONTRACT, { playerId, teamId }),`, newHook);
    fs.writeFileSync('src/ui/hooks/useWorker.js', content);
    console.log('Added applyFranchiseTag to useWorker.js');
}

// Add message type
if (!content.includes('APPLY_FRANCHISE_TAG:')) {
     const typesMatch = /export const toWorker = \{([\s\S]*?)\};/;
     const content2 = fs.readFileSync('src/worker/worker.js', 'utf8');
     const typesExtracted = content2.match(typesMatch)[0];

     content = content.replace(/export const toWorker = \{([\s\S]*?)\};/, typesExtracted);
     fs.writeFileSync('src/ui/hooks/useWorker.js', content);
     console.log('Synced toWorker types to useWorker.js');
}
