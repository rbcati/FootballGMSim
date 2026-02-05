// scouting-system.js - Comprehensive Scouting System
'use strict';

/**
 * Comprehensive Scouting System for Draft Prospects
 * Integrates with existing draft system to provide detailed prospect evaluation
 */

// Scouting system constants
const SCOUTING_CONSTANTS = {
  SCOUTING_ACCURACY: {
    BASIC: 60,      // Basic scouting accuracy
    THOROUGH: 85,   // Thorough scouting accuracy
    COMBINE: 95     // Combine scouting accuracy
  },
  
  SCOUTING_COSTS: {
    BASIC: 50000,    // $50k per basic scout
    THOROUGH: 150000, // $150k per thorough scout
    COMBINE: 500000   // $500k per combine scout
  },
  
  SCOUTING_LIMITS: {
    BASIC_PER_WEEK: 10,
    THOROUGH_PER_WEEK: 5,
    COMBINE_PER_WEEK: 2
  }
};

/**
 * Initialize scouting system
 */
function initializeScoutingSystem() {
  // Add scouting data to state if not exists
  if (!window.state.scouting) {
    window.state.scouting = {
      budget: 2000000, // $2M scouting budget
      used: 0,
      weeklyScouts: {
        basic: 0,
        thorough: 0,
        combine: 0
      },
      scoutedProspects: new Set(),
      scoutingReports: {},
      lastReset: window.state.league?.year || 2025
    };
  }
  
  // Reset weekly limits if new season
  const currentYear = window.state.league?.year || 2025;
  if (window.state.scouting.lastReset !== currentYear) {
    window.state.scouting.weeklyScouts = { basic: 0, thorough: 0, combine: 0 };
    window.state.scouting.lastReset = currentYear;
  }
  
  console.log('Scouting system initialized');
}

/**
 * Scout a prospect with specified thoroughness
 * @param {string} prospectId - ID of prospect to scout
 * @param {string} thoroughness - 'basic', 'thorough', or 'combine'
 * @returns {Object} Scouting result
 */
function scoutProspect(prospectId, thoroughness = 'basic') {
  const prospect = window.state.draftClass?.find(p => p.id === prospectId);
  if (!prospect) {
    return { success: false, message: 'Prospect not found' };
  }
  
  const scouting = window.state.scouting;
  const cost = SCOUTING_CONSTANTS.SCOUTING_COSTS[thoroughness.toUpperCase()];
  const limit = SCOUTING_CONSTANTS.SCOUTING_LIMITS[`${thoroughness.toUpperCase()}_PER_WEEK`];
  
  // Check budget
  if (scouting.used + cost > scouting.budget) {
    return { success: false, message: 'Insufficient scouting budget' };
  }
  
  // Check weekly limits
  if (scouting.weeklyScouts[thoroughness] >= limit) {
    return { success: false, message: `Weekly ${thoroughness} scouting limit reached` };
  }
  
  // Check if already scouted this week
  if (scouting.scoutedProspects.has(prospectId)) {
    return { success: false, message: 'Prospect already scouted this week' };
  }
  
  // Perform scouting
  const result = performScouting(prospect, thoroughness);
  
  // Update scouting data
  scouting.used += cost;
  scouting.weeklyScouts[thoroughness]++;
  scouting.scoutedProspects.add(prospectId);
  scouting.scoutingReports[prospectId] = result.report;
  
  return {
    success: true,
    message: `Scouted ${prospect.name} (${thoroughness}) - Cost: $${cost.toLocaleString()}`,
    report: result.report,
    cost: cost
  };
}

/**
 * Perform the actual scouting evaluation
 * @param {Object} prospect - Prospect to scout
 * @param {string} thoroughness - Scouting thoroughness
 * @returns {Object} Scouting result
 */
