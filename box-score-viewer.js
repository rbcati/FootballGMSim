// box-score-viewer.js - Box Score Viewer for Game Results
'use strict';

(function() {
  'use strict';

  /**
   * Get game result by week and game index
   * @param {number} week - Week number
   * @param {number} gameIndex - Game index in week
   * @returns {Object|null} Game result object
   */
  function getGameResult(week, gameIndex) {
    const L = window.state?.league;
    if (!L || !L.resultsByWeek) {
      console.error('No league or resultsByWeek found');
      return null;
    }
    
    const weekResults = L.resultsByWeek[week - 1];
    if (!weekResults || !Array.isArray(weekResults)) {
      console.error(`No results found for week ${week}`);
      return null;
    }
    
    if (gameIndex < 0 || gameIndex >= weekResults.length) {
      console.error(`Invalid game index ${gameIndex} for week ${week} (found ${weekResults.length} games)`);
      return null;
    }
    
    return weekResults[gameIndex] || null;
  }

  /**
   * Get all games for a specific week
   * @param {number} week - Week number
   * @returns {Array} Array of game results
   */
  function getWeekGames(week) {
    const L = window.state?.league;
    if (!L || !L.resultsByWeek) return [];
    
    const weekResults = L.resultsByWeek[week - 1];
    if (!weekResults || !Array.isArray(weekResults)) return [];
    
    return weekResults.filter(result => result && !result.bye);
  }

  /**
   * Format stat value for display
   * @param {string} statName - Stat name
   * @param {number} value - Stat value
   * @returns {string} Formatted value
   */
  function formatStatValue(statName, value) {
    if (value === undefined || value === null) return '—';
    if (typeof value !== 'number') return value;
    
    if (statName.includes('Pct') || statName.includes('Percent') || statName === 'completionPct' || statName === 'successPct') {
      return `${value.toFixed(1)}%`;
    }
    if (statName.includes('Rating') || statName.includes('Grade')) {
      return value.toFixed(1);
    }
    if (statName.includes('Yards') || statName.includes('Yd') || statName === 'yardsAfterCatch') {
      return value.toLocaleString();
    }
    if (Number.isInteger(value)) {
      return value.toLocaleString();
    }
    return value.toFixed(1);
  }

  /**
   * Format stat name for display
   * @param {string} statName - Stat name
   * @returns {string} Formatted name
   */
  function formatStatName(statName) {
    const statNames = {
      passAtt: 'Pass Att',
      passComp: 'Comp',
      passYd: 'Pass Yds',
      passTD: 'Pass TD',
      interceptions: 'INT',
      sacks: 'Sacks',
      longestPass: 'Long',
      completionPct: 'Comp %',
      rushAtt: 'Rush Att',
      rushYd: 'Rush Yds',
      rushTD: 'Rush TD',
      longestRun: 'Long',
      yardsPerCarry: 'YPC',
      fumbles: 'Fum',
      targets: 'Tgt',
      receptions: 'Rec',
      recYd: 'Rec Yds',
      recTD: 'Rec TD',
      drops: 'Drops',
      yardsAfterCatch: 'YAC',
      longestCatch: 'Long',
      coverageRating: 'Coverage',
      tackles: 'Tackles',
      passesDefended: 'PD',
      pressureRating: 'Pressure',
      tacklesForLoss: 'TFL',
      forcedFumbles: 'FF',
      sacksAllowed: 'Sacks Allowed',
      tacklesForLossAllowed: 'TFL Allowed',
      protectionGrade: 'Protection',
      fgAttempts: 'FG Att',
      fgMade: 'FG Made',
      fgMissed: 'FG Missed',
      longestFG: 'Long FG',
      xpAttempts: 'XP Att',
      xpMade: 'XP Made',
      xpMissed: 'XP Missed',
      successPct: 'Success %',
      avgKickYards: 'Avg Kick',
      punts: 'Punts',
      puntYards: 'Punt Yds',
      avgPuntYards: 'Avg Punt',
      longestPunt: 'Long Punt'
    };
    
    return statNames[statName] || statName.replace(/([A-Z])/g, ' $1').trim();
  }

  /**
   * Render box score for a single game
   * @param {Object} gameResult - Game result object with boxScore
   */
  function renderBoxScore(gameResult) {
    if (!gameResult || !gameResult.boxScore) {
      console.warn('No box score data available for game');
      return '<div class="card"><p>Box score data not available for this game.</p></div>';
    }

    const { home, away } = gameResult.boxScore;
    const homeTeamName = gameResult.homeTeamName || 'Home Team';
    const awayTeamName = gameResult.awayTeamName || 'Away Team';
    const homeScore = gameResult.scoreHome || 0;
    const awayScore = gameResult.scoreAway || 0;
    const week = gameResult.week || '?';
    const year = gameResult.year || '?';

    let html = `
      <div class="box-score-container">
        <div class="box-score-header">
          <h2>Box Score - Week ${week}, ${year}</h2>
          <div class="game-score-summary">
            <div class="team-score ${awayScore > homeScore ? 'winner' : ''}">
              <span class="team-name">${awayTeamName}</span>
              <span class="score">${awayScore}</span>
            </div>
            <div class="vs-divider">@</div>
            <div class="team-score ${homeScore > awayScore ? 'winner' : ''}">
              <span class="team-name">${homeTeamName}</span>
              <span class="score">${homeScore}</span>
            </div>
          </div>
        </div>
    `;

    // Offensive stats section
    html += `
      <div class="box-score-section">
        <h3>Offense</h3>
        <div class="box-score-teams">
    `;

    // Away team offense
    html += renderTeamBoxScore(awayTeamName, away, 'away');
    
    // Home team offense
    html += renderTeamBoxScore(homeTeamName, home, 'home');

    html += `
        </div>
      </div>
    `;

    // Defensive stats section
    html += `
      <div class="box-score-section">
        <h3>Defense</h3>
        <div class="box-score-teams">
    `;

    // Away team defense
    html += renderTeamDefenseBoxScore(awayTeamName, away, 'away');
    
    // Home team defense
    html += renderTeamDefenseBoxScore(homeTeamName, home, 'home');

    html += `
        </div>
      </div>
    `;

    // Special teams section
    html += `
      <div class="box-score-section">
        <h3>Special Teams</h3>
        <div class="box-score-teams">
    `;

    // Away team special teams
    html += renderTeamSpecialTeamsBoxScore(awayTeamName, away, 'away');
    
    // Home team special teams
    html += renderTeamSpecialTeamsBoxScore(homeTeamName, home, 'home');

    html += `
        </div>
      </div>
    `;

    html += `</div>`;

    return html;
  }

  /**
   * Render offensive box score for a team
   * @param {string} teamName - Team name
   * @param {Object} playerStats - Player stats object
   * @param {string} side - 'home' or 'away'
   * @returns {string} HTML
   */
  function renderTeamBoxScore(teamName, playerStats, side) {
    if (!playerStats) return '';

    // Group players by position
    const qbs = [];
    const rbs = [];
    const wrs = [];
    const tes = [];
    const ols = [];

    Object.values(playerStats).forEach(player => {
      if (!player.stats) return;
      const hasStats = Object.keys(player.stats).some(key => player.stats[key] > 0);
      if (!hasStats) return;

      if (player.pos === 'QB') qbs.push(player);
      else if (player.pos === 'RB') rbs.push(player);
      else if (player.pos === 'WR') wrs.push(player);
      else if (player.pos === 'TE') tes.push(player);
      else if (player.pos === 'OL') ols.push(player);
    });

    let html = `
      <div class="box-score-team ${side}">
        <h4>${teamName}</h4>
    `;

    // Quarterbacks
    if (qbs.length > 0) {
      html += `
        <div class="position-group">
          <h5>Passing</h5>
          <table class="box-score-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Cmp</th>
                <th>Att</th>
                <th>Yds</th>
                <th>TD</th>
                <th>INT</th>
                <th>Sacks</th>
                <th>Long</th>
                <th>Comp %</th>
              </tr>
            </thead>
            <tbody>
      `;
      qbs.forEach(qb => {
        const s = qb.stats;
        html += `
          <tr>
            <td>${qb.name}</td>
            <td>${formatStatValue('passComp', s.passComp)}</td>
            <td>${formatStatValue('passAtt', s.passAtt)}</td>
            <td>${formatStatValue('passYd', s.passYd)}</td>
            <td>${formatStatValue('passTD', s.passTD)}</td>
            <td>${formatStatValue('interceptions', s.interceptions)}</td>
            <td>${formatStatValue('sacks', s.sacks)}</td>
            <td>${formatStatValue('longestPass', s.longestPass)}</td>
            <td>${formatStatValue('completionPct', s.completionPct)}</td>
          </tr>
        `;
      });
      html += `</tbody></table></div>`;
    }

    // Running backs
    if (rbs.length > 0) {
      html += `
        <div class="position-group">
          <h5>Rushing</h5>
          <table class="box-score-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Att</th>
                <th>Yds</th>
                <th>TD</th>
                <th>Long</th>
                <th>YPC</th>
                <th>Fum</th>
              </tr>
            </thead>
            <tbody>
      `;
      rbs.forEach(rb => {
        const s = rb.stats;
        html += `
          <tr>
            <td>${rb.name}</td>
            <td>${formatStatValue('rushAtt', s.rushAtt)}</td>
            <td>${formatStatValue('rushYd', s.rushYd)}</td>
            <td>${formatStatValue('rushTD', s.rushTD)}</td>
            <td>${formatStatValue('longestRun', s.longestRun)}</td>
            <td>${formatStatValue('yardsPerCarry', s.yardsPerCarry)}</td>
            <td>${formatStatValue('fumbles', s.fumbles)}</td>
          </tr>
        `;
      });
      html += `</tbody></table></div>`;
    }

    // Receivers (WR/TE)
    const receivers = [...wrs, ...tes];
    if (receivers.length > 0) {
      html += `
        <div class="position-group">
          <h5>Receiving</h5>
          <table class="box-score-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Rec</th>
                <th>Tgt</th>
                <th>Yds</th>
                <th>TD</th>
                <th>Drops</th>
                <th>YAC</th>
                <th>Long</th>
              </tr>
            </thead>
            <tbody>
      `;
      receivers.forEach(rec => {
        const s = rec.stats;
        html += `
          <tr>
            <td>${rec.name} (${rec.pos})</td>
            <td>${formatStatValue('receptions', s.receptions)}</td>
            <td>${formatStatValue('targets', s.targets)}</td>
            <td>${formatStatValue('recYd', s.recYd)}</td>
            <td>${formatStatValue('recTD', s.recTD)}</td>
            <td>${formatStatValue('drops', s.drops)}</td>
            <td>${formatStatValue('yardsAfterCatch', s.yardsAfterCatch)}</td>
            <td>${formatStatValue('longestCatch', s.longestCatch)}</td>
          </tr>
        `;
      });
      html += `</tbody></table></div>`;
    }

    // Offensive line
    if (ols.length > 0) {
      html += `
        <div class="position-group">
          <h5>Offensive Line</h5>
          <table class="box-score-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Sacks Allowed</th>
                <th>TFL Allowed</th>
                <th>Protection Grade</th>
              </tr>
            </thead>
            <tbody>
      `;
      ols.forEach(ol => {
        const s = ol.stats;
        html += `
          <tr>
            <td>${ol.name}</td>
            <td>${formatStatValue('sacksAllowed', s.sacksAllowed)}</td>
            <td>${formatStatValue('tacklesForLossAllowed', s.tacklesForLossAllowed)}</td>
            <td>${formatStatValue('protectionGrade', s.protectionGrade)}</td>
          </tr>
        `;
      });
      html += `</tbody></table></div>`;
    }

    html += `</div>`;
    return html;
  }

  /**
   * Render defensive box score for a team
   * @param {string} teamName - Team name
   * @param {Object} playerStats - Player stats object
   * @param {string} side - 'home' or 'away'
   * @returns {string} HTML
   */
  function renderTeamDefenseBoxScore(teamName, playerStats, side) {
    if (!playerStats) return '';

    const dbs = [];
    const defenders = [];

    Object.values(playerStats).forEach(player => {
      if (!player.stats) return;
      const hasStats = Object.keys(player.stats).some(key => player.stats[key] > 0);
      if (!hasStats) return;

      if (['CB', 'S'].includes(player.pos)) dbs.push(player);
      else if (['DL', 'LB'].includes(player.pos)) defenders.push(player);
    });

    let html = `
      <div class="box-score-team ${side}">
        <h4>${teamName}</h4>
    `;

    // Defensive backs
    if (dbs.length > 0) {
      html += `
        <div class="position-group">
          <h5>Defensive Backs</h5>
          <table class="box-score-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Coverage</th>
                <th>Tackles</th>
                <th>INT</th>
                <th>PD</th>
              </tr>
            </thead>
            <tbody>
      `;
      dbs.forEach(db => {
        const s = db.stats;
        html += `
          <tr>
            <td>${db.name} (${db.pos})</td>
            <td>${formatStatValue('coverageRating', s.coverageRating)}</td>
            <td>${formatStatValue('tackles', s.tackles)}</td>
            <td>${formatStatValue('interceptions', s.interceptions)}</td>
            <td>${formatStatValue('passesDefended', s.passesDefended)}</td>
          </tr>
        `;
      });
      html += `</tbody></table></div>`;
    }

    // Defensive linemen and linebackers
    if (defenders.length > 0) {
      html += `
        <div class="position-group">
          <h5>Front Seven</h5>
          <table class="box-score-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Pressure</th>
                <th>Sacks</th>
                <th>Tackles</th>
                <th>TFL</th>
                <th>FF</th>
              </tr>
            </thead>
            <tbody>
      `;
      defenders.forEach(def => {
        const s = def.stats;
        html += `
          <tr>
            <td>${def.name} (${def.pos})</td>
            <td>${formatStatValue('pressureRating', s.pressureRating)}</td>
            <td>${formatStatValue('sacks', s.sacks)}</td>
            <td>${formatStatValue('tackles', s.tackles)}</td>
            <td>${formatStatValue('tacklesForLoss', s.tacklesForLoss)}</td>
            <td>${formatStatValue('forcedFumbles', s.forcedFumbles)}</td>
          </tr>
        `;
      });
      html += `</tbody></table></div>`;
    }

    html += `</div>`;
    return html;
  }

  /**
   * Render special teams box score for a team
   * @param {string} teamName - Team name
   * @param {Object} playerStats - Player stats object
   * @param {string} side - 'home' or 'away'
   * @returns {string} HTML
   */
  function renderTeamSpecialTeamsBoxScore(teamName, playerStats, side) {
    if (!playerStats) return '';

    const kickers = [];
    const punters = [];

    Object.values(playerStats).forEach(player => {
      if (!player.stats) return;
      const hasStats = Object.keys(player.stats).some(key => player.stats[key] > 0);
      if (!hasStats) return;

      if (player.pos === 'K') kickers.push(player);
      else if (player.pos === 'P') punters.push(player);
    });

    let html = `
      <div class="box-score-team ${side}">
        <h4>${teamName}</h4>
    `;

    // Kickers
    if (kickers.length > 0) {
      html += `
        <div class="position-group">
          <h5>Kicking</h5>
          <table class="box-score-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>FG Made</th>
                <th>FG Att</th>
                <th>Long FG</th>
                <th>XP Made</th>
                <th>XP Att</th>
                <th>Success %</th>
                <th>Avg Kick</th>
              </tr>
            </thead>
            <tbody>
      `;
      kickers.forEach(k => {
        const s = k.stats;
        html += `
          <tr>
            <td>${k.name}</td>
            <td>${formatStatValue('fgMade', s.fgMade)}</td>
            <td>${formatStatValue('fgAttempts', s.fgAttempts)}</td>
            <td>${formatStatValue('longestFG', s.longestFG)}</td>
            <td>${formatStatValue('xpMade', s.xpMade)}</td>
            <td>${formatStatValue('xpAttempts', s.xpAttempts)}</td>
            <td>${formatStatValue('successPct', s.successPct)}</td>
            <td>${formatStatValue('avgKickYards', s.avgKickYards)}</td>
          </tr>
        `;
      });
      html += `</tbody></table></div>`;
    }

    // Punters
    if (punters.length > 0) {
      html += `
        <div class="position-group">
          <h5>Punting</h5>
          <table class="box-score-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Punts</th>
                <th>Yds</th>
                <th>Avg</th>
                <th>Long</th>
              </tr>
            </thead>
            <tbody>
      `;
      punters.forEach(p => {
        const s = p.stats;
        html += `
          <tr>
            <td>${p.name}</td>
            <td>${formatStatValue('punts', s.punts)}</td>
            <td>${formatStatValue('puntYards', s.puntYards)}</td>
            <td>${formatStatValue('avgPuntYards', s.avgPuntYards)}</td>
            <td>${formatStatValue('longestPunt', s.longestPunt)}</td>
          </tr>
        `;
      });
      html += `</tbody></table></div>`;
    }

    html += `</div>`;
    return html;
  }

  /**
   * Show box score modal for a specific game
   * @param {number} week - Week number
   * @param {number} gameIndex - Game index in week
   */
  window.showBoxScore = function(week, gameIndex) {
    const gameResult = getGameResult(week, gameIndex);
    if (!gameResult) {
      window.setStatus('Game not found');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content modal-large">
        <div class="modal-header">
          <h2>Box Score</h2>
          <button type="button" class="close" aria-label="Close modal">&times;</button>
        </div>
        <div class="modal-body">
          ${renderBoxScore(gameResult)}
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
  window.renderBoxScore = renderBoxScore;
  window.getGameResult = getGameResult;
  window.getWeekGames = getWeekGames;

  console.log('✅ Box Score Viewer loaded');

})();
