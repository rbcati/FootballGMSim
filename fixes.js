// fixes.js - Combined Fix Files
// This file combines: error-overlay.js, missing-functions.js, league-creation-fix.js, 
// team-selection-fix.js, navbar-fix.js, and dom-helpers-fix.js
import { renderCoachingStats } from './coaching.js';
import { renderTradeProposals } from './tradeproposals.js';
import './training.js';

'use strict';

// ============================================================================
// ERROR OVERLAY (from error-overlay.js)
// ============================================================================

(function() {
  'use strict';

  const overlay = document.createElement('div');
  overlay.id = 'errorOverlay';
  overlay.className = 'error-overlay hidden';
  overlay.setAttribute('role', 'alert');
  overlay.setAttribute('aria-live', 'assertive');

  const template = `
    <div class="error-panel">
      <div class="error-header">
        <div>
          <div class="error-title">Something went wrong</div>
          <div class="error-subtitle">This pop-up is only visible to testers. Screenshot it for developers.</div>
        </div>
        <div class="error-actions">
          <button type="button" class="btn" id="errorCopy">Copy details</button>
          <button type="button" class="btn" id="errorClose">Close</button>
        </div>
      </div>
      <div class="error-body">
        <div class="error-meta">
          <div><span class="label">Time:</span> <span id="errorTime"></span></div>
          <div><span class="label">Page:</span> <span id="errorRoute"></span></div>
          <div><span class="label">Last action:</span> <span id="errorAction">Unknown</span></div>
        </div>
        <div class="error-section">
          <div class="label">Message</div>
          <div id="errorMessage" class="error-message"></div>
        </div>
        <div class="error-section">
          <div class="label">Stack Trace</div>
          <pre id="errorStack" class="error-stack"></pre>
        </div>
        <div class="error-section muted small">If a button stopped working, include this pop-up in your screenshot so developers can see the console error.</div>
      </div>
    </div>
  `;

  overlay.innerHTML = template;
  document.body.appendChild(overlay);

  const stackEl = overlay.querySelector('#errorStack');
  const messageEl = overlay.querySelector('#errorMessage');
  const timeEl = overlay.querySelector('#errorTime');
  const routeEl = overlay.querySelector('#errorRoute');
  const actionEl = overlay.querySelector('#errorAction');
  const closeBtn = overlay.querySelector('#errorClose');
  const copyBtn = overlay.querySelector('#errorCopy');

  let lastAction = 'None recorded yet';

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) {
      const label = button.innerText?.trim() || button.ariaLabel || button.id || 'Unnamed button';
      lastAction = `Clicked: ${label}`;
    }
  }, { capture: true });

  function formatError(details) {
    const now = new Date();
    const stack = (details.stack || '').toString().trim();
    stackEl.textContent = stack || 'No stack trace available';
    messageEl.textContent = details.message || 'Unknown error';
    timeEl.textContent = now.toLocaleString();
    routeEl.textContent = window.location.hash || '/';
    actionEl.textContent = lastAction;
  }

  function copyErrorDetails() {
    const content = [
      `Message: ${messageEl.textContent}`,
      `Route: ${routeEl.textContent}`,
      `Last action: ${actionEl.textContent}`,
      `Time: ${timeEl.textContent}`,
      'Stack:',
      stackEl.textContent
    ].join('\n');

    navigator.clipboard?.writeText(content).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy details'; }, 1200);
    }).catch(() => {
      copyBtn.textContent = 'Copy failed';
      setTimeout(() => { copyBtn.textContent = 'Copy details'; }, 1200);
    });
  }

  function showOverlay(details) {
    formatError(details);
    overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  closeBtn.addEventListener('click', hideOverlay);
  copyBtn.addEventListener('click', copyErrorDetails);

  window.addEventListener('error', (event) => {
    const info = {
      message: event?.message,
      stack: event?.error?.stack || `${event.filename || ''}:${event.lineno || ''}`
    };
    showOverlay(info);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason || {};
    const info = {
      message: reason.message || 'Unhandled promise rejection',
      stack: reason.stack || JSON.stringify(reason, null, 2)
    };
    showOverlay(info);
  });

  window.showTesterError = showOverlay;
})();

// ============================================================================
// MISSING FUNCTIONS (from missing-functions.js)
// ============================================================================

// === SALARY CAP FUNCTIONS ===

/**
 * Checks if a player can be restructured
 * @param {Object} player - The player object
 * @returns {boolean} Whether the player can be restructured
 */