function performScouting(prospect, thoroughness) {
  // Get User's Scout
  const userTeamId = window.state.userTeamId;
  const team = window.state.league.teams[userTeamId];
  const scout = team.staff ? team.staff.scout : null;

  // Base Accuracy
  let accuracy = SCOUTING_CONSTANTS.SCOUTING_ACCURACY[thoroughness.toUpperCase()];

  // Apply Scout Bonus
  if (scout) {
      const scoutAccuracy = scout.accuracy || 75;
      const bonus = (scoutAccuracy - 75) * 0.5; // Up to +12.5% accuracy
      accuracy += bonus;
  }

  const actualOvr = prospect.ovr;
  
  // Calculate scouting accuracy with some randomness
  const accuracyRoll = (window.Utils?.random || Math.random)() * 100;
  const effectiveAccuracy = Math.min(99, accuracy + (accuracyRoll - 50) * 0.1); // ±5% variation
  
  // Determine how close the scouting gets to actual rating
  const accuracyFactor = effectiveAccuracy / 100;
  const uncertainty = (1 - accuracyFactor) * 15; // Max 15 point uncertainty
  
  // Update scouted overall range
  const newMin = Math.max(40, actualOvr - uncertainty);
  const newMax = Math.min(99, actualOvr + uncertainty);
  
  prospect.scoutedOvr = {
    min: Math.round(newMin),
    max: Math.round(newMax),
    confidence: Math.round(effectiveAccuracy)
  };
  
  // Gem Discovery Chance
  if (scout && scout.discovery) {
      const discoveryChance = scout.discovery / 200; // e.g., 90/200 = 45%
      if ((window.Utils?.random || Math.random)() < discoveryChance && prospect.ovr > 80 && prospect.projectedRound > 3) {
          prospect.isGem = true; // Flag for UI
      }
  }

  // Generate detailed scouting report
  const report = generateScoutingReport(prospect, thoroughness, effectiveAccuracy);
  
  // Mark as scouted
  prospect.scouted = true;
  prospect.scoutingThoroughness = thoroughness;
  
  return { report };
}

/**
 * Generate detailed scouting report
 * @param {Object} prospect - Prospect object
 * @param {string} thoroughness - Scouting thoroughness
 * @param {number} accuracy - Scouting accuracy achieved
 * @returns {Object} Scouting report
 */
