/*
 * Game Simulator Module
 * Core game simulation logic extracted from simulation.js
 */

import { Utils as U } from './utils.js';
import { Constants as C } from './constants.js';
import { calculateGamePerformance, getCoachingMods } from './coach-system.js';
import { updateAdvancedStats, getZeroStats, updatePlayerGameLegacy } from './player.js';
import { getStrategyModifiers } from './strategy.js';
import { getEffectiveRating, canPlayerPlay } from './injury-core.js';
import { calculateTeamRatingWithSchemeFit } from './scheme-core.js';

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
      game: getZeroStats(),
      season: getZeroStats(),
      career: getZeroStats()
    };
    return; // All fields just initialized, no need to check individually
  }
  if (!player.stats.game) player.stats.game = getZeroStats();
  if (!player.stats.season || Object.keys(player.stats.season).length === 0) {
    player.stats.season = getZeroStats();
  }
  if (!player.stats.career) player.stats.career = getZeroStats();
}

/**
 * Calculate how many seasons a player has been with the team.
 * Used as a tenure proxy for coaching mods (returns years, not weeks).
 */
function calculateSeasonsWithTeam(player, team) {
  if (player.history && player.history.length > 0) {
    const teamHistory = player.history.filter(h => h.team === team.abbr);
    return teamHistory.length || 1;
  }
  return 1;
}

/**
 * Helper to update team standings in the league object.
 * @param {Object} league - The league object.
 * @param {number} teamId - The team ID to update.
 * @param {object} stats - The stats to add/update { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 }.
 */
