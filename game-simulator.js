/*
 * Game Simulator Module
 * Core game simulation logic extracted from simulation.js
 */

import { Utils } from './utils.js';
import { Constants } from './constants.js';
import { calculateGamePerformance } from './coach-system.js';
import { updateAdvancedStats } from './player.js';

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
    player.stats = { game: {}, season: {}, career: {} };
  }
  if (!player.stats.game) player.stats.game = {};
  if (!player.stats.season) player.stats.season = {};
  if (!player.stats.career) player.stats.career = {};
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
 * Applies the result of a simulated game to the teams' records.
 * @param {object} game - An object containing the home and away team objects.
 * @param {number} homeScore - The final score for the home team.
 * @param {number} awayScore - The final score for the away team.
 */
export function applyResult(game, homeScore, awayScore) {
  if (!game || typeof game !== 'object') return;

  const home = game.home;
  const away = game.away;
  if (!home || !away) return;

  const initializeTeamStats = (team) => {
    if (!team) return;
    team.wins = team.wins ?? 0;
    team.losses = team.losses ?? 0;
    team.ties = team.ties ?? 0;
    team.draws = team.draws ?? team.ties ?? 0;
    team.ptsFor = team.ptsFor ?? 0;
    team.pointsFor = team.pointsFor ?? team.ptsFor ?? 0;
    team.ptsAgainst = team.ptsAgainst ?? 0;
    team.pointsAgainst = team.pointsAgainst ?? team.ptsAgainst ?? 0;

    // Ensure record object exists for UI compatibility
    if (!team.record) {
        team.record = { w: team.wins, l: team.losses, t: team.ties, pf: team.ptsFor, pa: team.ptsAgainst };
    }
  };

  initializeTeamStats(home);
  initializeTeamStats(away);

  if (game.hasOwnProperty('played')) {
    game.homeScore = homeScore;
    game.awayScore = awayScore;
    game.played = true;
  }

  // Ensure we are updating the global state object if possible
  let realHome = home;
  let realAway = away;

  if (typeof window !== 'undefined' && window.state?.league?.teams) {
      if (home.id !== undefined) realHome = window.state.league.teams.find(t => t.id === home.id) || home;
      if (away.id !== undefined) realAway = window.state.league.teams.find(t => t.id === away.id) || away;
  }

  // Ensure real objects are initialized
  initializeTeamStats(realHome);
  initializeTeamStats(realAway);

  if (homeScore > awayScore) {
    realHome.wins++;
    realAway.losses++;
  } else if (awayScore > homeScore) {
    realAway.wins++;
    realHome.losses++;
  } else {
    realHome.ties++;
    realAway.ties++;
    // Ensure draws property is updated if used elsewhere
    realHome.draws = (realHome.draws || 0) + 1;
    realAway.draws = (realAway.draws || 0) + 1;
  }

  // Update points for real objects (persistent state)
  realHome.ptsFor = (realHome.ptsFor || 0) + homeScore;
  realHome.ptsAgainst = (realHome.ptsAgainst || 0) + awayScore;
  realAway.ptsFor = (realAway.ptsFor || 0) + awayScore;
  realAway.ptsAgainst = (realAway.ptsAgainst || 0) + homeScore;

  // Update aliases for ranking logic compatibility
  realHome.pointsFor = realHome.ptsFor;
  realHome.pointsAgainst = realHome.ptsAgainst;
  realAway.pointsFor = realAway.ptsFor;
  realAway.pointsAgainst = realAway.ptsAgainst;

  // Sync back to passed objects if they were different (e.g. copies)
  if (realHome !== home) {
      home.wins = realHome.wins;
      home.losses = realHome.losses;
      home.ties = realHome.ties;
      home.ptsFor = realHome.ptsFor;
      home.ptsAgainst = realHome.ptsAgainst;
      home.pointsFor = realHome.pointsFor;
      home.pointsAgainst = realHome.pointsAgainst;
  }
  if (realAway !== away) {
      away.wins = realAway.wins;
      away.losses = realAway.losses;
      away.ties = realAway.ties;
      away.ptsFor = realAway.ptsFor;
      away.ptsAgainst = realAway.ptsAgainst;
      away.pointsFor = realAway.pointsFor;
      away.pointsAgainst = realAway.pointsAgainst;
  }

  // Sync legacy record object if it exists (for UI compatibility)
  if (home.record) {
    home.record.w = home.wins;
    home.record.l = home.losses;
    home.record.t = home.ties;
    home.record.pf = home.ptsFor;
    home.record.pa = home.ptsAgainst;
  }

  if (away.record) {
    away.record.w = away.wins;
    away.record.l = away.losses;
    away.record.t = away.ties;
    away.record.pf = away.ptsFor;
    away.record.pa = away.ptsAgainst;
  }
}

