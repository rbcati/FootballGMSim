// freeAgency.js
'use strict';

import { saveState } from './state.js';
import { makePlayer } from './player.js';

function ensureFA() {
  if (window.state?.freeAgents && window.state.freeAgents.length > 0) {
    return; // FA pool already exists
  }
  
  const C = window.Constants;
  const U = window.Utils;
  
  if (!C || !U) {
    console.error('Constants or Utils not available for FA generation');
    return;
  }

  // Initialize free agents array if it doesn't exist
  if (!window.state) {
    console.error('Game state not available for FA generation');
    return;
  }
  
  if (!window.state.freeAgents) {
    window.state.freeAgents = [];
  }

  // Keep league copy in sync for any systems referencing it
  if (window.state.league && !window.state.league.freeAgents) {
    window.state.league.freeAgents = window.state.freeAgents;
  }

  const poolSize = C.FREE_AGENCY?.POOL_SIZE || 120;
  
  // Create more realistic free agent distribution
  const createRealisticPlayer = (pos, index) => {
    let player;
    
    if (makePlayer) {
      player = makePlayer(pos);
    } else {
      // Fallback player creation with realistic distribution
      player = {
        id: U.id(),
        name: generateBasicName(),
        pos: pos,
        age: U.rand(22, 35),
        ovr: 0, // Will be set below
        years: 0,
        yearsTotal: C.FREE_AGENCY?.DEFAULT_YEARS || 2,
        baseAnnual: 0, // Will be calculated based on overall
        signingBonus: 0, // Will be calculated
        guaranteedPct: C.FREE_AGENCY?.GUARANTEED_PCT || 0.5,
        stats: { game: {}, season: {}, career: {} },
        abilities: []
      };
    }
    
    // Create realistic overall rating distribution
    // Most players should be in the 60-75 range, fewer in 75-85, very few 85+
    let overall;
    const rand = Math.random();
    
    if (rand < 0.60) {
      // 60% of players: 60-75 overall (depth players)
      overall = U.rand(60, 75);
    } else if (rand < 0.90) {
      // 30% of players: 75-82 overall (solid players)
      overall = U.rand(75, 82);
    } else if (rand < 0.98) {
      // 8% of players: 82-87 overall (good players)
      overall = U.rand(82, 87);
    } else {
      // 2% of players: 87-92 overall (star players)
      overall = U.rand(87, 92);
    }
    
    player.ovr = overall;
    
    // Calculate realistic salary based on overall rating and position
    const baseSalary = calculateRealisticSalary(player.ovr, player.pos, player.age);
    player.baseAnnual = baseSalary;
    
    // Calculate signing bonus (typically 20-40% of total contract value)
    const totalContractValue = baseSalary * player.yearsTotal;
    const bonusPercentage = U.rand(0.2, 0.4);
    player.signingBonus = Math.round(totalContractValue * bonusPercentage * 10) / 10;
    
    // Adjust for free agency market (slight discount)
    const marketDiscount = C.FREE_AGENCY?.CONTRACT_DISCOUNT || 0.95;
    player.baseAnnual = Math.round(player.baseAnnual * marketDiscount * 10) / 10;
    
    // Add abilities if the function exists
    if (window.tagAbilities) {
      window.tagAbilities(player);
    }
    
    return player;
  };
  
  // Generate players with realistic position distribution
  const positionDistribution = {
    'OL': 25,    // Offensive linemen are common in FA
    'DL': 20,    // Defensive linemen
    'LB': 15,    // Linebackers
    'CB': 12,    // Cornerbacks
    'S': 10,     // Safeties
    'WR': 8,     // Wide receivers
    'RB': 5,     // Running backs
    'TE': 3,     // Tight ends
    'QB': 1,     // Quarterbacks (rare in FA)
    'K': 1       // Kickers
  };
  
  let playerIndex = 0;
  Object.entries(positionDistribution).forEach(([pos, count]) => {
    for (let i = 0; i < count; i++) {
      const player = createRealisticPlayer(pos, playerIndex++);
      window.state.freeAgents.push(player);
    }
  });
  
  // Fill remaining slots with random positions
  while (window.state.freeAgents.length < poolSize) {
    const pos = U.choice(C.POSITIONS);
    const player = createRealisticPlayer(pos, playerIndex++);
    window.state.freeAgents.push(player);
  }
  
  // Sort by overall rating (best players first)
  window.state.freeAgents.sort((a, b) => b.ovr - a.ovr);
  
  console.log(`Generated ${window.state.freeAgents.length} free agents`);
}

