// stats-viewer.js
// League Leaders and Stats Page

(function() {
    'use strict';

    let currentSort = 'ovr';
    let sortDesc = true;
    let currentPosFilter = 'All';
    let currentLimit = 50;

    window.renderStatsPage = function() {
        const statsContainer = document.getElementById('stats');
        if (!statsContainer) return;

        statsContainer.innerHTML = `
            <div class="card">
                <div class="row">
                    <h2>League Stats & Leaders</h2>
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
                        <thead>
                            <tr>
                                <th data-sort="name" class="sortable">Name</th>
                                <th data-sort="team" class="sortable">Team</th>
                                <th data-sort="pos" class="sortable">Pos</th>
                                <th data-sort="ovr" class="sortable">OVR</th>
                                <th data-sort="passYd" class="sortable">Pass Yds</th>
                                <th data-sort="passTD" class="sortable">Pass TD</th>
                                <th data-sort="rushYd" class="sortable">Rush Yds</th>
                                <th data-sort="rushTD" class="sortable">Rush TD</th>
                                <th data-sort="recYd" class="sortable">Rec Yds</th>
                                <th data-sort="recTD" class="sortable">Rec TD</th>
                                <th data-sort="tackles" class="sortable">Tackles</th>
                                <th data-sort="sacks" class="sortable">Sacks</th>
                                <th data-sort="interceptions" class="sortable">INT</th>
                            </tr>
                        </thead>
                        <tbody id="statsTableBody">
                            <tr><td colspan="13">Loading stats...</td></tr>
                        </tbody>
                    </table>
                </div>

                <div class="row mt center">
                    <button id="btnStatsLoadMore" class="btn">Load More</button>
                </div>
            </div>
        `;

        // Bind events
        const posSelect = document.getElementById('statsPosFilter');
        if (posSelect) {
            posSelect.value = currentPosFilter;
            posSelect.addEventListener('change', (e) => {
                currentPosFilter = e.target.value;
                currentLimit = 50; // Reset limit on filter change
                renderStatsTable();
            });
        }

        const loadMoreBtn = document.getElementById('btnStatsLoadMore');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                currentLimit += 50;
                renderStatsTable();
            });
        }

        document.querySelectorAll('#statsTable th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const sortKey = th.dataset.sort;
                if (currentSort === sortKey) {
                    sortDesc = !sortDesc;
                } else {
                    currentSort = sortKey;
                    sortDesc = true; // Default to desc for most stats
                    if (sortKey === 'name' || sortKey === 'team' || sortKey === 'pos') sortDesc = false;
                }
                renderStatsTable();
                updateSortIcons();
            });
        });

        // Initial render
        updateSortIcons();
        renderStatsTable();
    };

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
            tbody.innerHTML = '<tr><td colspan="13">No league data available.</td></tr>';
            return;
        }

        // Collect all players
        let allPlayers = [];
        L.teams.forEach(team => {
            if (team.roster) {
                team.roster.forEach(p => {
                    allPlayers.push({
                        ...p,
                        teamAbbr: team.abbr || team.name.substring(0, 3).toUpperCase(),
                        // Flatten stats for easier sorting
                        passYd: p.stats?.season?.passYd || 0,
                        passTD: p.stats?.season?.passTD || 0,
                        rushYd: p.stats?.season?.rushYd || 0,
                        rushTD: p.stats?.season?.rushTD || 0,
                        recYd: p.stats?.season?.recYd || 0,
                        recTD: p.stats?.season?.recTD || 0,
                        tackles: p.stats?.season?.tackles || 0,
                        sacks: p.stats?.season?.sacks || 0,
                        interceptions: p.stats?.season?.interceptions || 0
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
            tbody.innerHTML = '<tr><td colspan="13">No players found.</td></tr>';
            return;
        }

        tbody.innerHTML = displayPlayers.map(p => `
            <tr class="player-row" data-player-id="${p.id}" onclick="window.viewPlayerStats('${p.id}')">
                <td><strong>${p.name}</strong></td>
                <td>${p.teamAbbr}</td>
                <td>${p.pos}</td>
                <td class="stat-ovr">${p.ovr}</td>
                <td class="${p.passYd > 0 ? 'highlight-stat' : ''}">${p.passYd}</td>
                <td class="${p.passTD > 0 ? 'highlight-stat' : ''}">${p.passTD}</td>
                <td class="${p.rushYd > 0 ? 'highlight-stat' : ''}">${p.rushYd}</td>
                <td class="${p.rushTD > 0 ? 'highlight-stat' : ''}">${p.rushTD}</td>
                <td class="${p.recYd > 0 ? 'highlight-stat' : ''}">${p.recYd}</td>
                <td class="${p.recTD > 0 ? 'highlight-stat' : ''}">${p.recTD}</td>
                <td class="${p.tackles > 0 ? 'highlight-stat' : ''}">${p.tackles}</td>
                <td class="${p.sacks > 0 ? 'highlight-stat' : ''}">${p.sacks}</td>
                <td class="${p.interceptions > 0 ? 'highlight-stat' : ''}">${p.interceptions}</td>
            </tr>
        `).join('');

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

})();
