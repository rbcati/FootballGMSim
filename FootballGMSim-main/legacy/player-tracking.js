// player-tracking.js
// Manages the "Follow" system for players, generating alerts and updates.

const MAX_FOLLOWED_PLAYERS = 8;
const SOFT_CAP_WARNING = 5;

/**
 * Toggles the followed status of a player.
 * @param {Object} player - The player object to toggle.
 * @returns {Object} Result object with success, message, and new status.
 */
export function toggleFollow(player) {
    if (!player) return { success: false, message: "Player not found" };

    if (player.isFollowed) {
        player.isFollowed = false;
        return { success: true, message: `Unfollowed ${player.name}`, isFollowed: false };
    } else {
        // Check cap
        const league = window.state?.league;
        if (league) {
            const followedCount = getFollowedPlayers(league).length;
            if (followedCount >= MAX_FOLLOWED_PLAYERS) {
                return { success: false, message: `You can only follow up to ${MAX_FOLLOWED_PLAYERS} players.` };
            }
        }
        player.isFollowed = true;
        return { success: true, message: `Following ${player.name}`, isFollowed: true };
    }
}

/**
 * Returns a list of followed players.
 * @param {Object} league - The league object.
 * @returns {Array} Array of followed player objects with team context.
 */
export function getFollowedPlayers(league) {
    if (!league || !league.teams) return [];

    const followed = [];
    league.teams.forEach((team, teamIdx) => {
        if (team.roster) {
            team.roster.forEach(player => {
                if (player.isFollowed) {
                    followed.push({
                        ...player,
                        // Ensure we have a reference to the actual player object for updates
                        _ref: player,
                        teamId: team.id !== undefined ? team.id : teamIdx,
                        teamAbbr: team.abbr
                    });
                }
            });
        }
    });
    return followed;
}

/**
 * Generates context-aware updates for followed players for the Hub or Recap.
 * @param {Object} league - The league object.
 * @param {number} week - The current week.
 * @param {Array} [gameResults] - Optional array of game results for the week (used in Recap).
 * @returns {Array} Array of update objects { player, message, type, priority }.
 */
export function getTrackedPlayerUpdates(league, week, gameResults = null) {
    const updates = [];
    const followed = getFollowedPlayers(league);

    followed.forEach(player => {
        let updateFound = false;

        // 1. Game Performance (Recap Context)
        if (gameResults) {
            // Find game involving player's team
            const game = gameResults.find(g => {
                const homeId = typeof g.home === 'object' ? g.home.id : g.home;
                const awayId = typeof g.away === 'object' ? g.away.id : g.away;
                return homeId === player.teamId || awayId === player.teamId;
            });

            if (game && game.boxScore) {
                const isHome = (typeof game.home === 'object' ? game.home.id : game.home) === player.teamId;
                const side = isHome ? 'home' : 'away';
                const stats = game.boxScore[side] && game.boxScore[side][player.id] ? game.boxScore[side][player.id].stats : null;

                if (stats) {
                    // Check for notable stats
                    let notable = [];
                    if (stats.passYd >= 300) notable.push(`${stats.passYd} Pass Yds`);
                    if (stats.passTD >= 3) notable.push(`${stats.passTD} Pass TDs`);
                    if (stats.rushYd >= 100) notable.push(`${stats.rushYd} Rush Yds`);
                    if (stats.recYd >= 100) notable.push(`${stats.recYd} Rec Yds`);
                    if (stats.recTD >= 2) notable.push(`${stats.recTD} Rec TDs`);
                    if (stats.sacks >= 2) notable.push(`${stats.sacks} Sacks`);
                    if (stats.interceptions >= 1) notable.push(`${stats.interceptions} INT`);
                    if (stats.tackles >= 10) notable.push(`${stats.tackles} Tkl`);

                    if (notable.length > 0) {
                        updates.push({
                            player,
                            message: `Big Game: ${notable.join(', ')}`,
                            type: 'good',
                            priority: 10
                        });
                        updateFound = true;
                    } else if (stats.interceptionsThrown >= 2) {
                         updates.push({
                            player,
                            message: `Struggled with ${stats.interceptionsThrown} INTs`,
                            type: 'bad',
                            priority: 5
                        });
                        updateFound = true;
                    }
                }
            }
        }

        // 2. News & Status (Hub/Recap Context)
        // Check for injuries or news from this week
        if (player.seasonNews) {
            const recentNews = player.seasonNews.find(n => n.week === week);
            if (recentNews) {
                updates.push({
                    player,
                    message: recentNews.headline,
                    type: recentNews.headline.toLowerCase().includes('injury') ? 'injury' : 'news',
                    priority: 20 // High priority
                });
                updateFound = true;
            }
        }

        // 3. Assist Hints (Hub Context - if no other major news)
        if (!gameResults && !updateFound) {
            // Contract Warning
            if (player.years === 1 && week > 12) {
                 updates.push({
                    player,
                    message: 'Contract expiring soon.',
                    type: 'alert',
                    priority: 1
                });
            }
            // Injury Recovery
            else if (player.injuryWeeks > 0) {
                 updates.push({
                    player,
                    message: `Injured (${player.injuryWeeks} wks left)`,
                    type: 'injury',
                    priority: 5
                });
            }
            // Development
            else if (player.developmentStatus === 'BREAKOUT') {
                 updates.push({
                    player,
                    message: 'Trending Up (Breakout)',
                    type: 'good',
                    priority: 2
                });
            }
            else if (player.developmentStatus === 'DECLINING') {
                 updates.push({
                    player,
                    message: 'Trending Down (Declining)',
                    type: 'bad',
                    priority: 2
                });
            }
        }
    });

    // Sort by priority
    return updates.sort((a, b) => b.priority - a.priority);
}

