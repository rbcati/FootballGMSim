/**
 * Save/reload consistency invariant.
 *
 * Unlike the other modules this one is not a single-state checker: it compares
 * a canonical pre-save summary against a post-reload summary (both produced by
 * the lifecycle driver through the REAL SAVE_NOW / LOAD_SAVE worker path). The
 * comparison logic lives here as a pure function so it is independently
 * unit-testable.
 *
 * Fields compared for EXACT equality (durable contract):
 *   season, year, week, phase, teamCount, playerPoolSize, freeAgentCount,
 *   capTotalsFingerprint, rosterMembershipFingerprint, completedSeasonCount,
 *   draftPickOwnershipFingerprint, championTeamId, userTeamId.
 *
 * Fields intentionally EXCLUDED (reconstructed / volatile): derived view-only
 * fields such as nextGameStakes, ownerApproval, mediaStories, standings order
 * ties, and any cache-only counters. See docs/long-save-durability-harness.md.
 */
import { pass, fail, skip } from './helpers.js';

export const id = 'saveReload';

/**
 * Build a canonical, comparison-stable summary from a combined state
 * ({ view, db }). Pure — safe to call before save and after reload.
 */
export function canonicalSummary(state) {
  const view = state?.view ?? {};
  const db = state?.db ?? null;
  const teams = Array.isArray(view.teams) ? view.teams : [];

  const capFingerprint = teams
    .map((t) => `${t.id}:${round2(t.capUsed)}`)
    .sort()
    .join('|');

  const rosterFingerprint = teams
    .map((t) => `${t.id}:${(Array.isArray(t.roster) ? t.roster.map((p) => p.id) : []).slice().sort((a, b) => Number(a) - Number(b)).join(',')}`)
    .sort()
    .join('|');

  const picks = Array.isArray(db?.picks) ? db.picks : teams.flatMap((t) => Array.isArray(t.picks) ? t.picks : []);
  const pickOwnership = picks
    .map((pk) => `${pk.id}:${pk.currentOwner}`)
    .sort()
    .join('|');

  const players = Array.isArray(db?.players) ? db.players : null;
  const freeAgentCount = players ? players.filter((p) => p.teamId == null || p.status === 'free_agent').length : null;

  return {
    season: state?.season ?? null,
    year: view.year ?? null,
    week: view.week ?? null,
    phase: view.phase ?? null,
    teamCount: teams.length,
    playerPoolSize: players ? players.length : null,
    freeAgentCount,
    completedSeasonCount: Array.isArray(view.leagueHistory) ? view.leagueHistory.length : null,
    championTeamId: view.championTeamId ?? null,
    userTeamId: view.userTeamId ?? null,
    capFingerprint,
    rosterFingerprint,
    pickOwnership,
  };
}

const EXACT_FIELDS = [
  'year', 'week', 'phase', 'teamCount', 'playerPoolSize', 'freeAgentCount',
  'completedSeasonCount', 'championTeamId', 'userTeamId',
  'capFingerprint', 'rosterFingerprint', 'pickOwnership',
];

/**
 * Compare two canonical summaries; returns { ok, mismatches }.
 * Null-valued fields (not captured on a side) are skipped, not failed.
 */
export function compareCanonical(before, after) {
  const mismatches = [];
  for (const f of EXACT_FIELDS) {
    const a = before?.[f];
    const b = after?.[f];
    if (a == null || b == null) continue; // field not captured on one side
    if (String(a) !== String(b)) {
      mismatches.push({ field: f, before: truncate(a), after: truncate(b) });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

/**
 * Invariant entry point. Expects ctx.saveReload = { before, after }.
 */
export function check(ctx) {
  const sr = ctx?.saveReload;
  if (!sr || !sr.before || !sr.after) {
    return [skip(ctx, 'saveReload.canonical-summary-stable', 'Save/reload not exercised at this checkpoint')];
  }
  const cmp = compareCanonical(sr.before, sr.after);
  if (cmp.ok) {
    return [pass(ctx, 'saveReload.canonical-summary-stable', 'Reload preserved canonical summary exactly', {
      details: { compared: EXACT_FIELDS },
    })];
  }
  return cmp.mismatches.map((m) =>
    fail(ctx, 'saveReload.canonical-summary-stable', {
      entityType: 'league', entityId: m.field,
      message: `Reload changed ${m.field}: ${m.before} -> ${m.after}`,
      details: m,
    }));
}

function round2(v) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : v;
}
function truncate(v) {
  const s = String(v);
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
}