function generateScoutingReport(prospect, thoroughness, accuracy) {
  const report = {
    date: new Date().toISOString(),
    thoroughness: thoroughness,
    accuracy: Math.round(accuracy),
    overall: {
      range: `${prospect.scoutedOvr.min}-${prospect.scoutedOvr.max}`,
      confidence: prospect.scoutedOvr.confidence,
      grade: getProspectGrade(prospect.scoutedOvr.min, prospect.scoutedOvr.max)
    },
    strengths: [],
    weaknesses: [],
    concerns: [],
    notes: [],
    projection: getProspectProjection(prospect, thoroughness)
  };
  
  // Analyze ratings based on position
  const ratings = prospect.ratings;
  const position = prospect.pos;
  
  // Position-specific analysis
  if (position === 'QB') {
    if (ratings.awareness >= 85) report.strengths.push('High football IQ');
    if (ratings.throwPower >= 90) report.strengths.push('Elite arm strength');
    if (ratings.throwAccuracy >= 85) report.strengths.push('Accurate passer');
    if (ratings.speed >= 80) report.strengths.push('Mobile quarterback');
    
    if (ratings.awareness < 70) report.weaknesses.push('Questionable decision making');
    if (ratings.throwPower < 75) report.weaknesses.push('Limited arm strength');
  } else if (position === 'RB') {
    if (ratings.speed >= 90) report.strengths.push('Elite speed');
    if (ratings.agility >= 85) report.strengths.push('Excellent agility');
    if (ratings.carrying >= 85) report.strengths.push('Strong ball carrier');
    
    if (ratings.speed < 75) report.weaknesses.push('Lacks breakaway speed');
    if (ratings.passBlock >= 70) report.strengths.push('Good pass blocker');
  } else if (position === 'WR') {
    if (ratings.speed >= 90) report.strengths.push('Elite speed');
    if (ratings.catching >= 85) report.strengths.push('Reliable hands');
    if (ratings.routeRunning >= 85) report.strengths.push('Precise route runner');
    
    if (ratings.catching < 75) report.weaknesses.push('Inconsistent hands');
  } else if (position === 'OL') {
    if (ratings.strength >= 90) report.strengths.push('Elite strength');
    if (ratings.passBlock >= 85) report.strengths.push('Excellent pass blocker');
    if (ratings.runBlock >= 85) report.strengths.push('Dominant run blocker');
    
    if (ratings.strength < 75) report.weaknesses.push('Lacks strength');
  } else if (position === 'DL') {
    if (ratings.strength >= 90) report.strengths.push('Elite strength');
    if (ratings.passRush >= 85) report.strengths.push('Elite pass rusher');
    if (ratings.runDefense >= 85) report.strengths.push('Stout run defender');
    
    if (ratings.strength < 75) report.weaknesses.push('Lacks strength');
  } else if (position === 'LB') {
    if (ratings.speed >= 85) report.strengths.push('Excellent speed');
    if (ratings.tackling >= 85) report.strengths.push('Reliable tackler');
    if (ratings.coverage >= 80) report.strengths.push('Good in coverage');
    
    if (ratings.speed < 75) report.weaknesses.push('Lacks speed');
  } else if (position === 'CB' || position === 'S') {
    if (ratings.speed >= 90) report.strengths.push('Elite speed');
    if (ratings.coverage >= 85) report.strengths.push('Excellent coverage');
    if (ratings.tackling >= 80) report.strengths.push('Reliable tackler');
    
    if (ratings.speed < 75) report.weaknesses.push('Lacks speed');
  }
  
  // Character analysis
  if (prospect.character) {
    if (prospect.character.workEthic >= 90) report.strengths.push('Exceptional work ethic');
    if (prospect.character.leadership >= 85) report.strengths.push('Natural leader');
    if (prospect.character.coachability >= 85) report.strengths.push('Highly coachable');
    
    if (prospect.character.workEthic < 70) report.weaknesses.push('Work ethic concerns');
    if (prospect.character.injury_prone) report.concerns.push('Injury history');
    if (prospect.character.red_flags) report.concerns.push('Character concerns');
  }
  
  // College performance analysis
  if (prospect.collegeStats) {
    const stats = prospect.collegeStats;
    if (stats.gamesPlayed >= 40) report.strengths.push('Extensive experience');
    if (stats.gamesPlayed < 20) report.weaknesses.push('Limited experience');
  }
  
  // Generate summary notes
  if (thoroughness === 'combine') {
    report.notes.push('Combine performance analyzed');
    report.notes.push('Medical evaluation completed');
    report.notes.push('Character background checked');
  } else if (thoroughness === 'thorough') {
    report.notes.push('Multiple game tapes reviewed');
    report.notes.push('Practice habits observed');
  } else {
    report.notes.push('Basic evaluation completed');
  }
  
  return report;
}

/**
 * Get prospect grade based on overall range
 * @param {number} min - Minimum overall
 * @param {number} max - Maximum overall
 * @returns {string} Letter grade
 */
function getProspectGrade(min, max) {
  const avg = (min + max) / 2;
  
  if (avg >= 85) return 'A';
  if (avg >= 80) return 'A-';
  if (avg >= 75) return 'B+';
  if (avg >= 70) return 'B';
  if (avg >= 65) return 'B-';
  if (avg >= 60) return 'C+';
  if (avg >= 55) return 'C';
  if (avg >= 50) return 'C-';
  if (avg >= 45) return 'D+';
  if (avg >= 40) return 'D';
  return 'F';
}

