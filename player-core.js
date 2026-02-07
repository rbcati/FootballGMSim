// player-core.js
// Pure player logic extracted from fixes.js/player.js for Worker compatibility

import { Utils as U } from './utils.js';
import { Constants as C } from './constants.js';

/**
 * Returns an object with common stats initialized to 0.
 * @returns {Object} Zeroed stats object
 */
export function getZeroStats() {
  return {
    // General
    gamesPlayed: 0,

    // Passing
    passYd: 0, passTD: 0, interceptions: 0, passAtt: 0, passComp: 0, sacks: 0,
    dropbacks: 0, longestPass: 0, completionPct: 0, passerRating: 0, sackPct: 0,

    // Rushing
    rushYd: 0, rushTD: 0, rushAtt: 0, fumbles: 0,
    longestRun: 0, yardsPerCarry: 0,

    // Receiving
    recYd: 0, recTD: 0, receptions: 0, targets: 0, drops: 0,
    yardsAfterCatch: 0, longestCatch: 0, routesRun: 0, targetsWithSeparation: 0,
    dropRate: 0, separationRate: 0,

    // Defense
    tackles: 0, forcedFumbles: 0, passesDefended: 0, tacklesForLoss: 0,
    coverageRating: 0, targetsAllowed: 0, completionsAllowed: 0, yardsAllowed: 0, tdsAllowed: 0,
    pressureRating: 0, passRushSnaps: 0, pressures: 0, pressureRate: 0,

    // Offensive Line
    sacksAllowed: 0, tacklesForLossAllowed: 0, protectionGrade: 0,

    // Kicking/Punting
    fgMade: 0, fgAttempts: 0, xpMade: 0, xpAttempts: 0, punts: 0, puntYards: 0,
    fgMissed: 0, longestFG: 0, xpMissed: 0, successPct: 0, avgKickYards: 0,
    avgPuntYards: 0, longestPunt: 0
  };
}

/**
 * Generates a complete player with all ratings and attributes
 * @param {string} pos - Position (QB, RB, etc.)
 * @param {Object} overrides - Optional overrides for specific attributes
 * @param {number} [ovrArg] - Optional target overall rating
 * @returns {Object} Complete player object
 */
export function makePlayer(pos, overridesOrAge = {}, ovrArg = null) {
  if (!U || !C) {
    throw new Error('Utils and Constants must be loaded');
  }

  // Handle legacy signature (pos, age, ovr)
  let overrides = {};
  if (typeof overridesOrAge === 'number') {
      overrides = { age: overridesOrAge, ovr: ovrArg };
  } else if (overridesOrAge && typeof overridesOrAge === 'object') {
      overrides = overridesOrAge;
  }

  // Generate detailed ratings based on position
  const targetOvr = overrides.ovr || null;
  const ratings = generatePlayerRatings(pos, targetOvr);

  // Calculate overall rating
  const ovr = calculateOvr(pos, ratings);

  // Calculate calibrated display rating if league stats exist
  // Note: Pure function cannot access window.state.league.ratingStats easily.
  // We will pass displayOvr = ovr for now, or require calibration to be done externally.
  let displayOvr = ovr;

  // Generate contract details
  const contractDetails = generateContract(ovr, pos);

  const player = {
    id: U.id(),
    name: generatePlayerName(),
    pos: pos,
    age: overrides.age || U.rand(C.PLAYER_CONFIG.MIN_AGE, C.PLAYER_CONFIG.MAX_AGE),
    ratings: ratings,
    ovr: ovr,
    displayOvr: displayOvr,
    years: contractDetails.years,
    yearsTotal: contractDetails.yearsTotal || contractDetails.years, // Ensure yearsTotal is set
    baseAnnual: contractDetails.baseAnnual,
    signingBonus: contractDetails.signingBonus || 0,
    guaranteedPct: contractDetails.guaranteedPct || 0.5,
    injuryWeeks: 0,
    fatigue: 0,
    abilities: [],
    stats: {
      game: getZeroStats(),
      season: getZeroStats(),
      career: getZeroStats()
    },
    history: [],
    awards: [],
    ...overrides
  };

  // Add position-specific abilities
  tagAbilities(player);

  return player;
}

