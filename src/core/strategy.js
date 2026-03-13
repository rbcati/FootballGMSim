/*
 * Strategy Module
 * Handles Weekly Game Plans and Risk Profiles
 */

import { saveState } from './state.js';

export const OFFENSIVE_PLANS = {
    BALANCED: {
        id: 'BALANCED',
        name: 'Balanced Offense',
        description: 'No specific focus. Adapt to the flow of the game.',
        bonus: 'None',
        penalty: 'None',
        modifiers: {}
    },
    AGGRESSIVE_PASSING: {
        id: 'AGGRESSIVE_PASSING',
        name: 'Aggressive Passing',
        description: 'Focus on deep throws and high volume passing.',
        bonus: '+Yards per Attempt, +Big Plays',
        penalty: '+Interception Risk, +Sack Risk',
        modifiers: {
            passVolume: 1.25,
            passAccuracy: 0.95, // Lower completion % due to deep shots
            intChance: 1.5,
            sackChance: 1.2
        }
    },
    BALL_CONTROL: {
        id: 'BALL_CONTROL',
        name: 'Ball Control',
        description: 'Short passes and running to control the clock.',
        bonus: '-Turnovers, +Time of Possession',
        penalty: '-Explosive Plays',
        modifiers: {
            runVolume: 1.2,
            passVolume: 0.8,
            passAccuracy: 1.1, // High % short throws
            intChance: 0.5,
            sackChance: 0.8,
            variance: 0.8 // Consistent but lower ceiling
        }
    },
    PROTECT_QB: {
        id: 'PROTECT_QB',
        name: 'Protect the QB',
        description: 'Max protection schemes and quick releases.',
        bonus: '-Sacks, -Injuries',
        penalty: '-Offensive Upside',
        modifiers: {
            sackChance: 0.4,
            passVolume: 0.9,
            passAccuracy: 0.95
        }
    },
    FEED_STAR: {
        id: 'FEED_STAR',
        name: 'Feed the Star',
        description: 'Force feed your best playmaker.',
        bonus: '+Top Player Stats',
        penalty: '-Secondary Options, +Predictability',
        modifiers: {
            starUsage: 1.5,
            othersUsage: 0.8,
            variance: 1.2
        }
    }
};

export const DEFENSIVE_PLANS = {
    BALANCED: {
        id: 'BALANCED',
        name: 'Balanced Defense',
        description: 'Standard defensive sets.',
        bonus: 'None',
        penalty: 'None',
        modifiers: {}
    },
    SELL_OUT_RUN: {
        id: 'SELL_OUT_RUN',
        name: 'Sell Out vs Run',
        description: 'Stack the box to stop the run.',
        bonus: '-Opponent Rush Efficiency',
        penalty: '+Opponent Passing Efficiency',
        modifiers: {
            // Defense modifiers are inverted (applied to opponent) or handled in logic
            defRunStop: 1.3,
            defPassCov: 0.8
        }
    },
    DISGUISE_COVERAGE: {
        id: 'DISGUISE_COVERAGE',
        name: 'Disguise Coverage',
        description: 'Confuse the QB with complex looks.',
        bonus: '+Interception Chance',
        penalty: '+Big Play Risk (Blown Coverage)',
        modifiers: {
            defIntChance: 1.5,
            defBigPlayAllowed: 1.3
        }
    },
    BLITZ_HEAVY: {
        id: 'BLITZ_HEAVY',
        name: 'Blitz Heavy',
        description: 'Send extra rushers frequently.',
        bonus: '+Sack Chance, +Pressure',
        penalty: '+Big Play Risk',
        modifiers: {
            defSackChance: 1.4,
            defPressure: 1.3,
            defBigPlayAllowed: 1.25,
            defRunStop: 0.9
        }
    },
    TWO_HIGH_SAFE: {
        id: 'TWO_HIGH_SAFE',
        name: 'Two-High Safety',
        description: 'Keep everything in front of the defense.',
        bonus: '-Big Plays Allowed',
        penalty: '+Opponent Run Efficiency',
        modifiers: {
            defBigPlayAllowed: 0.6,
            defPassCov: 1.1,
            defRunStop: 0.8,
            defIntChance: 0.8
        }
    }
};

