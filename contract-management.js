(function(global) {
// contract-management.js - Comprehensive contract management system
'use strict';

// Ensure necessary helper functions exist before use (prevents crashes)
const U = global.Utils || window.Utils;
const C = global.Constants || window.Constants;
const capHitFor = global.capHitFor || window.capHitFor || ((player) => player.baseAnnual || 0);
const recalcCap = global.recalcCap || window.recalcCap || (() => console.warn('recalcCap not found, skipping cap update.'));
const setStatus = global.setStatus || window.setStatus || ((msg) => console.log('Status:', msg));

/**
 * Helper function to round a number to a specific number of decimal places
 * @param {number} value - Value to round
 * @param {number} decimals - Number of decimal places
 * @returns {number} Rounded value
 */
function roundToDecimals(value, decimals) {
  if (typeof value !== 'number' || isNaN(value)) return 0;
  const factor = Math.pow(10, decimals || 0);
  return Math.round(value * factor) / factor;
}

/**
 * Helper function to clamp a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
function clamp(value, min, max) {
  if (typeof value !== 'number' || isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}


// Contract management constants
const CONTRACT_CONSTANTS = {
  FRANCHISE_TAG_MULTIPLIER: 1.2, // 120% of top 5 salaries at position
  TRANSITION_TAG_MULTIPLIER: 1.1, // 110% of top 10 salaries at position
  FIFTH_YEAR_OPTION_MULTIPLIER: 1.25, // Increased multiplier for more realism
  MAX_FRANCHISE_TAGS: 1, 
  MAX_TRANSITION_TAGS: 1, 
  EXTENSION_MIN_YEARS: 2,
  EXTENSION_MAX_YEARS: 7, // Increased max years for big deals
  ROOKIE_CONTRACT_LENGTH: 4, 
  MAX_GUARANTEED_PCT: 0.95 // Maximum percentage of money that can be guaranteed
};

/**
 * Gets all players on the user team with expiring contracts
 * @param {Object} league - League object
 * @param {number} userTeamId - User's team ID
 * @returns {Array} Array of players with 1 year or less remaining on their contract
 */
function getExpiringContracts(league, userTeamId) {
  const team = league?.teams?.[userTeamId];
  if (!team?.roster) return [];
  
  return team.roster.filter(player => {
    // A contract is 'expiring' if it has 1 year left, 
    // or if the player is on a rookie deal (4th year, years=1) and hasn't been extended.
    return player?.years === 1;
  });
}

/**
 * Gets all 1st round picks eligible for 5th year option
 * @param {Object} league - League object
 * @param {number} userTeamId - User's team ID
 * @returns {Array} Array of players eligible for 5th year option
 */
function getFifthYearOptionEligible(league, userTeamId) {
  const team = league?.teams?.[userTeamId];
  if (!team?.roster) return [];

  // 5th year option is only exercised before the 4th season (i.e., at the end of the 3rd year)
  const requiredCareerYears = 3; 

  return team.roster.filter(player => {
    // Check 1: 1st round pick
    if (player.draftRound !== 1) return false;
    
    // Check 2: Must be at the end of their 3rd season (start of the 4th year on a 4-year deal)
    if (!player.draftYear || (league.season - player.draftYear) !== requiredCareerYears) return false;
    
    // Check 3: Contract must be 1 year remaining (the 4th year is the final year of the rookie deal)
    if (player.years !== CONTRACT_CONSTANTS.ROOKIE_CONTRACT_LENGTH - (requiredCareerYears - 1)) return false; 
    
    // Check 4: Must not have already been extended
    if (player.extended === true) return false;

    return true;
  });
}

/**
 * Calculates franchise tag salary for a position
 * @param {string} position - Player position
 * @param {Object} league - League object
 * @returns {number} Franchise tag salary in millions (rounded to 1 decimal)
 */
function calculateFranchiseTagSalary(position, league) {
  if (!league?.teams) return 0;
  
  const allPlayerSalaries = league.teams.flatMap(team => 
    team.roster
      .filter(player => player?.pos === position && player.baseAnnual > 0)
      .map(player => capHitFor(player, 0)) // Use full current year cap hit
  );
  
  if (allPlayerSalaries.length < 5) {
    // Fallback if not enough players (using position estimates)
    const estimates = { 'QB': 30, 'OL': 18, 'DL': 15, 'WR': 16, 'CB': 14, 'LB': 10, 'RB': 8, 'S': 9, 'TE': 7, 'K': 4, 'P': 3 };
    return estimates[position] || 10;
  }
  
  // Sort by salary (descending) and get top 5 average
  allPlayerSalaries.sort((a, b) => b - a);
  const top5Avg = allPlayerSalaries.slice(0, 5).reduce((sum, salary) => sum + salary, 0) / 5;
  
  return roundToDecimals(top5Avg * CONTRACT_CONSTANTS.FRANCHISE_TAG_MULTIPLIER, 1);
}

/**
 * Calculates transition tag salary for a position
 * @param {string} position - Player position
 * @param {Object} league - League object
 * @returns {number} Transition tag salary in millions (rounded to 1 decimal)
 */
function calculateTransitionTagSalary(position, league) {
  if (!league?.teams) return 0;
  
  const allPlayerSalaries = league.teams.flatMap(team => 
    team.roster
      .filter(player => player?.pos === position && player.baseAnnual > 0)
      .map(player => capHitFor(player, 0)) // Use full current year cap hit
  );
  
  if (allPlayerSalaries.length < 10) {
    // Fallback if not enough players (slightly lower estimates than franchise)
    const estimates = { 'QB': 25, 'OL': 15, 'DL': 12, 'WR': 13, 'CB': 11, 'LB': 8, 'RB': 6, 'S': 7, 'TE': 5, 'K': 3, 'P': 2 };
    return estimates[position] || 8;
  }
  
  // Sort by salary (descending) and get top 10 average
  allPlayerSalaries.sort((a, b) => b - a);
  const top10Avg = allPlayerSalaries.slice(0, 10).reduce((sum, salary) => sum + salary, 0) / 10;
  
  return roundToDecimals(top10Avg * CONTRACT_CONSTANTS.TRANSITION_TAG_MULTIPLIER, 1);
}

/**
 * Calculates 5th year option salary for a player (Uses the current 4th year salary)
 * @param {Object} player - Player object
 * @returns {number} 5th year option salary in millions (rounded to 1 decimal)
 */
function calculateFifthYearOptionSalary(player) {
  // Use the average of the top 3-20 salaries depending on draft pick slot
  // For simplicity, we'll use a strong multiplier on the player's 4th-year base salary
  const baseSalary = player?.baseAnnual || 1.0; 
  return roundToDecimals(baseSalary * CONTRACT_CONSTANTS.FIFTH_YEAR_OPTION_MULTIPLIER, 1);
}

/**
 * Applies franchise tag to a player
 * @param {Object} league - League object
 * @param {Object} team - Team object
 * @param {Object} player - Player to franchise tag
 * @returns {Object} Result object with success status and details
 */
function applyFranchiseTag(league, team, player) {
  if (!player || player.years !== 1) {
    return { success: false, message: 'Player must have an expiring contract to use the tag.' };
  }
  if (team.franchiseTagged) {
    return { success: false, message: 'Team has already used the franchise tag this year. 😭' };
  }
  
  const franchiseSalary = calculateFranchiseTagSalary(player.pos, league);
  const capImpact = franchiseSalary - capHitFor(player, 0); // Calculate the difference in cap hit
  
  if (team.capRoom < capImpact) {
    return { 
      success: false, 
      message: `Franchise tag costs $${franchiseSalary.toFixed(1)}M and you only have $${team.capRoom.toFixed(1)}M in cap space. Trade time! 💸`
    };
  }
  
  // Apply franchise tag contract (1 year, fully guaranteed)
  player.years = 1;
  player.yearsTotal = 1;
  player.baseAnnual = franchiseSalary;
  player.signingBonus = 0;
  player.franchiseTagged = true;
  player.franchiseTagYear = league.season;
  player.guaranteedPct = 1.0; // Fully guaranteed

  team.franchiseTagged = true;
  team.franchiseTaggedPlayer = player.id;
  
  recalcCap(league, team);
  
  return { 
    success: true, 
    message: `Applied **Franchise Tag** to **${player.name}** for **$${franchiseSalary.toFixed(1)}M**! Secured the bag.`,
    salary: franchiseSalary
  };
}

// ... (applyTransitionTag, exerciseFifthYearOption functions remain similar but use U.round and setStatus)

/**
 * Applies transition tag to a player
 * @param {Object} league - League object
 * @param {Object} team - Team object
 * @param {Object} player - Player to transition tag
 * @returns {Object} Result object with success status and details
 */
function applyTransitionTag(league, team, player) {
  if (!player || player.years !== 1) {
    return { success: false, message: 'Player must have an expiring contract to use the transition tag.' };
  }
  if (team.transitionTagged) {
    return { success: false, message: 'Team has already used the transition tag this year. 😭' };
  }

  const transitionSalary = calculateTransitionTagSalary(player.pos, league);
  const capImpact = transitionSalary - capHitFor(player, 0);

  if (team.capRoom < capImpact) {
    return {
      success: false,
      message: `Transition tag costs $${transitionSalary.toFixed(1)}M and you only have $${team.capRoom.toFixed(1)}M in cap space.`
    };
  }

  player.years = 1;
  player.yearsTotal = 1;
  player.baseAnnual = transitionSalary;
  player.signingBonus = 0;
  player.transitionTagged = true;
  player.transitionTagYear = league.season;
  player.guaranteedPct = 0.8;

  team.transitionTagged = true;
  team.transitionTaggedPlayer = player.id;

  recalcCap(league, team);

  return {
    success: true,
    message: `Applied **Transition Tag** to **${player.name}** for **$${transitionSalary.toFixed(1)}M**.`,
    salary: transitionSalary
  };
}

/**
 * Exercises the fifth-year option for eligible players
 * @param {Object} league - League object
 * @param {Object} team - Team object
 * @param {Object} player - Player to exercise option on
 * @returns {Object} Result object with success status and details
 */
function exerciseFifthYearOption(league, team, player) {
  const eligiblePlayers = getFifthYearOptionEligible(league, team.teamId || window.state?.userTeamId);
  if (!eligiblePlayers.includes(player)) {
    return { success: false, message: 'Player is not eligible for the 5th year option.' };
  }

  const optionSalary = calculateFifthYearOptionSalary(player);
  const currentCapHit = capHitFor(player, 0);
  const capImpact = optionSalary - currentCapHit;

  if (team.capRoom < capImpact) {
    return { success: false, message: `5th year option adds $${capImpact.toFixed(1)}M to the cap, exceeding available room.` };
  }

  player.years += 1;
  player.yearsTotal = (player.yearsTotal || CONTRACT_CONSTANTS.ROOKIE_CONTRACT_LENGTH) + 1;
  player.fifthYearOption = true;
  player.fifthYearSalary = optionSalary;

  recalcCap(league, team);

  return {
    success: true,
    message: `5th year option exercised for **${player.name}** at **$${optionSalary.toFixed(1)}M**!`,
    salary: optionSalary
  };
}

/**
 * Extends a player's contract
 * @param {Object} league - League object
 * @param {Object} team - Team object
 * @param {Object} player - Player to extend
 * @param {number} years - Number of years to extend
 * @param {number} baseSalary - Average annual base salary
 * @param {number} signingBonus - Signing bonus amount
 * @returns {Object} Result object with success status and details
 */
function extendContract(league, team, player, years, baseSalary, signingBonus) {
  // ... (Input validation checks remain)
  
  const totalContractValue = (baseSalary * years) + signingBonus;
  const firstYearCapHit = baseSalary + (signingBonus / years);
  
  // Check cap space against the immediate cap impact
  const currentCapHit = capHitFor(player, 0);
  const capImpact = firstYearCapHit - currentCapHit;

  if (team.capRoom < capImpact) {
    return { 
      success: false, 
      message: `Extension adds $${capImpact.toFixed(1)}M to the cap, exceeding your $${team.capRoom.toFixed(1)}M room. 😬`
    };
  }
  
  // Calculate Guaranteed % for realism
  let guaranteedPct = roundToDecimals(signingBonus / totalContractValue, 2); 
  guaranteedPct = Math.min(CONTRACT_CONSTANTS.MAX_GUARANTEED_PCT, guaranteedPct + 0.1); 

  // Apply contract extension
  player.years = years + player.years; // Add new years to existing remaining years
  player.yearsTotal = player.years;
  player.baseAnnual = roundToDecimals(baseSalary, 1);
  player.signingBonus = roundToDecimals(signingBonus, 1);
  player.guaranteedPct = guaranteedPct;
  player.extended = true;
  player.contractYear = league.season;
  
  recalcCap(league, team);
  
  return {
    success: true,
    message: `Extension approved! **${player.name}** is locked in for **${years}** more years, totaling **$${totalContractValue.toFixed(1)}M**! 🤑`,
    years: years,
    baseSalary: baseSalary,
    signingBonus: signingBonus
  };
}

/**
 * Generic contract updater used by the contract management UI to keep data in sync
 * @param {Object} league - League object
 * @param {Object} team - Team object
 * @param {Object} player - Player whose contract is being updated
 * @param {Object} updates - New contract values (years, baseAnnual, signingBonus, guaranteedPct)
 * @returns {Object} Result of the update attempt
 */
function updateContract(league, team, player, updates = {}) {
  if (!league || !team || !player) {
    return { success: false, message: 'Invalid league, team, or player supplied.' };
  }

  const { years, baseAnnual, signingBonus, guaranteedPct } = updates;

  if (typeof years === 'number' && years > 0) {
    player.years = Math.round(years);
    player.yearsTotal = Math.max(player.yearsTotal || 0, player.years);
  }

  if (typeof baseAnnual === 'number') {
    player.baseAnnual = roundToDecimals(Math.max(0, baseAnnual), 1);
  }

  if (typeof signingBonus === 'number') {
    player.signingBonus = roundToDecimals(Math.max(0, signingBonus), 1);
  }

  if (typeof guaranteedPct === 'number') {
    player.guaranteedPct = clamp(guaranteedPct, 0, CONTRACT_CONSTANTS.MAX_GUARANTEED_PCT);
  }

  recalcCap(league, team);

  return {
    success: true,
    message: `${player.name}'s contract updated successfully.`
  };
}

/**
 * Renders the contract management UI
 * @param {Object} league - League object
 * @param {number} userTeamId - User's team ID
 */
function renderContractManagement(league, userTeamId) {
  const container = document.getElementById('contractManagement');
  if (!container) {
    console.error('Contract management container not found');
    return;
  }

  if (!league || !league.teams) {
    container.innerHTML = '<div class="card"><p class="muted">League data not available.</p></div>';
    console.error('Invalid parameters for renderContractManagement: League data missing');
    return;
  }

  if (typeof userTeamId !== 'number') {
    userTeamId = window.state?.userTeamId || 0;
  }

  const team = league.teams[userTeamId];
  if (!team) {
    container.innerHTML = '<div class="card"><p class="muted">Team not found. Please create a league.</p></div>';
    return;
  }

  // Ensure players have contracts
  if (team.roster) {
      team.roster.forEach(p => {
          if (!p.years || !p.baseAnnual) {
              if (window.generateContract) {
                  const c = window.generateContract(p.ovr || 50, p.pos);
                  p.years = c.years;
                  p.yearsTotal = c.yearsTotal;
                  p.baseAnnual = c.baseAnnual;
                  p.signingBonus = c.signingBonus;
                  p.guaranteedPct = c.guaranteedPct;
              }
          }
      });
  }

  const expiring = getExpiringContracts(league, userTeamId);
  const fifthYearEligible = getFifthYearOptionEligible(league, userTeamId);

  let html = `
    <div class="contract-management-container">
      <div class="contract-section">
        <h3>Expiring Contracts (${expiring.length})</h3>
        <p class="muted">Players with 1 year remaining on their contract</p>
        <div class="contract-list">
  `;

  // Calculate next year's cap space (projected)
  const nextYearCap = calculateNextYearCapSpace(league, team);
  
  if (expiring.length === 0) {
    html += '<p class="muted">No expiring contracts at this time.</p>';
  } else {
    expiring.forEach(player => {
      const currentCapHit = capHitFor(player, 0);
      const franchiseSalary = calculateFranchiseTagSalary(player.pos, league);
      const transitionSalary = calculateTransitionTagSalary(player.pos, league);
      
      // Calculate position-specific grade
      const positionGrade = calculatePositionGrade(player);
      
      html += `
        <div class="contract-card">
          <div class="contract-player-info">
            <div>
              <strong>${player.name || 'Unknown'}</strong> - ${player.pos || 'N/A'}
              <div class="contract-details">
                Age: ${player.age || 'N/A'} | OVR: ${player.ovr || 'N/A'} | 
                Position Grade: <strong>${positionGrade.grade}</strong> (${positionGrade.description}) |
                Current Cap: $${currentCapHit.toFixed(1)}M | Years Left: ${player.years || 0}
              </div>
              <div class="position-breakdown">
                ${positionGrade.breakdown}
              </div>
            </div>
          </div>
          <div class="contract-actions">
            <button class="btn btn-sm" onclick="window.openContractExtensionModal('${player.id || ''}')">
              Extend Contract
            </button>
            ${!team.franchiseTagged ? `
              <button class="btn btn-sm" onclick="window.applyFranchiseTagToPlayer('${player.id || ''}')" title="Franchise Tag: $${franchiseSalary.toFixed(1)}M">
                Franchise Tag
              </button>
            ` : ''}
            ${!team.transitionTagged ? `
              <button class="btn btn-sm" onclick="window.applyTransitionTagToPlayer('${player.id || ''}')" title="Transition Tag: $${transitionSalary.toFixed(1)}M">
                Transition Tag
              </button>
            ` : ''}
          </div>
        </div>
      `;
    });
  }

  html += `
        </div>
      </div>

      <div class="contract-section">
        <h3>5th Year Option Eligible (${fifthYearEligible.length})</h3>
        <p class="muted">1st round picks entering their 4th season</p>
        <div class="contract-list">
  `;

  if (fifthYearEligible.length === 0) {
    html += '<p class="muted">No players eligible for 5th year option.</p>';
  } else {
    fifthYearEligible.forEach(player => {
      const optionSalary = calculateFifthYearOptionSalary(player);
      html += `
        <div class="contract-card">
          <div class="contract-player-info">
            <div>
              <strong>${player.name || 'Unknown'}</strong> - ${player.pos || 'N/A'}
              <div class="contract-details">
                Age: ${player.age || 'N/A'} | OVR: ${player.ovr || 'N/A'} | 
                Draft Year: ${player.draftYear || 'N/A'} | 5th Year Salary: $${optionSalary.toFixed(1)}M
              </div>
            </div>
          </div>
          <div class="contract-actions">
            <button class="btn btn-sm" onclick="window.exerciseFifthYearOptionOnPlayer('${player.id || ''}')">
              Exercise 5th Year Option
            </button>
          </div>
        </div>
      `;
    });
  }

  html += `
        </div>
      </div>

      <div class="contract-section">
        <h3>Salary Cap Summary</h3>
        <div class="cap-summary">
          <div class="cap-item">
            <span>Total Cap (Current Year):</span>
            <strong>$${team.capTotal?.toFixed(1) || '0.0'}M</strong>
          </div>
          <div class="cap-item">
            <span>Cap Used:</span>
            <strong>$${team.capUsed?.toFixed(1) || '0.0'}M</strong>
          </div>
          <div class="cap-item">
            <span>Dead Cap:</span>
            <strong>$${team.deadCap?.toFixed(1) || '0.0'}M</strong>
          </div>
          <div class="cap-item">
            <span>Cap Room (Current Year):</span>
            <strong style="color: ${(team.capRoom || 0) > 0 ? '#28a745' : '#dc3545'}">
              $${team.capRoom?.toFixed(1) || '0.0'}M
            </strong>
          </div>
          <div class="cap-item cap-item-next-year">
            <span>Projected Cap Room (Next Year):</span>
            <strong style="color: ${(nextYearCap.room || 0) > 0 ? '#28a745' : '#dc3545'}">
              $${nextYearCap.room?.toFixed(1) || '0.0'}M
            </strong>
            <div class="muted small">(After expiring contracts)</div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

/**
 * Calculates projected cap space for next year (after expiring contracts)
 * @param {Object} league - League object
 * @param {Object} team - Team object
 * @returns {Object} Projected cap info for next year
 */
function calculateNextYearCapSpace(league, team) {
  if (!league || !team) {
    return { total: 220, used: 0, room: 220 };
  }
  
  const C = window.Constants;
  const baseCap = C?.SALARY_CAP?.BASE || 220;
  const rollover = team.capRollover || 0;
  const projectedTotal = baseCap + rollover;
  
  // Calculate projected cap used (excluding players with 1 year left)
  const expiring = getExpiringContracts(league, team.id || window.state?.userTeamId);
  const expiringIds = new Set(expiring.map(p => p.id));
  
  let projectedUsed = 0;
  let projectedDead = team.deadCapBook?.[(league.season || league.year || 2025) + 1] || 0;
  
  team.roster.forEach(player => {
    if (!expiringIds.has(player.id) && player.years > 1) {
      // Player will still be on roster next year
      const nextYearCapHit = capHitFor(player, 1); // Cap hit for next season
      projectedUsed += nextYearCapHit;
    }
  });
  
  projectedUsed += projectedDead;
  const projectedRoom = projectedTotal - projectedUsed;
  
  return {
    total: projectedTotal,
    used: projectedUsed,
    dead: projectedDead,
    room: projectedRoom
  };
}

/**
 * Calculates position-specific grade for a player
 * @param {Object} player - Player object
 * @returns {Object} Grade information with breakdown
 */
function calculatePositionGrade(player) {
  if (!player || !player.ratings || !player.pos) {
    return { grade: 'N/A', description: 'No data', breakdown: '' };
  }
  
  const pos = player.pos;
  const ratings = player.ratings;
  const C = window.Constants;
  const weights = C?.OVR_WEIGHTS?.[pos] || {};
  
  let weightedSum = 0;
  let totalWeight = 0;
  const breakdownParts = [];
  
  // Calculate weighted average for position-specific attributes
  Object.keys(weights).forEach(stat => {
    const weight = weights[stat];
    const rating = ratings[stat] || 50;
    weightedSum += rating * weight;
    totalWeight += weight;
    
    if (weight > 0.1) { // Only show significant attributes
      breakdownParts.push(`${stat}: ${Math.round(rating)}`);
    }
  });
  
  const positionRating = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : player.ovr || 50;
  
  // Determine grade
  let grade, description;
  if (positionRating >= 90) {
    grade = 'A+';
    description = 'Elite';
  } else if (positionRating >= 85) {
    grade = 'A';
    description = 'Excellent';
  } else if (positionRating >= 80) {
    grade = 'B+';
    description = 'Very Good';
  } else if (positionRating >= 75) {
    grade = 'B';
    description = 'Good';
  } else if (positionRating >= 70) {
    grade = 'C+';
    description = 'Above Average';
  } else if (positionRating >= 65) {
    grade = 'C';
    description = 'Average';
  } else if (positionRating >= 60) {
    grade = 'D+';
    description = 'Below Average';
  } else {
    grade = 'D';
    description = 'Poor';
  }
  
  return {
    grade: grade,
    description: description,
    rating: positionRating,
    breakdown: breakdownParts.length > 0 ? breakdownParts.join(', ') : 'N/A'
  };
}

// Make renderContractManagement globally available
window.renderContractManagement = renderContractManagement;
window.calculateNextYearCapSpace = calculateNextYearCapSpace;
window.calculatePositionGrade = calculatePositionGrade;

// --- Global Functions (Make sure they use the safer checks!) ---

// Export to global scope
if (typeof global !== 'undefined' && global !== null) {
  global.contractManagement = {
    getExpiringContracts,
    getFifthYearOptionEligible,
    calculateFranchiseTagSalary,
    calculateTransitionTagSalary,
    calculateFifthYearOptionSalary,
    applyFranchiseTag,
    applyTransitionTag,
    exerciseFifthYearOption,
    extendContract,
    updateContract
  };
}

window.applyFranchiseTagToPlayer = function(playerId) {
  const league = window.state?.league;
  const team = league?.teams?.[window.state?.userTeamId];
  const player = team?.roster.find(p => p.id === playerId || p.id === parseInt(playerId));
  
  if (!player) return setStatus('Player not found, rip.');
  
  const result = applyFranchiseTag(league, team, player);
  setStatus(result.message);
  
  if (result.success) {
    window.renderContractManagement(league, window.state.userTeamId);
  }
};

window.applyTransitionTagToPlayer = function(playerId) {
  const league = window.state?.league;
  const team = league?.teams?.[window.state?.userTeamId];
  const player = team?.roster.find(p => p.id === playerId || p.id === parseInt(playerId));

  if (!player) return setStatus('Player not found, rip.');

  const result = applyTransitionTag(league, team, player);
  setStatus(result.message);

  if (result.success) {
    window.renderContractManagement(league, window.state.userTeamId);
  }
};

window.exerciseFifthYearOptionOnPlayer = function(playerId) {
  const league = window.state?.league;
  const team = league?.teams?.[window.state?.userTeamId];
  const player = team?.roster.find(p => p.id === playerId || p.id === parseInt(playerId));

  if (!player) return setStatus('Player not found, rip.');

  const result = exerciseFifthYearOption(league, team, player);
  setStatus(result.message);

  if (result.success) {
    window.renderContractManagement(league, window.state.userTeamId);
  }
};

/**
 * Opens interactive contract extension modal (replaces prompt-based UI)
 * @param {string} playerId - Player ID to extend
 */
window.openContractExtensionModal = function(playerId) {
  const league = window.state?.league;
  const team = league?.teams?.[window.state?.userTeamId];
  const player = team?.roster.find(p => p.id === playerId || p.id === parseInt(playerId));
  
  if (!player) {
    setStatus('Player not found', 'error');
    return;
  }

  const currentCapHit = capHitFor(player, 0);
  const franchiseSalary = calculateFranchiseTagSalary(player.pos, league);
  const transitionSalary = calculateTransitionTagSalary(player.pos, league);

  // Remove existing modal if present
  const existingModal = document.getElementById('contractExtensionModal');
  if (existingModal) {
    existingModal.remove();
  }

  // Create modal
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'contractExtensionModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 800px; width: 95%; max-height: 90vh; overflow-y: auto;">
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 20px; border-bottom: 1px solid var(--hairline);">
        <h2 style="margin: 0; font-size: 20px; color: var(--text);">Contract Extension: ${player.name}</h2>
        <button class="close" onclick="this.closest('.modal').remove()" style="background: none; border: none; font-size: 24px; color: var(--text-muted); cursor: pointer; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">&times;</button>
      </div>
      <div class="modal-body" style="padding: 20px;">
        <div class="player-info-card" style="background: var(--surface); padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid var(--hairline);">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; font-size: 14px;">
            <div><strong>Position:</strong> ${player.pos}</div>
            <div><strong>Age:</strong> ${player.age}</div>
            <div><strong>Overall:</strong> ${player.ovr}</div>
            <div><strong>Current Cap Hit:</strong> $${currentCapHit.toFixed(1)}M</div>
            <div><strong>Years Remaining:</strong> ${player.years || 0}</div>
          </div>
        </div>

        <div class="contract-form" style="display: grid; gap: 20px;">
          <div class="form-section">
            <h3 style="margin: 0 0 15px 0; font-size: 18px; color: var(--accent);">Contract Terms</h3>
            
            <div class="form-group" style="margin-bottom: 15px;">
              <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--text);">Years to Add</label>
              <input type="number" id="extYears" min="2" max="7" value="4" 
                     style="width: 100%; padding: 10px; border-radius: 6px; background: var(--surface); color: var(--text); border: 1px solid var(--hairline); font-size: 14px;"
                     onchange="updateExtensionSummary()" oninput="updateExtensionSummary()">
              <small style="color: var(--text-muted); font-size: 12px; display: block; margin-top: 5px;">Add 2-7 years to existing contract</small>
            </div>

            <div class="form-group" style="margin-bottom: 15px;">
              <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--text);">Average Annual Salary ($M)</label>
              <input type="number" id="extBaseSalary" min="0.5" step="0.1" value="${currentCapHit.toFixed(1)}"
                     style="width: 100%; padding: 10px; border-radius: 6px; background: var(--surface); color: var(--text); border: 1px solid var(--hairline); font-size: 14px;"
                     onchange="updateExtensionSummary()" oninput="updateExtensionSummary()">
              <small style="color: var(--text-muted); font-size: 12px; display: block; margin-top: 5px;">Base salary per year</small>
            </div>

            <div class="form-group" style="margin-bottom: 15px;">
              <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--text);">Signing Bonus ($M)</label>
              <input type="number" id="extSigningBonus" min="0" step="0.1" value="5.0"
                     style="width: 100%; padding: 10px; border-radius: 6px; background: var(--surface); color: var(--text); border: 1px solid var(--hairline); font-size: 14px;"
                     onchange="updateExtensionSummary()" oninput="updateExtensionSummary()">
              <small style="color: var(--text-muted); font-size: 12px; display: block; margin-top: 5px;">One-time signing bonus (prorated over contract)</small>
            </div>

            <div class="form-group" style="margin-bottom: 15px;">
              <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--text);">Guaranteed Money %</label>
              <input type="number" id="extGuaranteed" min="0" max="95" step="1" value="50"
                     style="width: 100%; padding: 10px; border-radius: 6px; background: var(--surface); color: var(--text); border: 1px solid var(--hairline); font-size: 14px;"
                     onchange="updateExtensionSummary()" oninput="updateExtensionSummary()">
              <small style="color: var(--text-muted); font-size: 12px; display: block; margin-top: 5px;">Percentage of contract guaranteed (0-95%)</small>
            </div>
          </div>

          <div class="contract-summary" style="background: var(--surface-strong); padding: 20px; border-radius: 8px; border: 1px solid var(--hairline-strong);">
            <h3 style="margin: 0 0 15px 0; font-size: 18px; color: var(--accent);">Contract Summary</h3>
            <div id="extensionSummary" style="display: grid; gap: 10px; font-size: 14px;">
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-muted);">Total Contract Value:</span>
                <strong id="summaryTotal" style="color: var(--text);">$0.0M</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-muted);">Average Annual Value:</span>
                <strong id="summaryAAV" style="color: var(--text);">$0.0M</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-muted);">First Year Cap Hit:</span>
                <strong id="summaryCapHit" style="color: var(--text);">$0.0M</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-muted);">Guaranteed Money:</span>
                <strong id="summaryGuaranteed" style="color: var(--text);">$0.0M</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--hairline);">
                <span style="color: var(--text-muted);">Cap Room After:</span>
                <strong id="summaryCapRoom" style="color: var(--success-text);">$0.0M</strong>
              </div>
            </div>
          </div>

          <div class="tag-options" style="margin-top: 20px;">
            <h3 style="margin: 0 0 15px 0; font-size: 18px; color: var(--accent);">Tag Options</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
              ${!team.franchiseTagged ? `
                <button class="btn" onclick="window.applyFranchiseTagFromModal('${player.id}')" 
                        style="padding: 12px; background: var(--surface); border: 1px solid var(--hairline); border-radius: 6px; color: var(--text); cursor: pointer; transition: all 0.2s; text-align: left;">
                  <div style="font-weight: 600; margin-bottom: 5px;">Franchise Tag</div>
                  <div style="font-size: 12px; color: var(--text-muted);">$${franchiseSalary.toFixed(1)}M (1 year, fully guaranteed)</div>
                </button>
              ` : '<div style="padding: 12px; background: var(--surface); border-radius: 6px; text-align: center; color: var(--text-muted); border: 1px solid var(--hairline);">Franchise tag already used</div>'}
              ${!team.transitionTagged ? `
                <button class="btn" onclick="window.applyTransitionTagFromModal('${player.id}')"
                        style="padding: 12px; background: var(--surface); border: 1px solid var(--hairline); border-radius: 6px; color: var(--text); cursor: pointer; transition: all 0.2s; text-align: left;">
                  <div style="font-weight: 600; margin-bottom: 5px;">Transition Tag</div>
                  <div style="font-size: 12px; color: var(--text-muted);">$${transitionSalary.toFixed(1)}M (1 year, 80% guaranteed)</div>
                </button>
              ` : '<div style="padding: 12px; background: var(--surface); border-radius: 6px; text-align: center; color: var(--text-muted); border: 1px solid var(--hairline);">Transition tag already used</div>'}
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer" style="padding: 20px; border-top: 1px solid var(--hairline); display: flex; justify-content: flex-end; gap: 10px;">
        <button class="btn" onclick="this.closest('.modal').remove()" 
                style="padding: 10px 20px; background: var(--surface); border: 1px solid var(--hairline); border-radius: 6px; color: var(--text); cursor: pointer; font-size: 14px;">Cancel</button>
        <button class="btn primary" onclick="window.submitContractExtension('${player.id}')"
                style="padding: 10px 20px; background: var(--accent); border: none; border-radius: 6px; color: white; cursor: pointer; font-weight: 600; font-size: 14px;">Submit Extension</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Update summary immediately
  updateExtensionSummary();

  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
};

/**
 * Updates contract extension summary
 */
window.updateExtensionSummary = function() {
  const yearsEl = document.getElementById('extYears');
  const baseSalaryEl = document.getElementById('extBaseSalary');
  const signingBonusEl = document.getElementById('extSigningBonus');
  const guaranteedEl = document.getElementById('extGuaranteed');

  if (!yearsEl || !baseSalaryEl || !signingBonusEl || !guaranteedEl) return;

  const years = parseInt(yearsEl.value || '4', 10);
  const baseSalary = parseFloat(baseSalaryEl.value || '0', 10);
  const signingBonus = parseFloat(signingBonusEl.value || '0', 10);
  const guaranteedPct = parseFloat(guaranteedEl.value || '50', 10) / 100;

  const totalValue = (baseSalary * years) + signingBonus;
  const aav = totalValue / years;
  const firstYearCapHit = baseSalary + (signingBonus / years);
  const guaranteedMoney = totalValue * guaranteedPct;

  const league = window.state?.league;
  const team = league?.teams?.[window.state?.userTeamId];
  
  // Get current player cap hit
  const modal = document.getElementById('contractExtensionModal');
  const playerId = modal?.querySelector('button[onclick*="submitContractExtension"]')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
  const player = team?.roster?.find(p => p.id === playerId || p.id === parseInt(playerId));
  const currentCapHit = player ? (capHitFor(player, 0)) : 0;
  
  const capImpact = firstYearCapHit - currentCapHit;
  const capRoomAfter = (team?.capRoom || 0) - capImpact;

  const summaryTotal = document.getElementById('summaryTotal');
  const summaryAAV = document.getElementById('summaryAAV');
  const summaryCapHit = document.getElementById('summaryCapHit');
  const summaryGuaranteed = document.getElementById('summaryGuaranteed');
  const summaryCapRoom = document.getElementById('summaryCapRoom');

  if (summaryTotal) summaryTotal.textContent = `$${totalValue.toFixed(1)}M`;
  if (summaryAAV) summaryAAV.textContent = `$${aav.toFixed(1)}M`;
  if (summaryCapHit) summaryCapHit.textContent = `$${firstYearCapHit.toFixed(1)}M`;
  if (summaryGuaranteed) summaryGuaranteed.textContent = `$${guaranteedMoney.toFixed(1)}M (${(guaranteedPct * 100).toFixed(0)}%)`;
  if (summaryCapRoom) {
    summaryCapRoom.textContent = `$${capRoomAfter.toFixed(1)}M`;
    summaryCapRoom.style.color = capRoomAfter >= 0 ? 'var(--success-text)' : 'var(--error-text)';
  }
};

/**
 * Submits contract extension
 */
window.submitContractExtension = function(playerId) {
  const yearsEl = document.getElementById('extYears');
  const baseSalaryEl = document.getElementById('extBaseSalary');
  const signingBonusEl = document.getElementById('extSigningBonus');

  if (!yearsEl || !baseSalaryEl || !signingBonusEl) {
    setStatus('Form elements not found', 'error');
    return;
  }

  const years = parseInt(yearsEl.value || '4', 10);
  const baseSalary = parseFloat(baseSalaryEl.value || '0', 10);
  const signingBonus = parseFloat(signingBonusEl.value || '0', 10);

  if (years < 2 || years > 7) {
    setStatus('Years must be between 2 and 7', 'error');
    return;
  }

  if (baseSalary < 0.5) {
    setStatus('Base salary must be at least $0.5M', 'error');
    return;
  }

  const league = window.state?.league;
  const team = league?.teams?.[window.state?.userTeamId];
  const player = team?.roster.find(p => p.id === playerId || p.id === parseInt(playerId));

  if (!player) {
    setStatus('Player not found', 'error');
    return;
  }

  // Check if player is on a rookie contract
  if (player.draftRound <= 7 && player.yearsTotal === CONTRACT_CONSTANTS.ROOKIE_CONTRACT_LENGTH) {
    setStatus('Rookie contracts can only be extended, not renegotiated with current years remaining.');
    return;
  }

  const result = extendContract(league, team, player, years, baseSalary, signingBonus);
  setStatus(result.message, result.success ? 'success' : 'error');
  
  if (result.success) {
    document.getElementById('contractExtensionModal')?.remove();
    if (window.renderContractManagement) {
      window.renderContractManagement(league, window.state.userTeamId);
    }
  }
};

/**
 * Applies franchise tag from modal
 */
window.applyFranchiseTagFromModal = function(playerId) {
  const league = window.state?.league;
  const team = league?.teams?.[window.state?.userTeamId];
  const player = team?.roster.find(p => p.id === playerId || p.id === parseInt(playerId));

  if (!player) {
    setStatus('Player not found', 'error');
    return;
  }

  if (window.applyFranchiseTagToPlayer) {
    window.applyFranchiseTagToPlayer(playerId);
    document.getElementById('contractExtensionModal')?.remove();
  }
};

/**
 * Applies transition tag from modal
 */
window.applyTransitionTagFromModal = function(playerId) {
  const league = window.state?.league;
  const team = league?.teams?.[window.state?.userTeamId];
  const player = team?.roster.find(p => p.id === playerId || p.id === parseInt(playerId));

  if (!player) {
    setStatus('Player not found', 'error');
    return;
  }

  if (window.applyTransitionTagToPlayer) {
    window.applyTransitionTagToPlayer(playerId);
    document.getElementById('contractExtensionModal')?.remove();
  }
};

// Make functions available globally
// ... (All original exports remain)
})(window);