/**
 * Generates ratings for a player based on position
 * @param {string} pos - Player position
 * @param {number} [targetOvr] - Optional target overall rating
 * @returns {Object} Ratings object
 */
export function generatePlayerRatings(pos, targetOvr = null) {
  // Helper to generate rating around a target
  const genRating = (min, max, weight = 1.0) => {
      if (targetOvr) {
          // Center around targetOvr, with variance
          const variance = 10;
          let r = targetOvr + U.rand(-variance, variance);

          // Apply positional weighting (some stats are naturally higher for position)
          r = r * weight;

          return U.clamp(Math.round(r), min, max);
      }
      return U.rand(min, max);
  };

  const baseRatings = {
    throwPower: genRating(50, 99),
    throwAccuracy: genRating(50, 99),
    awareness: genRating(40, 99),
    catching: genRating(40, 99),
    catchInTraffic: genRating(40, 99),
    acceleration: genRating(60, 99),
    speed: genRating(60, 99),
    agility: genRating(60, 99),
    trucking: genRating(40, 99),
    juking: genRating(40, 99),
    passRushSpeed: genRating(40, 99),
    passRushPower: genRating(40, 99),
    runStop: genRating(40, 99),
    coverage: genRating(40, 99),
    runBlock: genRating(50, 99),
    passBlock: genRating(50, 99),
    intelligence: genRating(40, 99),
    kickPower: genRating(60, 99),
    kickAccuracy: genRating(60, 99),
    height: U.rand(68, 80), // inches
    weight: U.rand(180, 320) // pounds
  };

  // Position-specific adjustments
  const positionAdjustments = {
    QB: {
      speed: [50, 90], strength: [60, 85],
      throwPower: [65, 99], throwAccuracy: [55, 99]
    },
    RB: {
      speed: [70, 99], acceleration: [70, 99],
      trucking: [60, 99], juking: [50, 99]
    },
    WR: {
      speed: [75, 99], acceleration: [70, 99],
      catching: [65, 99], catchInTraffic: [55, 99]
    },
    TE: {
      catching: [55, 95], runBlock: [60, 95],
      passBlock: [55, 90], speed: [45, 85]
    },
    OL: {
      speed: [40, 65], runBlock: [70, 99],
      passBlock: [70, 99], weight: [290, 350]
    },
    DL: {
      passRushPower: [60, 99], passRushSpeed: [55, 99],
      runStop: [65, 99], weight: [250, 320]
    },
    LB: {
      speed: [60, 95], runStop: [60, 95],
      coverage: [45, 90], awareness: [55, 95]
    },
    CB: {
      speed: [75, 99], acceleration: [75, 99],
      coverage: [60, 99], intelligence: [50, 95]
    },
    S: {
      speed: [65, 95], coverage: [55, 95],
      runStop: [50, 90], awareness: [60, 95]
    },
    K: {
      kickPower: [70, 99], kickAccuracy: [60, 99],
      speed: [40, 70]
    },
    P: {
      kickPower: [65, 99], kickAccuracy: [60, 99],
      speed: [40, 70]
    }
  };

  const adjustments = positionAdjustments[pos] || {};

  // Apply position-specific ranges
  Object.keys(adjustments).forEach(stat => {
    const [min, max] = adjustments[stat];
    baseRatings[stat] = genRating(min, max);
  });

  return baseRatings;
}

/**
 * Calculates overall rating based on position and ratings
 * @param {string} pos - Player position
 * @param {Object} ratings - Player ratings
 * @returns {number} Overall rating (40-99)
 */
