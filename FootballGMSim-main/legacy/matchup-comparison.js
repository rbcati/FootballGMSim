// matchup-comparison.js
// Renders the Opponent Comparison Strip for Week HQ

// Simple in-memory cache to prevent expensive recalculation on every render
let rankCache = {
    key: null,
    data: null
};

export function renderMatchupComparison(userTeam, opponent, league) {
    if (!userTeam || !opponent || !league) return '';

    // 1. Get Ranks (Cached)
    const ranks = getLeagueRanks(league);
    const userRanks = ranks[userTeam.id];
    const oppRanks = ranks[opponent.id];

    if (!userRanks || !oppRanks) return '';

    // 2. Generate Insight
    const insight = generateStrategyInsight(userTeam, opponent, userRanks, oppRanks);

    // 3. Render HTML
    const getRankColor = (rank) => {
        if (rank <= 5) return '#48bb78'; // Top 5: Green
        if (rank >= 28) return '#f56565'; // Bottom 5: Red
        return 'var(--text-muted)';
    };

    // Helper for mirroring stats with different labels (Off vs Def)
    const renderStatRow = (leftLabel, rightLabel, userRank, oppRank) => {
        // High Rank (low number) is always good.
        const uColor = getRankColor(userRank);
        const oColor = getRankColor(oppRank);

        // Determine Advantage Arrow Position
        // If User Rank is significantly better (lower) than Opp Rank
        let leftArrow = '';
        let rightArrow = '';

        if (userRank < oppRank - 5) {
            // User Advantage (My Offense is #1, Their Defense is #20)
            leftArrow = `<span style="color: #48bb78; font-weight: bold;">◀</span>`;
        } else if (userRank > oppRank + 5) {
             // Opp Advantage (My Offense is #20, Their Defense is #1)
             rightArrow = `<span style="color: #f56565; font-weight: bold;">▶</span>`;
        }

        return `
            <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: center; padding: 4px 0; font-size: 0.9rem;">
                <div style="text-align: right; display: flex; justify-content: flex-end; align-items: center; gap: 8px;">
                    <span style="font-weight: 700; color: ${uColor};">#${userRank}</span>
                    <span style="opacity: 0.8;">${leftLabel}</span>
                    ${leftArrow}
                </div>
                <div style="opacity: 0.3; font-size: 0.8rem;">vs</div>
                <div style="text-align: left; display: flex; justify-content: flex-start; align-items: center; gap: 8px;">
                    ${rightArrow}
                    <span style="opacity: 0.8;">${rightLabel}</span>
                    <span style="font-weight: 700; color: ${oColor};">#${oppRank}</span>
                </div>
            </div>
        `;
    };

    // Calculate OVRs
    const uOvr = userTeam.ratings?.overall || userTeam.overallRating || 0;
    const oOvr = opponent.ratings?.overall || opponent.overallRating || 0;

    const uOff = userTeam.ratings?.offense?.overall || userTeam.offensiveRating || 0;
    const uDef = userTeam.ratings?.defense?.overall || userTeam.defensiveRating || 0;
    const oOff = opponent.ratings?.offense?.overall || opponent.offensiveRating || 0;
    const oDef = opponent.ratings?.defense?.overall || opponent.defensiveRating || 0;

    // Determine colors for OVR
    const ovrDiff = uOvr - oOvr;
    const uOvrColor = ovrDiff > 3 ? '#48bb78' : ovrDiff < -3 ? '#f56565' : 'white';
    const oOvrColor = ovrDiff < -3 ? '#48bb78' : ovrDiff > 3 ? '#f56565' : 'white';

    return `
        <div id="matchup-comparison-strip" class="card mb-4" style="background: linear-gradient(to bottom, #2d3748, #1a202c); border-top: 4px solid var(--accent);">

            <!-- Header: Teams & Record -->
            <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 15px; align-items: center; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">
                <div style="text-align: right;">
                    <div style="font-weight: 800; font-size: 1.2rem; line-height: 1.1;">${userTeam.name}</div>
                    <div style="font-size: 0.9rem; opacity: 0.7;">${userTeam.wins}-${userTeam.losses}</div>
                </div>
                <div style="font-weight: 700; opacity: 0.5; font-size: 0.9rem;">VS</div>
                <div style="text-align: left;">
                    <div style="font-weight: 800; font-size: 1.2rem; line-height: 1.1;">${opponent.name}</div>
                    <div style="font-size: 0.9rem; opacity: 0.7;">${opponent.wins}-${opponent.losses}</div>
                </div>
            </div>

            <!-- Core Stats: OVR -->
            <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 20px; margin-bottom: 15px;">
                <div style="text-align: right;">
                    <span style="font-size: 1.4rem; font-weight: 800; color: ${uOvrColor};">${uOvr}</span> <span style="font-size: 0.8rem; opacity: 0.6;">OVR</span>
                    <div style="font-size: 0.8rem; opacity: 0.8; margin-top: 2px;">
                        Off <strong>${uOff}</strong> / Def <strong>${uDef}</strong>
                    </div>
                </div>
                <div style="width: 1px; background: rgba(255,255,255,0.1);"></div>
                <div style="text-align: left;">
                    <span style="font-size: 1.4rem; font-weight: 800; color: ${oOvrColor};">${oOvr}</span> <span style="font-size: 0.8rem; opacity: 0.6;">OVR</span>
                     <div style="font-size: 0.8rem; opacity: 0.8; margin-top: 2px;">
                        Off <strong>${oOff}</strong> / Def <strong>${oDef}</strong>
                    </div>
                </div>
            </div>

            <!-- Detailed Matchup Rows (Cross-Matched) -->
            <div style="background: rgba(0,0,0,0.2); border-radius: 6px; padding: 10px;">
                <!-- My Offense vs Their Defense -->
                ${renderStatRow('Pass Off', 'Pass Def', userRanks.passOff, oppRanks.passDef)}
                ${renderStatRow('Rush Off', 'Rush Def', userRanks.rushOff, oppRanks.rushDef)}

                <div style="height: 1px; background: rgba(255,255,255,0.05); margin: 5px 0;"></div>

                <!-- My Defense vs Their Offense -->
                ${renderStatRow('Pass Def', 'Pass Off', userRanks.passDef, oppRanks.passOff)}
                ${renderStatRow('Rush Def', 'Rush Off', userRanks.rushDef, oppRanks.rushOff)}
            </div>

            <!-- Strategy Insight -->
            <div style="margin-top: 15px; text-align: center; font-style: italic; background: rgba(66, 153, 225, 0.15); padding: 8px; border-radius: 4px; color: #90cdf4; font-size: 0.9rem; border-left: 3px solid #4299e1;">
                "${insight}"
            </div>
        </div>
    `;
}

