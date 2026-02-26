/**
 * progression-logic.js — Dynamic Offseason Progression & Regression Engine
 *
 * Implements a highly variable age-curve progression system:
 *
 *  Growth  (Age 21–25): Mean +2 OVR | 10% Breakout: +5 to +8 | 5% Bust: -2 to -4
 *  Prime   (Age 26–29): High stability — fluctuate ±1 OVR
 *  Cliff   (Age 30+):   Mean -2 OVR  | 15% Age Cliff: physical traits plummet
 *
 * Returns the mutated player array with `progressionDelta` set on each player.
 * Ratings are adjusted in place so that `calculateOvr` produces the correct
 * post-progression OVR; the delta is stored as `player.progressionDelta`.
 *
 * No DOM / Window dependencies — pure JS, safe for Web Workers.
 */

import { Utils } from './utils.js';
import { calculateOvr } from './player.js';

// ── Physical trait map ────────────────────────────────────────────────────────
// The "Age Cliff" physically degrades the traits that drive OVR for each pos.
// Using the same keys as player.ratings for direct mutation.
const PHYSICAL_TRAITS = {
  QB:  ['speed', 'throwPower'],
  RB:  ['speed', 'acceleration', 'trucking'],
  WR:  ['speed', 'acceleration', 'agility'],
  TE:  ['speed', 'acceleration', 'trucking'],
  OL:  ['runBlock', 'passBlock', 'trucking'],
  DL:  ['passRushSpeed', 'passRushPower', 'runStop'],
  LB:  ['speed', 'runStop', 'passRushSpeed'],
  CB:  ['speed', 'acceleration', 'agility'],
  S:   ['speed', 'acceleration', 'coverage'],
  K:   ['kickPower'],
  P:   ['kickPower'],
};

/**
 * Adjust individual rating fields by `delta`, clamped to [40, 99].
 * Touches only traits present in the player's ratings object.
 */
function applyRatingDelta(ratings, traits, delta) {
  for (const key of traits) {
    if (ratings[key] !== undefined) {
      ratings[key] = Utils.clamp(Math.round(ratings[key] + delta), 40, 99);
    }
  }
}

/**
 * Push all rating fields toward `targetOvr` by adjusting each one by `delta`.
 * Used for Growth/Decline to move ratings and then recalculate OVR.
 * Picks the highest-weight attributes for this position and nudges them.
 */
function nudgeRatingsBy(player, delta) {
  if (!player.ratings || delta === 0) return;
  // Apply the delta spread across all rated attributes proportionally.
  // To keep it simple (and avoid complex per-attr weight logic),
  // we adjust every rating field by the delta, then clamp.
  const keys = Object.keys(player.ratings).filter(k =>
    typeof player.ratings[k] === 'number' && k !== 'height' && k !== 'weight'
  );
  for (const key of keys) {
    player.ratings[key] = Utils.clamp(
      Math.round(player.ratings[key] + delta),
      40, 99
    );
  }
}

/**
 * processPlayerProgression(players)
 *
 * Runs the full age-curve progression pass for every non-retired, non-draft
 * eligible player. Mutates each player in place:
 *   - Adjusts player.ratings to reflect progression/regression
 *   - Recalculates player.ovr
 *   - Stores the OVR delta in player.progressionDelta
 *   - For Age Cliff events: permanently reduces player.potential
 *
 * @param {Object[]} players  Array of player objects from the cache.
 * @returns {{ gainers: Object[], regressors: Object[] }}
 *   Top gainers and shocking regressors for news generation.
 */
