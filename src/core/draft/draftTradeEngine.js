/**
 * draftTradeEngine.js
 *
 * Pure, deterministic draft-day trade-up coordinator.
 * Runs only during the 'draft' stage.
 *
 * Design constraints:
 *  - No imports from UI, worker, cache, or DB.
 *  - No Math.random — uses same LCG pattern as combineEngine / aiToAiTradeEngine.
 *  - Returns new objects — no mutation of inputs.
 *  - Fully deterministic given the same inputs.
 *
 * State shape expected by findDraftTradeUpOpportunity / applyDraftTradeUp:
 *   state = {
 *     meta:        { draftState: { picks, currentPickIndex }, userTeamId, year, tradeOffers },
 *     teams:       Array<team>,          // all teams in league
 *     rosters:     Array<player>,        // all active (non-draft-eligible) players
 *     draftPool:   Array<player>,        // draft-eligible players, sorted by OVR desc
 *     futurePicks: Array<pick>,          // future-season draft picks (with currentOwner)
 *   }
 */

import { classifyTeam, findStarterGap } from '../trades/aiToAiTradeEngine.js';
import { generateSlottedRookieContract } from '../contracts/rookieWageScale.js';

// ── Constants ──────────────────────────────────────────────────────────────────

export const DRAFT_TRADE_CONFIG = Object.freeze({
  standoutThreshold:        8.5,
  proximityWindow:          15,
  maxSearchAttempts:        4,
  firstRoundFuturePickCost: ['2', '3'],
  tickerPriority:           85,
});

// ── LCG (same params as combineEngine / aiToAiTradeEngine) ────────────────────

function lcgStep(seed) {
  return ((1664525 * (seed >>> 0) + 1013904223) >>> 0);
}

// ── isCombineStandout ─────────────────────────────────────────────────────────

/**
 * True if the prospect's combine grade meets the standout threshold.
 * Safe to call when combineMetrics is null/undefined (returns false).
 */
export function isCombineStandout(prospect) {
  const grade = prospect?.combineMetrics?.combineGrade;
  if (grade === null || grade === undefined) return false;
  return Number(grade) >= DRAFT_TRADE_CONFIG.standoutThreshold;
}

// ── isProspectWithinTradeUpWindow ─────────────────────────────────────────────

/**
 * True if the prospect is a combine standout AND their projected draft slot
 * is within proximityWindow picks of currentPickNumber.
 *
 * Uses prospect.projectedRound (or mockRound) as the source of the projected
 * slot — both are real fields already used by draftBoardAnalysis.js.
 * When neither is present, falls back to treating the prospect as within
 * window (let other guards handle qualification).
 *
 * Estimated slot = midpoint of projected round = (round − 1) × 32 + 16.
 */
export function isProspectWithinTradeUpWindow(prospect, currentPickNumber) {
  if (!isCombineStandout(prospect)) return false;
  const round = Number(prospect.projectedRound ?? prospect.mockRound ?? 0);
  if (round === 0) return true; // no projection info — assume in window
  const estimatedSlot = (round - 1) * 32 + 16;
  return Math.abs(estimatedSlot - currentPickNumber) <= DRAFT_TRADE_CONFIG.proximityWindow;
}

// ── getStarterNeedAtPosition ──────────────────────────────────────────────────

/**
 * Returns starter OVR and whether the team has a severe starter need at the
 * given position.  Severe need = best OVR at position < 75.
 *
 * @param {object} team
 * @param {string} position
 * @param {Array}  allRosters  – all active (non-draft-eligible) players
 * @returns {{ severeNeed: boolean, bestOvr: number }}
 */
export function getStarterNeedAtPosition(team, position, allRosters) {
  const gap = findStarterGap(team, allRosters ?? [], position);
  // findStarterGap returns bestOvr = 0 when no players at position → severe need
  return {
    severeNeed: gap.bestOvr < 75 || gap.gapSeverity === 'severe',
    bestOvr:    gap.bestOvr,
  };
}

// ── teamCanAffordRookie ───────────────────────────────────────────────────────

/**
 * Returns true if the team can absorb the projected rookie cap hit after the
 * pick at projectedSlot, without going negative on the cap.
 *
 * Uses generateSlottedRookieContract (the canonical scale) to compute the hit.
 */
export function teamCanAffordRookie(team, projectedSlot) {
  const capSpace = Number(team?.capSpace ?? team?.capRoom ?? 0);
  const contract = generateSlottedRookieContract(Math.max(1, Number(projectedSlot) || 1));
  const rookieHit = Number(contract?.baseAnnual ?? 1.5);
  return capSpace - rookieHit >= 0;
}

// ── buildTradeUpPackage ───────────────────────────────────────────────────────

