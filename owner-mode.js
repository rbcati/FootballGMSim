// owner-mode.js - Owner Mode with Business Management and Firing System
'use strict';

/**
 * Owner Mode System
 * Allows players to manage business aspects and fire coaches/GMs
 */

// Owner mode constants
const OWNER_CONSTANTS = {
  TICKET_PRICE_RANGE: { min: 25, max: 500 },
  CONCESSION_PRICE_RANGE: { min: 5, max: 50 },
  PARKING_PRICE_RANGE: { min: 10, max: 100 },
  MERCHANDISE_PRICE_RANGE: { min: 20, max: 200 },
  
  FIRING_THRESHOLDS: {
    HC: { winPercentage: 0.3, seasons: 2 },
    GM: { winPercentage: 0.25, seasons: 3 },
    OC: { winPercentage: 0.2, seasons: 1 },
    DC: { winPercentage: 0.2, seasons: 1 }
  },
  
  REVENUE_FACTORS: {
    ticketSales: 0.6,
    concessions: 0.2,
    parking: 0.1,
    merchandise: 0.1
  }
};

/**
 * Initialize owner mode
 */
function initializeOwnerMode() {
  // Add owner mode to state if not exists
  if (!window.state.ownerMode) {
    window.state.ownerMode = {
      enabled: false,
      businessSettings: {
        ticketPrice: 75,
        concessionPrice: 15,
        parkingPrice: 25,
        merchandisePrice: 50
      },
      revenue: {
        total: 0,
        ticketSales: 0,
        concessions: 0,
        parking: 0,
        merchandise: 0
      },
      expenses: {
        total: 0,
        playerSalaries: 0,
        coachingSalaries: 0,
        facilities: 0,
        operations: 0
      },
      profit: 0,
      fanSatisfaction: 75,
      marketSize: 'Medium'
    };
  }
  
  console.log('Owner mode system initialized');
}

/**
 * Enable owner mode
 */
function enableOwnerMode() {
  window.state.ownerMode.enabled = true;
  window.state.playerRole = 'Owner';
  
  // Initialize business settings
  const team = window.state.league?.teams?.[window.state.userTeamId];
  if (team) {
    // Set initial prices based on market size
    const marketMultiplier = getMarketMultiplier(team);
    window.state.ownerMode.businessSettings.ticketPrice = Math.round(75 * marketMultiplier);
    window.state.ownerMode.businessSettings.concessionPrice = Math.round(15 * marketMultiplier);
    window.state.ownerMode.businessSettings.parkingPrice = Math.round(25 * marketMultiplier);
    window.state.ownerMode.businessSettings.merchandisePrice = Math.round(50 * marketMultiplier);
  }
  
  window.setStatus('Owner mode enabled! You now control all business decisions.', 'success');
  renderOwnerModeInterface();
}

/**
 * Disable owner mode
 */
function disableOwnerMode() {
  window.state.ownerMode.enabled = false;
  window.state.playerRole = 'GM'; // Default back to GM
  
  window.setStatus('Owner mode disabled. Returning to GM role.', 'info');
  renderOwnerModeInterface();
}

/**
 * Get market size multiplier for pricing
 * @param {Object} team - Team object
 * @returns {number} Market multiplier
 */
function getMarketMultiplier(team) {
  // Simple market size calculation based on team location
  const largeMarkets = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Philadelphia', 'Phoenix', 'San Antonio', 'San Diego', 'Dallas', 'San Jose'];
  const smallMarkets = ['Green Bay', 'Buffalo', 'Jacksonville', 'Cleveland', 'Cincinnati', 'Pittsburgh', 'Kansas City', 'Indianapolis'];
  
  const teamName = team.name.toLowerCase();
  
  if (largeMarkets.some(market => teamName.includes(market.toLowerCase()))) {
    return 1.3; // Large market premium
  } else if (smallMarkets.some(market => teamName.includes(market.toLowerCase()))) {
    return 0.8; // Small market discount
  } else {
    return 1.0; // Medium market
  }
}

/**
 * Update business prices
 * @param {Object} newPrices - New price settings
 */
