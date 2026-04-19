
// diagnostics.js - In-App Control Panel for Debugging & Recovery

import { saveState, loadState, clearSavedState, listSaveSlots, getSaveMetadata, setActiveSaveSlot } from './state.js';
import { getLogger } from './logger.js';
import { getActionItems } from './action-items.js';
import { finalizeGameResult, simGameStats } from './game-simulator.js';

export function renderDiagnostics() {
    console.log('Rendering Diagnostics Control Panel...');

    // Clear main content area
    const container = document.getElementById('app-content') || document.getElementById('main-content') || document.body;

    // Create the Diagnostics View
    let diagView = document.getElementById('diagnostics-view');
    if (!diagView) {
        diagView = document.createElement('div');
        diagView.id = 'diagnostics-view';
        diagView.className = 'view';
        container.appendChild(diagView);
    }

    // Hide other views
    document.querySelectorAll('.view').forEach(v => {
        if (v.id !== 'diagnostics-view') v.style.display = 'none';
    });
    diagView.style.display = 'block';

    const safe = (text) => {
        if (!text) return '';
        return text.toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    };

    // State Data
    const state = window.state || {};
    const league = state.league || {};
    const logger = getLogger();

    // 2. BUILD UI
    diagView.innerHTML = `
        <div class="card" style="max-width: 900px; margin: 20px auto; border-left: 5px solid #d97706;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h2 style="margin: 0;">🛠️ Mini Dev Tools</h2>
                <div style="display:flex; gap:10px;">
                    <button class="btn primary btn-sm" id="btnCopyReport">📋 Copy Report</button>
                    <button class="btn btn-sm" onclick="window.location.hash='#/hub'">Back to Hub</button>
                </div>
            </div>

            <div class="diag-tabs">
                <button class="tab-btn active" data-tab="console">Console</button>
                <button class="tab-btn" data-tab="state">State</button>
                <button class="tab-btn" data-tab="storage">Storage</button>
                <button class="tab-btn" data-tab="sim">Sim Tools</button>
                <button class="tab-btn" data-tab="ui">UI / Locks</button>
                <button class="tab-btn" data-tab="network">Network</button>
            </div>

            <div id="diag-content" style="min-height: 400px;">
                <!-- TABS CONTENT WILL BE RENDERED HERE -->
            </div>
        </div>
        <style>
            .diag-tabs { display: flex; gap: 5px; margin-bottom: 15px; border-bottom: 1px solid #444; padding-bottom: 5px; overflow-x: auto; }
            .tab-btn { background: transparent; border: none; color: #aaa; padding: 8px 15px; cursor: pointer; border-radius: 4px 4px 0 0; font-weight: bold; }
            .tab-btn.active { background: #333; color: white; border-bottom: 2px solid #d97706; }
            .tab-btn:hover { color: white; }
            .log-entry { font-family: monospace; font-size: 0.8rem; border-bottom: 1px solid #333; padding: 4px; display: flex; gap: 10px; }
            .log-time { color: #666; min-width: 140px; }
            .log-msg { white-space: pre-wrap; word-break: break-word; flex: 1; }
            .log-info { color: #aaa; }
            .log-warn { color: #f59e0b; }
            .log-error { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
            .kv-table td { padding: 4px 8px; border-bottom: 1px solid #333; }
            .kv-table tr:last-child td { border-bottom: none; }
            .section-header { margin-top: 0; margin-bottom: 10px; border-bottom: 1px solid #444; padding-bottom: 5px; color: #ddd; font-size: 1.1em;}
            .storage-slot { background: #222; padding: 10px; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center; border-radius: 4px; }
            .storage-slot.active { border-left: 3px solid #48bb78; }
        </style>
    `;

    // Render Helpers
    const renderConsole = (contentDiv) => {
        const logs = [...logger.logs, ...logger.errors.map(e => ({...e, level: 'error'}))].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        contentDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <div class="small muted">${logs.length} entries captured</div>
                <div>
                    <button class="btn btn-sm" id="btnClearLogs">Clear</button>
                </div>
            </div>
            <div style="background: #111; border: 1px solid #444; height: 400px; overflow-y: auto; padding: 5px;">
                ${logs.map(l => `
                    <div class="log-entry log-${l.level}">
                        <div class="log-time">${l.timestamp.split('T')[1].replace('Z','')}</div>
                        <div class="log-msg">${safe(l.message)} ${l.stack ? `<br><small>${safe(l.stack)}</small>` : ''}</div>
                    </div>
                `).join('')}
            </div>
        `;
        document.getElementById('btnClearLogs')?.addEventListener('click', () => {
            logger.clear();
            renderDiagnostics(); // Re-render to refresh list
        });
    };

    const renderState = (contentDiv) => {
        const week = league.week || 1;
        let scheduleSummary = 'No schedule';
        if (league.schedule) {
             scheduleSummary = `Week ${week}: ` + (league.resultsByWeek && league.resultsByWeek[week-1] ? `${league.resultsByWeek[week-1].length} Results` : 'Pending');
        }

        let blockers = [];
        if (state.league && state.league.teams && state.userTeamId !== undefined) {
             const userTeam = state.league.teams.find(t => t.id === state.userTeamId);
             if (userTeam) blockers = getActionItems(state.league, userTeam).blockers;
        }

        contentDiv.innerHTML = `
            <div class="grid two" style="gap:20px;">
                <div>
                    <h3 class="section-header">League Metadata</h3>
                    <table class="kv-table" style="width:100%;">
                        <tr><td>League ID</td><td>${safe(state.leagueId || 'N/A')}</td></tr>
                        <tr><td>Season</td><td>${safe(league.year)} (Season ${safe(state.season)})</td></tr>
                        <tr><td>Week</td><td>${safe(league.week)}</td></tr>
                        <tr><td>Phase</td><td>${safe(state.offseason ? 'Offseason' : 'Regular/Playoffs')}</td></tr>
                        <tr><td>User Team ID</td><td>${safe(state.userTeamId)}</td></tr>
                        <tr><td>Schedule</td><td>${scheduleSummary}</td></tr>
                    </table>
                </div>
                <div>
                    <h3 class="section-header">Game State</h3>
                    <table class="kv-table" style="width:100%;">
                        <tr><td>Last Saved</td><td>${safe(state.lastSaved)}</td></tr>
                        <tr><td>Save Slot</td><td>${safe(state.saveSlot)}</td></tr>
                        <tr><td>Game Mode</td><td>${safe(state.gameMode)}</td></tr>
                    </table>

                    <h3 class="section-header" style="margin-top:15px;">Blockers</h3>
                    ${blockers.length ? blockers.map(b => `<div style="color:#ef4444;">• ${safe(b.title)}</div>`).join('') : '<div style="color:#48bb78;">No blockers active</div>'}
                </div>
            </div>

            <div style="margin-top:20px; background:#222; padding:10px; border-radius:4px;">
                <h3 class="section-header">Weekly Plan</h3>
                <pre style="font-size:0.8rem; color:#aaa;">${JSON.stringify(league.weeklyGamePlan || {}, null, 2)}</pre>
            </div>
        `;
    };

    const renderStorage = (contentDiv) => {
        let slots = [];
        try { slots = listSaveSlots(); } catch(e) { console.error(e); }

        const activeSlot = state.saveSlot || 1;

        contentDiv.innerHTML = `
            <div style="margin-bottom:15px; display:flex; gap:10px;">
                <button class="btn primary" id="btnForceSave">Force Save Now</button>
                <button class="btn" id="btnReloadLast">Reload Last Save</button>
            </div>

            <h3 class="section-header">Save Slots</h3>
            <div>
                ${slots.map((s, i) => {
                    const slotNum = i + 1;
                    if (!s) return `
                        <div class="storage-slot ${slotNum === activeSlot ? 'active' : ''}">
                            <span>Slot ${slotNum}: Empty</span>
                            <button class="btn btn-sm" onclick="window.switchSaveSlot(${slotNum})">Switch</button>
                        </div>`;

                    return `
                        <div class="storage-slot ${slotNum === activeSlot ? 'active' : ''}">
                            <div>
                                <div><strong>Slot ${slotNum}: ${safe(s.team)}</strong> <small class="muted">(${safe(s.mode)})</small></div>
                                <div class="small muted">${safe(s.lastSaved)}</div>
                            </div>
                            <div style="display:flex; gap:5px;">
                                ${slotNum !== activeSlot ? `<button class="btn btn-sm" onclick="window.switchSaveSlot(${slotNum})">Switch</button>` : '<span class="tag">Active</span>'}
                                <button class="btn btn-sm danger" data-slot="${slotNum}" class="btnClearSlot">Clear</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        // Bind events
        document.getElementById('btnForceSave')?.addEventListener('click', () => {
            if (saveState()) alert('Saved successfully!');
            else alert('Save failed. Check console.');
            renderDiagnostics(); // refresh ts
        });

        document.getElementById('btnReloadLast')?.addEventListener('click', () => {
            if (confirm('Reload last save? Unsaved progress will be lost.')) {
                if (loadState()) window.location.reload();
                else alert('Failed to reload.');
            }
        });

        contentDiv.querySelectorAll('.btnClearSlot').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const slot = e.target.dataset.slot;
                if (confirm(`Clear Slot ${slot}? This cannot be undone.`)) {
                    clearSavedState(slot);
                    renderDiagnostics();
                }
            });
        });
    };

    const renderSim = (contentDiv) => {
        // Find current game
        let userGame = null;
        if (league.schedule) {
            const weeks = league.schedule.weeks || league.schedule; // support both structures
            const currentWeekData = Array.isArray(weeks) ? (weeks.find(w => w.weekNumber === league.week) || weeks[league.week-1]) : null;

            if (currentWeekData && currentWeekData.games) {
                userGame = currentWeekData.games.find(g => (g.home === state.userTeamId || g.home.id === state.userTeamId) || (g.away === state.userTeamId || g.away.id === state.userTeamId));
            }
        }

        let gameStatus = 'No game found';
        if (userGame) {
            const homeId = (typeof userGame.home === 'object' && userGame.home !== null) ? userGame.home.id : userGame.home;
            const awayId = (typeof userGame.away === 'object' && userGame.away !== null) ? userGame.away.id : userGame.away;
            const oppId = (homeId === state.userTeamId) ? awayId : homeId;

            const opp = league.teams ? league.teams.find(t => t.id === oppId) : null;
            gameStatus = `vs ${opp ? opp.name : 'Unknown'} (${homeId === state.userTeamId ? 'Home' : 'Away'})`;
            if (userGame.finalized) gameStatus += " [FINAL]";
        }

        contentDiv.innerHTML = `
            <div style="background:#222; padding:15px; border-radius:4px; margin-bottom:20px;">
                <h3 class="section-header">Current Week: ${league.week}</h3>
                <div style="font-size:1.2em; font-weight:bold; margin-bottom:10px;">${safe(gameStatus)}</div>

                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <button class="btn" id="btnDryRun">🧪 Dry Run Sim (Log Only)</button>
                    ${userGame && !userGame.finalized ? `<button class="btn" id="btnFinalizeWeek">🏁 Finalize Pending Week</button>` : ''}
                    <button class="btn secondary" id="btnRebuildStandings">📊 Rebuild Standings</button>
                </div>
            </div>
            <div id="simOutput" style="background:#111; padding:10px; font-family:monospace; min-height:100px; max-height:300px; overflow-y:auto; border:1px solid #444;">
                Ready...
            </div>
        `;

        const output = (msg) => {
            const el = document.getElementById('simOutput');
            if (el) el.innerHTML += `<div>${safe(msg)}</div>`;
        };

        document.getElementById('btnDryRun')?.addEventListener('click', () => {
            output('--- Starting Dry Run ---');
            if (userGame && !userGame.finalized) {
                const homeId = (typeof userGame.home === 'object' && userGame.home !== null) ? userGame.home.id : userGame.home;
                const awayId = (typeof userGame.away === 'object' && userGame.away !== null) ? userGame.away.id : userGame.away;

                const h = league.teams ? league.teams.find(t => t.id === homeId) : null;
                const a = league.teams ? league.teams.find(t => t.id === awayId) : null;

                if (h && a) {
                    const res = simGameStats(h, a, { verbose: true });
                    output(`Result: ${h.abbr} ${res.homeScore} - ${a.abbr} ${res.awayScore}`);
                    output('See Console for full details.');
                } else {
                    output('Error: Teams not found');
                }
            } else {
                output('No pending game to sim.');
            }
        });

        document.getElementById('btnFinalizeWeek')?.addEventListener('click', () => {
            if (confirm('Manually finalize the week? This will advance records and stats.')) {
                if (window.gameController && window.gameController.handleGlobalAdvance) {
                    window.gameController.handleGlobalAdvance();
                    output('Triggered Global Advance.');
                } else {
                    output('GameController not found.');
                }
            }
        });

        document.getElementById('btnRebuildStandings')?.addEventListener('click', () => {
             // Logic to rebuild standings from resultsByWeek
             if (!confirm('Recalculate all W-L-T from game results?')) return;

             league.teams.forEach(t => {
                 t.wins = 0; t.losses = 0; t.ties = 0;
                 t.record = { w:0, l:0, t:0, pf:0, pa:0 };
             });

             if (league.resultsByWeek) {
                 Object.values(league.resultsByWeek).forEach(weekResults => {
                     weekResults.forEach(r => {
                         const h = league.teams[r.home];
                         const a = league.teams[r.away];
                         if (h && a) {
                             if (r.scoreHome > r.scoreAway) { h.wins++; h.record.w++; a.losses++; a.record.l++; }
                             else if (r.scoreAway > r.scoreHome) { a.wins++; a.record.w++; h.losses++; h.record.l++; }
                             else { h.ties++; h.record.t++; a.ties++; a.record.t++; }
                         }
                     });
                 });
                 output('Standings rebuilt.');
                 saveState();
             }
        });
    };

    const renderUI = (contentDiv) => {
        const bodyClass = document.body.className;
        const modals = document.querySelectorAll('.modal');
        const activeModals = Array.from(modals).filter(m => !m.hidden && m.style.display !== 'none');
        const backdrops = document.querySelectorAll('.modal-backdrop, .nav-overlay, .error-overlay');
        const activeBackdrops = Array.from(backdrops).filter(b => !b.hidden && b.style.display !== 'none' && b.classList.contains('active'));

        contentDiv.innerHTML = `
            <div class="grid two" style="gap:20px;">
                <div>
                    <h3 class="section-header">UI State</h3>
                    <table class="kv-table" style="width:100%;">
                        <tr><td>Body Classes</td><td>${safe(bodyClass || 'None')}</td></tr>
                        <tr><td>Active Modals</td><td>${activeModals.length}</td></tr>
                        <tr><td>Active Overlays</td><td>${activeBackdrops.length}</td></tr>
                    </table>
                </div>
                <div>
                    <h3 class="section-header">Actions</h3>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <button class="btn" id="btnClearUI">🛡️ Clear UI Locks (Emergency)</button>
                        <button class="btn" id="btnProbeTap">🕵️ Probe Tap (Identify Elements)</button>
                    </div>
                </div>
            </div>

            <h3 class="section-header" style="margin-top:20px;">Active Modals</h3>
            ${activeModals.length ? activeModals.map(m => `<div style="background:#222; padding:5px;">#${m.id} (z: ${window.getComputedStyle(m).zIndex})</div>`).join('') : '<div class="muted">None</div>'}
        `;

        document.getElementById('btnClearUI')?.addEventListener('click', () => {
            if (window.resetUIInteractivity) window.resetUIInteractivity();
            // Manual cleanup just in case
            document.body.className = '';
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
            document.querySelectorAll('.modal').forEach(el => el.style.display = 'none');
            alert('UI Locks Cleared.');
            renderDiagnostics();
        });

        document.getElementById('btnProbeTap')?.addEventListener('click', () => {
            const handler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const el = e.target;
                const info = {
                    tag: el.tagName,
                    id: el.id,
                    class: el.className,
                    text: el.innerText ? el.innerText.substring(0, 30) : '',
                    zIndex: window.getComputedStyle(el).zIndex,
                    position: window.getComputedStyle(el).position
                };
                alert(`Element Probed:\n${JSON.stringify(info, null, 2)}`);
                document.removeEventListener('click', handler, true);
                document.body.style.cursor = '';
            };
            document.addEventListener('click', handler, true);
            document.body.style.cursor = 'crosshair';
            alert('Probe active. Tap any element to inspect it (One-time).');
        });
    };

    const renderNetwork = (contentDiv) => {
        const netLogs = logger.network || [];
        contentDiv.innerHTML = `
            <h3 class="section-header">Recent Network Activity (${netLogs.length})</h3>
            <div style="background: #111; border: 1px solid #444; height: 400px; overflow-y: auto; padding: 5px;">
                ${netLogs.map(l => `
                    <div class="log-entry">
                        <div class="log-time">${l.timestamp.split('T')[1].replace('Z','')}</div>
                        <div class="log-msg">
                            <span style="font-weight:bold; color:${l.status >= 400 ? '#f56565' : '#48bb78'}">${l.method} ${l.status}</span>
                            ${safe(l.url)}
                            <span class="muted">(${l.duration}ms)</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    };

    // Tab Logic
    const contentDiv = document.getElementById('diag-content');
    const tabs = document.querySelectorAll('.tab-btn');

    // Store current tab in memory to persist refresh
    let currentTab = window._diagTab || 'console';

    function switchTab(tab) {
        window._diagTab = tab;
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));

        contentDiv.innerHTML = '<div style="padding:20px; text-align:center;">Loading...</div>';

        // Use timeout to allow UI update
        setTimeout(() => {
            if (tab === 'console') {
                renderConsole(contentDiv);
            } else if (tab === 'state') {
                renderState(contentDiv);
            } else if (tab === 'storage') {
                renderStorage(contentDiv);
            } else if (tab === 'sim') {
                renderSim(contentDiv);
            } else if (tab === 'ui') {
                renderUI(contentDiv);
            } else if (tab === 'network') {
                renderNetwork(contentDiv);
            }
        }, 10);
    }

    tabs.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

    // Copy Report Logic
    document.getElementById('btnCopyReport').onclick = () => {
        const report = {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            state: {
                year: league.year,
                week: league.week,
                teamId: state.userTeamId,
                lastSaved: state.lastSaved
            },
            logs: logger.logs.slice(0, 50),
            errors: logger.errors,
            network: logger.network.slice(0, 10)
        };

        try {
            const blob = JSON.stringify(report, null, 2);
            navigator.clipboard.writeText(blob);
            alert('Debug report copied to clipboard!');
        } catch(e) {
            alert('Failed to copy report: ' + e.message);
        }
    };

    // Initialize
    switchTab(currentTab);
}