/**
 * Builds the pick package the buyer offers the seller.
 *
 * Round 1 move-up: buyer's later current-draft pick + a future 2nd or 3rd.
 * Rounds 2/3 move-up: buyer's later current-draft pick only.
 *
 * @param {object} buyerTeam
 * @param {object} currentPick   – the pick the buyer wants (seller's current pick)
 * @param {object} buyerPick     – buyer's later pick in this draft they're giving up
 * @param {Array}  futurePicks   – future-season picks with currentOwner field
 * @returns {{ currentPickPackage: object, futurePick: object|null } | null}
 */
export function buildTradeUpPackage(buyerTeam, currentPick, buyerPick, futurePicks) {
  if (!buyerPick) return null;

  const isFirstRoundMove = Number(currentPick?.round ?? 0) === 1;

  const pkg = {
    currentPickPackage: buyerPick,
    futurePick:         null,
  };

  if (isFirstRoundMove) {
    const costRounds = DRAFT_TRADE_CONFIG.firstRoundFuturePickCost.map(Number);
    const buyerFuture = (futurePicks ?? []).find((fp) => {
      const owner = Number(fp?.currentOwner ?? fp?.teamId ?? -1);
      if (owner !== Number(buyerTeam?.id)) return false;
      return costRounds.includes(Number(fp?.round));
    });
    if (!buyerFuture) return null; // can't afford round-1 move without future pick
    pkg.futurePick = buyerFuture;
  }

  return pkg;
}

// ── isSellerWillingToMoveDown ─────────────────────────────────────────────────

/**
 * True if the seller would rationally accept moving down.
 *
 * Sellers are willing when:
 *  - They are classified as a rebuilder (want more picks, not the player), OR
 *  - They have no immediate starter need at the target position (bestOvr >= 75)
 *
 * Uses the same classifyTeam as aiToAiTradeEngine so there is only one classifier.
 *
 * @param {object} sellerTeam
 * @param {string} targetPosition  – position of the standout prospect
 * @param {object} leagueState     – { teams, rosters }
 */
export function isSellerWillingToMoveDown(sellerTeam, targetPosition, leagueState) {
  const { teams = [], rosters = [] } = leagueState;
  const role = classifyTeam(sellerTeam, teams);
  if (role === 'rebuilder') return true;

  const { bestOvr } = getStarterNeedAtPosition(sellerTeam, targetPosition, rosters);
  return bestOvr >= 75; // already has a starter → willing to move down
}

// ── evaluateDraftTradeUp ──────────────────────────────────────────────────────

/**
 * Pure validator that returns whether a draft trade-up is feasible.
 *
 * Checks (in order):
 *  1. Prospect is a combine standout.
 *  2. Buyer has a severe starter need at the target position.
 *  3. Seller is willing to move down.
 *  4. Buyer has a legal pick to offer in this draft.
 *  5. Buyer can absorb the rookie cap hit.
 *  6. Package can be assembled (future pick available for round-1 moves).
 *
 * @param {{ buyerTeam, sellerTeam, currentPick, targetProspect, state }} params
 * @returns {{ ok: boolean, package: object|null, reason: string }}
 */
export function evaluateDraftTradeUp({ buyerTeam, sellerTeam, currentPick, targetProspect, state }) {
  const { teams = [], rosters = [], futurePicks = [] } = state;
  const picks         = state.meta?.draftState?.picks ?? [];
  const currentIdx    = state.meta?.draftState?.currentPickIndex ?? 0;

  if (!isCombineStandout(targetProspect)) {
    return { ok: false, package: null, reason: 'not_standout' };
  }

  const { severeNeed } = getStarterNeedAtPosition(buyerTeam, targetProspect.pos, rosters);
  if (!severeNeed) {
    return { ok: false, package: null, reason: 'no_need_alignment' };
  }

  if (!isSellerWillingToMoveDown(sellerTeam, targetProspect.pos, { teams, rosters })) {
    return { ok: false, package: null, reason: 'seller_unwilling' };
  }

  // Buyer must have a later pick in this draft to offer
  const buyerLaterPick = picks.find(
    (pk, idx) => idx > currentIdx && Number(pk.teamId) === Number(buyerTeam.id) && !pk.playerId,
  );
  if (!buyerLaterPick) {
    return { ok: false, package: null, reason: 'no_buyer_pick' };
  }

  if (!teamCanAffordRookie(buyerTeam, currentPick.overall)) {
    return { ok: false, package: null, reason: 'cap_insufficient' };
  }

  const tradePackage = buildTradeUpPackage(buyerTeam, currentPick, buyerLaterPick, futurePicks);
  if (!tradePackage) {
    return { ok: false, package: null, reason: 'package_unavailable' };
  }

  return { ok: true, package: tradePackage, reason: 'ok' };
}

// ── findDraftTradeUpOpportunity ───────────────────────────────────────────────

