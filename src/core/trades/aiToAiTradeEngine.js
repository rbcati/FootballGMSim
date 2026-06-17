/**
 * aiToAiTradeEngine.js — Pure AI-to-AI Trade Engine
 *
 * Design constraints:
 *  - No I/O, no cache access, no side effects.
 *  - No imports from worker, UI, news, morale, holdout, scouting,
 *    HOF, coaching, FA, extension, restructure, or sim engine.
 *  - No Math.random — seeded LCG only.
 *  - Returns new objects — no mutation of inputs.
 *  - Fully deterministic given same inputs.
 */

import { getAssetValue } from './assetValuation.js';

// ── Constants ──────────────────────────────────────────────────────────────────

export const TEAM_ROLE_THRESHOLDS = Object.freeze({
  contender_cutoff: 0.60,
  rebuilder_cutoff: 0.40,
});

export const KEY_POSITIONS = Object.freeze(['QB', 'WR', 'RB', 'CB', 'OLB', 'DE']);

export const VALUE_FORMULAS = Object.freeze({
  contender: { incoming_threshold: 0.95 },
  rebuilder:  { incoming_threshold: 1.05 },
});

export const MAX_TRADES_PER_WEEK = 3;

export const TRADING_WEEKS = Object.freeze({ start: 1, end: 10 });

export const MAX_EVAL_DURATION_MS = 10;

// ── Seeded LCG ─────────────────────────────────────────────────────────────────

function lcgStep(seed) {
  return ((1664525 * (seed >>> 0) + 1013904223) >>> 0);
}

function lcgRandom(seed) {
  return lcgStep(seed) / 0x100000000;
}

// ── classifyTeam ───────────────────────────────────────────────────────────────

export function classifyTeam(team, allTeams) {
  if (!team || !Array.isArray(allTeams) || allTeams.length === 0) return 'mid';

  const sorted = [...allTeams].sort((a, b) => (b.overallRating ?? b.ovr ?? 0) - (a.overallRating ?? a.ovr ?? 0));
  const idx = sorted.findIndex(t => t.id === team.id);
  if (idx === -1) return 'mid';

  const percentile = 1 - idx / allTeams.length; // higher = stronger
  if (percentile >= TEAM_ROLE_THRESHOLDS.contender_cutoff) return 'contender';
  if (percentile <= TEAM_ROLE_THRESHOLDS.rebuilder_cutoff) return 'rebuilder';
  return 'mid';
}

// ── findStarterGap ─────────────────────────────────────────────────────────────

export function findStarterGap(team, roster, position) {
  const posPlayers = (roster ?? []).filter(p => p?.pos === position && Number(p?.teamId) === Number(team?.id));
  const starters = posPlayers.filter(p => Number(p?.ovr ?? 0) >= 66);
  const quality  = posPlayers.filter(p => Number(p?.ovr ?? 0) >= 74);
  const backups  = posPlayers.filter(p => Number(p?.ovr ?? 0) >= 56 && Number(p?.ovr ?? 0) < 66);

  const bestOvr = posPlayers.reduce((max, p) => Math.max(max, Number(p?.ovr ?? 0)), 0);

  if (quality.length === 0) {
    return { hasGap: true, gapSeverity: 'severe', bestOvr };
  }
  if (starters.length >= 1 && backups.length === 0 && starters.length < 2) {
    return { hasGap: true, gapSeverity: 'moderate', bestOvr };
  }
  if (starters.length >= 2) {
    return { hasGap: false, gapSeverity: 'none', bestOvr };
  }
  return { hasGap: false, gapSeverity: 'none', bestOvr };
}

// ── findTradableAsset ──────────────────────────────────────────────────────────

export function findTradableAsset(team, roster, allPicks, targetPosition, role, seed) {
  const teamId = Number(team?.id);
  const teamRoster = (roster ?? []).filter(p => Number(p?.teamId) === teamId);
  const teamPicks = (allPicks ?? []).filter(pk => Number(pk?.currentTeamId ?? pk?.teamId ?? -1) === teamId);

  if (role === 'contender') {
    // Contender sends picks or depth (OVR 60–72, not a starter at a position of need)
    const depthPlayers = teamRoster.filter(p => {
      const ovr = Number(p?.ovr ?? 0);
      return ovr >= 60 && ovr <= 72;
    });
    const pickValues = teamPicks.map(pk => ({ player: null, type: 'pick', value: getAssetValue(pk, null, {}), pick: pk }));
    const playerValues = depthPlayers.map(p => ({ player: p, type: 'player', value: getAssetValue(p, null, {}) }));
    const candidates = [...pickValues, ...playerValues].sort((a, b) => b.value - a.value);
    return candidates[0] ?? null;
  }

  // Rebuilder sends high-OVR player at targetPosition
  const candidates = teamRoster.filter(p => {
    if (p?.pos !== targetPosition) return false;
    const ovr = Number(p?.ovr ?? 0);
    if (ovr < 74) return false;
    return p?.tradeRequest?.status === 'pending' || p?.onTradeBlock === true;
  });

  if (candidates.length === 0) return null;

  const best = candidates.sort((a, b) => Number(b?.ovr ?? 0) - Number(a?.ovr ?? 0))[0];
  return { player: best, type: 'player', value: getAssetValue(best, null, {}) };
}

