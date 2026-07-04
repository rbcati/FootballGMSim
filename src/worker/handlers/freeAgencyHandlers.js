/**
 * freeAgencyHandlers.js — GET_FREE_AGENTS, SUBMIT_OFFER, WITHDRAW_OFFER.
 *
 * Extracted from worker.js (Worker Handler Registry V1); behavior unchanged.
 *
 * The pending-offer ledger helpers (getPendingOffersLedger,
 * savePendingOffersLedger, syncPendingOfferLedger, buildDemandSnapshotForOffer)
 * and the offer-resolution pipeline (resolvePendingFreeAgencyOffers) remain in
 * worker.js because the unmigrated offseason/FA-day systems also use them;
 * these handlers reach them through ctx.
 */
import { toUI } from '../protocol.js';
import { ensureDynastyMeta } from '../../core/dynasty-story.js';
import { getSalaryInflationMultiplier, inflateContract } from '../../core/economy.js';
import {
  inferTeamDirection,
  buildContractProfile,
  buildDemandFromProfile,
  evaluateReSignPriority,
  computeMarketHeat,
  buildDecisionTiming,
  marketHeatLabel,
} from '../../core/contract-market.js';
import { getTeamContextForNegotiation } from '../../core/teamContext/negotiationContext.js';
import { evaluateContractOffer, summarizeNegotiationStance } from '../../core/contracts/negotiation.js';
import { summarizePlayerMood } from '../../core/mood/playerMood.js';
import { getPlayerMoraleSummary } from '../../core/mood/playerMoraleEngine.js';
import { getPlayerAwardSummary } from '../../core/awards/awardEngine.js';
import {
  computePlayerLeverage,
  computeFranchiseReputation,
  applyNegotiationModifiers,
  getNegotiationContext,
} from '../../core/contracts/negotiationModifiers.js';
import { getCoachingInstabilityPenalty } from '../../core/coaching/coachingEngine.js';
import { getFreeAgencyDecisionState } from '../../core/freeAgency/decisionState.js';
import {
  PENDING_OFFER_STATUS,
  ensurePendingOffersList,
  computeReservedPendingCap,
  validateOfferAgainstReservedCap,
  buildOfferFeedback,
  createPendingOffer,
  upsertPendingOffer,
  markOfferResolved,
} from '../../core/freeAgency/pendingOffers.js';
import { buildScoutingSnapshot } from '../../core/staff-system.js';
import AiLogic from '../../core/ai-logic.js';

// ── Handler: GET_FREE_AGENTS ──────────────────────────────────────────────────