/**
 * Get prospect projection
 * @param {Object} prospect - Prospect object
 * @param {string} thoroughness - Scouting thoroughness
 * @returns {Object} Projection details
 */
function getProspectProjection(prospect, thoroughness) {
  const avgOvr = (prospect.scoutedOvr.min + prospect.scoutedOvr.max) / 2;
  
  let projection = {
    round: 'UDFA',
    role: 'Depth',
    ceiling: 'Backup',
    floor: 'Practice Squad'
  };
  
  if (avgOvr >= 85) {
    projection.round = '1st';
    projection.role = 'Starter';
    projection.ceiling = 'Pro Bowl';
    projection.floor = 'Solid Starter';
  } else if (avgOvr >= 80) {
    projection.round = '1st-2nd';
    projection.role = 'Starter';
    projection.ceiling = 'Pro Bowl';
    projection.floor = 'Role Player';
  } else if (avgOvr >= 75) {
    projection.round = '2nd-3rd';
    projection.role = 'Role Player';
    projection.ceiling = 'Solid Starter';
    projection.floor = 'Backup';
  } else if (avgOvr >= 70) {
    projection.round = '3rd-4th';
    projection.role = 'Backup';
    projection.ceiling = 'Role Player';
    projection.floor = 'Practice Squad';
  } else if (avgOvr >= 65) {
    projection.round = '4th-5th';
    projection.role = 'Backup';
    projection.ceiling = 'Backup';
    projection.floor = 'Practice Squad';
  } else if (avgOvr >= 60) {
    projection.round = '5th-6th';
    projection.role = 'Depth';
    projection.ceiling = 'Backup';
    projection.floor = 'Practice Squad';
  } else if (avgOvr >= 55) {
    projection.round = '6th-7th';
    projection.role = 'Depth';
    projection.ceiling = 'Backup';
    projection.floor = 'Practice Squad';
  }
  
  return projection;
}

/**
 * Render scouting interface
 */
