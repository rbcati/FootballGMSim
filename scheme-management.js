// scheme-management.js - Team Scheme Management and Scheme Fit Calculations
import { saveState } from './state.js';

'use strict';

/**
 * Calculates how well a player fits a given offensive scheme
 * @param {Object} player - Player object
 * @param {string} scheme - Offensive scheme name
 * @returns {number} Fit rating (0-100)
 */
function calculateOffensiveSchemeFit(player, scheme) {
  if (!player || !player.ratings || !scheme) return 50;
  
  const C = window.Constants;
  const schemeData = C?.OFFENSIVE_SCHEMES?.[scheme];
  if (!schemeData || !schemeData.keyStats) return 50;
  
  const ratings = player.ratings;
  const keyStats = schemeData.keyStats;
  
  // Calculate average of key stats for this scheme
  let totalRating = 0;
  let count = 0;
  
  keyStats.forEach(stat => {
    const value = ratings[stat];
    if (typeof value === 'number' && value > 0) {
      totalRating += value;
      count++;
    }
  });
  
  if (count === 0) return 50;
  
  return Math.round(totalRating / count);
}

/**
 * Calculates how well a player fits a given defensive scheme
 * @param {Object} player - Player object
 * @param {string} scheme - Defensive scheme name
 * @returns {number} Fit rating (0-100)
 */
function calculateDefensiveSchemeFit(player, scheme) {
  if (!player || !player.ratings || !scheme) return 50;
  
  const C = window.Constants;
  const schemeData = C?.DEFENSIVE_SCHEMES?.[scheme];
  if (!schemeData || !schemeData.keyStats) return 50;
  
  const ratings = player.ratings;
  const keyStats = schemeData.keyStats;
  
  // Calculate average of key stats for this scheme
  let totalRating = 0;
  let count = 0;
  
  keyStats.forEach(stat => {
    const value = ratings[stat];
    if (typeof value === 'number' && value > 0) {
      totalRating += value;
      count++;
    }
  });
  
  if (count === 0) return 50;
  
  return Math.round(totalRating / count);
}

/**
 * Calculates team overall rating based on scheme fit
 * @param {Object} team - Team object
 * @returns {Object} Team rating with scheme fit adjustments
 */
function calculateTeamRatingWithSchemeFit(team) {
  if (!team || !team.roster) {
    return {
      overall: 0,
      offense: 0,
      defense: 0,
      schemeFitBonus: 0,
      schemeFitPenalty: 0
    };
  }
  
  // Get current schemes
  const offScheme = team.strategies?.offense || 'Balanced';
  const defScheme = team.strategies?.defense || '4-3';
  
  const C = window.Constants;
  const OFFENSIVE_POSITIONS = C?.OFFENSIVE_POSITIONS || ['QB', 'RB', 'WR', 'TE', 'OL', 'K'];
  const DEFENSIVE_POSITIONS = C?.DEFENSIVE_POSITIONS || ['DL', 'LB', 'CB', 'S', 'P'];
  
  // Calculate base ratings
  let offensiveRating = 0;
  let defensiveRating = 0;
  let offensiveFitTotal = 0;
  let defensiveFitTotal = 0;
  let offensiveCount = 0;
  let defensiveCount = 0;
  
  team.roster.forEach(player => {
    if (OFFENSIVE_POSITIONS.includes(player.pos)) {
      const baseOvr = player.ovr || 50;
      const fitRating = calculateOffensiveSchemeFit(player, offScheme);
      const adjustedRating = baseOvr + ((fitRating - 50) * 0.3); // 30% scheme fit impact
      
      offensiveRating += adjustedRating;
      offensiveFitTotal += fitRating;
      offensiveCount++;
    } else if (DEFENSIVE_POSITIONS.includes(player.pos)) {
      const baseOvr = player.ovr || 50;
      const fitRating = calculateDefensiveSchemeFit(player, defScheme);
      const adjustedRating = baseOvr + ((fitRating - 50) * 0.3); // 30% scheme fit impact
      
      defensiveRating += adjustedRating;
      defensiveFitTotal += fitRating;
      defensiveCount++;
    }
  });
  
  const avgOffensiveRating = offensiveCount > 0 ? offensiveRating / offensiveCount : 0;
  const avgDefensiveRating = defensiveCount > 0 ? defensiveRating / defensiveCount : 0;
  const avgOffensiveFit = offensiveCount > 0 ? offensiveFitTotal / offensiveCount : 50;
  const avgDefensiveFit = defensiveCount > 0 ? defensiveFitTotal / defensiveCount : 50;
  
  // Calculate scheme fit bonuses/penalties
  const offensiveFitBonus = (avgOffensiveFit - 50) * 0.2; // Up to +/- 10 points
  const defensiveFitBonus = (avgDefensiveFit - 50) * 0.2;
  
  // Overall team rating (weighted)
  const overall = Math.round(
    (avgOffensiveRating * 0.45) + 
    (avgDefensiveRating * 0.45) + 
    (offensiveFitBonus + defensiveFitBonus)
  );
  
  return {
    overall: Math.max(0, Math.min(100, overall)),
    offense: Math.round(avgOffensiveRating),
    defense: Math.round(avgDefensiveRating),
    offensiveSchemeFit: Math.round(avgOffensiveFit),
    defensiveSchemeFit: Math.round(avgDefensiveFit),
    schemeFitBonus: Math.round((offensiveFitBonus + defensiveFitBonus) * 10) / 10,
    offensiveScheme: offScheme,
    defensiveScheme: defScheme
  };
}

