import { Utils } from './utils.js';

/**
 * Main function to create the schedule.
 * @param {Array} teams - Array of team objects
 * @returns {Object} Schedule object with weeks array
 */
function makeAccurateSchedule(teams) {
    if (!teams || teams.length !== 32) {
        console.warn('Expected 32 teams, got', teams?.length, '. Using simple schedule as fallback.');
        return createSimpleSchedule(teams || []);
    }
    try {
        return createNFLStyleSchedule(teams);
    } catch (error) {
        console.error('Error creating NFL schedule, falling back to simple schedule:', error);
        return createSimpleSchedule(teams);
    }
}

/**
 * Creates an NFL-style schedule with proper validation
 * @param {Array} teams - Array of team objects
 * @returns {Object} Schedule object
 */
function createNFLStyleSchedule(teams) {
    console.log('Creating NFL-style schedule...');

    if (!teams || teams.length !== 32) {
        console.error('Invalid teams array for NFL schedule');
        return createSimpleSchedule(teams);
    }

    const schedule = {
        weeks: [],
        teams: teams,
        metadata: {
            generated: new Date().toISOString(),
            type: 'nfl-style'
        }
    };

    // Initialize tracking objects
    const teamGameCount = {};
    const teamByeWeek = {};
    const teamOpponents = {};

    teams.forEach(team => {
        teamGameCount[team.id] = 0;
        teamByeWeek[team.id] = null;
        teamOpponents[team.id] = new Set();
    });

    // Pre-assign all bye weeks: 4 teams per week for weeks 5-12 (32 teams total)
    const teamsForBye = [...teams];
    shuffleArray(teamsForBye);
    let byeIndex = 0;

    for (let week = 5; week <= 12; week++) {
        const teamsThisWeek = 4;
        for (let i = 0; i < teamsThisWeek && byeIndex < teamsForBye.length; i++) {
            teamByeWeek[teamsForBye[byeIndex].id] = week;
            byeIndex++;
        }
    }

    // Create schedule week by week
    for (let week = 1; week <= 18; week++) {
        const weekData = createWeekSchedule(week, teams, teamByeWeek, teamGameCount, teamOpponents);
        schedule.weeks.push(weekData);
    }

    // Validate and fix schedule if needed
    const validation = validateSchedule(schedule, teams);
    if (!validation.valid) {
        console.warn('Schedule validation failed, attempting to fix:', validation.errors);
        return fixScheduleCompletely(teams);
    }

    console.log('Generated NFL-style schedule successfully');
    logScheduleStats(schedule, teams);
    return schedule;
}

/**
 * Distributes bye weeks across weeks 5-12
 * @param {Array} teams - Array of team objects
 * @returns {Array} Array of arrays, each containing team IDs for that bye week
 */
function distributeByeWeeks(teams) {
    const shuffledTeams = [...teams];
    shuffleArray(shuffledTeams);

    const byeWeeks = [];
    const weeksAvailable = 8; // weeks 5-12
    const teamsPerWeek = 4; // 8 weeks * 4 teams = 32 teams

    let teamIndex = 0;

    for (let weekIndex = 0; weekIndex < weeksAvailable; weekIndex++) {
        const weekTeams = [];
        for (let i = 0; i < teamsPerWeek && teamIndex < shuffledTeams.length; i++) {
            weekTeams.push(shuffledTeams[teamIndex].id);
            teamIndex++;
        }
        byeWeeks.push(weekTeams);
    }

    return byeWeeks;
}

/**
 * Creates the schedule for a specific week
 * @param {number} week - Week number (1-18)
 * @param {Array} teams - All teams
 * @param {Object} teamByeWeek - Mapping of team ID to bye week
 * @param {Object} teamGameCount - Current game count per team
 * @param {Object} teamOpponents - Set of opponents each team has played
 * @returns {Object} Week schedule object
 */
