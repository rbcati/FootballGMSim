/**
 * pendingOffers.js
 *
 * League-level pending free-agency offer ledger (Free Agency Market V2).
 *
 * The operational bid list still lives on each player (`player.offers`) so the
 * existing AI bidding + decision pipeline keeps working unchanged. This module
 * adds a persistent, league-level record of submitted offers (user bids first
 * and foremost) so that:
 *   - pending offers reserve cap room before they resolve,
 *   - duplicate active offers from one team to one player are impossible,
 *   - every offer carries deterministic feedback explaining its quality,
 *   - resolutions (accepted / rejected / expired / withdrawn) survive the
 *     moment the player's own offer list is cleared, so the UI can explain
 *     what happened after the fact.
 *
 * All functions are pure: they take the ledger array (stored on
 * `meta.pendingOffers`) and return a new array. The worker owns persistence.
 */

export const PENDING_OFFER_STATUS = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  WITHDRAWN: 'withdrawn',
});

/** Resolved entries older than this many FA days get pruned from the ledger. */
const RESOLVED_RETENTION_DAYS = 14;
/** Hard ceiling on ledger size so saves never balloon. */
const MAX_LEDGER_ENTRIES = 200;
/** Pending offers clearly below demand reject after this many days pending. */
export const WEAK_OFFER_REJECT_DAYS = 2;
/** Any offer still pending after this many days expires. */
export const MAX_OFFER_PENDING_DAYS = 5;
/** Offers worth less than this fraction of the ask are "clearly below demand". */
export const WEAK_OFFER_VALUE_RATIO = 0.75;

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundMoney(value) {
  return Math.round(toNum(value) * 10) / 10;
}

/** Migration: any non-array value (missing field on old saves) becomes []. */
export function ensurePendingOffersList(value) {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === 'object') : [];
}

/** Normalize a meta object so `meta.pendingOffers` is always a valid array. */
export function ensurePendingOffersMeta(meta = {}) {
  if (Array.isArray(meta?.pendingOffers)) return meta;
  return { ...meta, pendingOffers: ensurePendingOffersList(meta?.pendingOffers) };
}

/** First-year cap hit, total value, etc. for a contract offer. */
export function computeOfferFinancials(contract = {}) {
  const years = Math.max(1, Math.round(toNum(contract.yearsTotal ?? contract.years, 1)));
  const baseAnnual = toNum(contract.baseAnnual ?? contract.annualSalary ?? contract.salary, 0);
  const signingBonus = toNum(contract.signingBonus, 0);
  return {
    years,
    baseAnnual: roundMoney(baseAnnual),
    signingBonus: roundMoney(signingBonus),
    annualCapHit: roundMoney(baseAnnual + signingBonus / years),
    totalValue: roundMoney(baseAnnual * years + signingBonus),
  };
}

function demandTotals(demand = {}) {
  const askYears = Math.max(1, Math.round(toNum(demand.yearsTotal ?? demand.years, 1)));
  const askAnnual = toNum(demand.baseAnnual, 0);
  const askBonus = toNum(demand.signingBonus, 0);
  return { askYears, askAnnual, askTotal: roundMoney(askAnnual * askYears + askBonus) };
}

/**
 * Deterministic offer quality + feedback. Same inputs always produce the same
 * score and lines (no randomness), so identical saves/seeds replay identically.
 */
