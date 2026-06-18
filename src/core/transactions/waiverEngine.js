/**
 * waiverEngine.js — Post-Deadline Waiver Wire System
 *
 * Pure module: no UI imports, no worker imports, no Math.random.
 * All functions are deterministic and immutable (no mutation of inputs).
 *
 * Waiver window: weeks 11-14 inclusive (post-trade deadline).
 */

// ── Helper ──────────────────────────────────────────────────────────────────

/**
 * Compute the cap hit for a contract.
 * capHit = baseAnnual + signingBonus / yearsTotal
 */
function capHit(contract) {
  if (!contract) return 0;
  const base = contract.baseAnnual ?? 0;
  const bonus = contract.signingBonus ?? 0;
  const years = contract.yearsTotal || 1;
  return base + bonus / years;
}

// ── isWaiverWindowOpen ───────────────────────────────────────────────────────

/**
 * Returns true if the waiver wire is open (weeks 11-14 inclusive).
 * @param {number} currentWeek
 * @returns {boolean}
 */
export function isWaiverWindowOpen(currentWeek) {
  const week = Number(currentWeek ?? 0);
  return week >= 11 && week <= 14;
}

// ── buildWaiverPriorityList ──────────────────────────────────────────────────

/**
 * Sort teams worst-to-best by:
 *  1. win percentage ascending (ties count as 0.5 win)
 *  2. tiebreaker: (ptsFor - ptsAgainst) ascending
 *  3. final stable tiebreaker: String(team.id) ascending
 *
 * Returns array of team IDs (same type as team.id).
 * @param {Array} teams
 * @returns {Array}
 */
export function buildWaiverPriorityList(teams) {
  if (!Array.isArray(teams) || teams.length === 0) return [];

  const sorted = [...teams].sort((a, b) => {
    const winsA = (a.wins ?? 0) + (a.ties ?? 0) * 0.5;
    const winsB = (b.wins ?? 0) + (b.ties ?? 0) * 0.5;
    const gamesA = (a.wins ?? 0) + (a.losses ?? 0) + (a.ties ?? 0);
    const gamesB = (b.wins ?? 0) + (b.losses ?? 0) + (b.ties ?? 0);
    const pctA = gamesA > 0 ? winsA / gamesA : 0;
    const pctB = gamesB > 0 ? winsB / gamesB : 0;

    if (pctA !== pctB) return pctA - pctB; // ascending (worst first)

    const diffA = (a.ptsFor ?? 0) - (a.ptsAgainst ?? 0);
    const diffB = (b.ptsFor ?? 0) - (b.ptsAgainst ?? 0);
    if (diffA !== diffB) return diffA - diffB; // ascending (worst first)

    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  });

  return sorted.map(t => t.id);
}

// ── sendPlayerToWaivers ──────────────────────────────────────────────────────

/**
 * Immutably update a player to go on waivers.
 * Sets waiverStatus, waiverWeekExpires, waiverContract, previousTeamId.
 * @param {Object} player
 * @param {number} currentWeek
 * @param {number|null} previousTeamId
 * @returns {Object} updated player (shallow copy)
 */
export function sendPlayerToWaivers(player, currentWeek, previousTeamId) {
  return {
    ...player,
    waiverStatus: 'ACTIVE',
    waiverWeekExpires: Number(currentWeek) + 1,
    waiverContract: player.contract ? { ...player.contract } : null,
    previousTeamId: previousTeamId ?? null,
  };
}

// ── canTeamClaimWaiverPlayer ─────────────────────────────────────────────────

/**
 * Returns true if the team has enough cap room to absorb the player's waiver contract.
 * If no waiverContract, always returns true.
 * @param {Object} team
 * @param {Object} player
 * @returns {boolean}
 */
export function canTeamClaimWaiverPlayer(team, player) {
  if (!player.waiverContract) return true;
  const hit = capHit(player.waiverContract);
  const room = team?.capRoom ?? 0;
  return room >= hit;
}

// ── submitWaiverClaim ────────────────────────────────────────────────────────

/**
 * Immutably add a claim to the claims array, unless a duplicate exists
 * (same playerId + teamId).
 * @param {Array} claims
 * @param {Object} claim — { playerId, teamId, ... }
 * @returns {Array} new claims array
 */
export function submitWaiverClaim(claims, claim) {
  const existing = Array.isArray(claims) ? claims : [];
  const dup = existing.some(
    c => String(c.playerId) === String(claim.playerId) && String(c.teamId) === String(claim.teamId)
  );
  if (dup) return existing;
  return [...existing, claim];
}