function renderScoutingInterface() {
  const scouting = window.state.scouting;
  const draftClass = window.state.draftClass;
  
  // Create or update scouting container
  let container = document.getElementById('scouting');
  if (!container) {
    container = document.createElement('div');
    container.id = 'scouting';
    container.className = 'view';
    container.hidden = true;
    
    // Insert after draft section
    const draftSection = document.getElementById('draft');
    if (draftSection) {
      draftSection.parentNode.insertBefore(container, draftSection.nextSibling);
    }
  }
  
  if (!draftClass || draftClass.length === 0) {
    container.innerHTML = `
      <div class="card">
        <h2>Scouting</h2>
        <p>No draft class available. Generate a draft class first.</p>
        <button class="btn btn-primary" onclick="generateDraftClass()">Generate Draft Class</button>
      </div>
    `;
    return;
  }
  
  const budgetRemaining = scouting.budget - scouting.used;
  const budgetPercent = (budgetRemaining / scouting.budget) * 100;

  // Get Head Scout
  const userTeamId = window.state.userTeamId;
  const team = window.state.league.teams[userTeamId];
  const scout = team.staff ? team.staff.scout : null;
  const scoutInfo = scout ? `
      <div class="scout-profile" style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; margin-bottom: 15px;">
          <div style="font-weight: bold; font-size: 1.1rem;">Head Scout: ${scout.name}</div>
          <div style="display: flex; gap: 15px; font-size: 0.9rem; color: #ccc; margin-top: 5px;">
              <span>Accuracy: <span style="color:white;">${scout.accuracy}</span></span>
              <span>Discovery: <span style="color:white;">${scout.discovery}</span></span>
              <span>Speed: <span style="color:white;">${scout.speed}</span></span>
          </div>
      </div>
  ` : '<div class="muted">No Head Scout hired.</div>';
  
  container.innerHTML = `
    <div class="card">
      <h2>Scouting - ${window.state.league?.year + 1 || 2026} Draft Class</h2>
      
      ${scoutInfo}

      <div class="scouting-overview">
        <div class="scouting-budget">
          <h3>Scouting Budget</h3>
          <div class="budget-bar">
            <div class="budget-used" style="width: ${100 - budgetPercent}%"></div>
          </div>
          <p>$${budgetRemaining.toLocaleString()} remaining of $${scouting.budget.toLocaleString()}</p>
        </div>
        
        <div class="scouting-limits">
          <h3>Weekly Limits</h3>
          <div class="limits-grid">
            <div class="limit-item">
              <span class="limit-type">Basic Scouts:</span>
              <span class="limit-count">${scouting.weeklyScouts.basic}/${SCOUTING_CONSTANTS.SCOUTING_LIMITS.BASIC_PER_WEEK}</span>
            </div>
            <div class="limit-item">
              <span class="limit-type">Thorough Scouts:</span>
              <span class="limit-count">${scouting.weeklyScouts.thorough}/${SCOUTING_CONSTANTS.SCOUTING_LIMITS.THOROUGH_PER_WEEK}</span>
            </div>
            <div class="limit-item">
              <span class="limit-type">Combine Scouts:</span>
              <span class="limit-count">${scouting.weeklyScouts.combine}/${SCOUTING_CONSTANTS.SCOUTING_LIMITS.COMBINE_PER_WEEK}</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="scouting-controls">
        <div class="filter-controls">
          <select id="positionFilter" onchange="filterProspects()">
            <option value="">All Positions</option>
            <option value="QB">Quarterback</option>
            <option value="RB">Running Back</option>
            <option value="WR">Wide Receiver</option>
            <option value="TE">Tight End</option>
            <option value="OL">Offensive Line</option>
            <option value="DL">Defensive Line</option>
            <option value="LB">Linebacker</option>
            <option value="CB">Cornerback</option>
            <option value="S">Safety</option>
            <option value="K">Kicker</option>
          </select>
          
          <select id="scoutingFilter" onchange="filterProspects()">
            <option value="">All Prospects</option>
            <option value="scouted">Scouted</option>
            <option value="unscouted">Unscouted</option>
          </select>
          
          <select id="gradeFilter" onchange="filterProspects()">
            <option value="">All Grades</option>
            <option value="A">A Grade</option>
            <option value="B">B Grade</option>
            <option value="C">C Grade</option>
            <option value="D">D Grade</option>
          </select>
        </div>
      </div>
      
      <div id="prospectsList" class="prospects-grid">
        ${renderProspectsList(draftClass)}
      </div>
    </div>
  `;
}

/**
 * Render prospects list
 * @param {Array} prospects - Array of prospects
 * @returns {string} HTML string
 */
