// team-ratings.js - Team Rating System & League Calibration
'use strict';

/**
 * Helper to group players by position and sort by OVR descending.
 * This optimizes performance by doing a single pass over the roster.
 * @param {Array} roster - Team roster array
 * @returns {Object} Map of position -> sorted array of players
 */
function groupPlayersByPosition(roster) {
    const groups = {};
    if (!roster) return groups;
    for (const player of roster) {
        const pos = player.pos || 'UNK';
        if (!groups[pos]) groups[pos] = [];
        groups[pos].push(player);
    }
    // Pre-sort by overall rating descending for faster access
    // Use raw OVR for sorting to find best players
    for (const pos in groups) {
        groups[pos].sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
    }
    return groups;
}

// ============================================================================
// LEAGUE CALIBRATION SYSTEM
// ============================================================================

/**
 * Calculates league-wide stats (Mean/StdDev) based on projected starters.
 * @param {Object} league - League object
 * @returns {Object} { mean, stdDev }
 */
function calculateLeagueStats(league) {
    if (!league || !league.teams) return { mean: 75, stdDev: 10 };

    const starterOVRs = [];
    
    // Definition of a "Starter" structure per team for calibration
    const starterCounts = {
        'QB': 1, 'RB': 1, 'WR': 3, 'TE': 1, 'OL': 5,
        'DL': 4, 'LB': 3, 'CB': 3, 'S': 2, 'K': 1, 'P': 1
    };
    // Map general positions if needed (CB/S -> DB handled below if groups are specific)

    league.teams.forEach(team => {
        const groups = groupPlayersByPosition(team.roster);

        Object.keys(starterCounts).forEach(pos => {
            const count = starterCounts[pos];
            // Handle DB split if needed, but assuming standard positions
            let players = groups[pos] || [];
            
            // If pos is DB, combine CB and S? No, standard positions usually distinct.
            // But if roster uses DL/LB/CB/S, we are good.
            
            for (let i = 0; i < Math.min(count, players.length); i++) {
                starterOVRs.push(players[i].ovr || 50);
            }
        });
    });

    if (starterOVRs.length === 0) return { mean: 75, stdDev: 10 };

    // Calculate Mean
    const sum = starterOVRs.reduce((a, b) => a + b, 0);
    const mean = sum / starterOVRs.length;

    // Calculate StdDev
    const sqDiffSum = starterOVRs.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
    const stdDev = Math.sqrt(sqDiffSum / starterOVRs.length);

    console.log(`[Calibration] Starters: ${starterOVRs.length}, Mean: ${mean.toFixed(2)}, StdDev: ${stdDev.toFixed(2)}`);

    return { mean, stdDev };
}

/**
 * Calibrates a raw OVR to a display OVR based on league stats.
 * Target: League Average Starter ≈ 70 OVR (can be tuned).
 * Formula: 70 + z-score * 7 (scaling factor)
 * @param {number} rawOvr - The internal/raw overall rating
 * @param {Object} stats - { mean, stdDev }
 * @returns {number} Calibrated display OVR
 */
function calibrateRating(rawOvr, stats) {
    if (!stats || !stats.stdDev) return rawOvr;
    
    const zScore = (rawOvr - stats.mean) / stats.stdDev;
    // Target mean 73 to make it feel a bit better than 70
    const calibrated = 73 + (zScore * 8);

    return Math.round(Math.max(40, Math.min(99, calibrated)));
}

/**
 * Updates all players in the league with a calibrated displayOvr.
 * Should be called at league creation and start of each season.
 * @param {Object} league - League object
 */
function updateLeaguePlayers(league) {
    if (!league || !league.teams) return;

    const stats = calculateLeagueStats(league);
    league.ratingStats = stats; // Store for use by new players

    league.teams.forEach(team => {
        if (team.roster) {
            team.roster.forEach(player => {
                player.displayOvr = calibrateRating(player.ovr || 50, stats);
            });
        }
    });

    console.log('[Calibration] League players updated.');
}

// ============================================================================
// TEAM RATING SYSTEM (STARTERS ONLY)
// ============================================================================

/**
 * Calculates team ratings using "Starters Only" logic.
 * @param {Object} team - Team object
 * @returns {Object} Rating data
 */
