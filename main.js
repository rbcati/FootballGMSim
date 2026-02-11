import './logger.js';
import './football-db.js';
import { renderCoachingStats, renderCoaching } from './coaching.js';
import { renderMatchupComparison } from './matchup-comparison.js';
import { renderDiagnostics } from './diagnostics.js';
import { init as initState, loadState, saveState, hookAutoSave, clearSavedState, setActiveSaveSlot } from './state.js';
import { hasSavedLeagues, migrateSchema, getLastPlayedLeague, loadLeague } from './league-dashboard.js';
import { getActionItems } from './action-items.js';
import { showWeeklyRecap } from './weekly-recap.js';
import { OFFENSIVE_PLANS, DEFENSIVE_PLANS, RISK_PROFILES, updateWeeklyStrategy } from './strategy.js';
import { simulateWeek, startNewSeason } from './simulation.js';
import { initErrorBoundary } from './error-boundary.js';
import { showLoading, hideLoading } from './loading-spinner.js';
import { getTrackedPlayerUpdates, getFollowedPlayers } from './player-tracking.js';
import { renderNewsroom } from './news-viewer.js';

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
 * Calculate team ranks for Pass/Rush Offense/Defense
 * @param {Object} league - League object
 * @returns {Object} Map of teamId -> { passOffRank, rushOffRank, passDefRank, rushDefRank }
 */
