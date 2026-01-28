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
        const weekIndex = (league.week || 1) - 1;
        const scheduleWeeks = league.schedule.weeks || league.schedule;
        const weekData = scheduleWeeks[weekIndex];

        if (!weekData) {
            console.error(`No data found for week ${league.week}`);
            return { gamesSimulated: 0, results: [] };
        }

        const pairings = weekData.games || [];

        // Prepare games
        const gamesToSim = pairings.map(pair => {
            if (pair.bye !== undefined) return { bye: pair.bye };

            const home = league.teams[pair.home];
            const away = league.teams[pair.away];

            if (!home || !away) return null;

            return {
                home: home,
                away: away,
                week: league.week,
                year: league.year
            };
        }).filter(g => g !== null);

        // Run Batch Simulation
        const results = simulateBatch(gamesToSim, options);
        const gamesSimulated = results.filter(r => !r.bye).length;

        // Store results
        if (!league.resultsByWeek) league.resultsByWeek = {};
        league.resultsByWeek[league.week - 1] = results;

        // Update single game records
        if (typeof window.updateSingleGameRecords === 'function') {
            try {
                window.updateSingleGameRecords(league, league.year, league.week);
            } catch (e) {
                console.error('Error updating records:', e);
            }
        }

        // Advance Week
        const previousWeek = league.week;
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