function canRestructure(player) {
  if (!player) return false;
  
  const C = window.Constants;
  
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
 * Restructures a player's contract to create immediate cap space
 * @param {Object} league - The league object
 * @param {Object} team - The team object  
 * @param {Object} player - The player to restructure
 * @param {number} amount - Amount to convert to signing bonus (millions)
 */
function restructureContract(league, team, player, amount = null) {
  if (!canRestructure(player)) {
    throw new Error('Player cannot be restructured');
  }
  
  const C = window.Constants;
  
  // Default to restructuring half of remaining base salary
  const maxAmount = player.baseAnnual * 0.5;
  const restructureAmount = amount || maxAmount;
  
  // Convert base salary to prorated signing bonus
  player.baseAnnual = Math.max(0.5, player.baseAnnual - restructureAmount);
  player.signingBonus += restructureAmount;
  player.yearsTotal = Math.max(player.yearsTotal, player.years); // Ensure consistency
  player.guaranteedPct = Math.min(0.9, (player.guaranteedPct || 0.5) + 0.1);
  
  // Recalculate cap impact
  if (window.recalcCap) {
    window.recalcCap(league, team);
  }
  
  return {
    player: player.name,
    amountRestructured: restructureAmount,
    newCapHit: window.capHitFor ? window.capHitFor(player, 0) : 0
  };
}

// === PLAYER GENERATION FUNCTIONS ===

/**
 * Returns an object with common stats initialized to 0.
 * @returns {Object} Zeroed stats object
 */
function getZeroStats() {
  return {
    // General
    gamesPlayed: 0,

    // Passing
    passYd: 0, passTD: 0, interceptions: 0, passAtt: 0, passComp: 0, sacks: 0,

    // Rushing
    rushYd: 0, rushTD: 0, rushAtt: 0, fumbles: 0,

    // Receiving
    recYd: 0, recTD: 0, receptions: 0, targets: 0, drops: 0,

    // Defense
    tackles: 0, forcedFumbles: 0, passesDefended: 0, tacklesForLoss: 0,

    // Kicking/Punting
    fgMade: 0, fgAttempts: 0, xpMade: 0, xpAttempts: 0, punts: 0, puntYards: 0
  };
}

/**
 * Generates a complete player with all ratings and attributes
 * @param {string} pos - Position (QB, RB, etc.)
 * @param {Object} overrides - Optional overrides for specific attributes
 * @returns {Object} Complete player object
 */
function makePlayer(pos, overrides = {}) {
  const U = window.Utils;
  const C = window.Constants;
  
  if (!U || !C) {
    throw new Error('Utils and Constants must be loaded');
  }

  // Generate detailed ratings based on position
  const ratings = generatePlayerRatings(pos);
  
  // Calculate overall rating
  const ovr = calculateOvr(pos, ratings);
  
  // Generate contract details
  const contractDetails = generateContract(ovr, pos);
  
  const player = {
    id: U.id(),
    name: generatePlayerName(),
    pos: pos,
    age: overrides.age || U.rand(C.PLAYER_CONFIG.MIN_AGE, C.PLAYER_CONFIG.MAX_AGE),
    ratings: ratings,
    ovr: ovr,
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
 * @returns {Object} Ratings object
 */
function generatePlayerRatings(pos) {
  const U = window.Utils;
  
  const baseRatings = {
    throwPower: U.rand(50, 99),
    throwAccuracy: U.rand(50, 99),
    awareness: U.rand(40, 99),
    catching: U.rand(40, 99),
    catchInTraffic: U.rand(40, 99),
    acceleration: U.rand(60, 99),
    speed: U.rand(60, 99),
    agility: U.rand(60, 99),
    trucking: U.rand(40, 99),
    juking: U.rand(40, 99),
    passRushSpeed: U.rand(40, 99),
    passRushPower: U.rand(40, 99),
    runStop: U.rand(40, 99),
    coverage: U.rand(40, 99),
    runBlock: U.rand(50, 99),
    passBlock: U.rand(50, 99),
    intelligence: U.rand(40, 99),
    kickPower: U.rand(60, 99),
    kickAccuracy: U.rand(60, 99),
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
    baseRatings[stat] = U.rand(min, max);
  });

  return baseRatings;
}

/**
 * Calculates overall rating based on position and ratings
 * @param {string} pos - Player position
 * @param {Object} ratings - Player ratings
 * @returns {number} Overall rating (40-99)
 */
function calculateOvr(pos, ratings) {
  const C = window.Constants;
  const U = window.Utils;
  
  const weights = C.OVR_WEIGHTS[pos];
  if (!weights) return U.rand(50, 75); // Fallback for unknown positions

  let weightedSum = 0;
  let totalWeight = 0;
  
  for (const stat in weights) {
    const weight = weights[stat];
    const rating = ratings[stat] || 50;
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
function generateContract(ovr, pos) {
  const U = window.Utils;
  const C = window.Constants;
  
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
                      Math.random() * ((C.SALARY_CAP.SIGNING_BONUS_MAX || 0.4) - (C.SALARY_CAP.SIGNING_BONUS_MIN || 0.15));
  
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
function generatePlayerName() {
  const U = window.Utils;
  // Use expanded names for maximum variety (1,000,000+ combinations)
  const firstName = U.choice(window.EXPANDED_FIRST_NAMES || window.FIRST_NAMES || ['John', 'Mike', 'James', 'David']);
  const lastName = U.choice(window.EXPANDED_LAST_NAMES || window.LAST_NAMES || ['Smith', 'Johnson', 'Williams', 'Brown']);
  return `${firstName} ${lastName}`;
}

/**
 * Tags abilities for a player based on their ratings
 * @param {Object} player - The player object to tag abilities for
 */
function tagAbilities(player) {
  if (!player || !player.ratings) return;
  
  player.abilities = []; // Reset abilities
  const r = player.ratings;
  const C = window.Constants;
  
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

// === TEAM MANAGEMENT FUNCTIONS ===

/**
 * Releases selected players and handles cap implications
 * @param {Array} selectedIds - Array of player IDs to release
 */
function releaseSelected(selectedIds) {
  if (!selectedIds || selectedIds.length === 0) {
    window.setStatus('No players selected for release.');
    return;
  }
  
  const L = window.state?.league;
  const team = window.currentTeam();
  if (!L || !team) return;
  
  let releasedCount = 0;
  
  selectedIds.forEach(playerId => {
    const playerIndex = team.roster.findIndex(p => p.id === playerId);
    if (playerIndex >= 0) {
      const player = team.roster[playerIndex];
      
      // Handle cap implications (simplified - could ask user about June 1st designation)
      if (window.releaseWithProration) {
        window.releaseWithProration(L, team, player, false);
        releasedCount++;
      } else {
        // Fallback - just remove player
        team.roster.splice(playerIndex, 1);
        releasedCount++;
      }
    }
  });
  
  // Recalculate cap
  if (window.recalcCap) {
    window.recalcCap(L, team);
  }
  
  // Update team ratings after roster change
  if (window.updateTeamRatings) {
    window.updateTeamRatings(team);
  }
  
  // Refresh UI
  if (window.renderRoster) window.renderRoster();
  if (window.updateCapSidebar) window.updateCapSidebar();
  
  window.setStatus(`Released ${releasedCount} player(s).`);
}

// === UTILITY FUNCTIONS ===

/**
 * Validates player data for consistency
 * @param {Object} player - Player object to validate
 * @returns {Array} Array of validation errors
 */
function validatePlayer(player) {
  const errors = [];
  const C = window.Constants;
  
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
 * Gets positional needs for a team (for smarter AI decisions)
 * @param {Object} team - Team object
 * @returns {Object} Object with positional needs analysis
 */
function getPositionalNeeds(team) {
  if (!team || !team.roster) return {};
  
  const C = window.Constants;
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

// Make missing functions globally available
window.canRestructure = canRestructure;
window.restructureContract = restructureContract;
window.makePlayer = makePlayer;
window.generatePlayerRatings = generatePlayerRatings;
window.calculateOvr = calculateOvr;
window.generateContract = generateContract;
window.generatePlayerName = generatePlayerName;
window.tagAbilities = tagAbilities;
window.releaseSelected = releaseSelected;
window.validatePlayer = validatePlayer;
window.getPositionalNeeds = getPositionalNeeds;

// ============================================================================
// LEAGUE CREATION FIX (from league-creation-fix.js)
// ============================================================================

// Placeholder for league creation fixes. This file is included to maintain script ordering
// for downstream patches like team-selection-fix.js. No runtime changes are applied here yet.
console.log('[LeagueCreationFix] Loaded');

// ============================================================================
// TEAM SELECTION FIX (from team-selection-fix.js)
// ============================================================================

(function() {
    const logPrefix = '[TeamSelectionFix]';

    const log = (...args) => console.log(logPrefix, ...args);
    const warn = (...args) => console.warn(logPrefix, ...args);

    function getCanonicalTeams(mode) {
        if (typeof window.listByMode !== 'function') {
            warn('listByMode is not available; cannot normalize teams.');
            return [];
        }
        const teams = window.listByMode(mode);
        if (!Array.isArray(teams)) {
            warn('listByMode returned a non-array value.');
            return [];
        }
        return teams;
    }

    function buildLookup(teams) {
        const lookup = new Map();
        teams.forEach((team, index) => {
            if (team?.abbr) lookup.set(team.abbr, index);
            if (team?.name) lookup.set(team.name, index);
        });
        return lookup;
    }

    function normalizeTeamsOrder(inputTeams, lookup) {
        if (!Array.isArray(inputTeams)) {
            warn('normalizeTeamsOrder received invalid teams array.');
            return [];
        }

        const normalized = inputTeams.map((team, originalIndex) => {
            const canonicalIndex = lookup.get(team?.abbr) ?? lookup.get(team?.name);
            return {
                team: { ...team },
                canonicalIndex: typeof canonicalIndex === 'number' ? canonicalIndex : Number.MAX_SAFE_INTEGER,
                originalIndex
            };
        });

        normalized.sort((a, b) => {
            if (a.canonicalIndex === b.canonicalIndex) return a.originalIndex - b.originalIndex;
            return a.canonicalIndex - b.canonicalIndex;
        });

        return normalized.map(({ team }) => team);
    }

    function verifyTeamAssignment() {
        const namesMode = window.state?.namesMode || 'fictional';
        const canonicalTeams = getCanonicalTeams(namesMode);
        const league = window.state?.league;
        const userTeamId = window.state?.userTeamId;
        const leagueTeam = league?.teams?.[userTeamId];
        
        // FIXED: Find the selected team in canonical list by matching with league team
        let selectedTeam = null;
        if (leagueTeam) {
            // Find canonical team that matches the league team
            selectedTeam = canonicalTeams.find(t => 
                t.abbr === leagueTeam.abbr || t.name === leagueTeam.name
            );
        }
        
        // If not found, try by index
        if (!selectedTeam && canonicalTeams[userTeamId]) {
            selectedTeam = canonicalTeams[userTeamId];
        }
        
        const match = Boolean(
            selectedTeam &&
            leagueTeam &&
            leagueTeam.id === userTeamId &&
            (leagueTeam.abbr === selectedTeam.abbr || leagueTeam.name === selectedTeam.name)
        );

        const payload = {
            userTeamId,
            teamId: leagueTeam?.id,
            abbr: leagueTeam?.abbr,
            name: leagueTeam?.name,
            expectedAbbr: selectedTeam?.abbr,
            expectedName: selectedTeam?.name,
            match
        };

        console.log('✅ Team assignment verified:', payload);
        return payload;
    }

    // Wait for makeLeague to be available
    function applyTeamSelectionFix() {
        const originalMakeLeague = window.makeLeague;
        if (typeof originalMakeLeague !== 'function') {
            // Try again after a short delay
            setTimeout(applyTeamSelectionFix, 100);
            return;
        }
        
        // Apply the fix
        applyFixToMakeLeague(originalMakeLeague);
    }
    
    function applyFixToMakeLeague(originalMakeLeague) {
        window.makeLeague = function patchedMakeLeague(teams, options = {}) {
        const namesMode = window.state?.namesMode || 'fictional';
        const canonicalTeams = getCanonicalTeams(namesMode);
        const lookup = buildLookup(canonicalTeams);

        // Save the selected team's identity BEFORE reordering
        let selectedTeamIdentity = null;
        const originalUserTeamId = window.state?.userTeamId;
        if (typeof originalUserTeamId === 'number' && teams[originalUserTeamId]) {
            const originalTeam = teams[originalUserTeamId];
            selectedTeamIdentity = {
                abbr: originalTeam.abbr,
                name: originalTeam.name,
                originalIndex: originalUserTeamId
            };
            log(`Selected team BEFORE league creation: ${originalTeam.name} (index ${originalUserTeamId})`);
        }

        const orderedTeams = normalizeTeamsOrder(Array.isArray(teams) ? teams.slice() : [], lookup);
        if (orderedTeams.length === 0) {
            warn('No teams provided to makeLeague; falling back to original input.');
        }

        const league = originalMakeLeague(orderedTeams.length ? orderedTeams : teams, options);

        if (league?.teams?.length) {
            league.teams.forEach((team, index) => {
                if (team.id !== index) {
                    warn(`Realigning team id from ${team.id} to ${index} for ${team.name || 'Unknown Team'}`);
                    team.id = index;
                }
            });

            // FIXED: Better team matching logic
            if (selectedTeamIdentity && window.state) {
                // Try multiple matching strategies
                let newIndex = -1;
                
                // Strategy 1: Exact match on both abbr and name
                newIndex = league.teams.findIndex(team => 
                    team.abbr === selectedTeamIdentity.abbr && 
                    team.name === selectedTeamIdentity.name
                );
                
                // Strategy 2: Match on abbreviation only (more reliable)
                if (newIndex === -1 && selectedTeamIdentity.abbr) {
                    newIndex = league.teams.findIndex(team => 
                        team.abbr === selectedTeamIdentity.abbr
                    );
                }
                
                // Strategy 3: Match on name only (fallback)
                if (newIndex === -1 && selectedTeamIdentity.name) {
                    newIndex = league.teams.findIndex(team => 
                        team.name === selectedTeamIdentity.name
                    );
                }
                
                // Strategy 4: Use original index if team at that index matches
                if (newIndex === -1 && originalUserTeamId < league.teams.length) {
                    const teamAtOriginalIndex = league.teams[originalUserTeamId];
                    if (teamAtOriginalIndex && 
                        (teamAtOriginalIndex.abbr === selectedTeamIdentity.abbr ||
                         teamAtOriginalIndex.name === selectedTeamIdentity.name)) {
                        newIndex = originalUserTeamId;
                    }
                }
                
                if (newIndex !== -1) {
                    if (newIndex !== originalUserTeamId) {
                        log(`Updating userTeamId from ${originalUserTeamId} to ${newIndex} for ${selectedTeamIdentity.name}`);
                    }
                    window.state.userTeamId = newIndex;
                    if (window.state.viewTeamId === originalUserTeamId) {
                        window.state.viewTeamId = newIndex;
                    }
                    if (window.state.player?.teamId === originalUserTeamId) {
                        window.state.player.teamId = newIndex;
                    }
                } else {
                    warn(`Could not find selected team ${selectedTeamIdentity.name} (${selectedTeamIdentity.abbr}) after reordering! Keeping original index ${originalUserTeamId}`);
                    // Keep original index as fallback
                }
            }
        }

        if (window.state?.league?.teams) {
            const verifyResult = verifyTeamAssignment();
            log(`✅ League created. User team verification: match: ${verifyResult.match}`);
        }

        window.verifyTeamAssignment = verifyTeamAssignment;
        return league;
        };
    }
    
    // Start trying to apply the fix
    applyTeamSelectionFix();
    
    log('Team selection fix initialized (will apply when makeLeague is available).');
})();

// ============================================================================
// NAVBAR FIX (from navbar-fix.js)
// ============================================================================

(function() {
  console.log('🧭 Loading complete navigation fix...');

  // Enhanced router function
  function fixedRouter() {
    const path = location.hash || '#/hub';
    const viewName = path.slice(2);
    
    console.log('🧭 Routing to:', viewName, 'from path:', path);
    
    // Map legacy/sub-views to actual DOM view IDs
    let targetViewId = viewName;
    if (['stats', 'records', 'awards', 'streaks'].includes(viewName)) {
        targetViewId = 'leagueStats';
    }

    // Handle Player Profile Route
    if (viewName.startsWith('player/')) {
        const playerId = viewName.split('/')[1];
        if (playerId && window.playerStatsViewer && window.playerStatsViewer.renderToView) {
            window.playerStatsViewer.renderToView('playerProfile', playerId);
            targetViewId = 'playerProfile';
        }
    }

    // Hide all views first
    document.querySelectorAll('.view').forEach(view => {
      view.hidden = true;
      view.style.display = 'none';
    });
    
    // Show target view
    const targetView = document.getElementById(targetViewId);
    let viewContainer = targetView;

    if (targetView) {
      targetView.hidden = false;
      targetView.style.display = 'block';
      console.log('✅ Showing view:', targetViewId);
    } else {
      console.warn('⚠️ View not found:', targetViewId, 'falling back to hub');
      // Fallback to hub if view not found
      const hubView = document.getElementById('hub');
      if (hubView) {
        hubView.hidden = false;
        hubView.style.display = 'block';
        viewContainer = hubView;
      }
    }
    
    // Update navigation active states (nav-item, nav-pill, and nav-item-bottom)
    document.querySelectorAll('.nav-item, .nav-pill, .nav-item-bottom').forEach(item => {
      const href = item.getAttribute('href');
      const isActive = href === path;
      
      // Remove all active classes and attributes
      item.classList.remove('active');
      item.removeAttribute('aria-current');
      
      // Add active state to current page
      if (isActive) {
        item.classList.add('active');
        item.setAttribute('aria-current', 'page');
      }
    });
    
    // Only render content if game is ready
    const currentState = window.state || {};
    if (!currentState.league || !currentState.onboarded) {
      console.log('Game not ready, skipping content rendering', {
        hasLeague: !!currentState.league,
        onboarded: currentState.onboarded
      });
      // Ensure onboarding modal is shown if game isn't ready
      if (!currentState.onboarded && window.openOnboard) {
        setTimeout(() => {
          window.openOnboard().catch(err => {
            console.error('Failed to open onboarding modal:', err);
          });
        }, 100);
      }
      return;
    }
    
    // Game is ready - log for debugging
    console.log('✅ Game ready, rendering view:', viewName);
    
    // Render view-specific content with timeout to prevent main thread freezing
    // This allows the browser to render the "Loading..." state before heavy computations
    setTimeout(() => {
      try {
        switch(viewName) {
          case 'hub':
            if (window.renderHub) {
              window.renderHub();
              console.log('✅ Hub rendered');
            }
            break;
          case 'roster':
            if (window.renderRoster) {
              // Ensure team select is properly initialized with league teams before rendering
              const teamSelect = document.getElementById('rosterTeam');
              const L = window.state?.league;
              if (teamSelect && L && L.teams && L.teams.length > 0) {
                // Fill with league teams (not original team list)
                if (!teamSelect.dataset.filled || teamSelect.options.length !== L.teams.length) {
                  teamSelect.innerHTML = '';
                  L.teams.forEach((team, index) => {
                    const option = document.createElement('option');
                    option.value = String(index);
                    option.textContent = `${team.abbr || 'T' + index} — ${team.name || 'Team ' + index}`;
                    teamSelect.appendChild(option);
                  });
                  teamSelect.dataset.filled = '1';
                }
                // Sync with current viewTeamId or userTeamId
                const preferredTeamId = window.state?.viewTeamId ?? window.state?.userTeamId ?? 0;
                if (preferredTeamId >= 0 && preferredTeamId < L.teams.length) {
                  teamSelect.value = String(preferredTeamId);
                }
              }
              window.renderRoster();
              console.log('✅ Roster rendered');
            }
            break;
          case 'contracts':
            if (window.renderContractManagement) {
              window.renderContractManagement(window.state.league, window.state.userTeamId);
              console.log('✅ Contract Management rendered');
            }
            break;
          case 'standings':
            if (window.renderLeagueStats) {
              window.renderLeagueStats('standings');
              console.log('✅ Standings rendered via Hub');
            } else if (window.renderStandingsPage) {
              window.renderStandingsPage();
            }
            break;
          case 'powerRankings':
            if (window.renderPowerRankingsPage) {
                window.renderPowerRankingsPage();
                console.log('✅ Power Rankings rendered');
            } else {
                console.warn('⚠️ renderPowerRankingsPage function not found');
            }
            break;
          case 'leagueStats':
            if (window.renderLeagueStats) {
              window.renderLeagueStats('detailed');
              console.log('✅ League Stats Hub rendered');
            } else if (window.renderStatsPage) {
              window.renderStatsPage();
            }
            break;
          case 'streaks':
            if (window.renderLeagueStats) {
              window.renderLeagueStats('streaks');
            }
            break;
          case 'stats':
            if (window.renderLeagueStats) {
              window.renderLeagueStats('leaders');
            } else if (window.renderStatsPage) {
              window.renderStatsPage();
            }
            break;
          case 'records':
            if (window.renderLeagueStats) {
              window.renderLeagueStats('records');
            } else if (window.renderRecords) {
              window.renderRecords();
            }
            break;
          case 'awards':
            if (window.renderLeagueStats) {
              window.renderLeagueStats('awards');
            } else if (window.renderAwardRaces) {
              window.renderAwardRaces();
            }
            break;
          case 'freeagency':
            if (window.renderFreeAgency) {
              window.renderFreeAgency();
              console.log('✅ Free Agency rendered');
            }
            break;
          case 'draft':
            if (window.renderDraft) {
              window.renderDraft();
              console.log('✅ Draft rendered');
            }
            break;
          case 'scouting':
            if (window.renderScoutingInterface) {
              window.renderScoutingInterface();
              console.log('✅ Scouting Interface rendered');
            } else if (window.renderScouting) {
              window.renderScouting();
            } else if (window.renderDraft) {
              window.renderDraft();
            }
            break;
          case 'trade':
            if (window.renderTradeCenter) {
              window.renderTradeCenter();
              console.log('✅ Trade center rendered');
            } else if (window.renderTrade) {
              window.renderTrade();
              console.log('✅ Trade (legacy) rendered');
            }
            break;
          case 'trade-proposals':
          case 'tradeProposals':
            // Check if there's a dedicated view, otherwise show in trade view
            const tradeProposalsView = document.getElementById('tradeProposals');
            if (tradeProposalsView) {
              window.show('tradeProposals');
            } else {
              window.show('trade');
            }
            if (renderTradeProposals) {
              setTimeout(() => renderTradeProposals(), 100);
              console.log('✅ Trade proposals rendered');
            }
            break;
          case 'coaching':
            // Render scheme management first
            if (window.renderSchemeManagement) {
              window.renderSchemeManagement();
            }
            // Set up tab switching
            if (window.setupCoachingTabs) {
              window.setupCoachingTabs();
            }
            // Render coaching stats
            // Prefer window.renderCoachingStats if available, otherwise fallback to imported
            if (window.renderCoachingStats) {
              window.renderCoachingStats();
              console.log('✅ Coaching rendered');
            } else if (renderCoachingStats) {
              renderCoachingStats();
              console.log('✅ Coaching rendered (module)');
            } else {
              console.warn('⚠️ renderCoachingStats function not found');
            }
            break;
          case 'schedule':
            if (window.renderSchedule) {
              window.renderSchedule();
              console.log('✅ Schedule rendered');
            } else {
              console.warn('⚠️ renderSchedule function not found');
            }
            break;
          case 'settings':
            renderSettings();
            console.log('✅ Settings rendered');
            break;
          case 'playerDatabase':
            if (window.renderPlayerDatabase) {
              window.renderPlayerDatabase();
              console.log('✅ Player Database rendered');
            }
            break;
          case 'history':
            if (window.renderHistory) {
              window.renderHistory();
              console.log('✅ History rendered');
            }
            break;
          case 'records':
            if (window.renderRecords) {
              window.renderRecords();
              console.log('✅ Records rendered');
            }
            break;
          case 'awards':
            if (window.renderAwardRaces) {
              window.renderAwardRaces();
              console.log('✅ Award Races rendered');
            }
            break;
          case 'injuries':
            if (window.renderInjuriesPage) {
              window.renderInjuriesPage();
              console.log('✅ Injuries page rendered');
            } else {
              console.warn('⚠️ renderInjuriesPage function not found');
            }
            break;
          case 'relocation':
            if (window.renderRelocationPage) {
              window.renderRelocationPage();
              console.log('✅ Relocation page rendered');
            } else {
              console.warn('⚠️ renderRelocationPage function not found');
            }
            break;
          case 'hallOfFame':
            if (window.renderHallOfFame) {
              window.renderHallOfFame();
              console.log('✅ Hall of Fame rendered');
            }
            break;
          case 'game-sim':
            if (window.liveGameViewer) {
              // Ensure we have an active game simulation, otherwise redirect to hub
              if (window.liveGameViewer.gameState) {
                  window.liveGameViewer.renderToView('#game-sim');
                  console.log('✅ Game Sim rendered');
              } else {
                  console.warn('⚠️ No active game for simulation, redirecting to hub');
                  location.hash = '#/hub';
              }
            } else {
                console.error('LiveGameViewer not found');
            }
            break;
          default:
            console.log('No specific renderer for view:', viewName);
        }
      } catch (error) {
        console.error('Error rendering view:', viewName, error);
        if (viewContainer) {
            viewContainer.innerHTML = `
                <div class="error-panel" style="padding: 2rem; border: 1px solid rgba(255,59,48,0.3); background: rgba(255,59,48,0.05); border-radius: 8px; margin: 1rem;">
                    <h3 style="color: #ff3b30; margin-top: 0;">Error Loading View</h3>
                    <p>Something went wrong while loading this page. Please try again or return to the hub.</p>
                    <div style="font-family: monospace; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 4px; overflow-x: auto; margin: 1rem 0; font-size: 0.85rem;">
                        ${error.message}<br>
                        <span style="opacity: 0.7;">${error.stack ? error.stack.split('\n')[0] : ''}</span>
                    </div>
                    <button class="btn" onclick="location.hash='#/hub'" style="background: var(--surface); border: 1px solid var(--hairline);">Return to Hub</button>
                </div>
            `;
        }
      }
    }, 10);
  }
  
  // Basic settings renderer
  function renderSettings() {
    const settingsView = document.getElementById('settings');
    const currentState = window.state || {};
    if (settingsView && !settingsView.dataset.rendered) {
      settingsView.innerHTML = `
        <div class="card">
          <h2>Settings</h2>
          <div class="section">
            <label for="settingsYear">Current Season</label>
            <input type="number" id="settingsYear" value="${currentState.league?.year || 2025}" readonly>
          </div>
          <div class="section">
            <label>Game Mode</label>
            <p>${currentState.gameMode === 'gm' ? 'General Manager' : 'Career Mode'}</p>
          </div>
          <div class="section">
            <label>Your Role</label>
            <p>${currentState.playerRole || 'GM'}</p>
          </div>
          <div class="section">
            <label>Team Names</label>
            <p>${currentState.namesMode === 'real' ? 'Real NFL Teams' : 'Fictional Teams'}</p>
          </div>
          <div class="section">
            <button id="btnResetGame" class="btn danger">Reset Game</button>
          </div>
        </div>
      `;
      
      // Add reset functionality
      const resetBtn = document.getElementById('btnResetGame');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          if (confirm('Are you sure you want to reset the game? All progress will be lost.')) {
            localStorage.clear();
            location.reload();
          }
        });
      }
      
      settingsView.dataset.rendered = 'true';
    }
  }
  
  // Enhanced navigation click handler
  function setupNavigation() {
    console.log('🔧 Setting up enhanced navigation...');
    
    // Remove existing hash change listeners
    window.removeEventListener('hashchange', window.router);
    window.removeEventListener('hashchange', fixedRouter);
    
    // Add new hash change listener
    window.addEventListener('hashchange', fixedRouter);
    
    // Enhanced click handling for navigation
    document.addEventListener('click', function(e) {
      // Handle nav item clicks (new sidebar style)
      if (e.target.classList.contains('nav-item')) {
        e.preventDefault();
        const href = e.target.getAttribute('href');
        
        if (href && href.startsWith('#/')) {
          console.log('🖱️ Nav click:', href);
          
          // Update active state
          document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            item.removeAttribute('aria-current');
          });
          e.target.classList.add('active');
          e.target.setAttribute('aria-current', 'page');
          
          // Immediately update hash (this will trigger hashchange)
          location.hash = href;
        }
        return;
      }
      
      // Handle nav pill clicks (legacy)
      if (e.target.classList.contains('nav-pill')) {
        e.preventDefault();
        const href = e.target.getAttribute('href');
        
        if (href && href.startsWith('#/')) {
          console.log('🖱️ Nav click:', href);
          location.hash = href;
        }
        return;
      }
      
      // Handle any other navigation links
      if (e.target.tagName === 'A' && e.target.getAttribute('href')?.startsWith('#/')) {
        e.preventDefault();
        const href = e.target.getAttribute('href');
        location.hash = href;
      }
    });
    
    // Set up navigation toggle
    setupNavigationToggle();

    // Set up bottom menu toggle
    const bottomMenu = document.getElementById('navMenuBottom');
    if (bottomMenu) {
      bottomMenu.addEventListener('click', (e) => {
        e.preventDefault();
        window.toggleNavigation();
      });
    }
    
    console.log('✅ Enhanced navigation set up');
  }
  
  // Fix navigation visibility and styling
  // NOTE: CSS has been moved to style.css to avoid duplication
  // This function now just ensures proper initialization
  function fixNavigationStyles() {
    console.log('🎨 Navigation styles are in style.css');
    // Styles are now in style.css, no need to inject
  }
  
  // Set up navigation toggle functionality
  function setupNavigationToggle() {
    const navToggle = document.getElementById('navToggle');
    const navSidebar = document.getElementById('nav-sidebar');
    const layout = document.querySelector('.layout');
    
    if (!navToggle || !navSidebar || !layout) {
      console.warn('Navigation toggle elements not found');
      return;
    }
    
    // Check if mobile
    const isMobile = window.innerWidth <= 768;
    const savedState = localStorage.getItem('navSidebarCollapsed');
    
    // Create overlay element for mobile
    let navOverlay = document.getElementById('menu-overlay');
    if (!navOverlay) {
        navOverlay = document.getElementById('navOverlay');
    }
    if (!navOverlay) {
      navOverlay = document.createElement('div');
      navOverlay.id = 'navOverlay';
      navOverlay.className = 'nav-overlay';
      document.body.appendChild(navOverlay);
    }
    
    // Initialize state - on mobile, start collapsed
    function initializeNavState() {
      const isMobileNow = window.innerWidth <= 768;
      
      if (isMobileNow) {
        // Mobile: start collapsed unless user explicitly wants it open
        if (savedState === 'false') {
          openNav();
        } else {
          closeNav();
        }
        navToggle.style.display = 'flex';
      } else {
        // Desktop: use saved state or default to open
        if (savedState === 'true') {
          closeNav();
        } else {
          openNav();
        }
        navToggle.style.display = isMobileNow ? 'flex' : 'none';
      }
    }
    
    function openNav() {
      navSidebar.classList.remove('collapsed');
      navSidebar.classList.add('active'); // CSS ID specificity fix
      layout.classList.remove('nav-collapsed');
      navToggle.setAttribute('aria-expanded', 'true');
      if (isMobile && navOverlay) {
        navOverlay.classList.add('show');
        navOverlay.classList.add('active');
        document.body.classList.add('nav-open');
      }
    }
    
    function closeNav() {
      navSidebar.classList.add('collapsed');
      navSidebar.classList.remove('active'); // CSS ID specificity fix
      layout.classList.add('nav-collapsed');
      navToggle.setAttribute('aria-expanded', 'false');
      if (navOverlay) {
        navOverlay.classList.remove('show');
        navOverlay.classList.remove('active');
        document.body.classList.remove('nav-open');
      }
    }
    
    // Initialize on load
    initializeNavState();
    
    // Handle window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const isMobileNow = window.innerWidth <= 768;
        navToggle.style.display = isMobileNow ? 'flex' : 'none';
        if (!isMobileNow) {
          // Desktop: auto-open if collapsed
          if (navSidebar.classList.contains('collapsed')) {
            openNav();
          }
          navOverlay.classList.remove('show');
        }
      }, 250);
    });
    
    // Toggle button click
    navToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isCurrentlyCollapsed = navSidebar.classList.contains('collapsed');

      if (isCurrentlyCollapsed) {
        openNav();
        localStorage.setItem('navSidebarCollapsed', 'false');
      } else {
        closeNav();
        localStorage.setItem('navSidebarCollapsed', 'true');
      }
    });

    // Close nav when clicking overlay
    navOverlay.addEventListener('click', () => {
      closeNav();
      localStorage.setItem('navSidebarCollapsed', 'true');
    });

    // Close navigation after selecting an item on mobile
    navSidebar.addEventListener('click', (event) => {
      const link = event.target.closest('a.nav-item');
      if (link && isMobile) {
        // Small delay to allow navigation to process
        setTimeout(() => {
          closeNav();
          localStorage.setItem('navSidebarCollapsed', 'true');
        }, 100);
      }
    });
    
    console.log('✅ Navigation toggle setup complete');
  }
  
  // Fix the navigation HTML structure if needed
  function fixNavigationHTML() {
    console.log('🔧 Checking navigation HTML...');
    
    const nav = document.querySelector('#site-nav');
    if (!nav) {
      console.warn('Navigation element not found');
      return;
    }
    
    // Ensure all nav items have correct attributes
    nav.querySelectorAll('.nav-item, .nav-pill').forEach(item => {
      if (!item.getAttribute('href')) {
        const view = item.dataset.view;
        if (view) {
          item.setAttribute('href', `#/${view}`);
        }
      }
    });
    
    // Add missing navigation items if needed
    const expectedNavItems = [
      { href: '#/hub', text: 'Home', view: 'hub' },
      { href: '#/roster', text: 'Roster', view: 'roster' },
      { href: '#/contracts', text: 'Contracts', view: 'contracts' },
      { href: '#/trade', text: 'Trades', view: 'trade' },
      { href: '#/standings', text: 'Standings', view: 'standings' },
      { href: '#/freeagency', text: 'Free Agency', view: 'freeagency' },
      { href: '#/draft', text: 'Draft', view: 'draft' },
      { href: '#/scouting', text: 'Scouting', view: 'scouting' },
      { href: '#/coaching', text: 'Coaching', view: 'coaching' },
      { href: '#/playerDatabase', text: 'Players', view: 'playerDatabase' },
      { href: '#/history', text: 'History', view: 'history' },
      { href: '#/records', text: 'Records', view: 'records' },
      { href: '#/hallOfFame', text: 'Hall of Fame', view: 'hallOfFame' },
      { href: '#/settings', text: 'Settings', view: 'settings' }
    ];
    
    expectedNavItems.forEach(item => {
      const existingLink = nav.querySelector(`[href="${item.href}"]`);
      if (!existingLink) {
        console.log('Adding missing nav item:', item.text);
        const newLink = document.createElement('a');
        newLink.href = item.href;
        newLink.className = 'nav-item'; // Use nav-item for sidebar style
        newLink.dataset.view = item.view;
        newLink.textContent = item.text;
        nav.appendChild(newLink);
      }
    });
    
    console.log('✅ Navigation HTML checked and fixed');
  }
  
  // Main initialization function
  function initializeNavigationFix() {
    console.log('🚀 Initializing complete navigation fix...');
    
    // Fix HTML structure
    fixNavigationHTML();
    
    // Fix CSS styles
    fixNavigationStyles();
    
    // Set up enhanced event handling
    setupNavigation();
    
    // Override the global router
    window.router = fixedRouter;
    
    // Initial route
    setTimeout(() => {
      console.log('🎯 Running initial route...');
      fixedRouter();
    }, 100);
    
    console.log('✅ Complete navigation fix initialized');
  }
  
  // Diagnostic function
  function diagnoseNavigation() {
    console.log('🔍 Navigation Diagnostic');
    console.log('========================');
    
    const nav = document.querySelector('#site-nav');
    const pills = document.querySelectorAll('.nav-pill');
    const views = document.querySelectorAll('.view');
    
    console.log('Navigation container found:', !!nav);
    console.log('Navigation pills found:', pills.length);
    console.log('Views found:', views.length);
    
    console.log('Navigation pills:');
    pills.forEach((pill, i) => {
      const href = pill.getAttribute('href');
      const text = pill.textContent;
      const active = pill.getAttribute('aria-current') === 'page' || pill.classList.contains('active');
      console.log(`  ${i + 1}. "${text}" -> ${href} ${active ? '(ACTIVE)' : ''}`);
    });
    
    console.log('Views:');
    views.forEach((view, i) => {
      const id = view.id;
      const hidden = view.hidden;
      const display = view.style.display;
      const visible = !hidden && display !== 'none';
      console.log(`  ${i + 1}. #${id} - Hidden: ${hidden}, Display: ${display}, Visible: ${visible}`);
    });
    
    console.log('Current hash:', location.hash);
    console.log('========================');
  }
  
  // Expose functions globally for debugging
  window.fixNavigation = initializeNavigationFix;
  window.diagnoseNavigation = diagnoseNavigation;
  window.fixedRouter = fixedRouter;
  
  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeNavigationFix);
  } else {
    // Run immediately if DOM is ready
    setTimeout(initializeNavigationFix, 100);
  }
  
  console.log('💡 Navigation fix loaded. Available commands:');
  console.log('- fixNavigation() - Apply complete navigation fix');
  console.log('- diagnoseNavigation() - Show navigation diagnostic');
  
})();

