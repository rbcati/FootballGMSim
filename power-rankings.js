// power-rankings.js
'use strict';

/**
 * Calculates power rankings data including positional ranks
 * @param {Object} league - The league object containing teams
 * @returns {Array} Sorted array of team objects with ranks
 */
function calculatePowerRankingsData(league) {
    if (!league || !league.teams) {
        console.error("calculatePowerRankingsData: League or teams missing", league);
        return [];
    }

    // 1. Calculate ratings for all teams
    const teamsData = league.teams.map(team => {
        // Ensure ratings are up to date
        const ratings = window.calculateTeamRating ? window.calculateTeamRating(team) : (team.ratings || {});

        return {
            team: team,
            ratings: ratings,
            // We will add ranks later
            ranks: {}
        };
    });

    // 2. Define categories to rank
    // Note: Paths depend on the structure returned by calculateTeamRating
    const categories = [
        { key: 'overall', path: t => t.ratings.overall || 0 },
        { key: 'offense', path: t => t.ratings.offense?.overall || 0 },
        { key: 'defense', path: t => t.ratings.defense?.overall || 0 },
        { key: 'specialTeams', path: t => t.ratings.specialTeams || 0 },
        // Positional Breakdowns
        // Offense: QB, RB, WR, TE, OL
        { key: 'QB', path: t => t.ratings.offense?.breakdown?.QB || 0 },
        { key: 'RB', path: t => t.ratings.offense?.breakdown?.RB || 0 },
        { key: 'WR', path: t => t.ratings.offense?.breakdown?.WR || 0 },
        { key: 'TE', path: t => t.ratings.offense?.breakdown?.TE || 0 },
        { key: 'OL', path: t => t.ratings.offense?.breakdown?.OL || 0 },
        // Defense: DL, LB, CB, S
        { key: 'DL', path: t => t.ratings.defense?.breakdown?.DL || 0 },
        { key: 'LB', path: t => t.ratings.defense?.breakdown?.LB || 0 },
        { key: 'CB', path: t => t.ratings.defense?.breakdown?.CB || 0 },
        { key: 'S', path: t => t.ratings.defense?.breakdown?.S || 0 }
    ];

    // 3. Calculate ranks for each category
    categories.forEach(cat => {
        // Sort teams by this category's value (descending: higher rating is better)
        teamsData.sort((a, b) => {
            const valA = cat.path(a);
            const valB = cat.path(b);
            return valB - valA;
        });

        // Assign rank
        teamsData.forEach((item, index) => {
            item.ranks[cat.key] = index + 1;
        });
    });

    // 4. Default sort by Overall Rank (Ascending: #1 is best)
    teamsData.sort((a, b) => a.ranks.overall - b.ranks.overall);

    return teamsData;
}

/**
 * Renders the Power Rankings view
 */