/**
 * Checks for significant events to generate news alerts for followed players.
 * Should be called during weekly news generation.
 * @param {Object} league - The league object.
 * @returns {Array} Array of alert objects { headline, story, type }.
 */
export function checkFollowedPlayerAlerts(league) {
    const alerts = [];
    const followed = getFollowedPlayers(league);

    followed.forEach(player => {
        // Milestone Check
        if (player.legacy && player.legacy.milestones) {
            const newMilestone = player.legacy.milestones.find(m => m.week === league.week && m.year === league.year);
            if (newMilestone) {
                alerts.push({
                    headline: `Tracked Player Milestone: ${player.name}`,
                    story: `${player.name} has reached a milestone: ${newMilestone.description} (${newMilestone.rarity}).`,
                    type: 'milestone'
                });
            }
        }

        // Contract Expiry Warning (Once per season, e.g., Week 15)
        if (league.week === 15 && player.years === 1) {
             alerts.push({
                headline: `Contract Alert: ${player.name}`,
                story: `${player.name}'s contract is expiring at the end of this season.`,
                type: 'contract'
            });
        }
    });

    return alerts;
}

/**
 * Generates a "Why you might care" string for a player.
 * @param {Object} player - The player object.
 * @returns {string} Reason string.
 */
export function getPlayerInterestReason(player) {
    if (player.ovr >= 90) return "Superstar Talent";
    if (player.ovr >= 85) return "Star Player";
    if (player.potential >= 90 && player.age < 25) return "High Potential";
    if (player.years === 1) return "Contract Year";
    if (player.injuryWeeks > 0) return "Injured";
    if (player.developmentStatus === 'BREAKOUT') return "Breakout Player";
    if (player.legacy && player.legacy.metrics && player.legacy.metrics.legacyScore > 50) return "Franchise Legend";
    if (player.draftId && player.draftId <= 10) return "Top Draft Pick";
    return "Roster Player";
}

// Global Export
if (typeof window !== 'undefined') {
    window.toggleFollow = toggleFollow;
    window.getFollowedPlayers = getFollowedPlayers;
    window.getTrackedPlayerUpdates = getTrackedPlayerUpdates;
    window.checkFollowedPlayerAlerts = checkFollowedPlayerAlerts;
    window.getPlayerInterestReason = getPlayerInterestReason;
}