// ============================================================================
// DOM HELPERS FIX (from dom-helpers-fix.js)
// ============================================================================

/**
 * Consistent DOM helper functions to replace jQuery-style syntax
 * These functions provide a unified way to access DOM elements
 */

/**
 * Get element by ID (replacement for jQuery $())
 * @param {string} id - Element ID
 * @returns {Element|null} DOM element or null
 */
function $(id) {
  if (typeof id === 'string') {
    // Remove # if provided (for jQuery compatibility)
    const cleanId = id.startsWith('#') ? id.substring(1) : id;
    return document.getElementById(cleanId);
  }
  return id; // Return as-is if already an element
}

/**
 * Get element value safely
 * @param {string|Element} elementOrId - Element or element ID
 * @returns {string} Element value or empty string
 */
function getValue(elementOrId) {
  const element = typeof elementOrId === 'string' ? $(elementOrId) : elementOrId;
  return element && element.value !== undefined ? element.value : '';
}

/**
 * Set element value safely
 * @param {string|Element} elementOrId - Element or element ID
 * @param {any} value - Value to set
 */
function setValue(elementOrId, value) {
  const element = typeof elementOrId === 'string' ? $(elementOrId) : elementOrId;
  if (element && element.value !== undefined) {
    element.value = value;
  }
}

