// picks.js - Fixed with all missing functions
'use strict';

/**
 * Seeds a team with draft picks for multiple years
 * @param {Object} team - Team object to seed picks for
 * @param {number} startSeason - Starting season/year
 * @param {number} count - Number of years to seed
 */
function seedTeamPicks(team, startSeason, count) {
  if (!team) {
    console.error('Invalid team provided to seedTeamPicks');
    return;
  }
  
  const U = window.Utils;
  if (!U) {
    console.error('Utils not available for seedTeamPicks');
    return;
  }
  
  team.picks = [];
  
  for (let y = 0; y < count; y++) {
    for (let r = 1; r <= 7; r++) { // 7 rounds in NFL draft
      team.picks.push({ 
        year: startSeason + y, 
        round: r, 
        from: team.abbr || team.name || 'Unknown', 
        id: U.id() 
      });
    }
  }
}

/**
 * Calculates the trade value of a draft pick
 * @param {Object} pick - Draft pick object
 * @returns {number} Trade value of the pick
 */
function pickValue(pick) {
  if (!pick || !state.league) return 1;
  
  const C = window.Constants;
  
  let baseValue;
  
  // Check for new TRADE_CONFIG
  if (C?.TRADE_CONFIG?.PICK_ONE_VALUE) {
    const globalPick = ((pick.round - 1) * 32) + 1; // Assume start of round
    baseValue = Math.round(C.TRADE_CONFIG.PICK_ONE_VALUE * Math.pow(C.TRADE_CONFIG.PICK_DECAY, globalPick - 1));
  } else {
    const tradeValues = C?.TRADE_VALUES?.PICKS || {};
    const roundValues = tradeValues[pick.round] || {};
    baseValue = roundValues[1] || 1;

    if (!baseValue) {
        const baseValues = { 1: 25, 2: 15, 3: 8, 4: 5, 5: 3, 6: 2, 7: 1 };
        baseValue = baseValues[pick.round] || 1;
    }
  }

  // Apply discount for future years
  const yearsOut = pick.year - state.league.season;
  const futureDiscount = C?.TRADE_VALUES?.FUTURE_DISCOUNT || 0.85;
  const discount = Math.pow(futureDiscount, Math.max(0, yearsOut));
  
  return Math.max(1, Math.round(baseValue * discount * 10) / 10);
}

/**
 * Gets the trade value for a specific round and pick number
 * @param {number} round - Draft round (1-7)
 * @param {number} pickNumber - Pick number within round
 * @returns {number} Trade value
 */
function getPickValue(round, pickNumber) {
  const C = window.Constants;

  // New TRADE_CONFIG logic
  if (C?.TRADE_CONFIG?.PICK_ONE_VALUE) {
     const globalPick = ((round - 1) * 32) + (pickNumber || 16);
     return Math.max(1, Math.round(C.TRADE_CONFIG.PICK_ONE_VALUE * Math.pow(C.TRADE_CONFIG.PICK_DECAY, globalPick - 1)));
  }

  const tradeValues = C?.TRADE_VALUES?.PICKS || {};
  
  if (tradeValues[round] && tradeValues[round][pickNumber]) {
    return tradeValues[round][pickNumber];
  }
  
  // Fallback calculation
  const baseValues = { 1: 3000, 2: 1800, 3: 800, 4: 300, 5: 150, 6: 75, 7: 25 };
  const roundBase = baseValues[round] || 10;
  
  // Adjust based on pick position within round
  const positionMultiplier = 1 - ((pickNumber - 1) * 0.03); // Each pick worth ~3% less
  
  return Math.max(1, Math.round(roundBase * positionMultiplier));
}

/**
 * Generates draft order based on team records
 * @param {Object} league - League object
 * @returns {Array} Array of team IDs in draft order
 */
function calculateDraftOrder(league) {
  if (!league || !league.teams) return [];
  
  try {
    // Create copy of teams with their records
    const teamRecords = league.teams.map((team, index) => ({
      id: index,
      team: team,
      wins: team.wins || 0,
      losses: team.losses || 0,
      pointsFor: team.ptsFor || 0,
      pointsAgainst: team.ptsAgainst || 0,
      pointDifferential: (team.ptsFor || 0) - (team.ptsAgainst || 0)
    }));
    
    // Sort by record (worst teams draft first)
    teamRecords.sort((a, b) => {
      // First by wins (fewer wins = higher draft pick)
      if (a.wins !== b.wins) {
        return a.wins - b.wins;
      }
      
      // Then by point differential (worse differential = higher pick)
      if (a.pointDifferential !== b.pointDifferential) {
        return a.pointDifferential - b.pointDifferential;
      }
      
      // Finally by points against (more points allowed = higher pick)
      return b.pointsAgainst - a.pointsAgainst;
    });
    
    return teamRecords.map(record => record.id);
    
  } catch (error) {
    console.error('Error calculating draft order:', error);
    // Return default order if calculation fails
    return Array.from({length: league.teams.length}, (_, i) => i);
  }
}

/**
 * Trades draft picks between teams
 * @param {Object} fromTeam - Team trading away the pick
 * @param {Object} toTeam - Team receiving the pick
 * @param {Object} pick - Pick being traded
 */
function tradePick(fromTeam, toTeam, pick) {
  if (!fromTeam || !toTeam || !pick) {
    console.error('Invalid parameters for tradePick');
    return false;
  }
  
  try {
    // Remove pick from source team
    const fromIndex = fromTeam.picks.findIndex(p => p.id === pick.id);
    if (fromIndex === -1) {
      console.error('Pick not found in source team');
      return false;
    }
    
    fromTeam.picks.splice(fromIndex, 1);
    
    // Add pick to destination team (update the 'from' field to track origin)
    const tradedPick = {
      ...pick,
      from: `${pick.from} via ${fromTeam.abbr}`
    };
    
    toTeam.picks.push(tradedPick);
    
    return true;
    
  } catch (error) {
    console.error('Error trading pick:', error);
    return false;
  }
}

/**
 * Gets all picks for a team in a specific year
 * @param {Object} team - Team object
 * @param {number} year - Year to get picks for
 * @returns {Array} Array of picks for that year
 */
function getTeamPicksForYear(team, year) {
  if (!team || !team.picks) return [];
  
  return team.picks
    .filter(pick => pick.year === year)
    .sort((a, b) => a.round - b.round);
}

/**
 * Validates that a team has the minimum required picks
 * @param {Object} team - Team to validate
 * @param {number} year - Year to check
 * @returns {Object} Validation result
 */
function validateTeamPicks(team, year) {
  if (!team) {
    return { valid: false, message: 'Invalid team' };
  }
  
  const picks = getTeamPicksForYear(team, year);
  const hasFirstRound = picks.some(p => p.round === 1);
  
  if (picks.length === 0) {
    return { 
      valid: false, 
      message: `${team.abbr} has no picks in ${year}` 
    };
  }
  
  if (!hasFirstRound) {
    return { 
      valid: false, 
      message: `${team.abbr} missing first round pick in ${year}` 
    };
  }
  
  return { 
    valid: true, 
    message: `${team.abbr} has ${picks.length} picks in ${year}` 
  };
}

// Make functions globally available
window.seedTeamPicks = seedTeamPicks;
window.pickValue = pickValue;
window.getPickValue = getPickValue;
window.calculateDraftOrder = calculateDraftOrder;
window.tradePick = tradePick;
window.getTeamPicksForYear = getTeamPicksForYear;
window.validateTeamPicks = validateTeamPicks;