function generateBasicName() {
  // Use expanded names for maximum variety (1,000,000+ combinations)
  const firstNames = window.EXPANDED_FIRST_NAMES || ['John', 'Mike', 'David', 'Chris', 'Matt', 'Ryan', 'Josh', 'Jake', 'Alex', 'Tyler'];
  const lastNames = window.EXPANDED_LAST_NAMES || ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor'];
  
  const U = window.Utils;
  if (U) {
    return U.choice(firstNames) + ' ' + U.choice(lastNames);
  }
  
  return firstNames[Math.floor(Math.random() * firstNames.length)] + ' ' + 
         lastNames[Math.floor(Math.random() * lastNames.length)];
}

/**
 * Calculates realistic salary based on overall rating, position, and age
 * @param {number} overall - Player overall rating
 * @param {string} position - Player position
 * @param {number} age - Player age
 * @returns {number} Base annual salary in millions
 */
function calculateRealisticSalary(overall, position, age) {
  const U = window.Utils;
  
  // Base salary multiplier by position (relative to overall rating)
  const positionMultipliers = {
    'QB': 1.8,    // Quarterbacks get paid the most
    'OL': 1.2,    // Offensive linemen are valuable
    'DL': 1.1,    // Defensive linemen
    'WR': 1.0,    // Wide receivers
    'CB': 0.95,   // Cornerbacks
    'LB': 0.9,    // Linebackers
    'RB': 0.85,   // Running backs (shorter careers)
    'S': 0.8,     // Safeties
    'TE': 0.75,   // Tight ends
    'K': 0.4,     // Kickers
    'P': 0.3      // Punters
  };
  
  const multiplier = positionMultipliers[position] || 1.0;
  
  // Base salary calculation based on overall rating - more realistic scale
  let baseSalary;
  if (overall >= 90) {
    // Elite players: $3-6M
    baseSalary = U.rand(3, 6);
  } else if (overall >= 85) {
    // Star players: $2-4M
    baseSalary = U.rand(2, 4);
  } else if (overall >= 80) {
    // Good players: $1.5-3M
    baseSalary = U.rand(1.5, 3);
  } else if (overall >= 75) {
    // Solid players: $1-2M
    baseSalary = U.rand(1, 2);
  } else if (overall >= 70) {
    // Average players: $0.5-1.5M
    baseSalary = U.rand(0.5, 1.5);
  } else if (overall >= 65) {
    // Below average: $0.3-1M
    baseSalary = U.rand(0.3, 1);
  } else {
    // Depth players: $0.2-0.6M
    baseSalary = U.rand(0.2, 0.6);
  }
  
  // Apply position multiplier
  baseSalary *= multiplier;
  
  // Age adjustment (older players get slight discount, younger players slight premium)
  if (age >= 30) {
    baseSalary *= U.rand(0.8, 0.95); // 5-20% discount for older players
  } else if (age <= 25) {
    baseSalary *= U.rand(1.0, 1.1); // 0-10% premium for young players
  }
  
  // Add some randomness (±10%)
  const randomFactor = U.rand(0.9, 1.1);
  baseSalary *= randomFactor;
  
  return Math.round(baseSalary * 10) / 10; // Round to 1 decimal place
}

