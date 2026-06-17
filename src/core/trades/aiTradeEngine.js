/**
 * aiTradeEngine.js — AI Trade Block Pursuit Engine
 *
 * Pure, deterministic AI trade-pursuit module for players on the user's
 * trade block (onTradeBlock === true, set by GM or via trade request).
 *
 * Design constraints:
 *  - No I/O, no cache access, no side effects.
 *  - No imports from worker, UI, news, morale engine, holdout engine,
 *    HOF engine, coaching engine, FA, scouting, or sim engine.
 *  - No Math.random — seeded LCG only.
 *  - Returns new objects — no mutation of inputs.
 *  - Fully deterministic given same inputs.
 */

import { getAssetValue } from './assetValuation.js';
import { computeTradeValueModifier } from './tradeRequestEngine.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Base positional need weight used to calibrate how aggressively AI teams
 * pursue each position. Mirrors POSITION_MARKET_WEIGHTS from assetValuation.js
 * but scoped to roster-need signals.
 */
export const POSITION_NEED_WEIGHT = Object.freeze({
  QB: 1.5, EDGE: 1.3, DE: 1.25, OT: 1.25, WR: 1.2, CB: 1.2,
  DL: 1.0, OL: 1.0,  LB: 0.95, S:  0.9,  TE: 0.85, RB: 0.75,
});

/**
 * Aggression multipliers — applied to the AI's acquisition target value.
 * HIGH/MAX cause the AI to outbid the raw market value.
 */
export const AI_OFFER_AGGRESSION = Object.freeze({
  LOW:    0.85,
  MEDIUM: 0.92,
  HIGH:   1.02,
  MAX:    1.10,
});

// Expected starter count per position (used for depth-gap calculation)
const STARTERS_COUNT = Object.freeze({
  QB: 1, WR: 3, TE: 1, RB: 2,
  OT: 2, OL: 3, OG: 2,
  DE: 2, DL: 2, EDGE: 2, LB: 3,
  CB: 2, S: 2,
});

const STARTER_OVR_THRESHOLD = 70;    // OVR floor for a quality starter
const BACKUP_OVR_THRESHOLD  = 58;    // Minimum OVR for an AI to include in an offer
const OFFER_VALIDITY_WEEKS  = 3;     // Offers expire after this many weeks
const MAX_PURSUERS_PER_PLAYER = 3;   // Max AI teams that can bid on the same player

// Counter-offer decision thresholds
const COUNTER_ACCEPT_THRESHOLD = 0.90;   // AI accepts if they receive >= 90% of target
const COUNTER_REJECT_THRESHOLD = 0.60;   // AI hard-rejects below 60%
const MIN_BUNDLE_FRACTION      = 0.70;   // Don't make an offer if can't hit 70% of target

// ── Seeded LCG ────────────────────────────────────────────────────────────────
// Numerical Recipes LCG — identical to tradeRequestEngine.js implementation.

function lcgRandom(seed) {
  const a = 1664525;
  const c = 1013904223;
  return ((a * (seed >>> 0) + c) >>> 0) / 0x100000000;
}

function lcgStep(seed) {
  return ((1664525 * (seed >>> 0) + 1013904223) >>> 0);
}

// ── Core: computeAIPositionNeed ───────────────────────────────────────────────

/**
 * Compute how much an AI team needs a specific position (0–1 scale).
 * 1.0 = desperate need, 0.1 = already well-stocked.
 *
 * @param {object}   aiTeam    – AI team object
 * @param {string}   targetPos – position string (e.g. 'WR')
 * @param {object[]} aiPlayers – all players in the league
 * @returns {number}           – 0–1 need score
 */
