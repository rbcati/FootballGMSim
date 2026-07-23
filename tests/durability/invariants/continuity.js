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
  const completedRollover = ctx?.phase === 'afterSeasonRollover' && prev.league?.phase && prev.league.phase !== cur.league?.phase;
  const badHistory = completedRollover ? historyDelta !== 1 : (historyDelta < 0 || historyDelta > 1);
  out.push(badHistory
    ? fail(ctx, 'continuity.history-grows-once', { entityType: 'history', entityId: 'league', message: completedRollover ? `Completed rollover history changed by ${historyDelta}; expected exactly 1` : `Completed history changed by ${historyDelta}`, details: { prevHistory, curHistory, completedRollover } })
    : pass(ctx, 'continuity.history-grows-once', completedRollover ? 'Completed rollover added exactly one history row' : `History growth bounded (${historyDelta})`));

  const gameSeason = new Map();
  const reused = [];
  for (const g of [...(prev.schedule || []), ...(cur.schedule || [])]) {
    if (!g.id || g.season == null) continue;
    if (gameSeason.has(g.id) && gameSeason.get(g.id) !== g.season) reused.push(g.id);
    gameSeason.set(g.id, g.season);
  }
  out.push(reused.length
    ? fail(ctx, 'continuity.schedule-game-id-season-unique', { entityType: 'game', entityId: reused[0], message: 'Schedule game id reused across seasons', details: { reused: reused.slice(0, 20) } })
    : pass(ctx, 'continuity.schedule-game-id-season-unique', 'Schedule game ids are not reused across seasons in checkpoint'));

  const transition = `${prev.league?.phase ?? 'unknown'} -> ${cur.league?.phase ?? 'unknown'}`;
  if (prev.league?.phase === 'offseason_resign' && cur.league?.phase === 'preseason') {
    out.push(skip(ctx, 'continuity.players-do-not-disappear', `Player-disposition evidence unavailable during offseason roster/draft/free-agency reconciliation (${transition})`));
  } else {
    const curAllIds = new Set([...(cur.players || []).map((p) => p.id), ...(cur.retiredPlayers || []).map((p) => p.id)]);
    const disappeared = (prev.players || []).filter((p) => p?.status !== 'draft_eligible' && !curAllIds.has(p.id));
    out.push(disappeared.length
      ? fail(ctx, 'continuity.players-do-not-disappear', { entityType: 'player', entityId: disappeared[0].id, message: 'Active/free-agent player disappeared without retirement or disposition evidence', details: { disappeared: disappeared.slice(0, 20).map((p) => p.id), transition } })
      : pass(ctx, 'continuity.players-do-not-disappear', 'No active/free-agent players disappeared without retirement or disposition evidence'));
  }

  const curById = new Map((cur.players || []).map((p) => [p.id, p]));
  const yearsIncreased = [];
  for (const p of prev.players || []) {
    const next = curById.get(p.id);
    if (!next) continue;
    if (Number(next.yearsRemaining ?? 0) > Number(p.yearsRemaining ?? 0)) {
      const contractChanged = next.yearsTotal !== p.yearsTotal || next.baseAnnual !== p.baseAnnual || next.signingBonus !== p.signingBonus || next.activeCapHit !== p.activeCapHit;
      if (!contractChanged) yearsIncreased.push({ id: p.id, before: p.yearsRemaining, after: next.yearsRemaining });
    }
  }
  out.push(yearsIncreased.length
    ? fail(ctx, 'continuity.contract-years-do-not-increase-without-contract-write', { entityType: 'player', entityId: yearsIncreased[0].id, message: 'Contract years increased without a signing/extension/restructure-shaped contract write', details: { yearsIncreased: yearsIncreased.slice(0, 20) } })
    : pass(ctx, 'continuity.contract-years-do-not-increase-without-contract-write', 'No contract years increased without a contract-write shape'));

  return out;
}
