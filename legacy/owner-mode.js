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
      marketSize: 'Medium',
      goals: [] // Goals array
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

    // Generate initial goals
    generateOwnerGoals(team);
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
  // Check for dynamic market size first (from Relocation)
  if (team.marketSize) {
      if (team.marketSize === 'Huge') return 1.5;
      if (team.marketSize === 'Large') return 1.3;
      if (team.marketSize === 'Small') return 0.8;
      return 1.0; // Medium
  }

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
    let perfModifier = (winPercentage - 0.5) * 40; // -20 to +20 based on win %

    // Adjust for loyalty (Relocation)
    if (team.loyalty) {
        if (perfModifier < 0) { // Losing
            if (team.loyalty === 'Very High') perfModifier *= 0.5; // Fans stay loyal
            else if (team.loyalty === 'High') perfModifier *= 0.75;
            else if (team.loyalty === 'Low') perfModifier *= 1.25; // Fans leave quickly
        }
    }

    satisfaction += perfModifier;
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
  
  // Add Playoff Revenue (accumulated separately)
  const playoffRevenue = ownerMode.revenue.playoffs || 0;

  ownerMode.revenue = {
    total: ticketRevenue + concessionRevenue + parkingRevenue + merchandiseRevenue + playoffRevenue,
    ticketSales: ticketRevenue,
    concessions: concessionRevenue,
    parking: parkingRevenue,
    merchandise: merchandiseRevenue,
    playoffs: playoffRevenue
  };
  
  // Calculate expenses
  calculateExpenses();
  
  // Calculate profit
  ownerMode.profit = ownerMode.revenue.total - ownerMode.expenses.total;

  // Check Goals
  checkOwnerGoals(team);
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
 * Generate Owner Goals for the season
 * @param {Object} team - Team object
 */
function generateOwnerGoals(team) {
    if (!window.state.ownerMode) initializeOwnerMode();
    const goals = [];

    // Performance Goal: Based on Team Rating
    const ovr = team.ratings?.overall || 75;
    let winsTarget = Math.max(4, Math.min(13, Math.round((ovr - 60) / 2.5))); // 60->0 wins, 85->10 wins

    goals.push({ id: 'wins', desc: `Win ${winsTarget}+ Games`, target: winsTarget, current: 0, achieved: false });

    // Financial Goal
    goals.push({ id: 'profit', desc: 'Positive Profit', target: 0, current: 0, achieved: false });

    // Happiness Goal
    goals.push({ id: 'satisfaction', desc: 'Fan Satisfaction > 60%', target: 60, current: 0, achieved: false });

    window.state.ownerMode.goals = goals;
}

/**
 * Check Owner Goals status
 * @param {Object} team - Team object
 */
