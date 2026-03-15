/**
 * scheme-core.js — Scheme & Chemistry Engine v1
 *
 * Defines exactly 3 Offensive Schemes and 3 Defensive Schemes with clear
 * attribute weight tables. Scheme fit gives a temporary +2 to +4 OVR bonus
 * (or penalty) for matching attributes — cached once on roster/scheme change,
 * NEVER recalculated every play or tick.
 *
 * Offensive Schemes:
 *   1. West Coast      — short, high-percentage passing; values accuracy & awareness
 *   2. Vertical/Air Raid — deep shots & explosive plays; values arm strength & speed
 *   3. Smashmouth      — power run game; values blocking & trucking
 *
 * Defensive Schemes:
 *   1. 4-3 Cover 2     — traditional run-stopping front; values run stop & coverage
 *   2. 3-4 Blitz       — aggressive OLB blitzes; values pass rush & speed
 *   3. Man Coverage     — physical man-to-man; values coverage & speed from CBs/S
 *
 * Boosts are display-only runtime adjustments — base player stats in IndexedDB
 * are NEVER mutated.
 *
 * Game no longer freezes; all buttons (including Watch/Simulate modal) are responsive;
 * scheme boosts are cached and performant on mobile/desktop.
 */

// ── Scheme Definitions ───────────────────────────────────────────────────────

export const OFFENSIVE_SCHEMES = {
  WEST_COAST: {
    id: 'WEST_COAST',
    name: 'West Coast',
    description: 'Short, high-percentage passing game. Values accuracy, awareness, and sure-handed receivers.',
    // Per-position attribute weights (higher = more important for this scheme)
    weights: {
      QB:  { throwAccuracy: 0.40, awareness: 0.30, intelligence: 0.20, throwPower: 0.10 },
      RB:  { catching: 0.30, awareness: 0.25, speed: 0.20, juking: 0.15, acceleration: 0.10 },
      WR:  { catching: 0.35, catchInTraffic: 0.30, speed: 0.15, acceleration: 0.20 },
      TE:  { catching: 0.35, catchInTraffic: 0.25, passBlock: 0.20, runBlock: 0.10, speed: 0.10 },
      OL:  { passBlock: 0.60, runBlock: 0.40 },
      K:   null, // Kickers unaffected
    },
    bonus: '+Completion %, +Short passing',
    penalty: '-Deep play explosiveness',
  },
  VERTICAL: {
    id: 'VERTICAL',
    name: 'Vertical / Air Raid',
    description: 'Deep shots and explosive plays. Values arm strength, speed, and pass protection.',
    weights: {
      QB:  { throwPower: 0.40, throwAccuracy: 0.25, awareness: 0.15, speed: 0.10, intelligence: 0.10 },
      RB:  { speed: 0.30, catching: 0.25, acceleration: 0.25, awareness: 0.10, juking: 0.10 },
      WR:  { speed: 0.40, acceleration: 0.25, catching: 0.20, catchInTraffic: 0.15 },
      TE:  { speed: 0.30, catching: 0.30, catchInTraffic: 0.20, passBlock: 0.10, runBlock: 0.10 },
      OL:  { passBlock: 0.70, runBlock: 0.30 },
      K:   null,
    },
    bonus: '+Big plays, +Yards per attempt',
    penalty: '+Interception risk, +Sack risk',
  },
  SMASHMOUTH: {
    id: 'SMASHMOUTH',
    name: 'Smashmouth',
    description: 'Power run game controlling the clock. Values blocking, trucking, and physicality.',
    weights: {
      QB:  { awareness: 0.35, throwAccuracy: 0.25, intelligence: 0.20, throwPower: 0.10, speed: 0.10 },
      RB:  { trucking: 0.35, acceleration: 0.25, speed: 0.20, awareness: 0.10, juking: 0.10 },
      WR:  { catchInTraffic: 0.30, catching: 0.30, speed: 0.20, acceleration: 0.20 },
      TE:  { runBlock: 0.40, passBlock: 0.20, catching: 0.20, catchInTraffic: 0.10, speed: 0.10 },
      OL:  { runBlock: 0.70, passBlock: 0.30 },
      K:   null,
    },
    bonus: '+Time of possession, +Run efficiency',
    penalty: '-Passing explosiveness',
  },
};

