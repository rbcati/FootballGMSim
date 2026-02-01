/*
 * Game Simulator Module
 * Core game simulation logic extracted from simulation.js
 */

import { Utils } from './utils.js';
import { Constants } from './constants.js';
import { calculateGamePerformance, getCoachingMods } from './coach-system.js';
import { updateAdvancedStats, getZeroStats, updatePlayerGameLegacy } from './player.js';
import { getStrategyModifiers } from './strategy.js';
import { saveState } from './state.js';

/**
 * Helper to group players by position and sort by OVR descending.
 * @param {Array} roster - Team roster array
 * @returns {Object} Map of position -> sorted array of players
 */
export function groupPlayersByPosition(roster) {
  const groups = {};
  if (!roster) return groups;
  for (const player of roster) {
    const pos = player.pos || 'UNK';
    if (!groups[pos]) groups[pos] = [];
    groups[pos].push(player);
  }
  // Sort by OVR descending
  for (const pos in groups) {
    groups[pos].sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
  }
  return groups;
}

/**
 * Initialize player stats structure if it doesn't exist
 * @param {Object} player - Player object
 */
export function initializePlayerStats(player) {
  if (!player.stats) {
    player.stats = {
      game: getZeroStats ? getZeroStats() : {},
      season: getZeroStats ? getZeroStats() : {},
      career: getZeroStats ? getZeroStats() : {}
    };
  }
  if (!player.stats.game) player.stats.game = getZeroStats ? getZeroStats() : {};

  // Initialize season stats if missing or empty
  if (!player.stats.season || Object.keys(player.stats.season).length === 0) {
    player.stats.season = getZeroStats ? getZeroStats() : {};
  }

  // Initialize career stats if missing
  if (!player.stats.career) {
    player.stats.career = getZeroStats ? getZeroStats() : {};
  }
}

/**
 * Calculate how many weeks a player has been with the team
 */
function calculateWeeksWithTeam(player, team) {
  if (player.history && player.history.length > 0) {
    const teamHistory = player.history.filter(h => h.team === team.abbr);
    return teamHistory.length * 17;
  }
  return 17;
}

/**
 * Helper to update team standings in the global state (Setter Pattern).
 * Ensures we are modifying the persistent source of truth.
 * @param {number} teamId - The team ID to update.
 * @param {object} stats - The stats to add/update { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 }.
 */
