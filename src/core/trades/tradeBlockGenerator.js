import { getTradeWindowSnapshot } from '../tradeWindow.js';
import { getActiveCapHit } from '../contracts/contractObligations.js';
import {
  TEAM_STRATEGIC_POSTURE,
  classifyTeamStrategicPosture,
} from './teamStrategicDirection.js';

const STARTER_COUNTS = Object.freeze({
  QB: 1,
  RB: 2,
  WR: 3,
  TE: 1,
  OL: 5,
  DL: 4,
  LB: 3,
  CB: 2,
  S: 2,
  K: 1,
  P: 1,
});

const POSITION_WEIGHT = Object.freeze({
  QB: 1.45,
  EDGE: 1.24,
  DE: 1.18,
  DL: 1.08,
  OT: 1.18,
  OL: 1.04,
  WR: 1.12,
  CB: 1.1,
  S: 0.92,
  LB: 0.92,
  TE: 0.84,
  RB: 0.72,
  K: 0.28,
  P: 0.25,
});

const DEFAULT_OPTIONS = Object.freeze({
  maxBlockAssets: 3,
  veteranAgeMin: 30,
  expensiveCapHitMin: 12,
  neutralCapHitMin: 16,
  eliteOvrMin: 88,
  cornerstoneOvrMin: 90,
  youngUpsideAgeMax: 24,
  upsideDeltaMin: 5,
  userSurplusOvrMin: 68,
  maxActiveOffers: 5,
  maxGeneratedOffersPerWeek: 1,
  rngGateChance: 0.075,
  seed: 'trade_block_v1',
});

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePosition = (pos) => {
  const value = String(pos ?? '').toUpperCase();
  if (['OT', 'LT', 'RT', 'OG', 'LG', 'RG', 'C'].includes(value)) return 'OL';
  if (['EDGE', 'DE', 'DT', 'NT', 'IDL'].includes(value)) return 'DL';
  if (['SS', 'FS'].includes(value)) return 'S';
  if (['ILB', 'OLB', 'MLB'].includes(value)) return 'LB';
  if (['HB', 'FB'].includes(value)) return 'RB';
  return value;
};