function renderProspectsList(prospects) {
  return prospects.slice(0, 50).map(prospect => {
    const scouting = window.state.scouting;
    const report = scouting.scoutingReports[prospect.id];
    const isScouted = prospect.scouted || report;
    const isGem = prospect.isGem;
    
    return `
      <div class="prospect-card ${isScouted ? 'scouted' : 'unscouted'} ${isGem ? 'gem-card' : ''}" data-prospect-id="${prospect.id}">
        ${isGem ? '<div class="gem-badge">💎 HIDDEN GEM</div>' : ''}
        <div class="prospect-header">
          <h4 class="prospect-name">${prospect.name}</h4>
          <span class="prospect-position">${prospect.pos}</span>
        </div>
        
        <div class="prospect-info">
          <div class="prospect-stats">
            <div class="stat-item">
              <span class="stat-label">Age:</span>
              <span class="stat-value">${prospect.age}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">College:</span>
              <span class="stat-value">${prospect.college || 'Unknown'}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Projected Round:</span>
              <span class="stat-value">${prospect.projectedRound || 'UDFA'}</span>
            </div>
          </div>
          
          <div class="prospect-rating">
            ${isScouted ? `
              <div class="rating-display">
                <span class="rating-range">${prospect.scoutedOvr.min}-${prospect.scoutedOvr.max}</span>
                <span class="rating-confidence">${prospect.scoutedOvr.confidence}% confidence</span>
                <span class="rating-grade grade-${getProspectGrade(prospect.scoutedOvr.min, prospect.scoutedOvr.max)}">
                  ${getProspectGrade(prospect.scoutedOvr.min, prospect.scoutedOvr.max)}
                </span>
              </div>
            ` : `
              <div class="rating-display unscouted">
                <span class="rating-range">${prospect.scoutedOvr.min}-${prospect.scoutedOvr.max}</span>
                <span class="rating-confidence">${prospect.scoutedOvr.confidence}% confidence</span>
                <span class="rating-note">Unscouted</span>
              </div>
            `}
          </div>
        </div>
        
        ${isScouted && report ? `
          <div class="scouting-report">
            <div class="report-summary">
              <h5>Scouting Report</h5>
              <div class="report-details">
                <div class="report-strengths">
                  <strong>Strengths:</strong> ${report.strengths.join(', ') || 'None identified'}
                </div>
                <div class="report-weaknesses">
                  <strong>Weaknesses:</strong> ${report.weaknesses.join(', ') || 'None identified'}
                </div>
                ${report.concerns.length > 0 ? `
                  <div class="report-concerns">
                    <strong>Concerns:</strong> ${report.concerns.join(', ')}
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        ` : ''}
        
        <div class="prospect-actions">
          ${!isScouted ? `
            <button class="btn btn-sm btn-primary" onclick="scoutProspect('${prospect.id}', 'basic')">
              Basic Scout ($50k)
            </button>
            <button class="btn btn-sm btn-secondary" onclick="scoutProspect('${prospect.id}', 'thorough')">
              Thorough Scout ($150k)
            </button>
            <button class="btn btn-sm btn-accent" onclick="scoutProspect('${prospect.id}', 'combine')">
              Combine Scout ($500k)
            </button>
          ` : `
            <button class="btn btn-sm btn-success" onclick="viewScoutingReport('${prospect.id}')">
              View Report
            </button>
            <button class="btn btn-sm btn-warning" onclick="scoutProspect('${prospect.id}', 'thorough')">
              Re-scout Thorough
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Scout a prospect (called from UI)
 * @param {string} prospectId - Prospect ID
 * @param {string} thoroughness - Scouting thoroughness
 */
window.scoutProspect = function(prospectId, thoroughness) {
  const result = scoutProspect(prospectId, thoroughness);
  
  if (result.success) {
    window.setStatus(result.message, 'success');
    renderScoutingInterface();
  } else {
    window.setStatus(result.message, 'error');
  }
};

/**
 * View detailed scouting report
 * @param {string} prospectId - Prospect ID
 */
window.viewScoutingReport = function(prospectId) {
  const prospect = window.state.draftClass?.find(p => p.id === prospectId);
  const report = window.state.scouting.scoutingReports[prospectId];
  
  if (!prospect || !report) {
    window.setStatus('Scouting report not found', 'error');
    return;
  }
  
  // Create modal for detailed report
  const modal = document.createElement('div');
  modal.className = 'modal scouting-report-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Scouting Report: ${prospect.name}</h2>
        <button class="close" onclick="this.closest('.modal').remove()">&times;</button>
      </div>
      
      <div class="modal-body">
        <div class="report-overview">
          <div class="report-meta">
            <div class="meta-item">
              <strong>Position:</strong> ${prospect.pos}
            </div>
            <div class="meta-item">
              <strong>Age:</strong> ${prospect.age}
            </div>
            <div class="meta-item">
              <strong>College:</strong> ${prospect.college || 'Unknown'}
            </div>
            <div class="meta-item">
              <strong>Scouting Date:</strong> ${new Date(report.date).toLocaleDateString()}
            </div>
            <div class="meta-item">
              <strong>Thoroughness:</strong> ${report.thoroughness}
            </div>
            <div class="meta-item">
              <strong>Accuracy:</strong> ${report.accuracy}%
            </div>
          </div>
          
          <div class="report-rating">
            <h3>Overall Rating</h3>
            <div class="rating-display-large">
              <span class="rating-range">${report.overall.range}</span>
              <span class="rating-grade grade-${report.overall.grade}">${report.overall.grade}</span>
              <span class="rating-confidence">${report.overall.confidence}% confidence</span>
            </div>
          </div>
        </div>
        
        <div class="report-details">
          <div class="report-section">
            <h4>Strengths</h4>
            <ul>
              ${report.strengths.map(strength => `<li>${strength}</li>`).join('')}
            </ul>
          </div>
          
          <div class="report-section">
            <h4>Weaknesses</h4>
            <ul>
              ${report.weaknesses.map(weakness => `<li>${weakness}</li>`).join('')}
            </ul>
          </div>
          
          ${report.concerns.length > 0 ? `
            <div class="report-section">
              <h4>Concerns</h4>
              <ul>
                ${report.concerns.map(concern => `<li>${concern}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
          
          <div class="report-section">
            <h4>Projection</h4>
            <div class="projection-details">
              <div class="projection-item">
                <strong>Draft Round:</strong> ${report.projection.round}
              </div>
              <div class="projection-item">
                <strong>Expected Role:</strong> ${report.projection.role}
              </div>
              <div class="projection-item">
                <strong>Ceiling:</strong> ${report.projection.ceiling}
              </div>
              <div class="projection-item">
                <strong>Floor:</strong> ${report.projection.floor}
              </div>
            </div>
          </div>
          
          <div class="report-section">
            <h4>Notes</h4>
            <ul>
              ${report.notes.map(note => `<li>${note}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.style.display = 'block';
};

/**
 * Filter prospects based on selected criteria
 */
window.filterProspects = function() {
  const positionFilter = document.getElementById('positionFilter')?.value;
  const scoutingFilter = document.getElementById('scoutingFilter')?.value;
  const gradeFilter = document.getElementById('gradeFilter')?.value;
  
  const prospects = document.querySelectorAll('.prospect-card');
  
  // Create map for faster lookups
  const prospectMap = new Map();
  if (window.state.draftClass) {
    for (const p of window.state.draftClass) {
      prospectMap.set(p.id, p);
    }
  }

  prospects.forEach(card => {
    const prospectId = card.dataset.prospectId;
    const prospect = prospectMap.get(prospectId);
    const report = window.state.scouting.scoutingReports[prospectId];
    const isScouted = prospect?.scouted || report;
    
    let show = true;
    
    // Position filter
    if (positionFilter && prospect.pos !== positionFilter) {
      show = false;
    }
    
    // Scouting filter
    if (scoutingFilter === 'scouted' && !isScouted) {
      show = false;
    } else if (scoutingFilter === 'unscouted' && isScouted) {
      show = false;
    }
    
    // Grade filter
    if (gradeFilter && isScouted) {
      const grade = getProspectGrade(prospect.scoutedOvr.min, prospect.scoutedOvr.max);
      if (!grade.startsWith(gradeFilter)) {
        show = false;
      }
    }
    
    card.style.display = show ? 'block' : 'none';
  });
};

// Make functions available globally
window.initializeScoutingSystem = initializeScoutingSystem;
window.scoutProspect = scoutProspect;
window.renderScoutingInterface = renderScoutingInterface;
window.viewScoutingReport = viewScoutingReport;
window.filterProspects = filterProspects;

// Initialize on load
if (window.state) {
  initializeScoutingSystem();
} else {
  window.addEventListener('load', initializeScoutingSystem);
}
