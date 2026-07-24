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
  if (cur.pools?.source && cur.pools.source !== 'db') {
    out.push(skip(ctx, 'continuity.players-do-not-disappear', `Full DB player pool unavailable at current checkpoint; roster-only view cannot prove dispositions (${transition})`, { source: cur.pools.source }));
  } else {
    const curAllIds = new Set([...(cur.players || []).map((p) => p.id), ...(cur.retiredPlayers || []).map((p) => p.id)]);
    const curRetiredIds = new Set((cur.retiredPlayers || []).map((p) => p.id));
    const disappeared = (prev.players || []).filter((p) => !curAllIds.has(p.id) && !hasLegitimateDisposition(ctx, p, curRetiredIds));
    out.push(disappeared.length
      ? fail(ctx, 'continuity.players-do-not-disappear', { entityType: 'player', entityId: disappeared[0].id, message: 'Established player disappeared without retirement, draft-pool, free-agency, release, or removal disposition evidence', details: { disappeared: disappeared.slice(0, 20).map((p) => ({ id: p.id, status: p.status })), transition } })
      : pass(ctx, 'continuity.players-do-not-disappear', 'No established players disappeared without disposition evidence'));
  }

  const curById = new Map((cur.players || []).map((p) => [p.id, p]));
  const yearsIncreased = [];
  for (const p of prev.players || []) {
    const next = curById.get(p.id);
    if (!next) continue;
    if (Number(next.yearsRemaining ?? 0) > Number(p.yearsRemaining ?? 0)) {
      if (!hasLegitimateContractTransition(ctx, p, next)) yearsIncreased.push({ id: p.id, before: p.yearsRemaining, after: next.yearsRemaining, beforeTotal: p.yearsTotal, afterTotal: next.yearsTotal });
    }
  }
  out.push(yearsIncreased.length
    ? fail(ctx, 'continuity.contract-years-do-not-increase-without-contract-write', { entityType: 'player', entityId: yearsIncreased[0].id, message: 'Contract years increased without a signing/extension/restructure-shaped contract write', details: { yearsIncreased: yearsIncreased.slice(0, 20) } })
    : pass(ctx, 'continuity.contract-years-do-not-increase-without-contract-write', 'No contract years increased without a contract-write shape'));

  return out;
}

function hasLegitimateDisposition(ctx, player, curRetiredIds) {
  if (!player?.id) return true;
  if (player.status === 'draft_eligible') return true;
  if (curRetiredIds.has(player.id)) return true;
  return hasPlayerEvent(ctx, player.id, ['retire', 'retirement', 'retired', 'release', 'released', 'waive', 'waived', 'free_agent', 'free agency', 'removed', 'delete', 'disposition']);
}

function hasLegitimateContractTransition(ctx, prev, cur) {
  if (hasPlayerEvent(ctx, prev.id, ['sign', 'signed', 'extension', 'extend', 'extended', 'restructure', 'restructured', 'contract'])) return true;
  const wasUnsigned = Number(prev.yearsRemaining ?? 0) <= 0 || prev.teamId == null || prev.status === 'free_agent';
  const isRostered = cur.teamId != null && cur.status !== 'free_agent' && cur.status !== 'retired';
  if (wasUnsigned && isRostered && Number(cur.yearsRemaining ?? 0) > 0) return true;
  return false;
}

function hasPlayerEvent(ctx, playerId, words) {
  const txs = transitionTransactions(ctx);
  const id = String(playerId);
  return txs.some((tx) => {
    if (!transactionReferencesPlayer(tx, id)) return false;
    const text = JSON.stringify(tx).toLowerCase();
    return words.some((w) => text.includes(w));
  });
}

function currentTransactions(ctx) {
  return [
    ...(Array.isArray(ctx?.probes?.transactions) ? ctx.probes.transactions : []),
    ...(Array.isArray(ctx?.transactions) ? ctx.transactions : []),
    ...(Array.isArray(ctx?.durableSnapshot?.transactions) ? ctx.durableSnapshot.transactions : []),
  ];
}

function priorTransactions(ctx) {
  return [
    ...(Array.isArray(ctx?.previousTransactions) ? ctx.previousTransactions : []),
    ...(Array.isArray(ctx?.previousDurableSnapshot?.transactions) ? ctx.previousDurableSnapshot.transactions : []),
  ];
}

function txIdentity(tx = {}) {
  if (tx?.id != null) return `id:${tx.id}`;
  return JSON.stringify({
    type: tx?.type,
    seasonId: tx?.seasonId,
    season: tx?.season,
    week: tx?.week,
    teamId: tx?.teamId,
    playerId: tx?.playerId ?? tx?.details?.playerId,
    source: tx?.details?.source,
  });
}

function transitionTransactions(ctx) {
  const prior = new Set(priorTransactions(ctx).map(txIdentity));
  return currentTransactions(ctx).filter((tx) => !prior.has(txIdentity(tx)));
}

function transactionReferencesPlayer(tx = {}, playerId) {
  const ids = [
    tx?.playerId,
    tx?.player_id,
    tx?.details?.playerId,
    tx?.details?.player_id,
    tx?.details?.player?.id,
  ].filter((v) => v != null).map(String);
  return ids.includes(String(playerId));
}
