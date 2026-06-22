/**
 * prestigeEngine.js — Pro Bowl & All-Pro Prestige Layer
 *
 * Pure, deterministic module. No Math.random, no UI imports, no worker imports.
 * All outputs are immutable new objects.
 *
 * Exported API:
 *   PRESTIGE_QUOTAS                     — per-position slot counts
 *   mapPlayerToPrestigePosition(player) → string|null
 *   computePrestigeScore(player)        → number|null
 *   rankPrestigeCandidates(players, teamResolver) → { QB, RB, WR, DL }
 *   selectAllProTeams(rankedCandidates, season) → honor[]
 *   selectProBowlTeams(rankedCandidates, season) → honor[]
 *   mergeHonorsIntoPlayers(players, assignments, season) → player[]
 *   buildSeasonHonorsSummary(players, assignments, teamResolver) → grouped UI data
 *   getPriorSeasonPrestigePremium(player, currentSeason) → { hasPremium, multiplier, type, priorSeason }
 */

export const PRESTIGE_QUOTAS = Object.freeze({
  allPro: Object.freeze({ QB: 2, RB: 2, WR: 2, DL: 2 }),
  proBowlPerConference: Object.freeze({ QB: 4, RB: 4, WR: 6, DL: 6 }),
});

const _HONOR_ACCOLADE_LABELS = Object.freeze({
  FIRST_TEAM_ALL_PRO: 'First-Team All-Pro',
  SECOND_TEAM_ALL_PRO: 'Second-Team All-Pro',
  PRO_BOWL: 'Pro Bowl Selection',
});

// ── Position mapping ──────────────────────────────────────────────────────────

/**
 * Map a player's raw position to a normalized prestige group.
 * Returns null for positions not covered in v1.
 *
 * @param {Object} player
 * @returns {'QB'|'RB'|'WR'|'DL'|null}
 */
export function mapPlayerToPrestigePosition(player) {
  const pos = String(player?.pos ?? '').toUpperCase();
  if (pos === 'QB') return 'QB';
  if (pos === 'RB' || pos === 'FB') return 'RB';
  if (pos === 'WR') return 'WR';
  if (pos === 'DL' || pos === 'DE' || pos === 'DT' || pos === 'EDGE') return 'DL';
  return null;
}

// ── Score computation ─────────────────────────────────────────────────────────

