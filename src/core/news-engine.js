import { News } from '../db/index.js';
import { cache } from '../db/cache.js';

class NewsEngine {
    // Log a generic news item
    static async logNews(type, text, teamId = null, extraData = {}) {
        const meta = cache.getMeta();
        if (!meta) return;

        const item = {
            seasonId: meta.currentSeasonId,
            year: meta.year,
            week: meta.currentWeek,
            timestamp: Date.now(),
            type,
            text,
            teamId,
            ...extraData
        };

        // Add to DB
        await News.add(item);
    }

    // Specialized loggers
    static async logInjury(player, injuryType, durationWeeks) {
        if (!player) return;
        const meta = cache.getMeta();
        const team = cache.getTeam(player.teamId);
        const teamAbbr = team ? team.abbr : 'FA';

        const text = `${player.pos} ${player.name} (${teamAbbr}) suffered a ${injuryType} and will miss ${durationWeeks} weeks.`;

        await this.logNews('INJURY', text, player.teamId, {
            playerId: player.id,
            duration: durationWeeks,
            injuryType
        });
    }

    static async logTransaction(type, details) {
        let text = '';
        let teamId = null;

        const meta = cache.getMeta();

        if (type === 'SIGN') {
            const team = cache.getTeam(details.teamId);
            const player = cache.getPlayer(details.playerId) || { name: 'Unknown Player', pos: '??' };

            let amount = '';
            if (details.contract) {
                amount = `$${details.contract.baseAnnual}M/yr`;
            }

            if (team && player) {
                text = `${team.abbr} signed ${player.pos} ${player.name} to a ${details.contract ? details.contract.years : '?'} year deal (${amount}).`;
            }
            teamId = details.teamId;
        } else if (type === 'RELEASE') {
            const team = cache.getTeam(details.teamId);
            const player = cache.getPlayer(details.playerId) || { name: 'Unknown Player', pos: '??' };
            if (team && player) {
                text = `${team.abbr} released ${player.pos} ${player.name}.`;
            }
            teamId = details.teamId;
        } else if (type === 'TRADE') {
            const t1 = cache.getTeam(details.fromTeamId);
            const t2 = cache.getTeam(details.toTeamId);
            if (t1 && t2) {
                text = `BLOCKBUSTER: ${t1.abbr} and ${t2.abbr} have agreed to a trade.`;
            }
            teamId = null; // Global news
        } else if (type === 'HIRE_COACH') {
            const team = cache.getTeam(details.teamId);
            if (team) {
                text = `${team.abbr} hired a new ${details.role}.`;
            }
            teamId = details.teamId;
        } else if (type === 'FIRE_COACH') {
            const team = cache.getTeam(details.teamId);
            if (team) {
                text = `${team.abbr} fired their ${details.role}.`;
            }
            teamId = details.teamId;
        }

        if (text) {
            await this.logNews('TRANSACTION', text, teamId);
        }
    }

    static async logGameEvent(game) {
        // Log upsets, big scores, etc.
        const home = cache.getTeam(game.homeId);
        const away = cache.getTeam(game.awayId);

        if (!home || !away) return;

        const winner = game.homeScore > game.awayScore ? home : away;
        const loser = game.homeScore > game.awayScore ? away : home;

        // Example: Big upset check (using OVR)
        // Only log if OVR difference is significant (> 5)
        if ((winner.ovr || 0) < (loser.ovr || 0) - 5) {
             const text = `UPSET ALERT: ${winner.name} (${winner.wins}-${winner.losses}) stun the favored ${loser.name} ${game.homeScore}-${game.awayScore}.`;
             await this.logNews('GAME', text, winner.id);
        }
    }

    static async logAward(type, winner) {
        let text = '';
        let teamId = null;

        if (type === 'SUPER_BOWL') {
             text = `The ${winner.name} have won the Super Bowl!`;
             teamId = winner.id;
        } else if (type === 'MVP') {
             const team = cache.getTeam(winner.teamId);
             text = `${winner.pos} ${winner.name} (${team ? team.abbr : 'FA'}) has been named League MVP.`;
             teamId = winner.teamId;
        }

        if (text) {
            await this.logNews('AWARD', text, teamId);
        }
    }
}

export default NewsEngine;
