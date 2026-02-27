import re

with open('src/worker/worker.js', 'r') as f:
    content = f.read()

dashboard_leaders_func = """
// ── Handler: GET_DASHBOARD_LEADERS ────────────────────────────────────────────

async function handleGetDashboardLeaders(payload, id) {
  const meta = cache.getMeta();
  const userTeamId = meta?.userTeamId;

  // Build a map seeded from in-memory stats
  const liveMap = new Map(cache.getAllSeasonStats().map(s => [s.playerId, s]));
  if (meta?.currentSeasonId) {
    const dbStats = await PlayerStats.bySeason(meta.currentSeasonId).catch(() => []);
    for (const s of dbStats) {
      if (!liveMap.has(s.playerId)) liveMap.set(s.playerId, s);
    }
  }

  const allTeamsByIdRef = cache.getAllTeams();
  const teamMap = {};
  allTeamsByIdRef.forEach(t => { teamMap[t.id] = t.abbr; });

  const entries = [];
  await Promise.all([...liveMap.values()].map(async s => {
    const p = cache.getPlayer(s.playerId) ?? await Players.load(s.playerId);
    if (p) entries.push({ ...s, name: p.name, pos: p.pos, teamId: p.teamId ?? s.teamId, teamAbbr: teamMap[p.teamId ?? s.teamId] || 'FA' });
  }));

  const topN = (list, key, n = 5) => {
    return list
      .filter(e => (e.totals?.[key] || 0) > 0)
      .sort((a, b) => (b.totals[key] || 0) - (a.totals[key] || 0))
      .slice(0, n)
      .map(e => ({
        playerId: e.playerId,
        name:     e.name     || `Player ${e.playerId}`,
        pos:      e.pos      || '?',
        teamId:   e.teamId,
        teamAbbr: e.teamAbbr,
        value:    e.totals[key] || 0,
      }));
  };

  const qbs = entries.filter(e => e.pos === 'QB');
  const rbs = entries.filter(e => e.pos === 'RB');
  const wrs = entries.filter(e => ['WR', 'TE', 'RB'].includes(e.pos));

  const teamQbs = qbs.filter(e => e.teamId === userTeamId);
  const teamRbs = rbs.filter(e => e.teamId === userTeamId);
  const teamWrs = wrs.filter(e => e.teamId === userTeamId);

  const league = {
    passing: topN(qbs, 'passYd', 5),
    rushing: topN(rbs, 'rushYd', 5),
    receiving: topN(wrs, 'recYd', 5),
  };

  const team = {
    passing: topN(teamQbs, 'passYd', 3),
    rushing: topN(teamRbs, 'rushYd', 3),
    receiving: topN(teamWrs, 'recYd', 3),
  };

  post(toUI.DASHBOARD_LEADERS, { league, team }, id);
}

"""

# Insert before handleGetLeagueLeaders
content = content.replace(
    "// ── Handler: GET_LEAGUE_LEADERS",
    dashboard_leaders_func + "// ── Handler: GET_LEAGUE_LEADERS"
)

# Add to case statement
content = content.replace(
    "case toWorker.GET_LEAGUE_LEADERS: return await handleGetLeagueLeaders(payload, id);",
    "case toWorker.GET_LEAGUE_LEADERS: return await handleGetLeagueLeaders(payload, id);\n      case toWorker.GET_DASHBOARD_LEADERS: return await handleGetDashboardLeaders(payload, id);"
)

with open('src/worker/worker.js', 'w') as f:
    f.write(content)
