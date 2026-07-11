/**
 * Long-Save Durability Harness — pure derivations over an invariant context.
 *
 * The harness feeds each invariant checker a `ctx` object:
 *   {
 *     season, phase, week, seed, expectedTeamCount,
 *     view,          // production FULL_STATE (rostered players per team only)
 *     db,            // serialized pool snapshot { players, teams, meta, seasons, picks } | null
 *     probes,        // GET_* payloads { allSeasons, transactions, records, hof, draftClasses } | {}
 *   }
 *
 * These helpers normalize the two overlapping state sources (view vs db) into
 * the collections invariants actually reason about, without duplicating any
 * production business logic.
 */

/** Teams as reported by the production view. */
export function viewTeams(ctx) {
  return Array.isArray(ctx?.view?.teams) ? ctx.view.teams : [];
}

/** Every rostered player across the view, tagged with its owning team id. */
export function rosteredPlayersFromView(ctx) {
  const out = [];
  for (const team of viewTeams(ctx)) {
    const roster = Array.isArray(team?.roster) ? team.roster : [];
    for (const p of roster) out.push({ player: p, teamId: team.id });
  }
  return out;
}

/**
 * The complete durable player pool. Prefers the serialized DB snapshot (which
 * includes free agents); falls back to the view's rostered players when the DB
 * snapshot is not available at this checkpoint.
 * @returns {{ players: any[], source: 'db'|'view'|'none' }}
 */
export function playerPool(ctx) {
  if (Array.isArray(ctx?.db?.players)) return { players: ctx.db.players, source: 'db' };
  const rostered = rosteredPlayersFromView(ctx).map((r) => r.player);
  if (rostered.length) return { players: rostered, source: 'view' };
  return { players: [], source: 'none' };
}

/** Free agents = players with no team assignment or an explicit free-agent status. */
export function freeAgentsFromPool(players) {
  return (players || []).filter((p) => p && (p.teamId == null || p.status === 'free_agent'));
}

/** Active (rostered) players from the full pool. */
export function activePlayersFromPool(players) {
  return (players || []).filter((p) => p && p.teamId != null && p.status !== 'free_agent' && p.status !== 'retired');
}

/** All draft picks from the DB snapshot (flat), or the view picks as fallback. */
export function draftPicks(ctx) {
  if (Array.isArray(ctx?.db?.picks)) return { picks: ctx.db.picks, source: 'db' };
  const out = [];
  for (const team of viewTeams(ctx)) {
    for (const pk of Array.isArray(team?.picks) ? team.picks : []) out.push(pk);
  }
  return { picks: out, source: out.length ? 'view' : 'none' };
}

/** Set of valid team ids for reference checks. */
export function teamIdSet(ctx) {
  const ids = new Set();
  for (const t of viewTeams(ctx)) ids.add(String(t.id));
  for (const t of Array.isArray(ctx?.db?.teams) ? ctx.db.teams : []) ids.add(String(t.id));
  return ids;
}

/** Set of valid player ids across the full pool. */
export function playerIdSet(ctx) {
  const { players } = playerPool(ctx);
  const ids = new Set();
  for (const p of players) if (p?.id != null) ids.add(String(p.id));
  return ids;
}

/** Completed-season history rows (production stores these on meta.leagueHistory). */
export function leagueHistory(ctx) {
  const fromView = Array.isArray(ctx?.view?.leagueHistory) ? ctx.view.leagueHistory : null;
  if (fromView) return fromView;
  const fromDb = Array.isArray(ctx?.db?.meta?.leagueHistory) ? ctx.db.meta.leagueHistory : null;
  return fromDb || [];
}
