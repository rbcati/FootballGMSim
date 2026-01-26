// news-engine.js
import { Utils } from './utils.js';

export class NewsEngine {
    constructor() {
        // Initialize news array if not present in state
        if (typeof window !== 'undefined' && window.state && !window.state.news) {
            window.state.news = [];
        }
    }

    get stories() {
        return (window.state && window.state.news) ? window.state.news : [];
    }

    /**
     * Adds a new story to the news feed.
     * @param {Object} story - { headline, body, category, image, week, year }
     */
    addStory(story) {
        if (!window.state) return;
        if (!window.state.news) window.state.news = [];

        const defaultStory = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            date: new Date().toISOString(),
            year: window.state.league?.year || 2025,
            week: window.state.league?.week || 0,
            category: 'General',
            image: null,
            read: false
        };

        const newStory = { ...defaultStory, ...story };
        window.state.news.unshift(newStory);

        // Limit history to 50 stories to save space
        if (window.state.news.length > 50) {
            window.state.news = window.state.news.slice(0, 50);
        }

        console.log('📰 News Added:', newStory.headline);
    }

    /**
     * Generates stories based on the current week's results.
     * @param {Object} league - The league object
     */
    generateWeeklyStories(league) {
        if (!league || !league.resultsByWeek) return;

        // Logic correction: simulation.js calls this BEFORE incrementing league.week.
        // So league.week is the current week index (1-based).
        // Results are stored at index league.week - 1.
        const weekIndex = (league.week || 1) - 1;

        if (weekIndex < 0 || !league.resultsByWeek[weekIndex]) return;

        const results = league.resultsByWeek[weekIndex];

        if (!results || results.length === 0) return;

        // 1. Check for Upsets
        results.forEach(game => {
             // Logic to determine upset (e.g., OVR difference > 5 and favorite lost)
             const home = league.teams.find(t => t.id === game.home);
             const away = league.teams.find(t => t.id === game.away);
             if (!home || !away) return;

             // Simple OVR check
             const homeOvr = home.ovr || 50;
             const awayOvr = away.ovr || 50;
             const diff = homeOvr - awayOvr;
             const homeWon = game.scoreHome > game.scoreAway;

             if (diff > 5 && !homeWon) {
                 this.addStory({
                     headline: `UPSET: ${away.name} shock ${home.name}!`,
                     body: `Despite being underdogs, the ${away.name} pulled off a stunning ${game.scoreAway}-${game.scoreHome} victory over the ${home.name}.`,
                     category: 'Game Result',
                     teamId: away.id
                 });
             } else if (diff < -5 && homeWon) {
                 this.addStory({
                     headline: `UPSET: ${home.name} stun ${away.name}!`,
                     body: `The ${home.name} defended their turf with a surprising ${game.scoreHome}-${game.scoreAway} win against the favored ${away.name}.`,
                     category: 'Game Result',
                     teamId: home.id
                 });
             }
        });

        // 2. Check for Big Performances (Player of the Week candidates)
        let topPerformer = null;
        let topScore = 0;

        results.forEach(game => {
            const checkPlayer = (pStats, teamName) => {
                if (!pStats) return;
                // Simple fantasy score approx
                let score = (pStats.passYd || 0) / 25 + (pStats.passTD || 0) * 4 +
                            (pStats.rushYd || 0) / 10 + (pStats.rushTD || 0) * 6 +
                            (pStats.recYd || 0) / 10 + (pStats.recTD || 0) * 6;

                if (score > topScore) {
                    topScore = score;
                    topPerformer = { name: pStats.name, team: teamName, stats: pStats, score };
                }
            };

            const box = game.boxScore;
            if (box) {
                if (box.home) Object.values(box.home).forEach(p => checkPlayer(p.stats, game.homeTeamName));
                if (box.away) Object.values(box.away).forEach(p => checkPlayer(p.stats, game.awayTeamName));
            }
        });

        if (topPerformer && topScore > 35) {
             this.addStory({
                 headline: `DOMINANCE: ${topPerformer.name} takes over!`,
                 body: `${topPerformer.name} of the ${topPerformer.team} had a monster game this week, putting up league-leading numbers.`,
                 category: 'Player Spotlight',
                 image: null
             });
        }
    }
}

// Global Export
if (typeof window !== 'undefined') {
    window.NewsEngine = NewsEngine;
}