/**
 * Get element text content safely
 * @param {string|Element} elementOrId - Element or element ID
 * @returns {string} Text content or empty string
 */
function getText(elementOrId) {
  const element = typeof elementOrId === 'string' ? $(elementOrId) : elementOrId;
  return element ? element.textContent : '';
}

/**
 * Set element text content safely
 * @param {string|Element} elementOrId - Element or element ID
 * @param {string} text - Text to set
 */
function setText(elementOrId, text) {
  const element = typeof elementOrId === 'string' ? $(elementOrId) : elementOrId;
  if (element) {
    element.textContent = text;
  }
}

/**
 * Get element innerHTML safely
 * @param {string|Element} elementOrId - Element or element ID
 * @returns {string} HTML content or empty string
 */
function getHTML(elementOrId) {
  const element = typeof elementOrId === 'string' ? $(elementOrId) : elementOrId;
  return element ? element.innerHTML : '';
}

/**
 * Set element innerHTML safely
 * @param {string|Element} elementOrId - Element or element ID
 * @param {string} html - HTML to set
 */
function setHTML(elementOrId, html) {
  const element = typeof elementOrId === 'string' ? $(elementOrId) : elementOrId;
  if (element) {
    element.innerHTML = html;
  }
}

/**
 * Show element (set display to block)
 * @param {string|Element} elementOrId - Element or element ID
 */