function updateBusinessPrices(newPrices) {
  if (!window.state.ownerMode.enabled) {
    window.setStatus('Owner mode must be enabled to change prices', 'error');
    return;
  }
  
  const settings = window.state.ownerMode.businessSettings;
  
  // Validate and update prices
  if (newPrices.ticketPrice !== undefined) {
    settings.ticketPrice = Math.max(OWNER_CONSTANTS.TICKET_PRICE_RANGE.min, 
                                   Math.min(OWNER_CONSTANTS.TICKET_PRICE_RANGE.max, newPrices.ticketPrice));
  }
  
  if (newPrices.concessionPrice !== undefined) {
    settings.concessionPrice = Math.max(OWNER_CONSTANTS.CONCESSION_PRICE_RANGE.min,
                                       Math.min(OWNER_CONSTANTS.CONCESSION_PRICE_RANGE.max, newPrices.concessionPrice));
  }
  
  if (newPrices.parkingPrice !== undefined) {
    settings.parkingPrice = Math.max(OWNER_CONSTANTS.PARKING_PRICE_RANGE.min,
                                    Math.min(OWNER_CONSTANTS.PARKING_PRICE_RANGE.max, newPrices.parkingPrice));
  }
  
  if (newPrices.merchandisePrice !== undefined) {
    settings.merchandisePrice = Math.max(OWNER_CONSTANTS.MERCHANDISE_PRICE_RANGE.min,
                                        Math.min(OWNER_CONSTANTS.MERCHANDISE_PRICE_RANGE.max, newPrices.merchandisePrice));
  }
  
  // Update fan satisfaction based on price changes
  updateFanSatisfaction();
  
  window.setStatus('Business prices updated', 'success');
  renderOwnerModeInterface();
}

/**
 * Update fan satisfaction based on performance and pricing
 */
function updateFanSatisfaction() {
  const team = window.state.league?.teams?.[window.state.userTeamId];
  const ownerMode = window.state.ownerMode;
  
  if (!team || !ownerMode) return;
  
  let satisfaction = 50; // Base satisfaction
  
  // Performance factor (40% of satisfaction)
  const record = team.record;
  const totalGames = record.w + record.l + record.t;
  if (totalGames > 0) {
    const winPercentage = (record.w + record.t * 0.5) / totalGames;
    satisfaction += (winPercentage - 0.5) * 40; // -20 to +20 based on win %
  }
  
  // Pricing factor (30% of satisfaction)
  const marketMultiplier = getMarketMultiplier(team);
  
  // Calculate value scores for each category (lower price relative to market = higher score)
  const getScore = (price, base) => {
      const expected = base * marketMultiplier;
      const ratio = price / expected;
      if (ratio < 0.8) return 1.0; // Great value
      if (ratio > 1.4) return -1.0; // Ripoff
      // Linear interpolation between -1 and 1
      return 1.0 - ((ratio - 0.8) / 0.6) * 2;
  };

  const s = ownerMode.businessSettings;
  const ticketScore = getScore(s.ticketPrice, 75);
  const foodScore = getScore(s.concessionPrice, 15);
  const parkScore = getScore(s.parkingPrice, 25);
  const merchScore = getScore(s.merchandisePrice, 50);

  // Weighted average of scores (tickets most important)
  const totalPricingScore = (ticketScore * 0.5) + (foodScore * 0.2) + (parkScore * 0.15) + (merchScore * 0.15);

  // Convert score (-1 to 1) to satisfaction modifier (-15 to +15)
  satisfaction += totalPricingScore * 15;
  
  // Recent success factor (30% of satisfaction)
  if (team.record.w >= 10) {
    satisfaction += 15; // Good season
  } else if (team.record.w <= 4) {
    satisfaction -= 15; // Bad season
  }
  
  ownerMode.fanSatisfaction = Math.max(0, Math.min(100, Math.round(satisfaction)));
}

/**
 * Calculate revenue for the season
 */