function renderFreeAgency() {
  console.log('Rendering free agency...');
  
  try {
    ensureFA();
    
    const L = window.state?.league;
    if (!L) {
      console.error('No league available for free agency');
      return;
    }
    
    const userTeamId = window.state?.userTeamId ?? 0;
    const userTeam = L.teams[userTeamId];
    const capRoom = userTeam?.capRoom || 0;
    
    const faContainer = document.getElementById('freeagency');
    if (!faContainer) {
      console.error('Free agency container not found');
      return;
    }
    
    // Enhanced Free Agency UI with filters and search
    let html = `
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px;">
          <h2 style="margin: 0;">Free Agency</h2>
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 5px;">
              <strong style="color: var(--text-muted); font-size: 14px;">Cap Room:</strong>
              <span style="color: ${capRoom >= 0 ? 'var(--success-text)' : 'var(--error-text)'}; font-weight: 600; font-size: 16px;">
                $${capRoom.toFixed(1)}M
              </span>
            </div>
          </div>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 20px;">
          <div>
            <label style="display: block; margin-bottom: 5px; font-size: 13px; color: var(--text-muted);">Search</label>
            <input type="text" id="faSearch" placeholder="Search players..." 
                   style="width: 100%; padding: 8px; border-radius: 6px; background: var(--surface); color: var(--text); border: 1px solid var(--hairline); font-size: 14px;"
                   oninput="filterFreeAgents()">
          </div>
          <div>
            <label style="display: block; margin-bottom: 5px; font-size: 13px; color: var(--text-muted);">Position</label>
            <select id="faPositionFilter" 
                    style="width: 100%; padding: 8px; border-radius: 6px; background: var(--surface); color: var(--text); border: 1px solid var(--hairline); font-size: 14px;"
                    onchange="filterFreeAgents()">
              <option value="">All Positions</option>
              <option value="QB">QB</option>
              <option value="RB">RB</option>
              <option value="WR">WR</option>
              <option value="TE">TE</option>
              <option value="OL">OL</option>
              <option value="DL">DL</option>
              <option value="LB">LB</option>
              <option value="CB">CB</option>
              <option value="S">S</option>
              <option value="K">K</option>
              <option value="P">P</option>
            </select>
          </div>
          <div>
            <label style="display: block; margin-bottom: 5px; font-size: 13px; color: var(--text-muted);">Sort By</label>
            <select id="faSortBy" 
                    style="width: 100%; padding: 8px; border-radius: 6px; background: var(--surface); color: var(--text); border: 1px solid var(--hairline); font-size: 14px;"
                    onchange="filterFreeAgents()">
              <option value="ovr">Overall (High to Low)</option>
              <option value="ovr-asc">Overall (Low to High)</option>
              <option value="age">Age (Young to Old)</option>
              <option value="age-desc">Age (Old to Young)</option>
              <option value="salary">Salary (Low to High)</option>
              <option value="salary-desc">Salary (High to Low)</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>
        </div>
        
        <div style="overflow-x: auto;">
          <table class="table" id="faTable" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: var(--surface-strong); border-bottom: 2px solid var(--hairline-strong);">
                <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: var(--text);">Name</th>
                <th style="padding: 12px; text-align: center; font-size: 13px; font-weight: 600; color: var(--text);">POS</th>
                <th style="padding: 12px; text-align: center; font-size: 13px; font-weight: 600; color: var(--text);">OVR</th>
                <th style="padding: 12px; text-align: center; font-size: 13px; font-weight: 600; color: var(--text);">Age</th>
                <th style="padding: 12px; text-align: right; font-size: 13px; font-weight: 600; color: var(--text);">Base Salary</th>
                <th style="padding: 12px; text-align: right; font-size: 13px; font-weight: 600; color: var(--text);">Bonus</th>
                <th style="padding: 12px; text-align: center; font-size: 13px; font-weight: 600; color: var(--text);">Years</th>
                <th style="padding: 12px; text-align: center; font-size: 13px; font-weight: 600; color: var(--text);">Action</th>
              </tr>
            </thead>
            <tbody id="faTableBody">
            </tbody>
          </table>
        </div>
        
        <div id="faResultsCount" style="margin-top: 10px; color: var(--text-muted); font-size: 13px; text-align: center;"></div>
      </div>
    `;
    
    faContainer.innerHTML = html;
    
    // Render initial table
    filterFreeAgents();
    
    // Lock team selector to USER TEAM only (if it exists in the original HTML)
    const sel = document.getElementById('faTeam');
    if (sel) {
      sel.innerHTML = '';
      if (userTeam) {
        const opt = document.createElement('option');
        opt.value = String(userTeamId);
        opt.textContent = userTeam.name || 'Your Team';
        sel.appendChild(opt);
        sel.value = String(userTeamId);
      }
      sel.disabled = true;
      sel.dataset.filled = '1';
    }
    
    console.log('Free agency rendered successfully');
    
  } catch (error) {
    console.error('Error rendering free agency:', error);
  }
}

/**
 * Filters and sorts free agents based on search and filters
 */
