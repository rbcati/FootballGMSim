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
import { applyTradePersonaModifier } from '../ai/frontOfficePersonaEngine.js';

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

export const DEADLINE_CONFIG = Object.freeze({
  deadline_week:        10,
  tension_start_week:   8,
  deadline_spike_week:  8,
  attempts_by_week: Object.freeze({
    default:   3,
    week_8:    6,
    week_9_10: 10,
  }),
  max_eval_ms_deadline: 15,
});

export const DEADLINE_VALUATION_MODIFIERS = Object.freeze({
  contender: Object.freeze({
    trigger: Object.freeze({ incoming_ovr_min: 82, incoming_age_max: 29 }),
    incoming_player_multiplier: 1.25,
    outgoing_pick_multiplier:   0.85,
  }),
  rebuilder: Object.freeze({
    trigger: Object.freeze({ outgoing_age_min: 29, outgoing_ovr_min: 80 }),
    outgoing_player_multiplier: 0.80,
    incoming_pick_multiplier:   1.20,
  }),
});

export const DEADLINE_RANK_THRESHOLDS = Object.freeze({
  contender_top_n:    8,
  rebuilder_bottom_n: 8,
});

// ── Seeded LCG ─────────────────────────────────────────────────────────────────

function lcgStep(seed) {
  return ((1664525 * (seed >>> 0) + 1013904223) >>> 0);
}

function lcgRandom(seed) {
  return lcgStep(seed) / 0x100000000;
}

// ── Deadline window helpers ────────────────────────────────────────────────────

export function isDeadlineWindow(currentWeek) {
  return currentWeek >= DEADLINE_CONFIG.tension_start_week &&
         currentWeek <= DEADLINE_CONFIG.deadline_week;
}

export function isTradeWindowOpen(currentWeek) {
  return currentWeek <= DEADLINE_CONFIG.deadline_week;
}

export function isRival(teamAId, teamBId, allTeams) {
  const a = allTeams.find(t => t.id === teamAId);
  const b = allTeams.find(t => t.id === teamBId);
  if (!a || !b) return { isRival: false };
  if (a.div === b.div && a.conf === b.conf) return { isRival: true, rivalType: 'division' };
  if (a.conf === b.conf) return { isRival: true, rivalType: 'conference' };
  return { isRival: false };
}

export function getWeeklyAttemptCount(currentWeek) {
  if (currentWeek < TRADING_WEEKS.start || currentWeek > TRADING_WEEKS.end) return 0;
  if (currentWeek === 8) return DEADLINE_CONFIG.attempts_by_week.week_8;
  if (currentWeek >= 9)  return DEADLINE_CONFIG.attempts_by_week.week_9_10;
  return DEADLINE_CONFIG.attempts_by_week.default;
}