export function computeAIPositionNeed(aiTeam, targetPos, aiPlayers) {
  if (!aiTeam || !targetPos || !Array.isArray(aiPlayers)) return 0.5;

  const teamId = Number(aiTeam.id);
  const posPlayers = aiPlayers.filter(
    p => Number(p?.teamId) === teamId && p?.pos === targetPos,
  );

  const starterCount    = posPlayers.filter(p => Number(p.ovr ?? 0) >= STARTER_OVR_THRESHOLD).length;
  const startersNeeded  = STARTERS_COUNT[targetPos] ?? 1;
  const baseWeight      = POSITION_NEED_WEIGHT[targetPos] ?? 1.0;

  if (starterCount === 0)              return Math.min(1.0, baseWeight * 1.20);
  if (starterCount < startersNeeded)   return Math.min(1.0, baseWeight * 0.85);
  // Has sufficient starters — still interested in upgrading but at a discount
  return Math.max(0.10, baseWeight * 0.30);
}

// ── Core: computeAIOfferValue ─────────────────────────────────────────────────

/**
 * How much value (on the unified scale) is the AI team willing to give up
 * to acquire targetPlayer?
 *
 * The trade block / stonewall modifier is applied first so players on the
 * block (discounted) attract slightly lower offers.
 *
 * @param {object} targetPlayer – player being targeted
 * @param {object} _aiTeam      – AI team (reserved for future team-direction use)
 * @param {object} context      – { positionNeed: number, aggression: string }
 * @param {number} seed         – LCG seed for ±4% variance
 * @returns {number}
 */
export function computeAIOfferValue(targetPlayer, _aiTeam, context = {}, seed = 0) {
  if (!targetPlayer) return 0;

  const baseValue = getAssetValue(targetPlayer, null, {});

  // Market discount: if player is on block or stonewalled, they cost less
  const modifier   = computeTradeValueModifier(targetPlayer);
  const modFactor  = modifier ? (1 + modifier.modifier) : 1.0;
  const discounted = baseValue * modFactor;

  const positionNeed    = context.positionNeed ?? 0.5;
  const aggressionKey   = context.aggression   ?? 'MEDIUM';
  const aggressionFactor = AI_OFFER_AGGRESSION[aggressionKey] ?? AI_OFFER_AGGRESSION.MEDIUM;

  // Need factor: 0.80 at zero need → 1.02 at max need
  const needFactor = 0.80 + positionNeed * 0.22;

  // Seeded variance: ±4%
  const variance = 0.96 + lcgRandom(seed) * 0.08;

  return discounted * needFactor * aggressionFactor * variance;
}

// ── Core: buildAITradeOffer ───────────────────────────────────────────────────

/**
 * Build a concrete AI trade offer for a player on the user's trade block.
 *
 * The AI never offers their depth-rank-1 starter at any position.
 * Picks are preferred over players (roster-neutral); players fill the gap.
 * Returns null if the AI cannot assemble a bundle worth ≥ 70% of target.
 *
 * @param {object}   targetPlayer – player to acquire
 * @param {object}   aiTeam       – AI team making the offer
 * @param {object[]} aiPlayers    – all league players
 * @param {object[]} aiPicks      – all league draft picks
 * @param {number}   season       – current season
 * @param {number}   week         – current week
 * @param {number}   seed         – deterministic LCG seed
 * @returns {object|null}         – offer object or null
 */