// ── findHighestPriorityClaim ─────────────────────────────────────────────────

/**
 * Find the claim whose teamId has the lowest index in waiverPriorityList.
 * Skip teams not in the priority list.
 * @param {Array} claims
 * @param {Array} waiverPriorityList — ordered array of team IDs
 * @returns {Object|null}
 */
export function findHighestPriorityClaim(claims, waiverPriorityList) {
  if (!Array.isArray(claims) || claims.length === 0) return null;
  if (!Array.isArray(waiverPriorityList) || waiverPriorityList.length === 0) return null;

  let bestClaim = null;
  let bestIndex = Infinity;

  for (const claim of claims) {
    const idx = waiverPriorityList.findIndex(id => String(id) === String(claim.teamId));
    if (idx === -1) continue; // not in priority list, skip
    if (idx < bestIndex) {
      bestIndex = idx;
      bestClaim = claim;
    }
  }

  return bestClaim;
}

// ── processWaivers ───────────────────────────────────────────────────────────

/**
 * Process all eligible waiver players (waiverStatus === 'ACTIVE' AND waiverWeekExpires <= currentWeek).
 * Immutable: returns new arrays, does not mutate inputs.
 *
 * @param {Object} params
 * @param {Array} params.players
 * @param {Array} params.teams
 * @param {Array} params.activeWaiverClaims
 * @param {Array} params.waiverPriorityList
 * @param {number} params.currentWeek
 * @returns {{ players, teams, waiverPriorityList, activeWaiverClaims, awards, clearances }}
 */
export function processWaivers({ players, teams, activeWaiverClaims, waiverPriorityList, currentWeek }) {
  const allPlayers = Array.isArray(players) ? players : [];
  const allTeams = Array.isArray(teams) ? teams : [];
  const claims = Array.isArray(activeWaiverClaims) ? activeWaiverClaims : [];
  const priorityList = Array.isArray(waiverPriorityList) ? [...waiverPriorityList] : [];
  const week = Number(currentWeek ?? 0);

  const awards = [];
  const clearances = [];
  const processedPlayerIds = new Set();
  const claimsToRemove = new Set();

  // Build a mutable map for player updates
  const playerUpdates = new Map(); // playerId -> patch

  // Identify eligible players
  const eligiblePlayers = allPlayers.filter(
    p => p.waiverStatus === 'ACTIVE' && Number(p.waiverWeekExpires ?? 0) <= week
  );

  for (const player of eligiblePlayers) {
    const playerId = player.id;
    processedPlayerIds.add(playerId);

    // Gather claims for this player
    const playerClaims = claims.filter(c => String(c.playerId) === String(playerId));

    // Mark all claims for this player as to-be-removed
    for (const c of playerClaims) {
      claimsToRemove.add(c);
    }

    // Find highest priority valid claimant
    const validClaims = playerClaims.filter(c => {
      const team = allTeams.find(t => String(t.id) === String(c.teamId));
      if (!team) return false;
      return canTeamClaimWaiverPlayer(team, player);
    });

    const winner = findHighestPriorityClaim(validClaims, priorityList);

    if (winner) {
      // Award player to winning team
      const winningTeam = allTeams.find(t => String(t.id) === String(winner.teamId));
      playerUpdates.set(playerId, {
        teamId: winner.teamId,
        status: 'active',
        contract: player.waiverContract ? { ...player.waiverContract } : player.contract,
        waiverStatus: null,
        waiverWeekExpires: null,
        waiverContract: null,
        previousTeamId: null,
      });

      awards.push({
        playerId,
        teamId: winner.teamId,
        playerName: player.name ?? String(playerId),
        teamName: winningTeam?.name ?? String(winner.teamId),
      });

      // Move winning team to bottom of priority list
      const winnerIdx = priorityList.findIndex(id => String(id) === String(winner.teamId));
      if (winnerIdx !== -1) {
        priorityList.splice(winnerIdx, 1);
        priorityList.push(winner.teamId);
      }
    } else {
      // Clear to free agent
      playerUpdates.set(playerId, {
        teamId: null,
        status: 'free_agent',
        waiverStatus: null,
        waiverWeekExpires: null,
        waiverContract: null,
        previousTeamId: null,
      });

      clearances.push({
        playerId,
        playerName: player.name ?? String(playerId),
      });
    }
  }

  // Build new players array (immutable)
  const newPlayers = allPlayers.map(p => {
    const patch = playerUpdates.get(p.id);
    if (!patch) return p;
    // Merge patch, removing null-valued keys to keep objects clean
    const merged = { ...p };
    for (const [key, val] of Object.entries(patch)) {
      if (val === null) {
        delete merged[key];
      } else {
        merged[key] = val;
      }
    }
    return merged;
  });

  // Remove processed claims
  const newClaims = claims.filter(c => !claimsToRemove.has(c));

  return {
    players: newPlayers,
    teams: allTeams,
    waiverPriorityList: priorityList,
    activeWaiverClaims: newClaims,
    awards,
    clearances,
  };
}

