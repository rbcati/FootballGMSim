const STATUS_LABELS = Object.freeze({
  safe: 'Safe',
  manageable: 'Manageable',
  tight: 'Tight',
  overcommitted: 'Overcommitted',
  unknown: 'Unknown',
});

function toFiniteNumber(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundMoney(value) {
  const n = toFiniteNumber(value, null);
  return n == null ? null : Math.round(n * 10) / 10;
}

function resolveCurrentCapRoom(team = {}, explicitCapRoom = null) {
  const direct = toFiniteNumber(explicitCapRoom, null) ?? toFiniteNumber(team?.capRoom, null) ?? toFiniteNumber(team?.capSpace, null);
  if (direct != null) return roundMoney(direct);
  const total = toFiniteNumber(team?.capTotal, null);
  const used = toFiniteNumber(team?.capUsed, null);
  const dead = toFiniteNumber(team?.deadCap, 0);
  if (total != null && used != null) return roundMoney(total - used - dead);
  return null;
}

function resolveYears(offer = {}, player = {}) {
  return toFiniteNumber(
    offer?.contract?.yearsTotal
      ?? offer?.contract?.years
      ?? offer?.contract?.yearsRemaining
      ?? offer?.yearsTotal
      ?? offer?.years
      ?? offer?.userBidYears
      ?? offer?.topBidYears
      ?? player?.offers?.userBidYears
      ?? player?.offers?.topBidYears,
    null,
  );
}

function resolveAnnualValue(offer = {}, player = {}) {
  const years = Math.max(1, toFiniteNumber(resolveYears(offer, player), 1));
  const baseAnnual = toFiniteNumber(
    offer?.annualCapHit
      ?? offer?.capHit
      ?? offer?.contract?.annualCapHit
      ?? offer?.contract?.capHit,
    null,
  );
  if (baseAnnual != null) return roundMoney(baseAnnual);

  const base = toFiniteNumber(
    offer?.contract?.baseAnnual
      ?? offer?.contract?.annualSalary
      ?? offer?.contract?.annual
      ?? offer?.baseAnnual
      ?? offer?.annualSalary
      ?? offer?.annualValue
      ?? offer?.salary
      ?? offer?.userBidAnnual
      ?? player?.offers?.userBidAnnual,
    null,
  );
  if (base == null || base <= 0) return null;

  const bonus = toFiniteNumber(offer?.contract?.signingBonus ?? offer?.signingBonus, 0);
  return roundMoney(base + (bonus > 0 ? bonus / years : 0));
}

function normalizeOfferRowsFromPlayer(player, teamId) {
  const rows = [];
  const numericTeamId = teamId == null ? null : Number(teamId);
  const offers = player?.offers;

  if (Array.isArray(offers)) {
    for (const offer of offers) {
      if (!offer) continue;
      if (numericTeamId != null && Number(offer.teamId) !== numericTeamId) continue;
      rows.push({ player, offer });
    }
    return rows;
  }

  if (offers && typeof offers === 'object' && offers.userOffered) {
    rows.push({
      player,
      offer: {
        teamId,
        userBidAnnual: offers.userBidAnnual,
        userBidYears: offers.userBidYears,
        annualCapHit: offers.userBidAnnualCapHit,
        contractModel: offers.userOfferContractModel,
      },
    });
  }

  return rows;
}

function buildRow({ player = {}, offer = {}, currentCapRoom = null }) {
  const annualValue = resolveAnnualValue(offer, player);
  const years = resolveYears(offer, player);
  const modelCapFit = offer?.contractModel?.capFit ?? offer?.capFit ?? null;
  let capFit = modelCapFit;
  if (!capFit) {
    if (annualValue == null || currentCapRoom == null) capFit = 'unknown';
    else if (annualValue > currentCapRoom) capFit = 'over_cap';
    else if (annualValue >= Math.max(10, currentCapRoom * 0.5)) capFit = 'risky';
    else if (annualValue >= Math.max(6, currentCapRoom * 0.32)) capFit = 'tight';
    else capFit = 'safe';
  }
  return {
    playerId: player?.id ?? offer?.playerId ?? null,
    playerName: player?.name ?? offer?.playerName ?? 'Unknown player',
    annualValue,
    years: years == null ? null : Math.max(1, Math.round(years)),
    capFit,
    status: annualValue == null ? 'unknown' : 'pending',
  };
}

function buildWarnings({ currentCapRoom, pendingAnnualCommitment, estimatedCapRoomAfterPending, unknownCount }) {
  const warnings = [];
  const blockingReasons = [];
  if (unknownCount > 0) {
    warnings.push(`${unknownCount} pending offer${unknownCount === 1 ? '' : 's'} missing annual salary data; cap reservation is partial.`);
  }
  if (currentCapRoom == null) {
    warnings.push('Current cap room is unavailable, so pending cap impact cannot be estimated.');
    return { warnings, blockingReasons };
  }
  if (estimatedCapRoomAfterPending == null) return { warnings, blockingReasons };
  if (estimatedCapRoomAfterPending < 0) {
    warnings.push(`Pending offers would exceed current cap room by $${Math.abs(estimatedCapRoomAfterPending).toFixed(1)}M if all were accepted.`);
  } else if (estimatedCapRoomAfterPending < 5) {
    warnings.push('Pending offers would leave less than $5.0M in cap room if all were accepted.');
  } else if (estimatedCapRoomAfterPending < 10) {
    warnings.push('Pending offers would leave a tight cap cushion if all were accepted.');
  }
  const obviousOverage = Math.max(10, Math.abs(currentCapRoom) * 0.25);
  if (pendingAnnualCommitment > currentCapRoom + obviousOverage) {
    blockingReasons.push(`Accepting every pending offer is obviously over cap by more than $${obviousOverage.toFixed(1)}M.`);
  }
  return { warnings, blockingReasons };
}

function resolveStatus({ currentCapRoom, pendingAnnualCommitment, estimatedCapRoomAfterPending, pendingOfferCount, unknownCount }) {
  if (currentCapRoom == null) return 'unknown';
  if (pendingOfferCount === 0) return unknownCount > 0 ? 'unknown' : 'safe';
  if (unknownCount > 0 && pendingAnnualCommitment <= 0) return 'unknown';
  if (estimatedCapRoomAfterPending == null) return 'unknown';
  if (estimatedCapRoomAfterPending < 0) return 'overcommitted';
  if (estimatedCapRoomAfterPending < 5) return 'tight';
  if (estimatedCapRoomAfterPending < 15) return 'manageable';
  return 'safe';
}

export function evaluatePendingOfferCapReservation({
  team = {},
  freeAgents = [],
  players = null,
  pendingOffers = [],
  teamId = team?.id,
  currentCapRoom: explicitCapRoom = null,
  proposedOffer = null,
} = {}) {
  const currentCapRoom = resolveCurrentCapRoom(team, explicitCapRoom);
  const sourcePlayers = Array.isArray(players) ? players : Array.isArray(freeAgents) ? freeAgents : [];
  let rowInputs = sourcePlayers.flatMap((player) => normalizeOfferRowsFromPlayer(player, teamId));

  if (Array.isArray(pendingOffers)) {
    rowInputs = rowInputs.concat(pendingOffers.filter(Boolean).map((offer) => ({ player: offer?.player ?? {}, offer })));
  }

  if (proposedOffer?.player || proposedOffer?.offer) {
    const proposedPlayerId = proposedOffer?.player?.id ?? proposedOffer?.offer?.playerId;
    if (proposedOffer?.replaceExisting !== false && proposedPlayerId != null) {
      rowInputs = rowInputs.filter(({ player, offer }) => (player?.id ?? offer?.playerId) !== proposedPlayerId);
    }
    rowInputs.push({ player: proposedOffer?.player ?? {}, offer: proposedOffer?.offer ?? proposedOffer });
  }

  const offerRows = rowInputs.map((input) => buildRow({ ...input, currentCapRoom }));
  const pendingOfferCount = offerRows.length;
  const knownRows = offerRows.filter((row) => row.annualValue != null);
  const unknownCount = pendingOfferCount - knownRows.length;
  const pendingAnnualCommitment = roundMoney(knownRows.reduce((sum, row) => sum + row.annualValue, 0)) ?? 0;
  const estimatedCapRoomAfterPending = currentCapRoom == null ? null : roundMoney(currentCapRoom - pendingAnnualCommitment);
  const capReservationStatus = resolveStatus({ currentCapRoom, pendingAnnualCommitment, estimatedCapRoomAfterPending, pendingOfferCount, unknownCount });
  const { warnings, blockingReasons } = buildWarnings({ currentCapRoom, pendingAnnualCommitment, estimatedCapRoomAfterPending, unknownCount });

  return {
    currentCapRoom,
    pendingAnnualCommitment,
    pendingOfferCount,
    estimatedCapRoomAfterPending,
    capReservationStatus,
    capReservationStatusLabel: STATUS_LABELS[capReservationStatus] ?? 'Unknown',
    warnings,
    blockingReasons,
    unknownOfferCount: unknownCount,
    offerRows,
  };
}

export default evaluatePendingOfferCapReservation;
