/**
 * historyEngine.js — League History Ledger & Record Book Engine
 *
 * Pure module: no side effects, no UI/worker imports, no randomness.
 * All functions are immutable — inputs are never mutated.
 *
 * Stored under:
 *   meta.historyLedger          — year-by-year champion/awards summary rows
 *   meta.recordBook.singleGame       — all-time single-game record holders (4 metrics)
 *   meta.recordBook.singleSeasonBests — all-time single-season record holders (4 metrics)
 *
 * Record holder entry shape:
 *   { id, playerName, position, metricValue, yearAchieved, teamNameAtTime }
 *
 * Ledger entry shape:
 *   { year, championTeamId, championName, runnerUpName, superBowlScore,
 *     mvpName, opoyName, dpoyName }
 */

// ── Metric definitions ────────────────────────────────────────────────────────

const METRICS = ['passingYards', 'passingTds', 'rushingYards', 'sacks'];

/**
 * Read a metric value from a flat stats object (handles both alias keys).
 * Stats object can be flat (passYd, passTD, ...) or nested under .stats.
 */
function readMetricFromStats(obj, metric) {
  const s = obj?.stats ?? obj;
  switch (metric) {
    case 'passingYards':  return Number(s?.passYd  ?? s?.passingYards  ?? 0);
    case 'passingTds':    return Number(s?.passTD  ?? s?.passingTds    ?? 0);
    case 'rushingYards':  return Number(s?.rushYd  ?? s?.rushingYards  ?? 0);
    case 'sacks':         return Number(s?.sacks   ?? 0);
    default:              return 0;
  }
}

/**
 * Build a record holder entry from a stat line + context.
 * statLine: { playerId|id, playerName|name, position|pos, [stats:{}] }
 * context:  { season, teamName }
 */
