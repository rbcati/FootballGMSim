import { generateAITradeProposals, renderTradeProposals } from './tradeproposals.js';
import { saveState } from './state.js';
import { generateDepthChart, renderDepthChart, movePlayerDepth, initializeDepthChartStats, calculateEffectiveRating, generateDraftClass } from './player.js';

const enhancedCSS = `
/* New styles for a more readable onboarding team select */
#onboardTeam {
  font-size: 16px;
  font-weight: 500;
  border-radius: 8px;
  background-color: #2a2a2e;
  color: #f0f0f0;
  padding: 10px;
  border: 1px solid #444;
  cursor: pointer;
  width: 100%;
}

#onboardTeam option {
  padding: 10px;
  font-weight: 500;
  background-color: #2a2a2e;
}

/* Existing styles */
.user-team {
  background: rgba(10,132,255,.1) !important;
  border-left: 3px solid var(--accent) !important;
}

.standings-table .user-team td {
  color: var(--text) !important;
  font-weight: 600 !important;
}

.conference {
  margin-bottom: 2rem;
}

.conference h3 {
  color: var(--text);
  margin-bottom: 1rem;
  font-size: 1.25rem;
}

.divisions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
}

.division {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: 1rem;
  border: 1px solid var(--hairline);
}

.division h4 {
  color: var(--text-muted);
  margin-bottom: .5rem;
  font-size: .875rem;
  text-transform: uppercase;
  letter-spacing: .5px;
}

.standings-table {
  margin: 0;
  font-size: .875rem;
}

.standings-table td {
  padding: .5rem;
}

.result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: .5rem;
  background: var(--surface);
  border-radius: var(--radius-md);
  margin-bottom: .25rem;
  font-size: .875rem;
}

.result-item .teams {
  color: var(--text);
}

.result-item .winner {
  color: var(--accent);
  font-weight: 600;
}

.abilities {
  font-size: .75rem;
  color: var(--text-subtle);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .divisions {
    grid-template-columns: 1fr;
  }
  .standings-table {
    font-size: .75rem;
  }
  .standings-table th,
  .standings-table td {
    padding: .25rem;
  }
}

/* Trade center asset styles */
.asset-item {
  background: var(--surface);
  padding: 4px 6px;
  margin: 2px 0;
  cursor: pointer;
  border-radius: 4px;
  font-size: 0.875rem;
}

.asset-item.selected {
  background-color: var(--accent);
  color: var(--on-accent, #fff);
}
`;

const styleElement = document.createElement('style');
styleElement.textContent = enhancedCSS;
document.head.appendChild(styleElement);

