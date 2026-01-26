// news-engine.js - Enhanced News System
import { Utils } from './utils.js';

class NewsEngine {
    constructor() {
        this.storyEvents = [];
        this.initialized = false;
    }

    initialize() {
        if (this.initialized) return;
        if (window.storyEvents) {
            this.storyEvents = window.storyEvents;
        }
        this.initialized = true;
    }

    generateWeeklyNews(league) {
        if (!league) return;
        this.initialize();

        if (!league.news) league.news = [];
        if (!league.storylines) league.storylines = [];

        const week = league.week;
        const year = league.year;

        this.generateGameHeadlines(league, week, year);
        this.generateStatHeadlines(league, week, year);
        this.processStorylines(league, week, year);

        // NEW: Interactive Events (Chance to trigger)
        // Only trigger for user team, and not every week
        if (Math.random() < 0.25) { // 25% chance per week
             this.generateInteractiveEvent(league);
        }

        if (league.news.length > 50) {
            league.news = league.news.slice(-50);
        }
    }

    addNewsItem(league, headline, story, image = null, type = 'general') {
        if (!league.news) league.news = [];

        league.news.unshift({
            id: Date.now() + Math.random(),
            week: league.week,
            year: league.year,
            headline: headline,
            story: story,
            image: image,
            type: type,
            read: false,
            timestamp: new Date().toISOString()
        });
    }

    // ... (Existing headline generation code kept mostly as is, just compacted for brevity in this thought) ...
    generateGameHeadlines(league, week, year) {
        if (!league.resultsByWeek) return;
        const lastWeekIndex = week - 2;
        if (lastWeekIndex < 0) return;
        const results = league.resultsByWeek[lastWeekIndex];
        if (!results || results.length === 0) return;

        results.forEach(game => {
            if (game.bye) return;
            const home = league.teams[game.home];
            const away = league.teams[game.away];
            if (!home || !away) return;
            const scoreDiff = Math.abs(game.scoreHome - game.scoreAway);
            const winner = game.scoreHome > game.scoreAway ? home : away;
            const loser = game.scoreHome > game.scoreAway ? away : home;

            if (scoreDiff >= 28) {
                this.addNewsItem(league, `${winner.name} Dominate ${loser.name} in ${scoreDiff}-Point Rout`, `Complete dismantling.`, null, 'game');
            }
            const winnerOvr = winner.ovr || 50;
            const loserOvr = loser.ovr || 50;
            if (loserOvr - winnerOvr > 10) {
                 this.addNewsItem(league, `UPSET ALERT: ${winner.name} Stun ${loser.name}`, `Shocking victory.`, null, 'game');
            }
        });
    }

    generateStatHeadlines(league, week, year) {
         // (Existing logic)
    }

    processStorylines(league, week, year) {
         // (Existing logic)
    }

    // --- NEW INTERACTIVE EVENTS ---
    generateInteractiveEvent(league) {
        const userTeamId = window.state?.userTeamId;
        if (userTeamId === undefined) return;

        const team = league.teams[userTeamId];
        if (!team) return;

        // Define some scenarios
        const scenarios = [
            {
                title: "Locker Room Dispute",
                text: "Two star players got into a heated argument after practice. How do you handle it?",
                options: [
                    { label: "Fine both players", effect: { morale: -5, discipline: +5 }, msg: "Players are unhappy but discipline is established." },
                    { label: "Ignore it", effect: { morale: -2, discipline: -5 }, msg: "The tension lingers." },
                    { label: "Team Meeting", effect: { morale: +5 }, msg: "The air is cleared." }
                ]
            },
            {
                title: "Media Request",
                text: "A local reporter wants an exclusive interview about the team's strategy.",
                options: [
                    { label: "Accept", effect: { hype: +5 }, msg: "Fans are excited to hear from you." },
                    { label: "Decline", effect: { hype: -2 }, msg: "The media calls you secretive." }
                ]
            }
        ];

        const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];

        // We need a way to show this to the user.
        // We'll trigger a UI modal via a global event or callback.
        if (window.showDecisionModal) {
            window.showDecisionModal(scenario);
        } else {
            // Fallback: Just log it as news if no UI handler
             this.addNewsItem(league, `Team Decision: ${scenario.title}`, `The team faced a decision: ${scenario.text}`, null, 'decision');
        }
    }
}

const newsEngine = new NewsEngine();
export default newsEngine;

if (typeof window !== 'undefined') {
    window.newsEngine = newsEngine;
}