function createWeekSchedule(week, teams, teamByeWeek, teamGameCount, teamOpponents) {
    const weekGames = [];
    const teamsOnBye = teams.filter(team => teamByeWeek[team.id] === week);

    // Add bye games
    if (teamsOnBye.length > 0) {
        weekGames.push({
            bye: teamsOnBye.map(team => team.id)
        });
    }

    // Get teams available to play this week
    const availableTeams = teams.filter(team =>
        teamByeWeek[team.id] !== week &&
        teamGameCount[team.id] < 17
    );

    // Shuffle available teams for better distribution
    const shuffledTeams = [...availableTeams];
    shuffleArray(shuffledTeams);

    // Schedule games for available teams
    const usedThisWeek = new Set();
    const weekPairings = [];

    // Try to pair teams that haven't played each other yet
    // OPTIMIZATION: Use a Map for O(1) availability checks and filtered list for candidates
    // instead of nested loops.

    // Filter available candidates once
    const candidates = shuffledTeams.filter(t =>
        !usedThisWeek.has(t.id) && teamGameCount[t.id] < 17
    );

    const availableSet = new Set(candidates.map(t => t.id));

    // Iterate candidates to form pairs
    // We iterate by index but skip if already used in inner loop
    for (let i = 0; i < candidates.length; i++) {
        const team1 = candidates[i];
        if (usedThisWeek.has(team1.id)) continue;

        let bestOpponent = null;
        let fallbackOpponent = null;

        // Search for an opponent starting from next index
        for (let j = i + 1; j < candidates.length; j++) {
            const team2 = candidates[j];
            if (usedThisWeek.has(team2.id)) continue;

            // Prioritize teams that haven't played each other (O(1) lookup in Set)
            const opponentsSet = teamOpponents[team1.id];
            if (!opponentsSet.has(team2.id)) {
                bestOpponent = team2;
                break; // Found ideal match, stop searching
            }

            // Keep track of first valid fallback (repeat matchup)
            if (!fallbackOpponent) {
                fallbackOpponent = team2;
            }
        }

        const opponent = bestOpponent || fallbackOpponent;

        if (opponent) {
            weekPairings.push([team1, opponent]);
            usedThisWeek.add(team1.id);
            usedThisWeek.add(opponent.id);
            availableSet.delete(team1.id);
            availableSet.delete(opponent.id);

            // Update tracking
            teamGameCount[team1.id]++;
            teamGameCount[opponent.id]++;
            teamOpponents[team1.id].add(opponent.id);
            teamOpponents[opponent.id].add(team1.id);
        }
    }

    // Create games from pairings
    weekPairings.forEach(([homeTeam, awayTeam]) => {
        weekGames.push({
            home: homeTeam.id,
            away: awayTeam.id,
            week: week
        });
    });

    return {
        weekNumber: week,
        week: week, // CRITICAL: Ensures Worker UI bridge can read the week
        games: weekGames,
        teamsWithBye: teamsOnBye.map(team => team.id)
    };
}

/**
 * Fixes schedule completely by ensuring all teams get exactly 17 games
 * @param {Array} teams - Array of team objects
 * @returns {Object} Fixed schedule object
 */
