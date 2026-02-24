// player.js - Combined Player System
// Core Logic - Pure JS (No DOM/Window dependencies)

import { Utils as U } from './utils.js';
import { Constants as C } from './constants.js';
import { calculateWAR as calculateWARImpl } from './war-calculator.js';

// ============================================================================
// PLAYER PROGRESSION & SKILL TREES
// ============================================================================

const SKILL_TREES = {
    QB: [
      { name: 'Pocket Presence', cost: 1, boosts: { awareness: 2, intelligence: 1 } },
      { name: 'Arm Strength I', cost: 1, boosts: { throwPower: 3 } },
      { name: 'Short Accuracy', cost: 1, boosts: { throwAccuracy: 2, awareness: 1 } },
      { name: 'Deep Ball I', cost: 2, boosts: { throwPower: 2, throwAccuracy: 2 } },
      { name: 'Scramble Drill', cost: 2, boosts: { speed: 2, agility: 2, awareness: 1 } },
      { name: 'Play Action Mastery', cost: 2, boosts: { awareness: 3, intelligence: 1 } },
      { name: 'Clutch Passer', cost: 3, boosts: { awareness: 4, intelligence: 2 } },
      { name: 'Deadeye Elite', cost: 3, boosts: { throwAccuracy: 5 } }
    ],
    RB: [
      { name: 'Evasive Runner', cost: 1, boosts: { juking: 3, agility: 1 } },
      { name: 'Power Runner I', cost: 1, boosts: { trucking: 3, weight: 5 } },
      { name: 'Burst of Speed', cost: 1, boosts: { acceleration: 3 } },
      { name: 'Receiving Back', cost: 2, boosts: { catching: 3, agility: 2 } },
      { name: 'Endurance Training', cost: 2, boosts: { awareness: 1 } },
      { name: 'Pass Protection', cost: 2, boosts: { passBlock: 3, intelligence: 2 } },
      { name: 'Workhorse', cost: 3, boosts: { trucking: 4, awareness: 3 } },
      { name: 'Human Joystick', cost: 3, boosts: { juking: 4, agility: 4 } }
    ],
    WR: [
      { name: 'Route Running', cost: 1, boosts: { agility: 2, awareness: 1 } },
      { name: 'Hands', cost: 1, boosts: { catching: 3 } },
      { name: 'Speed Training', cost: 1, boosts: { speed: 3 } },
      { name: 'Deep Threat', cost: 2, boosts: { speed: 2, catching: 2 } },
      { name: 'Possession Receiver', cost: 2, boosts: { catchInTraffic: 3, catching: 2 } },
      { name: 'Elite Receiver', cost: 3, boosts: { catching: 4, agility: 3 } }
    ],
    DL: [
      { name: 'Pass Rush I', cost: 1, boosts: { passRushSpeed: 3 } },
      { name: 'Power Rush', cost: 1, boosts: { passRushPower: 3 } },
      { name: 'Run Stopper', cost: 1, boosts: { runStop: 3 } },
      { name: 'Elite Pass Rusher', cost: 2, boosts: { passRushSpeed: 2, passRushPower: 2 } },
      { name: 'Complete Defender', cost: 3, boosts: { passRushSpeed: 3, runStop: 3 } }
    ],
    LB: [
      { name: 'Coverage I', cost: 1, boosts: { coverage: 3 } },
      { name: 'Run Defense', cost: 1, boosts: { runStop: 3 } },
      { name: 'Blitz Specialist', cost: 1, boosts: { passRushSpeed: 2, awareness: 1 } },
      { name: 'Coverage Master', cost: 2, boosts: { coverage: 4, speed: 2 } },
      { name: 'Complete Linebacker', cost: 3, boosts: { coverage: 3, runStop: 3, awareness: 2 } }
    ],
    CB: [
      { name: 'Man Coverage', cost: 1, boosts: { coverage: 3, speed: 1 } },
      { name: 'Zone Coverage', cost: 1, boosts: { coverage: 2, awareness: 2 } },
      { name: 'Ball Skills', cost: 1, boosts: { awareness: 3 } },
      { name: 'Shutdown Corner', cost: 2, boosts: { coverage: 4, speed: 2 } },
      { name: 'Elite Coverage', cost: 3, boosts: { coverage: 5, awareness: 3 } }
    ],
    S: [
      { name: 'Deep Coverage', cost: 1, boosts: { coverage: 2, awareness: 2 } },
      { name: 'Run Support', cost: 1, boosts: { runStop: 3 } },
      { name: 'Ball Hawk', cost: 1, boosts: { awareness: 3 } },
      { name: 'Complete Safety', cost: 2, boosts: { coverage: 3, runStop: 3 } },
      { name: 'Elite Safety', cost: 3, boosts: { coverage: 4, awareness: 4 } }
    ],
    OL: [
      { name: 'Pass Block I', cost: 1, boosts: { passBlock: 3 } },
      { name: 'Run Block I', cost: 1, boosts: { runBlock: 3 } },
      { name: 'Technique', cost: 1, boosts: { awareness: 2, intelligence: 1 } },
      { name: 'Elite Pass Protector', cost: 2, boosts: { passBlock: 4 } },
      { name: 'Complete Lineman', cost: 3, boosts: { passBlock: 3, runBlock: 3, awareness: 2 } }
    ],
    TE: [
      { name: 'Receiving', cost: 1, boosts: { catching: 3 } },
      { name: 'Blocking', cost: 1, boosts: { runBlock: 2, passBlock: 2 } },
      { name: 'Route Running', cost: 1, boosts: { agility: 2, awareness: 1 } },
      { name: 'Complete Tight End', cost: 2, boosts: { catching: 3, runBlock: 2 } },
      { name: 'Elite TE', cost: 3, boosts: { catching: 4, runBlock: 3 } }
    ],
    K: [
      { name: 'Accuracy', cost: 1, boosts: { kickAccuracy: 3 } },
      { name: 'Power', cost: 1, boosts: { kickPower: 3 } },
      { name: 'Clutch Kicker', cost: 2, boosts: { kickAccuracy: 4, kickPower: 2 } }
    ],
    P: [
      { name: 'Distance', cost: 1, boosts: { kickPower: 3 } },
      { name: 'Accuracy', cost: 1, boosts: { kickAccuracy: 3 } },
      { name: 'Elite Punter', cost: 2, boosts: { kickPower: 4, kickAccuracy: 3 } }
    ]
};