function calculateTeamRating(team) {
    if (!team || !team.roster) {
        return {
            overall: 0,
            offense: { overall: 0 },
            defense: { overall: 0 },
            specialTeams: 0
        };
    }

    const groups = groupPlayersByPosition(team.roster);

    // Helper to get average of top N players
    const getTopAverage = (pos, n, weight = 1.0) => {
        const players = groups[pos] || [];
        if (players.length === 0) return 50; // Replacement level

        let total = 0;
        let count = 0;
        for (let i = 0; i < Math.min(n, players.length); i++) {
            // Use displayOvr if available, else ovr
            total += (players[i].displayOvr !== undefined ? players[i].displayOvr : players[i].ovr);
            count++;
        }

        // Fill empty slots with replacement level (55)
        while (count < n) {
            total += 55;
            count++;
        }

        return (total / count) * weight;
    };

    // --- OFFENSE ---
    // QB Heavy, OL Heavy
    const qbRating = getTopAverage('QB', 1, 1.0);
    const rbRating = getTopAverage('RB', 1, 1.0); // reduced from 2
    const wrRating = getTopAverage('WR', 3, 1.0);
    const teRating = getTopAverage('TE', 1, 1.0);
    const olRating = getTopAverage('OL', 5, 1.0);

    // Weights for Offense OVR
    // QB: 30%, OL: 25%, WR: 20%, RB: 15%, TE: 10%
    const offScore = (qbRating * 0.35) + (olRating * 0.25) + (wrRating * 0.20) + (rbRating * 0.15) + (teRating * 0.05);
    
    // --- DEFENSE ---
    // DB Heavy-ish
    const dlRating = getTopAverage('DL', 4, 1.0);
    const lbRating = getTopAverage('LB', 3, 1.0);
    const cbRating = getTopAverage('CB', 3, 1.0);
    const sRating = getTopAverage('S', 2, 1.0);
    
    // Combine CB/S into DB for calculation if preferred, or keep separate
    // Weights: DL: 30%, LB: 25%, CB: 25%, S: 20%
    const defScore = (dlRating * 0.30) + (lbRating * 0.25) + (cbRating * 0.25) + (sRating * 0.20);

    // --- SPECIAL TEAMS ---
    const kRating = getTopAverage('K', 1, 1.0);
    const pRating = getTopAverage('P', 1, 1.0);
    const stScore = (kRating + pRating) / 2;

    // --- OVERALL ---
    // Off: 45%, Def: 45%, ST: 10%
    const overall = Math.round((offScore * 0.45) + (defScore * 0.45) + (stScore * 0.10));

    return {
        overall,
        offense: { overall: Math.round(offScore) },
        defense: { overall: Math.round(defScore) },
        specialTeams: Math.round(stScore),
        depth: 0, // Legacy/Optional
        starPower: 0, // Legacy/Optional
        totalPlayers: team.roster.length
    };
}

/**
 * Updates team ratings and stores them in the team object
 * @param {Object} team - Team object
 * @returns {Object} Updated team with ratings
 */
function updateTeamRatings(team) {
    if (!team) return team;

    const ratings = calculateTeamRating(team);
    team.ratings = ratings;
    
    // Store flat ratings for easy access
    team.offensiveRating = ratings.offense.overall;
    team.defensiveRating = ratings.defense.overall;
    team.overallRating = ratings.overall; // This is the new calibrated display OVR
    team.specialTeamsRating = ratings.specialTeams;

    // Legacy fallback
    team.ovr = ratings.overall;

    return team;
}

/**
 * Updates ratings for all teams in a league
 * @param {Object} league - League object
 * @returns {Object} League with updated team ratings
 */
function updateAllTeamRatings(league) {
    if (!league || !league.teams) return league;

    league.teams.forEach(team => {
        updateTeamRatings(team);
    });

    // Sort teams by overall rating for power rankings (internal utility, doesn't reorder array)
    // league.teams.sort((a, b) => (b.overallRating || 0) - (a.overallRating || 0));

    return league;
}

// ============================================================================
// UI RENDERERS
// ============================================================================

/**
 * Gets CSS class for rating styling
 * @param {number} rating - Rating value
 * @returns {string} CSS class name
 */
function getRatingClass(rating) {
    if (rating >= 90) return 'elite';
    if (rating >= 85) return 'excellent';
    if (rating >= 80) return 'very-good';
    if (rating >= 75) return 'good';
    if (rating >= 70) return 'average';
    if (rating >= 60) return 'below-average';
    return 'poor';
}

/**
 * Renders team ratings in the UI (Team Dashboard)
 * @param {Object} team - Team object
 * @param {string} containerId - ID of container to render ratings
 */