export async function handleGetFreeAgents(payload, id, ctx) {
  const { cache, post } = ctx;
  const meta = ensureDynastyMeta(cache.getMeta());
  const inflationMult = getSalaryInflationMultiplier(meta?.economy ?? {});
  const userTeamId = meta.userTeamId;
  // teamId 0 is a valid franchise (the default user team) — only a null/undefined
  // teamId means unsigned, so accepted players never linger in the FA pool.
  const allFreeAgents = cache.getAllPlayers().filter((p) => p.teamId == null || p.status === 'free_agent');
  const userTeam = cache.getTeam(userTeamId);
  const userDirection = inferTeamDirection(userTeam, Number(meta?.currentWeek ?? 1));
  const userWinPct = Math.max(0, Math.min(1, (() => {
    const wins = Number(userTeam?.wins ?? 0);
    const losses = Number(userTeam?.losses ?? 0);
    const ties = Number(userTeam?.ties ?? 0);
    const games = wins + losses + ties;
    return games > 0 ? (wins + ties * 0.5) / games : 0.5;
  })()));

  const freeAgents = allFreeAgents
    .map(p => {
        const continuity = ctx.getOffseasonReturnSnapshot(p.id, userTeamId, meta);
        const playbookKnowledgeScore = Math.max(0, Math.min(100, continuity ? Number(continuity?.schemeFit ?? p?.schemeFit ?? 50) : Number(p?.schemeFit ?? 50)));
        const playbookKnowledgeLabel = playbookKnowledgeScore >= 80
          ? 'High'
          : playbookKnowledgeScore >= 60
            ? 'Moderate'
            : playbookKnowledgeScore >= 35
              ? 'Low'
              : 'None';
        const scoutingView = buildScoutingSnapshot(p, userTeam, { fogStrength: Number(ctx.getLeagueSetting('scoutingFogStrength', 50)), commissionerMode: !!meta?.commissionerMode });
        // Summarize offers for UI — bidding war edition
        const offers = p.offers || [];
        const userOffer = offers.find(o => o.teamId === userTeamId);
        const profile = buildContractProfile(p);
        const heat = computeMarketHeat(p.pos, allFreeAgents);
        const baseAsk = inflateContract(buildDemandFromProfile(p, profile, {
          marketHeat: heat,
          morale: p.morale ?? 68,
          fit: Number(p?.schemeFit ?? 65),
          teamSuccess: userWinPct,
        }), inflationMult);
        // V2: apply negotiation modifiers (morale, awards, franchise reputation)
        const pMoraleSummary = getPlayerMoraleSummary(p);
        const pAwardSummary = getPlayerAwardSummary(p);
        const faCurrentSeason = Number(meta?.season ?? 0);
        const pLeverage = computePlayerLeverage(p, { moraleSummary: pMoraleSummary, awardSummary: pAwardSummary, currentSeason: faCurrentSeason });
        const faUserTeam = cache.getTeam(Number(userTeamId ?? 0));
        const faInstability = getCoachingInstabilityPenalty(faUserTeam?.coachHistory ?? [], 3);
        const fReputation = computeFranchiseReputation(meta, { userTeamId: Number(userTeamId ?? 0), currentSeason: faCurrentSeason, coachingInstabilityPenalty: faInstability });
        const ask = applyNegotiationModifiers(baseAsk, pLeverage, fReputation);
        const pNegCtx = getNegotiationContext(p, meta, { moraleSummary: pMoraleSummary, awardSummary: pAwardSummary, currentSeason: faCurrentSeason, userTeamId: Number(userTeamId ?? 0) });
        const reSignInsight = evaluateReSignPriority(p, {
          marketHeat: heat,
          teamDirection: userDirection,
          capRoom: userTeam?.capRoom ?? 0,
          teamSuccess: userWinPct,
          profile,
          demand: ask,
        });

        // Find the top bid (highest total contract value)
        let topBid = null;
        let topOfferValue = 0;
        let userTrailReason = null;
        for (const o of offers) {
            const c = o.contract;
            const val = (c.baseAnnual * c.yearsTotal) + (c.signingBonus || 0);
            if (val > topOfferValue) {
                topOfferValue = val;
                topBid = o;
            }
        }

        const annualCapHitForOffer = (offer) => {
            const c = offer?.contract ?? {};
            const years = Math.max(1, Number(c.yearsTotal ?? c.years ?? 1));
            const baseAnnual = Number(c.baseAnnual ?? c.annualSalary ?? c.annual ?? 0);
            const signingBonus = Number(c.signingBonus ?? 0);
            return Math.round((baseAnnual + (signingBonus / years)) * 10) / 10;
        };

        // Calculate user's bid value if they have one
        let userBidValue = 0;
        if (userOffer) {
            const uc = userOffer.contract;
            userBidValue = (uc.baseAnnual * uc.yearsTotal) + (uc.signingBonus || 0);
            if (topBid && topBid.teamId !== userTeamId) {
              const moneyGap = Math.round((topOfferValue - userBidValue) * 10) / 10;
              userTrailReason = moneyGap > 0.4 ? `Trailing on value by $${moneyGap}M` : 'Another team offers better fit';
            }
        }

        const mem = meta?.contractMarketMemory?.[String(p.id)] ?? {};
        const topGapRatio = topOfferValue > 0
          ? Math.max(0, ((ask.baseAnnual * ask.yearsTotal + (ask.signingBonus || 0)) - topOfferValue) / Math.max(1, (ask.baseAnnual * ask.yearsTotal + (ask.signingBonus || 0))))
          : 0;
        const decisionTiming = buildDecisionTiming(p, heat, offers.length, meta.phase, {
          waitCycles: Number(mem?.waitCycles ?? 0),
          moneyGapRatio: topGapRatio,
        });
        const detailTone = userOffer
          ? userOffer.teamId === topBid?.teamId
            ? (offers.length >= 3 ? "You're leading, but another team is close" : 'Your bid leads')
            : (userTrailReason || 'Another team currently leads')
          : (offers.length >= 2 ? 'Warm market' : 'Open market');
        const knownMarket = offers.length > 0 || !!userOffer || !!topBid;
        const riskLabelByRisk = {
          high: 'High risk of movement',
          medium: 'Moderate risk',
          low: 'Low immediate risk',
        };
        const patienceLabel = decisionTiming.patienceWeeks <= 1
          ? 'Ready to decide now'
          : decisionTiming.patienceWeeks <= 2
            ? 'Likely to decide soon'
            : `Decision window: ${decisionTiming.patienceWeeks} cycle${decisionTiming.patienceWeeks > 1 ? 's' : ''}`;
        const topPreferences = [
          ['money', profile.moneyPriority],
          ['contender', profile.contenderPriority],
          ['role', profile.rolePriority],
          ['security', profile.securityPriority],
          ['loyalty', profile.loyaltyPriority],
        ]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([tag]) => tag);

        const teamNegotiationContext = getTeamContextForNegotiation(p, userTeam, null, {
          teamDirection: userDirection,
          needsAtPosition: AiLogic.calculateTeamNeeds(userTeamId)?.[p.pos] ?? 1,
          rosterAtPosition: cache.getPlayersByTeam(userTeamId).filter((rp) => rp?.pos === p?.pos),
        });
        const userOfferEval = evaluateContractOffer(p, {
          ...teamNegotiationContext,
          schemeFitScore: Number(p?.schemeFit ?? 65),
          franchiseDirectionScore: userDirection === 'contender' ? 78 : userDirection === 'rebuilding' ? 44 : 58,
        }, userOffer ?? { contract: ask }, {
          profile,
          askTotalValue: (ask.baseAnnual * ask.yearsTotal) + (ask.signingBonus || 0),
          askAnnual: ask.baseAnnual,
          askYears: ask.yearsTotal,
        });
        const moodSummary = summarizePlayerMood(profile, teamNegotiationContext);
        const decisionState = getFreeAgencyDecisionState({
          negotiationStance: userOfferEval.negotiationStance,
          bidderCount: offers.length,
          urgency: decisionTiming.risk,
          valueGap: userOfferEval.valueGap,
        });

        return {
          id:        p.id,
          name:      p.name,
          pos:       p.pos,
          age:       p.age,
          ovr:       p.ovr,
          hofStatus: p.hofStatus ?? 'none',
          scoutOvr: scoutingView?.estimatedOvr ?? p.ovr,
          scoutUncertaintyBand: scoutingView?.uncertainty ?? 0,
          scoutConfidenceLabel: scoutingView?.confidenceLabel ?? 'Medium confidence',
          potential: p.potential ?? null,
          contract:  p.contract ?? null,
          traits:    p.traits ?? [],
          market: {
            heat: Math.round(heat * 100) / 100,
            heatLabel: marketHeatLabel(heat),
            bidderCount: offers.length,
            decision: decisionState.summary,
            decisionReason: `${decisionTiming.reason}. ${summarizeNegotiationStance(userOfferEval)}`,
            urgency: decisionTiming.risk,
            urgencyLabel: decisionTiming.risk === 'high'
              ? 'Decision expected soon'
              : decisionTiming.risk === 'medium'
                ? 'Decision window open'
                : 'No immediate deadline signal',
            timingState: decisionState.state,
            attention: detailTone,
            patienceWeeks: decisionTiming.patienceWeeks,
            patienceLabel,
            riskLabel: riskLabelByRisk[decisionTiming.risk] ?? 'Risk unknown',
            knownMarket,
            stateChips: decisionState.chips,
            motivationSummary: moodSummary.summary,
            fitScore: userOfferEval.score,
          },
          demandProfile: {
            headline: moodSummary.summary,
            willingness: ask.willingness,
            askAnnual: ask.baseAnnual,
            askYears: ask.yearsTotal,
            priorities: topPreferences,
            archetype: profile.archetype,
            contractOutlook: moodSummary.contractOutlook,
            negotiationStance: userOfferEval.negotiationStance,
            fitScore: userOfferEval.score,
            explanationSummary: userOfferEval.explanationSummary,
            // V2 negotiation modifier context
            leverageLabel: pNegCtx.leverageLabel,
            reputationLabel: pNegCtx.reputationLabel,
            feedbackLine: pNegCtx.feedbackLine,
            negotiationShift: ask._negotiationShift ?? 0,
          },
          playbookKnowledge: {
            score: Math.round(playbookKnowledgeScore),
            label: playbookKnowledgeLabel,
          },
          reSign: reSignInsight,
          offers: {
              count: offers.length,
              userOffered: !!userOffer,
              userIsTopBidder: !!userOffer && topBid && topBid.teamId === userTeamId,
              topOfferValue: Math.round(topOfferValue * 10) / 10,
              topBidTeam: topBid ? topBid.teamName : null,
              topBidAnnual: topBid ? Math.round(topBid.contract.baseAnnual * 10) / 10 : 0,
              topBidAnnualCapHit: topBid ? annualCapHitForOffer(topBid) : 0,
              topBidYears: topBid ? topBid.contract.yearsTotal : 0,
              topOfferContractModel: topBid?.contractModel ?? null,
              userBidAnnual: userOffer ? Math.round(userOffer.contract.baseAnnual * 10) / 10 : 0,
              userBidAnnualCapHit: userOffer ? annualCapHitForOffer(userOffer) : 0,
              userBidYears: userOffer ? userOffer.contract.yearsTotal : 0,
              userOfferContractModel: userOffer?.contractModel ?? null,
              userBidValue: Math.round(userBidValue * 10) / 10,
              userTrailReason,
          }
        };
    });

  // Include FA day state for UI
  const faDay = meta.freeAgencyState?.day ?? 1;
  const faMaxDays = meta.freeAgencyState?.maxDays ?? 5;

  // Market V2: the user team's pending offer ledger + cap reservation summary.
  const offerLedger = ensurePendingOffersList(meta.pendingOffers);
  const pendingOffers = offerLedger
    .filter((row) => Number(row.teamId) === Number(userTeamId))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const reservedPendingCap = computeReservedPendingCap(offerLedger, userTeamId);
  const userCapRoom = Math.round(Number(userTeam?.capRoom ?? 0) * 10) / 10;
  const capSummary = {
    capRoom: userCapRoom,
    reservedPendingCap,
    effectiveCapRoom: Math.round((userCapRoom - reservedPendingCap) * 10) / 10,
  };

  // aiFaEngine V1: count of non-user pending AI offers per player (badge data for UI).
  // AI bids live on player.offers (not in the pending ledger), so count there.
  // Amounts are NOT included — the UI only shows the count before resolution.
  const aiOfferCountByPlayerId = {};
  for (const p of cache.getAllPlayers()) {
    if (p.teamId != null && p.status !== 'free_agent') continue;
    if (!Array.isArray(p.offers) || p.offers.length === 0) continue;
    const aiCount = p.offers.filter((o) => Number(o?.teamId) !== Number(userTeamId)).length;
    if (aiCount > 0) aiOfferCountByPlayerId[String(p.id)] = aiCount;
  }

  post(toUI.FREE_AGENT_DATA, { freeAgents, faDay, faMaxDays, phase: meta.phase, pendingOffers, capSummary, aiOfferCountByPlayerId }, id);
}