function checkOwnerGoals(team) {
    if (!window.state.ownerMode || !window.state.ownerMode.goals) return;

    const goals = window.state.ownerMode.goals;
    const wins = team.record.w;
    const profit = window.state.ownerMode.profit || 0;
    const satisfaction = window.state.ownerMode.fanSatisfaction || 0;

    goals.forEach(g => {
        if (g.id === 'wins') {
            g.current = wins;
            if (wins >= g.target) g.achieved = true;
        }
        if (g.id === 'profit') {
            g.current = profit; // in $
            if (profit > g.target) g.achieved = true;
        }
        if (g.id === 'satisfaction') {
            g.current = satisfaction;
            if (satisfaction >= g.target) g.achieved = true;
        }
    });
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
 * Check job security and potentially fire the user
 * @param {Object} team - Team object
 * @returns {Object} Result { fired: boolean, reason: string }
 */
function checkJobSecurity(team) {
    if (!window.state.ownerMode || !window.state.ownerMode.enabled) return { fired: false };

    const sat = window.state.ownerMode.fanSatisfaction;

    // Strict logic: If satisfaction < 10, YOU ARE FIRED.
    if (sat < 10) {
        return {
            fired: true,
            reason: `Owner approval dropped to ${sat}%. The board has terminated your contract.`
        };
    }

    return { fired: false };
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
    
    // Insert at the bottom of the hub
    const hub = document.getElementById('hub');
    if (hub) {
      hub.appendChild(container);
    }
  }

  // Clear existing content
  container.innerHTML = '';
  
  if (!ownerMode.enabled) {
      const card = document.createElement('div');
      card.className = 'card';

      const title = document.createElement('h2');
      title.textContent = 'Owner Mode';
      card.appendChild(title);

      const p = document.createElement('p');
      p.textContent = 'Take control of all business decisions including ticket prices, concessions, and staff management.';
      card.appendChild(p);

      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = 'Enable Owner Mode';
      btn.addEventListener('click', enableOwnerMode);
      card.appendChild(btn);

      container.appendChild(card);
      return;
  }
  
  // Calculate current revenue
  calculateRevenue();
  updateFanSatisfaction();
  
  const firingRecommendations = checkFiringRecommendations(team);
  const goals = ownerMode.goals || [];
  
  const card = document.createElement('div');
  card.className = 'card';

  const title = document.createElement('h2');
  title.textContent = `Owner Mode - ${team?.name || 'Team'} Management`;
  card.appendChild(title);

  const content = document.createElement('div');
  content.className = 'owner-mode-content';
  card.appendChild(content);

  // --- GOALS SECTION ---
  const goalsSection = document.createElement('div');
  goalsSection.className = 'goals-section';
  goalsSection.style.cssText = 'background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; margin-bottom: 20px;';

  const goalsTitle = document.createElement('h3');
  goalsTitle.textContent = 'Owner Goals';
  goalsSection.appendChild(goalsTitle);

  const goalsGrid = document.createElement('div');
  goalsGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;';

  if (goals.length > 0) {
      goals.forEach(g => {
          let displayCurrent = g.current;
          if(g.id === 'profit') displayCurrent = '$' + (g.current/1000000).toFixed(1) + 'M';
          if(g.id === 'satisfaction') displayCurrent = g.current + '%';

          const gDiv = document.createElement('div');
          gDiv.style.cssText = `background: var(--surface); padding: 10px; border-radius: 4px; border-left: 4px solid ${g.achieved ? '#48bb78' : '#ed8936'};`;
          gDiv.innerHTML = `
              <div style="font-weight: bold;">${g.desc}</div>
              <div style="font-size: 0.9rem; margin-top: 5px;">Progress: ${displayCurrent}</div>
              ${g.achieved ? '<div style="color: #48bb78; font-size: 0.8rem; font-weight: bold;">COMPLETE</div>' : ''}
          `;
          goalsGrid.appendChild(gDiv);
      });
  } else {
      goalsGrid.innerHTML = '<p class="muted">No active goals.</p>';
  }

  goalsSection.appendChild(goalsGrid);
  content.appendChild(goalsSection);

  // Business Section
  const businessSection = document.createElement('div');
  businessSection.className = 'business-section';
  content.appendChild(businessSection);

  const businessTitle = document.createElement('h3');
  businessTitle.textContent = 'Business Management';
  businessSection.appendChild(businessTitle);

  // Pricing Controls
  const pricingControls = document.createElement('div');
  pricingControls.className = 'pricing-controls';
  businessSection.appendChild(pricingControls);

  const pricingTitle = document.createElement('h4');
  pricingTitle.textContent = 'Pricing Controls';
  pricingControls.appendChild(pricingTitle);

  const priceInputs = document.createElement('div');
  priceInputs.className = 'price-inputs';
  pricingControls.appendChild(priceInputs);

  const createPriceInput = (label, value, min, max, key) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'price-input';

      const labelEl = document.createElement('label');
      labelEl.textContent = `${label}: $${value}`;
      wrapper.appendChild(labelEl);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = min;
      input.max = max;
      input.value = value;
      input.addEventListener('input', (e) => {
          labelEl.textContent = `${label}: $${e.target.value}`;
      });
      input.addEventListener('change', (e) => {
          const update = {};
          update[key] = parseInt(e.target.value);
          updateBusinessPrices(update);
      });
      wrapper.appendChild(input);

      return wrapper;
  };

  priceInputs.appendChild(createPriceInput('Ticket Price', ownerMode.businessSettings.ticketPrice, OWNER_CONSTANTS.TICKET_PRICE_RANGE.min, OWNER_CONSTANTS.TICKET_PRICE_RANGE.max, 'ticketPrice'));
  priceInputs.appendChild(createPriceInput('Concession Price', ownerMode.businessSettings.concessionPrice, OWNER_CONSTANTS.CONCESSION_PRICE_RANGE.min, OWNER_CONSTANTS.CONCESSION_PRICE_RANGE.max, 'concessionPrice'));
  priceInputs.appendChild(createPriceInput('Parking Price', ownerMode.businessSettings.parkingPrice, OWNER_CONSTANTS.PARKING_PRICE_RANGE.min, OWNER_CONSTANTS.PARKING_PRICE_RANGE.max, 'parkingPrice'));
  priceInputs.appendChild(createPriceInput('Merchandise Price', ownerMode.businessSettings.merchandisePrice, OWNER_CONSTANTS.MERCHANDISE_PRICE_RANGE.min, OWNER_CONSTANTS.MERCHANDISE_PRICE_RANGE.max, 'merchandisePrice'));

  // Financial Summary
  const finSummary = document.createElement('div');
  finSummary.className = 'financial-summary';
  businessSection.appendChild(finSummary);

  const finTitle = document.createElement('h4');
  finTitle.textContent = 'Financial Summary';
  finSummary.appendChild(finTitle);

  const finGrid = document.createElement('div');
  finGrid.className = 'financial-grid';
  finSummary.appendChild(finGrid);

  const createFinItem = (label, value, valueClass = '') => {
      const item = document.createElement('div');
      item.className = 'financial-item';

      const l = document.createElement('span');
      l.className = 'label';
      l.textContent = label;
      item.appendChild(l);

      const v = document.createElement('span');
      v.className = `value ${valueClass}`;
      v.textContent = value;
      item.appendChild(v);

      return item;
  };

  const satClass = ownerMode.fanSatisfaction >= 70 ? 'good' : ownerMode.fanSatisfaction >= 50 ? 'ok' : 'bad';
  finGrid.appendChild(createFinItem('Fan Satisfaction:', `${ownerMode.fanSatisfaction}%`, satClass));
  finGrid.appendChild(createFinItem('Revenue:', `$${(ownerMode.revenue.total / 1000000).toFixed(1)}M`));
  finGrid.appendChild(createFinItem('Expenses:', `$${(ownerMode.expenses.total / 1000000).toFixed(1)}M`));
  const profitClass = ownerMode.profit >= 0 ? 'good' : 'bad';
  finGrid.appendChild(createFinItem('Profit:', `$${(ownerMode.profit / 1000000).toFixed(1)}M`, profitClass));


  // Staff Management
  const staffSection = document.createElement('div');
  staffSection.className = 'staff-management';
  content.appendChild(staffSection);

  const staffTitle = document.createElement('h3');
  staffTitle.textContent = 'Staff Management';
  staffSection.appendChild(staffTitle);

  if (firingRecommendations.length > 0) {
      const recsDiv = document.createElement('div');
      recsDiv.className = 'firing-recommendations';
      staffSection.appendChild(recsDiv);
      
      firingRecommendations.forEach(rec => {
          const item = document.createElement('div');
          item.className = 'recommendation-item';
          
          const info = document.createElement('div');
          info.className = 'recommendation-info';
          const b = document.createElement('strong');
          b.textContent = `${rec.position}: `;
          info.appendChild(b);
          info.appendChild(document.createTextNode(rec.name));
          info.appendChild(document.createElement('br'));
          const s = document.createElement('small');
          s.textContent = rec.reason;
          info.appendChild(s);
          item.appendChild(info);
          
          const btn = document.createElement('button');
          btn.className = 'btn btn-danger btn-sm';
          btn.textContent = 'Fire';
          btn.addEventListener('click', () => {
              fireStaffMember(rec.position === 'Head Coach' ? 'HC' : rec.position === 'Offensive Coordinator' ? 'OC' : 'DC');
          });
          item.appendChild(btn);
          
          recsDiv.appendChild(item);
      });
  } else {
      const status = document.createElement('div');
      status.className = 'staff-status';
      status.innerHTML = '<h4>Staff Status</h4><p>All staff members are performing adequately.</p>';
      staffSection.appendChild(status);
  }

  // Actions
  const actions = document.createElement('div');
  actions.className = 'owner-actions';
  content.appendChild(actions);

  const relocateBtn = document.createElement('button');
  relocateBtn.className = 'btn btn-warning';
  relocateBtn.textContent = 'Relocate Franchise';
  relocateBtn.addEventListener('click', () => { window.location.hash = '#/relocation'; });
  actions.appendChild(relocateBtn);

  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  actions.appendChild(spacer);

  const disableBtn = document.createElement('button');
  disableBtn.className = 'btn btn-secondary';
  disableBtn.textContent = 'Disable Owner Mode';
  disableBtn.addEventListener('click', disableOwnerMode);
  actions.appendChild(disableBtn);

  container.appendChild(card);
}