function fixScheduleCompletely(teams) {
    console.log('Fixing schedule completely...');

    const schedule = {
        weeks: [],
        teams: teams,
        metadata: {
            generated: new Date().toISOString(),
            type: 'fixed-fallback'
        }
    };

    // Initialize tracking
    const teamGameCount = {};
    const teamOpponents = {};
    const teamByeWeek = {};

    teams.forEach(team => {
        teamGameCount[team.id] = 0;
        teamOpponents[team.id] = new Set();
        teamByeWeek[team.id] = null;
    });

    // Pre-assign all bye weeks: 4 teams per week for weeks 5-12 (32 teams total)
    const teamsNeedingBye = [...teams];
    shuffleArray(teamsNeedingBye);
    let byeIndex = 0;

    for (let week = 5; week <= 12; week++) {
        const teamsThisWeek = 4;
        for (let i = 0; i < teamsThisWeek && byeIndex < teamsNeedingBye.length; i++) {
            teamByeWeek[teamsNeedingBye[byeIndex].id] = week;
            byeIndex++;
        }
    }

    // Create 18 weeks
    for (let week = 1; week <= 18; week++) {
        const weekGames = [];
        const teamsOnByeIds = [];
        const teamsToSchedule = [];

        for (let i = 0; i < teams.length; i++) {
            const team = teams[i];
            const teamId = team.id;
            if (teamByeWeek[teamId] === week) {
                teamsOnByeIds.push(teamId);
            } else if (teamGameCount[teamId] < 17) {
                teamsToSchedule.push(team);
            }
        }
        
        // Add bye games
        if (teamsOnByeIds.length > 0) {
            weekGames.push({
                bye: teamsOnByeIds
            });
        }

        // Pair teams for games
        const usedThisWeek = new Set();
        shuffleArray(teamsToSchedule);
        const numTeamsToSchedule = teamsToSchedule.length;

        for (let i = 0; i < numTeamsToSchedule; i++) {
            const team1 = teamsToSchedule[i];
            const team1Id = team1.id;
            if (usedThisWeek.has(team1Id)) continue;
            
            // Find an opponent for team1
            let bestOpponent = null;
            let bestOpponentId = null;
            const opponentsOfTeam1 = teamOpponents[team1Id];

            for (let j = i + 1; j < numTeamsToSchedule; j++) {
                const team2 = teamsToSchedule[j];
                const team2Id = team2.id;
                if (usedThisWeek.has(team2Id)) continue;

                // Prefer teams that haven't played each other yet
                if (!opponentsOfTeam1.has(team2Id)) {
                    bestOpponent = team2;
                    bestOpponentId = team2Id;
                    break;
                }
            }
            
            // If no new opponent, take any available
            if (!bestOpponent) {
                for (let j = i + 1; j < numTeamsToSchedule; j++) {
                    const team2 = teamsToSchedule[j];
                    const team2Id = team2.id;
                    if (!usedThisWeek.has(team2Id)) {
                        bestOpponent = team2;
                        bestOpponentId = team2Id;
                        break;
                    }
                }
            }
            
            if (bestOpponent) {
                weekGames.push({
                    home: team1Id,
                    away: bestOpponentId,
                    week: week
                });
                
                teamGameCount[team1Id]++;
                teamGameCount[bestOpponentId]++;
                opponentsOfTeam1.add(bestOpponentId);
                teamOpponents[bestOpponentId].add(team1Id);

                usedThisWeek.add(team1Id);
                usedThisWeek.add(bestOpponentId);
            }
        }

        schedule.weeks.push({
            weekNumber: week, 
            week: week, // CRITICAL: Ensures Worker UI bridge can read the week
            games: weekGames,
            teamsWithBye: teamsOnByeIds
        });
    }

    // Final validation and adjustment
    const finalValidation = validateSchedule(schedule, teams);
    if (!finalValidation.valid) {
        console.warn('Final validation failed, using simple schedule:', finalValidation.errors);
        return createSimpleSchedule(teams);
    }

    console.log('Schedule fixed successfully');
    logScheduleStats(schedule, teams);
    return schedule;
}

/**
 * Validates that the schedule is correct
 * @param {Object} schedule - Schedule object
 * @param {Array} teams - Teams array
 * @returns {Object} Validation result
 */
function validateSchedule(schedule, teams) {
    const result = { valid: true, errors: [] };
    const teamGameCount = {};
    const teamByeCount = {};

    const teamMap = new Map();
    teams.forEach(team => {
        teamGameCount[team.id] = 0;
        teamByeCount[team.id] = 0;
        teamMap.set(team.id, team);
    });

    schedule.weeks.forEach((week, weekIndex) => {
        const weekNumber = week.weekNumber || week.week || (weekIndex + 1);
        const byeTeamsThisWeek = new Set();

        if (week.teamsWithBye) {
            week.teamsWithBye.forEach(teamId => {
                if (teamId !== undefined && teamId !== null) byeTeamsThisWeek.add(teamId);
            });
        }

        week.games.forEach(game => {
            if (game.bye) {
                if (Array.isArray(game.bye)) {
                    game.bye.forEach(teamId => {
                        if (teamId !== undefined && teamId !== null) byeTeamsThisWeek.add(teamId);
                    });
                }
                return;
            }

            if (game.home !== undefined && game.away !== undefined) {
                teamGameCount[game.home]++;
                teamGameCount[game.away]++;
            }
        });

        byeTeamsThisWeek.forEach(teamId => {
            teamByeCount[teamId] = (teamByeCount[teamId] || 0) + 1;
            if (weekNumber <= 4) {
                result.valid = false;
                result.errors.push(`Team ${teamMap.get(teamId)?.name || teamId} has bye in week ${weekNumber} (should be week 5+)`);
            }
        });
    });

    teams.forEach(team => {
        if (teamGameCount[team.id] !== 17) {
            result.valid = false;
            result.errors.push(`Team ${team.name} plays ${teamGameCount[team.id]} games instead of 17`);
        }
        if (teamByeCount[team.id] !== 1) {
            result.valid = false;
            result.errors.push(`Team ${team.name} has ${teamByeCount[team.id]} bye weeks instead of 1`);
        }
    });

    if (schedule.weeks.length !== 18) {
        result.valid = false;
        result.errors.push(`Schedule has ${schedule.weeks.length} weeks instead of 18`);
    }

    return result;
}

/**
 * Logs schedule statistics
 */