export function processPlayerProgression(players) {
  const gainers    = []; // players with progressionDelta >= +4
  const regressors = []; // players with progressionDelta <= -3

  for (const player of players) {
    // Skip draft prospects and retired players
    if (player.status === 'draft_eligible' || player.status === 'retired') continue;
    if (!player.ratings) continue;

    const age       = player.age ?? 22;
    const ovrBefore = player.ovr ?? 70;
    let ovrDelta    = 0;
    let cliffEvent  = false;
    let bustEvent   = false;
    let breakoutEvent = false;

    // ── Age 21–25: Growth phase ────────────────────────────────────────────
    if (age >= 21 && age <= 25) {
      const roll = Utils.random();

      if (roll < 0.10) {
        // Breakout: +5 to +8 OVR
        ovrDelta = Utils.rand(5, 8);
        breakoutEvent = true;
      } else if (roll < 0.15) {
        // Bust: -2 to -4 OVR (permanently reduces potential)
        ovrDelta = -Utils.rand(2, 4);
        bustEvent = true;
      } else {
        // Normal growth: mean +2 (range +1 to +3)
        ovrDelta = Utils.rand(1, 3);
      }
    }

    // ── Age 26–29: Prime phase ────────────────────────────────────────────
    else if (age >= 26 && age <= 29) {
      // High stability — small fluctuation ±1
      ovrDelta = Utils.rand(-1, 1);
    }

    // ── Age 30+: Cliff phase ──────────────────────────────────────────────
    else if (age >= 30) {
      const roll = Utils.random();

      if (roll < 0.15) {
        // Age Cliff: physical traits plummet, steep OVR drop
        const physDrop = -Utils.rand(5, 8);
        const traits = PHYSICAL_TRAITS[player.pos] ?? PHYSICAL_TRAITS.QB;
        applyRatingDelta(player.ratings, traits, physDrop);
        cliffEvent = true;
        // OVR will be recalculated from ratings below; delta is just the large number
        ovrDelta = 0; // Will be derived from rating recalc
      } else {
        // Normal cliff: mean -2 (range -1 to -3)
        ovrDelta = -Utils.rand(1, 3);
      }
    }

    // ── Apply non-cliff deltas via rating nudges ───────────────────────────
    if (!cliffEvent && ovrDelta !== 0) {
      nudgeRatingsBy(player, ovrDelta);
    }

    // ── Bust: permanently cap potential ───────────────────────────────────
    if (bustEvent && player.potential != null) {
      // Bust crushes ceiling — reduce potential by 2-5 points
      player.potential = Math.max(
        player.ovr ?? 60,
        (player.potential ?? 80) - Utils.rand(2, 5)
      );
    }

    // ── Breakout: potential may exceed old ceiling ────────────────────────
    if (breakoutEvent && player.potential != null) {
      // Breakout can reveal hidden ceiling
      const newFloor = ovrBefore + ovrDelta;
      if (player.potential < newFloor) {
        player.potential = Math.min(99, newFloor + Utils.rand(1, 3));
      }
    }

    // ── Recalculate OVR from updated ratings ──────────────────────────────
    const ovrAfter         = calculateOvr(player.pos, player.ratings);
    const progressionDelta = ovrAfter - ovrBefore;

    player.ovr             = ovrAfter;
    player.progressionDelta = progressionDelta;

    // ── Classify for news ─────────────────────────────────────────────────
    if (progressionDelta >= 4) {
      gainers.push({
        id:    player.id,
        name:  player.name,
        pos:   player.pos,
        teamId:player.teamId ?? null,
        age,
        ovrBefore,
        ovrAfter,
        delta: progressionDelta,
        isBreakout: breakoutEvent,
      });
    } else if (progressionDelta <= -3) {
      regressors.push({
        id:    player.id,
        name:  player.name,
        pos:   player.pos,
        teamId:player.teamId ?? null,
        age,
        ovrBefore,
        ovrAfter,
        delta: progressionDelta,
        isCliff: cliffEvent,
      });
    }
  }

  // Sort so the most dramatic changes surface first
  gainers.sort((a, b) => b.delta - a.delta);
  regressors.sort((a, b) => a.delta - b.delta); // most negative first

  return { gainers, regressors };
}
