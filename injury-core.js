// injury-core.js
// Pure injury logic extracted from injury-system.js

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