function initProgressionStats(player) {
    if (!player.progression) {
      player.progression = {
        xp: 0,
        skillPoints: 0,
        upgrades: [],
        treeOvrBonus: 0
      };
    }
}

function calculateGameXP(gameStats, ovr) {
    let baseXP = 50;
    if (ovr >= 90) baseXP += 40;
    else if (ovr >= 80) baseXP += 30;
    else if (ovr >= 70) baseXP += 20;

    const age = gameStats.age || 22;
    const potential = gameStats.potential || ovr;
    const potentialDiff = potential - ovr;
    baseXP += U.clamp(potentialDiff * 5, 0, 100);

    if (age <= 24) baseXP *= 1.15;
    else if (age <= 27) baseXP *= 1.0;
    else if (age <= 30) baseXP *= 0.8;
    else if (age <= 33) baseXP *= 0.4;
    else baseXP *= 0.15;

    const workEthic = gameStats.workEthic || gameStats.character?.workEthic || 75;
    if (workEthic >= 90) baseXP *= 1.25;
    else if (workEthic >= 80) baseXP *= 1.10;
    else if (workEthic < 65) baseXP *= 0.85;

    if (gameStats.years <= 1) baseXP += 20;

    if (gameStats.passYd && gameStats.passYd > 200) baseXP += Math.floor(gameStats.passYd / 50);
    if (gameStats.rushYd && gameStats.rushYd > 100) baseXP += Math.floor(gameStats.rushYd / 20);
    if (gameStats.interceptions === 0) baseXP += 10;

    return U.clamp(Math.round(baseXP), 20, 500);
}

function addXP(player, xpGained) {
    initProgressionStats(player);
    const XP_FOR_SP = 1000;
    player.progression.xp += xpGained;
    while (player.progression.xp >= XP_FOR_SP) {
      player.progression.xp -= XP_FOR_SP;
      player.progression.skillPoints++;
    }
}

function applySkillTreeUpgrade(player, skillName) {
    initProgressionStats(player);
    if (!SKILL_TREES[player.pos]) return false;

    const skill = SKILL_TREES[player.pos].find(s => s.name === skillName);
    if (!skill) return false;

    if (player.progression.upgrades.includes(skillName)) return false;
    if (player.progression.skillPoints < skill.cost) return false;

    player.progression.skillPoints -= skill.cost;

    let ovrGained = 0;
    for (const [rating, boost] of Object.entries(skill.boosts)) {
      if (player.ratings[rating] !== undefined) {
        player.ratings[rating] = Math.min(99, player.ratings[rating] + boost);
        ovrGained += boost * 0.5;
      }
    }

    player.progression.upgrades.push(skillName);
    player.progression.treeOvrBonus += ovrGained;
    player.ovr = calculateOvr(player.pos, player.ratings);

    return true;
}

// ============================================================================
// CORE HELPERS (Extracted from fixes.js)
// ============================================================================

