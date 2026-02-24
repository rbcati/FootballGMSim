// injury-core.js
// Pure injury logic extracted from injury-system.js

import { Utils as U } from './utils.js';
import { TRAITS } from '../data/traits.js';

/**
 * Get effective rating for injured player
 * @param {Object} player - Player object
 * @returns {number} Effective overall rating
 */
export function getEffectiveRating(player) {
    if (!player) return 0;
    if (!player.injured || !player.injuries) {
        return player.ovr || 0;
    }

    let totalImpact = 0;
    player.injuries.forEach(injury => {
        totalImpact += injury.impact;
    });

    // Cap total impact at 0.85 (player still has some ability)
    totalImpact = Math.min(totalImpact, 0.85);

    const baseOvr = player.ovr || 0;
    return Math.max(40, Math.round(baseOvr * (1 - totalImpact)));
}

/**
 * Check if player can play (considers injury severity)
 * @param {Object} player - Player object
 * @returns {boolean} Can play
 */
export function canPlayerPlay(player) {
    if (!player || !player.injured) return true;

    // Can't play with season-ending injury
    if (player.seasonEndingInjury) return false;

    // Can't play if any injury has more than 1 week remaining
    if (player.injuries && player.injuries.length > 0) {
        const hasActiveInjury = player.injuries.some(inj => inj.weeksRemaining > 1);
        if (hasActiveInjury) return false;
    }

    // Can play but at reduced effectiveness (minor injuries in final week)
    return true;
}

/**
 * Calculate the probability of a player getting injured in a game.
 * @param {Object} player
 * @returns {number} Probability (0.0 - 1.0)
 */
export function calculateInjuryChance(player) {
    let baseChance = 0.015; // 1.5% per game base

    // Position adjustments
    if (player.pos === 'RB' || player.pos === 'LB') baseChance += 0.005;
    if (player.pos === 'QB' || player.pos === 'K' || player.pos === 'P') baseChance -= 0.005;

    // Trait adjustments
    if (player.traits && player.traits.includes(TRAITS.IRONMAN.id)) {
        baseChance *= 0.5;
    }

    // Age adjustment (older = more prone)
    if (player.age > 30) {
        baseChance *= (1 + (player.age - 30) * 0.1);
    }

    return Math.max(0.001, Math.min(0.5, baseChance));
}

/**
 * Generate a new injury object.
 * @param {Object} player
 * @returns {Object} Injury object { type, weeksRemaining, impact, seasonEnding }
 */
export function generateInjury(player) {
    const types = [
        { name: 'Sprained Ankle', minWeeks: 1, maxWeeks: 3, impact: 0.1 },
        { name: 'Hamstring Strain', minWeeks: 2, maxWeeks: 4, impact: 0.15 },
        { name: 'Concussion', minWeeks: 1, maxWeeks: 2, impact: 0.2 },
        { name: 'Knee Soreness', minWeeks: 1, maxWeeks: 2, impact: 0.1 },
        { name: 'Shoulder Bruise', minWeeks: 1, maxWeeks: 2, impact: 0.1 },
        { name: 'Broken Finger', minWeeks: 2, maxWeeks: 4, impact: 0.05 },
        { name: 'High Ankle Sprain', minWeeks: 4, maxWeeks: 6, impact: 0.25 },
        { name: 'MCL Sprain', minWeeks: 4, maxWeeks: 8, impact: 0.3 },
        { name: 'Broken Collarbone', minWeeks: 6, maxWeeks: 10, impact: 0.4 },
        { name: 'Torn ACL', minWeeks: 40, maxWeeks: 52, impact: 0.6, seasonEnding: true },
        { name: 'Achilles Tear', minWeeks: 40, maxWeeks: 52, impact: 0.7, seasonEnding: true }
    ];

    const type = U.choice(types);
    const weeks = U.rand(type.minWeeks, type.maxWeeks);

    return {
        type: type.name,
        weeksRemaining: weeks,
        impact: type.impact,
        seasonEnding: type.seasonEnding || false
    };
}