function logScheduleStats(schedule, teams) {
    const teamGameCount = {};
    const teamByeWeek = {};

    teams.forEach(team => {
        teamGameCount[team.id] = 0;
        teamByeWeek[team.id] = null;
    });

    schedule.weeks.forEach(week => {
        if (week.teamsWithBye) {
            week.teamsWithBye.forEach(teamId => {
                if (teamId !== undefined && teamId !== null) teamByeWeek[teamId] = week.weekNumber || week.week;
            });
        }
        
        week.games.forEach(game => {
            if (game.bye) {
                if (Array.isArray(game.bye)) {
                    game.bye.forEach(teamId => {
                        if (teamId !== undefined && teamId !== null) teamByeWeek[teamId] = week.weekNumber || week.week;
                    });
                }
                return;
            }
            if (game.home !== undefined && game.away !== undefined) {
                teamGameCount[game.home]++;
                teamGameCount[game.away]++;
            }
        });
    });

    console.log('Schedule Statistics:');
    console.log('- Weeks:', schedule.weeks.length);
    console.log('- Games per team:', Object.values(teamGameCount));
    console.log('- Bye week distribution:',
        schedule.weeks.slice(4, 12).map((week, i) =>
            `Week ${i+5}: ${week.teamsWithBye.length} teams`
        ).join(', ')
    );
}

/**
 * Creates a simple round-robin style schedule as a fallback
 * @param {Array} teams - Array of team objects
 * @returns {Object} Schedule object
 */
function createSimpleSchedule(teams) {
    console.log('Creating simple fallback schedule...');
    const schedule = {
        weeks: [],
        teams: teams,
        metadata: {
            generated: new Date().toISOString(),
            type: 'simple-fallback'
        }
    };

    // Initialize tracking
    const teamGameCount = {};
    const teamByeWeek = {};

    teams.forEach(team => {
        teamGameCount[team.id] = 0;
        teamByeWeek[team.id] = null;
    });

    // Pre-assign all bye weeks: 4 teams per week for weeks 5-12
    const teamsForBye = [...teams];
    shuffleArray(teamsForBye);
    let byeIndex = 0;

    for (let week = 5; week <= 12; week++) {
        const teamsThisWeek = 4;
        for (let i = 0; i < teamsThisWeek && byeIndex < teamsForBye.length; i++) {
            teamByeWeek[teamsForBye[byeIndex].id] = week;
            byeIndex++;
        }
    }
    
    // Create 18 weeks
    for (let week = 1; week <= 18; week++) {
        const weekGames = [];
        const teamsOnBye = teams.filter(team => teamByeWeek[team.id] === week);
        
        // Add bye games
        if (teamsOnBye.length > 0) {
            weekGames.push({
                bye: teamsOnBye.map(team => team.id)
            });
        }
        
        // Get teams available to play this week
        const availableTeams = teams.filter(team =>
            teamByeWeek[team.id] !== week &&
            teamGameCount[team.id] < 17
        );
        
        shuffleArray(availableTeams);
        
        // Schedule games for remaining teams
        for (let i = 0; i < availableTeams.length - 1; i += 2) {
            const team1 = availableTeams[i];
            const team2 = availableTeams[i + 1];
            
            if (teamGameCount[team1.id] < 17 && teamGameCount[team2.id] < 17) {
                weekGames.push({
                    home: team1.id,
                    away: team2.id,
                    week: week
                });
                teamGameCount[team1.id]++;
                teamGameCount[team2.id]++;
            }
        }
        
        schedule.weeks.push({
            weekNumber: week,
            week: week, // CRITICAL: Ensures Worker UI bridge can read the week
            games: weekGames,
            teamsWithBye: teamsOnBye.map(team => team.id)
        });
    }

    return schedule;
}

/**
 * Shuffles an array in place
 * @param {Array} array - Array to shuffle
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor((Utils?.random ? Utils.random() : Math.random()) * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

/**
 * Retrieves the games for a specific week number
 * @param {Object} schedule - Schedule object
 * @param {number} weekNumber - 1-based week number
 * @returns {Object} Week object with games
 */
function getWeekGames(schedule, weekNumber) {
    if (!schedule) return null;
    const weeks = schedule.weeks || schedule;
    if (!Array.isArray(weeks)) return null;

    const index = weekNumber - 1;
    if (index < 0 || index >= weeks.length) return null;

    return weeks[index];
}

const Scheduler = {
    makeAccurateSchedule,
    createNFLStyleSchedule,
    createSimpleSchedule,
    getWeekGames
};

// Export for ES modules
export { Scheduler, makeAccurateSchedule, getWeekGames };
