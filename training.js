// training.js - Advanced Training System with Realistic Progression
import { addXP } from './player.js';
import { Utils as U } from './utils.js';

// =============================================================================
// CONFIGURATION - Tuned for long-term replayability
// =============================================================================
const TRAINING_CONFIG = {
    BASE_XP: 50,
    INTENSITY_MODIFIERS: {
        'Low': { xp: 0.8, injuryChance: 0.0 },
        'Normal': { xp: 1.0, injuryChance: 0.001 },
        'Heavy': { xp: 1.3, injuryChance: 0.005 }
    },
    FOCUS_BONUS: 1.2,
    FOCUS_PENALTY: 0.9,
    PERFORMANCE_BONUS_CAP: 40,

    // Age curves - position-specific prime windows
    AGE_CURVES: {
        QB:  { peakStart: 27, peakEnd: 35, cliffAge: 38, growthRate: 1.4 },
        RB:  { peakStart: 23, peakEnd: 27, cliffAge: 30, growthRate: 1.5 },
        WR:  { peakStart: 25, peakEnd: 30, cliffAge: 33, growthRate: 1.3 },
        TE:  { peakStart: 26, peakEnd: 31, cliffAge: 34, growthRate: 1.2 },
        OL:  { peakStart: 26, peakEnd: 33, cliffAge: 36, growthRate: 1.1 },
        DL:  { peakStart: 25, peakEnd: 30, cliffAge: 33, growthRate: 1.3 },
        LB:  { peakStart: 25, peakEnd: 30, cliffAge: 33, growthRate: 1.3 },
        CB:  { peakStart: 24, peakEnd: 29, cliffAge: 32, growthRate: 1.4 },
        S:   { peakStart: 25, peakEnd: 31, cliffAge: 34, growthRate: 1.2 },
        K:   { peakStart: 26, peakEnd: 36, cliffAge: 42, growthRate: 0.8 },
        P:   { peakStart: 26, peakEnd: 36, cliffAge: 42, growthRate: 0.8 }
    },

    // Development event frequencies (per week)
    BREAKOUT_BASE_CHANCE: 0.025,    // 2.5% base - noticeable over a season
    STAGNATION_BASE_CHANCE: 0.008,
    DECLINE_BASE_CHANCE: 0.015,
    SECOND_WIND_CHANCE: 0.005       // Veteran resurgence
};

/**
 * Gets the age development factor for a player based on position-specific curves.
 * Returns a multiplier: >1.0 for growing, 1.0 for peak, <1.0 for declining.
 */
function getAgeDevelopmentFactor(player) {
    const curve = TRAINING_CONFIG.AGE_CURVES[player.pos] || TRAINING_CONFIG.AGE_CURVES.WR;
    const age = player.age || 25;

    if (age < 22) return curve.growthRate;                          // Rookie growth
    if (age < curve.peakStart) return 1.0 + (curve.growthRate - 1.0) * 0.6; // Approaching peak
    if (age <= curve.peakEnd) return 1.0;                           // Prime years
    if (age <= curve.cliffAge) {
        // Gradual decline
        const declineYears = age - curve.peakEnd;
        const totalDeclineWindow = curve.cliffAge - curve.peakEnd;
        return 1.0 - (declineYears / totalDeclineWindow) * 0.5;    // 0.5 to 1.0
    }
    // Past cliff - steep decline
    const yearsOver = age - curve.cliffAge;
    return Math.max(0.1, 0.5 - yearsOver * 0.15);
}

/**
 * Runs weekly training for all teams in the league.
 */
