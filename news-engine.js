// news-engine.js
import { Utils } from './utils.js';

const MULTI_WEEK_STORYLINES = {
    'contract_holdout': {
        trigger: (league) => {
            const team = league.teams[window.state.userTeamId];
            if (!team) return null;
            // Trigger for star player with low morale
            const star = team.roster.find(p => p.ovr > 85 && p.morale < 70);
            if (star && Math.random() < 0.3) return { playerId: star.id, name: star.name };
            return null;
        },
        stages: {
            1: {
                title: 'Contract Dispute',
                description: (data) => `${data.name} is unhappy with his contract situation and is demanding a renegotiation.`,
                choices: [
                    {
                        text: 'Promise Extension (Boost Morale)',
                        effect: (ctx, story) => {
                             const league = ctx.league;
                             const team = league.teams[story.teamId];
                             const player = team.roster.find(p => p.id === story.data.playerId);
                             if (player) player.morale = Math.min(100, player.morale + 20);
                             story.resolved = true;
                             return `You promised ${player ? player.name : 'him'} an extension. He seems satisfied for now.`;
                        }
                    },
                    {
                        text: 'Refuse Negotiation',
                        effect: (ctx, story) => {
                            const league = ctx.league;
                            story.stage = 2;
                            story.nextUpdate = league.week + 1;
                            const team = league.teams[story.teamId];
                            const player = team.roster.find(p => p.id === story.data.playerId);
                            if (player) player.morale = Math.max(0, player.morale - 15);
                            return `You refused to negotiate. ${player ? player.name : 'He'} stormed out of your office.`;
                        }
                    }
                ]
            },
            2: {
                 title: 'Missed Practice',
                 description: (data) => `${data.name} was absent from practice today without notice. The media is beginning to ask questions.`,
                 choices: [
                     {
                         text: 'Fine The Player',
                         effect: (ctx, story) => {
                             const league = ctx.league;
                             story.stage = 3;
                             story.nextUpdate = league.week + 1;
                             const team = league.teams[story.teamId];
                             const player = team.roster.find(p => p.id === story.data.playerId);
                             if (player) player.morale = Math.max(0, player.morale - 20);
                             return "You issued a fine for conduct detrimental to the team. The relationship is deteriorating rapidly.";
                         }
                     },
                     {
                         text: 'Ignore It',
                         effect: (ctx, story) => {
                             story.resolved = true;
                             return "You decided to look the other way. He returned to practice the next day, but the tension remains.";
                         }
                     }
                 ]
            },
            3: {
                title: 'Trade Demand',
                description: (data) => `${data.name} has formally requested a trade, citing "irreconcilable differences" with management.`,
                choices: [
                    {
                        text: 'Seek Trade Partner',
                        effect: (ctx, story) => {
                            story.resolved = true;
                            // In a real implementation, this would flag the player for trade block
                            return `You announced that you will seek a trade partner for ${story.data.name}.`;
                        }
                    },
                    {
                        text: 'Refuse Trade',
                        effect: (ctx, story) => {
                            const league = ctx.league;
                            const team = league.teams[story.teamId];
                            const player = team.roster.find(p => p.id === story.data.playerId);
                            if (player) player.morale = 0;
                            story.resolved = true;
                            return `You publicly stated that ${player ? player.name : 'he'} will not be traded. He is furious and will likely play poorly.`;
                        }
                    }
                ]
            }
        }
    },
    'qb_controversy': {
        trigger: (league) => {
            const team = league.teams[window.state.userTeamId];
            if (!team) return null;
            // Trigger if starting QB is playing poorly or morale is low, and backup is decent
            const qbs = team.roster.filter(p => p.pos === 'QB').sort((a, b) => b.ovr - a.ovr);
            if (qbs.length < 2) return null;

            const starter = qbs[0];
            const backup = qbs[1];

            if (starter.morale < 60 && backup.ovr > 70 && Math.random() < 0.2) {
                return { starterId: starter.id, starterName: starter.name, backupId: backup.id, backupName: backup.name };
            }
            return null;
        },
        stages: {
            1: {
                title: 'QB Controversy Brewing',
                description: (data) => `Fans are calling for ${data.backupName} to start after recent struggles by ${data.starterName}. The media is asking who will be under center next week.`,
                choices: [
                    {
                        text: 'Stick with Starter',
                        effect: (ctx, story) => {
                            const league = ctx.league;
                            const team = league.teams[story.teamId];
                            const starter = team.roster.find(p => p.id === story.data.starterId);
                            if (starter) starter.morale = Math.min(100, starter.morale + 10);
                            const backup = team.roster.find(p => p.id === story.data.backupId);
                            if (backup) backup.morale = Math.max(0, backup.morale - 10);

                            story.resolved = true;
                            return `You publicly committed to ${story.data.starterName}. He appreciates the vote of confidence.`;
                        }
                    },
                    {
                        text: 'Open Competition',
                        effect: (ctx, story) => {
                            const league = ctx.league;
                            story.stage = 2;
                            story.nextUpdate = league.week + 1;
                            return `You declared the position open for competition in practice. Both QBs are on edge.`;
                        }
                    }
                ]
            },
            2: {
                title: 'Practice Report',
                description: (data) => `Reports from practice suggest ${data.backupName} is outperforming ${data.starterName}. The pressure is mounting.`,
                choices: [
                    {
                        text: 'Bench Starter',
                        effect: (ctx, story) => {
                            const league = ctx.league;
                            const team = league.teams[story.teamId];
                            const starter = team.roster.find(p => p.id === story.data.starterId);
                            const backup = team.roster.find(p => p.id === story.data.backupId);

                            if (starter) starter.morale = Math.max(0, starter.morale - 20);
                            if (backup) backup.morale = Math.min(100, backup.morale + 20);

                            story.resolved = true;
                            return `You named ${story.data.backupName} the new starter. Make sure to update your depth chart!`;
                        }
                    },
                    {
                        text: 'Stay the Course',
                        effect: (ctx, story) => {
                            story.resolved = true;
                            return `You decided practice isn't everything. ${story.data.starterName} retains the job.`;
                        }
                    }
                ]
            }
        }
    },
    'rookie_watch': {
        trigger: (league) => {
            const team = league.teams[window.state.userTeamId];
            if (!team) return null;
            // Find a rookie with good dev trait
            // Rookie definition: 0 years played? Or age? Let's use age <= 23 + developmentStatus
            const rookie = team.roster.find(p => p.age <= 23 && p.developmentStatus === 'BREAKOUT');
            if (rookie && Math.random() < 0.3) {
                return { playerId: rookie.id, name: rookie.name };
            }
            return null;
        },
        stages: {
            1: {
                title: 'Rookie Turning Heads',
                description: (data) => `Rookie ${data.name} is looking impressive in practice. Coaches are suggesting he get more playing time.`,
                choices: [
                    {
                        text: 'Increase Workload',
                        effect: (ctx, story) => {
                            const league = ctx.league;
                            const team = league.teams[story.teamId];
                            const player = team.roster.find(p => p.id === story.data.playerId);
                            if (player) {
                                player.ovr = (player.ovr || 50) + 2;
                                player.morale = Math.min(100, (player.morale || 50) + 10);
                            }
                            story.resolved = true;
                            return `${story.data.name} responded well to the extra reps. Ratings boosted.`;
                        }
                    },
                    {
                        text: 'Bring Him Along Slowly',
                        effect: (ctx, story) => {
                            story.resolved = true;
                            return `You decided to protect ${story.data.name} from too much too soon.`;
                        }
                    }
                ]
            }
        }
    }
};

