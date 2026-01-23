// stats-viewer.js
// League Leaders and Stats Page

(function() {
    'use strict';

    let currentStatsView = 'players';
    let currentSort = 'ovr';
    let sortDesc = true;
    let currentPosFilter = 'All';
    let currentLimit = 20;

    // Helper to switch views
    window.setStatsView = function(view) {
        currentStatsView = view;
        if (view === 'players') {
            currentLimit = 20;
        }
        window.renderStatsPage();
    };

    window.renderStatsPage = function() {
        // Target the leagueStats view directly if 'stats' container is not found
        let statsContainer = document.getElementById('stats');
        if (!statsContainer) {
            statsContainer = document.getElementById('leagueStats');
        }

        if (!statsContainer) {
            console.error("No stats container found!");
            return;
        }

        // Render Structure
        statsContainer.innerHTML = `
            <div class="card">
                <div class="row" style="margin-bottom: 20px;">
                    <div class="stats-controls" style="display: flex; gap: 10px;">
                        <button class="btn ${currentStatsView === 'team' ? 'primary' : ''}" onclick="window.setStatsView('team')">Standings</button>
                        <button class="btn ${currentStatsView === 'team_stats' ? 'primary' : ''}" onclick="window.setStatsView('team_stats')">Team Stats</button>
                        <button class="btn ${currentStatsView === 'players' ? 'primary' : ''}" onclick="window.setStatsView('players')">Player Leaders</button>
                    </div>
                </div>
                <div id="stats-content"></div>
            </div>
        `;

        const content = document.getElementById('stats-content');
        if (currentStatsView === 'team') {
            renderStandingsView(content);
        } else if (currentStatsView === 'team_stats') {
            renderTeamStatsView(content);
        } else {
            renderPlayerLeadersView(content);
        }
    };

    function renderTeamStatsView(container) {
        const L = window.state?.league;
        if (!L || !L.teams) {
            container.innerHTML = '<p class="muted">No league data available.</p>';
            return;
        }

        let html = `
        <div class="table-wrapper">
            <table class="table" id="teamStatsTable">
                <thead>
                    <tr>
                        <th>Team</th>
                        <th>W-L-T</th>
                        <th>PF</th>
                        <th>PA</th>
                        <th>Diff</th>
                        <th>Off Yds/G</th>
                        <th>Def Yds/G</th>
                        <th>3rd %</th>
                        <th>RZ TD %</th>
                    </tr>
                </thead>
                <tbody>
        `;

        L.teams.forEach(t => {
            const s = t.stats?.season || {};
            const r = t.record || { w:0, l:0, t:0, pf:0, pa:0 };
            const games = Math.max(1, (r.w + r.l + r.t));

            const thirdAtt = s.thirdDownAttempts || 0;
            const thirdConv = s.thirdDownConversions || 0;
            const thirdPct = thirdAtt > 0 ? ((thirdConv/thirdAtt)*100).toFixed(1) + '%' : '0.0%';

            const rzTrips = s.redZoneTrips || 0;
            const rzTDs = s.redZoneTDs || 0;
            const rzPct = rzTrips > 0 ? ((rzTDs/rzTrips)*100).toFixed(1) + '%' : '0.0%';

            // Calculate yards per game from player stats accumulation
            // This is an approximation as we don't store team total yards directly in season object usually
            // We rely on the accumulation logic in simulation.js
            const passYds = s.passYd || 0;
            const rushYds = s.rushYd || 0;
            const totalYds = passYds + rushYds;
            const ypg = (totalYds / games).toFixed(1);

            // Defense approximation (using PA as proxy or calculate if available)
            // For now, let's use PA/G as a key metric, and maybe yards allowed if we tracked it
            // We tracked 'yardsAllowed' on defenders, but aggregating for team is complex.
            // Let's stick to PA/G and Differential for now.

            html += `
                <tr>
                    <td><strong>${t.name}</strong></td>
                    <td>${r.w}-${r.l}-${r.t}</td>
                    <td>${r.pf}</td>
                    <td>${r.pa}</td>
                    <td style="color: ${r.pf - r.pa >= 0 ? 'var(--accent)' : 'var(--error)'}">${r.pf - r.pa}</td>
                    <td>${ypg}</td>
                    <td>${(r.pa / games).toFixed(1)} (Pts)</td>
                    <td>${thirdPct}</td>
                    <td>${rzPct}</td>
                </tr>
            `;
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;
    }

    function renderStandingsView(container) {
        if (!window.calculateAllStandings || !window.state?.league) {
            container.innerHTML = '<p class="muted">Standings data unavailable.</p>';
            return;
        }

        const L = window.state.league;
        const standingsData = window.calculateAllStandings(L);

        // Prefer Division Standings for detail
        if (window.renderDivisionStandings) {
            container.innerHTML = window.renderDivisionStandings(standingsData);
        } else if (window.renderOverallStandings) {
            container.innerHTML = window.renderOverallStandings(standingsData);
        } else {
            container.innerHTML = '<p class="muted">Standings renderer unavailable.</p>';
        }

        if (window.makeTeamsClickable) {
            setTimeout(window.makeTeamsClickable, 100);
        }
    }

    function renderPlayerLeadersView(container) {
        container.innerHTML = `
            <div class="row">
                <h3>Player Leaders</h3>
                <div class="spacer"></div>
                <select id="statsPosFilter">
                    <option value="All">All Positions</option>
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

            <div class="table-wrapper mt">
                <table class="table" id="statsTable">
                    <thead id="statsTableHeader">
                        <!-- Dynamic Headers -->
                    </thead>
                    <tbody id="statsTableBody">
                        <tr><td colspan="15">Loading stats...</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="row mt center">
                <button id="btnStatsLoadMore" class="btn">Load More</button>
            </div>
        `;

        // Bind events
        const posSelect = document.getElementById('statsPosFilter');
        if (posSelect) {
            posSelect.value = currentPosFilter;
            posSelect.addEventListener('change', (e) => {
                currentPosFilter = e.target.value;
                currentLimit = 20; // Reset limit on filter change
                updateTableHeaders();
                renderStatsTable();
            });
        }

        const loadMoreBtn = document.getElementById('btnStatsLoadMore');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                currentLimit += 20;
                renderStatsTable();
            });
        }

        // Initial setup
        updateTableHeaders();
        renderStatsTable();
    }

    function updateTableHeaders() {
        const thead = document.getElementById('statsTableHeader');
        if (!thead) return;

        let headers = [
            { key: 'name', label: 'Name' },
            { key: 'team', label: 'Team' },
            { key: 'pos', label: 'Pos' },
            { key: 'ovr', label: 'OVR' },
            { key: 'war', label: 'WAR' },
            { key: 'awards', label: 'Awards', noSort: true }
        ];

        // Add specific stats based on filter
        if (currentPosFilter === 'All') {
            headers.push(
                { key: 'passYd', label: 'Pass Yds' },
                { key: 'passTD', label: 'Pass TD' },
                { key: 'rushYd', label: 'Rush Yds' },
                { key: 'rushTD', label: 'Rush TD' },
                { key: 'recYd', label: 'Rec Yds' },
                { key: 'tackles', label: 'Tkl' },
                { key: 'sacks', label: 'Sk' },
                { key: 'interceptions', label: 'INT' }
            );
        } else if (currentPosFilter === 'QB') {
            headers.push(
                { key: 'passYd', label: 'Yds' },
                { key: 'passTD', label: 'TD' },
                { key: 'interceptions', label: 'INT' },
                { key: 'completionPct', label: 'Cmp%' },
                { key: 'passerRating', label: 'Rate' },
                { key: 'sacks', label: 'Sk' },
                { key: 'sackPct', label: 'Sk%' },
                { key: 'dropbacks', label: 'DrpBk' },
                { key: 'qbWins', label: 'W-L' },
                { key: 'passAtt', label: 'Att' },
                { key: 'passComp', label: 'Cmp' }
            );
        } else if (currentPosFilter === 'RB') {
            headers.push(
                { key: 'rushYd', label: 'Yds' },
                { key: 'rushTD', label: 'TD' },
                { key: 'yardsPerCarry', label: 'YPC' },
                { key: 'rushYardsPerGame', label: 'Y/G' },
                { key: 'recYd', label: 'Rec Yds' },
                { key: 'recTD', label: 'Rec TD' },
                { key: 'routesRun', label: 'Rts' },
                { key: 'dropRate', label: 'Drp%' }
            );
        } else if (['WR', 'TE'].includes(currentPosFilter)) {
            headers.push(
                { key: 'receptions', label: 'Rec' },
                { key: 'recYd', label: 'Yds' },
                { key: 'recTD', label: 'TD' },
                { key: 'targets', label: 'Tgt' },
                { key: 'drops', label: 'Drop' },
                { key: 'dropRate', label: 'Drp%' },
                { key: 'separationRate', label: 'Sep%' },
                { key: 'ratingWhenTargeted', label: 'Rt' }
            );
        } else if (currentPosFilter === 'OL') {
            headers.push(
                { key: 'sacksAllowed', label: 'Sk All' },
                { key: 'protectionGrade', label: 'Prot' },
                { key: 'runBlock', label: 'RBk' },
                { key: 'passBlock', label: 'PBk' }
            );
        } else if (['DL', 'LB'].includes(currentPosFilter)) {
            headers.push(
                { key: 'tackles', label: 'Tkl' },
                { key: 'sacks', label: 'Sk' },
                { key: 'tacklesForLoss', label: 'TFL' },
                { key: 'pressures', label: 'Pres' },
                { key: 'pressureRate', label: 'Pres%' },
                { key: 'forcedFumbles', label: 'FF' },
                { key: 'interceptions', label: 'INT' },
                { key: 'passesDefended', label: 'PD' }
            );
        } else if (['CB', 'S'].includes(currentPosFilter)) {
            headers.push(
                { key: 'interceptions', label: 'INT' },
                { key: 'passesDefended', label: 'PD' },
                { key: 'tackles', label: 'Tkl' },
                { key: 'targetsAllowed', label: 'Tgt A' },
                { key: 'completionsAllowed', label: 'Cmp A' },
                { key: 'tdsAllowed', label: 'TD A' },
                { key: 'coverageRating', label: 'Cov' }
            );
        } else if (['K', 'P'].includes(currentPosFilter)) {
            headers.push(
                { key: 'fgMade', label: 'FG' },
                { key: 'successPct', label: '%' },
                { key: 'longestFG', label: 'Lng' },
                { key: 'avgPuntYards', label: 'P Avg' }
            );
        }

        const tr = document.createElement('tr');
        headers.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h.label;
            if (!h.noSort) {
                th.classList.add('sortable');
                th.dataset.sort = h.key;
                th.addEventListener('click', () => {
                    const sortKey = h.key;
                    if (currentSort === sortKey) {
                        sortDesc = !sortDesc;
                    } else {
                        currentSort = sortKey;
                        sortDesc = true;
                        if (sortKey === 'name' || sortKey === 'team' || sortKey === 'pos') sortDesc = false;
                    }
                    renderStatsTable();
                    updateSortIcons();
                });
            }
            tr.appendChild(th);
        });
        thead.innerHTML = '';
        thead.appendChild(tr);
        updateSortIcons();
    }

    function updateSortIcons() {
        document.querySelectorAll('#statsTable th.sortable').forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
            if (th.dataset.sort === currentSort) {
                th.classList.add(sortDesc ? 'sorted-desc' : 'sorted-asc');
            }
        });
    }

    function renderStatsTable() {
        const tbody = document.getElementById('statsTableBody');
        if (!tbody) return;

        const L = window.state?.league;
        if (!L || !L.teams) {
            tbody.innerHTML = '<tr><td colspan="15">No league data available.</td></tr>';
            return;
        }

        // Collect all players
        let allPlayers = [];
        const currentYear = L.year || 2025;

        L.teams.forEach(team => {
            if (team.roster) {
                team.roster.forEach(p => {
                    const s = p.stats?.season || {};
                    // Get current year awards
                    const awards = (p.awards || []).filter(a => a.year === currentYear).map(a => a.award).join(', ');
                    const awardIcon = awards ? '🏆' : '';

                    allPlayers.push({
                        ...p,
                        teamAbbr: team.abbr || team.name.substring(0, 3).toUpperCase(),
                        // Flatten stats for easier sorting
                        passYd: s.passYd || 0,
                        passTD: s.passTD || 0,
                        rushYd: s.rushYd || 0,
                        rushTD: s.rushTD || 0,
                        recYd: s.recYd || 0,
                        recTD: s.recTD || 0,
                        tackles: s.tackles || 0,
                        sacks: s.sacks || 0,
                        interceptions: s.interceptions || 0,

                        // New Stats
                        war: s.war || 0,
                        awardsDisplay: awardIcon,
                        awardsTitle: awards,

                        passerRating: s.passerRating || 0,
                        completionPct: s.completionPct || 0,
                        sacksAllowed: s.sacksAllowed || 0,
                        sacks: s.sacks || 0, // Times sacked for QB
                        sackPct: (s.sacks && (s.passAtt || 0) + s.sacks > 0) ? ((s.sacks / ((s.passAtt || 0) + s.sacks)) * 100).toFixed(1) + '%' : '0.0%',
                        qbWins: (s.wins || 0) + '-' + (s.losses || 0),
                        passAtt: s.passAtt || 0,
                        passComp: s.passComp || 0,
                        dropbacks: s.dropbacks || (s.passAtt || 0) + (s.sacks || 0),

                        yardsPerCarry: s.yardsPerCarry || 0,
                        rushYardsPerGame: s.rushYardsPerGame || 0,

                        targets: s.targets || 0,
                        receptions: s.receptions || 0,
                        drops: s.drops || 0,
                        ratingWhenTargeted: s.ratingWhenTargeted || 0,
                        dropRate: s.dropRate || '0.0%',
                        separationRate: s.separationRate || '0.0%',
                        routesRun: s.routesRun || 0,

                        tacklesForLoss: s.tacklesForLoss || 0,
                        forcedFumbles: s.forcedFumbles || 0,
                        passesDefended: s.passesDefended || 0,
                        coverageRating: s.coverageRating || 0,
                        protectionGrade: s.protectionGrade || 0,

                        pressures: s.pressures || 0,
                        pressureRate: s.pressureRate || '0.0%',
                        targetsAllowed: s.targetsAllowed || 0,
                        completionsAllowed: s.completionsAllowed || 0,
                        yardsAllowed: s.yardsAllowed || 0,
                        tdsAllowed: s.tdsAllowed || 0,

                        fgMade: s.fgMade || 0,
                        successPct: s.successPct || 0,
                        longestFG: s.longestFG || 0,
                        avgPuntYards: s.avgPuntYards || 0
                    });
                });
            }
        });

        // Filter
        if (currentPosFilter !== 'All') {
            allPlayers = allPlayers.filter(p => p.pos === currentPosFilter);
        }

        // Sort
        allPlayers.sort((a, b) => {
            let valA = a[currentSort];
            let valB = b[currentSort];

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortDesc ? 1 : -1;
            if (valA > valB) return sortDesc ? -1 : 1;
            return 0;
        });

        // Paginate
        const displayPlayers = allPlayers.slice(0, currentLimit);

        // Render
        if (displayPlayers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="15">No players found.</td></tr>';
            return;
        }

        tbody.innerHTML = displayPlayers.map(p => {
            let cells = `
                <td><strong>${p.name}</strong></td>
                <td>${p.teamAbbr}</td>
                <td>${p.pos}</td>
                <td class="stat-ovr">${p.ovr}</td>
                <td class="stat-war" style="font-weight: bold; color: #2ecc71;">${p.war}</td>
                <td title="${p.awardsTitle}">${p.awardsDisplay}</td>
            `;

            if (currentPosFilter === 'All') {
                cells += `
                    <td class="${p.passYd > 0 ? 'highlight-stat' : ''}">${p.passYd}</td>
                    <td class="${p.passTD > 0 ? 'highlight-stat' : ''}">${p.passTD}</td>
                    <td class="${p.rushYd > 0 ? 'highlight-stat' : ''}">${p.rushYd}</td>
                    <td class="${p.rushTD > 0 ? 'highlight-stat' : ''}">${p.rushTD}</td>
                    <td class="${p.recYd > 0 ? 'highlight-stat' : ''}">${p.recYd}</td>
                    <td class="${p.tackles > 0 ? 'highlight-stat' : ''}">${p.tackles}</td>
                    <td class="${p.sacks > 0 ? 'highlight-stat' : ''}">${p.sacks}</td>
                    <td class="${p.interceptions > 0 ? 'highlight-stat' : ''}">${p.interceptions}</td>
                `;
            } else if (currentPosFilter === 'QB') {
                cells += `
                    <td>${p.passYd}</td>
                    <td>${p.passTD}</td>
                    <td>${p.interceptions}</td>
                    <td>${(p.completionPct * 100).toFixed(1)}%</td>
                    <td style="font-weight: bold;">${p.passerRating.toFixed(1)}</td>
                    <td>${p.sacks}</td>
                    <td>${p.sackPct}</td>
                    <td>${p.dropbacks}</td>
                    <td>${p.qbWins}</td>
                    <td>${p.passAtt}</td>
                    <td>${p.passComp}</td>
                `;
            } else if (currentPosFilter === 'RB') {
                cells += `
                    <td>${p.rushYd}</td>
                    <td>${p.rushTD}</td>
                    <td>${p.yardsPerCarry.toFixed(1)}</td>
                    <td>${p.rushYardsPerGame.toFixed(1)}</td>
                    <td>${p.recYd}</td>
                    <td>${p.recTD}</td>
                    <td>${p.routesRun}</td>
                    <td>${p.dropRate}</td>
                `;
            } else if (['WR', 'TE'].includes(currentPosFilter)) {
                cells += `
                    <td>${p.receptions}</td>
                    <td>${p.recYd}</td>
                    <td>${p.recTD}</td>
                    <td>${p.targets}</td>
                    <td>${p.drops}</td>
                    <td>${p.dropRate}</td>
                    <td>${p.separationRate}</td>
                    <td>${p.ratingWhenTargeted.toFixed(1)}</td>
                `;
            } else if (currentPosFilter === 'OL') {
                cells += `
                    <td>${p.sacksAllowed}</td>
                    <td>${p.protectionGrade}</td>
                    <td>${p.ratings.runBlock}</td>
                    <td>${p.ratings.passBlock}</td>
                `;
            } else if (['DL', 'LB'].includes(currentPosFilter)) {
                cells += `
                    <td>${p.tackles}</td>
                    <td>${p.sacks}</td>
                    <td>${p.tacklesForLoss}</td>
                    <td>${p.pressures}</td>
                    <td>${p.pressureRate}</td>
                    <td>${p.forcedFumbles}</td>
                    <td>${p.interceptions}</td>
                    <td>${p.passesDefended}</td>
                `;
            } else if (['CB', 'S'].includes(currentPosFilter)) {
                cells += `
                    <td>${p.interceptions}</td>
                    <td>${p.passesDefended}</td>
                    <td>${p.tackles}</td>
                    <td>${p.targetsAllowed}</td>
                    <td>${p.completionsAllowed}</td>
                    <td>${p.tdsAllowed}</td>
                    <td>${p.coverageRating.toFixed(1)}</td>
                `;
            } else if (['K', 'P'].includes(currentPosFilter)) {
                cells += `
                    <td>${p.fgMade}</td>
                    <td>${(p.successPct * 100).toFixed(1)}%</td>
                    <td>${p.longestFG}</td>
                    <td>${p.avgPuntYards}</td>
                `;
            }

            return `
            <tr class="player-row" data-player-id="${p.id}" onclick="window.viewPlayerStats('${p.id}')">
                ${cells}
            </tr>
            `;
        }).join('');

        // Hide load more if no more
        const loadMoreBtn = document.getElementById('btnStatsLoadMore');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = currentLimit >= allPlayers.length ? 'none' : 'block';
        }
    }

    // Add CSS for sort indicators
    const style = document.createElement('style');
    style.textContent = `
        th.sortable { cursor: pointer; user-select: none; }
        th.sortable:hover { background-color: rgba(255,255,255,0.05); }
        th.sortable.sorted-asc::after { content: ' ▲'; font-size: 0.8em; opacity: 0.7; }
        th.sortable.sorted-desc::after { content: ' ▼'; font-size: 0.8em; opacity: 0.7; }
        .highlight-stat { color: var(--text); font-weight: 500; }
        td { color: var(--text-muted); }
        .stat-ovr { font-weight: bold; color: var(--accent); }
    `;
    document.head.appendChild(style);

    console.log("Stats Viewer Loaded Successfully");

})();