/**
 * Scans the current pick context for a valid draft trade-up opportunity.
 *
 * Returns one of:
 *   { type: 'ai_to_ai',   buyerTeamId, sellerTeamId, targetProspectId, package, targetProspect, currentPick }
 *   { type: 'ai_to_user', buyerTeamId, sellerTeamId, targetProspectId, package, targetProspect, currentPick }
 *   null
 *
 * Rules:
 *  - Seller = team currently on the clock (owner of currentPick).
 *  - If the seller is the user team, type is 'ai_to_user' (not auto-executed).
 *  - Buyer must be an AI team with a later pick in this draft.
 *  - Searches up to maxSearchAttempts buyer candidates deterministically.
 *  - Returns null when no standout is near or no willing buyer exists.
 *  - Guards against re-evaluation of the same pick via meta.draftTradeUpEvaluatedPickIdx.
 *
 * @param {object} state  – { meta, teams, rosters, draftPool, futurePicks }
 * @returns {object|null}
 */
export function findDraftTradeUpOpportunity(state) {
  const { meta, teams = [], rosters = [], draftPool = [], futurePicks = [] } = state;
  if (!meta?.draftState) return null;

  const { picks, currentPickIndex } = meta.draftState;
  if (!picks || currentPickIndex >= picks.length) return null;

  const currentPick = picks[currentPickIndex];
  if (!currentPick || currentPick.playerId) return null;

  // Guard: one evaluation per pick slot
  if (Number(meta.draftTradeUpEvaluatedPickIdx ?? -1) === Number(currentPickIndex)) return null;

  const userTeamId = meta.userTeamId;
  const sellerTeamId = currentPick.teamId;
  const sellerTeam = teams.find((t) => Number(t.id) === Number(sellerTeamId));
  if (!sellerTeam) return null;

  // Find combine standouts within the proximity window
  const standouts = draftPool.filter(
    (p) => isCombineStandout(p) && isProspectWithinTradeUpWindow(p, currentPick.overall),
  );
  if (standouts.length === 0) return null;

  // Best standout (pool assumed sorted by OVR desc by caller)
  const targetProspect = standouts[0];

  // Build deterministic seed from pick context
  const baseSeed = ((Number(currentPick.overall) * 2654435761 +
                     Number(currentPick.teamId)  * 40503 +
                     Number(meta.year ?? 2025)   * 12345) >>> 0);

  // Collect buyer candidates: AI teams with picks AFTER the current pick
  const seenTeams = new Set([Number(sellerTeamId)]);
  const buyerCandidates = [];

  for (
    let i = currentPickIndex + 1;
    i < picks.length && buyerCandidates.length < DRAFT_TRADE_CONFIG.maxSearchAttempts;
    i++
  ) {
    const pk = picks[i];
    if (pk.playerId) continue;
    const tid = Number(pk.teamId);
    if (tid === Number(userTeamId)) continue; // user team is never the buyer in this scan
    if (seenTeams.has(tid)) continue;
    const team = teams.find((t) => Number(t.id) === tid);
    if (team) {
      seenTeams.add(tid);
      buyerCandidates.push({ team, pick: pk });
    }
  }

  if (buyerCandidates.length === 0) return null;

  // Deterministic ordering of candidates by LCG-derived key
  const orderedCandidates = [...buyerCandidates].sort((a, b) => {
    const ka = lcgStep((Number(a.team.id) ^ baseSeed) >>> 0);
    const kb = lcgStep((Number(b.team.id) ^ baseSeed) >>> 0);
    return ka - kb;
  });

  const evalState = { meta, teams, rosters, draftPool, futurePicks };

  for (const { team: buyerTeam } of orderedCandidates) {
    const result = evaluateDraftTradeUp({
      buyerTeam,
      sellerTeam,
      currentPick,
      targetProspect,
      state: evalState,
    });
    if (!result.ok) continue;

    // Determine type: if the seller is the user, the trade must be offered to them
    const type = Number(sellerTeamId) === Number(userTeamId) ? 'ai_to_user' : 'ai_to_ai';

    return {
      type,
      buyerTeamId:      buyerTeam.id,
      sellerTeamId,
      targetProspectId: targetProspect.id,
      package:          result.package,
      targetProspect,
      currentPick,
    };
  }

  return null;
}

// ── applyDraftTradeUp ─────────────────────────────────────────────────────────

/**
 * Executes a draft trade-up by transferring pick ownership and recording the trade.
 *
 * For type 'ai_to_ai':  executes immediately, returns updated state.
 * For type 'ai_to_user': returns updated state with pausedForUserOffer = true
 *   (the caller is responsible for creating the pending proposal and pausing the loop).
 *
 * Pick transfer:
 *  - currentPick.teamId → buyerTeamId
 *  - buyer's later pick.teamId → sellerTeamId
 *  - futurePick.currentOwner → sellerTeamId  (when package includes a future pick)
 *
 * @param {object} opportunity  – result of findDraftTradeUpOpportunity
 * @param {object} state        – same shape as findDraftTradeUpOpportunity state
 * @returns {{ state: object, headline: object|null, ticker: object|null, pausedForUserOffer: boolean }}
 */