function calculateRevenue() {
  const team = window.state.league?.teams?.[window.state.userTeamId];
  const ownerMode = window.state.ownerMode;
  
  if (!team || !ownerMode) return;
  
  const settings = ownerMode.businessSettings;
  const fanSatisfaction = ownerMode.fanSatisfaction;
  
  // Base attendance (affected by performance and pricing)
  const baseAttendance = 65000; // Average NFL stadium capacity
  const attendanceMultiplier = fanSatisfaction / 100;
  const actualAttendance = Math.round(baseAttendance * attendanceMultiplier);
  
  // Calculate revenue streams with demand curves
  const homeGames = 8; // Regular season home games
  const marketMultiplier = getMarketMultiplier(team);

  // Demand function: Higher price = Lower buy rate
  const getBuyRate = (price, basePrice, baseRate) => {
      const expected = basePrice * marketMultiplier;
      // Elasticity: if price is double, buy rate drops significantly
      const ratio = price / expected;
      // Simple demand curve: 1.0 at ratio 1.0. Drops to 0 at ratio 3.0. Max 1.5x at ratio 0.5.
      let demand = 1.0 - (ratio - 1.0) * 0.8;
      demand = Math.max(0.05, Math.min(1.5, demand)); // Clamp demand
      return baseRate * demand;
  };

  const ticketRevenue = actualAttendance * homeGames * settings.ticketPrice; // Attendance already factored satisfaction
  
  const foodBuyRate = getBuyRate(settings.concessionPrice, 15, 0.7);
  const concessionRevenue = actualAttendance * homeGames * settings.concessionPrice * foodBuyRate;

  const parkBuyRate = getBuyRate(settings.parkingPrice, 25, 0.8);
  const parkingRevenue = actualAttendance * homeGames * settings.parkingPrice * parkBuyRate;

  const merchBuyRate = getBuyRate(settings.merchandisePrice, 50, 0.3);
  const merchandiseRevenue = actualAttendance * homeGames * settings.merchandisePrice * merchBuyRate;
  
  ownerMode.revenue = {
    total: ticketRevenue + concessionRevenue + parkingRevenue + merchandiseRevenue,
    ticketSales: ticketRevenue,
    concessions: concessionRevenue,
    parking: parkingRevenue,
    merchandise: merchandiseRevenue
  };
  
  // Calculate expenses
  calculateExpenses();
  
  // Calculate profit
  ownerMode.profit = ownerMode.revenue.total - ownerMode.expenses.total;
}

/**
 * Calculate team expenses
 */
function calculateExpenses() {
  const team = window.state.league?.teams?.[window.state.userTeamId];
  const ownerMode = window.state.ownerMode;
  
  if (!team || !ownerMode) return;
  
  // Player salaries (from cap used)
  const playerSalaries = (team.capUsed || 0) * 1000000; // Convert millions to dollars
  
  // Coaching salaries (estimated)
  const coachingSalaries = 15000000; // $15M for coaching staff
  
  // Facilities and operations
  const facilities = 25000000; // $25M for stadium maintenance, etc.
  const operations = 10000000; // $10M for general operations
  
  ownerMode.expenses = {
    total: playerSalaries + coachingSalaries + facilities + operations,
    playerSalaries: playerSalaries,
    coachingSalaries: coachingSalaries,
    facilities: facilities,
    operations: operations
  };
}

/**
 * Check if staff should be fired
 * @param {Object} team - Team object
 * @returns {Array} Array of firing recommendations
 */
function checkFiringRecommendations(team) {
  const recommendations = [];
  const record = team.record;
  const totalGames = record.w + record.l + record.t;
  
  if (totalGames === 0) return recommendations;
  
  const winPercentage = (record.w + record.t * 0.5) / totalGames;
  const seasons = window.state.league?.year - (team.staff?.headCoach?.startYear || window.state.league?.year);
  
  // Check head coach
  if (team.staff?.headCoach) {
    const hcThreshold = OWNER_CONSTANTS.FIRING_THRESHOLDS.HC;
    if (winPercentage < hcThreshold.winPercentage && seasons >= hcThreshold.seasons) {
      recommendations.push({
        position: 'Head Coach',
        name: team.staff.headCoach.name,
        reason: `Poor performance: ${(winPercentage * 100).toFixed(1)}% win rate over ${seasons} seasons`,
        severity: 'high'
      });
    }
  }
  
  // Check coordinators
  if (team.staff?.offCoordinator) {
    const ocThreshold = OWNER_CONSTANTS.FIRING_THRESHOLDS.OC;
    if (winPercentage < ocThreshold.winPercentage && seasons >= ocThreshold.seasons) {
      recommendations.push({
        position: 'Offensive Coordinator',
        name: team.staff.offCoordinator.name,
        reason: `Poor offensive performance: ${(winPercentage * 100).toFixed(1)}% win rate`,
        severity: 'medium'
      });
    }
  }
  
  if (team.staff?.defCoordinator) {
    const dcThreshold = OWNER_CONSTANTS.FIRING_THRESHOLDS.DC;
    if (winPercentage < dcThreshold.winPercentage && seasons >= dcThreshold.seasons) {
      recommendations.push({
        position: 'Defensive Coordinator',
        name: team.staff.defCoordinator.name,
        reason: `Poor defensive performance: ${(winPercentage * 100).toFixed(1)}% win rate`,
        severity: 'medium'
      });
    }
  }
  
  return recommendations;
}

