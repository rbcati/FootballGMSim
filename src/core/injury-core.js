// injury-core.js
// Pure injury logic extracted from injury-system.js

import { Utils as U } from './utils.js';

export const INJURY_TYPES = {
    // Minor
    SPRAINED_ANKLE: { name: 'Sprained Ankle', minWeeks: 1, maxWeeks: 3, severity: 'Minor', impact: 0.15 },
    BRUISED_RIBS:   { name: 'Bruised Ribs',   minWeeks: 1, maxWeeks: 2, severity: 'Minor', impact: 0.10 },
    // Moderate
    HAMSTRING_STRAIN: { name: 'Hamstring Strain', minWeeks: 2, maxWeeks: 5, severity: 'Moderate', impact: 0.30 },
    CONCUSSION:       { name: 'Concussion',       minWeeks: 1, maxWeeks: 4, severity: 'Moderate', impact: 0.40 },
    SHOULDER_SPRAIN:  { name: 'Shoulder Sprain',  minWeeks: 2, maxWeeks: 4, severity: 'Moderate', impact: 0.25 },
    // Severe
    BROKEN_BONE:    { name: 'Broken Bone',    minWeeks: 6, maxWeeks: 10, severity: 'Severe', impact: 0.60 },
    TORN_ACL:       { name: 'Torn ACL',       minWeeks: 40, maxWeeks: 52, severity: 'Severe', seasonEnding: true, impact: 0.80 },
    TORN_ACHILLES:  { name: 'Torn Achilles',  minWeeks: 40, maxWeeks: 52, severity: 'Severe', seasonEnding: true, impact: 0.85 }
};

/**
 * Generate a random injury based on position risk factors.
 * @param {string} pos - Player position
 * @returns {Object} Injury object
 */
export function generateInjury(pos) {
    const roll = U.rand(0, 100);
    let injuryType;

    // TODO: Add position specific weights if needed
    if (roll < 60) { // 60% Minor
        injuryType = U.choice([INJURY_TYPES.SPRAINED_ANKLE, INJURY_TYPES.BRUISED_RIBS]);
    } else if (roll < 90) { // 30% Moderate
        injuryType = U.choice([INJURY_TYPES.HAMSTRING_STRAIN, INJURY_TYPES.CONCUSSION, INJURY_TYPES.SHOULDER_SPRAIN]);
    } else { // 10% Severe
        injuryType = U.choice([INJURY_TYPES.BROKEN_BONE, INJURY_TYPES.TORN_ACL, INJURY_TYPES.TORN_ACHILLES]);
    }

    const weeks = U.rand(injuryType.minWeeks, injuryType.maxWeeks);

    return {
        type: injuryType.name,
        weeksOut: weeks, // Initial duration
        weeksRemaining: weeks, // Current countdown
        severity: injuryType.severity,
        impact: injuryType.impact,
        isSeasonEnding: injuryType.seasonEnding || false
    };
}

/**
 * Get effective rating for injured player
 * @param {Object} player - Player object
 * @returns {number} Effective overall rating
 */
export function getEffectiveRating(player) {
    if (!player) return 0;
    // Check if truly injured (has active injuries)
    if (!player.injuries || player.injuries.length === 0) {
        return player.ovr || 0;
    }

    let totalImpact = 0;
    player.injuries.forEach(injury => {
        // Only count impact if the injury is still active
        if (injury.weeksRemaining > 0) {
            totalImpact += (injury.impact || 0);
        }
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
    if (!player) return false;

    // Check injuries array
    if (player.injuries && player.injuries.length > 0) {
        // If any injury has remaining weeks, they cannot play
        const isHurt = player.injuries.some(inj => inj.weeksRemaining > 0);
        if (isHurt) return false;
    }

    // Fallback: Check legacy flags if array is empty but flag is set
    // (This helps transition or if flag is set manually)
    if (player.injured === true && (!player.injuries || player.injuries.length === 0)) {
        return false;
    }

    return true;
}
