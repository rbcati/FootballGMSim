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
import { Constants }    from './constants.js';
import { Utils as U }   from './utils.js';

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
 *
 * Formula: ((OVR × 1.5 + POT × 0.5) × posMult) − agePenalty − contractPenalty
 *
 * Improvements over the original (OVR*1.5 + POT*0.5 - Age*2):
 *  - Position multiplier: QBs worth more than Ks at the same OVR
 *  - Exponential age penalty: steep for 32+ (was linear)
 *  - Contract penalty: expensive contracts reduce trade value
 *
 * @param {object} player  – player object from cache
 * @returns {number}
 */
export function calculatePlayerValue(player) {
  const ovr = player.ovr       ?? 60;
  const pot = player.potential  ?? player.ovr ?? 60;
  const age = player.age        ?? 26;

  // Position multiplier (from Constants.POSITION_VALUES)
  const posValues  = Constants?.POSITION_VALUES ?? {};
  const posMult    = posValues[player.pos] ?? 1.0;

  // Age Curve - Opus Phase 4 - Realism adjustments
  // Sharp drop-off post 28, especially for RBs
  let agePenalty = 0;
  if (player.pos === 'RB' && age >= 27) {
      agePenalty = Math.pow(1.15, age - 26) * 10;
  } else if (age >= 30) {
      agePenalty = Math.pow(1.10, age - 29) * 8;
  }

  // Contract cost penalty (expensive players are harder to trade for)
  const annualSalary  = player.contract?.baseAnnual ?? 0;
  const capHitPct = annualSalary / Constants.SALARY_CAP.HARD_CAP;
  const contractPenalty = capHitPct * 200; // Adjust penalty based on cap percentage

  // Base calculation heavily rewards potential for young players
  const potWeight = age <= 25 ? 1.2 : 0.5;
  const ovrWeight = age <= 25 ? 0.8 : 1.5;

  const rawValue = ((ovr * ovrWeight) + (pot * potWeight)) * posMult;
  return Math.max(0, rawValue - agePenalty - contractPenalty);
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
  const shuffled = U.shuffle([...allTeams]);

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

function safeWinPct(team) {
  const wins = Number(team?.wins ?? 0);
  const losses = Number(team?.losses ?? 0);
  const ties = Number(team?.ties ?? 0);
  const games = wins + losses + ties;
  if (games <= 0) return 0.5;
  return (wins + ties * 0.5) / games;
}

export function classifyTeamDirection(team, week = 1) {
  const winPct = safeWinPct(team);
  if (week <= 4) {
    if (winPct >= 0.7) return 'contender';
    if (winPct <= 0.3) return 'retool';
    return 'balanced';
  }
  if (winPct >= 0.62) return 'contender';
  if (winPct <= 0.35) return 'rebuilding';
  if (winPct <= 0.45) return 'desperate';
  return 'balanced';
}

export function getPickMarketValue(pick) {
  const round = Number(pick?.round ?? 4);
  const PICK_VALUES = [0, 950, 360, 150, 70, 30, 12, 4];
  return PICK_VALUES[round] ?? 8;
}

function pickLabel(pick) {
  if (!pick) return 'Future pick';
  const season = Number(pick?.season ?? pick?.year ?? 0);
  const suffix = season > 0 ? `${season} ` : '';
  return `${suffix}R${pick?.round ?? '?'}`;
}

function playerSnapshot(player) {
  if (!player) return null;
  return {
    id: player.id,
    name: player.name,
    pos: player.pos,
    ovr: player.ovr,
    age: player.age,
    contract: {
      baseAnnual: Number(player?.contract?.baseAnnual ?? player?.baseAnnual ?? 0),
      signingBonus: Number(player?.contract?.signingBonus ?? player?.signingBonus ?? 0),
      yearsTotal: Number(player?.contract?.yearsTotal ?? player?.yearsTotal ?? 1),
    },
  };
}

function pickSnapshot(pick, teamsById = new Map()) {
  if (!pick) return null;
  const originalOwner = Number(pick?.originalOwner ?? pick?.sourceTeamId ?? pick?.teamId ?? NaN);
  const currentOwner = Number(pick?.currentOwner ?? NaN);
  return {
    id: pick.id,
    round: pick.round,
    season: pick.season ?? pick.year,
    originalOwner: Number.isFinite(originalOwner) ? originalOwner : null,
    currentOwner: Number.isFinite(currentOwner) ? currentOwner : null,
    originalOwnerAbbr: Number.isFinite(originalOwner) ? (teamsById.get(originalOwner)?.abbr ?? null) : null,
    currentOwnerAbbr: Number.isFinite(currentOwner) ? (teamsById.get(currentOwner)?.abbr ?? null) : null,
    label: pickLabel(pick),
  };
}

function getExpiringPlayers(teamId) {
  const roster = cache.getPlayersByTeam(teamId);
  return roster.filter((p) => {
    const yearsLeft = Number(
      p?.contract?.yearsRemaining
        ?? p?.contract?.years
        ?? p?.years
        ?? p?.contractYearsLeft
        ?? 2,
    );
    return yearsLeft <= 1 && (p?.ovr ?? 0) >= 72;
  });
}

function computeOfferType({ userDirection, aiDirection, userCapRoom, week }) {
  const nearDeadline = week >= 10;
  if (aiDirection === 'contender' && (userDirection === 'rebuilding' || userDirection === 'retool')) {
    return nearDeadline ? 'deadline_rental' : 'contender_veteran_push';
  }
  if (aiDirection === 'rebuilding' && userDirection === 'contender') {
    return 'pick_package';
  }
  if (userCapRoom >= 28 && aiDirection !== 'contender') {
    return 'cap_dump_opportunity';
  }
  if (aiDirection === 'desperate') {
    return 'shake_up_offer';
  }
  return 'depth_swap';
}

function offerReasonCopy(type, aiAbbr, needPos, week) {
  if (type === 'deadline_rental') return `${aiAbbr} is in a win-now window entering the deadline and wants immediate ${needPos} help.`;
  if (type === 'contender_veteran_push') return `${aiAbbr} sees your veteran as a playoff rotation fit and is willing to pay now.`;
  if (type === 'pick_package') return `${aiAbbr} is collecting future assets and targeting your long-term timeline.`;
  if (type === 'cap_dump_opportunity') return `${aiAbbr} is tight against the cap and floated a salary-balancing deal.`;
  if (type === 'shake_up_offer') return `${aiAbbr} is underperforming and trying a change-of-scenery move.`;
  if (week >= 12) return `${aiAbbr} is reacting to late-season roster pressure.`;
  return `${aiAbbr} is addressing a ${needPos} need with a depth-for-depth framework.`;
}

function stanceCopy(aiDirection, offerType, nearDeadline) {
  if (aiDirection === 'contender' && nearDeadline) return 'Deadline push';
  if (aiDirection === 'contender') return 'Playoff push';
  if (aiDirection === 'rebuilding') return offerType === 'pick_package' ? 'Future-first posture' : 'Asset cycling';
  if (aiDirection === 'desperate') return 'Pressure is on';
  return 'Roster balance';
}

function getDeadlinePressure(week, aiDirection) {
  if (week >= 13) return aiDirection === 'contender' ? 1.18 : 1.08;
  if (week >= 10) return aiDirection === 'contender' ? 1.1 : 1.02;
  return 1.0;
}

function resolveTradablePick(team, season, preferredRound = 3) {
  const picks = Array.isArray(team?.picks) ? team.picks : [];
  const pool = picks
    .filter((pk) => Number(pk?.season ?? 0) >= season)
    .sort((a, b) => {
      const aSeason = Number(a?.season ?? 0);
      const bSeason = Number(b?.season ?? 0);
      if (aSeason !== bSeason) return aSeason - bSeason;
      return Number(a?.round ?? 7) - Number(b?.round ?? 7);
    });
  const preferred = pool.find((pk) => Number(pk?.round ?? 7) >= preferredRound);
  return preferred ?? pool[0] ?? null;
}

export function buildOfferSignature(offer) {
  const givePlayers = [...(offer?.offering?.playerIds ?? [])].sort().join(',');
  const getPlayers = [...(offer?.receiving?.playerIds ?? [])].sort().join(',');
  const giveRounds = (offer?.offeringPickSnapshots ?? [])
    .map((pk) => `${pk?.season ?? '?'}-R${pk?.round ?? '?'}`)
    .sort()
    .join(',');
  const getRounds = (offer?.receivingPickSnapshots ?? [])
    .map((pk) => `${pk?.season ?? '?'}-R${pk?.round ?? '?'}`)
    .sort()
    .join(',');
  return `${offer?.offeringTeamId}|${offer?.offerType}|${givePlayers}|${getPlayers}|${giveRounds}|${getRounds}`;
}

export function shouldSkipOfferFromMemory({ offer, week, memory }) {
  const signature = buildOfferSignature(offer);
  const memoryRow = memory?.[signature];
  if (!memoryRow) return false;
  const weeksAgo = week - Number(memoryRow.lastWeek ?? 0);
  if (weeksAgo >= 3) return false;
  const deadlineShift = Number(memoryRow.lastWeek ?? 0) < 10 && week >= 10;
  const directionShift = memoryRow.lastDirection && memoryRow.lastDirection !== offer.offeringDirection;
  return !(deadlineShift || directionShift);
}

export function evaluateCounterOffer({
  aiTeam,
  userTeam,
  week = 1,
  aiDirection = 'balanced',
  offerType = 'depth_swap',
  aiReceivesValue = 0,
  aiGivesValue = 0,
  hasUserPickSweetener = false,
  hasAiPickSweetener = false,
  isCounterRound = true,
}) {
  const pressure = getDeadlinePressure(week, aiDirection);
  const expiringAiCount = getExpiringPlayers(aiTeam?.id).length;
  const capRoom = Number(aiTeam?.capRoom ?? 0);
  const capStress = capRoom < 6 ? 1.08 : 1.0;
  const rebuilderDiscount = aiDirection === 'rebuilding' && hasUserPickSweetener ? 0.94 : 1.0;
  const contenderPremium = aiDirection === 'contender' ? 1.04 : 1.0;
  const urgencyFactor = aiDirection === 'desperate' ? 0.98 : 1.0;
  const expiringFactor = expiringAiCount > 0 && offerType === 'deadline_rental' ? 0.97 : 1.0;
  const askMultiplier = pressure * capStress * rebuilderDiscount * contenderPremium * urgencyFactor * expiringFactor;
  const requiredValue = aiGivesValue * askMultiplier;
  const closeGap = requiredValue - aiReceivesValue;

  if (aiReceivesValue >= requiredValue) {
    return {
      status: 'accepts',
      stance: aiDirection === 'contender' ? 'Good enough for us to move now.' : 'That closes the value gap.',
      reason: `${aiTeam?.abbr ?? 'They'} sign off on this counter.`,
      rejectionType: null,
    };
  }

  const sweetenerNeeded = closeGap <= 180 && !hasUserPickSweetener;
  if (isCounterRound && (closeGap <= 280 || sweetenerNeeded || hasAiPickSweetener)) {
    return {
      status: 'asks_more',
      stance: 'We need a little more to get this done.',
      reason: sweetenerNeeded
        ? `${aiTeam?.abbr ?? 'They'} like the framework but want pick compensation to close it.`
        : `${aiTeam?.abbr ?? 'They'} are close, but need one more sweetener.`,
      askHint: sweetenerNeeded ? 'add_pick' : 'add_depth_piece',
      rejectionType: 'value',
    };
  }

  return {
    status: 'rejects',
    stance: 'They are not moving off this price.',
    reason: closeGap > 700
      ? `${aiTeam?.abbr ?? 'They'} pass on that counter due to a major value gap.`
      : aiDirection === 'contender'
        ? `${aiTeam?.abbr ?? 'They'} pass — their current team direction prefers immediate contributors.`
        : `${aiTeam?.abbr ?? 'They'} pass on that counter.`,
    askHint: closeGap > 700 ? 'major_upgrade' : 'value_gap',
    rejectionType: closeGap > 700 ? 'value' : aiDirection === 'contender' ? 'direction' : 'fit',
  };
}

/**
 * Phase 4 Opus: AI-Initiated Trade Proposals
 * The AI evaluates the user's roster for surplus and needs, and generates
 * 1-2 trade proposals from AI teams that match those needs.
 */
export function generateAITradeProposalsForUser({
  existingOffers = [],
  offerMemory = {},
} = {}) {
  const meta = cache.getMeta();
  if (!meta || meta.phase !== 'regular') return [];

  const userTeamId = Number(meta.userTeamId);
  if (!Number.isFinite(userTeamId)) return [];

  const allTeams = cache.getAllTeams();
  const teamsById = new Map(allTeams.map((team) => [Number(team.id), team]));
  const userTeam = allTeams.find((t) => Number(t.id) === userTeamId);
  if (!userTeam) return [];

  const userNeeds = getTeamNeeds(userTeamId);
  const userSurplus = getSurplusPlayers(userTeamId);
  const userExpiring = getExpiringPlayers(userTeamId);
  const userDirection = classifyTeamDirection(userTeam, meta.currentWeek ?? 1);
  const userCapRoom = Number(userTeam?.capRoom ?? 0);
  const week = Number(meta?.currentWeek ?? 1);
  const nearDeadline = week >= 10;

  // Keep offers occasional and contextual.
  const baseChance = nearDeadline ? 0.55 : 0.35;
  if (Math.random() > baseChance) return [];

  const aiTeams = U.shuffle(allTeams.filter((t) => Number(t.id) !== userTeamId));
  const proposals = [];
  const usedPlayerIds = new Set();

  for (const aiTeam of aiTeams) {
    if (proposals.length >= 2) break;
    if (Math.random() < 0.45 && proposals.length >= 1) continue;

    const aiDirection = classifyTeamDirection(aiTeam, week);
    const aiSurplus = getSurplusPlayers(aiTeam.id);
    const aiNeeds = getTeamNeeds(aiTeam.id);
    const aiExpiring = getExpiringPlayers(aiTeam.id);
    if (aiSurplus.length === 0 || aiNeeds.length === 0) continue;

    const topUserNeed = userNeeds[0];
    const topAiNeed = aiNeeds[0];
    if (!topUserNeed || !topAiNeed) continue;

    const aiOfferCandidate = aiSurplus.find((asset) =>
      asset?.pos === topUserNeed.pos && !usedPlayerIds.has(asset?.player?.id),
    ) ?? aiSurplus[0];

    const userCandidatePool = userSurplus.filter((asset) =>
      asset?.pos === topAiNeed.pos && !usedPlayerIds.has(asset?.player?.id),
    );

    let userAsset = userCandidatePool[0] ?? null;
    if (!userAsset && userDirection !== 'contender' && userExpiring.length > 0) {
      const expiring = userExpiring
        .filter((p) => !usedPlayerIds.has(p.id))
        .sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0))[0];
      if (expiring) {
        userAsset = { pos: expiring.pos, value: calculatePlayerValue(expiring), player: expiring };
      }
    }
    if (!aiOfferCandidate || !userAsset) continue;

    const offerValue = aiOfferCandidate.value;
    const askValue = userAsset.value;
    if (offerValue <= 0 || askValue <= 0) continue;

    const directionTolerance = aiDirection === 'rebuilding' ? 0.2 : aiDirection === 'contender' ? 0.28 : 0.24;
    const tolerance = nearDeadline ? directionTolerance + 0.06 : directionTolerance;
    const withinRange = Math.abs(offerValue - askValue) / Math.max(offerValue, askValue) <= tolerance;
    if (!withinRange) continue;

    const offerType = computeOfferType({ userDirection, aiDirection, userCapRoom, week });
    const urgency = nearDeadline && aiDirection === 'contender' ? 'high' : aiDirection === 'desperate' ? 'high' : 'medium';
    const reason = offerReasonCopy(offerType, aiTeam.abbr, topUserNeed.pos, week);
    const stance = stanceCopy(aiDirection, offerType, nearDeadline);
    const offeringPickSnapshots = [];
    const receivingPickSnapshots = [];
    const offeringPickIds = [];

    const proposal = {
      id: `offer_${meta?.season ?? meta?.year ?? 1}_${week}_${aiTeam.id}_${aiOfferCandidate.player.id}_${Date.now()}`,
      week,
      createdWeek: week,
      season: meta?.season ?? meta?.year ?? 1,
      offeringTeamId: aiTeam.id,
      offeringTeamAbbr: aiTeam.abbr,
      offeringTeamName: aiTeam.name,
      offeringDirection: aiDirection,
      offerType,
      urgency,
      stance,
      reason,
      context: {
        deadlineProximity: nearDeadline ? 'near' : 'early',
        userDirection,
        userCapRoom: Math.round(userCapRoom),
      },
      offering: { playerIds: [aiOfferCandidate.player.id], pickIds: offeringPickIds },
      receiving: { playerIds: [userAsset.player.id], pickIds: [] },
      offeringPickSnapshots,
      receivingPickSnapshots,
      offeringPlayerSnapshots: [playerSnapshot(aiOfferCandidate.player)].filter(Boolean),
      receivingPlayerSnapshots: [playerSnapshot(userAsset.player)].filter(Boolean),
      offeringPlayerId: aiOfferCandidate.player.id,
      offeringPlayerName: aiOfferCandidate.player.name,
      receivingPlayerId: userAsset.player.id,
      receivingPlayerName: userAsset.player.name,
      userNeedPositions: userNeeds.map((need) => need.pos).slice(0, 4),
      userSurplusPositions: userSurplus.map((asset) => asset.pos).slice(0, 4),
      offeringNeedPositions: aiNeeds.map((need) => need.pos).slice(0, 4),
      offeringSurplusPositions: aiSurplus.map((asset) => asset.pos).slice(0, 4),
      expiresAfterWeek: week + 2,
      timestamp: Date.now(),
    };
    proposal.signature = buildOfferSignature(proposal);

    usedPlayerIds.add(aiOfferCandidate.player.id);
    usedPlayerIds.add(userAsset.player.id);

    // Rebuilders sometimes add a late pick sweetener near deadline.
    if (
      offerType === 'pick_package'
      && nearDeadline
      && Math.random() < 0.35
    ) {
      const preferredRound = Math.random() < 0.65 ? 3 : 4;
      const aiPick = resolveTradablePick(aiTeam, Number(meta?.season ?? meta?.year ?? 1), preferredRound);
      if (aiPick?.id != null) {
        proposal.offering.pickIds.push(aiPick.id);
        const snapshot = pickSnapshot(aiPick, teamsById);
        if (snapshot) proposal.offeringPickSnapshots.push(snapshot);
      }
    }

    if (shouldSkipOfferFromMemory({ offer: proposal, week, memory: offerMemory })) continue;
    if (existingOffers.some((existing) => buildOfferSignature(existing) === buildOfferSignature(proposal))) continue;

    proposals.push(proposal);
  }

  return proposals;
}