function show(elementOrId) {
  const element = typeof elementOrId === 'string' ? $(elementOrId) : elementOrId;
  if (element) {
    element.style.display = 'block';
    element.hidden = false;
  }
}

/**
 * Hide element (set display to none)
 * @param {string|Element} elementOrId - Element or element ID
 */
function hide(elementOrId) {
  const element = typeof elementOrId === 'string' ? $(elementOrId) : elementOrId;
  if (element) {
    element.style.display = 'none';
    element.hidden = true;
  }
}

/**
 * Add class to element
 * @param {string|Element} elementOrId - Element or element ID
 * @param {string} className - Class to add
 */
function addClass(elementOrId, className) {
  const element = typeof elementOrId === 'string' ? $(elementOrId) : elementOrId;
  if (element && element.classList) {
    element.classList.add(className);
  }
}

/**
 * Remove class from element
 * @param {string|Element} elementOrId - Element or element ID
 * @param {string} className - Class to remove
 */
function removeClass(elementOrId, className) {
  const element = typeof elementOrId === 'string' ? $(elementOrId) : elementOrId;
  if (element && element.classList) {
    element.classList.remove(className);
  }
}

/**
 * Check if element has class
 * @param {string|Element} elementOrId - Element or element ID
 * @param {string} className - Class to check
 * @returns {boolean} True if element has class
 */
