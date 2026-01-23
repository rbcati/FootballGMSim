// awards-viewer.js - Award Races Viewer
'use strict';

(function() {
  'use strict';

  function renderAwardRaces() {
    const container = document.getElementById('awards');
    if (!container) return;

    const L = window.state?.league;
    if (!L) {
      container.innerHTML = '<div class="card"><p>No league data available.</p></div>';
      return;
    }

    const year = L.year || 2025;

    // Calculate races
    const races = calculateRaces(L);

    let html = `
      <div class="card">
        <h2>🏆 Award Races - ${year}</h2>
        <div class="awards-grid">
    `;

    // Render each race
    const raceTypes = [
      { key: 'mvp', title: 'MVP Race' },
      { key: 'opoy', title: 'Offensive Player of Year' },
      { key: 'dpoy', title: 'Defensive Player of Year' },
      { key: 'oroty', title: 'Offensive Rookie of Year' },
      { key: 'droty', title: 'Defensive Rookie of Year' }
    ];

    raceTypes.forEach(type => {
      const candidates = races[type.key] || [];
      html += `
        <div class="award-race-card">
          <h3>${type.title}</h3>
          ${candidates.length === 0 ? '<p class="muted">No eligible candidates yet.</p>' : `
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Rk</th>
                  <th>Player</th>
                  <th>Team</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                ${candidates.slice(0, 5).map((c, i) => `
                  <tr class="player-row" data-player-id="${c.player.id}" style="cursor: pointer;">
                    <td>${i + 1}</td>
                    <td>
                      <div class="player-name-cell">
                        <strong>${c.player.name}</strong>
                        <span class="small muted">${c.player.pos}</span>
                      </div>
                    </td>
                    <td>${c.team.abbr}</td>
                    <td>${c.score.toFixed(1)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  function calculateRaces(league) {
    const races = {
      mvp: [],
      opoy: [],
      dpoy: [],
      oroty: [],
      droty: []
    };

    league.teams.forEach(team => {
      if (!team.roster) return;

      const teamWins = team.wins || team.record?.w || 0;
      const teamLosses = team.losses || team.record?.l || 0;
      const teamWinPct = teamWins / Math.max(1, teamWins + teamLosses);

      team.roster.forEach(player => {
        if (!player.stats || !player.stats.season) return;
        const stats = player.stats.season;
        if ((stats.gamesPlayed || 0) < 1) return;

        // MVP Score
        let mvpScore = 0;
        if (player.pos === 'QB') {
          mvpScore = ((stats.passYd || 0) / 100) + ((stats.passTD || 0) * 20) - ((stats.interceptions || 0) * 10) + ((stats.completionPct || 0) * 2);
          mvpScore *= (0.5 + teamWinPct * 0.5);
        } else if (player.pos === 'RB') {
          mvpScore = ((stats.rushYd || 0) / 50) + ((stats.rushTD || 0) * 15) + ((stats.recYd || 0) / 100);
          mvpScore *= (0.6 + teamWinPct * 0.4);
        } else if (['WR', 'TE'].includes(player.pos)) {
          mvpScore = ((stats.recYd || 0) / 80) + ((stats.recTD || 0) * 12) + ((stats.receptions || 0) / 5);
          mvpScore *= (0.6 + teamWinPct * 0.4);
        } else if (['DL', 'LB', 'CB', 'S'].includes(player.pos)) {
          const tackles = stats.tackles || 0;
          const sacks = stats.sacks || 0;
          const ints = stats.interceptions || 0;
          mvpScore = (tackles * 2) + (sacks * 15) + (ints * 20);
          mvpScore *= (0.7 + teamWinPct * 0.3);
        }
        if (mvpScore > 0) races.mvp.push({ player, team, score: mvpScore });

        // OPOY Score
        let opoyScore = 0;
        if (['QB', 'RB', 'WR', 'TE'].includes(player.pos)) {
           // Same logic as awards.js but simplified
           if (player.pos === 'QB') opoyScore = ((stats.passYd||0)/100) + ((stats.passTD||0)*20) - ((stats.interceptions||0)*10);
           else if (player.pos === 'RB') opoyScore = ((stats.rushYd||0)/50) + ((stats.rushTD||0)*15) + ((stats.recYd||0)/100);
           else opoyScore = ((stats.recYd||0)/80) + ((stats.recTD||0)*12) + ((stats.receptions||0)/5);

           if (opoyScore > 0) races.opoy.push({ player, team, score: opoyScore });
        }

        // DPOY Score
        let dpoyScore = 0;
        if (['DL', 'LB', 'CB', 'S'].includes(player.pos)) {
           const t = stats.tackles||0, s = stats.sacks||0, i = stats.interceptions||0, ff = stats.forcedFumbles||0;
           if (player.pos === 'DL') dpoyScore = (s*20) + (t*1.5) + (ff*10);
           else if (player.pos === 'LB') dpoyScore = (t*2) + (s*15) + (i*15) + (ff*10);
           else dpoyScore = (i*25) + ((stats.passesDefended||0)*3) + (t*1.5);

           if (dpoyScore > 0) races.dpoy.push({ player, team, score: dpoyScore });
        }

        // Rookie Checks
        // Check if rookie (legacy check or year check)
        const isRookie = (player.legacy?.teamHistory?.length || 0) === 0 && (player.age <= 24);
        if (isRookie) {
            if (['QB', 'RB', 'WR', 'TE', 'OL'].includes(player.pos)) {
                if (opoyScore > 0) races.oroty.push({ player, team, score: opoyScore }); // Use OPOY score logic
            } else if (['DL', 'LB', 'CB', 'S'].includes(player.pos)) {
                if (dpoyScore > 0) races.droty.push({ player, team, score: dpoyScore }); // Use DPOY score logic
            }
        }
      });
    });

    // Sort and trim
    Object.keys(races).forEach(key => {
      races[key].sort((a, b) => b.score - a.score);
    });

    return races;
  }

  // Export
  window.renderAwardRaces = renderAwardRaces;

})();
