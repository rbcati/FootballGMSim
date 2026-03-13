const fs = require('fs');

let content = fs.readFileSync('src/worker/worker.js', 'utf8');
if (!content.includes('APPLY_FRANCHISE_TAG')) {

    const msgTypesRegex = /export const toWorker = \{([\s\S]*?)\};/;
    const newMsgTypes = `export const toWorker = {
  // Application
  INIT:               'INIT',
  GET_ALL_SAVES:      'GET_ALL_SAVES',
  LOAD_SAVE:          'LOAD_SAVE',
  DELETE_SAVE:        'DELETE_SAVE',
  NEW_LEAGUE:         'NEW_LEAGUE',
  SAVE_NOW:           'SAVE_NOW',
  RESET_LEAGUE:       'RESET_LEAGUE',
  UPDATE_SETTINGS:    'UPDATE_SETTINGS',

  // Simulation
  ADVANCE_WEEK:       'ADVANCE_WEEK',
  SIM_TO_WEEK:        'SIM_TO_WEEK',
  SIM_TO_PLAYOFFS:    'SIM_TO_PLAYOFFS',
  SIM_TO_PHASE:       'SIM_TO_PHASE',
  ADVANCE_OFFSEASON:  'ADVANCE_OFFSEASON',
  ADVANCE_FREE_AGENCY_DAY: 'ADVANCE_FREE_AGENCY_DAY',
  START_NEW_SEASON:   'START_NEW_SEASON',

  // Roster Management
  GET_ROSTER:         'GET_ROSTER',
  GET_FREE_AGENTS:    'GET_FREE_AGENTS',
  SIGN_PLAYER:        'SIGN_PLAYER',
  SUBMIT_OFFER:       'SUBMIT_OFFER',
  RELEASE_PLAYER:     'RELEASE_PLAYER',
  GET_EXTENSION_ASK:  'GET_EXTENSION_ASK',
  EXTEND_CONTRACT:    'EXTEND_CONTRACT',
  RESTRUCTURE_CONTRACT:'RESTRUCTURE_CONTRACT',
  APPLY_FRANCHISE_TAG:'APPLY_FRANCHISE_TAG',
  TRADE_OFFER:        'TRADE_OFFER',
  SET_USER_TEAM:      'SET_USER_TEAM',

  // Coaching & Strategy
  GET_AVAILABLE_COACHES: 'GET_AVAILABLE_COACHES',
  HIRE_COACH:         'HIRE_COACH',
  FIRE_COACH:         'FIRE_COACH',
  UPDATE_STRATEGY:    'UPDATE_STRATEGY',

  // Draft
  GET_DRAFT_STATE:    'GET_DRAFT_STATE',
  START_DRAFT:        'START_DRAFT',
  MAKE_DRAFT_PICK:    'MAKE_DRAFT_PICK',
  SIM_DRAFT_PICK:     'SIM_DRAFT_PICK',

  // Data / History
  GET_SEASON_HISTORY: 'GET_SEASON_HISTORY',
  GET_ALL_SEASONS:    'GET_ALL_SEASONS',
  GET_PLAYER_CAREER:  'GET_PLAYER_CAREER',
  GET_BOX_SCORE:      'GET_BOX_SCORE',
  GET_TEAM_PROFILE:   'GET_TEAM_PROFILE',
  GET_LEAGUE_LEADERS: 'GET_LEAGUE_LEADERS',
  GET_DASHBOARD_LEADERS: 'GET_DASHBOARD_LEADERS',
  GET_ALL_PLAYER_STATS: 'GET_ALL_PLAYER_STATS',
  GET_AWARD_RACES:    'GET_AWARD_RACES',
};`;

    content = content.replace(msgTypesRegex, newMsgTypes);

    const handlerRegex = /case toWorker\.RESTRUCTURE_CONTRACT: return await handleRestructureContract\(payload, id\);/;
    const newHandler = `case toWorker.RESTRUCTURE_CONTRACT: return await handleRestructureContract(payload, id);\n      case toWorker.APPLY_FRANCHISE_TAG:  return await handleApplyFranchiseTag(payload, id);`;

    content = content.replace(handlerRegex, newHandler);

    // Add logic
    const logicStr = `
// ── Handler: APPLY_FRANCHISE_TAG ──────────────────────────────────────────────
async function handleApplyFranchiseTag({ playerId, teamId }, id) {
  const meta = cache.getMeta();
  const player = cache.getPlayer(playerId);
  if (!player || player.teamId !== teamId) {
      post(toUI.ERROR, { message: 'Invalid player for franchise tag.' }, id);
      return;
  }
  if (meta.phase !== 'offseason_resign') {
      post(toUI.ERROR, { message: 'Franchise tag can only be applied during re-signing phase.' }, id);
      return;
  }

  // Calculate Tag Value (simplified heuristic: roughly 1.25x market value for 1 year)
  // Realism Note: A real franchise tag takes the top 5 salaries at the position.
  const baseline = Constants.SALARY_CAP.HARD_CAP * (Constants.POSITION_VALUES[player.pos] || 0.1);
  const ask = (player.ovr > 85 ? 0.08 : 0.05) * Constants.SALARY_CAP.HARD_CAP;
  const tagCost = Math.round(ask * 1.25 * 10) / 10;

  const contract = {
      years: 1,
      yearsTotal: 1,
      baseAnnual: tagCost,
      signingBonus: 0,
      guaranteedPct: 100, // Fully guaranteed
  };

  cache.updatePlayer(playerId, { contract, isTagged: true });
  recalculateTeamCap(teamId);

  await Transactions.add({
      type: 'FRANCHISE_TAG',
      seasonId: meta.currentSeasonId,
      week: meta.currentWeek,
      teamId,
      details: { playerId, contract }
  });

  await NewsEngine.logNews('TRANSACTION', \`The \${cache.getTeam(teamId)?.abbr || 'team'} placed the franchise tag on \${player.pos} \${player.name}.\`, teamId);

  await flushDirty();
  post(toUI.STATE_UPDATE, { roster: buildRosterView(teamId), ...buildViewState() }, id);
}

`;

    content = content.replace('async function handleGetBoxScore', logicStr + 'async function handleGetBoxScore');

    fs.writeFileSync('src/worker/worker.js', content);
    console.log('Added Franchise Tag endpoint to worker.js');
}
