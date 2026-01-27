import { renderCoachingStats, renderCoaching } from './coaching.js';
import { init as initState, loadState, saveState, hookAutoSave, clearSavedState, setActiveSaveSlot } from './state.js';

// Update Checker System
async function checkForUpdates() {
    const CURRENT_VERSION = "1.0.1"; // Hardcode this per patch
    try {
        const response = await fetch('version.json', { cache: "no-store" });
        const data = await response.json();

        if (data.version !== CURRENT_VERSION) {
            console.log("New patch detected! Reloading...");
            // Force a hard reload from the server
            window.location.reload(true);
        }
    } catch (e) {
        console.log("Offline or version check failed");
    }
}

// Check for updates whenever the app is resumed or opened
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdates();
});

// Check on initial load
checkForUpdates();

/**
 * Enhanced Main Game Controller with improved performance and error handling
 *
 * This patched version addresses two issues that prevented saved games from loading
 * correctly after recent refactoring. First, it standardises the return shape of
 * the save and load helpers so callers can reliably inspect a `success` flag.
 * Second, it relaxes the load condition so that any saved state with a league
 * present is considered onboarded. This allows older saves (which may lack
 * an explicit `onboarded` flag) to be loaded and migrated to the new state
 * schema instead of forcing players through the onboarding flow again.
 */

class GameController {
    constructor() {
        this.domCache = new Map();
        this.eventListeners = new Map();
        this.initialized = false;
        this.initPromise = null;
    }

    // --- ENHANCED DOM OPERATIONS ---
    getElement(id, cache = true) {
        if (cache && this.domCache.has(id)) {
            const element = this.domCache.get(id);
            // Verify element is still in DOM
            if (document.contains(element)) {
                return element;
            }
            this.domCache.delete(id);
        }
        const element = document.getElementById(id);
        if (element && cache) {
            this.domCache.set(id, element);
        }
        return element;
    }

    clearDOMCache() {
        this.domCache.clear();
    }

    // --- IMPROVED STATUS SYSTEM ---
    setStatus(msg, type = 'info', duration = 4000) {
        const statusEl = this.getElement('statusMsg');
        if (!statusEl) {
            console.warn('Status element not found:', msg);
            return;
        }
        // Clear any existing timeout
        if (statusEl.timeoutId) {
            clearTimeout(statusEl.timeoutId);
        }
        statusEl.textContent = msg;
        statusEl.className = `status-message status-${type}`;
        statusEl.style.display = 'block';
        if (duration > 0) {
            statusEl.timeoutId = setTimeout(() => {
                if (statusEl.textContent === msg) {
                    statusEl.style.display = 'none';
                    statusEl.className = 'status-message';
                }
                statusEl.timeoutId = null;
            }, duration);
        }
        // Also log important messages
        if (type === 'error') {
            console.error('Status Error:', msg);
        } else if (type === 'warning') {
            console.warn('Status Warning:', msg);
        }
    }

    // --- ENHANCED HELPER FUNCTIONS ---
    listByMode(mode) {
        if (!window.Teams || typeof window.Teams !== 'object') {
            console.warn('Teams data not available');
            return [];
        }
        const teams = mode === 'real' ? window.Teams.real : window.Teams.fictional;
        return Array.isArray(teams) ? teams : [];
    }

    applyTheme(theme) {
        const isLight = theme === 'light';
        document.body.classList.toggle('theme-light', isLight);
        document.body.classList.toggle('theme-dark', !isLight);
    }

    async switchSaveSlot(slot) {
        const normalized = setActiveSaveSlot ? setActiveSaveSlot(slot) : slot;
        this.setStatus(`Switching to slot ${normalized}...`, 'info');
        const loadResult = await this.loadGameState();
        if (loadResult.success && loadResult.gameData) {
            window.state = loadResult.gameData;
            window.state.saveSlot = normalized;
            this.applyTheme(window.state.theme || 'dark');
            if (typeof window.renderSaveSlotInfo === 'function') window.renderSaveSlotInfo();
            if (typeof window.renderSaveDataManager === 'function') window.renderSaveDataManager();
            if (typeof window.updateCapSidebar === 'function') window.updateCapSidebar();
            this.router();
            this.setStatus(`Loaded save slot ${normalized}`, 'success');
        } else {
            // Use imported initState
            if (initState) {
                window.state = initState();
                window.state.saveSlot = normalized;
            }
            if (typeof window.renderSaveSlotInfo === 'function') window.renderSaveSlotInfo();
            await this.openOnboard();
            this.setStatus(`Slot ${normalized} is empty — create a new league.`, 'info');
        }
    }

    // --- ROSTER MANAGEMENT ---
    async renderRoster() {
        // Delegate to the ui.js implementation
        if (window.renderRoster && typeof window.renderRoster === 'function') {
            window.renderRoster();
        } else {
            console.warn('renderRoster not available from ui.js');
        }
    }

