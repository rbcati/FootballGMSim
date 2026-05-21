function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// Destinations confirmed present in navigation layer
const SAFE_DESTINATION_PREFIXES = [
  'Team:Injuries',
  'Team:Roster',
  'Game Plan',
  'Weekly Prep',
  'League',
  'Roster',
  'Free Agency',
  'Trade Center',
  'Financials',
  'FA Hub',
  'Staff',
  'Standings',
  'HQ',
  'Game Book:',
];

function isSafeDestination(dest) {
  if (!dest) return false;
  return SAFE_DESTINATION_PREFIXES.some((prefix) => String(dest).startsWith(prefix));
}

function getLastResult(league) {
  const uid = Number(league?.userTeamId);
  const userTeam = Array.isArray(league?.teams) ? league.teams.find((t) => Number(t.id) === uid) : null;
  const results = Array.isArray(userTeam?.recentResults) ? userTeam.recentResults : [];
  if (!results.length) return null;
  return String(results[results.length - 1] ?? '').toUpperCase();
}

function getLatestCompletedGameId(league) {
  const uid = Number(league?.userTeamId);
  let latestGame = null;
  let latestWeek = -1;
  for (const week of league?.schedule?.weeks ?? []) {
    for (const game of week?.games ?? []) {
      if (!game?.played) continue;
      const homeId = Number(game?.home?.id ?? game?.home);
      const awayId = Number(game?.away?.id ?? game?.away);
      if (homeId !== uid && awayId !== uid) continue;
      const wk = safeNum(week?.week, 0);
      if (wk > latestWeek) {
        latestWeek = wk;
        latestGame = game;
      }
    }
  }
  return latestGame?.id ?? null;
}

/**
 * Returns up to 5 actionable prep cards derived from weekly intelligence + context signals.
 * Conservative: only generates an action when the underlying data signal exists.
 *
 * @param {object} opts
 * @param {object} opts.league
 * @param {object} opts.weeklyIntelligence - output of buildWeeklyIntelligence
 * @param {object} opts.weeklyContext     - output of evaluateWeeklyContext
 * @param {object} opts.prep              - output of deriveWeeklyPrepState
 * @returns {Array<{id, title, detail, tone, priority, destination, ctaLabel, reason}>}
 */
