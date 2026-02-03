/*
 * Game Runner Module
 * Unifies simulation logic for Regular Season and Playoffs
 * Refactored to be pure (Worker-compatible)
 */

import GameSimulator from './game-simulator.js';
import { getWeekGames } from './schedule.js';

const { simulateBatch } = GameSimulator;

class GameRunner {
    /**
     * Simulates a regular season week.
     * @param {Object} league - The league object.
     * @param {Object} options - Options { render: boolean, ownerMode: Object }.
     * @returns {Object} Results { gamesSimulated: number, results: Array }
     */
    static simulateRegularSeasonWeek(league, options = {}) {
        const weekNum = league.week || 1;
        // console.log(`[GameRunner] Simulating Week ${weekNum}`);

        // Use imported helper to get schedule data
        let weekData;
        if (getWeekGames) {
            weekData = getWeekGames(league.schedule, weekNum);
        } else {
            // Fallback
            const scheduleWeeks = league.schedule.weeks || league.schedule;
            weekData = scheduleWeeks[weekNum - 1];
        }

        if (!weekData) {
            console.error(`[GameRunner] No data found for week ${weekNum}`);
            return { gamesSimulated: 0, results: [] };
        }

        const pairings = weekData.games || [];

        // Prepare games
        const gamesToSim = pairings.map(pair => {
            if (pair.bye !== undefined) return { bye: pair.bye };

            // Ensure we use IDs to find teams if pair.home/away are IDs
            const homeId = typeof pair.home === 'object' ? pair.home.id : pair.home;
            const awayId = typeof pair.away === 'object' ? pair.away.id : pair.away;

            const home = league.teams.find(t => t.id === homeId);
            const away = league.teams.find(t => t.id === awayId);

            if (!home || !away) return null;

            const gameObj = {
                home: home,
                away: away,
                week: weekNum,
                year: league.year
            };

            // Capture User Context for Post-Game Callbacks
            if (league.userTeamId !== undefined && (home.id === league.userTeamId || away.id === league.userTeamId)) {
                const isHome = home.id === league.userTeamId;
                const userTeam = isHome ? home : away;
                const oppTeam = isHome ? away : home;
                const plan = league.weeklyGamePlan || {};

                // Get ratings (fallback to OVR if missing)
                const getRat = (t, type) => (t.ratings && t.ratings[type] ? t.ratings[type].overall : (t.ovr || 50));

                const userOff = getRat(userTeam, 'offense');
                const userDef = getRat(userTeam, 'defense');
                const oppOff = getRat(oppTeam, 'offense');
                const oppDef = getRat(oppTeam, 'defense');

                let matchupStr = null;

                // Heuristic for team identity
                const qb = userTeam.roster ? userTeam.roster.find(p => p.pos === 'QB') : null;
                const bestRB = userTeam.roster ? userTeam.roster.filter(p => p.pos === 'RB').sort((a,b) => (b.ovr||0) - (a.ovr||0))[0] : null;
                const passingStrength = (qb?.ovr || 0);
                const rushingStrength = (bestRB?.ovr || 0);

                if (userOff > oppDef + 3) {
                     if (passingStrength >= rushingStrength) matchupStr = "Favorable matchup for Passing";
                     else matchupStr = "Favorable matchup for Rushing";
                } else if (userOff < oppDef - 4) {
                     matchupStr = "Tough matchup for Offense";
                }

                const stakesVal = GameRunner.calculateContextualStakes(league, userTeam, oppTeam, options.ownerMode);

                gameObj.preGameContext = {
                    matchup: matchupStr,
                    offPlanId: plan.offPlanId,
                    defPlanId: plan.defPlanId,
                    riskId: plan.riskId,
                    stakes: stakesVal,
                    userIsHome: isHome
                };
            }

            return gameObj;
        }).filter(g => g !== null);

        // Run Batch Simulation
        // simulateBatch internally calls finalizeGameResult which updates schedule
        // Pass league to options for scheme fit calculation
        const results = simulateBatch(gamesToSim, { ...options, league });
        const gamesSimulated = results.filter(r => !r.bye).length;

        // Note: Side effects (updating records, training, news, etc.) are handled by the caller (simulation.js)

        return { gamesSimulated, results, week: weekNum };
    }