export function calculateOvr(pos, ratings) {
  const weights = C.OVR_WEIGHTS[pos];
  if (!weights) return U.rand(50, 75); // Fallback for unknown positions

  let weightedSum = 0;
  let totalWeight = 0;

  for (const stat in weights) {
    const weight = weights[stat];
    let rating = parseInt(ratings[stat], 10);
    if (isNaN(rating)) rating = 50;
    weightedSum += rating * weight;
    totalWeight += weight;
  }

  const rawOvr = totalWeight > 0 ? weightedSum / totalWeight : 50;
  return U.clamp(Math.round(rawOvr), C.PLAYER_CONFIG.MIN_OVR, C.PLAYER_CONFIG.MAX_OVR);
}

/**
 * Generates contract details based on player overall rating and position
 * @param {number} ovr - Player overall rating
 * @param {string} pos - Player position
 * @returns {Object} Contract details
 */
export function generateContract(ovr, pos) {
  // FIXED: Realistic salary calculation that fits within $220M cap
  // Teams have ~35 players (DEPTH_NEEDS total), so average salary should be ~$6.3M
  // But we need a realistic distribution where most players are depth/role players
  // Target: ~$180-200M total cap usage to leave room for free agency
  const positionMultiplier = C.POSITION_VALUES?.[pos] || 1.0;

  // SIGNIFICANTLY REDUCED salary ranges to fit within cap
  // Distribution: 1-2 elite, 3-5 good, 10-15 average, 15-20 depth
  let baseAnnual;

  if (ovr >= 90) {
    // Elite players: $12-22M (reduced from $20-35M)
    // Only QBs and rare elite players get top tier
    if (pos === 'QB') {
      baseAnnual = U.rand(15, 25) * positionMultiplier;
    } else {
      baseAnnual = U.rand(12, 20) * positionMultiplier * 0.85;
    }
  } else if (ovr >= 80) {
    // Good players: $4-12M (reduced from $8-20M)
    baseAnnual = U.rand(4, 12) * positionMultiplier * 0.9;
  } else if (ovr >= 70) {
    // Average players: $1.5-5M (reduced from $3-8M)
    baseAnnual = U.rand(1.5, 5) * positionMultiplier;
  } else if (ovr >= 60) {
    // Below average: $0.6-2M (reduced from $1-3M)
    baseAnnual = U.rand(0.6, 2) * positionMultiplier;
  } else {
    // Low OVR: $0.4-0.8M (reduced from $0.5-1M)
    baseAnnual = U.rand(0.4, 0.8) * positionMultiplier;
  }

  // Cap maximum at $30M (for elite QBs only)
  if (baseAnnual > 30) baseAnnual = 30;

  // Ensure minimum
  if (baseAnnual < 0.4) baseAnnual = 0.4;

  baseAnnual = Math.round(baseAnnual * 10) / 10;

  const years = U.rand(1, 4);

  // REDUCED signing bonus percentage to keep cap hits reasonable
  // Lower bonus = lower prorated cap hit
  const bonusPercent = (C.SALARY_CAP.SIGNING_BONUS_MIN || 0.15) +
                      U.random() * ((C.SALARY_CAP.SIGNING_BONUS_MAX || 0.4) - (C.SALARY_CAP.SIGNING_BONUS_MIN || 0.15));

  // Cap signing bonus to prevent excessive prorated amounts
  const maxBonus = baseAnnual * years * 0.4; // Max 40% of total contract
  const signingBonus = Math.min(
    Math.round((baseAnnual * years * bonusPercent) * 10) / 10,
    maxBonus
  );

  // Ensure yearsTotal matches years for proper proration calculation
  const yearsTotal = years;

  return {
    years,
    yearsTotal, // Critical for prorated bonus calculation
    baseAnnual,
    signingBonus: signingBonus,
    guaranteedPct: C.SALARY_CAP?.GUARANTEED_PCT_DEFAULT || 0.5
  };
}

/**
 * Generates a random player name
 * @returns {string} Full player name
 */
