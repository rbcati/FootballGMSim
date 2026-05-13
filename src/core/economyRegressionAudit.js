import { evaluatePendingOfferCapReservation } from './pendingOfferCapModel.js';
import { normalizePositionGroup, getAnnualContractCost, getPositionalPremium } from './marketRealismModel.js';

const REBUILD_ARCHETYPES = new Set(['rebuild', 'rebuilding', 'development']);
const CONTENDER_ARCHETYPES = new Set(['contender', 'playoff_hunt', 'desperate']);
const PREMIUM_POSITIONS = new Set(['QB', 'OT', 'EDGE', 'DE', 'CB', 'WR', 'DL']);

function toNum(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value) {
  const n = toNum(value, null);
  return n == null ? null : Math.round(n * 10) / 10;
}

function pushSkipped(skipped, code, reason) {
  skipped.push({ code, reason });
}

function annualForOffer(offer = {}, player = {}) {
  const explicit = toNum(
    offer?.annualCapHit
      ?? offer?.capHit
      ?? offer?.annualValue
      ?? offer?.baseAnnual
      ?? offer?.contract?.annualCapHit
      ?? offer?.contract?.capHit,
    null,
  );
  if (explicit != null && explicit > 0) return round(explicit);
  const base = toNum(
    offer?.contract?.baseAnnual
      ?? offer?.contract?.annualSalary
      ?? offer?.contract?.annual
      ?? offer?.salary
      ?? player?.contract?.baseAnnual,
    null,
  );
  if (base == null || base <= 0) return null;
  const years = Math.max(1, toNum(offer?.contract?.yearsTotal ?? offer?.contract?.years ?? offer?.yearsTotal ?? offer?.years, 1));
  const bonus = toNum(offer?.contract?.signingBonus ?? offer?.signingBonus, 0);
  return round(base + bonus / years);
}

function normalizePlayerOfferRows({ players, freeAgents, pendingOffers, offers }) {
  const rows = [];
  const addRow = (player, offer, source) => {
    if (!offer || typeof offer !== 'object') return;
    rows.push({
      player: player ?? offer?.player ?? {},
      offer,
      source,
      teamId: offer?.teamId ?? offer?.offeringTeamId ?? offer?.bidderTeamId ?? null,
      annualValue: annualForOffer(offer, player ?? offer?.player ?? {}),
    });
  };

  for (const p of [...(Array.isArray(players) ? players : []), ...(Array.isArray(freeAgents) ? freeAgents : [])]) {
    if (Array.isArray(p?.offers)) {
      for (const offer of p.offers) addRow(p, offer, 'player.offers');
    } else if (p?.offers && typeof p.offers === 'object' && p.offers.userOffered) {
      addRow(p, {
        teamId: p.offers.teamId,
        annualCapHit: p.offers.userBidAnnualCapHit ?? p.offers.userBidAnnual,
        contractModel: p.offers.userOfferContractModel,
      }, 'player.offerSummary');
    }
  }
  for (const offer of Array.isArray(pendingOffers) ? pendingOffers : []) addRow(offer?.player, offer, 'pendingOffers');
  for (const offer of Array.isArray(offers) ? offers : []) addRow(offer?.player, offer, 'offers');
  return rows;
}

function isUserOffer(row, userTeamId) {
  return userTeamId != null && row?.teamId != null && Number(row.teamId) === Number(userTeamId);
}

function getTeamArchetype(team = {}) {
  return String(team?.archetype ?? team?.strategy?.archetype ?? team?.teamArchetype ?? '').toLowerCase();
}

function hasSevereQbNeed(row, team = {}) {
  const player = row?.player ?? {};
  if (String(player?.pos ?? '').toUpperCase() !== 'QB') return false;
  const realism = row?.offer?.contractModel?.marketRealism ?? row?.offer?.marketRealism ?? {};
  const flags = Array.isArray(realism?.flags) ? realism.flags : [];
  const reasons = Array.isArray(row?.offer?.contractModel?.reasons) ? row.offer.contractModel.reasons : [];
  if (flags.includes('qb_need_exception') || reasons.some((r) => /severe QB need exception/i.test(String(r)))) return true;
  if (team?.severeQbNeed === true || team?.qbNeedException === true) return true;
  const needs = Array.isArray(team?.positionalNeeds) ? team.positionalNeeds : Array.isArray(team?.strategy?.positionalNeeds) ? team.strategy.positionalNeeds : [];
  return needs.some((n) => normalizePositionGroup(n?.positionGroup ?? n?.pos ?? n?.position) === 'QB' && toNum(n?.priority ?? n?.needScore, 0) >= 75);
}

function isOldExpensiveVeteran(player = {}, annualValue = null) {
  const pos = String(player?.pos ?? '').toUpperCase();
  const age = toNum(player?.age, 0);
  const annual = annualValue ?? getAnnualContractCost(player);
  return age >= (pos === 'QB' ? 34 : 31) && annual >= (pos === 'QB' ? 18 : 10);
}

function isExpensiveOffer(row) {
  const pos = String(row?.player?.pos ?? '').toUpperCase();
  const annual = row?.annualValue;
  if (annual == null) return false;
  return annual >= (pos === 'QB' ? 18 : 10);
}