// --- CORE UI FUNCTIONS ---
window.show = function(viewId) {
  console.log('Showing view:', viewId);
  document.querySelectorAll('.view').forEach(view => {
    view.hidden = true;
    view.style.display = 'none';
  });
  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.hidden = false;
    targetView.style.display = 'block';
    document.querySelectorAll('.nav-pill').forEach(pill => {
      const href = pill.getAttribute('href');
      const isActive = href === `#/${viewId}`;
      pill.setAttribute('aria-current', isActive ? 'page' : null);
    });

    // Update bottom nav
    document.querySelectorAll('.nav-item-bottom').forEach(item => {
        const href = item.getAttribute('href');
        const isActive = href === `#/${viewId}`;
        if (isActive) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    console.log('✅ View shown successfully:', viewId);
  } else {
    console.error('❌ View not found:', viewId);
  }
};

/**
 * Fills a team select dropdown with available teams
 * @param {HTMLSelectElement} selectElement - The select element to populate
 * @param {string} mode - 'fictional' or 'real' team names
 */
// 🏆 ENHANCED: Refactored fillTeamSelect for better error handling and team abbreviation display
window.fillTeamSelect = function(selectElement, mode = window.state?.namesMode || 'fictional') {
  try {
    if (!selectElement) {
      console.error('fillTeamSelect: No select element provided');
      return false;
    }

    if (!window.listByMode) {
      console.error('fillTeamSelect: listByMode function not available');
      return false;
    }

    const teams = window.listByMode(mode);
    if (!teams || teams.length === 0) {
      console.error('fillTeamSelect: No teams available for mode:', mode);
      return false;
    }

    // Clear existing options
    selectElement.innerHTML = '';

    // Add team options
    teams.forEach((team, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${team.abbr} — ${team.name}`;
      selectElement.appendChild(option);
    });

    // Set default selection
    if (window.state?.userTeamId !== undefined && window.state.userTeamId < teams.length) {
      selectElement.value = String(window.state.userTeamId);
    } else {
      selectElement.value = '0';
    }

    console.log(`✅ fillTeamSelect: Populated ${teams.length} teams for mode: ${mode}`);
    return true;

  } catch (error) {
    console.error('Error in fillTeamSelect:', error);
    return false;
  }
};

window.getCurrentTeam = function() {
    try {
        if (!window.state?.league?.teams || window.state.userTeamId === undefined) {
            return null;
        }
        return window.state.league.teams[window.state.userTeamId] || null;
    } catch (error) {
        console.error('Error getting current team:', error);
        return null;
    }
};

window.calculateOverallRating = function(player) {
    if (!player || !player.ratings) {
        return 'N/A';
    }
    
    const ratings = player.ratings;
    let totalRating = 0;
    let ratingCount = 0;
    
    // Calculate average of all ratings
    Object.values(ratings).forEach(rating => {
        if (typeof rating === 'number' && rating > 0) {
            totalRating += rating;
            ratingCount++;
        }
    });
    
    if (ratingCount === 0) {
        return 'N/A';
    }
    
    return Math.round(totalRating / ratingCount);
};

// --- VIEW RENDERERS ---
window.renderPlayerCard = function(player) {
    if (!player) return '';

    // Calculate aggregate ratings for bars
    let physical = 0, mental = 0;
    if (player.ratings) {
        if (player.ratings.physical) physical = player.ratings.physical;
        else {
            // Estimate from available ratings
            const r = player.ratings;
            physical = Math.round(((r.speed || 50) + (r.acceleration || 50) + (r.strength || 50) + (r.agility || 50)) / 4);
        }

        if (player.ratings.mental) mental = player.ratings.mental;
        else {
            const r = player.ratings;
            mental = Math.round(((r.awareness || 50) + (r.intelligence || 50) + (r.vision || 50) + (r.consistency || 50)) / 4);
        }
    }

    // Determine Grade
    const ovr = player.ovr || 50;
    let grade = 'C';
    let gradeClass = 'C';
    if (ovr >= 95) { grade = 'S'; gradeClass = 'A'; } // Elite
    else if (ovr >= 90) { grade = 'A+'; gradeClass = 'A'; }
    else if (ovr >= 85) { grade = 'A'; gradeClass = 'A'; }
    else if (ovr >= 80) { grade = 'B+'; gradeClass = 'B'; }
    else if (ovr >= 75) { grade = 'B'; gradeClass = 'B'; }
    else if (ovr >= 70) { grade = 'C+'; gradeClass = 'C'; }
    else if (ovr < 60) { grade = 'D'; gradeClass = 'C'; }

    // OVR Badge Class
    let ovrClass = 'avg';
    if (ovr >= 90) ovrClass = 'elite';
    else if (ovr >= 80) ovrClass = 'good';

    // Status
    const isInjured = player.injuryWeeks > 0;

    // Portrait Initial
    const initial = player.name ? player.name.charAt(0) : '?';

    return `
    <div class="dark-player-card ${ovr >= 90 ? 'elite' : ''}" onclick="if(window.showPlayerDetails) window.showPlayerDetails(window.state.league.teams.find(t => t.roster.find(p => p.id === '${player.id}'))?.roster.find(p => p.id === '${player.id}'))">
        <div class="status-indicator ${isInjured ? 'injured' : ''}"></div>
        <div class="card-content">
            <div class="portrait-container">
                <div class="player-portrait">${initial}</div>
            </div>
            <div class="player-details">
                <div class="player-name" title="${player.name}">${player.name}</div>
                <div class="stats-row">
                    <div class="ovr-badge ${ovrClass}">${ovr}</div>
                    <div class="tags-container">
                        <span class="tag">${player.pos}</span>
                        <span class="tag">${player.age} yo</span>
                        ${isInjured ? '<span class="tag" style="color:#FF3B30">INJ</span>' : ''}
                    </div>
                    <div class="grade-badge ${gradeClass}">${grade}</div>
                </div>
                <div class="bars-container">
                    <div class="bar-row">
                        <span class="bar-label">PHY</span>
                        <div class="progress-track">
                            <div class="progress-fill physical" style="width: ${physical}%"></div>
                        </div>
                    </div>
                    <div class="bar-row">
                        <span class="bar-label">MEN</span>
                        <div class="progress-track">
                            <div class="progress-fill mental" style="width: ${mental}%"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
};

window.renderRoster = function() {
    console.log('Rendering roster...');
    try {
        const L = window.state?.league;
        if (!L) {
            console.error('No league data available');
            return;
        }
        
        const teamSelect = document.getElementById('rosterTeam');
        
        // Always ensure team select is filled with LEAGUE teams (not original team list)
        if (teamSelect && L.teams && L.teams.length > 0) {
            // Fill dropdown with league teams (these are the actual teams in the game)
            if (!teamSelect.dataset.filled || teamSelect.options.length !== L.teams.length) {
                teamSelect.innerHTML = '';
                L.teams.forEach((team, index) => {
                    const option = document.createElement('option');
                    option.value = String(index);
                    option.textContent = `${team.abbr || 'T' + index} — ${team.name || 'Team ' + index}`;
                    teamSelect.appendChild(option);
                });
                teamSelect.dataset.filled = '1';
                console.log(`✅ Filled roster team select with ${L.teams.length} league teams`);
            }
            
            // Add change event listener for team selection
            if (!teamSelect.dataset.hasChangeListener) {
                teamSelect.addEventListener('change', window.handleTeamSelectionChange);
                teamSelect.dataset.hasChangeListener = '1';
            }
            
            // Sync select value with current viewTeamId or userTeamId
            const preferredTeamId = window.state?.viewTeamId ?? window.state?.userTeamId ?? 0;
            const currentValue = parseInt(teamSelect.value || '0', 10);
            
            // Update select if it doesn't match the preferred team
            if (currentValue !== preferredTeamId && preferredTeamId >= 0 && preferredTeamId < L.teams.length) {
                teamSelect.value = String(preferredTeamId);
                console.log(`🔄 Synced roster team select to team ${preferredTeamId}: ${L.teams[preferredTeamId]?.name}`);
            } else if (currentValue >= 0 && currentValue < L.teams.length) {
                // Ensure viewTeamId matches the select value
                if (window.state) {
                    window.state.viewTeamId = currentValue;
                }
            }
        }
        
        // Get team ID from select (now properly synced) or fallback
        const preferredTeamId = window.state?.viewTeamId ?? window.state?.userTeamId ?? 0;
        let teamId = parseInt(teamSelect?.value || String(preferredTeamId) || '0', 10);
        
        // Validate team ID
        if (isNaN(teamId) || teamId < 0 || teamId >= L.teams.length) {
            console.warn('Invalid team ID, falling back to user team:', teamId);
            teamId = window.state?.userTeamId ?? 0;
            if (teamSelect && teamId >= 0 && teamId < L.teams.length) {
                teamSelect.value = String(teamId);
            }
        }
        
        const team = L.teams[teamId];
        if (!team) {
            console.error('Team not found:', teamId, 'Available teams:', L.teams.length);
            return;
        }
        
        // Update viewTeamId to match what we're actually displaying
        if (window.state) {
            window.state.viewTeamId = teamId;
        }
        
        console.log(`📋 Rendering roster for team ${teamId}: ${team.name}`);
        
        const titleEl = document.getElementById('rosterTitle');
        if (titleEl) {
             titleEl.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                    <span>${team.name} Roster</span>
                    <div class="view-toggle">
                        <button class="view-toggle-btn ${window.state.rosterViewMode !== 'cards' ? 'active' : ''}" onclick="window.state.rosterViewMode='table'; window.renderRoster();">Table</button>
                        <button class="view-toggle-btn ${window.state.rosterViewMode === 'cards' ? 'active' : ''}" onclick="window.state.rosterViewMode='cards'; window.renderRoster();">Cards</button>
                    </div>
                </div>
             `;
        }
        
        // Generate and render depth chart
        if (generateDepthChart && renderDepthChart) {
            try {
                generateDepthChart(team);
                const depthChartContainer = document.getElementById('depthChartContainer');
                if (depthChartContainer) {
                    depthChartContainer.innerHTML = renderDepthChart(team);

                    // Attach event listeners for depth chart moves (use onclick to prevent accumulation)
                    depthChartContainer.onclick = (e) => {
                        const btn = e.target.closest('.depth-move-btn');
                        if (!btn) return;

                        const playerId = btn.dataset.playerId;
                        const position = btn.dataset.position;
                        const newDepth = parseInt(btn.dataset.newDepth, 10);

                        if (playerId && position && !isNaN(newDepth)) {
                            if (movePlayerDepth) {
                                movePlayerDepth(playerId, position, newDepth);
                                // Re-render the depth chart
                                depthChartContainer.innerHTML = renderDepthChart(team);
                            }
                        }
                    };
                }
            } catch (error) {
                console.error('Error rendering depth chart:', error);
            }
        }
        
        const rosterTable = document.getElementById('rosterTable');
        if (!rosterTable) return;

        // --- Card View Implementation ---
        if (!window.state.rosterViewMode) window.state.rosterViewMode = 'table';

        let gridContainer = document.getElementById('rosterGrid');
        if (!gridContainer) {
             gridContainer = document.createElement('div');
             gridContainer.id = 'rosterGrid';
             gridContainer.className = 'roster-grid-view';
             if (rosterTable.parentNode) rosterTable.parentNode.insertBefore(gridContainer, rosterTable);
        }

        if (window.state.rosterViewMode === 'cards') {
            rosterTable.style.display = 'none';
            gridContainer.style.display = 'grid';

            // Sort by OVR for cards
            const cardSortedRoster = [...team.roster].sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
            gridContainer.innerHTML = cardSortedRoster.map(p => window.renderPlayerCard(p)).join('');
            return; // Exit here for card view
        } else {
            rosterTable.style.display = 'table';
            gridContainer.style.display = 'none';
        }
        
        // Clear and setup table
        rosterTable.innerHTML = `
            <thead>
                <tr>
                    <th><input type="checkbox" id="selectAllPlayers"></th>
                    <th>Name</th>
                    <th>Pos</th>
                    <th>Age</th>
                    <th>OVR</th>
                    <th>Eff</th>
                    <th>Morale</th>
                    <th>Depth</th>
                    <th>PB</th>
                    <th>Chem</th>
                    <th>Contract</th>
                    <th>Cap Hit</th>
                    <th>Abilities</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        
        const tbody = rosterTable.querySelector('tbody');
        
            if (!team.roster || team.roster.length === 0) {
            const tr = tbody.insertRow();
            const td = tr.insertCell();
            td.colSpan = 13;
            td.textContent = 'No players on roster';
            return;
        }
        
        // Initialize depth chart stats for all players
        if (initializeDepthChartStats) {
            team.roster.forEach(player => {
                initializeDepthChartStats(player, team);
            });
        }
        
        // Generate depth chart to get effective ratings
        if (generateDepthChart) {
            generateDepthChart(team);
        }
        
        // Sort roster by position and effective rating (from depth chart)
        const sortedRoster = [...team.roster].sort((a, b) => {
            if (a.pos !== b.pos) return a.pos.localeCompare(b.pos);
            // Use effective rating if available, otherwise use OVR
            const aEff = calculateEffectiveRating ? calculateEffectiveRating(a, team, a.pos) : (a.ovr || 0);
            const bEff = calculateEffectiveRating ? calculateEffectiveRating(b, team, b.pos) : (b.ovr || 0);
            return bEff - aEff;
        });
        
        sortedRoster.forEach(player => {
            const tr = tbody.insertRow();
            tr.dataset.playerId = player.id;
            tr.style.cursor = 'pointer';
            
            // Initialize depth chart stats if not already done
            if (initializeDepthChartStats) {
                initializeDepthChartStats(player, team);
            }
            
            // Get depth chart data
            const dc = player.depthChart || {};
            const effectiveRating = calculateEffectiveRating ? calculateEffectiveRating(player, team, player.pos) : (player.ovr || 0);
            const depthPosition = dc.depthPosition || 'N/A';
            const playbookKnowledge = dc.playbookKnowledge || 50;
            const chemistry = dc.chemistry || 50;
            
            // Highlight starter (depth position 1)
            if (depthPosition === 1) {
                tr.classList.add('starter-row');
            }
            
            // Checkbox
            const cellCheckbox = tr.insertCell();
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = 'playerSelect';
            checkbox.value = player.id;
            cellCheckbox.appendChild(checkbox);
            
            // Player info
            const nameCell = tr.insertCell();
            nameCell.textContent = player.name || 'Unknown';
            // nameCell.style.color and text-decoration removed, handled by CSS fix
            
            tr.insertCell().textContent = player.pos || 'N/A';
            tr.insertCell().textContent = player.age || 'N/A';
            tr.insertCell().textContent = player.ovr || 'N/A';
            
            // Effective Rating (from depth chart)
            const effCell = tr.insertCell();
            effCell.textContent = Math.round(effectiveRating);
            effCell.className = 'effective-rating';
            if (effectiveRating >= 85) effCell.classList.add('rating-elite');
            else if (effectiveRating >= 75) effCell.classList.add('rating-good');
            else if (effectiveRating < 65) effCell.classList.add('rating-poor');
            
            // Morale
            const morale = player.morale || 50;
            const moraleCell = tr.insertCell();
            moraleCell.textContent = `${Math.round(morale)}%`;
            moraleCell.className = 'morale';
            if (morale >= 80) moraleCell.classList.add('morale-excellent');
            else if (morale >= 60) moraleCell.classList.add('morale-good');
            else if (morale < 40) moraleCell.classList.add('morale-poor');
            
            // Depth Position
            const depthCell = tr.insertCell();
            depthCell.textContent = depthPosition;
            depthCell.className = 'depth-position';
            if (depthPosition === 1) {
                depthCell.classList.add('depth-starter');
                depthCell.textContent = 'ST';
            } else if (depthPosition === 2) {
                depthCell.classList.add('depth-backup');
            }
            
            // Playbook Knowledge
            const pbCell = tr.insertCell();
            pbCell.textContent = `${Math.round(playbookKnowledge)}%`;
            pbCell.className = 'playbook-knowledge';
            if (playbookKnowledge >= 80) pbCell.classList.add('pb-excellent');
            else if (playbookKnowledge >= 60) pbCell.classList.add('pb-good');
            else if (playbookKnowledge < 40) pbCell.classList.add('pb-poor');
            
            // Chemistry
            const chemCell = tr.insertCell();
            chemCell.textContent = `${Math.round(chemistry)}%`;
            chemCell.className = 'chemistry';
            if (chemistry >= 75) chemCell.classList.add('chem-excellent');
            else if (chemistry >= 55) chemCell.classList.add('chem-good');
            else if (chemistry < 35) chemCell.classList.add('chem-poor');
            
            // Contract info
            const years = player.years || 0;
            const baseAnnual = player.baseAnnual || 0;
            tr.insertCell().textContent = `${years}yr / $${baseAnnual.toFixed(1)}M`;
            
            // Cap hit
            // Assuming window.capHitFor is defined elsewhere for full calculation
            const capHit = window.capHitFor ? window.capHitFor(player, 0) : baseAnnual;
            tr.insertCell().textContent = `$${capHit.toFixed(1)}M`;
            
            // Abilities
            const abilities = (player.abilities || []).slice(0, 2).join(', ') || 'None';
            const cellAbilities = tr.insertCell();
            cellAbilities.className = 'abilities';
            cellAbilities.textContent = abilities;
            
            // Add click handler for player details
            tr.addEventListener('click', (e) => {
                // Ensure clicking the checkbox doesn't trigger details
                if (!e.target.matches('input[type="checkbox"]')) {
                    location.hash = `#/player/${player.id}`;
                }
            });
        });
        
        // Assuming these functions are defined elsewhere or not strictly needed for this file's logic
        if (typeof setupRosterEvents === 'function') {
            setupRosterEvents();
        }
        console.log('✅ Roster rendered successfully');
        
    } catch (error) {
        console.error('Error rendering roster:', error);
    }
};

/**
 * Show player details in a modal
 * @param {Object} player - Player object
 */
function showPlayerDetails(player) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    // 🏆 ENHANCED: Added a ratings grid for better display of specific stats
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>${player.name || 'Unknown Player'} <span class="muted-tag">${player.pos || 'N/A'} (OVR ${player.ovr || 'N/A'})</span></h2>
                <button type="button" class="close" aria-label="Close modal">&times;</button>
            </div>
            <div class="modal-body">
                <div class="player-info grid two">
                    <div class="player-basic">
                        <h4>Basic Info</h4>
                        <p><strong>Age:</strong> ${player.age || 'N/A'}</p>
                        <p><strong>Contract:</strong> ${player.years || 0} years, $${(player.baseAnnual || 0).toFixed(1)}M/year</p>
                        <p><strong>Cap Hit (Current):</strong> $${(window.capHitFor ? window.capHitFor(player, 0) : player.baseAnnual || 0).toFixed(1)}M</p>
                    </div>
                    ${player.ratings ? `
                        <div class="player-ratings">
                            <h4>Ratings Breakdown</h4>
                            <div class="ratings-grid">
                            ${Object.entries(player.ratings).map(([rating, value]) => `
                                <div class="rating-item">
                                    <span class="rating-name">${rating.toUpperCase()}:</span>
                                    <span class="rating-value">${value}</span>
                                </div>
                            `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
                ${player.abilities && player.abilities.length > 0 ? `
                    <div class="player-abilities mt">
                        <h4>Abilities/Traits</h4>
                        <p class="trait-list">${player.abilities.join(', ')}</p>
                    </div>
                ` : ''}
                
                ${renderInjuryHistory(player)}
                ${renderSeasonHistory(player)}
                
                <div class="player-actions mt">
                    <button class="btn primary" onclick="window.viewPlayerStats('${player.id}')">View Stats</button>
                    <button class="btn secondary" onclick="window.editPlayer('${player.id}')">Edit Player</button>
                    ${window.showPlayerComparison ? `<button class="btn secondary" onclick="window.showPlayerComparison('${player.id}')">Compare Player</button>` : ''}
                </div>
            </div>
        </div>
    `;
    
    // Add temporary modal styles for the enhanced content
    const tempModalStyles = document.createElement('style');
    tempModalStyles.textContent = `
        .modal {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; z-index: 1000;
        }
        .modal-content {
            background: var(--background, #111111); padding: 20px; border-radius: 12px; width: 90%; max-width: 700px; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
        }
        .modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--hairline); padding-bottom: 10px; margin-bottom: 15px; }
        .modal-header h2 { margin: 0; color: var(--text); font-size: 1.5rem; }
        .modal-header .muted-tag { font-size: 0.9rem; color: var(--text-muted); font-weight: 400; margin-left: 10px; }
        .close { cursor: pointer; font-size: 1.5rem; color: var(--text-muted); }
        .player-info { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .player-basic p { margin: 5px 0; font-size: 0.95rem; }
        .player-ratings h4, .player-abilities h4 { color: var(--accent); margin-top: 0; margin-bottom: 10px; }
        .ratings-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 15px; font-size: 0.9rem; }
        .rating-item { display: flex; justify-content: space-between; }
        .rating-value { font-weight: 600; color: var(--text); }
        .trait-list { font-style: italic; color: var(--text); }
        .mt { margin-top: 20px; }
        .player-actions button { margin-right: 10px; padding: 8px 15px; border: none; border-radius: 6px; cursor: pointer; }
        .player-actions .primary { background: var(--accent); color: var(--on-accent, #fff); }
        .player-actions .secondary { background: var(--surface-secondary, #333); color: var(--text); }
        @media (max-width: 600px) { .player-info { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(tempModalStyles);

    document.body.appendChild(modal);
    
    // Close modal functionality
    const closeBtn = modal.querySelector('.close');
    closeBtn.onclick = () => {
        modal.remove();
        tempModalStyles.remove();
    };
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.remove();
            tempModalStyles.remove();
        }
    };
    
    modal.style.display = 'flex'; // Use flex to center
}

/**
 * Render injury history section for player details
 */
function renderInjuryHistory(player) {
    if (!player || (!player.injuryHistory || player.injuryHistory.length === 0)) {
        return '';
    }
    
    const assessment = window.getInjuryPronenessAssessment ? window.getInjuryPronenessAssessment(player) : null;
    
    let html = `
        <div class="player-injury-history mt">
            <h4>Injury History & Assessment</h4>
            ${assessment ? `
                <div class="injury-assessment">
                    <div class="assessment-level ${assessment.level.toLowerCase().replace(' ', '-')}">
                        <strong>Injury Proneness:</strong> ${assessment.level}
                    </div>
                    <p class="assessment-stats">
                        Total Injuries: ${assessment.totalInjuries} | 
                        Major: ${assessment.majorInjuries} | 
                        Season-Ending: ${assessment.seasonEndingInjuries} | 
                        Avg Weeks: ${assessment.averageWeeksPerInjury}
                    </p>
                    <p class="assessment-recommendation">${assessment.recommendation}</p>
                </div>
            ` : ''}
            
            <div class="injury-history-list">
                <h5>All Injuries</h5>
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Year</th>
                            <th>Type</th>
                            <th>Severity</th>
                            <th>Weeks</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${player.injuryHistory.slice().reverse().map(injury => `
                            <tr class="injury-${injury.severity}">
                                <td>${injury.year || 'N/A'}</td>
                                <td>${injury.type}</td>
                                <td><span class="severity-badge ${injury.severity}">${injury.severity}</span></td>
                                <td>${injury.weeks} weeks</td>
                                <td>${injury.recovered ? '✅ Recovered' : injury.seasonEnding ? '❌ Season-Ending' : '⚠️ Active'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    return html;
}

/**
 * Render season history with OVR changes
 */
function renderSeasonHistory(player) {
    if (!player || (!player.seasonHistory || player.seasonHistory.length === 0)) {
        return '';
    }
    
    let html = `
        <div class="player-season-history mt">
            <h4>Season-by-Season Overview</h4>
            <div class="season-history-list">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Year</th>
                            <th>OVR Start</th>
                            <th>OVR End</th>
                            <th>Change</th>
                            <th>Injuries</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${player.seasonHistory.map(season => {
                            const changeClass = season.ovrChange > 0 ? 'positive' : season.ovrChange < 0 ? 'negative' : '';
                            const changeSign = season.ovrChange > 0 ? '+' : '';
                            const injuryCount = season.injuries ? season.injuries.length : 0;
                            const majorInjuries = season.injuries ? season.injuries.filter(i => i.severity === 'major').length : 0;
                            
                            return `
                                <tr>
                                    <td><strong>${season.year}</strong></td>
                                    <td>${season.ovrStart || 'N/A'}</td>
                                    <td>${season.ovrEnd || 'N/A'}</td>
                                    <td class="${changeClass}">${changeSign}${season.ovrChange || 0}</td>
                                    <td>
                                        ${injuryCount > 0 ? `
                                            <span class="injury-count ${majorInjuries > 0 ? 'has-major' : ''}" 
                                                  title="${season.injuries.map(i => i.type).join(', ')}">
                                                🚑 ${injuryCount} ${majorInjuries > 0 ? '(Major: ' + majorInjuries + ')' : ''}
                                            </span>
                                        ` : 'None'}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    return html;
}

// window.renderStandings remains the same structure
window.renderStandings = function() {
    // ... This is where the renderStandings function goes ...
    // Placeholder to keep context
    console.log('Rendering Standings...'); 
    // This function needs the full logic from your game files.
};

window.renderHub = function() {
    console.log('Rendering hub...');
    try {
        const L = window.state?.league;
        if (!L) return;
        
        const isOffseason = window.state?.offseason === true;
        
        // Update season/week info
        const hubSeason = document.getElementById('hubSeason');
        const hubWeek = document.getElementById('hubWeek');
        const hubWeeks = document.getElementById('hubWeeks');
        const hubGames = document.getElementById('hubGames');
        
        if (hubSeason) hubSeason.textContent = L.year || '2025';
        
        if (isOffseason) {
            // Show offseason info
            if (hubWeek) hubWeek.textContent = 'Offseason';
            if (hubWeeks) hubWeeks.textContent = '';
            if (hubGames) hubGames.textContent = '0';
            
            // Add offseason banner and button to hub
            const hubContainer = document.getElementById('hub');
            if (hubContainer) {
                // Check if offseason banner already exists
                let offseasonBanner = document.getElementById('offseasonBanner');
                if (!offseasonBanner) {
                    offseasonBanner = document.createElement('div');
                    offseasonBanner.id = 'offseasonBanner';
                    offseasonBanner.className = 'card';
                    offseasonBanner.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                    offseasonBanner.style.color = 'white';
                    offseasonBanner.style.marginBottom = '1rem';
                    hubContainer.insertBefore(offseasonBanner, hubContainer.firstChild);
                }
                
                offseasonBanner.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                        <div>
                            <h2 style="margin: 0; color: white;">🏆 ${L.year} Season Complete - Offseason</h2>
                            <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">
                                Resign players, sign free agents, and draft rookies before starting the ${L.year + 1} season.
                            </p>
                        </div>
                        <button id="btnStartNewSeason" class="btn" style="background: white; color: #667eea; font-weight: bold; padding: 0.75rem 1.5rem;">
                            Start ${L.year + 1} Season
                        </button>
                    </div>
                `;
                
                // Add event listener for start new season button
                const btnStartNewSeason = document.getElementById('btnStartNewSeason');
                if (btnStartNewSeason) {
                    btnStartNewSeason.onclick = function() {
                        if (window.startNewSeason) {
                            window.startNewSeason();
                        } else {
                            window.setStatus('Error: startNewSeason function not available', 'error');
                        }
                    };
                }
            }
        } else {
            // Regular season info
            if (hubWeek) hubWeek.textContent = L.week || '1';
            if (hubWeeks) hubWeeks.textContent = '18';
            
            // Calculate games this week
            const scheduleWeeks = Array.isArray(L.schedule?.weeks) ? L.schedule.weeks : [];
            const currentWeekGames = scheduleWeeks.find(week => week.weekNumber === L.week)?.games || [];
            if (hubGames) hubGames.textContent = currentWeekGames.length;
            
            // Remove offseason banner if it exists
            const offseasonBanner = document.getElementById('offseasonBanner');
            if (offseasonBanner) {
                offseasonBanner.remove();
            }
        }
        
        // Render power rankings
        renderPowerRankings();
        
        // Render team ratings overview (assuming renderLeagueTeamRatings exists)
        if (window.renderLeagueTeamRatings) {
            window.renderLeagueTeamRatings(L, 'leagueTeamRatings');
        }
        
        // Render last week results (only if not offseason)
        if (!isOffseason) {
            renderLastWeekResults();
            renderUpcomingGames();
        }
        
        // Render standings on hub
        renderHubStandings(L);
        
// Render trade proposals on hub
        renderHubTradeProposals();
        
        // Update cap sidebar
        if (window.updateCapSidebar) {
            window.updateCapSidebar();
        }
        
        console.log('✅ Hub rendered successfully');
        
    } catch (error) {
        console.error('Error rendering hub:', error);
    }
};

/**
 * Renders a compact standings view on the hub
 */
function renderHubStandings(L) {
    if (!L || !L.teams) return;
    
    // Check if standings container exists, create if not
    let standingsContainer = document.getElementById('hubStandings');
    if (!standingsContainer) {
        const hubContainer = document.getElementById('hub');
        if (hubContainer) {
            standingsContainer = document.createElement('div');
            standingsContainer.id = 'hubStandings';
            standingsContainer.className = 'card mt';
            standingsContainer.innerHTML = '<h3>Standings</h3><div id="hubStandingsContent"></div>';
            // Insert after league team ratings or before last week results
            const lastResults = document.getElementById('hubResults');
            if (lastResults && lastResults.parentElement) {
                lastResults.parentElement.insertBefore(standingsContainer, lastResults.parentElement.lastChild);
            } else {
                hubContainer.appendChild(standingsContainer);
            }
        } else {
            return;
        }
    }
    
    const content = document.getElementById('hubStandingsContent');
    if (!content) return;
    
    // Sort teams by record
    const sortedTeams = L.teams.slice().sort((a, b) => {
        const winsA = a.record?.w || 0;
        const lossesA = a.record?.l || 0;
        const winsB = b.record?.w || 0;
        const lossesB = b.record?.l || 0;
        const winPctA = winsA / Math.max(1, winsA + lossesA);
        const winPctB = winsB / Math.max(1, winsB + lossesB);
        
        if (winPctB !== winPctA) return winPctB - winPctA;
        const diffA = (a.record?.pf || 0) - (a.record?.pa || 0);
        const diffB = (b.record?.pf || 0) - (b.record?.pa || 0);
        return diffB - diffA;
    });
    
    // Group by conference and division
    const afcTeams = sortedTeams.filter(t => t.conf === 0);
    const nfcTeams = sortedTeams.filter(t => t.conf === 1);
    
    let html = '<div class="standings-compact">';
    
    // AFC Standings
    html += '<div class="standings-conference"><h4>AFC</h4>';
    ['East', 'North', 'South', 'West'].forEach((divName, divIdx) => {
        const divTeams = afcTeams.filter(t => t.div === divIdx).slice(0, 4);
        if (divTeams.length > 0) {
            html += `<div class="standings-division"><strong>${divName}</strong><ol>`;
            divTeams.forEach((team, idx) => {
                const record = `${team.record?.w || 0}-${team.record?.l || 0}`;
                html += `<li>${team.abbr || team.name} (${record})</li>`;
            });
            html += '</ol></div>';
        }
    });
    html += '</div>';
    
    // NFC Standings
    html += '<div class="standings-conference"><h4>NFC</h4>';
    ['East', 'North', 'South', 'West'].forEach((divName, divIdx) => {
        const divTeams = nfcTeams.filter(t => t.div === divIdx).slice(0, 4);
        if (divTeams.length > 0) {
            html += `<div class="standings-division"><strong>${divName}</strong><ol>`;
            divTeams.forEach((team, idx) => {
                const record = `${team.record?.w || 0}-${team.record?.l || 0}`;
                html += `<li>${team.abbr || team.name} (${record})</li>`;
            });
            html += '</ol></div>';
        }
    });
    html += '</div>';
    
    html += '</div><div class="mt"><a href="#/standings" class="btn btn-sm">View Full Standings</a></div>';
    
    content.innerHTML = html;
}

/**
 * Renders trade proposals on the hub
 */
function renderHubTradeProposals() {
    if (!renderTradeProposals) return;
    
    // Check if trade proposals container exists, create if not
    let proposalsContainer = document.getElementById('hubTradeProposals');
    if (!proposalsContainer) {
        const hubContainer = document.getElementById('hub');
        if (hubContainer) {
            proposalsContainer = document.createElement('div');
            proposalsContainer.id = 'hubTradeProposals';
            proposalsContainer.className = 'card mt';
            proposalsContainer.innerHTML = `
                <div class="row">
                    <h3>Trade Proposals</h3>
                    <div class="spacer"></div>
                    <button id="btnRefreshHubProposals" class="btn btn-sm">Refresh</button>
                </div>
                <div id="hubTradeProposalsList"></div>
            `;
            const hubStandings = document.getElementById('hubStandings');
            if (hubStandings && hubStandings.nextSibling) {
                hubStandings.parentElement.insertBefore(proposalsContainer, hubStandings.nextSibling);
            } else {
                hubContainer.appendChild(proposalsContainer);
            }
        } else {
            return;
        }
    }
    
    const listEl = document.getElementById('hubTradeProposalsList');
    if (!listEl) return;
    
    // Generate proposals if they don't exist
    if (!window.state.tradeProposals && generateAITradeProposals) {
        generateAITradeProposals();
    }
    
    const proposals = window.state.tradeProposals || [];
    
    // Add refresh button listener
    const refreshBtn = document.getElementById('btnRefreshHubProposals');
    if (refreshBtn && !refreshBtn._hubBound) {
        refreshBtn.addEventListener('click', () => {
            if (generateAITradeProposals) {
                generateAITradeProposals();
            }
            renderHubTradeProposals();
        });
        refreshBtn._hubBound = true;
    }
    
    if (proposals.length === 0) {
        listEl.innerHTML = '<p class="muted">No trade proposals at this time. <a href="#/trade">Visit Trade Center</a></p>';
        return;
    }
    
    // Show first 2-3 proposals on hub
    const L = window.state?.league;
    if (!L) return;
    
    const userId = window.state?.userTeamId ?? 0;
    const userTeam = L.teams[userId];
    
    listEl.innerHTML = proposals.slice(0, 3).map((p, idx) => {
        const cpuTeam = L.teams[p.fromTeamId];
        const cpuPlayers = p.cpuPlayers.map(pl => `${pl.name} (${pl.pos}, OVR ${pl.ovr})`).join(', ');
        const userPlayers = p.userPlayers.map(pl => `${pl.name} (${pl.pos}, OVR ${pl.ovr})`).join(', ');
        
        return `
            <div class="trade-proposal-compact">
                <div class="trade-proposal-header">
                    <strong>${cpuTeam.name}</strong> proposes:
                </div>
                <div class="trade-proposal-details">
                    <div><strong>You receive:</strong> ${cpuPlayers || 'None'}</div>
                    <div><strong>They receive:</strong> ${userPlayers || 'None'}</div>
                    <div class="trade-proposal-actions">
                        <button class="btn btn-sm" onclick="window.pendingTradeProposal = window.state.tradeProposals[${idx}]; location.hash='#/trade';">Negotiate</button>
                        <button class="btn btn-sm" onclick="window.state.tradeProposals.splice(${idx}, 1); renderHubTradeProposals();">Dismiss</button>
                    </div>
                </div>
            </div>
        `;
    }).join('') + (proposals.length > 3 ? `<div class="mt"><a href="#/trade-proposals" class="btn btn-sm">View All Proposals (${proposals.length})</a></div>` : '');
}

function renderPowerRankings() {
    const L = window.state?.league;
    if (!L || !L.teams) return;
    
    const powerList = document.getElementById('hubPower');
    if (!powerList) return;
    
    // Calculate power rankings based on record and point differential
    const teamsWithPower = L.teams.map(team => {
        // Use the team.record structure that is actually used
        const wins = team.record?.w || team.wins || 0;
        const losses = team.record?.l || team.losses || 0;
        const ties = team.record?.t || team.ties || 0;
        const pointsFor = team.record?.pf || team.ptsFor || 0;
        const pointsAgainst = team.record?.pa || team.ptsAgainst || 0;
        
        // Power score calculation using team ratings
        const winPct = (wins + ties * 0.5) / Math.max(1, wins + losses + ties);
        const pointDiff = pointsFor - pointsAgainst;
        
        // Use team ratings if available, otherwise fall back to individual player ratings
        let teamRating = 0;
        if (team.overallRating) {
            teamRating = team.overallRating;
        } else if (team.ovr) {
            teamRating = team.ovr;
        } else {
            // Try scheme-adjusted rating first, then fall back to base
            if (window.calculateTeamRatingWithSchemeFit) {
                const schemeRatings = window.calculateTeamRatingWithSchemeFit(team);
                teamRating = schemeRatings.overall;
            } else if (window.calculateTeamRating) {
                const ratings = window.calculateTeamRating(team);
                teamRating = ratings.overall;
            } else {
                // Fallback: calculate basic rating from roster
                if (team.roster && team.roster.length > 0) {
                    const avgOvr = team.roster.reduce((sum, player) => sum + (player.ovr || 0), 0) / team.roster.length;
                    teamRating = Math.round(avgOvr);
                } else {
                    teamRating = 50; // Default rating for teams without roster data
                }
            }
        }
        
        // Simplified power score calculation
        const powerScore = (winPct * 100) + (pointDiff * 0.1) + teamRating; 
        
        return {
            ...team,
            powerScore,
            record: { w: wins, l: losses, t: ties, pf: pointsFor, pa: pointsAgainst } // Re-include full record
        };
    });
    
    // Sort by power score
    teamsWithPower.sort((a, b) => b.powerScore - a.powerScore);
    
    // Render top 10
    powerList.innerHTML = teamsWithPower.slice(0, 10).map((team, index) => {
        const record = team.record;
        const recordStr = `${record.w}-${record.l}-${record.t}`;
        const pointDiff = record.pf - record.pa;
        const pointDiffStr = pointDiff >= 0 ? `+${pointDiff}` : pointDiff.toString();
        
        // 🏆 ENHANCED: Use the 'user-team' class we fixed in CSS
        return `
            <li class="power-ranking-item ${team.id === window.state?.userTeamId ? 'user-team' : ''}">
                <span class="rank">${index + 1}</span>
                <span class="team-name">${team.name}</span>
                <span class="record">${recordStr}</span>
                <span class="point-diff">${pointDiffStr}</span>
            </li>
        `;
    }).join('');
}

function renderLastWeekResults() {
    const L = window.state?.league;
    if (!L) return;
    
    const resultsContainer = document.getElementById('hubResults');
    if (!resultsContainer) return;
    
    // Find last week's results from the resultsByWeek storage
    const lastWeek = Math.max(1, (L.week || 1) - 1);
    // Note: Assuming L.resultsByWeek is an array indexed by week (0-indexed for Week 1)
    const lastWeekResults = L.resultsByWeek?.[lastWeek - 1] || []; 
    
    if (lastWeekResults.length === 0) {
        resultsContainer.innerHTML = '<div class="muted">No games played yet</div>';
        return;
    }
    
    resultsContainer.innerHTML = lastWeekResults.map(result => {
        if (result.bye) {
            return `<div class="result-item bye">${L.teams[result.bye]?.name || 'Team'} - BYE</div>`;
        }
        
        const homeTeam = L.teams[result.home];
        const awayTeam = L.teams[result.away];
        
        if (!homeTeam || !awayTeam) return '';
        
        const homeScore = result.scoreHome || 0;
        const awayScore = result.scoreAway || 0;
        const winner = homeScore > awayScore ? homeTeam : awayTeam;
        const isUserTeam = result.home === window.state?.userTeamId || result.away === window.state?.userTeamId;
        
        // Find game index in week for box score
        // Find game index properly by matching team IDs
        const gameIndex = lastWeekResults.findIndex(r => {
            if (!r) return false;
            const rHome = typeof r.home === 'object' ? r.home.id : r.home;
            const rAway = typeof r.away === 'object' ? r.away.id : r.away;
            const resHome = typeof result.home === 'object' ? result.home.id : result.home;
            const resAway = typeof result.away === 'object' ? result.away.id : result.away;
            return rHome === resHome && rAway === resAway;
        });
        
        const hasBoxScore = gameIndex >= 0 && lastWeekResults[gameIndex]?.boxScore;
        
        return `
            <div class="result-item ${isUserTeam ? 'user-game' : ''} ${hasBoxScore ? 'clickable-game' : ''}" 
                 ${hasBoxScore ? `onclick="if(window.showBoxScore) { window.showBoxScore(${lastWeek}, ${gameIndex}); } else { console.error('showBoxScore not available'); }" style="cursor: pointer;" title="Click to view box score"` : ''}>
                <div class="teams">
                    <span class="team ${result.away === winner.id ? 'winner' : ''}">${awayTeam.name}</span>
                    <span class="score">${awayScore}</span>
                    <span class="at">@</span>
                    <span class="team ${result.home === winner.id ? 'winner' : ''}">${homeTeam.name}</span>
                    <span class="score">${homeScore}</span>
                </div>
                ${hasBoxScore ? '<div class="box-score-link">📊 View Box Score</div>' : ''}
            </div>
        `;
    }).join('');
}

/**
 * Renders upcoming games for the current week with "Watch Live" buttons
 */
function renderUpcomingGames() {
    const L = window.state?.league;
    if (!L) return;
    
    // Create or get container for upcoming games
    let container = document.getElementById('hubUpcomingGames');
    if (!container) {
        const hubContainer = document.getElementById('hub');
        if (hubContainer) {
            container = document.createElement('div');
            container.id = 'hubUpcomingGames';
            container.className = 'card mt';
            container.innerHTML = '<h3>This Week\'s Games</h3><div class="list" id="upcomingGamesList"></div>';
            hubContainer.appendChild(container);
        } else {
            return;
        }
    }
    
    const gamesList = document.getElementById('upcomingGamesList');
    if (!gamesList) return;
    
    const currentWeek = L.week || 1;
    let scheduleWeeks = L.schedule?.weeks || (Array.isArray(L.schedule) ? L.schedule : []);
    if (!Array.isArray(scheduleWeeks)) scheduleWeeks = [];
    
    // Handle different schedule formats
    if (scheduleWeeks.length > 0) {
        // Check if it's an array of week objects or array of arrays
        if (scheduleWeeks[0] && typeof scheduleWeeks[0] === 'object' && scheduleWeeks[0].weekNumber !== undefined) {
            // Array of week objects with weekNumber property
            // scheduleWeeks = scheduleWeeks;
        } else if (Array.isArray(scheduleWeeks[0]) || (scheduleWeeks[0] && scheduleWeeks[0].games)) {
            // Already in correct format
            // scheduleWeeks = scheduleWeeks;
        }
    }
    
    // Find the current week's schedule
    let weekSchedule = null;
    if (Array.isArray(scheduleWeeks)) {
        weekSchedule = scheduleWeeks.find(w => w && (w.weekNumber === currentWeek || w.week === currentWeek)) || 
                      scheduleWeeks[currentWeek - 1] || null;
    }
    
    if (!weekSchedule || !weekSchedule.games) {
        gamesList.innerHTML = '<div class="muted">No games scheduled this week</div>';
        return;
    }
    
    const userTeamId = window.state?.userTeamId;
    const games = weekSchedule.games.filter(g => g && g.home !== undefined && g.away !== undefined);
    
    if (games.length === 0) {
        gamesList.innerHTML = '<div class="muted">No games scheduled this week</div>';
        return;
    }
    
    gamesList.innerHTML = games.map(game => {
        const homeTeam = L.teams[game.home];
        const awayTeam = L.teams[game.away];
        
        if (!homeTeam || !awayTeam) return '';
        
        const isUserGame = game.home === userTeamId || game.away === userTeamId;
        const isCompleted = game.homeScore !== undefined && game.awayScore !== undefined;
        
        if (isCompleted) {
            // Show completed game with box score link
            const homeScore = game.homeScore || 0;
            const awayScore = game.awayScore || 0;
            const winner = homeScore > awayScore ? homeTeam : awayTeam;
            
            // Find game index in week results for box score
            const currentWeek = L.week || 1;
            const weekResults = L.resultsByWeek?.[currentWeek - 1] || [];
            const gameIndex = weekResults.findIndex(r => 
                r && ((typeof r.home === 'object' ? r.home.id : r.home) === game.home) && 
                ((typeof r.away === 'object' ? r.away.id : r.away) === game.away)
            );
            
            return `
                <div class="result-item ${isUserGame ? 'user-game' : ''} clickable-game" 
                     onclick="${gameIndex >= 0 ? `if(window.showBoxScore) { window.showBoxScore(${currentWeek}, ${gameIndex}); }` : ''}" 
                     style="cursor: ${gameIndex >= 0 ? 'pointer' : 'default'};" 
                     title="${gameIndex >= 0 ? 'Click to view box score' : ''}">
                    <div class="teams">
                        <span class="team ${game.away === winner.id ? 'winner' : ''}">${awayTeam.name}</span>
                        <span class="score">${awayScore}</span>
                        <span class="at">@</span>
                        <span class="team ${game.home === winner.id ? 'winner' : ''}">${homeTeam.name}</span>
                        <span class="score">${homeScore}</span>
                    </div>
                    <div class="box-score-link">📊 View Box Score</div>
                </div>
            `;
        } else {
            // Show upcoming game with "Watch Live" button
            return `
                <div class="result-item ${isUserGame ? 'user-game' : ''}">
                    <div class="teams">
                        <span class="team">${awayTeam.name}</span>
                        <span class="at">@</span>
                        <span class="team">${homeTeam.name}</span>
                    </div>
                    <button class="watch-live-btn" onclick="window.watchLiveGame(${game.home}, ${game.away})">
                        📺 Watch Live
                    </button>
                </div>
            `;
        }
    }).join('');
}

window.renderTrade = function() {
    console.log('Rendering trade center...');
    try {
        const L = window.state?.league;
        if (!L) {
            console.error('No league data available');
            return;
        }
        
        const tradeContainer = document.getElementById('trade');
        if (!tradeContainer) return;
        
        // Check if trade system is available (will use the full renderTradeCenter below if the DOM elements exist)
        if (window.renderTradeCenter && document.getElementById('tradeValidate')) {
            window.renderTradeCenter();
            return;
        }
        
        // Fallback trade interface if no DOM structure or engine function is found
        tradeContainer.innerHTML = `
            <div class="card">
                <h2>Trade Center</h2>
                <div class="muted">Trade system not fully implemented yet or required DOM elements are missing.</div>
                <div class="actions mt">
                    <button class="btn primary" onclick="alert('Trade system coming soon!')">Make Trade</button>
                </div>
            </div>
        `;
        
        console.log('✅ Trade center rendered successfully (Fallback)');
        
    } catch (error) {
        console.error('Error rendering trade center:', error);
    }
};

// window.router remains the same structure
window.router = function() {
    // ... This is where the router function goes ...
    // Placeholder to keep context
    console.log('Running router...'); 
    // This function needs the full logic from your game files.
};
window.renderSettings = function() {
    console.log('Rendering settings...');
    try {
        const settingsContainer = document.getElementById('settings');
        if (!settingsContainer) return;

        settingsContainer.innerHTML = `
            <div class="card">
                <h2>Game Settings</h2>
                <div class="grid two">
                    <div>
                        <h3>Game Options</h3>
                        <div class="form-group">
                            <label for="namesMode">Player Names:</label>
                            <select id="namesMode">
                                <option value="fictional" ${window.state?.namesMode === 'fictional' ? 'selected' : ''}>Fictional</option>
                                <option value="real" ${window.state?.namesMode === 'real' ? 'selected' : ''}>Real</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="gameMode">Game Mode:</label>
                            <select id="gameMode">
                                <option value="gm" ${window.state?.gameMode === 'gm' ? 'selected' : ''}>General Manager</option>
                                <option value="career" ${window.state?.gameMode === 'career' ? 'selected' : ''}>Career Mode</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="settingTheme">Theme:</label>
                            <select id="settingTheme">
                                <option value="dark" ${window.state?.theme !== 'light' ? 'selected' : ''}>Dark</option>
                                <option value="light" ${window.state?.theme === 'light' ? 'selected' : ''}>Light</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label><input type="checkbox" id="settingSalaryCap" ${window.state?.settings?.salaryCapEnabled !== false ? 'checked' : ''}> Salary Cap Enabled</label>
                        </div>
                        <div class="form-group">
                            <label><input type="checkbox" id="settingCoachFiring" ${window.state?.settings?.allowCoachFiring !== false ? 'checked' : ''}> Coaches can be fired</label>
                        </div>
                    </div>
                    <div>
                        <h3>Save Data</h3>
                        <div id="saveDataManager"></div>
                    </div>
                </div>
            </div>
        `;

        // Add the save data manager if available
        if (window.renderSaveDataManager) {
            window.renderSaveDataManager();
        }

        const themeSelect = settingsContainer.querySelector('#settingTheme');
        const salaryCapToggle = settingsContainer.querySelector('#settingSalaryCap');
        const coachFiringToggle = settingsContainer.querySelector('#settingCoachFiring');

        if (themeSelect) {
            themeSelect.addEventListener('change', (e) => {
                if (!window.state) return;
                window.state.theme = e.target.value;
                if (window.applyTheme) window.applyTheme(window.state.theme);
                if (saveState) saveState();
            });
        }

        if (salaryCapToggle) {
            salaryCapToggle.addEventListener('change', (e) => {
                if (!window.state?.settings) return;
                window.state.settings.salaryCapEnabled = e.target.checked;
                if (saveState) saveState();
            });
        }

        if (coachFiringToggle) {
            coachFiringToggle.addEventListener('change', (e) => {
                if (!window.state?.settings) return;
                window.state.settings.allowCoachFiring = e.target.checked;
                if (saveState) saveState();
            });
        }

        console.log('✅ Settings rendered successfully');

    } catch (error) {
        console.error('Error rendering settings:', error);
    }
};

window.renderSaveDataManager = function() {
    const manager = document.getElementById('saveDataManager');
    if (!manager) return;

    const slots = (typeof window.listSaveSlots === 'function') ? window.listSaveSlots() : Array.from({ length: 5 }, () => null);
    const activeSlot = window.state?.saveSlot || (window.getActiveSaveSlot ? window.getActiveSaveSlot() : 1);

    const rows = slots.map((slotMeta, idx) => {
        const slotNumber = idx + 1;
        const isActive = slotNumber === activeSlot;
        const slotHeader = `<div class="save-slot-details"><strong>Slot ${slotNumber}</strong>`;

        if (!slotMeta) {
            return `<div class="save-slot ${isActive ? 'active' : ''}">` +
                `${slotHeader} — Empty</div>` +
                `<div class="save-slot-actions">` +
                    `<button class="btn" data-action="switch" data-slot="${slotNumber}">Switch to Slot</button>` +
                `</div>` +
            `</div>`;
        }

        const lastSaved = slotMeta.lastSaved ? new Date(slotMeta.lastSaved).toLocaleString() : 'Unknown';
        const teamLabel = slotMeta.team || 'Unknown team';
        const optimizeDisabled = isActive ? '' : ' disabled';
        const optimizeTitle = isActive ? '' : ' title="Switch to this slot to optimize its save data."';
        return `<div class="save-slot ${isActive ? 'active' : ''}">` +
            `${slotHeader} — ${teamLabel} (Season ${slotMeta.season})</div>` +
            `<div class="muted small">Saved: ${lastSaved}</div>` +
            `<div class="save-slot-actions">` +
                `<button class="btn" data-action="switch" data-slot="${slotNumber}">Switch to Slot</button>` +
                `<button class="btn" data-action="optimize" data-slot="${slotNumber}" ${optimizeDisabled}${optimizeTitle}>Optimize Save</button>` +
                `<button class="btn danger" data-action="clear" data-slot="${slotNumber}">Clear Slot</button>` +
            `</div>` +
        `</div>`;
    }).join('');

    manager.innerHTML = `<div class="save-slot-list">${rows}</div>`;

    manager.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.currentTarget.getAttribute('data-action');
            const slot = parseInt(e.currentTarget.getAttribute('data-slot'), 10);

            if (action === 'switch' && window.switchSaveSlot) {
                window.switchSaveSlot(slot);
                return;
            }

            if (action === 'optimize') {
                if (slot !== activeSlot) return;
                if (saveState) {
                    const saved = saveState(null, { keepBoxScoreWeeks: 0 });
                    if (saved && typeof window.setStatus === 'function') {
                        window.setStatus('Save optimized: older box scores trimmed.', 'success');
                    }
                }
                return;
            }

            if (action === 'clear') {
                if (!window.clearSavedState) return;
                const confirmed = window.confirm(`Clear save slot ${slot}? This cannot be undone.`);
                if (!confirmed) return;
                window.clearSavedState(slot);
                if (window.renderSaveDataManager) {
                    window.renderSaveDataManager();
                }
                if (window.renderSaveSlotInfo) {
                    window.renderSaveSlotInfo();
                }
            }
        });
    });
};

window.renderSaveSlotInfo = function() {
    const select = document.getElementById('saveSlotSelect');
    const info = document.getElementById('saveSlotInfo');
    const activeSlot = window.state?.saveSlot || (window.getActiveSaveSlot ? window.getActiveSaveSlot() : 1);

    if (select) {
        select.value = String(activeSlot);
    }

    if (!info) return;

    const meta = (typeof window.getSaveMetadata === 'function') ? window.getSaveMetadata(activeSlot) : null;
    if (!meta) {
        info.textContent = `Slot ${activeSlot}: Empty`;
        return;
    }
    const lastSaved = meta.lastSaved ? new Date(meta.lastSaved).toLocaleString() : 'Unknown';
    const teamLabel = meta.team || 'Unknown team';
    info.textContent = `Slot ${activeSlot}: ${teamLabel} (Season ${meta.season}) — Saved ${lastSaved}`;
};

window.bindSaveSlotSelect = function() {
    const select = document.getElementById('saveSlotSelect');
    if (!select) return;

    select.addEventListener('change', (e) => {
        const slot = parseInt(e.target.value, 10);
        if (window.switchSaveSlot) {
            window.switchSaveSlot(slot);
        }
    });
};

// Add team selection change handler for roster view
window.handleTeamSelectionChange = function() {
    console.log('🔄 Team selection changed');
    const teamSelect = document.getElementById('rosterTeam');
    if (teamSelect) {
        const selectedTeamId = parseInt(teamSelect.value, 10);

        if (!isNaN(selectedTeamId) && window.state?.league?.teams && selectedTeamId >= 0 && selectedTeamId < window.state.league.teams.length) {
            // Track which team is being viewed without changing the actual user team selection
            window.state.viewTeamId = selectedTeamId;
            console.log(`✅ Viewing team ${selectedTeamId}: ${window.state.league.teams[selectedTeamId]?.name || 'Unknown'}`);
            
            // Re-render roster with new team
            if (window.renderRoster) {
                console.log('Calling renderRoster with team:', selectedTeamId);
                window.renderRoster();
            } else {
                console.log('renderRoster function not available');
            }
        } else {
            console.warn('Invalid team selection:', selectedTeamId, 'or league not ready');
            // Reset to user team if invalid
            if (window.state?.userTeamId !== undefined) {
                teamSelect.value = String(window.state.userTeamId);
                window.state.viewTeamId = window.state.userTeamId;
            }
        }
    } else {
        console.log('Team select element not found');
    }
};

// Alias for trade navigation; router expects openTradeCenter
window.openTradeCenter = function() {
    if (typeof window.renderTradeCenter === 'function') {
        window.renderTradeCenter();
    } else {
        console.warn('openTradeCenter: renderTradeCenter not available');
    }
};

window.renderScouting = function() {
    console.log('Rendering scouting...');
    try {
        const scoutingContainer = document.getElementById('scouting');
        if (!scoutingContainer) return;
        
        // Check if dedicated scouting system is available
        if (window.renderScoutingInterface && typeof window.renderScoutingInterface === 'function') {
            window.renderScoutingInterface();
            return;
        }
        
        // Use the scouting system render function if available
        if (window.initializeScoutingSystem) {
            window.initializeScoutingSystem();
        }
        
        if (window.renderScoutingInterface && typeof window.renderScoutingInterface === 'function') {
            window.renderScoutingInterface();
            return;
        }
        
        // Fallback scouting interface with improved styling
        const draftClass = window.state?.draftClass || [];
        const scouting = window.state?.scouting || { budget: 2000000, used: 0, weeklyScouts: { basic: 0, thorough: 0, combine: 0 } };
        const budgetRemaining = scouting.budget - scouting.used;
        
        scoutingContainer.innerHTML = `
            <div class="card">
                <h2>Scouting - ${(window.state?.league?.year || 2025) + 1} Draft Class</h2>
                ${draftClass.length > 0 ? `
                    <div class="scouting-dashboard">
                        <div class="scouting-budget-card">
                            <h3>Scouting Budget</h3>
                            <div class="budget-display">
                                <span class="budget-remaining">$${(budgetRemaining / 1000).toFixed(0)}k</span>
                                <span class="budget-total">of $${(scouting.budget / 1000).toFixed(0)}k remaining</span>
                            </div>
                            <div class="budget-bar">
                                <div class="budget-used" style="width: ${(scouting.used / scouting.budget * 100)}%"></div>
                            </div>
                        </div>
                        <div class="scouting-limits-card">
                            <h3>Weekly Limits</h3>
                            <div class="limits-grid">
                                <div class="limit-item"><span>Basic:</span> <strong>${scouting.weeklyScouts.basic}/10</strong></div>
                                <div class="limit-item"><span>Thorough:</span> <strong>${scouting.weeklyScouts.thorough}/5</strong></div>
                                <div class="limit-item"><span>Combine:</span> <strong>${scouting.weeklyScouts.combine}/2</strong></div>
                            </div>
                        </div>
                    </div>
                    <p class="muted">Use the draft page to scout individual prospects.</p>
                ` : `
                    <div class="scouting-empty">
                        <p class="muted">No draft class available. Generate a draft class first.</p>
                        ${window.generateDraftClass ? `<button class="btn primary" onclick="window.generateDraftClass()">Generate Draft Class</button>` : ''}
                    </div>
                `}
            </div>
        `;
        
        console.log('✅ Scouting rendered successfully');
        
    } catch (error) {
        console.error('Error rendering scouting:', error);
    }
};

// 🏆 NOTE: enhanceNavigation, setupRosterEvents, updateReleaseButton are assumed to be defined elsewhere
function enhanceNavigation() {
    // ... Function body for navigation enhancement ...
    console.log('Navigation enhancement called.');
}

function setupRosterEvents() {
    // ... Function body for roster events setup ...
    console.log('Roster events setup called.');
}

function updateReleaseButton() {
    // ... Function body for update release button ...
    console.log('Update release button called.');
}


// --- INITIALIZATION ---
function initializeUI() {
  console.log('🎯 Initializing UI...');
  enhanceNavigation();
  if (window.renderSaveSlotInfo) {
    window.renderSaveSlotInfo();
  }
  if (window.bindSaveSlotSelect) {
    window.bindSaveSlotSelect();
  }
  if (window.state?.league && window.state?.onboarded) {
    // Use hash to route on startup
    const initialView = window.location.hash ? window.location.hash.substring(2) : 'hub';
    window.show(initialView);
    // If router is defined, run it after a short delay
    if (typeof window.router === 'function') {
        setTimeout(() => window.router(), 200); 
    }
  }
}

// Global functions for player actions
window.viewPlayerStats = function(playerId) {
  console.log('🔍 viewPlayerStats called with ID:', playerId);
  
  // Try to show player stats directly using the player stats viewer
  if (window.playerStatsViewer && window.playerStatsViewer.showPlayerStats) {
    window.playerStatsViewer.showPlayerStats(playerId);
  } else if (window.playerStatsViewer) {
    // Fallback: create a simple modal
    showSimplePlayerStats(playerId);
  } else {
    console.warn('Player stats viewer not available. Using simple fallback.');
    showSimplePlayerStats(playerId);
  }
};

// Fallback function for when player stats viewer isn't ready
function showSimplePlayerStats(playerId) {
  console.log('Using fallback player stats display for ID:', playerId);
  
  // Find player in current team roster
  if (!window.state?.league?.teams || window.state.userTeamId === undefined) {
    alert('No league data available');
    return;
  }
  
  // Search all teams since userTeamId might be changed in Roster view
  let player = null;
  for (const team of window.state.league.teams) {
      if (team.roster) {
          player = team.roster.find(p => p.id === playerId);
          if (player) break;
      }
  }
  
  if (!player) {
    alert('Player not found');
    return;
  }
  
  // Create simple modal (This is a simplified version of the one used in showPlayerDetails)
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>${player.name} - Statistics</h2>
        <button type="button" class="close" aria-label="Close modal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="stats-section">
          <h3>Player Information</h3>
          <p><strong>Position:</strong> ${player.pos || 'N/A'}</p>
          <p><strong>Age:</strong> ${player.age || 'N/A'}</p>
          <p><strong>Overall:</strong> ${player.ovr || 'N/A'}</p>
        </div>
        ${player.ratings ? `
        <div class="stats-section mt">
          <h3>Ratings</h3>
          <div class="ratings-grid">
            ${Object.entries(player.ratings).map(([rating, value]) => `
              <div class="rating-item">
                <span class="rating-name">${rating.toUpperCase()}:</span>
                <span class="rating-value">${value}</span>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
      </div>
    </div>
  `;
  
  // Temporary modal styles (reused from showPlayerDetails, ensure it's removed on close)
  const tempModalStyles = document.createElement('style');
  tempModalStyles.textContent = `
    .modal {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; z-index: 1000;
    }
    .modal-content {
        background: var(--background, #111111); padding: 20px; border-radius: 12px; width: 90%; max-width: 500px; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
    }
    .modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--hairline); padding-bottom: 10px; margin-bottom: 15px; }
    .modal-header h2 { margin: 0; color: var(--text); font-size: 1.5rem; }
    .close { cursor: pointer; font-size: 1.5rem; color: var(--text-muted); }
    .ratings-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 15px; font-size: 0.9rem; }
    .rating-item { display: flex; justify-content: space-between; }
    .rating-value { font-weight: 600; color: var(--text); }
    .mt { margin-top: 20px; }
  `;
  document.head.appendChild(tempModalStyles);
  
  // Add close functionality
  const closeBtn = modal.querySelector('.close');
  closeBtn.onclick = () => {
    modal.remove();
    tempModalStyles.remove();
  };
  modal.onclick = (e) => {
    if (e.target === modal) {
        modal.remove();
        tempModalStyles.remove();
    }
  };
  
  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

window.editPlayer = function(playerId) {
  // Navigate to player edit view or show edit modal
  alert('Player editing coming soon!');
  
  // Close the modal if it exists
  const modal = document.querySelector('.modal');
  if (modal) modal.remove();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeUI);
} else {
  setTimeout(initializeUI, 100);
}

/**
 * Renders the full trade center: lets users pick players/picks, validates trades,
 * and executes them via the trade engine.
 */
window.renderTradeCenter = function () {
  console.log('Rendering Trade Center…');

  const L = window.state?.league;
  if (!L || !Array.isArray(L.teams)) {
    console.error('renderTradeCenter: no league/teams');
    return;
  }

  const userTeamId = window.state?.userTeamId ?? 0;
  const userTeam = L.teams[userTeamId];
  if (!userTeam) {
    console.error('renderTradeCenter: user team not found', userTeamId);
    return;
  }

  const tradeContainer = document.getElementById('trade');
  if (!tradeContainer) {
    console.error('renderTradeCenter: #trade not found');
    return;
  }

  const selectA     = document.getElementById('tradeA');
  const selectB     = document.getElementById('tradeB');
  const listA       = document.getElementById('tradeListA');
  const listB       = document.getElementById('tradeListB');
  const pickListA   = document.getElementById('pickListA');
  const pickListB   = document.getElementById('pickListB');
  const btnValidate = document.getElementById('tradeValidate');
  const btnExecute  = document.getElementById('tradeExecute');
  const info        = document.getElementById('tradeInfo');

  if (!selectA || !selectB || !listA || !listB || !pickListA || !pickListB || !btnValidate || !btnExecute || !info) {
    // This happens if the HTML structure for the trade view is missing/incomplete
    console.error('renderTradeCenter: missing one or more trade DOM elements. Falling back.');
    tradeContainer.innerHTML = `<div class="card"><h2 class="error">Trade Center Error</h2><p>Missing required HTML elements. Please check the trade view structure.</p></div>`;
    return;
  }

  // Avoid re-attaching listeners on every navigation
  if (!tradeContainer._tradeState) {
    tradeContainer._tradeState = {
      fromAssets: [],
      toAssets: []
    };
  }
  const state = tradeContainer._tradeState;

  // --- Handle Pending Proposals (Negotiate) ---
  if (window.pendingTradeProposal) {
    const p = window.pendingTradeProposal;
    state.fromAssets = p.toAssets.map(a => ({ kind: a.kind, playerId: a.playerId, year: a.year, round: a.round })); // What user gives (proposal's toAssets)
    state.toAssets = p.fromAssets.map(a => ({ kind: a.kind, playerId: a.playerId, year: a.year, round: a.round }));   // What user gets (proposal's fromAssets)

    // Set opponent team
    if (selectB) {
        // Find option with correct value and select it
        // The proposal.fromTeamId is the opponent
        setTimeout(() => {
            selectB.value = String(p.fromTeamId);
            // Trigger change event to refresh lists
            selectB.dispatchEvent(new Event('change'));
        }, 50);
    }

    // Clear pending proposal
    window.pendingTradeProposal = null;
  }

  // --- 1) Setup YOUR TEAM select (tradeA) ---

  selectA.innerHTML = '';
  const optA = document.createElement('option');
  optA.value = String(userTeamId);
  optA.textContent = userTeam.name || 'Your Team';
  selectA.appendChild(optA);
  selectA.value = String(userTeamId);
  selectA.disabled = true; // keep as your controlled team

  // --- 2) Setup OPPONENT TEAM select (tradeB) ---

  selectB.innerHTML = '';
  L.teams.forEach((t, idx) => {
    if (!t) return;
    if (idx === userTeamId) return; // skip your own team
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = t.name || `Team ${idx}`;
    selectB.appendChild(opt);
  });
  selectB.disabled = false;

  if (!selectB.options.length) {
    info.textContent = 'No other teams available to trade with.';
    btnValidate.disabled = true;
    btnExecute.disabled = true;
    return;
  }

  if (!selectB.value && selectB.options.length > 0) {
    selectB.value = selectB.options[0].value;
  }

  // --- 3) Helpers for asset selection ---

  function clearSelections() {
    state.fromAssets = [];
    state.toAssets = [];
    btnExecute.disabled = true;
    info.textContent = '';
    // also clear visual selection
    tradeContainer.querySelectorAll('.asset-item.selected').forEach(el => {
      el.classList.remove('selected');
    });
  }

  function toggleAsset(targetArray, asset, element) {
    const idx = targetArray.findIndex(a =>
      a.kind === asset.kind &&
      (a.playerId
        ? a.playerId === asset.playerId
        : (a.year === asset.year && a.round === asset.round))
    );

    if (idx === -1) {
      targetArray.push(asset);
      element.classList.add('selected');
    } else {
      targetArray.splice(idx, 1);
      element.classList.remove('selected');
    }

    btnExecute.disabled = true; // force re-validate after any change
    info.textContent = 'Selections changed. Re-validate trade.';
  }

  function renderTeamLists() {
    const oppId = parseInt(selectB.value, 10);
    const oppTeam = L.teams[oppId];
    if (!oppTeam) {
      console.error('renderTradeCenter: opponent team not found', oppId);
      return;
    }

    // Add headers with grid layout matching items
    const headerHTML = `
      <div style="display: grid; grid-template-columns: 2fr 0.8fr 0.8fr 0.8fr 1.2fr; padding: 4px 6px; font-weight: bold; font-size: 0.75rem; border-bottom: 1px solid var(--hairline); margin-bottom: 4px; color: var(--text-muted);">
        <span>Name</span>
        <span>Pos</span>
        <span>OVR</span>
        <span>Age</span>
        <span>Salary</span>
      </div>
    `;

    listA.innerHTML = '<h4>Your Players</h4>' + headerHTML;
    listB.innerHTML = '<h4>Their Players</h4>' + headerHTML;
    pickListA.innerHTML = '<h4>Your Picks</h4>';
    pickListB.innerHTML = '<h4>Their Picks</h4>';
    
    // Clear selection state and visuals for the new opponent
    clearSelections();

    function renderRosterList(team, container, isUserSide) {
      // Sort by OVR descending
      const roster = (team.roster || []).slice().sort((a, b) => (b.ovr || 0) - (a.ovr || 0));

      roster.forEach(player => {
        const item = document.createElement('div');
        item.className = 'asset-item';
        item.dataset.kind = 'player';
        item.dataset.id = player.id;
        // Use grid layout
        item.style.display = 'grid';
        item.style.gridTemplateColumns = '2fr 0.8fr 0.8fr 0.8fr 1.2fr';
        item.style.alignItems = 'center';
        item.style.fontSize = '0.8rem';

        const salary = '$' + (player.baseAnnual || 0).toFixed(1) + 'M';

        item.innerHTML = `
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;">${player.name}</span>
          <span style="color: var(--text-muted);">${player.pos || 'POS'}</span>
          <span style="font-weight: 600; color: var(--accent);">${player.ovr ?? 'N/A'}</span>
          <span>${player.age || '-'}</span>
          <span style="color: var(--text-muted); font-size: 0.75rem;">${salary}</span>
        `;

        const asset = { kind: 'player', playerId: player.id };

        item.addEventListener('click', () => {
          if (isUserSide) {
            toggleAsset(state.fromAssets, asset, item);
          } else {
            toggleAsset(state.toAssets, asset, item);
          }
        });

        container.appendChild(item);
      });
    }

    function renderPickList(team, container, isUserSide) {
      // Assuming team.picks is an array of {year, round}
      (team.picks || []).forEach(pk => { 
        const item = document.createElement('div');
        item.className = 'asset-item';
        item.dataset.kind = 'pick';
        item.dataset.year = pk.year;
        item.dataset.round = pk.round;
        item.textContent = `${pk.year} Round ${pk.round}`;

        const asset = { kind: 'pick', year: pk.year, round: pk.round };

        item.addEventListener('click', () => {
          if (isUserSide) {
            toggleAsset(state.fromAssets, asset, item);
          } else {
            toggleAsset(state.toAssets, asset, item);
          }
        });

        container.appendChild(item);
      });
    }

    renderRosterList(userTeam, listA, true);
    renderRosterList(oppTeam, listB, false);
    renderPickList(userTeam, pickListA, true);
    renderPickList(oppTeam, pickListB, false);
  }

  // Initial render
  clearSelections();

  // Check for pending trade proposal (from Trade Finder)
  if (window.pendingTradeProposal) {
    const p = window.pendingTradeProposal;
    // Set opponent
    selectB.value = String(p.fromTeamId);

    renderTeamLists(); // Re-render lists for the correct team

    // Map assets
    // Proposal: toAssets = User assets (User gives)
    // Proposal: fromAssets = CPU assets (CPU gives)
    state.fromAssets = p.toAssets.map(a => ({...a}));
    state.toAssets = p.fromAssets.map(a => ({...a}));

    // Update UI selection
    const markSelected = (assets, container) => {
        assets.forEach(asset => {
            let selector = '';
            if (asset.kind === 'player') {
                selector = `.asset-item[data-kind="player"][data-id="${asset.playerId}"]`;
            } else {
                selector = `.asset-item[data-kind="pick"][data-year="${asset.year}"][data-round="${asset.round}"]`;
            }
            const el = container.querySelector(selector);
            if (el) el.classList.add('selected');
        });
    };

    markSelected(state.fromAssets, listA); // User assets in listA
    markSelected(state.fromAssets, pickListA);
    markSelected(state.toAssets, listB); // CPU assets in listB
    markSelected(state.toAssets, pickListB);

    // Validate immediately
    setTimeout(() => {
        if (btnValidate && !btnValidate.disabled) {
            btnValidate.click();
        }
    }, 100);

    // Clear pending
    window.pendingTradeProposal = null;
  } else {
    renderTeamLists();
  }
  
  // Render Trade Block UI
  if (window.renderTradeBlock) {
    setTimeout(() => {
      window.renderTradeBlock();
    }, 100);
  }
  
  // Render Trade History
  if (window.renderTradeHistory) {
    setTimeout(() => {
      window.renderTradeHistory();
    }, 150);
  }

  // --- 4) When you change the CPU team, re-render lists ---

  if (!selectB._hasTradeListener) {
    selectB.addEventListener('change', () => {
      // Reset selections so stale assets don't carry over between teams
      clearSelections();
      renderTeamLists();
    });
    selectB._hasTradeListener = true;
  }

  // --- 5) Validate and Execute buttons ---

  if (!btnValidate._hasTradeListener) {
    btnValidate.addEventListener('click', () => {
      const oppId = parseInt(selectB.value, 10);
      if (isNaN(oppId)) {
        info.textContent = 'Select a team to trade with.';
        return;
      }

      if (!state.fromAssets.length && !state.toAssets.length) {
        info.textContent = 'Select at least one player or pick on either side.';
        return;
      }

      // 🏆 CRITICAL: Check for evaluateTrade function existence (assumed to be loaded)
      if (typeof window.evaluateTrade !== 'function') {
        info.textContent = 'Trade engine not loaded.';
        return;
      }

      const evalResult = window.evaluateTrade(
        userTeamId,
        oppId,
        state.fromAssets,
        state.toAssets
      );

      if (!evalResult) {
        info.textContent = 'Unable to evaluate trade. Check asset types.';
        btnExecute.disabled = true;
        return;
      }

      const from = evalResult.fromValue;
      const to   = evalResult.toValue;
      const cpuLossLimit = -15; // Assuming the rule is -15

      // Show results clearly (ADHD friendly!)
      info.innerHTML =
        `You Give (Value): <span style="font-weight:700; color: #ff9900;">${from.give.toFixed(1)}</span> ` +
        `| You Get (Value): <span style="font-weight:700; color: var(--accent);">${from.get.toFixed(1)}</span>. ` +
        `<br>Net Gain: <span style="font-weight:700; color: ${from.delta >= 0 ? '#3c9' : '#f66'};">${from.delta.toFixed(1)}</span>. ` +
        `CPU's Net: ${to.delta.toFixed(1)} (Must be > ${cpuLossLimit}).`;

      btnExecute.disabled = to.delta < cpuLossLimit;
      if (!btnExecute.disabled) {
          info.innerHTML += '<br>✅ **Trade is viable!** Hit Execute.'
      } else {
          info.innerHTML += '<br>❌ **Trade rejected by CPU rules.** Try adding more assets.'
      }
    });
    btnValidate._hasTradeListener = true;
  }

  if (!btnExecute._hasTradeListener) {
    btnExecute.addEventListener('click', () => {
      const oppId = parseInt(selectB.value, 10);
      if (isNaN(oppId)) return;

      // 🏆 CRITICAL: Check for proposeUserTrade function existence (assumed to be loaded)
      if (typeof window.proposeUserTrade !== 'function') {
        info.textContent = 'Trade engine not loaded.';
        return;
      }

      // Check if validation was skipped (must re-validate)
      if (btnExecute.disabled && info.textContent.indexOf('viable') === -1) {
          info.textContent = 'Must validate trade before executing!';
          return;
      }
      
      const result = window.proposeUserTrade(oppId, state.fromAssets, state.toAssets, {
        cpuLossLimit: -15
      });

      if (!result || !result.accepted) {
        info.textContent = 'Trade rejected by CPU. (Check console for details).';
        btnExecute.disabled = true;
        return;
      }

      info.textContent = 'Trade completed! 🥳 Time to check the roster.';
      clearSelections();
      // league mutated in-place by trade.js; just re-render lists
      renderTeamLists();
      // Trigger a global update if available
      if (typeof window.updateAllViews === 'function') {
          window.updateAllViews();
      }
    });
    btnExecute._hasTradeListener = true;
  }

  console.log('✅ Trade Center rendered');
};
// --- GLOBAL EXPORTS ---
window.enhanceNavigation = enhanceNavigation;
window.setupRosterEvents = setupRosterEvents;
window.initializeUIFixes = initializeUI;
window.renderPowerRankings = renderPowerRankings;
window.renderTradeProposals = renderTradeProposals;
window.generateAITradeProposals = generateAITradeProposals;
window.showPlayerDetails = showPlayerDetails;

console.log('🎉 UI master file loaded successfully!');