export function generatePlayerName() {
  // Use expanded names for maximum variety (1,000,000+ combinations)
  // Note: We need access to these lists. If they are on window, we can't access them in worker.
  // We'll use simple fallback or import them if available.
  // Assuming window.FIRST_NAMES might be available in DOM, but not worker.
  // Ideally these should be constants.

  const firstNames = ['John', 'Mike', 'James', 'David', 'Chris', 'Robert', 'Michael', 'William'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];

  return `${U.choice(firstNames)} ${U.choice(lastNames)}`;
}

/**
 * Tags abilities for a player based on their ratings
 * @param {Object} player - The player object to tag abilities for
 */
export function tagAbilities(player) {
  if (!player || !player.ratings) return;

  player.abilities = []; // Reset abilities
  const r = player.ratings;

  const abilityThresholds = {
    // Elite thresholds
    ELITE: 95,
    VERY_GOOD: 88,
    GOOD: 82
  };

  // QB Abilities
  if (player.pos === 'QB') {
    if (r.throwPower >= abilityThresholds.ELITE) player.abilities.push('Cannon Arm');
    if (r.throwAccuracy >= abilityThresholds.ELITE) player.abilities.push('Deadeye');
    if (r.speed >= abilityThresholds.VERY_GOOD) player.abilities.push('Escape Artist');
    if (r.awareness >= abilityThresholds.VERY_GOOD && r.intelligence >= abilityThresholds.VERY_GOOD) {
      player.abilities.push('Field General');
    }
  }

  // RB Abilities
  if (player.pos === 'RB') {
    if (r.trucking >= abilityThresholds.ELITE) player.abilities.push('Bruiser');
    if (r.juking >= abilityThresholds.ELITE) player.abilities.push('Ankle Breaker');
    if (r.catching >= abilityThresholds.VERY_GOOD) player.abilities.push('Mismatch Nightmare');
    if (r.speed >= abilityThresholds.ELITE) player.abilities.push('Breakaway Speed');
  }

  // WR/TE Abilities
  if (player.pos === 'WR' || player.pos === 'TE') {
    if (r.speed >= abilityThresholds.ELITE) player.abilities.push('Deep Threat');
    if (r.catchInTraffic >= abilityThresholds.ELITE) player.abilities.push('Possession Specialist');
    if (r.catching >= abilityThresholds.ELITE) player.abilities.push('Sure Hands');
    if (r.acceleration >= abilityThresholds.VERY_GOOD && r.agility >= abilityThresholds.VERY_GOOD) {
      player.abilities.push('Route Runner');
    }
  }

  // Offensive Line Abilities
  if (player.pos === 'OL') {
    if (r.passBlock >= abilityThresholds.ELITE) player.abilities.push('Pass Pro Specialist');
    if (r.runBlock >= abilityThresholds.ELITE) player.abilities.push('Road Grader');
    if (r.awareness >= abilityThresholds.VERY_GOOD) player.abilities.push('Line Leader');
  }

  // Defensive Line Abilities
  if (player.pos === 'DL') {
    if (r.passRushPower >= abilityThresholds.ELITE) player.abilities.push('Bull Rush');
    if (r.passRushSpeed >= abilityThresholds.ELITE) player.abilities.push('Edge Threat');
    if (r.runStop >= abilityThresholds.ELITE) player.abilities.push('Run Stopper');
  }

  // Linebacker Abilities
  if (player.pos === 'LB') {
    if (r.coverage >= abilityThresholds.VERY_GOOD && r.speed >= abilityThresholds.GOOD) {
      player.abilities.push('Coverage Specialist');
    }
    if (r.runStop >= abilityThresholds.VERY_GOOD) player.abilities.push('Run Defender');
    if (r.passRushSpeed >= abilityThresholds.VERY_GOOD) player.abilities.push('Pass Rush Moves');
  }

  // Defensive Back Abilities
  if (player.pos === 'CB' || player.pos === 'S') {
    if (r.coverage >= abilityThresholds.ELITE && r.intelligence >= abilityThresholds.VERY_GOOD) {
      player.abilities.push('Shutdown Corner');
    }
    if (r.speed >= abilityThresholds.ELITE) player.abilities.push('Lock Down Speed');
    if (r.runStop >= abilityThresholds.VERY_GOOD) player.abilities.push('Enforcer');
    if (r.awareness >= abilityThresholds.ELITE) player.abilities.push('Ball Hawk');
  }

  // Kicker/Punter Abilities
  if (player.pos === 'K' || player.pos === 'P') {
    if (r.kickAccuracy >= abilityThresholds.ELITE) player.abilities.push('Clutch Kicker');
    if (r.kickPower >= abilityThresholds.ELITE) player.abilities.push('Big Leg');
  }

  // Universal abilities based on multiple stats
  const avgRating = Object.values(r).reduce((sum, val) => sum + (val || 0), 0) / Object.keys(r).length;
  if (avgRating >= 90) player.abilities.push('Superstar');
  else if (avgRating >= 85) player.abilities.push('Star Player');

  // Age-based abilities
  if (player.age >= 30 && r.awareness >= abilityThresholds.VERY_GOOD) {
    player.abilities.push('Veteran Leadership');
  }
}