export function buildAITradeOffer(targetPlayer, aiTeam, aiPlayers, aiPicks, season, week, seed) {
  if (!targetPlayer || !aiTeam) return null;

  const aiTeamId      = Number(aiTeam.id);
  const allPlayers    = Array.isArray(aiPlayers) ? aiPlayers : [];
  const aiTeamPlayers = allPlayers.filter(p => Number(p?.teamId) === aiTeamId);

  // Positional need drives aggression
  const positionNeed = computeAIPositionNeed(aiTeam, targetPlayer.pos, allPlayers);

  let aggressionKey = 'MEDIUM';
  if      (positionNeed >= 0.90) aggressionKey = 'MAX';
  else if (positionNeed >= 0.75) aggressionKey = 'HIGH';
  else if (positionNeed <= 0.25) aggressionKey = 'LOW';

  const acquisitionValue = computeAIOfferValue(targetPlayer, aiTeam, {
    positionNeed,
    aggression: aggressionKey,
  }, seed);

  // Identify non-negotiable starters (best OVR at each position on AI's roster)
  const bestByPos = {};
  for (const p of aiTeamPlayers) {
    const pos = p.pos ?? '';
    if (!bestByPos[pos] || Number(p.ovr ?? 0) > Number(bestByPos[pos].ovr ?? 0)) {
      bestByPos[pos] = p;
    }
  }
  const protectedIds = new Set(Object.values(bestByPos).map(p => p.id));
  protectedIds.add(targetPlayer.id);

  const offerablePlayers = aiTeamPlayers
    .filter(p => !protectedIds.has(p.id) && Number(p.ovr ?? 0) >= BACKUP_OVR_THRESHOLD)
    .map(p => ({ ...p, _value: getAssetValue(p, null, {}) }));

  const allPicks     = Array.isArray(aiPicks) ? aiPicks : [];
  const aiTeamPicks  = allPicks
    .filter(pk => Number(pk?.currentTeamId ?? pk?.teamId ?? -1) === aiTeamId)
    .map(pk => ({ ...pk, _value: getAssetValue(pk, null, { currentSeason: season }) }));

  // Build bundle: picks first (best picks), then players (lowest-value first)
  const sortedPicks   = [...aiTeamPicks].sort((a, b) => b._value - a._value);
  const sortedPlayers = [...offerablePlayers].sort((a, b) => a._value - b._value);

  let lcgSeed    = lcgStep(seed);
  const bundlePicks   = [];
  const bundlePlayers = [];
  let bundleValue = 0;

  for (const pk of sortedPicks) {
    if (bundleValue >= acquisitionValue) break;
    bundlePicks.push(pk);
    bundleValue += pk._value;
    lcgSeed = lcgStep(lcgSeed);
  }

  if (bundleValue < acquisitionValue) {
    for (const pl of sortedPlayers) {
      if (bundleValue >= acquisitionValue) break;
      bundlePlayers.push(pl);
      bundleValue += pl._value;
      lcgSeed = lcgStep(lcgSeed);
    }
  }

  if (bundleValue < acquisitionValue * MIN_BUNDLE_FRACTION) return null;

  const seedHex = (seed >>> 0).toString(16).padStart(8, '0');
  const offerId = `ai_${aiTeamId}_${targetPlayer.id}_s${season}w${week}_${seedHex}`;

  return {
    offerId,
    aiTeamId,
    aiTeamName:       aiTeam.name     ?? `Team ${aiTeamId}`,
    aiTeamAbbrev:     aiTeam.abbrev   ?? aiTeam.name?.slice(0, 3)?.toUpperCase() ?? 'AI',
    targetPlayerId:   targetPlayer.id,
    targetPlayerName: targetPlayer.name ?? 'Unknown',
    targetPlayerPos:  targetPlayer.pos  ?? '??',
    targetPlayerOvr:  targetPlayer.ovr  ?? 70,
    offerPlayers:     bundlePlayers.map(({ _value: _v, ...rest }) => rest),
    offerPicks:       bundlePicks.map(({ _value: _v, ...rest }) => rest),
    bundleValue:      Math.round(bundleValue),
    acquisitionValue: Math.round(acquisitionValue),
    positionNeed,
    aggression:       aggressionKey,
    status:           'pending',
    createdSeason:    season,
    createdWeek:      week,
    expiresWeek:      week + OFFER_VALIDITY_WEEKS,
  };
}

// ── Core: shouldAIUpdateOffer ─────────────────────────────────────────────────

/**
 * Returns true if the AI's existing offer should be expired or refreshed
 * this week (offer is past its expiry window, or from a prior season).
 *
 * @param {object} existingOffer – offer from meta.inboundTradeOffers
 * @param {object} _targetPlayer – reserved for future player-state check
 * @param {number} season
 * @param {number} week
 * @returns {boolean}
 */
export function shouldAIUpdateOffer(existingOffer, _targetPlayer, season, week) {
  if (!existingOffer) return false;
  if (existingOffer.status !== 'pending') return false;

  // Different season → always expire
  if (existingOffer.createdSeason !== season) return true;

  const expiry = existingOffer.expiresWeek ?? (existingOffer.createdWeek + OFFER_VALIDITY_WEEKS);
  return week > expiry;
}

// ── Core: improveAIOffer ──────────────────────────────────────────────────────

