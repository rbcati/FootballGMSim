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
import { canonicalIdKey, stableIdCompare } from '../../../src/core/referenceIntegrity.js';

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

  // Roster membership fingerprint. Player IDs are MIXED numeric (veterans) and
  // opaque strings (generated rookies), so ordering MUST use the deterministic
  // total-order comparator — `Number(a) - Number(b)` returns NaN for string IDs
  // and yields an implementation-defined order that diverges across a DB
  // round-trip. Duplicates are preserved (not deduped) so a real duplicate
  // still changes the fingerprint.
  const rosterFingerprint = teams
    .map((t) => `${t.id}:${(Array.isArray(t.roster) ? t.roster.map((p) => p.id) : []).slice().sort(stableIdCompare).join(',')}`)
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
 * Roster/pick fingerprint mismatches carry a classified diagnostic that
 * distinguishes a genuine membership change from an ordering/type-only drift.
 */
export function compareCanonical(before, after) {
  const mismatches = [];
  for (const f of EXACT_FIELDS) {
    const a = before?.[f];
    const b = after?.[f];
    if (a == null || b == null) continue; // field not captured on one side
    if (String(a) !== String(b)) {
      const m = { field: f, before: truncate(a), after: truncate(b) };
      if (f === 'rosterFingerprint') {
        m.diagnostic = classifyRosterFingerprintDiff(String(a), String(b));
      }
      mismatches.push(m);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

/** Parse "tid:pid,pid|tid:pid,pid" into a Map<tid, rawId[]>. */
function parseRosterFingerprint(fp) {
  const map = new Map();
  for (const seg of String(fp).split('|')) {
    if (!seg) continue;
    const idx = seg.indexOf(':');
    if (idx < 0) continue;
    const tid = seg.slice(0, idx);
    const ids = seg.slice(idx + 1);
    map.set(tid, ids === '' ? [] : ids.split(','));
  }
  return map;
}

/** Multiset counts keyed by canonical id key. */
function keyCounts(ids) {
  const counts = new Map();
  for (const raw of ids) {
    const key = canonicalIdKey(raw) ?? `__invalid:${raw}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Classify a roster-fingerprint difference per team into:
 *   - semantic   : membership actually changed (missing / extra ids)
 *   - duplicate  : same key present a different number of times
 *   - type-only  : same canonical membership, differing raw id representation
 *   - ordering-only: identical raw multiset, differing sequence
 * A `semantic` classification means the reload genuinely lost/added players.
 */
export function classifyRosterFingerprintDiff(beforeFp, afterFp) {
  const bMap = parseRosterFingerprint(beforeFp);
  const aMap = parseRosterFingerprint(afterFp);
  const teams = new Set([...bMap.keys(), ...aMap.keys()]);
  const perTeam = [];
  let worst = 'ordering-only';
  const severity = { 'ordering-only': 0, 'type-only': 1, 'duplicate': 2, 'semantic': 3 };
  for (const tid of teams) {
    const bIds = bMap.get(tid) ?? null;
    const aIds = aMap.get(tid) ?? null;
    if (bIds === null || aIds === null) {
      perTeam.push({ team: tid, kind: 'semantic', missing: bIds === null ? [] : bIds, extra: aIds === null ? [] : aIds });
      worst = 'semantic';
      continue;
    }
    const bCounts = keyCounts(bIds);
    const aCounts = keyCounts(aIds);
    const missing = [];
    const extra = [];
    const duplicate = [];
    for (const [k, c] of bCounts) {
      const ac = aCounts.get(k) ?? 0;
      if (ac === 0) missing.push(k);
      else if (ac !== c) duplicate.push(k);
    }
    for (const [k, c] of aCounts) {
      if (!bCounts.has(k)) extra.push(k);
    }
    let kind;
    if (missing.length || extra.length) kind = 'semantic';
    else if (duplicate.length) kind = 'duplicate';
    else {
      // Same canonical multiset. Distinguish type-only from ordering-only.
      const bRawSorted = [...bIds].sort();
      const aRawSorted = [...aIds].sort();
      const rawSame = bRawSorted.length === aRawSorted.length && bRawSorted.every((v, i) => v === aRawSorted[i]);
      kind = rawSame ? 'ordering-only' : 'type-only';
    }
    if (kind === 'ordering-only' && bIds.join(',') === aIds.join(',')) continue; // no diff on this team
    perTeam.push({ team: tid, kind, missing, extra, duplicate });
    if (severity[kind] > severity[worst]) worst = kind;
  }
  return { classification: worst, teams: perTeam.slice(0, 8) };
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
  return cmp.mismatches.map((m) => {
    const cls = m.diagnostic?.classification ? ` [${m.diagnostic.classification}]` : '';
    return fail(ctx, 'saveReload.canonical-summary-stable', {
      entityType: 'league', entityId: m.field,
      message: `Reload changed ${m.field}${cls}: ${m.before} -> ${m.after}`,
      details: m,
    });
  });
}

function round2(v) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : v;
}
function truncate(v) {
  const s = String(v);
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
}