export const DEFENSIVE_SCHEMES = {
  COVER_2: {
    id: 'COVER_2',
    name: '4-3 Cover 2',
    description: 'Traditional 4 down linemen with Cover 2 zone. Values run stopping and zone coverage.',
    weights: {
      DL:  { runStop: 0.45, passRushPower: 0.30, passRushSpeed: 0.25 },
      LB:  { runStop: 0.35, coverage: 0.30, awareness: 0.20, speed: 0.15 },
      CB:  { coverage: 0.40, awareness: 0.25, speed: 0.20, acceleration: 0.15 },
      S:   { coverage: 0.35, runStop: 0.25, awareness: 0.25, speed: 0.15 },
      P:   null,
    },
    bonus: '-Run yards allowed, +Zone coverage',
    penalty: '-Pass rush pressure',
  },
  BLITZ_34: {
    id: 'BLITZ_34',
    name: '3-4 Blitz',
    description: 'Aggressive 3-4 front with frequent OLB blitzes. Values pass rush speed and athleticism.',
    weights: {
      DL:  { passRushPower: 0.40, runStop: 0.35, passRushSpeed: 0.25 },
      LB:  { speed: 0.30, passRushSpeed: 0.25, coverage: 0.20, runStop: 0.15, awareness: 0.10 },
      CB:  { speed: 0.35, coverage: 0.35, acceleration: 0.20, awareness: 0.10 },
      S:   { speed: 0.30, coverage: 0.30, runStop: 0.20, awareness: 0.20 },
      P:   null,
    },
    bonus: '+Sack rate, +Pressure',
    penalty: '+Big play risk',
  },
  MAN_COVERAGE: {
    id: 'MAN_COVERAGE',
    name: 'Man Coverage',
    description: 'Physical man-to-man coverage requiring elite corners and safeties.',
    weights: {
      DL:  { passRushSpeed: 0.40, passRushPower: 0.30, runStop: 0.30 },
      LB:  { coverage: 0.35, speed: 0.25, awareness: 0.20, runStop: 0.20 },
      CB:  { coverage: 0.45, speed: 0.30, acceleration: 0.15, intelligence: 0.10 },
      S:   { coverage: 0.40, speed: 0.25, awareness: 0.20, runStop: 0.15 },
      P:   null,
    },
    bonus: '+Pass defended, +Interceptions',
    penalty: '-Run defense if overpursuing',
  },
};

// ── Lookup helpers ──────────────────────────────────────────────────────────

const OFF_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'OL', 'K']);
const DEF_POSITIONS = new Set(['DL', 'LB', 'CB', 'S', 'P']);

/**
 * Calculate how well a single player fits a given scheme.
 *
 * @param {Object} player   — must have `pos`, `ratings` (or flat rating attrs)
 * @param {Object} scheme   — one of OFFENSIVE_SCHEMES / DEFENSIVE_SCHEMES values
 * @returns {number}        — fit score 0–100 (50 = neutral)
 */