function getLeagueRanks(league) {
    // Generate a cache key based on week and year
    // We add the number of teams to be safe, though that shouldn't change often.
    const key = `${league.seasonYear}-W${league.week}`;

    if (rankCache.key === key && rankCache.data) {
        return rankCache.data;
    }

    // Recalculate if cache is stale
    const ranks = calculateTeamRanks(league);

    // Update Cache
    rankCache = {
        key: key,
        data: ranks
    };

    return ranks;
}

function calculateTeamRanks(league) {
    const stats = {};

    // Initialize
    league.teams.forEach(t => {
        stats[t.id] = { id: t.id, passOff: 0, rushOff: 0, passDef: 0, rushDef: 0 };
    });

    // 1. Offense (From Rosters) - Efficient O(Players)
    league.teams.forEach(t => {
        if (t.roster) {
            t.roster.forEach(p => {
                if (p.stats && p.stats.season) {
                    stats[t.id].passOff += (p.stats.season.passYd || 0);
                    stats[t.id].rushOff += (p.stats.season.rushYd || 0);
                }
            });
        }
    });

    // 2. Defense (From Game Results) - Expensive O(Games), but cached now.
    // Note: This iterates all games to sum defensive stats since they aren't stored on the team object.
    if (league.resultsByWeek) {
        Object.values(league.resultsByWeek).forEach(weekGames => {
            if (Array.isArray(weekGames)) {
                weekGames.forEach(g => {
                    const homeId = typeof g.home === 'object' ? g.home.id : g.home;
                    const awayId = typeof g.away === 'object' ? g.away.id : g.away;

                    if (!stats[homeId] || !stats[awayId]) return;

                    // Get Stats from Box Score
                    let homePass = 0, homeRush = 0, awayPass = 0, awayRush = 0;

                    if (g.boxScore) {
                        if (g.boxScore.home) {
                            Object.values(g.boxScore.home).forEach(p => {
                                if (p.stats) {
                                    homePass += (p.stats.passYd || 0);
                                    homeRush += (p.stats.rushYd || 0);
                                }
                            });
                        }
                        if (g.boxScore.away) {
                             Object.values(g.boxScore.away).forEach(p => {
                                if (p.stats) {
                                    awayPass += (p.stats.passYd || 0);
                                    awayRush += (p.stats.rushYd || 0);
                                }
                            });
                        }
                    }

                    // Assign to Opponent Defense
                    // If I am Home, Opponent's Offense (Away Stats) counts against my Defense
                    stats[homeId].passDef += awayPass;
                    stats[homeId].rushDef += awayRush;

                    stats[awayId].passDef += homePass;
                    stats[awayId].rushDef += homeRush;
                });
            }
        });
    }

    // 3. Compute Ranks
    const ranks = {};
    const teams = Object.values(stats);

    const getRank = (key, teamId, ascending = false) => {
        // Ascending for defense (fewer yards better) -> #1 is lowest
        // Descending for offense (more yards better) -> #1 is highest
        const sorted = [...teams].sort((a, b) => ascending ? a[key] - b[key] : b[key] - a[key]);
        return sorted.findIndex(t => t.id === teamId) + 1;
    };

    teams.forEach(t => {
        ranks[t.id] = {
            passOff: getRank('passOff', t.id, false),
            rushOff: getRank('rushOff', t.id, false),
            passDef: getRank('passDef', t.id, true), // Defense: Ascending (Rank 1 = Lowest Yards)
            rushDef: getRank('rushDef', t.id, true)
        };
    });

    return ranks;
}