// ── Handler: SUBMIT_OFFER ─────────────────────────────────────────────────────

export async function handleSubmitOffer({ playerId, teamId, contract }, id, ctx) {
  const { cache, post } = ctx;
  const teamCtx = ctx.resolveTeamContext(teamId);
  if (!teamCtx.ok) { post(toUI.ERROR, { message: teamCtx.message }, id); return; }
  const { teamId: resolvedTeamId, team } = teamCtx;

  const player = cache.getPlayer(playerId);
  if (!player) { post(toUI.ERROR, { message: 'Player not found' }, id); return; }

  // Cap check: the offer must fit inside cap room net of what other pending
  // offers from this team already reserve.
  const capHit = contract.baseAnnual + (contract.signingBonus / contract.yearsTotal);
  const ledger = ctx.getPendingOffersLedger();
  const capCheck = validateOfferAgainstReservedCap({
    capRoom: team.capRoom ?? 0,
    annualCapHit: capHit,
    pendingOffers: ledger,
    teamId: resolvedTeamId,
    playerId: player.id,
  });
  if (!capCheck.ok) {
    post(toUI.ERROR, { message: capCheck.message }, id);
    return;
  }

  // Add/Update offer
  if (!player.offers) player.offers = [];

  // Remove existing offer from this team if any
  const existingIdx = player.offers.findIndex(o => o.teamId === resolvedTeamId);
  if (existingIdx > -1) player.offers.splice(existingIdx, 1);

  player.offers.push({
      teamId: resolvedTeamId,
      teamName: team.name,
      contract,
      timestamp: Date.now()
  });

  // We strictly don't save "offers" to DB in this simplified model unless we updated schema.
  // But cache.updatePlayer marks it dirty.
  // IMPORTANT: Player object schema in DB needs to support 'offers'.
  // IndexedDB 'put' will handle extra fields fine.
  cache.updatePlayer(playerId, { offers: player.offers });

  const liveMeta = ensureDynastyMeta(cache.getMeta());

  // Record the bid in the league-level pending offer ledger (replaces any
  // previous pending offer from this team on this player).
  const faDay = Number(liveMeta?.freeAgencyState?.day ?? 1);
  const demandSnapshot = ctx.buildDemandSnapshotForOffer(player, team);
  const competingTeamIds = player.offers
    .map((o) => Number(o?.teamId))
    .filter((tid) => Number.isFinite(tid) && tid !== Number(resolvedTeamId));
  const quality = buildOfferFeedback({
    contract,
    demand: demandSnapshot,
    playerAge: player.age,
    competingOfferCount: competingTeamIds.length,
    capRoomAfter: capCheck.roomAfter,
  });
  const offerRecord = createPendingOffer({
    playerId: player.id,
    playerName: player.name,
    pos: player.pos,
    ovr: player.ovr,
    teamId: resolvedTeamId,
    teamName: team.name,
    contract,
    day: faDay,
    demandSnapshot,
    competingTeamIds,
    feedback: quality.feedback,
    score: quality.score,
  });
  ctx.savePendingOffersLedger(upsertPendingOffer(ledger, offerRecord).list, { day: faDay });
  const allFreeAgents = cache.getAllPlayers().filter((p) => !p.teamId || p.status === 'free_agent');
  const heat = computeMarketHeat(player.pos, allFreeAgents);
  const marketMemory = liveMeta?.contractMarketMemory?.[String(playerId)] ?? {};
  const decisionTiming = buildDecisionTiming(player, heat, player.offers.length, liveMeta.phase, {
    waitCycles: Number(marketMemory?.waitCycles ?? 0),
  });
  let immediateOutcome = null;
  if (liveMeta.phase !== 'free_agency' || decisionTiming.resolveNow) {
    immediateOutcome = await ctx.resolvePendingFreeAgencyOffers({
      resolutionDay: 7,
      onlyPlayerId: playerId,
      emitNotifications: false,
    });
    // Mirror any immediate resolution into the ledger so the offer's status
    // reads accepted/rejected instead of dangling as pending.
    ctx.syncPendingOfferLedger({ day: faDay });
  }

  await ctx.flushDirty();

  // Return updated FA data view so UI reflects the offer immediately
  // Also state update
  await handleGetFreeAgents({}, null, ctx); // Broadcast FA update if needed, but easier to just reply success
  const submittedOffer = ctx.getPendingOffersLedger().find((row) => row.id === offerRecord.id) ?? offerRecord;
  post(toUI.STATE_UPDATE, { ...ctx.buildViewState(), submittedOffer }, id);

  if (immediateOutcome?.signedCount > 0) {
    const resolved = immediateOutcome.results?.[0];
    if (resolved?.signedTeamId === resolvedTeamId) {
      post(toUI.NOTIFICATION, { level: 'info', message: `${resolved.playerName} accepted your offer immediately.` });
    } else if (resolved?.signedTeamName) {
      post(toUI.NOTIFICATION, { level: 'warn', message: `${resolved.playerName} signed with ${resolved.signedTeamName}.` });
    }
  } else if (immediateOutcome?.results?.[0]?.status === 'pending') {
    const pending = immediateOutcome?.results?.[0];
    if (pending?.changed || pending?.urgency === 'high') {
      post(toUI.NOTIFICATION, { level: pending?.urgency === 'high' ? 'warn' : 'info', message: `${player.name}: ${pending?.reason ?? decisionTiming.reason}.` });
    }
  } else if (!immediateOutcome) {
    post(toUI.NOTIFICATION, { level: 'info', message: `${player.name} logged your bid. ${decisionTiming.reason}.` });
  }
}