export function buildOfferFeedback({
  contract = {},
  demand = {},
  playerAge = 27,
  competingOfferCount = 0,
  capRoomAfter = null,
} = {}) {
  const fin = computeOfferFinancials(contract);
  const { askYears, askAnnual, askTotal } = demandTotals(demand);
  const valueRatio = askTotal > 0 ? fin.totalValue / askTotal : 1;
  const annualRatio = askAnnual > 0 ? fin.baseAnnual / askAnnual : 1;
  const bonusShare = fin.totalValue > 0 ? fin.signingBonus / fin.totalValue : 0;

  const lines = [];
  let verdict = 'competitive';

  if (valueRatio >= 1 && annualRatio >= 0.95) {
    verdict = 'strong';
    lines.push('Strong offer — meets demand and gives starter-level security.');
  } else if (valueRatio >= 0.88) {
    verdict = 'competitive';
    lines.push('Competitive offer — close to the player’s asking price.');
  } else if (valueRatio >= WEAK_OFFER_VALUE_RATIO) {
    verdict = 'borderline';
    lines.push('Below asking price — the player will weigh it against other bids.');
  } else {
    verdict = 'weak';
    lines.push('Low annual value — player is waiting for a better market.');
  }

  if (playerAge >= 30 && fin.years > askYears) {
    lines.push('Term mismatch — veteran prefers shorter commitment.');
  } else if (playerAge <= 26 && fin.years < Math.max(1, askYears - 1)) {
    lines.push('Term mismatch — young player wants longer-term security.');
  }

  if (verdict !== 'weak' && bonusShare < 0.05 && toNum(demand.signingBonus, 0) > 0) {
    lines.push('Light guarantees — a stronger signing bonus would help the bid.');
  }

  if (capRoomAfter != null && toNum(capRoomAfter) < 0) {
    lines.push('Cap risk — offer is pending but may be rejected if room disappears.');
  }

  if (competingOfferCount >= 2) {
    lines.push(`Competing offers in play (${competingOfferCount} other team${competingOfferCount === 1 ? '' : 's'}) — expect a bidding war.`);
  }

  return {
    verdict,
    score: Math.max(0, Math.min(100, Math.round(valueRatio * 80 + (annualRatio >= 0.95 ? 10 : 0) + bonusShare * 25))),
    valueRatio: Math.round(valueRatio * 100) / 100,
    feedback: lines,
  };
}

/** Build a ledger record for a submitted offer. */
export function createPendingOffer({
  playerId,
  playerName = null,
  pos = null,
  ovr = null,
  teamId,
  teamName = null,
  contract = {},
  day = 1,
  demandSnapshot = null,
  competingTeamIds = [],
  feedback = null,
  score = null,
  createdAt = Date.now(),
} = {}) {
  const fin = computeOfferFinancials(contract);
  return {
    id: `fa-offer-${playerId}-${teamId}-${day}-${createdAt}`,
    playerId: Number(playerId),
    playerName,
    pos,
    ovr,
    teamId: Number(teamId),
    teamName,
    contract: { ...contract },
    annualCapHit: fin.annualCapHit,
    totalValue: fin.totalValue,
    years: fin.years,
    signingBonus: fin.signingBonus,
    status: PENDING_OFFER_STATUS.PENDING,
    daySubmitted: toNum(day, 1),
    daysPending: 0,
    resolvedDay: null,
    playerDemandSnapshot: demandSnapshot ? { ...demandSnapshot } : null,
    score,
    feedback: Array.isArray(feedback) ? feedback : feedback ? [feedback] : [],
    competingTeamIds: (Array.isArray(competingTeamIds) ? competingTeamIds : [])
      .map(Number)
      .filter((id) => Number.isFinite(id) && id !== Number(teamId)),
    createdAt,
  };
}

function isPending(row) {
  return row?.status === PENDING_OFFER_STATUS.PENDING;
}

function matches(row, playerId, teamId) {
  return Number(row?.playerId) === Number(playerId) && Number(row?.teamId) === Number(teamId);
}

/**
 * Insert or replace an offer. A team can never hold two active pending offers
 * on the same player — re-submitting replaces the previous bid.
 * Returns { list, replaced }.
 */
export function upsertPendingOffer(list, record) {
  const ledger = ensurePendingOffersList(list);
  const replaced = ledger.some((row) => isPending(row) && matches(row, record.playerId, record.teamId));
  const next = ledger.filter((row) => !(isPending(row) && matches(row, record.playerId, record.teamId)));
  next.push(record);
  return { list: next, replaced };
}

export function getActivePendingOffers(list, teamId = null) {
  return ensurePendingOffersList(list).filter(
    (row) => isPending(row) && (teamId == null || Number(row.teamId) === Number(teamId)),
  );
}