/**
 * Build an improved version of an existing offer.
 * Steps aggression up by one level and applies an additional 8% premium
 * on the acquisition target, then rebuilds the asset bundle.
 * Returns null if the AI still cannot assemble a sufficient bundle.
 *
 * @param {object}   existingOffer
 * @param {object}   targetPlayer
 * @param {object}   aiTeam
 * @param {object[]} aiPlayers
 * @param {object[]} aiPicks
 * @param {number}   season
 * @param {number}   week
 * @param {number}   seed
 * @returns {object|null}
 */
export function improveAIOffer(existingOffer, targetPlayer, aiTeam, aiPlayers, aiPicks, season, week, seed) {
  if (!existingOffer || !targetPlayer || !aiTeam) return null;
  if (existingOffer.status !== 'pending') return null;

  const aiTeamId      = Number(aiTeam.id);
  const allPlayers    = Array.isArray(aiPlayers) ? aiPlayers : [];
  const aiTeamPlayers = allPlayers.filter(p => Number(p?.teamId) === aiTeamId);

  const positionNeed = computeAIPositionNeed(aiTeam, targetPlayer.pos, allPlayers);

  // Step up aggression one level
  const aggressionOrder = ['LOW', 'MEDIUM', 'HIGH', 'MAX'];
  const prevIdx         = aggressionOrder.indexOf(existingOffer.aggression ?? 'MEDIUM');
  const newAggressionKey = aggressionOrder[Math.min(prevIdx + 1, aggressionOrder.length - 1)];

  // Base value with improved aggression, then add 8% premium
  const baseAcq       = computeAIOfferValue(targetPlayer, aiTeam, {
    positionNeed,
    aggression: newAggressionKey,
  }, seed);
  const acquisitionValue = baseAcq * 1.08;

  // Re-build protected set
  const bestByPos = {};
  for (const p of aiTeamPlayers) {
    const pos = p.pos ?? '';
    if (!bestByPos[pos] || Number(p.ovr ?? 0) > Number(bestByPos[pos].ovr ?? 0)) {
      bestByPos[pos] = p;
    }
  }
  const protectedIds = new Set(Object.values(bestByPos).map(p => p.id));
  protectedIds.add(targetPlayer.id);

  const offerablePlayers = aiTeamPlayers
    .filter(p => !protectedIds.has(p.id) && Number(p.ovr ?? 0) >= BACKUP_OVR_THRESHOLD)
    .map(p => ({ ...p, _value: getAssetValue(p, null, {}) }));

  const allPicks    = Array.isArray(aiPicks) ? aiPicks : [];
  const aiTeamPicks = allPicks
    .filter(pk => Number(pk?.currentTeamId ?? pk?.teamId ?? -1) === aiTeamId)
    .map(pk => ({ ...pk, _value: getAssetValue(pk, null, { currentSeason: season }) }));

  const sortedPicks   = [...aiTeamPicks].sort((a, b) => b._value - a._value);
  const sortedPlayers = [...offerablePlayers].sort((a, b) => a._value - b._value);

  let lcgSeed         = lcgStep(seed);
  const bundlePicks   = [];
  const bundlePlayers = [];
  let bundleValue     = 0;

  for (const pk of sortedPicks) {
    if (bundleValue >= acquisitionValue) break;
    bundlePicks.push(pk);
    bundleValue += pk._value;
    lcgSeed = lcgStep(lcgSeed);
  }

  if (bundleValue < acquisitionValue) {
    for (const pl of sortedPlayers) {
      if (bundleValue >= acquisitionValue) break;
      bundlePlayers.push(pl);
      bundleValue += pl._value;
      lcgSeed = lcgStep(lcgSeed);
    }
  }

  if (bundleValue < acquisitionValue * MIN_BUNDLE_FRACTION) return null;

  const seedHex = (seed >>> 0).toString(16).padStart(8, '0');
  const offerId = `ai_${aiTeamId}_${targetPlayer.id}_s${season}w${week}_${seedHex}_imp`;

  return {
    ...existingOffer,
    offerId,
    offerPlayers:     bundlePlayers.map(({ _value: _v, ...rest }) => rest),
    offerPicks:       bundlePicks.map(({ _value: _v, ...rest }) => rest),
    bundleValue:      Math.round(bundleValue),
    acquisitionValue: Math.round(acquisitionValue),
    positionNeed,
    aggression:       newAggressionKey,
    status:           'pending',
    createdSeason:    season,
    createdWeek:      week,
    expiresWeek:      week + OFFER_VALIDITY_WEEKS,
    improved:         true,
  };
}

