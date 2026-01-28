/*
 * Game Runner Module
 * Unifies simulation loops for Regular Season and Playoffs
 */
import { Utils } from './utils.js';
import { saveState } from './state.js';
import { runWeeklyTraining } from './training.js';
import newsEngine from './news-engine.js';
import { showWeeklyRecap } from './weekly-recap.js';
import { checkAchievements } from './achievements.js';
import { simulateBatch } from './game-simulator.js';

class GameRunner {

    /**
     * Simulates a regular season week
     * @param {Object} league - The league object
     * @param {Object} options - Simulation options
     */
    static simulateRegularSeasonWeek(league, options = {}) {
        const L = league;
        if (!L) throw new Error('No league provided');

        // Handle Schedule
        const scheduleWeeks = L.schedule.weeks || L.schedule;
        if (!scheduleWeeks || !Array.isArray(scheduleWeeks)) {
            console.error('Invalid schedule format');
            return;
        }

        // Season Over Check
        if (L.week > scheduleWeeks.length) {
            // Handled by caller or specific logic
            return { seasonOver: true };
        }

        // Get Pairings
        const weekIndex = L.week - 1;
        const weekData = scheduleWeeks[weekIndex];
        if (!weekData) {
            console.error(`No data for week ${L.week}`);
            return;
        }

        const pairings = weekData.games || [];

        // Prepare Games
        const gamesToSim = pairings.map(pair => {
            if (pair.bye !== undefined) return { bye: pair.bye };
            const home = L.teams[pair.home];
            const away = L.teams[pair.away];
            if (!home || !away) return null;
            return { home, away, week: L.week, year: L.year };
        }).filter(g => g !== null);

        // Run Simulation
        const results = simulateBatch(gamesToSim, options);
        const gamesSimulated = results.filter(r => !r.bye).length;

        // Store Results
        if (!L.resultsByWeek) L.resultsByWeek = {};
        L.resultsByWeek[L.week - 1] = results;

        // Side Effects
        if (window.updateSingleGameRecords) {
            try { window.updateSingleGameRecords(L, L.year, L.week); }
            catch (e) { console.error(e); }
        }

        const previousWeek = L.week;
        L.week++;

        // Training
        try {
            if (runWeeklyTraining) runWeeklyTraining(L);
            else if (window.runWeeklyTraining) window.runWeeklyTraining(L);
        } catch (e) { console.error('Training error:', e); }

        // Depth Chart
        if (window.processWeeklyDepthChartUpdates) {
            try {
                L.teams.forEach(t => window.processWeeklyDepthChartUpdates(t));
            } catch (e) { console.error('Depth chart error:', e); }
        }

        // Owner Mode
        if (window.state?.ownerMode?.enabled && window.updateFanSatisfaction && window.calculateRevenue) {
            try {
                window.updateFanSatisfaction();
                window.calculateRevenue();
            } catch (e) { console.error('Owner mode error:', e); }
        }

        // News
        try {
            if (newsEngine && newsEngine.generateWeeklyNews) newsEngine.generateWeeklyNews(L);
        } catch (e) { console.error('News error:', e); }

        // Interactive Events
        try {
            if (newsEngine && newsEngine.generateInteractiveEvent) {
                const event = newsEngine.generateInteractiveEvent(L);
                if (event) window.state.pendingEvent = event;
            }
        } catch (e) { console.error('Event error:', e); }

        // Achievements
        if (checkAchievements) checkAchievements(window.state);

        // UI Updates
        if (options.render !== false) {
            if (saveState) saveState();
            if (window.renderStandings) window.renderStandings();
            if (window.renderHub) window.renderHub();
            if (window.updateCapSidebar) window.updateCapSidebar();
            if (showWeeklyRecap) showWeeklyRecap(previousWeek, results, L.news);

            // Reset Strategy
            if (L.weeklyGamePlan) {
                L.weeklyGamePlan = { offPlanId: 'BALANCED', defPlanId: 'BALANCED', riskId: 'BALANCED' };
            }

            if (window.setStatus) window.setStatus(`Week ${previousWeek} simulated - ${gamesSimulated} games completed`);
        }

        return { success: true, gamesSimulated, previousWeek };
    }

    /**
     * Simulates playoff games
     * @param {Array} games - Array of game objects
     * @param {number} year - Current year
     * @returns {Array} List of winners
     */
    static simulatePlayoffGames(games, year) {
        const gamesToSim = games.map(g => ({
            home: g.home,
            away: g.away,
            year: year
        })).filter(g => g.home && g.away);

        if (gamesToSim.length === 0) return [];

        const results = simulateBatch(gamesToSim, { isPlayoff: true });

        // Return results and winners to the caller for processing
        // The caller (playoffs.js) handles bracket logic
        return results;
    }
}

export default GameRunner;
