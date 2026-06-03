/*
 * Standings View (data-preparation layer)
 * ───────────────────────────────────────
 * Shapes raw league/team state into division + conference standings and a
 * simple playoff picture. Pure: no React, no JSX, no hooks. Returns a plain
 * serializable object.
 */

function winPct(wins, losses, ties) {
  const games = wins + losses + ties;
  if (games <= 0) return 0;
  return (wins + ties * 0.5) / games;
}

function normalizeTeam(team, userTeamId) {
  const wins = Number(team?.wins ?? 0);
  const losses = Number(team?.losses ?? 0);
  const ties = Number(team?.ties ?? 0);
  const ptsFor = Number(team?.ptsFor ?? team?.pf ?? 0);
  const ptsAgainst = Number(team?.ptsAgainst ?? team?.pa ?? 0);
  return {
    id: team?.id ?? null,
    name: team?.name ?? 'Unknown Team',
    abbr: team?.abbr ?? '---',
    conf: team?.conf ?? 0,
    div: team?.div ?? 0,
    wins,
    losses,
    ties,
    ptsFor,
    ptsAgainst,
    pointDiff: ptsFor - ptsAgainst,
    winPct: winPct(wins, losses, ties),
    isUser: userTeamId != null && Number(team?.id) === Number(userTeamId),
  };
}

const byRecord = (a, b) => {
  if (b.winPct !== a.winPct) return b.winPct - a.winPct;
  if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
  return b.ptsFor - a.ptsFor;
};

/**
 * @param {object} state - the raw league state (uses `standings` if present,
 *   otherwise `teams`)
 * @returns {{
 *   userTeamId: any,
 *   divisions: Array<{ conf:any, div:any, teams:Array<object> }>,     // sorted by win% → pointDiff → ptsFor
 *   conferences: Array<{ conf:any, teams:Array<object> }>,           // full conference standings
 *   playoffPicture: Array<{ conf:any, seeds:Array<object> }>,        // up to 7 seeds per conf, division winners first
 * }}
 */
export function prepareStandingsView(state) {
  const league = state ?? {};
  const userTeamId = league.userTeamId ?? null;
  const source = Array.isArray(league.standings) && league.standings.length > 0
    ? league.standings
    : (Array.isArray(league.teams) ? league.teams : []);
  const teams = source.map((t) => normalizeTeam(t, userTeamId));

  // Group into divisions keyed by conf|div.
  const divMap = new Map();
  const confMap = new Map();
  for (const team of teams) {
    const divKey = `${team.conf}|${team.div}`;
    if (!divMap.has(divKey)) divMap.set(divKey, []);
    divMap.get(divKey).push(team);
    if (!confMap.has(team.conf)) confMap.set(team.conf, []);
    confMap.get(team.conf).push(team);
  }

  const divisions = [...divMap.entries()]
    .map(([key, list]) => {
      const [conf, div] = key.split('|');
      return { conf: list[0]?.conf ?? conf, div: list[0]?.div ?? div, teams: [...list].sort(byRecord) };
    })
    .sort((a, b) => (a.conf - b.conf) || (a.div - b.div));

  const conferences = [...confMap.entries()]
    .map(([conf, list]) => ({ conf, teams: [...list].sort(byRecord) }))
    .sort((a, b) => a.conf - b.conf);

  // Playoff picture: division winners seeded first, then best remaining (wild cards).
  const playoffPicture = conferences.map(({ conf, teams: confTeams }) => {
    const confDivisions = divisions.filter((d) => Number(d.conf) === Number(conf));
    const divisionWinners = confDivisions
      .map((d) => d.teams[0])
      .filter(Boolean)
      .sort(byRecord);
    const winnerIds = new Set(divisionWinners.map((t) => t.id));
    const wildCards = confTeams.filter((t) => !winnerIds.has(t.id)).sort(byRecord);
    const seeds = [...divisionWinners, ...wildCards].slice(0, 7).map((team, i) => ({
      seed: i + 1,
      ...team,
      clinchedDivision: winnerIds.has(team.id),
    }));
    return { conf, seeds };
  });

  return { userTeamId, divisions, conferences, playoffPicture };
}
