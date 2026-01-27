// training.js - Advanced Training System
import { addXP } from './player.js';

// Configuration
const TRAINING_CONFIG = {
    BASE_XP: 50,
    INTENSITY_MODIFIERS: {
        'Low': { xp: 0.8, injuryChance: 0.0 },
        'Normal': { xp: 1.0, injuryChance: 0.001 }, // Very low base chance
        'Heavy': { xp: 1.3, injuryChance: 0.005 }  // 0.5% chance per player per week
    },
    FOCUS_BONUS: 1.2, // 20% bonus for focused group
    FOCUS_PENALTY: 0.9, // 10% penalty for non-focused
    PERFORMANCE_BONUS_CAP: 40,
    REGRESSION_AGE_START: 29
};

/**
 * Runs weekly training for all teams in the league.
 * Calculates XP gains based on coaching, focus, intensity, and performance.
 * @param {Object} league - The league object containing teams.
 */
export function runWeeklyTraining(league) {
    if (!league || !league.teams) {
        console.warn('runWeeklyTraining: No league or teams found.');
        return;
    }

    console.log(`Running Advanced Training for Week ${league.week}...`);

    // Ensure training settings exist
    if (!window.state.trainingSettings) {
        window.state.trainingSettings = {
            intensity: 'Normal', // Low, Normal, Heavy
            focus: 'Balanced'    // Balanced, Offense, Defense
        };
    }

    const { intensity, focus } = window.state.trainingSettings;
    const intensityMod = TRAINING_CONFIG.INTENSITY_MODIFIERS[intensity] || TRAINING_CONFIG.INTENSITY_MODIFIERS['Normal'];

    league.teams.forEach(team => {
        if (!team.roster || !team.staff) return;

        // 1. Coaching Development Bonus
        let totalDevRating = 0;
        let count = 0;
        const getDev = (s) => s ? (s.playerDevelopment || s.ratings?.development || 50) : 50;

        if (team.staff.headCoach) { totalDevRating += getDev(team.staff.headCoach); count++; }
        if (team.staff.offCoordinator) { totalDevRating += getDev(team.staff.offCoordinator); count++; }
        if (team.staff.defCoordinator) { totalDevRating += getDev(team.staff.defCoordinator); count++; }

        const avgDevRating = count > 0 ? totalDevRating / count : 50;
        // Coaching Bonus: +/- based on rating relative to 50. Max ~+25 XP.
        const coachingBonus = Math.round((avgDevRating - 50) * 0.5);

        // 2. Process Players
        team.roster.forEach(player => {
            // A. Base XP & Age Factor
            let ageFactor = 1.0;
            if (player.age < 24) ageFactor = 1.3; // Young players learn fast
            else if (player.age > 28) ageFactor = 0.9; // Prime/Vets slow down
            else if (player.age > 32) ageFactor = 0.5;

            // B. Potential Factor
            let potentialFactor = 1.0;
            if (player.potential && player.ovr) {
                const gap = player.potential - player.ovr;
                if (gap > 10) potentialFactor = 1.2;
                else if (gap <= 0) potentialFactor = 0.5; // Capped out
            }

            // C. Focus Modifier
            let focusMod = 1.0;
            const isOffense = ['QB','RB','WR','TE','OL'].includes(player.pos);
            const isDefense = ['DL','LB','CB','S'].includes(player.pos);

            if (focus === 'Offense') {
                focusMod = isOffense ? TRAINING_CONFIG.FOCUS_BONUS : TRAINING_CONFIG.FOCUS_PENALTY;
            } else if (focus === 'Defense') {
                focusMod = isDefense ? TRAINING_CONFIG.FOCUS_BONUS : TRAINING_CONFIG.FOCUS_PENALTY;
            }

            // D. Performance Bonus (from last game)
            let perfBonus = 0;
            if (player.stats && player.stats.game) {
                perfBonus = calculatePerformanceBonus(player);
            }

            // E. Calculate Final XP
            let totalXP = (TRAINING_CONFIG.BASE_XP + coachingBonus + perfBonus)
                          * intensityMod.xp
                          * focusMod
                          * ageFactor
                          * potentialFactor;

            totalXP = Math.max(0, Math.round(totalXP));

            // Apply XP
            addXP(player, totalXP);

            // F. Regression Logic (Age 29+)
            if (player.age >= TRAINING_CONFIG.REGRESSION_AGE_START) {
                handleRegression(player);
            }

            // G. Training Injuries (Heavy Intensity only)
            if (intensity === 'Heavy' && Math.random() < intensityMod.injuryChance) {
                handleTrainingInjury(player);
            }
        });
    });

    console.log('Advanced training complete.');
}

/**
 * Calculate XP bonus based on game performance
 */
function calculatePerformanceBonus(player) {
    const s = player.stats.game;
    let bonus = 0;

    // Simple heuristic benchmarks
    if (player.pos === 'QB') {
        if (s.passTD >= 2) bonus += 10;
        if (s.passTD >= 4) bonus += 15;
        if (s.passYd >= 300) bonus += 10;
        if (s.interceptions === 0 && s.passAtt > 15) bonus += 5;
    } else if (['RB'].includes(player.pos)) {
        if (s.rushYd >= 100) bonus += 15;
        if (s.rushTD >= 1) bonus += 10;
        if (s.yardsPerCarry >= 5.0 && s.rushAtt > 10) bonus += 5;
    } else if (['WR', 'TE'].includes(player.pos)) {
        if (s.recYd >= 100) bonus += 15;
        if (s.recTD >= 1) bonus += 10;
        if (s.receptions >= 7) bonus += 5;
    } else if (['DL', 'LB'].includes(player.pos)) {
        if (s.sacks >= 1) bonus += 15;
        if (s.tackles >= 8) bonus += 10;
        if (s.tacklesForLoss >= 2) bonus += 5;
    } else if (['CB', 'S'].includes(player.pos)) {
        if (s.interceptions >= 1) bonus += 20;
        if (s.passesDefended >= 2) bonus += 10;
    }

    return Math.min(bonus, TRAINING_CONFIG.PERFORMANCE_BONUS_CAP);
}

/**
 * Handle age-related regression
 */
function handleRegression(player) {
    const ageOver = player.age - TRAINING_CONFIG.REGRESSION_AGE_START;
    // Chance increases with age: 10% at 30, 20% at 31...
    const regressionChance = 0.10 + (ageOver * 0.10);

    if (Math.random() < regressionChance) {
        // Regress physical stats
        const physicalStats = ['speed', 'acceleration', 'agility', 'strength'];
        const statToNerf = physicalStats[Math.floor(Math.random() * physicalStats.length)];

        if (player.ratings && player.ratings[statToNerf] > 40) {
            player.ratings[statToNerf] -= 1;
            // console.log(`Regression: ${player.name} lost 1 ${statToNerf}`);

            // Recalculate OVR if possible (simple approximation if helper not available)
            // Ideally we'd call calculateOverall(player)
        }
    }
}

/**
 * Handle training injuries
 */
function handleTrainingInjury(player) {
    if (window.generateInjury && window.applyInjury) {
        const injury = window.generateInjury(player);
        if (injury) {
            injury.type = `Training: ${injury.type}`; // Mark as training injury
            window.applyInjury(player, injury);
            console.log(`TRAINING INJURY: ${player.name} - ${injury.type}`);
            if (window.setStatus) window.setStatus(`Training Accident: ${player.name} injured.`, 'error');
        }
    }
}

// Expose globally
if (typeof window !== 'undefined') {
    window.runWeeklyTraining = runWeeklyTraining;
}