export function updateTeamStandings(teamId, stats) {
    // 1. Resolve Team Object
    let team = null;

    // Primary Source: Global State
    if (typeof window !== 'undefined' && window.state?.league?.teams) {
        team = window.state.league.teams.find(t => t.id === teamId);
    }

    // Return null if we can't find the persistent record
    if (!team) {
        return null;
    }

    // 2. Apply Updates (incrementing existing values)
    if (stats.wins) team.wins = (team.wins || 0) + stats.wins;
    if (stats.losses) team.losses = (team.losses || 0) + stats.losses;
    if (stats.ties) team.ties = (team.ties || 0) + stats.ties;

    // Points are cumulative
    if (stats.pf) {
        team.ptsFor = (team.ptsFor || 0) + stats.pf;
        team.pointsFor = team.ptsFor; // Alias
    }
    if (stats.pa) {
        team.ptsAgainst = (team.ptsAgainst || 0) + stats.pa;
        team.pointsAgainst = team.ptsAgainst; // Alias
    }

    // Ensure draws property is updated if used
    if (stats.draws) {
        team.draws = (team.draws || 0) + stats.draws;
    } else if (stats.ties) {
        team.draws = (team.draws || 0) + stats.ties;
    }

    // 3. Sync Legacy Record Object
    if (!team.record) team.record = { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
    team.record.w = team.wins;
    team.record.l = team.losses;
    team.record.t = team.ties;
    team.record.pf = team.ptsFor;
    team.record.pa = team.ptsAgainst;

    return team;
}

/**
 * Applies the result of a simulated game to the teams' records.
 * @param {object} game - An object containing the home and away team objects.
 * @param {number} homeScore - The final score for the home team.
 * @param {number} awayScore - The final score for the away team.
 */
export function applyResult(game, homeScore, awayScore, options = {}) {
  const verbose = options.verbose === true;
  if (verbose) console.log(`[SIM-DEBUG] applyResult called for ${game?.home?.abbr} (${homeScore}) vs ${game?.away?.abbr} (${awayScore})`);

  if (!game || typeof game !== 'object') return;

  const home = game.home;
  const away = game.away;
  if (!home || !away) {
      console.error('[SIM-DEBUG] applyResult: Invalid home or away team objects', { home: !!home, away: !!away });
      return;
  }

  // Mark game as played on the schedule object passed in
  if (game.hasOwnProperty('played')) {
    game.homeScore = homeScore;
    game.awayScore = awayScore;
    game.played = true;
  }

  // Calculate results
  const homeStats = { wins: 0, losses: 0, ties: 0, pf: homeScore, pa: awayScore };
  const awayStats = { wins: 0, losses: 0, ties: 0, pf: awayScore, pa: homeScore };

  if (homeScore > awayScore) {
    homeStats.wins = 1;
    awayStats.losses = 1;
  } else if (awayScore > homeScore) {
    awayStats.wins = 1;
    homeStats.losses = 1;
  } else {
    homeStats.ties = 1;
    awayStats.ties = 1;
  }

  // UPDATE HEAD-TO-HEAD STATS
  const updateHeadToHead = (team, oppId, stats, win, loss, tie) => {
      if (!team.headToHead) team.headToHead = {};
      if (!team.headToHead[oppId]) {
          team.headToHead[oppId] = { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, streak: 0 };
      }
      const h2h = team.headToHead[oppId];
      h2h.pf += stats.pf;
      h2h.pa += stats.pa;

      if (win) {
          h2h.wins++;
          if (h2h.streak > 0) h2h.streak++;
          else h2h.streak = 1;
      } else if (loss) {
          h2h.losses++;
          if (h2h.streak < 0) h2h.streak--;
          else h2h.streak = -1;
      } else {
          h2h.ties++;
          h2h.streak = 0; // Reset streak on tie
      }
  };

  updateHeadToHead(home, away.id, homeStats, homeStats.wins > 0, homeStats.losses > 0, homeStats.ties > 0);
  updateHeadToHead(away, home.id, awayStats, awayStats.wins > 0, awayStats.losses > 0, awayStats.ties > 0);

  // UPDATE STATE via Setter
  if (verbose) console.log(`[SIM-DEBUG] Updating standings: Home +${JSON.stringify(homeStats)}, Away +${JSON.stringify(awayStats)}`);

  const updatedHome = updateTeamStandings(home.id, homeStats);
  const updatedAway = updateTeamStandings(away.id, awayStats);

  if (verbose && updatedHome) console.log(`[SIM-DEBUG] Home Updated Record: ${updatedHome.wins}-${updatedHome.losses}-${updatedHome.ties}`);
  if (verbose && updatedAway) console.log(`[SIM-DEBUG] Away Updated Record: ${updatedAway.wins}-${updatedAway.losses}-${updatedAway.ties}`);

  // Sync back to passed objects (home/away) if they were different (e.g. copies or not the global ref)
  const syncObject = (target, source, stats) => {
      // If we have a source (updated global state), use it
      if (source) {
          if (target !== source) {
             target.wins = source.wins;
             target.losses = source.losses;
             target.ties = source.ties;
             target.ptsFor = source.ptsFor;
             target.ptsAgainst = source.ptsAgainst;
             target.pointsFor = source.pointsFor;
             target.pointsAgainst = source.pointsAgainst;

             if (!target.record) target.record = {};
             target.record.w = source.record.w;
             target.record.l = source.record.l;
             target.record.t = source.record.t;
             target.record.pf = source.record.pf;
             target.record.pa = source.record.pa;
          }
      } else {
          // Fallback: Manually update target if global update failed (e.g. testing)
          target.wins = (target.wins || 0) + stats.wins;
          target.losses = (target.losses || 0) + stats.losses;
          target.ties = (target.ties || 0) + stats.ties;
          target.ptsFor = (target.ptsFor || 0) + stats.pf;
          target.ptsAgainst = (target.ptsAgainst || 0) + stats.pa;
          target.pointsFor = target.ptsFor;
          target.pointsAgainst = target.ptsAgainst;

          if (!target.record) target.record = { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
          target.record.w = target.wins;
          target.record.l = target.losses;
          target.record.t = target.ties;
          target.record.pf = target.ptsFor;
          target.record.pa = target.ptsAgainst;
      }
  };

  syncObject(home, updatedHome, homeStats);
  syncObject(away, updatedAway, awayStats);
}

/**
 * Updates rivalry scores between two teams based on the game result.
 * @param {object} home - Home team object
 * @param {object} away - Away team object
 * @param {number} homeScore - Home score
 * @param {number} awayScore - Away score
 * @param {boolean} isPlayoff - Whether this is a playoff game
 */
function updateRivalries(home, away, homeScore, awayScore, isPlayoff) {
  if (!home || !away) return;

  // Ensure rivalry objects exist
  if (!home.rivalries) home.rivalries = {};
  if (!away.rivalries) away.rivalries = {};

  // Initialize specific opponent rivalry if missing
  if (!home.rivalries[away.id]) home.rivalries[away.id] = { score: 0, events: [] };
  if (!away.rivalries[home.id]) away.rivalries[home.id] = { score: 0, events: [] };

  const homeRiv = home.rivalries[away.id];
  const awayRiv = away.rivalries[home.id];

  const diff = Math.abs(homeScore - awayScore);
  const homeWon = homeScore > awayScore;
  let points = 0;
  let event = null;

  // 1. Division Rivalry (Regular Season Only)
  if (!isPlayoff && home.conf === away.conf && home.div === away.div) {
    points += 5;
  }

  // 2. Playoff Intensity
  if (isPlayoff) {
    points += 25;
    if (homeWon) {
      // Loser gets a massive grudge
      awayRiv.score += 40;
      awayRiv.events.unshift(`Eliminated by ${home.abbr} in Playoffs`);
      // Winner gets some rivalry points too (competitive respect/animosity)
      homeRiv.score += 15;
    } else {
      homeRiv.score += 40;
      homeRiv.events.unshift(`Eliminated by ${away.abbr} in Playoffs`);
      awayRiv.score += 15;
    }
    // Return early or continue? Continue to add close game points etc.
  }

  // 3. Close Game
  if (diff < 8) {
    points += 5;
  }

  // 4. Blowout (Embarrassment)
  if (diff > 24) {
    points += 5;
    if (homeWon) {
      awayRiv.score += 10; // Loser hates the winner more
    } else {
      homeRiv.score += 10;
    }
  }

  // Apply general points
  homeRiv.score += points;
  awayRiv.score += points;

  // Cap scores (optional, but good for sanity)
  if (homeRiv.score > 100) homeRiv.score = 100;
  if (awayRiv.score > 100) awayRiv.score = 100;

  // Trim events
  if (homeRiv.events.length > 3) homeRiv.events.length = 3;
  if (awayRiv.events.length > 3) awayRiv.events.length = 3;
}

/**
 * Generates post-game callbacks based on pre-game context and actual stats.
 * @param {Object} context - Pre-game context { matchup, offPlanId, defPlanId, riskId, stakes, userIsHome }
 * @param {Object} stats - Game stats object { home: {players: ...}, away: {players: ...} }
 * @param {number} homeScore
 * @param {number} awayScore
 * @returns {Array} Array of callback strings
 */
export function generatePostGameCallbacks(context, stats, homeScore, awayScore) {
    if (!context) return [];
    const callbacks = [];
    const { matchup, offPlanId, defPlanId, riskId, stakes, userIsHome } = context;

    // Use safe access for stats
    const userStats = userIsHome ? stats.home : stats.away;
    const oppStats = userIsHome ? stats.away : stats.home;
    const userScore = userIsHome ? homeScore : awayScore;
    const oppScore = userIsHome ? awayScore : homeScore;
    const won = userScore > oppScore;

    // Helper to sum stats
    const sumStat = (teamStats, statName) => {
        if (!teamStats || !teamStats.players) return 0;
        return Object.values(teamStats.players).reduce((sum, p) => sum + (p.stats[statName] || 0), 0);
    };

    // Helper to check for big plays (simplistic check on longest)
    const hasBigPlay = (teamStats) => {
        if (!teamStats || !teamStats.players) return false;
        return Object.values(teamStats.players).some(p => (p.stats.longestPass > 45) || (p.stats.longestRun > 35));
    };

    const userRushYds = sumStat(userStats, 'rushYd');
    const userPassYds = sumStat(userStats, 'passYd');
    const userTurnovers = sumStat(userStats, 'interceptions') + sumStat(userStats, 'fumbles');
    const userSacks = sumStat(userStats, 'sacksAllowed'); // allowed by offense
    const userDefSacks = sumStat(userStats, 'sacks'); // made by defense
    const userBigPlays = hasBigPlay(userStats);

    const oppRushYds = sumStat(oppStats, 'rushYd');
    const oppPassYds = sumStat(oppStats, 'passYd');

    // 1. Matchup Callbacks
    if (matchup) {
        if (matchup.toLowerCase().includes("passing") && userPassYds > 275) {
            callbacks.push("Your passing attack exploited the matchup as expected.");
        } else if (matchup.toLowerCase().includes("passing") && userPassYds < 175) {
            callbacks.push("Despite a favorable matchup, the passing game stalled.");
        } else if (matchup.toLowerCase().includes("rushing") && userRushYds > 160) {
            callbacks.push("Ground game dominated their weak run defense.");
        } else if (matchup.toLowerCase().includes("rushing") && userRushYds < 60) {
            callbacks.push("Run game failed to gain traction despite the advantage.");
        }
    }

    // 2. Strategy Callbacks
    if (offPlanId === 'AGGRESSIVE_PASSING') {
        if (userPassYds > 300) callbacks.push("Aggressive passing strategy led to huge yardage.");
        else if (userTurnovers >= 3) callbacks.push("Aggressive air attack resulted in costly turnovers.");
    } else if (offPlanId === 'BALL_CONTROL') {
        if (userRushYds > 150 && won) callbacks.push("Ball control strategy wore them down perfectly.");
        else if (userScore < 14) callbacks.push("Conservative offense failed to generate points.");
    } else if (offPlanId === 'PROTECT_QB') {
        if (userSacks === 0) callbacks.push("Protection schemes kept the QB clean all day.");
        else if (userSacks >= 4) callbacks.push("Protection broke down despite the focus on safety.");
    } else if (offPlanId === 'FEED_STAR') {
        // Hard to check star without ID, but assume high usage if stats are skewed?
        // Skip for now to keep simple
    }

    if (defPlanId === 'BLITZ_HEAVY') {
        if (userDefSacks >= 4) callbacks.push("Blitz packages overwhelmed their line.");
        else if (oppScore > 28) callbacks.push("Heavy blitzing left the secondary exposed.");
    } else if (defPlanId === 'SELL_OUT_RUN') {
        if (oppPassYds > 280) callbacks.push("Selling out vs run left passing lanes wide open.");
        else if (oppRushYds < 60) callbacks.push("Run defense completely shut them down.");
    } else if (defPlanId === 'DISGUISE_COVERAGE') {
        const oppInts = sumStat(oppStats, 'interceptions');
        if (oppInts >= 2) callbacks.push("Confusing looks forced multiple turnovers.");
        else if (oppPassYds > 280) callbacks.push("Complex coverage schemes were picked apart.");
    }

    // 3. Risk Profile Callbacks
    if (riskId === 'AGGRESSIVE') {
        if (userBigPlays && won) callbacks.push("High-risk approach sparked explosive plays.");
        else if (userTurnovers >= 3) callbacks.push("Gambling on big plays backfired with turnovers.");
    } else if (riskId === 'CONSERVATIVE') {
        if (won && userTurnovers === 0) callbacks.push("Mistake-free football secured the win.");
        else if (!won && userScore < 17) callbacks.push("Conservative play limited comeback chances.");
    }

    // 4. Stakes Callbacks
    if (stakes && stakes > 50) {
        if (won) callbacks.push("Clutch performance in a high-stakes rivalry game.");
        else callbacks.push("Crushing defeat to a bitter rival.");
    }

    // Limit to 3 unique lines
    return [...new Set(callbacks)].slice(0, 3);
}

// --- STAT GENERATION HELPERS ---

function generateQBStats(qb, teamScore, oppScore, defenseStrength, U, modifiers = {}) {
  const ratings = qb.ratings || {};
  const throwPower = ratings.throwPower || 70;
  const throwAccuracy = ratings.throwAccuracy || 70;
  const awareness = ratings.awareness || 70;

  // Realistic Game Script Logic
  // Baseline attempts ~34. Increase if trailing, decrease if leading.
  const scoreDiff = oppScore - teamScore; // Positive if trailing
  const scriptMod = Math.max(-15, Math.min(15, scoreDiff * 0.6));

  let baseAttempts = 34 + scriptMod + U.rand(-5, 5);

  // Apply modifier
  if (modifiers.passVolume) baseAttempts *= modifiers.passVolume;

  const attempts = Math.max(15, Math.min(65, Math.round(baseAttempts)));

  let baseCompPct = (throwAccuracy + awareness) / 2;

  // Apply modifier
  if (modifiers.passAccuracy) baseCompPct *= modifiers.passAccuracy;

  const defenseFactor = 100 - (defenseStrength || 70);
  // Tuned for ~64% average
  const compPct = Math.max(45, Math.min(85, 58 + (baseCompPct - 70) * 0.5 + (defenseFactor - 50) * 0.3));
  const completions = Math.round(attempts * (compPct / 100));

  // Renamed to YardsPerComp for clarity, and reduced TeamScore impact
  // Target ~11.0 YPCmp
  const avgYardsPerComp = 6 + (throwPower / 25) + (teamScore / 20);
  const yards = Math.round(completions * avgYardsPerComp + U.rand(-30, 60));

  const redZoneEfficiency = (awareness + throwAccuracy) / 200;
  const touchdowns = Math.max(0, Math.min(6, Math.round(teamScore / 7 + redZoneEfficiency * 2 + U.rand(-1, 2))));

  const intRate = Math.max(0, (100 - throwAccuracy) / 100 + (defenseStrength / 200));
  const interceptions = Math.max(0, Math.min(5, Math.round(attempts * intRate * 0.03 + U.rand(-0.5, 1.5))));

  const sacks = Math.max(0, Math.min(8, Math.round((100 - awareness) / 25 + U.rand(-1, 2))));

  const longestPass = Math.max(10, Math.round(yards / Math.max(1, completions) * U.rand(1.2, 2.5)));

  return {
    passAtt: attempts,
    passComp: completions,
    passYd: Math.max(0, yards),
    passTD: touchdowns,
    interceptions: interceptions,
    sacks: sacks,
    dropbacks: attempts + sacks,
    longestPass: longestPass,
    completionPct: Math.round((completions / Math.max(1, attempts)) * 1000) / 10
  };
}

function generateRBStats(rb, teamScore, oppScore, defenseStrength, U, modifiers = {}, share = 1.0) {
  const ratings = rb.ratings || {};
  const speed = ratings.speed || 70;
  const trucking = ratings.trucking || 70;
  const juking = ratings.juking || 70;
  const catching = ratings.catching || 50;

  // Realistic Game Script Logic
  // Baseline ~26 team carries. Increase if leading, decrease if trailing.
  const scoreDiff = teamScore - oppScore; // Positive if leading
  const scriptMod = Math.max(-10, Math.min(12, scoreDiff * 0.4));

  let baseTeamCarries = 26 + scriptMod + U.rand(-5, 8);

  if (modifiers.runVolume) baseTeamCarries *= modifiers.runVolume;

  // Apply share and bounds
  let carries = Math.round(baseTeamCarries * share);
  carries = Math.max(2, Math.min(35, carries));

  // Reduced base YPC to ~4.2 average
  const baseYPC = 2.5 + (speed + trucking + juking) / 225;
  const defenseFactor = (100 - (defenseStrength || 70)) / 50;
  const yardsPerCarry = Math.max(2.0, Math.min(8.0, baseYPC + defenseFactor + U.rand(-0.5, 0.5)));
  const rushYd = Math.round(carries * yardsPerCarry + U.rand(-10, 20));

  const touchdowns = Math.max(0, Math.min(4, Math.round(teamScore / 7 * 0.6 + U.rand(-0.5, 1.5))));

  const fumbles = Math.max(0, Math.min(2, Math.round((100 - (ratings.awareness || 70)) / 150 + U.rand(-0.3, 0.5))));

  const longestRun = Math.max(5, Math.round(rushYd / Math.max(1, carries) * U.rand(1.5, 3.5)));

  const targets = Math.max(0, Math.min(8, Math.round((catching / 20) + U.rand(0, 3))));
  const receptions = Math.max(0, Math.min(targets, Math.round(targets * (catching / 100) + U.rand(-1, 1))));
  const recYd = Math.max(0, Math.round(receptions * (5 + speed / 20) + U.rand(-5, 15)));
  const recTD = receptions > 0 && U.rand(1, 100) < 15 ? 1 : 0;
  const drops = Math.max(0, targets - receptions);
  const yardsAfterCatch = Math.max(0, Math.round(recYd * 0.4 + U.rand(-5, 10)));

  const routesRun = Math.round(targets * 3 + U.rand(5, 15));
  const separationChance = (ratings.agility || 70) / 150;
  const targetsWithSeparation = Math.round(targets * separationChance);

  return {
    rushAtt: carries,
    rushYd: Math.max(0, rushYd),
    rushTD: touchdowns,
    longestRun: longestRun,
    yardsPerCarry: Math.round((rushYd / Math.max(1, carries)) * 10) / 10,
    fumbles: fumbles,
    targets: targets,
    receptions: receptions,
    recYd: recYd,
    recTD: recTD,
    drops: drops,
    yardsAfterCatch: yardsAfterCatch,
    longestCatch: receptions > 0 ? Math.max(5, Math.round(recYd / receptions * U.rand(1.2, 2.5))) : 0,
    routesRun: routesRun,
    targetsWithSeparation: targetsWithSeparation
  };
}

function distributePassingTargets(receivers, totalTargets, U) {
  if (!receivers || receivers.length === 0) return [];

  const weights = receivers.map(r => {
      const ratings = r.ratings || {};
      return (r.ovr * 0.5) + ((ratings.awareness || 50) * 0.3) + ((ratings.speed || 50) * 0.2);
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

  return receivers.map((r, i) => {
      const playerShare = weights[i] / totalWeight;
      const playerTargets = Math.round(totalTargets * playerShare);
      return { player: r, targets: playerTargets };
  });
}

function generateReceiverStats(receiver, targetCount, teamScore, defenseStrength, U) {
  const ratings = receiver.ratings || {};
  const catching = ratings.catching || 70;
  const catchInTraffic = ratings.catchInTraffic || 70;
  const speed = ratings.speed || 70;

  const targets = targetCount;

  const catchRate = (catching + catchInTraffic) / 2;
  const defenseFactor = (100 - (defenseStrength || 70)) / 100;
  // Lowered catch rate to realistic ~60%
  const receptionPct = Math.max(40, Math.min(90, catchRate - 15 + defenseFactor * 20));
  const receptions = Math.max(0, Math.min(targets, Math.round(targets * (receptionPct / 100) + U.rand(-1, 1))));

  // Adjusted YPC to match QB output ~11.0
  const avgYardsPerCatch = 7 + (speed / 18);
  const recYd = Math.round(receptions * avgYardsPerCatch + U.rand(-20, 50));

  const recTD = Math.max(0, Math.min(3, Math.round((receptions / 5) * (teamScore / 14) + U.rand(-0.5, 1.5))));

  const dropRate = Math.max(0, (100 - catching) / 200);
  const drops = Math.max(0, Math.min(targets - receptions, Math.round(targets * dropRate + U.rand(-0.5, 1.5))));

  const yardsAfterCatch = Math.max(0, Math.round(recYd * (0.3 + speed / 200) + U.rand(-10, 20)));

  const longestCatch = receptions > 0 ? Math.max(10, Math.round(recYd / receptions * U.rand(1.5, 3.5))) : 0;

  const routesRun = Math.round(targets * 4 + U.rand(10, 20));
  const separationChance = ((ratings.agility || 70) + (ratings.speed || 70)) / 250;
  const targetsWithSeparation = Math.round(targets * separationChance);

  return {
    targets: targets,
    receptions: receptions,
    recYd: recYd,
    recTD: recTD,
    drops: drops,
    yardsAfterCatch: yardsAfterCatch,
    longestCatch: longestCatch,
    routesRun: routesRun,
    targetsWithSeparation: targetsWithSeparation
  };
}

function generateDBStats(db, offenseStrength, U, modifiers = {}) {
  const ratings = db.ratings || {};
  const coverage = ratings.coverage || 70;
  const speed = ratings.speed || 70;
  const awareness = ratings.awareness || 70;

  const coverageRating = Math.round((coverage + speed + awareness) / 3 + U.rand(-5, 5));

  const baseTackles = db.pos === 'S' ? 6 : 4;
  const tackles = Math.max(0, Math.min(15, Math.round(baseTackles + (100 - coverage) / 30 + U.rand(-1, 3))));

  let intChance = (coverage + awareness) / 200;
  if (modifiers.intChance) intChance *= modifiers.intChance;

  const interceptions = Math.max(0, Math.min(3, Math.round(intChance * 2 + U.rand(-0.5, 1.5))));

  const passesDefended = Math.max(0, Math.min(5, Math.round((coverage / 30) + U.rand(-0.5, 1.5))));

  const targetsAllowed = Math.round(5 + (100 - coverage) / 10 + U.rand(-1, 2));
  const completionPctAllowed = Math.max(0.4, (100 - coverage) / 100);
  const completionsAllowed = Math.round(targetsAllowed * completionPctAllowed);
  const yardsAllowed = Math.round(completionsAllowed * (10 + (100 - speed)/10));
  const tdsAllowed = U.rand(0, 100) < (100 - coverage) ? 1 : 0;

  return {
    coverageRating: Math.max(0, Math.min(100, coverageRating)),
    tackles: tackles,
    interceptions: interceptions,
    passesDefended: passesDefended,
    targetsAllowed: targetsAllowed,
    completionsAllowed: completionsAllowed,
    yardsAllowed: yardsAllowed,
    tdsAllowed: tdsAllowed
  };
}

function generateDLStats(defender, offenseStrength, U, modifiers = {}) {
  const ratings = defender.ratings || {};
  const passRushPower = ratings.passRushPower || 70;
  const passRushSpeed = ratings.passRushSpeed || 70;
  const runStop = ratings.runStop || 70;
  const awareness = ratings.awareness || 70;

  const pressureRating = Math.round((passRushPower + passRushSpeed + awareness) / 3 + U.rand(-5, 5));

  let sackChance = (passRushPower + passRushSpeed) / 200;
  if (modifiers.sackChance) sackChance *= modifiers.sackChance;

  const sacks = Math.max(0, Math.min(4, Math.round(sackChance * 3 + U.rand(-0.5, 1.5))));

  const baseTackles = defender.pos === 'LB' ? 8 : 5;
  const tackles = Math.max(0, Math.min(15, Math.round(baseTackles + (runStop / 20) + U.rand(-1, 3))));

  const tacklesForLoss = Math.max(0, Math.min(3, Math.round((runStop / 50) + U.rand(-0.5, 1.5))));

  const forcedFumbles = Math.max(0, Math.min(2, Math.round((passRushPower / 100) + U.rand(-0.3, 0.5))));

  const passRushSnaps = Math.round(20 + (passRushPower + passRushSpeed)/5);
  const pressureChance = (passRushPower + passRushSpeed) / 300;
  const pressures = Math.round(passRushSnaps * pressureChance);

  return {
    pressureRating: Math.max(0, Math.min(100, pressureRating)),
    sacks: sacks,
    tackles: tackles,
    tacklesForLoss: tacklesForLoss,
    forcedFumbles: forcedFumbles,
    passRushSnaps: passRushSnaps,
    pressures: pressures
  };
}

function generateOLStats(ol, defenseStrength, U) {
  const ratings = ol.ratings || {};
  const passBlock = ratings.passBlock || 70;
  const runBlock = ratings.runBlock || 70;
  const awareness = ratings.awareness || 70;

  const sackChance = (100 - passBlock) / 200 + (defenseStrength / 300);
  const sacksAllowed = Math.max(0, Math.min(3, Math.round(sackChance * 2 + U.rand(-0.5, 1.5))));

  const tflAllowed = Math.max(0, Math.min(2, Math.round((100 - runBlock) / 100 + U.rand(-0.3, 0.5))));

  const protectionGrade = Math.round((passBlock + runBlock + awareness) / 3 + U.rand(-5, 5));

  return {
    sacksAllowed: sacksAllowed,
    tacklesForLossAllowed: tflAllowed,
    protectionGrade: Math.max(0, Math.min(100, protectionGrade))
  };
}

function generateKickerStats(kicker, teamScore, U) {
  const ratings = kicker.ratings || {};
  const kickPower = ratings.kickPower || 70;
  const kickAccuracy = ratings.kickAccuracy || 70;

  const fgAttempts = Math.max(0, Math.min(5, Math.round(teamScore / 7 + U.rand(-1, 2))));

  const makeRate = kickAccuracy / 100;
  const fgMade = Math.max(0, Math.min(fgAttempts, Math.round(fgAttempts * makeRate + U.rand(-0.5, 0.5))));

  const longestFG = Math.max(20, Math.min(65, Math.round(30 + (kickPower / 2) + U.rand(-5, 10))));

  const xpAttempts = Math.max(0, Math.round(teamScore / 7));
  const xpMade = Math.max(0, Math.min(xpAttempts, Math.round(xpAttempts * (kickAccuracy / 100) + U.rand(-0.3, 0.3))));

  const successPct = fgAttempts > 0 ? Math.round((fgMade / fgAttempts) * 1000) / 10 : 0;

  const avgKickYards = Math.round(60 + (kickPower / 3) + U.rand(-5, 5));

  return {
    fgAttempts: fgAttempts,
    fgMade: fgMade,
    fgMissed: fgAttempts - fgMade,
    longestFG: longestFG,
    xpAttempts: xpAttempts,
    xpMade: xpMade,
    xpMissed: xpAttempts - xpMade,
    successPct: successPct,
    avgKickYards: avgKickYards
  };
}

function generatePunterStats(punter, teamScore, U) {
  const ratings = punter.ratings || {};
  const kickPower = ratings.kickPower || 70;

  const punts = Math.max(0, Math.min(8, Math.round((28 - teamScore) / 4 + U.rand(-1, 2))));

  const avgPuntYards = Math.round(40 + (kickPower / 3) + U.rand(-5, 5));
  const totalPuntYards = punts * avgPuntYards;

  const longestPunt = Math.max(30, Math.min(70, Math.round(avgPuntYards * U.rand(1.2, 1.8))));

  return {
    punts: punts,
    puntYards: totalPuntYards,
    avgPuntYards: punts > 0 ? Math.round((totalPuntYards / punts) * 10) / 10 : 0,
    longestPunt: longestPunt
  };
}

// --- MAIN SIMULATION LOGIC ---

/**
 * Simulates game statistics for a single game between two teams.
 * @param {object} home - The home team object.
 * @param {object} away - The away team object.
 * @returns {object|null} An object with homeScore and awayScore, or null if error.
 */
/**
 * Simulates game statistics for a single game between two teams.
 * Alias: simulateMatchup
 * @param {object} home - The home team object.
 * @param {object} away - The away team object.
 * @returns {object|null} An object with homeScore and awayScore, or null if error.
 */
export function simulateMatchup(home, away, options = {}) {
  return simGameStats(home, away, options);
}

export function simGameStats(home, away, options = {}) {
  const verbose = options.verbose === true;
  try {
    if (verbose) console.log(`[SIM-DEBUG] simGameStats called for ${home?.abbr} vs ${away?.abbr}`);

    // Enhanced dependency resolution with fallbacks
    const C_OBJ = Constants || (typeof window !== 'undefined' ? window.Constants : null);
    const U = Utils || (typeof window !== 'undefined' ? window.Utils : null);

    if (!C_OBJ?.SIMULATION || !U) {
      console.error('[SIM-DEBUG] Missing simulation dependencies:', {
          ConstantsLoaded: !!C_OBJ,
          SimulationConfig: !!C_OBJ?.SIMULATION,
          Utils: !!U
      });
      return null;
    }

    const C = C_OBJ.SIMULATION;

    if (!home?.roster || !away?.roster || !Array.isArray(home.roster) || !Array.isArray(away.roster)) {
      console.error('[SIM-DEBUG] Invalid team roster data');
      return null;
    }

    // --- OPTIMIZATION & INJURY INTEGRATION ---
    const getActiveRoster = (team) => {
      if (!team.roster) return [];
      if (typeof window.canPlayerPlay === 'function') {
        return team.roster.filter(p => window.canPlayerPlay(p));
      }
      return team.roster;
    };

    const homeActive = getActiveRoster(home);
    const awayActive = getActiveRoster(away);

    const homeGroups = groupPlayersByPosition(homeActive);
    const awayGroups = groupPlayersByPosition(awayActive);

    const calculateStrength = (activeRoster, team) => {
      if (!activeRoster || !activeRoster.length) return 50;

      return activeRoster.reduce((acc, p) => {
        const tenureYears = calculateWeeksWithTeam(p, team) / 17;

        let rating = p.ovr || 50;
        if (typeof window.getEffectiveRating === 'function') {
          rating = window.getEffectiveRating(p);
        }

        const proxyPlayer = { ...p, ovr: rating, ratings: { overall: rating } };
        const effectivePerf = calculateGamePerformance(proxyPlayer, tenureYears);

        return acc + effectivePerf;
      }, 0) / activeRoster.length;
    };

    let homeStrength = calculateStrength(homeActive, home);
    let awayStrength = calculateStrength(awayActive, away);

    if (verbose) console.log(`[SIM-DEBUG] Strength Calculated: ${home.abbr}=${homeStrength.toFixed(1)}, ${away.abbr}=${awayStrength.toFixed(1)}`);

    const calculateDefenseStrength = (groups) => {
      const defensivePositions = ['DL', 'LB', 'CB', 'S'];
      let totalRating = 0;
      let count = 0;

      defensivePositions.forEach(pos => {
        const players = groups[pos] || [];
        players.forEach(p => {
            const r = typeof window.getEffectiveRating === 'function' ? window.getEffectiveRating(p) : (p.ovr || 50);
            totalRating += r;
            count++;
        });
      });

      if (count === 0) return 70;
      return totalRating / count;
    };

    const homeDefenseStrength = calculateDefenseStrength(awayGroups);
    const awayDefenseStrength = calculateDefenseStrength(homeGroups);

    // --- STAFF PERKS & STRATEGY INTEGRATION ---
    const homeMods = getCoachingMods(home.staff);
    const awayMods = getCoachingMods(away.staff);

    if (typeof window !== 'undefined' && window.state?.userTeamId !== undefined && window.state?.league?.weeklyGamePlan) {
        const history = window.state.league.strategyHistory || {};
        if (home.id === window.state.userTeamId) {
             const { offPlanId, defPlanId, riskId } = window.state.league.weeklyGamePlan;
             const stratMods = getStrategyModifiers(offPlanId, defPlanId, riskId, history);
             if (verbose) console.log(`[SIM-DEBUG] Applying Strategy Mods for User (Home):`, stratMods);
             Object.assign(homeMods, stratMods);
        } else if (away.id === window.state.userTeamId) {
             const { offPlanId, defPlanId, riskId } = window.state.league.weeklyGamePlan;
             const stratMods = getStrategyModifiers(offPlanId, defPlanId, riskId, history);
             if (verbose) console.log(`[SIM-DEBUG] Applying Strategy Mods for User (Away):`, stratMods);
             Object.assign(awayMods, stratMods);
        }
    }

    if (verbose) console.log(`[SIM-DEBUG] Mods Applied: Home=${JSON.stringify(homeMods)}, Away=${JSON.stringify(awayMods)}`);
    // --- SCHEME FIT IMPACT ---
    let schemeNote = null;

    // Check if scheme management is loaded
    if (typeof window !== 'undefined' && window.calculateTeamRatingWithSchemeFit) {
        const homeFit = window.calculateTeamRatingWithSchemeFit(home);
        const awayFit = window.calculateTeamRatingWithSchemeFit(away);

        // Get fit percentages (50 = neutral, 100 = perfect, 0 = terrible)
        const hOffFit = homeFit.offensiveSchemeFit || 50;
        const hDefFit = homeFit.defensiveSchemeFit || 50;
        const aOffFit = awayFit.offensiveSchemeFit || 50;
        const aDefFit = awayFit.defensiveSchemeFit || 50;

        // Calculate multipliers (0.9 to 1.1 range)
        // 100 fit = 1.1x, 0 fit = 0.9x
        const getMod = (fit) => 0.9 + ((fit / 100) * 0.2);

        const homeOffMod = getMod(hOffFit);
        const homeDefMod = getMod(hDefFit);
        const awayOffMod = getMod(aOffFit);
        const awayDefMod = getMod(aDefFit);

        // Apply to strengths (Assuming strength is roughly 0-100)
        // Adjust home/away strength based on their aggregate fit
        // Weighted slightly towards offense for narrative clarity
        const homeFitBonus = ((homeOffMod + homeDefMod) / 2);
        const awayFitBonus = ((awayOffMod + awayDefMod) / 2);

        // Directly modify strength for score calculation
        homeStrength *= homeFitBonus;
        awayStrength *= awayFitBonus;

        // Check for major mismatch to generate narrative
        const homeTotalFit = hOffFit + hDefFit;
        const awayTotalFit = aOffFit + aDefFit;
        const diff = homeTotalFit - awayTotalFit;

        if (Math.abs(diff) >= 30) {
            const betterTeam = diff > 0 ? home.abbr : away.abbr;
            const worseTeam = diff > 0 ? away.abbr : home.abbr;
            schemeNote = `Scheme Advantage: ${betterTeam}'s roster fit perfectly with their systems, exploiting ${worseTeam}'s mismatches.`;
        } else if (hOffFit < 40) {
            schemeNote = `Scheme Issue: ${home.abbr} offense struggled due to poor roster fit.`;
        } else if (aOffFit < 40) {
            schemeNote = `Scheme Issue: ${away.abbr} offense struggled due to poor roster fit.`;
        }

        if (verbose) console.log(`[SIM-DEBUG] Scheme Mods: Home ${homeFitBonus.toFixed(2)}, Away ${awayFitBonus.toFixed(2)}`);
    }

    const HOME_ADVANTAGE = C.HOME_ADVANTAGE || 3;
    const BASE_SCORE_MIN = C.BASE_SCORE_MIN || 10;
    const BASE_SCORE_MAX = C.BASE_SCORE_MAX || 35;
    let SCORE_VARIANCE = C.SCORE_VARIANCE || 10;

    // Check Rivalry Context for Variance
    // Higher rivalry score = higher variance (more upsets, crazier games)
    if (home.rivalries && away.rivalries) {
        const homeRiv = home.rivalries[away.id]?.score || 0;
        const awayRiv = away.rivalries[home.id]?.score || 0;
        const intensity = Math.max(homeRiv, awayRiv);

        if (intensity > 50) {
             SCORE_VARIANCE += 10;
             if (verbose) console.log(`[SIM-DEBUG] Rivalry Game! Intensity: ${intensity}, Variance boosted.`);
        } else if (intensity > 25) {
             SCORE_VARIANCE += 5;
        }
    }

    // High Stakes Variance Boost
    if (options.stakes && options.stakes > 75) {
        SCORE_VARIANCE += 15;
        if (verbose) console.log(`[SIM-DEBUG] High Stakes Game! Stakes: ${options.stakes}, Variance boosted significantly.`);
    }

    const strengthDiff = (homeStrength - awayStrength) + HOME_ADVANTAGE;

    let homeScore = U.rand(BASE_SCORE_MIN, BASE_SCORE_MAX) + Math.round(strengthDiff / 5);
    let awayScore = U.rand(BASE_SCORE_MIN, BASE_SCORE_MAX) - Math.round(strengthDiff / 5);

    // Apply Variance from Mods
    const homeVar = SCORE_VARIANCE * (homeMods.variance || 1.0);
    const awayVar = SCORE_VARIANCE * (awayMods.variance || 1.0);

    homeScore += U.rand(0, homeVar);
    awayScore += U.rand(0, awayVar);

    homeScore = Math.max(0, homeScore);
    awayScore = Math.max(0, awayScore);

    // --- OVERTIME LOGIC ---
    // If tied at end of regulation, simulate OT
    if (homeScore === awayScore) {
        if (verbose) console.log(`[SIM-DEBUG] Regulation tied at ${homeScore}. Entering OT...`);
        const isPlayoff = options.isPlayoff === true;
        const allowTies = !isPlayoff && (typeof window !== 'undefined' ? window.state?.settings?.allowTies !== false : true); // Default allow ties in Reg Season

        let otPeriod = 1;
        let gameOver = false;
        // Simple possession loop model for OT
        // Coin toss: 0 = Home, 1 = Away
        let possession = Math.random() < 0.5 ? 'home' : 'away';

        // Track first possession score for modified sudden death
        let firstPossessionScore = 0; // 0=none, 3=FG, 7=TD
        let possessions = 0;

        const maxPossessions = allowTies ? 4 : 20; // Limit for reg season to avoid infinite loops, higher for playoffs

        while (!gameOver && possessions < maxPossessions) {
            possessions++;
            // Simulate a drive
            // Chance to score based on strength diff
            const offStrength = possession === 'home' ? homeStrength : awayStrength;
            const defStrength = possession === 'home' ? awayStrength : homeStrength;

            // Base score chance ~35% per drive
            const diff = offStrength - defStrength;
            const scoreChance = 0.35 + (diff / 200);

            let drivePoints = 0;
            if (U.rand(0, 100) / 100 < scoreChance) {
                // Scored! TD or FG?
                // TD Chance ~60% of scores
                if (U.rand(0, 100) < 60) {
                    drivePoints = 6 + (U.rand(0,100) < 95 ? 1 : 0); // TD + XP
                } else {
                    drivePoints = 3; // FG
                }
            }

            if (verbose) console.log(`[SIM-DEBUG] OT Drive ${possessions}: ${possession} scores ${drivePoints}`);

            // Apply NFL OT Rules
            if (possessions === 1) {
                if (drivePoints >= 6) {
                    // TD on first possession = Game Over
                    if (possession === 'home') homeScore += drivePoints;
                    else awayScore += drivePoints;
                    gameOver = true;
                } else if (drivePoints === 3) {
                    // FG on first possession = Other team gets a chance
                    if (possession === 'home') homeScore += drivePoints;
                    else awayScore += drivePoints;
                    firstPossessionScore = 3;
                }
            } else if (possessions === 2 && firstPossessionScore === 3) {
                // Second possession after a FG
                if (drivePoints >= 6) {
                    // TD beats FG -> Win
                    if (possession === 'home') homeScore += drivePoints;
                    else awayScore += drivePoints;
                    gameOver = true;
                } else if (drivePoints === 3) {
                    // FG ties FG -> Sudden Death continues
                    if (possession === 'home') homeScore += drivePoints;
                    else awayScore += drivePoints;
                    // Game continues to next possession as sudden death
                } else {
                    // No score -> Loss (First team wins)
                    gameOver = true;
                }
            } else {
                // Sudden Death (Possession 3+ OR Possession 2 if 1st was 0)
                if (drivePoints > 0) {
                    if (possession === 'home') homeScore += drivePoints;
                    else awayScore += drivePoints;
                    gameOver = true;
                }
            }

            // Switch possession
            possession = possession === 'home' ? 'away' : 'home';
        }

        if (verbose) console.log(`[SIM-DEBUG] OT Final: ${homeScore}-${awayScore}`);
    }

    if (verbose) console.log(`[SIM-DEBUG] Scores Generated: ${home.abbr} ${homeScore} - ${away.abbr} ${awayScore}`);

    const generateStatsForTeam = (team, score, oppScore, oppDefenseStrength, oppOffenseStrength, groups, mods) => {
       team.roster.forEach(player => {
        initializePlayerStats(player);
        player.stats.game = {};
      });

      const qbs = groups['QB'] || [];
      const qb = qbs.length > 0 ? qbs[0] : null;
      let totalPassAttempts = 30;

      if (qb) {
        // console.log(`[SIM-DEBUG] Generating stats for QB ${qb.name}`);
        const qbStats = generateQBStats(qb, score, oppScore, oppDefenseStrength, U, mods);
        if (score > oppScore) qbStats.wins = 1;
        else if (score < oppScore) qbStats.losses = 1;
        Object.assign(qb.stats.game, qbStats);
        totalPassAttempts = qbStats.passAtt || 30;
      }

      const rbs = (groups['RB'] || []).slice(0, 2);
      rbs.forEach((rb, index) => {
        const share = index === 0 ? 0.7 : 0.3;
        // Pass full scores for context, and explicit share parameter
        const rbStats = generateRBStats(rb, score, oppScore, oppDefenseStrength, U, mods, share);
        Object.assign(rb.stats.game, rbStats);
      });

      const wrs = (groups['WR'] || []).slice(0, 5);
      const tes = (groups['TE'] || []).slice(0, 2);
      const receiverTargetsPool = Math.round(totalPassAttempts * 0.85);
      const allReceivers = [...wrs, ...tes];
      const distributedTargets = distributePassingTargets(allReceivers, receiverTargetsPool, U);

      distributedTargets.forEach(item => {
        const wrStats = generateReceiverStats(item.player, item.targets, score, oppDefenseStrength, U);
        Object.assign(item.player.stats.game, wrStats);
      });

      const ols = (groups['OL'] || []).slice(0, 5);
      ols.forEach(ol => {
        Object.assign(ol.stats.game, generateOLStats(ol, oppDefenseStrength, U));
      });

      const dbs = [...(groups['CB'] || []), ...(groups['S'] || [])];
      dbs.forEach(db => {
         Object.assign(db.stats.game, generateDBStats(db, oppOffenseStrength, U, mods));
      });

      const defenders = [...(groups['DL'] || []), ...(groups['LB'] || [])];
      defenders.forEach(def => {
         Object.assign(def.stats.game, generateDLStats(def, oppOffenseStrength, U, mods));
      });

      const kickers = groups['K'] || [];
      if (kickers.length > 0) {
        Object.assign(kickers[0].stats.game, generateKickerStats(kickers[0], score, U));
      }

      const punters = groups['P'] || [];
      if (punters.length > 0) {
        Object.assign(punters[0].stats.game, generatePunterStats(punters[0], score, U));
      }
    };

    // Pass the mods to the team generation
    generateStatsForTeam(home, homeScore, awayScore, homeDefenseStrength, awayStrength, homeGroups, homeMods);
    generateStatsForTeam(away, awayScore, homeScore, awayDefenseStrength, homeStrength, awayGroups, awayMods);

    // Situational stats (unaffected by perks for now)
    const generateTeamStats = (team, score, strength, oppStrength) => {
        if (!team.stats) team.stats = { game: {}, season: {} };
        if (!team.stats.game) team.stats.game = {};

        const baseAttempts = 12 + U.rand(-2, 4);
        const conversionRate = 0.35 + (strength - oppStrength) / 200;
        const conversions = Math.round(baseAttempts * Math.max(0.1, Math.min(0.8, conversionRate)));

        const trips = Math.round(score / 6 + U.rand(0, 2));
        const redZoneTDs = Math.min(trips, Math.round(trips * (0.5 + (strength - oppStrength) / 200)));

        team.stats.game.thirdDownAttempts = baseAttempts;
        team.stats.game.thirdDownConversions = conversions;
        team.stats.game.redZoneTrips = trips;
        team.stats.game.redZoneTDs = redZoneTDs;
    };

    generateTeamStats(home, homeScore, homeStrength, awayStrength);
    generateTeamStats(away, awayScore, awayStrength, homeStrength);

    return { homeScore, awayScore, schemeNote };

  } catch (error) {
    console.error('[SIM-DEBUG] Error in simGameStats:', error);
    return null;
  }
}

/**
 * Accumulate game stats into a target stats object (season or career).
 * Ignores calculated fields like averages and percentages.
 * @param {Object} source - Source stats (e.g., game stats).
 * @param {Object} target - Target stats (e.g., season stats).
 */
export function accumulateStats(source, target) {
    if (!source || !target) return;

    Object.keys(source).forEach(key => {
        const value = source[key];
        if (typeof value === 'number') {
            // Ignore calculated fields
            if (key.includes('Pct') || key.includes('Grade') || key.includes('Rating') ||
                key === 'yardsPerCarry' || key === 'yardsPerReception' || key === 'avgPuntYards' ||
                key === 'avgKickYards' || key === 'completionPct') {
                return;
            }
            target[key] = (target[key] || 0) + value;
        }
    });
}

/**
 * Validates the league state after simulation.
 * @param {Object} league - The league object.
 * @returns {Object} { valid: boolean, errors: Array }
 */
export function validateLeagueState(league) {
    const errors = [];
    if (!league) return { valid: false, errors: ['No league object provided'] };

    // Check for finalized games with invalid scores
    if (league.resultsByWeek) {
        Object.entries(league.resultsByWeek).forEach(([week, results]) => {
            if (Array.isArray(results)) {
                results.forEach(game => {
                    if (game.scoreHome === 0 && game.scoreAway === 0 && !game.bye) {
                        // Warning only for now as tie logic exists, but ideally shouldn't happen often
                    }
                });
            }
        });
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Commits a game result to the authoritative league state.
 * REPLACES finalizeGameResult.
 * @param {object} league - The league object (must be the authoritative one).
 * @param {object} gameData - Contains { homeTeamId, awayTeamId, homeScore, awayScore, stats, isPlayoff, preGameContext }
 * @param {object} options - Options object { persist: boolean (default true) }
 * @returns {object} The created result object or throws error on failure.
 */
export function commitGameResult(league, gameData, options = { persist: true }) {
    // 0. strict Check Authority
    if (typeof window !== 'undefined' && window.state && window.state.league) {
        if (league !== window.state.league) {
            console.warn("[commitGameResult] League object passed is not strict equal to window.state.league. Using global authoritative state.");
            league = window.state.league;
        }
    }

    if (!league || !gameData) {
        throw new Error("Invalid arguments: league or gameData missing");
    }

    const { homeTeamId, awayTeamId, homeScore, awayScore, stats } = gameData;
    const home = league.teams.find(t => t && t.id === homeTeamId);
    const away = league.teams.find(t => t && t.id === awayTeamId);

    if (!home || !away) {
        throw new Error(`Teams not found: ${homeTeamId}, ${awayTeamId}`);
    }

    // 1. Update Schedule (Find the game)
    const weekIndex = (league.week || 1) - 1;
    const scheduleWeeks = league.schedule?.weeks || league.schedule || [];
    let scheduledGame = null;

    // Strategy 1: Look in current week (if structured with weeks)
    const weekSchedule = scheduleWeeks[weekIndex];
    if (weekSchedule && weekSchedule.games) {
        scheduledGame = weekSchedule.games.find(g =>
            (g.home === homeTeamId || g.home.id === homeTeamId) &&
            (g.away === awayTeamId || g.away.id === awayTeamId)
        );
    }

    // Strategy 2: Look in flat array (if schedule is flat array of games)
    if (!scheduledGame && Array.isArray(scheduleWeeks)) {
        scheduledGame = scheduleWeeks.find(g =>
            (g.week === league.week) &&
            (g.home === homeTeamId || g.home.id === homeTeamId) &&
            (g.away === awayTeamId || g.away.id === awayTeamId)
        );
    }

    // Strategy 3: Global search (fallback)
    if (!scheduledGame && league.schedule) {
        // Iterate all weeks if structure is nested
        if (league.schedule.weeks) {
            for (const w of league.schedule.weeks) {
                if (w.games) {
                    const g = w.games.find(g =>
                        (g.home === homeTeamId || g.home.id === homeTeamId) &&
                        (g.away === awayTeamId || g.away.id === awayTeamId)
                    );
                    if (g) {
                        scheduledGame = g;
                        break;
                    }
                }
            }
        } else if (Array.isArray(league.schedule)) {
             scheduledGame = league.schedule.find(g =>
                (g.home === homeTeamId || (g.home && g.home.id === homeTeamId)) &&
                (g.away === awayTeamId || (g.away && g.away.id === awayTeamId))
            );
        }
    }

    if (scheduledGame) {
        scheduledGame.played = true;
        scheduledGame.finalized = true;
        scheduledGame.homeScore = homeScore;
        scheduledGame.awayScore = awayScore;
        console.log(`[SIM-DEBUG] Scheduled game updated: ${home.abbr} vs ${away.abbr}`);
    } else {
        if (!gameData.isPlayoff) {
             console.error(`[commitGameResult] Scheduled game NOT FOUND for ${home.abbr} vs ${away.abbr} (Week ${league.week})`);
        }
    }

    // 2. Update Standings / Team Records
    const isPlayoff = gameData.isPlayoff || false;
    if (!isPlayoff) {
        applyResult({ home, away }, homeScore, awayScore);
    }

    // 3. Update Player Stats (mutates roster objects)
    if (stats) {
        const updateRosterStats = (team, teamStats) => {
            if (!teamStats || !teamStats.players) return;
            team.roster.forEach(p => {
                const pStats = teamStats.players[p.id];
                if (pStats) {
                    initializePlayerStats(p);
                    p.stats.game = { ...pStats };

                    if (isPlayoff) {
                        if (!p.stats.playoffs) p.stats.playoffs = {};
                        accumulateStats(p.stats.game, p.stats.playoffs);
                        if (!p.stats.playoffs.gamesPlayed) p.stats.playoffs.gamesPlayed = 0;
                        p.stats.playoffs.gamesPlayed++;
                    } else {
                        accumulateStats(p.stats.game, p.stats.season);
                        if (!p.stats.season.gamesPlayed) p.stats.season.gamesPlayed = 0;
                        p.stats.season.gamesPlayed++;

                        if (updateAdvancedStats) {
                            updateAdvancedStats(p, p.stats.season);
                        }
                    }

                    if (updatePlayerGameLegacy) {
                         const gameContext = {
                            year: league.year || 2025,
                            week: league.week || 1,
                            teamWon: (team.id === homeTeamId ? homeScore > awayScore : awayScore > homeScore),
                            isPlayoff: isPlayoff,
                            opponent: (team.id === homeTeamId ? away.name : home.name)
                        };
                        updatePlayerGameLegacy(p, p.stats.game, gameContext);
                    }
                }
            });
        };

        updateRosterStats(home, stats.home);
        updateRosterStats(away, stats.away);

        // Update Team Season Stats
        const updateTeamSeasonStats = (team, teamStats) => {
             if (!team.stats) team.stats = { season: {} };
             if (!team.stats.season) team.stats.season = {};

             if (teamStats.team) {
                 Object.keys(teamStats.team).forEach(k => {
                     team.stats.season[k] = (team.stats.season[k] || 0) + teamStats.team[k];
                 });
             }
             team.stats.season.gamesPlayed = (team.stats.season.gamesPlayed || 0) + 1;
        };
        updateTeamSeasonStats(home, stats.home);
        updateTeamSeasonStats(away, stats.away);
    }

    // 4. Update Rivalries
    updateRivalries(home, away, homeScore, awayScore, isPlayoff);

    // 5. Create Result Object
    const resultObj = {
        id: `g_final_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        home: homeTeamId,
        away: awayTeamId,
        scoreHome: homeScore,
        scoreAway: awayScore,
        homeWin: homeScore > awayScore,
        homeTeamName: home.name,
        awayTeamName: away.name,
        homeTeamAbbr: home.abbr,
        awayTeamAbbr: away.abbr,
        boxScore: {
            home: transformStatsForBoxScore(stats?.home?.players, home.roster),
            away: transformStatsForBoxScore(stats?.away?.players, away.roster)
        },
        week: league.week,
        year: league.year,
        isPlayoff: isPlayoff
    };

    if (gameData.preGameContext) {
        const callbacks = generatePostGameCallbacks(gameData.preGameContext, stats, homeScore, awayScore);
        if (callbacks && callbacks.length > 0) {
            resultObj.callbacks = callbacks;
        }
    }

    // 6. Store in resultsByWeek (Persistence)
    if (!league.resultsByWeek) league.resultsByWeek = {};
    if (!league.resultsByWeek[weekIndex]) league.resultsByWeek[weekIndex] = [];

    // Idempotency check
    const existingIndex = league.resultsByWeek[weekIndex].findIndex(r => r.home === homeTeamId && r.away === awayTeamId);
    if (existingIndex >= 0) {
        league.resultsByWeek[weekIndex][existingIndex] = resultObj;
    } else {
        league.resultsByWeek[weekIndex].push(resultObj);
    }

    // 7. SAVE STATE (The Fix)
    if (options.persist !== false && saveState) {
        console.log('[commitGameResult] Persisting state...');
        const saved = saveState();
        if (!saved) {
             console.error('[commitGameResult] CRITICAL: Save failed!');
             if (typeof window !== 'undefined' && window.setStatus) {
                 window.setStatus("CRITICAL ERROR: Game result NOT saved. Check console.", "error");
             }
        }
    }

    return resultObj;
}

// Deprecated alias for backward compatibility until refactor complete
export const finalizeGameResult = commitGameResult;

function transformStatsForBoxScore(playerStatsMap, roster) {
    if (!playerStatsMap) return {};
    const box = {};
    Object.keys(playerStatsMap).forEach(pid => {
        const p = roster.find(pl => pl.id == pid);
        if (p) {
            box[pid] = {
                name: p.name,
                pos: p.pos,
                stats: playerStatsMap[pid]
            };
        }
    });
    return box;
}

/**
 * Simulates a batch of games.
 * @param {Array} games - Array of game objects {home, away, ...}
 * @param {Object} options - Simulation options {verbose: boolean, overrideResults: Array}
 * @returns {Array} Array of result objects
 */
export function simulateBatch(games, options = {}) {
    const results = [];
    const verbose = options.verbose === true;
    const overrideResults = Array.isArray(options.overrideResults) ? options.overrideResults : [];
    const overrideLookup = new Map(
      overrideResults
        .filter(result => result && Number.isInteger(result.home) && Number.isInteger(result.away))
        .map(result => [`${result.home}-${result.away}`, result])
    );

    if (!games || !Array.isArray(games)) return [];

    games.forEach((pair, index) => {
        try {
            if (verbose) console.log(`[SIM-DEBUG] Processing pairing ${index + 1}/${games.length}: Home=${pair.home?.abbr}, Away=${pair.away?.abbr}`);

            // Handle bye weeks
            if (pair.bye !== undefined) {
                results.push({
                    id: `b${pair.bye}`,
                    bye: pair.bye
                });
                return;
            }

            const home = pair.home;
            const away = pair.away;

            if (!home || !away) {
                console.warn('Invalid team objects in pairing:', pair);
                return;
            }

            // CHECK IF GAME IS ALREADY FINALIZED
            if (pair.week && window.state && window.state.league) {
                 const L = window.state.league;
                 const weekIndex = pair.week - 1;
                 if (L.resultsByWeek && L.resultsByWeek[weekIndex]) {
                     const existing = L.resultsByWeek[weekIndex].find(r => r.home === home.id && r.away === away.id);
                     if (existing) {
                         console.log(`[SIM-DEBUG] Game ${home.abbr} vs ${away.abbr} already finalized. Using existing result.`);
                         results.push(existing);
                         return;
                     }
                 }
            }

            const overrideResult = overrideLookup.get(`${home.id}-${away.id}`);
            let sH;
            let sA;
            let homePlayerStats = {};
            let awayPlayerStats = {};

            let schemeNote = null;

            if (overrideResult) {
                sH = overrideResult.scoreHome;
                sA = overrideResult.scoreAway;
                homePlayerStats = overrideResult.boxScore?.home || {};
                awayPlayerStats = overrideResult.boxScore?.away || {};
            } else {
                // 0-0 Prevention Loop
                let gameScores;
                let attempts = 0;
                const stakes = pair.preGameContext?.stakes || 0;
                do {
                    // Use simulateMatchup (unified function)
                    gameScores = simulateMatchup(home, away, { verbose, stakes });
                    attempts++;
                } while ((!gameScores || (gameScores.homeScore === 0 && gameScores.awayScore === 0)) && attempts < 3);

                if (!gameScores || (gameScores.homeScore === 0 && gameScores.awayScore === 0)) {
                    if (verbose) console.warn(`simulateMatchup failed or 0-0 after ${attempts} attempts for ${away.abbr} @ ${home.abbr}, forcing fallback score.`);
                    const r = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
                    gameScores = { homeScore: r(10, 42), awayScore: r(7, 35) };
                }

                sH = gameScores.homeScore;
                sA = gameScores.awayScore;
                schemeNote = gameScores.schemeNote;

                // Capture stats for box score
                const capturePlayerStats = (roster) => {
                    const playerStats = {};
                    roster.forEach(player => {
                        if (player && player.stats && player.stats.game) {
                            playerStats[player.id] = {
                                name: player.name,
                                pos: player.pos,
                                ...player.stats.game
                            };
                        }
                    });
                    return playerStats;
                };

                homePlayerStats = capturePlayerStats(home.roster);
                awayPlayerStats = capturePlayerStats(away.roster);

                // Update Accumulators (via commitGameResult normally, but here we prep for it)
                // Actually, commitGameResult handles accumulation now. We just need to gather the data.
            }

            // Finalize Game Result via Commit
            const league = window.state?.league;
            if (league) {
                const gameData = {
                    homeTeamId: (home.id !== undefined) ? home.id : pair.home,
                    awayTeamId: (away.id !== undefined) ? away.id : pair.away,
                    homeScore: sH,
                    awayScore: sA,
                    isPlayoff: options.isPlayoff || false,
                    preGameContext: pair.preGameContext, // PASS CONTEXT
                    stats: {
                        home: { players: homePlayerStats },
                        away: { players: awayPlayerStats }
                    }
                };

                // Disable auto-save for batch efficiency; handled by caller (GameRunner/Simulation)
                const resultObj = commitGameResult(league, gameData, { persist: false });
                if (schemeNote && resultObj) {
                    resultObj.schemeNote = schemeNote;
                }

                if (resultObj) {
                    results.push(resultObj);
                }
            } else {
                console.error('League not found for commitGameResult in simulateBatch');
                results.push({
                    id: `g${index}`,
                    home: home.id || pair.home,
                    away: away.id || pair.away,
                    scoreHome: sH,
                    scoreAway: sA,
                    homeWin: sH > sA,
                    boxScore: { home: homePlayerStats, away: awayPlayerStats },
                    week: pair.week,
                    year: pair.year,
                    finalized: true
                });
            }

        } catch (error) {
            console.error(`[SIM-DEBUG] Error simulating game ${index}:`, error);
        }
    });

    return results;
}

// Default export if needed, or just named exports
export default {
    simGameStats,
    simulateMatchup, // Unified function alias
    applyResult,
    initializePlayerStats,
    groupPlayersByPosition,
    accumulateStats,
    simulateBatch,
    commitGameResult,
    validateLeagueState
};
