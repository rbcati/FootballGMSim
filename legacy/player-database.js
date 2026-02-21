// player-database.js - Player Database and History System
'use strict';

(function() {
  'use strict';

  // Pagination State
  let currentPage = 1;
  const pageSize = 50;

  /**
   * Get all players from all teams
   * @returns {Array} Array of all players with team info
   */
  function getAllPlayers() {
    const L = window.state?.league;
    if (!L || !L.teams) return [];

    const allPlayers = [];
    L.teams.forEach(team => {
      if (team.roster && Array.isArray(team.roster)) {
        team.roster.forEach(player => {
          allPlayers.push({
            ...player,
            teamName: team.name,
            teamAbbr: team.abbr,
            teamId: team.id
          });
        });
      }
    });

    return allPlayers;
  }

  /**
   * Get the best player in the game
   * @param {Array} [players] - Optional array of players to use (optimization)
   * @returns {Object} Best player object
   */
  function getBestPlayer(players) {
    const allPlayers = players || getAllPlayers();
    if (allPlayers.length === 0) return null;

    // Sort by effective rating if available, otherwise by OVR
    return allPlayers.sort((a, b) => {
      const aRating = window.calculateEffectiveRating ? 
        (window.calculateEffectiveRating(a, window.state.league.teams[a.teamId], a.pos) || a.ovr) : a.ovr;
      const bRating = window.calculateEffectiveRating ? 
        (window.calculateEffectiveRating(b, window.state.league.teams[b.teamId], b.pos) || b.ovr) : b.ovr;
      return bRating - aRating;
    })[0];
  }

  /**
   * Render the table rows for the current page
   * @param {Array} players - List of filtered/sorted players
   * @param {HTMLElement} tbody - The table body element
   */
  function renderTablePage(players, tbody) {
    if (!tbody) return;

    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, players.length);
    const pagePlayers = players.slice(start, end);

    tbody.innerHTML = pagePlayers.map((player, index) => {
      // Lazy Calculation for View
      if (window.initializePlayerLegacy && !player.legacy) window.initializePlayerLegacy(player);
      if (window.calculateLegacyScore && (!player.legacy?.metrics?.legacyScore)) window.calculateLegacyScore(player);

      const legacy = player.legacy || {};
      const metrics = legacy.metrics || {};
      const awards = legacy.awards || {};
      const hof = legacy.hallOfFame || {};
      const legacyScore = metrics.legacyScore || 0;
      const hofThreshold = window.getHOFThreshold ? window.getHOFThreshold(player.pos) : 70;
      const hofProgress = Math.min(100, (legacyScore / hofThreshold) * 100);
      const totalAwards = (awards.playerOfYear || 0) + (awards.allPro || 0) + (awards.proBowl || 0) + (awards.rookie || 0);

      // Rank is overall index + 1
      const rank = start + index + 1;

      return `
        <tr class="player-row" data-player-id="${player.id}" data-position="${player.pos}">
          <td>${rank}</td>
          <td class="player-name">${player.name || 'Unknown'}</td>
          <td>${player.pos || 'N/A'}</td>
          <td>${player.teamAbbr || player.teamName || 'FA'}</td>
          <td>${player.age || 'N/A'}</td>
          <td class="ovr-cell">${player.ovr || 'N/A'}</td>
          <td>
            <div class="legacy-score">
              <span class="legacy-value">${legacyScore}</span>
              <div class="legacy-bar">
                <div class="legacy-fill" style="width: ${legacyScore}%"></div>
              </div>
            </div>
          </td>
          <td>
            ${hof.inducted ? '<span class="hof-badge inducted">HoF</span>' :
              hof.eligible ? `<span class="hof-badge eligible">Eligible</span>` :
              `<div class="hof-progress">
                <div class="hof-progress-bar">
                  <div class="hof-progress-fill" style="width: ${hofProgress}%"></div>
                </div>
                <span class="hof-progress-text">${Math.round(hofProgress)}%</span>
              </div>`}
          </td>
          <td>
            <div class="awards-count" title="Awards: ${totalAwards} total">
              ${totalAwards > 0 ? `🏆 ${totalAwards}` : '—'}
            </div>
          </td>
          <td>
            <button class="btn btn-sm" onclick="showPlayerDatabaseDetails('${player.id}')">View</button>
          </td>
        </tr>
      `;
    }).join('');

    // Update pagination controls if they exist
    updatePaginationControls(players.length);
  }

  /**
   * Update pagination controls state
   * @param {number} totalItems - Total number of items
   */
  function updatePaginationControls(totalItems) {
    const prevBtn = document.getElementById('dbPrevBtn');
    const nextBtn = document.getElementById('dbNextBtn');
    const pageInfo = document.getElementById('dbPageInfo');

    if (prevBtn && nextBtn && pageInfo) {
      const totalPages = Math.ceil(totalItems / pageSize);

      prevBtn.disabled = currentPage === 1;
      nextBtn.disabled = currentPage >= totalPages || totalPages === 0;

      pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1} (${totalItems} players)`;
    }
  }

  /**
   * Render player database view
   */
  function renderPlayerDatabase() {
    currentPage = 1; // Reset to page 1 on every full render

    const container = document.getElementById('playerDatabase');
    if (!container) {
      console.warn('Player database container not found');
      return;
    }

    const allPlayers = getAllPlayers();
    if (allPlayers.length === 0) {
      container.innerHTML = '<div class="card"><p>No players found in the league.</p></div>';
      return;
    }

    // Get best player
    const bestPlayer = getBestPlayer(allPlayers);

    // OPTIMIZATION: Do not pre-calculate legacy for all players.
    // Calculations are deferred until rendering (page view) or sorting (if needed).

    // Filter options
    let html = `
      <div class="card">
        <div class="row">
          <h2>Player Database</h2>
          <div class="spacer"></div>
          <div class="filter-controls">
            <label for="dbPosition">Position:</label>
            <select id="dbPosition">
              <option value="">All</option>
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
            <label for="dbSort">Sort:</label>
              <select id="dbSort">
                <option value="ovr">Overall</option>
                <option value="legacy">Legacy Score</option>
                <option value="age">Age</option>
                <option value="name">Name</option>
              </select>
          </div>
        </div>

        ${bestPlayer ? `
          <div class="best-player-card">
            <h3>🏆 Best Player in the Game</h3>
            <div class="best-player-info">
              <div class="best-player-main">
                <h4>${bestPlayer.name}</h4>
                <div class="best-player-details">
                  <span class="position-badge">${bestPlayer.pos}</span>
                  <span class="ovr-badge">OVR ${bestPlayer.ovr}</span>
                  <span class="team-badge">${bestPlayer.teamName}</span>
                </div>
              </div>
              <div class="best-player-stats">
                <div class="stat-item">
                  <span class="stat-label">Age:</span>
                  <span class="stat-value">${bestPlayer.age}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Legacy Score:</span>
                  <span class="stat-value">${bestPlayer.legacy?.metrics?.legacyScore || 0}/100</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Dev Trait:</span>
                  <span class="stat-value">${bestPlayer.devTrait || 'Normal'}</span>
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="player-database-table-container">
          <table class="table" id="playerDatabaseTable">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Name</th>
                <th>Pos</th>
                <th>Team</th>
                <th>Age</th>
                <th>OVR</th>
                <th>Legacy</th>
                <th>HoF</th>
                <th>Awards</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <!-- Populated via pagination -->
            </tbody>
          </table>
        </div>

        <div class="pagination-controls row" style="margin-top: 20px; justify-content: center; align-items: center; gap: 15px;">
             <button id="dbPrevBtn" class="btn btn-sm">Previous</button>
             <span id="dbPageInfo" style="font-weight: 500;">Page 1</span>
             <button id="dbNextBtn" class="btn btn-sm">Next</button>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Set up filters
    const positionFilter = document.getElementById('dbPosition');
    const sortSelect = document.getElementById('dbSort');
    const prevBtn = document.getElementById('dbPrevBtn');
    const nextBtn = document.getElementById('dbNextBtn');
    
    if (positionFilter) {
      positionFilter.addEventListener('change', () => {
          currentPage = 1; // Reset to page 1 on filter change
          filterAndSortPlayers();
      });
    }
    
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
          currentPage = 1; // Reset to page 1 on sort change
          filterAndSortPlayers();
      });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                filterAndSortPlayers();
                // Scroll to table top
                const table = document.getElementById('playerDatabaseTable');
                if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentPage++;
            filterAndSortPlayers();
            // Scroll to table top
            const table = document.getElementById('playerDatabaseTable');
            if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // Initial render
    filterAndSortPlayers();

    function filterAndSortPlayers() {
      const position = positionFilter?.value || '';
      const sortBy = sortSelect?.value || 'ovr';
      const tbody = document.querySelector('#playerDatabaseTable tbody');
      if (!tbody) return;

      // Use raw allPlayers as base
      let filtered = [...allPlayers];
      
      if (position) {
        filtered = filtered.filter(p => p.pos === position);
      }

      // Sort
      filtered.sort((a, b) => {
        switch(sortBy) {
          case 'legacy':
            // Calculate on demand if needed for sorting
            const getScore = (p) => {
                if (p.legacy?.metrics?.legacyScore !== undefined) return p.legacy.metrics.legacyScore;
                if (window.initializePlayerLegacy) window.initializePlayerLegacy(p);
                if (window.calculateLegacyScore) window.calculateLegacyScore(p);
                return p.legacy?.metrics?.legacyScore || 0;
            };
            return getScore(b) - getScore(a);
          case 'age':
            return (b.age || 0) - (a.age || 0);
          case 'name':
            return (a.name || '').localeCompare(b.name || '');
          case 'ovr':
          default:
            return (b.ovr || 0) - (a.ovr || 0);
        }
      });

      renderTablePage(filtered, tbody);
    }
  }

  /**
   * Show detailed player view from database
   */
  window.showPlayerDatabaseDetails = function(playerId) {
    // OPTIMIZATION: Search directly instead of generating all player objects
    let player = null;
    const L = window.state?.league;

    if (L && L.teams) {
      for (const team of L.teams) {
        if (team.roster) {
          const found = team.roster.find(p => p.id === playerId);
          if (found) {
            // Create view model on demand
            player = {
              ...found,
              teamName: team.name,
              teamAbbr: team.abbr,
              teamId: team.id
            };
            break;
          }
        }
      }
    }
    
    if (!player) {
      window.setStatus('Player not found');
      return;
    }

    // Initialize legacy if needed
    if (window.initializePlayerLegacy) {
      window.initializePlayerLegacy(player);
    }
    if (window.calculateLegacyScore) {
      window.calculateLegacyScore(player);
    }

    const legacy = player.legacy || {};
    const metrics = legacy.metrics || {};
    const awards = legacy.awards || {};
    const hof = legacy.hallOfFame || {};
    const legacyScore = metrics.legacyScore || 0;
    const hofThreshold = window.getHOFThreshold ? window.getHOFThreshold(player.pos) : 70;
    const hofProgress = Math.min(100, (legacyScore / hofThreshold) * 100);

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content modal-large">
        <div class="modal-header">
          <h2>${player.name || 'Unknown Player'} <span class="muted-tag">${player.pos || 'N/A'} (OVR ${player.ovr || 'N/A'})</span></h2>
          <button type="button" class="close" aria-label="Close modal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="player-detail-grid">
            <div class="player-basic-info">
              <h4>Basic Info</h4>
              <p><strong>Team:</strong> ${player.teamName || 'Free Agent'}</p>
              <p><strong>Age:</strong> ${player.age || 'N/A'}</p>
              <p><strong>Position:</strong> ${player.pos || 'N/A'}</p>
              <p><strong>Overall:</strong> ${player.ovr || 'N/A'}</p>
              <p><strong>Dev Trait:</strong> ${player.devTrait || 'Normal'}</p>
              <p><strong>Potential:</strong> ${player.potential || 'N/A'}</p>
            </div>

            <div class="player-legacy-info">
              <h4>Legacy & Hall of Fame</h4>
              <div class="legacy-section">
                <div class="legacy-score-display">
                  <span class="legacy-label">Legacy Score:</span>
                  <span class="legacy-value-large">${legacyScore}/100</span>
                </div>
                <div class="legacy-bar-large">
                  <div class="legacy-fill-large" style="width: ${legacyScore}%"></div>
                </div>
                
                <div class="hof-status">
                  <h5>Hall of Fame Status</h5>
                  ${hof.inducted ? 
                    '<p class="hof-inducted">✅ <strong>Hall of Famer</strong></p>' :
                    hof.eligible ?
                    `<p class="hof-eligible">⭐ <strong>Eligible</strong> (Eligible since ${hof.eligibilityYear || 'N/A'})</p>` :
                    `<p class="hof-progress-text">Progress to HoF: ${Math.round(hofProgress)}%</p>
                     <div class="hof-progress-bar-large">
                       <div class="hof-progress-fill-large" style="width: ${hofProgress}%"></div>
                     </div>
                     <p class="hof-threshold">Threshold: ${hofThreshold} (${player.pos})</p>`
                  }
                </div>

                <div class="legacy-metrics">
                  <h5>Legacy Metrics</h5>
                  <div class="metric-grid">
                    <div class="metric-item">
                      <span class="metric-label">Impact Score:</span>
                      <span class="metric-value">${metrics.impactScore || 0}</span>
                    </div>
                    <div class="metric-item">
                      <span class="metric-label">Peak Score:</span>
                      <span class="metric-value">${metrics.peakScore || 0}</span>
                    </div>
                    <div class="metric-item">
                      <span class="metric-label">Longevity:</span>
                      <span class="metric-value">${metrics.longevityScore || 0}</span>
                    </div>
                    <div class="metric-item">
                      <span class="metric-label">Clutch Score:</span>
                      <span class="metric-value">${metrics.clutchScore || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="player-awards-info">
              <h4>Accolades & Awards</h4>
              <div class="awards-section">
                <div class="award-item">
                  <span class="award-label">Player of the Year:</span>
                  <span class="award-value">${awards.playerOfYear || 0}</span>
                </div>
                <div class="award-item">
                  <span class="award-label">All-Pro:</span>
                  <span class="award-value">${awards.allPro || 0}</span>
                </div>
                <div class="award-item">
                  <span class="award-label">Pro Bowl:</span>
                  <span class="award-value">${awards.proBowl || 0}</span>
                </div>
                <div class="award-item">
                  <span class="award-label">Rookie of the Year:</span>
                  <span class="award-value">${awards.rookie || 0}</span>
                </div>
                ${player.awards && player.awards.length > 0 ? `
                  <div class="award-history">
                    <h5>Award History</h5>
                    <ul>
                      ${player.awards.map(award => `
                        <li>${award.year || 'N/A'}: ${award.award || 'Unknown'}</li>
                      `).join('')}
                    </ul>
                  </div>
                ` : ''}
              </div>
            </div>

            <div class="player-career-info">
              <h4>Career Statistics</h4>
              ${player.stats && player.stats.career ? `
                <div class="career-stats">
                  ${Object.entries(player.stats.career).filter(([key, value]) => typeof value === 'number' && value > 0).map(([key, value]) => `
                    <div class="stat-item">
                      <span class="stat-label">${key}:</span>
                      <span class="stat-value">${value.toLocaleString()}</span>
                    </div>
                  `).join('')}
                </div>
              ` : '<p>No career statistics available.</p>'}
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = 'flex';

    const closeBtn = modal.querySelector('.close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.remove();
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  };

  // Export functions
  window.renderPlayerDatabase = renderPlayerDatabase;
  window.getAllPlayers = getAllPlayers;
  window.getBestPlayer = getBestPlayer;

  console.log('✅ Player Database system loaded');

})();
