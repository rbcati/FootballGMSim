/**
 * legacyEngine.js — Franchise Ring of Honor & Legacy Tracker Engine
 *
 * Pure module: no side effects, no UI/worker/DOM imports, no Math.random.
 * All functions are immutable — inputs are never mutated.
 *
 * Stored under:
 *   team.ringOfHonor           — inducted ROH members (array)
 *   team.allTimeLeaders        — franchise career stat leaders
 *   meta.pendingRohCandidates  — pending induction notifications for user team
 *
 * ROH member shape:
 *   { id, name, position, jerseyNumber, yearsPlayedWithTeam, careerGamesWithTeam,
 *     totalPassingYards, totalRushingYards, totalReceivingYards, totalSacks,
 *     accolades, inductionYear }
 *
 * All-time leaders entry shape:
 *   { name, value, playerId }
 */

// ── Private helpers ───────────────────────────────────────────────────────────

function num(v, fallback = 0) {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Count seasons a player spent with a franchise using the careerStats archive.
 * Each careerStats line stores the team abbreviation it was recorded for.
 */
function countSeasonsWithTeam(player, teamAbbr) {
  const careerStats = Array.isArray(player?.careerStats) ? player.careerStats : [];
  const seasons = new Set();
  for (const line of careerStats) {
    if (line?.team === teamAbbr && line?.season != null) {
      seasons.add(line.season);
    }
  }
  return seasons.size;
}

/**
 * Count career games played with a specific franchise.
 */
function countGamesWithTeam(player, teamAbbr) {
  const careerStats = Array.isArray(player?.careerStats) ? player.careerStats : [];
  let games = 0;
  for (const line of careerStats) {
    if (line?.team === teamAbbr) games += num(line.gamesPlayed, 0);
  }
  return games;
}

/**
 * Sum one or more stat keys from careerStats for a specific franchise.
 * Tries each key in order and uses the first non-zero value found per line.
 */
function sumStatWithTeam(player, teamAbbr, keys) {
  const careerStats = Array.isArray(player?.careerStats) ? player.careerStats : [];
  let total = 0;
  for (const line of careerStats) {
    if (line?.team !== teamAbbr) continue;
    for (const key of keys) {
      const v = num(line[key], 0);
      if (v !== 0) { total += v; break; }
    }
  }
  return total;
}

/**
 * Returns true if the player holds at least one major award or accolade.
 */
function hasMajorAccolade(player) {
  const MAJOR_KEYS = ['mvp', 'champion', 'superbowl', 'super_bowl', 'sbmvp', 'hof', 'allpro', 'all_pro', 'opoy', 'dpoy'];

  const awards = Array.isArray(player?.awards) ? player.awards : [];
  for (const a of awards) {
    const t = String(a?.key ?? a?.label ?? a?.type ?? '').toLowerCase();
    if (MAJOR_KEYS.some((k) => t.includes(k))) return true;
  }

  const accolades = Array.isArray(player?.accolades) ? player.accolades : [];
  for (const a of accolades) {
    const t = String(typeof a === 'string' ? a : (a?.type ?? a?.label ?? '')).toLowerCase();
    if (MAJOR_KEYS.some((k) => t.includes(k))) return true;
  }

  return Boolean(player?.hof);
}

/**
 * Collect accolades deterministically from a player's awards + accolades arrays.
 * Returns at most 4 human-readable bullets.
 */
function collectAccolades(player) {
  const out = new Set();

  const awards = Array.isArray(player?.awards) ? player.awards : [];
  for (const a of awards) {
    const t = String(a?.key ?? a?.label ?? a?.type ?? '').toLowerCase();
    const y = a?.year ?? a?.season ?? '';
    const label = (tag) => (y ? `${tag} (${y})` : tag);
    if (t.includes('mvp')) out.add(label('MVP'));
    else if (t.includes('champion') || t.includes('superbowl') || t.includes('super_bowl')) out.add(label('Champion'));
    else if (t.includes('opoy')) out.add(label('OPOY'));
    else if (t.includes('dpoy')) out.add(label('DPOY'));
    else if (t.includes('allpro') || t.includes('all_pro') || t.includes('all-pro')) out.add(label('All-Pro'));
    else if (t.includes('pro_bowl') || t.includes('probowl')) out.add(label('Pro Bowl'));
    else if (t.includes('hof')) out.add('Hall of Fame');
    else if (t.includes('roty')) out.add(label('ROTY'));
  }

  const accolades = Array.isArray(player?.accolades) ? player.accolades : [];
  for (const a of accolades) {
    if (typeof a === 'string') { out.add(a); continue; }
    const t = String(a?.type ?? a?.label ?? '');
    const y = a?.year ?? a?.season ?? '';
    if (t) out.add(y ? `${t} (${y})` : t);
  }

  if (player?.hof) out.add('Hall of Fame');

  return [...out].slice(0, 4);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the safe empty all-time leaders structure for a team.
 */
export function createDefaultTeamAllTimeLeaders() {
  return {
    passingYards:   null,
    rushingYards:   null,
    receivingYards: null,
    sacks:          null,
  };
}

/**
 * Returns true when a retiring player is eligible for Ring of Honor induction.
 *
 * Conditions (all must be met):
 *  1. Player belongs to the user's team (teamId === userTeamId)
 *  2. team.id === userTeamId (caller ensures correct team scope)
 *  3. Spent >= 5 seasons with the franchise (careerStats + current season)
 *  4. ovr >= 80 OR holds at least one major accolade / championship
 *
 * @param {Object} player       - Player object { id, teamId, ovr, careerStats, awards, accolades, hof }
 * @param {Object} team         - Team object { id, abbr }
 * @param {number} currentSeason
 * @param {number} userTeamId
 */
export function isEligibleForRingOfHonor(player, team, currentSeason, userTeamId) {
  if (!player || !team) return false;

  // Must be retiring from the user's team
  if (Number(player?.teamId) !== Number(userTeamId)) return false;
  if (Number(team?.id) !== Number(userTeamId)) return false;

  const teamAbbr = String(team?.abbr ?? '');
  const archivedSeasons = countSeasonsWithTeam(player, teamAbbr);

  // Credit current retiring season if it is not yet in careerStats
  const currentAlreadyArchived = (player?.careerStats ?? []).some(
    (l) => l?.season === currentSeason && l?.team === teamAbbr,
  );
  const totalSeasons = archivedSeasons + (currentAlreadyArchived ? 0 : 1);

  if (totalSeasons < 5) return false;

  const ovr = num(player?.ovr ?? player?.peakOvr, 0);
  if (ovr >= 80) return true;
  if (hasMajorAccolade(player)) return true;

  return false;
}

/**
 * Build a Ring of Honor member payload from a player retiring from a team.
 * Returns aggregate-only data — no weekly logs are copied.
 *
 * @param {Object} player      - { id, name, pos, careerStats, awards, accolades, hof, jerseyNumber }
 * @param {Object} team        - { id, abbr, name }
 * @param {number} inductionYear
 */
export function buildRingOfHonorMember(player, team, inductionYear) {
  const teamAbbr = String(team?.abbr ?? '');
  const careerStats = Array.isArray(player?.careerStats) ? player.careerStats : [];

  const seasonsWithTeam = [
    ...new Set(careerStats.filter((l) => l?.team === teamAbbr && l?.season != null).map((l) => l.season)),
  ].sort();

  const firstYear = seasonsWithTeam.length > 0 ? seasonsWithTeam[0] : inductionYear;
  const lastYear  = seasonsWithTeam.length > 0 ? seasonsWithTeam[seasonsWithTeam.length - 1] : inductionYear;
  const yearsPlayedWithTeam = seasonsWithTeam.length > 1 ? `${firstYear}–${lastYear}` : `${firstYear}`;

  const careerGamesWithTeam  = countGamesWithTeam(player, teamAbbr);
  const totalPassingYards    = sumStatWithTeam(player, teamAbbr, ['passYds', 'passYd']) || null;
  const totalRushingYards    = sumStatWithTeam(player, teamAbbr, ['rushYds', 'rushYd']) || null;
  const totalReceivingYards  = sumStatWithTeam(player, teamAbbr, ['recYds', 'recYd']) || null;
  const totalSacks           = sumStatWithTeam(player, teamAbbr, ['sacks']) || null;

  return {
    id:                  String(player?.id ?? ''),
    name:                String(player?.name ?? 'Unknown'),
    position:            String(player?.pos ?? player?.position ?? '??'),
    jerseyNumber:        player?.jerseyNumber ?? null,
    yearsPlayedWithTeam,
    careerGamesWithTeam,
    totalPassingYards,
    totalRushingYards,
    totalReceivingYards,
    totalSacks,
    accolades:           collectAccolades(player),
    inductionYear:       Number(inductionYear ?? 0),
  };
}

/**
 * Append a player to a team's Ring of Honor if not already inducted.
 * Returns a new team object; never mutates the input.
 * Sorted by inductionYear desc, then name asc.
 *
 * @param {Object} team
 * @param {Object} player
 * @param {number} inductionYear
 */
export function inductPlayerToRingOfHonor(team, player, inductionYear) {
  if (!team || !player) return team;

  const ringOfHonor = Array.isArray(team.ringOfHonor) ? team.ringOfHonor : [];
  const playerId = String(player?.id ?? '');

  if (ringOfHonor.some((m) => String(m?.id) === playerId)) return team;

  const member = buildRingOfHonorMember(player, team, inductionYear);
  const updated = [...ringOfHonor, member].sort((a, b) => {
    const yearDiff = num(b?.inductionYear, 0) - num(a?.inductionYear, 0);
    return yearDiff !== 0 ? yearDiff : String(a?.name ?? '').localeCompare(String(b?.name ?? ''));
  });

  return { ...team, ringOfHonor: updated };
}

/**
 * Compute franchise all-time career leaders for a specific team.
 * Scans all provided players; uses careerStats to extract team-split totals.
 *
 * Fallback: only players whose careerStats include at least one season for
 * this franchise are considered. Active roster + ROH members + retained
 * retired players with careerStats are all valid inputs.
 *
 * @param {Object[]} players - All players to scan
 * @param {Object}   team    - { id, abbr }
 */
export function computeTeamAllTimeLeaders(players, team) {
  const teamAbbr = String(team?.abbr ?? '');
  const result = createDefaultTeamAllTimeLeaders();

  const CATEGORIES = {
    passingYards:   ['passYds', 'passYd'],
    rushingYards:   ['rushYds', 'rushYd'],
    receivingYards: ['recYds', 'recYd'],
    sacks:          ['sacks'],
  };

  for (const [category, statKeys] of Object.entries(CATEGORIES)) {
    let best = null;
    for (const player of (players ?? [])) {
      if (!player) continue;
      const total = sumStatWithTeam(player, teamAbbr, statKeys);
      if (total <= 0) continue;
      if (!best || total > best.value) {
        best = {
          name:     String(player?.name ?? 'Unknown'),
          value:    total,
          playerId: String(player?.id ?? ''),
        };
      }
    }
    result[category] = best;
  }

  return result;
}

/**
 * Update all-time leaders for every team. Called once per season rollover.
 * Returns a new teams array — never mutates the input.
 *
 * @param {Object[]} teams   - All league teams
 * @param {Object[]} players - All players (active + retained retired)
 */
export function updateLeagueTeamAllTimeLeaders(teams, players) {
  if (!Array.isArray(teams)) return teams;
  return teams.map((team) => {
    if (!team) return team;
    return { ...team, allTimeLeaders: computeTeamAllTimeLeaders(players, team) };
  });
}

/**
 * Build a compact notification payload for the offseason UI induction prompt.
 *
 * @param {Object} player
 * @param {Object} team   - { id, abbr }
 */
export function buildRingOfHonorNotification(player, team) {
  const playerName = String(player?.name ?? 'Unknown');
  const teamAbbr = String(team?.abbr ?? '');
  const archivedSeasons = countSeasonsWithTeam(player, teamAbbr);
  const n = Math.max(archivedSeasons + 1, 1);

  return {
    playerId: String(player?.id ?? ''),
    teamId:   String(team?.id ?? ''),
    title:    'Ring of Honor Candidate',
    body:     `${playerName} retired after ${n} season${n !== 1 ? 's' : ''} with the franchise. Induct him into the Ring of Honor?`,
  };
}