export function computeDeadlineValuationModifier(team, player, role, allTeams, currentWeek) {
  if (!isDeadlineWindow(currentWeek) || !team || !Array.isArray(allTeams) || allTeams.length === 0) {
    return { incomingMultiplier: 1.0, outgoingMultiplier: 1.0 };
  }

  const sorted = [...allTeams].sort((a, b) => (b.overallRating ?? b.ovr ?? 0) - (a.overallRating ?? a.ovr ?? 0));
  const idx = sorted.findIndex(t => t.id === team.id);
  if (idx === -1) return { incomingMultiplier: 1.0, outgoingMultiplier: 1.0 };

  const n = allTeams.length;

  if (role === 'buyer' && idx < DEADLINE_RANK_THRESHOLDS.contender_top_n) {
    const { incoming_ovr_min, incoming_age_max } = DEADLINE_VALUATION_MODIFIERS.contender.trigger;
    if (Number(player?.ovr ?? 0) >= incoming_ovr_min && Number(player?.age ?? 99) <= incoming_age_max) {
      return {
        incomingMultiplier: DEADLINE_VALUATION_MODIFIERS.contender.incoming_player_multiplier,
        outgoingMultiplier: DEADLINE_VALUATION_MODIFIERS.contender.outgoing_pick_multiplier,
      };
    }
  }

  if (role === 'seller' && idx >= n - DEADLINE_RANK_THRESHOLDS.rebuilder_bottom_n) {
    const { outgoing_age_min, outgoing_ovr_min } = DEADLINE_VALUATION_MODIFIERS.rebuilder.trigger;
    if (Number(player?.age ?? 0) >= outgoing_age_min && Number(player?.ovr ?? 0) >= outgoing_ovr_min) {
      return {
        incomingMultiplier: DEADLINE_VALUATION_MODIFIERS.rebuilder.outgoing_player_multiplier,
        outgoingMultiplier: DEADLINE_VALUATION_MODIFIERS.rebuilder.incoming_pick_multiplier,
      };
    }
  }

  return { incomingMultiplier: 1.0, outgoingMultiplier: 1.0 };
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

export function validateTradeBalance(contenderGives, contenderReceives, rebuilderGives, rebuilderReceives, deadlineModifiers) {
  const cMods = deadlineModifiers?.contender ?? null;
  const rMods = deadlineModifiers?.rebuilder ?? null;

  const contenderIncoming = Number(contenderReceives ?? 0) * (cMods?.incomingMultiplier ?? 1.0);
  const contenderOutgoing = Number(contenderGives    ?? 0) * (cMods?.outgoingMultiplier ?? 1.0);
  const rebuilderIncoming = Number(rebuilderReceives ?? 0) * (rMods?.outgoingMultiplier ?? 1.0);
  const rebuilderOutgoing = Number(rebuilderGives    ?? 0) * (rMods?.incomingMultiplier ?? 1.0);

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
  const evalBudgetMs = isDeadlineWindow(week) ? DEADLINE_CONFIG.max_eval_ms_deadline : MAX_EVAL_DURATION_MS;

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

  if (Date.now() - startTime > evalBudgetMs) return null;

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

  // Deadline valuation modifiers (deterministic, no Math.random)
  const contenderMods = computeDeadlineValuationModifier(teamA, rebuilderAsset.player, 'buyer', allTeams, week);
  const rebuilderMods = computeDeadlineValuationModifier(teamB, rebuilderAsset.player, 'seller', allTeams, week);
  const deadlineModifiers = { contender: contenderMods, rebuilder: rebuilderMods };

  // Value balance check with persona overlays applied before deadline modifiers.
  // Each side's perceived value is adjusted by their front-office philosophy.
  const contenderGivesValue   = applyTradePersonaModifier(teamA, contenderAsset, contenderAsset.value, { direction: 'giving' });
  const contenderReceivesValue = applyTradePersonaModifier(teamA, rebuilderAsset, rebuilderAsset.value, { direction: 'receiving' });
  const rebuilderGivesValue   = applyTradePersonaModifier(teamB, rebuilderAsset, rebuilderAsset.value, { direction: 'giving' });
  const rebuilderReceivesValue = applyTradePersonaModifier(teamB, contenderAsset, contenderAsset.value, { direction: 'receiving' });

  const balance = validateTradeBalance(contenderGivesValue, contenderReceivesValue, rebuilderGivesValue, rebuilderReceivesValue, deadlineModifiers);
  if (!balance.valid) return null;

  if (Date.now() - startTime > evalBudgetMs) return null;

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
  if (!isTradeWindowOpen(week)) return [];

  const startTime = Date.now();
  const maxAttempts = getWeeklyAttemptCount(week);
  if (maxAttempts === 0) return [];

  const evalBudgetMs = isDeadlineWindow(week) ? DEADLINE_CONFIG.max_eval_ms_deadline : MAX_EVAL_DURATION_MS;
  const trades = [];
  const usedPairs = new Set();

  for (let i = 0; i < maxAttempts; i++) {
    const elapsed = Date.now() - startTime;
    if (elapsed > evalBudgetMs * maxAttempts) break;

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

export function applyAIToAITrade(trade, state, userTeamId = null) {
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

  let rivalAlert = null;
  if (userTeamId !== null) {
    const allTeams = state.teams ?? [];
    const rivalCheckA = isRival(userTeamId, teamAId, allTeams);
    const rivalCheckB = isRival(userTeamId, teamBId, allTeams);
    const rival = rivalCheckA.isRival ? rivalCheckA : rivalCheckB.isRival ? rivalCheckB : null;
    if (rival) {
      rivalAlert = {
        rivalType: rival.rivalType,
        acquiringTeam: trade.teamAName,
        departingTeam: trade.teamBName,
        playerName: trade.playerName,
      };
    }
  }

  return { teams, rosters, picks, meta, rivalAlert };
}