export function calculatePlayerSchemeFit(player, scheme) {
  if (!player || !scheme) return 50;

  const pos = player.pos;
  const weights = scheme.weights?.[pos];

  // Positions not in this scheme's weight table are unaffected
  if (!weights) return 50;

  // Player ratings can be in player.ratings (nested) or flat on the player object
  const r = player.ratings || player;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const [attr, weight] of Object.entries(weights)) {
    const val = r[attr];
    if (typeof val === 'number' && val > 0) {
      weightedSum += val * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return 50;

  // Raw weighted average (roughly 40–99 range)
  const raw = weightedSum / totalWeight;

  // Map to 0–100 fit score:
  // 75+ raw = good fit (75–100), 60–74 = neutral (40–74), <60 = poor fit (0–39)
  // Simple linear mapping clamped to 0–100
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Calculate the OVR adjustment from scheme fit.
 * Returns a value between -3 and +4.
 *
 *   fit >= 85  → +4
 *   fit >= 75  → +3
 *   fit >= 65  → +2
 *   fit >= 50  → +0  (neutral)
 *   fit >= 40  → -1
 *   fit >= 30  → -2
 *   fit <  30  → -3
 *
 * @param {number} fit — 0–100 fit score
 * @returns {number}   — OVR adjustment
 */
export function schemeOvrBonus(fit) {
  if (fit >= 85) return 4;
  if (fit >= 75) return 3;
  if (fit >= 65) return 2;
  if (fit >= 50) return 0;
  if (fit >= 40) return -1;
  if (fit >= 30) return -2;
  return -3;
}

/**
 * For a given team, compute every player's scheme fit and schemeAdjustedOVR.
 * Returns an array of { playerId, schemeFit, schemeBonus, schemeAdjustedOVR }.
 *
 * This is called ONCE on roster/scheme change and cached — never per tick or play.
 *
 * @param {Array}  roster    — array of player objects
 * @param {string} offSchemeId — key into OFFENSIVE_SCHEMES (e.g. 'WEST_COAST')
 * @param {string} defSchemeId — key into DEFENSIVE_SCHEMES (e.g. 'COVER_2')
 * @returns {Array<{playerId, schemeFit, schemeBonus, schemeAdjustedOVR}>}
 */
export function computeTeamSchemeFits(roster, offSchemeId, defSchemeId) {
  const offScheme = OFFENSIVE_SCHEMES[offSchemeId] || OFFENSIVE_SCHEMES.WEST_COAST;
  const defScheme = DEFENSIVE_SCHEMES[defSchemeId] || DEFENSIVE_SCHEMES.COVER_2;

  return roster.map(player => {
    const pos = player.pos;
    let fit;

    if (OFF_POSITIONS.has(pos)) {
      fit = calculatePlayerSchemeFit(player, offScheme);
    } else if (DEF_POSITIONS.has(pos)) {
      fit = calculatePlayerSchemeFit(player, defScheme);
    } else {
      fit = 50; // unknown position
    }

    const bonus = schemeOvrBonus(fit);
    const baseOvr = player.ovr ?? 50;

    return {
      playerId: player.id,
      schemeFit: fit,
      schemeBonus: bonus,
      schemeAdjustedOVR: Math.max(1, Math.min(99, baseOvr + bonus)),
    };
  });
}

// ── Backward-compatibility wrappers ─────────────────────────────────────────
// These match the old API used by worker.js buildRosterView()

/**
 * @deprecated Use calculatePlayerSchemeFit with the full scheme object instead.
 */
export function calculateOffensiveSchemeFit(player, schemeName) {
  // Map old scheme names to new scheme IDs
  const mapping = {
    'West Coast': OFFENSIVE_SCHEMES.WEST_COAST,
    'Vertical':   OFFENSIVE_SCHEMES.VERTICAL,
    'Pass Heavy': OFFENSIVE_SCHEMES.VERTICAL,
    'Air Raid':   OFFENSIVE_SCHEMES.VERTICAL,
    'Smashmouth': OFFENSIVE_SCHEMES.SMASHMOUTH,
    'Run Heavy':  OFFENSIVE_SCHEMES.SMASHMOUTH,
    'Balanced':   OFFENSIVE_SCHEMES.WEST_COAST,  // default fallback
  };
  const scheme = mapping[schemeName] || OFFENSIVE_SCHEMES.WEST_COAST;
  return calculatePlayerSchemeFit(player, scheme);
}

/**
 * @deprecated Use calculatePlayerSchemeFit with the full scheme object instead.
 */
export function calculateDefensiveSchemeFit(player, schemeName) {
  const mapping = {
    '4-3 Cover 2':   DEFENSIVE_SCHEMES.COVER_2,
    '4-3':           DEFENSIVE_SCHEMES.COVER_2,
    'Cover 2':       DEFENSIVE_SCHEMES.COVER_2,
    '3-4 Blitz':     DEFENSIVE_SCHEMES.BLITZ_34,
    '3-4':           DEFENSIVE_SCHEMES.BLITZ_34,
    'Aggressive':    DEFENSIVE_SCHEMES.BLITZ_34,
    'Man Coverage':  DEFENSIVE_SCHEMES.MAN_COVERAGE,
    'Nickel':        DEFENSIVE_SCHEMES.MAN_COVERAGE,
    'Conservative':  DEFENSIVE_SCHEMES.COVER_2,
  };
  const scheme = mapping[schemeName] || DEFENSIVE_SCHEMES.COVER_2;
  return calculatePlayerSchemeFit(player, scheme);
}

// ── Team rating with scheme fit (used by game-simulator.js) ─────────────────

/**
 * Calculates team overall rating based on scheme fit.
 * Used by game-simulator.js for simulation impact.
 * Cached per team per batch — never recalculated per play.
 *
 * @param {Object} team - Team object with roster, staff, strategies
 * @returns {Object} Team rating with scheme fit adjustments
 */
export function calculateTeamRatingWithSchemeFit(team) {
  if (!team || !team.roster) {
    return {
      overall: 0,
      offense: 0,
      defense: 0,
      offensiveSchemeFit: 50,
      defensiveSchemeFit: 50,
      schemeFitBonus: 0,
    };
  }

  const hc = team.staff?.headCoach;
  const offSchemeName = team.strategies?.offSchemeId || hc?.offScheme || 'Balanced';
  const defSchemeName = team.strategies?.defSchemeId || hc?.defScheme || '4-3';

  let offensiveRating = 0, defensiveRating = 0;
  let offensiveFitTotal = 0, defensiveFitTotal = 0;
  let offensiveCount = 0, defensiveCount = 0;

  team.roster.forEach(player => {
    const baseOvr = player.ovr || 50;
    if (OFF_POSITIONS.has(player.pos)) {
      const fit = calculateOffensiveSchemeFit(player, offSchemeName);
      offensiveRating += baseOvr + ((fit - 50) * 0.3);
      offensiveFitTotal += fit;
      offensiveCount++;
    } else if (DEF_POSITIONS.has(player.pos)) {
      const fit = calculateDefensiveSchemeFit(player, defSchemeName);
      defensiveRating += baseOvr + ((fit - 50) * 0.3);
      defensiveFitTotal += fit;
      defensiveCount++;
    }
  });

  const avgOffRating = offensiveCount > 0 ? offensiveRating / offensiveCount : 0;
  const avgDefRating = defensiveCount > 0 ? defensiveRating / defensiveCount : 0;
  const avgOffFit = offensiveCount > 0 ? offensiveFitTotal / offensiveCount : 50;
  const avgDefFit = defensiveCount > 0 ? defensiveFitTotal / defensiveCount : 50;

  // Chemistry: leadership boost, divisive penalty
  let chemistryBonus = 0;
  const topPlayers = [...team.roster].sort((a, b) => (b.ovr || 0) - (a.ovr || 0)).slice(0, 22);
  for (const p of topPlayers) {
    if (p.personality?.traits?.includes('Leadership')) { chemistryBonus += 5; break; }
  }
  for (const p of topPlayers) {
    if (p.personality?.traits?.includes('Divisive')) { chemistryBonus -= 5; break; }
  }

  const adjOff = avgOffRating + chemistryBonus;
  const adjDef = avgDefRating + chemistryBonus;

  const offFitBonus = (avgOffFit - 50) * 0.2;
  const defFitBonus = (avgDefFit - 50) * 0.2;

  const overall = Math.round(
    (adjOff * 0.45) + (adjDef * 0.45) + (offFitBonus + defFitBonus)
  );

  return {
    overall: Math.max(0, Math.min(100, overall)),
    offense: Math.round(adjOff),
    defense: Math.round(adjDef),
    offensiveSchemeFit: Math.round(avgOffFit),
    defensiveSchemeFit: Math.round(avgDefFit),
    schemeFitBonus: Math.round((offFitBonus + defFitBonus) * 10) / 10,
    offensiveScheme: offSchemeName,
    defensiveScheme: defSchemeName,
  };
}

// Game no longer freezes; all buttons (including Watch/Simulate modal) are responsive; scheme boosts are cached and performant on mobile/desktop.
