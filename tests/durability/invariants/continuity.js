import { fail, pass, skip } from './helpers.js';

export const id = 'continuity';

export function check(ctx) {
  const cur = ctx?.durableSnapshot;
  const prev = ctx?.previousDurableSnapshot;
  if (!cur || !prev) return [skip(ctx, 'continuity.previous-checkpoint-present', 'No previous durable snapshot for continuity comparison')];
  const out = [];
  const prevTeams = new Set((prev.teams || []).map((t) => t.id));
  const curTeams = new Set((cur.teams || []).map((t) => t.id));
  const missingTeams = [...prevTeams].filter((id) => !curTeams.has(id));
  const addedTeams = [...curTeams].filter((id) => !prevTeams.has(id));
  out.push(missingTeams.length || addedTeams.length
    ? fail(ctx, 'continuity.team-identity-stable', { entityType: 'league', entityId: 'teams', message: 'Team identity set changed between checkpoints', details: { missingTeams, addedTeams } })
    : pass(ctx, 'continuity.team-identity-stable', `Team identities stable (${curTeams.size})`));

  const active = new Set((cur.players || []).map((p) => p.id));
  const retired = new Set((cur.retiredPlayers || []).map((p) => p.id));
  const overlap = [...active].filter((id) => retired.has(id));
  out.push(overlap.length
    ? fail(ctx, 'continuity.active-retired-disjoint', { entityType: 'player', entityId: overlap[0], message: 'Player is both active and retired', details: { overlap: overlap.slice(0, 20) } })
    : pass(ctx, 'continuity.active-retired-disjoint', 'Active and retired populations are disjoint'));

  const prevHistory = prev.history?.length ?? 0;
  const curHistory = cur.history?.length ?? 0;
  const historyDelta = curHistory - prevHistory;
  out.push(historyDelta < 0 || historyDelta > 1
    ? fail(ctx, 'continuity.history-grows-once', { entityType: 'history', entityId: 'league', message: `Completed history changed by ${historyDelta}`, details: { prevHistory, curHistory } })
    : pass(ctx, 'continuity.history-grows-once', `History growth bounded (${historyDelta})`));

  const gameSeason = new Map();
  const reused = [];
  for (const g of cur.schedule || []) {
    if (!g.id || g.season == null) continue;
    if (gameSeason.has(g.id) && gameSeason.get(g.id) !== g.season) reused.push(g.id);
    gameSeason.set(g.id, g.season);
  }
  out.push(reused.length
    ? fail(ctx, 'continuity.schedule-game-id-season-unique', { entityType: 'game', entityId: reused[0], message: 'Schedule game id reused across seasons', details: { reused: reused.slice(0, 20) } })
    : pass(ctx, 'continuity.schedule-game-id-season-unique', 'Schedule game ids are not reused across seasons in checkpoint'));

  if (prev.league?.phase !== cur.league?.phase) {
    out.push(skip(ctx, 'continuity.players-do-not-disappear', `Player-disposition continuity skipped across lifecycle phase transition ${prev.league?.phase ?? 'unknown'} -> ${cur.league?.phase ?? 'unknown'}`));
  } else {
    const prevPlayerIds = new Set((prev.players || []).map((p) => p.id));
    const curAllIds = new Set([...(cur.players || []).map((p) => p.id), ...(cur.retiredPlayers || []).map((p) => p.id)]);
    const disappeared = [...prevPlayerIds].filter((pid) => !curAllIds.has(pid));
    out.push(disappeared.length
      ? fail(ctx, 'continuity.players-do-not-disappear', { entityType: 'player', entityId: disappeared[0], message: 'Active player disappeared without retirement record in adjacent same-phase checkpoint', details: { disappeared: disappeared.slice(0, 20) } })
      : pass(ctx, 'continuity.players-do-not-disappear', 'No active players disappeared without retirement record'));
  }

  return out;
}
