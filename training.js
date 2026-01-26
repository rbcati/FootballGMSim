// training.js - Weekly training logic
import { addXP } from './player.js';

/**
 * Runs weekly training for all teams in the league.
 * Calculates XP gains based on coaching staff ratings and applies them to players.
 * @param {Object} league - The league object containing teams.
 */
export function runWeeklyTraining(league) {
    if (!league || !league.teams) {
        console.warn('runWeeklyTraining: No league or teams found.');
        return;
    }

    console.log(`Running weekly training for Week ${league.week}...`);

    league.teams.forEach(team => {
        if (!team.roster || !team.staff) return;

        // Calculate Coaching Development Bonus
        let totalDevRating = 0;
        let count = 0;

        // Helper to get dev rating safely
        const getDev = (staffMember) => {
            if (!staffMember) return 50; // Average default
            // Support both new RPG stats and legacy stats
            return staffMember.playerDevelopment || staffMember.ratings?.development || 50;
        };

        if (team.staff.headCoach) {
            totalDevRating += getDev(team.staff.headCoach);
            count++;
        }
        if (team.staff.offCoordinator) {
            totalDevRating += getDev(team.staff.offCoordinator);
            count++;
        }
        if (team.staff.defCoordinator) {
            totalDevRating += getDev(team.staff.defCoordinator);
            count++;
        }

        const avgDevRating = count > 0 ? totalDevRating / count : 50;

        // Base XP per week
        const BASE_WEEKLY_XP = 50;

        // Coaching Bonus: +/- based on rating relative to 50
        // e.g., Rating 90 -> (40 * 0.5) = +20 XP
        // e.g., Rating 30 -> (-20 * 0.5) = -10 XP (but floored at 0 gain total)
        const coachingBonus = Math.round((avgDevRating - 50) * 0.5);

        team.roster.forEach(player => {
            // Age factor: Younger players learn faster
            let ageFactor = 1.0;
            if (player.age < 24) ageFactor = 1.2;
            else if (player.age > 30) ageFactor = 0.8;

            // Potential factor: Players far from potential learn faster
            let potentialFactor = 1.0;
            if (player.potential && player.ovr) {
                if (player.potential > player.ovr + 10) potentialFactor = 1.2;
                else if (player.ovr >= player.potential) potentialFactor = 0.5; // Maintenance
            }

            let xpGain = Math.round((BASE_WEEKLY_XP + coachingBonus) * ageFactor * potentialFactor);
            xpGain = Math.max(10, xpGain); // Minimum 10 XP

            // Apply XP
            addXP(player, xpGain);
        });
    });

    console.log('Weekly training complete.');
}

// Expose globally
if (typeof window !== 'undefined') {
    window.runWeeklyTraining = runWeeklyTraining;
}