// ── Handler: WITHDRAW_OFFER ───────────────────────────────────────────────────

export async function handleWithdrawOffer({ playerId, teamId }, id, ctx) {
  const { cache, post } = ctx;
  const teamCtx = ctx.resolveTeamContext(teamId);
  if (!teamCtx.ok) { post(toUI.ERROR, { message: teamCtx.message }, id); return; }
  const { teamId: resolvedTeamId } = teamCtx;

  const player = cache.getPlayer(playerId);
  if (player && Array.isArray(player.offers)) {
    const nextOffers = player.offers.filter((o) => Number(o?.teamId) !== Number(resolvedTeamId));
    if (nextOffers.length !== player.offers.length) {
      cache.updatePlayer(player.id, { offers: nextOffers });
    }
  }

  const faDay = Number(cache.getMeta()?.freeAgencyState?.day ?? 1);
  ctx.savePendingOffersLedger(markOfferResolved(ctx.getPendingOffersLedger(), {
    playerId,
    teamId: resolvedTeamId,
    status: PENDING_OFFER_STATUS.WITHDRAWN,
    feedback: 'Offer withdrawn — cap reservation released.',
    day: faDay,
  }), { day: faDay });

  await ctx.flushDirty();
  await handleGetFreeAgents({}, null, ctx);
  post(toUI.STATE_UPDATE, ctx.buildViewState(), id);
}