const INTERACTIVE_EVENTS = [
    {
        id: 'team_meeting_low_morale',
        title: 'Locker Room Tension',
        description: 'The recent losing streak is weighing heavily on the team. Players are frustrated and looking for answers. How do you address the locker room?',
        trigger: (league) => {
            const userTeamId = window.state?.userTeamId;
            if (userTeamId === undefined) return false;
            const team = league.teams[userTeamId];
            if (!team) return false;

            // Calculate avg morale
            let totalMorale = 0;
            let count = 0;
            if (team.roster) {
                team.roster.forEach(p => {
                    totalMorale += (p.morale || 50);
                    count++;
                });
            }
            const avgMorale = count > 0 ? totalMorale / count : 50;

            if (avgMorale < 60 && Math.random() < 0.3) return true;

            return false;
        },
        choices: [
            {
                text: 'Pep Talk (Boost Morale)',
                description: 'Give a rousing speech to lift spirits. Small reliable boost.',
                effect: (ctx) => {
                    const league = ctx.league;
                    const team = league.teams[window.state.userTeamId];
                    let boosted = 0;
                    team.roster.forEach(p => {
                        if (p.morale < 100) {
                            p.morale = Math.min(100, p.morale + 5);
                            boosted++;
                        }
                    });
                    return `You gave a passionate speech. ${boosted} players felt more motivated.`;
                }
            },
            {
                text: 'Hard Truth (High Risk/Reward)',
                description: 'Call them out. Could fire them up or cause a mutiny.',
                effect: (ctx) => {
                     const league = ctx.league;
                     const team = league.teams[window.state.userTeamId];
                     const success = Math.random() > 0.4; // 60% chance of success
                     if (success) {
                         team.roster.forEach(p => p.morale = Math.min(100, p.morale + 15));
                         return "The team responded to your challenge! Morale skyrocketed.";
                     } else {
                         team.roster.forEach(p => p.morale = Math.max(0, p.morale - 10));
                         return "The speech backfired. The locker room is lost.";
                     }
                }
            },
            {
                text: 'Ignore It',
                description: 'Let them work it out themselves.',
                effect: (ctx) => {
                    return "You decided to stay out of it. The tension remains.";
                }
            }
        ]
    },
    {
        id: 'fan_appreciation',
        title: 'Fan Appreciation Opportunity',
        description: 'The team is performing well and the city is buzzing. Marketing suggests hosting a Fan Appreciation event.',
        trigger: (league) => {
            const userTeamId = window.state?.userTeamId;
            if (userTeamId === undefined) return false;
            const team = league.teams[userTeamId];

            const wins = team.wins || (team.record?.w || 0);
            const total = wins + (team.losses || (team.record?.l || 0));
            const pct = total > 0 ? wins/total : 0;

            if (pct > 0.6 && Math.random() < 0.1) return true;

            return false;
        },
        choices: [
            {
                text: 'Discount Tickets (Boost Satisfaction)',
                description: 'Lower ticket prices for the next game. Fans will love it, but revenue will drop.',
                effect: (ctx) => {
                    if (window.state.ownerMode) {
                        window.state.ownerMode.fanSatisfaction = Math.min(100, (window.state.ownerMode.fanSatisfaction || 50) + 10);
                        return "Fans are thrilled with the discount! Satisfaction up.";
                    }
                    return "Fans appreciated the gesture.";
                }
            },
            {
                text: 'Meet & Greet (Boost Morale)',
                description: 'Have players sign autographs. Boosts team morale.',
                effect: (ctx) => {
                    const league = ctx.league;
                    const team = league.teams[window.state.userTeamId];
                    team.roster.forEach(p => p.morale = Math.min(100, p.morale + 3));
                    return "Players enjoyed connecting with the community. Morale up.";
                }
            },
            {
                text: 'Pass',
                description: 'Focus on football.',
                effect: (ctx) => {
                    return "You decided to focus on practice instead.";
                }
            }
        ]
    },
    {
        id: 'media_controversy',
        title: 'Media Controversy',
        description: 'A reporter has written a scathing article criticizing your star player\'s recent performance.',
        trigger: (league) => {
             return Math.random() < 0.05;
        },
        choices: [
            {
                text: 'Defend Player',
                description: 'Publicly back your player. Boosts player morale, may annoy fans/media.',
                effect: (ctx) => {
                    const league = ctx.league;
                    const team = league.teams[window.state.userTeamId];
                    const star = team.roster.reduce((prev, current) => (prev.ovr > current.ovr) ? prev : current);
                    star.morale = Math.min(100, star.morale + 10);

                    if (window.state.ownerMode) {
                         window.state.ownerMode.fanSatisfaction = Math.max(0, (window.state.ownerMode.fanSatisfaction || 50) - 2);
                    }
                    return `You defended ${star.name}. He appreciates the support.`;
                }
            },
            {
                text: 'No Comment',
                description: 'Stay neutral.',
                effect: (ctx) => {
                    return "You gave a generic non-answer. The story will blow over.";
                }
            },
            {
                text: 'Agree with Media (Motivate)',
                description: 'Challenge the player to do better. High risk.',
                effect: (ctx) => {
                    const league = ctx.league;
                    const team = league.teams[window.state.userTeamId];
                    const star = team.roster.reduce((prev, current) => (prev.ovr > current.ovr) ? prev : current);

                    if (Math.random() > 0.5) {
                        star.morale = Math.max(0, star.morale - 15);
                        return `${star.name} felt betrayed by your comments. Morale dropped.`;
                    } else {
                        return `${star.name} took the criticism to heart and promised to improve.`;
                    }
                }
            }
        ]
    },
    {
        id: 'fan_protest',
        title: 'Fan Protest',
        description: 'Angry fans are protesting outside the stadium due to high ticket prices and poor team performance.',
        trigger: (league) => {
            if (!window.state.ownerMode || !window.state.ownerMode.enabled) return false;
            const team = league.teams[window.state.userTeamId];
            const sat = window.state.ownerMode.fanSatisfaction;
            const record = team.record;
            const winPct = (record.w + record.l) > 0 ? record.w / (record.w + record.l) : 0;
            return sat < 40 && winPct < 0.4 && Math.random() < 0.2;
        },
        choices: [
            {
                text: 'Lower Ticket Prices (-10%)',
                description: 'Drop ticket prices to appease the mob.',
                effect: (ctx) => {
                    const league = ctx.league;
                    if (window.state.ownerMode) {
                        window.state.ownerMode.businessSettings.ticketPrice = Math.floor(window.state.ownerMode.businessSettings.ticketPrice * 0.9);
                        window.state.ownerMode.fanSatisfaction += 10;
                    }
                    return "Fans welcomed the price cut. Satisfaction improved.";
                }
            },
            {
                text: 'Address the Crowd',
                description: 'Promise better results on the field.',
                effect: (ctx) => {
                    if (Math.random() > 0.5) {
                        if (window.state.ownerMode) window.state.ownerMode.fanSatisfaction += 5;
                        return "The crowd seemed to buy your promises for now.";
                    } else {
                        if (window.state.ownerMode) window.state.ownerMode.fanSatisfaction -= 5;
                        return "They didn't want to hear excuses. The protest intensified.";
                    }
                }
            }
        ]
    }
];

