// draft-fixed.js - Fixed Draft System with proper syntax
'use strict';

import { saveState } from './state.js';

/**
 * Generate draft prospects for upcoming draft
 * @param {number} year - Draft year
 * @returns {Array} Array of prospect objects
 */
function generateProspects(year) {
  console.log('Generating prospects for', year);
  
  const C = window.Constants;
  const U = window.Utils;
  
  if (!C || !U) {
    console.error('Constants or Utils not available for prospect generation');
    return [];
  }
  
  const prospects = [];
  const totalProspects = C.DRAFT_CONFIG?.TOTAL_PROSPECTS || 250;
  
  // Position distribution (realistic for NFL draft)
  const positionWeights = {
    'QB': 8,   'RB': 15,  'WR': 25,  'TE': 12,  'OL': 35,
    'DL': 30,  'LB': 20,  'CB': 18,  'S': 15,   'K': 3,   'P': 2
  };
  
  // Create weighted position array
  const weightedPositions = [];
  Object.keys(positionWeights).forEach(pos => {
    for (let i = 0; i < positionWeights[pos]; i++) {
      weightedPositions.push(pos);
    }
  });
  
  for (let i = 0; i < totalProspects; i++) {
    const prospect = makeProspect(year, i, weightedPositions);
    if (prospect) {
      prospects.push(prospect);
    }
  }
  
  // Sort by projected round (best prospects first)
  prospects.sort((a, b) => {
    if (a.projectedRound !== b.projectedRound) {
      return a.projectedRound - b.projectedRound;
    }
    return b.ovr - a.ovr;
  });
  
  // Assign draft rankings
  prospects.forEach((prospect, index) => {
    prospect.draftRanking = index + 1;
  });
  
  console.log('Generated', prospects.length, 'prospects');
  return prospects;
}

/**
 * Gaussian random number generator using Box-Muller transform.
 * Returns a value from a normal distribution with given mean and stdDev.
 * Used for realistic scout noise and talent distribution.
 * @param {number} mean - Center of distribution
 * @param {number} stdDev - Standard deviation (spread)
 * @returns {number} Normally distributed random value
 */
function gaussianRandom(mean, stdDev) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1 || 0.0001)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * stdDev;
}

/**
 * Create a single draft prospect with hidden true ratings and scout variability.
 *
 * KEY IMPROVEMENTS (vs prior version):
 * 1. True ratings are generated from position-specific attribute pools (OVR_WEIGHTS),
 *    not a flat list of all 19 attributes. A QB won't have passRushPower.
 * 2. Boom/bust are now on a single spectrum (not independent). A player is either
 *    a boom candidate OR a bust candidate, never both simultaneously.
 * 3. Scouted attributes store NUMERIC noisy values, not letter grades, fixing the
 *    type mismatch that broke downstream comparisons.
 * 4. Prospect talent uses overlapping Gaussian distributions per tier, so a 2nd-round
 *    talent CAN be better than a 1st-rounder — matching real NFL draft variance.
 * 5. Added combine measurables (40-yard dash, bench press, vertical, broad jump,
 *    3-cone drill) that correlate with attributes but add scouting depth.
 *
 * @param {number} year - Draft year
 * @param {number} index - Prospect index (0=best projected, 249=worst)
 * @param {Array} weightedPositions - Weighted array of positions
 * @returns {Object} Prospect object
 */
function makeProspect(year, index, weightedPositions) {
  const U = window.Utils;
  const C = window.Constants;

  if (!U) return null;

  try {
    const pos = U.choice(weightedPositions || C.POSITIONS);
    const age = U.rand(21, 23); // College players

    // --- TALENT TIER: Gaussian distribution with overlapping ranges ---
    // Instead of hard index cutoffs, use Gaussian noise so talent tiers overlap.
    // A "2nd round talent" CAN be better than a "1st round talent" (~15% of the time).
    let tierMean, tierStdDev;
    if (index < 32) {
      tierMean = 81; tierStdDev = 4;    // 1st round: 73-89 typical
    } else if (index < 64) {
      tierMean = 75; tierStdDev = 4;    // 2nd round: 67-83 typical
    } else if (index < 96) {
      tierMean = 70; tierStdDev = 4;    // 3rd round: 62-78 typical
    } else if (index < 160) {
      tierMean = 64; tierStdDev = 4;    // 4th-5th round: 56-72 typical
    } else if (index < 224) {
      tierMean = 58; tierStdDev = 3;    // 6th-7th round: 52-64 typical
    } else {
      tierMean = 53; tierStdDev = 3;    // UDFA tier: 47-59 typical
    }
    const baseOvr = Math.round(U.clamp(gaussianRandom(tierMean, tierStdDev), 40, 95));

    // --- POSITION-SPECIFIC RATINGS ---
    // Only generate attributes relevant to this position, using OVR_WEIGHTS
    // and POS_RATING_RANGES from constants. This fixes the bug where kickers
    // had passRushPower ratings.
    const ratings = generatePositionRatings(pos, baseOvr, U, C);

    // --- SCOUTED ATTRIBUTES: Numeric noisy values (not letter grades) ---
    // Fixes the type mismatch bug. Scouted values are integers with noise,
    // allowing proper numeric comparison downstream.
    const scoutedAttributes = {};
    Object.keys(ratings).forEach(key => {
      const noise = Math.round(gaussianRandom(0, 7)); // Gaussian noise, stdDev=7
      scoutedAttributes[key] = U.clamp(ratings[key] + noise, 40, 99);
    });

    // --- BOOM/BUST SPECTRUM (single axis, not independent) ---
    // Real NFL: a player is either a high-ceiling developmental prospect OR
    // an overdrafted bust risk. Having both high boom AND high bust was contradictory.
    // Spectrum: -10 (max bust) to +10 (max boom), 0 = neutral.
    const developmentAxis = U.rand(-10, 10);
    const boomFactor = Math.max(0, developmentAxis);   // 0-10, only positive
    const bustFactor = Math.max(0, -developmentAxis);   // 0-10, only negative axis

    // --- POTENTIAL: Driven by development axis ---
    let potential;
    if (developmentAxis >= 6) {
      // High boom: hidden gem potential — potential significantly above OVR
      potential = Math.min(99, baseOvr + U.rand(8, 18));
    } else if (developmentAxis <= -6) {
      // High bust: likely to stagnate or decline
      potential = Math.max(40, baseOvr - U.rand(0, 5));
    } else {
      // Normal development: potential moderately above OVR
      potential = Math.min(99, baseOvr + U.rand(3, 10));
    }

    // --- PROJECTED ROUND: Based on OVR with noise ---
    let projectedRound;
    if (baseOvr >= 80) projectedRound = 1;
    else if (baseOvr >= 75) projectedRound = 2;
    else if (baseOvr >= 70) projectedRound = 3;
    else if (baseOvr >= 65) projectedRound = 4;
    else if (baseOvr >= 60) projectedRound = 5;
    else if (baseOvr >= 55) projectedRound = 6;
    else projectedRound = 7;

    // --- COMBINE MEASURABLES ---
    // Physical measurements that correlate with ratings but add scouting depth.
    // These are visible pre-draft and help scouts evaluate raw physical tools.
    const measurables = generateCombineMeasurables(pos, ratings, U);

    // --- CHARACTER TRAITS: Now influence development rate ---
    // Work ethic directly impacts XP gain rate (high = +25%, low = -25%)
    // Leadership affects team chemistry bonus
    // Coachability affects skill tree upgrade success rate
    const workEthic = U.rand(55, 98);
    const character = {
      workEthic: workEthic,
      coachability: U.rand(60, 98),
      leadership: U.rand(45, 95),
      competitiveness: U.rand(50, 95),   // NEW: clutch performance modifier
      footballIQ: U.rand(55, 98),         // NEW: scheme learning speed
      greed: U.rand(10, 90),              // NEW: financial motivation
      loyalty: U.rand(10, 90),            // NEW: desire to stay with one team
      playForWinner: U.rand(10, 90),      // NEW: desire to be on a contender
      poise: U.rand(30, 95),              // NEW: composure under pressure
      injury_prone: U.random() < 0.12,
      red_flags: U.random() < 0.04
    };

    const prospect = {
      id: U.id(),
      name: generateProspectName(),
      pos: pos,
      age: age,
      year: year,

      // TRUE ratings (hidden from user until drafted and developed)
      ratings: ratings,
      // Noisy scouted ratings (what scouts see — numeric, not letter grades)
      scoutedAttributes: scoutedAttributes,
      ovr: baseOvr,
      potential: potential,

      // Development axis: single spectrum from bust(-10) to boom(+10)
      boomFactor: boomFactor,
      bustFactor: bustFactor,
      developmentAxis: developmentAxis,

      // Draft info
      projectedRound: projectedRound,
      draftRanking: 0,

      // Scouting info (fog of war)
      scouted: false,
      scoutingReports: [],

      // Scouted OVR range: wider for unscouted, narrows with scouting
      scoutedOvr: {
        min: Math.max(40, baseOvr - U.rand(8, 18)),
        max: Math.min(99, baseOvr + U.rand(8, 18)),
        confidence: U.rand(30, 60) // Lower starting confidence
      },

      // College info
      college: generateCollege(),
      collegeStats: generateCollegeStats(pos),

      // Combine measurables (40-yard, bench, vertical, broad jump, 3-cone)
      measurables: measurables,

      // Character traits (now impact gameplay)
      character: character,

      // Contract info (rookie contracts)
      years: 4,
      yearsTotal: 4,
      baseAnnual: calculateRookieContract(projectedRound, index),
      signingBonus: 0,
      guaranteedPct: 1.0,

      // Initialize stats
      stats: { game: {}, season: {}, career: {} },
      abilities: [],
      awards: [],
      developmentStatus: 'NORMAL'
    };
    
    // Add abilities
    if (window.tagAbilities) {
      window.tagAbilities(prospect);
    }
    
    return prospect;
    
  } catch (error) {
    console.error('Error creating prospect:', error);
    return null;
  }
}

