const fs = require('fs');

// Add endpoint to worker.js
let wContent = fs.readFileSync('src/worker/worker.js', 'utf8');

if (!wContent.includes('RELOCATE_TEAM')) {
    const wRegex = /case toWorker\.APPLY_FRANCHISE_TAG:  return await handleApplyFranchiseTag\(payload, id\);/;
    const wReplace = `case toWorker.APPLY_FRANCHISE_TAG:  return await handleApplyFranchiseTag(payload, id);\n      case toWorker.RELOCATE_TEAM:        return await handleRelocateTeam(payload, id);`;
    wContent = wContent.replace(wRegex, wReplace);

    const wLogic = `
// ── Handler: RELOCATE_TEAM ────────────────────────────────────────────────────
async function handleRelocateTeam({ teamId, newCity, newName, newAbbr }, id) {
  const meta = cache.getMeta();
  const team = cache.getTeam(teamId);
  if (!team) {
      post(toUI.ERROR, { message: 'Team not found.' }, id);
      return;
  }
  if (meta.userTeamId !== teamId) {
      post(toUI.ERROR, { message: 'You can only relocate your own team.' }, id);
      return;
  }
  // Optional: Add cost/phase requirements, e.g. phase === 'offseason'

  cache.updateTeam(teamId, {
      city: newCity,
      name: newName,
      abbr: newAbbr.toUpperCase()
  });

  await NewsEngine.logNews('TRANSACTION', \`BREAKING: The franchise formerly known as \${team.city} \${team.name} has relocated to \${newCity} and will now be known as the \${newName}.\`, teamId);

  await flushDirty();
  post(toUI.STATE_UPDATE, buildViewState(), id);
}
`;
    wContent = wContent.replace('async function handleGetBoxScore', wLogic + 'async function handleGetBoxScore');

    // add toWorker type
    const msgRegex = /APPLY_FRANCHISE_TAG:'APPLY_FRANCHISE_TAG',/;
    const msgReplace = `APPLY_FRANCHISE_TAG:'APPLY_FRANCHISE_TAG',\n  RELOCATE_TEAM:      'RELOCATE_TEAM',`;
    wContent = wContent.replace(msgRegex, msgReplace);

    fs.writeFileSync('src/worker/worker.js', wContent);
    console.log('Added RELOCATE_TEAM endpoint to worker.js');
}

// Add hook to useWorker.js
let hContent = fs.readFileSync('src/ui/hooks/useWorker.js', 'utf8');

if (!hContent.includes('relocateTeam')) {
    const hRegex = /\/\*\* Applies the franchise tag to a pending free agent \(returns a Promise\) \*\/\n    applyFranchiseTag: \(playerId, teamId\) =>\n      request\(toWorker\.APPLY_FRANCHISE_TAG, \{ playerId, teamId \}\),/;

    const hReplace = `/** Applies the franchise tag to a pending free agent (returns a Promise) */
    applyFranchiseTag: (playerId, teamId) =>
      request(toWorker.APPLY_FRANCHISE_TAG, { playerId, teamId }),

    /** Relocates the user's team to a new city/name. Returns a Promise. */
    relocateTeam: (teamId, newCity, newName, newAbbr) =>
      request(toWorker.RELOCATE_TEAM, { teamId, newCity, newName, newAbbr }),`;

    hContent = hContent.replace(hRegex, hReplace);

    // add type sync
    const typesMatch = /export const toWorker = \{([\s\S]*?)\};/;
    const content2 = fs.readFileSync('src/worker/worker.js', 'utf8');
    const typesExtracted = content2.match(typesMatch)[0];

    hContent = hContent.replace(/export const toWorker = \{([\s\S]*?)\};/, typesExtracted);

    fs.writeFileSync('src/ui/hooks/useWorker.js', hContent);
    console.log('Added relocateTeam to useWorker.js');
}