class NewsEngine {
    constructor() {
        this.storyEvents = [];
        this.initialized = false;
        this.lastEventWeek = 0;
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

        if (league.news.length > 50) {
            league.news = league.news.slice(-50);
        }
    }

    generateInteractiveEvent(league) {
        if (league.storylines) {
            const activeStory = league.storylines.find(s =>
                !s.resolved &&
                s.nextUpdate &&
                s.nextUpdate <= league.week &&
                s.teamId === window.state.userTeamId
            );

            if (activeStory) {
                const template = MULTI_WEEK_STORYLINES[activeStory.type];
                if (template && template.stages[activeStory.stage]) {
                    const stageData = template.stages[activeStory.stage];
                    return {
                        id: `${activeStory.type}_stage_${activeStory.stage}`,
                        title: stageData.title,
                        description: typeof stageData.description === 'function' ? stageData.description(activeStory.data) : stageData.description,
                        choices: stageData.choices.map(c => ({
                            text: c.text,
                            effect: (ctx) => c.effect(ctx, activeStory)
                        }))
                    };
                }
            }
        }

        if (league.week - this.lastEventWeek < 3) return null;

        const events = [...INTERACTIVE_EVENTS].sort(() => 0.5 - Math.random());

        for (const event of events) {
            if (event.trigger(league)) {
                this.lastEventWeek = league.week;
                return event;
            }
        }

        return null;
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
        // Handle Playoff Results
        if (window.state && window.state.playoffs && window.state.playoffs.results && window.state.playoffs.results.length > 0) {
            // Check for new playoff results (from the last round run)
            // Ideally we check results added in the current simulation step.
            // Since we can't easily track "newly added", we can check against recent history or assume called after sim
            // For now, let's just check the latest available round results if they match "current" week context
            const playoffResults = window.state.playoffs.results;
            const lastRound = playoffResults[playoffResults.length - 1]; // Latest round simulated

            if (lastRound && lastRound.games) {
                // Ensure we haven't processed this round yet?
                // We'll rely on the fact this is called once per week/round sim.

                lastRound.games.forEach(game => {
                    const home = game.home;
                    const away = game.away;
                    const scoreHome = game.scoreHome;
                    const scoreAway = game.scoreAway;
                    const winner = scoreHome > scoreAway ? home : away;
                    const loser = scoreHome > scoreAway ? away : home;
                    const scoreDiff = Math.abs(scoreHome - scoreAway);

                    // Add news
                    this.addNewsItem(league,
                        `${winner.name} Advance in Playoffs`,
                        `The ${winner.name} defeated the ${loser.name} ${Math.max(scoreHome, scoreAway)}-${Math.min(scoreHome, scoreAway)} to move on to the next round.`,
                        null, 'playoffs'
                    );
                });
                return; // Prioritize playoff news
            }
        }

        // Regular Season Logic
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
                this.addNewsItem(league,
                    `${winner.name} Dominate ${loser.name} in ${scoreDiff}-Point Rout`,
                    `In a complete dismantling, the ${winner.name} crushed the ${loser.name} ${Math.max(game.scoreHome, game.scoreAway)}-${Math.min(game.scoreHome, game.scoreAway)}. Fans in ${loser.name} are calling for answers after this embarrassing performance.`,
                    null, 'game');
            }