// --- STAT GENERATION HELPERS ---

function generateQBStats(qb, teamScore, defenseStrength, U, modifiers = {}) {
  const ratings = qb.ratings || {};
  const throwPower = ratings.throwPower || 70;
  const throwAccuracy = ratings.throwAccuracy || 70;
  const awareness = ratings.awareness || 70;

  let baseAttempts = Math.max(20, Math.min(50, teamScore * 2 + U.rand(15, 35)));

  // Apply modifier
  if (modifiers.passVolume) baseAttempts *= modifiers.passVolume;

  const attempts = Math.round(baseAttempts);

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

function generateRBStats(rb, teamScore, defenseStrength, U, modifiers = {}) {
  const ratings = rb.ratings || {};
  const speed = ratings.speed || 70;
  const trucking = ratings.trucking || 70;
  const juking = ratings.juking || 70;
  const catching = ratings.catching || 50;

  let carries = Math.max(5, Math.min(30, Math.round(teamScore * 1.5 + U.rand(8, 18))));

  if (modifiers.runVolume) carries = Math.round(carries * modifiers.runVolume);

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
export function simGameStats(home, away) {
  try {
    // Enhanced dependency resolution with fallbacks
    const C_OBJ = Constants || (typeof window !== 'undefined' ? window.Constants : null);
    const U = Utils || (typeof window !== 'undefined' ? window.Utils : null);

    if (!C_OBJ?.SIMULATION || !U) {
      console.error('Missing simulation dependencies:', {
          ConstantsLoaded: !!C_OBJ,
          SimulationConfig: !!C_OBJ?.SIMULATION,
          Utils: !!U
      });
      return null;
    }

    const C = C_OBJ.SIMULATION;

    if (!home?.roster || !away?.roster || !Array.isArray(home.roster) || !Array.isArray(away.roster)) {
      console.error('Invalid team roster data');
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

    // --- STAFF PERKS INTEGRATION ---
    const getTeamModifiers = (team) => {
        const mods = {};
        if (team.staff) {
            // Check OC Perks
            if (team.staff.offCoordinator && team.staff.offCoordinator.perk) {
                switch(team.staff.offCoordinator.perk) {
                    case 'Air Raid': mods.passVolume = 1.15; mods.runVolume = 0.85; break;
                    case 'Ground & Pound': mods.runVolume = 1.15; mods.passVolume = 0.85; break;
                    case 'Balanced': mods.passAccuracy = 1.05; break;
                }
            }
            // Check DC Perks
            if (team.staff.defCoordinator && team.staff.defCoordinator.perk) {
                switch(team.staff.defCoordinator.perk) {
                    case 'Blitz Happy': mods.sackChance = 1.2; break;
                    case 'No Fly Zone': mods.intChance = 1.2; break;
                }
            }
        }
        return mods;
    };

    const homeMods = getTeamModifiers(home);
    const awayMods = getTeamModifiers(away);


    const generateStatsForTeam = (team, score, oppScore, oppDefenseStrength, oppOffenseStrength, groups, mods) => {
       team.roster.forEach(player => {
        initializePlayerStats(player);
        player.stats.game = {};
      });

      const qbs = groups['QB'] || [];
      const qb = qbs.length > 0 ? qbs[0] : null;
      let totalPassAttempts = 30;

      if (qb) {
        const qbStats = generateQBStats(qb, score, oppDefenseStrength, U, mods);
        if (score > oppScore) qbStats.wins = 1;
        else if (score < oppScore) qbStats.losses = 1;
        Object.assign(qb.stats.game, qbStats);
        totalPassAttempts = qbStats.passAtt || 30;
      }

      const rbs = (groups['RB'] || []).slice(0, 2);
      rbs.forEach((rb, index) => {
        const share = index === 0 ? 0.7 : 0.3;
        const rbStats = generateRBStats(rb, score * share, oppDefenseStrength, U, mods);
        if (index > 0) {
           Object.keys(rbStats).forEach(key => {
            if (typeof rbStats[key] === 'number') {
              rbStats[key] = Math.round(rbStats[key] * share);
            }
          });
        }
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
    console.error('Error in simGameStats:', error);
    return null;
  }
}

// Default export if needed, or just named exports
export default {
    simGameStats,
    applyResult,
    initializePlayerStats,
    groupPlayersByPosition
};