/**
 * Fire a staff member
 * @param {string} position - Position to fire ('HC', 'OC', 'DC')
 * @returns {Object} Firing result
 */
function fireStaffMember(position) {
  const team = window.state.league?.teams?.[window.state.userTeamId];
  
  if (!team || !team.staff) {
    return { success: false, message: 'No staff to fire' };
  }
  
  const staffMember = team.staff[position.toLowerCase()];
  if (!staffMember) {
    return { success: false, message: `No ${position} to fire` };
  }
  
  const name = staffMember.name;
  
  // Fire the staff member
  delete team.staff[position.toLowerCase()];
  
  // Add news item
  if (window.state.league?.news) {
    window.state.league.news.push(`${team.name} fires ${position} ${name}`);
  }
  
  // Update fan satisfaction (firing can improve or hurt depending on performance)
  const record = team.record;
  const totalGames = record.w + record.l + record.t;
  if (totalGames > 0) {
    const winPercentage = (record.w + record.t * 0.5) / totalGames;
    if (winPercentage < 0.3) {
      window.state.ownerMode.fanSatisfaction += 5; // Fans happy about firing bad coach
    } else {
      window.state.ownerMode.fanSatisfaction -= 5; // Fans upset about firing good coach
    }
  }
  
  return {
    success: true,
    message: `Fired ${position} ${name}`,
    position: position,
    name: name
  };
}

/**
 * Render owner mode interface
 */
