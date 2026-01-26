/*
 * Game Simulator Module
 * Core game simulation logic extracted from simulation.js
 */

import { Utils } from './utils.js';
import { Constants } from './constants.js';
import { calculateGamePerformance, getCoachingMods } from './coach-system.js';
import { updateAdvancedStats, getZeroStats } from './player.js';

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
    if (!team) return null;

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
  const compPct = Math.max(45, Math.min(85, baseCompPct + (defenseFactor - 50) * 0.3));
  const completions = Math.round(attempts * (compPct / 100));

  const avgYardsPerAttempt = 5 + (throwPower / 20) + (teamScore / 5);
  const yards = Math.round(completions * avgYardsPerAttempt + U.rand(-50, 100));

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

  const baseYPC = 3.5 + (speed + trucking + juking) / 100;
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
  const receptionPct = Math.max(40, Math.min(90, catchRate + defenseFactor * 20));
  const receptions = Math.max(0, Math.min(targets, Math.round(targets * (receptionPct / 100) + U.rand(-1, 1))));

  const avgYardsPerCatch = 8 + (speed / 15);
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

    const homeStrength = calculateStrength(homeActive, home);
    const awayStrength = calculateStrength(awayActive, away);

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

    const HOME_ADVANTAGE = C.HOME_ADVANTAGE || 3;
    const BASE_SCORE_MIN = C.BASE_SCORE_MIN || 10;
    const BASE_SCORE_MAX = C.BASE_SCORE_MAX || 35;
    const SCORE_VARIANCE = C.SCORE_VARIANCE || 10;

    const strengthDiff = (homeStrength - awayStrength) + HOME_ADVANTAGE;

    let homeScore = U.rand(BASE_SCORE_MIN, BASE_SCORE_MAX) + Math.round(strengthDiff / 5);
    let awayScore = U.rand(BASE_SCORE_MIN, BASE_SCORE_MAX) - Math.round(strengthDiff / 5);

    homeScore += U.rand(0, SCORE_VARIANCE);
    awayScore += U.rand(0, SCORE_VARIANCE);

    homeScore = Math.max(0, homeScore);
    awayScore = Math.max(0, awayScore);

    if (verbose) console.log(`[SIM-DEBUG] Scores Generated: ${home.abbr} ${homeScore} - ${away.abbr} ${awayScore}`);

    // --- STAFF PERKS INTEGRATION (RPG System) ---
    const homeMods = getCoachingMods(home.staff);
    const awayMods = getCoachingMods(away.staff);

    if (verbose) console.log(`[SIM-DEBUG] Mods Applied: Home=${JSON.stringify(homeMods)}, Away=${JSON.stringify(awayMods)}`);

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

    return { homeScore, awayScore };

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

            const overrideResult = overrideLookup.get(`${home.id}-${away.id}`);
            let sH;
            let sA;
            let homePlayerStats = {};
            let awayPlayerStats = {};

            if (overrideResult) {
                sH = overrideResult.scoreHome;
                sA = overrideResult.scoreAway;
                homePlayerStats = overrideResult.boxScore?.home || {};
                awayPlayerStats = overrideResult.boxScore?.away || {};
            } else {
                let gameScores = simGameStats(home, away, { verbose });

                if (!gameScores) {
                    if (verbose) console.warn(`SimGameStats failed for ${away.abbr} @ ${home.abbr}, using fallback score.`);
                    const r = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
                    gameScores = { homeScore: r(10, 42), awayScore: r(7, 35) };
                }

                sH = gameScores.homeScore;
                sA = gameScores.awayScore;

                // Capture stats for box score
                const capturePlayerStats = (roster) => {
                    const playerStats = {};
                    roster.forEach(player => {
                        if (player && player.stats && player.stats.game) {
                            playerStats[player.id] = {
                                name: player.name,
                                pos: player.pos,
                                stats: { ...player.stats.game }
                            };
                        }
                    });
                    return playerStats;
                };

                homePlayerStats = capturePlayerStats(home.roster);
                awayPlayerStats = capturePlayerStats(away.roster);

                // Update Accumulators
                const updatePlayerStats = (roster, isPlayoff = false) => {
                    if (!Array.isArray(roster)) return;
                    roster.forEach(p => {
                        if (p && p.stats && p.stats.game) {
                            initializePlayerStats(p);

                            if (isPlayoff) {
                                // Playoff Stats Only
                                if (!p.stats.playoffs) p.stats.playoffs = {};
                                accumulateStats(p.stats.game, p.stats.playoffs);
                                if (!p.stats.playoffs.gamesPlayed) p.stats.playoffs.gamesPlayed = 0;
                                p.stats.playoffs.gamesPlayed++;
                            } else {
                                // Regular Season Stats
                                accumulateStats(p.stats.game, p.stats.season);
                                if (!p.stats.season.gamesPlayed) p.stats.season.gamesPlayed = 0;
                                p.stats.season.gamesPlayed++;

                                // Advanced Stats (Season Only)
                                if (updateAdvancedStats) {
                                    updateAdvancedStats(p, p.stats.season);
                                }
                            }
                        }
                    });
                };

                const isPlayoff = options.isPlayoff === true;
                updatePlayerStats(home.roster, isPlayoff);
                updatePlayerStats(away.roster, isPlayoff);

                // Update Team Stats
                const updateTeamSeasonStats = (team) => {
                    if (!team || !team.stats || !team.stats.game) return;

                    if (isPlayoff) {
                        // Optional: Accumulate playoff team stats if structure exists
                    } else {
                        if (!team.stats.season) team.stats.season = {};
                        accumulateStats(team.stats.game, team.stats.season);
                        team.stats.season.gamesPlayed = (team.stats.season.gamesPlayed || 0) + 1;
                    }
                };

                updateTeamSeasonStats(home);
                updateTeamSeasonStats(away);
            }

            // Record result
            const resultObj = {
                id: `g${index}`,
                home: home.id || pair.home, // Use ID if possible
                away: away.id || pair.away,
                scoreHome: sH,
                scoreAway: sA,
                homeWin: sH > sA,
                homeTeamName: home.name,
                awayTeamName: away.name,
                homeTeamAbbr: home.abbr,
                awayTeamAbbr: away.abbr,
                boxScore: {
                    home: homePlayerStats,
                    away: awayPlayerStats
                }
            };

            // Add extra fields if provided
            if (pair.week) resultObj.week = pair.week;
            if (pair.year) resultObj.year = pair.year;

            results.push(resultObj);

            // Apply W/L (Regular Season Only)
            const isPlayoff = options.isPlayoff === true;
            if (!isPlayoff) {
                const gameObj = { home: home, away: away };
                applyResult(gameObj, sH, sA, { verbose });
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
    applyResult,
    initializePlayerStats,
    groupPlayersByPosition,
    accumulateStats,
    simulateBatch
};