    /**
     * Calculates the stakes of a matchup for simulation context.
     * @param {Object} league - League object
     * @param {Object} team - Team object (User team)
     * @param {Object} opponent - Opponent team object
     * @param {Object} ownerMode - Owner mode settings/status
     * @returns {number} Stakes score (0-100)
     */
    static calculateContextualStakes(league, team, opponent, ownerMode) {
        if (!league || !team || !opponent) return 0;
        const week = league.week;
        let stakes = 0;

        // 1. Division Clinch Scenario
        if (week >= 14 && team.conf === opponent.conf && team.div === opponent.div) {
            const divTeams = league.teams.filter(t => t.conf === team.conf && t.div === team.div);
            divTeams.sort((a, b) => ((b.wins || b.record?.w || 0) - (a.wins || a.record?.w || 0)));
            const rank = divTeams.findIndex(t => t.id === team.id);
            const gamesRemaining = 18 - week;

            if (rank === 0) {
                const secondPlace = divTeams[1];
                if (secondPlace) {
                    const lead = (team.wins || team.record?.w || 0) - (secondPlace.wins || secondPlace.record?.w || 0);
                    if (lead >= gamesRemaining && lead <= gamesRemaining + 1) {
                         stakes = 95;
                    }
                }
            }
        }

        // 2. Playoff Bubble
        if (stakes === 0 && week >= 13) {
            const confTeams = league.teams.filter(t => t.conf === team.conf).sort((a, b) => ((b.wins || b.record?.w || 0) - (a.wins || a.record?.w || 0)));
            const confRank = confTeams.findIndex(t => t.id === team.id) + 1;
            if (confRank >= 6 && confRank <= 9) {
                stakes = 85;
            }
        }

        // 3. Coach Hot Seat
        if (stakes === 0 && ownerMode?.enabled) {
            const satisfaction = ownerMode.fanSatisfaction;
            if (satisfaction < 35) {
                stakes = 90;
            }
        }

        // 4. Rivalry
        if (stakes === 0 && team.rivalries && team.rivalries[opponent.id]) {
            const rivScore = team.rivalries[opponent.id].score;
            if (rivScore > 60) {
                stakes = 70 + (rivScore/5);
            }
        }

        return stakes;
    }

    /**
     * Simulates a batch of playoff games.
     * @param {Array} games - Array of game objects { home, away }.
     * @param {number} year - Current year.
     * @param {Object} league - The league object.
     * @returns {Array} List of winner team objects.
     */
    static simulatePlayoffGames(games, year, league) {
        const gamesToSim = games.map(g => ({
            home: g.home,
            away: g.away,
            year: year
        })).filter(g => g.home && g.away);

        if (gamesToSim.length === 0) return { winners: [], results: [] };

        if (!league) {
            console.warn('GameRunner.simulatePlayoffGames called without league object. This may fail if scheme logic is needed.');
        }

        // Run Batch (isPlayoff: true prevents W/L record updates)
        const results = simulateBatch(gamesToSim, { isPlayoff: true, league: league });
        const winners = [];
        const gameResults = [];

        results.forEach(res => {
            // Reconstruct game object logic
            const gameHome = gamesToSim.find(g => g.home.name === res.homeTeamName)?.home;
            const gameAway = gamesToSim.find(g => g.away.name === res.awayTeamName)?.away;

            if (gameHome && gameAway) {
                gameResults.push({
                    home: gameHome,
                    away: gameAway,
                    scoreHome: res.scoreHome,
                    scoreAway: res.scoreAway
                });

                winners.push(res.homeWin ? gameHome : gameAway);
            }
        });

        return { winners, results: gameResults };
    }
}

export default GameRunner;
