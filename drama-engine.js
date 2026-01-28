// drama-engine.js
'use strict';

/**
 * Contextual Drama Engine
 * Detects high-stakes situations to amplify tension.
 */

class DramaEngine {
    /**
     * Evaluates the current week for a specific team and returns a context tag.
     * @param {Object} league - The league object.
     * @param {number} teamId - The user's team ID.
     * @returns {Object|null} - Context object { tag, reason, severity } or null.
     */
    static evaluateWeek(league, teamId) {
        if (!league || !league.teams) return null;

        const team = league.teams.find(t => t.id === teamId);
        if (!team) return null;

        const week = league.week;
        const totalWeeks = league.schedule?.weeks?.length || 18; // Default to 18 weeks
        const gamesRemaining = totalWeeks - week + 1;

        // Skip drama for early season (unless job security is terrible)
        if (week < 10 && !this.checkJobSecurity(team)) return null;

        // Ensure standings calculator is available
        const calcStandings = window.calculateAllStandings || window.calculateStandings;
        if (!calcStandings) {
            console.warn('DramaEngine: Standings calculator not found.');
            return null;
        }

        const standings = calcStandings(league);
        if (!standings) return null;

        // 1. Check Job Security (Highest Priority)
        const jobCheck = this.checkJobSecurity(team);
        if (jobCheck) return jobCheck;

        // 2. Check Division Race
        const divCheck = this.checkDivisionRace(team, standings, gamesRemaining);
        if (divCheck) return divCheck;

        // 3. Check Playoff Race
        const playoffCheck = this.checkPlayoffRace(team, standings, gamesRemaining);
        if (playoffCheck) return playoffCheck;

        // 4. Streaks (Late Season Collapse or Surge)
        if (week > 10) {
            if (this.checkStreak(team, 'L', 3, league)) {
                return {
                    tag: 'COLLAPSE_RISK',
                    reason: 'Stop the bleeding before the season slips away.',
                    severity: 6
                };
            }
        }

        return null;
    }

    static checkJobSecurity(team) {
        if (window.state && window.state.ownerMode && window.state.ownerMode.enabled) {
            const sat = window.state.ownerMode.fanSatisfaction;
            if (sat < 30) {
                return {
                    tag: 'JOB_CRITICAL',
                    reason: 'Owner patience has run out. Win or else.',
                    severity: 10
                };
            } else if (sat < 45) {
                return {
                    tag: 'JOB_WARNING',
                    reason: 'Owner approval is dangerously low.',
                    severity: 8
                };
            }
        }
        return null;
    }

    static checkDivisionRace(team, standings, gamesRemaining) {
        const confId = team.conf;
        const divId = team.div;

        // Get division sorted by rank
        const divTeams = standings.divisions[confId][divId]; // Already sorted by calculateAllStandings
        const rank = divTeams.findIndex(t => t.id === team.id);
        const leader = divTeams[0];
        const second = divTeams[1];

        // Scenario A: We are leading
        if (rank === 0) {
            const magicNumber = this.calculateMagicNumber(team, second, gamesRemaining);

            if (magicNumber <= 1) {
                return {
                    tag: 'DIVISION_CLINCH',
                    reason: 'A win today clinches the Division Title!',
                    severity: 9
                };
            } else if (gamesRemaining <= 3 && magicNumber <= 2) {
                 return {
                    tag: 'DIVISION_LEADER',
                    reason: 'Maintain the lead to secure the division.',
                    severity: 7
                };
            }
        }
        // Scenario B: We are chasing (2nd place)
        else if (rank === 1) {
             const gb = window.calculateGamesBack ? window.calculateGamesBack(leader, team) : 1;

             if (gb <= 1 && gamesRemaining <= 2) {
                 return {
                     tag: 'DIVISION_DECIDER',
                     reason: 'Division title is within reach. Must win.',
                     severity: 9
                 };
             }
        }

        return null;
    }

    static checkPlayoffRace(team, standings, gamesRemaining) {
        const confId = team.conf;
        const confTeams = standings.conferences[confId]; // Sorted by seed
        const rank = confTeams.findIndex(t => t.id === team.id); // 0-indexed (0 is 1st seed)
        const seed = rank + 1;

        // Top 7 make playoffs
        const LAST_SEED = 7;

        // Scenario A: Just Outside (Bubble)
        if (seed > LAST_SEED && seed <= LAST_SEED + 2) {
            return {
                tag: 'PLAYOFF_HUNT',
                reason: `Currently #${seed} seed. Win to push for a playoff spot.`,
                severity: 8
            };
        }

        // Scenario B: Just Inside (Cling)
        if (seed >= LAST_SEED - 1 && seed <= LAST_SEED) {
             return {
                tag: 'PLAYOFF_BUBBLE',
                reason: `Clinging to the #${seed} seed. Cannot afford a loss.`,
                severity: 8
            };
        }

        // Scenario C: Clinch Opportunity (Generic)
        // Hard to calc exact clinch without simulating all games, but if high seed late season...
        if (seed <= 5 && gamesRemaining <= 2) {
             // Assume close to clinching
             return {
                 tag: 'PLAYOFF_POSITIONING',
                 reason: 'Fight for a better playoff seed.',
                 severity: 5
             };
        }

        return null;
    }

    static calculateMagicNumber(leader, trailer, gamesRemaining) {
        // Simple magic number approximation
        // (Games Total + 1) - Leader Wins - Trailer Losses
        // But here we can just check games ahead vs games remaining
        // If Leader Wins > Trailer Max Possible Wins (Trailer Wins + Remaining)
        const trailerMaxWins = trailer.wins + gamesRemaining; // Roughly
        // Real Magic Number: (TotalGames + 1) - WA - LB
        // This is complex without knowing exact remaining schedules.
        // Simplified:
        return (trailer.wins + gamesRemaining) - leader.wins + 1; // Very rough
    }

    static checkStreak(team, type, length, league) {
        if (!league || !league.resultsByWeek) return false;

        let streak = 0;
        // Iterate backwards from current week - 1
        for (let w = (league.week || 1) - 1; w >= 0; w--) {
            const weekResults = league.resultsByWeek[w];
            if (!weekResults) continue;

            const game = weekResults.find(g => g.home === team.id || g.away === team.id);
            if (!game) continue; // Bye week

            const isHome = game.home === team.id;
            const myScore = isHome ? game.scoreHome : game.scoreAway;
            const oppScore = isHome ? game.scoreAway : game.scoreHome;

            // Check outcome matching type
            let match = false;
            if (type === 'W' && myScore > oppScore) match = true;
            else if (type === 'L' && myScore < oppScore) match = true;

            if (match) {
                streak++;
            } else {
                break; // Streak broken
            }
        }

        return streak >= length;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.DramaEngine = DramaEngine;
}
export default DramaEngine;
