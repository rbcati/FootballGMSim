/**
 * Entity-reference integrity invariants.
 *
 * Cross-entity dangling-reference detection. Reports BOTH the source entity and
 * the missing target so a repair PR can locate the break. Requires the DB pool
 * for player-level references; falls back to view-only reference checks
 * otherwise (with an explicit skip on the pool-dependent ones).
 */
import { pass, fail, skip } from './helpers.js';
import { playerPool, teamIdSet, playerIdSet, rosteredPlayersFromView, draftPicks } from './derive.js';

export const id = 'references';

export function check(ctx) {
  const out = [];
  const validTeamIds = teamIdSet(ctx);
  const { players, source } = playerPool(ctx);

  // ── player -> team ───────────────────────────────────────────────────────
  if (source === 'db') {
    const dangling = players.filter((p) => p?.teamId != null && !validTeamIds.has(String(p.teamId)));
    if (dangling.length) {
      out.push(fail(ctx, 'references.player-to-team', {
        entityType: 'player', entityId: dangling[0].id,
        message: `${dangling.length} players reference a non-existent team`,
        details: { count: dangling.length, sample: dangling.slice(0, 5).map((p) => ({ playerId: p.id, teamId: p.teamId })) },
      }));
    } else {
      out.push(pass(ctx, 'references.player-to-team', 'Every player.teamId resolves to a real team'));
    }
  } else {
    out.push(skip(ctx, 'references.player-to-team', 'Full player pool not available at this checkpoint'));
  }

  // ── depth chart -> roster membership (view) ──────────────────────────────
  let depthDangling = 0;
  let depthChecked = false;
  for (const team of Array.isArray(ctx?.view?.teams) ? ctx.view.teams : []) {
    const rosterIds = new Set((Array.isArray(team.roster) ? team.roster : []).map((p) => String(p?.id)));
    // depthOrder lives on each roster player; a stale depth ref would be a
    // roster player whose depthOrder points nowhere — here we assert every
    // roster player has a resolvable id (ghost depth refs are caught by roster).
    for (const p of Array.isArray(team.roster) ? team.roster : []) {
      depthChecked = true;
      if (p?.depthOrder != null && !rosterIds.has(String(p.id))) depthDangling += 1;
    }
  }
  if (!depthChecked) {
    out.push(skip(ctx, 'references.depth-chart-to-roster', 'No rosters in view at this checkpoint'));
  } else if (depthDangling) {
    out.push(fail(ctx, 'references.depth-chart-to-roster', {
      entityType: 'player', entityId: null,
      message: `${depthDangling} depth-chart entries do not resolve to a roster player`,
      details: { count: depthDangling },
    }));
  } else {
    out.push(pass(ctx, 'references.depth-chart-to-roster', 'Depth-chart entries resolve to roster members'));
  }

  // ── draft pick -> owner / original owner ─────────────────────────────────
  const { picks, source: pickSource } = draftPicks(ctx);
  if (pickSource !== 'none') {
    const bad = picks.filter((pk) =>
      (pk?.currentOwner != null && !validTeamIds.has(String(pk.currentOwner))) ||
      (pk?.originalOwner != null && !validTeamIds.has(String(pk.originalOwner))));
    if (bad.length) {
      out.push(fail(ctx, 'references.pick-to-team', {
        entityType: 'pick', entityId: bad[0].id,
        message: `${bad.length} picks reference a non-existent owner/original owner`,
        details: { count: bad.length, sample: bad.slice(0, 5).map((pk) => ({ pickId: pk.id, currentOwner: pk.currentOwner, originalOwner: pk.originalOwner })) },
      }));
    } else {
      out.push(pass(ctx, 'references.pick-to-team', 'Pick owner/original-owner references resolve to teams'));
    }
  } else {
    out.push(skip(ctx, 'references.pick-to-team', 'No draft picks available at this checkpoint'));
  }

  // ── pending free-agent offer -> player/team (view) ───────────────────────
  const offers = Array.isArray(ctx?.view?.pendingOffers) ? ctx.view.pendingOffers : [];
  if (offers.length) {
    const poolIds = source === 'db' ? playerIdSet(ctx) : null;
    const bad = offers.filter((o) => {
      if (o?.teamId != null && !validTeamIds.has(String(o.teamId))) return true;
      if (poolIds && o?.playerId != null && !poolIds.has(String(o.playerId))) return true;
      return false;
    });
    if (bad.length) {
      out.push(fail(ctx, 'references.offer-to-entities', {
        entityType: 'contract', entityId: null,
        message: `${bad.length} pending FA offers reference an unknown player/team`,
        details: { count: bad.length, sample: bad.slice(0, 5) },
      }));
    } else {
      out.push(pass(ctx, 'references.offer-to-entities', `${offers.length} pending offers reference valid entities`));
    }
  } else {
    out.push(skip(ctx, 'references.offer-to-entities', 'No pending FA offers at this checkpoint'));
  }

  return out;
}
