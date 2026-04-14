/**
 * progression-logic.js — Dynamic Offseason Progression & Regression Engine
 *
 * Implements a highly variable age-curve progression system:
 *
 *  Growth  (Age 21–25): Mean +1.5 OVR | Breakout: +5 to +8 | Bust: -2 to -4
 *  Prime   (Age 26–29): High stability — fluctuate ±1 OVR
 *  Cliff   (Age 30+):   Mean -2 OVR  | 15% Age Cliff: physical AND cognitive traits drop
 *
 * "Offseason Chaos" additions:
 *  - **Breakout Seasons**: Age <= 24 + "High Work Ethic" → 10% chance of +5 to +8 spike
 *  - **Hitting the Wall**: RB 28+ / others 31+ → steep physical regression (-2 to -5
 *    on Speed, Acceleration, Agility in a single offseason)
 *
 * Task 3:  Dev traits (Normal / Star / Superstar / X-Factor) now scale growth/decline.
 * Task 6:  nudgeRatingsBy() now only touches OVR-relevant attributes per position.
 * Task 10: Bust probability raised from 5% → 20%; breakout from 10% → 8%.
 * Task 11: Cliff severity boosted — secondary drop applied to top non-physical traits.
 *
 * No DOM / Window dependencies — pure JS, safe for Web Workers.
 */

import { Utils } from './utils.js';
import { calculateOvr } from './player.js';
import { Constants } from './constants.js';
import { ensurePersonalityProfile, mentorshipBonusForPlayer } from './development/personalitySystem.js';

// ── Progression probability constants (Task 10) ───────────────────────────────
// Defined here so they can be tuned without hunting for magic numbers inline.
const GROWTH_BREAKOUT_PROB = 0.08;   // 8% chance per year (was 10%)
const GROWTH_BUST_PROB     = 0.20;   // 20% chance per year (was 5%)

// ── "Hitting the Wall" thresholds ──────────────────────────────────────────
// RBs hit the wall earlier (28) due to the physical toll of the position.
// All other positions hit the wall at 31.
const WALL_AGE_RB    = 28;
const WALL_AGE_OTHER = 31;
// Probability of hitting the wall each offseason once eligible
const WALL_PROBABILITY = 0.30;

// ── Dev trait multipliers (Task 3) ────────────────────────────────────────────
// Growth multiplier scales ovrDelta in growth phase.
// Decline multiplier scales ovrDelta in cliff/decline phase.
// breakoutBonus adds directly to GROWTH_BREAKOUT_PROB.
const DEV_TRAIT_MULTIPLIERS = {
  Normal:     { growth: 1.00, decline: 1.00, breakoutBonus: 0.00 },
  Star:       { growth: 1.25, decline: 0.85, breakoutBonus: 0.07 },
  Superstar:  { growth: 1.50, decline: 0.75, breakoutBonus: 0.12 },
  'X-Factor': { growth: 1.75, decline: 0.60, breakoutBonus: 0.22 },
};

// ── Physical trait map (for Age Cliff primary drop) ───────────────────────────
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
 * Nudge only the OVR-relevant attributes for this position (Task 6).
 * Applies `delta` uniformly to all attributes listed in OVR_WEIGHTS for the position.
 * Non-OVR attributes (e.g., a QB's runBlock, a K's awareness) are untouched.
 *
 * @param {Object} player - Player object with .pos and .ratings
 * @param {number} delta  - Amount to add (can be negative)
 */
function nudgeRatingsBy(player, delta) {
  if (!player.ratings || delta === 0) return;

  const ovrWeights = Constants?.OVR_WEIGHTS?.[player.pos] ?? null;

  if (ovrWeights) {
    // Only nudge position-relevant attributes
    for (const key of Object.keys(ovrWeights)) {
      if (player.ratings[key] !== undefined) {
        player.ratings[key] = Utils.clamp(
          Math.round(player.ratings[key] + delta),
          40, 99
        );
      }
    }
  } else {
    // Fallback: nudge all numeric ratings (legacy behaviour for unknown positions)
    const keys = Object.keys(player.ratings).filter(
      k => typeof player.ratings[k] === 'number' && k !== 'height' && k !== 'weight'
    );
    for (const key of keys) {
      player.ratings[key] = Utils.clamp(
        Math.round(player.ratings[key] + delta),
        40, 99
      );
    }
  }
}

