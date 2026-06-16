/**
 * tradeRequestEngine.js — Trade Requests V1
 *
 * Pure, deterministic trade-request module.
 *
 * Design constraints:
 *  - No I/O, no cache access, no side effects.
 *  - No imports from worker, UI, news, morale engine, holdout engine,
 *    HOF engine, coaching engine, FA, scouting, or sim engine.
 *  - No Math.random — seeded LCG only.
 *  - Receives depthRank, isPositionMisfitForScheme, moraleSummary,
 *    hofStatus as arguments — does not import those engines.
 *  - Returns updated objects — no mutation of inputs.
 *  - Fully deterministic given same inputs.
 */

// ── Reason definitions ─────────────────────────────────────────────────────────

export const TRADE_REQUEST_REASONS = Object.freeze({
  playing_time: {
    label: 'Wants more playing time',
  },
  scheme_fit: {
    label: 'Does not fit offensive/defensive scheme',
  },
  contract: {
    label: 'Seeking better contract opportunity',
  },
  personal: {
    label: 'Personal reasons',
  },
});

// ── Stonewall thresholds ───────────────────────────────────────────────────────

export const STONEWALL_THRESHOLDS = Object.freeze({
  weeks_1_3:   Object.freeze({ moraleHit: 0,  teamMoraleHit: 0  }),
  weeks_4_6:   Object.freeze({ moraleHit: -4, teamMoraleHit: -2 }),
  weeks_7plus: Object.freeze({ moraleHit: -8, teamMoraleHit: -4 }),
});

// ── Trade value modifiers ──────────────────────────────────────────────────────

export const TRADE_VALUE_MODIFIERS = Object.freeze({
  onTradeBlock:        -0.08,
  stonewalledRequest:  -0.12,
  honoredRequest:       0.00,
  withdrawn:           +0.05,
});

// ── Morale event type strings ─────────────────────────────────────────────────
// Defined inline so this module imports nothing from playerMoraleEngine.

export const TRADE_REQUEST_MORALE_EVENTS = Object.freeze({
  TRADE_REQUESTED:                   'TRADE_REQUESTED',
  TRADE_REQUEST_HONORED:             'TRADE_REQUEST_HONORED',
  TRADE_REQUEST_WITHDRAWN_EXTENSION: 'TRADE_REQUEST_WITHDRAWN_EXTENSION',
  TRADE_REQUEST_STONEWALLED:         'TRADE_REQUEST_STONEWALLED',
  TEAMMATE_TRADE_REQUEST:            'TEAMMATE_TRADE_REQUEST',
});

