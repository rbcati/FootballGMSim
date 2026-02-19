/**
 * Structured WAR (Wins Above Replacement) Calculation
 * Implements the user-specified algorithm for dynamic player value.
 */

const WAR_CONSTANTS = {
  POINTS_PER_WIN: 30,

  // Step 1: Raw Production Score (RPS) Weights
  // Standard Fantasy/Performance Scoring
  RPS_WEIGHTS: {
    PASSING: {
      yards: 0.04,
      td: 4,
      int: -2
    },
    RUSHING: {
      yards: 0.1,
      td: 6,
      fumbles: -2
    },
    RECEIVING: {
      yards: 0.1,
      td: 6,
      receptions: 0.5 // 0.5 PPR
    },
    DEFENSE: {
      tackles: 1,
      sacks: 4,
      interceptions: 5,
      forcedFumbles: 3,
      tacklesForLoss: 2,
      passesDefended: 1.5,
      defTD: 6,
      safety: 2
    },
    KICKING: {
      fgMade: 3,
      xpMade: 1,
      fgMiss: -1,
      xpMiss: -1 // Penalty for missing
    }
  },

  // Step 2: Positional Value Multipliers (PVM)
  POSITIONAL_WEIGHTS: {
    QB: 1.25,
    WR: 1.0,
    RB: 0.85,
    TE: 0.85,
    S: 0.85,
    LB: 0.80,
    DL: 0.80, // Treating generic DL as Interior/Standard
    CB: 0.90, // Estimated between Safety and WR
    OL: 0.60, // OL stats are scarce (pancakes/sacks allowed), lower multiplier
    K: 0.50,
    P: 0.50
  },

  // Step 3: Replacement Level Baseline (Static Approximation)
  BASELINES: {
    QB: 12,
    RB: 8,
    WR: 8,
    TE: 8,
    DL: 5,
    LB: 5,
    CB: 5,
    S: 5,
    OL: 5,
    K: 3,
    P: 3
  },

  // Efficiency Modifiers
  EFFICIENCY: {
    QB: {
      HIGH_THRESHOLD: 0.65,
      LOW_THRESHOLD: 0.55,
      HIGH_MULTIPLIER: 1.1,
      LOW_MULTIPLIER: 0.9
    }
  }
};

/**
 * Calculates the Raw Production Score (RPS) based on stats and position.
 * @param {Object} player - Player object with 'pos' property.
 * @param {Object} stats - Game or Season stats object.
 * @returns {number} Raw Production Score.
 */
export function calculateRPS(player, stats) {
  if (!player || !stats) return 0;

  let score = 0;
  const W = WAR_CONSTANTS.RPS_WEIGHTS;

  // Offensive Scoring
  if (['QB', 'RB', 'WR', 'TE'].includes(player.pos)) {
    // Passing
    score += (stats.passYd || 0) * W.PASSING.yards;
    score += (stats.passTD || 0) * W.PASSING.td;
    score += (stats.interceptions || 0) * W.PASSING.int; // Note: 'interceptions' field name varies, checking usage

    // Rushing
    score += (stats.rushYd || 0) * W.RUSHING.yards;
    score += (stats.rushTD || 0) * W.RUSHING.td;
    score += (stats.fumbles || 0) * W.RUSHING.fumbles;

    // Receiving
    score += (stats.recYd || 0) * W.RECEIVING.yards;
    score += (stats.recTD || 0) * W.RECEIVING.td;
    score += (stats.receptions || 0) * W.RECEIVING.receptions;
  }

  // Defensive Scoring
  if (['DL', 'LB', 'CB', 'S'].includes(player.pos)) {
    score += (stats.tackles || 0) * W.DEFENSE.tackles;
    score += (stats.sacks || 0) * W.DEFENSE.sacks;
    score += (stats.interceptions || 0) * W.DEFENSE.interceptions;
    score += (stats.forcedFumbles || 0) * W.DEFENSE.forcedFumbles;
    score += (stats.tacklesForLoss || 0) * W.DEFENSE.tacklesForLoss;
    score += (stats.passesDefended || 0) * W.DEFENSE.passesDefended;
    score += (stats.defTD || 0) * W.DEFENSE.defTD;
    score += (stats.safeties || 0) * W.DEFENSE.safety;
  }

  // OL Scoring (Simplified based on previous player.js logic)
  if (player.pos === 'OL') {
    const pancakes = stats.pancakes || 0;
    const sacksAllowed = stats.sacksAllowed || 0;
    // Arbitrary RPS for OL since they don't have fantasy stats
    score += (pancakes * 2) - (sacksAllowed * 5);
    // Add base rating value if stats are empty? No, stick to stats.
  }

  // Kicker/Punter
  if (player.pos === 'K') {
     score += (stats.fgMade || 0) * W.KICKING.fgMade;
     score += (stats.xpMade || 0) * W.KICKING.xpMade;
     // Penalties could be added if tracked
  }

  return score;
}

/**
 * Calculates the WAR value for a player given their stats.
 * @param {Object} player - Player object.
 * @param {Object} stats - Stats object (game or season).
 * @param {Object} options - Optional overrides (e.g. { multiplier: 1.0 }).
 * @returns {number} WAR value.
 */
export function calculateWAR(player, stats, options = {}) {
  if (!player || !stats) return 0;

  // 1. Calculate RPS
  let rps = calculateRPS(player, stats);

  // 2. Apply Efficiency Modifiers
  let efficiencyMult = 1.0;
  if (player.pos === 'QB') {
    const attempts = stats.passAtt || 0;
    if (attempts > 0) {
      const completions = stats.passComp || 0;
      const compPct = completions / attempts;
      const C = WAR_CONSTANTS.EFFICIENCY.QB;

      if (compPct > C.HIGH_THRESHOLD) efficiencyMult = C.HIGH_MULTIPLIER;
      else if (compPct < C.LOW_THRESHOLD) efficiencyMult = C.LOW_MULTIPLIER;
    }
  }

  // 3. Apply Positional Adjustment
  const posMult = WAR_CONSTANTS.POSITIONAL_WEIGHTS[player.pos] || 1.0;

  // Adjusted Score
  let adjustedScore = rps * efficiencyMult * posMult;

  // 4. Baseline Subtraction
  // Baseline is per game? The prompt example implies "Single Game WAR".
  // "Baseline: 12." for QB.
  // If stats are Season stats (e.g. 17 games), we need to scale the baseline.
  // The existing calculateWAR in player.js seemed to calculate per season.
  // We need to determine if 'stats' represents a single game or season.
  // Usually 'gamesPlayed' indicates season stats.

  const gamesPlayed = stats.gamesPlayed || 1;
  // If gamesPlayed is > 1, assume these are aggregated stats and scale baseline.
  // However, RPS is cumulative. So Baseline should be cumulative too.

  const baselinePerGame = WAR_CONSTANTS.BASELINES[player.pos] || 5;
  const totalBaseline = baselinePerGame * gamesPlayed;

  const netValue = adjustedScore - totalBaseline;

  // 5. Convert to Wins
  const war = netValue / WAR_CONSTANTS.POINTS_PER_WIN;

  return parseFloat(war.toFixed(2));
}

export { WAR_CONSTANTS };