            const winnerOvr = winner.ovr || 50;
            const loserOvr = loser.ovr || 50;

            if (loserOvr - winnerOvr > 10) {
                 this.addNewsItem(league,
                    `UPSET ALERT: ${winner.name} Stun ${loser.name}`,
                    `Despite being heavy underdogs, the ${winner.name} pulled off a shocking victory against the ${loser.name}. This loss puts a dent in ${loser.name}'s playoff hopes.`,
                    null, 'game');
            }

            if (game.scoreHome + game.scoreAway > 70) {
                this.addNewsItem(league,
                    `Offensive Explosion: ${winner.name} Win Shootout`,
                    `Defenses were optional as the ${winner.name} and ${loser.name} combined for ${game.scoreHome + game.scoreAway} points. The final score read ${Math.max(game.scoreHome, game.scoreAway)}-${Math.min(game.scoreHome, game.scoreAway)}.`,
                    null, 'game');
            }
        });
    }

    generateStatHeadlines(league, week, year) {
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
            const opponent = this.getOpponent(league, topPasser.team.id, week);
            const opponentName = opponent ? opponent.name : 'Opponent';
            const headline = `Air Raid: ${topPasser.team.name} QB ${topPasser.player.name} Throws for ${topPasser.yds} Yards`;
            const story = `${topPasser.player.name} was unstoppable through the air this week against the ${opponentName}, dissecting the defense for a massive yardage total.`;

            this.addNewsItem(league, headline, story, null, 'stats');

            if (!topPasser.player.seasonNews) topPasser.player.seasonNews = [];
            topPasser.player.seasonNews.push({
                week: week - 1,
                headline: headline,
                story: story,
                opponent: opponentName
            });
        }

        if (topRusher.yds > 200) {
            const opponent = this.getOpponent(league, topRusher.team.id, week);
            const opponentName = opponent ? opponent.name : 'Opponent';
            const headline = `Ground Attack: ${topRusher.team.name} RB ${topRusher.player.name} Rushes for ${topRusher.yds} Yards`;
            const story = `${topRusher.player.name} put the team on his back against the ${opponentName}, running wild over the opposing defense.`;

            this.addNewsItem(league, headline, story, null, 'stats');

            if (!topRusher.player.seasonNews) topRusher.player.seasonNews = [];
            topRusher.player.seasonNews.push({
                week: week - 1,
                headline: headline,
                story: story,
                opponent: opponentName
            });
        }
    }

    processStorylines(league, week, year) {
        this.updateActiveStorylines(league, week);
        this.checkForNewStorylines(league, week);
    }

    updateActiveStorylines(league, week) {
        if (!league.storylines) return;

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
                    const lastResult = this.getLastGameResult(league, team.id);
                    if (lastResult && lastResult.won) {
                        this.addNewsItem(league,
                            `Streak Snapped: ${team.name} Finally Win`,
                            `The ${team.name} have ended their losing streak with a much-needed victory.`,
                            null, 'story');
                        story.resolved = true;
                    } else {
                         if (week % 4 === 0) {
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
        if (!league.storylines) league.storylines = [];

        if (window.state.userTeamId !== undefined) {
            for (const [type, template] of Object.entries(MULTI_WEEK_STORYLINES)) {
                const alreadyActive = league.storylines.some(s => s.type === type && s.teamId === window.state.userTeamId && !s.resolved);
                if (!alreadyActive) {
                    const data = template.trigger(league);
                    if (data) {
                        league.storylines.push({
                            id: Date.now() + Math.random(),
                            type: type,
                            teamId: window.state.userTeamId,
                            stage: 1,
                            data: data,
                            resolved: false,
                            startWeek: week,
                            nextUpdate: week
                        });
                        console.log(`[NewsEngine] Started new storyline: ${type}`);
                    }
                }
            }
        }

        if (week === 8) {
            const undefeated = league.teams.filter(t => t.losses === 0 && t.ties === 0);
            undefeated.forEach(team => {
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
        const lastWeek = league.week - 1;
        const results = league.resultsByWeek[lastWeek - 1];
        if (!results) return null;

        const game = results.find(g => !g.bye && (g.home === teamId || g.away === teamId));
        if (!game) return null;

        const isHome = game.home === teamId;
        const score = isHome ? game.scoreHome : game.scoreAway;
        const oppScore = isHome ? game.scoreAway : game.scoreHome;

        return { won: score > oppScore, score, oppScore };
    }

    getOpponent(league, teamId, week) {
        if (!league.resultsByWeek) return null;
        const weekIndex = week - 2;
        if (weekIndex < 0) return null;

        const results = league.resultsByWeek[weekIndex];
        if (!results) return null;

        const game = results.find(g => !g.bye && (g.home === teamId || g.away === teamId));
        if (!game) return null;

        const isHome = game.home === teamId;
        const opponentId = isHome ? game.away : game.home;

        const opponent = league.teams.find(t => t.id === opponentId) || league.teams[opponentId];
        return opponent;
    }
}

const newsEngine = new NewsEngine();
export default newsEngine;

if (typeof window !== 'undefined') {
    window.newsEngine = newsEngine;
}