function renderPowerRankings() {
    try {
        const container = document.getElementById('powerRankings');
        if (!container) {
            console.error("renderPowerRankings: Container #powerRankings not found");
            return;
        }

        // Get league from global state
        // Handle different potential state locations just in case
        const league = window.state?.league || window.league;

        if (!league) {
            console.error("renderPowerRankings: League not found in window.state");
            container.innerHTML = `
                <div class="card">
                    <h2>Power Rankings</h2>
                    <div class="error-message">
                        <h3>No League Data Found</h3>
                        <p>Please ensure a league is loaded.</p>
                        <p>Debug: window.state is ${typeof window.state}</p>
                    </div>
                </div>`;
            return;
        }

        // Calculate data
        const data = calculatePowerRankingsData(league);

        if (!data || data.length === 0) {
             console.error("renderPowerRankings: No data calculated");
             container.innerHTML = '<div class="card"><h3>No Data Available</h3></div>';
             return;
        }

        // Store for sorting
        window.powerRankingsData = data;

        let html = `
            <div class="card">
                <h2>Power Rankings</h2>
                <p class="muted small mb">Teams ranked by overall strength and positional groups.</p>
                <div class="table-responsive">
                    <table class="table table-striped power-rankings-table">
                        <thead>
                            <tr>
                                <th onclick="window.sortPowerRankings('overall')" style="cursor: pointer;">Rank</th>
                                <th>Team</th>
                                <th onclick="window.sortPowerRankings('overall')" style="cursor: pointer;" title="Overall Rating">OVR</th>
                                <th onclick="window.sortPowerRankings('offense')" style="cursor: pointer;" title="Offense Rank">OFF</th>
                                <th onclick="window.sortPowerRankings('defense')" style="cursor: pointer;" title="Defense Rank">DEF</th>
                                <th onclick="window.sortPowerRankings('QB')" style="cursor: pointer;" title="Quarterback Rank">QB</th>
                                <th onclick="window.sortPowerRankings('RB')" style="cursor: pointer;" title="Running Back Rank">RB</th>
                                <th onclick="window.sortPowerRankings('WR')" style="cursor: pointer;" title="Wide Receiver Rank">WR</th>
                                <th onclick="window.sortPowerRankings('OL')" style="cursor: pointer;" title="Offensive Line Rank">OL</th>
                                <th onclick="window.sortPowerRankings('DL')" style="cursor: pointer;" title="Defensive Line Rank">DL</th>
                                <th onclick="window.sortPowerRankings('LB')" style="cursor: pointer;" title="Linebacker Rank">LB</th>
                                <th onclick="window.sortPowerRankings('CB')" style="cursor: pointer;" title="Cornerback Rank">CB</th>
                                <th onclick="window.sortPowerRankings('S')" style="cursor: pointer;" title="Safety Rank">S</th>
                            </tr>
                        </thead>
                        <tbody id="powerRankingsBody">
                            ${renderPowerRankingsRows(data)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        container.innerHTML = html;

    } catch (err) {
        console.error("Error rendering Power Rankings:", err);
        const container = document.getElementById('powerRankings');
        if (container) {
             container.innerHTML = `<div class="card"><h3>Error</h3><pre>${err.message}</pre></div>`;
        }
    }
}

/**
 * Renders the rows for the power rankings table
 * @param {Array} data - The sorted teams data
 */
function renderPowerRankingsRows(data) {
    const userTeamId = window.state?.userTeamId;

    return data.map(item => {
        const team = item.team;
        const ranks = item.ranks;
        const ratings = item.ratings;
        const isUser = team.id === userTeamId;

        // Helper to get CSS class for rank
        const getRankClass = (rank) => {
            if (rank <= 5) return 'rating-elite';      // Gold
            if (rank <= 10) return 'rating-good';      // Green
            if (rank >= 28) return 'rating-poor';      // Red
            return '';
        };

        return `
            <tr class="${isUser ? 'user-team' : ''}">
                <td class="rank-cell">#${ranks.overall}</td>
                <td>
                    <div class="team-name-cell">
                        <span class="team-abbr" style="font-weight:bold;">${team.abbr}</span>
                        <span class="team-name-full" style="display:none;"> ${team.name}</span>
                    </div>
                </td>
                <td class="rating-val" style="font-weight:bold;">${ratings.overall}</td>

                <!-- Display Ranks with Colors -->
                <td class="rank-val ${getRankClass(ranks.offense)}">#${ranks.offense}</td>
                <td class="rank-val ${getRankClass(ranks.defense)}">#${ranks.defense}</td>

                <td class="rank-val ${getRankClass(ranks.QB)}">#${ranks.QB}</td>
                <td class="rank-val ${getRankClass(ranks.RB)}">#${ranks.RB}</td>
                <td class="rank-val ${getRankClass(ranks.WR)}">#${ranks.WR}</td>
                <td class="rank-val ${getRankClass(ranks.OL)}">#${ranks.OL}</td>

                <td class="rank-val ${getRankClass(ranks.DL)}">#${ranks.DL}</td>
                <td class="rank-val ${getRankClass(ranks.LB)}">#${ranks.LB}</td>
                <td class="rank-val ${getRankClass(ranks.CB)}">#${ranks.CB}</td>
                <td class="rank-val ${getRankClass(ranks.S)}">#${ranks.S}</td>
            </tr>
        `;
    }).join('');
}

/**
 * Sorts the power rankings table
 * @param {string} key - The rank key to sort by
 */
function sortPowerRankings(key) {
    if (!window.powerRankingsData) return;

    // console.log(`Sorting Power Rankings by ${key}...`);

    const data = window.powerRankingsData;

    // Sort by rank (Ascending: 1 is best)
    data.sort((a, b) => {
        return (a.ranks[key] || 99) - (b.ranks[key] || 99);
    });

    const tbody = document.getElementById('powerRankingsBody');
    if (tbody) {
        tbody.innerHTML = renderPowerRankingsRows(data);
    }
}

// Expose globally
window.calculatePowerRankingsData = calculatePowerRankingsData;
window.renderPowerRankings = renderPowerRankings;
window.sortPowerRankings = sortPowerRankings;