export function runWeeklyTraining(league) {
    if (!league || !league.teams) {
        console.warn('runWeeklyTraining: No league or teams found.');
        return;
    }

    if (!window.state.trainingSettings) {
        window.state.trainingSettings = {
            intensity: 'Normal',
            focus: 'Balanced'
        };
    }

    const { intensity, focus } = window.state.trainingSettings;
    const intensityMod = TRAINING_CONFIG.INTENSITY_MODIFIERS[intensity] || TRAINING_CONFIG.INTENSITY_MODIFIERS['Normal'];

    league.teams.forEach(team => {
        if (!team.roster || !team.staff) return;

        // Coaching Development Bonus
        let totalDevRating = 0;
        let count = 0;
        const getDev = (s) => s ? (s.playerDevelopment || s.ratings?.development || 50) : 50;

        if (team.staff.headCoach) { totalDevRating += getDev(team.staff.headCoach); count++; }
        if (team.staff.offCoordinator) { totalDevRating += getDev(team.staff.offCoordinator); count++; }
        if (team.staff.defCoordinator) { totalDevRating += getDev(team.staff.defCoordinator); count++; }

        const avgDevRating = count > 0 ? totalDevRating / count : 50;
        const coachingBonus = Math.round((avgDevRating - 50) * 0.5);

        // Process each player
        team.roster.forEach(player => {
            const ageFactor = getAgeDevelopmentFactor(player);

            // Potential gap factor - bigger gap = faster growth
            let potentialFactor = 1.0;
            if (player.potential && player.ovr) {
                const gap = player.potential - player.ovr;
                if (gap > 15) potentialFactor = 1.4;
                else if (gap > 10) potentialFactor = 1.2;
                else if (gap > 5) potentialFactor = 1.1;
                else if (gap <= 0) potentialFactor = 0.3; // Capped out
            }

            // Focus modifier
            let focusMod = 1.0;
            const isOffense = ['QB','RB','WR','TE','OL'].includes(player.pos);
            const isDefense = ['DL','LB','CB','S'].includes(player.pos);

            if (focus === 'Offense') {
                focusMod = isOffense ? TRAINING_CONFIG.FOCUS_BONUS : TRAINING_CONFIG.FOCUS_PENALTY;
            } else if (focus === 'Defense') {
                focusMod = isDefense ? TRAINING_CONFIG.FOCUS_BONUS : TRAINING_CONFIG.FOCUS_PENALTY;
            }

            // Performance bonus
            let perfBonus = 0;
            if (player.stats && player.stats.game) {
                perfBonus = calculatePerformanceBonus(player);
            }

            // Calculate Final XP
            let totalXP = (TRAINING_CONFIG.BASE_XP + coachingBonus + perfBonus)
                          * intensityMod.xp
                          * focusMod
                          * ageFactor
                          * potentialFactor;

            totalXP = Math.max(0, Math.round(totalXP));
            addXP(player, totalXP);

            // Regression (position-aware)
            handleRegression(player);

            // Training injuries
            if (intensity === 'Heavy' && U.random() < intensityMod.injuryChance) {
                handleTrainingInjury(player);
            }

            // Development events
            handleDevelopmentEvents(player, league, team);
        });
    });
}

/**
 * Calculate XP bonus based on game performance
 */