export function updateTeamStandings(league, teamId, stats) {
    // 1. Resolve Team Object
    let team = null;

    if (league && league.teams) {
        team = league.teams.find(t => t.id === teamId);
    }

    // Return null if we can't find the team
    if (!team) {
        return null;
    }

    // 2. Apply Updates (incrementing existing values)
    // Use explicit !== undefined checks instead of truthy to handle 0 correctly
    if (stats.wins !== undefined) team.wins = (team.wins || 0) + stats.wins;
    if (stats.losses !== undefined) team.losses = (team.losses || 0) + stats.losses;
    if (stats.ties !== undefined) team.ties = (team.ties || 0) + stats.ties;

    // Points are cumulative (pf/pa can legitimately be 0)
    if (stats.pf !== undefined) {
        team.ptsFor = (team.ptsFor || 0) + stats.pf;
        team.pointsFor = team.ptsFor; // Alias
    }
    if (stats.pa !== undefined) {
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
 * @param {Object} league - The league object.
 * @param {object} game - An object containing the home and away team objects.
 * @param {number} homeScore - The final score for the home team.
 * @param {number} awayScore - The final score for the away team.
 */
export function applyResult(league, game, homeScore, awayScore, options = {}) {
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

  // UPDATE LEAGUE via Setter
  if (verbose) console.log(`[SIM-DEBUG] Updating standings: Home +${JSON.stringify(homeStats)}, Away +${JSON.stringify(awayStats)}`);

  const updatedHome = updateTeamStandings(league, home.id, homeStats);
  const updatedAway = updateTeamStandings(league, away.id, awayStats);

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

    // Dependencies (Inject or Import)
    // U and C are imported.

    if (!home?.roster || !away?.roster || !Array.isArray(home.roster) || !Array.isArray(away.roster)) {
      console.error('[SIM-DEBUG] Invalid team roster data');
      return null;
    }

    // --- OPTIMIZATION & INJURY INTEGRATION ---
    const getActiveRoster = (team) => {
      if (!team.roster) return [];
      // Use imported canPlayerPlay
      return team.roster.filter(p => canPlayerPlay(p));
    };

    const homeActive = getActiveRoster(home);
    const awayActive = getActiveRoster(away);

    const homeGroups = groupPlayersByPosition(homeActive);
    const awayGroups = groupPlayersByPosition(awayActive);

    const calculateStrength = (activeRoster, team) => {
      if (!activeRoster || !activeRoster.length) return 50;

      return activeRoster.reduce((acc, p) => {
        const tenureYears = calculateSeasonsWithTeam(p, team);

        let rating = p.ovr || 50;
        // Use imported getEffectiveRating
        rating = getEffectiveRating(p);

        // Create proxy player to avoid mutating original
        const proxyPlayer = { ...p, ovr: rating, ratings: { ...(p.ratings || {}), overall: rating } };
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
            const r = getEffectiveRating(p);
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

    // Determine strategy modifiers (Assumes userTeamId or strategies are passed in context or present in team object)
    // Note: options.league is passed by GameRunner
    const league = options.league;
    const userTeamId = league?.userTeamId;

    if (userTeamId !== undefined && league?.weeklyGamePlan) {
        const history = league.strategyHistory || {};
        if (home.id === userTeamId) {
             const { offPlanId, defPlanId, riskId } = league.weeklyGamePlan;
             const stratMods = getStrategyModifiers(offPlanId, defPlanId, riskId, history);
             if (verbose) console.log(`[SIM-DEBUG] Applying Strategy Mods for User (Home):`, stratMods);
             Object.assign(homeMods, stratMods);
        } else if (away.id === userTeamId) {
             const { offPlanId, defPlanId, riskId } = league.weeklyGamePlan;
             const stratMods = getStrategyModifiers(offPlanId, defPlanId, riskId, history);
             if (verbose) console.log(`[SIM-DEBUG] Applying Strategy Mods for User (Away):`, stratMods);
             Object.assign(awayMods, stratMods);
        }
    }

    if (verbose) console.log(`[SIM-DEBUG] Mods Applied: Home=${JSON.stringify(homeMods)}, Away=${JSON.stringify(awayMods)}`);
    // --- SCHEME FIT IMPACT ---
    let schemeNote = null;

    if (calculateTeamRatingWithSchemeFit) {
        const homeFit = calculateTeamRatingWithSchemeFit(home);
        const awayFit = calculateTeamRatingWithSchemeFit(away);

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

    // =================================================================
    // REALISTIC NFL SCORING ENGINE
    // Uses drive-based simulation to produce authentic football scores.
    // Average NFL game: ~22 points per team, range 3-45 typical.
    // Scores naturally land on football numbers (3,6,7,10,13,14,17,20,21,24,27,28,31...)
    // =================================================================

    const HOME_ADVANTAGE = C.SIMULATION?.HOME_ADVANTAGE || C.HOME_ADVANTAGE || 3;

    // Rivalry variance boost
    let varianceBoost = 0;
    if (home.rivalries && away.rivalries) {
        const homeRiv = home.rivalries[away.id]?.score || 0;
        const awayRiv = away.rivalries[home.id]?.score || 0;
        const intensity = Math.max(homeRiv, awayRiv);
        if (intensity > 50) varianceBoost = 3;
        else if (intensity > 25) varianceBoost = 1.5;
    }
    if (options.stakes && options.stakes > 75) varianceBoost += 2;

    const strengthDiff = (homeStrength - awayStrength) + HOME_ADVANTAGE;

    /**
     * Simulate drives for one team to generate a realistic score.
     * @param {number} offStr - Offensive strength (team's overall)
     * @param {number} defStr - Opposing defense strength
     * @param {number} advantage - Net strength advantage (positive = favored)
     * @param {Object} mods - Coaching/strategy modifiers
     * @returns {number} Final score
     */
    const simulateDrives = (offStr, defStr, advantage, mods) => {
        // NFL teams average ~12 possessions per game
        const numDrives = U.rand(10, 14);
        let score = 0;

        // Base scoring probability calibrated to ~22 pts/game avg
        // offStr/defStr are roughly 50-90 range
        const offFactor = (offStr - 50) / 40; // 0.0 for 50 OVR, 1.0 for 90 OVR
        const defFactor = (defStr - 50) / 40;
        const netQuality = offFactor - defFactor * 0.7 + (advantage / 80);

        for (let d = 0; d < numDrives; d++) {
            // Drive outcome probabilities (NFL averages: ~35% score, ~21% TD, ~14% FG)
            const driveRoll = U.random();

            // Apply variance boost and modifier
            const varianceMod = (mods.variance || 1.0);
            const upsetChance = varianceBoost * 0.015;

            // Base TD probability: 15-30% depending on quality
            let tdProb = U.clamp(0.18 + netQuality * 0.12 + upsetChance, 0.08, 0.35);
            // Base FG probability: 10-18%
            let fgProb = U.clamp(0.14 + netQuality * 0.04, 0.08, 0.22);

            // Strategy mods
            if (mods.passVolume && mods.passVolume > 1.1) tdProb += 0.03; // Aggressive passing = more TDs but riskier
            if (mods.runVolume && mods.runVolume > 1.1) { fgProb += 0.02; tdProb -= 0.01; } // Ball control = more FGs
            if (mods.variance && mods.variance > 1.0) { tdProb += 0.02; } // Aggressive risk = more boom

            if (driveRoll < tdProb) {
                // Touchdown (6 pts + XP attempt)
                const xpRoll = U.random();
                if (xpRoll < 0.94) score += 7;     // Normal XP make (94% NFL avg)
                else if (xpRoll < 0.97) score += 6; // Missed XP
                else score += 8;                     // 2-point conversion
            } else if (driveRoll < tdProb + fgProb) {
                score += 3; // Field goal
            }
            // Otherwise: punt, turnover, turnover on downs (no points)
        }

        return score;
    };

    let homeScore = simulateDrives(homeStrength, awayStrength, strengthDiff, homeMods);
    let awayScore = simulateDrives(awayStrength, homeStrength, -strengthDiff, awayMods);

    // Ensure scores don't go negative (shouldn't happen with drive sim, but safety)
    homeScore = Math.max(0, homeScore);
    awayScore = Math.max(0, awayScore);

    // --- OVERTIME LOGIC ---
    // If tied at end of regulation, simulate OT
    if (homeScore === awayScore) {
        if (verbose) console.log(`[SIM-DEBUG] Regulation tied at ${homeScore}. Entering OT...`);
        const isPlayoff = options.isPlayoff === true;
        const allowTies = !isPlayoff && (options.allowTies !== false);

        let gameOver = false;
        let possession = U.random() < 0.5 ? 'home' : 'away';
        let firstPossessionScore = 0; // 0=none, 3=FG, 7=TD
        let possessions = 0;

        const maxPossessions = allowTies ? 4 : 20;
        const HARD_ITERATION_CAP = 50; // Absolute safety cap to prevent infinite loops

        // Track which team kicked off (received 2nd) so we know possession order
        const firstTeam = possession; // Team with first possession

        while (!gameOver && possessions < maxPossessions && possessions < HARD_ITERATION_CAP) {
            possessions++;
            // Simulate a drive
            const offStrength = possession === 'home' ? homeStrength : awayStrength;
            const defStrength = possession === 'home' ? awayStrength : homeStrength;

            const diff = offStrength - defStrength;
            const scoreChance = 0.35 + (diff / 200);

            let drivePoints = 0;
            if (U.rand(0, 100) / 100 < scoreChance) {
                if (U.rand(0, 100) < 60) {
                    drivePoints = 6 + (U.rand(0,100) < 95 ? 1 : 0); // TD + XP
                } else {
                    drivePoints = 3; // FG
                }
            }

            if (verbose) console.log(`[SIM-DEBUG] OT Drive ${possessions}: ${possession} scores ${drivePoints}`);

            // Apply score
            if (drivePoints > 0) {
                if (possession === 'home') homeScore += drivePoints;
                else awayScore += drivePoints;
            }

            // Apply NFL OT Rules (2024+: both teams guaranteed a possession)
            if (possessions === 1) {
                // First possession TD: other team still gets a chance
                if (drivePoints >= 6) {
                    firstPossessionScore = 7;
                } else if (drivePoints === 3) {
                    firstPossessionScore = 3;
                }
                // First possession: no immediate game-over, other team gets the ball
            } else if (possessions === 2) {
                // Second team's response
                // If scores are no longer tied after both teams had a possession, game over
                if (homeScore !== awayScore) {
                    gameOver = true;
                }
                // If still tied, continue to sudden death
            } else {
                // Sudden death after both teams have had at least one possession
                // Game ends when score is different after the team that received 2nd has had their turn
                // (i.e., check after each pair of possessions, or if a score creates a lead)
                if (homeScore !== awayScore) {
                    gameOver = true;
                }
            }

            possession = possession === 'home' ? 'away' : 'home';
        }

        if (possessions >= HARD_ITERATION_CAP) {
            console.warn(`[SIM-DEBUG] OT hit hard iteration cap (${HARD_ITERATION_CAP}). Forcing end.`);
            // Force a winner if still tied after safety cap
            if (homeScore === awayScore) {
                if (U.random() < 0.5) homeScore += 3;
                else awayScore += 3;
            }
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
        const qbStats = generateQBStats(qb, score, oppScore, oppDefenseStrength, U, mods);
        if (score > oppScore) qbStats.wins = 1;
        else if (score < oppScore) qbStats.losses = 1;
        Object.assign(qb.stats.game, qbStats);
        totalPassAttempts = qbStats.passAtt || 30;
      }

      const rbs = (groups['RB'] || []).slice(0, 2);
      rbs.forEach((rb, index) => {
        const share = index === 0 ? 0.7 : 0.3;
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
// Set of stat keys that are derived/calculated and should NOT be accumulated
const DERIVED_STAT_KEYS = new Set([
    'completionPct', 'yardsPerCarry', 'yardsPerReception', 'avgPuntYards',
    'avgKickYards', 'successPct', 'passerRating', 'sackPct',
    'dropRate', 'separationRate', 'pressureRate',
    'coverageRating', 'pressureRating', 'protectionGrade',
    'ratingWhenTargeted'
]);

export function accumulateStats(source, target) {
    if (!source || !target) return;

    const keys = Object.keys(source);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = source[key];
        if (typeof value !== 'number') continue;
        // Skip derived/calculated fields
        if (DERIVED_STAT_KEYS.has(key)) continue;
        target[key] = (target[key] || 0) + value;
    }
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
            g && g.home !== undefined && g.away !== undefined &&
            (g.home === homeTeamId || (typeof g.home === 'object' && g.home.id === homeTeamId)) &&
            (g.away === awayTeamId || (typeof g.away === 'object' && g.away.id === awayTeamId))
        );
    }

    // Strategy 2: Look in flat array (if schedule is flat array of games)
    if (!scheduledGame && Array.isArray(scheduleWeeks)) {
        scheduledGame = scheduleWeeks.find(g =>
            g && g.home !== undefined && g.away !== undefined &&
            (g.week === league.week) &&
            (g.home === homeTeamId || (typeof g.home === 'object' && g.home.id === homeTeamId)) &&
            (g.away === awayTeamId || (typeof g.away === 'object' && g.away.id === awayTeamId))
        );
    }

    // Strategy 3: Global search (fallback)
    if (!scheduledGame && league.schedule) {
        // Iterate all weeks if structure is nested
        if (league.schedule.weeks) {
            for (const w of league.schedule.weeks) {
                if (w.games) {
                    const g = w.games.find(g =>
                        g && g.home !== undefined && g.away !== undefined &&
                        (g.home === homeTeamId || (typeof g.home === 'object' && g.home.id === homeTeamId)) &&
                        (g.away === awayTeamId || (typeof g.away === 'object' && g.away.id === awayTeamId))
                    );
                    if (g) {
                        scheduledGame = g;
                        break;
                    }
                }
            }
        } else if (Array.isArray(league.schedule)) {
             scheduledGame = league.schedule.find(g =>
                g && g.home !== undefined && g.away !== undefined &&
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
        // console.log(`[SIM-DEBUG] Scheduled game updated: ${home.abbr} vs ${away.abbr}`);
    }

    // 2. Update Standings / Team Records
    const isPlayoff = gameData.isPlayoff || false;
    if (!isPlayoff) {
        applyResult(league, { home, away }, homeScore, awayScore);
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
        id: `g_final_${Date.now()}_${U.id()}`,
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

    return resultObj;
}

// Deprecated alias for backward compatibility until refactor complete
export const finalizeGameResult = commitGameResult;

function transformStatsForBoxScore(playerStatsMap, roster) {
    if (!playerStatsMap) return {};
    const box = {};
    Object.keys(playerStatsMap).forEach(pid => {
        const p = roster.find(pl => String(pl.id) === String(pid));
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
 * @param {Object} options - Simulation options {verbose: boolean, overrideResults: Array, league: Object}
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

    // Use passed league object or fail
    const league = options.league;
    if (!league) {
        console.error('No league provided to simulateBatch');
        return [];
    }

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
            const weekIndex = (pair.week || 1) - 1;
            if (league.resultsByWeek && league.resultsByWeek[weekIndex]) {
                 const existing = league.resultsByWeek[weekIndex].find(r => r.home === home.id && r.away === away.id);
                 if (existing) {
                     console.log(`[SIM-DEBUG] Game ${home.abbr} vs ${away.abbr} already finalized. Using existing result.`);
                     results.push(existing);
                     return;
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
                    // Pass league for scheme fit calculations
                    gameScores = simulateMatchup(home, away, { verbose, stakes, league, isPlayoff: options.isPlayoff });
                    attempts++;
                } while ((!gameScores || (gameScores.homeScore === 0 && gameScores.awayScore === 0)) && attempts < 3);

                if (!gameScores || (gameScores.homeScore === 0 && gameScores.awayScore === 0)) {
                    if (verbose) console.warn(`simulateMatchup failed or 0-0 after ${attempts} attempts for ${away.abbr} @ ${home.abbr}, forcing fallback score.`);
                    gameScores = { homeScore: U.rand(10, 35), awayScore: U.rand(7, 28) };
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
            }

            // Finalize Game Result via Commit
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

            const resultObj = commitGameResult(league, gameData, { persist: false });
            if (schemeNote && resultObj) {
                resultObj.schemeNote = schemeNote;
            }

            if (resultObj) {
                results.push(resultObj);
            }

        } catch (error) {
            console.error(`[SIM-DEBUG] Error simulating game ${index}:`, error);
        }
    });

    return results;
}

/**
 * Validates the league state after simulation.
 * @param {Object} league - The league object.
 * @returns {Object} { valid: boolean, errors: Array }
 */
export function validateLeagueState(league) {
    const errors = [];
    if (!league) return { valid: false, errors: ['No league object provided'] };

    if (!league.teams || !Array.isArray(league.teams)) {
        errors.push('Missing or invalid teams array');
    } else {
        // Check teams have required fields
        league.teams.forEach((team, i) => {
            if (!team) {
                errors.push(`Team at index ${i} is null`);
            } else if (!team.roster || !Array.isArray(team.roster)) {
                errors.push(`Team ${team.abbr || i} has missing or invalid roster`);
            }
        });
    }

    // Check for finalized games with invalid scores
    if (league.resultsByWeek) {
        Object.entries(league.resultsByWeek).forEach(([week, results]) => {
            if (Array.isArray(results)) {
                results.forEach(game => {
                    if (game.scoreHome === 0 && game.scoreAway === 0 && !game.bye) {
                        errors.push(`0-0 game found in week ${week}: ${game.homeTeamAbbr} vs ${game.awayTeamAbbr}`);
                    }
                });
            }
        });
    }

    return { valid: errors.length === 0, errors };
}

// Default export
export default {
    simGameStats,
    simulateMatchup, // Unified function alias
    applyResult,
    initializePlayerStats,
    groupPlayersByPosition,
    accumulateStats,
    simulateBatch,
    commitGameResult,
    updateTeamStandings,
    validateLeagueState
};