export const TRADE_REQUEST_MORALE_DELTAS = Object.freeze({
  TRADE_REQUESTED:                   -5,
  TRADE_REQUEST_HONORED:             +6,
  TRADE_REQUEST_WITHDRAWN_EXTENSION: +4,
  TRADE_REQUEST_STONEWALLED:         -4,  // overridden by threshold band
  TEAMMATE_TRADE_REQUEST:            -2,
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getContractYearsLeft(player) {
  const explicit = player?.contractYearsLeft;
  if (explicit != null) return safeNum(explicit, 1);
  return safeNum(player?.contract?.yearsRemaining, 1);
}

// ── Seeded LCG ────────────────────────────────────────────────────────────────
// Numerical Recipes LCG; returns float in [0, 1).

function lcgRandom(seed) {
  const a = 1664525;
  const c = 1013904223;
  const next = ((a * (seed >>> 0) + c) >>> 0);
  return next / 0x100000000;
}

// ── Core: getTradeRequestReason ───────────────────────────────────────────────

/**
 * Evaluate which trade request reason applies for this player, or null.
 * Checks triggers in order: playing_time → scheme_fit → contract → personal.
 *
 * @param {object} player   – player data object
 * @param {object} team     – team data object
 * @param {object} context  – { depthRank, isPositionMisfitForScheme }
 * @param {number} season   – current season id (for LCG seed)
 * @returns {string|null}   – reason key or null
 */
export function getTradeRequestReason(player, team, context = {}, season = 0) {
  if (!player) return null;

  const morale = safeNum(player.morale, 70);
  const {
    depthRank              = 0,
    isPositionMisfitForScheme = false,
  } = context;

  // playing_time: depthRank >= 2 AND morale < 45
  if (depthRank >= 2 && morale < 45) {
    return 'playing_time';
  }

  // scheme_fit: isPositionMisfitForScheme AND morale < 55
  if (isPositionMisfitForScheme && morale < 55) {
    return 'scheme_fit';
  }

  // contract: contractYearsLeft === 1 AND extensionOffered === false AND morale < 50
  const yearsLeft = getContractYearsLeft(player);
  const extensionOffered = player.extensionOfferedThisSeason === true;
  if (yearsLeft === 1 && !extensionOffered && morale < 50) {
    return 'contract';
  }

  // personal: seeded 3% per season for morale < 35
  if (morale < 35) {
    const seedInput = (safeNum(player.id, 0) * 1000 + safeNum(season, 0)) >>> 0;
    if (lcgRandom(seedInput) < 0.03) {
      return 'personal';
    }
  }

  return null;
}

// ── Core: shouldPlayerRequestTrade ────────────────────────────────────────────

/**
 * Determine if a player should initiate a trade request this week.
 * Returns false if they are already in a request, on active holdout, or a UFA.
 *
 * @param {object} player   – player data object
 * @param {object} team     – team data object
 * @param {number} season   – current season id
 * @param {number} week     – current week
 * @param {object} context  – { depthRank, isPositionMisfitForScheme }
 * @returns {boolean}
 */
export function shouldPlayerRequestTrade(player, team, season, week, context = {}) {
  if (!player) return false;

  // Already has any trade request (pending, honored, withdrawn)
  if (player.tradeRequest != null) return false;

  // UFA — they just leave in free agency
  if (getContractYearsLeft(player) === 0) return false;

  // Already in active holdout
  if (player.holdout?.active === true) return false;

  return getTradeRequestReason(player, team, context, season) !== null;
}

// ── Core: computeTradeValueModifier ───────────────────────────────────────────

/**
 * Compute the trade value modifier for a player based on their trade request
 * status and on-block status.
 *
 * Modifiers apply outside the ±25% negotiationModifiers cap — trade value
 * is separate from FA demand.
 *
 * @param {object} player
 * @returns {{ modifier: number, reason: string }|null}
 */
export function computeTradeValueModifier(player) {
  if (!player) return null;

  const req = player.tradeRequest;

  // Stonewall penalty: pending AND stonewalledWeeks >= 4
  // Everyone in the league knows this team needs to move him
  if (req != null && safeNum(req.stonewalledWeeks, 0) >= 4) {
    return {
      modifier: TRADE_VALUE_MODIFIERS.stonewalledRequest,
      reason: 'Trade request stonewalled 4+ weeks — leverage lost',
    };
  }

  // Withdrawn recovery (player re-engaged — slight positive signal)
  if (req?.status === 'withdrawn') {
    return {
      modifier: TRADE_VALUE_MODIFIERS.withdrawn,
      reason: 'Player withdrew trade request after extension talks',
    };
  }

  // On trade block (publicly listed)
  if (player.onTradeBlock) {
    return {
      modifier: TRADE_VALUE_MODIFIERS.onTradeBlock,
      reason: 'Player publicly listed on trade block',
    };
  }

  return null;
}

// ── Core: resolveTradeRequest ─────────────────────────────────────────────────

/**
 * Apply a GM action to an active trade request.
 * Returns a new player object and morale events — no mutation.
 *
 * @param {object} player   – player data object
 * @param {string} action   – 'honor' | 'extend' | 'stonewall' | 'traded'
 * @param {object} context  – { season, week }
 * @returns {{ updatedPlayer: object, moraleEvents: object[] }}
 */
export function resolveTradeRequest(player, action, context = {}) {
  if (!player) return { updatedPlayer: player, moraleEvents: [] };

  const { season = 0, week = 0 } = context;
  const req = player.tradeRequest ?? {
    status: 'pending',
    requestedSeason: season,
    requestedWeek:   week,
    stonewalledWeeks: 0,
    reason:          'personal',
  };

  let updatedPlayer = { ...player };
  const moraleEvents = [];

  switch (action) {
    case 'honor': {
      updatedPlayer = {
        ...player,
        onTradeBlock:  true,
        tradeRequest:  { ...req, status: 'honored' },
      };
      moraleEvents.push({
        type:      TRADE_REQUEST_MORALE_EVENTS.TRADE_REQUEST_HONORED,
        delta:     TRADE_REQUEST_MORALE_DELTAS.TRADE_REQUEST_HONORED,
        season,
        week,
        reason:    'GM honored trade request and listed player on block',
        source:    'trade_request_engine',
        dedupeKey: `trade_honored_${player.id}_${season}`,
      });
      break;
    }

    case 'extend': {
      updatedPlayer = {
        ...player,
        tradeRequest: { ...req, status: 'withdrawn' },
      };
      moraleEvents.push({
        type:      TRADE_REQUEST_MORALE_EVENTS.TRADE_REQUEST_WITHDRAWN_EXTENSION,
        delta:     TRADE_REQUEST_MORALE_DELTAS.TRADE_REQUEST_WITHDRAWN_EXTENSION,
        season,
        week,
        reason:    'Extension offered — player withdrew trade request',
        source:    'trade_request_engine',
        dedupeKey: `trade_withdrawn_ext_${player.id}_${season}`,
      });
      break;
    }

    case 'stonewall': {
      const prevWeeks = safeNum(req.stonewalledWeeks, 0);
      const stonewalledWeeks = prevWeeks + 1;

      const threshold = _getStonewall(stonewalledWeeks);

      updatedPlayer = {
        ...player,
        tradeRequest: {
          ...req,
          status: 'pending',
          stonewalledWeeks,
        },
      };

      if (threshold.moraleHit !== 0) {
        moraleEvents.push({
          type:      TRADE_REQUEST_MORALE_EVENTS.TRADE_REQUEST_STONEWALLED,
          delta:     threshold.moraleHit,
          season,
          week,
          reason:    'GM ignored trade request',
          source:    'trade_request_engine',
          dedupeKey: `trade_stonewalled_${player.id}_${season}_${week}`,
        });
      }
      break;
    }

    case 'traded': {
      // The actual move is handled by existing trade logic — just update status
      updatedPlayer = {
        ...player,
        tradeRequest: { ...req, status: 'honored' },
      };
      break;
    }

    default:
      break;
  }

  return { updatedPlayer, moraleEvents };
}

// ── Core: evaluateWeeklyStonewall ─────────────────────────────────────────────

/**
 * Return the morale hit and team morale hit for this week's stonewall,
 * based on how many weeks the request has been outstanding.
 *
 * @param {object} player   – player with player.tradeRequest.stonewalledWeeks
 * @returns {{ moraleHit: number, teamMoraleHit: number }}
 */
export function evaluateWeeklyStonewall(player) {
  const weeks = safeNum(player?.tradeRequest?.stonewalledWeeks, 0);
  return _getStonewall(weeks);
}

function _getStonewall(weeks) {
  if (weeks >= 7) return STONEWALL_THRESHOLDS.weeks_7plus;
  if (weeks >= 4) return STONEWALL_THRESHOLDS.weeks_4_6;
  return STONEWALL_THRESHOLDS.weeks_1_3;
}

// ── Core: getActiveTradeRequests ──────────────────────────────────────────────

/**
 * Return all active (pending) trade request alerts for a team.
 *
 * @param {object}   team    – team data object
 * @param {object[]} players – all players array
 * @returns {object[]}       – TradeRequestAlert[]
 */
export function getActiveTradeRequests(team, players) {
  if (!team || !Array.isArray(players)) return [];

  const teamId = team.id;
  const alerts = [];

  for (const player of players) {
    if (Number(player?.teamId) !== Number(teamId)) continue;
    const req = player.tradeRequest;
    if (!req) continue;
    // Only surface pending requests (honored and withdrawn are resolved)
    if (req.status === 'honored' || req.status === 'withdrawn') continue;

    alerts.push({
      playerId:        player.id,
      playerName:      player.name    ?? 'Unknown',
      pos:             player.pos     ?? '??',
      ovr:             player.ovr     ?? 70,
      reason:          req.reason,
      requestedWeek:   req.requestedWeek   ?? 0,
      requestedSeason: req.requestedSeason ?? 0,
      status:          req.status,
      stonewalledWeeks: safeNum(req.stonewalledWeeks, 0),
    });
  }

  return alerts;
}