function makeHolder(statLine, metricValue, context) {
  return {
    id: String(statLine.playerId ?? statLine.id ?? ''),
    playerName: String(statLine.playerName ?? statLine.name ?? 'Unknown'),
    position: String(statLine.position ?? statLine.pos ?? '??'),
    metricValue,
    yearAchieved: Number(context?.season ?? 0),
    teamNameAtTime: String(context?.teamName ?? 'Unknown'),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the safe initial record book shape.
 * Null holders indicate no record has been set yet.
 * Uses singleSeasonBests (not singleSeason) to avoid colliding with the
 * existing V1 record book's singleSeason key.
 */
export function createDefaultRecordBook() {
  return {
    singleGame: {
      passingYards: null,
      passingTds: null,
      rushingYards: null,
      sacks: null,
    },
    singleSeasonBests: {
      passingYards: null,
      passingTds: null,
      rushingYards: null,
      sacks: null,
    },
  };
}

/**
 * Build a single ledger entry from championship result and awards.
 *
 * championshipResult: { championTeamId, championName, runnerUpName,
 *                       homeScore|scoreHome, awayScore|scoreAway }
 * awards:            { mvpName, opoyName, dpoyName }
 *
 * Gracefully returns 'Unknown' / '—' for any missing field.
 */
export function buildLeagueYearSummary({ season, championshipResult, awards } = {}) {
  const c = championshipResult ?? {};
  const a = awards ?? {};

  const homeScore = c.homeScore ?? c.scoreHome ?? null;
  const awayScore = c.awayScore ?? c.scoreAway ?? null;
  const superBowlScore = (homeScore != null && awayScore != null)
    ? `${Math.max(Number(homeScore), Number(awayScore))}-${Math.min(Number(homeScore), Number(awayScore))}`
    : '—';

  return {
    year: Number(season ?? 0),
    championTeamId: c.championTeamId ?? null,
    championName: String(c.championName ?? 'Unknown'),
    runnerUpName: String(c.runnerUpName ?? 'Unknown'),
    superBowlScore,
    mvpName: String(a.mvpName ?? 'Unknown'),
    opoyName: String(a.opoyName ?? 'Unknown'),
    dpoyName: String(a.dpoyName ?? 'Unknown'),
  };
}

/**
 * Check one player game stat line against existing single-game records.
 * Returns a new recordBook if any record was broken, or the same reference.
 *
 * statLine: { playerId|id, playerName|name, position|pos, [stats:{}], ...flatStats }
 * context:  { season, teamName }
 */
export function maybeUpdateSingleGameRecord(recordBook, statLine, context) {
  if (!statLine) return recordBook;
  const sg = (recordBook?.singleGame) ?? {};
  let changed = false;
  const newSg = { ...sg };

  for (const metric of METRICS) {
    const value = readMetricFromStats(statLine, metric);
    if (value <= 0) continue;
    const current = sg[metric];
    if (!current || value > current.metricValue) {
      newSg[metric] = makeHolder(statLine, value, context);
      changed = true;
    }
  }

  if (!changed) return recordBook;
  return { ...recordBook, singleGame: newSg };
}

/**
 * Process all stat lines from a completed game/week batch.
 * contextResolver(statLine) → { season, teamName }
 */
export function updateSingleGameRecordsFromBatch(recordBook, completedGameStatLines, contextResolver) {
  let current = recordBook;
  for (const statLine of (completedGameStatLines ?? [])) {
    const context = contextResolver ? contextResolver(statLine) : {};
    current = maybeUpdateSingleGameRecord(current, statLine, context);
  }
  return current;
}

/**
 * Check one player's season totals against existing single-season bests.
 * Returns a new recordBook if any best was beaten.
 *
 * playerSeasonTotals: { playerId|id, playerName|name, position|pos, [stats:{}], ...flatStats }
 * context:  { season, teamName }
 */
export function maybeUpdateSingleSeasonRecord(recordBook, playerSeasonTotals, context) {
  if (!playerSeasonTotals) return recordBook;
  const ss = (recordBook?.singleSeasonBests) ?? {};
  let changed = false;
  const newSs = { ...ss };

  for (const metric of METRICS) {
    const value = readMetricFromStats(playerSeasonTotals, metric);
    if (value <= 0) continue;
    const current = ss[metric];
    if (!current || value > current.metricValue) {
      newSs[metric] = makeHolder(playerSeasonTotals, value, context);
      changed = true;
    }
  }

  if (!changed) return recordBook;
  return { ...recordBook, singleSeasonBests: newSs };
}

/**
 * Scan all active players at season transition and update single-season bests.
 *
 * players: array of player objects with .id, .name, .pos, .teamId, .stats.season
 * teamNameResolver(teamId) → string team name
 */
export function updateSingleSeasonRecords(recordBook, players, season, teamNameResolver) {
  let current = recordBook;
  for (const player of (players ?? [])) {
    if (!player) continue;
    const seasonStats = player?.stats?.season ?? {};
    const teamName = teamNameResolver ? teamNameResolver(player.teamId) : 'Unknown';
    const statEntry = {
      playerId: player.id,
      playerName: player.name,
      position: player.pos,
      stats: seasonStats,
    };
    current = maybeUpdateSingleSeasonRecord(current, statEntry, { season, teamName });
  }
  return current;
}

/**
 * Append a year summary to the history ledger in chronological order.
 * Replaces any existing entry for the same year (idempotent re-runs).
 * Returns a new array (never mutates input).
 */
export function appendHistoryLedger(historyLedger, yearSummary) {
  const arr = Array.isArray(historyLedger) ? historyLedger : [];
  const year = yearSummary?.year ?? null;
  const filtered = year != null ? arr.filter(e => e?.year !== year) : arr;
  return [...filtered, yearSummary].sort((a, b) => (a?.year ?? 0) - (b?.year ?? 0));
}

/**
 * Returns true if a retired player's history should be retained in full.
 * True for award winners, HOF players, All-Pro recipients, or current record holders.
 */
export function shouldRetainRetiredPlayerHistory(player, recordBook) {
  if (!player) return false;

  // Retain if player holds any award
  if (Array.isArray(player.awards) && player.awards.length > 0) return true;

  // Retain if HOF nominated or inducted
  const hofStatus = String(player.hofStatus ?? '');
  if (player.hof === true || hofStatus === 'inducted' || hofStatus === 'nominee') return true;

  // Retain if marked as a current record holder in the historyEngine record book
  const pidStr = String(player.id ?? '');
  if (pidStr) {
    const sg = recordBook?.singleGame ?? {};
    const ss = recordBook?.singleSeasonBests ?? {};
    for (const metric of METRICS) {
      if (sg[metric] && String(sg[metric].id) === pidStr) return true;
      if (ss[metric] && String(ss[metric].id) === pidStr) return true;
    }
  }

  // Retain if has All-Pro, Pro Bowl, or championship accolades
  if (Array.isArray(player.accolades)) {
    for (const a of player.accolades) {
      const t = String(a?.type ?? '').toLowerCase();
      if (t.includes('all') || t.includes('pro') || t.includes('hof') || t.includes('champion')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Strip bulky history payloads from low-impact retired players.
 * Conservative: only removes gameLogs if present; identity, awards,
 * contract, and HOF data are always preserved.
 * Returns a new array (never mutates input).
 *
 * The current repo schema does not attach bulky gameLogs to retired players,
 * so this is mostly a safe no-op; it acts as future-proofing.
 */
export function compactRetiredPlayerHistory(players, recordBook) {
  if (!Array.isArray(players)) return players;
  return players.map(player => {
    if (!player) return player;
    if (shouldRetainRetiredPlayerHistory(player, recordBook)) return player;
    const ovr = Number(player?.ovr ?? player?.peakOvr ?? 80);
    if (ovr >= 78) return player;
    // Only strip genuinely bulky payload arrays that can accumulate
    if (!player.gameLogs && !player.detailedGameHistory) return player;
    const { gameLogs, detailedGameHistory, ...rest } = player;
    return rest;
  });
}