window.filterFreeAgents = function() {
  const searchTerm = (document.getElementById('faSearch')?.value || '').toLowerCase();
  const positionFilter = document.getElementById('faPositionFilter')?.value || '';
  const sortBy = document.getElementById('faSortBy')?.value || 'ovr';
  const tbody = document.getElementById('faTableBody');
  const resultsCount = document.getElementById('faResultsCount');
  
  if (!tbody) return;
  
  let freeAgents = [...(window.state?.freeAgents || [])];
  
  // Apply filters
  if (searchTerm) {
    freeAgents = freeAgents.filter(p => 
      (p.name || '').toLowerCase().includes(searchTerm) ||
      (p.pos || '').toLowerCase().includes(searchTerm)
    );
  }
  
  if (positionFilter) {
    freeAgents = freeAgents.filter(p => p.pos === positionFilter);
  }
  
  // Apply sorting
  freeAgents.sort((a, b) => {
    switch(sortBy) {
      case 'ovr':
        return (b.ovr || 0) - (a.ovr || 0);
      case 'ovr-asc':
        return (a.ovr || 0) - (b.ovr || 0);
      case 'age':
        return (a.age || 0) - (b.age || 0);
      case 'age-desc':
        return (b.age || 0) - (a.age || 0);
      case 'salary':
        return (a.baseAnnual || 0) - (b.baseAnnual || 0);
      case 'salary-desc':
        return (b.baseAnnual || 0) - (a.baseAnnual || 0);
      case 'name':
        return (a.name || '').localeCompare(b.name || '');
      default:
        return (b.ovr || 0) - (a.ovr || 0);
    }
  });
  
  // Clear and rebuild table
  tbody.innerHTML = '';
  
  const userTeamId = window.state?.userTeamId ?? 0;
  const userTeam = window.state?.league?.teams?.[userTeamId];
  const capRoom = userTeam?.capRoom || 0;
  
  freeAgents.forEach((p, i) => {
    const originalIndex = window.state.freeAgents.indexOf(p);
    const abilities = (p.abilities || []).slice(0, 2).join(', ') || 'None';
    const totalValue = (p.baseAnnual || 0) * (p.yearsTotal || 1) + (p.signingBonus || 0);
    const firstYearCapHit = (p.baseAnnual || 0) + ((p.signingBonus || 0) / (p.yearsTotal || 1));
    const canAfford = capRoom >= firstYearCapHit;
    
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.style.transition = 'background 0.2s';
    tr.onmouseover = () => tr.style.background = 'var(--surface-strong)';
    tr.onmouseout = () => {
      if (!tr.classList.contains('selected')) {
        tr.style.background = '';
      }
    };
    
    tr.innerHTML = `
      <td style="padding: 10px;">
        <div style="font-weight: 600; color: var(--text);">${p.name}</div>
        ${abilities !== 'None' ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${abilities}</div>` : ''}
      </td>
      <td style="padding: 10px; text-align: center; color: var(--text);">${p.pos}</td>
      <td style="padding: 10px; text-align: center;">
        <span style="font-weight: 600; color: ${p.ovr >= 85 ? 'var(--accent)' : p.ovr >= 75 ? 'var(--success-text)' : 'var(--text)'};">
          ${p.ovr}
        </span>
      </td>
      <td style="padding: 10px; text-align: center; color: var(--text);">${p.age}</td>
      <td style="padding: 10px; text-align: right; color: var(--text);">$${(p.baseAnnual || 0).toFixed(1)}M</td>
      <td style="padding: 10px; text-align: right; color: var(--text-muted); font-size: 12px;">$${(p.signingBonus || 0).toFixed(1)}M</td>
      <td style="padding: 10px; text-align: center; color: var(--text);">${p.yearsTotal || 0}</td>
      <td style="padding: 10px; text-align: center;">
        <button class="btn btn-sm" 
                onclick="event.stopPropagation(); openContractNegotiation(${originalIndex})" 
                style="padding: 6px 12px; background: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;"
                ${!canAfford ? 'title="Insufficient cap space"' : ''}>
          ${canAfford ? 'Negotiate' : '⚠️'}
        </button>
      </td>
    `;
    
    // Make row clickable for player details
    tr.addEventListener('click', function(e) {
      if (e.target.tagName === 'BUTTON') return;
      
      // Show player details
      if (window.showPlayerDetails) {
        window.showPlayerDetails(p);
      }

      // Handle selection for legacy support
      document.querySelectorAll('#faTableBody tr').forEach(row => {
        row.classList.remove('selected');
        row.style.background = '';
      });
      
      tr.classList.add('selected');
      tr.style.background = 'var(--surface-strong)';
      
      const signBtn = document.getElementById('btnSignFA');
      if (signBtn) {
        signBtn.disabled = false;
      }
    });
    
    tbody.appendChild(tr);
  });
  
  // Update results count
  if (resultsCount) {
    resultsCount.textContent = `Showing ${freeAgents.length} of ${window.state?.freeAgents?.length || 0} free agents`;
  }
};

function signFreeAgent(playerIndex) {
  console.log('Attempting to sign free agent:', playerIndex);
  
  if (!window.state?.freeAgents || window.state.freeAgents.length === 0) {
    window.setStatus('No free agents available');
    return;
  }
  
  let idx = playerIndex;
  if (idx === undefined || idx === null) {
    // Look for selected row in the table
    const selectedRow = document.querySelector('#faTable tbody tr.selected');
    if (!selectedRow) {
      window.setStatus('No free agent selected. Click on a row to select a player.');
      return;
    }
    // Get the row index from the table
    const tbody = document.querySelector('#faTable tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    idx = rows.indexOf(selectedRow);
  }

  if (isNaN(idx) || idx < 0 || idx >= window.state.freeAgents.length) {
    window.setStatus('Invalid free agent selection.');
    return;
  }

  try {
    const L = window.state.league;
    if (!L) {
      window.setStatus('No league available');
      return;
    }
    
    // FORCE: use user team only
    const userTeamId = window.state?.userTeamId ?? 0;
    const team = L.teams[userTeamId];
    
    if (!team) {
      window.setStatus('User team not found');
      return;
    }
    
    const player = window.state.freeAgents[idx];
    if (!player) {
      window.setStatus('Player not found');
      return;
    }
    
    // Check role permissions if in career mode
    if (window.state.playerRole && window.state.playerRole !== 'GM') {
      const C = window.Constants;
      const isOffensive = C.OFFENSIVE_POSITIONS.includes(player.pos);
      const canSign = window.state.playerRole === 'GM' || 
                      (window.state.playerRole === 'OC' && isOffensive) || 
                      (window.state.playerRole === 'DC' && !isOffensive);

      if (!canSign) {
        window.setStatus(`As ${window.state.playerRole}, you cannot sign ${player.pos}s.`);
        return;
      }
    }
    
    // Set contract years for signing
    player.years = player.yearsTotal;
    
    // Ensure cap is recalculated before checking
    if (window.recalcCap && window.state?.league) {
      window.recalcCap(window.state.league, team);
    }
    
    // Check salary cap - ensure values are valid numbers
    const capHit = window.capHitFor ? window.capHitFor(player, 0) : (player.baseAnnual || 0);
    const currentCapUsed = team.capUsed || 0;
    const capTotal = team.capTotal || 0;
    const capAfter = currentCapUsed + capHit;
    const capEnabled = window.state?.settings?.salaryCapEnabled !== false;

    // Validate cap hit is reasonable (individual player check)
    if (capHit > 100) {
      console.error('Invalid cap hit for player:', { capHit, player });
      window.setStatus('Error: Player cap hit is unreasonably high. Please refresh and try again.');
      return;
    }
    
    // If team is already way over cap, warn but don't block (might be intentional or calculation issue)
    if (currentCapUsed > capTotal * 1.5) {
      console.warn('Team is already significantly over cap:', { currentCapUsed, capTotal, team: team.name || team.abbr });
      // Still allow signing if the individual cap hit is reasonable
    }

    if (capEnabled && capAfter > capTotal) {
      const overage = capAfter - capTotal;
      window.setStatus(`Signing would exceed salary cap by $${overage.toFixed(1)}M`);
      return;
    }

    // Ensure roster exists
    if (!Array.isArray(team.roster)) {
      team.roster = team.roster ? Array.from(team.roster) : [];
    }

    // Add player to team
    player.teamId = userTeamId;
    player.team = team.abbr || team.name;
    team.roster.push(player);
    // Sort roster by overall rating (best players first)
    team.roster.sort((a, b) => (b.ovr || 0) - (a.ovr || 0));

    // Remove from free agents (both global pool and league copy if present)
    window.state.freeAgents.splice(idx, 1);
    if (L.freeAgents && L.freeAgents !== window.state.freeAgents) {
      const leagueIdx = L.freeAgents.findIndex(p => p.id === player.id);
      if (leagueIdx !== -1) {
        L.freeAgents.splice(leagueIdx, 1);
      }
    }
    L.freeAgents = window.state.freeAgents;
    
    // Update team ratings after roster change
    if (window.updateTeamRatings) {
      window.updateTeamRatings(team);
    }
    
    // Update salary cap
    if (window.recalcCap) {
      window.recalcCap(L, team);
    }
    
    // Refresh displays
    renderFreeAgency();
    if (window.updateCapSidebar) {
      window.updateCapSidebar();
    }

    if (saveState) {
      saveState();
    }

    window.setStatus(`Signed ${player.name} (${player.pos}) for $${capHit.toFixed(1)}M`);
    console.log('Free agent signed successfully:', player.name);
    
  } catch (error) {
    console.error('Error signing free agent:', error);
    window.setStatus('Error signing free agent');
  }
}

/**
 * Alternative name for ensureFA function (for compatibility)
 * @returns {Array} Generated free agents
 */
function generateFreeAgents() {
  console.log('generateFreeAgents called - delegating to ensureFA');
  ensureFA();
  return window.state?.freeAgents || [];
}

// Contract negotiation functions
function openContractNegotiation(playerIndex) {
  const player = window.state.freeAgents[playerIndex];
  if (!player) {
    window.setStatus('Player not found');
    return;
  }
  
  // Create modal if it doesn't exist
  let modal = document.getElementById('contractModal');
  if (!modal) {
    modal = createContractModal();
    document.body.appendChild(modal);
  }
  
  // Populate modal with player data
  document.getElementById('contractPlayerName').textContent = player.name;
  document.getElementById('contractPlayerPos').textContent = player.pos;
  document.getElementById('contractPlayerOvr').textContent = player.ovr;
  document.getElementById('contractPlayerAge').textContent = player.age;
  
  // Set initial contract values
  const baseSalary = player.baseAnnual;
  const signingBonus = player.signingBonus;
  const years = player.yearsTotal;
  
  document.getElementById('contractYears').value = years;
  document.getElementById('contractBaseSalary').value = baseSalary.toFixed(1);
  document.getElementById('contractSigningBonus').value = signingBonus.toFixed(1);
  
  // Calculate and display total contract value
  updateContractTotal();
  
  // Store player index for later use
  modal.dataset.playerIndex = playerIndex;
  
  // Show modal
  modal.style.display = 'flex';
  
  // Close modal when clicking outside
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeContractModal();
    }
  });
}

function createContractModal() {
  const modal = document.createElement('div');
  modal.id = 'contractModal';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';
  
  modal.innerHTML = `
    <div class="modal-content contract-modal">
      <div class="modal-header">
        <h3>Contract Negotiation</h3>
        <button class="modal-close" onclick="closeContractModal()">&times;</button>
      </div>
      
      <div class="modal-body">
        <div class="player-info">
          <h4 id="contractPlayerName"></h4>
          <p><strong>Position:</strong> <span id="contractPlayerPos"></span> | 
             <strong>Overall:</strong> <span id="contractPlayerOvr"></span> | 
             <strong>Age:</strong> <span id="contractPlayerAge"></span></p>
        </div>
        
        <div class="contract-form">
          <div class="form-group">
            <label for="contractYears">Contract Length (Years):</label>
            <input type="number" id="contractYears" min="1" max="7" value="2" 
                   onchange="updateContractTotal()" oninput="updateContractTotal()">
          </div>
          
          <div class="form-group">
            <label for="contractBaseSalary">Base Annual Salary ($M):</label>
            <input type="number" id="contractBaseSalary" min="0.1" step="0.1" 
                   onchange="updateContractTotal()" oninput="updateContractTotal()">
          </div>
          
          <div class="form-group">
            <label for="contractSigningBonus">Signing Bonus ($M):</label>
            <input type="number" id="contractSigningBonus" min="0" step="0.1" 
                   onchange="updateContractTotal()" oninput="updateContractTotal()">
          </div>
          
          <div class="contract-summary">
            <h4>Contract Summary</h4>
            <p><strong>Total Contract Value:</strong> $<span id="contractTotalValue">0.0</span>M</p>
            <p><strong>Average Annual Value:</strong> $<span id="contractAAV">0.0</span>M</p>
            <p><strong>First Year Cap Hit:</strong> $<span id="contractCapHit">0.0</span>M</p>
          </div>
        </div>
      </div>
      
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeContractModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitContractOffer()">Submit Offer</button>
      </div>
    </div>
  `;
  
  return modal;
}

function updateContractTotal() {
  const years = parseFloat(document.getElementById('contractYears').value) || 0;
  const baseSalary = parseFloat(document.getElementById('contractBaseSalary').value) || 0;
  const signingBonus = parseFloat(document.getElementById('contractSigningBonus').value) || 0;
  
  const totalValue = (baseSalary * years) + signingBonus;
  const aav = years > 0 ? totalValue / years : 0;
  const capHit = years > 0 ? baseSalary + (signingBonus / years) : baseSalary;
  
  document.getElementById('contractTotalValue').textContent = totalValue.toFixed(1);
  document.getElementById('contractAAV').textContent = aav.toFixed(1);
  document.getElementById('contractCapHit').textContent = capHit.toFixed(1);
}

function closeContractModal() {
  const modal = document.getElementById('contractModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function submitContractOffer() {
  const modal = document.getElementById('contractModal');
  const playerIndex = parseInt(modal.dataset.playerIndex, 10);
  
  if (isNaN(playerIndex)) {
    window.setStatus('Invalid player selection');
    return;
  }
  
  const player = window.state.freeAgents[playerIndex];
  if (!player) {
    window.setStatus('Player not found');
    return;
  }
  
  const years = parseInt(document.getElementById('contractYears').value, 10);
  const baseSalary = parseFloat(document.getElementById('contractBaseSalary').value);
  const signingBonus = parseFloat(document.getElementById('contractSigningBonus').value);
  
  if (years < 1 || baseSalary < 0.1 || signingBonus < 0) {
    window.setStatus('Please enter valid contract terms');
    return;
  }
  
  // Simulate player decision
  const accepted = simulatePlayerDecision(player, years, baseSalary, signingBonus);
  
  if (accepted) {
    // Player accepts the offer
    signFreeAgentWithContract(playerIndex, years, baseSalary, signingBonus);
    closeContractModal();
    window.setStatus(`${player.name} accepted your contract offer!`);
  } else {
    // Player rejects the offer
    closeContractModal();
    window.setStatus(`${player.name} rejected your contract offer. Try a better deal.`);
  }
}

function simulatePlayerDecision(player, offeredYears, offeredBaseSalary, offeredSigningBonus) {
  const U = window.Utils;
  
  // Base acceptance rate starts at 50%
  let acceptanceRate = 0.5;
  
  // Compare with player's asking price
  const askingBaseSalary = player.baseAnnual;
  const askingSigningBonus = player.signingBonus;
  const askingYears = player.yearsTotal;
  
  // Salary comparison (most important factor)
  const salaryRatio = offeredBaseSalary / askingBaseSalary;
  if (salaryRatio >= 1.0) {
    acceptanceRate += 0.3; // 30% bonus for meeting or exceeding asking price
  } else if (salaryRatio >= 0.9) {
    acceptanceRate += 0.1; // 10% bonus for close to asking price
  } else if (salaryRatio >= 0.8) {
    acceptanceRate -= 0.1; // 10% penalty for being 20% below
  } else {
    acceptanceRate -= 0.3; // 30% penalty for being significantly below
  }
  
  // Signing bonus comparison
  const bonusRatio = offeredSigningBonus / askingSigningBonus;
  if (bonusRatio >= 1.0) {
    acceptanceRate += 0.15;
  } else if (bonusRatio >= 0.8) {
    acceptanceRate += 0.05;
  } else if (bonusRatio < 0.5) {
    acceptanceRate -= 0.2;
  }
  
  // Contract length preference
  const yearsDiff = Math.abs(offeredYears - askingYears);
  if (yearsDiff === 0) {
    acceptanceRate += 0.1;
  } else if (yearsDiff === 1) {
    acceptanceRate += 0.05;
  } else if (yearsDiff >= 3) {
    acceptanceRate -= 0.15;
  }
  
  // Age factor (older players more likely to accept shorter deals)
  if (player.age >= 30 && offeredYears <= 3) {
    acceptanceRate += 0.1;
  } else if (player.age < 27 && offeredYears >= 4) {
    acceptanceRate += 0.1;
  }
  
  // Overall rating factor (better players are pickier)
  if (player.ovr >= 85) {
    acceptanceRate -= 0.1;
  } else if (player.ovr <= 70) {
    acceptanceRate += 0.1;
  }
  
  // Add some randomness
  const randomFactor = U.rand(-0.1, 0.1);
  acceptanceRate += randomFactor;
  
  // Clamp between 0 and 1
  acceptanceRate = Math.max(0, Math.min(1, acceptanceRate));
  
  return Math.random() < acceptanceRate;
}

function signFreeAgentWithContract(playerIndex, years, baseSalary, signingBonus) {
  console.log('Signing free agent with negotiated contract:', playerIndex);
  
  if (!window.state?.freeAgents || window.state.freeAgents.length === 0) {
    window.setStatus('No free agents available');
    return;
  }

  if (isNaN(playerIndex) || playerIndex < 0 || playerIndex >= window.state.freeAgents.length) {
    window.setStatus('Invalid free agent selection.');
    return;
  }

  try {
    const L = window.state.league;
    if (!L) {
      window.setStatus('No league available');
      return;
    }
    
    // FORCE: use user team only
    const userTeamId = window.state?.userTeamId ?? 0;
    const team = L.teams[userTeamId];
    
    if (!team) {
      window.setStatus('User team not found');
      return;
    }
    
    const player = window.state.freeAgents[playerIndex];
    if (!player) {
      window.setStatus('Player not found');
      return;
    }
    
    // Check role permissions if in career mode
    if (window.state.playerRole && window.state.playerRole !== 'GM') {
      const C = window.Constants;
      const isOffensive = C.OFFENSIVE_POSITIONS.includes(player.pos);
      const canSign = window.state.playerRole === 'GM' || 
                      (window.state.playerRole === 'OC' && isOffensive) || 
                      (window.state.playerRole === 'DC' && !isOffensive);

      if (!canSign) {
        window.setStatus(`As ${window.state.playerRole}, you cannot sign ${player.pos}s.`);
        return;
      }
    }
    
    // Update player contract with negotiated terms
    player.years = years;
    player.yearsTotal = years;
    player.baseAnnual = baseSalary;
    player.signingBonus = signingBonus || 0;
    
    // Ensure cap is recalculated before checking
    if (window.recalcCap && window.state?.league) {
      window.recalcCap(window.state.league, team);
    }
    
    // Check salary cap - ensure values are valid numbers
    const capHit = window.capHitFor ? window.capHitFor(player, 0) : (baseSalary + ((signingBonus || 0) / Math.max(1, years)));
    const currentCapUsed = team.capUsed || 0;
    const capTotal = team.capTotal || 0;
    const capAfter = currentCapUsed + capHit;
    const capEnabled = window.state?.settings?.salaryCapEnabled !== false;

    // Validate cap hit is reasonable (individual player check)
    if (capHit > 100) {
      console.error('Invalid cap hit for player:', { capHit, player });
      window.setStatus('Error: Player cap hit is unreasonably high. Please refresh and try again.');
      return;
    }
    
    // If team is already way over cap, warn but don't block (might be intentional or calculation issue)
    if (currentCapUsed > capTotal * 1.5) {
      console.warn('Team is already significantly over cap:', { currentCapUsed, capTotal, team: team.name || team.abbr });
      // Still allow signing if the individual cap hit is reasonable
    }

    if (capEnabled && capAfter > capTotal) {
      const overage = capAfter - capTotal;
      window.setStatus(`Signing would exceed salary cap by $${overage.toFixed(1)}M`);
      return;
    }

    // Ensure roster exists
    if (!Array.isArray(team.roster)) {
      team.roster = team.roster ? Array.from(team.roster) : [];
    }

    // Add player to team
    player.teamId = userTeamId;
    player.team = team.abbr || team.name;
    team.roster.push(player);
    // Sort roster by overall rating (best players first)
    team.roster.sort((a, b) => (b.ovr || 0) - (a.ovr || 0));

    // Remove from free agents (both global pool and league copy if present)
    window.state.freeAgents.splice(playerIndex, 1);
    if (L.freeAgents && L.freeAgents !== window.state.freeAgents) {
      const leagueIdx = L.freeAgents.findIndex(p => p.id === player.id);
      if (leagueIdx !== -1) {
        L.freeAgents.splice(leagueIdx, 1);
      }
    }
    L.freeAgents = window.state.freeAgents;
    
    // Update team ratings after roster change
    if (window.updateTeamRatings) {
      window.updateTeamRatings(team);
    }
    
    // Update salary cap
    if (window.recalcCap) {
      window.recalcCap(L, team);
    }
    
    // Refresh displays
    renderFreeAgency();
    if (window.updateCapSidebar) {
      window.updateCapSidebar();
    }

    if (saveState) {
      saveState();
    }

    window.setStatus(`Signed ${player.name} (${player.pos}) for $${capHit.toFixed(1)}M cap hit`);
    console.log('Free agent signed successfully with negotiated contract:', player.name);
    
  } catch (error) {
    console.error('Error signing free agent:', error);
    window.setStatus('Error signing free agent');
  }
}

// Update cap sidebar display
function updateCapSidebar() {
  const L = window.state?.league;
  if (!L) return;
  
  // ALWAYS use user team
  const userTeamId = window.state?.userTeamId ?? 0;
  const team = L.teams[userTeamId];
  
  if (!team) return;
  
  // Update cap display elements
  const capUsedEl = document.getElementById('capUsed');
  const capTotalEl = document.getElementById('capTotal');
  const deadCapEl = document.getElementById('deadCap');
  const capRoomEl = document.getElementById('capRoom');
  const seasonEl = document.getElementById('seasonNow');
  
  if (capUsedEl) capUsedEl.textContent = `$${team.capUsed?.toFixed(1) || '0.0'}M`;
  if (capTotalEl) capTotalEl.textContent = `$${team.capTotal?.toFixed(1) || '0.0'}M`;
  if (deadCapEl) deadCapEl.textContent = `$${team.deadCap?.toFixed(1) || '0.0'}M`;
  if (capRoomEl) capRoomEl.textContent = `$${team.capRoom?.toFixed(1) || '0.0'}M`;
  if (seasonEl) seasonEl.textContent = L.season || '1';
}

// Make functions globally available
window.ensureFA = ensureFA;
window.updateCapSidebar = updateCapSidebar;
window.renderFreeAgency = renderFreeAgency;
window.signFreeAgent = signFreeAgent;
window.generateBasicName = generateBasicName;
window.generateFreeAgents = generateFreeAgents;
window.openContractNegotiation = openContractNegotiation;
window.updateContractTotal = updateContractTotal;
window.closeContractModal = closeContractModal;
window.submitContractOffer = submitContractOffer;
window.updateCapSidebar = updateCapSidebar;
window.signFreeAgentWithContract = signFreeAgentWithContract;
