/**
 * playerMoraleEngine.js — Player Morale Causality V1
 *
 * Pure, deterministic morale-causality module.
 * Extends the existing mood system (playerMood.js) with causal events.
 *
 * Design constraints:
 *  - No I/O, no cache access, no mutations.
 *  - No Math.random — all output is deterministic for same inputs.
 *  - Morale score bounded [0, 100]. Default: 70.
 *  - moraleEvents: rolling array, capped at MORALE_EVENTS_CAP entries.
 *  - Deduplication via dedupeKey: same key never applies twice.
 *  - No simulation performance impact.
 *  - V1: morale does NOT feed back into game simulation outcomes.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const MORALE_MIN = 0;
export const MORALE_MAX = 100;
export const MORALE_DEFAULT = 70;
export const MORALE_EVENTS_CAP = 10;

// Per-season cap on total DEADLINE_SELL_FRUSTRATION delta magnitude.
export const DEADLINE_FRUSTRATION_SEASON_CAP = 12;

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampMorale(v) {
  return Math.max(MORALE_MIN, Math.min(MORALE_MAX, v));
}

function safeNum(v, fallback) {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ── Event type constants ───────────────────────────────────────────────────────

export const MORALE_EVENTS = Object.freeze({
  TRADED_TO_CONTENDER:       'TRADED_TO_CONTENDER',
  TRADED_TO_REBUILDER:       'TRADED_TO_REBUILDER',
  CONTRACT_EXTENDED:         'CONTRACT_EXTENDED',
  TRADE_REQUEST_DENIED:      'TRADE_REQUEST_DENIED',
  STARTER_ROLE_LOST:         'STARTER_ROLE_LOST',
  HOLDOUT_RETURNED:          'HOLDOUT_RETURNED',
  VETERAN_LEADER_BONUS:      'VETERAN_LEADER_BONUS',
  DEADLINE_SELL_FRUSTRATION: 'DEADLINE_SELL_FRUSTRATION',
});

// ── Delta constants ────────────────────────────────────────────────────────────
// Centralised so tests can import and verify exact values.

export const MORALE_DELTAS = Object.freeze({
  [MORALE_EVENTS.TRADED_TO_CONTENDER]:        10,
  [MORALE_EVENTS.TRADED_TO_REBUILDER]:        -6,
  [MORALE_EVENTS.CONTRACT_EXTENDED]:          10,
  [MORALE_EVENTS.TRADE_REQUEST_DENIED]:       -12,
  [MORALE_EVENTS.STARTER_ROLE_LOST]:          -8,
  [MORALE_EVENTS.HOLDOUT_RETURNED]:           -8,
  [MORALE_EVENTS.VETERAN_LEADER_BONUS]:        3,
  [MORALE_EVENTS.DEADLINE_SELL_FRUSTRATION]:  -3,
});

// ── Morale label thresholds ────────────────────────────────────────────────────

export const MORALE_LABELS = [
  { min: 85, label: 'Thriving' },
  { min: 70, label: 'Settled' },
  { min: 55, label: 'Neutral' },
  { min: 40, label: 'Frustrated' },
  { min:  0, label: 'Disgruntled' },
];

// Threshold below which a player is flagged for roster-watch items.
export const MORALE_LOW_THRESHOLD = 40;

// Threshold that triggers "Locker Room Watch" pulse/news events.
export const MORALE_ALERT_THRESHOLD = 35;

// ── Core: applyMoraleEvent ─────────────────────────────────────────────────────

/**
 * Apply a morale event to a player object.
 * Returns a new player object (pure — no mutation).
 *
 * @param {object} player   – current player data ({ id, morale?, moraleEvents? })
 * @param {object} event    – { type, delta?, season?, week?, reason?, source?, dedupeKey? }
 * @param {object} context  – { season, week } (fallback values for event fields)
 * @returns {object}        – updated player object, or same reference if no change
 */
export function applyMoraleEvent(player, event, context = {}) {
  if (!player || !event?.type) return player;

  const currentMorale = safeNum(player.morale, MORALE_DEFAULT);
  const existingEvents = Array.isArray(player.moraleEvents) ? player.moraleEvents : [];

  // Stable dedupeKey: same event never applied twice per player
  const dedupeKey = event.dedupeKey
    ?? `${event.type}-${event.source ?? 'X'}-${context.season ?? 0}-${context.week ?? 0}`;

  if (existingEvents.some((e) => e.dedupeKey === dedupeKey)) {
    return player;
  }

  // DEADLINE_SELL_FRUSTRATION is additionally capped per season
  if (event.type === MORALE_EVENTS.DEADLINE_SELL_FRUSTRATION) {
    const eventSeason = event.season ?? context.season ?? 0;
    const seasonAccumulated = existingEvents
      .filter((e) => e.type === MORALE_EVENTS.DEADLINE_SELL_FRUSTRATION && e.season === eventSeason)
      .reduce((sum, e) => sum + Math.abs(safeNum(e.delta, 0)), 0);
    if (seasonAccumulated >= DEADLINE_FRUSTRATION_SEASON_CAP) {
      return player;
    }
  }

  const delta = safeNum(event.delta ?? MORALE_DELTAS[event.type] ?? 0, 0);
  const newMorale = clampMorale(currentMorale + delta);

  const entry = {
    type:      String(event.type),
    delta,
    season:    event.season ?? context.season ?? 0,
    week:      event.week   ?? context.week   ?? 0,
    reason:    event.reason ?? '',
    source:    event.source ?? '',
    dedupeKey,
  };

  // Rolling cap: keep only the most recent MORALE_EVENTS_CAP entries
  const nextEvents = [...existingEvents, entry].slice(-MORALE_EVENTS_CAP);

  return {
    ...player,
    morale:       newMorale,
    moraleEvents: nextEvents,
  };
}