function stableHash(input = '') {
  let hash = 2166136261;
  const str = String(input);
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function tradeWindowAllowsOffers(snapshot) {
  return !snapshot?.isLocked || !!snapshot?.canOverride;
}

function seededRoll(seedInput) {
  let seed = stableHash(seedInput);
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function capHit(player) {
  try {
    const active = getActiveCapHit(player);
    if (Number.isFinite(active)) return active;
  } catch {
    // Fall through to legacy fields.
  }
  return num(player?.capHit ?? player?.contract?.baseAnnual ?? player?.baseAnnual ?? player?.salary, 0);
}

function playerValue(player) {
  const ovr = num(player?.ovr, 60);
  const potential = num(player?.potential ?? player?.pot, ovr);
  const age = num(player?.age, 27);
  const pos = normalizePosition(player?.pos);
  const posWeight = POSITION_WEIGHT[player?.pos] ?? POSITION_WEIGHT[pos] ?? 1;
  const agePenalty = age >= 30 ? Math.pow(1.1, age - 29) * 7 : age <= 24 ? -4 : 0;
  const upsideBonus = Math.max(0, potential - ovr) * (age <= 25 ? 3.2 : 1.1);
  const contractPenalty = capHit(player) * 2.8;
  return Math.max(0, Math.round((ovr * 1.45 + potential * 0.55 + upsideBonus - agePenalty - contractPenalty) * posWeight));
}

function pickValue(pick, currentSeason) {
  const round = Math.max(1, Math.min(7, num(pick?.round, 7)));
  const base = { 1: 320, 2: 210, 3: 135, 4: 85, 5: 52, 6: 30, 7: 18 }[round] ?? 18;
  const season = num(pick?.season ?? pick?.year, currentSeason);
  const yearsOut = Math.max(0, season - num(currentSeason, season));
  return Math.round(base * Math.pow(0.86, yearsOut));
}

function isInjured(player) {
  return num(player?.injuryWeeksRemaining ?? player?.injuredWeeks ?? player?.injury?.gamesRemaining, 0) > 0;
}

function isYoungUpside(player, cfg) {
  const ovr = num(player?.ovr, 0);
  const potential = num(player?.potential ?? player?.pot, ovr);
  return num(player?.age, 99) <= cfg.youngUpsideAgeMax && (potential - ovr) >= cfg.upsideDeltaMin;
}

function isCornerstone(player, cfg) {
  const ovr = num(player?.ovr, 0);
  if (ovr >= cfg.cornerstoneOvrMin) return true;
  if (String(player?.pos ?? '').toUpperCase() === 'QB' && ovr >= 84 && num(player?.age, 99) <= 30) return true;
  return isYoungUpside(player, cfg) && ovr >= 76;
}

function buildPositionRanks(roster = []) {
  const byPos = new Map();
  for (const player of roster) {
    if (!player) continue;
    const pos = normalizePosition(player?.pos);
    if (!byPos.has(pos)) byPos.set(pos, []);
    byPos.get(pos).push(player);
  }
  const ranks = new Map();
  for (const [pos, players] of byPos.entries()) {
    players
      .slice()
      .sort((a, b) => num(b?.ovr, 0) - num(a?.ovr, 0) || num(a?.age, 99) - num(b?.age, 99) || String(a?.id).localeCompare(String(b?.id)))
      .forEach((player, index) => {
        ranks.set(player?.id, {
          pos,
          rank: index,
          count: players.length,
          starterCount: STARTER_COUNTS[pos] ?? 1,
        });
      });
  }
  return ranks;
}

function assetId(asset) {
  if (asset?.assetType === 'pick') return `pick:${asset?.pick?.id ?? asset?.pickId}`;
  return `player:${asset?.player?.id ?? asset?.playerId}`;
}

function isTeamPick(pick, teamId) {
  const owner = pick?.currentOwner ?? pick?.ownerTeamId ?? pick?.teamId;
  return owner == null || Number(owner) === Number(teamId);
}

function summarizePlayer(player) {
  if (!player) return null;
  return {
    id: player.id,
    name: player.name,
    pos: player.pos,
    ovr: player.ovr,
    age: player.age,
    potential: player.potential ?? player.pot,
    contract: {
      baseAnnual: num(player?.contract?.baseAnnual ?? player?.baseAnnual, 0),
      signingBonus: num(player?.contract?.signingBonus ?? player?.signingBonus, 0),
      yearsTotal: num(player?.contract?.yearsTotal ?? player?.yearsTotal, 1),
      yearsRemaining: num(player?.contract?.yearsRemaining ?? player?.years, 1),
    },
  };
}

function pickLabel(pick) {
  const season = pick?.season ?? pick?.year;
  return `${season ? `${season} ` : ''}R${pick?.round ?? '?'}`;
}

function summarizePick(pick, teamsById = new Map()) {
  if (!pick) return null;
  const originalOwner = num(pick?.originalOwner ?? pick?.sourceTeamId ?? pick?.teamId, NaN);
  const currentOwner = num(pick?.currentOwner ?? pick?.ownerTeamId, NaN);
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

function buildOfferSignature(offer) {
  const givePlayers = [...(offer?.offering?.playerIds ?? [])].sort().join(',');
  const getPlayers = [...(offer?.receiving?.playerIds ?? [])].sort().join(',');
  const givePicks = [...(offer?.offering?.pickIds ?? [])].sort().join(',');
  const getPicks = [...(offer?.receiving?.pickIds ?? [])].sort().join(',');
  return `${offer?.offeringTeamId}|${offer?.offerType ?? 'market'}|${givePlayers}|${getPlayers}|${givePicks}|${getPicks}`;
}

export function classifyTradeBlockReason(playerOrPick, team = {}, roster = [], context = {}, options = {}) {
  const cfg = { ...DEFAULT_OPTIONS, ...options };
  const asset = playerOrPick?.assetType ? playerOrPick : { assetType: playerOrPick?.round ? 'pick' : 'player', player: playerOrPick };
  const posture = context?.teamPosture ?? classifyTeamStrategicPosture(
    { ...team, roster },
    { currentSeason: context?.currentSeason ?? context?.year, phase: context?.phase },
    context?.postureOptions ?? {},
  );
  const capRoom = num(team?.capRoom ?? context?.capRoom, 0);
  const capRestricted = capRoom < 5 || context?.financialPosture === 'INSOLVENT' || context?.financialPosture === 'CAP_RESTRICTED';

  if (asset.assetType === 'pick') {
    const pick = asset.pick ?? asset;
    const round = num(pick?.round, 7);
    if (posture === TEAM_STRATEGIC_POSTURE.CONTENDER && round >= 4) {
      return { key: 'surplus_pick', label: 'surplus pick', score: 48, tags: ['surplus_pick', 'contender_depth'] };
    }
    return null;
  }

  const player = asset.player ?? playerOrPick;
  if (!player) return null;
  const ranks = context?.positionRanks ?? buildPositionRanks(roster);
  const rank = ranks.get(player.id);
  const isStarter = rank ? rank.rank < rank.starterCount : false;
  const isSurplus = rank ? rank.rank >= rank.starterCount : false;
  const hit = capHit(player);
  const age = num(player?.age, 27);
  const ovr = num(player?.ovr, 0);

  if (isCornerstone(player, cfg)) return null;
  if (isInjured(player) && ovr >= 80 && !isSurplus) return null;

  if (capRestricted && hit >= cfg.expensiveCapHitMin && age >= 28 && ovr < cfg.eliteOvrMin) {
    return { key: 'cap_burden', label: 'cap burden', score: 88 + hit - Math.max(0, ovr - 78), tags: ['cap_burden', 'cap_restricted'] };
  }

  if (posture === TEAM_STRATEGIC_POSTURE.REBUILDER && age >= cfg.veteranAgeMin && hit >= cfg.expensiveCapHitMin && ovr < cfg.eliteOvrMin) {
    return { key: 'aging_veteran', label: 'aging expensive veteran', score: 82 + hit + age - Math.max(0, ovr - 78), tags: ['aging_veteran', 'rebuilder'] };
  }

  if (posture === TEAM_STRATEGIC_POSTURE.CONTENDER && isSurplus && ovr < 80) {
    return { key: 'redundant_depth', label: 'redundant depth', score: 58 + Math.max(0, ovr - 68), tags: ['redundant_depth', 'contender'] };
  }

  if (posture === TEAM_STRATEGIC_POSTURE.NEUTRAL && isSurplus && age >= 31 && hit >= cfg.neutralCapHitMin && ovr < cfg.eliteOvrMin) {
    return { key: 'obvious_surplus_contract', label: 'obvious surplus contract', score: 64 + hit, tags: ['surplus_contract', 'neutral'] };
  }

  if (!isStarter && hit >= cfg.neutralCapHitMin && age >= 30 && ovr < cfg.eliteOvrMin) {
    return { key: 'contract_surplus', label: 'contract surplus', score: 62 + hit, tags: ['contract_surplus'] };
  }

  return null;
}

export function rankTradeBlockAssets(assets = [], context = {}) {
  const currentSeason = num(context?.currentSeason ?? context?.year, 0);
  return (Array.isArray(assets) ? assets : [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => {
      const scoreDiff = num(b?.score, 0) - num(a?.score, 0);
      if (scoreDiff !== 0) return scoreDiff;
      const valueA = a.assetType === 'pick' ? pickValue(a.pick, currentSeason) : playerValue(a.player);
      const valueB = b.assetType === 'pick' ? pickValue(b.pick, currentSeason) : playerValue(b.player);
      if (valueA !== valueB) return valueB - valueA;
      return assetId(a).localeCompare(assetId(b));
    });
}

export function capTradeBlockAssets(assets = [], limit = 3) {
  return (Array.isArray(assets) ? assets : []).slice(0, Math.max(0, num(limit, 3)));
}

export function generateAITradeBlock(team, roster, context = {}, options = {}) {
  const cfg = { ...DEFAULT_OPTIONS, ...options };
  if (!team || !Array.isArray(roster) || roster.length === 0) return [];
  if (context?.userTeamId != null && Number(team?.id) === Number(context.userTeamId)) return [];

  const ranks = buildPositionRanks(roster);
  const posture = context?.teamPosture ?? classifyTeamStrategicPosture(
    { ...team, roster },
    { currentSeason: context?.currentSeason ?? context?.year, phase: context?.phase },
    context?.postureOptions ?? {},
  );
  const sharedContext = { ...context, teamPosture: posture, positionRanks: ranks };
  const assets = [];

  for (const player of roster) {
    if (!player || Number(player?.teamId ?? team?.id) !== Number(team?.id)) continue;
    const reason = classifyTradeBlockReason(player, team, roster, sharedContext, cfg);
    if (!reason) continue;
    assets.push({
      assetType: 'player',
      player,
      playerId: player.id,
      teamId: team.id,
      reason: reason.label,
      reasonKey: reason.key,
      reasonTags: reason.tags,
      score: reason.score,
      value: playerValue(player),
    });
  }

  const picks = Array.isArray(team?.picks) ? team.picks : [];
  for (const pick of picks) {
    if (!pick || pick.id == null || !isTeamPick(pick, team.id)) continue;
    const reason = classifyTradeBlockReason({ assetType: 'pick', pick }, team, roster, sharedContext, cfg);
    if (!reason) continue;
    assets.push({
      assetType: 'pick',
      pick,
      pickId: pick.id,
      teamId: team.id,
      reason: reason.label,
      reasonKey: reason.key,
      reasonTags: reason.tags,
      score: reason.score,
      value: pickValue(pick, context?.currentSeason ?? context?.year),
    });
  }

  return capTradeBlockAssets(rankTradeBlockAssets(assets, context), cfg.maxBlockAssets);
}

function buildLeagueInput(leagueState = {}) {
  const meta = leagueState?.meta ?? leagueState;
  const teams = Array.isArray(leagueState?.teams) ? leagueState.teams : [];
  const players = Array.isArray(leagueState?.players) ? leagueState.players : [];
  return { meta, teams, players };
}

function rosterForTeam(players = [], teamId) {
  return players.filter((player) => Number(player?.teamId) === Number(teamId));
}

function buildUserRequestCandidates(userTeam, userRoster, context, cfg) {
  if (!userTeam || !Array.isArray(userRoster) || userRoster.length === 0) return [];
  const ranks = buildPositionRanks(userRoster);
  const candidates = [];
  for (const player of userRoster) {
    const rank = ranks.get(player?.id);
    const isSurplus = rank ? rank.rank >= rank.starterCount : false;
    if (!isSurplus) continue;
    if (isCornerstone(player, cfg)) continue;
    if (isInjured(player) && num(player?.ovr, 0) >= 80) continue;
    if (num(player?.ovr, 0) < cfg.userSurplusOvrMin) continue;
    candidates.push({
      assetType: 'player',
      player,
      playerId: player.id,
      pos: normalizePosition(player?.pos),
      value: playerValue(player),
      score: playerValue(player),
    });
  }
  return rankTradeBlockAssets(candidates, context);
}

function selectUserAssetForAI(aiTeam, aiRoster, userCandidates, context) {
  if (!aiTeam || !Array.isArray(aiRoster) || !Array.isArray(userCandidates)) return null;
  const aiRanks = buildPositionRanks(aiRoster);
  const needPositions = new Set();
  for (const [pos, starterCount] of Object.entries(STARTER_COUNTS)) {
    const playersAtPos = aiRoster
      .filter((player) => normalizePosition(player?.pos) === pos)
      .sort((a, b) => num(b?.ovr, 0) - num(a?.ovr, 0));
    const starters = playersAtPos.slice(0, starterCount);
    const avgStarter = starters.length
      ? starters.reduce((sum, player) => sum + num(player?.ovr, 0), 0) / starters.length
      : 0;
    if (starters.length < starterCount || avgStarter < 74) needPositions.add(pos);
  }

  const needFit = userCandidates.find((candidate) => needPositions.has(candidate.pos));
  if (needFit) return needFit;

  return userCandidates.find((candidate) => {
    const rank = aiRanks.get(candidate.playerId);
    return !rank || rank.rank >= rank.starterCount || num(candidate?.player?.ovr, 0) >= 72;
  }) ?? userCandidates[0] ?? null;
}

function pickSweetenerForTeam(team, currentSeason, targetGap) {
  const picks = (Array.isArray(team?.picks) ? team.picks : [])
    .filter((pick) => pick?.id != null && isTeamPick(pick, team?.id) && num(pick?.round, 8) >= 3)
    .sort((a, b) => {
      const valueDiff = pickValue(a, currentSeason) - pickValue(b, currentSeason);
      if (valueDiff !== 0) return valueDiff;
      return String(a.id).localeCompare(String(b.id));
    });
  return picks.find((pick) => pickValue(pick, currentSeason) >= targetGap * 0.65) ?? picks[0] ?? null;
}

function makeOffer({ aiTeam, userTeam, aiAsset, userAsset, week, season, currentSeason, teamsById, seed }) {
  const offering = { playerIds: [], pickIds: [] };
  const receiving = { playerIds: [], pickIds: [] };
  const offeringPlayerSnapshots = [];
  const receivingPlayerSnapshots = [];
  const offeringPickSnapshots = [];
  const receivingPickSnapshots = [];
  const reasonTags = [...(aiAsset?.reasonTags ?? []), 'proactive_ai_offer'];

  if (aiAsset.assetType === 'pick') {
    offering.pickIds.push(aiAsset.pick.id);
    const snapshot = summarizePick(aiAsset.pick, teamsById);
    if (snapshot) offeringPickSnapshots.push(snapshot);
  } else {
    offering.playerIds.push(aiAsset.player.id);
    const snapshot = summarizePlayer(aiAsset.player);
    if (snapshot) offeringPlayerSnapshots.push(snapshot);
  }

  receiving.playerIds.push(userAsset.player.id);
  const requestedSnapshot = summarizePlayer(userAsset.player);
  if (requestedSnapshot) receivingPlayerSnapshots.push(requestedSnapshot);

  const offer = {
    id: `offer_${season}_${week}_${aiTeam.id}_${assetId(aiAsset).replace(':', '_')}_${userAsset.player.id}_${stableHash(seed).toString(36)}`,
    week,
    createdWeek: week,
    season,
    offeringTeamId: aiTeam.id,
    offeringTeamAbbr: aiTeam.abbr,
    offeringTeamName: aiTeam.name,
    receivingTeamId: userTeam.id,
    userTeamId: userTeam.id,
    offeringDirection: aiAsset?.contextDirection ?? 'balanced',
    offerType: 'proactive_ai_offer',
    generatedBy: 'trade_block_v1',
    urgency: reasonTags.includes('cap_burden') ? 'medium' : 'low',
    stance: reasonTags.includes('cap_burden') ? 'Cap flexibility' : 'Roster balance',
    reason: `${aiTeam.abbr ?? 'AI'} floated a conservative trade-block offer around ${aiAsset.reason ?? 'roster surplus'}.`,
    reasonTags,
    context: {
      source: 'trade_block_v1',
      aiAssetReason: aiAsset.reasonKey,
      requestedUserAsset: userAsset.pos,
    },
    offering,
    receiving,
    offeringPickSnapshots,
    receivingPickSnapshots,
    offeringPlayerSnapshots,
    receivingPlayerSnapshots,
    offeringPlayerId: offering.playerIds[0] ?? null,
    offeringPlayerName: offeringPlayerSnapshots[0]?.name ?? offeringPickSnapshots[0]?.label ?? 'Draft pick',
    receivingPlayerId: userAsset.player.id,
    receivingPlayerName: userAsset.player.name,
    expiresAfterWeek: week + 2,
    expiresPhase: 'regular',
  };
  offer.signature = buildOfferSignature(offer);
  return offer;
}

function offerAssetIds(offer) {
  return [
    ...(offer?.offering?.playerIds ?? []).map((id) => `p:${id}`),
    ...(offer?.offering?.pickIds ?? []).map((id) => `k:${id}`),
    ...(offer?.receiving?.playerIds ?? []).map((id) => `p:${id}`),
    ...(offer?.receiving?.pickIds ?? []).map((id) => `k:${id}`),
  ];
}

export function pruneStaleInboundOffers(offers = [], leagueState = {}, userTeamId = null, options = {}) {
  const { meta, teams, players } = buildLeagueInput(leagueState);
  const week = num(meta?.currentWeek ?? meta?.week, 1);
  const season = num(meta?.season ?? meta?.year, 1);
  const phase = String(meta?.phase ?? 'regular');
  const windowSnapshot = getTradeWindowSnapshot({
    currentWeek: week,
    week,
    phase,
    settings: meta?.settings,
    commissionerMode: meta?.commissionerMode,
  });
  if (phase !== 'regular' || !tradeWindowAllowsOffers(windowSnapshot)) return [];

  const teamsById = new Map((Array.isArray(teams) ? teams : []).map((team) => [Number(team?.id), team]));
  const playersById = new Map((Array.isArray(players) ? players : []).map((player) => [Number(player?.id), player]));
  const picksById = new Map();
  for (const team of teamsById.values()) {
    for (const pick of Array.isArray(team?.picks) ? team.picks : []) {
      if (pick?.id != null) picksById.set(String(pick.id), pick);
    }
  }

  const keep = [];
  const seenIds = new Set();
  const seenSignatures = new Set();
  for (const offer of Array.isArray(offers) ? offers : []) {
    if (!offer) continue;
    if (offer.season != null && num(offer.season, season) !== season) continue;
    if (offer.expiresPhase && String(offer.expiresPhase) !== phase) continue;
    const expiresAfterWeek = num(offer.expiresAfterWeek ?? (offer.week ?? week) + 2, week + 2);
    if (expiresAfterWeek < week) continue;

    const aiTeamId = num(offer.offeringTeamId, NaN);
    const userId = num(userTeamId ?? offer.userTeamId ?? offer.receivingTeamId, NaN);
    if (!Number.isFinite(aiTeamId) || !Number.isFinite(userId)) continue;
    if (!teamsById.has(aiTeamId) || !teamsById.has(userId)) continue;

    const aiPlayersValid = (offer?.offering?.playerIds ?? []).every((id) => Number(playersById.get(Number(id))?.teamId) === aiTeamId);
    const userPlayersValid = (offer?.receiving?.playerIds ?? []).every((id) => Number(playersById.get(Number(id))?.teamId) === userId);
    const aiPicksValid = (offer?.offering?.pickIds ?? []).every((id) => Number(picksById.get(String(id))?.currentOwner ?? aiTeamId) === aiTeamId);
    const userPicksValid = (offer?.receiving?.pickIds ?? []).every((id) => Number(picksById.get(String(id))?.currentOwner ?? userId) === userId);
    if (!aiPlayersValid || !userPlayersValid || !aiPicksValid || !userPicksValid) continue;

    const signature = offer.signature ?? buildOfferSignature(offer);
    const stableId = offer.id ?? `offer_${signature}_${offer.week ?? week}`;
    if (seenIds.has(stableId) || seenSignatures.has(signature)) continue;
    seenIds.add(stableId);
    seenSignatures.add(signature);
    keep.push({ ...offer, id: stableId, signature });
  }

  return keep.slice(0, Math.max(0, num(options.maxActiveOffers ?? 6, 6)));
}

export function generateInboundOffersToUser(leagueState = {}, userTeamId, options = {}) {
  const cfg = { ...DEFAULT_OPTIONS, ...options };
  const { meta, teams, players } = buildLeagueInput(leagueState);
  const userId = num(userTeamId ?? meta?.userTeamId, NaN);
  const week = num(meta?.currentWeek ?? meta?.week, 1);
  const season = num(meta?.season ?? meta?.year, 1);
  const phase = String(meta?.phase ?? 'regular');
  if (!Number.isFinite(userId) || phase !== 'regular') return [];

  const windowSnapshot = getTradeWindowSnapshot({
    currentWeek: week,
    week,
    phase,
    settings: meta?.settings,
    commissionerMode: meta?.commissionerMode,
  });
  if (!tradeWindowAllowsOffers(windowSnapshot)) return [];

  const existingOffers = pruneStaleInboundOffers(
    options.existingOffers ?? (Array.isArray(meta?.tradeOffers) ? meta.tradeOffers.filter(o => !o?.isBlockOffer && o?.origin !== 'ai_to_ai') : []),
    { meta, teams, players },
    userId,
    { maxActiveOffers: 6 },
  );
  if (existingOffers.length >= cfg.maxActiveOffers) return [];

  const teamsById = new Map(teams.map((team) => [Number(team?.id), team]));
  const userTeam = teamsById.get(userId);
  if (!userTeam) return [];

  const currentSeason = num(meta?.year ?? meta?.season, season);
  const context = { userTeamId: userId, currentSeason, year: currentSeason, week, phase };
  const userRoster = rosterForTeam(players, userId);
  const userCandidates = buildUserRequestCandidates(userTeam, userRoster, context, cfg);
  if (userCandidates.length === 0) return [];

  const usedAssets = new Set(existingOffers.flatMap(offerAssetIds));
  const existingSignatures = new Set(existingOffers.map((offer) => offer.signature ?? buildOfferSignature(offer)));
  const offers = [];
  const sortedAiTeams = teams
    .filter((team) => Number(team?.id) !== userId)
    .slice()
    .sort((a, b) => Number(a?.id) - Number(b?.id));

  for (const aiTeam of sortedAiTeams) {
    if (offers.length >= cfg.maxGeneratedOffersPerWeek) break;
    const gateSeed = `${cfg.seed}|${season}|${week}|${aiTeam?.id}|gate`;
    if (seededRoll(gateSeed) >= cfg.rngGateChance) continue;

    const aiRoster = rosterForTeam(players, aiTeam.id);
    const block = generateAITradeBlock(aiTeam, aiRoster, context, cfg)
      .filter((asset) => !usedAssets.has(asset.assetType === 'pick' ? `k:${asset.pickId}` : `p:${asset.playerId}`));
    if (block.length === 0) continue;

    for (const aiAsset of block) {
      const userAsset = selectUserAssetForAI(aiTeam, aiRoster, userCandidates, context);
      if (!userAsset || usedAssets.has(`p:${userAsset.playerId}`)) continue;
      if (Number(userAsset?.player?.teamId) !== userId) continue;
      if (aiAsset.assetType !== 'pick' && Number(aiAsset?.player?.teamId) !== Number(aiTeam.id)) continue;

      const aiValue = aiAsset.value ?? (aiAsset.assetType === 'pick' ? pickValue(aiAsset.pick, currentSeason) : playerValue(aiAsset.player));
      const userValue = userAsset.value ?? playerValue(userAsset.player);
      let adjustedAiAsset = aiAsset;
      if (aiValue < userValue * 0.82) {
        const sweetener = pickSweetenerForTeam(aiTeam, currentSeason, userValue - aiValue);
        if (!sweetener) continue;
        adjustedAiAsset = {
          ...aiAsset,
          value: aiValue + pickValue(sweetener, currentSeason),
          extraPick: sweetener,
          reasonTags: [...(aiAsset.reasonTags ?? []), 'pick_sweetener'],
        };
      }
      if ((adjustedAiAsset.value ?? aiValue) < userValue * 0.82 || (adjustedAiAsset.value ?? aiValue) > userValue * 1.45) continue;

      const offer = makeOffer({
        aiTeam,
        userTeam,
        aiAsset: adjustedAiAsset,
        userAsset,
        week,
        season,
        currentSeason,
        teamsById,
        seed: `${cfg.seed}|${season}|${week}|${aiTeam.id}|${assetId(aiAsset)}|${userAsset.playerId}`,
      });
      if (adjustedAiAsset.extraPick?.id != null && !offer.offering.pickIds.includes(adjustedAiAsset.extraPick.id)) {
        offer.offering.pickIds.push(adjustedAiAsset.extraPick.id);
        const snapshot = summarizePick(adjustedAiAsset.extraPick, teamsById);
        if (snapshot) offer.offeringPickSnapshots.push(snapshot);
        offer.signature = buildOfferSignature(offer);
      }
      if (existingSignatures.has(offer.signature)) continue;
      offers.push(offer);
      usedAssets.add(`p:${userAsset.playerId}`);
      if (aiAsset.assetType === 'pick') usedAssets.add(`k:${aiAsset.pickId}`);
      else usedAssets.add(`p:${aiAsset.playerId}`);
      existingSignatures.add(offer.signature);
      break;
    }
  }

  return offers.slice(0, Math.max(0, cfg.maxGeneratedOffersPerWeek));
}
