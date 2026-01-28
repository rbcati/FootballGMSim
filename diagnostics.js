
// diagnostics.js - In-App Control Panel for Debugging & Recovery

import { saveState } from './state.js';

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

    // Hide other views (standard behavior)
    document.querySelectorAll('.view').forEach(v => {
        if (v.id !== 'diagnostics-view') v.style.display = 'none';
    });
    diagView.style.display = 'block';

    // 1. GATHER DATA
    const state = window.state || {};
    const league = state.league || {};

    // Game Stats Logic
    let currentWeekStats = { total: 0, final: 0, pending: 0 };
    let lastFinalizedGame = 'None';

    if (league.schedule) {
        const weekNum = league.week || 1;
        let weekGames = [];

        // Handle different schedule structures
        if (Array.isArray(league.schedule)) {
            // Flat array or array of weeks?
            if (league.schedule[0] && league.schedule[0].games) {
                const w = league.schedule.find(w => w.weekNumber === weekNum || w.week === weekNum) || league.schedule[weekNum - 1];
                if (w) weekGames = w.games;
            } else if (league.schedule[weekNum]) {
                weekGames = league.schedule[weekNum]; // Legacy
            }
        } else if (league.schedule.weeks) {
            const w = league.schedule.weeks.find(w => w.weekNumber === weekNum) || league.schedule.weeks[weekNum - 1];
            if (w) weekGames = w.games;
        }

        if (Array.isArray(weekGames)) {
            currentWeekStats.total = weekGames.length;
            weekGames.forEach(g => {
                if (g.finalized || (g.homeScore !== undefined && g.awayScore !== undefined)) {
                    currentWeekStats.final++;
                    // Track last finalized
                    if (g.gameId) lastFinalizedGame = `ID: ${g.gameId} (W${weekNum})`;
                } else {
                    currentWeekStats.pending++;
                }
            });
        }
    }

    // Storage Check
    let storageStatus = 'Unknown';
    let storageClass = 'text-muted';
    let storageKeys = [];
    try {
        const testKey = '__test__';
        localStorage.setItem(testKey, '1');
        localStorage.removeItem(testKey);
        storageStatus = 'Available / Writable';
        storageClass = 'text-success';

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('football_gm') || key.startsWith('nflGM'))) {
                storageKeys.push(key);
            }
        }
    } catch (e) {
        storageStatus = 'Blocked / Full / Error';
        storageClass = 'text-danger';
    }

    const storageUsage = estimateStorageUsage();

    // UI Lock Check
    const modalsOpen = document.querySelectorAll('.modal').length;
    const bodyClasses = document.body.className;
    const backdrops = document.querySelectorAll('.modal-backdrop').length;

    // Error Log
    const errors = window._errorLog || [];

    // Helper for safe HTML
    const safe = (text) => {
        if (!text) return '';
        return text.toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    };

    // 2. BUILD UI
    diagView.innerHTML = `
        <div class="card" style="max-width: 800px; margin: 20px auto; border-left: 5px solid #d97706;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0;">🛠️ Diagnostics & Control Panel</h2>
                <button class="btn" onclick="window.location.hash='#/hub'">Back to Hub</button>
            </div>

            <p class="muted">Use this panel to diagnose issues, check save data integrity, or recover from crashes (especially on iOS).</p>

            <div class="grid two" style="gap: 20px;">
                <!-- STATE HEALTH -->
                <div class="diag-section">
                    <h3>📊 State Health</h3>
                    <table class="table table-sm">
                        <tr><td>League Loaded:</td> <td>${league.teams ? '✅ Yes' : '❌ No'}</td></tr>
                        <tr><td>League Name:</td> <td>${safe(state.leagueName || 'N/A')}</td></tr>
                        <tr><td>Week / Year:</td> <td>${safe(league.week || '-')} / ${safe(league.year || '-')}</td></tr>
                        <tr><td>User Team:</td> <td>${league.teams ? safe(league.teams[state.userTeamId]?.name || state.userTeamId) : '-'}</td></tr>
                        <tr><td>Games (W${safe(league.week)}):</td> <td>${currentWeekStats.total} Total / ${currentWeekStats.final} Final / ${currentWeekStats.pending} Pending</td></tr>
                        <tr><td>Last Finalized:</td> <td>${safe(lastFinalizedGame)}</td></tr>
                        <tr><td>Save Slot:</td> <td>${safe(state.saveSlot || 'Default')}</td></tr>
                        <tr><td>Last Saved:</td> <td>${safe(state.lastSaved ? new Date(state.lastSaved).toLocaleString() : 'Never')}</td></tr>
                    </table>
                </div>

                <!-- STORAGE HEALTH -->
                <div class="diag-section">
                    <h3>💾 Storage Health</h3>
                    <table class="table table-sm">
                        <tr><td>Status:</td> <td class="${storageClass}">${storageStatus}</td></tr>
                        <tr><td>Usage (Est):</td> <td>${storageUsage}</td></tr>
                        <tr><td>Keys Found:</td> <td>${localStorage.length} (Listed below)</td></tr>
                    </table>
                    <div style="max-height: 100px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 5px; font-size: 0.75rem; margin-top: 5px;">
                        ${storageKeys.length ? storageKeys.map(k => `<div>${safe(k)}</div>`).join('') : 'No game keys found'}
                    </div>
                    <div style="margin-top: 10px;">
                        <button class="btn primary btn-sm" id="btnForceSave">Force Save Now</button>
                    </div>
                </div>
            </div>

            <hr style="border-color: var(--hairline); margin: 20px 0;">

            <!-- UI LOCKS & RECOVERY -->
            <div class="diag-section">
                <h3>🔓 UI & Recovery</h3>
                <div style="display: flex; gap: 15px; margin-bottom: 15px; align-items: center; flex-wrap: wrap;">
                    <div class="status-pill ${modalsOpen > 0 ? 'danger' : 'success'}">Modals: ${modalsOpen}</div>
                    <div class="status-pill ${backdrops > 0 ? 'danger' : 'success'}">Backdrops: ${backdrops}</div>
                    <code style="font-size: 0.8rem; background: var(--surface-secondary); padding: 4px;">Body: ${safe(bodyClasses || 'none')}</code>
                </div>

                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button class="btn secondary" id="btnClearLocks">🛡️ Clear UI Locks</button>
                    <button class="btn secondary" id="btnReloadApp">🔄 Reload App State</button>
                    <button class="btn secondary" id="btnHardReload" onclick="window.location.reload(true)">⚠️ Hard Refresh</button>
                </div>
            </div>

            <hr style="border-color: var(--hairline); margin: 20px 0;">

            <!-- DATA MANAGEMENT -->
            <div class="diag-section">
                <h3>📤 Data Management</h3>
                <div style="margin-bottom: 10px;">
                    <button class="btn" id="btnExportSave">Export Save to JSON</button>
                    <button class="btn" id="btnImportSave">Import Save from JSON</button>
                </div>
                <div id="exportArea" style="display: none;">
                    <p class="muted small">Copy this text to save externally, or paste valid JSON here to import.</p>
                    <textarea id="saveDataText" style="width: 100%; height: 150px; background: #111; color: #fff; font-family: monospace; font-size: 0.8rem; border: 1px solid #444; padding: 10px;"></textarea>
                    <div style="text-align: right; margin-top: 5px;">
                        <button class="btn primary btn-sm" id="btnConfirmImport">Load Data</button>
                        <button class="btn btn-sm" onclick="document.getElementById('exportArea').style.display='none'">Close</button>
                    </div>
                </div>
            </div>

            <hr style="border-color: var(--hairline); margin: 20px 0;">

            <!-- ERROR LOG -->
            <div class="diag-section">
                <h3>⚠️ Error Log (${errors.length})</h3>
                <div style="background: #111; border: 1px solid #444; border-radius: 4px; padding: 10px; max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 0.8rem;">
                    ${errors.length > 0
                        ? errors.map(e => `
                            <div style="border-bottom: 1px solid #333; padding-bottom: 5px; margin-bottom: 5px;">
                                <div style="color: #f87171;">${safe(e.timestamp)}</div>
                                <div>${safe(e.message)}</div>
                                ${e.stack ? `<div style="color: #666; font-size: 0.75rem; white-space: pre-wrap;">${safe(e.stack.split('\n')[0])}...</div>` : ''}
                            </div>
                        `).join('')
                        : '<span class="text-muted">No errors logged since last reload.</span>'
                    }
                </div>
            </div>

        </div>

        <style>
            .diag-section h3 { margin-top: 0; font-size: 1.1rem; color: var(--text-highlight); border-bottom: 1px solid var(--hairline); padding-bottom: 5px; }
            .status-pill { padding: 4px 8px; border-radius: 12px; font-size: 0.85rem; font-weight: bold; background: #333; }
            .status-pill.success { background: #064e3b; color: #6ee7b7; }
            .status-pill.danger { background: #7f1d1d; color: #fca5a5; }
            .text-success { color: #48bb78; }
            .text-danger { color: #f56565; }
        </style>
    `;

    // 3. BIND EVENTS

    // Force Save
    document.getElementById('btnForceSave').onclick = async () => {
        const btn = document.getElementById('btnForceSave');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
            let success = false;
            // Try modern save
            if (window.saveGame) {
                window.saveGame();
                success = true;
            } else if (window.saveGameState) {
                const result = await window.saveGameState();
                success = result.success;
            } else if (saveState) {
                success = saveState();
            }

            if (success) {
                alert('Save successful!');
            } else {
                alert('Save reported failure. Check logs.');
            }
        } catch (e) {
            alert('Save crashed: ' + e.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Force Save Now';
            renderDiagnostics(); // Refresh data
        }
    };

    // Clear Locks
    document.getElementById('btnClearLocks').onclick = () => {
        document.body.className = document.body.className.replace(/modal-open|no-scroll|overflow-hidden/g, '');
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.querySelectorAll('.modal').forEach(el => {
             // Only remove dynamic modals, hide others
             if (el.id === 'error-boundary-modal' || !el.id) el.remove();
             else el.style.display = 'none';
        });

        // Reset specific known UI blockers from memory
        if (window.resetUIInteractivity) window.resetUIInteractivity();

        alert('UI Locks cleared. Try scrolling or clicking now.');
        renderDiagnostics();
    };

    // Reload App
    document.getElementById('btnReloadApp').onclick = async () => {
        if (window.gameController && window.gameController.init) {
            alert('Re-initializing game controller...');
            await window.gameController.init();
            window.location.hash = '#/hub';
        } else {
            alert('Game controller not found. Reloading page...');
            window.location.reload();
        }
    };

    // Export Save
    document.getElementById('btnExportSave').onclick = () => {
        const area = document.getElementById('exportArea');
        const textArea = document.getElementById('saveDataText');
        area.style.display = 'block';

        if (window.state) {
            try {
                // Pretty print for readability, though larger
                textArea.value = JSON.stringify(window.state, null, 2);
                textArea.select();
                // document.execCommand('copy'); // Optional auto-copy
                // alert('Save data copied to clipboard (if supported). You can also copy from the box.');
            } catch (e) {
                textArea.value = 'Error generating JSON: ' + e.message;
            }
        } else {
            textArea.value = 'No state found to export.';
        }
    };

    // Import Save
    document.getElementById('btnImportSave').onclick = () => {
        const area = document.getElementById('exportArea');
        const textArea = document.getElementById('saveDataText');
        area.style.display = 'block';
        textArea.value = '';
        textArea.placeholder = 'Paste JSON save data here...';
    };

    document.getElementById('btnConfirmImport').onclick = () => {
        const textArea = document.getElementById('saveDataText');
        const json = textArea.value.trim();
        if (!json) return;

        if (!confirm('WARNING: This will overwrite your current game state with the pasted data. This cannot be undone. Are you sure?')) {
            return;
        }

        try {
            const parsed = JSON.parse(json);
            if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON');

            window.state = parsed;

            // Force save immediately to persist
            if (window.saveGame) window.saveGame();
            else if (saveState) saveState();

            alert('Import successful! Reloading...');
            window.location.reload();
        } catch (e) {
            alert('Import failed: ' + e.message);
        }
    };
}

function estimateStorageUsage() {
    let total = 0;
    for (let x in localStorage) {
        if (localStorage.hasOwnProperty(x)) {
            total += ((localStorage[x].length + x.length) * 2);
        }
    }
    return (total / 1024).toFixed(2) + " KB";
}
