// injury-core.js
// Pure injury logic extracted from injury-system.js

import { Utils as U } from './utils.js';

const INJURIES = [
    { name: 'Sprained Ankle', impact: 0.1, minWeeks: 1, maxWeeks: 3 },
    { name: 'Hamstring Strain', impact: 0.2, minWeeks: 2, maxWeeks: 4 },
    { name: 'Concussion', impact: 0.3, minWeeks: 1, maxWeeks: 2 },
    { name: 'Knee Sprain', impact: 0.4, minWeeks: 3, maxWeeks: 6 },
    { name: 'Broken Finger', impact: 0.05, minWeeks: 2, maxWeeks: 5 },
    { name: 'Shoulder Separation', impact: 0.3, minWeeks: 4, maxWeeks: 8 },
    { name: 'ACL Tear', impact: 0.9, minWeeks: 20, maxWeeks: 40, seasonEnding: true }
];

/**
 * Generate a potential injury for a player after a game.
 * @param {Object} player - The player object.
 * @param {Object} context - Game context (optional).
 * @returns {Object|null} The injury object or null if no injury occurred.
 */
export function generateInjury(player, context = {}) {
    // Base chance per game ~1.5%
    let chance = 0.015;
    // Durability Modifier
    // Rating 60-99. High durability = lower chance.
    // 99 durability -> 0.6x multiplier
    // 60 durability -> 1.4x multiplier
    const durability = player.ratings?.durability || 80;
    const durabilityMod = 1.4 - ((durability - 60) / 39) * 0.8;
    chance *= durabilityMod;


    // Position modifiers (Physical positions get hurt more)
    if (['RB', 'LB', 'DL', 'OL'].includes(player.pos)) chance *= 1.3;
    if (['K', 'P'].includes(player.pos)) chance *= 0.1;
    if (player.pos === 'QB') chance *= 0.8; // Protected

    // Trait modifiers
    if (player.traits && player.traits.includes('IRONMAN')) {
        chance *= 0.5; // 50% reduction
    }

    // Age modifier (older players slightly more prone)
    if (player.age > 30) chance *= 1.2;

    // Roll for injury
    if (Math.random() < chance) {
        const injuryTemplate = U.choice(INJURIES);
        const weeks = U.rand(injuryTemplate.minWeeks, injuryTemplate.maxWeeks);
        return {
            name: injuryTemplate.name,
            impact: injuryTemplate.impact,
            weeksRemaining: weeks,
            seasonEnding: injuryTemplate.seasonEnding || false
        };
    }
    return null;
}

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