function hasClass(elementOrId, className) {
  const element = typeof elementOrId === 'string' ? $(elementOrId) : elementOrId;
  return element && element.classList ? element.classList.contains(className) : false;
}

/**
 * Get all elements by selector
 * @param {string} selector - CSS selector
 * @returns {NodeList} Node list of elements
 */
function $$(selector) {
  return document.querySelectorAll(selector);
}

/**
 * Get first element by selector
 * @param {string} selector - CSS selector
 * @returns {Element|null} First matching element or null
 */
function $1(selector) {
  return document.querySelector(selector);
}

/**
 * Add event listener safely
 * @param {string|Element} elementOrId - Element or element ID
 * @param {string} event - Event name
 * @param {Function} handler - Event handler function
 */
function on(elementOrId, event, handler) {
  const element = typeof elementOrId === 'string' ? $(elementOrId) : elementOrId;
  if (element && typeof handler === 'function') {
    element.addEventListener(event, handler);
  }
}

// Make DOM helpers globally available
window.$ = $;
window.getValue = getValue;
window.setValue = setValue;
window.getText = getText;
window.setText = setText;
window.getHTML = getHTML;
window.setHTML = setHTML;
window.show = show;
window.hide = hide;
window.addClass = addClass;
window.removeClass = removeClass;
window.hasClass = hasClass;
window.$$ = $$;
window.$1 = $1;
window.on = on;

// ============================================================================
// CRITICAL FIXES (from critical-fixes.js)
// Includes: click handlers, navigation toggle, and iOS optimization
// ============================================================================

