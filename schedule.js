'use strict';

(function(global) {
    /**
     * Main function to create the schedule.
     * @param {Array} teams - Array of team objects
     * @returns {Object} Schedule object with weeks array
     */
    function makeAccurateSchedule(teams) {
        if (!teams || teams.length !== 32) {
            console.warn('Expected 32 teams, got', teams.length, '. Using simple schedule as fallback.');
            return createSimpleSchedule(teams);
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

        // Pre-assign all bye weeks: 2 teams per week for weeks 5-17, 4 teams in week 18
        const teamsForBye = [...teams];
        shuffleArray(teamsForBye);
        let byeIndex = 0;
        
        for (let week = 5; week <= 18; week++) {
            const teamsThisWeek = week <= 17 ? 2 : 4; // 2 teams per week, 4 in week 18
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
     * Distributes bye weeks across weeks 5-18
     * @param {Array} teams - Array of team objects
     * @returns {Array} Array of arrays, each containing team IDs for that bye week
     */
    function distributeByeWeeks(teams) {
        const shuffledTeams = [...teams];
        shuffleArray(shuffledTeams);
        
        const byeWeeks = []; // Index 0 = week 5, Index 13 = week 18
        const weeksAvailable = 14; // weeks 5-18
        const teamsPerWeek = Math.floor(32 / weeksAvailable); // 2 teams per week
        const extraWeeks = 32 % weeksAvailable; // 4 extra teams need to be distributed
        
        let teamIndex = 0;
        
        for (let weekIndex = 0; weekIndex < weeksAvailable; weekIndex++) {
            const teamsThisWeek = teamsPerWeek + (weekIndex < extraWeeks ? 1 : 0);
            const weekTeams = [];
            
            for (let i = 0; i < teamsThisWeek && teamIndex < shuffledTeams.length; i++) {
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
        for (const team1 of shuffledTeams) {
            if (usedThisWeek.has(team1.id) || teamGameCount[team1.id] >= 17) continue;
            
            // Find best opponent for team1
            let bestOpponent = null;
            for (const team2 of shuffledTeams) {
                if (team2.id === team1.id || usedThisWeek.has(team2.id)) continue;
                if (teamGameCount[team2.id] >= 17) continue;
                if (!teamOpponents[team1.id].has(team2.id)) {
                    bestOpponent = team2;
                    break;
                }
            }
            
            // If no new opponent found, take any available opponent
            if (!bestOpponent) {
                for (const team2 of shuffledTeams) {
                    if (team2.id === team1.id || usedThisWeek.has(team2.id)) continue;
                    if (teamGameCount[team2.id] >= 17) continue;
                    bestOpponent = team2;
                    break;
                }
            }
            
            if (bestOpponent) {
                weekPairings.push([team1, bestOpponent]);
                usedThisWeek.add(team1.id);
                usedThisWeek.add(bestOpponent.id);
                
                // Update tracking
                teamGameCount[team1.id]++;
                teamGameCount[bestOpponent.id]++;
                teamOpponents[team1.id].add(bestOpponent.id);
                teamOpponents[bestOpponent.id].add(team1.id);
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

        // Pre-assign all bye weeks: 2 teams per week for weeks 5-17, 4 teams in week 18
        const teamsNeedingBye = [...teams];
        shuffleArray(teamsNeedingBye);
        let byeIndex = 0;
        
        for (let week = 5; week <= 18; week++) {
            const teamsThisWeek = week <= 17 ? 2 : 4; // 2 teams per week, 4 in week 18
            for (let i = 0; i < teamsThisWeek && byeIndex < teamsNeedingBye.length; i++) {
                teamByeWeek[teamsNeedingBye[byeIndex].id] = week;
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

            // Get teams available to play this week (not on bye and haven't played 17 games)
            const teamsToSchedule = teams.filter(team => 
                teamByeWeek[team.id] !== week && 
                teamGameCount[team.id] < 17
            );

            // Pair teams for games
            const usedThisWeek = new Set();
            const shuffledTeams = [...teamsToSchedule];
            shuffleArray(shuffledTeams);
            
            for (let i = 0; i < shuffledTeams.length - 1; i++) {
                const team1 = shuffledTeams[i];
                if (usedThisWeek.has(team1.id) || teamGameCount[team1.id] >= 17) continue;
                
                // Find an opponent for team1
                let bestOpponent = null;
                for (let j = i + 1; j < shuffledTeams.length; j++) {
                    const team2 = shuffledTeams[j];
                    if (usedThisWeek.has(team2.id) || teamGameCount[team2.id] >= 17) continue;
                    if (team2.id === team1.id) continue;
                    
                    // Prefer teams that haven't played each other yet
                    if (!teamOpponents[team1.id].has(team2.id)) {
                        bestOpponent = team2;
                        break;
                    }
                }
                
                // If no new opponent, take any available
                if (!bestOpponent) {
                    for (let j = i + 1; j < shuffledTeams.length; j++) {
                        const team2 = shuffledTeams[j];
                        if (usedThisWeek.has(team2.id) || teamGameCount[team2.id] >= 17) continue;
                        if (team2.id === team1.id) continue;
                        bestOpponent = team2;
                        break;
                    }
                }
                
                if (bestOpponent) {
                    weekGames.push({
                        home: team1.id,
                        away: bestOpponent.id,
                        week: week
                    });
                    
                    teamGameCount[team1.id]++;
                    teamGameCount[bestOpponent.id]++;
                    teamOpponents[team1.id].add(bestOpponent.id);
                    teamOpponents[bestOpponent.id].add(team1.id);
                    
                    usedThisWeek.add(team1.id);
                    usedThisWeek.add(bestOpponent.id);
                }
            }

            schedule.weeks.push({ 
                weekNumber: week, 
                games: weekGames,
                teamsWithBye: teamsOnBye.map(team => team.id)
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
        
        teams.forEach(team => {
            teamGameCount[team.id] = 0;
            teamByeCount[team.id] = 0;
        });
        
        schedule.weeks.forEach((week, weekIndex) => {
            const weekNumber = week.weekNumber || (weekIndex + 1);
            
            // Count bye weeks from teamsWithBye array
            if (week.teamsWithBye) {
                week.teamsWithBye.forEach(teamId => {
                    if (teamId !== undefined && teamId !== null) {
                        teamByeCount[teamId]++;
                        
                        // Check if bye is in weeks 1-4 (should not be)
                        if (weekNumber <= 4) {
                            result.valid = false;
                            result.errors.push(`Team ${teams.find(t => t.id === teamId)?.name || teamId} has bye in week ${weekNumber} (should be week 5+)`);
                        }
                    }
                });
            }
            
            // Count games and bye weeks from games array
            week.games.forEach(game => {
                if (game.bye) {
                    // Count bye teams from game.bye array
                    if (Array.isArray(game.bye)) {
                        game.bye.forEach(teamId => {
                            if (teamId !== undefined && teamId !== null) {
                                teamByeCount[teamId]++;
                                
                                // Check if bye is in weeks 1-4 (should not be)
                                if (weekNumber <= 4) {
                                    result.valid = false;
                                    result.errors.push(`Team ${teams.find(t => t.id === teamId)?.name || teamId} has bye in week ${weekNumber} (should be week 5+)`);
                                }
                            }
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
        
        // Validate game counts
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
        
        // Validate week count
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
                    if (teamId !== undefined && teamId !== null) {
                        teamByeWeek[teamId] = week.weekNumber;
                    }
                });
            }
            
            week.games.forEach(game => {
                if (game.bye) {
                    // Count bye teams from game.bye array
                    if (Array.isArray(game.bye)) {
                        game.bye.forEach(teamId => {
                            if (teamId !== undefined && teamId !== null) {
                                teamByeWeek[teamId] = week.weekNumber;
                            }
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
            schedule.weeks.slice(4).map((week, i) => 
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

        // Pre-assign all bye weeks: 2 teams per week for weeks 5-17, 4 teams in week 18
        const teamsForBye = [...teams];
        shuffleArray(teamsForBye);
        let byeIndex = 0;
        
        for (let week = 5; week <= 18; week++) {
            const teamsThisWeek = week <= 17 ? 2 : 4; // 2 teams per week, 4 in week 18
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
            const j = Math.floor(Math.random() * (i + 1));
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

        // Handle 1-based indexing
        const index = weekNumber - 1;
        if (index < 0 || index >= weeks.length) return null;

        return weeks[index];
    }

    // Expose the Scheduler object globally
    global.Scheduler = {
        makeAccurateSchedule,
        createNFLStyleSchedule,
        createSimpleSchedule,
        getWeekGames
    };

    // Make your primary function globally available under the name the game expects.
    global.makeSchedule = makeAccurateSchedule;

})(window);
