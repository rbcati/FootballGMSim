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

        // Initialize storylines container if missing
        if (!league.storylines) league.storylines = [];

        const week = league.week;
        const year = league.year;

        // 1. Generate Game-Based Headlines (Upsets, Blowouts)
        this.generateGameHeadlines(league, week, year);

        // 2. Generate Stat-Based Headlines (League Leaders, Records)
        this.generateStatHeadlines(league, week, year);

        // 3. Process Dynamic Storylines (The Newsroom)
        this.processStorylines(league, week, year);

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

    processStorylines(league, week, year) {
        // 1. Update Existing Storylines
        this.updateActiveStorylines(league, week);

        // 2. Check for New Storylines
        this.checkForNewStorylines(league, week);
    }

    updateActiveStorylines(league, week) {
        if (!league.storylines) return;

        // Filter out completed storylines
        league.storylines = league.storylines.filter(story => !story.resolved);

        league.storylines.forEach(story => {
            if (story.type === 'undefeated') {
                const team = league.teams.find(t => t.id === story.teamId);
                if (team) {
                    if (team.losses > 0) {
                        this.addNewsItem(league,
                            `Perfection Ended: ${team.name} Suffer First Loss`,
                            `The dream of an undefeated season is over for the ${team.name}.`,
                            null, 'story');
                        story.resolved = true;
                    } else if (week > 16) {
                         this.addNewsItem(league,
                            `History in the Making: ${team.name} Still Perfect`,
                            `Entering the final stretch, the ${team.name} remain undefeated.`,
                            null, 'story');
                    }
                }
            } else if (story.type === 'losing_streak') {
                const team = league.teams.find(t => t.id === story.teamId);
                if (team) {
                    // Check if they won last week
                    const lastResult = this.getLastGameResult(league, team.id);
                    if (lastResult && lastResult.won) {
                        this.addNewsItem(league,
                            `Streak Snapped: ${team.name} Finally Win`,
                            `The ${team.name} have ended their losing streak with a much-needed victory.`,
                            null, 'story');
                        story.resolved = true;
                    } else {
                         // Still losing
                         if (week % 4 === 0) { // Update every 4 weeks
                             this.addNewsItem(league,
                                `Rock Bottom? ${team.name} Losses Continue Pile Up`,
                                `The ${team.name} are searching for answers as their losing streak extends.`,
                                null, 'story');
                         }
                    }
                }
            }
        });
    }

    checkForNewStorylines(league, week) {
        // Undefeated Watch (Start at Week 8)
        if (week === 8) {
            const undefeated = league.teams.filter(t => t.losses === 0 && t.ties === 0);
            undefeated.forEach(team => {
                // Check if already tracking
                if (!league.storylines.some(s => s.type === 'undefeated' && s.teamId === team.id)) {
                    league.storylines.push({
                        id: Utils.id ? Utils.id() : Date.now(),
                        type: 'undefeated',
                        teamId: team.id,
                        resolved: false,
                        startWeek: week
                    });
                    this.addNewsItem(league,
                        `Perfection Watch: ${team.name} Start 7-0`,
                        `The ${team.name} are one of the few remaining undefeated teams.`,
                        null, 'story');
                }
            });
        }

        // Losing Streak Watch (Start at Week 6 if 0-5)
        if (week >= 6) {
            const winless = league.teams.filter(t => t.wins === 0 && t.ties === 0);
            winless.forEach(team => {
                 if (!league.storylines.some(s => s.type === 'losing_streak' && s.teamId === team.id)) {
                    league.storylines.push({
                        id: Utils.id ? Utils.id() : Date.now(),
                        type: 'losing_streak',
                        teamId: team.id,
                        resolved: false,
                        startWeek: week
                    });
                    this.addNewsItem(league,
                        `Disaster in ${team.name}?`,
                        `The ${team.name} remain winless this season. Fans are getting restless.`,
                        null, 'story');
                }
            });
        }
    }

    getLastGameResult(league, teamId) {
        if (!league.resultsByWeek) return null;
        const lastWeek = league.week - 1; // Assuming league.week is upcoming
        // Check previous week (index = week - 2)
        const results = league.resultsByWeek[lastWeek - 1];
        if (!results) return null;

        const game = results.find(g => !g.bye && (g.home === teamId || g.away === teamId));
        if (!game) return null; // Bye week or no game

        const isHome = game.home === teamId;
        const score = isHome ? game.scoreHome : game.scoreAway;
        const oppScore = isHome ? game.scoreAway : game.scoreHome;

        return { won: score > oppScore, score, oppScore };
    }
}

// Export singleton
const newsEngine = new NewsEngine();
export default newsEngine;

// Legacy export
if (typeof window !== 'undefined') {
    window.newsEngine = newsEngine;
}