(function() {
  console.log('🔧 Loading critical fixes...');

  // ============================================================================
  // FIX 1: Ensure click handlers work properly
  // ============================================================================
  
  function fixClickHandlers() {
    console.log('🔧 Fixing click handlers...');
    
    // Use event delegation with capture phase to ensure clicks are caught
    document.addEventListener('click', function(e) {
      const target = e.target;
      const targetId = target.id;
      const targetClass = target.className;
      
      // Handle onboarding buttons
      if (targetId === 'onboardStart' || target.closest('#onboardStart')) {
        e.preventDefault();
        e.stopPropagation();
        console.log('✅ Start Season button clicked');
        if (window.handleOnboardStart) {
          window.handleOnboardStart(e).catch(err => {
            console.error('Failed to start onboarding:', err);
            window.setStatus?.('Failed to start game. Please try again.', 'error');
          });
        } else if (window.initNewGame) {
          // Fallback: direct call to initNewGame
          const teamSelect = document.getElementById('onboardTeam');
          const chosenMode = document.querySelector('input[name="namesMode"]:checked')?.value || 'fictional';
          const teamIdx = teamSelect?.value ?? '0';
          
          if (teamSelect && teamSelect.value !== '') {
            window.initNewGame({ chosenMode, teamIdx }).catch(err => {
              console.error('Failed to initialize game:', err);
              window.setStatus?.('Failed to start game. Please try again.', 'error');
            });
          } else {
            window.setStatus?.('Please select a team first.', 'error');
          }
        } else {
          console.error('initNewGame function not available');
          window.setStatus?.('Game initialization system not ready. Please refresh the page.', 'error');
        }
        return false;
      }
      
      if (targetId === 'onboardRandom' || target.closest('#onboardRandom')) {
        e.preventDefault();
        e.stopPropagation();
        console.log('✅ Random team button clicked');
        if (window.handleOnboardRandom) {
          window.handleOnboardRandom(e).catch(err => {
            console.error('Failed to select random team:', err);
          });
        } else {
          // Fallback: direct random selection
          const teamSelect = document.getElementById('onboardTeam');
          if (teamSelect && teamSelect.options.length > 0) {
            const randomIndex = Math.floor(Math.random() * teamSelect.options.length);
            teamSelect.selectedIndex = randomIndex;
          }
        }
        return false;
      }
      
      // Handle navigation toggle
      if (targetId === 'navToggle' || target.closest('#navToggle')) {
        e.preventDefault();
        e.stopPropagation();
        console.log('✅ Navigation toggle clicked');
        toggleNavigation();
        return false;
      }
      
      // Handle other critical buttons
      if (targetId === 'btnNewLeague') {
        e.preventDefault();
        e.stopPropagation();
        if (window.handleNewLeague) {
          window.handleNewLeague(e);
        } else if (window.gameController?.startNewLeague) {
          window.gameController.startNewLeague();
        }
        return false;
      }
      
      if (targetId === 'btnSave') {
        e.preventDefault();
        e.stopPropagation();
        if (window.saveState) {
          window.saveState();
          window.setStatus?.('Game saved!', 'success');
        }
        return false;
      }
      
      if (targetId === 'btnLoad') {
        e.preventDefault();
        e.stopPropagation();
        if (window.handleLoadGame) {
          window.handleLoadGame(e);
        } else if (window.loadState) {
          try {
            const loaded = window.loadState();
            if (loaded) {
              window.state = loaded;
              location.reload();
            } else {
              window.setStatus?.('No save file found!', 'error');
            }
          } catch (err) {
            console.error('Error loading game:', err);
            window.setStatus?.('Failed to load game. Please try again.', 'error');
          }
        } else {
          window.setStatus?.('Load system not available. Please refresh the page.', 'error');
        }
        return false;
      }
    }, true); // Use capture phase
    
    console.log('✅ Click handlers fixed');
  }
  
  // ============================================================================
  // FIX 2: Navigation toggle functionality
  // ============================================================================
  
  function toggleNavigation() {
    const navSidebar = document.getElementById('nav-sidebar');
    const navToggle = document.getElementById('navToggle');
    const layout = document.querySelector('.layout');
    // Prioritize existing menu-overlay
    const navOverlay = document.getElementById('menu-overlay') || document.getElementById('navOverlay');
    const isMobile = window.innerWidth < 1024;
    
    if (!navSidebar || !navToggle) {
      console.warn('Navigation elements not found');
      return;
    }
    
    const isCollapsed = navSidebar.classList.contains('collapsed');
    
    if (isCollapsed) {
      // Expand navigation
      navSidebar.classList.remove('collapsed');
      navSidebar.classList.add('nav-open'); // Mobile compat
      navSidebar.classList.add('active'); // CSS ID specificity fix
      document.body.classList.add('nav-open'); // Mobile compat
      if (layout) layout.classList.remove('nav-collapsed');
      navToggle.setAttribute('aria-expanded', 'true');
      localStorage.setItem('navSidebarCollapsed', 'false');
      
      // Show overlay on mobile
      if (isMobile && navOverlay) {
        navOverlay.style.display = 'block';
        navOverlay.classList.add('show');
        navOverlay.classList.add('active');
      }
      console.log('✅ Navigation expanded');
    } else {
      // Collapse navigation
      navSidebar.classList.add('collapsed');
      navSidebar.classList.remove('nav-open'); // Mobile compat
      navSidebar.classList.remove('active'); // CSS ID specificity fix
      document.body.classList.remove('nav-open'); // Mobile compat
      if (layout) layout.classList.add('nav-collapsed');
      navToggle.setAttribute('aria-expanded', 'false');
      localStorage.setItem('navSidebarCollapsed', 'true');
      
      // Hide overlay
      if (navOverlay) {
        navOverlay.style.display = 'none';
        navOverlay.classList.remove('show');
        navOverlay.classList.remove('active');
      }
      console.log('✅ Navigation collapsed');
    }
  }
  
  function ensureNavigationToggleVisible() {
    const navToggle = document.getElementById('navToggle');
    const isMobile = window.innerWidth < 1024;
    
    if (navToggle) {
      // Force visibility - especially important on mobile
      navToggle.style.display = 'flex';
      navToggle.style.visibility = 'visible';
      navToggle.style.opacity = '1';
      navToggle.style.pointerEvents = 'auto';
      navToggle.style.cursor = 'pointer';
      navToggle.style.zIndex = isMobile ? '101' : '100';
      navToggle.style.position = 'relative';
      
      // Ensure it's clickable
      navToggle.setAttribute('tabindex', '0');
      navToggle.setAttribute('role', 'button');
      navToggle.setAttribute('aria-label', 'Toggle navigation menu');
      
      // On mobile, make it more prominent
      if (isMobile) {
        navToggle.style.minWidth = '44px';
        navToggle.style.minHeight = '44px';
        navToggle.style.backgroundColor = 'var(--surface)';
        navToggle.style.border = '1px solid var(--hairline)';
        navToggle.style.borderRadius = 'var(--radius-md)';
      }
      
      console.log('✅ Navigation toggle made visible and clickable', { isMobile });
    } else {
      console.warn('⚠️ Navigation toggle button not found');
    }
  }
  
  function restoreNavigationState() {
    const navSidebar = document.getElementById('nav-sidebar');
    const navToggle = document.getElementById('navToggle');
    const layout = document.querySelector('.layout');
    
    if (!navSidebar || !navToggle) return;
    
    const savedState = localStorage.getItem('navSidebarCollapsed');
    const isSmallScreen = window.innerWidth < 1024;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    
    // On mobile, default to collapsed but allow expansion
    // On desktop, use saved state or default to open
    let shouldCollapse;
    if (isSmallScreen) {
      // Mobile: start collapsed unless user explicitly saved 'false'
      shouldCollapse = savedState !== 'false';
    } else {
      // Desktop: use saved state or default to open
      shouldCollapse = savedState === 'true';
    }

    if (shouldCollapse) {
      navSidebar.classList.add('collapsed');
      if (layout) layout.classList.add('nav-collapsed');
      navToggle.setAttribute('aria-expanded', 'false');
    } else {
      navSidebar.classList.remove('collapsed');
      if (layout) layout.classList.remove('nav-collapsed');
      navToggle.setAttribute('aria-expanded', 'true');
    }
    
    // Ensure toggle is always visible and functional
    ensureNavigationToggleVisible();
  }
  
  // ============================================================================
  // FIX 3: iOS PWA Optimization
  // ============================================================================
  
  function addIOSOptimizations() {
    // Add manifest link if not present
    if (!document.querySelector('link[rel="manifest"]')) {
      const manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      manifestLink.href = '/manifest.json';
      document.head.appendChild(manifestLink);
    }
    
    // Ensure all iOS meta tags are present
    const requiredMetaTags = {
      'apple-mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-status-bar-style': 'black-translucent',
      'apple-mobile-web-app-title': 'NFL GM',
      'mobile-web-app-capable': 'yes',
      'format-detection': 'telephone=no',
      'theme-color': '#0a0c10'
    };
    
    Object.entries(requiredMetaTags).forEach(([name, content]) => {
      const existing = document.querySelector(`meta[name="${name}"]`);
      if (!existing) {
        const meta = document.createElement('meta');
        meta.name = name;
        meta.content = content;
        document.head.appendChild(meta);
        console.log(`✅ Added meta tag: ${name}`);
      }
    });
    
    // Add viewport optimization (cross-platform)
    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head.appendChild(viewport);
    }
    // Optimize viewport for all platforms
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    const isMobile = isIOS || isAndroid || window.innerWidth < 768;
    
    if (isMobile) {
      viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
    } else {
      viewport.content = 'width=device-width, initial-scale=1.0';
    }
    
    // Prevent iOS Safari bounce/zoom (only on iOS)
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      document.addEventListener('touchmove', function(e) {
        // Only prevent pinch zoom, allow single finger scrolling
        if (e.touches.length > 1) {
          e.preventDefault();
        }
      }, { passive: false });
      
      // Prevent double-tap zoom (but allow single taps)
      let lastTouchEnd = 0;
      document.addEventListener('touchend', function(e) {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
          e.preventDefault();
        }
        lastTouchEnd = now;
      }, false);
    }
    
    console.log('✅ iOS optimizations added');
  }

  // ============================================================================
  // FIX 5: Modal Accessibility
  // ============================================================================

  function fixModalAccessibility() {
    console.log('🔧 Fixing modal accessibility...');
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      let closed = false;

      // 1. Dynamic modals
      document.querySelectorAll('.modal').forEach(modal => {
        if (closed || modal.id === 'onboardModal') return;
        if (modal.style.display !== 'none' && !modal.hidden && modal.offsetWidth > 0) {
          const closeBtn = modal.querySelector('.close');
          if (closeBtn) closeBtn.click();
          else if (modal.parentElement === document.body) modal.remove();
          else { modal.hidden = true; modal.style.display = 'none'; }
          console.log('✅ Closed dynamic modal');
          closed = true;
        }
      });
      if (closed) return;

      // 2. Static modals
      ['gameResultsModal', 'errorOverlay'].forEach(id => {
        if (closed) return;
        const m = document.getElementById(id);
        if (m && !m.hidden && m.style.display !== 'none') {
             if (id === 'errorOverlay') m.querySelector('#errorClose')?.click();
             else {
                 m.hidden = true; m.style.display = 'none';
                 if (id === 'gameResultsModal') window.gameResultsViewer?.hideModal();
             }
             console.log(`✅ Closed ${id}`);
             closed = true;
        }
      });
    });
    console.log('✅ Modal accessibility fixed');
  }
  
  // ============================================================================
  // FIX 4: Ensure event listeners are initialized
  // ============================================================================
  
  function ensureEventListenersInitialized() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeAll);
    } else {
      initializeAll();
    }
  }
  
  function initializeAll() {
    if (window.__criticalFixesInitialized) {
        console.log('✅ Critical fixes already initialized');
        return;
    }
    window.__criticalFixesInitialized = true;

    console.log('🚀 Initializing all critical fixes...');
    
    // Fix click handlers
    fixClickHandlers();
    
    // Ensure navigation toggle is visible and functional
    ensureNavigationToggleVisible();
    restoreNavigationState();
    
    // Add iOS optimizations
    addIOSOptimizations();

    // Fix modal accessibility
    fixModalAccessibility();
    
    // Ensure setupEventListeners is called if available
    if (window.setupEventListeners && typeof window.setupEventListeners === 'function') {
      try {
        window.setupEventListeners();
        console.log('✅ Global event listeners set up');
      } catch (err) {
        console.error('Error setting up global event listeners:', err);
      }
    }
    
    // Ensure bindOnboardingControls is called
    if (window.bindOnboardingControls && typeof window.bindOnboardingControls === 'function') {
      try {
        window.bindOnboardingControls();
        console.log('✅ Onboarding controls bound');
      } catch (err) {
        console.error('Error binding onboarding controls:', err);
      }
    }
    
    // Make sure buttons are clickable
    setTimeout(() => {
      const buttons = document.querySelectorAll('button');
      buttons.forEach(btn => {
        btn.style.pointerEvents = 'auto';
        btn.style.cursor = 'pointer';
        if (btn.disabled) {
          btn.style.opacity = '0.6';
        }
      });
    }, 100);
    
    // Ensure onboarding modal is shown if game isn't ready
    // Also ensure game results modal is closed
    setTimeout(() => {
      try {
        const currentState = window.state || {};
        if (!currentState.league || !currentState.onboarded) {
          const modal = document.getElementById('onboardModal');
          if (modal && modal.hidden) {
            console.log('🎯 Game not ready - ensuring onboarding modal is visible');
            if (window.openOnboard && typeof window.openOnboard === 'function') {
              window.openOnboard().catch(err => {
                console.error('Failed to open onboarding modal:', err);
                // Fallback: manually show modal
                modal.hidden = false;
                modal.style.display = 'flex';
              });
            } else {
              // Fallback: manually show modal
              modal.hidden = false;
              modal.style.display = 'flex';
            }
          }
        }
        
        // Force close game results modal if it's open
        const gameResultsModal = document.getElementById('gameResultsModal');
        if (gameResultsModal && !gameResultsModal.hidden) {
          console.log('🔒 Closing game results modal that was auto-opened');
          gameResultsModal.hidden = true;
          gameResultsModal.style.display = 'none';
          gameResultsModal.style.visibility = 'hidden';
          gameResultsModal.style.opacity = '0';
          document.body.style.overflow = 'auto';
          if (window.gameResultsViewer && typeof window.gameResultsViewer.hideModal === 'function') {
            window.gameResultsViewer.hideModal();
          }
        }
      } catch (err) {
        console.error('Error checking game state:', err);
      }
    }, 500);
    
    console.log('✅ All critical fixes initialized');
  }
  
  // ============================================================================
  // EXPORT FUNCTIONS
  // ============================================================================
  
  window.toggleNavigation = toggleNavigation;
  window.fixClickHandlers = fixClickHandlers;
  window.ensureNavigationToggleVisible = ensureNavigationToggleVisible;
  
  // Initialize immediately
  ensureEventListenersInitialized();
  
  // Also initialize after a short delay to catch late-loading elements
  setTimeout(initializeAll, 500);
  
  // Force close game results modal on startup (multiple checks to be sure)
  function forceCloseGameResultsModal() {
    const modal = document.getElementById('gameResultsModal');
    if (modal) {
      modal.hidden = true;
      modal.style.display = 'none';
      modal.style.visibility = 'hidden';
      modal.style.opacity = '0';
      document.body.style.overflow = 'auto';
      if (window.gameResultsViewer && typeof window.gameResultsViewer.hideModal === 'function') {
        window.gameResultsViewer.hideModal();
      }
    }
  }
  
  // Close modal immediately if it exists
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(forceCloseGameResultsModal, 50);
    });
  } else {
    setTimeout(forceCloseGameResultsModal, 50);
  }
  
  // Also close on window load
  window.addEventListener('load', forceCloseGameResultsModal);
  
  // Periodic check to ensure it stays closed (for first 3 seconds)
  let checkCount = 0;
  const closeCheckInterval = setInterval(() => {
    checkCount++;
    forceCloseGameResultsModal();
    if (checkCount >= 6) { // Check 6 times over 3 seconds
      clearInterval(closeCheckInterval);
    }
  }, 500);
  
  console.log('✅ Critical fixes loaded');
})();

/**
 * Sets up coaching view tabs
 */
function setupCoachingTabs() {
  const tabButtons = document.querySelectorAll('#coaching .tab-btn');
  const tabContents = document.querySelectorAll('#coaching .tab-content');
  
  tabButtons.forEach(btn => {
    if (btn._hasListener) return;
    btn._hasListener = true;
    
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      
      // Update active states
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const targetContent = document.getElementById(tabName === 'scheme' ? 'schemeManagement' : 'coaching-content');
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}

window.setupCoachingTabs = setupCoachingTabs;

console.log('✅ Combined fixes.js loaded - includes error-overlay, missing-functions, league-creation-fix, team-selection-fix, navbar-fix, dom-helpers-fix, and critical-fixes');
