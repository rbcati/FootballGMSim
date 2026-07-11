/**
 * Free-agency & player-pool integrity invariants.
 *
 * Boundedness envelope is derived from the production league format (32 teams x
 * offseason roster max + a generous FA/draft-class allowance) — see bounds.js —
 * NOT arbitrary magic numbers. These checks require the full DB player pool;
 * when only the view is available they skip with a reason (free agents are not
 * part of the rostered-only FULL_STATE view).
 */
import { pass, fail, skip, findDuplicateIds } from './helpers.js';
import { POOL } from './bounds.js';
import { playerPool, freeAgentsFromPool, rosteredPlayersFromView } from './derive.js';

export const id = 'freeAgency';

export function check(ctx) {
  const out = [];
  const { players, source } = playerPool(ctx);

  if (source !== 'db') {
    out.push(skip(ctx, 'freeAgency.pool-available', 'Full player pool (DB snapshot incl. free agents) not captured at this checkpoint'));
    return out;
  }

  // ── pool size bounded ────────────────────────────────────────────────────
  const size = players.length;
  if (size < POOL.MIN_PLAYERS || size > POOL.MAX_PLAYERS) {
    out.push(fail(ctx, 'freeAgency.pool-size-bounded', {
      entityType: 'league', entityId: null,
      message: `Player pool size ${size} outside expected envelope [${POOL.MIN_PLAYERS}, ${POOL.MAX_PLAYERS}]`,
      details: { size, min: POOL.MIN_PLAYERS, max: POOL.MAX_PLAYERS },
    }));
  } else {
    out.push(pass(ctx, 'freeAgency.pool-size-bounded', `Player pool ${size} within [${POOL.MIN_PLAYERS}, ${POOL.MAX_PLAYERS}]`));
  }

  // ── no duplicate player ids anywhere in the pool ─────────────────────────
  const dups = findDuplicateIds(players, (p) => p?.id);
  if (dups.length) {
    out.push(fail(ctx, 'freeAgency.no-duplicate-player-ids', {
      entityType: 'player', entityId: dups[0].id,
      message: `${dups.length} duplicated player ids in the pool`,
      details: { count: dups.length, sample: dups.slice(0, 8) },
    }));
  } else {
    out.push(pass(ctx, 'freeAgency.no-duplicate-player-ids', 'No duplicate player ids across the pool'));
  }

  // ── no player on multiple teams (via teamId) ─────────────────────────────
  const byTeam = new Map();
  for (const p of players) {
    if (p?.teamId == null) continue;
    const k = String(p.id);
    if (!byTeam.has(k)) byTeam.set(k, new Set());
    byTeam.get(k).add(String(p.teamId));
  }
  const multi = [...byTeam.entries()].filter(([, ts]) => ts.size > 1);
  if (multi.length) {
    out.push(fail(ctx, 'freeAgency.no-multi-team-players', {
      entityType: 'player', entityId: multi[0][0],
      message: `${multi.length} players carry more than one teamId`,
      details: { sample: multi.slice(0, 5).map(([id, ts]) => ({ id, teamIds: [...ts] })) },
    }));
  } else {
    out.push(pass(ctx, 'freeAgency.no-multi-team-players', 'No player carries more than one team id'));
  }

  // ── free-agent status coherence ──────────────────────────────────────────
  const fa = freeAgentsFromPool(players);
  const rosteredIds = new Set(rosteredPlayersFromView(ctx).map((r) => String(r.player?.id)));
  const contradictory = fa.filter((p) => rosteredIds.has(String(p.id)));
  if (contradictory.length) {
    out.push(fail(ctx, 'freeAgency.status-coherent', {
      entityType: 'player', entityId: contradictory[0].id,
      message: `${contradictory.length} free agents are also on a team roster in the view`,
      details: { count: contradictory.length, sample: contradictory.slice(0, 5).map((p) => p.id) },
    }));
  } else {
    out.push(pass(ctx, 'freeAgency.status-coherent', `${fa.length} free agents; none contradict roster membership`));
  }

  return out;
}