/**
 * Generate position-specific ratings using OVR_WEIGHTS and POS_RATING_RANGES.
 * FIXES: Previous version assigned ALL 19 attributes to every position (a kicker
 * had passRushPower). Now only generates attributes relevant to each position.
 *
 * @param {string} pos - Player position
 * @param {number} baseOvr - Target overall rating
 * @param {Object} U - Utils reference
 * @param {Object} C - Constants reference
 * @returns {Object} Position-specific ratings object
 */
function generatePositionRatings(pos, baseOvr, U, C) {
  const ratings = {};
  const ovrWeights = C?.OVR_WEIGHTS?.[pos] || {};
  const posRanges = C?.POS_RATING_RANGES?.[pos] || {};

  // Get the attributes that matter for this position from OVR_WEIGHTS
  const posAttributes = Object.keys(ovrWeights);

  // If no position-specific config, fall back to ranges or basic generation
  if (posAttributes.length === 0) {
    return generateBasicRatings(pos, baseOvr);
  }

  // Generate each attribute scaled around baseOvr, respecting position ranges
  posAttributes.forEach(attr => {
    const range = posRanges[attr] || [40, 99];
    const minVal = range[0];
    const maxVal = range[1];

    // Scale attribute relative to baseOvr with Gaussian variance
    // Higher-weighted attributes cluster closer to baseOvr
    const weight = ovrWeights[attr] || 0.2;
    const variance = Math.round(8 * (1 - weight)); // More important = less variance
    const raw = Math.round(gaussianRandom(baseOvr, variance));
    ratings[attr] = U.clamp(raw, minVal, maxVal);
  });

  // Add awareness if not already present (universal attribute)
  if (!ratings.awareness) {
    const range = posRanges.awareness || [50, 95];
    ratings.awareness = U.clamp(Math.round(gaussianRandom(baseOvr - 5, 6)), range[0], range[1]);
  }

  return ratings;
}

/**
 * Fallback: Generate basic ratings (used when Constants not available).
 * Still position-aware — only generates relevant attributes.
 */
function generateBasicRatings(pos, baseOvr) {
  const U = window.Utils;
  const variance = 8;

  // Position-specific attribute lists (only relevant attributes)
  const POS_ATTRS = {
    QB: ['throwPower', 'throwAccuracy', 'awareness', 'speed', 'intelligence'],
    RB: ['speed', 'acceleration', 'trucking', 'juking', 'catching', 'awareness'],
    WR: ['speed', 'acceleration', 'catching', 'catchInTraffic', 'awareness'],
    TE: ['catching', 'catchInTraffic', 'runBlock', 'passBlock', 'speed', 'awareness'],
    OL: ['runBlock', 'passBlock', 'awareness'],
    DL: ['passRushPower', 'passRushSpeed', 'runStop', 'awareness'],
    LB: ['speed', 'runStop', 'coverage', 'awareness', 'passRushSpeed'],
    CB: ['speed', 'acceleration', 'coverage', 'intelligence', 'awareness'],
    S:  ['speed', 'coverage', 'runStop', 'awareness', 'intelligence'],
    K:  ['kickPower', 'kickAccuracy', 'awareness'],
    P:  ['kickPower', 'kickAccuracy', 'awareness']
  };

  const attrs = POS_ATTRS[pos] || ['awareness', 'speed'];
  const ratings = {};
  attrs.forEach(stat => {
    ratings[stat] = U.clamp(baseOvr + U.rand(-variance, variance), 40, 99);
  });
  return ratings;
}

/**
 * Generate combine measurables that correlate with player ratings.
 * Adds scouting depth: scouts can evaluate raw physical tools at the combine.
 *
 * Measurables are based on real NFL combine data distributions:
 * - 40-yard dash: 4.25-5.20s (varies by position)
 * - Bench press: 10-35 reps (225 lbs)
 * - Vertical jump: 25-42 inches
 * - Broad jump: 100-135 inches
 * - 3-cone drill: 6.50-7.60s
 *
 * @param {string} pos - Player position
 * @param {Object} ratings - Player's true ratings
 * @param {Object} U - Utils reference
 * @returns {Object} Measurables object
 */
function generateCombineMeasurables(pos, ratings, U) {
  const speed = ratings.speed || ratings.kickPower || 70;
  const accel = ratings.acceleration || speed;
  const strength = ratings.trucking || ratings.runBlock || ratings.passRushPower || 70;

  // 40-yard dash: inversely correlate with speed rating
  // Position baselines (skill positions are faster)
  const fortyBase = {
    QB: 4.75, RB: 4.50, WR: 4.45, TE: 4.65, OL: 5.10,
    DL: 4.85, LB: 4.65, CB: 4.40, S: 4.50, K: 4.90, P: 4.90
  };
  const base40 = fortyBase[pos] || 4.70;
  const fortyYard = Math.round((base40 - (speed - 70) * 0.008 + gaussianRandom(0, 0.06)) * 100) / 100;

  // Bench press (225 reps): correlate with strength/trucking/blocking
  const benchBase = pos === 'OL' || pos === 'DL' ? 25 : pos === 'LB' ? 22 : 16;
  const benchReps = Math.max(0, Math.round(benchBase + (strength - 70) * 0.12 + gaussianRandom(0, 3)));

  // Vertical jump: correlate with acceleration and speed
  const vertBase = pos === 'WR' || pos === 'CB' ? 36 : pos === 'RB' ? 35 : 32;
  const vertical = Math.round(U.clamp(vertBase + (accel - 70) * 0.1 + gaussianRandom(0, 2), 24, 44));

  // Broad jump: correlate with speed and acceleration
  const broadBase = pos === 'WR' || pos === 'CB' || pos === 'RB' ? 120 : 112;
  const broadJump = Math.round(U.clamp(broadBase + (speed - 70) * 0.15 + gaussianRandom(0, 4), 95, 140));

  // 3-cone drill: correlate with agility/awareness
  const agility = ratings.agility || ratings.awareness || 70;
  const threeCone = Math.round((7.10 - (agility - 70) * 0.008 + gaussianRandom(0, 0.08)) * 100) / 100;

  // Height and weight by position (inches and lbs)
  const heightWeight = {
    QB: { h: [73, 77], w: [210, 235] }, RB: { h: [68, 72], w: [195, 225] },
    WR: { h: [70, 76], w: [180, 215] }, TE: { h: [75, 78], w: [240, 265] },
    OL: { h: [75, 79], w: [295, 330] }, DL: { h: [73, 78], w: [265, 310] },
    LB: { h: [72, 76], w: [225, 255] }, CB: { h: [69, 73], w: [180, 200] },
    S:  { h: [70, 74], w: [195, 215] }, K:  { h: [70, 74], w: [180, 210] },
    P:  { h: [72, 76], w: [200, 225] }
  };
  const hw = heightWeight[pos] || { h: [72, 76], w: [210, 240] };
  const height = U.rand(hw.h[0], hw.h[1]);
  const weight = U.rand(hw.w[0], hw.w[1]);

  return {
    fortyYard: U.clamp(fortyYard, 4.20, 5.40),
    benchPress: benchReps,
    verticalJump: vertical,
    broadJump: broadJump,
    threeCone: U.clamp(threeCone, 6.40, 7.80),
    height: height,    // inches
    weight: weight     // lbs
  };
}

/**
 * Generate prospect name
 */
function generateProspectName() {
  const U = window.Utils;
  // Use expanded names for maximum variety (1,000,000+ combinations)
  const firstNames = window.EXPANDED_FIRST_NAMES || window.FIRST_NAMES || ['John', 'Mike', 'David', 'Chris', 'Matt'];
  const lastNames = window.EXPANDED_LAST_NAMES || window.LAST_NAMES || ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'];
  
  return U.choice(firstNames) + ' ' + U.choice(lastNames);
}

/**
 * Generate college name
 */
function generateCollege() {
  const U = window.Utils;
  const colleges = [
    'Alabama', 'Ohio State', 'Georgia', 'Clemson', 'Oklahoma', 'LSU', 'Florida',
    'Michigan', 'Penn State', 'Texas', 'Notre Dame', 'USC', 'Oregon', 'Wisconsin',
    'Iowa', 'Miami', 'Florida State', 'Auburn', 'Tennessee', 'Kentucky', 'Utah',
    'TCU', 'Baylor', 'Oklahoma State', 'Michigan State', 'Nebraska', 'UCLA'
  ];
  
  return U.choice(colleges);
}

/**
 * Generate college statistics
 */