// ── Core: evaluateCounterOffer ────────────────────────────────────────────────

/**
 * Evaluate a GM's counter offer from the AI team's perspective.
 *
 * The worker pre-computes aiReceivesValue and aiGivesValue using
 * calcAssetBundleValue before calling this — keeps the engine pure.
 *
 * Decision logic:
 *  - accept  if aiReceivesValue >= acquisitionValue × 0.90
 *  - reject  if aiReceivesValue <  acquisitionValue × 0.60
 *  - counter otherwise (70% chance), reject (30% chance) — seeded
 *
 * @param {object} originalOffer     – the original AI offer object
 * @param {object} preComputedValues – { aiReceivesValue, aiGivesValue }
 * @param {object} _aiTeam           – AI team (reserved)
 * @param {number} seed              – LCG seed
 * @returns {'accept'|'reject'|'counter'}
 */
export function evaluateCounterOffer(originalOffer, preComputedValues, _aiTeam, seed) {
  if (!originalOffer || !preComputedValues) return 'reject';

  const { aiReceivesValue = 0 } = preComputedValues;
  const targetValue = originalOffer.acquisitionValue ?? 0;

  if (targetValue <= 0) return 'reject';

  if (aiReceivesValue >= targetValue * COUNTER_ACCEPT_THRESHOLD) return 'accept';
  if (aiReceivesValue <  targetValue * COUNTER_REJECT_THRESHOLD)  return 'reject';

  // Middle zone: 70% counter, 30% reject
  return lcgRandom(seed >>> 0) < 0.70 ? 'counter' : 'reject';
}

// ── Core: getAITradeBlockTargets ──────────────────────────────────────────────

/**
 * Return AI team / target-player pairings for block pursuit this week.
 * Up to MAX_PURSUERS_PER_PLAYER AI teams per block player, seeded so the
 * same week always yields the same pursuit list.
 *
 * @param {object}   userTeam    – user's team object
 * @param {object[]} userPlayers – all league players (filtered internally)
 * @param {object[]} allTeams    – all league teams
 * @param {number}   season
 * @param {number}   week
 * @returns {{ aiTeam: object, targetPlayerId: number|string }[]}
 */
export function getAITradeBlockTargets(userTeam, userPlayers, allTeams, season, week) {
  if (!userTeam || !Array.isArray(userPlayers) || !Array.isArray(allTeams)) return [];

  const userTeamId  = Number(userTeam.id);
  const blockPlayers = userPlayers.filter(
    p => Number(p?.teamId) === userTeamId && p?.onTradeBlock === true,
  );

  if (blockPlayers.length === 0) return [];

  const aiTeams = allTeams.filter(t => Number(t.id) !== userTeamId && t.isHuman !== true);
  if (aiTeams.length === 0) return [];

  const results = [];

  for (const player of blockPlayers) {
    // Unique seed per player × season × week
    let lcgSeed = ((Number(player.id ?? 0) * 1000 + Number(season ?? 0) * 100 + Number(week ?? 0)) >>> 0);

    // Fisher-Yates shuffle of AI teams using seeded LCG
    const shuffled = [...aiTeams];
    for (let i = shuffled.length - 1; i > 0; i--) {
      lcgSeed   = lcgStep(lcgSeed);
      const j   = Math.floor(lcgRandom(lcgSeed) * (i + 1));
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }

    const count = Math.min(MAX_PURSUERS_PER_PLAYER, shuffled.length);
    for (let k = 0; k < count; k++) {
      results.push({ aiTeam: shuffled[k], targetPlayerId: player.id });
    }
  }

  return results;
}
