// league-leaders.js
// Renders the League Leaders component with top stats

(function() {
    'use strict';

    window.renderLeagueLeaders = function(container) {
        if (!container) return;

        const L = window.state?.league;
        if (!L || !L.teams) {
            container.innerHTML = '<div class="card"><p class="muted">No league data available for leaders.</p></div>';
            return;
        }

        // Aggregate stats
        let passers = [];
        let rushers = [];
        let defenders = []; // Sacks
        let defendersInt = []; // Interceptions
        let defendersTkl = []; // Tackles

        L.teams.forEach(team => {
            if (!team.roster) return;
            team.roster.forEach(p => {
                const s = p.stats?.season;
                if (!s) return;

                // Passing (QBs only usually, but let's check stats)
                if (s.passYd > 0) {
                    passers.push({
                        name: p.name,
                        team: team.abbr || team.name.substring(0, 3).toUpperCase(),
                        id: p.id,
                        stat: s.passYd,
                        subStat: s.passTD,
                        label: 'Yds',
                        subLabel: 'TD'
                    });
                }

                // Rushing
                if (s.rushYd > 0) {
                    rushers.push({
                        name: p.name,
                        team: team.abbr || team.name.substring(0, 3).toUpperCase(),
                        id: p.id,
                        stat: s.rushYd,
                        subStat: s.rushTD,
                        label: 'Yds',
                        subLabel: 'TD'
                    });
                }

                // Defense - Sacks
                if (s.sacks > 0) {
                    defenders.push({
                        name: p.name,
                        team: team.abbr || team.name.substring(0, 3).toUpperCase(),
                        id: p.id,
                        stat: s.sacks,
                        subStat: s.tackles,
                        label: 'Sacks',
                        subLabel: 'Tkl'
                    });
                }

                // Defense - INTs
                if (s.interceptions > 0) {
                    defendersInt.push({
                        name: p.name,
                        team: team.abbr || team.name.substring(0, 3).toUpperCase(),
                        id: p.id,
                        stat: s.interceptions,
                        subStat: s.passesDefended,
                        label: 'INTs',
                        subLabel: 'PD'
                    });
                }

                // Defense - Tackles
                if (s.tackles > 0) {
                    defendersTkl.push({
                        name: p.name,
                        team: team.abbr || team.name.substring(0, 3).toUpperCase(),
                        id: p.id,
                        stat: s.tackles,
                        subStat: s.tacklesForLoss || 0,
                        label: 'Tkl',
                        subLabel: 'TFL'
                    });
                }
            });
        });

        // Sort and Slice
        passers.sort((a, b) => b.stat - a.stat);
        rushers.sort((a, b) => b.stat - a.stat);
        defenders.sort((a, b) => b.stat - a.stat);
        defendersInt.sort((a, b) => b.stat - a.stat);
        defendersTkl.sort((a, b) => b.stat - a.stat);

        const topPassers = passers.slice(0, 10);
        const topRushers = rushers.slice(0, 10);
        const topDefenders = defenders.slice(0, 10);
        const topInts = defendersInt.slice(0, 10);
        const topTacklers = defendersTkl.slice(0, 10);

        // Render Tabs
        const renderTabButton = (id, label, active) => `
            <button class="tab-btn ${active ? 'active' : ''}" onclick="window.switchLeaderTab('${id}')">${label}</button>
        `;

        // Render Cards
        const renderList = (id, title, list, icon, active) => `
            <div id="${id}" class="leader-tab-content" style="display: ${active ? 'block' : 'none'};">
                <div class="card leader-card">
                    <h3>${icon} ${title}</h3>
                    <div class="leader-list">
                        ${list.map((p, i) => `
                            <div class="leader-item" onclick="window.viewPlayerStats('${p.id}')">
                                <div class="rank">${i + 1}</div>
                                <div class="info">
                                    <div class="name">${p.name}</div>
                                    <div class="team-sub">${p.team}</div>
                                </div>
                                <div class="stat-primary">
                                    ${p.stat} <span class="stat-label">${p.label}</span>
                                </div>
                                <div class="stat-secondary">
                                    ${p.subStat} <span class="stat-label">${p.subLabel}</span>
                                </div>
                            </div>
                        `).join('')}
                        ${list.length === 0 ? '<div class="muted" style="padding:10px;">No stats recorded yet.</div>' : ''}
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = `
            <div class="league-leaders-component">
                <div class="leader-tabs" style="display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
                    ${renderTabButton('tab-passing', 'Passing', true)}
                    ${renderTabButton('tab-rushing', 'Rushing', false)}
                    ${renderTabButton('tab-tackles', 'Tackles', false)}
                    ${renderTabButton('tab-defense', 'Sacks', false)}
                </div>

                ${renderList('tab-passing', 'Passing Leaders', topPassers, '🏈', true)}
                ${renderList('tab-rushing', 'Rushing Leaders', topRushers, '🏃', false)}
                ${renderList('tab-tackles', 'Tackle Leaders', topTacklers, '🛑', false)}
                ${renderList('tab-defense', 'Sack Leaders', topDefenders, '🛡️', false)}
            </div>
            <style>
                .leader-tabs .tab-btn {
                    padding: 8px 16px;
                    background: var(--surface);
                    border: 1px solid var(--hairline);
                    color: var(--text-muted);
                    cursor: pointer;
                    border-radius: 4px;
                }
                .leader-tabs .tab-btn.active {
                    background: var(--accent);
                    color: white;
                    border-color: var(--accent);
                }
                .leader-card {
                    padding: 0;
                    overflow: hidden;
                }
                .leader-card h3 {
                    margin: 0;
                    padding: 15px;
                    background: var(--surface-strong);
                    border-bottom: 1px solid var(--hairline);
                }
                .leader-list {
                    padding: 0;
                }
                .leader-item {
                    display: flex;
                    align-items: center;
                    padding: 10px 15px;
                    border-bottom: 1px solid var(--hairline);
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .leader-item:last-child {
                    border-bottom: none;
                }
                .leader-item:hover {
                    background: var(--surface-hover);
                }
                .leader-item .rank {
                    width: 25px;
                    font-weight: bold;
                    color: var(--text-muted);
                }
                .leader-item .info {
                    flex: 1;
                }
                .leader-item .name {
                    font-weight: 600;
                    color: var(--text);
                }
                .leader-item .team-sub {
                    font-size: 0.8rem;
                    color: var(--text-muted);
                }
                .leader-item .stat-primary {
                    font-weight: bold;
                    font-size: 1.1rem;
                    color: var(--accent);
                    text-align: right;
                    margin-right: 15px;
                }
                .leader-item .stat-secondary {
                    font-size: 0.9rem;
                    color: var(--text-muted);
                    text-align: right;
                    width: 40px;
                }
                .stat-label {
                    font-size: 0.7rem;
                    font-weight: normal;
                    opacity: 0.7;
                    display: block;
                }
            </style>
        `;
    };

    // Global tab switcher
    window.switchLeaderTab = function(tabId) {
        // Hide all contents
        document.querySelectorAll('.leader-tab-content').forEach(el => el.style.display = 'none');
        // Show target
        const target = document.getElementById(tabId);
        if (target) target.style.display = 'block';

        // Update buttons
        const tabs = document.querySelector('.leader-tabs');
        if (tabs) {
            tabs.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.getAttribute('onclick').includes(tabId)) {
                    btn.classList.add('active');
                }
            });
        }
    };

    console.log('✅ League Leaders component loaded');
})();