/**
 * Apply secondary cognitive/skill drop during an age cliff event (Task 11).
 * Targets the top 2 non-physical OVR-weighted attributes, intensifying the OVR hit.
 *
 * @param {Object} player     - Player object
 * @param {number} secondaryDrop - Negative integer to apply
 */
function applyCliffCognitiveDrop(player, secondaryDrop) {
  const ovrWeights = Constants?.OVR_WEIGHTS?.[player.pos] ?? null;
  if (!ovrWeights) return;

  const physicals = new Set(PHYSICAL_TRAITS[player.pos] ?? []);

  // Sort non-physical OVR attributes by weight descending, pick top 2
  const nonPhysical = Object.entries(ovrWeights)
    .filter(([key]) => !physicals.has(key) && player.ratings[key] !== undefined)
    .sort(([, wa], [, wb]) => wb - wa)
    .slice(0, 2);

  for (const [key] of nonPhysical) {
    player.ratings[key] = Utils.clamp(
      Math.round(player.ratings[key] + secondaryDrop),
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
 * @returns {{ gainers: Object[], regressors: Object[], breakouts: Object[], wallHits: Object[] }}
 *   Top gainers, shocking regressors, breakout seasons, and "hitting the wall" events.
 */
export function processPlayerProgression(players, options = {}) {
  const teamEnvironments = options?.teamEnvironments ?? {};
  const teamRosters = options?.teamRosters ?? {};
  const gainers    = []; // players with progressionDelta >= +4
  const regressors = []; // players with progressionDelta <= -3
  const breakouts  = []; // explicit Breakout Season events (for news)
  const wallHits   = []; // "Hitting the Wall" events (for news)

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
    const org = teamEnvironments?.[player.teamId] ?? null;
    const roster = teamRosters?.[player.teamId] ?? [];
    const personalityProfile = ensurePersonalityProfile(player);
    player.personalityProfile = personalityProfile;
    const growthMod = Number.isFinite(Number(org?.youngGrowthBonus)) ? Number(org.youngGrowthBonus) : 0;
    const volatilityMod = Number.isFinite(Number(org?.volatilityDampener)) ? Number(org.volatilityDampener) : 0;
    const rookieMod = Number.isFinite(Number(org?.rookieAdaptation)) ? Number(org.rookieAdaptation) : 0;

    // ── Resolve dev trait multipliers (Task 3) ────────────────────────────
    const devTrait = player.devTrait ?? 'Normal';
    const traitMods = DEV_TRAIT_MULTIPLIERS[devTrait] ?? DEV_TRAIT_MULTIPLIERS.Normal;
    let effectiveBreakoutProb = GROWTH_BREAKOUT_PROB + traitMods.breakoutBonus + ((personalityProfile.workEthic - 55) * 0.0015);
    let effectiveBustProb     = GROWTH_BREAKOUT_PROB + GROWTH_BUST_PROB + ((personalityProfile.diva - personalityProfile.discipline) * 0.0009); // bust range end

    // Personality Trait Modifiers
    if (player.personality?.traits) {
        if (player.personality.traits.includes('High Work Ethic')) {
            effectiveBreakoutProb += 0.15; // 15% higher chance of positive roll/breakout
        }
        if (player.personality.traits.includes('Low Work Ethic')) {
            effectiveBustProb += 0.15; // 15% higher chance of negative roll/bust
        }
    }

    let wallEvent = false;

    // ── "Breakout Season" check: Age <= 24 + "High Work Ethic" → 10% ────
    // This is a distinct mechanic from the normal growth breakout below.
    // It fires first and overrides the normal growth roll when it triggers.
    if (age <= 24 && player.personality?.traits?.includes('High Work Ethic')) {
      if (Utils.random() < 0.10) {
        const rawDelta = Utils.rand(5, 8);
        ovrDelta = Math.round(rawDelta * traitMods.growth * (1 + growthMod * 0.35));
        breakoutEvent = true;
      }
    }

    // ── "Hitting the Wall" check: RB 28+ / others 31+ ───────────────────
    // Steep physical regression applied BEFORE the normal age-phase logic.
    // Can co-occur with the cliff phase for devastating combined effect.
    const wallAge = player.pos === 'RB' ? WALL_AGE_RB : WALL_AGE_OTHER;
    if (!breakoutEvent && age >= wallAge && Utils.random() < WALL_PROBABILITY) {
      const physTraits = PHYSICAL_TRAITS[player.pos] ?? PHYSICAL_TRAITS.QB;
      const wallDrop = -Utils.rand(2, 5);
      applyRatingDelta(player.ratings, physTraits, wallDrop);
      wallEvent = true;
    }

    // ── Age 21–25: Growth phase ────────────────────────────────────────────
    if (!breakoutEvent && age >= 21 && age <= 25) {
      const roll = Utils.random();

      if (roll < effectiveBreakoutProb) {
        // Breakout: +5 to +8 OVR (scaled by dev trait)
        const rawDelta = Utils.rand(5, 8);
        ovrDelta = Math.round(rawDelta * traitMods.growth * (1 + growthMod * 0.35));
        breakoutEvent = true;
      } else if (roll < effectiveBustProb) {
        // Bust: -2 to -4 OVR (dev trait does NOT protect from bust)
        ovrDelta = -Utils.rand(2, 4);
        bustEvent = true;
      } else {
        // Normal growth: +0 to +3 (was +1 to +3 — Task 10 allows stagnation)
        const rawDelta = Utils.rand(0, 3);
        ovrDelta = Math.round(rawDelta * traitMods.growth * (1 + growthMod * 0.45));
      }
    }

    // ── Age 26–29: Prime phase ─────────────────────────────────────────────
    else if (!breakoutEvent && age >= 26 && age <= 29) {
      // High stability — small fluctuation ±1 (dev trait has minor dampening)
      ovrDelta = Utils.rand(-1, 1);
    }

    // ── Age 30+: Cliff phase ───────────────────────────────────────────────
    else if (!breakoutEvent && age >= 30) {
      const roll = Utils.random();

      if (roll < 0.15) {
        // Age Cliff: physical traits plummet (primary drop)
        const physDrop = -Utils.rand(5, 8);
        const traits = PHYSICAL_TRAITS[player.pos] ?? PHYSICAL_TRAITS.QB;
        applyRatingDelta(player.ratings, traits, physDrop);

        // Secondary cognitive drop on top 2 non-physical OVR traits (Task 11)
        const cognitiveDrop = -Utils.rand(2, 4);
        applyCliffCognitiveDrop(player, cognitiveDrop);

        cliffEvent = true;
        ovrDelta = 0; // Derived from rating recalc below
      } else {
        // Normal cliff: mean -2 (range -1 to -3), dev trait slows decline
        const rawDelta = -Utils.rand(1, 3);
        ovrDelta = Math.round(rawDelta * traitMods.decline);
      }
    }

    const mentorship = mentorshipBonusForPlayer(player, roster);
    if (mentorship.applied && age <= 25 && ovrDelta > 0) {
      ovrDelta += Math.max(1, Math.round(ovrDelta * mentorship.development));
    }

    // ── Apply non-cliff, non-wall deltas via position-specific rating nudges (Task 6)
    if (!cliffEvent && !wallEvent && ovrDelta !== 0) {
      if (age <= 24 && rookieMod !== 0) {
        ovrDelta += rookieMod > 0 ? 1 : -1;
      }
      if (Math.abs(ovrDelta) >= 2 && volatilityMod !== 0) {
        const direction = Math.sign(ovrDelta);
        const damp = Math.round(Math.abs(ovrDelta) * Math.abs(volatilityMod) * 0.6);
        if (damp > 0) {
          ovrDelta = volatilityMod > 0
            ? ovrDelta - (damp * direction)
            : ovrDelta + (damp * direction);
        }
      }
      nudgeRatingsBy(player, ovrDelta);
    }

    // ── Bust: permanently cap potential ────────────────────────────────────
    if (bustEvent && player.potential != null) {
      player.potential = Math.max(
        player.ovr ?? 60,
        (player.potential ?? 80) - Utils.rand(2, 5)
      );
    }

    // ── Breakout: potential may exceed old ceiling ─────────────────────────
    if (breakoutEvent && player.potential != null) {
      const newFloor = ovrBefore + ovrDelta;
      if (player.potential < newFloor) {
        player.potential = Math.min(99, newFloor + Utils.rand(1, 3));
      }
    }

    // ── Recalculate OVR from updated ratings ───────────────────────────────
    const ovrAfter         = calculateOvr(player.pos, player.ratings);
    const progressionDelta = ovrAfter - ovrBefore;

    player.ovr = ovrAfter;
    player.progressionDelta = progressionDelta;
    player.developmentContext = {
      baseAgeCurve: age <= 25 ? 'growth' : age <= 29 ? 'prime' : 'decline',
      trainingFocus: org?.trainingFocus ?? 'balanced',
      staffDevelopmentModifier: Math.round((Number(org?.staffDevelopmentModifier ?? 0) || 0) * 1000) / 10,
      playingTimeModifier: player.depthRole === 'starter' ? '+ starter reps' : player.depthRole === 'bench' ? '- limited reps' : 'neutral reps',
      varianceTag: breakoutEvent ? 'breakout variance' : bustEvent ? 'bust variance' : wallEvent ? 'wall variance' : 'normal variance',
      mentorship: mentorship.applied ? `${mentorship.mentorName} mentorship (+${Math.round(mentorship.development * 100)}% dev)` : 'none',
      personalityImpact: personalityProfile.workEthic >= 75 ? 'high work ethic lift' : personalityProfile.diva >= 70 ? 'diva volatility' : 'balanced',
    };

    const history = Array.isArray(player.developmentHistory) ? player.developmentHistory : [];
    history.push({
      season: player?.season ?? null,
      age,
      ovrBefore,
      ovrAfter,
      delta: progressionDelta,
      physical: Math.round((((player.ratings.speed ?? player.ratings.kickPower ?? 0) + (player.ratings.acceleration ?? 0)) / 2)),
      passing: Math.round(((player.ratings.throwPower ?? 0) + (player.ratings.throwAccuracy ?? 0)) / 2),
      rushingReceiving: Math.round(((player.ratings.speed ?? 0) + (player.ratings.catching ?? 0) + (player.ratings.trucking ?? 0)) / 3),
      blocking: Math.round(((player.ratings.runBlock ?? 0) + (player.ratings.passBlock ?? 0)) / 2),
      defense: Math.round(((player.ratings.coverage ?? 0) + (player.ratings.runStop ?? 0) + (player.ratings.passRushPower ?? 0)) / 3),
      kicking: Math.round(((player.ratings.kickPower ?? 0) + (player.ratings.kickAccuracy ?? 0)) / 2),
    });
    player.developmentHistory = history.slice(-12);


    // ── Classify for news ──────────────────────────────────────────────────
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
        isWall: wallEvent,
      });
    }

    // ── Track explicit Breakout events for high-priority news ────────────
    if (breakoutEvent) {
      breakouts.push({
        id:    player.id,
        name:  player.name,
        pos:   player.pos,
        teamId:player.teamId ?? null,
        age,
        ovrBefore,
        ovrAfter,
        delta: progressionDelta,
      });
    }

    // ── Track "Hitting the Wall" events for high-priority news ───────────
    if (wallEvent) {
      wallHits.push({
        id:    player.id,
        name:  player.name,
        pos:   player.pos,
        teamId:player.teamId ?? null,
        age,
        ovrBefore,
        ovrAfter,
        delta: progressionDelta,
      });
    }
  }

  // Sort so the most dramatic changes surface first
  gainers.sort((a, b) => b.delta - a.delta);
  regressors.sort((a, b) => a.delta - b.delta); // most negative first
  breakouts.sort((a, b) => b.delta - a.delta);
  wallHits.sort((a, b) => a.delta - b.delta);

  return { gainers, regressors, breakouts, wallHits };
}