export function buildWeeklyPrepActions({ league, weeklyIntelligence, weeklyContext, prep } = {}) {
  const actions = [];

  const injuriesCount = safeNum(weeklyContext?.pressurePoints?.injuriesCount, 0);
  const insights = Array.isArray(weeklyIntelligence?.insights) ? weeklyIntelligence.insights : [];
  const urgentItems = Array.isArray(weeklyContext?.urgentItems) ? weeklyContext.urgentItems : [];
  const lineupIssues = Array.isArray(prep?.lineupIssues) ? prep.lineupIssues : [];
  const incomingOffers = Array.isArray(weeklyContext?.incomingOffers) ? weeklyContext.incomingOffers : [];
  const hasNextGame = !!(prep?.nextGame);
  const opponent = prep?.nextGame?.opp ?? null;

  // Guard: opponent has actual stat ratings (not zero or absent)
  const oppOff = safeNum(opponent?.offenseRating ?? opponent?.offRating ?? opponent?.offense, null);
  const oppDef = safeNum(opponent?.defenseRating ?? opponent?.defRating ?? opponent?.defense, null);
  const hasOpponentStats = opponent != null && (Number.isFinite(oppOff) || Number.isFinite(oppDef));

  // --- 1. Review Injuries: only when injury data exists ---
  if (injuriesCount >= 1) {
    const injuryItem = urgentItems.find((item) => item.tab === 'Injuries');
    actions.push({
      id: 'prep-action-injuries',
      title: 'Review Injuries',
      detail: injuryItem?.detail ?? `${injuriesCount} active injur${injuriesCount > 1 ? 'ies' : 'y'} may affect depth this week.`,
      tone: injuriesCount >= 4 ? 'danger' : injuriesCount >= 2 ? 'warning' : 'info',
      priority: injuriesCount >= 4 ? 90 : injuriesCount >= 2 ? 70 : 50,
      destination: 'Team:Injuries',
      ctaLabel: 'Open Injuries',
      reason: 'Injury data flagged this week.',
    });
  }

  // --- 2. Adjust Depth Chart: only when lineup issues exist ---
  const urgentLineupIssues = lineupIssues.filter((i) => i.level === 'urgent');
  if (lineupIssues.length > 0) {
    const topIssue = urgentLineupIssues[0] ?? lineupIssues[0];
    actions.push({
      id: 'prep-action-depth',
      title: 'Adjust Depth Chart',
      detail: topIssue?.detail ?? 'Depth chart warnings may affect sim performance this week.',
      tone: urgentLineupIssues.length > 0 ? 'danger' : 'warning',
      priority: urgentLineupIssues.length > 0 ? 85 : 65,
      destination: 'Team:Roster / Depth',
      ctaLabel: 'Open Depth Chart',
      reason: 'Lineup issues detected this week.',
    });
  }

  // --- 3. Scout Opponent Threat: only when opponent stat context exists AND intel flags a risk ---
  const hasThreatInsight = insights.some((i) => ['intel-off-risk', 'intel-def-risk'].includes(i.id));
  if (hasNextGame && hasOpponentStats && hasThreatInsight) {
    const threatInsight = insights.find((i) => ['intel-off-risk', 'intel-def-risk'].includes(i.id));
    actions.push({
      id: 'prep-action-opponent-threat',
      title: 'Scout Opponent Threat',
      detail: threatInsight?.text ?? 'Opponent poses a matchup risk this week. Review before advancing.',
      tone: 'warning',
      priority: 80,
      destination: 'Weekly Prep',
      ctaLabel: 'Open Weekly Prep',
      reason: 'Intelligence flags an opponent statistical advantage.',
    });
  }

  // --- 4. Check Matchup Leaders: only when opponent stat data exists (no threat, user may have edge) ---
  if (hasNextGame && hasOpponentStats && !hasThreatInsight) {
    const hasEdge = insights.some((i) => ['intel-off-edge', 'intel-def-edge'].includes(i.id));
    actions.push({
      id: 'prep-action-leaders',
      title: 'Check Matchup Leaders',
      detail: hasEdge
        ? `You have a statistical edge vs ${opponent?.abbr ?? 'this opponent'}. Review league leaders to maximize the advantage.`
        : `Review league leader stats to identify key performers in the ${opponent?.abbr ?? 'upcoming'} matchup.`,
      tone: 'info',
      priority: 42,
      destination: 'League',
      ctaLabel: 'Open League Leaders',
      reason: 'Opponent stat data is available for this matchup.',
    });
  }

  // --- 5. Roster / FA need: only when weekly context urgentItems supports it ---
  const ROSTER_TABS = new Set(['Roster', 'Free Agency', 'Financials', 'FA Hub']);
  const topRosterItem = urgentItems.find((item) => ROSTER_TABS.has(item.tab) && item.tone !== 'ok');
  if (topRosterItem) {
    const dest = topRosterItem.tab === 'FA Hub' ? 'Free Agency' : topRosterItem.tab;
    actions.push({
      id: 'prep-action-roster-context',
      title: topRosterItem.label,
      detail: topRosterItem.detail,
      tone: topRosterItem.tone,
      priority: safeNum(topRosterItem.rank, 50) - 5,
      destination: dest,
      ctaLabel: `Open ${dest}`,
      reason: topRosterItem.why ?? 'Weekly context flags a roster or financial need.',
    });
  }

  // --- 6. Trade Offer: only when real incoming offers exist ---
  if (incomingOffers.length > 0) {
    const tradeItem = urgentItems.find((item) => item.tab === 'Transactions:Offers' || item.tab === 'Trades');
    actions.push({
      id: 'prep-action-trade',
      title: 'Review Trade Offer',
      detail: tradeItem?.detail ?? `${incomingOffers.length} incoming trade offer${incomingOffers.length > 1 ? 's' : ''} waiting for a response.`,
      tone: 'info',
      priority: 75,
      destination: 'Trade Center',
      ctaLabel: 'Open Trade Center',
      reason: 'Incoming trade offers are waiting.',
    });
  }

  // --- 7. Review Last Loss: only when coming off a loss AND a game ID exists ---
  const lastResult = getLastResult(league);
  const latestGameId = getLatestCompletedGameId(league);
  if (lastResult === 'L' && latestGameId) {
    actions.push({
      id: 'prep-action-game-book',
      title: 'Review Last Loss',
      detail: 'Open the Game Book to identify what went wrong and refocus your game plan.',
      tone: 'warning',
      priority: 60,
      destination: `Game Book:${latestGameId}`,
      ctaLabel: 'Open Game Book',
      reason: 'Team is coming off a loss.',
    });
  }

  return actions
    .filter((a) => isSafeDestination(a.destination))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);
}
