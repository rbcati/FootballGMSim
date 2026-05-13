/**
 * Dynasty soak / balance audit V1 — pure integrity checks on snapshots from the worker.
 * No I/O, no mutations to game state.
 */

import { rebuildRecordBookV1 } from './recordBookV1.js';
import { syncHallOfFameAfterRecordBook } from './league-memory.js';
import {
  TRANSACTION_TIMELINE_SCHEMA_VERSION,
  normalizeRawTransaction,
} from './transactionTimeline.js';
import {
  indexDraftClassesFromTransactions,
  buildDraftClassModel,
} from './draftClassHistory.js';
import { buildAiTeamStrategy } from './aiTeamStrategy.js';
import { buildPlayerDevelopmentModel } from './playerDevelopmentModel.js';
import { summarizeEconomyRegressionSnapshot } from './economyRegressionAudit.js';
import { buildProspectScoutingReport } from './scoutingModel.js';
import {
  defensiveIntsFromTotalsForArchive,
  passIntsThrownFromTotals,
  PLAYER_SEASON_STATS_ARCHIVE_SCHEMA_VERSION,
} from './playerSeasonStatsArchive.js';

/** Broad stat leader bounds (regular NFL-ish full season); outside = warning only */
export const STAT_LEADER_WARN = {
  passYds: { min: 800, max: 6200 },
  rushYds: { min: 150, max: 2800 },
  recYds: { min: 200, max: 3200 },
  sacks: { min: 0, max: 40 },
  tackles: { min: 0, max: 220 },
};

const ROSTER_WARN_MIN = 40;
const DEPTH_WARN = { OL: 4, WR: 3, CB: 3, DL: 3 };

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function isBadNum(v) {
  return !Number.isFinite(v) || Number.isNaN(v) || v === Infinity || v === -Infinity;
}

function isBadCriticalValue(v) {
  if (v == null) return true;
  return typeof v === 'number' && isBadNum(v);
}

function scanCriticalFields(obj, paths, label, fail) {
  for (const path of paths) {
    const value = path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
    if (isBadCriticalValue(value)) {
      fail('critical_value_invalid', `${label}.${path} is ${value == null ? 'null/missing' : 'non-finite'}`, { label, path, value });
    }
  }
}

function emptySummary() {
  return {
    rosterHealth: 'ok',
    capHealth: 'ok',
    statHealth: 'ok',
    archiveHealth: 'ok',
    aiHealth: 'ok',
    transactionHealth: 'ok',
    draftHealth: 'ok',
    scoutingHealth: 'ok',
    developmentHealth: 'ok',
    historyHealth: 'ok',
  };
}

function bumpSummary(summary, key, level) {
  const order = { ok: 0, warn: 1, fail: 2 };
  const cur = summary[key] || 'ok';
  if (order[level] > order[cur]) summary[key] = level;
}

/**
 * Validate compact playerSeasonStatsV1 archive shape (rows + schemaVersion).
 * @param {unknown} block
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validatePlayerSeasonStatsV1Shape(block) {
  const errors = [];
  if (block == null) return { ok: true, errors: [] };
  if (typeof block !== 'object') {
    errors.push('playerSeasonStatsV1 must be an object');
    return { ok: false, errors };
  }
  const sv = block.schemaVersion;
  if (sv != null && Number(sv) !== PLAYER_SEASON_STATS_ARCHIVE_SCHEMA_VERSION) {
    errors.push(`unexpected playerSeasonStatsV1.schemaVersion: ${sv}`);
  }
  const rows = block.rows;
  if (!Array.isArray(rows)) {
    errors.push('playerSeasonStatsV1.rows must be an array');
    return { ok: false, errors };
  }
  for (let i = 0; i < Math.min(rows.length, 5000); i += 1) {
    const r = rows[i];
    if (!r || typeof r !== 'object') {
      errors.push(`row ${i} not an object`);
      continue;
    }
    if (r.playerId == null && r.id == null) errors.push(`row ${i} missing playerId`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Validate transactionTimelineV1 compact archive shape.
 * @param {unknown} block
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateTransactionTimelineV1Shape(block) {
  const errors = [];
  if (block == null) return { ok: true, errors: [] };
  if (typeof block !== 'object') {
    errors.push('transactionTimelineV1 must be an object');
    return { ok: false, errors };
  }
  const sv = block.schemaVersion;
  if (sv != null && Number(sv) !== TRANSACTION_TIMELINE_SCHEMA_VERSION) {
    errors.push(`unexpected transactionTimelineV1.schemaVersion: ${sv}`);
  }
  const rows = block.rows;
  if (!Array.isArray(rows)) {
    errors.push('transactionTimelineV1.rows must be an array');
    return { ok: false, errors };
  }
  return { ok: errors.length === 0, errors };
}

/**
 * @param {string[]} archetypes
 * @returns {Record<string, number>}
 */
export function buildArchetypeDistribution(archetypes) {
  const dist = {};
  for (const a of archetypes || []) {
    const k = String(a || 'unknown');
    dist[k] = (dist[k] || 0) + 1;
  }
  return dist;
}

/**
 * @param {object[]} transactions
 * @returns {Record<string, number>}
 */