function sidePlayers(trade = {}, key) {
  const snapshots = trade?.[`${key}PlayerSnapshots`];
  if (Array.isArray(snapshots)) return snapshots;
  const players = trade?.[`${key}Players`];
  if (Array.isArray(players)) return players;
  return [];
}

function playerTradeValue(player = {}) {
  const ovr = toNum(player?.ovr, 60);
  const pot = toNum(player?.potential, ovr);
  const age = toNum(player?.age, 27);
  const posPremium = getPositionalPremium(player?.pos);
  const ageMult = age <= 24 ? 1.2 : age >= 31 ? 0.78 : 1;
  const premiumMult = posPremium >= 80 ? 1.18 : 1;
  const contractDrag = Math.max(0, getAnnualContractCost(player) - (posPremium >= 80 ? 22 : 12)) * 2;
  return Math.max(0, ((ovr * 1.05) + (pot * 0.85)) * ageMult * premiumMult - contractDrag);
}

function hasPremiumYoungPlayer(players = []) {
  return players.some((p) => {
    const pos = String(p?.pos ?? '').toUpperCase();
    return toNum(p?.age, 99) <= 26 && (PREMIUM_POSITIONS.has(pos) || getPositionalPremium(pos) >= 80) && toNum(p?.potential ?? p?.ovr, 0) >= 78;
  });
}

function sideValue(players = [], picks = []) {
  const playerValue = players.reduce((sum, p) => sum + playerTradeValue(p), 0);
  const pickValue = (Array.isArray(picks) ? picks : []).reduce((sum, p) => sum + (toNum(p?.valueScore, null) ?? (toNum(p?.round, 7) === 1 ? 175 : toNum(p?.round, 7) === 2 ? 125 : 70)), 0);
  return playerValue + pickValue;
}

function buildTradeFlags(trades = []) {
  const premiumYoungPlayerTradeDiscountFlags = [];
  const expensiveVeteranSwapFlags = [];

  for (const trade of Array.isArray(trades) ? trades : []) {
    const offering = sidePlayers(trade, 'offering');
    const receiving = sidePlayers(trade, 'receiving');
    const offeringPicks = Array.isArray(trade?.offeringPickSnapshots) ? trade.offeringPickSnapshots : [];
    const receivingPicks = Array.isArray(trade?.receivingPickSnapshots) ? trade.receivingPickSnapshots : [];
    const offeringValue = toNum(trade?.offeringValue, null) ?? sideValue(offering, offeringPicks);
    const receivingValue = toNum(trade?.receivingValue, null) ?? sideValue(receiving, receivingPicks);

    if (hasPremiumYoungPlayer(offering) && receivingValue < offeringValue * 0.85) {
      premiumYoungPlayerTradeDiscountFlags.push({ tradeId: trade?.id ?? null, side: 'offering', valueGap: round(offeringValue - receivingValue) });
    }
    if (hasPremiumYoungPlayer(receiving) && offeringValue < receivingValue * 0.85) {
      premiumYoungPlayerTradeDiscountFlags.push({ tradeId: trade?.id ?? null, side: 'receiving', valueGap: round(receivingValue - offeringValue) });
    }
    const offeringOldExpensive = offering.some((p) => isOldExpensiveVeteran(p));
    const receivingOldExpensive = receiving.some((p) => isOldExpensiveVeteran(p));
    if (offeringOldExpensive && receivingOldExpensive) {
      expensiveVeteranSwapFlags.push({ tradeId: trade?.id ?? null, offeringValue: round(offeringValue), receivingValue: round(receivingValue) });
    }
  }

  return { premiumYoungPlayerTradeDiscountFlags, expensiveVeteranSwapFlags };
}

