// news-engine.js
import { Utils } from './utils.js';

class NewsEngine {
    constructor() {
        this.storyEvents = [];
        this.initialized = false;
    }

    initialize() {
        if (this.initialized) return;

        // Load story templates
        if (window.storyEvents) {
            this.storyEvents = window.storyEvents;
        }

        this.initialized = true;
    }

    generateWeeklyNews(league) {
        if (!league) return;
        this.initialize();

        if (!league.news) league.news = [];

        const week = league.week;
        const year = league.year;

        // 1. Generate Game-Based Headlines (Upsets, Blowouts)
        this.generateGameHeadlines(league, week, year);

        // 2. Generate Stat-Based Headlines (League Leaders, Records)
        this.generateStatHeadlines(league, week, year);

        // 3. Process Story Events (Narrative)
        this.processStoryEvents(league, week, year);

        // Trim old news (keep last 50 items)
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

    generateGameHeadlines(league, week, year) {
        if (!league.resultsByWeek) return;

        // Check last week's results
        const lastWeekIndex = week - 2; // current week is upcoming, so check week - 1 (index week - 2)
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

            // Blowout check
            if (scoreDiff >= 28) {
                this.addNewsItem(league,
                    `${winner.name} Dominate ${loser.name} in ${scoreDiff}-Point Rout`,
                    `In a complete dismantling, the ${winner.name} crushed the ${loser.name} ${Math.max(game.scoreHome, game.scoreAway)}-${Math.min(game.scoreHome, game.scoreAway)}. Fans in ${loser.name} are calling for answers after this embarrassing performance.`,
                    null, 'game');
            }

            // Upset check (using OVR as proxy for odds)
            const winnerOvr = winner.ovr || 50;
            const loserOvr = loser.ovr || 50;

            if (loserOvr - winnerOvr > 10) {
                 this.addNewsItem(league,
                    `UPSET ALERT: ${winner.name} Stun ${loser.name}`,
                    `Despite being heavy underdogs, the ${winner.name} pulled off a shocking victory against the ${loser.name}. This loss puts a dent in ${loser.name}'s playoff hopes.`,
                    null, 'game');
            }

            // Shootout check
            if (game.scoreHome + game.scoreAway > 70) {
                this.addNewsItem(league,
                    `Offensive Explosion: ${winner.name} Win Shootout`,
                    `Defenses were optional as the ${winner.name} and ${loser.name} combined for ${game.scoreHome + game.scoreAway} points. The final score read ${Math.max(game.scoreHome, game.scoreAway)}-${Math.min(game.scoreHome, game.scoreAway)}.`,
                    null, 'game');
            }
        });
    }

    generateStatHeadlines(league, week, year) {
        // Find top performances
        let topPasser = { yds: 0, player: null };
        let topRusher = { yds: 0, player: null };
        let topReceiver = { yds: 0, player: null };

        league.teams.forEach(t => {
            t.roster.forEach(p => {
                if (p.stats && p.stats.game) {
                    if (p.stats.game.passYd > topPasser.yds) topPasser = { yds: p.stats.game.passYd, player: p, team: t };
                    if (p.stats.game.rushYd > topRusher.yds) topRusher = { yds: p.stats.game.rushYd, player: p, team: t };
                    if (p.stats.game.recYd > topReceiver.yds) topReceiver = { yds: p.stats.game.recYd, player: p, team: t };
                }
            });
        });

        if (topPasser.yds > 400) {
            this.addNewsItem(league,
                `Air Raid: ${topPasser.player.name} Throws for ${topPasser.yds} Yards`,
                `${topPasser.player.name} was unstoppable through the air this week, dissecting the defense for a massive yardage total.`,
                null, 'stats');
        }

        if (topRusher.yds > 200) {
            this.addNewsItem(league,
                `Ground Attack: ${topRusher.player.name} Rushes for ${topRusher.yds} Yards`,
                `${topRusher.player.name} put the team on his back, running wild over the opposing defense.`,
                null, 'stats');
        }
    }

    processStoryEvents(league, week, year) {
        // Basic implementation of dynamic storylines
        // This could be expanded to check specific conditions from story-events.js

        // Example: Check for undefeated teams late in season
        if (week > 10) {
            const undefeated = league.teams.filter(t => t.losses === 0 && t.ties === 0);
            if (undefeated.length === 1) {
                this.addNewsItem(league,
                    `Perfection Watch: ${undefeated[0].name} Remain Undefeated`,
                    `The ${undefeated[0].name} are the last undefeated team in the league. Can they go all the way?`,
                    null, 'story');
            }
        }
    }
}

// Export singleton
const newsEngine = new NewsEngine();
export default newsEngine;

// Legacy export
if (typeof window !== 'undefined') {
    window.newsEngine = newsEngine;
}
