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
 * @returns {{ allOk: boolean, assertions: { id: string, ok: boolean, detail: string }[] }}
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

  assertions.push({
    id: 'latest_season_archive',
    ok: !!(latest && latest.id),
    detail: latest?.id ? `latest season id=${latest.id}` : 'leagueHistory missing or empty',
  });

  if (Array.isArray(input.allSeasons) && latestSeasonId != null) {
    const found = input.allSeasons.some((season) => hasSeasonId(season, latestSeasonId));
    assertions.push({
      id: 'get_all_seasons_latest',
      ok: found,
      detail: found
        ? `GET_ALL_SEASONS includes latest season ${latestSeasonId}`
        : `GET_ALL_SEASONS missing latest season ${latestSeasonId}`,
    });
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

  const hasTx = Array.isArray(input.transactionsRecent) && input.transactionsRecent.length > 0;
  assertions.push({
    id: 'transactions_recent_available',
    ok: hasTx || !input.expectTransactions,
    detail: hasTx
      ? `${input.transactionsRecent.length} recent rows`
      : input.expectTransactions
        ? 'no transactions in recent strip but activity expected'
        : 'no recent transactions (ok if none expected)',
  });

  if (input.seasonTxQueryOk != null) {
    assertions.push({
      id: 'get_transactions_by_season',
      ok: !!input.seasonTxQueryOk,
      detail: input.seasonTxQueryOk ? 'GET_TRANSACTIONS by season ok' : 'GET_TRANSACTIONS by season failed',
    });
  }

  const statsShape = validatePlayerSeasonStatsV1Shape(latest?.playerSeasonStatsV1);
  const statsRows = latest?.playerSeasonStatsV1?.rows;
  const hasStatsRows = Array.isArray(statsRows) && statsRows.length > 0;
  assertions.push({
    id: 'player_season_stats_v1',
    ok: statsShape.ok && (!input.expectStatRows || hasStatsRows),
    detail: statsShape.ok
      ? hasStatsRows
        ? `${statsRows.length} stat rows`
        : 'archive present, no stat rows (ok early-season)'
      : statsShape.errors.join('; '),
  });

  const tvShape = validateTransactionTimelineV1Shape(latest?.transactionTimelineV1);
  const tvRows = latest?.transactionTimelineV1?.rows;
  const hasTxRows = Array.isArray(tvRows) && tvRows.length > 0;
  assertions.push({
    id: 'transaction_timeline_v1',
    ok: tvShape.ok && (!input.expectTimelineRows || hasTxRows),
    detail: tvShape.ok
      ? hasTxRows
        ? `${tvRows.length} timeline rows`
        : 'timeline object ok, empty rows'
      : tvShape.errors.join('; '),
  });

  assertions.push({
    id: 'get_season_history',
    ok: input.getSeasonHistoryOk !== false,
    detail:
      input.getSeasonHistorySkipped
        ? 'skipped (shallow probe mode)'
        : input.getSeasonHistoryOk
          ? 'GET_SEASON_HISTORY returned data'
          : 'GET_SEASON_HISTORY failed or empty',
  });

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

  assertions.push({
    id: 'get_records',
    ok: input.recordsProbeOk !== false,
    detail:
      input.recordsProbeSkipped
        ? 'skipped (shallow probe mode)'
        : input.recordsProbeOk
          ? 'GET_RECORDS ok'
          : 'GET_RECORDS missing recordBook',
  });

  assertions.push({
    id: 'get_hall_of_fame',
    ok: input.hofProbeOk !== false,
    detail:
      input.hofProbeSkipped
        ? 'skipped (shallow probe mode)'
        : input.hofProbeOk
          ? 'GET_HALL_OF_FAME ok'
          : 'GET_HALL_OF_FAME invalid shape',
  });

  assertions.push({
    id: 'get_draft_classes',
    ok: input.draftClassesProbeOk !== false,
    detail:
      input.draftClassesProbeSkipped
        ? 'skipped (shallow probe mode)'
        : input.draftClassesProbeOk
          ? `GET_DRAFT_CLASSES count=${input.draftClassCount ?? 0}`
          : 'GET_DRAFT_CLASSES invalid',
  });

  return { allOk: assertions.every((a) => a.ok), assertions };
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
      if (p && typeof p === 'object') out.push({ ...p, teamId: p.teamId ?? t.id });
    }
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

  // --- Roster / cap / AI strategy ---
  let teamsWithoutQb = 0;
  const archetypes = [];
  for (const team of teams) {
    const tid = team?.id;
    const roster = Array.isArray(team?.roster) ? team.roster : [];
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
  const latest = latestCompletedSeasonSummary(leagueHistory);
  if (latest && seasonIndex > 0) {
    if (!latest.champion && (latest.standings?.length ?? 0) > 0) {
      fail('champion_missing', 'Latest leagueHistory entry has standings but no champion', { seasonId: latest.seasonId });
      bumpSummary(summary, 'historyHealth', 'fail');
    }
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

  // --- Transactions + draft class memory ---
  const rawTx = Array.isArray(input.transactions) ? input.transactions : [];
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
