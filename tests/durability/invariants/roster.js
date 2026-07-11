/**
 * Roster-integrity invariants.
 *
 * Phase-aware: hard roster-size limits only apply in stable phases
 * (regular / playoffs / preseason). During offseason churn (retirement, draft,
 * early free agency) a roster may legitimately sit outside the 53-man band, so
 * size assertions are relaxed to "team still owns >=1 player and never exceeds
 * the absolute safety ceiling".
 */
import { pass, fail, skip, findDuplicateIds, isRosterStablePhase, isOffseasonPhase, hasId, gamePhase } from './helpers.js';
import { ROSTER } from './bounds.js';
import {
  viewTeams,
  rosteredPlayersFromView,
  playerPool,
  freeAgentsFromPool,
  playerIdSet,
} from './derive.js';

export const id = 'roster';

export function check(ctx) {
  const out = [];
  const teams = viewTeams(ctx);
  if (!teams.length) {
    out.push(skip(ctx, 'roster.present', 'No teams in view state at this checkpoint'));
    return out;
  }

  // ── roster size (phase-aware; classify on the ACTUAL league phase) ───────
  const phase = gamePhase(ctx);
  const stable = isRosterStablePhase(phase);
  const offseason = isOffseasonPhase(phase);
  const sizeViolations = [];
  for (const team of teams) {
    const size = Array.isArray(team.roster) ? team.roster.length : 0;
    if (stable) {
      if (size < ROSTER.REGULAR_SEASON_MIN || size > ROSTER.ABSOLUTE_MAX) {
        sizeViolations.push({ teamId: team.id, size, band: `[${ROSTER.REGULAR_SEASON_MIN}, ${ROSTER.ABSOLUTE_MAX}]` });
      }
    } else if (offseason) {
      if (size < ROSTER.TRANSITIONAL_FLOOR || size > ROSTER.ABSOLUTE_MAX) {
        sizeViolations.push({ teamId: team.id, size, band: `[${ROSTER.TRANSITIONAL_FLOOR}, ${ROSTER.ABSOLUTE_MAX}] (offseason)` });
      }
    }
  }
  if (!stable && !offseason) {
    out.push(skip(ctx, 'roster.size-within-legal-range', `Phase "${phase}" is not roster-size classified`));
  } else if (sizeViolations.length) {
    for (const v of sizeViolations.slice(0, 12)) {
      out.push(fail(ctx, 'roster.size-within-legal-range', {
        entityType: 'team', entityId: v.teamId,
        message: `Team ${v.teamId} roster size ${v.size} outside ${v.band}`,
        details: v,
      }));
    }
  } else {
    out.push(pass(ctx, 'roster.size-within-legal-range', `All ${teams.length} teams within phase-appropriate roster band`));
  }

  // ── no duplicate player membership across teams ──────────────────────────
  const membership = new Map(); // playerId -> [teamId,...]
  for (const { player, teamId } of rosteredPlayersFromView(ctx)) {
    if (player?.id == null) continue;
    const k = String(player.id);
    if (!membership.has(k)) membership.set(k, []);
    membership.get(k).push(teamId);
  }
  const multiTeam = [...membership.entries()].filter(([, ts]) => new Set(ts.map(String)).size > 1);
  if (multiTeam.length) {
    for (const [pid, ts] of multiTeam.slice(0, 12)) {
      out.push(fail(ctx, 'roster.no-duplicate-membership', {
        entityType: 'player', entityId: pid,
        message: `Player ${pid} rostered on multiple teams: ${[...new Set(ts)].join(', ')}`,
        details: { playerId: pid, teamIds: [...new Set(ts.map(String))] },
      }));
    }
  } else {
    out.push(pass(ctx, 'roster.no-duplicate-membership', 'No player belongs to more than one team'));
  }

  // ── no duplicate player ids within a single team roster ──────────────────
  const intraDup = [];
  for (const team of teams) {
    const dups = findDuplicateIds(team.roster || [], (p) => p?.id);
    for (const d of dups) intraDup.push({ teamId: team.id, ...d });
  }
  if (intraDup.length) {
    for (const d of intraDup.slice(0, 12)) {
      out.push(fail(ctx, 'roster.no-intra-team-duplicates', {
        entityType: 'team', entityId: d.teamId,
        message: `Team ${d.teamId} roster lists player ${d.id} ${d.count}x`,
        details: d,
      }));
    }
  } else {
    out.push(pass(ctx, 'roster.no-intra-team-duplicates', 'No team roster contains duplicate player ids'));
  }

  // ── every active roster entry has a valid id ─────────────────────────────
  const missingId = [];
  for (const { player, teamId } of rosteredPlayersFromView(ctx)) {
    if (!hasId(player?.id)) missingId.push({ teamId, sample: player?.name ?? null });
  }
  if (missingId.length) {
    out.push(fail(ctx, 'roster.entries-have-valid-id', {
      entityType: 'team', entityId: missingId[0].teamId,
      message: `${missingId.length} roster entries have a missing/empty player id`,
      details: { count: missingId.length, sample: missingId.slice(0, 5) },
    }));
  } else {
    out.push(pass(ctx, 'roster.entries-have-valid-id', 'All roster entries carry a valid player id'));
  }

  // ── rostered player.teamId agrees with owning team ───────────────────────
  const mismatched = [];
  for (const { player, teamId } of rosteredPlayersFromView(ctx)) {
    if (player?.teamId != null && String(player.teamId) !== String(teamId)) {
      mismatched.push({ playerId: player.id, playerTeamId: player.teamId, rosterTeamId: teamId });
    }
  }
  if (mismatched.length) {
    for (const m of mismatched.slice(0, 12)) {
      out.push(fail(ctx, 'roster.team-id-agrees-with-ownership', {
        entityType: 'player', entityId: m.playerId,
        message: `Player ${m.playerId}.teamId=${m.playerTeamId} but is rostered on team ${m.rosterTeamId}`,
        details: m,
      }));
    }
  } else {
    out.push(pass(ctx, 'roster.team-id-agrees-with-ownership', 'Rostered players agree with their team ownership'));
  }

  // ── no player simultaneously rostered and a free agent (needs full pool) ──
  const { players, source } = playerPool(ctx);
  if (source === 'db') {
    const rosteredIds = new Set(rosteredPlayersFromView(ctx).map((r) => String(r.player?.id)));
    const fa = freeAgentsFromPool(players);
    const overlap = fa.filter((p) => rosteredIds.has(String(p.id)));
    if (overlap.length) {
      for (const p of overlap.slice(0, 12)) {
        out.push(fail(ctx, 'roster.no-roster-and-free-agent-overlap', {
          entityType: 'player', entityId: p.id,
          message: `Player ${p.id} is a free agent yet appears on a team roster`,
          details: { playerId: p.id, status: p.status, teamId: p.teamId },
        }));
      }
    } else {
      out.push(pass(ctx, 'roster.no-roster-and-free-agent-overlap', 'No player is simultaneously rostered and a free agent'));
    }
  } else {
    out.push(skip(ctx, 'roster.no-roster-and-free-agent-overlap', 'Full player pool (DB snapshot) not captured at this checkpoint'));
  }

  // ── no roster entry references a player missing from the pool ────────────
  if (source === 'db') {
    const poolIds = playerIdSet(ctx);
    const dangling = rosteredPlayersFromView(ctx)
      .filter((r) => r.player?.id != null && !poolIds.has(String(r.player.id)));
    if (dangling.length) {
      out.push(fail(ctx, 'roster.no-missing-player-reference', {
        entityType: 'player', entityId: dangling[0].player.id,
        message: `${dangling.length} rostered players are absent from the durable player pool`,
        details: { count: dangling.length, sample: dangling.slice(0, 5).map((d) => d.player.id) },
      }));
    } else {
      out.push(pass(ctx, 'roster.no-missing-player-reference', 'Every rostered player exists in the durable pool'));
    }
  } else {
    out.push(skip(ctx, 'roster.no-missing-player-reference', 'Full player pool (DB snapshot) not captured at this checkpoint'));
  }

  return out;
}