// ── computeCapImpact ───────────────────────────────────────────────────────────

export function computeCapImpact(team, incomingPlayer, outgoingPlayer) {
  const capSpace = Number(team?.capSpace ?? team?.capRoom ?? 0);
  const inSalary  = Number(incomingPlayer?.contract?.baseAnnual ?? incomingPlayer?.salary ?? 0);
  const outSalary = Number(outgoingPlayer?.contract?.baseAnnual ?? outgoingPlayer?.salary ?? 0);
  const postTradeCap = capSpace - inSalary + outSalary;
  return { postTradeCap, isLegal: postTradeCap >= 0 };
}

// ── validateTradeBalance ───────────────────────────────────────────────────────

export function validateTradeBalance(contenderGives, contenderReceives, rebuilderGives, rebuilderReceives) {
  const contenderIncoming = Number(contenderReceives ?? 0);
  const contenderOutgoing = Number(contenderGives    ?? 0);
  const rebuilderIncoming = Number(rebuilderReceives ?? 0);
  const rebuilderOutgoing = Number(rebuilderGives    ?? 0);

  if (contenderIncoming <= contenderOutgoing * VALUE_FORMULAS.contender.incoming_threshold) {
    return { valid: false, reason: 'contender_threshold_not_met' };
  }
  if (rebuilderIncoming <= rebuilderOutgoing * VALUE_FORMULAS.rebuilder.incoming_threshold) {
    return { valid: false, reason: 'rebuilder_threshold_not_met' };
  }
  return { valid: true, reason: 'ok' };
}

// ── attemptAIToAITrade ─────────────────────────────────────────────────────────

export function attemptAIToAITrade(allTeams, allRosters, allPicks, season, week, seed, usedPairs = new Set()) {
  const startTime = Date.now();

  const contenders = allTeams.filter(t => classifyTeam(t, allTeams) === 'contender');
  const rebuilders  = allTeams.filter(t => classifyTeam(t, allTeams) === 'rebuilder');

  if (contenders.length === 0 || rebuilders.length === 0) return null;

  // Seeded pick of contender
  let lcgSeed = lcgStep(seed);
  const contenderIdx = Math.floor(lcgRandom(lcgSeed) * contenders.length);
  const teamA = contenders[contenderIdx];

  lcgSeed = lcgStep(lcgSeed);
  const rebuilderIdx = Math.floor(lcgRandom(lcgSeed) * rebuilders.length);
  const teamB = rebuilders[rebuilderIdx];

  const pairKey = `${Math.min(teamA.id, teamB.id)}_${Math.max(teamA.id, teamB.id)}`;
  if (usedPairs.has(pairKey)) return null;

  if (Date.now() - startTime > MAX_EVAL_DURATION_MS) return null;

  // Find Team A's severe starter gap
  const rosterA = (allRosters ?? []).filter(p => Number(p?.teamId) === Number(teamA.id));
  let targetPosition = null;
  for (const pos of KEY_POSITIONS) {
    const gap = findStarterGap(teamA, rosterA, pos);
    if (gap.gapSeverity === 'severe') { targetPosition = pos; break; }
  }
  if (!targetPosition) return null;

  // Find Team B's tradable asset at that position
  const rosterB = (allRosters ?? []).filter(p => Number(p?.teamId) === Number(teamB.id));
  lcgSeed = lcgStep(lcgSeed);
  const rebuilderAsset = findTradableAsset(teamB, rosterB, allPicks, targetPosition, 'rebuilder', lcgSeed);
  if (!rebuilderAsset || rebuilderAsset.type !== 'player') return null;

  // Find Team A's tradable asset (picks/depth to send)
  lcgSeed = lcgStep(lcgSeed);
  const contenderAsset = findTradableAsset(teamA, rosterA, allPicks, targetPosition, 'contender', lcgSeed);
  if (!contenderAsset) return null;

  // Cap check
  const capA = computeCapImpact(teamA, rebuilderAsset.player, contenderAsset.player ?? null);
  const capB = computeCapImpact(teamB, contenderAsset.player ?? null, rebuilderAsset.player);
  if (!capA.isLegal || !capB.isLegal) return null;

  // Value balance check
  // Team A (contender) gives: contenderAsset.value; receives: rebuilderAsset.value
  const balance = validateTradeBalance(contenderAsset.value, rebuilderAsset.value, rebuilderAsset.value, contenderAsset.value);
  if (!balance.valid) return null;

  if (Date.now() - startTime > MAX_EVAL_DURATION_MS) return null;

  const seedHex = (seed >>> 0).toString(16).padStart(8, '0');
  const offerId = `ai2ai_${teamA.id}_${teamB.id}_s${season}w${week}_${seedHex}`;

  const playerAsset = rebuilderAsset.player;
  const offeredPicks = contenderAsset.type === 'pick' ? [contenderAsset.pick] : [];
  const offeredPlayers = contenderAsset.type === 'player' ? [contenderAsset.player] : [];

  return {
    offerId,
    teamAId:   teamA.id,
    teamAName: teamA.name ?? `Team ${teamA.id}`,
    teamBId:   teamB.id,
    teamBName: teamB.name ?? `Team ${teamB.id}`,
    playerName: playerAsset?.name ?? 'Unknown',
    playerId:   playerAsset?.id,
    playerPos:  playerAsset?.pos ?? targetPosition,
    playerOvr:  playerAsset?.ovr ?? 74,
    offeredPicks,
    offeredPlayers,
    rebuilderAsset,
    contenderAsset,
    season,
    week,
  };
}

