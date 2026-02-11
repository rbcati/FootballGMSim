// stats-tracking.js
// Handles accumulation and retrieval of player stats (Season + Career)

/**
 * Updates a player's stats history with game stats.
 * Note: This is primarily a helper for the simulation engine or testing.
 * In the main loop, stats are usually updated via bulk merge.
 * @param {Object} player - The player object
 * @param {Object} gameStats - The stats from a single game
 */
export const updatePlayerStats = (player, gameStats) => {
  if (!player) return;

  if (!player.stats) player.stats = {};
  if (!player.stats.season) player.stats.season = {};

  // Merge gameStats into season stats
  Object.keys(gameStats).forEach(key => {
      if (typeof gameStats[key] === 'number') {
          player.stats.season[key] = (player.stats.season[key] || 0) + gameStats[key];
      }
  });

  return player;
};

/**
 * Calculates career stats by combining past history and current season.
 * @param {Object} player - The player object
 * @returns {Object} Aggregated career stats
 */
export const getCareerStats = (player) => {
  if (!player) return null;

  // Initialize with zero stats
  const career = {
    passing: { attempts: 0, completions: 0, yards: 0, tds: 0, ints: 0, sacks: 0 },
    rushing: { attempts: 0, yards: 0, tds: 0, fumbles: 0 },
    receiving: { receptions: 0, yards: 0, tds: 0, targets: 0 },
    defense: { tackles: 0, sacks: 0, ints: 0, passesDefended: 0, tfl: 0 },
    kicking: { fgMade: 0, fgAttempts: 0, xpMade: 0, xpAttempts: 0 },
    gamesPlayed: 0
  };

  // Helper to accumulate
  const add = (source) => {
      if (!source) return;

      // Generic accumulation
      career.gamesPlayed += (source.gamesPlayed || 0);

      // Passing
      career.passing.attempts += (source.passAtt || 0);
      career.passing.completions += (source.passComp || 0);
      career.passing.yards += (source.passYd || 0);
      career.passing.tds += (source.passTD || 0);
      career.passing.ints += (source.interceptions || 0);

      // Rushing
      career.rushing.attempts += (source.rushAtt || 0);
      career.rushing.yards += (source.rushYd || 0);
      career.rushing.tds += (source.rushTD || 0);
      career.rushing.fumbles += (source.fumbles || 0);

      // Receiving
      career.receiving.receptions += (source.receptions || 0);
      career.receiving.yards += (source.recYd || 0);
      career.receiving.tds += (source.recTD || 0);
      career.receiving.targets += (source.targets || 0);

      // Defense
      career.defense.tackles += (source.tackles || 0);
      career.defense.ints += (source.interceptions || 0);
      career.defense.passesDefended += (source.passesDefended || 0);
      career.defense.tfl += (source.tacklesForLoss || 0);

      // Kicking
      career.kicking.fgMade += (source.fgMade || 0);
      career.kicking.fgAttempts += (source.fgAttempts || 0);
      career.kicking.xpMade += (source.xpMade || 0);
      career.kicking.xpAttempts += (source.xpAttempts || 0);

      // Ambiguous Stats (Sacks)
      // If player is a defender, 'sacks' -> defense.sacks
      // If player is QB, 'sacks' -> passing.sacks (sacks taken)
      // Since 'source' is just numbers, we rely on the Player's position context,
      // but 'add' doesn't have it. We'll accumulate to both and let UI decide.
      // Or heuristic: if passAtt > 0, sacks taken. If tackles > 0, sacks made.

      if ((source.passAtt || 0) > 0) {
          career.passing.sacks += (source.sacks || 0);
      } else {
          career.defense.sacks += (source.sacks || 0);
      }
  };

  // 1. Add Past Seasons
  if (player.statsHistory && Array.isArray(player.statsHistory)) {
      player.statsHistory.forEach(season => add(season));
  }

  // 2. Add Current Season
  if (player.stats && player.stats.season) {
      add(player.stats.season);
  }

  return career;
};