export function applyDraftTradeUp(opportunity, state) {
  const { buyerTeamId, sellerTeamId, currentPick, package: pkg, targetProspect } = opportunity;

  // ── Clone draftState picks (immutable pattern) ────────────────────────────
  const draftState     = state.meta?.draftState;
  const currentIdx     = Number(draftState?.currentPickIndex ?? 0);
  const picks          = (draftState?.picks ?? []).map((pk) => ({ ...pk }));

  // Transfer current pick to buyer
  const cpIdx = picks.findIndex((pk, i) => i === currentIdx);
  if (cpIdx !== -1) picks[cpIdx] = { ...picks[cpIdx], teamId: buyerTeamId };

  // Transfer buyer's later pick to seller
  if (pkg?.currentPickPackage) {
    const bpOverall = Number(pkg.currentPickPackage.overall);
    const bpIdx = picks.findIndex(
      (pk, i) => i > currentIdx && Number(pk.teamId) === Number(buyerTeamId) &&
                 !pk.playerId && Number(pk.overall) === bpOverall,
    );
    if (bpIdx !== -1) picks[bpIdx] = { ...picks[bpIdx], teamId: sellerTeamId };
  }

  // ── Transfer future pick (round-1 moves) ──────────────────────────────────
  let futurePicks = state.futurePicks ?? [];
  if (pkg?.futurePick) {
    const fpId = pkg.futurePick.id;
    futurePicks = futurePicks.map((fp) =>
      fp.id === fpId
        ? { ...fp, currentOwner: sellerTeamId, teamId: sellerTeamId }
        : fp,
    );
  }

  // ── Trade record ──────────────────────────────────────────────────────────
  const offerId     = `dtup_${buyerTeamId}_${sellerTeamId}_p${currentPick.overall}_y${state.meta?.year ?? 2025}`;
  const tradeRecord = {
    offerId,
    origin:            'draft_trade_up',
    fromTeamId:        buyerTeamId,
    status:            'accepted',
    isBlockOffer:      false,
    pickNumber:        currentPick.overall,
    buyerTeamId,
    sellerTeamId,
    targetProspectId:  targetProspect.id,
    targetProspectName: targetProspect.name,
    targetProspectPos:  targetProspect.pos,
    combineGrade:       targetProspect.combineMetrics?.combineGrade ?? null,
  };

  const existingOffers = Array.isArray(state.meta?.tradeOffers) ? state.meta.tradeOffers : [];

  // ── Build headline & ticker payloads ──────────────────────────────────────
  const buyerTeam  = (state.teams ?? []).find((t) => Number(t.id) === Number(buyerTeamId));
  const sellerTeam = (state.teams ?? []).find((t) => Number(t.id) === Number(sellerTeamId));
  const gradeStr   = (targetProspect.combineMetrics?.combineGrade ?? 0).toFixed(1);

  const headline = {
    type:     'TRANSACTION',
    text:     `DRAFT SHOCK: ${buyerTeam?.name ?? `Team ${buyerTeamId}`} trades up to grab athletic freak ${targetProspect.name}!`,
    detail:   `The ${buyerTeam?.name ?? `Team ${buyerTeamId}`} executed a blockbuster draft-day trade with the ${sellerTeam?.name ?? `Team ${sellerTeamId}`}, moving up to pick #${currentPick.overall} to secure ${targetProspect.name} (${targetProspect.pos}) after a ${gradeStr} combine grade.`,
    category: 'MILESTONE',
    priority: DRAFT_TRADE_CONFIG.tickerPriority,
    buyerTeamId,
    sellerTeamId,
  };

  const ticker = {
    type:          'draft_trade_up',
    text:          `📢 TRADE-UP: ${buyerTeam?.abbr ?? buyerTeam?.name ?? `Team ${buyerTeamId}`} acquired Pick #${currentPick.overall}!`,
    pickNumber:    currentPick.overall,
    buyerTeam:     buyerTeam?.name ?? null,
    buyerTeamAbbr: buyerTeam?.abbr ?? null,
  };

  // ── Build updated state ───────────────────────────────────────────────────
  const newMeta = {
    ...state.meta,
    draftState: {
      ...draftState,
      picks,
    },
    tradeOffers:               [...existingOffers, tradeRecord],
    draftLastTradeUp:          ticker,
    draftTradeUpEvaluatedPickIdx: currentIdx,
  };

  const newState = { ...state, meta: newMeta, futurePicks };

  return {
    state:              newState,
    headline,
    ticker,
    pausedForUserOffer: opportunity.type === 'ai_to_user',
  };
}