// ── shouldAIClaimWaiverPlayer ────────────────────────────────────────────────

/**
 * Returns true if an AI team should claim a waiver player.
 * Criteria:
 *  - player.ovr > starterOvr - 3 (player is better than current starter minus threshold)
 *  - canTeamClaimWaiverPlayer returns true
 *  - No existing claim from this team for this player
 *
 * Starter OVR = highest OVR player on team at same position, or 0 if none.
 *
 * @param {Object} team
 * @param {Object} player
 * @param {Object} leagueState — { players, teams, activeWaiverClaims }
 * @returns {boolean}
 */
export function shouldAIClaimWaiverPlayer(team, player, leagueState) {
  if (!team || !player) return false;

  // Check cap
  if (!canTeamClaimWaiverPlayer(team, player)) return false;

  // Check no existing claim
  const existingClaims = Array.isArray(leagueState?.activeWaiverClaims) ? leagueState.activeWaiverClaims : [];
  const hasClaim = existingClaims.some(
    c => String(c.playerId) === String(player.id) && String(c.teamId) === String(team.id)
  );
  if (hasClaim) return false;

  // Find starter OVR at player's position for this team
  const allPlayers = Array.isArray(leagueState?.players) ? leagueState.players : [];
  const teamPlayers = allPlayers.filter(p => String(p.teamId) === String(team.id) && p.pos === player.pos);
  const starterOvr = teamPlayers.reduce((best, p) => Math.max(best, p.ovr ?? 0), 0);

  // Player must be better than starter minus 3
  return (player.ovr ?? 0) > starterOvr - 3;
}

// ── generateAIWaiverClaims ───────────────────────────────────────────────────

/**
 * Deterministically generate AI waiver claims.
 * For each team in waiverPriorityList order (skip user team),
 * for each active waiver player: if shouldAIClaimWaiverPlayer, add claim.
 *
 * @param {Object} params
 * @param {Array} params.teams
 * @param {Array} params.players
 * @param {Array} params.waiverPriorityList
 * @param {Array} params.activeWaiverClaims
 * @param {number} params.currentWeek
 * @param {number|string} params.userTeamId
 * @returns {Array} new activeWaiverClaims array
 */
export function generateAIWaiverClaims({ teams, players, waiverPriorityList, activeWaiverClaims, currentWeek, userTeamId }) {
  const allPlayers = Array.isArray(players) ? players : [];
  const allTeams = Array.isArray(teams) ? teams : [];
  const priorityList = Array.isArray(waiverPriorityList) ? waiverPriorityList : [];
  let claims = Array.isArray(activeWaiverClaims) ? [...activeWaiverClaims] : [];

  // Get active waiver players
  const waiverPlayers = allPlayers.filter(p => p.waiverStatus === 'ACTIVE');
  if (waiverPlayers.length === 0) return claims;

  const leagueState = { players: allPlayers, teams: allTeams, activeWaiverClaims: claims };

  for (const teamId of priorityList) {
    // Skip user team
    if (String(teamId) === String(userTeamId)) continue;

    const team = allTeams.find(t => String(t.id) === String(teamId));
    if (!team) continue;

    for (const waiverPlayer of waiverPlayers) {
      // Use updated claims state for each check
      const currentLeagueState = { ...leagueState, activeWaiverClaims: claims };
      if (shouldAIClaimWaiverPlayer(team, waiverPlayer, currentLeagueState)) {
        const newClaim = {
          playerId: String(waiverPlayer.id),
          teamId: team.id,
          submittedWeek: Number(currentWeek),
          origin: 'ai',
        };
        claims = submitWaiverClaim(claims, newClaim);
      }
    }
  }

  return claims;
}