function generateCollegeStats(pos) {
  const U = window.Utils;
  const stats = {};
  
  if (pos === 'QB') {
    stats.passYd = U.rand(2500, 4500);
    stats.passTD = U.rand(20, 45);
    stats.interceptions = U.rand(5, 15);
  } else if (pos === 'RB') {
    stats.rushYd = U.rand(800, 2000);
    stats.rushTD = U.rand(8, 25);
    stats.receptions = U.rand(15, 60);
  } else if (pos === 'WR' || pos === 'TE') {
    stats.receptions = U.rand(30, 90);
    stats.recYd = U.rand(600, 1500);
    stats.recTD = U.rand(5, 20);
  }
  
  return stats;
}

/**
 * Calculate rookie contract value
 */
function calculateRookieContract(round, pick) {
  // Simplified rookie wage scale
  const roundValues = {
    1: { min: 4.0, max: 8.5 },
    2: { min: 2.5, max: 4.0 },
    3: { min: 1.8, max: 2.5 },
    4: { min: 1.2, max: 1.8 },
    5: { min: 0.9, max: 1.2 },
    6: { min: 0.7, max: 0.9 },
    7: { min: 0.5, max: 0.7 }
  };
  
  const values = roundValues[round] || roundValues[7];
  const U = window.Utils;
  
  return U ? U.rand(values.min * 10, values.max * 10) / 10 : values.min;
}

// ============================================================================
// ENHANCED DRAFT SYSTEM - Order Enforcement, Trades, and Interactive UI
// ============================================================================

// Draft state for enhanced system
let draftState = {
  active: false,
  year: null,
  currentPick: 0,
  totalPicks: 0,
  draftOrder: [],
  draftBoard: [], // Array of {pick: number, teamId: number, player: null, round: number}
  availableProspects: [],
  completedPicks: []
};

/**
 * Convert integer rating to Letter Grade
 */
function intToGrade(rating) {
  if (rating >= 95) return 'A+';
  if (rating >= 90) return 'A';
  if (rating >= 85) return 'A-';
  if (rating >= 80) return 'B+';
  if (rating >= 75) return 'B';
  if (rating >= 70) return 'B-';
  if (rating >= 65) return 'C+';
  if (rating >= 60) return 'C';
  if (rating >= 55) return 'C-';
  if (rating >= 50) return 'D+';
  if (rating >= 45) return 'D';
  if (rating >= 40) return 'D-';
  return 'F';
}

/**
 * Generate fuzzy OVR range string
 */
function intToGradeRange(ovr, variance) {
  const min = Math.max(40, ovr - variance);
  const max = Math.min(99, ovr + variance);
  const minGrade = intToGrade(min);
  const maxGrade = intToGrade(max);

  if (minGrade === maxGrade) return minGrade;
  return `${minGrade} to ${maxGrade}`;
}

/**
 * Initialize enhanced draft state
 * @param {Object} league - League object
 * @param {number} year - Draft year
 */
function initializeDraft(league, year) {
  if (!league || !league.teams) {
    console.error('Invalid league for draft initialization');
    return false;
  }

  console.log(`Initializing enhanced draft for ${year}...`);

  // Calculate draft order based on standings
  const draftOrder = window.calculateDraftOrder ? window.calculateDraftOrder(league) : [];
  if (draftOrder.length === 0) {
    console.error('Failed to calculate draft order');
    return false;
  }

  // Generate draft class if needed
  if (!window.state.draftClass || window.state.draftClass.length === 0) {
    window.state.draftClass = generateProspects(year);
  }

  // Build draft board (all picks for all rounds with proper order)
  const draftBoard = [];
  const rounds = 7;
  let pickNumber = 1;

  for (let round = 1; round <= rounds; round++) {
    // NFL uses same order each round (worst-to-best), NOT snake draft.
    // Snake draft was incorrect — the NFL reverses nothing between rounds.
    const roundOrder = [...draftOrder];
    
    roundOrder.forEach(teamId => {
      const team = league.teams[teamId];
      if (!team) return;

      // Check if team has this pick (may have been traded)
      const teamPicks = (team.picks || []).filter(p => p.year === year && p.round === round);
      
      if (teamPicks.length > 0) {
        draftBoard.push({
          pick: pickNumber++,
          teamId: teamId,
          team: team,
          round: round,
          player: null,
          pickId: teamPicks[0].id
        });
      }
    });
  }

  draftState = {
    active: true,
    year: year,
    currentPick: 0,
    totalPicks: draftBoard.length,
    draftOrder: draftOrder,
    draftBoard: draftBoard,
    availableProspects: [...window.state.draftClass],
    completedPicks: []
  };

  console.log(`✅ Enhanced draft initialized: ${draftBoard.length} picks across 7 rounds`);
  return true;
}

/**
 * Get current pick information
 */
function getCurrentPick() {
  if (!draftState.active || draftState.currentPick >= draftState.draftBoard.length) {
    return null;
  }
  return draftState.draftBoard[draftState.currentPick];
}

/**
 * Get upcoming picks
 */
function getUpcomingPicks(count = 10) {
  if (!draftState.active) return [];
  const upcoming = [];
  for (let i = draftState.currentPick; i < Math.min(draftState.currentPick + count, draftState.draftBoard.length); i++) {
    upcoming.push(draftState.draftBoard[i]);
  }
  return upcoming;
}

/**
 * Get team's position needs for AI drafting
 */
function getTeamNeeds(team) {
  if (!team || !team.roster) return [];
  const positionCounts = {};
  team.roster.forEach(player => {
    positionCounts[player.pos] = (positionCounts[player.pos] || 0) + 1;
  });
  const needs = [];
  const idealCounts = {
    QB: 3, RB: 4, WR: 6, TE: 3, OL: 8,
    DL: 6, LB: 6, CB: 5, S: 4, K: 1, P: 1
  };
  Object.keys(idealCounts).forEach(pos => {
    if ((positionCounts[pos] || 0) < idealCounts[pos]) {
      needs.push(pos);
    }
  });
  return needs;
}

/**
 * Evaluate roster saturation at a position for a specific team.
 * Returns a multiplier (0.1 - 1.0) that penalizes picking a position
 * where the team is already well-stocked with quality players.
 *
 * @param {Object} team - Team object with roster
 * @param {string} pos - Position to evaluate
 * @returns {number} Multiplier (1.0 = no penalty, 0.1 = heavily penalized)
 */
function getPositionSaturationMultiplier(team, pos) {
  if (!team || !team.roster) return 1.0;

  const QUALITY_THRESHOLD = 75;
  const playersAtPos = team.roster.filter(p => p.pos === pos);
  const qualityPlayersAtPos = playersAtPos.filter(p => (p.ovr || 0) > QUALITY_THRESHOLD);

  // If team has 2+ quality players at this position, severely penalize
  if (qualityPlayersAtPos.length >= 2) {
    return 0.1;
  }
  // If team has 1 quality player, moderate penalty for non-premium positions
  if (qualityPlayersAtPos.length === 1) {
    // QB is always worth depth, so less penalty
    if (pos === 'QB') return 0.7;
    return 0.5;
  }
  return 1.0;
}

/**
 * Auto-pick for CPU teams - Realistic AI drafting with team strategy
 * Teams balance BPA (Best Player Available) vs needs-based drafting.
 * Early rounds lean BPA, later rounds lean needs.
 * Rebuilding teams take more risks on high-upside players.
 *
 * Key improvement: Teams re-evaluate roster needs before EVERY pick
 * and apply a saturation multiplier that prevents hoarding positions
 * where the team already has 2+ quality (>75 OVR) players.
 */
function autoPickForCPU() {
  if (!draftState.active) return;
  const currentPick = getCurrentPick();
  if (!currentPick) return;
  const U = window.Utils;
  if (!U) return;

  const team = window.state.league.teams[currentPick.teamId];
  if (!team || currentPick.teamId === window.state.userTeamId) return;

  // Re-evaluate needs fresh before every pick (not just start of round)
  const teamNeeds = getTeamNeeds(team);
  const round = currentPick.round;
  const isRebuilding = (team.wins || 0) < (team.losses || 0);

  // Score each available prospect for this team
  const scoredProspects = draftState.availableProspects.map(p => {
    let score = p.ovr || 50;

    // Roster saturation check: penalize positions where team is already stacked
    const saturationMultiplier = getPositionSaturationMultiplier(team, p.pos);
    score *= saturationMultiplier;

    // Needs bonus - stronger in later rounds
    if (teamNeeds.includes(p.pos)) {
      const needsBonus = round <= 2 ? 3 : round <= 4 ? 6 : 10;
      score += needsBonus;
    }

    // Position value premium (QBs and premium positions in early rounds)
    const positionPremium = { QB: 8, OL: 3, DL: 3, CB: 2, WR: 2, LB: 1, S: 1, TE: 0, RB: -1, K: -5, P: -5 };
    if (round <= 2) score += (positionPremium[p.pos] || 0);

    // Age bonus (younger is better for development)
    if (p.age <= 21) score += 2;

    // Rebuilding teams value high-potential players more
    if (isRebuilding && p.potential && p.potential > p.ovr + 5) {
      score += 4;
    }

    // Character concerns reduce score
    if (p.character?.red_flags) score -= 8;
    if (p.character?.injury_prone) score -= 3;

    // Add randomness to prevent perfectly predictable drafts
    score += U.rand(-4, 4);

    return { prospect: p, score };
  });

  scoredProspects.sort((a, b) => b.score - a.score);
  const selected = scoredProspects[0]?.prospect;

  if (selected) {
    makeDraftPickEnhanced(currentPick.teamId, selected.id);
  }
}