function calculatePerformanceBonus(player) {
    const s = player.stats.game;
    let bonus = 0;

    if (player.pos === 'QB') {
        if (s.passTD >= 2) bonus += 10;
        if (s.passTD >= 4) bonus += 15;
        if (s.passYd >= 300) bonus += 10;
        if (s.interceptions === 0 && s.passAtt > 15) bonus += 5;
    } else if (player.pos === 'RB') {
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
 * Get Weighted Breakout Attribute
 */
function getBreakoutAttribute(position) {
    const weights = window.Constants?.POSITION_TRAINING_WEIGHTS?.[position];
    if (!weights) return null;

    const roll = U.random();
    let targetGroup;

    if (roll < 0.70) targetGroup = weights.primary;
    else if (roll < 0.90) targetGroup = weights.secondary;
    else targetGroup = weights.tertiary;

    return U.choice(targetGroup);
}

/**
 * Realistic age-based regression with position-specific curves.
 * Physical stats decline first, mental stats can remain or even improve.
 */
function handleRegression(player) {
    const curve = TRAINING_CONFIG.AGE_CURVES[player.pos] || TRAINING_CONFIG.AGE_CURVES.WR;
    const age = player.age || 25;

    // No regression before peak end
    if (age <= curve.peakEnd) return;

    const yearsOverPeak = age - curve.peakEnd;
    const isPastCliff = age > curve.cliffAge;

    // Physical stats regress first and faster
    const physicalStats = ['speed', 'acceleration', 'agility', 'trucking', 'juking'];
    // Mental stats are more durable
    const mentalStats = ['awareness', 'intelligence'];

    // Physical regression chance: escalates with age
    const physicalChance = isPastCliff
        ? 0.30 + (age - curve.cliffAge) * 0.15  // 30%+ past cliff
        : 0.05 + yearsOverPeak * 0.06;           // 5-25% during decline window

    // Mental stats can still grow slightly during early decline
    const mentalChance = isPastCliff
        ? 0.10 + (age - curve.cliffAge) * 0.08
        : 0.0; // Mental holds steady until cliff

    if (!player.ratings) return;

    // Physical regression
    if (U.random() < physicalChance) {
        const stat = U.choice(physicalStats);
        if (player.ratings[stat] && player.ratings[stat] > 35) {
            const loss = isPastCliff ? U.rand(1, 3) : 1;
            player.ratings[stat] = Math.max(35, player.ratings[stat] - loss);
        }
    }

    // Second physical stat hit for very old players
    if (isPastCliff && U.random() < 0.20) {
        const stat = U.choice(physicalStats);
        if (player.ratings[stat] && player.ratings[stat] > 35) {
            player.ratings[stat] = Math.max(35, player.ratings[stat] - U.rand(1, 2));
        }
    }

    // Mental regression (only past cliff)
    if (U.random() < mentalChance) {
        const stat = U.choice(mentalStats);
        if (player.ratings[stat] && player.ratings[stat] > 45) {
            player.ratings[stat] = Math.max(45, player.ratings[stat] - 1);
        }
    }

    // Recalculate OVR after any regression
    if (window.calculateOvr) {
        player.ovr = window.calculateOvr(player.pos, player.ratings);
    }
}

/**
 * Handle development events: Breakout, Leap, Second Wind, Stagnation, Decline
 */
function handleDevelopmentEvents(player, league, team) {
    const age = player.age || 25;
    const potential = player.potential || 70;
    const ovr = player.ovr || 50;
    const curve = TRAINING_CONFIG.AGE_CURVES[player.pos] || TRAINING_CONFIG.AGE_CURVES.WR;

    // Clear old status with chance to reset
    if (player.developmentStatus === 'BREAKOUT' && U.random() < 0.12) player.developmentStatus = 'NORMAL';
    if (player.developmentStatus === 'STAGNATED' && U.random() < 0.08) player.developmentStatus = 'NORMAL';
    if (player.developmentStatus === 'SECOND_WIND' && U.random() < 0.10) player.developmentStatus = 'NORMAL';

    // =========================================
    // 1. BREAKOUT - Young players with upside
    // =========================================
    if (age <= 26 && ovr < potential && player.developmentStatus !== 'BREAKOUT') {
        let chance = TRAINING_CONFIG.BREAKOUT_BASE_CHANCE;

        // Bigger gap between potential and OVR = higher chance
        const gap = potential - ovr;
        if (gap > 10) chance += 0.015;
        else if (gap > 5) chance += 0.008;

        // Playing well boosts chance
        if (player.stats?.game && Object.keys(player.stats.game).length > 0) {
            chance += 0.01;
        }

        // Hidden boom factor
        if (player.boomFactor && player.boomFactor > 5) {
            chance += (player.boomFactor / 60);
        }

        // Good coaching helps
        const coachDev = team.staff?.headCoach?.playerDevelopment || team.staff?.headCoach?.ratings?.development || 50;
        if (coachDev > 70) chance += 0.01;

        if (U.random() < chance) {
            player.developmentStatus = 'BREAKOUT';

            // XP Boost
            const boostXP = U.rand(2, 4) * 1000;
            addXP(player, boostXP);

            // Targeted Attribute Boost (+3 to +7 in key area)
            const targetAttr = getBreakoutAttribute(player.pos);
            let story = `${player.pos} ${player.name} is showing rapid improvement!`;

            if (targetAttr && player.ratings && player.ratings[targetAttr] !== undefined) {
                const boost = U.rand(3, 7);
                player.ratings[targetAttr] = Math.min(99, player.ratings[targetAttr] + boost);
                story = `${player.name} has taken a huge leap in ${targetAttr} (+${boost})!`;

                if (window.calculateOvr) {
                    player.ovr = window.calculateOvr(player.pos, player.ratings);
                }
            }

            // OVR direct boost for feel-good moment
            if (!window.calculateOvr) {
                player.ovr = Math.min(99, ovr + U.rand(2, 4));
            }

            addDevelopmentNews(league, team, player, 'BREAKOUT', story);
        }
    }

    // =========================================
    // 2. LEAP YEAR - Player in prime takes a step up
    // =========================================
    if (age >= curve.peakStart && age <= curve.peakEnd && ovr < potential &&
        player.developmentStatus !== 'BREAKOUT' && player.developmentStatus !== 'LEAP') {

        const leapChance = 0.008; // ~14% chance per season for eligible players
        if (U.random() < leapChance) {
            player.developmentStatus = 'LEAP';

            // Moderate boost to 1-2 key stats
            const attr1 = getBreakoutAttribute(player.pos);
            if (attr1 && player.ratings && player.ratings[attr1] !== undefined) {
                const boost = U.rand(2, 4);
                player.ratings[attr1] = Math.min(99, player.ratings[attr1] + boost);
            }

            // Mental stat boost (experience)
            if (player.ratings) {
                player.ratings.awareness = Math.min(99, (player.ratings.awareness || 70) + U.rand(1, 3));
                player.ratings.intelligence = Math.min(99, (player.ratings.intelligence || 70) + U.rand(1, 2));
            }

            if (window.calculateOvr) {
                player.ovr = window.calculateOvr(player.pos, player.ratings);
            }

            addDevelopmentNews(league, team, player, 'LEAP',
                `${player.name} has elevated their game to a new level in year ${age - 21} of their career.`);
        }
    }

    // =========================================
    // 3. SECOND WIND - Veteran resurgence (rare, exciting)
    // =========================================
    if (age >= 30 && age <= curve.cliffAge && ovr >= 70 &&
        player.developmentStatus !== 'SECOND_WIND' && player.developmentStatus !== 'DECLINING') {

        if (U.random() < TRAINING_CONFIG.SECOND_WIND_CHANCE) {
            player.developmentStatus = 'SECOND_WIND';

            // Boost awareness/intelligence significantly (veteran savvy)
            if (player.ratings) {
                player.ratings.awareness = Math.min(99, (player.ratings.awareness || 70) + U.rand(3, 6));
                player.ratings.intelligence = Math.min(99, (player.ratings.intelligence || 70) + U.rand(2, 4));
            }

            if (window.calculateOvr) {
                player.ovr = window.calculateOvr(player.pos, player.ratings);
            }

            addDevelopmentNews(league, team, player, 'SECOND_WIND',
                `${player.name} is having a career renaissance! Veteran savvy has unlocked a new gear.`);
        }
    }

    // =========================================
    // 4. STAGNATION - High potential not being met
    // =========================================
    if (age <= 27 && potential > ovr + 8 &&
        player.developmentStatus !== 'STAGNATED' && player.developmentStatus !== 'BREAKOUT') {

        let stagnationChance = TRAINING_CONFIG.STAGNATION_BASE_CHANCE;

        if (player.bustFactor && player.bustFactor > 5) {
            stagnationChance += (player.bustFactor / 80);
        }

        // Bad coaching increases stagnation
        const coachDev = team.staff?.headCoach?.playerDevelopment || team.staff?.headCoach?.ratings?.development || 50;
        if (coachDev < 40) stagnationChance += 0.005;

        if (U.random() < stagnationChance) {
            player.developmentStatus = 'STAGNATED';
            player.potential = Math.max(player.ovr, player.potential - U.rand(2, 5));

            addDevelopmentNews(league, team, player, 'STAGNATED',
                `${player.name} is struggling to develop. Potential ceiling has been lowered.`);
        }
    }

    // =========================================
    // 5. DECLINE - Age-related deterioration
    // =========================================
    if (age >= curve.peakEnd + 1 && player.developmentStatus !== 'DECLINING') {
        let declineChance = TRAINING_CONFIG.DECLINE_BASE_CHANCE;
        const yearsOverPeak = age - curve.peakEnd;
        declineChance += yearsOverPeak * 0.008;

        if (age > curve.cliffAge) declineChance += 0.10; // Much higher past cliff

        if (U.random() < declineChance) {
            player.developmentStatus = 'DECLINING';

            addDevelopmentNews(league, team, player, 'DECLINING',
                `${player.name} is showing signs of age-related decline. Physical attributes deteriorating.`);
        }
    }
}

/**
 * Helper to add development news
 */
function addDevelopmentNews(league, team, player, type, story) {
    const typeLabels = {
        'BREAKOUT': 'BREAKOUT',
        'LEAP': 'CAREER LEAP',
        'SECOND_WIND': 'VETERAN RESURGENCE',
        'STAGNATED': 'DEVELOPMENT STALLED',
        'DECLINING': 'PHYSICAL DECLINE'
    };

    if (league.news) {
        league.news.push({
            type: 'development',
            headline: `${typeLabels[type] || type}: ${player.name} (${team.abbr})`,
            story: story,
            week: league.week,
            year: league.year,
            team: team.id
        });
    }

    if (!player.seasonNews) player.seasonNews = [];
    player.seasonNews.push({
        headline: typeLabels[type] || type,
        story: story,
        week: league.week,
        year: league.year
    });
}

/**
 * Handle training injuries
 */
function handleTrainingInjury(player) {
    if (window.generateInjury && window.applyInjury) {
        const injury = window.generateInjury(player);
        if (injury) {
            injury.type = `Training: ${injury.type}`;
            window.applyInjury(player, injury);
            if (window.setStatus) window.setStatus(`Training Accident: ${player.name} injured.`, 'error');
        }
    }
}

// Expose globally
if (typeof window !== 'undefined') {
    window.runWeeklyTraining = runWeeklyTraining;
}