function renderTeamRatings(team, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !team) return;

    const ratings = team.ratings || calculateTeamRating(team);
    
    const html = `
        <div class="team-ratings-card">
            <div class="rating-main">
                <div class="rating-circle ${getRatingClass(ratings.overall)}">
                    <span class="rating-number">${ratings.overall}</span>
                    <span class="rating-label">OVR</span>
                </div>
            </div>
            <div class="rating-splits">
                <div class="split-item">
                    <span class="split-label">OFF</span>
                    <span class="split-value ${getRatingClass(ratings.offense.overall)}">${ratings.offense.overall}</span>
                </div>
                <div class="split-item">
                    <span class="split-label">DEF</span>
                    <span class="split-value ${getRatingClass(ratings.defense.overall)}">${ratings.defense.overall}</span>
                </div>
                <div class="split-item">
                    <span class="split-label">ST</span>
                    <span class="split-value ${getRatingClass(ratings.specialTeams)}">${ratings.specialTeams}</span>
                </div>
            </div>
        </div>
        <style>
            .team-ratings-card {
                display: flex;
                align-items: center;
                gap: 1.5rem;
                padding: 1rem;
                background: var(--surface);
                border-radius: var(--radius-lg);
                border: 1px solid var(--hairline);
            }
            .rating-main {
                flex-shrink: 0;
            }
            .rating-circle {
                width: 60px;
                height: 60px;
                border-radius: 50%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                background: var(--surface-2);
                border: 3px solid currentColor;
            }
            .rating-circle.elite { color: #8b5cf6; border-color: #8b5cf6; }
            .rating-circle.excellent { color: #3b82f6; border-color: #3b82f6; }
            .rating-circle.good { color: #10b981; border-color: #10b981; }
            .rating-circle.average { color: #f59e0b; border-color: #f59e0b; }
            .rating-circle.poor { color: #ef4444; border-color: #ef4444; }

            .rating-number { font-size: 1.5rem; font-weight: 800; line-height: 1; }
            .rating-label { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; }

            .rating-splits {
                display: flex;
                gap: 1.5rem;
                flex-grow: 1;
                justify-content: space-around;
            }
            .split-item { display: flex; flex-direction: column; align-items: center; }
            .split-label { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; }
            .split-value { font-size: 1.25rem; font-weight: 700; }
            .split-value.elite { color: #8b5cf6; }
            .split-value.good { color: #10b981; }
            .split-value.average { color: #f59e0b; }
            .split-value.poor { color: #ef4444; }
        </style>
    `;

    container.innerHTML = html;
}

/**
 * Renders league-wide team ratings overview (Hub)
 * @param {Object} league - League object
 * @param {string} containerId - ID of container to render ratings
 */
function renderLeagueTeamRatings(league, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !league?.teams) return;

    // Ensure ratings are up to date
    // updateAllTeamRatings(league); // Don't force update here to avoid loops, rely on state
    
    // Sort teams by overall rating
    const sortedTeams = [...league.teams].sort((a, b) => (b.overallRating || 0) - (a.overallRating || 0));
    const topTeams = sortedTeams.slice(0, 5); // Show top 5
    
    const html = `
        <div class="card mt">
            <h3>League Power Rankings</h3>
            <div class="league-ratings-list">
                ${topTeams.map((team, index) => {
                    const ratings = team.ratings || calculateTeamRating(team);
                    return `
                        <div class="rating-row">
                            <div class="rank">${index + 1}</div>
                            <div class="team-info">
                                <span class="team-name">${team.name}</span>
                                <span class="record text-muted">${team.record?.w || 0}-${team.record?.l || 0}</span>
                            </div>
                            <div class="rating-pill ${getRatingClass(ratings.overall)}">${ratings.overall}</div>
                        </div>
                    `;
                }).join('')}
            </div>
            <div class="mt text-center">
                 <a href="#/powerRankings" class="btn btn-sm">View All Rankings</a>
            </div>
        </div>
        <style>
            .league-ratings-list { display: flex; flex-direction: column; gap: 0.5rem; }
            .rating-row { display: flex; align-items: center; padding: 0.5rem; background: var(--surface-2); border-radius: 6px; }
            .rating-row .rank { font-weight: 700; width: 30px; color: var(--text-muted); }
            .rating-row .team-info { flex-grow: 1; display: flex; flex-direction: column; }
            .rating-row .team-name { font-weight: 600; }
            .rating-pill {
                padding: 0.25rem 0.75rem; border-radius: 1rem;
                font-weight: 700; font-size: 0.9rem;
                color: white; background: #555;
            }
            .rating-pill.elite { background: #8b5cf6; }
            .rating-pill.excellent { background: #3b82f6; }
            .rating-pill.good { background: #10b981; }
            .rating-pill.average { background: #f59e0b; }
            .rating-pill.poor { background: #ef4444; }
        </style>
    `;

    container.innerHTML = html;
}

// Make functions globally available
window.calculateLeagueStats = calculateLeagueStats;
window.calibrateRating = calibrateRating;
window.updateLeaguePlayers = updateLeaguePlayers;
window.calculateTeamRating = calculateTeamRating;
window.updateTeamRatings = updateTeamRatings;
window.updateAllTeamRatings = updateAllTeamRatings;
window.renderTeamRatings = renderTeamRatings;
window.renderLeagueTeamRatings = renderLeagueTeamRatings;
