// league-stats.js - Unified Statistics Hub
'use strict';

(function() {
    'use strict';

    function renderLeagueStats(initialTab = 'detailed') {
        const container = document.getElementById('leagueStats');
        if (!container) return;

        // Ensure the layout structure exists
        if (!container.querySelector('.stats-hub-tabs')) {
            container.innerHTML = `
                <div class="card">
                    <div class="stats-hub-header">
                        <h2>League Statistics Hub</h2>
                    </div>
                    <div class="stats-hub-tabs">
                        <button class="tab-btn" data-tab="detailed">Team Stats</button>
                        <button class="tab-btn" data-tab="standings">Standings</button>
                        <button class="tab-btn" data-tab="streaks">Streaks</button>
                        <button class="tab-btn" data-tab="leaders">Player Stats</button>
                        <button class="tab-btn" data-tab="records">Records</button>
                        <button class="tab-btn" data-tab="awards">Awards</button>
                    </div>
                </div>

                <div id="statsHubContent" class="stats-hub-content mt">
                    <div id="tab-detailed" class="hub-tab-content"></div>
                    <div id="tab-standings" class="hub-tab-content"><div id="standingsWrap"></div></div>
                    <div id="tab-streaks" class="hub-tab-content"></div>
                    <div id="tab-leaders" class="hub-tab-content"><div id="stats"></div></div>
                    <div id="tab-records" class="hub-tab-content"><div id="records"></div></div>
                    <div id="tab-awards" class="hub-tab-content"><div id="awards"></div></div>
                </div>
            `;

            // Add styles for the hub
            const style = document.createElement('style');
            style.id = 'league-stats-styles';
            style.textContent = `
                .stats-hub-tabs {
                    display: flex;
                    overflow-x: auto;
                    gap: 10px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid var(--hairline);
                    margin-bottom: 20px;
                }
                .hub-tab-content {
                    display: none;
                }
                .hub-tab-content.active {
                    display: block;
                    animation: fadeIn 0.3s ease;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                /* Ensure nested containers don't have double padding/margin if they have cards */
                .hub-tab-content .card {
                    margin-top: 0;
                    border-top-left-radius: 0;
                    border-top-right-radius: 0;
                }
            `;
            if (!document.getElementById('league-stats-styles')) {
                document.head.appendChild(style);
            }

            // Bind tab events
            const tabs = container.querySelectorAll('.tab-btn');
            tabs.forEach(btn => {
                btn.addEventListener('click', () => {
                    switchTab(btn.dataset.tab);
                });
            });
        }

        // Switch to the requested tab
        switchTab(initialTab);
    }

    function switchTab(tabName) {
        const container = document.getElementById('leagueStats');
        if (!container) return;

        // Update buttons
        const tabs = container.querySelectorAll('.tab-btn');
        tabs.forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update content visibility
        const contents = container.querySelectorAll('.hub-tab-content');
        contents.forEach(content => {
            content.classList.remove('active');
        });

        const targetContent = document.getElementById(`tab-${tabName}`);
        if (targetContent) {
            targetContent.classList.add('active');

            // Trigger specific renderers based on tab
            if (tabName === 'detailed') {
                renderDetailedStandings(targetContent);
            } else if (tabName === 'streaks') {
                renderWinStreaks(targetContent);
            } else if (tabName === 'standings') {
                if (window.renderStandingsPage) window.renderStandingsPage();
            } else if (tabName === 'leaders') {
                if (window.renderStatsPage) window.renderStatsPage();
            } else if (tabName === 'records') {
                if (window.renderRecords) window.renderRecords();
            } else if (tabName === 'awards') {
                if (window.renderAwardRaces) window.renderAwardRaces();
            }
        }
    }

    function renderDetailedStandings(container) {
        const L = window.state?.league;
        if (!L || !L.teams) {
            container.innerHTML = '<div class="card"><p>No league data available.</p></div>';
            return;
        }

        // Calculate stats
        const teamStats = L.teams.map(team => {
            const stats = calculateTeamStats(team, L);
            return {
                ...team,
                ...stats
            };
        });

        // Sort by Wins, then Point Diff
        teamStats.sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            return (b.ptsFor - b.ptsAgainst) - (a.ptsFor - a.ptsAgainst);
        });

        let html = `
            <div class="card">
                <h3>Detailed Team Statistics</h3>
                <div class="table-wrapper">
                    <table class="table" id="detailedStatsTable">
                        <thead>
                            <tr>
                                <th class="sortable" data-sort="rank">Rank</th>
                                <th class="sortable" data-sort="name">Team</th>
                                <th class="sortable" data-sort="wins">W-L</th>
                                <th class="sortable" data-sort="ptsFor">PF</th>
                                <th class="sortable" data-sort="ptsAgainst">PA</th>
                                <th class="sortable" data-sort="passYds">Pass Yds</th>
                                <th class="sortable" data-sort="passTD">Pass TD</th>
                                <th class="sortable" data-sort="rushYds">Rush Yds</th>
                                <th class="sortable" data-sort="rushTD">Rush TD</th>
                                <th class="sortable" data-sort="defYds">Def Yds Allowed</th>
                                <th class="sortable" data-sort="sacksAllowed">Sacks All</th>
                                <th class="sortable" data-sort="defSacks">Def Sacks</th>
                                <th class="sortable" data-sort="turnoverDiff">TO Diff</th>
                                <th class="sortable" data-sort="intsThrown">INT Thrown</th>
                                <th class="sortable" data-sort="fumblesLost">Fum Lost</th>
                                <th class="sortable" data-sort="intsTaken">INT Taken</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${teamStats.map((t, i) => `
                                <tr>
                                    <td>${i + 1}</td>
                                    <td>
                                        <strong>${t.name}</strong>
                                        <span class="muted small">${t.abbr}</span>
                                    </td>
                                    <td>${t.wins}-${t.losses}</td>
                                    <td>${t.ptsFor}</td>
                                    <td>${t.ptsAgainst}</td>
                                    <td>${t.passYds.toLocaleString()}</td>
                                    <td>${t.passTD}</td>
                                    <td>${t.rushYds.toLocaleString()}</td>
                                    <td>${t.rushTD}</td>
                                    <td>${t.defYds.toLocaleString()}</td>
                                    <td>${t.sacksAllowed}</td>
                                    <td>${t.defSacks}</td>
                                    <td class="${t.turnoverDiff > 0 ? 'text-success' : t.turnoverDiff < 0 ? 'text-danger' : ''}">
                                        ${t.turnoverDiff > 0 ? '+' : ''}${t.turnoverDiff}
                                    </td>
                                    <td>${t.intsThrown}</td>
                                    <td>${t.fumblesLost}</td>
                                    <td>${t.intsTaken}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        container.innerHTML = html;

        // Add simple sort logic
        const table = container.querySelector('#detailedStatsTable');
        const headers = table.querySelectorAll('th.sortable');
        headers.forEach(th => {
            th.addEventListener('click', () => {
                const key = th.dataset.sort;
                // Basic implementation: reload with sort? Or client-side sort
                // For now, simpler to just re-render is expensive.
                // Let's implement client-side table sort helper if time permits or stick to static rank.
                // Re-rendering fully is fine for now as dataset is small (32 teams).
                sortTable(table, th.cellIndex, key === 'name' || key === 'rank');
            });
        });
    }

    function sortTable(table, colIndex, isAsc) {
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));

        rows.sort((rowA, rowB) => {
            const cellA = rowA.cells[colIndex].textContent.trim().replace(/,/g, '');
            const cellB = rowB.cells[colIndex].textContent.trim().replace(/,/g, '');

            const numA = parseFloat(cellA);
            const numB = parseFloat(cellB);

            if (!isNaN(numA) && !isNaN(numB)) {
                return isAsc ? numA - numB : numB - numA;
            }
            return isAsc ? cellA.localeCompare(cellB) : cellB.localeCompare(cellA);
        });

        // Toggle sort direction for next click (simplified)
        // ...

        rows.forEach(row => tbody.appendChild(row));
    }

    function calculateTeamStats(team, league) {
        if (!team.roster) return {};

        // Offense Stats (Aggregated from players)
        let passYds = 0;
        let passTD = 0;
        let rushYds = 0;
        let rushTD = 0;
        let intsThrown = 0;
        let fumblesLost = 0;
        let intsTaken = 0;
        let sacksAllowed = 0;
        let defSacks = 0;

        team.roster.forEach(p => {
            if (p.stats && p.stats.season) {
                const s = p.stats.season;

                // Offense
                passYds += (s.passYd || 0);
                passTD += (s.passTD || 0);
                rushYds += (s.rushYd || 0);
                rushTD += (s.rushTD || 0);
                fumblesLost += (s.fumbles || 0); // Assuming 'fumbles' tracks fumbles lost/total

                if (p.pos === 'QB') {
                    intsThrown += (s.interceptions || 0);
                    sacksAllowed += (s.sacks || 0); // QB sacks taken = Team sacks allowed
                }

                // Defense
                if (['CB', 'S', 'LB', 'DL'].includes(p.pos)) {
                    intsTaken += (s.interceptions || 0);
                    defSacks += (s.sacks || 0);
                }
            }
        });

        // Defensive Yards Against (Iterate Results)
        let defYds = 0;
        if (league.resultsByWeek) {
            Object.values(league.resultsByWeek).forEach(weekGames => {
                if (Array.isArray(weekGames)) {
                    weekGames.forEach(game => {
                        // Check if team played in this game
                        const homeId = typeof game.home === 'object' ? game.home.id : game.home;
                        const awayId = typeof game.away === 'object' ? game.away.id : game.away;

                        if (homeId === team.id || awayId === team.id) {
                            // Find opponent
                            const isHome = homeId === team.id;
                            const opponentSide = isHome ? 'away' : 'home';

                            // Sum opponent stats from box score
                            if (game.boxScore && game.boxScore[opponentSide]) {
                                Object.values(game.boxScore[opponentSide]).forEach(pData => {
                                    if (pData.stats) {
                                        defYds += (pData.stats.passYd || 0) + (pData.stats.rushYd || 0);
                                    }
                                });
                            }
                        }
                    });
                }
            });
        }

        return {
            passYds,
            passTD,
            rushYds,
            rushTD,
            intsThrown,
            fumblesLost,
            intsTaken,
            sacksAllowed,
            defSacks,
            defYds,
            turnoverDiff: (intsTaken) - (intsThrown + fumblesLost) // Simplified TO Diff
        };
    }

    function renderWinStreaks(container) {
        const L = window.state?.league;
        if (!L || !L.teams) return;

        const streaks = L.teams.map(team => calculateStreak(team, L));

        // Sort by streak length (positive for win, negative for loss)
        streaks.sort((a, b) => b.streakValue - a.streakValue);

        let html = `
            <div class="card">
                <h3>Current Team Streaks</h3>
                <div class="table-wrapper">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Team</th>
                                <th>Streak</th>
                                <th>Last 5</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${streaks.map((s, i) => `
                                <tr>
                                    <td>${i + 1}</td>
                                    <td>
                                        <strong>${s.team.name}</strong>
                                        <span class="muted small">${s.team.abbr}</span>
                                    </td>
                                    <td>
                                        <span class="badge ${s.type === 'W' ? 'badge-success' : 'badge-danger'}">
                                            ${s.type}${s.count}
                                        </span>
                                    </td>
                                    <td>${s.last5}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        container.innerHTML = html;

        // Add minimal badge CSS if not exists
        if (!document.getElementById('streak-badges')) {
            const style = document.createElement('style');
            style.id = 'streak-badges';
            style.textContent = `
                .badge { padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 0.85em; }
                .badge-success { background-color: rgba(40, 167, 69, 0.2); color: #28a745; }
                .badge-danger { background-color: rgba(220, 53, 69, 0.2); color: #dc3545; }
            `;
            document.head.appendChild(style);
        }
    }

    function calculateStreak(team, league) {
        if (!league.resultsByWeek) return { team, type: '-', count: 0, streakValue: 0, last5: '-' };

        const games = [];
        // Flatten games in chronological order
        const maxWeeks = Object.keys(league.resultsByWeek).length;
        for (let i = 0; i < maxWeeks; i++) {
            const weekGames = league.resultsByWeek[i];
            if (weekGames) {
                const game = weekGames.find(g => {
                    const h = typeof g.home === 'object' ? g.home.id : g.home;
                    const a = typeof g.away === 'object' ? g.away.id : g.away;
                    return h === team.id || a === team.id;
                });
                if (game && game.scoreHome !== undefined) {
                    const isHome = (typeof game.home === 'object' ? game.home.id : game.home) === team.id;
                    const teamScore = isHome ? game.scoreHome : game.scoreAway;
                    const oppScore = isHome ? game.scoreAway : game.scoreHome;
                    games.push(teamScore > oppScore ? 'W' : teamScore < oppScore ? 'L' : 'T');
                }
            }
        }

        if (games.length === 0) return { team, type: '-', count: 0, streakValue: 0, last5: '-' };

        // Calculate current streak from the end
        let currentType = games[games.length - 1];
        let count = 0;
        for (let i = games.length - 1; i >= 0; i--) {
            if (games[i] === currentType) {
                count++;
            } else {
                break;
            }
        }

        // Calculate last 5
        const last5 = games.slice(-5).join('-');

        return {
            team,
            type: currentType,
            count,
            streakValue: currentType === 'W' ? count : -count,
            last5
        };
    }

    window.renderLeagueStats = renderLeagueStats;
    window.renderDetailedStandings = renderDetailedStandings;
    window.renderWinStreaks = renderWinStreaks;

})();