function calculateTeamRanks(league) {
    if (!league || !league.teams) return {};

    const stats = league.teams.map(t => ({
        id: t.id,
        passOff: 0,
        rushOff: 0,
        passDef: 0,
        rushDef: 0,
        gamesPlayed: 0
    }));

    const teamMap = new Map(stats.map(s => [s.id, s]));

    // 1. Offense Stats (from Rosters - accumulated season stats)
    league.teams.forEach(team => {
        const teamStat = teamMap.get(team.id);
        if (!teamStat) return;

        if (team.roster) {
            team.roster.forEach(p => {
                if (p.stats && p.stats.season) {
                    teamStat.passOff += (p.stats.season.passYd || 0);
                    teamStat.rushOff += (p.stats.season.rushYd || 0);
                }
            });
        }
    });

    // 2. Defense Stats (from Results)
    if (league.resultsByWeek) {
        Object.values(league.resultsByWeek).forEach(weekGames => {
            if (Array.isArray(weekGames)) {
                weekGames.forEach(game => {
                    if (!game.finalized) return;

                    const homeId = typeof game.home === 'object' ? game.home.id : game.home;
                    const awayId = typeof game.away === 'object' ? game.away.id : game.away;

                    const homeStat = teamMap.get(homeId);
                    const awayStat = teamMap.get(awayId);

                    // Calculate Game Yards from Box Score
                    let homePass = 0, homeRush = 0;
                    let awayPass = 0, awayRush = 0;

                    if (game.boxScore) {
                        if (game.boxScore.home) {
                            Object.values(game.boxScore.home).forEach(p => {
                                if (p.stats) {
                                    homePass += (p.stats.passYd || 0);
                                    homeRush += (p.stats.rushYd || 0);
                                }
                            });
                        }
                        if (game.boxScore.away) {
                            Object.values(game.boxScore.away).forEach(p => {
                                if (p.stats) {
                                    awayPass += (p.stats.passYd || 0);
                                    awayRush += (p.stats.rushYd || 0);
                                }
                            });
                        }
                    }

                    if (homeStat) {
                        homeStat.passDef += awayPass;
                        homeStat.rushDef += awayRush;
                        homeStat.gamesPlayed++;
                    }

                    if (awayStat) {
                        awayStat.passDef += homePass;
                        awayStat.rushDef += homeRush;
                        awayStat.gamesPlayed++;
                    }
                });
            }
        });
    }

    // 3. Normalize per Game (needed because bye weeks create uneven games played)
    stats.forEach(s => {
        // Use max(1) to avoid division by zero if no games played,
        // though totals would be 0 anyway.
        const g = Math.max(1, s.gamesPlayed);

        // For offense, we summed season totals. We should divide by games played if we want per-game rank.
        // Assuming team.stats.season.gamesPlayed tracks the same count, but using our calculated count is safer for consistency.
        if (s.gamesPlayed > 0) {
            s.passOff /= g;
            s.rushOff /= g;
            s.passDef /= g;
            s.rushDef /= g;
        }
    });

    // 4. Sort and Rank
    const getRank = (list, id) => list.findIndex(s => s.id === id) + 1;

    const byPassOff = [...stats].sort((a, b) => b.passOff - a.passOff);
    const byRushOff = [...stats].sort((a, b) => b.rushOff - a.rushOff);
    // Defense: Lower yards allowed is better
    const byPassDef = [...stats].sort((a, b) => a.passDef - b.passDef);
    const byRushDef = [...stats].sort((a, b) => a.rushDef - b.rushDef);

    const ranks = {};
    stats.forEach(s => {
        ranks[s.id] = {
            passOff: getRank(byPassOff, s.id),
            rushOff: getRank(byRushOff, s.id),
            passDef: getRank(byPassDef, s.id),
            rushDef: getRank(byRushDef, s.id)
        };
    });

    return ranks;
}

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

    // --- CONTEXTUAL DRAMA LOGIC ---
    calculateGameStakes(league, userTeamId) {
        if (!league || userTeamId === undefined) return { score: 0, type: 'Normal', description: '' };

        const team = league.teams[userTeamId];
        const week = league.week;
        if (!team) return { score: 0, type: 'Normal', description: '' };

        // Determine opponent
        let opponent = null;
        const scheduleWeeks = league.schedule?.weeks || league.schedule || [];
        let weekData = null;

        if (Array.isArray(scheduleWeeks)) {
             weekData = scheduleWeeks.find(w => w && (w.weekNumber === week || w.week === week)) || scheduleWeeks[week - 1];
        } else if (typeof scheduleWeeks === 'object') {
             weekData = scheduleWeeks[week];
        }

        // Normalize games array from week data
        const games = Array.isArray(weekData) ? weekData : (weekData ? weekData.games : []);

        if (games) {
            const game = games.find(g => (g.home === userTeamId || (typeof g.home === 'object' && g.home.id === userTeamId)) || (g.away === userTeamId || (typeof g.away === 'object' && g.away.id === userTeamId)));
            if (game) {
                const homeId = typeof game.home === 'object' ? game.home.id : game.home;
                const awayId = typeof game.away === 'object' ? game.away.id : game.away;
                const oppId = homeId === userTeamId ? awayId : homeId;
                opponent = league.teams[oppId];
            }
        }

        // 1. Division Clinch Scenario
        // Simple heuristic: If leading division late in season
        const divTeams = league.teams.filter(t => t.conf === team.conf && t.div === team.div);
        divTeams.sort((a, b) => ((b.wins || b.record?.w || 0) - (a.wins || a.record?.w || 0)));
        const rank = divTeams.findIndex(t => t.id === team.id);
        const gamesRemaining = 18 - week;

        if (rank === 0 && week >= 14) {
            const secondPlace = divTeams[1];
            if (secondPlace) {
                const winsA = team.wins || team.record?.w || 0;
                const winsB = secondPlace.wins || secondPlace.record?.w || 0;
                const lead = winsA - winsB;
                // If lead is large enough relative to games remaining
                if (lead >= gamesRemaining && lead <= gamesRemaining + 1) {
                     return { score: 95, type: 'Division Clinch', description: 'Win and Clinch Division Title' };
                }
            }
        }

        // 2. Playoff Bubble
        // Conference Rank 7-9
        const confTeams = league.teams.filter(t => t.conf === team.conf).sort((a, b) => ((b.wins || b.record?.w || 0) - (a.wins || a.record?.w || 0)));
        const confRank = confTeams.findIndex(t => t.id === team.id) + 1;

        if (week >= 13 && confRank >= 6 && confRank <= 9) {
            return { score: 85, type: 'Playoff Bubble', description: 'Must-Win for Playoff Hopes' };
        }

        // 3. Coach Hot Seat
        if (window.state.ownerMode && window.state.ownerMode.enabled) {
            const satisfaction = window.state.ownerMode.fanSatisfaction;
            if (satisfaction < 35) {
                return { score: 90, type: 'Hot Seat', description: 'Job Security at Critical Level' };
            }
        }

        // 4. Rivalry
        if (opponent && team.rivalries && team.rivalries[opponent.id]) {
            const rivScore = team.rivalries[opponent.id].score;
            if (rivScore > 60) {
                return { score: 70 + (rivScore/5), type: 'Rivalry', description: `Bitter Rivals: ${opponent.name}` };
            }
        }

        return { score: 0, type: 'Normal', description: '' };
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

            // [DIAGNOSTICS] Prevent broken hub if league not loaded
            if (!window.state || !window.state.league) {
                // Show loading if we are just waiting for init
                if (showLoading) showLoading('Initializing League...');

                const errDetail = !window.state ? 'State object missing' : 'League object missing';
                console.error(`[Hub] Render blocked: ${errDetail}`);

                // If initialization takes too long, show the error state
                setTimeout(() => {
                    if (!window.state || !window.state.league) {
                        if (hideLoading) hideLoading();
                        hubContainer.innerHTML = `
                            <div class="card" style="text-align: center; padding: 40px;">
                                <h2>No Active League</h2>
                                <p class="muted">Load a save or create a new league to continue.</p>
                                <p class="small text-danger" style="margin-top:5px; opacity:0.8;">Error: ${errDetail}</p>
                                <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center;">
                                    <button class="btn primary" onclick="location.hash='#/leagueDashboard'">Load Save</button>
                                    <button class="btn" onclick="window.gameController.startNewLeague()">New League</button>
                                    <button class="btn secondary" onclick="location.hash='#/diagnostics'">Diagnostics</button>
                                </div>
                            </div>
                        `;
                    }
                }, 1000);
                return;
            }

            // Enhanced hub content with simulate league button
            const L = window.state.league;
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
            let currentWeekGames = [];

            if (!isOffseason) {
                // Support both legacy (Array of games per index) and new (Array of objects with weeks)
                // New format: L.schedule is Array of { weekNumber: 1, games: [...] }
                // Legacy format: L.schedule is Array of [game, game...] (flat) OR L.schedule.weeks
                let scheduleWeeks = L.schedule?.weeks || L.schedule || [];

                console.log(`[HUB-DEBUG] Resolving schedule for Week ${currentWeek}. Schedule type: ${Array.isArray(scheduleWeeks) ? 'Array' : typeof scheduleWeeks}`);

                // Find current week data
                let weekData = null;

                if (Array.isArray(scheduleWeeks)) {
                    // Try to find by weekNumber property first
                    weekData = scheduleWeeks.find(w => w && (w.weekNumber === currentWeek || w.week === currentWeek));

                    // Fallback to index-based access (Week 1 is usually index 0)
                    if (!weekData && scheduleWeeks[currentWeek - 1]) {
                        weekData = scheduleWeeks[currentWeek - 1];
                    }
                } else if (typeof scheduleWeeks === 'object') {
                    // Handle object map { 1: [...], 2: [...] } if legacy persists
                    weekData = scheduleWeeks[currentWeek];
                }

                if (weekData) {
                    // Normalize games array
                    currentWeekGames = Array.isArray(weekData) ? weekData : (weekData.games || []);

                    if (currentWeekGames.length > 0) {
                        nextGame = currentWeekGames.find(g => {
                            const hId = (g.home && typeof g.home === 'object') ? g.home.id : g.home;
                            const aId = (g.away && typeof g.away === 'object') ? g.away.id : g.away;
                            return hId === userTeamId || aId === userTeamId;
                        });

                        if (nextGame) {
                            // Ensure IDs are extracted correctly (handle object vs ID)
                            const homeId = (nextGame.home && typeof nextGame.home === 'object') ? nextGame.home.id : nextGame.home;
                            const awayId = (nextGame.away && typeof nextGame.away === 'object') ? nextGame.away.id : nextGame.away;

                            isHome = homeId === userTeamId;
                            const oppId = isHome ? awayId : homeId;
                            opponent = L.teams[oppId];
                        }
                    }
                } else {
                    console.warn(`[HUB-DEBUG] No week data found for week ${currentWeek}`);
                }
            }

            // --- OWNER'S GAMBLE (Trigger Week 1) ---
            if (userTeam && !isOffseason && L.week === 1 && !L.ownerChallenge) {
                // Trigger Owner's Gamble Modal
                setTimeout(() => {
                    if (window.triggerOwnerGamble) {
                        window.triggerOwnerGamble(L, userTeam);
                    }
                }, 500);
            }

            // --- CONTEXTUAL DRAMA BANNER (NEW) ---
            let dramaBannerHTML = '';
            if (userTeam && !isOffseason) {
                const stakes = this.calculateGameStakes(L, userTeamId);
                if (stakes && stakes.score > 75) {
                    let bannerColor = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)';
                    if (stakes.type === 'Hot Seat') bannerColor = 'linear-gradient(135deg, #742a2a 0%, #e53e3e 100%)'; // Red
                    else if (stakes.type === 'Division Clinch') bannerColor = 'linear-gradient(135deg, #276749 0%, #48bb78 100%)'; // Green
                    else if (stakes.type === 'Playoff Bubble') bannerColor = 'linear-gradient(135deg, #744210 0%, #d69e2e 100%)'; // Gold
                    else if (stakes.type === 'Rivalry') bannerColor = 'linear-gradient(135deg, #553c9a 0%, #805ad5 100%)'; // Purple

                    dramaBannerHTML = `
                        <div class="drama-banner" style="background: ${bannerColor}; border-radius: 12px; padding: 20px; margin-bottom: 20px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 2px solid rgba(255,255,255,0.2);">
                            <h2 style="margin: 0; font-size: 1.8rem; text-transform: uppercase; letter-spacing: 2px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">${stakes.type}</h2>
                            <p style="margin: 5px 0 0 0; font-size: 1.1rem; opacity: 0.9;">${stakes.description}</p>
                        </div>
                    `;
                }
            }

            // --- HEADER DASHBOARD GENERATION (ENHANCED) ---
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
                    return 0;
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

                // 2. Ratings (Enhanced)
                const ovr = userTeam.ratings?.overall ?? userTeam.overallRating ?? 0;
                const offOvr = userTeam.ratings?.offense?.overall ?? userTeam.offensiveRating ?? 0;
                const defOvr = userTeam.ratings?.defense?.overall ?? userTeam.defensiveRating ?? 0;

                // 3. Playoff Status / Odds
                let playoffStatus = "On Track";
                let playoffColor = "#48bb78";

                if (confRank <= 4) { playoffStatus = "Division Leader"; playoffColor = "#34d399"; }
                else if (confRank <= 7) { playoffStatus = "Playoff Seed"; playoffColor = "#60a5fa"; }
                else if (confRank <= 9) { playoffStatus = "On the Bubble"; playoffColor = "#fbbf24"; }
                else if (currentWeek > 14) { playoffStatus = "Long Shot"; playoffColor = "#f87171"; }
                else { playoffStatus = "In the Hunt"; playoffColor = "#9ca3af"; }

                if (wins === 0 && currentWeek > 4) { playoffStatus = "Draft Mode"; playoffColor = "#c084fc"; }

                // 4. Strengths & Weaknesses (Snapshot)
                const getPosGroupAvg = (pos) => {
                    const players = userTeam.roster.filter(p => p.pos === pos).sort((a,b) => b.ovr - a.ovr);
                    if (!players.length) return 0;
                    const count = ['QB','K','P'].includes(pos) ? 1 : ['RB','TE','S'].includes(pos) ? 2 : ['WR','LB','CB'].includes(pos) ? 3 : 4;
                    const top = players.slice(0, count);
                    return top.reduce((sum, p) => sum + (p.ovr || 0), 0) / top.length;
                };

                const positions = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S'];
                const groupRatings = positions.map(pos => ({ pos, rating: getPosGroupAvg(pos) })).sort((a,b) => b.rating - a.rating);

                const strengths = groupRatings.slice(0, 2).map(g => g.pos).join('/');
                const weaknesses = groupRatings.slice(-2).reverse().map(g => g.pos).join('/');

                // 5. Streak
                let streak = 0;
                if (L.resultsByWeek) {
                    for (let w = (L.week || 1) - 1; w >= 0; w--) {
                        const weekResults = L.resultsByWeek[w] || [];
                        const game = weekResults.find(g => g.home === userTeamId || g.away === userTeamId);
                        if (!game) continue;
                        const isHome = game.home === userTeamId;
                        const userScore = isHome ? game.scoreHome : game.scoreAway;
                        const oppScore = isHome ? game.scoreAway : game.scoreHome;
                        const won = userScore > oppScore;
                        const tied = userScore === oppScore;
                        if (tied) break;
                        if (streak === 0) streak = won ? 1 : -1;
                        else if (streak > 0 && won) streak++;
                        else if (streak < 0 && !won) streak--;
                        else break;
                    }
                }
                const streakStr = streak > 0 ? `W${streak}` : (streak < 0 ? `L${Math.abs(streak)}` : '-');

                // 6. Owner Grade & Cap
                const fanSat = window.state.ownerMode ? window.state.ownerMode.fanSatisfaction : 50;
                let ownerGrade = 'C';
                if (fanSat >= 90) ownerGrade = 'A';
                else if (fanSat >= 80) ownerGrade = 'B';
                else if (fanSat >= 70) ownerGrade = 'C';
                else if (fanSat >= 60) ownerGrade = 'D';
                else ownerGrade = 'F';

                const capSpace = (userTeam.capRoom || 0).toFixed(1);
                const capColor = userTeam.capRoom > 10 ? '#48bb78' : userTeam.capRoom > 0 ? '#fbbf24' : '#f87171';

                // Calculate Ranks
                const ranks = calculateTeamRanks(L);
                const userRanks = ranks[userTeamId] || { passOff: 0, rushOff: 0, passDef: 0, rushDef: 0 };

                const getRankColor = (rank) => {
                    if (rank <= 5) return '#48bb78'; // Top 5 Green
                    if (rank >= 28) return '#f87171'; // Bottom 5 Red
                    return 'inherit';
                };

                // --- HTML CONSTRUCTION (IMPROVED - COMPACT LAYOUT) ---
                headerDashboardHTML = `
                    <div class="team-header compact-header" style="padding: 15px; margin-bottom: 15px; flex-wrap: nowrap;">
                        <div class="team-primary-info">
                            <h1 class="team-name" style="font-size: 24px; margin-bottom: 4px;">${userTeam.name}</h1>
                            <div class="team-record" style="font-size: 20px;">
                                ${wins}-${losses}-${ties} <span style="font-size: 0.8em; opacity: 0.7;">(${streakStr})</span>
                            </div>
                             <div style="font-size: 0.8rem; opacity: 0.9;">
                                <span style="font-weight: 700; color: ${playoffColor};">${divRank}${divSuffix} Div</span>
                            </div>
                            <div style="font-size: 0.8rem; opacity: 0.7; margin-top: 4px;">
                                Upcoming Draft Class (${window.state.draftClass ? window.state.draftClass.length : 0} Prospects)
                            </div>
                        </div>

                        <!-- ADVANCE WEEK BUTTON (MOVED HERE) -->
                         <div class="week-summary" style="text-align: right; min-width: 150px; display: flex; flex-direction: column; justify-content: center;">
                            <div class="week-label" style="color: #ccc; margin-bottom: 8px; font-size: 14px;">Week ${currentWeek}</div>
                            ${!isOffseason ? `
                                <button id="btnAdvanceWeekTop" class="btn primary" style="width: 100%; padding: 10px; font-weight: bold; box-shadow: 0 4px 10px rgba(0,0,0,0.3); white-space: nowrap;">
                                    Advance Week >
                                </button>
                            ` : `<div class="tag is-info">Offseason</div>`}
                        </div>
                    </div>

                    <!-- FEATURED GAME CARD (MOVED HERE) -->
                    ${(opponent && !isOffseason) ? `
                        <div class="user-game-card featured" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border: 1px solid var(--accent); border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                                <h3 style="margin:0; color: var(--accent); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px;">Your Game This Week</h3>
                                ${nextGame && (nextGame.played || nextGame.finalized) ? '<span class="tag is-success">Final</span>' : '<span class="tag is-warning">Upcoming</span>'}
                            </div>

                            <div class="matchup" style="display: flex; justify-content: space-around; align-items: center; margin-bottom: 20px; font-size: 1.5rem; font-weight: bold;">
                                <div class="team away" style="text-align: center;">
                                    <div style="font-size: 2rem;">${isHome ? opponent.abbr : userTeam.abbr}</div>
                                    <div style="font-size: 0.8rem; opacity: 0.7;">${isHome ? (opponent.wins ?? opponent.record?.w ?? 0) : userTeam.wins}-${isHome ? (opponent.losses ?? opponent.record?.l ?? 0) : userTeam.losses}</div>
                                </div>
                                <div class="vs" style="font-size: 1rem; color: #666; font-weight: normal;">@</div>
                                <div class="team home" style="text-align: center;">
                                    <div style="font-size: 2rem;">${isHome ? userTeam.abbr : opponent.abbr}</div>
                                    <div style="font-size: 0.8rem; opacity: 0.7;">${isHome ? userTeam.wins : (opponent.wins ?? opponent.record?.w ?? 0)}-${isHome ? userTeam.losses : (opponent.losses ?? opponent.record?.l ?? 0)}</div>
                                </div>
                            </div>

                            ${nextGame && !nextGame.played && !nextGame.finalized ? `
                            <button
                                onclick="window.watchLiveGame(${nextGame.home.id || nextGame.home}, ${nextGame.away.id || nextGame.away})"
                                class="btn btn-watch"
                                style="width: 100%; background: var(--success); color: white; padding: 12px; font-size: 1.1rem; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s;"
                            >
                                📺 Watch Game
                            </button>
                            ` : `
                             <button class="btn" style="width: 100%; opacity: 0.5; cursor: default;">Game Finished</button>
                            `}
                        </div>
                    ` : ''}

                    <!-- STATS GRID (KEPT BUT MOVED DOWN) -->
                    <div class="team-stats-grid" style="margin-bottom: 20px; display: flex; gap: 10px; overflow-x: auto; padding-bottom: 5px;">
                            <div class="stat-card">
                                <div class="stat-label">Overall</div>
                                <div class="stat-value">${ovr}</div>
                            </div>

                            <div class="stat-card">
                                <div class="stat-label">Offense</div>
                                <div class="stat-value" style="color: #60a5fa;">${offOvr}</div>
                            </div>

                            <div class="stat-card">
                                <div class="stat-label">Defense</div>
                                <div class="stat-value" style="color: #f87171;">${defOvr}</div>
                            </div>

                            <div class="stat-card">
                                <div class="stat-label">Cap Space</div>
                                <div class="stat-value" style="color: ${capColor}; font-size: 1.2rem;">$${capSpace}M</div>
                            </div>
                    </div>

                    <style>
                    /* Improve top header spacing and sizing (Bug #5 Fix) */
                    .team-header {
                        padding: 24px;
                        background: linear-gradient(135deg, #0f3460 0%, #16213e 100%);
                        border-radius: 12px;
                        margin-bottom: 20px;
                        display: flex;
                        flex-wrap: wrap;
                        justify-content: space-between;
                        align-items: center;
                        gap: 20px;
                    }

                    .team-primary-info {
                        flex: 1;
                        min-width: 250px;
                    }

                    .team-name {
                        font-size: 32px;
                        font-weight: bold;
                        margin-bottom: 12px;
                        margin-top: 0;
                        color: white;
                    }

                    .team-record {
                        font-size: 24px;
                        color: #00d4ff;
                        font-weight: 600;
                        margin-bottom: 16px;
                    }

                    .team-stats-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                        gap: 16px;
                        flex: 2;
                        justify-content: flex-end;
                    }

                    .stat-card {
                        background: rgba(255, 255, 255, 0.05);
                        padding: 12px;
                        border-radius: 8px;
                        text-align: center;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        min-width: 90px;
                    }

                    .stat-card .stat-label {
                        font-size: 12px;
                        color: #999;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        margin-bottom: 6px;
                    }

                    .stat-card .stat-value {
                        font-size: 24px;
                        font-weight: bold;
                        color: white;
                    }

                    /* Mobile adjustments */
                    @media (max-width: 768px) {
                        .team-header {
                            padding: 16px;
                            flex-direction: column;
                            align-items: flex-start;
                        }

                        .team-stats-grid {
                            width: 100%;
                            display: grid;
                            grid-template-columns: repeat(2, 1fr);
                        }

                        .team-name {
                            font-size: 24px;
                        }

                        .team-record {
                            font-size: 20px;
                        }

                        .stat-value {
                            font-size: 20px;
                        }
                    }
                    </style>
                `;
            }

            // --- ACTION ITEMS (NEW) ---
            let actionItemsHTML = '';
            if (userTeam && !isOffseason) {
                const { blockers, warnings } = getActionItems(L, userTeam);
                if (blockers.length > 0 || warnings.length > 0) {
                    const items = [...blockers, ...warnings];
                    const listContent = items.map(item => `
                        <div class="action-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--hairline);">
                            <div>
                                <strong style="color: ${item.id.includes('roster_max') || item.id.includes('salary_cap') ? '#ef4444' : '#f59e0b'}">${item.title}</strong>
                                <div style="font-size: 0.9rem; color: var(--text-muted);">${item.description}</div>
                            </div>
                            ${item.action ?
                                `<button class="btn btn-sm" onclick="${item.action}">${item.actionLabel || 'Fix'}</button>` :
                                item.route ? `<button class="btn btn-sm" onclick="location.hash='${item.route}'">${item.actionLabel || 'Fix'}</button>` : ''
                            }
                        </div>
                    `).join('');

                    if (window.Card) {
                        const borderColor = blockers.length > 0 ? '#ef4444' : '#f59e0b';
                        // Create card using component
                        const card = new window.Card({
                            title: 'Action Items',
                            className: 'mb-4 action-items',
                            style: `border-left: 4px solid ${borderColor};`,
                            children: `<div class="action-list">${listContent}</div>`
                        });
                        actionItemsHTML = card.renderHTML();
                    } else {
                        // Fallback
                        actionItemsHTML = `
                            <div class="card mb-4 action-items" style="border-left: 4px solid ${blockers.length > 0 ? '#ef4444' : '#f59e0b'};">
                                <h3>Action Items</h3>
                                <div class="action-list">${listContent}</div>
                            </div>
                        `;
                    }
                }
            }

            // --- PLAYER TRACKING (NEW) ---
            let playerTrackingHTML = '';
            if (userTeam) {
                const updates = getTrackedPlayerUpdates ? getTrackedPlayerUpdates(L, currentWeek) : [];
                const followedPlayers = getFollowedPlayers ? getFollowedPlayers(L) : [];

                // Show updates or just list followed players if no updates
                let content = '';
                if (updates.length > 0) {
                    content = updates.slice(0, 3).map(update => `
                        <div class="tracking-item" style="border-bottom: 1px solid var(--hairline); padding: 8px 0; cursor: pointer;" onclick="if(window.viewPlayerStats) window.viewPlayerStats('${update.player.id}')">
                            <div style="display: flex; justify-content: space-between;">
                                <strong>${update.player.name} <span class="text-muted small">(${update.player.pos})</span></strong>
                                <span class="tag ${update.type === 'good' ? 'is-success' : update.type === 'bad' || update.type === 'injury' ? 'is-danger' : 'is-info'}">${update.type.toUpperCase()}</span>
                            </div>
                            <div style="font-size: 0.9rem; color: var(--text); opacity: 0.9;">${update.message}</div>
                        </div>
                    `).join('');
                } else if (followedPlayers.length > 0) {
                    content = followedPlayers.slice(0, 3).map(p => `
                        <div class="tracking-item" style="border-bottom: 1px solid var(--hairline); padding: 8px 0; cursor: pointer;" onclick="if(window.viewPlayerStats) window.viewPlayerStats('${p.id}')">
                            <div style="display: flex; justify-content: space-between;">
                                <strong>${p.name}</strong>
                                <span class="text-muted small">${p.pos} • OVR ${p.displayOvr || p.ovr}</span>
                            </div>
                            <div style="font-size: 0.85rem; color: var(--text-muted);">Status: ${p.injuryWeeks > 0 ? 'Injured' : 'Active'}</div>
                        </div>
                    `).join('');
                }

                if (content) {
                    playerTrackingHTML = `
                        <div class="card mb-4" id="hubTracking">
                            <h3 style="margin-bottom: 10px;">📌 Players You're Tracking</h3>
                            <div class="tracking-list">
                                ${content}
                            </div>
                            ${followedPlayers.length > 3 ? `<div style="text-align: right; margin-top: 5px;"><small class="text-muted">And ${followedPlayers.length - 3} others...</small></div>` : ''}
                        </div>
                    `;
                }
            }

            // --- MATCHUP COMPARISON STRIP (NEW) ---
            let matchupStripHTML = '';
            if (userTeam && !isOffseason && opponent) {
                 matchupStripHTML = renderMatchupComparison(userTeam, opponent, L);
            }

            // --- MANAGER PANEL (NEW) ---
            let managerPanelHTML = '';
            if (userTeam && !isOffseason && opponent) {
                // Ensure state exists
                if (!L.weeklyGamePlan) {
                    L.weeklyGamePlan = { offPlanId: 'BALANCED', defPlanId: 'BALANCED', riskId: 'BALANCED' };
                }
                const currentOff = OFFENSIVE_PLANS[L.weeklyGamePlan.offPlanId] || OFFENSIVE_PLANS.BALANCED;
                const currentDef = DEFENSIVE_PLANS[L.weeklyGamePlan.defPlanId] || DEFENSIVE_PLANS.BALANCED;
                const currentRisk = RISK_PROFILES[L.weeklyGamePlan.riskId] || RISK_PROFILES.BALANCED;

                // Infer Opponent Tendency (Simple Logic)
                const oppPassAtt = opponent.stats?.season?.passAtt || 0;
                const oppRushAtt = opponent.stats?.season?.rushAtt || 0;
                const totalPlays = oppPassAtt + oppRushAtt;
                let tendency = 'Balanced';
                if (totalPlays > 20) {
                    if (oppPassAtt / totalPlays > 0.60) tendency = 'Pass Heavy';
                    else if (oppRushAtt / totalPlays > 0.55) tendency = 'Run Heavy';
                }

                managerPanelHTML = `
                    <div class="card mb-4 manager-panel" style="border-left: 4px solid var(--accent); position: relative; overflow: hidden;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid var(--hairline); padding-bottom: 10px;">
                            <div>
                                <h3 style="margin:0; font-size: 1.2rem;">Manager Control Panel</h3>
                                <div style="font-size: 0.85rem; opacity: 0.8;">vs ${opponent.name} <span class="tag is-dark">${tendency}</span></div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 0.8rem; font-weight: bold; opacity: 0.6;">WEEKLY STRATEGY</div>
                                <button class="btn btn-sm" onclick="if(window.saveGame) window.saveGame()" style="margin-top: 4px;">Save Game</button>
                            </div>
                        </div>

                        <div class="grid two" style="gap: 20px;">
                            <!-- Game Plans -->
                            <div>
                                <label style="display:block; margin-bottom:8px; font-weight:bold; color: var(--text-highlight);">1. Offensive Plan</label>
                                <select id="managerOffPlan" class="form-control" style="width:100%; padding:10px; margin-bottom:10px; background: var(--surface-strong); border: 1px solid var(--border); color: white;">
                                    ${Object.values(OFFENSIVE_PLANS).map(p => `
                                        <option value="${p.id}" ${p.id === currentOff.id ? 'selected' : ''}>${p.name}</option>
                                    `).join('')}
                                </select>
                                <div id="offPlanDesc" style="font-size:0.85rem; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; margin-bottom: 15px;">
                                    <!-- Dynamic content rendered below -->
                                </div>

                                <label style="display:block; margin-bottom:8px; font-weight:bold; color: var(--text-highlight);">2. Defensive Plan</label>
                                <select id="managerDefPlan" class="form-control" style="width:100%; padding:10px; margin-bottom:10px; background: var(--surface-strong); border: 1px solid var(--border); color: white;">
                                    ${Object.values(DEFENSIVE_PLANS).map(p => `
                                        <option value="${p.id}" ${p.id === currentDef.id ? 'selected' : ''}>${p.name}</option>
                                    `).join('')}
                                </select>
                                <div id="defPlanDesc" style="font-size:0.85rem; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px;">
                                    <!-- Dynamic content rendered below -->
                                </div>
                            </div>

                            <!-- Risk Profile -->
                            <div>
                                <label style="display:block; margin-bottom:8px; font-weight:bold; color: var(--text-highlight);">3. Risk Profile</label>
                                <div class="btn-group" style="display:flex; gap:5px; margin-bottom: 10px;">
                                    ${Object.values(RISK_PROFILES).map(r => `
                                        <button class="btn btn-sm ${r.id === currentRisk.id ? 'primary' : 'secondary'} risk-btn"
                                            data-id="${r.id}" style="flex:1; padding: 10px;">
                                            ${r.name}
                                        </button>
                                    `).join('')}
                                </div>
                                <div id="riskDesc" style="font-size:0.85rem; color: var(--text-muted); padding: 0 5px;">
                                    ${currentRisk.description}
                                    <div style="margin-top:5px; font-weight:bold; color: ${currentRisk.id === 'AGGRESSIVE' ? '#f56565' : currentRisk.id === 'CONSERVATIVE' ? '#4299e1' : '#ed8936'};">
                                        Volatility: ${currentRisk.id === 'AGGRESSIVE' ? 'HIGH' : currentRisk.id === 'CONSERVATIVE' ? 'LOW' : 'NORMAL'}
                                    </div>
                                </div>
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

            // --- THIS WEEK'S GAMES (NEW) ---
            let thisWeekGamesHTML = '';
            if (!isOffseason && currentWeekGames.length > 0) {
                thisWeekGamesHTML = `
                    <div class="card mb-4">
                        <h3>This Week's Games (Week ${currentWeek})</h3>
                        <div class="games-list-preview" style="max-height: 300px; overflow-y: auto;">
                            ${currentWeekGames.map(g => {
                                const hId = typeof g.home === 'object' ? g.home.id : g.home;
                                const aId = typeof g.away === 'object' ? g.away.id : g.away;
                                const hTeam = L.teams[hId];
                                const aTeam = L.teams[aId];
                                const isUserGame = hId === userTeamId || aId === userTeamId;
                                const isFinal = g.finalized || g.played;

                                return `
                                    <div class="game-row ${isUserGame ? 'user-game-row' : ''}" style="display: flex; justify-content: space-between; padding: 8px; border-bottom: 1px solid var(--hairline); background: ${isUserGame ? 'rgba(52, 211, 153, 0.1)' : 'transparent'};">
                                        <div style="flex: 1;">
                                            <span style="${g.scoreAway > g.scoreHome ? 'font-weight:bold' : ''}">${aTeam ? aTeam.abbr : 'UNK'}</span>
                                            ${isFinal ? `<span class="muted">${g.scoreAway}</span>` : ''}
                                        </div>
                                        <div style="flex: 0 0 20px; text-align: center;">@</div>
                                        <div style="flex: 1; text-align: right;">
                                            ${isFinal ? `<span class="muted">${g.scoreHome}</span>` : ''}
                                            <span style="${g.scoreHome > g.scoreAway ? 'font-weight:bold' : ''}">${hTeam ? hTeam.abbr : 'UNK'}</span>
                                        </div>
                                        <div style="flex: 0 0 80px; text-align: right; margin-left: 10px;">
                                            ${isFinal
                                                ? `<span class="tag">Final</span>`
                                                : (isUserGame
                                                    ? `<button class="btn btn-xs primary" onclick="window.watchLiveGame(${hId}, ${aId})">Watch</button>`
                                                    : `<span class="muted text-small">vs</span>`)
                                            }
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        <div style="margin-top: 10px; text-align: center;">
                            <button class="btn btn-sm secondary" onclick="location.hash='#/schedule'">View Full Schedule</button>
                        </div>
                    </div>
                `;
            }

            // --- TOP PLAYERS / MATCHUP PREVIEW ---
            let topPlayersHTML = '';
            if (userTeam && !isOffseason) {
                const getTop3 = (team) => {
                    if (!team || !team.roster) return [];
                    return [...team.roster]
                        .filter(p => p && typeof p.ovr === 'number' && !isNaN(p.ovr))
                        .sort((a, b) => b.ovr - a.ovr)
                        .slice(0, 3);
                };

                const userTop3 = getTop3(userTeam);
                const oppTop3 = opponent ? getTop3(opponent) : [];

                topPlayersHTML = `
                    <div class="card mb-4" id="hubTopPlayers">
                        <h3>Matchup Preview: Top Talent</h3>
                        <div class="grid two">
                            <div>
                                <h4 style="border-bottom: 1px solid var(--hairline); padding-bottom: 5px; margin-bottom: 10px;">
                                    ${userTeam.name}
                                </h4>
                                <div class="player-list">
                                    ${userTop3.map(p => `
                                        <div class="player-item" style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid var(--hairline); cursor: pointer;" onclick="if(window.viewPlayerStats) window.viewPlayerStats('${p.id}')">
                                            <div>
                                                <span style="font-weight: 600;">${p.name}</span>
                                                <span class="text-muted small">(${p.pos})</span>
                                            </div>
                                            <div class="ovr-badge" style="padding: 2px 6px; border-radius: 4px; background: var(--surface-strong); font-weight: 700;">${p.ovr}</div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            <div>
                                <h4 style="border-bottom: 1px solid var(--hairline); padding-bottom: 5px; margin-bottom: 10px;">
                                    ${opponent ? opponent.name : 'No Opponent'}
                                </h4>
                                ${opponent ? `
                                <div class="player-list">
                                    ${oppTop3.map(p => `
                                        <div class="player-item" style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid var(--hairline); cursor: pointer;" onclick="if(window.viewPlayerStats) window.viewPlayerStats('${p.id}')">
                                            <div>
                                                <span style="font-weight: 600;">${p.name}</span>
                                                <span class="text-muted small">(${p.pos})</span>
                                            </div>
                                            <div class="ovr-badge" style="padding: 2px 6px; border-radius: 4px; background: var(--surface-strong); font-weight: 700;">${p.ovr}</div>
                                        </div>
                                    `).join('')}
                                </div>
                                ` : '<p class="muted">Bye Week or Season Over</p>'}
                            </div>
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
                ${dramaBannerHTML}
                ${actionItemsHTML}
                ${playerTrackingHTML}
                ${headerDashboardHTML}
                ${matchupStripHTML}
                ${managerPanelHTML}
                ${newsHTML}
                ${thisWeekGamesHTML}
                ${topPlayersHTML}
                <div class="card">
                    <h2>Team Hub</h2>
                    <div class="grid two">
                        <div>
                            <h3>Quick Actions</h3>
                            <div class="actions" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 8px;">
                                <button class="btn" onclick="if(window.saveGame) window.saveGame()" style="flex-direction: column; padding: 12px; text-align: center; height: 80px; justify-content: center; border: 1px solid var(--accent);">
                                    <span style="font-size: 24px; margin-bottom: 4px;">💾</span>
                                    Save
                                </button>
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
                            <h3>Week HQ</h3>
                            <div class="week-hq-card" style="background: var(--surface); padding: 15px; border-radius: 8px; border: 1px solid var(--hairline);">
                                <ul class="week-checklist" style="list-style: none; padding: 0; margin: 0 0 15px 0;">
                                    <li style="margin-bottom: 5px;">✅ <strong>Gameplan:</strong> Set</li>
                                    <li style="margin-bottom: 5px;">${window.state.scouting && window.state.scouting.used < window.state.scouting.budget ? '⚠️' : '✅'} <strong>Scouting:</strong> ${window.state.scouting ? Math.round((window.state.scouting.budget - window.state.scouting.used)/1000) + 'k left' : 'N/A'}</li>
                                    <li>✅ <strong>Training:</strong> Normal</li>
                                </ul>

                                ${!isOffseason ? `
                                    <button class="btn primary large" id="btnSimWeekHQ" style="width: 100%; padding: 15px; font-size: 1.1rem; justify-content: center; font-weight: bold; margin-bottom: 10px;">
                                        Advance Week >
                                    </button>
                                ` : ''}

                                <button class="btn btn-sm" id="btnSimSeason" onclick="handleSimulateSeason()" style="width: 100%; justify-content: center; opacity: 0.7;">Simulate Season</button>

                                ${(!isOffseason && L.week > 18 && (!window.state?.playoffs || !window.state.playoffs.winner))
                                    ? `<button class="btn primary" onclick="if(window.startPlayoffs) window.startPlayoffs();" style="justify-content: center; width: 100%;">Start Playoffs</button>`
                                    : ''
                                }

                                <button class="btn btn-sm" onclick="location.hash='#/standings'" style="justify-content: center; width: 100%; margin-top: 5px;">View Standings</button>

                                ${isOffseason ? `<button class="btn primary" id="btnStartNewSeason" style="justify-content: center; padding: 12px; width: 100%;">Start ${(L?.year || 2025) + 1} Season</button>` : ''}
                            </div>
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
            // Add event listeners for Manager Panel
            if (managerPanelHTML) {
                const offSelect = hubContainer.querySelector('#managerOffPlan');
                const defSelect = hubContainer.querySelector('#managerDefPlan');

                const renderBadges = (plan) => {
                     let badgesHtml = '';
                     if (plan.modifiers) {
                        Object.entries(plan.modifiers).forEach(([key, val]) => {
                            let label = key;
                            let isPositive = val > 1.0;

                            if(key === 'passVolume') label = 'Passing';
                            if(key === 'runVolume') label = 'Rushing';
                            if(key === 'intChance') { label = 'INT Risk'; isPositive = val < 1.0; }
                            if(key === 'sackChance') { label = 'Sack Risk'; isPositive = val < 1.0; }
                            if(key === 'variance') label = 'Variance';
                            if(key === 'defRunStop') label = 'Run Stop';
                            if(key === 'defPassCov') label = 'Pass Cov';
                            if(key === 'defIntChance') label = 'Int Chance';
                            if(key === 'defSackChance') label = 'Sack Chance';
                            if(key === 'defBigPlayAllowed') { label = 'Big Play'; isPositive = val < 1.0; }

                            if (Math.abs(val - 1.0) < 0.05) return;

                            const color = isPositive ? '#48bb78' : '#f56565';
                            const arrow = val > 1.0 ? '▲' : '▼';

                            badgesHtml += `<span style="display:inline-block; background:${color}22; color:${color}; border:1px solid ${color}44; border-radius:4px; padding:2px 6px; margin-right:4px; margin-bottom:4px; font-size:0.75rem; font-weight:bold;">${label} ${arrow}</span>`;
                        });
                     }
                     return badgesHtml;
                };

                const updateOffVisuals = (planId) => {
                    const plan = OFFENSIVE_PLANS[planId];
                    const descEl = hubContainer.querySelector('#offPlanDesc');
                    if (plan && descEl) {
                         const badgesHtml = renderBadges(plan);
                         descEl.innerHTML = `
                            <div style="margin-bottom: 8px;">${plan.description}</div>
                            <div style="margin-bottom: 6px;">${badgesHtml}</div>
                            <div style="font-size: 0.8rem; opacity: 0.8;">
                                <span style="color: #48bb78;">+ ${plan.bonus}</span><br>
                                <span style="color: #f56565;">- ${plan.penalty}</span>
                            </div>
                         `;
                    }
                };

                const updateDefVisuals = (planId) => {
                    const plan = DEFENSIVE_PLANS[planId];
                    const descEl = hubContainer.querySelector('#defPlanDesc');
                    if (plan && descEl) {
                         const badgesHtml = renderBadges(plan);
                         descEl.innerHTML = `
                            <div style="margin-bottom: 8px;">${plan.description}</div>
                            <div style="margin-bottom: 6px;">${badgesHtml}</div>
                            <div style="font-size: 0.8rem; opacity: 0.8;">
                                <span style="color: #48bb78;">+ ${plan.bonus}</span><br>
                                <span style="color: #f56565;">- ${plan.penalty}</span>
                            </div>
                         `;
                    }
                };

                // Initial Render
                if (offSelect) updateOffVisuals(offSelect.value);
                if (defSelect) updateDefVisuals(defSelect.value);

                const saveStrategy = () => {
                    const offPlan = offSelect ? offSelect.value : 'BALANCED';
                    const defPlan = defSelect ? defSelect.value : 'BALANCED';
                    const riskId = window.state.league.weeklyGamePlan?.riskId || 'BALANCED';
                    updateWeeklyStrategy(window.state.league, offPlan, defPlan, riskId);
                };

                if (offSelect) {
                    offSelect.addEventListener('change', (e) => {
                        updateOffVisuals(e.target.value);
                        saveStrategy();
                    });
                }

                if (defSelect) {
                    defSelect.addEventListener('change', (e) => {
                        updateDefVisuals(e.target.value);
                        saveStrategy();
                    });
                }

                const riskBtns = hubContainer.querySelectorAll('.risk-btn');
                riskBtns.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const newRiskId = e.target.getAttribute('data-id');
                        const offPlan = offSelect ? offSelect.value : 'BALANCED';
                        const defPlan = defSelect ? defSelect.value : 'BALANCED';
                        updateWeeklyStrategy(window.state.league, offPlan, defPlan, newRiskId);
                        this.renderHub();
                    });
                });
            }

            // Add event listeners for simulate buttons
            const btnSimWeekHQ = hubContainer.querySelector('#btnSimWeekHQ');
            if (btnSimWeekHQ) {
                btnSimWeekHQ.addEventListener('click', () => {
                    this.handleGlobalAdvance();
                });
            }

            const btnAdvanceWeekTop = hubContainer.querySelector('#btnAdvanceWeekTop');
            if (btnAdvanceWeekTop) {
                btnAdvanceWeekTop.addEventListener('click', () => {
                    this.handleGlobalAdvance();
                });
            }

            const btnSimSeason = hubContainer.querySelector('#btnSimSeason');
            const btnStartNewSeason = hubContainer.querySelector('#btnStartNewSeason');

            // Handle Hero Sim Button
            const btnSimWeekHero = hubContainer.querySelector('#btnSimWeekHero');
            if (btnSimWeekHero) {
                btnSimWeekHero.addEventListener('click', () => {
                    this.handleGlobalAdvance();
                });
            }
            // Handle Hero Sim Button - handled inline now for Watch Game
            // const btnSimWeekHero = hubContainer.querySelector('#btnSimWeekHero');
            // if (btnSimWeekHero) {
            //     btnSimWeekHero.addEventListener('click', () => {
            //         if (window.simulateWeek) {
            //             window.simulateWeek();
            //         } else {
            //             this.handleSimulateWeek();
            //         }
            //     });
            // }

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
                    if (startNewSeason) {
                        startNewSeason();
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

    // --- GLOBAL ADVANCE (New) ---
    handleGlobalAdvance() {
        const btn = document.getElementById('btnGlobalAdvance');
        const btnTop = document.getElementById('btnAdvanceWeekTop');
        const btnHQ = document.getElementById('btnSimWeekHQ');

        // Prevent double clicks if already simulating
        if (this.isSimulating) return;

        const L = window.state?.league;
        const userTeam = L?.teams?.[window.state?.userTeamId];

        if (!userTeam) return;

        const { blockers } = getActionItems(L, userTeam);

        if (blockers.length > 0) {
            // Navigate to HQ
            location.hash = '#/hub';
            // Show modal
            if (window.Modal) {
                const list = blockers.map(b => `<li><strong>${b.title}</strong>: ${b.description}</li>`).join('');
                const modal = new window.Modal({
                    title: 'Cannot Advance',
                    content: `
                        <div class="blocker-modal">
                            <p>You have blocking issues that must be resolved:</p>
                            <ul>${list}</ul>
                            <button class="btn primary" onclick="this.closest('.modal').remove()">OK</button>
                        </div>
                    `
                });
                modal.render();
            } else {
                alert(`Cannot advance:\n${blockers.map(b => b.description).join('\n')}`);
            }
            return;
        }

        // Proceed
        console.log('[GameController] Global Advance triggered');

        // Disable buttons
        if (btn) btn.disabled = true;
        if (btnTop) btnTop.disabled = true;
        if (btnHQ) btnHQ.disabled = true;

        this.isSimulating = true;

        this.handleSimulateWeek().finally(() => {
            this.isSimulating = false;
            if (btn) btn.disabled = false;
            if (btnTop) btnTop.disabled = false;
            if (btnHQ) btnHQ.disabled = false;
        });
    }

    // --- SIMULATION FUNCTIONS ---
    async handleSimulateWeek() {
        try {
            console.log('Simulating week...');
            showLoading('Simulating Week...');
            this.setStatus('Simulating week...', 'info');

            // Allow UI to update
            await new Promise(resolve => requestAnimationFrame(resolve));

            if (simulateWeek) {
                console.log('[GameController] Calling simulateWeek()');
                await simulateWeek();

                // Save game after simulation
                if (this.saveGameState) {
                    await this.saveGameState();
                }

                // Simulation complete, UI updated by worker callback
            } else {
                console.error('[GameController] simulateWeek function missing');
                this.setStatus('Simulation function not available', 'error');
            }
        } catch (error) {
            console.error('Error simulating week:', error);
            this.setStatus('Failed to simulate week', 'error');
        } finally {
            hideLoading();
        }
    }

    async handleSimulateSeason() {
        if (this.isSimulatingSeason) return;
        this.isSimulatingSeason = true;

        try {
            console.log('Simulating season...');
            showLoading('Simulating Season...');
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
                if (simulateWeek) {
                    simulateWeek({ render: false });
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
        } finally {
            this.isSimulatingSeason = false;
            hideLoading();
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

                                    if (game.finalized) {
                                        scheduleHTML += `<button class="btn btn-sm" onclick="window.showBoxScore && window.showBoxScore(${week}, ${idx})">📊 Box Score</button>`;
                                    } else {
                                        scheduleHTML += `<button class="btn btn-sm btn-primary watch-live-btn" onclick="if(window.watchLiveGame) { window.watchLiveGame(${homeId}, ${awayId}); } else { console.error('watchLiveGame not available'); }">📺 Watch Live</button>`;
                                    }
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
            const { chosenMode, teamIdx, startPoint } = options;
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

            // Get and validate teams
            const teams = this.listByMode(window.state.namesMode);
            if (teams.length === 0) {
                throw new Error('No teams available for selected mode');
            }
            if (!teams[window.state.userTeamId]) {
                 throw new Error(`Invalid team index: ${window.state.userTeamId} (Teams available: ${teams.length})`);
            }

            if (!window.makeLeague) {
                throw new Error('League creation system not available');
            }

            // Prepare dependencies for league creation
            const dependencies = {
                 Constants: window.Constants,
                 Utils: window.Utils,
                 makePlayer: window.makePlayer,
                 makeSchedule: window.makeSchedule,
                 recalcCap: window.recalcCap,
                 generateInitialStaff: window.generateInitialStaff
            };

            // Atomic League Creation
            // 1. Create League (in memory)
            const league = window.makeLeague(teams, options, dependencies);

            // 2. Validate League
            if (!league || !league.teams || league.teams.length === 0) {
                throw new Error('League generation failed: League object incomplete');
            }
            if (!league.teams[window.state.userTeamId]) {
                 // Check if user team got re-indexed or is missing
                 // This handles potential reordering by fixes.js or league.js
                 // We trust window.state.userTeamId is the intended index, but verify if it exists.
                 // Note: fixes.js wrapper might update window.state.userTeamId if reordering happens.
                 if (!league.teams[window.state.userTeamId]) {
                     throw new Error('User team not found in generated league');
                 }
            }

            // 3. Update State
            window.state.league = league;

            // FORCE DRAFT CLASS if missing (New Game Fix)
            if (!window.state.draftClass || window.state.draftClass.length === 0) {
                console.log('Forcing generation of missing draft class (New Game)...');
                const nextYear = (league.year || 2025) + 1;
                if (window.generateDraftClass) {
                    window.state.draftClass = window.generateDraftClass(nextYear);
                } else if (window.generateProspects) {
                    window.state.draftClass = window.generateProspects(nextYear);
                }
            }

            // Fix 1: Schema Migration (Fresh Init)
            if (migrateSchema) {
                migrateSchema(window.state.league);
            }

            // Ensure phase consistency
            if (startPoint === 'offseason') {
                window.state.league.offseason = true;
                // Ensure week is set reasonably if not already
                if (!window.state.league.week) window.state.league.week = 1;
            }

            if (window.ensureFA) {
                try {
                    window.ensureFA();
                } catch (error) {
                    console.warn('Failed to initialize free agency:', error);
                }
            }

            // Validation Check: Ensure League Assets are Fully Loaded
            if (!window.state.league || !Array.isArray(window.state.league.teams) || window.state.league.teams.length === 0) {
                throw new Error("League validation failed: Roster assets not fully loaded.");
            }
            if (!window.state.league.schedule) {
                // Schedule might be empty if not generated yet, but object should exist
                throw new Error("League validation failed: Schedule assets missing.");
            }

            // [Fix] Storage Health Check
            try {
                localStorage.setItem('__storage_test__', '1');
                localStorage.removeItem('__storage_test__');
            } catch (e) {
                console.error('Storage health check failed:', e);
                // On iOS, quota exceeded or private mode can cause this
                const proceed = confirm("Storage Warning: Local storage is unavailable or full. Progress will not be saved.\n\nContinue playing without saving?");
                if (!proceed) {
                    throw new Error("Storage unavailable (User cancelled)");
                }
                window.state.noSave = true;
            }

            // Save state via wrapper; returns an object with success
            if (!window.state.noSave) {
                const saveResult = await this.saveGameState();
                if (!saveResult.success) {
                    console.error('Failed to save initial game state:', saveResult.error);
                    // Downgrade to no-save mode instead of crashing
                    window.state.noSave = true;
                    this.setStatus('Warning: Save failed (Storage Full). Game will not be persisted.', 'warning', 5000);
                }
            }
            
            // Ensure state is properly set
            if (!window.state.onboarded) {
                window.state.onboarded = true;
            }
            
            // Reset needsSave since we just saved
            if (window.state) {
                window.state.needsSave = false;
            }
            
            console.log('✅ League created successfully:', {
                teams: window.state.league?.teams?.length || 0,
                userTeamId: window.state.userTeamId,
                onboarded: window.state.onboarded,
                hasLeague: !!window.state.league
            });
            
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
            // Clean up partial state to prevent zombie UI
            window.state = null;
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
        if (showLoading) showLoading('Initializing...');
        try {
            // ENTRY FLOW UPDATE: Check for saves first
            const hasSaves = hasSavedLeagues ? hasSavedLeagues() : (window.hasSavedLeagues ? window.hasSavedLeagues() : false);

            // Initialize base state (for theme, etc)
            window.state = initState();
            this.applyTheme(window.state.theme || 'dark');

            // [DIAGNOSTICS] Allow direct access to diagnostics
            if (location.hash && location.hash.startsWith('#/diagnostics')) {
                console.log('Diagnostics mode detected, bypassing auth flow.');
                this.setupEventListeners();
                this.setupAutoSave();
                this.initialized = true;
                this.router('diagnostics');
                return;
            }

            if (hasSaves) {
                // Check if we can resume the last played league
                let lastLeague = window.getLastPlayedLeague ? window.getLastPlayedLeague() : null;
                let loaded = null;

                // 1. Try last played
                if (lastLeague && window.loadLeague) {
                    loaded = await window.loadLeague(lastLeague);
                }

                // 2. If failed, try to find ANY saved league
                if ((!loaded || !window.state || !window.state.league) && window.loadLeague) {
                    console.warn("Last played league load failed, searching for any save...");
                    // Standard prefix
                    const DB_KEY_PREFIX = 'football_gm_league_';
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && key.startsWith(DB_KEY_PREFIX)) {
                            const name = key.replace(DB_KEY_PREFIX, '');
                            console.log("Found backup save:", name);
                            loaded = await window.loadLeague(name);
                            if (loaded) break;
                        }
                    }
                }

                // 3. Fallback: User requested 'football-gm-league' key support
                if (!loaded || !window.state || !window.state.league) {
                     try {
                        const simpleSave = localStorage.getItem('football-gm-league');
                        if (simpleSave) {
                            console.log("Found legacy/simple save 'football-gm-league'");
                            const parsed = JSON.parse(simpleSave);
                            if (parsed && (parsed.league || parsed.teams)) { // Heuristic check
                                window.state = parsed;
                                // Ensure state integrity
                                if (!window.state.league && window.state.teams) {
                                    // Old format where league was root? Unlikely but handling
                                }
                                loaded = window.state;
                                // Save it properly for next time
                                if (window.saveGame) window.saveGame();
                            }
                        }
                     } catch(e) {
                         console.error("Simple save load error:", e);
                     }
                }

                // STRICT CHECK: Ensure league object exists
                if (loaded && window.state && window.state.league) {
                    console.log("Resuming league successfully.");

                    // FORCE DRAFT CLASS if missing (Resume Fix)
                    if (!window.state.draftClass || window.state.draftClass.length === 0) {
                        console.log('Forcing generation of missing draft class (Resume)...');
                        const nextYear = (window.state.league.year || 2025) + 1;
                        if (window.generateDraftClass) {
                            window.state.draftClass = window.generateDraftClass(nextYear);
                        } else if (window.generateProspects) {
                            window.state.draftClass = window.generateProspects(nextYear);
                        }
                    }

                    // Persist critical IDs for rehydration on refresh
                    try {
                        if (window.state.userTeamId !== undefined) {
                            localStorage.setItem('nflGM4.userTeamId', String(window.state.userTeamId));
                        }
                    } catch (e) { /* non-critical */ }
                    this.initialized = true;
                    this.setupEventListeners();
                    this.setupAutoSave();
                    // Route to hub (or current view if saved)
                    const savedView = window.state.currentView || 'hub';
                    location.hash = `#/${savedView}`;
                    this.router(savedView);
                    return; // Skip dashboard
                } else {
                    console.error("Resume failed: Loaded state is invalid or league missing.", { loaded: !!loaded, state: !!window.state, league: !!window.state?.league });
                }

                // Saves exist but resume failed or no last played: Go to Dashboard (Entry Screen)
                console.log('Saves found but could not load automatically, routing to dashboard.');
                location.hash = '#/leagueDashboard';
                // Explicitly call router since listeners might not be ready
                this.router('leagueDashboard');
            } else {
                // Check for simple save key before onboarding (in case hasSavedLeagues missed it)
                const simpleSave = localStorage.getItem('football-gm-league');
                if (simpleSave) {
                     try {
                        console.log("Found legacy/simple save 'football-gm-league' (Recov)");
                        const parsed = JSON.parse(simpleSave);
                        if (parsed && (parsed.league || parsed.teams)) {
                            window.state = parsed;
                            this.initialized = true;
                            this.setupEventListeners();
                            this.setupAutoSave();
                            if (window.saveGame) window.saveGame(); // Upgrade to new format
                            const savedView = window.state.currentView || 'hub';
                            location.hash = `#/${savedView}`;
                            this.router(savedView);
                            return;
                        }
                     } catch(e) {
                         console.error("Recovery load failed:", e);
                     }
                }

                // No saves: Go to Onboarding
                console.log('No saves found, starting onboarding.');

                // FALLBACK: Ensure state exists to prevent crash before onboarding
                if (!window.state) {
                    window.state = window.initState ? window.initState() : {};
                }

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
        } finally {
            if (hideLoading) hideLoading();
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

        // Sound Toggle UI
        const navContainer = document.querySelector('.nav-toggle-container');
        if (navContainer && !document.getElementById('soundToggle')) {
            const soundBtn = document.createElement('button');
            soundBtn.id = 'soundToggle';
            soundBtn.className = 'nav-toggle'; // Style like nav toggle
            soundBtn.style.marginRight = '10px';
            soundBtn.style.background = 'none';
            soundBtn.style.border = 'none';
            soundBtn.style.color = 'var(--text)';
            soundBtn.style.cursor = 'pointer';
            soundBtn.setAttribute('aria-label', 'Toggle Sound');

            const updateIcon = () => {
                const enabled = window.state?.settings?.soundEnabled;
                // Icons: SpeakerHigh vs SpeakerSlash
                soundBtn.innerHTML = enabled
                    ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>'
                    : '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';
            };

            // Initialize from LocalStorage
            if (!window.state) window.state = { settings: {} };
            if (!window.state.settings) window.state.settings = {};

            const storedSound = localStorage.getItem('nflGM_sound');
            if (storedSound !== null) {
                window.state.settings.soundEnabled = (storedSound === 'true');
            } else if (window.state.settings.soundEnabled === undefined) {
                window.state.settings.soundEnabled = true; // Default On
            }

            // Sync initial state with SoundManager
            if (window.soundManager) {
                window.soundManager.muted = !window.state.settings.soundEnabled;
            }

            updateIcon();

            soundBtn.addEventListener('click', () => {
                if (!window.state.settings) window.state.settings = {};
                window.state.settings.soundEnabled = !window.state.settings.soundEnabled;
                localStorage.setItem('nflGM_sound', window.state.settings.soundEnabled);
                // Also save to gameSettings for consistency with SettingsContext request
                localStorage.setItem('gameSettings', JSON.stringify(window.state.settings));

                // Sync with SoundManager
                if (window.soundManager) {
                    window.soundManager.muted = !window.state.settings.soundEnabled;
                }

                updateIcon();
            });

            // Insert before nav toggle if possible
            navContainer.insertBefore(soundBtn, navContainer.firstChild);
        }

        // FIX: Menu Toggle (ZenGM Style) - Removed duplicate handler
        // ui-interactions.js handles mobile menu toggle via .nav-toggle

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

        // --- NEW: Global Advance Button ---
        const btnGlobalAdvance = document.getElementById('btnGlobalAdvance');
        if (btnGlobalAdvance) {
            this.addEventListener(btnGlobalAdvance, 'click', () => {
                this.handleGlobalAdvance();
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

            // REHYDRATION MIDDLEWARE: If state is empty on a hash change
            // (e.g. user refreshed), attempt to reload from storage before
            // redirecting to the login/onboarding screen.
            if (!window.state?.league && hash !== 'leagueDashboard') {
                console.warn('[ROUTER] State empty on navigation to', hash, '- attempting rehydration');
                this._rehydrateAndRoute(hash);
                return;
            }

            // Save current view to state for persistence
            if (window.state) {
                window.state.currentView = hash;
            }
            if (window.router && typeof window.router === 'function') {
                window.router(hash);
            }
        } catch (error) {
            console.error('Error handling hash change:', error);
        }
    }

    /**
     * Attempts to rehydrate state from localStorage/IndexedDB before routing.
     * If rehydration fails, redirects to the league dashboard instead of
     * showing a white screen.
     */
    async _rehydrateAndRoute(targetHash) {
        try {
            // Check for persisted league identity
            const savedLeagueName = localStorage.getItem('football_gm_last_played');
            const savedUserTeamId = localStorage.getItem('nflGM4.userTeamId');

            if (savedLeagueName && window.loadLeague) {
                console.log('[ROUTER] Rehydrating from saved league:', savedLeagueName);
                const loaded = await window.loadLeague(savedLeagueName);
                if (loaded && window.state?.league) {
                    // Restore userTeamId if it was persisted separately
                    if (savedUserTeamId !== null && window.state.userTeamId === undefined) {
                        window.state.userTeamId = parseInt(savedUserTeamId, 10) || 0;
                    }
                    window.state.currentView = targetHash;
                    this.router(targetHash);
                    return;
                }
            }

            // Fallback: try legacy state loader
            if (loadState) {
                const gameData = await loadState();
                if (gameData && window.state?.league) {
                    if (savedUserTeamId !== null && window.state.userTeamId === undefined) {
                        window.state.userTeamId = parseInt(savedUserTeamId, 10) || 0;
                    }
                    window.state.currentView = targetHash;
                    this.router(targetHash);
                    return;
                }
            }

            // Rehydration failed - go to dashboard gracefully
            console.warn('[ROUTER] Rehydration failed, redirecting to dashboard');
            location.hash = '#/leagueDashboard';
            if (window.renderDashboard) window.renderDashboard();
        } catch (error) {
            console.error('[ROUTER] Rehydration error:', error);
            location.hash = '#/leagueDashboard';
            if (window.renderDashboard) window.renderDashboard();
        }
    }

    // --- AUTO-SAVE SYSTEM ---
    setupAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
        // Auto-save every 60 seconds (User Request)
        this.autoSaveInterval = setInterval(() => {
            if (window.state?.onboarded) {
                // Always try to save if onboarded, not just if needsSave (for robustness)
                this.saveGameState().then(result => {
                    if (result.success) {
                        window.state.needsSave = false;
                        console.log('Auto-saved at', new Date().toLocaleTimeString());
                    }
                }).catch(error => {
                    console.error('Auto-save failed:', error);
                });
            }
        }, 60000);
    }

    // --- ENHANCED SAVE/LOAD ---
    async saveGameState(stateToSave = null) {
        // [Fix] Respect noSave flag
        if (window.state && window.state.noSave) {
            console.warn('Save skipped: noSave mode active');
            return { success: true, skipped: true };
        }

        try {
            // Persist critical identifiers independently so refresh can rehydrate
            try {
                const st = stateToSave || window.state;
                if (st?.userTeamId !== undefined) {
                    localStorage.setItem('nflGM4.userTeamId', String(st.userTeamId));
                }
                if (st?.leagueName) {
                    localStorage.setItem('football_gm_last_played', st.leagueName);
                }
            } catch (e) { /* non-critical */ }

            // Use new Dashboard Save System if available
            if (window.saveGame) {
                await window.saveGame(stateToSave);
                return { success: true };
            }

            // Fallback to legacy
            if (saveState) {
                const ok = await saveState(stateToSave);
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
                    const loadedState = await window.loadLeague(lastLeague);
                    if (loadedState) {
                        // Validation Check
                        if (!loadedState.league || !Array.isArray(loadedState.league.teams)) {
                            console.error("Loaded state invalid:", loadedState);
                            throw new Error("Invalid league state loaded");
                        }
                        return { success: true, gameData: loadedState };
                    }
                }
            }

            // Fallback: Legacy State System
            if (loadState) {
                const gameData = await loadState();
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
        try {
            if (!viewName) {
                viewName = location.hash.slice(2) || 'hub';
            }
            console.log('🔄 Router navigating to:', viewName);

            // Cleanup Live Game if leaving
            if (window.liveGameViewer && viewName !== 'game-sim') {
                if (window.liveGameViewer.isPlaying || window.liveGameViewer.isPaused) {
                    window.liveGameViewer.stopGame();
                }
            }

            // Guard: If league data is missing and we're trying to render
            // a game view, redirect to dashboard instead of crashing
            const gameViews = ['hub', 'roster', 'contracts', 'cap', 'schedule',
                'game-results', 'powerRankings', 'trade', 'freeagency', 'scouting',
                'coaching', 'draft', 'awards', 'injuries', 'news', 'owner',
                'relocation', 'playoffs', 'stats', 'leagueStats', 'game-sim', 'player'];

            if (!window.state?.league && gameViews.includes(viewName.split('/')[0])) {
                // If initializing (e.g. from refresh), show loading instead of bouncing
                // We simulate this by checking if we have a save loaded but league is null (unlikely in this flow, but good for safety)
                // or if we simply want to gate access.
                console.warn('[ROUTER] No league data for view:', viewName);

                // Show Loading Screen (Zero-State Initialization Fix)
                const mainContent = document.getElementById('main-content');
                if (mainContent) {
                    mainContent.innerHTML = `
                        <div class="min-h-screen flex items-center justify-center bg-gray-900" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh;">
                            <div class="loading-spinner" style="width: 50px; height: 50px; border: 5px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: var(--accent); animation: spin 1s ease-in-out infinite; margin-bottom: 20px;"></div>
                            <div class="text-white text-xl" style="font-size: 1.5rem; color: white;">Initializing League...</div>
                            <p class="muted" style="margin-top: 10px;">Please wait while we load your game.</p>
                        </div>
                    `;
                }
                return; // Stop processing router
            }

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
            case 'news':
                if (renderNewsroom) {
                    renderNewsroom();
                }
                break;
            case 'owner':
                if (window.renderOwnerModeInterface) {
                    window.renderOwnerModeInterface();
                    // Move interface to owner view container if it was appended to hub
                    const ownerView = document.getElementById('owner');
                    const ownerInterface = document.getElementById('ownerModeInterface');
                    if (ownerView && ownerInterface && ownerInterface.parentElement !== ownerView) {
                        ownerView.innerHTML = '';
                        ownerView.appendChild(ownerInterface);
                    }
                }
                break;
            case 'relocation':
                if (window.renderRelocationPage) {
                    window.renderRelocationPage();
                }
                break;
            case 'diagnostics':
                renderDiagnostics();
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
            case 'game-sim':
                if (window.liveGameViewer && typeof window.liveGameViewer.restoreTempState === 'function') {
                     const restored = window.liveGameViewer.restoreTempState();
                     if (restored) {
                         window.liveGameViewer.renderToView('#game-sim');
                         window.liveGameViewer.isPaused = true;
                     } else {
                         window.setStatus('No active game found.', 'warning');
                         location.hash = '#/hub';
                     }
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
        } catch (error) {
            console.error("Router Error:", error);
            this.setStatus('Navigation Error - returning to Hub', 'error');
            // Prevent infinite loops if hub fails
            if (viewName !== 'hub') {
                setTimeout(() => {
                    location.hash = '#/hub';
                    this.renderHub();
                }, 1000);
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

// Initialize Error Boundary
initErrorBoundary();

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
// Export Global Advance
window.handleGlobalAdvance = gameController.handleGlobalAdvance.bind(gameController);

console.log('✅ GameController functions exported globally (patched version)');

// --- HEADER & DASHBOARD FIXES ---

window.updateHeader = function() {
    // Update Command Center Footer
    if (window.updateCommandCenter) {
        window.updateCommandCenter();
    }

    const L = window.state?.league;
    const seasonNow = document.getElementById('seasonNow');
    const capUsed = document.getElementById('capUsed');
    const capTotal = document.getElementById('capTotal');
    const deadCap = document.getElementById('deadCap');
    const capRoom = document.getElementById('capRoom');
    const hubWeek = document.getElementById('hubWeek');

    // [DIAGNOSTICS] App Health Indicator
    let healthIndicator = document.getElementById('appHealthIndicator');
    if (!healthIndicator) {
        const headerRight = document.querySelector('.header-right') || document.querySelector('.nav-items-right') || document.body;
        // Try to find a good spot in the header
        const navToggle = document.getElementById('navToggle');
        if (navToggle && navToggle.parentNode) {
            healthIndicator = document.createElement('div');
            healthIndicator.id = 'appHealthIndicator';
            // Insert before the toggle
            navToggle.parentNode.insertBefore(healthIndicator, navToggle);
        }
    }

    if (healthIndicator) {
        healthIndicator.style.width = '12px';
        healthIndicator.style.height = '12px';
        healthIndicator.style.borderRadius = '50%';
        healthIndicator.style.display = 'inline-block';
        healthIndicator.style.marginRight = '15px';
        healthIndicator.style.cursor = 'pointer';
        healthIndicator.onclick = () => location.hash = '#/diagnostics';

        const errorCount = window._errorLog ? window._errorLog.length : 0;
        if (errorCount > 0) {
            healthIndicator.style.backgroundColor = '#f87171'; // Red
            healthIndicator.title = `${errorCount} Errors Detected`;
        } else if (window.state && window.state.needsSave) {
            healthIndicator.style.backgroundColor = '#fbbf24'; // Yellow
            healthIndicator.title = 'Unsaved Changes';
        } else {
            healthIndicator.style.backgroundColor = '#34d399'; // Green
            healthIndicator.title = 'System Healthy';
        }
    }

    // Use state fallbacks if league is missing (Fix Zero State)
    const year = L?.year || window.state?.season || new Date().getFullYear();
    const week = L?.week || window.state?.week || 1;

    if (seasonNow) seasonNow.textContent = year;
    if (hubWeek) hubWeek.textContent = week;

    if (L) {
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

/**
 * Triggers the "Owner's Gamble" modal in Week 1
 */
window.triggerOwnerGamble = function(league, team) {
    if (document.getElementById('ownerGambleModal')) return; // Already open

    const modal = document.createElement('div');
    modal.id = 'ownerGambleModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px; text-align: center; border: 2px solid #ffd700; background: linear-gradient(145deg, #1a1a1a, #2a2a2a);">
            <h2 style="color: #ffd700; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 10px;">The Owner's Gamble</h2>
            <p style="color: #ddd; margin-bottom: 20px;">The owner wants to place a wager on this season's outcome. Choose wisely.</p>

            <div class="gamble-options" style="display: grid; gap: 15px; text-align: left;">
                <div class="gamble-card" onclick="selectGamble('SAFE')" style="padding: 15px; border: 1px solid #555; border-radius: 8px; cursor: pointer; transition: all 0.2s; background: rgba(255,255,255,0.05);">
                    <h3 style="color: #fff; margin: 0 0 5px 0;">Option A: The Safe Bet</h3>
                    <div style="font-size: 0.9rem; color: #aaa;">Win 6 Games</div>
                    <div style="font-size: 0.8rem; color: #888; margin-top: 5px;">Reward: None | Penalty: None</div>
                </div>

                <div class="gamble-card" onclick="selectGamble('AGGRESSIVE')" style="padding: 15px; border: 1px solid #ffd700; border-radius: 8px; cursor: pointer; transition: all 0.2s; background: rgba(255, 215, 0, 0.1);">
                    <h3 style="color: #ffd700; margin: 0 0 5px 0;">Option B: Aggressive</h3>
                    <div style="font-size: 0.9rem; color: #eee;">Make Playoffs</div>
                    <div style="font-size: 0.8rem; color: #ccc; margin-top: 5px;">Reward: +$5M Cap Room | Penalty: -$2M Cap Room</div>
                </div>

                <div class="gamble-card" onclick="selectGamble('ALL_IN')" style="padding: 15px; border: 1px solid #ff4444; border-radius: 8px; cursor: pointer; transition: all 0.2s; background: rgba(255, 68, 68, 0.1);">
                    <h3 style="color: #ff4444; margin: 0 0 5px 0;">Option C: All In</h3>
                    <div style="font-size: 0.9rem; color: #eee;">Win Conference Championship</div>
                    <div style="font-size: 0.8rem; color: #ccc; margin-top: 5px;">Reward: +$15M Cap Room | Penalty: -$10M Cap (or Fired)</div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    window.selectGamble = function(type) {
        const modalContent = modal.querySelector('.modal-content');
        modalContent.classList.add('modal-gamble-accept');

        // Define challenge object
        const challenges = {
            'SAFE': { target: 'WINS_6', reward: 0, penalty: 0, description: 'Win 6 Games' },
            'AGGRESSIVE': { target: 'PLAYOFFS', reward: 5, penalty: -2, description: 'Make Playoffs' },
            'ALL_IN': { target: 'CONF_CHAMP', reward: 15, penalty: -10, description: 'Win Conference Championship' }
        };

        league.ownerChallenge = {
            type: type,
            ...challenges[type],
            status: 'PENDING'
        };

        // Save immediately
        if (window.saveGame) window.saveGame();

        // Remove after animation
        setTimeout(() => {
            modal.remove();
            window.setStatus(`Owner's Gamble Accepted: ${challenges[type].description}`, 'success');
            // Clean up global function
            delete window.selectGamble;
        }, 600); // Match animation duration
    };
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

    // Initialize Global Sounds
    if (window.soundManager && window.soundManager.setupGlobalSounds) {
        window.soundManager.setupGlobalSounds();
    }
});
