// scheme-core.js
// Pure scheme logic extracted from scheme-management.js

import { Constants as C } from './constants.js';

/**
 * Calculates how well a player fits a given offensive scheme
 * @param {Object} player - Player object
 * @param {string} scheme - Offensive scheme name
 * @returns {number} Fit rating (0-100)
 */
export function calculateOffensiveSchemeFit(player, scheme) {
  if (!player || !player.ratings || !scheme) return 50;

  const schemeData = C?.OFFENSIVE_SCHEMES?.[scheme];
  if (!schemeData || !schemeData.keyStats) return 50;

  const ratings = player.ratings;
  const keyStats = schemeData.keyStats;

  // Calculate average of key stats for this scheme
  let totalRating = 0;
  let count = 0;

  keyStats.forEach(stat => {
    const value = ratings[stat];
    if (typeof value === 'number' && value > 0) {
      totalRating += value;
      count++;
    }
  });

  if (count === 0) return 50;

  return Math.round(totalRating / count);
}

/**
 * Calculates how well a player fits a given defensive scheme
 * @param {Object} player - Player object
 * @param {string} scheme - Defensive scheme name
 * @returns {number} Fit rating (0-100)
 */
export function calculateDefensiveSchemeFit(player, scheme) {
  if (!player || !player.ratings || !scheme) return 50;

  const schemeData = C?.DEFENSIVE_SCHEMES?.[scheme];
  if (!schemeData || !schemeData.keyStats) return 50;

  const ratings = player.ratings;
  const keyStats = schemeData.keyStats;

  // Calculate average of key stats for this scheme
  let totalRating = 0;
  let count = 0;

  keyStats.forEach(stat => {
    const value = ratings[stat];
    if (typeof value === 'number' && value > 0) {
      totalRating += value;
      count++;
    }
  });

  if (count === 0) return 50;

  return Math.round(totalRating / count);
}

/**
 * Calculates team overall rating based on scheme fit
 * @param {Object} team - Team object
 * @returns {Object} Team rating with scheme fit adjustments
 */
export function calculateTeamRatingWithSchemeFit(team) {
  if (!team || !team.roster) {
    return {
      overall: 0,
      offense: 0,
      defense: 0,
      schemeFitBonus: 0,
      schemeFitPenalty: 0
    };
  }

  // Get current schemes
  const offScheme = team.strategies?.offense || 'Balanced';
  const defScheme = team.strategies?.defense || '4-3';

  const OFFENSIVE_POSITIONS = C?.OFFENSIVE_POSITIONS || ['QB', 'RB', 'WR', 'TE', 'OL', 'K'];
  const DEFENSIVE_POSITIONS = C?.DEFENSIVE_POSITIONS || ['DL', 'LB', 'CB', 'S', 'P'];

  // Calculate base ratings
  let offensiveRating = 0;
  let defensiveRating = 0;
  let offensiveFitTotal = 0;
  let defensiveFitTotal = 0;
  let offensiveCount = 0;
  let defensiveCount = 0;

  team.roster.forEach(player => {
    if (OFFENSIVE_POSITIONS.includes(player.pos)) {
      const baseOvr = player.ovr || 50;
      const fitRating = calculateOffensiveSchemeFit(player, offScheme);
      const adjustedRating = baseOvr + ((fitRating - 50) * 0.3); // 30% scheme fit impact

      offensiveRating += adjustedRating;
      offensiveFitTotal += fitRating;
      offensiveCount++;
    } else if (DEFENSIVE_POSITIONS.includes(player.pos)) {
      const baseOvr = player.ovr || 50;
      const fitRating = calculateDefensiveSchemeFit(player, defScheme);
      const adjustedRating = baseOvr + ((fitRating - 50) * 0.3); // 30% scheme fit impact

      defensiveRating += adjustedRating;
      defensiveFitTotal += fitRating;
      defensiveCount++;
    }
  });

  const avgOffensiveRating = offensiveCount > 0 ? offensiveRating / offensiveCount : 0;
  const avgDefensiveRating = defensiveCount > 0 ? defensiveRating / defensiveCount : 0;
  const avgOffensiveFit = offensiveCount > 0 ? offensiveFitTotal / offensiveCount : 50;
  const avgDefensiveFit = defensiveCount > 0 ? defensiveFitTotal / defensiveCount : 50;

  // Calculate scheme fit bonuses/penalties
  const offensiveFitBonus = (avgOffensiveFit - 50) * 0.2; // Up to +/- 10 points
  const defensiveFitBonus = (avgDefensiveFit - 50) * 0.2;

  // Overall team rating (weighted)
  const overall = Math.round(
    (avgOffensiveRating * 0.45) +
    (avgDefensiveRating * 0.45) +
    (offensiveFitBonus + defensiveFitBonus)
  );

  return {
    overall: Math.max(0, Math.min(100, overall)),
    offense: Math.round(avgOffensiveRating),
    defense: Math.round(avgDefensiveRating),
    offensiveSchemeFit: Math.round(avgOffensiveFit),
    defensiveSchemeFit: Math.round(avgDefensiveFit),
    schemeFitBonus: Math.round((offensiveFitBonus + defensiveFitBonus) * 10) / 10,
    offensiveScheme: offScheme,
    defensiveScheme: defScheme
  };
}