    // --- HUB RENDERING ---
    async renderHub() {
        try {
            console.log('Rendering hub...');
            const hubContainer = this.getElement('hub');
            if (!hubContainer) {
                console.warn('Hub container not found');
                return;
            }
            // Enhanced hub content with simulate league button
            const L = window.state?.league;
            const userTeamId = window.state?.userTeamId || 0;
            const userTeam = L?.teams?.[userTeamId];
            const isOffseason = window.state?.offseason === true;

            // Update team ratings to ensure header is fresh
            if (userTeam && window.updateTeamRatings) {
                window.updateTeamRatings(userTeam);
            }

            // Find next game for user team FIRST (for header)
            let nextGame = null;
            let opponent = null;
            let isHome = false;
            let currentWeek = L.week || 1;

            if (!isOffseason) {
                let scheduleWeeks = L.schedule?.weeks || L.schedule || [];

                // Find current week data
                const weekData = Array.isArray(scheduleWeeks) ?
                    (scheduleWeeks.find(w => w && (w.weekNumber === currentWeek || w.week === currentWeek)) || scheduleWeeks[currentWeek - 1]) : null;

                if (weekData && weekData.games) {
                    nextGame = weekData.games.find(g => g.home === userTeamId || g.away === userTeamId);
                    if (nextGame) {
                        isHome = nextGame.home === userTeamId;
                        const oppId = isHome ? nextGame.away : nextGame.home;
                        opponent = L.teams[oppId];
                    }
                }
            }

            // --- HEADER DASHBOARD GENERATION ---
            let headerDashboardHTML = '';
            if (userTeam && L) {
                // 1. Record & Standing
                const wins = userTeam.wins ?? userTeam.record?.w ?? 0;
                const losses = userTeam.losses ?? userTeam.record?.l ?? 0;
                const ties = userTeam.ties ?? userTeam.record?.t ?? 0;

                // Division Rank
                const divTeams = L.teams.filter(t => t.conf === userTeam.conf && t.div === userTeam.div);
                divTeams.sort((a, b) => {
                    const wa = a.wins ?? a.record?.w ?? 0;
                    const wb = b.wins ?? b.record?.w ?? 0;
                    if (wa !== wb) return wb - wa;
                    return 0; // Simplified tie-breaker
                });
                const divRank = divTeams.findIndex(t => t.id === userTeam.id) + 1;
                const divSuffix = divRank === 1 ? 'st' : divRank === 2 ? 'nd' : divRank === 3 ? 'rd' : 'th';

                // Conf Rank
                const confTeams = L.teams.filter(t => t.conf === userTeam.conf);
                confTeams.sort((a, b) => {
                    const wa = a.wins ?? a.record?.w ?? 0;
                    const wb = b.wins ?? b.record?.w ?? 0;
                    if (wa !== wb) return wb - wa;
                    return 0;
                });
                const confRank = confTeams.findIndex(t => t.id === userTeam.id) + 1;
                const confSuffix = confRank === 1 ? 'st' : confRank === 2 ? 'nd' : confRank === 3 ? 'rd' : 'th';

                // 2. Overalls
                const ovr = userTeam.ratings?.overall ?? userTeam.overallRating ?? 0;
                const offOvr = userTeam.ratings?.offense?.overall ?? userTeam.offensiveRating ?? 0;
                const defOvr = userTeam.ratings?.defense?.overall ?? userTeam.defensiveRating ?? 0;

                // 3. League Ranks (Off/Def)
                // Sort all teams by Points For (Offense Proxy) and Points Against (Defense Proxy)
                const sortedByPF = [...L.teams].sort((a, b) => (b.ptsFor ?? b.record?.pf ?? 0) - (a.ptsFor ?? a.record?.pf ?? 0));
                const offRank = sortedByPF.findIndex(t => t.id === userTeam.id) + 1;

                // For Defense, lower points against is better
                const sortedByPA = [...L.teams].sort((a, b) => (a.ptsAgainst ?? a.record?.pa ?? 0) - (b.ptsAgainst ?? b.record?.pa ?? 0));
                const defRank = sortedByPA.findIndex(t => t.id === userTeam.id) + 1;

                headerDashboardHTML = `
                    <div class="card mb-4" style="background: linear-gradient(to right, #1a202c, #2d3748); color: white; border-left: 4px solid var(--accent);">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 15px;">

                            <!-- Record, Standing & Ratings (Combined Column 1) -->
                            <div style="flex: 1; min-width: 160px;">
                                <div style="font-size: 2rem; font-weight: 800; line-height: 1;">${wins}-${losses}-${ties}</div>
                                <div style="font-size: 0.9rem; opacity: 0.8; margin-top: 5px;">
                                    ${divRank}${divSuffix} in Div • ${confRank}${confSuffix} in Conf
                                </div>
                                <div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">
                                    <div class="ovr-badge" style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 4px; font-weight: 700;">${ovr} OVR</div>
                                    <div style="font-size: 0.8rem; opacity: 0.7;">OFF ${offOvr} • DEF ${defOvr}</div>
                                </div>
                            </div>

                            <!-- Next Opponent (Middle Column) -->
                            <div style="flex: 1; min-width: 200px; text-align: center; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 8px;">
                                ${opponent ? (() => {
                                    // Head to Head Logic
                                    const h2h = userTeam.headToHead?.[opponent.id] || { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, streak: 0 };
                                    const streakText = h2h.streak > 0 ? `Won ${h2h.streak}` : h2h.streak < 0 ? `Lost ${Math.abs(h2h.streak)}` : 'None';
                                    const streakColor = h2h.streak > 0 ? '#48bb78' : h2h.streak < 0 ? '#f56565' : 'white';

                                    return `
                                    <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; opacity: 0.7;">Week ${currentWeek}</div>
                                    <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 4px;">
                                        ${isHome ? 'vs' : '@'} ${opponent.abbr}
                                        <span style="font-size: 0.9rem; opacity: 0.7; font-weight: 400;">(${opponent.record?.w || 0}-${opponent.record?.l || 0})</span>
                                    </div>
                                    <div style="font-size: 0.85rem; display: flex; justify-content: space-around;">
                                        <div>Record: ${h2h.wins}-${h2h.losses}${h2h.ties > 0 ? '-'+h2h.ties : ''}</div>
                                        <div style="color: ${streakColor};">${streakText}</div>
                                    </div>
                                    <div style="font-size: 0.8rem; opacity: 0.7; margin-top: 2px;">
                                        PF: ${h2h.pf} | PA: ${h2h.pa}
                                    </div>
                                    ${!isOffseason ? '<button class="btn btn-sm primary mt-2" id="btnSimWeekHero" style="width: 100%;">Play Game</button>' : ''}
                                    `;
                                })() : `
                                    <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; opacity: 0.7;">Week ${currentWeek}</div>
                                    <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 10px;">BYE WEEK</div>
                                    ${!isOffseason ? '<button class="btn btn-sm primary mt-2" id="btnSimWeekHero" style="width: 100%;">Simulate Bye</button>' : ''}
                                `}
                            </div>

                            <!-- Rankings -->
                            <div style="flex: 1; min-width: 140px; text-align: right;">
                                <div style="margin-bottom: 4px;">
                                    <span style="opacity: 0.7; font-size: 0.85rem;">Offense Rank:</span>
                                    <span style="font-weight: 700; color: ${offRank <= 5 ? '#48bb78' : 'white'};">#${offRank}</span>
                                </div>
                                <div>
                                    <span style="opacity: 0.7; font-size: 0.85rem;">Defense Rank:</span>
                                    <span style="font-weight: 700; color: ${defRank <= 5 ? '#48bb78' : 'white'};">#${defRank}</span>
                                </div>
                                <div style="font-size: 0.75rem; opacity: 0.5; margin-top: 4px;">(Based on Pts)</div>
                            </div>

                        </div>
                    </div>
                `;
            }

            // --- NEWS SECTION ---
            let newsHTML = '';
            if (L.news && L.news.length > 0) {
                const recentNews = L.news.slice(0, 3);
                newsHTML = `
                    <div class="card mb-4" id="hubNews">
                        <h3>Latest News</h3>
                        <div class="news-list">
                            ${recentNews.map(item => `
                                <div class="news-item" style="border-bottom: 1px solid rgba(255,255,255,0.1); padding: 10px 0;">
                                    <div style="font-size: 0.8rem; color: var(--text-muted); display: flex; justify-content: space-between;">
                                        <span class="news-type tag">${item.type.toUpperCase()}</span>
                                        <span>Week ${item.week}, ${item.year}</span>
                                    </div>
                                    <div style="font-weight: 600; font-size: 1.1rem; margin: 4px 0;">${item.headline}</div>
                                    <div style="font-size: 0.9rem; opacity: 0.8;">${item.story}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
            
            let divisionStandingsHTML = '';
            if (userTeam && L) {
                // Get user's division
                const userConf = userTeam.conf;
                const userDiv = userTeam.div;
                const divisionName = ['East', 'North', 'South', 'West'][userDiv] || 'Unknown';
                const confName = userConf === 0 ? 'AFC' : 'NFC';
                
                // Get all teams in user's division
                // Support both team.record (legacy) and team.wins/losses/ties (current) formats
                const divTeams = L.teams
                    .filter(t => t.conf === userConf && t.div === userDiv)
                    .map(team => {
                        // Normalize record data - support both formats
                        const wins = team.wins ?? team.record?.w ?? 0;
                        const losses = team.losses ?? team.record?.l ?? 0;
                        const ties = team.ties ?? team.record?.t ?? 0;
                        const pf = team.ptsFor ?? team.pointsFor ?? team.record?.pf ?? 0;
                        const pa = team.ptsAgainst ?? team.pointsAgainst ?? team.record?.pa ?? 0;
                        return {
                            ...team,
                            _normalizedRecord: { wins, losses, ties, pf, pa }
                        };
                    })
                    .sort((a, b) => {
                        const ra = a._normalizedRecord;
                        const rb = b._normalizedRecord;
                        const totalGamesA = ra.wins + ra.losses + ra.ties;
                        const totalGamesB = rb.wins + rb.losses + rb.ties;
                        const winPctA = totalGamesA > 0 ? (ra.wins + ra.ties * 0.5) / totalGamesA : 0;
                        const winPctB = totalGamesB > 0 ? (rb.wins + rb.ties * 0.5) / totalGamesB : 0;
                        if (Math.abs(winPctB - winPctA) > 0.001) return winPctB - winPctA;
                        const diffA = ra.pf - ra.pa;
                        const diffB = rb.pf - rb.pa;
                        return diffB - diffA;
                    });
                
                divisionStandingsHTML = `
                    <div class="card mt">
                        <h3>${confName} ${divisionName} Division</h3>
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Team</th>
                                    <th>W</th>
                                    <th>L</th>
                                    <th>T</th>
                                    <th>Win %</th>
                                    <th>PF</th>
                                    <th>PA</th>
                                    <th>Diff</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${divTeams.map(team => {
                                    const record = team._normalizedRecord;
                                    const totalGames = record.wins + record.losses + record.ties;
                                    const winPct = totalGames > 0 ? ((record.wins + record.ties * 0.5) / totalGames).toFixed(3) : '0.000';
                                    const isUserTeam = team.id === userTeamId;
                                    const rowClass = isUserTeam ? 'highlight' : '';
                                    return `
                                        <tr class="${rowClass}">
                                            <td><strong>${team.abbr || team.name}</strong>${isUserTeam ? ' (You)' : ''}</td>
                                            <td>${record.wins}</td>
                                            <td>${record.losses}</td>
                                            <td>${record.ties}</td>
                                            <td>${winPct}</td>
                                            <td>${record.pf}</td>
                                            <td>${record.pa}</td>
                                            <td>${record.pf - record.pa > 0 ? '+' : ''}${record.pf - record.pa}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }
            
            hubContainer.innerHTML = `
                ${headerDashboardHTML}
                ${newsHTML}
                <div class="card">
                    <h2>Team Hub</h2>
                    <div class="grid two">
                        <div>
                            <h3>Quick Actions</h3>
                            <div class="actions" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 8px;">
                                <button class="btn" onclick="location.hash='#/roster'" style="flex-direction: column; padding: 12px; text-align: center; height: 80px; justify-content: center;">
                                    <span style="font-size: 24px; margin-bottom: 4px;">👥</span>
                                    Roster
                                </button>
                                <button class="btn" onclick="location.hash='#/trade'" style="flex-direction: column; padding: 12px; text-align: center; height: 80px; justify-content: center;">
                                    <span style="font-size: 24px; margin-bottom: 4px;">⇄</span>
                                    Trade
                                </button>
                                <button class="btn" onclick="location.hash='#/freeagency'" style="flex-direction: column; padding: 12px; text-align: center; height: 80px; justify-content: center;">
                                    <span style="font-size: 24px; margin-bottom: 4px;">✍️</span>
                                    Sign
                                </button>
                                <button class="btn" onclick="location.hash='#/draft'" style="flex-direction: column; padding: 12px; text-align: center; height: 80px; justify-content: center;">
                                    <span style="font-size: 24px; margin-bottom: 4px;">🎓</span>
                                    Draft
                                </button>
                                <button class="btn" onclick="location.hash='#/schedule'" style="flex-direction: column; padding: 12px; text-align: center; height: 80px; justify-content: center;">
                                    <span style="font-size: 24px; margin-bottom: 4px;">📅</span>
                                    Sched
                                </button>
                                <button class="btn" onclick="window.openTrainingMenu()" style="flex-direction: column; padding: 12px; text-align: center; height: 80px; justify-content: center;">
                                    <span style="font-size: 24px; margin-bottom: 4px;">🏋️</span>
                                    Train
                                </button>
                            </div>
                        </div>
                        <div>
                            <h3>League Actions</h3>
                            <div class="actions" style="display: flex; flex-direction: column; gap: 8px;">
                                ${!isOffseason ? '<button class="btn" id="btnSimSeason" onclick="handleSimulateSeason()" style="justify-content: center;">Simulate Season</button>' : ''}
                                ${(!isOffseason && L.week > 18 && (!window.state?.playoffs || !window.state.playoffs.winner))
                                    ? `<button class="btn primary" onclick="if(window.startPlayoffs) window.startPlayoffs();" style="justify-content: center;">Start Playoffs</button>`
                                    : ''
                                }
                                <button class="btn" onclick="location.hash='#/standings'" style="justify-content: center;">View Standings</button>
                                ${isOffseason ? `<button class="btn primary" id="btnStartNewSeason" style="justify-content: center; padding: 12px;">Start ${(L?.year || 2025) + 1} Season</button>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="mt-4">
                        <h3>Team Status</h3>
                        <div id="teamStatus">
                            <p>Team information will be displayed here</p>
                        </div>
                    </div>
                </div>
                ${divisionStandingsHTML}
                ${isOffseason ? `
                    <div class="card mt" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1.5rem;">
                        <h2 style="margin: 0 0 0.5rem 0; color: white;">🏆 ${L?.year || 2025} Season Complete - Offseason</h2>
                        <p style="margin: 0 0 1rem 0; opacity: 0.9;">
                            Resign players, sign free agents, and draft rookies before starting the ${(L?.year || 2025) + 1} season.
                        </p>
                    </div>
                ` : ''}
            `;
            // Add event listeners for simulate buttons
            const btnSimSeason = hubContainer.querySelector('#btnSimSeason');
            const btnStartNewSeason = hubContainer.querySelector('#btnStartNewSeason');

            // Handle Hero Sim Button
            const btnSimWeekHero = hubContainer.querySelector('#btnSimWeekHero');
            if (btnSimWeekHero) {
                btnSimWeekHero.addEventListener('click', () => {
                    if (window.simulateWeek) {
                        window.simulateWeek();
                    } else {
                        this.handleSimulateWeek();
                    }
                });
            }

            // btnSimWeek handled in events.js to avoid duplicates
            // Render additional interfaces
            setTimeout(() => {
                if (window.renderCoachingRoleInterface) {
                    window.renderCoachingRoleInterface();
                }
                if (window.renderOwnerModeInterface) {
                    window.renderOwnerModeInterface();
                }
                // Render offseason banner if in offseason
                if (isOffseason && typeof window.renderHubStandings === 'function') {
                    window.renderHubStandings(L);
                }

                // Show Pending Interactive Event
                if (window.state.pendingEvent && window.showDecisionModal) {
                    console.log("Showing pending decision modal");
                    window.showDecisionModal(window.state.pendingEvent);
                    window.state.pendingEvent = null;
                }
            }, 100);
            if (btnSimSeason) {
                btnSimSeason.addEventListener('click', () => this.handleSimulateSeason());
            }
            if (btnStartNewSeason) {
                btnStartNewSeason.addEventListener('click', () => {
                    if (typeof window.startNewSeason === 'function') {
                        window.startNewSeason();
                    } else {
                        this.setStatus('Error: startNewSeason function not available', 'error');
                    }
                });
            }
            console.log('✅ Hub rendered successfully');
        } catch (error) {
            console.error('Error rendering hub:', error);
            this.setStatus('Failed to render hub', 'error');
        }
    }

    // --- SCHEDULE RENDERING ---
    // This method has been moved to the async renderSchedule below (line ~519)
    // to properly delegate to scheduleViewer and avoid duplication

    // --- SIMULATION FUNCTIONS ---
    handleSimulateWeek() {
        try {
            console.log('Simulating week...');
            this.setStatus('Simulating week...', 'info');
            if (window.simulateWeek) {
                window.simulateWeek();
                this.saveGameState(); // Auto-save after week
                this.setStatus('Week simulated successfully', 'success');
            } else if (window.state?.league) {
                const L = window.state.league;
                if (L.week < 18) {
                    L.week++;
                    this.setStatus(`Advanced to week ${L.week}`, 'success');
                    setTimeout(() => this.renderHub(), 1000);
                } else {
                    this.setStatus('Season complete!', 'success');
                }
            } else {
                this.setStatus('No league data available', 'error');
            }
        } catch (error) {
            console.error('Error simulating week:', error);
            this.setStatus('Failed to simulate week', 'error');
        }
    }

    async handleSimulateSeason() {
        try {
            console.log('Simulating season...');
            this.setStatus('Simulating season...', 'info');

            if (!window.state?.league) {
                this.setStatus('No league data available', 'error');
                return;
            }

            const L = window.state.league;
            const scheduleWeeks = L.schedule?.weeks || L.schedule || [];
            const maxWeeks = scheduleWeeks.length || 18;

            // Loop until end of regular season
            while (L.week <= maxWeeks) {
                // Stop if offseason or playoffs started
                if (window.state.offseason) break;

                const startWeek = L.week;

                // Simulate week without rendering full UI
                if (window.simulateWeek) {
                    window.simulateWeek({ render: false });
                } else {
                    // Fallback logic if simulateWeek not available
                    L.week++;
                }

                // CHECK FOR FREEZE: If week didn't advance, we are stuck or done
                if (L.week === startWeek && !window.state.offseason) {
                    console.warn("Simulation loop detected no week advancement. Stopping.");
                    break;
                }

                // Update status
                this.setStatus(`Simulating week ${L.week}...`, 'info');

                // Allow UI to update status
                await new Promise(resolve => setTimeout(resolve, 50));

                // Check for interactive event interruption
                if (window.state.pendingEvent) {
                    console.log("Stopping simulation for interactive event");
                    this.setStatus("Simulation paused for important decision!", "warning");
                    break;
                }
            }

            this.setStatus(window.state.pendingEvent ? 'Simulation paused.' : 'Season simulation complete.', 'success');
            this.saveGameState(); // Auto-save after season
            setTimeout(() => this.renderHub(), 500);

        } catch (error) {
            console.error('Error simulating season:', error);
            this.setStatus('Failed to simulate season', 'error');
        }
    }

    // --- ENHANCED GAME RESULTS DISPLAY ---
    async renderGameResults() {
        try {
            console.log('Rendering enhanced game results...');
            const L = window.state.league;
            if (!L || !L.resultsByWeek) {
                console.warn('No game results available');
                return;
            }
            const hubResults = this.getElement('hubResults');
            if (!hubResults) return;
            const lastWeek = L.week > 1 ? L.week - 1 : 1;
            const weekResults = L.resultsByWeek[lastWeek];
            if (!weekResults || weekResults.length === 0) {
                hubResults.innerHTML = '<p class="muted">No results available for last week</p>';
                return;
            }
            let resultsHTML = '';
            weekResults.forEach(result => {
                if (result.bye) {
                    const byeTeams = result.bye.map(teamId => {
                        const team = L.teams[teamId];
                        return team ? team.name : 'Unknown Team';
                    }).join(', ');
                    resultsHTML += `
                        <div class="result-item bye-week" data-week="${lastWeek}">
                            <div class="bye-teams">${byeTeams} - BYE</div>
                        </div>
                    `;
                } else {
                    const homeTeam = L.teams[result.home];
                    const awayTeam = L.teams[result.away];
                    if (homeTeam && awayTeam) {
                        const homeWin = result.homeWin;
                        const homeScore = result.scoreHome || 0;
                        const awayScore = result.scoreAway || 0;
                        resultsHTML += `
                            <div class="result-item game-result" data-week="${lastWeek}" data-home="${result.home}" data-away="${result.away}">
                                <div class="game-teams">
                                    <span class="away-team ${!homeWin ? 'winner' : ''}">${awayTeam.name}</span>
                                    <span class="at">@</span>
                                    <span class="home-team ${homeWin ? 'winner' : ''}">${homeTeam.name}</span>
                                </div>
                                <div class="game-score">
                                    <span class="away-score ${!homeWin ? 'winner' : ''}">${awayScore}</span>
                                    <span class="score-separator">-</span>
                                    <span class="home-score ${homeWin ? 'winner' : ''}">${homeScore}</span>
                                </div>
                                <div class="game-result-indicator">
                                    ${homeWin ? 'Home Win' : 'Away Win'}
                                </div>
                            </div>
                        `;
                    }
                }
            });
            hubResults.innerHTML = resultsHTML;
            if (window.gameResultsViewer) {
                window.gameResultsViewer.makeGameResultsClickable();
            }
            console.log('✅ Enhanced game results rendered successfully');
        } catch (error) {
            console.error('Error rendering game results:', error);
        }
    }

    // --- ENHANCED SCHEDULE DISPLAY ---
    // Note: The actual renderSchedule implementation is above (line 280)
    // This method delegates to scheduleViewer if available, otherwise uses the base implementation
    async renderSchedule() {
        try {
            console.log('Rendering enhanced schedule...');
            // Try using the schedule viewer first
            if (window.scheduleViewer && typeof window.scheduleViewer.refresh === 'function') {
                try {
                    await window.scheduleViewer.refresh();
                    console.log('✅ Schedule rendered via scheduleViewer');
                    return;
                } catch (e) {
                    console.warn('Schedule viewer refresh failed, using fallback:', e);
                }
            }
            // Fall back to the base renderSchedule implementation (line 280)
            // Use a different approach to avoid recursion - call the base implementation directly
            const scheduleContainer = document.getElementById('schedule');
            if (!scheduleContainer) {
                console.warn('Schedule container not found');
                return;
            }
            
            const L = window.state?.league;
            if (!L) {
                scheduleContainer.innerHTML = '<div class="card"><p>No league data available</p></div>';
                return;
            }

            // Ensure schedule exists
            if (!L.schedule || (Array.isArray(L.schedule) && L.schedule.length === 0)) {
                if (window.makeSchedule) {
                    L.schedule = window.makeSchedule(L.teams);
                }
            }

            const currentWeek = L.week || 1;
            const userTeamId = window.state?.userTeamId;
            
            let scheduleHTML = '<div class="card"><h2>Season Schedule</h2>';
            scheduleHTML += `<div class="schedule-header-info"><span>Current Week: ${currentWeek}</span></div>`;
            
            // Try different schedule formats
            let scheduleWeeks = [];
            if (L.schedule) {
                if (Array.isArray(L.schedule)) {
                    scheduleWeeks = L.schedule;
                } else if (L.schedule.weeks) {
                    scheduleWeeks = L.schedule.weeks;
                } else {
                    // Legacy format: L.schedule[week]
                    for (let w = 1; w <= 18; w++) {
                        if (L.schedule[w] && Array.isArray(L.schedule[w])) {
                            scheduleWeeks.push({ weekNumber: w, games: L.schedule[w] });
                        }
                    }
                }
            }

            if (scheduleWeeks.length === 0) {
                scheduleHTML += '<p class="muted">No schedule data available. Schedule will be generated when the season starts.</p>';
            } else {
                scheduleHTML += '<div class="schedule-weeks-container">';
                
                for (let week = 1; week <= 18; week++) {
                    const weekData = scheduleWeeks.find(w => (w.weekNumber || w.week) === week) || 
                                   scheduleWeeks[week - 1];
                    
                    if (!weekData) continue;
                    
                    const games = weekData.games || [];
                    const weekResults = L.resultsByWeek?.[week - 1] || [];
                    
                    scheduleHTML += `<div class="week-schedule-card ${week === currentWeek ? 'current-week' : ''}">`;
                    scheduleHTML += `<h3>Week ${week}${week < currentWeek ? ' (Completed)' : week === currentWeek ? ' (Current)' : ''}</h3>`;
                    scheduleHTML += '<div class="week-games-list">';
                    
                    if (games.length === 0) {
                        scheduleHTML += '<p class="muted">No games scheduled</p>';
                    } else {
                        games.forEach((game, idx) => {
                            if (!game || (game.bye && Array.isArray(game.bye))) {
                                // Bye week
                                if (game.bye) {
                                    scheduleHTML += `<div class="game-item bye-week">`;
                                    game.bye.forEach(teamId => {
                                        const team = L.teams[teamId];
                                        if (team) scheduleHTML += `<span class="team-name">${team.abbr}</span>`;
                                    });
                                    scheduleHTML += `<span class="bye-label">- BYE</span></div>`;
                                }
                            } else {
                                // Regular game
                                const homeTeam = L.teams[game.home];
                                const awayTeam = L.teams[game.away];
                                
                                if (!homeTeam || !awayTeam) return;
                                
                                const isUserGame = game.home === userTeamId || game.away === userTeamId;
                                const isCompleted = game.homeScore !== undefined && game.awayScore !== undefined;
                                const gameResult = weekResults.find(r => r && r.home === game.home && r.away === game.away);
                                
                                scheduleHTML += `<div class="game-item ${isUserGame ? 'user-game' : ''} ${isCompleted ? 'completed' : 'upcoming'}">`;
                                scheduleHTML += `<div class="game-teams">`;
                                scheduleHTML += `<span class="away-team">${awayTeam.abbr || awayTeam.name}</span>`;
                                scheduleHTML += `<span class="at">@</span>`;
                                scheduleHTML += `<span class="home-team">${homeTeam.abbr || homeTeam.name}</span>`;
                                scheduleHTML += `</div>`;
                                
                                if (isCompleted && gameResult) {
                                    const homeScore = gameResult.scoreHome || game.homeScore || 0;
                                    const awayScore = gameResult.scoreAway || game.awayScore || 0;
                                    const homeWin = homeScore > awayScore;
                                    scheduleHTML += `<div class="game-score">`;
                                    scheduleHTML += `<span class="score ${!homeWin ? 'winner' : ''}">${awayScore}</span>`;
                                    scheduleHTML += `<span class="score-sep">-</span>`;
                                    scheduleHTML += `<span class="score ${homeWin ? 'winner' : ''}">${homeScore}</span>`;
                                    scheduleHTML += `</div>`;
                                    scheduleHTML += `<button class="btn btn-sm" onclick="window.showBoxScore && window.showBoxScore(${week}, ${idx})">📊 Box Score</button>`;
                                } else {
                                    // Ensure team IDs are numbers for watchLiveGame
                                    const homeId = typeof game.home === 'object' ? game.home.id : game.home;
                                    const awayId = typeof game.away === 'object' ? game.away.id : game.away;
                                    scheduleHTML += `<button class="btn btn-sm btn-primary watch-live-btn" onclick="if(window.watchLiveGame) { window.watchLiveGame(${homeId}, ${awayId}); } else { console.error('watchLiveGame not available'); }">📺 Watch Live</button>`;
                                }
                                
                                scheduleHTML += `</div>`;
                            }
                        });
                    }
                    
                    scheduleHTML += '</div></div>';
                }
                
                scheduleHTML += '</div>';
            }
            
            scheduleHTML += '</div>';
            
            const scheduleWrap = scheduleContainer.querySelector('#scheduleWrap') || scheduleContainer;
            scheduleWrap.innerHTML = scheduleHTML;
            console.log('✅ Enhanced schedule rendered successfully');
        } catch (error) {
            console.error('Error rendering schedule:', error);
            this.setStatus('Failed to render schedule', 'error');
        }
    }

    // --- ROBUST ONBOARDING ---
    async openOnboard() {
        try {
            const modal = this.getElement('onboardModal');
            if (!modal) {
                throw new Error('Onboarding modal not found');
            }
            modal.hidden = false;
            modal.style.display = 'flex';
            await this.ensureTeamsLoaded();
            const selectedMode = this.syncOnboardSelections();
            const populated = this.populateTeamDropdown(selectedMode);
            if (!populated) {
                throw new Error('Teams data unavailable for selected mode');
            }
        } catch (error) {
            console.error('Error opening onboarding:', error);
            this.setStatus('Failed to open game setup', 'error');
        }
    }

    syncOnboardSelections() {
        const defaultMode = window.state?.namesMode || 'fictional';
        const checkedRadio = document.querySelector('input[name="namesMode"]:checked');
        const selectedMode = checkedRadio?.value || defaultMode;

        // Ensure the radio buttons reflect the selected mode
        document.querySelectorAll('input[name="namesMode"]').forEach(radio => {
            radio.checked = radio.value === selectedMode;
        });

        return selectedMode;
    }

    async ensureTeamsLoaded() {
        if (!window.Teams) {
            if (typeof window.loadTeamsData === 'function') {
                try {
                    await window.loadTeamsData();
                } catch (error) {
                    console.error('Failed to load teams data:', error);
                    throw new Error('Teams data unavailable');
                }
            } else {
                throw new Error('Teams data and loader not available');
            }
        }
        const hasRealTeams = Array.isArray(window.Teams?.real) && window.Teams.real.length > 0;
        const hasFictionalTeams = Array.isArray(window.Teams?.fictional) && window.Teams.fictional.length > 0;
        if (!hasRealTeams && !hasFictionalTeams) {
            throw new Error('Teams data unavailable');
        }
    }

    populateTeamDropdown(mode) {
        const teamSelect = this.getElement('onboardTeam');
        if (!teamSelect) {
            console.error('Team select element not found');
            return false;
        }
        try {
            teamSelect.innerHTML = '';
            teamSelect.disabled = false;
            const teams = this.listByMode(mode);
            if (teams.length === 0) {
                const option = document.createElement('option');
                option.textContent = 'No teams available';
                option.disabled = true;
                teamSelect.appendChild(option);
                return false;
            }
            const fragment = document.createDocumentFragment();
            teams.forEach((team, index) => {
                if (team && team.name && team.abbr) {
                    const option = document.createElement('option');
                    option.value = String(index);
                    option.textContent = `${team.abbr} — ${team.name}`;
                    fragment.appendChild(option);
                }
            });
            teamSelect.appendChild(fragment);
            return true;
        } catch (error) {
            console.error('Error populating team dropdown:', error);
            this.setStatus('Failed to load team list', 'error');
            return false;
        }
    }

    // --- ENHANCED GAME INITIALIZATION ---
    async initNewGame(options) {
        try {
            if (!options || typeof options !== 'object') {
                throw new Error('Invalid game options');
            }
            const { chosenMode, teamIdx } = options;
            if (!chosenMode || teamIdx === undefined) {
                throw new Error('Missing required game options');
            }

            // Use imported initState
            window.state = initState();
            window.state.onboarded = true;
            window.state.namesMode = chosenMode;
            window.state.userTeamId = parseInt(teamIdx, 10);
            window.state.viewTeamId = window.state.userTeamId;
            if (isNaN(window.state.userTeamId)) {
                throw new Error('Invalid team selection');
            }
            window.state.player = { teamId: window.state.userTeamId };
            this.applyTheme(window.state.theme || 'dark');
            const teams = this.listByMode(window.state.namesMode);
            if (teams.length === 0) {
                throw new Error('No teams available for selected mode');
            }
            if (!window.makeLeague) {
                throw new Error('League creation system not available');
            }
            window.state.league = window.makeLeague(teams);
            if (window.ensureFA) {
                try {
                    window.ensureFA();
                } catch (error) {
                    console.warn('Failed to initialize free agency:', error);
                }
            }
            // Save state via wrapper; returns an object with success
            const saveResult = await this.saveGameState();
            if (!saveResult.success) {
                console.warn('Failed to save initial game state:', saveResult.error);
            }
            // Hide modal
            const modal = this.getElement('onboardModal');
            if (modal) {
                modal.hidden = true;
                modal.style.display = 'none';
            }
            
            // Ensure state is properly set
            if (!window.state.onboarded) {
                window.state.onboarded = true;
            }
            
            // Mark state as needing save
            if (window.state) {
                window.state.needsSave = true;
            }
            
            console.log('✅ League created successfully:', {
                teams: window.state.league?.teams?.length || 0,
                userTeamId: window.state.userTeamId,
                onboarded: window.state.onboarded,
                hasLeague: !!window.state.league
            });
            
            // Ensure state is fully ready
            if (window.state.league && !window.state.onboarded) {
                window.state.onboarded = true;
            }
            
            // Hide modal first
            const modalEl = document.getElementById('onboardModal');
            if (modalEl) {
                modalEl.hidden = true;
                modalEl.style.display = 'none';
            }
            
            // Navigate to hub
            location.hash = '#/hub';
            
            // Wait for hash change and then render
            setTimeout(() => {
                try {
                    // Force show hub view first
                    const hubView = document.getElementById('hub');
                    if (hubView) {
                        hubView.hidden = false;
                        hubView.style.display = 'block';
                    }
                    
                    // Hide all other views
                    document.querySelectorAll('.view').forEach(view => {
                        if (view.id !== 'hub') {
                            view.hidden = true;
                            view.style.display = 'none';
                        }
                    });
                    
                    // Update UI components
                    if (window.initializeUIFixes) {
                        window.initializeUIFixes();
                    }
                    if (typeof window.updateCapSidebar === 'function') {
                        window.updateCapSidebar();
                    }
                    
                    // Force router to run
                    if (window.router && typeof window.router === 'function') {
                        window.router('hub');
                    } else if (window.fixedRouter && typeof window.fixedRouter === 'function') {
                        window.fixedRouter();
                    }
                    
                    // Render hub content
                    if (window.renderHub && typeof window.renderHub === 'function') {
                        setTimeout(() => {
                            window.renderHub();
                        }, 100);
                    }
                    
                    // Force show hub view (again to be sure)
                    if (window.show && typeof window.show === 'function') {
                        window.show('hub');
                    }
                    
                    // Update cap sidebar
                    if (window.updateCapSidebar && typeof window.updateCapSidebar === 'function') {
                        setTimeout(() => {
                            window.updateCapSidebar();
                        }, 150);
                    }
                    
                    console.log('✅ UI updated after league creation');
                } catch (err) {
                    console.error('Error updating UI after league creation:', err);
                }
            }, 300);
            
            this.setStatus('New game created successfully!', 'success', 3000);
        } catch (error) {
            console.error('Error in initNewGame:', error);
            this.setStatus(`Failed to create new game: ${error.message}`, 'error');
            throw error;
        }
    }

    // --- ROBUST INITIALIZATION ---
    async init() {
        if (this.initPromise) {
            return this.initPromise;
        }
        this.initPromise = this._performInit();
        return this.initPromise;
    }

    async _performInit() {
        console.log('GameController: Initializing...');
        try {
            const loadResult = await this.loadGameState();
            // Accept saved state if it contains a league, even if onboarded flag is missing
            if (loadResult.success && loadResult.gameData && (loadResult.gameData.onboarded || loadResult.gameData.league)) {
                // Note: migration is handled inside loadState now if using state.js loadState
                // But let's trust loadResult.gameData is already migrated if loadState does it.
                // state.js loadState does calls migrate.
                window.state = loadResult.gameData;

                this.applyTheme(window.state.theme || 'dark');
                if (typeof window.renderSaveSlotInfo === 'function') window.renderSaveSlotInfo();
                if (typeof window.renderSaveDataManager === 'function') window.renderSaveDataManager();
                if (typeof window.updateCapSidebar === 'function') window.updateCapSidebar();
                this.setStatus('Game loaded successfully', 'success', 2000);
            } else {
                window.state = initState();
                this.applyTheme(window.state.theme || 'dark');

                // Show Dashboard instead of immediate onboarding
                if (window.show) window.show('leagueDashboard');
                if (window.renderDashboard) window.renderDashboard();
                this.setStatus('Welcome to NFL GM. Please select or create a league.', 'info');
            }
            this.setupEventListeners();
            if (typeof window.setupEventListeners === 'function') {
                window.setupEventListeners();
            } else {
                console.warn('Global UI event listeners not available');
            }
            if (window.initializeUIFixes) {
                window.initializeUIFixes();
            }
            this.setupAutoSave();
            this.initialized = true;
            console.log('✅ GameController initialized successfully');
        } catch (error) {
            console.error('FATAL ERROR during initialization:', error);
            this.setStatus(`Initialization failed: ${error.message}`, 'error', 10000);
            try {
                window.state = { onboarded: false };
                await this.openOnboard();
            } catch (recoveryError) {
                console.error('Recovery failed:', recoveryError);
                this.setStatus('Game failed to start. Please refresh the page.', 'error', 0);
            }
        }
    }

    async startNewLeague() {
        try {
            if (this.autoSaveInterval) {
                clearInterval(this.autoSaveInterval);
                this.autoSaveInterval = null;
            }

            if (clearSavedState) {
                clearSavedState();
            }

            window.state = initState();

            if (typeof window.setActiveSaveSlot === 'function' && window.state?.saveSlot) {
                window.setActiveSaveSlot(window.state.saveSlot);
            }

            this.applyTheme(window.state.theme || 'dark');

            if (typeof window.renderSaveSlotInfo === 'function') {
                window.renderSaveSlotInfo();
            }

            if (typeof window.renderSaveDataManager === 'function') {
                window.renderSaveDataManager();
            }

            this.clearDOMCache();
            location.hash = '#/hub';

            await this.openOnboard();

            this.setStatus('New league ready. Choose your team to begin.', 'success', 4000);
        } catch (error) {
            console.error('Error starting new league:', error);
            this.setStatus(`Failed to start new league: ${error.message}`, 'error');
        }
    }

    // --- EVENT MANAGEMENT ---
    setupEventListeners() {
        this.removeAllEventListeners();
        this.addEventListener(window, 'beforeunload', this.handleBeforeUnload.bind(this));
        this.addEventListener(window, 'hashchange', this.handleHashChange.bind(this));
        this.addEventListener(document, 'visibilitychange', () => {
            if (document.hidden) {
                this.clearDOMCache();
            }
        });

        // FIX: Handle Bottom Nav Menu Click
        const navMenuBottom = document.getElementById('navMenuBottom');
        if (navMenuBottom) {
            this.addEventListener(navMenuBottom, 'click', (e) => {
                e.preventDefault();
                // Toggle sidebar by clicking the main toggle
                const toggle = document.querySelector('.nav-toggle');
                if (toggle) toggle.click();
            });
        }

        // FIX: Menu Toggle (ZenGM Style)
        const menuBtn = document.getElementById('navToggle');
        const sidebar = document.getElementById('nav-sidebar');
        const overlay = document.getElementById('menu-overlay');

        // Initial setup for mobile
        if (window.innerWidth <= 768) {
            if (sidebar && !sidebar.classList.contains('collapsed')) {
                sidebar.classList.add('collapsed');
            }
        }

        function toggleMenu() {
            // Toggle collapsed class (collapsed = hidden)
            if (sidebar) sidebar.classList.toggle('collapsed');

            // Toggle active on overlay (active = visible)
            if (overlay) overlay.classList.toggle('active');

            // Toggle body class for styling if needed
            document.body.classList.toggle('nav-open');
        }

        if (menuBtn) {
            this.addEventListener(menuBtn, 'click', (e) => {
                e.preventDefault();
                toggleMenu();
            });
        }

        if (overlay) {
             this.addEventListener(overlay, 'click', toggleMenu);
        }

        // FIX: Dashboard Button
        const btnDashboard = document.getElementById('btnDashboard');
        if (btnDashboard) {
            this.addEventListener(btnDashboard, 'click', () => {
                if (window.show) window.show('leagueDashboard');
                if (window.renderDashboard) window.renderDashboard();
                // Close menu if open
                if (typeof toggleMenu === 'function' && sidebar && sidebar.classList.contains('active')) {
                    toggleMenu();
                }
            });
        }
    }

    addEventListener(element, event, handler) {
        const key = `${element.constructor.name}_${event}`;
        if (this.eventListeners.has(key)) {
            element.removeEventListener(event, this.eventListeners.get(key));
        }
        element.addEventListener(event, handler);
        this.eventListeners.set(key, handler);
    }

    removeAllEventListeners() {
        this.eventListeners.forEach((handler, key) => {
            const [elementType, event] = key.split('_');
            const element = elementType === 'Window' ? window : document;
            element.removeEventListener(event, handler);
        });
        this.eventListeners.clear();
    }

    handleBeforeUnload(event) {
        if (window.state?.needsSave) {
            event.preventDefault();
            event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            return event.returnValue;
        }
    }

    handleHashChange() {
        try {
            const hash = location.hash.slice(2) || 'hub';
            if (window.router && typeof window.router === 'function') {
                window.router(hash);
            }
        } catch (error) {
            console.error('Error handling hash change:', error);
        }
    }

    // --- AUTO-SAVE SYSTEM ---
    setupAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
        this.autoSaveInterval = setInterval(() => {
            if (window.state?.onboarded && window.state?.needsSave) {
                this.saveGameState().then(result => {
                    if (result.success) {
                        window.state.needsSave = false;
                        console.log('Auto-save completed');
                    }
                }).catch(error => {
                    console.error('Auto-save failed:', error);
                });
            }
        }, 5 * 60 * 1000);
    }

    // --- ENHANCED SAVE/LOAD ---
    async saveGameState(stateToSave = null) {
        try {
            // Use new Dashboard Save System if available
            if (window.saveGame) {
                window.saveGame(stateToSave);
                return { success: true };
            }

            // Fallback to legacy
            if (saveState) {
                const ok = saveState(stateToSave);
                if (ok) {
                    if (typeof window.renderSaveSlotInfo === 'function') window.renderSaveSlotInfo();
                    if (typeof window.renderSaveDataManager === 'function') window.renderSaveDataManager();
                }
                return { success: !!ok };
            } else {
                throw new Error('Save system not available');
            }
        } catch (error) {
            console.error('Save failed:', error);
            return { success: false, error: error.message };
        }
    }

    async loadGameState() {
        try {
            // Priority: Check League Dashboard system first
            if (window.getLastPlayedLeague && window.loadLeague) {
                const lastLeague = window.getLastPlayedLeague();
                if (lastLeague) {
                    console.log("Loading last played league:", lastLeague);
                    const loadedState = window.loadLeague(lastLeague);
                    if (loadedState) {
                        return { success: true, gameData: loadedState };
                    }
                }
            }

            // Fallback: Legacy State System
            if (loadState) {
                const gameData = loadState();
                if (gameData) {
                    return { success: true, gameData };
                } else {
                    return { success: false, error: 'No save data found' };
                }
            } else {
                throw new Error('Load system not available');
            }
        } catch (error) {
            console.error('Load failed:', error);
            return { success: false, error: error.message };
        }
    }

    // --- ROUTER FUNCTION ---
    router(viewName = null) {
        if (!viewName) {
            viewName = location.hash.slice(2) || 'hub';
        }
        console.log('🔄 Router navigating to:', viewName);

        // Always show the requested view if the UI helper exists
        if (typeof window.show === 'function') {
            window.show(viewName);
        }

        switch(viewName) {
            case 'hub':
                if (this.renderHub) this.renderHub();
                break;
            case 'leagueDashboard':
                if (window.renderDashboard) window.renderDashboard();
                break;
            case 'roster':
                if (this.renderRoster) this.renderRoster();
                break;
            case 'contracts':
            case 'cap':
                if (window.renderContractManagement) {
                    window.renderContractManagement(window.state?.league, window.state?.userTeamId);
                }
                break;
            case 'schedule':
                if (this.renderSchedule) this.renderSchedule();
                break;
            case 'game-results':
                if (this.renderGameResults) this.renderGameResults();
                break;
            case 'standings':
                if (window.renderStandingsPage) {
                    window.renderStandingsPage();
                } else if (window.renderStandings) {
                    window.renderStandings();
                }
                break;
            case 'powerRankings':
                if (window.renderPowerRankingsPage) {
                    window.renderPowerRankingsPage();
                }
                break;
            case 'trade':
                if (window.renderTradeCenter) {
                    window.renderTradeCenter();
                } else if (window.openTradeCenter) {
                    window.openTradeCenter();
                }
                break;
            case 'freeagency':
                if (window.renderFreeAgency) {
                    window.renderFreeAgency();
                }
                break;
            case 'scouting':
                if (window.renderScouting) {
                    window.renderScouting();
                }
                break;
            case 'coaching':
                if (renderCoachingStats) {
                    renderCoachingStats();
                } else if (renderCoaching) {
                    renderCoaching();
                }
                break;
            case 'draft':
                if (window.renderDraftBoard) {
                    window.renderDraftBoard();
                } else if (window.renderDraft) {
                    window.renderDraft();
                }
                break;
            case 'awards':
                if (window.renderAwardRaces) {
                    window.renderAwardRaces();
                }
                break;
            case 'injuries':
                if (window.renderInjuriesPage) {
                    window.renderInjuriesPage();
                }
                break;
            case 'relocation':
                if (window.renderRelocationPage) {
                    window.renderRelocationPage();
                }
                break;
            case 'settings':
                if (window.renderSettings) {
                    window.renderSettings();
                }
                break;
            case 'playoffs':
                if (window.renderPlayoffs) {
                    window.renderPlayoffs();
                }
                break;
            case 'stats':
            case 'leagueStats':
                if (window.renderLeagueStats) {
                    window.renderLeagueStats();
                } else if (window.renderStatsPage) {
                    window.renderStatsPage();
                }
                break;
            case 'player':
                // Handle player profile route: player/123
                const parts = viewName.split('/');
                if (parts.length > 1) {
                    const playerId = parts[1];
                    // Ensure playerProfile view is shown
                    window.show('playerProfile');
                    if (window.playerStatsViewer) {
                        window.playerStatsViewer.renderToView('playerProfile', playerId);
                    } else if (window.showPlayerDetails) {
                         // Fallback if viewer not found (though less ideal for full page)
                         console.warn('PlayerStatsViewer not found, using modal fallback');
                         window.showPlayerDetails({ id: playerId });
                    }
                }
                break;
            default:
                // Handle other nested routes (e.g., player/123 might fall here if not caught above)
                if (viewName.startsWith('player/')) {
                     const pId = viewName.split('/')[1];
                     window.show('playerProfile');
                     if (window.playerStatsViewer) window.playerStatsViewer.renderToView('playerProfile', pId);
                } else {
                    console.log('No renderer for view:', viewName);
                }
        }
    }

    // --- IMPROVED REFRESH SYSTEM ---
    async refreshAll() {
        if (!window.state?.onboarded || !window.state?.league) {
            console.warn('Cannot refresh - game not properly initialized');
            return;
        }
        try {
            this.clearDOMCache();
            const currentHash = location.hash.slice(2) || 'hub';
            this.router(currentHash);
        } catch (error) {
            console.error('Error in refreshAll:', error);
            this.setStatus('Failed to refresh display', 'error');
        }
    }

    // --- ENHANCED SAFETY NET ---
    initializeSafetyNet() {
        const requiredFunctions = {
            makeLeague: (teams) => ({
                teams: teams || [],
                year: 2025,
                week: 1,
                schedule: { weeks: [] },
                standings: { divisions: {} }
            }),
            generateProspects: () => [],
            generateCoaches: () => {
                if (!window.state?.league?.teams) return {};
                const coaches = {};
                window.state.league.teams.forEach(team => {
                    if (!team.staff) {
                        team.staff = {
                            headCoach: {
                                name: `Coach ${team.name}`,
                                position: 'HC',
                                experience: 1,
                                rating: 70
                            },
                            offCoordinator: {
                                name: `OC ${team.name}`,
                                position: 'OC',
                                experience: 1,
                                rating: 65
                            },
                            defCoordinator: {
                                name: `DC ${team.name}`,
                                position: 'DC',
                                experience: 1,
                                rating: 65
                            }
                        };
                    }
                });
                return coaches;
            }
        };
        Object.entries(requiredFunctions).forEach(([name, func]) => {
            if (!window[name]) {
                window[name] = func;
            }
        });
    }
}

// Create and initialize the game controller
const gameController = new GameController();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        gameController.init();
    });
} else {
    gameController.init();
}
window.gameController = gameController;
window.initNewGame = gameController.initNewGame.bind(gameController);
window.saveGameState = gameController.saveGameState.bind(gameController);
window.loadGameState = gameController.loadGameState.bind(gameController);
window.setStatus = gameController.setStatus.bind(gameController);
window.router = gameController.router.bind(gameController);
window.renderHub = gameController.renderHub.bind(gameController);
window.renderGameResults = gameController.renderGameResults.bind(gameController);
window.renderSchedule = gameController.renderSchedule.bind(gameController);
window.getElement = gameController.getElement.bind(gameController);
window.listByMode = gameController.listByMode.bind(gameController);
window.populateTeamDropdown = gameController.populateTeamDropdown.bind(gameController);
window.applyTheme = gameController.applyTheme.bind(gameController);
window.switchSaveSlot = gameController.switchSaveSlot.bind(gameController);
window.calculateOverallRating = gameController.calculateOverallRating?.bind(gameController);
window.handleSimulateSeason = function() {
    if (window.gameController && window.gameController.handleSimulateSeason) {
        window.gameController.handleSimulateSeason();
    } else {
        console.error('GameController not available');
        window.setStatus('Game not ready', 'error');
    }
};
console.log('✅ GameController functions exported globally (patched version)');

// --- HEADER & DASHBOARD FIXES ---

window.updateHeader = function() {
    const L = window.state?.league;
    const seasonNow = document.getElementById('seasonNow');
    const capUsed = document.getElementById('capUsed');
    const capTotal = document.getElementById('capTotal');
    const deadCap = document.getElementById('deadCap');
    const capRoom = document.getElementById('capRoom');
    const hubWeek = document.getElementById('hubWeek');

    if (L) {
        if (seasonNow) seasonNow.textContent = L.year || new Date().getFullYear();
        if (hubWeek) hubWeek.textContent = L.week || 1;

        // Update Cap Info if user team is selected
        const userTeamId = window.state.userTeamId;
        if (userTeamId !== undefined && L.teams && L.teams[userTeamId]) {
            const team = L.teams[userTeamId];
            if (capUsed) capUsed.textContent = '$' + (team.capUsed || 0).toFixed(2) + 'M';
            if (capTotal) capTotal.textContent = '$' + (team.capTotal || 220).toFixed(2) + 'M';
            if (deadCap) deadCap.textContent = '$' + (team.deadCap || 0).toFixed(2) + 'M';
            if (capRoom) {
                const room = team.capRoom || 0;
                capRoom.textContent = '$' + room.toFixed(2) + 'M';
                capRoom.style.color = room >= 0 ? 'var(--success-text)' : 'var(--error-text)';
            }
        }
    }
};

// Ensure Dashboard loads on start
window.initDashboard = function() {
    if (window.renderDashboard) {
        window.renderDashboard();
    }
};

window.addEventListener('load', () => {
    window.initDashboard();
    // Hook into game controller init to update header
    if (window.gameController) {
        const originalInit = window.gameController.init;
        window.gameController.init = async function() {
            await originalInit.call(this);
            window.updateHeader();
        };

        // Also hook renderHub to update header
        const originalRenderHub = window.gameController.renderHub;
        window.gameController.renderHub = function() {
            originalRenderHub.call(this);
            window.updateHeader();
        };
    }
});
