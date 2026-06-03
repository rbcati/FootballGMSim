/*
 * Roster View (data-preparation layer)
 * ────────────────────────────────────
 * Shapes a team's roster into the lists, depth chart, and cap-space summary the
 * roster UI consumes. Accepts the raw state slice and returns a plain
 * serializable object. Pure: no React, no JSX, no hooks.
 */

const POSITION_ORDER = ['QB', 'RB', 'FB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];

function resolveTeam(state) {
  if (!state || typeof state !== 'object') return null;
  if (Array.isArray(state.roster)) return state;
  if (state.team && Array.isArray(state.team.roster)) return state.team;
  if (state.league && state.teamId != null) {
    const teams = Array.isArray(state.league.teams) ? state.league.teams : [];
    return teams.find((t) => Number(t?.id) === Number(state.teamId)) ?? null;
  }
  return null;
}

function depthOrder(player) {
  return (player?.depthOrder != null && player.depthOrder > 0) ? player.depthOrder : 9999;
}

/**
 * @param {object} state - a team object, `{ team }`, or `{ league, teamId }`
 * @returns {{
 *   teamId: (number|string|null),
 *   teamName: string|null,
 *   players: Array,
 *   depthChart: Object<string, Array>,
 *   positionCounts: Object<string, number>,
 *   capSummary: { capTotal:number, capUsed:number, capSpace:number, contractCount:number },
 * }}
 */
export function prepareRosterView(state) {
  const team = resolveTeam(state);
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  const salaryCap = Number(
    state?.salaryCap ?? team?.salaryCap ?? team?.capTotal ?? 0,
  );

  const players = roster.map((p) => ({
    id: p?.id ?? null,
    name: p?.name ?? 'Unknown',
    pos: p?.pos ?? 'UNK',
    ovr: Number(p?.ovr ?? 0),
    age: Number(p?.age ?? 0),
    capHit: Number(p?.capHit ?? p?.contract?.capHit ?? p?.salary ?? 0),
    injured: Boolean(p?.injured),
    depthOrder: depthOrder(p),
  }));

  // Sort within a position by depthOrder (user-set starters first) then OVR.
  const byDepthThenOvr = (a, b) => {
    if (a.depthOrder !== b.depthOrder) return a.depthOrder - b.depthOrder;
    return b.ovr - a.ovr;
  };

  const depthChart = {};
  const positionCounts = {};
  for (const player of players) {
    const pos = player.pos || 'UNK';
    (depthChart[pos] ||= []).push(player);
    positionCounts[pos] = (positionCounts[pos] || 0) + 1;
  }
  for (const pos of Object.keys(depthChart)) {
    depthChart[pos].sort(byDepthThenOvr);
  }

  const sortedPlayers = [...players].sort((a, b) => {
    const ai = POSITION_ORDER.indexOf(a.pos);
    const bi = POSITION_ORDER.indexOf(b.pos);
    const ao = ai === -1 ? POSITION_ORDER.length : ai;
    const bo = bi === -1 ? POSITION_ORDER.length : bi;
    if (ao !== bo) return ao - bo;
    return byDepthThenOvr(a, b);
  });

  const capUsed = players.reduce((sum, p) => sum + p.capHit, 0);
  const contractCount = players.filter((p) => p.capHit > 0).length;

  return {
    teamId: team?.id ?? null,
    teamName: team?.name ?? team?.abbr ?? null,
    players: sortedPlayers,
    depthChart,
    positionCounts,
    capSummary: {
      capTotal: salaryCap,
      capUsed,
      capSpace: salaryCap - capUsed,
      contractCount,
    },
  };
}
