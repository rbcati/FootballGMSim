/**
 * trade-logic.js
 *
 * AI-to-AI Trade Engine (Phase 22).
 *
 * Architecture:
 *  1. Asset Valuation  — every player gets a "Value Score":
 *       (OVR * 1.5) + (POT * 0.5) - (Age * 2)
 *  2. Need Detection   — a team has a "need" at a position if its starter
 *       OVR is below 75 or a starter slot is empty.
 *  3. Surplus Detection — a team has a "surplus" at a position when it has
 *       more depth than required AND the surplus player is valuable (≥ 70 OVR).
 *  4. Matching         — scan pairs of AI teams; if Team A's surplus covers
 *       Team B's need AND Team B's surplus covers Team A's need, AND the
 *       trade values are within ±10%, execute the deal.
 *  5. News logging     — every trade fires a TRANSACTION news item:
 *       "Trade: [Team A] acquires [Player X] from [Team B] for [Player Y]."
 *
 * Guardrails:
 *  - User team is NEVER involved (that's the user-facing Trade Center).
 *  - Max 2 trades execute per week to keep the News Feed readable.
 *  - Only runs during the regular season (phase === 'regular').
 *  - A player must have OVR ≥ 70 to be traded (no junk trades).
 */

import { cache }        from '../db/cache.js';
import { Transactions } from '../db/index.js';
import NewsEngine       from './news-engine.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Starter counts per position (mirrors LEAGUE_GEN_CONFIG.STARTERS_COUNT). */
const STARTERS = {
  QB: 1, RB: 2, WR: 3, TE: 1, OL: 5,
  DL: 4, LB: 3, CB: 2, S: 2, K: 1, P: 1,
};

/** Positions considered for trade matching (skip K/P — too specialised). */
const TRADEABLE_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S'];

/** OVR below which a starting slot is considered a "need". */
const STARTER_NEED_THRESHOLD = 75;

/** Minimum OVR a player must have to be included in a trade. */
const MIN_TRADE_OVR = 70;

/** Max trades executed per week (keeps the News Feed manageable). */
const MAX_TRADES_PER_WEEK = 2;

/** Value ratio tolerance (±10 % of fair value). */
const VALUE_TOLERANCE = 0.10;

// ── Asset Valuation ───────────────────────────────────────────────────────────

/**
 * Calculate a player's trade value score.
 * Formula: (OVR × 1.5) + (POT × 0.5) − (Age × 2)
 *
 * @param {object} player  – player object from cache
 * @returns {number}
 */
export function calculatePlayerValue(player) {
  const ovr = player.ovr      ?? 60;
  const pot = player.potential ?? player.ovr ?? 60;
  const age = player.age      ?? 26;
  return (ovr * 1.5) + (pot * 0.5) - (age * 2);
}

// ── Roster Analysis ───────────────────────────────────────────────────────────

/** Group a team's players by position, sorted OVR descending. */
function rosterByPosition(teamId) {
  const byPos = {};
  for (const p of cache.getPlayersByTeam(teamId)) {
    if (!byPos[p.pos]) byPos[p.pos] = [];
    byPos[p.pos].push(p);
  }
  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
  }
  return byPos;
}

/**
 * Return an array of { pos, player, value } objects for every player that is
 * a "surplus" — i.e. they sit beyond the required starter count at a position
 * that already has a solid starter (OVR ≥ STARTER_NEED_THRESHOLD).
 */
function getSurplusPlayers(teamId) {
  const byPos = rosterByPosition(teamId);
  const surpluses = [];

  for (const pos of TRADEABLE_POSITIONS) {
    const players     = byPos[pos] ?? [];
    const starterCount = STARTERS[pos] ?? 1;

    // The top starter must be solid enough that the team can afford to trade depth.
    const topStarter = players[0];
    if (!topStarter || (topStarter.ovr ?? 0) < STARTER_NEED_THRESHOLD) continue;

    // Depth players beyond the required starters are trade candidates.
    const depth = players.slice(starterCount);
    for (const p of depth) {
      if ((p.ovr ?? 0) < MIN_TRADE_OVR) continue;  // don't trade scrubs
      surpluses.push({ pos, player: p, value: calculatePlayerValue(p) });
    }
  }

  return surpluses;
}

/**
 * Return an array of { pos, urgency } objects for positions where the team
 * is weak.  Higher urgency = more desperate need.
 */
function getTeamNeeds(teamId) {
  const byPos = rosterByPosition(teamId);
  const needs = [];

  for (const pos of TRADEABLE_POSITIONS) {
    const players     = byPos[pos] ?? [];
    const starterCount = STARTERS[pos] ?? 1;

    // Count filled starter slots
    const filledStarters = players.slice(0, starterCount);
    const missing = starterCount - filledStarters.length;

    if (missing > 0) {
      // Empty starter slot — highest urgency
      needs.push({ pos, urgency: 20 + missing * 10 });
      continue;
    }

    // All starter slots filled — check if quality is below threshold
    const avgOvr = filledStarters.reduce((s, p) => s + (p.ovr ?? 0), 0) / filledStarters.length;
    if (avgOvr < STARTER_NEED_THRESHOLD) {
      needs.push({ pos, urgency: Math.round(STARTER_NEED_THRESHOLD - avgOvr) });
    }
  }

  return needs.sort((a, b) => b.urgency - a.urgency);
}