export function findPendingOffer(list, playerId, teamId) {
  return ensurePendingOffersList(list).find((row) => isPending(row) && matches(row, playerId, teamId)) ?? null;
}

/**
 * Cap reserved by a team's pending offers (sum of first-year cap hits).
 * `excludePlayerId` lets a replacement offer not double-count against itself.
 */
export function computeReservedPendingCap(list, teamId, { excludePlayerId = null } = {}) {
  return roundMoney(
    getActivePendingOffers(list, teamId)
      .filter((row) => excludePlayerId == null || Number(row.playerId) !== Number(excludePlayerId))
      .reduce((sum, row) => sum + toNum(row.annualCapHit), 0),
  );
}

export function computeEffectiveCapRoom(capRoom, list, teamId, opts = {}) {
  return roundMoney(toNum(capRoom) - computeReservedPendingCap(list, teamId, opts));
}

/**
 * Validate a new offer against cap room net of existing pending reservations.
 * Pure so the worker handler stays thin and this stays unit-testable.
 */
export function validateOfferAgainstReservedCap({
  capRoom = 0,
  annualCapHit = 0,
  pendingOffers = [],
  teamId,
  playerId = null,
} = {}) {
  const reserved = computeReservedPendingCap(pendingOffers, teamId, { excludePlayerId: playerId });
  const effectiveCapRoom = roundMoney(toNum(capRoom) - reserved);
  const roomAfter = roundMoney(effectiveCapRoom - toNum(annualCapHit));
  if (toNum(annualCapHit) > toNum(capRoom)) {
    return {
      ok: false, reserved, effectiveCapRoom, roomAfter,
      message: `Not enough cap room: this offer carries a $${roundMoney(annualCapHit)}M cap hit against $${roundMoney(capRoom)}M of room.`,
    };
  }
  if (roomAfter < 0) {
    return {
      ok: false, reserved, effectiveCapRoom, roomAfter,
      message: `Pending offers already reserve $${reserved}M of cap. This bid would exceed your effective room ($${effectiveCapRoom}M) by $${Math.abs(roomAfter)}M. Withdraw a pending offer first.`,
    };
  }
  return { ok: true, reserved, effectiveCapRoom, roomAfter, message: null };
}

/** Age every pending offer by one free-agency day. */
export function agePendingOffers(list) {
  return ensurePendingOffersList(list).map((row) =>
    isPending(row) ? { ...row, daysPending: toNum(row.daysPending) + 1 } : row,
  );
}

/** Resolve one offer's status (releases its cap reservation by leaving 'pending'). */
export function markOfferResolved(list, { playerId, teamId, status, feedback = null, day = null }) {
  return ensurePendingOffersList(list).map((row) => {
    if (!isPending(row) || !matches(row, playerId, teamId)) return row;
    return {
      ...row,
      status,
      resolvedDay: day,
      feedback: feedback ? (Array.isArray(feedback) ? feedback : [feedback]) : row.feedback,
    };
  });
}

/**
 * Reconcile the ledger against current player state after a market pass
 * (AI day processing or week-advance resolution). For each pending entry:
 *   - player signed with the offering team        → accepted
 *   - player signed elsewhere                     → rejected (signed elsewhere)
 *   - still FA but team's bid vanished            → rejected (bid dropped, e.g. cap)
 *   - still FA, clearly weak, past reject window  → rejected (below market)
 *   - still FA, pending too long                  → expired
 *   - otherwise                                   → stays pending, competing list refreshed
 *
 * `resolvePlayer(playerId)` returns the live player (or null).
 * Returns { list, accepted, rejected, expired, offerRemovals } where
 * `offerRemovals` are {playerId, teamId} pairs the caller must strip from
 * `player.offers` so dead bids stop influencing decisions.
 */