export const RISK_PROFILES = {
    CONSERVATIVE: {
        id: 'CONSERVATIVE',
        name: 'Conservative',
        description: 'Minimize mistakes. Play safe.',
        modifiers: {
            variance: 0.7,
            intChance: 0.7,
            fumbleChance: 0.7,
            bigPlayChance: 0.7
        }
    },
    BALANCED: {
        id: 'BALANCED',
        name: 'Balanced',
        description: 'Standard risk/reward approach.',
        modifiers: {
            variance: 1.0
        }
    },
    AGGRESSIVE: {
        id: 'AGGRESSIVE',
        name: 'Aggressive',
        description: 'High risk, high reward. Go for it.',
        modifiers: {
            variance: 1.4,
            intChance: 1.3,
            fumbleChance: 1.3,
            bigPlayChance: 1.3
        }
    }
};

/**
 * Get the combined modifiers for a given game plan and risk profile.
 * @param {string} offPlanId
 * @param {string} defPlanId
 * @param {string} riskId
 * @param {object} usageHistory - Optional map of planId -> usageCount
 * @returns {object} Combined modifiers
 */
export function getStrategyModifiers(offPlanId, defPlanId, riskId, usageHistory = {}) {
    const offPlan = OFFENSIVE_PLANS[offPlanId] || OFFENSIVE_PLANS.BALANCED;
    const defPlan = DEFENSIVE_PLANS[defPlanId] || DEFENSIVE_PLANS.BALANCED;
    const risk = RISK_PROFILES[riskId] || RISK_PROFILES.BALANCED;

    const mods = { ...offPlan.modifiers, ...defPlan.modifiers };

// Apply Diminishing Returns (Task 5)
    // If a plan is used frequently, opponents adapt.
    const offUsage = usageHistory && usageHistory[offPlanId] ? usageHistory[offPlanId] : 0;
    const defUsage = usageHistory && usageHistory[defPlanId] ? usageHistory[defPlanId] : 0;

    // Check overuse (progressive penalty)
    const applyPenalty = (usage, planMods, currentMods, key) => {
        if (usage > 3 && planMods[key]) {
            // Every week beyond 3 reduces the bonus further (max 90% reduction)
            const penaltyFactor = Math.max(0.1, 1.0 - ((usage - 3) * 0.15));
            if (currentMods[key] > 1.0) {
                currentMods[key] = 1.0 + (currentMods[key] - 1.0) * penaltyFactor;
            } else if (currentMods[key] < 1.0) {
                 // If it's a penalty (< 1.0), it gets WORSE with overuse
                 currentMods[key] = currentMods[key] - ((1.0 - currentMods[key]) * (1.0 - penaltyFactor));
            }
        }
    };

    Object.keys(mods).forEach(key => {
        applyPenalty(offUsage, offPlan.modifiers, mods, key);
        applyPenalty(defUsage, defPlan.modifiers, mods, key);
    });

    // Merge risk modifiers
    Object.keys(risk.modifiers).forEach(key => {
        if (mods[key]) {
            mods[key] *= risk.modifiers[key];
        } else {
            mods[key] = risk.modifiers[key];
        }
    });

    return mods;
}

/**
 * Update the user's strategy in the league state.
 * @param {object} league
 * @param {string} offPlanId
 * @param {string} defPlanId
 * @param {string} riskId
 */
export function updateWeeklyStrategy(league, offPlanId, defPlanId, riskId) {
    if (!league) return;

    // Default to balanced if missing
    if (!offPlanId) offPlanId = 'BALANCED';
    if (!defPlanId) defPlanId = 'BALANCED';
    if (!riskId) riskId = 'BALANCED';

    league.weeklyGamePlan = {
        offPlanId: offPlanId,
        defPlanId: defPlanId,
        riskId: riskId
    };

    // Also track usage for continuity (Task 5)
    if (!league.strategyHistory) league.strategyHistory = {};

    if (!league.strategyHistory[offPlanId]) league.strategyHistory[offPlanId] = 0;
    league.strategyHistory[offPlanId]++;

    if (!league.strategyHistory[defPlanId]) league.strategyHistory[defPlanId] = 0;
    league.strategyHistory[defPlanId]++;

    // Strategy updated — no console log needed in production

    // Persist strategy change immediately
    if (saveState) saveState();
}

// Keep GAME_PLANS for backward compatibility if needed, but alias to merged
export const GAME_PLANS = { ...OFFENSIVE_PLANS, ...DEFENSIVE_PLANS };

export default {
    OFFENSIVE_PLANS,
    DEFENSIVE_PLANS,
    GAME_PLANS,
    RISK_PROFILES,
    getStrategyModifiers,
    updateWeeklyStrategy
};
