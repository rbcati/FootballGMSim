// player-comparison.js - Player Comparison Tool
// Allows side-by-side comparison of players

(function() {
  'use strict';

  /**
   * Shows player comparison modal
   * @param {string} playerId1 - First player ID (optional)
   * @param {string} playerId2 - Second player ID (optional)
   */
  window.showPlayerComparison = function(playerId1 = null, playerId2 = null) {
    const L = window.state?.league;
    if (!L || !L.teams) {
      window.setStatus?.('No league loaded', 'error');
      return;
    }

    // Get all players
    const allPlayers = [];
    L.teams.forEach(team => {
      if (team.roster) {
        team.roster.forEach(player => {
          if (player) {
            allPlayers.push({ ...player, teamName: team.name, teamAbbr: team.abbr });
          }
        });
      }
    });

    if (allPlayers.length === 0) {
      window.setStatus?.('No players available to compare', 'error');
      return;
    }

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'playerComparisonModal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 1200px; width: 95%;">
        <div class="modal-header">
          <h2>Compare Players</h2>
          <button class="close" onclick="this.closest('.modal').remove()">&times;</button>
        </div>
        <div class="comparison-selector" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Player 1</label>
            <select id="comparePlayer1" style="width: 100%; padding: 8px; border-radius: 6px; background: var(--surface); color: var(--text); border: 1px solid var(--hairline);">
              <option value="">Select Player 1...</option>
              ${allPlayers.map(p => `<option value="${p.id}" ${playerId1 === p.id ? 'selected' : ''}>${p.name} (${p.pos}) - ${p.teamAbbr}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Player 2</label>
            <select id="comparePlayer2" style="width: 100%; padding: 8px; border-radius: 6px; background: var(--surface); color: var(--text); border: 1px solid var(--hairline);">
              <option value="">Select Player 2...</option>
              ${allPlayers.map(p => `<option value="${p.id}" ${playerId2 === p.id ? 'selected' : ''}>${p.name} (${p.pos}) - ${p.teamAbbr}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="comparisonTable" style="min-height: 200px;">
          <p style="text-align: center; color: var(--text-muted); padding: 40px;">Select two players to compare</p>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Add event listeners
    const select1 = document.getElementById('comparePlayer1');
    const select2 = document.getElementById('comparePlayer2');
    const table = document.getElementById('comparisonTable');

    function updateComparison() {
      const id1 = select1.value;
      const id2 = select2.value;

      if (!id1 || !id2) {
        table.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 40px;">Select two players to compare</p>';
        return;
      }

      const p1 = allPlayers.find(p => p.id === id1);
      const p2 = allPlayers.find(p => p.id === id2);

      if (!p1 || !p2) {
        table.innerHTML = '<p style="text-align: center; color: var(--error-text); padding: 40px;">Error: Players not found</p>';
        return;
      }

      table.innerHTML = renderComparisonTable(p1, p2);
    }

    select1.addEventListener('change', updateComparison);
    select2.addEventListener('change', updateComparison);

    // If players were pre-selected, show comparison immediately
    if (playerId1 && playerId2) {
      updateComparison();
    }

    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  };

  /**
   * Renders comparison table
   * @param {Object} p1 - Player 1
   * @param {Object} p2 - Player 2
   */
  function renderComparisonTable(p1, p2) {
    const stats1 = p1.stats?.career || {};
    const stats2 = p2.stats?.career || {};

    return `
      <div style="overflow-x: auto;">
        <table class="comparison-table" style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: var(--surface-strong);">
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--hairline-strong);"></th>
              <th style="padding: 12px; text-align: center; border-bottom: 2px solid var(--hairline-strong);">
                <div style="font-weight: 600;">${p1.name}</div>
                <div style="font-size: 0.85rem; color: var(--text-muted);">${p1.pos} - ${p1.teamAbbr}</div>
              </th>
              <th style="padding: 12px; text-align: center; border-bottom: 2px solid var(--hairline-strong);">
                <div style="font-weight: 600;">${p2.name}</div>
                <div style="font-size: 0.85rem; color: var(--text-muted);">${p2.pos} - ${p2.teamAbbr}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid var(--hairline);">
              <td style="padding: 10px; font-weight: 500;">Overall Rating</td>
              <td style="padding: 10px; text-align: center; ${p1.ovr > p2.ovr ? 'color: var(--success-text); font-weight: 600;' : ''}">${p1.ovr || 'N/A'}</td>
              <td style="padding: 10px; text-align: center; ${p2.ovr > p1.ovr ? 'color: var(--success-text); font-weight: 600;' : ''}">${p2.ovr || 'N/A'}</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--hairline);">
              <td style="padding: 10px; font-weight: 500;">Age</td>
              <td style="padding: 10px; text-align: center;">${p1.age || 'N/A'}</td>
              <td style="padding: 10px; text-align: center;">${p2.age || 'N/A'}</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--hairline);">
              <td style="padding: 10px; font-weight: 500;">Potential</td>
              <td style="padding: 10px; text-align: center;">${p1.potential || 'N/A'}</td>
              <td style="padding: 10px; text-align: center;">${p2.potential || 'N/A'}</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--hairline);">
              <td style="padding: 10px; font-weight: 500;">Contract (Years)</td>
              <td style="padding: 10px; text-align: center;">${p1.years || 0}</td>
              <td style="padding: 10px; text-align: center;">${p2.years || 0}</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--hairline);">
              <td style="padding: 10px; font-weight: 500;">Salary (M)</td>
              <td style="padding: 10px; text-align: center;">$${((p1.baseAnnual || 0)).toFixed(1)}</td>
              <td style="padding: 10px; text-align: center;">$${((p2.baseAnnual || 0)).toFixed(1)}</td>
            </tr>
            ${renderRatingsComparison(p1, p2)}
            ${renderStatsComparison(p1, p2, stats1, stats2)}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Renders ratings comparison
   */
  function renderRatingsComparison(p1, p2) {
    const ratings1 = p1.ratings || {};
    const ratings2 = p2.ratings || {};
    const allRatings = new Set([...Object.keys(ratings1), ...Object.keys(ratings2)]);

    if (allRatings.size === 0) return '';

    let html = '<tr style="background: var(--surface);"><td colspan="3" style="padding: 12px; font-weight: 600; color: var(--accent);">Ratings</td></tr>';

    Array.from(allRatings).sort().forEach(rating => {
      const val1 = ratings1[rating] || 0;
      const val2 = ratings2[rating] || 0;
      const better1 = val1 > val2;
      const better2 = val2 > val1;

      html += `
        <tr style="border-bottom: 1px solid var(--hairline);">
          <td style="padding: 8px 10px; font-size: 0.9rem;">${formatStatName(rating)}</td>
          <td style="padding: 8px 10px; text-align: center; ${better1 ? 'color: var(--success-text); font-weight: 600;' : ''}">${val1}</td>
          <td style="padding: 8px 10px; text-align: center; ${better2 ? 'color: var(--success-text); font-weight: 600;' : ''}">${val2}</td>
        </tr>
      `;
    });

    return html;
  }

  /**
   * Renders stats comparison
   */
  function renderStatsComparison(p1, p2, stats1, stats2) {
    const commonStats = ['passYd', 'passTD', 'rushYd', 'rushTD', 'receptions', 'recYd', 'recTD', 'tackles', 'sacks', 'defensiveInterceptions'];
    const relevantStats = commonStats.filter(stat => (stats1[stat] || 0) > 0 || (stats2[stat] || 0) > 0);

    if (relevantStats.length === 0) return '';

    let html = '<tr style="background: var(--surface);"><td colspan="3" style="padding: 12px; font-weight: 600; color: var(--accent);">Career Statistics</td></tr>';

    relevantStats.forEach(stat => {
      const val1 = stats1[stat] || 0;
      const val2 = stats2[stat] || 0;
      const better1 = val1 > val2;
      const better2 = val2 > val1;

      html += `
        <tr style="border-bottom: 1px solid var(--hairline);">
          <td style="padding: 8px 10px; font-size: 0.9rem;">${formatStatName(stat)}</td>
          <td style="padding: 8px 10px; text-align: center; ${better1 ? 'color: var(--success-text); font-weight: 600;' : ''}">${formatStatValue(stat, val1)}</td>
          <td style="padding: 8px 10px; text-align: center; ${better2 ? 'color: var(--success-text); font-weight: 600;' : ''}">${formatStatValue(stat, val2)}</td>
        </tr>
      `;
    });

    return html;
  }

  /**
   * Formats stat name for display
   */
  function formatStatName(stat) {
    const names = {
      passYd: 'Passing Yards',
      passTD: 'Passing TDs',
      rushYd: 'Rushing Yards',
      rushTD: 'Rushing TDs',
      receptions: 'Receptions',
      recYd: 'Receiving Yards',
      recTD: 'Receiving TDs',
      tackles: 'Tackles',
      sacks: 'Sacks',
      defensiveInterceptions: 'Interceptions',
      throwPower: 'Throw Power',
      throwAccuracy: 'Throw Accuracy',
      speed: 'Speed',
      acceleration: 'Acceleration',
      agility: 'Agility',
      awareness: 'Awareness',
      catching: 'Catching',
      coverage: 'Coverage',
      passRushSpeed: 'Pass Rush Speed',
      passRushPower: 'Pass Rush Power',
      runStop: 'Run Stop'
    };
    return names[stat] || stat.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  }

  /**
   * Formats stat value for display
   */
  function formatStatValue(stat, value) {
    if (typeof value !== 'number') return 'N/A';
    if (value >= 1000) return value.toLocaleString();
    return value.toFixed(1);
  }

  console.log('✅ Player Comparison system loaded');

})();