export function reconcilePendingOffers({
  pendingOffers,
  resolvePlayer,
  resolveTeamName = () => null,
  day = 1,
  weakRejectDays = WEAK_OFFER_REJECT_DAYS,
  maxPendingDays = MAX_OFFER_PENDING_DAYS,
} = {}) {
  const accepted = [];
  const rejected = [];
  const expired = [];
  const offerRemovals = [];

  const list = ensurePendingOffersList(pendingOffers).map((row) => {
    if (!isPending(row)) return row;
    const player = typeof resolvePlayer === 'function' ? resolvePlayer(row.playerId) : null;

    if (!player) {
      const next = { ...row, status: PENDING_OFFER_STATUS.EXPIRED, resolvedDay: day, feedback: ['Player is no longer available.'] };
      expired.push(next);
      return next;
    }

    const signedTeamId = player.teamId != null && player.status !== 'free_agent' ? Number(player.teamId) : null;
    if (signedTeamId != null && signedTeamId === Number(row.teamId)) {
      const next = { ...row, status: PENDING_OFFER_STATUS.ACCEPTED, resolvedDay: day, feedback: ['Accepted — best current offer after day advanced.'] };
      accepted.push(next);
      return next;
    }
    if (signedTeamId != null) {
      const teamName = resolveTeamName(signedTeamId) ?? 'another team';
      const next = { ...row, status: PENDING_OFFER_STATUS.REJECTED, resolvedDay: day, feedback: [`Rejected — signed with ${teamName} instead.`] };
      rejected.push(next);
      return next;
    }

    // Still a free agent.
    const stillListed = Array.isArray(player.offers)
      && player.offers.some((o) => Number(o?.teamId) === Number(row.teamId));
    if (!stillListed) {
      const next = { ...row, status: PENDING_OFFER_STATUS.REJECTED, resolvedDay: day, feedback: ['Rejected — the bid is no longer on the table (cap room disappeared).'] };
      rejected.push(next);
      return next;
    }

    const ask = demandTotals(row.playerDemandSnapshot ?? {});
    const isWeak = ask.askTotal > 0 && toNum(row.totalValue) < ask.askTotal * WEAK_OFFER_VALUE_RATIO;
    if (isWeak && toNum(row.daysPending) >= weakRejectDays) {
      const next = { ...row, status: PENDING_OFFER_STATUS.REJECTED, resolvedDay: day, feedback: ['Rejected — offer stayed well below the player’s market and he moved on.'] };
      rejected.push(next);
      offerRemovals.push({ playerId: Number(row.playerId), teamId: Number(row.teamId) });
      return next;
    }
    if (toNum(row.daysPending) >= maxPendingDays) {
      const next = { ...row, status: PENDING_OFFER_STATUS.EXPIRED, resolvedDay: day, feedback: ['Expired — the negotiation window closed without a deal.'] };
      expired.push(next);
      offerRemovals.push({ playerId: Number(row.playerId), teamId: Number(row.teamId) });
      return next;
    }

    const competingTeamIds = (player.offers ?? [])
      .map((o) => Number(o?.teamId))
      .filter((id) => Number.isFinite(id) && id !== Number(row.teamId));
    return { ...row, competingTeamIds };
  });

  return { list, accepted, rejected, expired, offerRemovals };
}

/** Expire every still-pending offer (used when the FA period closes). */
export function expireAllPendingOffers(list, { day = null, reason = 'Expired — free agency period ended.' } = {}) {
  const expired = [];
  const next = ensurePendingOffersList(list).map((row) => {
    if (!isPending(row)) return row;
    const out = { ...row, status: PENDING_OFFER_STATUS.EXPIRED, resolvedDay: day, feedback: [reason] };
    expired.push(out);
    return out;
  });
  return { list: next, expired };
}

/** Drop ancient resolved entries and cap ledger size so saves stay small. */
export function prunePendingOffers(list, { day = 1 } = {}) {
  const ledger = ensurePendingOffersList(list).filter((row) => {
    if (isPending(row)) return true;
    const resolvedDay = toNum(row.resolvedDay, toNum(row.daySubmitted, 0));
    return day - resolvedDay <= RESOLVED_RETENTION_DAYS;
  });
  return ledger.length > MAX_LEDGER_ENTRIES ? ledger.slice(-MAX_LEDGER_ENTRIES) : ledger;
}