function renderOwnerModeInterface() {
  // Ensure state and owner mode exist before attempting to render
  if (!window.state) {
    console.warn('Owner mode cannot render: state not initialized');
    return;
  }

  if (!window.state.ownerMode) {
    initializeOwnerMode();
  }

  const ownerMode = window.state.ownerMode;
  const team = window.state.league?.teams?.[window.state.userTeamId];
  
  // Create or update owner mode container
  let container = document.getElementById('ownerModeInterface');
  if (!container) {
    container = document.createElement('div');
    container.id = 'ownerModeInterface';
    container.className = 'owner-mode-interface';
    
    // Insert after coaching role interface
    const coachingInterface = document.getElementById('coachingRoleInterface');
    if (coachingInterface) {
      coachingInterface.parentNode.insertBefore(container, coachingInterface.nextSibling);
    } else {
      // Insert after hub content
      const hubContent = document.querySelector('#hub .card');
      if (hubContent) {
        hubContent.parentNode.insertBefore(container, hubContent.nextSibling);
      }
    }
  }
  
  if (!ownerMode.enabled) {
    container.innerHTML = `
      <div class="card">
        <h2>Owner Mode</h2>
        <p>Take control of all business decisions including ticket prices, concessions, and staff management.</p>
        <button class="btn btn-primary" onclick="enableOwnerMode()">Enable Owner Mode</button>
      </div>
    `;
    return;
  }
  
  // Calculate current revenue
  calculateRevenue();
  updateFanSatisfaction();
  
  const firingRecommendations = checkFiringRecommendations(team);
  
  container.innerHTML = `
    <div class="card">
      <h2>Owner Mode - ${team?.name || 'Team'} Management</h2>
      
      <div class="owner-mode-content">
        <div class="business-section">
          <h3>Business Management</h3>
          
          <div class="pricing-controls">
            <h4>Pricing Controls</h4>
            <div class="price-inputs">
              <div class="price-input">
                <label>Ticket Price: $${ownerMode.businessSettings.ticketPrice}</label>
                <input type="range" min="${OWNER_CONSTANTS.TICKET_PRICE_RANGE.min}" 
                       max="${OWNER_CONSTANTS.TICKET_PRICE_RANGE.max}" 
                       value="${ownerMode.businessSettings.ticketPrice}"
                       onchange="updateBusinessPrices({ticketPrice: parseInt(this.value)})">
              </div>
              
              <div class="price-input">
                <label>Concession Price: $${ownerMode.businessSettings.concessionPrice}</label>
                <input type="range" min="${OWNER_CONSTANTS.CONCESSION_PRICE_RANGE.min}" 
                       max="${OWNER_CONSTANTS.CONCESSION_PRICE_RANGE.max}" 
                       value="${ownerMode.businessSettings.concessionPrice}"
                       onchange="updateBusinessPrices({concessionPrice: parseInt(this.value)})">
              </div>
              
              <div class="price-input">
                <label>Parking Price: $${ownerMode.businessSettings.parkingPrice}</label>
                <input type="range" min="${OWNER_CONSTANTS.PARKING_PRICE_RANGE.min}" 
                       max="${OWNER_CONSTANTS.PARKING_PRICE_RANGE.max}" 
                       value="${ownerMode.businessSettings.parkingPrice}"
                       onchange="updateBusinessPrices({parkingPrice: parseInt(this.value)})">
              </div>
              
              <div class="price-input">
                <label>Merchandise Price: $${ownerMode.businessSettings.merchandisePrice}</label>
                <input type="range" min="${OWNER_CONSTANTS.MERCHANDISE_PRICE_RANGE.min}" 
                       max="${OWNER_CONSTANTS.MERCHANDISE_PRICE_RANGE.max}" 
                       value="${ownerMode.businessSettings.merchandisePrice}"
                       onchange="updateBusinessPrices({merchandisePrice: parseInt(this.value)})">
              </div>
            </div>
          </div>
          
          <div class="financial-summary">
            <h4>Financial Summary</h4>
            <div class="financial-grid">
              <div class="financial-item">
                <span class="label">Fan Satisfaction:</span>
                <span class="value ${ownerMode.fanSatisfaction >= 70 ? 'good' : ownerMode.fanSatisfaction >= 50 ? 'ok' : 'bad'}">
                  ${ownerMode.fanSatisfaction}%
                </span>
              </div>
              <div class="financial-item">
                <span class="label">Revenue:</span>
                <span class="value">$${(ownerMode.revenue.total / 1000000).toFixed(1)}M</span>
              </div>
              <div class="financial-item">
                <span class="label">Expenses:</span>
                <span class="value">$${(ownerMode.expenses.total / 1000000).toFixed(1)}M</span>
              </div>
              <div class="financial-item">
                <span class="label">Profit:</span>
                <span class="value ${ownerMode.profit >= 0 ? 'good' : 'bad'}">
                  $${(ownerMode.profit / 1000000).toFixed(1)}M
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="staff-management">
          <h3>Staff Management</h3>
          
          ${firingRecommendations.length > 0 ? `
            <div class="firing-recommendations">
              <h4>⚠️ Firing Recommendations</h4>
              ${firingRecommendations.map(rec => `
                <div class="firing-recommendation ${rec.severity}">
                  <div class="recommendation-info">
                    <strong>${rec.position}:</strong> ${rec.name}
                    <br><small>${rec.reason}</small>
                  </div>
                  <button class="btn btn-danger btn-sm" 
                          onclick="fireStaffMember('${rec.position === 'Head Coach' ? 'HC' : rec.position === 'Offensive Coordinator' ? 'OC' : 'DC'}')">
                    Fire
                  </button>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="staff-status">
              <h4>Staff Status</h4>
              <p>All staff members are performing adequately.</p>
            </div>
          `}
        </div>
        
        <div class="owner-actions">
          <button class="btn primary" onclick="location.hash='#/relocation'">Relocate Franchise</button>
          <button class="btn btn-secondary" onclick="disableOwnerMode()">Disable Owner Mode</button>
        </div>
      </div>
    </div>
  `;
}

// Make functions available globally
window.initializeOwnerMode = initializeOwnerMode;
window.enableOwnerMode = enableOwnerMode;
window.disableOwnerMode = disableOwnerMode;
window.updateBusinessPrices = updateBusinessPrices;
window.fireStaffMember = fireStaffMember;
window.renderOwnerModeInterface = renderOwnerModeInterface;

// Initialize on load
if (window.state) {
  initializeOwnerMode();
} else {
  window.addEventListener('load', initializeOwnerMode);
}