/**
 * Enhanced make draft pick with order enforcement
 */
function makeDraftPickEnhanced(teamId, prospectId) {
  if (!draftState.active) {
    window.setStatus('Draft not active');
    return false;
  }

  const currentPick = getCurrentPick();
  if (!currentPick) {
    window.setStatus('Draft is complete');
    return false;
  }

  // Verify it's the correct team's turn
  if (currentPick.teamId !== teamId) {
    window.setStatus(`It's not ${window.state.league.teams[teamId]?.name}'s turn to pick`);
    return false;
  }

  // Find prospect
  const prospectIndex = draftState.availableProspects.findIndex(p => p.id === prospectId);
  if (prospectIndex === -1) {
    window.setStatus('Prospect not available');
    return false;
  }

  const prospect = draftState.availableProspects[prospectIndex];
  const team = window.state.league.teams[teamId];

  try {
    // Add player to team
    if (!team.roster) team.roster = [];
    team.roster.push(prospect);
    team.roster.sort((a, b) => (b.ovr || 0) - (a.ovr || 0));

    // Remove from available prospects
    draftState.availableProspects.splice(prospectIndex, 1);

    // Update draft board
    currentPick.player = {
      id: prospect.id,
      name: prospect.name,
      pos: prospect.pos,
      ovr: prospect.ovr
    };

    // Remove used pick from team
    const pickIndex = team.picks.findIndex(p => p.id === currentPick.pickId);
    if (pickIndex >= 0) {
      team.picks.splice(pickIndex, 1);
    }

    // Record completed pick
    draftState.completedPicks.push({
      ...currentPick,
      player: { ...currentPick.player }
    });
    
    // Track in team's draft history
    if (!team.draftHistory) {
      team.draftHistory = [];
    }
    team.draftHistory.push({
      year: draftState.year,
      round: currentPick.round,
      pickNumber: currentPick.pick,
      playerId: prospect.id,
      playerName: prospect.name,
      playerPos: prospect.pos,
      playerOvr: prospect.ovr
    });

    // Advance to next pick
    draftState.currentPick++;

    // Update cap
    if (window.recalcCap) {
      window.recalcCap(window.state.league, team);
    }

    window.setStatus(`${team.name} selects ${prospect.name} (${prospect.pos}) - Pick ${currentPick.pick}`);

    // Auto-pick for CPU teams
    if (teamId !== window.state.userTeamId && draftState.currentPick < draftState.draftBoard.length) {
      setTimeout(() => autoPickForCPU(), 500);
    }

    // --- GEM / BUST REVEAL LOGIC ---
    // Uses hidden boom/bust factors for more realistic outcomes
    if (teamId === window.state.userTeamId) {
        const U = window.Utils;
        let status = 'NORMAL';
        let title = "Draft Selection";
        let message = `You selected ${prospect.name}`;
        const boomFactor = prospect.boomFactor || 0;
        const bustFactor = prospect.bustFactor || 0;

        // Gem chance based on boom factor (5-25% chance)
        const gemChance = 0.05 + (boomFactor / 100) * 2;
        // Bust chance based on bust factor (5-25% chance)
        const bustChance = 0.05 + (bustFactor / 100) * 2;

        const roll = U.random();

        if (roll < gemChance) {
            // GEM - graduated boost based on boom factor
            status = 'GEM';
            const boost = boomFactor >= 8 ? U.rand(6, 10) : U.rand(3, 6);
            title = boost >= 7 ? "💎 GENERATIONAL TALENT!" : "💎 HIDDEN GEM!";
            message = boost >= 7
                ? `${prospect.name} is far better than anyone realized! Elite upside.`
                : `${prospect.name} is better than the scouts thought!`;

            // Boost key attributes
            const weights = window.Constants?.POSITION_TRAINING_WEIGHTS?.[prospect.pos] || { primary: ['awareness'] };
            (weights.primary || ['awareness']).forEach(attr => {
                if (prospect.ratings[attr]) prospect.ratings[attr] = Math.min(99, prospect.ratings[attr] + boost);
            });
            prospect.potential = Math.min(99, (prospect.potential || prospect.ovr) + U.rand(3, 8));

        } else if (roll > (1 - bustChance)) {
            // BUST - graduated penalty based on bust factor
            status = 'BUST';
            const penalty = bustFactor >= 8 ? U.rand(5, 10) : U.rand(2, 5);
            title = penalty >= 7 ? "💔 MAJOR BUST" : "💔 DRAFT DISAPPOINTMENT";
            message = penalty >= 7
                ? `${prospect.name} has major issues that weren't detected. Significant downgrade.`
                : `${prospect.name} isn't quite what the scouts projected.`;

            const attrKeys = Object.keys(prospect.ratings);
            const numStats = penalty >= 7 ? 5 : 3;
            for (let i = 0; i < numStats; i++) {
                const key = U.choice(attrKeys);
                if (prospect.ratings[key]) prospect.ratings[key] = Math.max(40, prospect.ratings[key] - U.rand(2, penalty));
            }
            prospect.potential = Math.max(prospect.ovr - 5, (prospect.potential || prospect.ovr) - U.rand(3, 8));

        } else if (boomFactor >= 5 && U.random() < 0.3) {
            // SLEEPER - player with hidden upside, not immediately apparent
            status = 'SLEEPER';
            title = "📈 SLEEPER PICK";
            message = `${prospect.name} has untapped potential. Development will be key.`;
            prospect.potential = Math.min(99, (prospect.potential || prospect.ovr) + U.rand(4, 10));
        }

        // Recalculate OVR
        if (status !== 'NORMAL' && status !== 'SLEEPER') {
            if (window.calculateOvr) prospect.ovr = window.calculateOvr(prospect.pos, prospect.ratings);
            else {
                const vals = Object.values(prospect.ratings).filter(v => typeof v === 'number');
                prospect.ovr = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : prospect.ovr;
            }
        }

        showDraftRevealModal(prospect, status, title, message);
    }

    // Re-render
    renderDraft();

    // Check if draft is complete
    if (draftState.currentPick >= draftState.draftBoard.length) {
      completeDraft();
    }

    return true;

  } catch (error) {
    console.error('Error making draft pick:', error);
    window.setStatus('Error making draft pick');
    return false;
  }
}

/**
 * Trade picks during draft
 */
function tradeDraftPick(fromTeamId, toTeamId, pickNumber) {
  if (!draftState.active) {
    window.setStatus('Draft not active');
    return false;
  }

  const pickIndex = draftState.draftBoard.findIndex(p => p.pick === pickNumber);
  if (pickIndex === -1) {
    window.setStatus('Pick not found');
    return false;
  }

  const pick = draftState.draftBoard[pickIndex];
  if (pick.teamId !== fromTeamId) {
    window.setStatus('Team does not own this pick');
    return false;
  }
  if (pick.player) {
    window.setStatus('Cannot trade a pick that has already been used');
    return false;
  }
  if (pickIndex === draftState.currentPick) {
    window.setStatus('Cannot trade the current pick - make a selection first');
    return false;
  }

  const fromTeam = window.state.league.teams[fromTeamId];
  const toTeam = window.state.league.teams[toTeamId];
  if (!fromTeam || !toTeam) {
    window.setStatus('Invalid teams');
    return false;
  }

  // Update draft board
  pick.teamId = toTeamId;
  pick.team = toTeam;

  // Update team picks
  const teamPick = fromTeam.picks.find(p => p.id === pick.pickId);
  if (teamPick) {
    const idx = fromTeam.picks.indexOf(teamPick);
    fromTeam.picks.splice(idx, 1);
    toTeam.picks = toTeam.picks || [];
    toTeam.picks.push({
      ...teamPick,
      from: `${teamPick.from} via ${fromTeam.abbr}`
    });
  }

  window.setStatus(`${fromTeam.name} traded pick ${pickNumber} to ${toTeam.name}`);
  renderDraft();
  return true;
}

/**
 * Complete the draft
 */
function completeDraft() {
  if (!draftState.active) return;
  console.log('Draft complete!');
  draftState.active = false;
  if (draftState.availableProspects.length > 0) {
    console.log(`${draftState.availableProspects.length} players went undrafted`);
  }
  window.setStatus(`🎉 ${draftState.year} Draft Complete!`, 'success', 5000);
  if (saveState) saveState();
}

/**
 * Render enhanced draft board
 */