function _n(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Compute a stat-based prestige score for a player.
 *
 * Uses player.careerStats (most-recent or season-matched entry) for season
 * totals. Falls back to player.stats.season for unit-test fixtures that
 * don't carry a full careerStats array.
 *
 * careerStats keys: passYds, passTDs, ints, rushYds, rushTDs, recYds, recTDs,
 *                   receptions, sacks, tackles
 * stats.season keys: passYd, passTD, interceptions, rushYd, rushTD, recYd,
 *                    recTD, receptions, sacks, tackles
 *
 * @param {Object} player
 * @param {number|string} [seasonYear] - Match careerStats by season field if provided
 * @returns {number|null} Score, or null for unsupported positions
 */
export function computePrestigeScore(player, seasonYear) {
  const pos = mapPlayerToPrestigePosition(player);
  if (!pos) return null;

  const careerStats = Array.isArray(player?.careerStats) ? player.careerStats : [];

  let statLine = null;
  if (seasonYear != null && careerStats.length > 0) {
    statLine = careerStats.find(l => String(l.season) === String(seasonYear)) ?? null;
  }
  if (!statLine && careerStats.length > 0) {
    statLine = careerStats[careerStats.length - 1];
  }

  const raw = statLine ?? player?.stats?.season ?? {};

  const passYds = _n(raw.passYds ?? raw.passYd);
  const passTDs = _n(raw.passTDs ?? raw.passTD);
  const ints    = _n(raw.ints ?? raw.interceptions);
  const rushYds = _n(raw.rushYds ?? raw.rushYd);
  const rushTDs = _n(raw.rushTDs ?? raw.rushTD);
  const recYds  = _n(raw.recYds ?? raw.recYd);
  const recTDs  = _n(raw.recTDs ?? raw.recTD);
  const recs    = _n(raw.receptions);
  const tackles = _n(raw.tackles);
  const sacks   = _n(raw.sacks);

  if (pos === 'QB') {
    return (passYds * 0.1) + (passTDs * 4) - (ints * 2) + (rushYds * 0.1) + (rushTDs * 4);
  }
  if (pos === 'RB' || pos === 'WR') {
    const scrimmageYds = rushYds + recYds;
    const tds = rushTDs + recTDs;
    return (scrimmageYds * 0.1) + (tds * 6) + (recs * 0.5);
  }
  if (pos === 'DL') {
    return (sacks * 8) + (tackles * 0.5) + (ints * 6);
  }
  return null;
}

// ── Ranking ───────────────────────────────────────────────────────────────────

function _confNorm(conf) {
  if (conf === 0 || conf === 'AFC') return 0;
  if (conf === 1 || conf === 'NFC') return 1;
  return -1;
}

/**
 * Produce deterministic ranked candidate lists per prestige position group.
 * Sort order: score desc → OVR desc → id asc (string, for ties).
 *
 * @param {Object[]} players
 * @param {Function} teamResolver  (teamId) => team | null
 * @param {number|string} [seasonYear]
 * @returns {{ QB: Object[], RB: Object[], WR: Object[], DL: Object[] }}
 */
export function rankPrestigeCandidates(players, teamResolver, seasonYear) {
  const byPos = { QB: [], RB: [], WR: [], DL: [] };

  for (const player of (players ?? [])) {
    const presPos = mapPlayerToPrestigePosition(player);
    if (!presPos) continue;

    const score = computePrestigeScore(player, seasonYear);
    if (score === null) continue;

    const team = teamResolver ? teamResolver(player.teamId) : null;
    byPos[presPos].push({
      player,
      score,
      conf: _confNorm(team?.conf ?? null),
      teamId: player.teamId,
      teamName: team?.name ?? null,
      teamAbbr: team?.abbr ?? null,
    });
  }

  const _cmp = (a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const oA = Number(a.player.ovr ?? 0);
    const oB = Number(b.player.ovr ?? 0);
    if (oB !== oA) return oB - oA;
    return String(a.player.id).localeCompare(String(b.player.id));
  };

  for (const pos of Object.keys(byPos)) {
    byPos[pos] = [...byPos[pos]].sort(_cmp);
  }

  return byPos;
}

// ── All-Pro selection ─────────────────────────────────────────────────────────

/**
 * Select First-Team and Second-Team All-Pro from ranked candidates.
 * Positions ranked by score: top quota → FIRST_TEAM, next quota → SECOND_TEAM.
 *
 * @param {{ QB: Object[], RB: Object[], WR: Object[], DL: Object[] }} rankedCandidates
 * @param {number} season
 * @returns {Object[]} Honor assignment records
 */
export function selectAllProTeams(rankedCandidates, season) {
  const assignments = [];

  for (const [pos, quota] of Object.entries(PRESTIGE_QUOTAS.allPro)) {
    const candidates = rankedCandidates[pos] ?? [];
    const total = quota * 2;

    for (let i = 0; i < Math.min(candidates.length, total); i++) {
      const c = candidates[i];
      const type = i < quota ? 'FIRST_TEAM_ALL_PRO' : 'SECOND_TEAM_ALL_PRO';
      assignments.push({
        playerId: c.player.id,
        playerName: c.player.name,
        pos: c.player.pos,
        prestigePos: pos,
        teamId: c.teamId,
        teamName: c.teamName,
        teamAbbr: c.teamAbbr,
        type,
        year: season,
        score: c.score,
      });
    }
  }

  return assignments;
}

// ── Pro Bowl selection ────────────────────────────────────────────────────────

/**
 * Select Pro Bowl teams by conference and quota.
 * Uses the conf value from rankPrestigeCandidates (0=AFC, 1=NFC, -1=unknown).
 * Players with unknown conference are skipped.
 *
 * @param {{ QB: Object[], RB: Object[], WR: Object[], DL: Object[] }} rankedCandidates
 * @param {number} season
 * @returns {Object[]} Honor assignment records
 */
export function selectProBowlTeams(rankedCandidates, season) {
  const assignments = [];
  const seen = new Set();

  for (const [pos, quota] of Object.entries(PRESTIGE_QUOTAS.proBowlPerConference)) {
    const candidates = rankedCandidates[pos] ?? [];

    for (const confValue of [0, 1]) {
      const confLabel = confValue === 0 ? 'AFC' : 'NFC';
      const confCandidates = candidates.filter(c => c.conf === confValue);
      let filled = 0;

      for (const c of confCandidates) {
        if (filled >= quota) break;
        const key = `${String(c.player.id)}_${confValue}_PB`;
        if (seen.has(key)) continue;
        seen.add(key);
        assignments.push({
          playerId: c.player.id,
          playerName: c.player.name,
          pos: c.player.pos,
          prestigePos: pos,
          teamId: c.teamId,
          teamName: c.teamName,
          teamAbbr: c.teamAbbr,
          type: 'PRO_BOWL',
          year: season,
          conf: confValue,
          confLabel,
          score: c.score,
        });
        filled++;
      }
    }
  }

  return assignments;
}

// ── Honor merging ─────────────────────────────────────────────────────────────

/**
 * Append honor records and accolade objects to players.
 * Returns the same object reference when no changes needed (safe for ref-equality diff).
 * Rerun-safe: deduplicates by year+type.
 *
 * @param {Object[]} players
 * @param {Object[]} honorAssignments
 * @param {number} season
 * @returns {Object[]}
 */
export function mergeHonorsIntoPlayers(players, honorAssignments, season) {
  const honorsByPid = new Map();
  for (const ha of (honorAssignments ?? [])) {
    const pid = String(ha.playerId);
    if (!honorsByPid.has(pid)) honorsByPid.set(pid, []);
    honorsByPid.get(pid).push(ha);
  }

  return (players ?? []).map(player => {
    const pid = String(player.id);
    const newHonors = honorsByPid.get(pid);
    if (!newHonors?.length) return player;

    const existingHistory = Array.isArray(player.honorsHistory) ? player.honorsHistory : [];
    const historyKeys = new Set(existingHistory.map(h => `${h.year}_${h.type}`));

    const existingAccolades = Array.isArray(player.accolades) ? player.accolades : [];
    const accoladeKeys = new Set(existingAccolades.map(a => `${a?.type}_${a?.year}`));

    const addedHistory = [];
    const addedAccolades = [];

    for (const ha of newHonors) {
      const histKey = `${ha.year}_${ha.type}`;
      if (!historyKeys.has(histKey)) {
        historyKeys.add(histKey);
        addedHistory.push({ year: Number(ha.year), type: ha.type, teamId: ha.teamId });
      }

      const accKey = `${ha.type}_${ha.year}`;
      if (!accoladeKeys.has(accKey)) {
        accoladeKeys.add(accKey);
        addedAccolades.push({ type: ha.type, year: Number(ha.year), seasonId: ha.year });
      }
    }

    if (addedHistory.length === 0 && addedAccolades.length === 0) return player;

    return {
      ...player,
      honorsHistory: [...existingHistory, ...addedHistory],
      accolades: [...existingAccolades, ...addedAccolades],
    };
  });
}

// ── UI summary ────────────────────────────────────────────────────────────────

/**
 * Build a UI-friendly honor summary grouped by honor type and prestige position.
 *
 * @param {Object[]} players
 * @param {Object[]} honorAssignments
 * @param {Function} teamResolver
 * @returns {{ FIRST_TEAM_ALL_PRO: {[pos]: Object[]}, SECOND_TEAM_ALL_PRO: {}, PRO_BOWL: {} }}
 */
export function buildSeasonHonorsSummary(players, honorAssignments, teamResolver) {
  const playerById = new Map((players ?? []).map(p => [String(p.id), p]));

  const summary = { FIRST_TEAM_ALL_PRO: {}, SECOND_TEAM_ALL_PRO: {}, PRO_BOWL: {} };

  for (const ha of (honorAssignments ?? [])) {
    if (!summary[ha.type]) continue;

    const p = playerById.get(String(ha.playerId));
    const team = teamResolver ? teamResolver(ha.teamId) : null;
    const entry = {
      playerId: ha.playerId,
      playerName: p?.name ?? ha.playerName ?? 'Unknown',
      teamName: team?.name ?? ha.teamName ?? 'Unknown',
      teamAbbr: team?.abbr ?? ha.teamAbbr ?? null,
      pos: p?.pos ?? ha.pos ?? '',
      prestigePos: ha.prestigePos,
      score: ha.score,
    };

    const pp = ha.prestigePos;
    if (!summary[ha.type][pp]) summary[ha.type][pp] = [];
    summary[ha.type][pp].push(entry);
  }

  return summary;
}

// ── Contract leverage ─────────────────────────────────────────────────────────

/**
 * Returns a prestige premium descriptor for agent negotiation.
 *
 * Multipliers (applied to base fair-market salary):
 *   First-Team All-Pro  →  1.12  (+12%)
 *   Second-Team All-Pro →  1.06  (+6%)
 *   Pro Bowl            →  1.04  (+4%)
 *
 * @param {Object} player
 * @param {number} currentSeason
 * @returns {{ hasPremium: boolean, multiplier: number, type: string|null, priorSeason: number }}
 */
export function getPriorSeasonPrestigePremium(player, currentSeason) {
  const history = Array.isArray(player?.honorsHistory) ? player.honorsHistory : [];
  const priorSeason = Number(currentSeason) - 1;

  const priorHonors = history.filter(h => Number(h.year) === priorSeason);
  if (!priorHonors.length) {
    return { hasPremium: false, multiplier: 1.0, type: null, priorSeason };
  }

  const types = new Set(priorHonors.map(h => h.type));

  if (types.has('FIRST_TEAM_ALL_PRO')) {
    return { hasPremium: true, multiplier: 1.12, type: 'FIRST_TEAM_ALL_PRO', priorSeason };
  }
  if (types.has('SECOND_TEAM_ALL_PRO')) {
    return { hasPremium: true, multiplier: 1.06, type: 'SECOND_TEAM_ALL_PRO', priorSeason };
  }
  if (types.has('PRO_BOWL')) {
    return { hasPremium: true, multiplier: 1.04, type: 'PRO_BOWL', priorSeason };
  }

  return { hasPremium: false, multiplier: 1.0, type: null, priorSeason };
}