export function countTransactionTypes(transactions) {
  const m = {};
  for (const t of transactions || []) {
    const k = String(t?.type ?? 'unknown').toUpperCase();
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

/**
 * Harness-only persistence checklist (does not mutate state).
 * @param {object} input
 * @returns {{ allOk: boolean, assertions: { id: string, ok: boolean, detail: string, code?: string }[] }}
 */
function transactionBucket(tx) {
  const raw = String(tx?.type ?? tx?.legacyType ?? '').toLowerCase();
  if (raw === 'sign' || raw === 'signing') return 'signing';
  if (raw === 'draft') return 'draft';
  if (raw === 'retirement') return 'retirement';
  return raw;
}

function hasSeasonId(row, seasonId) {
  return seasonId != null && String(row?.id ?? row?.seasonId ?? '') === String(seasonId);
}

export function buildPersistenceAssertions(input = {}) {
  const viewState = input.viewState ?? {};
  const leagueHistory = Array.isArray(viewState.leagueHistory) ? viewState.leagueHistory : [];
  const latest = leagueHistory.length ? leagueHistory[leagueHistory.length - 1] : null;
  const assertions = [];

  const latestSeasonId = input.latestSeasonId ?? latest?.id ?? null;
  const auditProfile = input.auditProfile ?? 'full';
  const expectArchive = input.expectArchive ?? auditProfile !== 'ci';

  const skipReason = (id, fallback) => String(input.skippedProbeReasons?.[id] || fallback || '').trim();
  const pushSkipped = (id, reason, detailPrefix = 'skipped') => {
    const hasReason = !!String(reason || '').trim();
    assertions.push({
      id,
      ok: hasReason,
      status: 'skipped',
      skipped: true,
      code: hasReason ? undefined : 'skipped_probe_missing_reason',
      detail: hasReason ? `${detailPrefix}: ${reason}` : `${detailPrefix}: missing reason`,
    });
  };

  if (expectArchive) {
    assertions.push({
      id: 'latest_season_archive',
      ok: !!(latest && latest.id),
      detail: latest?.id ? `latest season id=${latest.id}` : 'leagueHistory missing or empty',
    });
  } else {
    pushSkipped(
      'latest_season_archive',
      skipReason('latest_season_archive', 'CI profile does not complete a season or create a completed-season archive'),
    );
  }

  if (input.allSeasonsProbeOk != null) {
    assertions.push({
      id: 'get_all_seasons_probe',
      ok: !!input.allSeasonsProbeOk,
      code: input.allSeasonsProbeOk ? undefined : 'get_all_seasons_failed',
      detail: input.allSeasonsProbeOk ? 'GET_ALL_SEASONS ok' : 'GET_ALL_SEASONS failed',
    });
  }

  if (Array.isArray(input.allSeasons) && latestSeasonId != null) {
    const found = input.allSeasons.some((season) => hasSeasonId(season, latestSeasonId));
    assertions.push({
      id: 'get_all_seasons_latest',
      ok: found,
      detail: found
        ? `GET_ALL_SEASONS includes latest season ${latestSeasonId}`
        : `GET_ALL_SEASONS missing latest season ${latestSeasonId}`,
    });
  } else if (!expectArchive && input.allSeasonsProbeOk != null) {
    pushSkipped(
      'get_all_seasons_latest',
      skipReason('get_all_seasons_latest', 'CI profile has no completed season archive to find in GET_ALL_SEASONS'),
    );
  }

  if (input.dbLatestSeasonFound != null) {
    assertions.push({
      id: 'db_latest_season_archive',
      ok: !!input.dbLatestSeasonFound,
      detail: input.dbLatestSeasonFound
        ? `IndexedDB contains latest season ${latestSeasonId ?? '(unknown)'}`
        : `IndexedDB missing latest season ${latestSeasonId ?? '(unknown)'}`,
    });
  }

  if (Array.isArray(input.dbAllSeasons) && latestSeasonId != null) {
    const found = input.dbAllSeasons.some((season) => hasSeasonId(season, latestSeasonId));
    assertions.push({
      id: 'db_all_seasons_latest',
      ok: found,
      detail: found
        ? `IndexedDB season list includes latest season ${latestSeasonId}`
        : `IndexedDB season list missing latest season ${latestSeasonId}`,
    });
  }

  if (input.saveNowOk != null) {
    assertions.push({
      id: 'save_now_flush',
      ok: !!input.saveNowOk,
      code: input.saveNowOk ? undefined : 'save_now_failed',
      detail: input.saveNowOk ? 'SAVE_NOW flush ok' : 'SAVE_NOW flush failed',
    });
  }

  if (auditProfile === 'ci') {
    const cp = input.auditCheckpoint ?? null;
    if (!cp) {
      assertions.push({
        id: 'audit_checkpoint_present',
        ok: false,
        code: 'audit_checkpoint_missing',
        detail: 'CI profile did not return an audit checkpoint payload',
      });
    } else {
      assertions.push({
        id: 'audit_checkpoint_ok',
        ok: cp.ok === true,
        code: cp.ok === true ? undefined : 'audit_checkpoint_failed',
        detail: cp.ok === true ? 'audit checkpoint ok' : `audit checkpoint failed: ${cp.error || JSON.stringify(cp.failures || [])}`,
      });
      assertions.push({
        id: 'audit_checkpoint_metadata',
        ok: cp.auditOnly === true && cp.archiveType === 'audit_checkpoint' && cp.completedSeason === false,
        code: cp.auditOnly === true && cp.archiveType === 'audit_checkpoint' && cp.completedSeason === false ? undefined : 'audit_checkpoint_not_guarded',
        detail: `auditOnly=${cp.auditOnly === true} archiveType=${cp.archiveType ?? 'missing'} completedSeason=${cp.completedSeason === false ? 'false' : String(cp.completedSeason)}`,
      });
      assertions.push({
        id: 'audit_checkpoint_real_weeks',
        ok: Number(cp.realWeeksSimulated ?? 0) >= 1,
        code: Number(cp.realWeeksSimulated ?? 0) >= 1 ? undefined : 'audit_checkpoint_exercised_data_missing',
        detail: `realWeeksSimulated=${cp.realWeeksSimulated ?? 'missing'}`,
      });
      const exercised = cp.exercised && typeof cp.exercised === 'object' ? cp.exercised : {};
      const exercisedEntries = Object.entries(exercised);
      assertions.push({
        id: 'audit_checkpoint_exercised_systems',
        ok: exercisedEntries.length > 0,
        code: exercisedEntries.length > 0 ? undefined : 'audit_checkpoint_exercised_data_missing',
        detail: exercisedEntries.length ? `exercised: ${exercisedEntries.map(([name]) => name).join(', ')}` : 'no checkpoint systems marked exercised',
      });
      for (const [name, entry] of exercisedEntries) {
        const failed = entry?.status === 'failed' || entry?.ok === false;
        assertions.push({
          id: `audit_checkpoint_probe_${name}`,
          ok: !failed,
          code: failed ? 'audit_checkpoint_probe_failed' : undefined,
          detail: failed ? `${name} failed: ${entry?.detail || entry?.error || 'no detail'}` : `${name}: ${entry?.detail || entry?.status || 'exercised'}`,
        });
      }
      const skipped = Array.isArray(cp.skipped) ? cp.skipped : [];
      for (const row of skipped) {
        const reason = String(row?.reason || '').trim();
        assertions.push({
          id: `audit_checkpoint_skipped_${row?.system || 'unknown'}`,
          ok: !!reason,
          status: 'skipped',
          skipped: true,
          code: reason ? undefined : 'audit_checkpoint_skipped_without_reason',
          detail: reason ? `skipped: ${reason}` : 'skipped: missing reason',
        });
      }
    }
  }

  const hasTx = Array.isArray(input.transactionsRecent) && input.transactionsRecent.length > 0;
  const transactionsRecentProbeOk = input.transactionsRecentProbeOk !== false;
  const transactionsRecentHasExpectedData = input.transactionsRecentHasExpectedData ?? hasTx;
  assertions.push({
    id: 'transactions_recent_available',
    ok: transactionsRecentProbeOk && (transactionsRecentHasExpectedData || !input.expectTransactions),
    code: !transactionsRecentProbeOk
      ? 'get_transactions_failed'
      : (!transactionsRecentHasExpectedData && input.expectTransactions ? 'transactions_recent_empty' : undefined),
    detail: !transactionsRecentProbeOk
      ? 'GET_TRANSACTIONS recent failed'
      : transactionsRecentHasExpectedData
        ? `${input.transactionsRecent.length} recent rows`
        : input.expectTransactions
          ? 'no transactions in recent strip but activity expected'
          : 'no recent transactions (ok if none expected)',
  });

  if (input.seasonTxQuerySkipped) {
    pushSkipped(
      'get_transactions_by_season',
      skipReason('get_transactions_by_season', 'CI profile has no completed season archive for a season-scoped transaction query'),
    );
  } else if (input.seasonTxQueryOk != null) {
    assertions.push({
      id: 'get_transactions_by_season',
      ok: !!input.seasonTxQueryOk,
      code: input.seasonTxQueryOk ? undefined : 'get_transactions_failed',
      detail: input.seasonTxQueryOk ? 'GET_TRANSACTIONS by season ok' : 'GET_TRANSACTIONS by season failed',
    });
  }

  const statsShape = validatePlayerSeasonStatsV1Shape(latest?.playerSeasonStatsV1);
  const statsRows = latest?.playerSeasonStatsV1?.rows;
  const hasStatsRows = Array.isArray(statsRows) && statsRows.length > 0;
  if (expectArchive || latest?.playerSeasonStatsV1 != null) {
    assertions.push({
      id: 'player_season_stats_v1',
      ok: statsShape.ok && (!input.expectStatRows || hasStatsRows),
      detail: statsShape.ok
        ? hasStatsRows
          ? `${statsRows.length} stat rows`
          : 'archive present, no stat rows (ok early-season)'
        : statsShape.errors.join('; '),
    });
  } else {
    pushSkipped(
      'player_season_stats_v1',
      skipReason('player_season_stats_v1', 'CI profile does not create a completed-season player stats archive'),
    );
  }

  const tvShape = validateTransactionTimelineV1Shape(latest?.transactionTimelineV1);
  const tvRows = latest?.transactionTimelineV1?.rows;
  const hasTxRows = Array.isArray(tvRows) && tvRows.length > 0;
  if (expectArchive || latest?.transactionTimelineV1 != null) {
    assertions.push({
      id: 'transaction_timeline_v1',
      ok: tvShape.ok && (!input.expectTimelineRows || hasTxRows),
      detail: tvShape.ok
        ? hasTxRows
          ? `${tvRows.length} timeline rows`
          : 'timeline object ok, empty rows'
        : tvShape.errors.join('; '),
    });
  } else {
    pushSkipped(
      'transaction_timeline_v1',
      skipReason('transaction_timeline_v1', 'CI profile does not create a completed-season transaction timeline archive'),
    );
  }

  if (input.getSeasonHistorySkipped) {
    pushSkipped(
      'get_season_history',
      skipReason('get_season_history', 'shallow probe mode has no completed season history to query'),
    );
  } else {
    assertions.push({
      id: 'get_season_history',
      ok: input.getSeasonHistoryOk !== false,
      detail: input.getSeasonHistoryOk
        ? 'GET_SEASON_HISTORY returned data'
        : 'GET_SEASON_HISTORY failed or empty',
    });
  }

  if (input.seasonHistory !== undefined && latestSeasonId != null && !input.getSeasonHistorySkipped) {
    const found = input.seasonHistory && hasSeasonId(input.seasonHistory, latestSeasonId);
    assertions.push({
      id: 'get_season_history_latest',
      ok: !!found,
      detail: found
        ? `GET_SEASON_HISTORY returned latest season ${latestSeasonId}`
        : `GET_SEASON_HISTORY missing latest season ${latestSeasonId}`,
    });
  }

  const transactionProbeRows = [
    ...(Array.isArray(input.transactionsRecent) ? input.transactionsRecent : []),
    ...(Array.isArray(input.transactionsSeason) ? input.transactionsSeason : []),
    ...(Array.isArray(input.dbTransactions) ? input.dbTransactions : []),
  ];
  const expectedTransactionTypes = Array.isArray(input.expectedTransactionTypes)
    ? input.expectedTransactionTypes.map((type) => String(type).toLowerCase())
    : [];
  if (expectedTransactionTypes.length) {
    const present = new Set(transactionProbeRows.map(transactionBucket));
    const missing = expectedTransactionTypes.filter((type) => !present.has(type));
    assertions.push({
      id: 'expected_transaction_types',
      ok: missing.length === 0,
      detail: missing.length
        ? `missing transaction buckets: ${missing.join(', ')}`
        : `found transaction buckets: ${expectedTransactionTypes.join(', ')}`,
    });
  }

  if (input.recordsProbeSkipped) {
    pushSkipped('get_records', skipReason('get_records', 'records probe skipped by audit profile'));
  } else {
    assertions.push({
      id: 'get_records',
      ok: input.recordsProbeOk !== false,
      detail: input.recordsProbeOk
        ? 'GET_RECORDS ok'
        : 'GET_RECORDS missing recordBook',
    });
  }

  if (input.hofProbeSkipped) {
    pushSkipped('get_hall_of_fame', skipReason('get_hall_of_fame', 'Hall of Fame probe skipped by audit profile'));
  } else {
    assertions.push({
      id: 'get_hall_of_fame',
      ok: input.hofProbeOk !== false,
      detail: input.hofProbeOk
        ? 'GET_HALL_OF_FAME ok'
        : 'GET_HALL_OF_FAME invalid shape',
    });
  }

  const draftClassesProbeOk = input.draftClassesProbeOk !== false;
  const draftClassesHasExpectedData = input.draftClassesHasExpectedData ?? Number(input.draftClassCount ?? 0) > 0;
  if (input.draftClassesProbeSkipped) {
    pushSkipped(
      'get_draft_classes',
      skipReason('get_draft_classes', 'CI profile does not enter draft, so draft classes are not expected'),
    );
  } else {
    assertions.push({
      id: 'get_draft_classes',
      ok: draftClassesProbeOk && (draftClassesHasExpectedData || !input.expectDraftClasses),
      code: !draftClassesProbeOk
        ? 'get_draft_classes_failed'
        : (!draftClassesHasExpectedData && input.expectDraftClasses ? 'draft_classes_empty' : undefined),
      detail: !draftClassesProbeOk
        ? 'GET_DRAFT_CLASSES failed'
        : draftClassesHasExpectedData
          ? `GET_DRAFT_CLASSES count=${input.draftClassCount ?? 0}`
          : 'GET_DRAFT_CLASSES returned no classes (ok if none expected)',
    });
  }

  return { allOk: assertions.every((a) => a.ok !== false), assertions };
}

function countByPos(roster) {
  const m = {};
  for (const p of roster || []) {
    const pos = String(p?.pos ?? p?.position ?? '').toUpperCase();
    if (!pos) continue;
    m[pos] = (m[pos] || 0) + 1;
  }
  const ol = (m.OL || 0) + (m.OT || 0) + (m.OG || 0) + (m.C || 0) + (m.G || 0) + (m.T || 0);
  const dl = (m.DL || 0) + (m.DE || 0) + (m.DT || 0) + (m.EDGE || 0) + (m.NT || 0);
  return { ...m, OL: ol, DL: dl };
}

function collectAllPlayers(viewState) {
  const teams = Array.isArray(viewState?.teams) ? viewState.teams : [];
  const out = [];
  for (const t of teams) {
    for (const p of t?.roster || []) {
      if (p && typeof p === 'object') out.push({ ...p, teamId: p.teamId ?? t.id, _auditContainer: `team:${t.id}` });
    }
  }
  for (const p of viewState?.freeAgents || []) {
    if (p && typeof p === 'object') out.push({ ...p, teamId: p.teamId ?? null, _auditContainer: 'freeAgents' });
  }
  for (const p of viewState?.draftPool || viewState?.draftClass || []) {
    if (p && typeof p === 'object') out.push({ ...p, teamId: p.teamId ?? null, _auditContainer: 'draftPool' });
  }
  return out;
}

function latestCompletedSeasonSummary(leagueHistory) {
  const h = Array.isArray(leagueHistory) ? leagueHistory : [];
  if (!h.length) return null;
  return h[h.length - 1] || null;
}

/**
 * @param {object} input
 * @param {object} input.viewState — worker FULL_STATE / buildViewState shape
 * @param {number} [input.seasonIndex] — 1-based season completed count (for warnings)
 * @param {object[]} [input.allSeasons] — GET_ALL_SEASONS.seasons
 * @param {object|null} [input.seasonHistory] — GET_SEASON_HISTORY.data for one season
 * @param {object[]} [input.transactions] — GET_TRANSACTIONS.transactions strip
 * @param {object|null} [input.recordsPayload] — GET_RECORDS { records, recordBook }
 * @param {object|null} [input.hofPayload] — GET_HALL_OF_FAME { players, classes }
 * @param {object|null} [input.draftClassesPayload] — GET_DRAFT_CLASSES { classes }
 */
export function runDynastySoakAudit(input = {}) {
  const viewState = input.viewState ?? {};
  const seasonIndex = Number(input.seasonIndex) || 0;
  const checks = [];
  const failures = [];
  const warnings = [];
  const summary = emptySummary();

  const fail = (code, message, detail = null) => {
    failures.push({ code, message, detail });
    checks.push({ severity: 'failure', code, message, detail });
  };
  const warn = (code, message, detail = null) => {
    warnings.push({ code, message, detail });
    checks.push({ severity: 'warning', code, message, detail });
  };

  const metaPhase = String(viewState?.phase ?? '');
  const year = num(viewState?.year);
  const userTeamId = viewState?.userTeamId;
  const teams = Array.isArray(viewState?.teams) ? viewState.teams : [];
  const schedule = viewState?.schedule;
  const standings = Array.isArray(viewState?.standings) ? viewState.standings : [];
  const leagueHistory = viewState?.leagueHistory ?? [];
  const incomingTradeOffers = Array.isArray(viewState?.incomingTradeOffers) ? viewState.incomingTradeOffers : [];

  const expectedTeamCount = input.expectedTeamCount == null ? null : Number(input.expectedTeamCount);
  if (Number.isFinite(expectedTeamCount) && teams.length !== expectedTeamCount) {
    fail('team_count_unstable', `Expected ${expectedTeamCount} teams, found ${teams.length}`);
    bumpSummary(summary, 'historyHealth', 'fail');
  }

  // --- Phase / user / schedule ---
  if (userTeamId == null || userTeamId === '') {
    fail('user_team_missing', 'userTeamId is missing from view state');
    bumpSummary(summary, 'historyHealth', 'fail');
  } else {
    const ut = teams.find((t) => Number(t?.id) === Number(userTeamId));
    if (!ut) {
      fail('user_team_not_found', 'User team id not found in teams list');
      bumpSummary(summary, 'rosterHealth', 'fail');
    }
  }

  if (['regular', 'playoffs'].includes(metaPhase)) {
    if (!schedule?.weeks?.length) {
      fail('schedule_missing', `No schedule weeks while phase=${metaPhase}`);
      bumpSummary(summary, 'historyHealth', 'fail');
    }
    if (metaPhase === 'regular' && standings.length === 0) {
      fail('standings_empty', 'Standings empty during regular season');
      bumpSummary(summary, 'historyHealth', 'fail');
    }
  }
  for (const row of standings) {
    const wins = num(row?.wins);
    const losses = num(row?.losses);
    const ties = num(row?.ties ?? 0);
    if (isBadNum(wins) || isBadNum(losses) || isBadNum(ties) || wins < 0 || losses < 0 || ties < 0) {
      fail('standings_impossible', `Team ${row?.id ?? row?.teamId ?? 'unknown'} has invalid standings values`, { wins, losses, ties });
      bumpSummary(summary, 'historyHealth', 'fail');
    }
  }

  if (!Number.isFinite(year) || year < 1900) {
    fail('league_year_invalid', `League year is invalid: ${viewState?.year}`);
    bumpSummary(summary, 'historyHealth', 'fail');
  }
  if (!metaPhase) {
    fail('league_phase_invalid', 'League phase is missing');
    bumpSummary(summary, 'historyHealth', 'fail');
  }

  // --- Roster / cap / AI strategy ---
  let teamsWithoutQb = 0;
  const archetypes = [];
  for (const team of teams) {
    const tid = team?.id;
    const roster = Array.isArray(team?.roster) ? team.roster : [];
    if (team?.id == null || team.id === '') {
      fail('team_id_missing', 'Team missing id');
      bumpSummary(summary, 'rosterHealth', 'fail');
    }
    if (!Array.isArray(team?.roster)) {
      fail('roster_container_missing', `Team ${tid} roster container missing or invalid`, { teamId: tid });
      bumpSummary(summary, 'rosterHealth', 'fail');
    }
    scanCriticalFields(team, ['capUsed', 'capTotal', 'capRoom', 'wins', 'losses', 'ptsFor', 'ptsAgainst'], `team:${tid}`, fail);
    const n = roster.length;
    if (n === 0) {
      fail('roster_empty', `Team ${tid} has an empty roster`, { teamId: tid });
      bumpSummary(summary, 'rosterHealth', 'fail');
    } else if (n < ROSTER_WARN_MIN) {
      warn('roster_thin', `Team ${tid} roster count ${n} below comfort threshold ${ROSTER_WARN_MIN}`, { teamId: tid });
      bumpSummary(summary, 'rosterHealth', 'warn');
    }

    const counts = countByPos(roster);
    if (!counts.QB) teamsWithoutQb += 1;

    for (const [label, need] of Object.entries(DEPTH_WARN)) {
      const c = counts[label] ?? 0;
      if (c < need) {
        warn(`depth_${label.toLowerCase()}`, `Team ${tid} has ${c} ${label} (warn if < ${need})`, { teamId: tid });
        bumpSummary(summary, 'rosterHealth', 'warn');
      }
    }

    for (const p of roster.slice(0, 120)) {
      scanCriticalFields(p, ['id', 'age', 'ovr', 'potential'], `player:${p?.id ?? 'missing'}@team:${tid}`, fail);
      if (!p?.pos && !p?.position) {
        fail('player_position_missing', `Player ${p?.id ?? 'unknown'} on team ${tid} missing position`, { teamId: tid, playerId: p?.id });
        bumpSummary(summary, 'rosterHealth', 'fail');
      }
      const contract = p?.contract ?? p;
      for (const key of ['baseAnnual', 'yearsRemaining']) {
        if (contract?.[key] != null && isBadNum(num(contract[key]))) {
          fail('contract_value_invalid', `Player ${p?.id ?? 'unknown'} contract.${key} is non-finite`, { playerId: p?.id, key });
          bumpSummary(summary, 'capHealth', 'fail');
        }
      }
    }

    const capUsed = num(team?.capUsed);
    const capTotal = num(team?.capTotal);
    const capRoom = num(team?.capRoom);
    if (isBadNum(capUsed) || isBadNum(capTotal) || isBadNum(capRoom)) {
      fail('cap_nan', `Team ${tid} has non-finite cap fields`, { teamId: tid, capUsed, capTotal, capRoom });
      bumpSummary(summary, 'capHealth', 'fail');
    } else if (capTotal > 0 && capUsed > capTotal * 1.2) {
      fail('cap_impossible', `Team ${tid} capUsed exceeds 120% of capTotal`, { teamId: tid });
      bumpSummary(summary, 'capHealth', 'fail');
    } else if (capTotal > 0 && capUsed > capTotal * 1.02) {
      warn('cap_stressed', `Team ${tid} capUsed > 102% capTotal`, { teamId: tid });
      bumpSummary(summary, 'capHealth', 'warn');
    }

    const pf = num(team?.ptsFor);
    const pa = num(team?.ptsAgainst);
    if (isBadNum(pf) || isBadNum(pa)) {
      fail('team_points_nan', `Team ${tid} non-finite ptsFor/ptsAgainst`, { teamId: tid, pf, pa });
      bumpSummary(summary, 'statHealth', 'fail');
    }

    try {
      const strategy = buildAiTeamStrategy({
        team: {
          id: team.id,
          abbr: team.abbr,
          wins: team.wins ?? 0,
          losses: team.losses ?? 0,
          capRoom: team.capRoom ?? 0,
          capUsed: team.capUsed ?? 0,
          deadCap: team.deadCap ?? 0,
          picks: team.picks ?? [],
        },
        roster: roster.map((p) => ({
          id: p.id,
          pos: p.pos,
          age: p.age,
          ovr: p.ovr,
          potential: p.potential,
          contract: p.contract ?? {
            years: p.yearsRemaining ?? p.yearsTotal,
            yearsRemaining: p.yearsRemaining ?? p.yearsTotal,
            baseAnnual: p.baseAnnual,
          },
        })),
        league: { year: viewState?.year ?? 2025, phase: metaPhase },
      });
      if (!strategy?.archetype) {
        fail('ai_strategy_shape', `Team ${tid} strategy missing archetype`, { teamId: tid });
        bumpSummary(summary, 'aiHealth', 'fail');
      }
      if (!Number.isFinite(strategy?.capHealth)) {
        fail('ai_strategy_cap_health', `Team ${tid} strategy.capHealth not finite`, { teamId: tid });
        bumpSummary(summary, 'aiHealth', 'fail');
      }
      archetypes.push(String(strategy.archetype));
    } catch (e) {
      fail('ai_strategy_throw', `buildAiTeamStrategy threw for team ${tid}: ${e?.message}`, { teamId: tid });
      bumpSummary(summary, 'aiHealth', 'fail');
    }
  }

  const teamsWithoutViableQb = teams.filter((team) => {
    const roster = Array.isArray(team?.roster) ? team.roster : [];
    return !roster.some((p) => String(p?.pos ?? p?.position ?? '').toUpperCase() === 'QB' && num(p?.ovr) >= 55);
  }).length;
  if (teamsWithoutViableQb >= 8) {
    warn('qb_scarcity_collapse', `${teamsWithoutViableQb} teams lack a viable 55+ OVR QB option`);
    bumpSummary(summary, 'rosterHealth', 'warn');
  }

  if (teamsWithoutQb >= 2) {
    fail('multi_team_no_qb', `${teamsWithoutQb} teams lack a QB`);
    bumpSummary(summary, 'rosterHealth', 'fail');
  } else if (teamsWithoutQb === 1) {
    warn('one_team_no_qb', 'One team has no QB on roster');
    bumpSummary(summary, 'rosterHealth', 'warn');
  }

  if (archetypes.length >= 8) {
    const dist = {};
    for (const a of archetypes) dist[a] = (dist[a] || 0) + 1;
    const maxShare = Math.max(...Object.values(dist)) / archetypes.length;
    if (maxShare > 0.75) {
      warn('ai_archetype_cluster', `Archetype distribution skewed: ${JSON.stringify(dist)}`);
      bumpSummary(summary, 'aiHealth', 'warn');
    }
  }

  // --- League history / champion ---
  if (Array.isArray(leagueHistory) && leagueHistory.length) {
    const seenSeasonIds = new Set();
    for (let i = 0; i < leagueHistory.length; i += 1) {
      const season = leagueHistory[i];
      const seasonId = season?.id ?? season?.seasonId ?? `${season?.year ?? 'unknown'}:${i}`;
      if (seenSeasonIds.has(String(seasonId))) {
        fail('season_archive_duplicate', `Duplicate completed-season archive id ${seasonId}`);
        bumpSummary(summary, 'archiveHealth', 'fail');
      }
      seenSeasonIds.add(String(seasonId));
      if (!season?.champion && (season?.standings?.length ?? 0) > 0) {
        fail('champion_missing', `Completed season archive ${seasonId} has standings but no champion`, { seasonId });
        bumpSummary(summary, 'historyHealth', 'fail');
      }
      if (season?.champion && !season?.playoffBracketSnapshot) {
        warn('playoff_bracket_snapshot_missing', `Completed season archive ${seasonId} has a champion but no playoffBracketSnapshot`, { seasonId });
        bumpSummary(summary, 'archiveHealth', 'warn');
      }
      if (!season?.playerSeasonStatsV1) {
        warn('player_season_stats_archive_missing', `Completed season archive ${seasonId} missing playerSeasonStatsV1`, { seasonId });
        bumpSummary(summary, 'archiveHealth', 'warn');
      }
      if (!season?.transactionTimelineV1) {
        warn('transaction_timeline_archive_missing', `Completed season archive ${seasonId} missing transactionTimelineV1`, { seasonId });
        bumpSummary(summary, 'transactionHealth', 'warn');
      }
      const archivedStandings = Array.isArray(season?.standings) ? season.standings : [];
      if (archivedStandings.length) {
        let totalWins = 0;
        let totalLosses = 0;
        for (const row of archivedStandings) {
          const wins = num(row?.wins);
          const losses = num(row?.losses);
          if (isBadNum(wins) || isBadNum(losses) || wins < 0 || losses < 0 || wins > 25 || losses > 25) {
            fail('archived_standings_impossible', `Completed season ${seasonId} has invalid standings row`, { seasonId, wins, losses });
            bumpSummary(summary, 'historyHealth', 'fail');
          }
          totalWins += Number.isFinite(wins) ? wins : 0;
          totalLosses += Number.isFinite(losses) ? losses : 0;
        }
        if (archivedStandings.length >= 30 && Math.abs(totalWins - totalLosses) > 8) {
          warn('archived_standings_unbalanced', `Completed season ${seasonId} win/loss totals differ (${totalWins}/${totalLosses})`, { seasonId });
          bumpSummary(summary, 'historyHealth', 'warn');
        }
      }
    }
    if (seasonIndex > 0 && leagueHistory.length < seasonIndex) {
      warn('season_archive_missing_count', `Completed season archive count ${leagueHistory.length} < seasonIndex ${seasonIndex}`);
      bumpSummary(summary, 'archiveHealth', 'warn');
    }
  }

  const latest = latestCompletedSeasonSummary(leagueHistory);
  if (latest && seasonIndex > 0) {
    const v1 = validatePlayerSeasonStatsV1Shape(latest.playerSeasonStatsV1);
    if (!v1.ok) {
      for (const e of v1.errors) fail('player_season_stats_shape', e);
      if (v1.errors.length) bumpSummary(summary, 'archiveHealth', 'fail');
    }
    const tv = validateTransactionTimelineV1Shape(latest.transactionTimelineV1);
    if (!tv.ok) {
      for (const e of tv.errors) fail('transaction_timeline_shape', e);
      if (tv.errors.length) bumpSummary(summary, 'archiveHealth', 'fail');
    }
    if (Array.isArray(latest.playerSeasonStatsV1?.rows)) {
      for (const row of latest.playerSeasonStatsV1.rows.slice(0, 2000)) {
        const pos = row?.pos;
        const totals = row?.totals && typeof row.totals === 'object' ? row.totals : {};
        const defInt = defensiveIntsFromTotalsForArchive(pos, totals);
        const qbInt = passIntsThrownFromTotals(pos, totals);
        if (String(pos).toUpperCase() === 'QB' && qbInt > 40 && defInt > 40) {
          warn('qb_int_def_int_sanity', 'Unusually high QB pass INT and defensive INT columns on same row', { playerId: row.playerId });
          bumpSummary(summary, 'statHealth', 'warn');
        }
      }
    }
    if (Array.isArray(latest.games)) {
      const seenGameIds = new Set();
      for (const game of latest.games.slice(0, 400)) {
        const gameId = game?.id ?? game?.gameId ?? null;
        if (gameId != null) {
          const key = String(gameId);
          if (seenGameIds.has(key)) {
            fail('game_archive_duplicate', `Duplicate game archive row ${key}`);
            bumpSummary(summary, 'archiveHealth', 'fail');
          }
          seenGameIds.add(key);
        }
        const homeScore = num(game?.homeScore ?? game?.home?.score);
        const awayScore = num(game?.awayScore ?? game?.away?.score);
        if ((game?.homeScore != null || game?.awayScore != null) && (isBadNum(homeScore) || isBadNum(awayScore) || homeScore < 0 || awayScore < 0)) {
          fail('game_archive_score_malformed', `Game archive row ${gameId ?? '(no id)'} has invalid score`, { homeScore, awayScore });
          bumpSummary(summary, 'archiveHealth', 'fail');
        }
        if (game?.boxScore != null && (typeof game.boxScore !== 'object' || Array.isArray(game.boxScore))) {
          fail('box_score_archive_malformed', `Game archive row ${gameId ?? '(no id)'} has malformed boxScore`);
          bumpSummary(summary, 'archiveHealth', 'fail');
        }
      }
    }
  }

  if (seasonIndex >= 1 && leagueHistory.length === 0) {
    warn('league_history_empty', 'Expected leagueHistory to grow after completed seasons');
    bumpSummary(summary, 'historyHealth', 'warn');
  }

  // --- Stat leaders (warnings) from latest archive ---
  if (latest?.playerStatLeaders && typeof latest.playerStatLeaders === 'object') {
    const pl = latest.playerStatLeaders;
    const passYds = num(pl.passingYards?.value ?? pl.passingYards);
    if (Number.isFinite(passYds)) {
      if (passYds < STAT_LEADER_WARN.passYds.min || passYds > STAT_LEADER_WARN.passYds.max) {
        warn('leader_pass_yds_outlier', `Passing yards leader ${passYds}`);
        bumpSummary(summary, 'statHealth', 'warn');
      }
    }
    const rushYds = num(pl.rushingYards?.value ?? pl.rushingYards);
    if (Number.isFinite(rushYds)) {
      if (rushYds < STAT_LEADER_WARN.rushYds.min || rushYds > STAT_LEADER_WARN.rushYds.max) {
        warn('leader_rush_yds_outlier', `Rushing yards leader ${rushYds}`);
        bumpSummary(summary, 'statHealth', 'warn');
      }
    }
    const recYds = num(pl.receivingYards?.value ?? pl.receivingYards);
    if (Number.isFinite(recYds)) {
      if (recYds < STAT_LEADER_WARN.recYds.min || recYds > STAT_LEADER_WARN.recYds.max) {
        warn('leader_rec_yds_outlier', `Receiving yards leader ${recYds}`);
        bumpSummary(summary, 'statHealth', 'warn');
      }
    }
  }

  // --- Record book rebuild ---
  const allPlayers = collectAllPlayers(viewState);
  const seenPlayerIds = new Map();
  for (const p of allPlayers) {
    const pid = p?.id;
    if (pid == null || pid === '') {
      fail('player_id_missing', `Player missing id in ${p?._auditContainer ?? 'unknown'}`);
      bumpSummary(summary, 'rosterHealth', 'fail');
      continue;
    }
    const key = String(pid);
    if (seenPlayerIds.has(key)) {
      fail('duplicate_player_id', `Player id ${key} appears in both ${seenPlayerIds.get(key)} and ${p?._auditContainer ?? 'unknown'}`, { playerId: pid });
      bumpSummary(summary, 'rosterHealth', 'fail');
    }
    seenPlayerIds.set(key, p?._auditContainer ?? 'unknown');
  }
  try {
    rebuildRecordBookV1({
      leagueHistory,
      players: allPlayers,
      previousRecordBook: viewState?.recordBook ?? null,
    });
  } catch (e) {
    fail('record_book_rebuild_throw', e?.message || String(e));
    bumpSummary(summary, 'archiveHealth', 'fail');
  }

  // --- HOF sync safety (dry run on cloned meta) ---
  try {
    const memoryMeta = {
      leagueHistory,
      recordBook: viewState?.recordBook ?? {},
      hallOfFame: { classes: viewState?.hallOfFameClasses ?? [], index: {}, schemaVersion: 1 },
    };
    syncHallOfFameAfterRecordBook(memoryMeta, allPlayers, year, { teams });
  } catch (e) {
    fail('hof_sync_throw', e?.message || String(e));
    bumpSummary(summary, 'archiveHealth', 'fail');
  }

  if (seasonIndex <= 2 && (!viewState?.hallOfFameClasses || viewState.hallOfFameClasses.length === 0)) {
    warn('hof_empty_young', 'Hall of Fame classes empty in early league years');
    bumpSummary(summary, 'archiveHealth', 'warn');
  }

  // --- allSeasons growth ---
  const allSeasons = Array.isArray(input.allSeasons) ? input.allSeasons : null;
  if (allSeasons && seasonIndex > 0 && allSeasons.length < seasonIndex) {
    warn('all_seasons_short', `allSeasons length ${allSeasons.length} < seasonIndex ${seasonIndex}`);
    bumpSummary(summary, 'archiveHealth', 'warn');
  }

  // --- seasonHistory sample ---
  if (input.seasonHistory && typeof input.seasonHistory === 'object') {
    const sh = validatePlayerSeasonStatsV1Shape(input.seasonHistory.playerSeasonStatsV1);
    if (!sh.ok) {
      for (const e of sh.errors) fail('season_history_stats_shape', e);
      bumpSummary(summary, 'archiveHealth', 'fail');
    }
  }

  // --- Economy regression snapshot (informational, warning-only) ---
  const economyRegressionSnapshot = summarizeEconomyRegressionSnapshot({
    teams,
    players: allPlayers,
    userTeamId,
    incomingTradeOffers,
  });
  if (economyRegressionSnapshot.teamsOverCap > 0) {
    warn('economy_teams_over_cap', `${economyRegressionSnapshot.teamsOverCap} team(s) are over cap in economy regression snapshot`);
    bumpSummary(summary, 'capHealth', 'warn');
  }
  if (economyRegressionSnapshot.teamsWithPendingOfferOvercommit > 0) {
    warn('economy_pending_offer_overcommit', `${economyRegressionSnapshot.teamsWithPendingOfferOvercommit} team(s) are overcommitted by pending offers`, {
      pendingOfferOvercommitCount: economyRegressionSnapshot.pendingOfferOvercommitCount,
    });
    bumpSummary(summary, 'capHealth', 'warn');
  }
  if (economyRegressionSnapshot.duplicateExpensiveSameGroupOffers > 0) {
    warn('economy_duplicate_expensive_same_group_offers', `${economyRegressionSnapshot.duplicateExpensiveSameGroupOffers} duplicate expensive same-group CPU offer bucket(s)`);
    bumpSummary(summary, 'aiHealth', 'warn');
  }
  if (economyRegressionSnapshot.oldVeteranOffersByRebuildTeams > 0) {
    warn('economy_rebuild_old_veteran_offer', `${economyRegressionSnapshot.oldVeteranOffersByRebuildTeams} old expensive veteran CPU offer(s) by rebuild teams`);
    bumpSummary(summary, 'aiHealth', 'warn');
  }
  const contenderTeams = teams.filter((team) => ['contender', 'playoff_hunt', 'desperate'].includes(String(team?.archetype ?? team?.strategy?.archetype ?? team?.teamArchetype ?? '').toLowerCase()));
  if (contenderTeams.length >= 4 && economyRegressionSnapshot.cpuOfferCount > 0 && economyRegressionSnapshot.contenderVeteranOfferCount === 0) {
    warn('economy_contenders_no_win_now_moves', 'Contender archetypes exist but no win-now veteran CPU offer activity was observed in the snapshot');
    bumpSummary(summary, 'aiHealth', 'warn');
  }
  if (economyRegressionSnapshot.premiumYoungPlayerTradeDiscountFlags > 0 || economyRegressionSnapshot.expensiveVeteranSwapFlags > 0) {
    warn('economy_trade_realism_flags', 'Trade realism warning flags detected in economy regression snapshot', {
      premiumYoungPlayerTradeDiscountFlags: economyRegressionSnapshot.premiumYoungPlayerTradeDiscountFlags,
      expensiveVeteranSwapFlags: economyRegressionSnapshot.expensiveVeteranSwapFlags,
    });
    bumpSummary(summary, 'aiHealth', 'warn');
  }

  // --- Transactions + draft class memory ---
  const finiteOvrs = allPlayers.map((p) => num(p?.ovr)).filter(Number.isFinite);
  if (finiteOvrs.length >= 500) {
    const avgOvr = finiteOvrs.reduce((sum, value) => sum + value, 0) / finiteOvrs.length;
    const eliteCount = finiteOvrs.filter((value) => value >= 90).length;
    if (avgOvr < 58 || avgOvr > 78 || eliteCount > teams.length * 2.5) {
      warn('league_talent_distribution_outlier', `League talent distribution looks unrealistic: avgOvr=${Math.round(avgOvr * 10) / 10}, elite90=${eliteCount}`);
      bumpSummary(summary, 'developmentHealth', 'warn');
    }
  }

  const rawTx = Array.isArray(input.transactions) ? input.transactions : [];
  if (rawTx.length > 5000) {
    fail('transactions_exploded', `Recent transaction sample unexpectedly huge (${rawTx.length})`);
    bumpSummary(summary, 'transactionHealth', 'fail');
  }
  for (const tx of rawTx.slice(0, 1000)) {
    if (tx?.playerId != null && !seenPlayerIds.has(String(tx.playerId)) && !String(tx?.type ?? '').toLowerCase().includes('draft')) {
      warn('transaction_orphan_player_ref', `Transaction ${tx?.id ?? 'unknown'} references missing player ${tx.playerId}`, { transactionId: tx?.id, playerId: tx.playerId });
      bumpSummary(summary, 'transactionHealth', 'warn');
    }
  }
  if (seasonIndex >= 2 && rawTx.length < 3) {
    warn('transactions_sparse', `Very few transactions (${rawTx.length}) after ${seasonIndex} seasons`);
    bumpSummary(summary, 'transactionHealth', 'warn');
  }

  try {
    const ctxNorm = {
      teams,
      teamsById: new Map(teams.map((t) => [Number(t.id), t])),
      players: allPlayers,
      playersById: new Map(allPlayers.map((p) => [Number(p.id), p])),
      year,
      phase: metaPhase,
    };
    for (const tx of rawTx.slice(0, 3000)) {
      try {
        normalizeRawTransaction(tx, ctxNorm);
      } catch (e) {
        fail('normalize_transaction_throw', e?.message || String(e));
        bumpSummary(summary, 'transactionHealth', 'fail');
      }
    }
    const draftTxs = rawTx.filter((t) => String(t?.type ?? '').toUpperCase() === 'DRAFT');
    const indexed = indexDraftClassesFromTransactions(rawTx, leagueHistory);
    const playersById = new Map(allPlayers.map((p) => [num(p.id), p]));
    for (const entry of indexed.slice(0, 10)) {
      const sid = entry.seasonId;
      const seasonYear = num(entry.year) || year;
      const seasonDraftTxs = draftTxs.filter((t) => String(t?.seasonId ?? '') === String(sid));
      const model = buildDraftClassModel({
        year: seasonYear,
        seasonId: sid,
        draftTransactions: seasonDraftTxs,
        playersById,
        currentLeagueYear: year,
        recordBook: viewState?.recordBook ?? null,
        archivedSeasons: leagueHistory,
        teams,
      });
      if (!model || typeof model !== 'object' || !Array.isArray(model.picks)) {
        fail('draft_class_model_shape', `buildDraftClassModel invalid for ${sid}`);
        bumpSummary(summary, 'draftHealth', 'fail');
      }
    }
    if (!indexed.length && seasonIndex >= 2 && draftTxs.length === 0) {
      warn('draft_class_index_empty', 'No DRAFT transactions found after multiple seasons');
      bumpSummary(summary, 'draftHealth', 'warn');
    }
  } catch (e) {
    fail('draft_index_throw', e?.message || String(e));
    bumpSummary(summary, 'draftHealth', 'fail');
  }

  const draftClasses = input.draftClassesPayload?.classes;
  if (Array.isArray(draftClasses) && seasonIndex >= 2 && draftClasses.length === 0) {
    warn('draft_classes_empty', 'GET_DRAFT_CLASSES returned no seasons after multiple sims');
    bumpSummary(summary, 'draftHealth', 'warn');
  }
  if (Array.isArray(draftClasses)) {
    for (const klass of draftClasses.slice(0, 20)) {
      if (!klass || typeof klass !== 'object' || !klass.seasonId) {
        fail('draft_class_shape', 'Draft class entry missing seasonId or object shape');
        bumpSummary(summary, 'draftHealth', 'fail');
      }
      const picks = Array.isArray(klass?.picks) ? klass.picks : Array.isArray(klass?.players) ? klass.players : [];
      const draftOvrs = picks.map((pick) => num(pick?.ovr ?? pick?.player?.ovr)).filter(Number.isFinite);
      if (draftOvrs.length >= 20) {
        const avgDraftOvr = draftOvrs.reduce((sum, value) => sum + value, 0) / draftOvrs.length;
        if (avgDraftOvr < 45 || avgDraftOvr > 82) {
          warn('draft_class_quality_outlier', `Draft class ${klass?.seasonId ?? 'unknown'} average OVR looks unrealistic (${Math.round(avgDraftOvr * 10) / 10})`);
          bumpSummary(summary, 'draftHealth', 'warn');
        }
      }
      for (const pick of picks.slice(0, 256)) {
        if (pick && typeof pick === 'object' && (pick.playerId == null && pick.id == null)) {
          fail('draft_class_player_broken', `Draft class ${klass?.seasonId ?? 'unknown'} contains a broken player/pick object`);
          bumpSummary(summary, 'draftHealth', 'fail');
        }
      }
    }
  }

  // --- GET payloads ---
  if (input.recordsPayload?.recordBook && isBadNum(num(input.recordsPayload.recordBook.schemaVersion))) {
    warn('records_payload_shape', 'recordBook in RECORDS payload looks odd');
    bumpSummary(summary, 'archiveHealth', 'warn');
  }
  if (input.hofPayload && !Array.isArray(input.hofPayload.players)) {
    fail('hof_payload_shape', 'HALL_OF_FAME.players must be an array when present');
    bumpSummary(summary, 'archiveHealth', 'fail');
  }

  // --- Scouting / development (sample, mutation check) ---
  const samplePlayers = allPlayers.slice(0, 25);
  for (const p of samplePlayers) {
    const snap = JSON.stringify({ ovr: p.ovr, age: p.age, pos: p.pos });
    try {
      buildPlayerDevelopmentModel(p, { team: teams.find((t) => Number(t.id) === Number(p.teamId)) });
    } catch (e) {
      fail('dev_model_throw', `buildPlayerDevelopmentModel: ${e?.message}`, { playerId: p.id });
      bumpSummary(summary, 'developmentHealth', 'fail');
    }
    if (JSON.stringify({ ovr: p.ovr, age: p.age, pos: p.pos }) !== snap) {
      fail('dev_model_mutated', 'buildPlayerDevelopmentModel mutated player fields', { playerId: p.id });
      bumpSummary(summary, 'developmentHealth', 'fail');
    }
  }

  const sparseProspect = {
    id: 'audit-sparse',
    pos: 'WR',
    name: 'Sparse',
    combineResults: {},
    interviewReport: {},
  };
  try {
    const rep = buildProspectScoutingReport(sparseProspect, {});
    if (rep?.confidence === 'high') {
      warn('scouting_sparse_confidence', 'Sparse prospect returned high confidence');
      bumpSummary(summary, 'scoutingHealth', 'warn');
    }
  } catch (e) {
    fail('scouting_throw', e?.message || String(e));
    bumpSummary(summary, 'scoutingHealth', 'fail');
  }

  for (const p of allPlayers.slice(0, 8)) {
    if (String(p?.pos).toUpperCase() !== 'QB') continue;
    const prospectLike = {
      id: p.id,
      pos: p.pos,
      name: p.name,
      ovr: num(p.ovr),
      potential: num(p.potential),
      combineResults: {},
      interviewReport: {},
    };
    const snap = JSON.stringify({ ovr: p.ovr, potential: p.potential });
    try {
      buildProspectScoutingReport(prospectLike, {});
    } catch (e) {
      fail('scouting_prospect_throw', e?.message || String(e));
      bumpSummary(summary, 'scoutingHealth', 'fail');
    }
    if (JSON.stringify({ ovr: p.ovr, potential: p.potential }) !== snap) {
      fail('scouting_mutated', 'buildProspectScoutingReport mutated prospect fields', { playerId: p.id });
      bumpSummary(summary, 'scoutingHealth', 'fail');
    }
  }

  const passed = failures.length === 0;
  const severity = failures.some((f) => /throw|crash|missing|nan|empty roster|impossible/i.test(f.code))
    ? 'error'
    : failures.length
      ? 'error'
      : warnings.length
        ? 'warn'
        : 'ok';

  const draftClassesForSummary = input.draftClassesPayload?.classes;
  const reportSummary = {
    seasonIndex,
    phase: metaPhase,
    year,
    teamCount: teams.length,
    teamsWithoutQb,
    archetypeDistribution: buildArchetypeDistribution(archetypes),
    transactionCountsByType: countTransactionTypes(rawTx),
    draftClassCount: Array.isArray(draftClassesForSummary) ? draftClassesForSummary.length : null,
    warningCount: warnings.length,
    failureCount: failures.length,
    failureCodes: failures.slice(0, 40).map((f) => f.code),
    warningCodesSample: warnings.slice(0, 30).map((w) => w.code),
    capStressedWarnings: warnings.filter((w) => w.code === 'cap_stressed').length,
    depthWarnings: warnings.filter((w) => String(w.code).startsWith('depth_')).length,
    economyRegressionSnapshot,
  };

  return {
    passed,
    severity,
    seasonsSimmed: seasonIndex,
    checks,
    warnings,
    failures,
    summary,
    reportSummary,
  };
}
