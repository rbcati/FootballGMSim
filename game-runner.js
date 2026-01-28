/*
 * Game Runner Module
 * Unifies simulation logic for Regular Season and Playoffs
 */

import GameSimulator from './game-simulator.js';
import { runWeeklyTraining } from './training.js';
import newsEngine from './news-engine.js';
import { showWeeklyRecap } from './weekly-recap.js';
import { checkAchievements } from './achievements.js';

const { simulateBatch } = GameSimulator;

class GameRunner {
    /**
     * Simulates a regular season week.
     * @param {Object} league - The league object.
     * @param {Object} options - Options { render: boolean }.
     * @returns {Object} Results { gamesSimulated: number, results: Array }
     */
    static simulateRegularSeasonWeek(league, options = {}) {
        const weekNum = league.week || 1;
        console.log(`[GameRunner] Simulating Week ${weekNum}`);

        // Use helper to get schedule data
        let weekData;
        if (window.Scheduler && window.Scheduler.getWeekGames) {
            weekData = window.Scheduler.getWeekGames(league.schedule, weekNum);
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

                let stakesVal = 0;
                if (userTeam.rivalries && userTeam.rivalries[oppTeam.id]) {
                    stakesVal = userTeam.rivalries[oppTeam.id].score;
                }

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
        const results = simulateBatch(gamesToSim, options);
        const gamesSimulated = results.filter(r => !r.bye).length;

        // Store results
        if (!league.resultsByWeek) league.resultsByWeek = {};
        league.resultsByWeek[weekNum - 1] = results;

        // [QA-AUDIT] Validate Finalization
        let finalizationError = false;
        if (weekData.games) {
            weekData.games.forEach(g => {
                if (!g.bye && !g.finalized) {
                    console.error(`[QA-AUDIT] Critical: Game not finalized after simulation! ${g.home} vs ${g.away}`);
                    finalizationError = true;
                }
            });
        }

        if (finalizationError && options.throwOnFailure) {
            throw new Error('Simulation failed to finalize all games.');
        }

        // Update single game records
        if (typeof window.updateSingleGameRecords === 'function') {
            try {
                window.updateSingleGameRecords(league, league.year, weekNum);
            } catch (e) {
                console.error('Error updating records:', e);
            }
        }

        // Advance Week
        const previousWeek = weekNum;
        league.week++;

        // Training
        try {
            if (typeof runWeeklyTraining === 'function') {
                runWeeklyTraining(league);
            } else if (typeof window.runWeeklyTraining === 'function') {
                window.runWeeklyTraining(league);
            }
        } catch (e) {
            console.error('Error in weekly training:', e);
        }

        // Depth Chart Updates
        if (typeof window.processWeeklyDepthChartUpdates === 'function') {
            try {
                league.teams.forEach(team => {
                    if (team && team.roster) window.processWeeklyDepthChartUpdates(team);
                });
            } catch (e) {
                console.error('Error in depth chart updates:', e);
            }
        }

        // Owner Mode
        if (window.state?.ownerMode?.enabled && typeof window.calculateRevenue === 'function') {
            try {
                window.updateFanSatisfaction();
                window.calculateRevenue();
            } catch (e) {
                console.error('Error updating owner mode:', e);
            }
        }

        // News
        try {
            if (newsEngine && newsEngine.generateWeeklyNews) {
                newsEngine.generateWeeklyNews(league);
            }
            if (newsEngine && newsEngine.generateInteractiveEvent) {
                const event = newsEngine.generateInteractiveEvent(league);
                if (event) window.state.pendingEvent = event;
            }
        } catch (e) {
            console.error('Error generating news:', e);
        }

        // Achievements
        if (checkAchievements) {
            checkAchievements(window.state);
        }

        // Recap
        if (options.render !== false && showWeeklyRecap) {
            showWeeklyRecap(previousWeek, results, league.news);
        }

        // Reset Strategy
        if (league.weeklyGamePlan) {
            league.weeklyGamePlan = { offPlanId: 'BALANCED', defPlanId: 'BALANCED', riskId: 'BALANCED' };
        }

        return { gamesSimulated, results };
    }

    /**
     * Simulates a batch of playoff games.
     * @param {Array} games - Array of game objects { home, away }.
     * @param {number} year - Current year.
     * @returns {Array} List of winner team objects.
     */
    static simulatePlayoffGames(games, year) {
        const gamesToSim = games.map(g => ({
            home: g.home,
            away: g.away,
            year: year
        })).filter(g => g.home && g.away);

        if (gamesToSim.length === 0) return { winners: [], results: [] };

        // Run Batch (isPlayoff: true prevents W/L record updates)
        const results = simulateBatch(gamesToSim, { isPlayoff: true });
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

                // Playoff Revenue
                if (gameHome.id === window.state.userTeamId && window.processPlayoffRevenue) {
                    window.processPlayoffRevenue(gameHome);
                }
            }
        });

        return { winners, results: gameResults };
    }
}

export default GameRunner;