/**
 * Validates player data for consistency
 * @param {Object} player - Player object to validate
 * @returns {Array} Array of validation errors
 */
export function validatePlayer(player) {
  const errors = [];

  if (!player) {
    errors.push('Player object is null or undefined');
    return errors;
  }

  // Required fields
  const requiredFields = ['id', 'name', 'pos', 'age', 'ovr'];
  requiredFields.forEach(field => {
    if (player[field] === undefined || player[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  });

  // Value ranges
  if (player.age < C.PLAYER_CONFIG.MIN_AGE || player.age > 45) {
    errors.push(`Invalid age: ${player.age}`);
  }

  if (player.ovr < C.PLAYER_CONFIG.MIN_OVR || player.ovr > C.PLAYER_CONFIG.MAX_OVR) {
    errors.push(`Invalid overall rating: ${player.ovr}`);
  }

  if (!C.POSITIONS.includes(player.pos)) {
    errors.push(`Invalid position: ${player.pos}`);
  }

  return errors;
}

/**
 * Checks if a player can be restructured
 * @param {Object} player - The player object
 * @returns {boolean} Whether the player can be restructured
 */
export function canRestructure(player) {
  if (!player) return false;

  // Can't restructure if:
  // - Player has no years left on contract
  // - Player has less than 2 years remaining
  // - Player's guaranteed percentage is already very high
  // - Player is injured for extended period

  return player.years >= 2 &&
         (player.guaranteedPct || 0) < 0.8 &&
         (player.injuryWeeks || 0) <= C.TRAINING.MAX_RATING_IMPROVEMENT &&
         player.baseAnnual > 1.0; // Must be making decent money to restructure
}

/**
 * Gets positional needs for a team (for smarter AI decisions)
 * @param {Object} team - Team object
 * @returns {Object} Object with positional needs analysis
 */
export function getPositionalNeeds(team) {
  if (!team || !team.roster) return {};

  const byPos = {};

  // Initialize position groups
  C.POSITIONS.forEach(pos => { byPos[pos] = []; });

  // Group players by position
  team.roster.forEach(p => {
    if (byPos[p.pos]) {
      byPos[p.pos].push(p);
    }
  });

  // Sort by overall rating
  Object.keys(byPos).forEach(pos => {
    byPos[pos].sort((a, b) => b.ovr - a.ovr);
  });

  const needs = {};

  // Analyze each position
  Object.keys(C.DEPTH_NEEDS).forEach(pos => {
    const targetCount = C.DEPTH_NEEDS[pos];
    const currentPlayers = byPos[pos];

    const countGap = Math.max(0, targetCount - currentPlayers.length);
    const qualityGap = currentPlayers.length > 0 ?
      Math.max(0, 82 - currentPlayers[0].ovr) : 20;

    needs[pos] = {
      countGap,
      qualityGap,
      score: (countGap * 15) + (qualityGap * 0.5),
      currentStarter: currentPlayers[0] || null,
      depth: currentPlayers.length
    };
  });

  return needs;
}
