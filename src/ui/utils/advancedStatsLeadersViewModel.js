/**
 * advancedStatsLeadersViewModel.js
 * Pure helper: build league-wide Advanced Stats leaderboards from
 * playerSeasonStatsArchive.  Never mutates inputs.
 */

const ADVANCED_STAT_KEYS = [
  'targets',
  'drops',
  'battedPasses',
  'coverageTargets',
  'coverageCompletionsAllowed',
  'receptionsAllowed',
  'sacksAllowed',
  'sacksMade',
];

const INTERNAL_KEYS = new Set(['__meta', 'meta', 'archivedGameIds']);

export const ADVANCED_LEADER_DEFS = [
  { statKey: 'targets',                   statLabel: 'Targets' },
  { statKey: 'drops',                     statLabel: 'Drops' },
  { statKey: 'battedPasses',              statLabel: 'Batted Passes' },
  { statKey: 'coverageTargets',           statLabel: 'Coverage Targets' },
  { statKey: 'coverageCompletionsAllowed', statLabel: 'Cov Comp Allowed' },
  { statKey: 'receptionsAllowed',         statLabel: 'Receptions Allowed' },
  { statKey: 'sacksAllowed',              statLabel: 'Sacks Allowed' },
  { statKey: 'sacksMade',                 statLabel: 'Sacks Made' },
];

function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isRecord(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function isInternalKey(key) {
  return INTERNAL_KEYS.has(String(key));
}

function resolveTeamAbbr(teams, teamId) {
  if (teamId == null || !Array.isArray(teams)) return null;
  const team = teams.find((t) => Number(t?.id) === Number(teamId));
  return team?.abbr ?? null;
}

function buildPlayerLookup(players, teams) {
  const map = new Map();
  const playerList = Array.isArray(players) ? players : [];
  for (const p of playerList) {
    if (!p) continue;
    const pid = p.id ?? p.playerId;
    if (pid == null) continue;
    const teamId = p.teamId != null ? Number(p.teamId) : null;
    const teamAbbr = p.teamAbbr ?? resolveTeamAbbr(teams, teamId);
    map.set(String(pid), {
      name: p.name ?? p.playerName ?? null,
      pos: p.pos ?? p.position ?? null,
      teamId,
      teamAbbr,
    });
  }
  return map;
}

/**
 * Build league-wide advanced stats leaderboards from playerSeasonStatsArchive.
 *
 * @param {{ archive: object, players?: object[], teams?: object[], season?: string|number|null, maxRows?: number }} opts
 * @returns {{ hasData: boolean, leaderboards: { [statKey]: LeaderRow[] } }}
 */
export function buildAdvancedStatsLeadersView({
  archive,
  players = [],
  teams = [],
  season = null,
  maxRows = 10,
} = {}) {
  if (!isRecord(archive)) return { hasData: false, leaderboards: {} };

  const playerLookup = buildPlayerLookup(players, teams);
  const teamList = Array.isArray(teams) ? teams : [];
  const cap = Math.max(1, Number.isFinite(Number(maxRows)) ? Number(maxRows) : 10);
  const seasonFilter = season != null ? String(season) : null;

  // Accumulate career (or single-season) totals per player — no mutation of archive.
  const careerMap = new Map();

  for (const [rawPid, playerYears] of Object.entries(archive)) {
    if (isInternalKey(rawPid)) continue;
    if (!isRecord(playerYears)) continue;

    const pid = String(rawPid);
    const info = playerLookup.get(pid) ?? { name: null, pos: null, teamId: null, teamAbbr: null };

    const stats = {};
    for (const key of ADVANCED_STAT_KEYS) stats[key] = 0;

    for (const [seasonKey, rawStats] of Object.entries(playerYears)) {
      if (isInternalKey(seasonKey)) continue;
      if (!isRecord(rawStats)) continue;
      if (seasonFilter !== null && String(seasonKey) !== seasonFilter) continue;

      for (const key of ADVANCED_STAT_KEYS) {
        stats[key] += num(rawStats[key]);
      }
    }

    careerMap.set(pid, { pid, ...info, ...stats });
  }

  if (careerMap.size === 0) return { hasData: false, leaderboards: {} };

  const leaderboards = {};
  let anyNonZero = false;

  for (const { statKey, statLabel } of ADVANCED_LEADER_DEFS) {
    const sorted = [...careerMap.values()]
      .filter((entry) => num(entry[statKey]) > 0)
      .sort((a, b) => {
        const diff = num(b[statKey]) - num(a[statKey]);
        if (diff !== 0) return diff;
        // Deterministic tie-break: alphabetical by name, then by pid
        const nameDiff = String(a.name ?? a.pid).localeCompare(String(b.name ?? b.pid));
        if (nameDiff !== 0) return nameDiff;
        return String(a.pid).localeCompare(String(b.pid));
      });

    if (sorted.length > 0) anyNonZero = true;

    leaderboards[statKey] = sorted.slice(0, cap).map((entry, i) => ({
      rank: i + 1,
      playerId: entry.pid,
      playerName: entry.name ?? '—',
      pos: entry.pos ?? '—',
      teamAbbr: entry.teamAbbr ?? (entry.teamId != null ? resolveTeamAbbr(teamList, entry.teamId) : null) ?? '—',
      teamId: entry.teamId ?? null,
      statKey,
      statLabel,
      value: num(entry[statKey]),
    }));
  }

  return { hasData: anyNonZero, leaderboards };
}
