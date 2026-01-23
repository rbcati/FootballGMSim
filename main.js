import { renderCoachingStats, renderCoaching } from './coaching.js';

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
        const normalized = (typeof window.setActiveSaveSlot === 'function') ? window.setActiveSaveSlot(slot) : slot;
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
            if (window.State?.init) {
                window.state = window.State.init();
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
            
            // Find next game for user team
            let nextGameHTML = '';
            if (!isOffseason) {
                const currentWeek = L.week || 1;
                let scheduleWeeks = L.schedule?.weeks || L.schedule || [];
                // Handle different schedule formats (array of objects or array of arrays)
                if (Array.isArray(scheduleWeeks) && scheduleWeeks.length > 0) {
                    if (scheduleWeeks[0] && typeof scheduleWeeks[0] === 'object' && scheduleWeeks[0].weekNumber !== undefined) {
                        scheduleWeeks = scheduleWeeks;
                    } else if (Array.isArray(scheduleWeeks[0]) || (scheduleWeeks[0] && scheduleWeeks[0].games)) {
                        scheduleWeeks = scheduleWeeks;
                    }
                }
                // Find current week data
                const weekData = Array.isArray(scheduleWeeks) ?
                    (scheduleWeeks.find(w => w && (w.weekNumber === currentWeek || w.week === currentWeek)) || scheduleWeeks[currentWeek - 1]) : null;

                if (weekData && weekData.games) {
                    const nextGame = weekData.games.find(g => g.home === userTeamId || g.away === userTeamId);
                    if (nextGame) {
                        const isHome = nextGame.home === userTeamId;
                        const oppId = isHome ? nextGame.away : nextGame.home;
                        const opponent = L.teams[oppId];
                        if (opponent) {
                            const oppRecord = opponent.record ? `(${opponent.record.w}-${opponent.record.l})` : '';
                            nextGameHTML = `
                                <div class="card next-game-card" style="background: linear-gradient(135deg, rgba(30, 40, 60, 0.8), rgba(20, 25, 35, 0.9)); border: 1px solid var(--accent);">
                                    <h3 style="color: var(--accent); margin-bottom: 10px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px;">Next Opponent - Week ${currentWeek}</h3>
                                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px;">
                                        <div style="font-size: 1.5rem; font-weight: 700;">${isHome ? 'vs' : '@'} ${opponent.name} <span style="font-size: 1rem; color: var(--text-muted); font-weight: 400;">${oppRecord}</span></div>
                                        <div style="font-size: 2rem;">🏈</div>
                                    </div>
                                    ${!isOffseason ? '<button class="btn primary" id="btnSimWeekHero" style="width: 100%; padding: 12px; font-size: 1.1rem; font-weight: bold;">Play Week ' + currentWeek + '</button>' : ''}
                                </div>
                            `;
                        }
                    } else {
                         nextGameHTML = `
                            <div class="card next-game-card">
                                <h3>Week ${currentWeek}</h3>
                                <div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 1.2rem;">BYE WEEK</div>
                                ${!isOffseason ? '<button class="btn primary" id="btnSimWeekHero" style="width: 100%; padding: 12px; font-size: 1.1rem; font-weight: bold;">Simulate Bye Week</button>' : ''}
                            </div>
                        `;
                    }
                }
            }

            hubContainer.innerHTML = `
                ${nextGameHTML}
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
                            </div>
                        </div>
                        <div>
                            <h3>League Actions</h3>
                            <div class="actions" style="display: flex; flex-direction: column; gap: 8px;">
                                ${!isOffseason ? '<button class="btn" id="btnSimSeason" onclick="handleSimulateSeason()" style="justify-content: center;">Simulate Season</button>' : ''}
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

                // Simulate week without rendering full UI
                if (window.simulateWeek) {
                    window.simulateWeek({ render: false });
                } else {
                    // Fallback logic if simulateWeek not available
                    L.week++;
                }

                // Update status
                this.setStatus(`Simulating week ${L.week}...`, 'info');

                // Allow UI to update status
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            this.setStatus('Season completed!', 'success');
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
            if (!window.State?.init) {
                throw new Error('State system not available');
            }
            window.state = window.State.init();
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
                // Migrate to current version if necessary
                if (window.State?.migrate && (!loadResult.gameData.version || loadResult.gameData.version !== '4.0.0')) {
                    window.state = window.State.migrate(loadResult.gameData);
                } else {
                    window.state = loadResult.gameData;
                }
                this.applyTheme(window.state.theme || 'dark');
                if (typeof window.renderSaveSlotInfo === 'function') window.renderSaveSlotInfo();
                if (typeof window.renderSaveDataManager === 'function') window.renderSaveDataManager();
                if (typeof window.updateCapSidebar === 'function') window.updateCapSidebar();
                this.setStatus('Game loaded successfully', 'success', 2000);
            } else {
                if (!window.State?.init) {
                    throw new Error('State system not loaded');
                }
                window.state = window.State.init();
                this.applyTheme(window.state.theme || 'dark');
                if (typeof window.renderSaveSlotInfo === 'function') window.renderSaveSlotInfo();
                await this.openOnboard();
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

            if (!window.State?.init) {
                throw new Error('State system not available');
            }

            if (typeof window.clearSavedState === 'function') {
                window.clearSavedState();
            }

            window.state = window.State.init();

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
            if (window.saveState && typeof window.saveState === 'function') {
                const ok = window.saveState(stateToSave);
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
            if (window.loadState && typeof window.loadState === 'function') {
                const gameData = window.loadState();
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
                if (window.renderPowerRankings) {
                    window.renderPowerRankings();
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
                if (window.renderStatsPage) {
                    window.renderStatsPage();
                }
                break;
            default:
                console.log('No renderer for view:', viewName);
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