// Make functions available globally
window.initializeOwnerMode = initializeOwnerMode;
window.enableOwnerMode = enableOwnerMode;
window.disableOwnerMode = disableOwnerMode;
window.updateBusinessPrices = updateBusinessPrices;
window.fireStaffMember = fireStaffMember;
window.renderOwnerModeInterface = renderOwnerModeInterface;
window.generateOwnerGoals = generateOwnerGoals;
window.checkOwnerGoals = checkOwnerGoals;
window.checkJobSecurity = checkJobSecurity;

/**
 * Process revenue for a single playoff home game
 * @param {Object} team - Team object
 */
function processPlayoffRevenue(team) {
    if (!window.state.ownerMode || !window.state.ownerMode.enabled) return;

    // Initialize if needed
    if (!window.state.ownerMode.revenue) window.state.ownerMode.revenue = {};
    if (!window.state.ownerMode.revenue.playoffs) window.state.ownerMode.revenue.playoffs = 0;

    const settings = window.state.ownerMode.businessSettings;
    const fanSatisfaction = window.state.ownerMode.fanSatisfaction;
    const marketMultiplier = getMarketMultiplier(team);

    // Playoff Hype Multipliers
    const attendanceMultiplier = (fanSatisfaction / 100) * 1.2; // +20% demand
    const baseAttendance = 65000;
    const actualAttendance = Math.min(80000, Math.round(baseAttendance * attendanceMultiplier * marketMultiplier));

    // Calculate Game Revenue
    // Fans willing to pay more in playoffs, assume price is static but demand holds up
    const ticketRevenue = actualAttendance * settings.ticketPrice;

    // Higher concession/merch spend per fan in playoffs
    const concessionRevenue = actualAttendance * settings.concessionPrice * 0.9;
    const parkingRevenue = (actualAttendance / 2.5) * settings.parkingPrice;
    const merchandiseRevenue = actualAttendance * settings.merchandisePrice * 0.6;

    const gameRevenue = ticketRevenue + concessionRevenue + parkingRevenue + merchandiseRevenue;

    window.state.ownerMode.revenue.playoffs += gameRevenue;

    // Update Total Immediately for UI
    window.state.ownerMode.revenue.total += gameRevenue;
    window.state.ownerMode.profit += gameRevenue; // Expenses are fixed annual, so this is pure profit margin boost

    console.log(`[OwnerMode] Playoff Game Revenue: $${(gameRevenue / 1000000).toFixed(2)}M`);
    if (window.setStatus) window.setStatus(`Playoff Home Game generated $${(gameRevenue / 1000000).toFixed(1)}M`, 'success');
}

window.processPlayoffRevenue = processPlayoffRevenue;

// Initialize on load
if (window.state) {
  initializeOwnerMode();
} else {
  window.addEventListener('load', initializeOwnerMode);
}