// ── getPlayerMoraleSummary ─────────────────────────────────────────────────────

/**
 * Return a human-readable morale summary for display.
 *
 * @param {object} player
 * @returns {{ score: number, label: string, topEvent: object|null, isLow: boolean, isAlert: boolean }}
 */
export function getPlayerMoraleSummary(player) {
  const score = safeNum(player?.morale, MORALE_DEFAULT);
  const entry = MORALE_LABELS.find((l) => score >= l.min) ?? MORALE_LABELS[MORALE_LABELS.length - 1];
  const events = Array.isArray(player?.moraleEvents) ? player.moraleEvents : [];
  const topEvent = events.length > 0 ? events[events.length - 1] : null;

  return {
    score,
    label:    entry.label,
    topEvent,
    isLow:    score < MORALE_LOW_THRESHOLD,
    isAlert:  score < MORALE_ALERT_THRESHOLD,
  };
}

// ── applyWeeklyMoraleEffects ───────────────────────────────────────────────────

/**
 * Apply recurring weekly morale effects to all players.
 *
 * Effects applied in V1:
 *  - VETERAN_LEADER_BONUS: veterans (age ≥ 30) with mentor/loyal trait or high
 *    leadership, on contender or playoff-hunt teams — once per week per player.
 *  - DEADLINE_SELL_FRUSTRATION: players on seller/rebuild teams within 3 weeks of
 *    the trade deadline — once per week per player, capped at
 *    DEADLINE_FRUSTRATION_SEASON_CAP total per season.
 *
 * NOTE: DEADLINE_SELL_FRUSTRATION is driven by current posture + week because
 * buildDeadlineMemoryEvent() events from #1586 are not yet persisted through
 * league-memory.js. When deadline memory persistence is added, switch to reading
 * from that store instead.
 * TODO: wire to league-memory deadline events when persistence is added.
 *
 * @param {object[]} players       – array of player data objects
 * @param {object}   context       – {
 *   season: number,
 *   week: number,
 *   deadlineWeek: number,
 *   phase: string,
 *   teamPostureMap: Record<string, string>  – DEADLINE_POSTURE value per teamId
 * }
 * @returns {object[]}             – updated player array (new refs only for changed players)
 */
export function applyWeeklyMoraleEffects(players, context = {}) {
  if (!Array.isArray(players)) return players;

  const {
    season       = 0,
    week         = 0,
    deadlineWeek = 9,
    phase        = 'regular',
    teamPostureMap = {},
  } = context;

  if (phase !== 'regular') return players;

  const weeksToDeadline = deadlineWeek - week;
  const isDeadlineWindow = weeksToDeadline >= 0 && weeksToDeadline <= 3;

  return players.map((player) => {
    if (!player?.id) return player;

    const posture = teamPostureMap[String(player.teamId)] ?? null;
    const isContenderOrHunt = posture === 'contender' || posture === 'playoff_hunt';
    const isSellerOrRebuild = posture === 'seller'    || posture === 'rebuild';

    const age    = safeNum(player.age, 26);
    const traits = Array.isArray(player.traits)
      ? player.traits.map((t) => String(t).toLowerCase())
      : [];
    const leadership = safeNum(player?.personalityProfile?.leadership, 0);

    const isVeteranLeader = age >= 30 && (
      traits.includes('mentor') ||
      traits.includes('loyal') ||
      leadership >= 65
    );

    let updated = player;

    if (isVeteranLeader && isContenderOrHunt) {
      updated = applyMoraleEvent(updated, {
        type:      MORALE_EVENTS.VETERAN_LEADER_BONUS,
        delta:     MORALE_DELTAS[MORALE_EVENTS.VETERAN_LEADER_BONUS],
        season,
        week,
        reason:    'Veteran leader on a winning team',
        source:    'weekly_advance',
        dedupeKey: `${MORALE_EVENTS.VETERAN_LEADER_BONUS}-${player.id}-${season}-${week}`,
      }, { season, week });
    }

    if (isSellerOrRebuild && isDeadlineWindow) {
      updated = applyMoraleEvent(updated, {
        type:      MORALE_EVENTS.DEADLINE_SELL_FRUSTRATION,
        delta:     MORALE_DELTAS[MORALE_EVENTS.DEADLINE_SELL_FRUSTRATION],
        season,
        week,
        reason:    'On a seller team near the trade deadline',
        source:    'weekly_advance',
        dedupeKey: `${MORALE_EVENTS.DEADLINE_SELL_FRUSTRATION}-${player.id}-${season}-${week}`,
      }, { season, week });
    }

    return updated;
  });
}