// ── Trade Execution ───────────────────────────────────────────────────────────

/**
 * Execute a 1-for-1 player swap between two AI teams and log the news.
 *
 * @param {number} teamAId   – team trading playerA away
 * @param {object} playerA   – player from Team A going to Team B
 * @param {number} teamBId   – team trading playerB away
 * @param {object} playerB   – player from Team B going to Team A
 */
async function executeTrade(teamAId, playerA, teamBId, playerB) {
  const meta  = cache.getMeta();
  const teamA = cache.getTeam(teamAId);
  const teamB = cache.getTeam(teamBId);
  if (!teamA || !teamB) return;

  // Swap team assignments in the cache.
  cache.updatePlayer(playerA.id, { teamId: teamBId });
  cache.updatePlayer(playerB.id, { teamId: teamAId });

  // Record transactions (one entry per team).
  const txBase = {
    type:     'TRADE',
    seasonId: meta.currentSeasonId,
    week:     meta.currentWeek,
  };
  await Transactions.add({
    ...txBase,
    teamId:  teamAId,
    details: { playerId: playerA.id, direction: 'sent',     toTeam:   teamBId, receivedPlayerId: playerB.id },
  });
  await Transactions.add({
    ...txBase,
    teamId:  teamBId,
    details: { playerId: playerB.id, direction: 'sent',     toTeam:   teamAId, receivedPlayerId: playerA.id },
  });

  // News item: "Trade: [Team A] acquires [Player X] from [Team B] for [Player Y]."
  const text =
    `Trade: ${teamA.abbr} acquires ${playerB.pos} ${playerB.name} ` +
    `from ${teamB.abbr} for ${playerA.pos} ${playerA.name}.`;

  await NewsEngine.logNews('TRANSACTION', text, null, {
    tradeTeamA:       teamAId,
    tradeTeamB:       teamBId,
    tradePlayerSent:  playerA.id,
    tradePlayerRcvd:  playerB.id,
  });
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Scan all AI teams for mutually beneficial 1-for-1 trades and execute up to
 * MAX_TRADES_PER_WEEK deals.  Called from handleAdvanceWeek in worker.js.
 *
 * Design notes:
 *  - Only runs during the regular season.
 *  - User team is never touched.
 *  - Trades are only executed when values are within ±VALUE_TOLERANCE.
 *  - Team order is randomised each week so all teams get equal opportunities.
 */
export async function runAIToAITrades() {
  const meta = cache.getMeta();
  if (!meta || meta.phase !== 'regular') return;

  const userTeamId  = meta.userTeamId;
  const allTeams    = cache.getAllTeams().filter(t => t.id !== userTeamId);

  // Randomise order so the same teams don't always trade first.
  const shuffled = [...allTeams].sort(() => Math.random() - 0.5);

  // Build surplus/need map upfront — avoids repeated roster scans.
  const surplusMap = {};
  const needsMap   = {};
  for (const team of shuffled) {
    surplusMap[team.id] = getSurplusPlayers(team.id);
    needsMap[team.id]   = getTeamNeeds(team.id);
  }

  let tradesExecuted = 0;
  // Track which teams already traded this week to prevent double-dipping.
  const tradedTeams = new Set();

  for (let i = 0; i < shuffled.length && tradesExecuted < MAX_TRADES_PER_WEEK; i++) {
    const teamA = shuffled[i];
    if (tradedTeams.has(teamA.id)) continue;

    const teamANeeds   = needsMap[teamA.id];
    const teamASurplus = surplusMap[teamA.id];
    if (teamANeeds.length === 0 || teamASurplus.length === 0) continue;

    const topNeed = teamANeeds[0]; // highest-priority need for Team A

    for (let j = i + 1; j < shuffled.length && tradesExecuted < MAX_TRADES_PER_WEEK; j++) {
      const teamB = shuffled[j];
      if (tradedTeams.has(teamB.id)) continue;

      const teamBSurplus = surplusMap[teamB.id];
      const teamBNeeds   = needsMap[teamB.id];

      // Does Team B have a surplus player at the position Team A needs?
      const bCanGive = teamBSurplus.filter(s => s.pos === topNeed.pos);
      if (bCanGive.length === 0) continue;

      // Does Team A have a surplus at a position Team B needs?
      const teamBTopNeed = teamBNeeds[0];
      if (!teamBTopNeed) continue;

      const aCanGive = teamASurplus.filter(s => s.pos === teamBTopNeed.pos);
      if (aCanGive.length === 0) continue;

      // Pick the best available candidates from each side.
      const playerFromB = bCanGive[0].player;
      const playerFromA = aCanGive[0].player;

      const valueA = calculatePlayerValue(playerFromA);
      const valueB = calculatePlayerValue(playerFromB);

      // Both players must have positive value (sanity check).
      if (valueA <= 0 || valueB <= 0) continue;

      // Check trade fairness: values must be within ±VALUE_TOLERANCE.
      const ratio = valueA / valueB;
      if (ratio < (1 - VALUE_TOLERANCE) || ratio > (1 + VALUE_TOLERANCE)) continue;

      // Trade is fair — execute it.
      await executeTrade(teamA.id, playerFromA, teamB.id, playerFromB);
      tradedTeams.add(teamA.id);
      tradedTeams.add(teamB.id);
      tradesExecuted++;
      break; // move to the next outer team
    }
  }
}
