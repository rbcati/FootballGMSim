// news-engine.js
import { Utils } from './utils.js';

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

            // Trigger if losing streak >= 3
            // We need to check recent results.
            // Simplified: check if last 3 games were losses.
            // Or just use a random chance if morale is low.

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

            // Trigger if morale < 60 OR losing streak (inferred from morale drop or manual check)
            // Let's use a simpler check: random chance if morale is low
            if (avgMorale < 60 && Math.random() < 0.3) return true;

            return false;
        },
        choices: [
            {
                text: 'Pep Talk (Boost Morale)',
                description: 'Give a rousing speech to lift spirits. Small reliable boost.',
                effect: (league) => {
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
                effect: (league) => {
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
                effect: (league) => {
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

            // Trigger if winning streak (e.g., won last 2 games) and high fan satisfaction (if owner mode)
            // Or just random chance if record is good (> .600)
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
                effect: (league) => {
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
                effect: (league) => {
                    const team = league.teams[window.state.userTeamId];
                    team.roster.forEach(p => p.morale = Math.min(100, p.morale + 3));
                    return "Players enjoyed connecting with the community. Morale up.";
                }
            },
            {
                text: 'Pass',
                description: 'Focus on football.',
                effect: (league) => {
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
             // Random low chance
             return Math.random() < 0.05;
        },
        choices: [
            {
                text: 'Defend Player',
                description: 'Publicly back your player. Boosts player morale, may annoy fans/media.',
                effect: (league) => {
                    const team = league.teams[window.state.userTeamId];
                    // Find a star player
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
                effect: (league) => {
                    return "You gave a generic non-answer. The story will blow over.";
                }
            },
            {
                text: 'Agree with Media (Motivate)',
                description: 'Challenge the player to do better. High risk.',
                effect: (league) => {
                    const team = league.teams[window.state.userTeamId];
                    const star = team.roster.reduce((prev, current) => (prev.ovr > current.ovr) ? prev : current);

                    if (Math.random() > 0.5) {
                        star.morale = Math.max(0, star.morale - 15);
                        return `${star.name} felt betrayed by your comments. Morale dropped.`;
                    } else {
                        // Maybe boost attributes slightly?
                        return `${star.name} took the criticism to heart and promised to improve.`;
                    }
                }
            }
        ]
    },
    {
        id: 'qb_controversy',
        title: 'Quarterback Controversy',
        description: 'The starting QB is struggling, and the backup is looking sharp in practice. The media is asking who will start next week.',
        trigger: (league) => {
            const team = league.teams[window.state.userTeamId];
            if (!team) return false;

            // Check losing streak or recent bad performance
            // For simplicity, check if losses > wins
            if (team.wins >= team.losses) return false;

            // Find QBs
            const qbs = team.roster.filter(p => p.position === 'QB').sort((a, b) => b.ovr - a.ovr);
            if (qbs.length < 2) return false;

            const starter = qbs[0];
            const backup = qbs[1];

            // Trigger if starter < 75 OR starter rating diff with backup < 5
            if (starter.ovr < 75 || (starter.ovr - backup.ovr) < 5) {
                // Random chance
                return Math.random() < 0.15;
            }
            return false;
        },
        choices: [
            {
                text: 'Stick with Starter',
                description: 'Publicly back the starter. Boosts his confidence but backup might be unhappy.',
                effect: (league) => {
                     const team = league.teams[window.state.userTeamId];
                     const qbs = team.roster.filter(p => p.position === 'QB').sort((a, b) => b.ovr - a.ovr);
                     const starter = qbs[0];
                     const backup = qbs[1];

                     starter.morale = Math.min(100, starter.morale + 10);
                     backup.morale = Math.max(0, backup.morale - 10);

                     return `You confirmed ${starter.name} is the guy. He appreciates the vote of confidence.`;
                }
            },
            {
                text: 'Start Backup',
                description: 'Bench the starter. Backup gets a boost, starter morale crashes.',
                effect: (league) => {
                     const team = league.teams[window.state.userTeamId];
                     const qbs = team.roster.filter(p => p.position === 'QB').sort((a, b) => b.ovr - a.ovr);
                     const starter = qbs[0];
                     const backup = qbs[1];

                     // Swap depth chart (conceptually, though roster sort handles it mostly)
                     // We can give backup a temp boost and starter a nerf?

                     backup.ovr += 2; // Temporary boost? Permanent?
                     starter.ovr -= 2;

                     starter.morale = Math.max(0, starter.morale - 25);
                     backup.morale = Math.min(100, backup.morale + 15);

                     return `You named ${backup.name} the new starter. The locker room is shocked but intrigued.`;
                }
            },
            {
                text: 'Open Competition',
                description: 'Let them battle it out in practice.',
                effect: (league) => {
                     return "You declared an open competition. Both QBs are on edge.";
                }
            }
        ]
    },
    {
        id: 'locker_room_mutiny',
        title: 'Locker Room Mutiny',
        description: 'The team is losing, morale is low, and players are blaming the coaching staff.',
        trigger: (league) => {
            const team = league.teams[window.state.userTeamId];
            if (!team) return false;

            // Check bad record later in season
            if (league.week < 6) return false;
            if (team.wins > 2) return false; // Must be bad record

            // Check morale
            const avgMorale = team.roster.reduce((sum, p) => sum + p.morale, 0) / team.roster.length;
            if (avgMorale < 40 && Math.random() < 0.1) return true;

            return false;
        },
        choices: [
            {
                text: 'Fire Coordinator',
                description: 'Sacrifice a coach to appease the players.',
                effect: (league) => {
                     // Need to call window.fireStaffMember
                     if (window.fireStaffMember) {
                         const result = window.fireStaffMember('OC'); // Default to OC for now
                         if (result.success) {
                             const team = league.teams[window.state.userTeamId];
                             team.roster.forEach(p => p.morale += 10);
                             return `You fired the Offensive Coordinator. The players feel heard.`;
                         } else {
                             return "Tried to fire someone but failed.";
                         }
                     }
                     return "You promised changes.";
                }
            },
            {
                text: 'Team Meeting',
                description: 'Hash it out.',
                effect: (league) => {
                    const team = league.teams[window.state.userTeamId];
                    team.roster.forEach(p => p.morale += 5);
                    return "The air was cleared, slightly.";
                }
            }
        ]
    },
     {
        id: 'rookie_phenom',
        title: 'Rookie Phenom',
        description: 'Your rookie is exceeding all expectations and becoming a star.',
        trigger: (league) => {
             const team = league.teams[window.state.userTeamId];
             const rookies = team.roster.filter(p => p.experience === 0 && p.ovr > 80);

             if (rookies.length > 0 && Math.random() < 0.2) return true;
             return false;
        },
        choices: [
            {
                text: 'Build Around Him',
                description: 'Designate him as a franchise cornerstone.',
                effect: (league) => {
                     const team = league.teams[window.state.userTeamId];
                     const rookie = team.roster.find(p => p.experience === 0 && p.ovr > 80);
                     if (rookie) {
                         rookie.morale = 100;
                         rookie.pot += 2; // Boost potential
                         return `${rookie.name} loves the attention and looks ready to lead.`;
                     }
                     return "The rookie appreciates it.";
                }
            },
            {
                text: 'Keep Him Grounded',
                description: 'Don\'t let it get to his head.',
                effect: (league) => {
                    return "You reminded him to stay humble. He respects your guidance.";
                }
            }
        ]
    }
];

class NewsEngine {
    constructor() {
        this.storyEvents = [];
        this.initialized = false;
        this.lastEventWeek = 0; // Prevent spamming events
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

    // New Method: Interactive Events
    generateInteractiveEvent(league) {
        // Only one event per 3 weeks max
        if (league.week - this.lastEventWeek < 3) return null;

        // Find a triggered event
        // Shuffle events to vary checks?
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