/**
 * Renders the scheme management UI
 */
function renderSchemeManagement() {
  const L = window.state?.league;
  if (!L) {
    console.error('No league data available');
    return;
  }
  
  const userTeamId = window.state?.userTeamId ?? 0;
  const team = L.teams?.[userTeamId];
  if (!team) {
    console.error('User team not found');
    return;
  }
  
  // Initialize strategies if they don't exist
  if (!team.strategies) {
    team.strategies = {
      offense: 'Balanced',
      defense: '4-3'
    };
  }
  
  const C = window.Constants;
  const offensiveSchemes = Object.keys(C?.OFFENSIVE_SCHEMES || {});
  const defensiveSchemes = Object.keys(C?.DEFENSIVE_SCHEMES || {});
  
  // Calculate current scheme fit ratings
  const schemeRatings = calculateTeamRatingWithSchemeFit(team);
  
  // Get scheme descriptions
  const currentOffScheme = C?.OFFENSIVE_SCHEMES?.[team.strategies.offense] || {};
  const currentDefScheme = C?.DEFENSIVE_SCHEMES?.[team.strategies.defense] || {};
  
  const container = document.getElementById('schemeManagement');
  if (!container) {
    console.error('Scheme management container not found');
    return;
  }
  
  container.innerHTML = `
    <div class="scheme-management-container">
      <div class="scheme-section">
        <h3>Current Team Rating (With Scheme Fit)</h3>
        <div class="scheme-rating-display">
          <div class="rating-item">
            <span class="rating-label">Overall:</span>
            <span class="rating-value ${schemeRatings.overall >= 85 ? 'elite' : schemeRatings.overall >= 75 ? 'good' : ''}">
              ${schemeRatings.overall}
            </span>
          </div>
          <div class="rating-item">
            <span class="rating-label">Offense:</span>
            <span class="rating-value">${schemeRatings.offense}</span>
            <span class="scheme-fit-badge ${schemeRatings.offensiveSchemeFit >= 70 ? 'good-fit' : schemeRatings.offensiveSchemeFit < 50 ? 'poor-fit' : ''}">
              ${schemeRatings.offensiveSchemeFit}% Fit
            </span>
          </div>
          <div class="rating-item">
            <span class="rating-label">Defense:</span>
            <span class="rating-value">${schemeRatings.defense}</span>
            <span class="scheme-fit-badge ${schemeRatings.defensiveSchemeFit >= 70 ? 'good-fit' : schemeRatings.defensiveSchemeFit < 50 ? 'poor-fit' : ''}">
              ${schemeRatings.defensiveSchemeFit}% Fit
            </span>
          </div>
          ${schemeRatings.schemeFitBonus !== 0 ? `
            <div class="rating-item">
              <span class="rating-label">Scheme Fit Bonus:</span>
              <span class="rating-value ${schemeRatings.schemeFitBonus > 0 ? 'positive' : 'negative'}">
                ${schemeRatings.schemeFitBonus > 0 ? '+' : ''}${schemeRatings.schemeFitBonus}
              </span>
            </div>
          ` : ''}
        </div>
      </div>
      
      <div class="scheme-section">
        <h3>Offensive Scheme</h3>
        <div class="scheme-selector">
          <select id="offensiveSchemeSelect" class="scheme-select">
            ${offensiveSchemes.map(scheme => `
              <option value="${scheme}" ${team.strategies.offense === scheme ? 'selected' : ''}>
                ${scheme}
              </option>
            `).join('')}
          </select>
          <div class="scheme-description">
            <strong>${team.strategies.offense}:</strong> 
            ${currentOffScheme.description || 'No description available'}
          </div>
          <div class="scheme-key-stats">
            <strong>Key Attributes:</strong> 
            ${(currentOffScheme.keyStats || []).join(', ')}
          </div>
        </div>
      </div>
      
      <div class="scheme-section">
        <h3>Defensive Scheme</h3>
        <div class="scheme-selector">
          <select id="defensiveSchemeSelect" class="scheme-select">
            ${defensiveSchemes.map(scheme => `
              <option value="${scheme}" ${team.strategies.defense === scheme ? 'selected' : ''}>
                ${scheme}
              </option>
            `).join('')}
          </select>
          <div class="scheme-description">
            <strong>${team.strategies.defense}:</strong> 
            ${currentDefScheme.description || 'No description available'}
          </div>
          <div class="scheme-key-stats">
            <strong>Key Attributes:</strong> 
            ${(currentDefScheme.keyStats || []).join(', ')}
          </div>
        </div>
      </div>
      
      <div class="scheme-section">
        <h3>Player Scheme Fit Analysis</h3>
        <div class="scheme-fit-analysis">
          <p class="muted">Players are rated based on how well their attributes match your current schemes.</p>
          <div class="scheme-fit-list" id="schemeFitList">
            ${renderPlayerSchemeFits(team, team.strategies.offense, team.strategies.defense)}
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Add event listeners for scheme changes
  const offSelect = document.getElementById('offensiveSchemeSelect');
  const defSelect = document.getElementById('defensiveSchemeSelect');
  
  if (offSelect) {
    offSelect.addEventListener('change', (e) => {
      team.strategies.offense = e.target.value;
      if (saveState) saveState();
      renderSchemeManagement(); // Re-render to update ratings
      if (window.updateTeamRatings) {
        window.updateTeamRatings(team);
      }
      window.setStatus(`Changed offensive scheme to ${e.target.value}`);
    });
  }
  
  if (defSelect) {
    defSelect.addEventListener('change', (e) => {
      team.strategies.defense = e.target.value;
      if (saveState) saveState();
      renderSchemeManagement(); // Re-render to update ratings
      if (window.updateTeamRatings) {
        window.updateTeamRatings(team);
      }
      window.setStatus(`Changed defensive scheme to ${e.target.value}`);
    });
  }
}

/**
 * Renders player scheme fit list
 */
function renderPlayerSchemeFits(team, offScheme, defScheme) {
  if (!team.roster || team.roster.length === 0) {
    return '<p class="muted">No players on roster</p>';
  }
  
  const C = window.Constants;
  const OFFENSIVE_POSITIONS = C?.OFFENSIVE_POSITIONS || ['QB', 'RB', 'WR', 'TE', 'OL', 'K'];
  const DEFENSIVE_POSITIONS = C?.DEFENSIVE_POSITIONS || ['DL', 'LB', 'CB', 'S', 'P'];
  
  const players = team.roster.map(player => {
    let fitRating = 50;
    let schemeType = '';
    
    if (OFFENSIVE_POSITIONS.includes(player.pos)) {
      fitRating = calculateOffensiveSchemeFit(player, offScheme);
      schemeType = 'Offense';
    } else if (DEFENSIVE_POSITIONS.includes(player.pos)) {
      fitRating = calculateDefensiveSchemeFit(player, defScheme);
      schemeType = 'Defense';
    }
    
    return {
      player,
      fitRating,
      schemeType
    };
  }).sort((a, b) => {
    // Sort by fit rating descending, then by OVR
    if (Math.abs(b.fitRating - a.fitRating) > 1) {
      return b.fitRating - a.fitRating;
    }
    return (b.player.ovr || 0) - (a.player.ovr || 0);
  });
  
  // Group by fit quality for better visualization
  const excellent = players.filter(p => p.fitRating >= 70);
  const good = players.filter(p => p.fitRating >= 60 && p.fitRating < 70);
  const average = players.filter(p => p.fitRating >= 50 && p.fitRating < 60);
  const poor = players.filter(p => p.fitRating < 50);
  
  const getFitColor = (rating) => {
    if (rating >= 70) return '#28a745';
    if (rating >= 60) return '#17a2b8';
    if (rating >= 50) return '#ffc107';
    return '#dc3545';
  };
  
  const getFitLabel = (rating) => {
    if (rating >= 70) return 'Excellent';
    if (rating >= 60) return 'Good';
    if (rating >= 50) return 'Average';
    return 'Poor';
  };
  
  return `
    <div class="scheme-fit-container">
      <div class="scheme-fit-summary">
        <div class="fit-summary-stat excellent">
          <div class="fit-summary-count">${excellent.length}</div>
          <div class="fit-summary-label">Excellent</div>
        </div>
        <div class="fit-summary-stat good">
          <div class="fit-summary-count">${good.length}</div>
          <div class="fit-summary-label">Good</div>
        </div>
        <div class="fit-summary-stat average">
          <div class="fit-summary-count">${average.length}</div>
          <div class="fit-summary-label">Average</div>
        </div>
        <div class="fit-summary-stat poor">
          <div class="fit-summary-count">${poor.length}</div>
          <div class="fit-summary-label">Poor</div>
        </div>
      </div>
      
      <div class="scheme-fit-grid">
        ${players.map(({ player, fitRating, schemeType }) => {
          const fitColor = getFitColor(fitRating);
          const fitLabel = getFitLabel(fitRating);
          const barWidth = fitRating;
          
          return `
            <div class="scheme-fit-card ${fitRating >= 70 ? 'excellent-fit' : fitRating >= 60 ? 'good-fit' : fitRating < 50 ? 'poor-fit' : 'average-fit'}">
              <div class="scheme-fit-card-header">
                <div class="scheme-fit-player-info">
                  <div class="scheme-fit-player-name">${player.name || 'Unknown'}</div>
                  <div class="scheme-fit-player-details">
                    <span class="scheme-fit-position">${player.pos || 'N/A'}</span>
                    <span class="scheme-fit-ovr">OVR ${player.ovr || 'N/A'}</span>
                    <span class="scheme-fit-type">${schemeType}</span>
                  </div>
                </div>
                <div class="scheme-fit-rating-badge" style="background: ${fitColor}20; color: ${fitColor}; border-color: ${fitColor}">
                  <div class="fit-rating-value">${Math.round(fitRating)}</div>
                  <div class="fit-rating-label">${fitLabel}</div>
                </div>
              </div>
              <div class="scheme-fit-progress-container">
                <div class="scheme-fit-progress-bar">
                  <div class="scheme-fit-progress-fill" style="width: ${barWidth}%; background: ${fitColor}"></div>
                </div>
                <div class="scheme-fit-percentage">${Math.round(fitRating)}%</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// Export functions globally
window.renderSchemeManagement = renderSchemeManagement;
window.calculateOffensiveSchemeFit = calculateOffensiveSchemeFit;
window.calculateDefensiveSchemeFit = calculateDefensiveSchemeFit;
window.calculateTeamRatingWithSchemeFit = calculateTeamRatingWithSchemeFit;

console.log('✅ Scheme Management system loaded');