export function summarizeEconomyRegressionSnapshot(input = {}) {
  const skippedReasons = [];
  const warnings = [];
  const teams = Array.isArray(input?.teams) ? input.teams : [];
  const players = Array.isArray(input?.players) ? input.players : [];
  const freeAgents = Array.isArray(input?.freeAgents) ? input.freeAgents : [];
  const userTeamId = input?.userTeamId ?? null;
  const teamsById = new Map(teams.map((t) => [Number(t?.id), t]));
  const offerRows = normalizePlayerOfferRows({
    players,
    freeAgents,
    pendingOffers: input?.pendingOffers,
    offers: input?.offers,
  });

  if (!teams.length) pushSkipped(skippedReasons, 'teams_missing', 'No team snapshot was provided; cap and archetype metrics are partial.');
  if (!offerRows.length) pushSkipped(skippedReasons, 'pending_offers_missing', 'No pending/free-agent offer rows were provided in this snapshot.');

  const teamsOverCap = teams.filter((t) => {
    const capRoom = toNum(t?.capRoom, null);
    const capUsed = toNum(t?.capUsed, null);
    const capTotal = toNum(t?.capTotal, null);
    return (capRoom != null && capRoom < 0) || (capUsed != null && capTotal != null && capTotal > 0 && capUsed > capTotal);
  }).length;

  const pendingByTeam = new Map();
  for (const row of offerRows) {
    if (row.teamId == null) continue;
    const key = Number(row.teamId);
    if (!pendingByTeam.has(key)) pendingByTeam.set(key, []);
    pendingByTeam.get(key).push({ ...row.offer, player: row.player });
  }

  let teamsWithPendingOfferOvercommit = 0;
  let pendingOfferOvercommitCount = 0;
  let unknownOfferValueCount = 0;
  const pendingOfferTeamSummaries = [];
  for (const [teamId, pendingOffers] of pendingByTeam.entries()) {
    const team = teamsById.get(Number(teamId)) ?? { id: teamId };
    const reservation = evaluatePendingOfferCapReservation({ team, pendingOffers, teamId });
    unknownOfferValueCount += reservation.unknownOfferCount ?? 0;
    if (reservation.capReservationStatus === 'overcommitted') {
      teamsWithPendingOfferOvercommit += 1;
      pendingOfferOvercommitCount += reservation.pendingOfferCount ?? 0;
    }
    pendingOfferTeamSummaries.push({
      teamId,
      pendingOfferCount: reservation.pendingOfferCount,
      pendingAnnualCommitment: reservation.pendingAnnualCommitment,
      estimatedCapRoomAfterPending: reservation.estimatedCapRoomAfterPending,
      capReservationStatus: reservation.capReservationStatus,
      unknownOfferCount: reservation.unknownOfferCount,
    });
  }

  const cpuRows = offerRows.filter((row) => !isUserOffer(row, userTeamId));
  const userRows = offerRows.filter((row) => isUserOffer(row, userTeamId));
  const duplicateBuckets = new Map();
  for (const row of cpuRows.filter(isExpensiveOffer)) {
    const group = normalizePositionGroup(row?.player?.pos);
    const key = `${row.teamId ?? 'unknown'}:${group}`;
    if (!duplicateBuckets.has(key)) duplicateBuckets.set(key, []);
    duplicateBuckets.get(key).push(row);
  }
  const duplicateExpensiveSameGroupOffers = [...duplicateBuckets.entries()]
    .filter(([, rows]) => rows.length >= 2)
    .map(([key, rows]) => ({
      key,
      teamId: rows[0]?.teamId ?? null,
      positionGroup: normalizePositionGroup(rows[0]?.player?.pos),
      count: rows.length,
      playerIds: rows.map((row) => row?.player?.id ?? null),
    }));

  let oldVeteranOffersByRebuildTeams = 0;
  let contenderVeteranOfferCount = 0;
  let severeQbNeedOfferCount = 0;
  for (const row of cpuRows) {
    const team = teamsById.get(Number(row.teamId)) ?? {};
    const archetype = getTeamArchetype(team);
    if (hasSevereQbNeed(row, team)) severeQbNeedOfferCount += 1;
    if (REBUILD_ARCHETYPES.has(archetype) && isOldExpensiveVeteran(row.player, row.annualValue)) oldVeteranOffersByRebuildTeams += 1;
    if (CONTENDER_ARCHETYPES.has(archetype) && toNum(row?.player?.age, 0) >= 30 && row.annualValue != null && row.annualValue >= 8) contenderVeteranOfferCount += 1;
  }
  if (cpuRows.some((row) => row.teamId != null) && teams.length === 0) {
    warnings.push('CPU offer rows were present, but team archetypes were unavailable; rebuild/contender offer sanity is partial.');
  }

  const trades = [
    ...(Array.isArray(input?.trades) ? input.trades : []),
    ...(Array.isArray(input?.incomingTradeOffers) ? input.incomingTradeOffers : []),
  ];
  if (!trades.length) pushSkipped(skippedReasons, 'trades_missing', 'No trade proposal snapshot was provided; trade realism warning counts are unavailable.');
  const tradeFlags = buildTradeFlags(trades);

  const status = warnings.length ? 'warning' : 'ok';
  return {
    status,
    teamsOverCap,
    teamsWithPendingOfferOvercommit,
    pendingOfferOvercommitCount,
    duplicateExpensiveSameGroupOffers: duplicateExpensiveSameGroupOffers.length,
    duplicateExpensiveSameGroupOfferFlags: duplicateExpensiveSameGroupOffers,
    oldVeteranOffersByRebuildTeams,
    contenderVeteranOfferCount,
    severeQbNeedOfferCount,
    premiumYoungPlayerTradeDiscountFlags: tradeFlags.premiumYoungPlayerTradeDiscountFlags.length,
    premiumYoungPlayerTradeDiscountFlagDetails: tradeFlags.premiumYoungPlayerTradeDiscountFlags,
    expensiveVeteranSwapFlags: tradeFlags.expensiveVeteranSwapFlags.length,
    expensiveVeteranSwapFlagDetails: tradeFlags.expensiveVeteranSwapFlags,
    cpuOfferCount: cpuRows.length,
    userOfferCount: userRows.length,
    unknownOfferValueCount,
    pendingOfferTeamSummaries,
    skippedReasons,
    warnings,
  };
}

export default summarizeEconomyRegressionSnapshot;
