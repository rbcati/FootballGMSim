// player.js - Combined Player System
// This file combines: player.js, player.legacy.js, player-factory.js, player-progression.js, and rookies.js
// Also includes: Depth Chart System with Playbook Knowledge and Chemistry
// ES Module version - migrated from IIFE pattern

// Import dependencies
import { Utils as U } from './utils.js';
import { Constants as C } from './constants.js';

  // ============================================================================
  // PLAYER PROGRESSION & SKILL TREES (from player-progression.js)
  // ============================================================================

  /**
   * Defines the progression tiers and rating boosts for each position's skill tree.
   * Key: Position Abbreviation
   * Value: Array of Tiers (Tier 0 is free, Tier 1+ requires spending Skill Points)
   */
  const SKILL_TREES = {
    QB: [
      // Tier 1: Core Passing
      { name: 'Pocket Presence', cost: 1, boosts: { awareness: 2, intelligence: 1 } },
      { name: 'Arm Strength I', cost: 1, boosts: { throwPower: 3 } },
      { name: 'Short Accuracy', cost: 1, boosts: { throwAccuracy: 2, awareness: 1 } },
      
      // Tier 2: Advanced Passing (Requires 3 Tier 1 upgrades)
      { name: 'Deep Ball I', cost: 2, boosts: { throwPower: 2, throwAccuracy: 2 } },
      { name: 'Scramble Drill', cost: 2, boosts: { speed: 2, agility: 2, awareness: 1 } },
      { name: 'Play Action Mastery', cost: 2, boosts: { awareness: 3, intelligence: 1 } },

      // Tier 3: Elite Talent (Requires 6 total upgrades)
      { name: 'Clutch Passer', cost: 3, boosts: { awareness: 4, intelligence: 2 } },
      { name: 'Deadeye Elite', cost: 3, boosts: { throwAccuracy: 5 } }
    ],
    
    RB: [
      // Tier 1: Core Running
      { name: 'Evasive Runner', cost: 1, boosts: { juking: 3, agility: 1 } },
      { name: 'Power Runner I', cost: 1, boosts: { trucking: 3, weight: 5 } },
      { name: 'Burst of Speed', cost: 1, boosts: { acceleration: 3 } },

      // Tier 2: Versatility & Durability (Requires 3 Tier 1 upgrades)
      { name: 'Receiving Back', cost: 2, boosts: { catching: 3, agility: 2 } },
      { name: 'Endurance Training', cost: 2, boosts: { awareness: 1 } }, // Fatigue handled separately
      { name: 'Pass Protection', cost: 2, boosts: { passBlock: 3, intelligence: 2 } },
      
      // Tier 3: Elite Talent (Requires 6 total upgrades)
      { name: 'Workhorse', cost: 3, boosts: { trucking: 4, awareness: 3 } },
      { name: 'Human Joystick', cost: 3, boosts: { juking: 4, agility: 4 } }
    ],

    // Add more positions (WR, DL, LB, etc.) following this structure...
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

  /**
   * Initializes progression stats on a new player.
   * @param {Object} player - Player object
   */
  function initProgressionStats(player) {
    if (!player.progression) {
      player.progression = {
        xp: 0,
        skillPoints: 0,
        upgrades: [], // Array of purchased skill names
        treeOvrBonus: 0 // Track OVR gain from tree
      };
    }
  }

  /**
   * Calculates XP earned based on performance and overall rating difference.
   * @param {Object} gameStats - Player's game statistics
   * @param {number} ovr - Player's current overall rating
   * @returns {number} Amount of XP earned
   */
  function calculateGameXP(gameStats, ovr) {
    let baseXP = 50; // Base XP for playing a game
    
    // Performance Bonus (simplified, real logic uses position-specific stats)
    if (ovr >= 90) baseXP += 50; // Elite players get more for performing
    else if (ovr <= 70) baseXP += 100; // Lower rated players get more to catch up

    // Age/Potential Modifier: Younger players with higher potential earn more
    const age = gameStats.age || 22;
    const potential = gameStats.potential || ovr;
    const potentialDiff = potential - ovr;
    
    baseXP += U.clamp(potentialDiff * 5, 0, 100); 
    
    // Contract Bonus (Players playing for a new deal perform better)
    if (gameStats.years <= 1) baseXP += 25; 

    // Position-Specific Performance
    if (gameStats.passYd && gameStats.passYd > 200) baseXP += Math.floor(gameStats.passYd / 50);
    if (gameStats.rushYd && gameStats.rushYd > 100) baseXP += Math.floor(gameStats.rushYd / 20);
    if (gameStats.interceptions === 0) baseXP += 10;
    
    return U.clamp(baseXP, 50, 500);
  }

  /**
   * Adds XP to a player and converts excess XP into Skill Points (SP).
   * @param {Object} player - Player object
   * @param {number} xpGained - XP to add
   */
  function addXP(player, xpGained) {
    initProgressionStats(player);
    
    const XP_FOR_SP = 1000; // 1000 XP = 1 Skill Point
    player.progression.xp += xpGained;
    
    // Convert excess XP to Skill Points
    while (player.progression.xp >= XP_FOR_SP) {
      player.progression.xp -= XP_FOR_SP;
      player.progression.skillPoints++;
      console.log(`[XP] ${player.name} gained 1 Skill Point!`);
    }
  }

  /**
   * Attempts to apply a skill tree upgrade to a player's ratings.
   * @param {Object} player - Player object
   * @param {string} skillName - Name of the skill to purchase
   * @returns {boolean} True if upgrade was successful, false otherwise
   */
  function applySkillTreeUpgrade(player, skillName) {
    initProgressionStats(player);
    
    if (!SKILL_TREES[player.pos]) {
      console.error(`Skill tree not defined for position: ${player.pos}`);
      return false;
    }
    
    // Find the skill definition
    const skill = SKILL_TREES[player.pos].find(s => s.name === skillName);
    
    if (!skill) {
      console.error(`Skill not found: ${skillName}`);
      return false;
    }
    
    if (player.progression.upgrades.includes(skillName)) {
      console.warn(`Skill already purchased: ${skillName}`);
      return false;
    }
    
    if (player.progression.skillPoints < skill.cost) {
      console.warn(`Not enough Skill Points. Needed: ${skill.cost}, Have: ${player.progression.skillPoints}`);
      return false;
    }
    
    // Check Tier prerequisites (simplified)
    // Total purchased skills must meet a minimum count for later tiers
    const currentUpgrades = player.progression.upgrades.length;
    const tierMap = { 1: 0, 2: 3, 3: 6 }; // Example: Tier 2 requires 3 total upgrades
    
    const skillTier = Object.keys(tierMap).find(tier => 
      SKILL_TREES[player.pos].slice(tierMap[tier], tierMap[Number(tier) + 1] || Infinity).some(s => s.name === skillName)
    );

    if (skillTier && currentUpgrades < tierMap[skillTier]) {
        console.warn(`Tier ${skillTier} prerequisite not met. Need ${tierMap[skillTier]} upgrades.`);
        return false;
    }
    
    // 1. Spend the points
    player.progression.skillPoints -= skill.cost;
    
    // 2. Apply rating boosts
    let ovrGained = 0;
    for (const [rating, boost] of Object.entries(skill.boosts)) {
      if (player.ratings[rating] !== undefined) {
        player.ratings[rating] = Math.min(99, player.ratings[rating] + boost);
        ovrGained += boost * 0.5; // Rough estimate of OVR impact
      }
    }
    
    // 3. Record the upgrade
    player.progression.upgrades.push(skillName);
    
    // 4. Update the progression OVR bonus (This keeps the OVR tied to the tree)
    player.progression.treeOvrBonus += ovrGained;

    // 5. Recalculate Overall Rating
    // Assuming calculateOvr is globally available from fixes.js
    if (window.calculateOvr) {
      player.ovr = window.calculateOvr(player.pos, player.ratings);
    }
    
    console.log(`✅ ${player.name} upgraded to '${skillName}' for ${skill.cost} SP.`);
    return true;
  }

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  /**
   * Generate college name
   */
  function generateCollege() {
    const colleges = [
      'Alabama', 'Ohio State', 'Georgia', 'Clemson', 'Oklahoma', 'LSU', 'Florida',
      'Michigan', 'Penn State', 'Texas', 'Notre Dame', 'USC', 'Oregon', 'Wisconsin',
      'Iowa', 'Miami', 'Florida State', 'Auburn', 'Tennessee', 'Kentucky', 'Utah',
      'TCU', 'Baylor', 'Oklahoma State', 'Michigan State', 'Nebraska', 'UCLA'
    ];
    
    return U ? U.choice(colleges) : colleges[0];
  }

  /**
   * Create a fallback player if main creation fails
   */
  function createFallbackPlayer(pos, age, ovr) {
    if (!U || !C) {
      return {
        id: 'fallback_' + Date.now(),
        name: 'Unknown Player',
        pos: pos || 'QB',
        age: age || 25,
        ovr: ovr || 60,
        ratings: {},
        years: 1,
        yearsTotal: 1,
        baseAnnual: 1.0,
        signingBonus: 0,
        guaranteedPct: 0.5,
        injuryWeeks: 0,
        fatigue: 0,
        abilities: [],
        stats: { game: {}, season: {}, career: {} },
        history: [],
        awards: []
      };
    }

    // Use player-factory fallback logic
    const playerOvr = typeof ovr === 'number' ? ovr : U.rand(60, 85);
    const playerAge = typeof age === 'number' ? age : U.rand(21, 35);

    return {
      id: U.id(),
      name: (U.choice(window.EXPANDED_FIRST_NAMES || ['John']) || 'John') + ' ' + (U.choice(window.EXPANDED_LAST_NAMES || ['Smith']) || 'Smith'),
      pos: pos,
      age: playerAge,
      ovr: playerOvr,
      years: U.rand(1, 4),
      yearsTotal: U.rand(1, 4),
      // FIXED: Realistic salary based on OVR (for createRookiePlayer function)
      baseAnnual: playerOvr >= 90 ? U.rand(20, 35) : 
                 playerOvr >= 80 ? U.rand(8, 20) : 
                 playerOvr >= 70 ? U.rand(3, 8) : 
                 playerOvr >= 60 ? U.rand(1, 3) : U.rand(0.5, 1),
      signingBonus: 0,
      guaranteedPct: 0.5,
      ratings: generateBasicRatings(pos, playerOvr),
      abilities: [],
      college: generateCollege(),
      fatigue: 0,
      stats: { game: {}, season: {}, career: {} },
      history: [],
      awards: []
    };
  }

  /**
   * Generate basic ratings for position if detailed function not available
   */
  function generateBasicRatings(pos, baseOvr) {
    const variance = 8; // +/- variance from base
    
    const ratings = {};
    const allStats = [
      'throwPower', 'throwAccuracy', 'awareness', 'catching', 'catchInTraffic',
      'acceleration', 'speed', 'agility', 'trucking', 'juking', 'passRushSpeed',
      'passRushPower', 'runStop', 'coverage', 'runBlock', 'passBlock',
      'intelligence', 'kickPower', 'kickAccuracy'
    ];
    
    allStats.forEach(stat => {
      ratings[stat] = U ? U.clamp(baseOvr + U.rand(-variance, variance), 40, 99) : baseOvr;
    });
    
    return ratings;
  }

  // ============================================================================
  // DEPTH CHART SYSTEM (NEW)
  // ============================================================================

  /**
   * Initialize depth chart properties for a player
   * @param {Object} player - Player object
   * @param {Object} team - Team object (optional, for chemistry calculation)
   */
  function initializeDepthChartStats(player, team = null) {
    if (!player.depthChart) {
      player.depthChart = {
        playbookKnowledge: 50, // 0-100, how well player knows the playbook
        chemistry: 50, // 0-100, chemistry with teammates
        depthPosition: null, // Current depth position (1 = starter, 2 = backup, etc.)
        preferredPosition: player.pos, // Player's natural position
        versatility: 0, // Can play multiple positions (0-100)
        practiceReps: 0, // Number of practice reps this week
        lastUpdated: (window.state?.league?.year) || 2025
      };
    }

    // Initialize chemistry with teammates if team provided
    if (team && !player.depthChart.chemistryWith) {
      player.depthChart.chemistryWith = {};
      if (team.roster) {
        team.roster.forEach(teammate => {
          if (teammate.id !== player.id) {
            // Chemistry starts neutral, improves over time
            player.depthChart.chemistryWith[teammate.id] = {
              value: 50,
              seasonsTogether: 0,
              positionGroup: getPositionGroup(player.pos) === getPositionGroup(teammate.pos) ? 'same' : 'different'
            };
          }
        });
      }
    }
  }

  /**
   * Get position group (Offense, Defense, Special Teams)
   * @param {string} pos - Player position
   * @returns {string} Position group
   */
  function getPositionGroup(pos) {
    const offense = ['QB', 'RB', 'WR', 'TE', 'OL'];
    const defense = ['DL', 'LB', 'CB', 'S'];
    const special = ['K', 'P'];
    
    if (offense.includes(pos)) return 'offense';
    if (defense.includes(pos)) return 'defense';
    if (special.includes(pos)) return 'special';
    return 'unknown';
  }

  /**
   * Calculate effective rating for depth chart decisions
   * Combines OVR, playbook knowledge, chemistry, and other factors
   * @param {Object} player - Player object
   * @param {Object} team - Team object
   * @param {string} position - Position being evaluated for
   * @returns {number} Effective rating (0-99)
   */
  function calculateEffectiveRating(player, team, position = null) {
    if (!player) return 0;
    
    initializeDepthChartStats(player, team);
    const dc = player.depthChart;
    
    // Base overall rating
    let effectiveRating = player.ovr || 50;
    
    // Position mismatch penalty (if playing out of position)
    const targetPos = position || player.pos;
    if (targetPos !== player.pos && targetPos !== dc.preferredPosition) {
      const positionPenalty = calculatePositionMismatchPenalty(player.pos, targetPos);
      effectiveRating -= positionPenalty;
    }
    
    // Playbook knowledge modifier (0-20 point impact)
    const playbookModifier = (dc.playbookKnowledge - 50) * 0.4; // -20 to +20
    effectiveRating += playbookModifier;
    
    // Chemistry modifier (0-15 point impact)
    const chemistryModifier = calculateChemistryBonus(player, team);
    effectiveRating += chemistryModifier;
    
    // Practice reps bonus (0-5 point impact)
    const practiceBonus = Math.min(5, dc.practiceReps * 0.1);
    effectiveRating += practiceBonus;
    
    // Injury/fatigue penalty
    if (player.injuryWeeks > 0) {
      effectiveRating -= Math.min(20, player.injuryWeeks * 5);
    }
    if (player.fatigue > 70) {
      effectiveRating -= Math.min(10, (player.fatigue - 70) * 0.3);
    }
    
    // Age/experience bonus for veterans (0-3 points)
    if (player.age >= 28 && player.age <= 32) {
      effectiveRating += 2; // Prime years
    } else if (player.age > 32) {
      effectiveRating -= Math.min(5, (player.age - 32) * 0.5); // Decline
    }
    
    return Math.max(0, Math.min(99, Math.round(effectiveRating)));
  }

  /**
   * Calculate penalty for playing out of position
   * @param {string} naturalPos - Player's natural position
   * @param {string} targetPos - Position they're being evaluated for
   * @returns {number} Penalty value (0-30)
   */
  function calculatePositionMismatchPenalty(naturalPos, targetPos) {
    // Some positions are more versatile
    const versatilityMap = {
      'OL': { 'OL': 0 }, // All OL positions are similar
      'DL': { 'DL': 0, 'LB': 5 }, // DL can sometimes play LB
      'LB': { 'LB': 0, 'DL': 8, 'CB': 12 },
      'CB': { 'CB': 0, 'S': 5 }, // CB and S are similar
      'S': { 'S': 0, 'CB': 5 },
      'WR': { 'WR': 0, 'TE': 8 },
      'TE': { 'TE': 0, 'WR': 10 },
      'RB': { 'RB': 0, 'WR': 15 },
      'QB': { 'QB': 0 } // QB is unique
    };
    
    const map = versatilityMap[naturalPos] || {};
    return map[targetPos] !== undefined ? map[targetPos] : 25; // Default high penalty
  }

  /**
   * Calculate chemistry bonus for a player based on teammates
   * @param {Object} player - Player object
   * @param {Object} team - Team object
   * @returns {number} Chemistry bonus (-15 to +15)
   */
  function calculateChemistryBonus(player, team) {
    if (!team || !team.roster) return 0;
    
    initializeDepthChartStats(player, team);
    const dc = player.depthChart;
    
    let totalChemistry = 0;
    let chemistryCount = 0;
    
    // Calculate average chemistry with starters at same position group
    const positionGroup = getPositionGroup(player.pos);
    const starters = getStartersAtPositionGroup(team, positionGroup);
    
    starters.forEach(starter => {
      if (starter.id !== player.id && dc.chemistryWith && dc.chemistryWith[starter.id]) {
        const chem = dc.chemistryWith[starter.id];
        totalChemistry += chem.value;
        chemistryCount++;
      }
    });
    
    if (chemistryCount === 0) return 0;
    
    const avgChemistry = totalChemistry / chemistryCount;
    // Convert 0-100 chemistry to -15 to +15 modifier
    return ((avgChemistry - 50) / 50) * 15;
  }

  /**
   * Get starters at a specific position group
   * @param {Object} team - Team object
   * @param {string} positionGroup - Position group ('offense', 'defense', 'special')
   * @returns {Array} Array of starter players
   */
  function getStartersAtPositionGroup(team, positionGroup) {
    if (!team || !team.roster) return [];
    
    // Get depth chart if available
    const depthChart = team.depthChart || {};
    const starters = [];
    
    team.roster.forEach(player => {
      if (getPositionGroup(player.pos) === positionGroup) {
        const dc = player.depthChart || {};
        if (dc.depthPosition === 1 || !dc.depthPosition) { // Starter or no depth chart set
          starters.push(player);
        }
      }
    });
    
    return starters;
  }

  /**
   * Update playbook knowledge for a player
   * Increases with practice, games played, and time with team
   * @param {Object} player - Player object
   * @param {Object} team - Team object
   * @param {number} weeksWithTeam - Number of weeks player has been with team
   */
  function updatePlaybookKnowledge(player, team, weeksWithTeam = 0) {
    initializeDepthChartStats(player, team);
    const dc = player.depthChart;
    
    // Base increase per week (slower for complex positions)
    const complexityMap = {
      'QB': 0.5, // QBs learn playbook slower
      'OL': 0.4, // OL needs coordination
      'LB': 0.6,
      'CB': 0.7,
      'S': 0.7,
      'DL': 0.8,
      'RB': 1.0,
      'WR': 0.9,
      'TE': 0.8,
      'K': 1.5, // Kickers learn quickly
      'P': 1.5
    };
    
    const weeklyGain = complexityMap[player.pos] || 0.5;
    const intelligenceBonus = (player.ratings?.intelligence || 50) / 100;
    const practiceBonus = Math.min(2, dc.practiceReps * 0.1);
    
    // Calculate new playbook knowledge
    const newKnowledge = Math.min(100, dc.playbookKnowledge + (weeklyGain * (1 + intelligenceBonus)) + practiceBonus);
    dc.playbookKnowledge = Math.round(newKnowledge);
    
    // Reset practice reps for next week
    dc.practiceReps = 0;
  }

  /**
   * Update chemistry between players
   * Chemistry improves when players play together, practice together, win together
   * @param {Object} player1 - First player
   * @param {Object} player2 - Second player
   * @param {Object} context - Context (game played together, practice, win, etc.)
   */
  function updateChemistry(player1, player2, context = {}) {
    if (!player1 || !player2 || player1.id === player2.id) return;
    
    initializeDepthChartStats(player1);
    initializeDepthChartStats(player2);
    
    const dc1 = player1.depthChart;
    const dc2 = player2.depthChart;
    
    // Initialize chemistry tracking if needed
    if (!dc1.chemistryWith) dc1.chemistryWith = {};
    if (!dc2.chemistryWith) dc2.chemistryWith = {};
    
    if (!dc1.chemistryWith[player2.id]) {
      dc1.chemistryWith[player2.id] = { value: 50, seasonsTogether: 0, positionGroup: 'different' };
    }
    if (!dc2.chemistryWith[player1.id]) {
      dc2.chemistryWith[player1.id] = { value: 50, seasonsTogether: 0, positionGroup: 'different' };
    }
    
    const chem1 = dc1.chemistryWith[player2.id];
    const chem2 = dc2.chemistryWith[player1.id];
    
    // Chemistry gains based on context
    let gain = 0;
    
    if (context.gamePlayed) gain += 0.5; // Playing together builds chemistry
    if (context.practiceTogether) gain += 0.3; // Practice builds chemistry
    if (context.win) gain += 1.0; // Winning together builds strong chemistry
    if (context.playoffGame) gain += 1.5; // Playoff games build more chemistry
    if (context.championship) gain += 3.0; // Championships create bonds
    
    // Same position group builds chemistry faster
    const sameGroup = getPositionGroup(player1.pos) === getPositionGroup(player2.pos);
    if (sameGroup) gain *= 1.5;
    
    // Update both players' chemistry with each other
    chem1.value = Math.min(100, chem1.value + gain);
    chem2.value = Math.min(100, chem2.value + gain);
    
    // Update seasons together
    if (context.seasonEnd) {
      chem1.seasonsTogether++;
      chem2.seasonsTogether++;
    }
  }

  /**
   * Set depth chart position for a player
   * @param {Object} player - Player object
   * @param {number} depthPosition - Depth position (1 = starter, 2 = backup, 3 = 3rd string, etc.)
   * @param {string} position - Position on depth chart (may differ from natural position)
   */
  function setDepthChartPosition(player, depthPosition, position = null) {
    try {
      if (!player) {
        console.error('setDepthChartPosition: player is null or undefined');
        return;
      }
      initializeDepthChartStats(player);
      if (!player.depthChart) {
        player.depthChart = {
          playbookKnowledge: 50,
          chemistry: 50,
          depthPosition: null,
          preferredPosition: player.pos,
          versatility: 0,
          practiceReps: 0,
          lastUpdated: (window.state?.league?.year) || 2025
        };
      }
      player.depthChart.depthPosition = depthPosition;
      if (position) {
        player.depthChart.currentPosition = position;
      }
      player.depthChart.lastUpdated = (window.state?.league?.year) || 2025;
    } catch (error) {
      console.error('Error in setDepthChartPosition:', error, { player: player?.id, depthPosition, position });
      // Don't throw - allow the operation to continue
    }
  }

  /**
   * Auto-generate depth chart based on effective ratings
   * @param {Object} team - Team object
   * @returns {Object} Depth chart object
   */
  function generateDepthChart(team) {
    if (!team || !team.roster) return {};
    
    const depthChart = {};
    
    // Group players by position
    const byPosition = {};
    team.roster.forEach(player => {
      initializeDepthChartStats(player, team);
      const pos = player.pos;
      if (!byPosition[pos]) {
        byPosition[pos] = [];
      }
      byPosition[pos].push(player);
    });
    
    // Sort each position by effective rating and assign depth
    Object.keys(byPosition).forEach(pos => {
      const players = byPosition[pos];
      
      // Calculate effective rating for each player
      players.forEach(player => {
        player._effectiveRating = calculateEffectiveRating(player, team, pos);
      });
      
      // Sort by effective rating (descending)
      players.sort((a, b) => {
        if (b._effectiveRating !== a._effectiveRating) {
          return b._effectiveRating - a._effectiveRating;
        }
        // Tiebreaker: use base OVR
        return (b.ovr || 0) - (a.ovr || 0);
      });
      
      // Assign depth positions
      players.forEach((player, index) => {
        setDepthChartPosition(player, index + 1, pos);
        depthChart[pos] = depthChart[pos] || [];
        depthChart[pos].push({
          playerId: player.id,
          playerName: player.name,
          depthPosition: index + 1,
          effectiveRating: player._effectiveRating,
          ovr: player.ovr,
          playbookKnowledge: player.depthChart.playbookKnowledge,
          chemistry: player.depthChart.chemistry || 50
        });
      });
      
      // Clean up temporary rating
      players.forEach(player => {
        delete player._effectiveRating;
      });
    });
    
    team.depthChart = depthChart;
    return depthChart;
  }

  /**
   * Render depth chart UI
   * @param {Object} team - Team object
   * @returns {string} HTML string for depth chart
   */
  function renderDepthChart(team) {
    if (!team || !team.roster) return '<p>No roster available</p>';
    
    // Only generate depth chart if it doesn't exist or is empty
    // This preserves manual adjustments
    let depthChart = team.depthChart;
    if (!depthChart || Object.keys(depthChart).length === 0) {
      depthChart = generateDepthChart(team);
    } else {
      // Update effective ratings without changing order
      Object.keys(depthChart).forEach(pos => {
        const entries = depthChart[pos] || [];
        entries.forEach(entry => {
          const player = team.roster.find(p => p.id === entry.playerId);
          if (player) {
            entry.effectiveRating = calculateEffectiveRating(player, team, pos);
            entry.ovr = player.ovr;
            entry.playbookKnowledge = player.depthChart?.playbookKnowledge || 50;
            entry.chemistry = player.depthChart?.chemistry || 50;
          }
        });
      });
    }
    
    const positions = C.POSITIONS || ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];
    
    let html = '<div class="depth-chart-container">';
    html += '<h3>Depth Chart</h3>';
    html += '<div class="depth-chart-grid">';
    
    positions.forEach(pos => {
      const depth = depthChart[pos] || [];
      if (depth.length === 0) return;
      
      html += `<div class="depth-position-group">`;
      html += `<h4>${pos}</h4>`;
      html += '<div class="depth-list">';
      
      depth.forEach((entry, index) => {
        const player = team.roster.find(p => p.id === entry.playerId);
        if (!player) return;
        
        const dc = player.depthChart || {};
        const isStarter = entry.depthPosition === 1;
        const starterClass = isStarter ? 'starter' : 'backup';
        
        html += `<div class="depth-entry ${starterClass}" data-player-id="${entry.playerId}" data-position="${pos}">`;
        html += `<div class="depth-rank">${entry.depthPosition}</div>`;
        html += `<div class="depth-info">`;
        html += `<div class="depth-name">${entry.playerName}</div>`;
        html += `<div class="depth-stats">`;
        html += `<span class="stat">OVR: ${entry.ovr}</span>`;
        html += `<span class="stat">Eff: ${entry.effectiveRating}</span>`;
        html += `<span class="stat">PB: ${dc.playbookKnowledge || 50}%</span>`;
        html += `<span class="stat">Chem: ${dc.chemistry || 50}%</span>`;
        html += `</div>`;
        html += `</div>`;
        html += `<div class="depth-actions">`;
        // Use number directly in onclick to avoid string conversion issues
        html += `<button class="btn btn-sm" onclick="if(window.movePlayerDepth) { window.movePlayerDepth(${entry.playerId}, '${pos}', ${entry.depthPosition - 1}); } else { console.error('movePlayerDepth not available'); }" ${entry.depthPosition === 1 ? 'disabled' : ''}>↑</button>`;
        html += `<button class="btn btn-sm" onclick="if(window.movePlayerDepth) { window.movePlayerDepth(${entry.playerId}, '${pos}', ${entry.depthPosition + 1}); } else { console.error('movePlayerDepth not available'); }" ${entry.depthPosition >= depth.length ? 'disabled' : ''}>↓</button>`;
        html += `</div>`;
        html += `</div>`;
      });
      
      html += '</div>';
      html += '</div>';
    });
    
    html += '</div>';
    html += '</div>';
    
    return html;
  }

  /**
   * Move player up or down in depth chart
   * @param {string} playerId - Player ID
   * @param {string} position - Position
   * @param {number} newDepth - New depth position
   */
  window.movePlayerDepth = function(playerId, position, newDepth) {
    try {
      const team = window.currentTeam ? window.currentTeam() : (window.state?.league?.teams?.[window.state?.userTeamId]);
      if (!team || !team.roster) {
        console.error('No team found for depth chart move');
        return;
      }
      
      // Ensure depth chart exists
      if (!team.depthChart) {
        generateDepthChart(team);
      }
      
      const depthChart = team.depthChart || {};
      const positionDepth = depthChart[position] || [];
      
      if (positionDepth.length === 0) {
        console.error(`No players at position ${position}`);
        return;
      }
      
      // Convert playerId to number if it's a string
      const searchId = typeof playerId === 'string' ? parseInt(playerId) : playerId;
      const player = team.roster.find(p => p.id === searchId || p.id === playerId);
      if (!player) {
        console.error(`Player ${playerId} not found`);
        return;
      }
      
      // Validate new depth
      if (newDepth < 1 || newDepth > positionDepth.length) {
        console.error(`Invalid depth position ${newDepth} (range: 1-${positionDepth.length})`);
        return;
      }
      
      // Find current position
      const currentIndex = positionDepth.findIndex(e => {
        const eId = typeof e.playerId === 'string' ? parseInt(e.playerId) : e.playerId;
        return eId === searchId || e.playerId === playerId;
      });
      
      const targetIndex = newDepth - 1;
      
      if (currentIndex === -1) {
        console.error(`Player ${playerId} not found in depth chart at position ${position}`);
        return;
      }
      
      if (currentIndex === targetIndex) {
        return; // Already at that position
      }
      
      // Swap entries
      const temp = positionDepth[currentIndex];
      positionDepth[currentIndex] = positionDepth[targetIndex];
      positionDepth[targetIndex] = temp;
      
      // Update depth positions in entries and player objects
      positionDepth.forEach((entry, index) => {
        try {
          const eId = typeof entry.playerId === 'string' ? parseInt(entry.playerId) : entry.playerId;
          const p = team.roster.find(pl => pl && (pl.id === eId || pl.id === entry.playerId));
          if (p) {
            setDepthChartPosition(p, index + 1, position);
            entry.depthPosition = index + 1;
          } else {
            console.warn(`Player not found for depth chart entry: ${entry.playerId}`);
          }
        } catch (error) {
          console.error('Error updating depth position:', error, { entry, index });
        }
      });
      
      // DO NOT regenerate depth chart - preserve manual adjustments
      // Only update the depth chart object reference
      team.depthChart = depthChart;
      
      // Refresh UI
      const depthChartContainer = document.getElementById('depthChartContainer');
      if (depthChartContainer && window.renderDepthChart) {
        depthChartContainer.innerHTML = window.renderDepthChart(team);
      }
      
      // Also refresh roster table if it exists
      if (window.renderRoster) {
        window.renderRoster();
      }
      
      if (window.setStatus) {
        window.setStatus(`${player.name} moved to depth position ${newDepth} at ${position}`, 'success');
      }
    } catch (error) {
      console.error('Error in movePlayerDepth:', error);
      if (window.setStatus) {
        window.setStatus(`Error moving player: ${error.message}`, 'error');
      }
    }
  };

  /**
   * Add practice reps to improve playbook knowledge
   * @param {Object} player - Player object
   * @param {number} reps - Number of practice reps
   */
  function addPracticeReps(player, reps = 1) {
    initializeDepthChartStats(player);
    player.depthChart.practiceReps = (player.depthChart.practiceReps || 0) + reps;
  }

  /**
   * Process weekly depth chart updates (playbook knowledge, chemistry)
   * @param {Object} team - Team object
   */
  function processWeeklyDepthChartUpdates(team) {
    if (!team || !team.roster) return;
    
    const L = window.state?.league;
    const currentWeek = L?.week || 1;
    
    team.roster.forEach(player => {
      initializeDepthChartStats(player, team);
      
      // Update playbook knowledge
      const weeksWithTeam = calculateWeeksWithTeam(player, team);
      updatePlaybookKnowledge(player, team, weeksWithTeam);
      
      // Update chemistry with teammates (gradual improvement)
      team.roster.forEach(teammate => {
        if (teammate.id !== player.id) {
          const sameGroup = getPositionGroup(player.pos) === getPositionGroup(teammate.pos);
          if (sameGroup || Math.random() < 0.1) { // 10% chance to improve chemistry with any teammate
            updateChemistry(player, teammate, {
              practiceTogether: true,
              gamePlayed: player.stats?.game && Object.keys(player.stats.game).length > 0
            });
          }
        }
      });
    });
  }

  /**
   * Calculate how many weeks a player has been with the team
   * @param {Object} player - Player object
   * @param {Object} team - Team object
   * @returns {number} Weeks with team
   */
  function calculateWeeksWithTeam(player, team) {
    // Simplified: check player history or use a default
    if (player.history && player.history.length > 0) {
      const teamHistory = player.history.filter(h => h.team === team.abbr);
      return teamHistory.length * 17; // Approximate: 1 season = 17 weeks
    }
    return 17; // Default: assume 1 season
  }

  // ============================================================================
  // MAIN PLAYER CREATION (from player.js)
  // ============================================================================

  /**
   * Creates a new player object with all ratings and attributes
   * @param {string} pos - Player position (QB, RB, etc.)
   * @param {number} age - Optional age override
   * @param {number} ovr - Optional overall override
   * @returns {Object} Complete player object
   */
  function makePlayer(pos, age = null, ovr = null) {
    if (!U || !C) {
      throw new Error('Utils and Constants must be loaded to create players');
    }

    try {
      const playerAge = age || U.rand(C.PLAYER_CONFIG.MIN_AGE, C.PLAYER_CONFIG.MAX_AGE);
      
      // Use functions from fixes.js if available, otherwise use local fallbacks
      const ratings = window.generatePlayerRatings ? window.generatePlayerRatings(pos) : generateBasicRatings(pos, ovr || 70);
      const playerOvr = ovr || (window.calculateOvr ? window.calculateOvr(pos, ratings) : (ovr || 70));
      // Use fixed contract generation that creates realistic salaries
      // Always use window.generateContract if available (from fixes.js with corrected salaries)
      const contractDetails = window.generateContract ? window.generateContract(playerOvr, pos) : {
        years: U.rand(1, 4),
        // FIXED: Reduced salary ranges to fit within $220M cap
        // With ~35 players, average should be ~$6M, but most are depth players
        baseAnnual: playerOvr >= 90 ? U.rand(12, 22) : 
                   playerOvr >= 80 ? U.rand(4, 12) : 
                   playerOvr >= 70 ? U.rand(1.5, 5) : 
                   playerOvr >= 60 ? U.rand(0.6, 2) : U.rand(0.4, 0.8),
        signingBonus: 0,
        guaranteedPct: 0.5
      };
      const playerName = window.generatePlayerName ? window.generatePlayerName() : 
        (U.choice(window.EXPANDED_FIRST_NAMES || ['John']) + ' ' + U.choice(window.EXPANDED_LAST_NAMES || ['Smith']));

      const player = {
        id: U.id(),
        name: playerName,
        pos: pos,
        age: playerAge,
        ratings: ratings,
        ovr: playerOvr,
        years: contractDetails.years,
        yearsTotal: contractDetails.yearsTotal || contractDetails.years, // Ensure yearsTotal is set for proration
        baseAnnual: contractDetails.baseAnnual,
        signingBonus: contractDetails.signingBonus || 0,
        guaranteedPct: contractDetails.guaranteedPct || 0.5,

        // Player status
        injuryWeeks: 0,
        fatigue: 0,
        morale: U.rand(70, 95),

        // Progression: Use DEV TRAITS and POTENTIAL
        devTrait: U.choice(['Normal', 'Star', 'Superstar', 'X-Factor']),
        potential: Math.min(99, playerOvr + U.rand(0, 15 - Math.max(0, playerAge - 21))),

        // Collections
        abilities: [],
        awards: [],

        // Statistics tracking
        stats: {
          game: {},
          season: {},
          career: {}
        },

        // History
        history: [],

        // Physical attributes
        college: generateCollege()
      };

      // Initialize the new progression/skill tree tracking
      initProgressionStats(player);

      // Initialize depth chart stats
      initializeDepthChartStats(player);

      // Add position-specific abilities (from fixes.js)
      if (window.tagAbilities) {
        window.tagAbilities(player);
      }

      return player;

    } catch (error) {
      console.error('Error creating player:', error);
      // Return a basic fallback player
      return createFallbackPlayer(pos, age, ovr);
    }
  }

  /**
   * Player progression system (Updated for XP/SP)
   * @param {Object} player - Player to progress
   * @returns {Object} Updated player
   */
  function progressPlayer(player) {
    if (!player) return player;

    try {
      // Age progression
      player.age++;

      // Check for retirement
      if (player.age > (C.HALL_OF_FAME?.FORCED_RETIREMENT_AGE || 38)) {
        player.retired = true;
        return player;
      }

      // ----------------------------------------------------
      // 🔄 CORE PROGRESSION/REGRESSION LOGIC (Updated)
      // ----------------------------------------------------

      const peakAge = C.PLAYER_CONFIG?.PEAK_AGES?.[player.pos] || 27;
      const peakRegressionStart = peakAge + 4; // Start slow decline after 4 peak years
      const devBonus = { 'Normal': 0, 'Star': 3, 'Superstar': 5, 'X-Factor': 8 }[player.devTrait] || 0;

      let declineFactor = 0;
      if (player.age > peakRegressionStart) {
        declineFactor = (player.age - peakRegressionStart) * 0.05; // 5% chance increase per year over peak
      }

      // Auto-progress based on dev trait (even without spending SP)
      if (player.ovr < player.potential) {
          // Smaller, passive gain for players below potential, scaled by dev trait
          const passiveGainChance = 10 + devBonus * 2;
          if (U.rand(1, 100) <= passiveGainChance) {
              const improvements = U.rand(1, Math.min(3, devBonus));
              for (let i = 0; i < improvements; i++) {
                  const statToImprove = U.choice(Object.keys(player.ratings));
                  if (player.ratings[statToImprove] < 99) {
                      player.ratings[statToImprove] = Math.min(99, player.ratings[statToImprove] + U.rand(1, 2));
                  }
              }
          }
      }

      // Age-related decline
      const declineChance = U.clamp(Math.round(declineFactor * 100), 0, 50); // Max 50% chance of decline
      if (U.rand(1, 100) <= declineChance) {
        // Decline in 1-2 ratings, but Superstar/X-Factor decline slower
        const declines = U.rand(1, 2);
        for (let i = 0; i < declines; i++) {
          const statToDecline = U.choice(Object.keys(player.ratings));
          // Decline is less severe for higher dev traits
          const declineAmount = (player.devTrait === 'X-Factor') ? 1 : U.rand(1, 2);
          if (player.ratings[statToDecline] > 40) {
            player.ratings[statToDecline] = Math.max(40, player.ratings[statToDecline] - declineAmount);
          }
        }
      }

      // Recalculate overall after passive progression/regression
      if (window.calculateOvr) {
        player.ovr = window.calculateOvr(player.pos, player.ratings);
      }

      // Re-tag abilities based on new ratings
      if (window.tagAbilities) {
        window.tagAbilities(player);
      }

      return player;

    } catch (error) {
      console.error('Error progressing player:', error);
      return player;
    }
  }

  // ============================================================================
  // PLAYER LEGACY SYSTEM (from player.legacy.js)
  // ============================================================================

  /**
   * Initialize enhanced player statistics and legacy tracking
   * @param {Object} player - Player object
   * @returns {Object} Player with initialized legacy stats
   */
  function initializePlayerLegacy(player) {
    if (!player) return null;
    
    if (!player.legacy) {
      player.legacy = {
        // Career milestones
        milestones: [],
        
        // Career achievements
        achievements: [],
        
        // All-time rankings (within team and league)
        rankings: {
          team: {},
          league: {}
        },
        
        // Contract history
        contractHistory: [],
        
        // Team history
        teamHistory: [],
        
        // Playoff performance
        playoffStats: {
          games: 0,
          wins: 0,
          losses: 0,
          stats: {}
        },
        
        // Awards and recognitions
        awards: {
          playerOfYear: 0,
          allPro: 0,
          proBowl: 0,
          rookie: 0,
          comeback: 0,
          other: []
        },
        
        // Records held
        records: {
          team: [],
          league: []
        },
        
        // Legacy metrics
        metrics: {
          impactScore: 0,        // Overall impact on games/seasons
          clutchScore: 0,        // Performance in crucial moments
          longevityScore: 0,     // Career length and consistency
          peakScore: 0,          // Best season performance
          legacyScore: 0         // Overall legacy rating
        },
        
        // Notable games/performances
        notablePerformances: [],
        
        // Injuries and durability
        healthRecord: {
          gamesPlayed: 0,
          gamesMissed: 0,
          majorInjuries: [],
          durabilityRating: 100
        },
        
        // Hall of Fame tracking
        hallOfFame: {
          eligible: false,
          inducted: false,
          eligibilityYear: 0,
          votingHistory: []
        }
      };
    }
    
    // Enhanced stats tracking if not present
    if (!player.stats.career.advanced) {
      player.stats.career.advanced = {
        // Passing (QB)
        qbRating: 0,
        completionPct: 0,
        yardsPerAttempt: 0,
        touchdownPct: 0,
        interceptionPct: 0,
        
        // Rushing (RB/QB)
        yardsPerCarry: 0,
        rushingTouchdowns: 0,
        fumbles: 0,
        
        // Receiving (WR/TE/RB)
        receptionsPerGame: 0,
        yardsPerReception: 0,
        catchPct: 0,
        droppedPasses: 0,
        
        // Defense
        tacklesPerGame: 0,
        sacks: 0,
        interceptions: 0,
        forcedFumbles: 0,
        defensiveScore: 0,
        
        // Special Teams
        kickingPct: 0,
        fieldGoalLong: 0,
        puntAverage: 0,
        
        // Advanced metrics
        winShares: 0,           // Player's contribution to team wins
        gameScore: 0,           // Average game impact
        clutchPerformance: 0,   // Performance in close games
        rivalryPerformance: 0   // Performance vs rivals
      };
    }
    
    return player;
  }

  /**
   * Update player statistics after a game
   * @param {Object} player - Player object
   * @param {Object} gameStats - Game statistics
   * @param {Object} gameContext - Game context (playoff, rivalry, etc.)
   */
  function updatePlayerGameLegacy(player, gameStats, gameContext = {}) {
    if (!player || !gameStats) return;
    
    try {
      initializePlayerLegacy(player);
      
      // Update health record
      if (gameStats.injured) {
        player.legacy.healthRecord.gamesMissed++;
        if (gameStats.majorInjury) {
          player.legacy.healthRecord.majorInjuries.push({
            year: gameContext.year || (window.state?.league?.year) || 2025,
            injury: gameStats.injury || 'Unknown',
            weeksOut: gameStats.weeksOut || 1
          });
        }
      } else {
        player.legacy.healthRecord.gamesPlayed++;
      }
      
      // Update durability rating
      const totalGames = player.legacy.healthRecord.gamesPlayed + player.legacy.healthRecord.gamesMissed;
      if (totalGames > 0) {
        player.legacy.healthRecord.durabilityRating = 
          Math.round((player.legacy.healthRecord.gamesPlayed / totalGames) * 100);
      }
      
      // Track notable performances
      checkForNotablePerformance(player, gameStats, gameContext);
      
      // Update playoff stats if playoff game
      if (gameContext.isPlayoff) {
        updatePlayoffStats(player, gameStats, gameContext);
      }
      
      // Update clutch performance tracking
      if (gameContext.clutchSituation) {
        updateClutchStats(player, gameStats, gameContext);
      }
      
      // Check for milestones
      checkCareerMilestones(player);
      
    } catch (error) {
      console.error('Error updating player game legacy:', error);
    }
  }

  /**
   * Update player statistics at end of season
   * @param {Object} player - Player object
   * @param {Object} seasonStats - Season statistics
   * @param {Object} team - Team object
   * @param {number} year - Season year
   */
  function updatePlayerSeasonLegacy(player, seasonStats, team, year) {
    if (!player || !seasonStats || !team) return;
    
    try {
      initializePlayerLegacy(player);
      
      // Add season to team history
      const teamSeason = {
        year: year,
        team: team.abbr,
        teamName: team.name,
        stats: { ...seasonStats },
        teamRecord: {
          wins: team.wins || 0,
          losses: team.losses || 0,
          ties: team.ties || 0
        },
        playoffAppearance: seasonStats.madePlayoffs || false,
        championships: seasonStats.championships || []
      };
      
      player.legacy.teamHistory.push(teamSeason);
      
      // Check for season awards
      checkSeasonAwards(player, seasonStats, team, year);
      
      // Update advanced career statistics
      updateAdvancedStats(player, seasonStats);
      
      // Calculate impact metrics
      calculateImpactMetrics(player, seasonStats, team, year);
      
      // Check for records
      checkPlayerRecords(player, seasonStats, team, year);
      
      // Update legacy score
      calculateLegacyScore(player);
      
    } catch (error) {
      console.error('Error updating player season legacy:', error);
    }
  }

  /**
   * Check for notable individual game performances
   * @param {Object} player - Player object
   * @param {Object} gameStats - Game statistics
   * @param {Object} gameContext - Game context
   */
  function checkForNotablePerformance(player, gameStats, gameContext) {
    const notable = [];
    
    // Position-specific notable performances
    if (player.pos === 'QB') {
      if (gameStats.passYd >= 400) notable.push('400+ Passing Yards');
      if (gameStats.passTD >= 5) notable.push('5+ Passing TDs');
      if (gameStats.passYd >= 300 && gameStats.rushYd >= 100) notable.push('300 Pass + 100 Rush');
    } else if (player.pos === 'RB') {
      if (gameStats.rushYd >= 200) notable.push('200+ Rushing Yards');
      if (gameStats.rushTD >= 4) notable.push('4+ Rushing TDs');
      if (gameStats.rushYd >= 100 && gameStats.recYd >= 100) notable.push('100 Rush + 100 Rec');
    } else if (player.pos === 'WR' || player.pos === 'TE') {
      if (gameStats.recYd >= 200) notable.push('200+ Receiving Yards');
      if (gameStats.recTD >= 3) notable.push('3+ Receiving TDs');
      if (gameStats.receptions >= 15) notable.push('15+ Receptions');
    }
    
    // Add notable performances
    if (notable.length > 0) {
      player.legacy.notablePerformances.push({
        year: gameContext.year || state.league?.year || 2025,
        week: gameContext.week || 1,
        opponent: gameContext.opponent || 'Unknown',
        performances: notable,
        isPlayoff: gameContext.isPlayoff || false,
        gameWon: gameContext.teamWon || false
      });
    }
  }

  /**
   * Update playoff statistics
   * @param {Object} player - Player object
   * @param {Object} gameStats - Game statistics
   * @param {Object} gameContext - Game context
   */
  function updatePlayoffStats(player, gameStats, gameContext) {
    const playoffs = player.legacy.playoffStats;
    
    playoffs.games++;
    if (gameContext.teamWon) {
      playoffs.wins++;
    } else {
      playoffs.losses++;
    }
    
    // Add to playoff stats
    Object.keys(gameStats).forEach(stat => {
      if (typeof gameStats[stat] === 'number') {
        playoffs.stats[stat] = (playoffs.stats[stat] || 0) + gameStats[stat];
      }
    });
  }

  /**
   * Update clutch performance tracking
   * @param {Object} player - Player object
   * @param {Object} gameStats - Game statistics
   * @param {Object} gameContext - Game context
   */
  function updateClutchStats(player, gameStats, gameContext) {
    // Track performance in crucial moments
    const clutchValue = calculateClutchValue(gameStats, gameContext);
    
    const currentClutch = player.legacy.metrics.clutchScore || 0;
    player.legacy.metrics.clutchScore = (currentClutch + clutchValue) / 2;
  }

  /**
   * Calculate clutch value for a performance
   * @param {Object} gameStats - Game statistics
   * @param {Object} gameContext - Game context
   * @returns {number} Clutch value (0-100)
   */
  function calculateClutchValue(gameStats, gameContext) {
    let clutchValue = 50; // Base value
    
    // Game situation modifiers
    if (gameContext.gameWinning) clutchValue += 30;
    if (gameContext.gameTying) clutchValue += 20;
    if (gameContext.fourthQuarter) clutchValue += 15;
    if (gameContext.overtime) clutchValue += 25;
    if (gameContext.isPlayoff) clutchValue += 20;
    
    return Math.max(0, Math.min(100, clutchValue));
  }

  /**
   * Check for career milestones
   * @param {Object} player - Player object
   */
  function checkCareerMilestones(player) {
    if (!player.stats.career) return;
    
    const career = player.stats.career;
    const milestones = player.legacy.milestones;
    
    // Define milestone thresholds
    const milestoneSets = {
      QB: [
        { stat: 'passYd', thresholds: [5000, 10000, 20000, 30000, 40000, 50000, 60000, 70000], suffix: 'Passing Yards' },
        { stat: 'passTD', thresholds: [50, 100, 200, 300, 400, 500], suffix: 'Passing TDs' },
        { stat: 'passComp', thresholds: [1000, 2000, 3000, 4000, 5000], suffix: 'Completions' }
      ],
      RB: [
        { stat: 'rushYd', thresholds: [1000, 5000, 10000, 15000, 20000], suffix: 'Rushing Yards' },
        { stat: 'rushTD', thresholds: [10, 25, 50, 100, 150], suffix: 'Rushing TDs' },
        { stat: 'rushAtt', thresholds: [500, 1000, 2000, 3000], suffix: 'Rushing Attempts' }
      ],
      WR: [
        { stat: 'recYd', thresholds: [1000, 5000, 10000, 15000, 20000], suffix: 'Receiving Yards' },
        { stat: 'receptions', thresholds: [100, 500, 1000, 1500], suffix: 'Receptions' },
        { stat: 'recTD', thresholds: [10, 25, 50, 100, 150], suffix: 'Receiving TDs' }
      ]
    };
    
    const playerMilestones = milestoneSets[player.pos] || [];
    
    playerMilestones.forEach(milestoneSet => {
      const currentValue = career[milestoneSet.stat] || 0;
      
      milestoneSet.thresholds.forEach(threshold => {
        const milestoneKey = `${milestoneSet.stat}_${threshold}`;
        
        if (currentValue >= threshold && !milestones.find(m => m.key === milestoneKey)) {
          milestones.push({
            key: milestoneKey,
            year: (window.state?.league?.year) || 2025,
            description: `${threshold.toLocaleString()} ${milestoneSet.suffix}`,
            value: currentValue,
            rarity: getMilestoneRarity(threshold, milestoneSet.stat)
          });
        }
      });
    });
  }

  /**
   * Get rarity level for milestone
   * @param {number} threshold - Milestone threshold
   * @param {string} stat - Statistic type
   * @returns {string} Rarity level
   */
  function getMilestoneRarity(threshold, stat) {
    const rarityThresholds = {
      passYd: { rare: 40000, legendary: 60000 },
      rushYd: { rare: 15000, legendary: 20000 },
      recYd: { rare: 12000, legendary: 18000 },
      passTD: { rare: 300, legendary: 450 },
      rushTD: { rare: 100, legendary: 150 },
      recTD: { rare: 80, legendary: 120 }
    };
    
    const thresholds = rarityThresholds[stat];
    if (!thresholds) return 'Common';
    
    if (threshold >= thresholds.legendary) return 'Legendary';
    if (threshold >= thresholds.rare) return 'Rare';
    return 'Common';
  }

  /**
   * Check for season awards
   * @param {Object} player - Player object
   * @param {Object} seasonStats - Season statistics
   * @param {Object} team - Team object
   * @param {number} year - Season year
   */
  function checkSeasonAwards(player, seasonStats, team, year) {
    const awards = player.legacy.awards;
    
    // Simplified award logic (in full implementation, this would compare against all players)
    
    // Pro Bowl (top performers at each position)
    if (player.ovr >= 88 && seasonStats.gamesPlayed >= 12) {
      awards.proBowl++;
      player.awards = player.awards || [];
      player.awards.push({
        year: year,
        award: 'Pro Bowl',
        details: 'Selected to Pro Bowl'
      });
    }
    
    // All-Pro (elite performers)
    if (player.ovr >= 93 && seasonStats.gamesPlayed >= 14) {
      awards.allPro++;
      player.awards = player.awards || [];
      player.awards.push({
        year: year,
        award: 'All-Pro',
        details: 'Named to All-Pro team'
      });
    }
    
    // Position-specific awards
    if (player.pos === 'QB' && seasonStats.passTD >= 35 && team.record.w >= 12) {
      awards.playerOfYear++;
      player.awards = player.awards || [];
      player.awards.push({
        year: year,
        award: 'Player of the Year',
        details: 'Outstanding QB performance'
      });
    }
    
    if (player.pos === 'RB' && seasonStats.rushYd >= 1500) {
      player.awards = player.awards || [];
      player.awards.push({
        year: year,
        award: 'Rushing Leader',
        details: `${seasonStats.rushYd} rushing yards`
      });
    }
    
    // Rookie awards (first season)
    if (player.age <= 23 && (player.legacy.teamHistory?.length || 0) === 1) {
      if (player.ovr >= 85) {
        awards.rookie++;
        player.awards = player.awards || [];
        player.awards.push({
          year: year,
          award: 'Rookie of the Year',
          details: 'Outstanding rookie season'
        });
      }
    }
  }

  /**
   * Update advanced statistics
   * @param {Object} player - Player object
   * @param {Object} seasonStats - Season statistics
   */
  function updateAdvancedStats(player, seasonStats) {
    const advanced = player.stats.career.advanced;
    
    if (player.pos === 'QB') {
      const attempts = seasonStats.passAtt || 1;
      const completions = seasonStats.passComp || 0;
      
      advanced.completionPct = completions / attempts;
      advanced.yardsPerAttempt = (seasonStats.passYd || 0) / attempts;
      advanced.touchdownPct = (seasonStats.passTD || 0) / attempts;
      advanced.interceptionPct = (seasonStats.interceptions || 0) / attempts;
      advanced.qbRating = calculateQBRating(seasonStats);
    }
    
    if (player.pos === 'RB') {
      const rushAttempts = seasonStats.rushAtt || 1;
      advanced.yardsPerCarry = (seasonStats.rushYd || 0) / rushAttempts;
      advanced.fumbles = (advanced.fumbles || 0) + (seasonStats.fumbles || 0);
    }
    
    if (player.pos === 'WR' || player.pos === 'TE') {
      const targets = seasonStats.targets || Math.max(1, seasonStats.receptions || 1);
      advanced.catchPct = (seasonStats.receptions || 0) / targets;
      advanced.yardsPerReception = (seasonStats.recYd || 0) / Math.max(1, seasonStats.receptions || 1);
      advanced.receptionsPerGame = (seasonStats.receptions || 0) / Math.max(1, seasonStats.gamesPlayed || 1);
    }
  }

  /**
   * Calculate QB rating (simplified)
   * @param {Object} seasonStats - Season statistics
   * @returns {number} QB rating
   */
  function calculateQBRating(seasonStats) {
    const attempts = seasonStats.passAtt || 1;
    const completions = seasonStats.passComp || 0;
    const yards = seasonStats.passYd || 0;
    const touchdowns = seasonStats.passTD || 0;
    const interceptions = seasonStats.interceptions || 0;
    
    // Simplified QB rating calculation
    const compPct = (completions / attempts - 0.3) * 5;
    const yardsPer = (yards / attempts - 3) * 0.25;
    const touchdownPer = touchdowns / attempts * 20;
    const intPer = 2.375 - (interceptions / attempts * 25);
    
    const rating = ((compPct + yardsPer + touchdownPer + intPer) / 6) * 100;
    return Math.max(0, Math.min(158.3, rating));
  }

  /**
   * Calculate impact metrics for player
   * @param {Object} player - Player object
   * @param {Object} seasonStats - Season statistics
   * @param {Object} team - Team object
   * @param {number} year - Season year
   */
  function calculateImpactMetrics(player, seasonStats, team, year) {
    const metrics = player.legacy.metrics;
    
    // Impact score based on team success and individual performance
    const teamWinPct = (team.record.w || 0) / Math.max(1, (team.record.w || 0) + (team.record.l || 0));
    const playerPerformance = Math.min(100, player.ovr + (seasonStats.gamesPlayed || 0));
    
    metrics.impactScore = Math.round((teamWinPct * 50) + (playerPerformance * 0.5));
    
    // Peak score (best single season)
    const currentSeasonScore = calculateSeasonScore(player, seasonStats);
    metrics.peakScore = Math.max(metrics.peakScore || 0, currentSeasonScore);
    
    // Longevity score based on career length and consistency
    const seasonsPlayed = player.legacy.teamHistory?.length || 1;
    metrics.longevityScore = Math.min(100, seasonsPlayed * 5 + player.ovr);
  }

  /**
   * Calculate score for individual season
   * @param {Object} player - Player object
   * @param {Object} seasonStats - Season statistics
   * @returns {number} Season score
   */
  function calculateSeasonScore(player, seasonStats) {
    let score = player.ovr; // Base on overall rating
    
    // Add bonuses for statistical achievement
    if (player.pos === 'QB') {
      if (seasonStats.passTD >= 35) score += 10;
      if (seasonStats.passYd >= 4500) score += 10;
      if (seasonStats.interceptions <= 8) score += 5;
    } else if (player.pos === 'RB') {
      if (seasonStats.rushYd >= 1500) score += 10;
      if (seasonStats.rushTD >= 15) score += 10;
    } else if (player.pos === 'WR') {
      if (seasonStats.recYd >= 1400) score += 10;
      if (seasonStats.recTD >= 12) score += 10;
    }
    
    // Games played bonus
    if (seasonStats.gamesPlayed >= 16) score += 5;
    
    return Math.min(100, score);
  }

  /**
   * Check for player records
   * @param {Object} player - Player object
   * @param {Object} seasonStats - Season statistics
   * @param {Object} team - Team object
   * @param {number} year - Season year
   */
  function checkPlayerRecords(player, seasonStats, team, year) {
    // This would compare against historical records
    // Simplified implementation
    
    const records = player.legacy.records;
    
    // Team records (simplified - would need historical team data)
    if (player.pos === 'QB' && seasonStats.passTD >= 40) {
      records.team.push({
        record: 'Single Season Passing TDs',
        value: seasonStats.passTD,
        year: year,
        previous: 35 // Would be actual previous record
      });
    }
    
    if (player.pos === 'RB' && seasonStats.rushYd >= 2000) {
      records.team.push({
        record: 'Single Season Rushing Yards',
        value: seasonStats.rushYd,
        year: year,
        previous: 1800 // Would be actual previous record
      });
    }
  }

  /**
   * Calculate overall legacy score
   * @param {Object} player - Player object
   */
  function calculateLegacyScore(player) {
    if (!player.legacy) return;
    
    const metrics = player.legacy.metrics;
    const awards = player.legacy.awards;
    
    let legacyScore = 0;
    
    // Base score from performance metrics
    legacyScore += (metrics.impactScore || 0) * 0.3;
    legacyScore += (metrics.peakScore || 0) * 0.25;
    legacyScore += (metrics.longevityScore || 0) * 0.2;
    legacyScore += (metrics.clutchScore || 0) * 0.15;
    
    // Awards bonus
    legacyScore += (awards.playerOfYear || 0) * 5;
    legacyScore += (awards.allPro || 0) * 3;
    legacyScore += (awards.proBowl || 0) * 1;
    
    // Championship bonus
    const championships = player.awards?.filter(a => a.award === 'Super Bowl Champion').length || 0;
    legacyScore += championships * 10;
    
    // Records bonus
    legacyScore += (player.legacy.records?.team?.length || 0) * 2;
    legacyScore += (player.legacy.records?.league?.length || 0) * 5;
    
    metrics.legacyScore = Math.max(0, Math.min(100, Math.round(legacyScore)));
  }

  /**
   * Check Hall of Fame eligibility
   * @param {Object} player - Player object
   * @param {number} currentYear - Current year
   * @returns {boolean} Whether player is eligible
   */
  function checkHallOfFameEligibility(player, currentYear) {
    if (!player.legacy) return false;
    
    const hof = player.legacy.hallOfFame;
    const careerLength = player.legacy.teamHistory?.length || 0;
    
    // Must be retired for 5 years and played at least 5 seasons
    if (player.years <= 0 && careerLength >= 5) {
      const retirementYear = currentYear; // Simplified
      const eligibilityYear = retirementYear + 5;
      
      if (currentYear >= eligibilityYear) {
        hof.eligible = true;
        hof.eligibilityYear = eligibilityYear;
        
        // Check if worthy of induction
        const legacyThreshold = getHOFThreshold(player.pos);
        if (player.legacy.metrics.legacyScore >= legacyThreshold) {
          hof.inducted = true;
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Get Hall of Fame threshold by position
   * @param {string} position - Player position
   * @returns {number} Legacy score threshold
   */
  function getHOFThreshold(position) {
    const thresholds = {
      QB: 75,
      RB: 70,
      WR: 70,
      TE: 65,
      OL: 65,
      DL: 65,
      LB: 65,
      CB: 65,
      S: 65,
      K: 80,
      P: 80
    };
    
    return thresholds[position] || 70;
  }

  // ============================================================================
  // ROOKIE GENERATION (from rookies.js)
  // ============================================================================

  // Configuration constants
  const DRAFT_CONFIG = {
      DEFAULT_CLASS_SIZE: 150,
      ROOKIE_AGE: { MIN: 21, MAX: 23 },
      POTENTIAL_VARIANCE: { MIN: 5, MAX: 15 },
      OVERALL_BOUNDS: { MIN: 40, MAX: 99 },
      POSITIONS: {
          // More realistic position distribution weights
          'QB': 0.08,   // ~12 players
          'RB': 0.12,   // ~18 players  
          'WR': 0.18,   // ~27 players
          'TE': 0.08,   // ~12 players
          'OL': 0.20,   // ~30 players
          'DL': 0.15,   // ~23 players
          'LB': 0.10,   // ~15 players
          'CB': 0.12,   // ~18 players
          'S': 0.08,    // ~12 players
          'K': 0.02,    // ~3 players
          'P': 0.02     // ~3 players
      }
  };

  /**
   * Validates the draft generation parameters
   * @param {number} year - The draft year
   * @param {Object} options - Optional configuration overrides
   * @returns {boolean} - True if valid, throws error if not
   */
  function validateDraftParams(year, options = {}) {
      if (!year || typeof year !== 'number' || year < 1920 || year > 2100) {
          throw new Error('Invalid year: must be a number between 1920 and 2100');
      }
      
      if (options.classSize && (typeof options.classSize !== 'number' || options.classSize < 1)) {
          throw new Error('Invalid class size: must be a positive number');
      }
      
      return true;
  }

  /**
   * Generates a weighted random position based on realistic NFL draft distributions
   * @param {Object} positionWeights - Position weight distribution
   * @returns {string} - Selected position
   */
  function getWeightedPosition(positionWeights = DRAFT_CONFIG.POSITIONS) {
      const positions = Object.keys(positionWeights);
      const weights = Object.values(positionWeights);
      
      // Simple weighted selection
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      let random = Math.random() * totalWeight;
      
      for (let i = 0; i < positions.length; i++) {
          random -= weights[i];
          if (random <= 0) {
              return positions[i];
          }
      }
      
      // Fallback to simple random choice
      return U ? U.choice(positions) : positions[0];
  }

  /**
   * Calculates scouting potential range with fog of war effect
   * @param {number} actualOverall - The player's true overall rating
   * @param {Object} config - Configuration for variance calculation
   * @returns {Object} - Object with floor, ceiling, and range string
   */
  function calculatePotentialRange(actualOverall, config = DRAFT_CONFIG) {
      const variance = U ? U.rand(config.POTENTIAL_VARIANCE.MIN, config.POTENTIAL_VARIANCE.MAX) : 10;
      
      const floor = U ? U.clamp(
          actualOverall - variance, 
          config.OVERALL_BOUNDS.MIN, 
          config.OVERALL_BOUNDS.MAX
      ) : Math.max(config.OVERALL_BOUNDS.MIN, Math.min(config.OVERALL_BOUNDS.MAX, actualOverall - variance));
      
      const ceiling = U ? U.clamp(
          actualOverall + variance, 
          config.OVERALL_BOUNDS.MIN, 
          config.OVERALL_BOUNDS.MAX
      ) : Math.max(config.OVERALL_BOUNDS.MIN, Math.min(config.OVERALL_BOUNDS.MAX, actualOverall + variance));
      
      return {
          floor,
          ceiling,
          range: `${floor}-${ceiling}`,
          confidence: Math.max(0, 100 - variance * 3) // Lower variance = higher confidence
      };
  }

  /**
   * Creates a single rookie player
   * @param {string} position - Player position
   * @param {number} year - Draft year
   * @returns {Object} - Rookie player object
   */
  function createRookiePlayer(position, year) {
      // Check if makePlayer function exists
      if (typeof makePlayer !== 'function') {
          throw new Error('makePlayer function is not available. Please ensure it is loaded.');
      }
      
      const rookie = makePlayer(position);
      rookie.age = U ? U.rand(DRAFT_CONFIG.ROOKIE_AGE.MIN, DRAFT_CONFIG.ROOKIE_AGE.MAX) : 22;
      rookie.year = year;
      rookie.position = position; // Ensure position is explicitly set
      
      // Initialize depth chart stats for rookie
      initializeDepthChartStats(rookie);
      // Rookies start with lower playbook knowledge
      rookie.depthChart.playbookKnowledge = U ? U.rand(20, 40) : 30;
      
      // Add scouting information
      const potentialData = calculatePotentialRange(rookie.ovr);
      rookie.potentialRange = potentialData.range;
      rookie.scoutingFloor = potentialData.floor;
      rookie.scoutingCeiling = potentialData.ceiling;
      rookie.scoutingConfidence = potentialData.confidence;
      rookie.scouted = false;
      rookie.timesWatched = 0; // Track how many times this player has been scouted
      
      return rookie;
  }

  /**
   * Generates a complete draft class with realistic distributions
   * @param {number} year - The draft year
   * @param {Object} options - Optional configuration overrides
   * @returns {Array} - Array of rookie player objects, sorted by overall rating
   */
  function generateDraftClass(year, options = {}) {
      try {
          // Validate inputs
          validateDraftParams(year, options);
          
          // Check dependencies
          if (!U) {
              throw new Error('Utils library is not available. Please ensure it is loaded.');
          }
          
          // Merge options with defaults
          const config = {
              classSize: options.classSize || DRAFT_CONFIG.DEFAULT_CLASS_SIZE,
              positionWeights: options.positionWeights || DRAFT_CONFIG.POSITIONS,
              includeUDFA: options.includeUDFA !== false // Default to true
          };
          
          console.log(`Generating ${config.classSize} player draft class for ${year}`);
          
          const draftClass = [];
          
          // Generate players
          for (let i = 0; i < config.classSize; i++) {
              const position = getWeightedPosition(config.positionWeights);
              const rookie = createRookiePlayer(position, year);
              
              // Add draft metadata
              rookie.draftId = i + 1; // Unique identifier within this draft
              rookie.expectedRound = null; // Will be calculated after sorting
              
              draftClass.push(rookie);
          }
          
          // Sort by overall rating (best to worst)
          draftClass.sort((a, b) => b.ovr - a.ovr);
          
          // Assign expected draft rounds (32 picks per round for 7 rounds = 224 drafted players)
          draftClass.forEach((player, index) => {
              if (index < 224) {
                  player.expectedRound = Math.floor(index / 32) + 1;
              } else {
                  player.expectedRound = 'UDFA'; // Undrafted Free Agent
              }
          });
          
          // Log draft class statistics
          const positionCounts = draftClass.reduce((counts, player) => {
              counts[player.position] = (counts[player.position] || 0) + 1;
              return counts;
          }, {});
          
          console.log('Draft class position distribution:', positionCounts);
          console.log(`Top prospect: ${draftClass[0].position} with ${draftClass[0].ovr} overall`);
          
          return draftClass;
          
      } catch (error) {
          console.error('Error generating draft class:', error);
          throw error;
      }
  }

  // ============================================================================
  // PLAYER FACTORY FALLBACK (from player-factory.js)
  // ============================================================================

  // Only use if makePlayer doesn't exist (backward compatibility check)
  if (!window.makePlayer) {
    function generatePlayerName(position) {
        const constants = C;
        const utils = U;
        const first = utils?.choice(constants?.FIRST_NAMES || ['James', 'Michael']);
        const last = utils?.choice(constants?.LAST_NAMES || ['Smith', 'Johnson']);
        return `${first} ${last}`;
    }

    function generatePlayerRatingsFactory(position, ovr) {
        const constants = C;
        const utils = U;
        const baseRatings = constants?.POS_RATING_RANGES?.[position] || {};
        const ratings = {};

        Object.keys(baseRatings).forEach(attr => {
            const [min, max] = baseRatings[attr];
            ratings[attr] = utils?.clamp ? utils.clamp(ovr + utils.rand(-5, 5), min, max) : ovr;
        });

        return ratings;
    }

    window.makePlayer = function makePlayerFactory(position, age, ovr) {
        const constants = C;
        const utils = U;

        if (!constants || !utils) {
            console.error('makePlayer fallback missing dependencies');
            return null;
        }

        const playerOvr = typeof ovr === 'number' ? ovr : utils.rand(60, 85);
        const playerAge = typeof age === 'number' ? age : utils.rand(21, 35);

        const player = {
            id: utils.id(),
            name: generatePlayerName(position),
            pos: position,
            age: playerAge,
            ovr: playerOvr,
            years: utils.rand(1, 4),
            yearsTotal: undefined,
            // FIXED: Reduced salary ranges to fit within $220M cap
            baseAnnual: playerOvr >= 90 ? utils.rand(12, 22) : 
                       playerOvr >= 80 ? utils.rand(4, 12) : 
                       playerOvr >= 70 ? utils.rand(1.5, 5) : 
                       playerOvr >= 60 ? utils.rand(0.6, 2) : utils.rand(0.4, 0.8),
            ratings: generatePlayerRatingsFactory(position, playerOvr),
            abilities: constants?.ABILITIES_BY_POS?.[position]
                ? [utils.choice(constants.ABILITIES_BY_POS[position])]
                : [],
            college: generateCollege(),
            fatigue: 0,
            stats: {}
        };

        if (!player.yearsTotal) player.yearsTotal = player.years;
        
        // Initialize depth chart
        initializeDepthChartStats(player);
        
        return player;
    };
  }

  // ============================================================================
  // PLAYER CLASS (New Implementation)
  // ============================================================================

  /**
   * Player Class: Manages individual stats, growth logic, and aging.
   * Designed for a serialized GM simulation.
   */
  class Player {
    constructor(data) {
      this.id = data.id;
      this.name = data.name;
      this.age = data.age || 21;
      this.potential = data.potential; // Ceiling for growth
      this.longevity = data.longevity; // 0-100: Higher stays in prime longer

      // Split ratings into Physical and Mental for realistic aging
      this.ratings = {
        physical: data.physicalRating || 70, // Speed, Strength, Agility
        mental: data.mentalRating || 70,     // Vision, Intelligence, Consistency
        overall: 0
      };

      this.updateOverall();
    }

    updateOverall() {
      this.ratings.overall = Math.round((this.ratings.physical + this.ratings.mental) / 2);
    }

    /**
     * Primary logic for the off-season progression step.
     * Rankings for impact: Age > Potential > Longevity.
     */
    advanceSeason() {
      this.age++;

      const physicalChange = this.calculatePhysicalChange();
      const mentalChange = this.calculateMentalChange();

      this.ratings.physical = this.clamp(this.ratings.physical + physicalChange, 40, 99);
      this.ratings.mental = this.clamp(this.ratings.mental + mentalChange, 40, 99);

      this.updateOverall();

      return {
        name: this.name,
        age: this.age,
        change: { physical: physicalChange, mental: mentalChange },
        newOverall: this.ratings.overall
      };
    }

    calculatePhysicalChange() {
      // Phase 1: Development (Under 25)
      if (this.age < 25) {
        let gap = this.potential - this.ratings.physical;
        return Math.floor(Math.random() * (gap * 0.25)) + 1;
      }
      // Phase 2: The Plateau (25-28)
      else if (this.age <= 28) {
        return Math.floor(Math.random() * 3) - 1; // Slight fluctuation
      }
      // Phase 3: The Decline (29+)
      else {
        // Longevity acts as a buffer against physical decay
        const decayBase = (this.age - 28) * 1.8;
        const buffer = this.longevity / 25;
        return -Math.max(1, Math.floor(Math.random() * decayBase - buffer));
      }
    }

    calculateMentalChange() {
      // Mental stats grow slower but stay high longer than physicals
      if (this.age < 30) {
        let gap = this.potential - this.ratings.mental;
        return Math.floor(Math.random() * (gap * 0.15)) + 1;
      }
      // Mental prime lasts much longer
      else if (this.age <= 34) {
        return Math.floor(Math.random() * 2); // Can still improve slightly in mid-30s
      }
      // Late career decline
      else {
        return Math.floor(Math.random() * 3) - 2;
      }
    }

    clamp(val, min, max) {
      return Math.min(Math.max(val, min), max);
    }
  }

  // ============================================================================
  // ES MODULE EXPORTS
  // ============================================================================

  // Export constants
  export { SKILL_TREES, DRAFT_CONFIG };
  export default Player;

  // Export progression system
  export { initProgressionStats, calculateGameXP, addXP, applySkillTreeUpgrade };

  // Export main player functions
  export { makePlayer, progressPlayer };

  // Export legacy system
  export {
    initializePlayerLegacy,
    updatePlayerGameLegacy,
    updatePlayerSeasonLegacy,
    checkForNotablePerformance,
    updatePlayoffStats,
    checkCareerMilestones,
    checkSeasonAwards,
    updateAdvancedStats,
    calculateImpactMetrics,
    calculateLegacyScore,
    checkHallOfFameEligibility,
    getHOFThreshold
  };

  // Export rookie generation
  export { generateDraftClass, createRookiePlayer, calculatePotentialRange, getWeightedPosition };

  // Export Depth Chart System
  export {
    initializeDepthChartStats,
    calculateEffectiveRating,
    setDepthChartPosition,
    generateDepthChart,
    renderDepthChart,
    updatePlaybookKnowledge,
    updateChemistry,
    addPracticeReps,
    processWeeklyDepthChartUpdates,
    getPositionGroup,
    calculateWeeksWithTeam
  };

  // Export draft utilities
  export const draftUtils = {
    scoutPlayer: function(player, thoroughness = 'basic') {
      if (!player.scouted) {
        player.scouted = true;
        player.timesWatched = 1;
      } else {
        player.timesWatched++;
      }
      
      // More thorough scouting reduces uncertainty
      if (thoroughness === 'thorough' && player.timesWatched >= 3) {
        const reduction = Math.min(5, player.timesWatched);
        const newFloor = Math.max(player.scoutingFloor, player.ovr - reduction);
        const newCeiling = Math.min(player.scoutingCeiling, player.ovr + reduction);
        player.potentialRange = `${newFloor}-${newCeiling}`;
      }
    },
    
    getDraftBoard: function(draftClass, position = null) {
      let filteredClass = position ? 
        draftClass.filter(p => p.position === position) : 
        draftClass;
      
      return filteredClass.map((player, index) => ({
        rank: index + 1,
        name: player.name || `${player.position} #${player.draftId}`,
        position: player.position,
        potentialRange: player.potentialRange,
        scouted: player.scouted,
        expectedRound: player.expectedRound
      }));
    }
  };

  // ============================================================================
  // BACKWARD COMPATIBILITY SHIMS
  // ============================================================================
  // TODO: Remove these once all code is migrated to ES modules

  // Progression system
  window.Player = Player;
  window.SKILL_TREES = SKILL_TREES;
  window.initProgressionStats = initProgressionStats;
  window.calculateGameXP = calculateGameXP;
  window.addXP = addXP;
  window.applySkillTreeUpgrade = applySkillTreeUpgrade;

  // Main player functions
  window.makePlayer = makePlayer;
  window.progressPlayer = progressPlayer;

  // Legacy system
  window.initializePlayerLegacy = initializePlayerLegacy;
  window.updatePlayerGameLegacy = updatePlayerGameLegacy;
  window.updatePlayerSeasonLegacy = updatePlayerSeasonLegacy;
  window.checkForNotablePerformance = checkForNotablePerformance;
  window.updatePlayoffStats = updatePlayoffStats;
  window.checkCareerMilestones = checkCareerMilestones;
  window.checkSeasonAwards = checkSeasonAwards;
  window.updateAdvancedStats = updateAdvancedStats;
  window.calculateImpactMetrics = calculateImpactMetrics;
  window.calculateLegacyScore = calculateLegacyScore;
  window.checkHallOfFameEligibility = checkHallOfFameEligibility;
  window.getHOFThreshold = getHOFThreshold;

  // Rookie generation
  window.generateDraftClass = generateDraftClass;
  window.DRAFT_CONFIG = DRAFT_CONFIG;
  window.createRookiePlayer = createRookiePlayer;
  window.calculatePotentialRange = calculatePotentialRange;
  window.getWeightedPosition = getWeightedPosition;

  // Depth Chart System
  window.initializeDepthChartStats = initializeDepthChartStats;
  window.calculateEffectiveRating = calculateEffectiveRating;
  window.setDepthChartPosition = setDepthChartPosition;
  window.generateDepthChart = generateDepthChart;
  window.renderDepthChart = renderDepthChart;
  window.updatePlaybookKnowledge = updatePlaybookKnowledge;
  window.updateChemistry = updateChemistry;
  window.addPracticeReps = addPracticeReps;
  window.processWeeklyDepthChartUpdates = processWeeklyDepthChartUpdates;
  window.getPositionGroup = getPositionGroup;
  window.calculateWeeksWithTeam = calculateWeeksWithTeam;

  // Draft utilities
  window.draftUtils = draftUtils;

  console.log('✅ Combined player.js loaded - includes progression, legacy, rookies, factory, and depth chart system');