// ── runWeeklyAIToAITrading ─────────────────────────────────────────────────────

export function runWeeklyAIToAITrading(allTeams, allRosters, allPicks, season, week, seed) {
  const startTime = Date.now();

  if (week < TRADING_WEEKS.start || week > TRADING_WEEKS.end) return [];

  const trades = [];
  const usedPairs = new Set();

  for (let i = 0; i < MAX_TRADES_PER_WEEK; i++) {
    const elapsed = Date.now() - startTime;
    if (elapsed > MAX_EVAL_DURATION_MS * MAX_TRADES_PER_WEEK) break;

    const attemptSeed = (seed + i * 7919) >>> 0;
    const trade = attemptAIToAITrade(allTeams, allRosters, allPicks, season, week, attemptSeed, usedPairs);
    if (!trade) continue;

    const pairKey = `${Math.min(trade.teamAId, trade.teamBId)}_${Math.max(trade.teamAId, trade.teamBId)}`;
    usedPairs.add(pairKey);
    trades.push(trade);
  }

  return trades;
}

// ── applyAIToAITrade ───────────────────────────────────────────────────────────

export function applyAIToAITrade(trade, state) {
  // state: { teams, rosters, picks, meta }
  const { teamAId, teamBId, playerId, offeredPicks, offeredPlayers } = trade;

  // Clone teams
  const teams = (state.teams ?? []).map(t => {
    if (t.id === teamAId) {
      const capImpact = Number(trade.rebuilderAsset?.player?.contract?.baseAnnual ?? 0)
        - Number(trade.contenderAsset?.player?.contract?.baseAnnual ?? 0);
      return { ...t, capSpace: (t.capSpace ?? t.capRoom ?? 0) - capImpact };
    }
    if (t.id === teamBId) {
      const capImpact = Number(trade.contenderAsset?.player?.contract?.baseAnnual ?? 0)
        - Number(trade.rebuilderAsset?.player?.contract?.baseAnnual ?? 0);
      return { ...t, capSpace: (t.capSpace ?? t.capRoom ?? 0) - capImpact };
    }
    return t;
  });

  // Clone rosters — move player from B to A
  const rosters = (state.rosters ?? []).map(p => {
    if (p.id === playerId) return { ...p, teamId: teamAId };
    // Move offered players from A to B
    if ((offeredPlayers ?? []).some(op => op?.id === p.id)) return { ...p, teamId: teamBId };
    return p;
  });

  // Transfer picks from A to B
  const picks = (state.picks ?? []).map(pk => {
    if ((offeredPicks ?? []).some(op => op?.id === pk.id)) return { ...pk, currentTeamId: teamBId, teamId: teamBId };
    return pk;
  });

  // Record as history in tradeOffers
  const pickDetails = (offeredPicks ?? []).length > 0
    ? (offeredPicks ?? []).map(pk => `a ${pk?.round === 1 ? '1st' : pk?.round === 2 ? '2nd' : pk?.round === 3 ? '3rd' : `${pk?.round}th`}-round pick`).join(' and ')
    : 'depth player';

  const tradeRecord = {
    offerId: trade.offerId,
    origin: 'ai_to_ai',
    fromTeamId: teamBId,
    fromTeamName: trade.teamBName,
    offeredPlayers: offeredPlayers ?? [],
    offeredPicks: offeredPicks ?? [],
    requestedPlayers: [{ id: playerId, name: trade.playerName, pos: trade.playerPos, ovr: trade.playerOvr }],
    requestedPicks: [],
    offerWeek: trade.week,
    offerSeason: trade.season,
    status: 'accepted',
    expiresWeek: trade.week,
    aiValuation: trade.rebuilderAsset?.value ?? 0,
    targetTeamId: null,
    isBlockOffer: false,
    teamAId, teamAName: trade.teamAName,
    teamBId, teamBName: trade.teamBName,
    playerName: trade.playerName,
    pickDetails,
  };

  const existingTradeOffers = Array.isArray(state.meta?.tradeOffers) ? state.meta.tradeOffers : [];
  const meta = { ...state.meta, tradeOffers: [...existingTradeOffers, tradeRecord] };

  return { teams, rosters, picks, meta };
}
