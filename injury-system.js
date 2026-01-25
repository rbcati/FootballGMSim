// injury-system.js - Comprehensive Injury System
'use strict';

(function() {
  'use strict';

  // Injury types and severities
  const INJURY_TYPES = {
    // Minor injuries (1-3 weeks)
    minor: [
      { name: 'Bruised Shoulder', weeks: 1, impact: 0.05 },
      { name: 'Sprained Ankle', weeks: 2, impact: 0.10 },
      { name: 'Strained Hamstring', weeks: 2, impact: 0.10 },
      { name: 'Bruised Ribs', weeks: 2, impact: 0.15 },
      { name: 'Concussion (Minor)', weeks: 1, impact: 0.20 }
    ],
    // Moderate injuries (3-8 weeks)
    moderate: [
      { name: 'Torn MCL', weeks: 6, impact: 0.40 },
      { name: 'Torn PCL', weeks: 6, impact: 0.40 },
      { name: 'Broken Finger', weeks: 4, impact: 0.30 },
      { name: 'Strained Groin', weeks: 4, impact: 0.35 },
      { name: 'High Ankle Sprain', weeks: 6, impact: 0.40 },
      { name: 'Concussion (Moderate)', weeks: 2, impact: 0.30 }
    ],
    // Major injuries (8+ weeks, season-ending possible)
    major: [
      { name: 'Torn ACL', weeks: 52, impact: 0.80, seasonEnding: true },
      { name: 'Torn Achilles', weeks: 52, impact: 0.85, seasonEnding: true },
      { name: 'Broken Leg', weeks: 12, impact: 0.70 },
      { name: 'Torn Rotator Cuff', weeks: 16, impact: 0.75 },
      { name: 'Herniated Disc', weeks: 10, impact: 0.65 },
      { name: 'Severe Concussion', weeks: 4, impact: 0.50 }
    ]
  };

  /**
   * Generate a random injury for a player
   * @param {Object} player - Player object
   * @param {Object} context - Game context (playoff, important game, etc.)
   * @returns {Object|null} Injury object or null
   */
  function generateInjury(player, context = {}) {
    if (!player) return null;
    
    const U = window.Utils;
    if (!U) return null;
    
    // Base injury chance (per game)
    let injuryChance = 0.02; // 2% base chance
    
    // Adjust based on player injury proneness
    if (player.character?.injury_prone) {
      injuryChance *= 2.5;
    }
    
    // Adjust based on position (OL, RB, LB more prone)
    const positionRisk = {
      'OL': 1.5, 'RB': 1.4, 'LB': 1.3, 'DL': 1.2,
      'QB': 0.8, 'K': 0.5, 'P': 0.5
    };
    injuryChance *= (positionRisk[player.pos] || 1.0);
    
    // Playoff games are more intense
    if (context.isPlayoff) {
      injuryChance *= 1.3;
    }
    
    // Check if injury occurs
    if (Math.random() > injuryChance) {
      return null;
    }
    
    // Determine severity
    let severity = 'minor';
    const roll = Math.random();
    if (roll < 0.05) { // 5% major
      severity = 'major';
    } else if (roll < 0.25) { // 20% moderate
      severity = 'moderate';
    }
    
    // Select specific injury
    const injuries = INJURY_TYPES[severity];
    const injury = U.choice(injuries);
    
    // Create injury object
    const injuryObj = {
      id: U.id(),
      type: injury.name,
      severity: severity,
      weeksRemaining: injury.weeks,
      impact: injury.impact, // Performance reduction (0.0 to 1.0)
      seasonEnding: injury.seasonEnding || false,
      date: new Date().toISOString(),
      position: player.pos
    };
    
    return injuryObj;
  }

  /**
   * Apply injury to player
   * @param {Object} player - Player object
   * @param {Object} injury - Injury object
   * @param {number} year - Current year
   * @param {number} week - Current week (optional)
   */
  function applyInjury(player, injury, year = null, week = null) {
    if (!player || !injury) return;
    
    if (!player.injuries) {
      player.injuries = [];
    }
    
    // Add current injury
    player.injuries.push(injury);
    player.injured = true;
    
    // Track injury in history
    if (!player.injuryHistory) {
      player.injuryHistory = [];
    }
    
    // Add to injury history with full details
    const historyEntry = {
      id: injury.id,
      type: injury.type,
      severity: injury.severity,
      weeks: injury.weeks,
      weeksRemaining: injury.weeksRemaining,
      impact: injury.impact,
      seasonEnding: injury.seasonEnding,
      date: injury.date,
      year: year || new Date().getFullYear(),
      week: week || null,
      recovered: false,
      recoveryDate: null
    };
    
    player.injuryHistory.push(historyEntry);
    
    // If season-ending, mark player
    if (injury.seasonEnding) {
      player.seasonEndingInjury = true;
    }
    
    console.log(`⚠️ ${player.name} (${player.pos}) injured: ${injury.type} (${injury.weeksRemaining} weeks)`);
  }

  /**
   * Process weekly injury recovery
   * @param {Object} league - League object
   * @param {number} year - Current year
   * @param {number} week - Current week
   */
  function processInjuryRecovery(league, year = null, week = null) {
    if (!league || !league.teams) return;
    
    league.teams.forEach(team => {
      if (!team.roster) return;
      
      team.roster.forEach(player => {
        if (!player.injuries || player.injuries.length === 0) {
          player.injured = false;
          return;
        }
        
        // Process each injury
        player.injuries = player.injuries.filter(injury => {
          injury.weeksRemaining--;
          
          if (injury.weeksRemaining <= 0) {
            // Injury healed - update history
            if (player.injuryHistory) {
              const historyEntry = player.injuryHistory.find(h => h.id === injury.id);
              if (historyEntry) {
                historyEntry.recovered = true;
                historyEntry.recoveryDate = new Date().toISOString();
                historyEntry.weeksRemaining = 0;
              }
            }
            
            console.log(`✅ ${player.name} recovered from ${injury.type}`);
            return false; // Remove injury
          }
          
          // Update history entry
          if (player.injuryHistory) {
            const historyEntry = player.injuryHistory.find(h => h.id === injury.id);
            if (historyEntry) {
              historyEntry.weeksRemaining = injury.weeksRemaining;
            }
          }
          
          return true; // Keep injury
        });
        
        // Update injured status
        player.injured = player.injuries.length > 0;
        
        // Clear season-ending flag if all injuries healed
        if (!player.injured) {
          player.seasonEndingInjury = false;
        }
      });
    });
  }

  /**
   * Record season overall rating change
   * @param {Object} player - Player object
   * @param {number} year - Season year
   * @param {number} ovrStart - OVR at start of season
   * @param {number} ovrEnd - OVR at end of season
   */
  function recordSeasonOVR(player, year, ovrStart, ovrEnd) {
    if (!player) return;
    
    if (!player.seasonHistory) {
      player.seasonHistory = [];
    }
    
    // Find or create season entry
    let seasonEntry = player.seasonHistory.find(s => s.year === year);
    if (!seasonEntry) {
      seasonEntry = {
        year: year,
        ovrStart: ovrStart,
        ovrEnd: ovrEnd,
        ovrChange: ovrEnd - ovrStart,
        injuries: []
      };
      player.seasonHistory.push(seasonEntry);
    } else {
      seasonEntry.ovrStart = ovrStart;
      seasonEntry.ovrEnd = ovrEnd;
      seasonEntry.ovrChange = ovrEnd - ovrStart;
    }
    
    // Record injuries for this season
    if (player.injuryHistory) {
      seasonEntry.injuries = player.injuryHistory
        .filter(injury => injury.year === year)
        .map(injury => ({
          type: injury.type,
          severity: injury.severity,
          weeks: injury.weeks,
          seasonEnding: injury.seasonEnding,
          recovered: injury.recovered
        }));
    }
    
    // Sort by year (newest first)
    player.seasonHistory.sort((a, b) => b.year - a.year);
  }

  /**
   * Get injury proneness assessment
   * @param {Object} player - Player object
   * @returns {Object} Assessment object
   */
  function getInjuryPronenessAssessment(player) {
    if (!player || !player.injuryHistory) {
      return {
        level: 'Unknown',
        totalInjuries: 0,
        majorInjuries: 0,
        seasonEndingInjuries: 0,
        averageWeeksPerInjury: 0,
        recommendation: 'No injury history available'
      };
    }
    
    const history = player.injuryHistory;
    const totalInjuries = history.length;
    const majorInjuries = history.filter(i => i.severity === 'major').length;
    const seasonEnding = history.filter(i => i.seasonEnding).length;
    const totalWeeks = history.reduce((sum, i) => sum + i.weeks, 0);
    const avgWeeks = totalInjuries > 0 ? totalWeeks / totalInjuries : 0;
    
    // Calculate proneness level
    let level = 'Low';
    let recommendation = 'Player has minimal injury concerns.';
    
    if (totalInjuries >= 8 || majorInjuries >= 3 || seasonEnding >= 2) {
      level = 'Very High';
      recommendation = '⚠️ WARNING: This player is extremely injury prone. Consider trading or not re-signing.';
    } else if (totalInjuries >= 5 || majorInjuries >= 2 || seasonEnding >= 1) {
      level = 'High';
      recommendation = '⚠️ CAUTION: This player has significant injury history. Monitor closely.';
    } else if (totalInjuries >= 3 || majorInjuries >= 1) {
      level = 'Moderate';
      recommendation = 'Player has some injury history. Consider depth at this position.';
    } else if (totalInjuries >= 1) {
      level = 'Low';
      recommendation = 'Player has minor injury history. Generally reliable.';
    } else {
      level = 'None';
      recommendation = 'No injury history. Very reliable player.';
    }
    
    return {
      level: level,
      totalInjuries: totalInjuries,
      majorInjuries: majorInjuries,
      seasonEndingInjuries: seasonEnding,
      averageWeeksPerInjury: Math.round(avgWeeks * 10) / 10,
      recommendation: recommendation
    };
  }

  /**
   * Get effective rating for injured player
   * @param {Object} player - Player object
   * @returns {number} Effective overall rating
   */
  function getEffectiveRating(player) {
    if (!player || !player.injured || !player.injuries) {
      return player.ovr || 0;
    }
    
    let totalImpact = 0;
    player.injuries.forEach(injury => {
      totalImpact += injury.impact;
    });
    
    // Cap total impact at 0.85 (player still has some ability)
    totalImpact = Math.min(totalImpact, 0.85);
    
    const baseOvr = player.ovr || 0;
    return Math.max(40, Math.round(baseOvr * (1 - totalImpact)));
  }

  /**
   * Check if player can play (not season-ending injury)
   * @param {Object} player - Player object
   * @returns {boolean} Can play
   */
  function canPlayerPlay(player) {
    if (!player || !player.injured) return true;
    
    // Can't play with season-ending injury
    if (player.seasonEndingInjury) return false;
    
    // Can play but at reduced effectiveness
    return true;
  }

  /**
   * Get injury status display
   * @param {Object} player - Player object
   * @returns {string} Injury status text
   */
  function getInjuryStatus(player) {
    if (!player || !player.injured || !player.injuries || player.injuries.length === 0) {
      return '';
    }
    
    const injury = player.injuries[0]; // Show most severe
    const weeks = injury.weeksRemaining;
    
    if (injury.seasonEnding) {
      return `🚑 ${injury.type} (Out for Season)`;
    }
    
    return `🚑 ${injury.type} (${weeks} week${weeks !== 1 ? 's' : ''})`;
  }

  /**
   * Renders the league-wide injuries page
   */
  function renderInjuriesPage() {
    const container = document.getElementById('injuriesContent');
    if (!container) {
      console.error('Injuries container not found');
      return;
    }

    const L = window.state?.league;
    if (!L || !L.teams) {
      container.innerHTML = '<div class="injury-summary"><p class="muted">No league data available for injuries.</p></div>';
      console.error('No league data available for injuries page');
      return;
    }
    
    if (!container) {
      console.error('Injuries container not found');
      return;
    }
    
    // Collect all injured players across all teams
    const allInjuries = [];
    
    L.teams.forEach(team => {
      if (!team.roster) return;
      
      team.roster.forEach(player => {
        if (player.injured && player.injuries && player.injuries.length > 0) {
          player.injuries.forEach(injury => {
            allInjuries.push({
              player: player,
              team: team,
              injury: injury
            });
          });
        }
      });
    });
    
    // Sort by severity (major first), then by weeks remaining
    allInjuries.sort((a, b) => {
      const severityOrder = { 'major': 3, 'moderate': 2, 'minor': 1 };
      const aSev = severityOrder[a.injury.severity] || 0;
      const bSev = severityOrder[b.injury.severity] || 0;
      if (aSev !== bSev) return bSev - aSev;
      return b.injury.weeksRemaining - a.injury.weeksRemaining;
    });
    
    if (allInjuries.length === 0) {
      container.innerHTML = `
        <div class="injury-summary">
          <p class="muted">🎉 No active injuries across the league!</p>
        </div>
      `;
      return;
    }
    
    // Group by team
    const injuriesByTeam = {};
    allInjuries.forEach(item => {
      const teamId = item.team.id;
      if (!injuriesByTeam[teamId]) {
        injuriesByTeam[teamId] = {
          team: item.team,
          injuries: []
        };
      }
      injuriesByTeam[teamId].injuries.push(item);
    });
    
    // Count by severity
    const severityCounts = {
      major: allInjuries.filter(i => i.injury.severity === 'major').length,
      moderate: allInjuries.filter(i => i.injury.severity === 'moderate').length,
      minor: allInjuries.filter(i => i.injury.severity === 'minor').length,
      seasonEnding: allInjuries.filter(i => i.injury.seasonEnding).length
    };
    
    const userTeamId = window.state?.userTeamId ?? 0;
    
    let html = `
      <div class="injury-summary">
        <div class="injury-stats">
          <div class="stat-item">
            <span class="stat-label">Total Injuries:</span>
            <span class="stat-value">${allInjuries.length}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Major:</span>
            <span class="stat-value injury-major">${severityCounts.major}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Moderate:</span>
            <span class="stat-value injury-moderate">${severityCounts.moderate}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Minor:</span>
            <span class="stat-value injury-minor">${severityCounts.minor}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Season-Ending:</span>
            <span class="stat-value injury-season-ending">${severityCounts.seasonEnding}</span>
          </div>
        </div>
      </div>
      
      <div class="injuries-by-team">
        <h3>Injuries by Team</h3>
        ${Object.values(injuriesByTeam).map(({ team, injuries }) => `
          <div class="team-injuries-card ${team.id === userTeamId ? 'user-team' : ''}">
            <div class="team-injuries-header">
              <h4>${team.name || team.abbr} (${injuries.length} ${injuries.length === 1 ? 'injury' : 'injuries'})</h4>
            </div>
            <table class="injury-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Pos</th>
                  <th>OVR</th>
                  <th>Injury</th>
                  <th>Severity</th>
                  <th>Weeks Left</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${injuries.map(({ player, injury }) => `
                  <tr class="injury-row injury-${injury.severity}">
                    <td>${player.name || 'Unknown'}</td>
                    <td>${player.pos || 'N/A'}</td>
                    <td>${player.ovr || 'N/A'}</td>
                    <td>${injury.type}</td>
                    <td>
                      <span class="severity-badge ${injury.severity}">
                        ${injury.severity.charAt(0).toUpperCase() + injury.severity.slice(1)}
                      </span>
                    </td>
                    <td>${injury.weeksRemaining || 0}</td>
                    <td>
                      ${injury.seasonEnding ? 
                        '<span class="status-badge season-ending">❌ Season-Ending</span>' : 
                        '<span class="status-badge active">⚠️ Active</span>'
                      }
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `).join('')}
      </div>
    `;
    
    container.innerHTML = html;
  }

  // Export functions
  window.generateInjury = generateInjury;
  window.applyInjury = applyInjury;
  window.processInjuryRecovery = processInjuryRecovery;
  window.getEffectiveRating = getEffectiveRating;
  window.canPlayerPlay = canPlayerPlay;
  window.getInjuryStatus = getInjuryStatus;
  window.recordSeasonOVR = recordSeasonOVR;
  window.getInjuryPronenessAssessment = getInjuryPronenessAssessment;
  window.renderInjuriesPage = renderInjuriesPage;

  console.log('✅ Injury System loaded');

})();