function renderDraftBoard() {
  const container = document.getElementById('draftBoard');
  if (!container) return;

  if (!draftState.active) {
    container.innerHTML = '';
    return;
  }

  const currentPick = getCurrentPick();
  const upcomingPicks = getUpcomingPicks(10);
  const recentPicks = (draftState.completedPicks || []).slice(-10).reverse();

  let html = `
    <div class="draft-board-container">
      <div class="draft-header">
        <h2>${draftState.year} NFL Draft</h2>
        <div class="draft-progress">
          Pick ${draftState.currentPick + 1} of ${draftState.totalPicks}
          (Round ${currentPick ? Math.ceil((draftState.currentPick + 1) / 32) : 1})
        </div>
      </div>

      <div class="draft-main-grid">
        <div class="draft-section current-pick-section">
          <h3>Current Pick</h3>
          ${currentPick ? `
            <div class="current-pick-card ${currentPick.teamId === window.state.userTeamId ? 'user-pick' : ''}">
              <div class="pick-number">Pick #${currentPick.pick}</div>
              <div class="pick-team">${currentPick.team.name}</div>
              <div class="pick-round">Round ${currentPick.round}</div>
              ${currentPick.teamId === window.state.userTeamId ? `
                <div class="pick-actions">
                  <p class="pick-instruction">Select a player below</p>
                </div>
              ` : `
                <div class="pick-status">CPU will pick automatically...</div>
              `}
            </div>
          ` : '<p>Draft complete!</p>'}
        </div>

        <div class="draft-section recent-picks-section">
          <h3>Recent Picks</h3>
          <div class="recent-picks-list">
            ${recentPicks.length > 0 ? recentPicks.map(pick => `
              <div class="recent-pick-item">
                <span class="pick-num">#${pick.pick}</span>
                <span class="pick-team">${pick.team.abbr}</span>
                <span class="pick-player">${pick.player.name} (${pick.player.pos})</span>
                <span class="pick-ovr">OVR ${pick.player.ovr}</span>
              </div>
            `).join('') : '<p class="muted">No picks made yet</p>'}
          </div>
        </div>

        <div class="draft-section upcoming-picks-section">
          <h3>Upcoming Picks</h3>
          <div class="upcoming-picks-list">
            ${(upcomingPicks || []).map((pick, index) => `
              <div class="upcoming-pick-item ${pick.teamId === window.state.userTeamId ? 'user-pick' : ''}">
                <span class="pick-num">#${pick.pick}</span>
                <span class="pick-team">${pick.team.abbr}</span>
                <span class="pick-round">R${pick.round}</span>
                ${pick.teamId === window.state.userTeamId ? '<span class="your-pick">Your Pick</span>' : ''}
                ${index === 0 && pick.teamId !== window.state.userTeamId ? `
                  <button class="btn btn-sm" onclick="window.proposeDraftPickTrade(${pick.pick})">Trade</button>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

/**
 * Render available prospects with filtering
 */
function renderAvailableProspects() {
  const container = document.getElementById('availableProspects');
  if (!container) return;

  if (!draftState.active) {
    container.innerHTML = '';
    return;
  }

  let prospects = [...draftState.availableProspects];
  
  // Apply position filter
  const positionFilter = document.getElementById('prospectPositionFilter');
  if (positionFilter && positionFilter.value) {
    prospects = prospects.filter(p => p.pos === positionFilter.value);
  }

  // Apply sort
  let sortFilter = document.getElementById('prospectSortFilter');
  if (sortFilter) {
    const sortBy = sortFilter.value || 'ovr';
    prospects.sort((a, b) => {
      if (sortBy === 'ovr') return (b.ovr || 0) - (a.ovr || 0);
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'pos') return (a.pos || '').localeCompare(b.pos || '');
      return 0;
    });
  } else {
    prospects.sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
  }

  prospects = prospects.slice(0, 100); // Show top 100

  const currentPick = getCurrentPick();
  const isUserTurn = currentPick && currentPick.teamId === window.state.userTeamId;

  let html = `
    <div class="prospects-container">
      <div class="prospects-header">
        <h3>Available Prospects (${draftState.availableProspects.length} remaining)</h3>
        <div class="prospects-filters">
          <select id="prospectPositionFilter">
            <option value="">All Positions</option>
            <option value="QB">QB</option>
            <option value="RB">RB</option>
            <option value="WR">WR</option>
            <option value="TE">TE</option>
            <option value="OL">OL</option>
            <option value="DL">DL</option>
            <option value="LB">LB</option>
            <option value="CB">CB</option>
            <option value="S">S</option>
            <option value="K">K</option>
            <option value="P">P</option>
          </select>
          <select id="prospectSortFilter">
            <option value="ovr">Overall (Est)</option>
            <option value="name">Name</option>
            <option value="pos">Position</option>
          </select>
        </div>
      </div>

      <div class="prospects-grid">
        ${(prospects || []).map(prospect => {
          // Fog of War Display
          const ovrDisplay = intToGradeRange((prospect.scoutedOvr.min + prospect.scoutedOvr.max)/2, (prospect.scoutedOvr.max - prospect.scoutedOvr.min)/2);

          return `
          <div class="prospect-card-draft ${isUserTurn ? 'selectable' : ''}" 
               data-prospect-id="${prospect.id}"
               ${isUserTurn ? `onclick="window.selectDraftProspect('${prospect.id}')"` : ''}>
            <div class="prospect-header-draft">
              <h4>${prospect.name}</h4>
              <div class="prospect-meta">
                <span class="pos-badge">${prospect.pos}</span>
                <span class="ovr-badge" title="Estimated Range">${ovrDisplay}</span>
              </div>
            </div>
            <div class="prospect-details-draft">
              <div class="detail-item">
                <span>College:</span>
                <span>${prospect.college || 'N/A'}</span>
              </div>
              <div class="detail-item">
                <span>Age:</span>
                <span>${prospect.age || 'N/A'}</span>
              </div>
              <div class="detail-item">
                <span>Projected:</span>
                <span>Round ${prospect.projectedRound || 'UDFA'}</span>
              </div>
              <!-- Fog of War Attributes -->
              <div class="detail-item" style="margin-top: 5px; border-top: 1px solid var(--hairline); padding-top: 5px;">
                 <span style="font-size: 0.8em; color: var(--text-muted);">Scouted Traits:</span>
                 <div style="display: flex; gap: 5px; flex-wrap: wrap; margin-top: 2px;">
                    ${Object.entries(prospect.scoutedAttributes || {}).slice(0, 3).map(([key, grade]) =>
                        `<span class="badge badge-subtle">${key.substring(0,3)}: ${grade}</span>`
                    ).join('')}
                 </div>
              </div>
            </div>
            ${isUserTurn ? `
              <button class="btn btn-primary btn-sm draft-select-btn" 
                      onclick="event.stopPropagation(); window.selectDraftProspect('${prospect.id}')">
                Draft Player
              </button>
            ` : ''}
          </div>
        `}).join('')}
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Set up filters (re-get elements after innerHTML update)
  const posFilterNew = document.getElementById('prospectPositionFilter');
  const sortFilterNew = document.getElementById('prospectSortFilter');
  if (posFilterNew) {
    posFilterNew.addEventListener('change', () => renderAvailableProspects());
  }
  if (sortFilterNew) {
    sortFilterNew.addEventListener('change', () => renderAvailableProspects());
  }
}

/**
 * Render the draft/scouting view (enhanced version)
 */
function renderDraft() {
  console.log('Rendering draft...');
  
  try {
    const L = window.state?.league;
    if (!L) {
      console.error('No league available for draft');
      return;
    }
    
    const draftYear = L.year + 1;
    
    // Update draft year display
    const draftYearEl = document.getElementById('draftYear');
    if (draftYearEl) {
      draftYearEl.textContent = draftYear;
    }
    
    // Check if enhanced draft is active
    if (draftState.active) {
      // Render enhanced draft board
      renderDraftBoard();
      renderAvailableProspects();
      console.log('✅ Enhanced draft rendered');
      return;
    }
    
    // Fallback to basic draft view (pre-draft)
    // Ensure draft class exists
    if (!window.state.draftClass || window.state.draftClass.length === 0) {
      window.state.draftClass = generateProspects(draftYear);
      console.log('Generated draft class for', draftYear);
    }
    
    // Show pre-draft view with start button IN DRAFT VIEW
    const draftBoardContainer = document.getElementById('draftBoard');
    if (draftBoardContainer) {
      draftBoardContainer.innerHTML = `
        <div class="card">
          <h2>${draftYear} NFL Draft</h2>
          <p>The draft will begin during the offseason.</p>
          <button class="btn btn-primary" onclick="window.startDraft()">Start Draft</button>
        </div>
      `;
    }
    
    // Get team for picks display
    const teamSelect = document.getElementById('draftTeam');
    if (teamSelect && !teamSelect.dataset.filled && window.fillTeamSelect) {
      window.fillTeamSelect(teamSelect);
      teamSelect.dataset.filled = '1';
    }
    
    const teamId = parseInt(teamSelect?.value || window.state.userTeamId || '0', 10);
    const team = L.teams[teamId];
    
    if (team) {
      // Render team's picks
      renderTeamPicks(team, L);
    }
    
    // Render top prospects  
    renderTopProspects();
    
    console.log('✅ Draft rendered successfully');
    
  } catch (error) {
    console.error('Error rendering draft:', error);
  }
}

/**
 * Render team's draft picks
 */
function renderTeamPicks(team, league) {
  const picksContainer = document.getElementById('draftPicks');
  if (!picksContainer) return;
  
  try {
    const draftYear = league.year + 1;
    const teamPicks = team.picks?.filter(pick => pick.year === draftYear) || [];
    
    if (teamPicks.length === 0) {
      picksContainer.innerHTML = '<div class="card"><p>No picks for upcoming draft</p></div>';
      return;
    }
    
    // Sort picks by round
    teamPicks.sort((a, b) => a.round - b.round);
    
    picksContainer.innerHTML = `
      <div class="card">
        <h3>${team.name} - ${draftYear} Draft Picks</h3>
        <div class="draft-picks-grid">
          ${(teamPicks || []).map(pick => {
            const value = window.pickValue ? window.pickValue(pick) : calculateBasicPickValue(pick);
            return `
              <div class="draft-pick-card">
                <div class="round">Round ${pick.round}</div>
                <div class="details">
                  <div>Year: ${pick.year}</div>
                  <div>From: ${pick.from}</div>
                  <div>Value: ${value.toFixed(1)}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
    
  } catch (error) {
    console.error('Error rendering team picks:', error);
    picksContainer.innerHTML = '<div class="card"><p>Error loading draft picks</p></div>';
  }
}

/**
 * Render top prospects
 */
function renderTopProspects() {
  const draftContainer = document.getElementById('scoutingList');
  if (!draftContainer || !window.state.draftClass) return;
  
  try {
    const topProspects = (window.state.draftClass || []).slice(0, 50); // Show top 50
    
    draftContainer.innerHTML = topProspects.map(prospect => {
      const scoutingInfo = getScoutingInfo(prospect);
      
      return `
        <div class="prospect-card" onclick="window.showPlayerDetails && window.showPlayerDetails(window.state.draftClass.find(p => p.id === '${prospect.id}'))" style="cursor: pointer;">
          <div class="prospect-header">
            <h4>${prospect.name}</h4>
            <div class="prospect-info">
              <span class="pos">${prospect.pos}</span>
              <span class="college">${prospect.college}</span>
              <span class="age">Age ${prospect.age}</span>
            </div>
          </div>
          <div class="prospect-ratings">
            <div class="rating-item">
              <span>Overall</span>
              <span class="ovr-${getOvrClass(scoutingInfo.ovr)}">${scoutingInfo.ovr}</span>
            </div>
            <div class="rating-item">
              <span>Projected</span>
              <span>Round ${prospect.projectedRound}</span>
            </div>
            <div class="rating-item">
              <span>Confidence</span>
              <span>${scoutingInfo.confidence}%</span>
            </div>
          </div>
          <div class="prospect-actions">
            <button class="btn btn-scout" data-prospect-id="${prospect.id}" onclick="event.stopPropagation()">
              ${prospect.scouted ? 'Scouted' : 'Scout Player'}
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    // Set up scouting buttons
    draftContainer.addEventListener('click', handleProspectClick);
    
  } catch (error) {
    console.error('Error rendering prospects:', error);
  }
}

/**
 * Handle clicking on prospect cards
 */
function handleProspectClick(e) {
  if (e.target.classList.contains('btn-scout')) {
    const prospectId = e.target.dataset.prospectId;
    scoutProspect(prospectId);
  }
}

/**
 * Scout a prospect (reveals more accurate information)
 */
function scoutProspect(prospectId) {
  const prospect = window.state.draftClass?.find(p => p.id === prospectId);
  if (!prospect) return;
  
  if (prospect.scouted) {
    window.setStatus(prospect.name + ' has already been scouted');
    return;
  }
  
  // Mark as scouted
  prospect.scouted = true;
  
  // Improve scouting accuracy
  const U = window.Utils;
  const actualOvr = prospect.ovr;
  const scoutingAccuracy = U.rand(85, 95); // Pretty accurate scouting
  
  prospect.scoutedOvr = {
    min: Math.max(40, actualOvr - U.rand(2, 5)),
    max: Math.min(99, actualOvr + U.rand(2, 5)),
    confidence: scoutingAccuracy
  };
  
  // Add scouting report
  prospect.scoutingReports.push({
    date: new Date().toISOString(),
    scout: 'Head Scout',
    notes: generateScoutingNotes(prospect),
    grade: getProspectGrade(prospect)
  });
  
  window.setStatus(`Scouted ${prospect.name} - ${getProspectGrade(prospect)} grade`);
  
  // Re-render to show updated info
  renderTopProspects();
}

/**
 * Generate scouting notes
 */
function generateScoutingNotes(prospect) {
  const notes = [];
  
  if (prospect.character.workEthic >= 90) notes.push('Exceptional work ethic');
  if (prospect.character.leadership >= 85) notes.push('Natural leader');
  if (prospect.character.injury_prone) notes.push('Injury concerns');
  if (prospect.character.red_flags) notes.push('Character questions');
  
  const r = prospect.ratings;
  if (r.speed >= 90) notes.push('Elite speed');
  if (r.awareness >= 85) notes.push('High football IQ');
  
  return notes.length > 0 ? notes.join(', ') : 'Solid prospect';
}

/**
 * Get prospect grade
 */
function getProspectGrade(prospect) {
  if (prospect.ovr >= 85) return 'A';
  if (prospect.ovr >= 80) return 'B+';
  if (prospect.ovr >= 75) return 'B';
  if (prospect.ovr >= 70) return 'B-';
  if (prospect.ovr >= 65) return 'C+';
  if (prospect.ovr >= 60) return 'C';
  return 'C-';
}

/**
 * Get scouting information (respects fog of war)
 */
function getScoutingInfo(prospect) {
  if (prospect.scouted) {
    return {
      ovr: `${prospect.scoutedOvr.min}-${prospect.scoutedOvr.max}`,
      confidence: prospect.scoutedOvr.confidence
    };
  } else {
    // Very rough estimate before scouting
    return {
      ovr: `${prospect.scoutedOvr.min}-${prospect.scoutedOvr.max}`,
      confidence: prospect.scoutedOvr.confidence
    };
  }
}

/**
 * Get CSS class for overall rating
 */
function getOvrClass(ovr) {
  if (typeof ovr === 'string') {
    const nums = ovr.split('-').map(n => parseInt(n));
    ovr = Math.max(...nums);
  }
  
  if (ovr >= 85) return 'elite';
  if (ovr >= 80) return 'very-good'; 
  if (ovr >= 75) return 'good';
  if (ovr >= 65) return 'average';
  return 'below-average';
}

/**
 * Calculate basic pick value if main function not available
 */
function calculateBasicPickValue(pick) {
  const baseValues = { 1: 25, 2: 15, 3: 8, 4: 5, 5: 3, 6: 2, 7: 1 };
  const baseValue = baseValues[pick.round] || 1;
  
  // Discount for future years
  const yearsOut = pick.year - (window.state?.league?.year || 2025);
  const discount = Math.pow(0.8, Math.max(0, yearsOut));
  
  return baseValue * discount;
}

/**
 * Execute a draft pick (uses enhanced system if active, otherwise legacy)
 */
function makeDraftPick(teamId, prospectId) {
  // Use enhanced system if active
  if (draftState.active) {
    return makeDraftPickEnhanced(teamId, prospectId);
  }
  
  // Legacy system
  const L = window.state?.league;
  const team = L?.teams[teamId];
  const prospect = window.state.draftClass?.find(p => p.id === prospectId);
  
  if (!team || !prospect) {
    window.setStatus('Invalid draft pick selection');
    return false;
  }
  
  try {
    // Add player to team roster
    team.roster.push(prospect);
    team.roster.sort((a, b) => b.ovr - a.ovr);
    
    // Remove from draft class
    const prospectIndex = window.state.draftClass.findIndex(p => p.id === prospectId);
    if (prospectIndex >= 0) {
      window.state.draftClass.splice(prospectIndex, 1);
    }
    
    // Remove used pick from team
    const draftYear = L.year + 1;
    const pickIndex = team.picks.findIndex(p => p.year === draftYear);
    if (pickIndex >= 0) {
      team.picks.splice(pickIndex, 1);
    }
    
    // Update salary cap
    if (window.recalcCap) {
      window.recalcCap(L, team);
    }
    
    window.setStatus(`${team.name} drafts ${prospect.name} (${prospect.pos})`);
    
    // Re-render
    renderDraft();
    
    return true;
    
  } catch (error) {
    console.error('Error making draft pick:', error);
    return false;
  }
}

/**
 * Start the enhanced draft
 */
window.startDraft = function() {
  const L = window.state?.league;
  if (!L) {
    window.setStatus('No league loaded');
    return;
  }

  const draftYear = L.year + 1;
  if (initializeDraft(L, draftYear)) {
    renderDraft();
    window.setStatus(`🚀 ${draftYear} Draft Started!`, 'success');

    // Auto-save on phase change
    if (window.saveGameState) {
        window.saveGameState().catch(e => console.error("Auto-save failed:", e));
    } else if (saveState) {
        saveState();
    }
  } else {
    window.setStatus('Failed to start draft');
  }
};

/**
 * Select a prospect for drafting (user action)
 */
window.selectDraftProspect = function(prospectId) {
  if (!draftState.active) {
    window.setStatus('Draft not active');
    return;
  }

  const currentPick = getCurrentPick();
  if (!currentPick) {
    window.setStatus('No current pick');
    return;
  }

  if (currentPick.teamId !== window.state.userTeamId) {
    window.setStatus('Not your turn to pick');
    return;
  }

  makeDraftPickEnhanced(currentPick.teamId, prospectId);
};

/**
 * Propose trading a draft pick
 */
window.proposeDraftPickTrade = function(pickNumber) {
  // Open trade modal for draft pick
  if (window.renderTradeCenter) {
    window.renderTradeCenter();
  }
};

/**
 * Show the Draft Reveal Modal (Gem/Bust)
 */
function showDraftRevealModal(player, status, title, message) {
    // Create modal element
    const modal = document.createElement('div');
    modal.className = 'modal gem-reveal-modal';

    // Status class for styling (gem-status, bust-status, normal-status)
    const statusClass = status.toLowerCase() + '-status';

    modal.innerHTML = `
        <div class="reveal-card ${statusClass}">
            <div class="reveal-header">
                <h2>Draft Result</h2>
            </div>

            <div class="player-reveal-info">
                <h1>${player.name}</h1>
                <p>${player.pos} | ${player.college}</p>

                ${status === 'GEM' ? '<div class="reveal-badge gem">💎 HIDDEN GEM</div>' : ''}
                ${status === 'BUST' ? '<div class="reveal-badge bust">💔 BUST</div>' : ''}
                ${status === 'NORMAL' ? '<div class="reveal-badge normal">SOLID PICK</div>' : ''}

                <div class="rating-reveal">
                    <div class="rating-box">
                        <span class="label">True OVR</span>
                        <span class="value ${status === 'GEM' ? 'boosted' : (status === 'BUST' ? 'nerfed' : '')}">${player.ovr}</span>
                    </div>
                    <div class="rating-box">
                        <span class="label">Potential</span>
                        <span class="value">${player.potential || player.ovr}</span>
                    </div>
                </div>

                <p class="reveal-message">${message}</p>

                <button class="btn btn-primary btn-lg" onclick="this.closest('.modal').remove()">Continue</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Auto-dismiss after 5 seconds if not clicked (optional, but good for flow)
    // setTimeout(() => { if(document.body.contains(modal)) modal.remove(); }, 5000);
}

// Make functions globally available
window.generateProspects = generateProspects;
window.makeProspect = makeProspect;
window.generateBasicRatings = generateBasicRatings;
window.generateProspectName = generateProspectName;
window.generateCollege = generateCollege;
window.generateCollegeStats = generateCollegeStats;
window.calculateRookieContract = calculateRookieContract;
window.generateDraftClass = generateProspects; // Alias for gameEngine
window.renderDraft = renderDraft;
window.renderTopProspects = renderTopProspects;
window.scoutProspect = scoutProspect;
window.makeDraftPick = makeDraftPick;
window.initializeDraft = initializeDraft;
window.makeDraftPickEnhanced = makeDraftPickEnhanced;
window.tradeDraftPick = tradeDraftPick;
window.getCurrentPick = getCurrentPick;
window.getUpcomingPicks = getUpcomingPicks;
// window.renderDraftBoard = renderDraftBoard; // Removed to ensure renderDraft is called by router
window.renderAvailableProspects = renderAvailableProspects;

// Add draft CSS
const draftCSS = `
.draft-picks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.draft-pick-card {
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  padding: 1rem;
  text-align: center;
}

.draft-pick-card .round {
  font-weight: 600;
  color: var(--accent);
  margin-bottom: 0.5rem;
}

.prospect-card {
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
  padding: 1rem;
  margin-bottom: 1rem;
}

.prospect-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.prospect-header h4 {
  color: var(--text);
  margin: 0;
}

.prospect-info {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
  color: var(--text-muted);
}

.prospect-ratings {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1rem;
}

.rating-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.rating-item span:first-child {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.rating-item span:last-child {
  font-weight: 600;
  color: var(--text);
}

.prospect-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-scout {
  background: var(--accent);
  color: white;
  border: none;
}

.btn-scout:hover {
  background: var(--accent-hover);
}

.ovr-elite { color: #34C759; }
.ovr-very-good { color: #00D4AA; }
.ovr-good { color: var(--accent); }
.ovr-average { color: var(--warning); }
.ovr-below-average { color: var(--danger); }
`;

// Inject draft CSS
const draftStyleElement = document.createElement('style');
draftStyleElement.textContent = draftCSS;
document.head.appendChild(draftStyleElement);

// ============================================
// DRAFT ANALYSIS & GRADING SYSTEM
// ============================================

/**
 * Analyzes a team's draft and assigns grades
 * @param {Object} league - League object
 * @param {number} teamId - Team ID
 * @param {number} draftYear - Year of the draft
 * @returns {Object} Draft analysis with grades
 */
window.analyzeDraft = function(league, teamId, draftYear) {
  if (!league || !league.teams || !league.teams[teamId]) {
    return null;
  }

  const team = league.teams[teamId];
  const draftPicks = (team.draftHistory || []).filter(p => p.year === draftYear);
  
  if (draftPicks.length === 0) {
    return {
      year: draftYear,
      teamId: teamId,
      teamName: team.name,
      picks: [],
      overallGrade: 'N/A',
      gradeValue: 0,
      analysis: 'No picks in this draft',
      needsMet: [],
      bestPick: null,
      worstPick: null
    };
  }

  const analysis = {
    year: draftYear,
    teamId: teamId,
    teamName: team.name,
    picks: [],
    overallGrade: 'F',
    gradeValue: 0,
    analysis: '',
    needsMet: [],
    bestPick: null,
    worstPick: null,
    valueScore: 0,
    needScore: 0,
    talentScore: 0
  };

  let totalValue = 0;
  let totalExpectedValue = 0;
  const needs = analyzeTeamNeedsAtDraft(team, draftYear);
  const bestPicks = [];
  const worstPicks = [];

  draftPicks.forEach((pick, index) => {
    const player = findPlayerByIdForDraft(league, pick.playerId);
    if (!player) return;

    const pickValue = evaluateDraftPick(pick, player, draftYear);
    const needMet = needs.includes(player.pos);
    const grade = calculatePickGrade(pick, player, pickValue, needMet);

    const pickAnalysis = {
      round: pick.round,
      pick: pick.pickNumber || (pick.round * 32 - 31 + index),
      player: {
        name: player.name,
        pos: player.pos,
        ovr: player.ovr,
        potential: player.potential || player.ovr
      },
      grade: grade.letter,
      gradeValue: grade.value,
      value: pickValue,
      needMet: needMet,
      analysis: grade.analysis
    };

    analysis.picks.push(pickAnalysis);
    totalValue += pickValue;
    totalExpectedValue += getExpectedValueForPick(pick.round, pick.pickNumber || (pick.round * 32 - 31 + index));
    
    if (grade.value >= 85) bestPicks.push(pickAnalysis);
    if (grade.value < 60) worstPicks.push(pickAnalysis);
  });

  // Calculate overall scores
  analysis.valueScore = draftPicks.length > 0 ? (totalValue / totalExpectedValue) * 100 : 0;
  analysis.needScore = calculateNeedScore(analysis.picks, needs);
  analysis.talentScore = calculateTalentScore(analysis.picks);

  // Determine overall grade
  const avgGrade = analysis.picks.length > 0 
    ? analysis.picks.reduce((sum, p) => sum + p.gradeValue, 0) / analysis.picks.length 
    : 0;
  
  analysis.gradeValue = avgGrade;
  analysis.overallGrade = getGradeLetter(avgGrade);

  // Find best and worst picks
  if (bestPicks.length > 0) {
    analysis.bestPick = bestPicks.sort((a, b) => b.gradeValue - a.gradeValue)[0];
  }
  if (worstPicks.length > 0) {
    analysis.worstPick = worstPicks.sort((a, b) => a.gradeValue - b.gradeValue)[0];
  }

  // Generate analysis text
  analysis.analysis = generateDraftAnalysisText(analysis, needs);

  return analysis;
};

/**
 * Evaluates a single draft pick
 */
function evaluateDraftPick(pick, player, draftYear) {
  const expectedOvr = getExpectedOvrForPick(pick.round, pick.pickNumber);
  const actualOvr = player.ovr || 0;
  const potential = player.potential || player.ovr || 0;
  
  // Value based on how much better/worse than expected
  const ovrDiff = actualOvr - expectedOvr;
  const potentialDiff = potential - expectedOvr;
  
  // Base value from OVR difference
  let value = 50 + (ovrDiff * 2);
  
  // Bonus for high potential
  if (potential > expectedOvr + 5) {
    value += 10;
  }
  
  // Position value multiplier
  const positionMultipliers = {
    'QB': 1.3, 'OL': 1.2, 'DL': 1.1, 'CB': 1.1,
    'WR': 1.0, 'LB': 1.0, 'S': 0.95, 'TE': 0.9, 'RB': 0.85, 'K': 0.5, 'P': 0.5
  };
  value *= (positionMultipliers[player.pos] || 1.0);
  
  return Math.max(0, Math.min(100, value));
}

/**
 * Gets expected OVR for a pick
 */
function getExpectedOvrForPick(round, pickNumber) {
  if (round === 1) {
    if (pickNumber <= 5) return 82;
    if (pickNumber <= 10) return 80;
    if (pickNumber <= 20) return 78;
    return 76;
  } else if (round === 2) {
    return 72;
  } else if (round === 3) {
    return 68;
  } else if (round === 4) {
    return 64;
  } else if (round === 5) {
    return 60;
  } else if (round === 6) {
    return 57;
  } else {
    return 55;
  }
}

/**
 * Gets expected value for a pick
 */
function getExpectedValueForPick(round, pickNumber) {
  const baseValues = { 1: 100, 2: 70, 3: 50, 4: 35, 5: 25, 6: 15, 7: 10 };
  const base = baseValues[round] || 10;
  
  // Adjust for pick position within round
  if (round === 1) {
    const positionInRound = ((pickNumber - 1) % 32) + 1;
    if (positionInRound <= 5) return base * 1.2;
    if (positionInRound <= 10) return base * 1.1;
    if (positionInRound <= 20) return base * 1.05;
  }
  
  return base;
}

/**
 * Calculates grade for a pick
 */
function calculatePickGrade(pick, player, value, needMet) {
  let gradeValue = 50;
  let analysis = '';

  // Value-based grade
  if (value >= 90) {
    gradeValue = 95;
    analysis = 'Exceptional value';
  } else if (value >= 80) {
    gradeValue = 88;
    analysis = 'Great value';
  } else if (value >= 70) {
    gradeValue = 78;
    analysis = 'Good value';
  } else if (value >= 60) {
    gradeValue = 68;
    analysis = 'Average value';
  } else if (value >= 50) {
    gradeValue = 58;
    analysis = 'Below average value';
  } else {
    gradeValue = 45;
    analysis = 'Poor value';
  }

  // Adjust for need
  if (needMet) {
    gradeValue += 5;
    analysis += ', fills need';
  } else {
    gradeValue -= 3;
    analysis += ', not a need';
  }

  // Adjust for potential
  const expectedOvr = getExpectedOvrForPick(pick.round, pick.pickNumber);
  if (player.potential && player.potential > expectedOvr + 8) {
    gradeValue += 5;
    analysis += ', high upside';
  }

  gradeValue = Math.max(0, Math.min(100, gradeValue));

  return {
    letter: getGradeLetter(gradeValue),
    value: gradeValue,
    analysis: analysis
  };
}

/**
 * Gets grade letter from value
 */
function getGradeLetter(value) {
  if (value >= 93) return 'A+';
  if (value >= 90) return 'A';
  if (value >= 87) return 'A-';
  if (value >= 83) return 'B+';
  if (value >= 80) return 'B';
  if (value >= 77) return 'B-';
  if (value >= 73) return 'C+';
  if (value >= 70) return 'C';
  if (value >= 67) return 'C-';
  if (value >= 63) return 'D+';
  if (value >= 60) return 'D';
  if (value >= 57) return 'D-';
  return 'F';
}

/**
 * Analyzes team needs at draft time
 */
function analyzeTeamNeedsAtDraft(team, draftYear) {
  if (!team || !team.roster) return [];
  
  const needs = [];
  const positionCounts = {};
  
  team.roster.forEach(player => {
    const pos = player.pos || 'RB';
    positionCounts[pos] = (positionCounts[pos] || 0) + 1;
  });
  
  const idealCounts = {
    'QB': 3, 'RB': 4, 'WR': 6, 'TE': 3, 'OL': 8,
    'DL': 6, 'LB': 6, 'CB': 5, 'S': 4, 'K': 1, 'P': 1
  };
  
  Object.keys(idealCounts).forEach(pos => {
    const have = positionCounts[pos] || 0;
    const need = idealCounts[pos] || 2;
    if (have < need * 0.75) {
      needs.push(pos);
    }
  });
  
  return needs;
}

/**
 * Calculates need score
 */
function calculateNeedScore(picks, needs) {
  if (picks.length === 0) return 0;
  const needPicks = picks.filter(p => p.needMet).length;
  return (needPicks / picks.length) * 100;
}

/**
 * Calculates talent score
 */
function calculateTalentScore(picks) {
  if (picks.length === 0) return 0;
  const avgOvr = picks.reduce((sum, p) => sum + (p.player.ovr || 0), 0) / picks.length;
  return Math.min(100, (avgOvr / 85) * 100);
}

/**
 * Generates analysis text
 */
function generateDraftAnalysisText(analysis, needs) {
  let text = '';
  
  if (analysis.picks.length === 0) {
    return 'No picks in this draft.';
  }
  
  text += `Drafted ${analysis.picks.length} player${analysis.picks.length > 1 ? 's' : ''}. `;
  
  if (analysis.overallGrade >= 'A') {
    text += 'Excellent draft class with strong value throughout. ';
  } else if (analysis.overallGrade >= 'B') {
    text += 'Solid draft class with good value. ';
  } else if (analysis.overallGrade >= 'C') {
    text += 'Average draft class with mixed results. ';
  } else {
    text += 'Disappointing draft class with limited value. ';
  }
  
  if (analysis.bestPick) {
    text += `Best pick: ${analysis.bestPick.player.name} (${analysis.bestPick.grade}). `;
  }
  
  if (analysis.needScore >= 70) {
    text += 'Successfully addressed team needs. ';
  } else if (analysis.needScore < 40) {
    text += 'Failed to address key team needs. ';
  }
  
  return text.trim();
}

/**
 * Finds player by ID across all teams
 */
function findPlayerByIdForDraft(league, playerId) {
  if (!league || !league.teams) return null;
  
  for (const team of league.teams) {
    if (team.roster) {
      const player = team.roster.find(p => p.id === playerId);
      if (player) return player;
    }
  }
  
  return null;
}

/**
 * Gets color for grade
 */
function getGradeColor(grade) {
  if (grade.startsWith('A')) return 'var(--success-text, #28a745)';
  if (grade.startsWith('B')) return '#4CAF50';
  if (grade.startsWith('C')) return '#FFC107';
  if (grade.startsWith('D')) return '#FF9800';
  return 'var(--error-text, #dc3545)';
}

/**
 * Renders draft analysis UI
 */
window.renderDraftAnalysis = function(teamId = null, draftYear = null) {
  const L = window.state?.league;
  if (!L || !L.teams) {
    console.error('No league for draft analysis');
    return;
  }

  const targetTeamId = teamId !== null ? teamId : (window.state?.userTeamId ?? 0);
  const targetYear = draftYear !== null ? draftYear : (L.year || L.season || 2025);
  
  const analysis = window.analyzeDraft(L, targetTeamId, targetYear);
  if (!analysis) {
    console.error('Failed to analyze draft');
    return;
  }

  // Find or create container
  let container = document.getElementById('draftAnalysis');
  if (!container) {
    const draftView = document.getElementById('draft');
    if (draftView) {
      container = document.createElement('div');
      container.id = 'draftAnalysis';
      container.className = 'card';
      container.style.marginTop = '20px';
      draftView.appendChild(container);
    } else {
      console.error('Draft view not found');
      return;
    }
  }

  let html = `
    <div class="draft-analysis-container">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="margin: 0; color: var(--accent);">${analysis.year} Draft Analysis: ${analysis.teamName}</h3>
        <div style="display: flex; align-items: center; gap: 15px;">
          <div style="text-align: center;">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 5px;">Overall Grade</div>
            <div style="font-size: 36px; font-weight: 700; color: ${getGradeColor(analysis.overallGrade)};">
              ${analysis.overallGrade}
            </div>
          </div>
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px;">
        <div style="background: var(--surface); padding: 15px; border-radius: 8px; border: 1px solid var(--hairline);">
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 5px;">Value Score</div>
          <div style="font-size: 24px; font-weight: 600; color: var(--text);">${analysis.valueScore.toFixed(0)}</div>
        </div>
        <div style="background: var(--surface); padding: 15px; border-radius: 8px; border: 1px solid var(--hairline);">
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 5px;">Need Score</div>
          <div style="font-size: 24px; font-weight: 600; color: var(--text);">${analysis.needScore.toFixed(0)}</div>
        </div>
        <div style="background: var(--surface); padding: 15px; border-radius: 8px; border: 1px solid var(--hairline);">
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 5px;">Talent Score</div>
          <div style="font-size: 24px; font-weight: 600; color: var(--text);">${analysis.talentScore.toFixed(0)}</div>
        </div>
      </div>
      
      <div style="background: var(--surface-strong); padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid var(--hairline-strong);">
        <p style="margin: 0; color: var(--text); line-height: 1.6;">${analysis.analysis}</p>
      </div>
      
      <h4 style="margin: 0 0 15px 0; color: var(--text);">Draft Picks</h4>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: var(--surface-strong); border-bottom: 2px solid var(--hairline-strong);">
              <th style="padding: 10px; text-align: left; font-size: 12px; font-weight: 600; color: var(--text);">Pick</th>
              <th style="padding: 10px; text-align: left; font-size: 12px; font-weight: 600; color: var(--text);">Player</th>
              <th style="padding: 10px; text-align: center; font-size: 12px; font-weight: 600; color: var(--text);">POS</th>
              <th style="padding: 10px; text-align: center; font-size: 12px; font-weight: 600; color: var(--text);">OVR</th>
              <th style="padding: 10px; text-align: center; font-size: 12px; font-weight: 600; color: var(--text);">Grade</th>
              <th style="padding: 10px; text-align: left; font-size: 12px; font-weight: 600; color: var(--text);">Analysis</th>
            </tr>
          </thead>
          <tbody>
  `;

  analysis.picks.forEach(pick => {
    html += `
      <tr style="border-bottom: 1px solid var(--hairline);">
        <td style="padding: 10px; color: var(--text);">R${pick.round} P${pick.pick}</td>
        <td style="padding: 10px; color: var(--text); font-weight: 500;">${pick.player.name}</td>
        <td style="padding: 10px; text-align: center; color: var(--text);">${pick.player.pos}</td>
        <td style="padding: 10px; text-align: center; color: var(--text);">${pick.player.ovr}</td>
        <td style="padding: 10px; text-align: center;">
          <span style="font-weight: 700; font-size: 16px; color: ${getGradeColor(pick.grade)};">
            ${pick.grade}
          </span>
        </td>
        <td style="padding: 10px; color: var(--text-muted); font-size: 12px;">${pick.analysis}</td>
      </tr>
    `;
  });

  html += `
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.innerHTML = html;
};

console.log('✅ Draft system fixed and loaded');