function generateStrategyInsight(userTeam, opponent, uRanks, oRanks) {
    // 1. Check for Exploitable Mismatches (My Strength vs Their Weakness)
    if (uRanks.passOff <= 10 && oRanks.passDef >= 20) {
        return "Your elite passing attack faces a vulnerable secondary. Air it out.";
    }
    if (uRanks.rushOff <= 10 && oRanks.rushDef >= 20) {
        return "They struggle against the run. Ground and pound game?";
    }

    // 2. Check for Defensive Liabilities (Their Strength vs My Weakness)
    if (oRanks.passOff <= 10 && uRanks.passDef >= 20) {
        return "Their passing game is dangerous. Consider extra coverage.";
    }
    if (oRanks.rushOff <= 10 && uRanks.rushDef >= 20) {
        return "They will try to run over your defense. Stack the box?";
    }

    // 3. Strength on Strength
    if (uRanks.passOff <= 10 && oRanks.passDef <= 10) {
        return "Heavyweight bout: Your top passing unit vs their elite secondary.";
    }

    // 4. General OVR comparison
    const uOvr = userTeam.ratings?.overall || 0;
    const oOvr = opponent.ratings?.overall || 0;

    if (uOvr > oOvr + 5) {
        return "You have the superior roster. Execute cleanly to win.";
    }
    if (oOvr > uOvr + 5) {
        return "Uphill battle. You'll need to out-scheme them to win.";
    }

    // Default
    return "Balanced matchup. Gameplan execution will decide the winner.";
}