function generatePlayerRatings(pos, targetOvr = null) {
  const genRating = (min, max, weight = 1.0) => {
      if (targetOvr) {
          const variance = 10;
          let r = targetOvr + U.rand(-variance, variance);
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
    height: U.rand(68, 80),
    weight: U.rand(180, 320)
  };

  const positionAdjustments = {
    QB: { speed: [50, 90], throwPower: [65, 99], throwAccuracy: [55, 99] },
    RB: { speed: [70, 99], acceleration: [70, 99], trucking: [60, 99], juking: [50, 99] },
    WR: { speed: [75, 99], acceleration: [70, 99], catching: [65, 99], catchInTraffic: [55, 99] },
    TE: { catching: [55, 95], runBlock: [60, 95], passBlock: [55, 90], speed: [45, 85] },
    OL: { speed: [40, 65], runBlock: [70, 99], passBlock: [70, 99], weight: [290, 350] },
    DL: { passRushPower: [60, 99], passRushSpeed: [55, 99], runStop: [65, 99], weight: [250, 320] },
    LB: { speed: [60, 95], runStop: [60, 95], coverage: [45, 90], awareness: [55, 95] },
    CB: { speed: [75, 99], acceleration: [75, 99], coverage: [60, 99], intelligence: [50, 95] },
    S: { speed: [65, 95], coverage: [55, 95], runStop: [50, 90], awareness: [60, 95] },
    K: { kickPower: [70, 99], kickAccuracy: [60, 99], speed: [40, 70] },
    P: { kickPower: [65, 99], kickAccuracy: [60, 99], speed: [40, 70] }
  };

  const adjustments = positionAdjustments[pos] || {};
  Object.keys(adjustments).forEach(stat => {
    const [min, max] = adjustments[stat];
    baseRatings[stat] = genRating(min, max);
  });

  return baseRatings;
}

function calculateOvr(pos, ratings) {
  const weights = C.OVR_WEIGHTS[pos];
  if (!weights) return U.rand(50, 75);

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

function generateContract(ovr, pos) {
  const positionMultiplier = C.POSITION_VALUES?.[pos] || 1.0;
  let baseAnnual;

  if (ovr >= 90) {
    if (pos === 'QB') baseAnnual = U.rand(15, 25) * positionMultiplier;
    else baseAnnual = U.rand(12, 20) * positionMultiplier * 0.85;
  } else if (ovr >= 80) {
    baseAnnual = U.rand(4, 12) * positionMultiplier * 0.9;
  } else if (ovr >= 70) {
    baseAnnual = U.rand(1.5, 5) * positionMultiplier;
  } else if (ovr >= 60) {
    baseAnnual = U.rand(0.6, 2) * positionMultiplier;
  } else {
    baseAnnual = U.rand(0.4, 0.8) * positionMultiplier;
  }

  if (baseAnnual > 30) baseAnnual = 30;
  if (baseAnnual < 0.4) baseAnnual = 0.4;

  baseAnnual = Math.round(baseAnnual * 10) / 10;
  const years = U.rand(1, 4);
  const bonusPercent = (C.SALARY_CAP.SIGNING_BONUS_MIN || 0.15) +
                      U.random() * ((C.SALARY_CAP.SIGNING_BONUS_MAX || 0.4) - (C.SALARY_CAP.SIGNING_BONUS_MIN || 0.15));

  const maxBonus = baseAnnual * years * 0.4;
  const signingBonus = Math.min(Math.round((baseAnnual * years * bonusPercent) * 10) / 10, maxBonus);

  return {
    years,
    yearsTotal: years,
    baseAnnual,
    signingBonus: signingBonus,
    guaranteedPct: C.SALARY_CAP?.GUARANTEED_PCT_DEFAULT || 0.5
  };
}

function tagAbilities(player) {
  if (!player || !player.ratings) return;
  player.abilities = [];
  const r = player.ratings;

  const abilityThresholds = { ELITE: 95, VERY_GOOD: 88, GOOD: 82 };

  if (player.pos === 'QB') {
    if (r.throwPower >= abilityThresholds.ELITE) player.abilities.push('Cannon Arm');
    if (r.throwAccuracy >= abilityThresholds.ELITE) player.abilities.push('Deadeye');
    if (r.speed >= abilityThresholds.VERY_GOOD) player.abilities.push('Escape Artist');
  }
  // Add other positions if needed... simplified for brevity but core logic is here
}

function generatePersonality() {
    const traits = [];
    const numTraits = U.rand(1, 2);
    const possibleTraits = ['Winner', 'Loyal', 'Greedy', 'Clutch', 'Leader', 'Mentor', 'Injury Prone', 'Iron Man'];
    for (let i = 0; i < numTraits; i++) {
        const trait = U.choice(possibleTraits);
        if (!traits.includes(trait)) traits.push(trait);
    }
    return { traits };
}

function getZeroStats() {
    return {
      gamesPlayed: 0,
      passYd: 0, passTD: 0, interceptions: 0, passAtt: 0, passComp: 0, sacks: 0,
      rushYd: 0, rushTD: 0, rushAtt: 0, fumbles: 0,
      recYd: 0, recTD: 0, receptions: 0, targets: 0, drops: 0,
      tackles: 0, forcedFumbles: 0, passesDefended: 0, tacklesForLoss: 0,
      fgMade: 0, fgAttempts: 0, xpMade: 0, xpAttempts: 0, punts: 0,
      twoPtMade: 0
    };
}

function generateCollege() {
    return U.choice(C.COLLEGES) || 'Unknown University';
}

function generateName() {
    // Use Constants directly for names to avoid window dep
    return U.choice(C.FIRST_NAMES) + ' ' + U.choice(C.LAST_NAMES);
}

// ============================================================================
// MAIN PLAYER FUNCTIONS
// ============================================================================

function makePlayer(pos, age = null, ovr = null) {
    if (!U || !C) throw new Error('Utils and Constants must be loaded');

    const playerAge = age || U.rand(C.PLAYER_CONFIG.MIN_AGE, C.PLAYER_CONFIG.MAX_AGE);
    const ratings = generatePlayerRatings(pos, ovr);
    const playerOvr = calculateOvr(pos, ratings);
    const contractDetails = generateContract(playerOvr, pos);

    const player = {
        id: U.id(),
        name: generateName(),
        pos: pos,
        age: playerAge,
        ratings: ratings,
        ovr: playerOvr,
        displayOvr: playerOvr, // Simplified calibration
        years: contractDetails.years,
        yearsTotal: contractDetails.yearsTotal,
        baseAnnual: contractDetails.baseAnnual,
        signingBonus: contractDetails.signingBonus,
        guaranteedPct: contractDetails.guaranteedPct,
        injuryWeeks: 0,
        injuries: [],
        fatigue: 0,
        morale: U.rand(70, 95),
        negotiationStatus: 'OPEN',
        lockoutWeeks: 0,
        devTrait: U.choice(['Normal', 'Star', 'Superstar', 'X-Factor']),
        potential: Math.min(99, playerOvr + U.rand(0, 30)),
        isFollowed: false,
        abilities: [],
        awards: [],
        personality: generatePersonality(),
        stats: {
          game: getZeroStats(),
          season: getZeroStats(),
          career: getZeroStats()
        },
        history: [],
        college: generateCollege()
    };

    initProgressionStats(player);
    tagAbilities(player);

    return player;
}

function progressPlayer(player) {
    if (!player) return player;
    player.age++;
    if (player.age > (C.HALL_OF_FAME?.FORCED_RETIREMENT_AGE || 38)) {
        player.retired = true;
        return player;
    }
    // Simplified progression: Re-calc OVR based on existing ratings (which might be updated elsewhere)
    // In a real worker loop, we'd add the detailed regression logic here.
    // For now, keep it simple/safe.
    player.ovr = calculateOvr(player.pos, player.ratings);
    return player;
}

// ============================================================================
// LEGACY & STATS (Simplified)
// ============================================================================

function initializePlayerLegacy(player) {
    if (!player.legacy) {
      player.legacy = { milestones: [], achievements: [], awards: {}, records: { team: [], league: [] }, metrics: {} };
    }
}

function updatePlayerGameLegacy(player, gameStats, gameContext) {
    initializePlayerLegacy(player);
    // ... Legacy logic can be expanded here
}

function updateAdvancedStats(player, seasonStats) {
    if (!player.stats.career) player.stats.career = getZeroStats();
    if (!player.stats.career.advanced) player.stats.career.advanced = {};

    // Calculate WAR
    if (calculateWARImpl) {
        seasonStats.war = calculateWARImpl(player, seasonStats);
    }
}

// ============================================================================
// ROOKIES
// ============================================================================

function generateDraftClass(year, options = {}) {
    const classSize = options.classSize || 150;
    const draftClass = [];
    const positions = C.DRAFT_CONFIG?.POSITIONS || C.POSITIONS; // Fallback
    const posKeys = Object.keys(positions).length > 0 && isNaN(Object.keys(positions)[0]) ? Object.keys(positions) : C.POSITIONS;

    for (let i = 0; i < classSize; i++) {
        const pos = U.choice(posKeys);
        const rookie = makePlayer(pos, 21); // Rookies are young
        rookie.year = year;
        rookie.draftId = i + 1;
        draftClass.push(rookie);
    }

    draftClass.sort((a, b) => b.ovr - a.ovr);
    return draftClass;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
    SKILL_TREES,
    initProgressionStats,
    calculateGameXP,
    addXP,
    applySkillTreeUpgrade,
    makePlayer,
    progressPlayer,
    getZeroStats,
    generatePersonality,
    initializePlayerLegacy,
    updatePlayerGameLegacy,
    updateAdvancedStats,
    generateDraftClass,
    calculateOvr,
    generateContract,
    generatePlayerRatings,
    tagAbilities
};
