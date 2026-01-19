/*
 * Updated Simulation Module with Season Progression Fix
 *
 * This file is based on the original simulation.js from the NFLGM4 project.
 * A key enhancement has been added: after the playoffs conclude and a Super Bowl
 * champion is crowned, the game will now correctly advance to a new season
 * instead of re-running the same year's playoffs when the user clicks
 * “Simulate Week.” The new season logic increments the league year and
 * season counters, resets team records and weekly results, generates a new
 * schedule, processes salary cap rollover (if available), and clears
 * playoff data. A helper function `startNewSeason` is exposed globally
 * for reuse.
 *
 * ES Module version - migrated from global exports
 */

// Import dependencies
// TODO: Convert Utils and Constants to ES modules and import properly
const getUtils = () => window.Utils;
const getConstants = () => window.Constants;

/**
 * Validates that required global dependencies are available
 * @returns {boolean} True if all dependencies are available
 */
function validateDependencies() {
  const missing = [];
  
  if (!window.Constants?.SIMULATION) missing.push('window.Constants.SIMULATION');
  if (!window.Utils) missing.push('window.Utils');
  if (!window.state?.league) missing.push('window.state.league');
  if (!window.setStatus) missing.push('window.setStatus');
  
  if (missing.length > 0) {
    console.error('Missing required dependencies:', missing);
    if (window.setStatus) {
      window.setStatus(`Error: Missing dependencies - ${missing.join(', ')}`);
    }
    return false;
  }
  
  return true;
}

/**
 * Applies the result of a simulated game to the teams' records.
 * @param {object} game - An object containing the home and away team objects.
 * @param {object} game.home - The home team object.
 * @param {object} game.away - The away team object.
 * @param {number} homeScore - The final score for the home team.
 * @param {number} awayScore - The final score for the away team.
 */
function applyResult(game, homeScore, awayScore) {
  // Validate inputs
  if (!game || typeof game !== 'object') {
    console.error("Invalid game object provided to applyResult");
    return;
  }
  
  if (typeof homeScore !== 'number' || typeof awayScore !== 'number') {
    console.error("Invalid scores provided to applyResult", { homeScore, awayScore });
    return;
  }
  
  const home = game.home;
  const away = game.away;

  // This check is important to prevent errors if teams are not found
  if (!home || !away) {
    console.error("Invalid team data provided to applyResult", game);
    return;
  }

  // Initialize records if they don't exist - more robust initialization
  const initializeTeamStats = (team) => {
    if (!team) return;
    team.wins = team.wins ?? 0;
    team.losses = team.losses ?? 0;
    team.ties = team.ties ?? 0;
    team.ptsFor = team.ptsFor ?? 0;
    team.ptsAgainst = team.ptsAgainst ?? 0;
  };
  
  initializeTeamStats(home);
  initializeTeamStats(away);

  // Update game scores if a game object is passed with schedule info
  if (game.hasOwnProperty('played')) {
    game.homeScore = homeScore;
    game.awayScore = awayScore;
    game.played = true;
  }

  // Update team records
  if (homeScore > awayScore) {
    home.wins++;
    away.losses++;
  } else if (awayScore > homeScore) {
    away.wins++;
    home.losses++;
  } else {
    home.ties++;
    away.ties++;
  }

  // Update points for and against
  home.ptsFor += homeScore;
  home.ptsAgainst += awayScore;
  away.ptsFor += awayScore;
  away.ptsAgainst += homeScore;
}

/**
 * Initialize player stats structure if it doesn't exist
 * @param {Object} player - Player object
 */
function initializePlayerStats(player) {
  if (!player.stats) {
    player.stats = { game: {}, season: {}, career: {} };
  }
  if (!player.stats.game) player.stats.game = {};
  if (!player.stats.season) player.stats.season = {};
  if (!player.stats.career) player.stats.career = {};
}

/**
 * Generate quarterback statistics
 * @param {Object} qb - Quarterback player object
 * @param {number} teamScore - Team's score in the game
 * @param {Object} defenseStrength - Opposing defense strength
 * @param {Object} U - Utils object
 * @returns {Object} Game stats for QB
 */
function generateQBStats(qb, teamScore, defenseStrength, U) {
  const ratings = qb.ratings || {};
  const throwPower = ratings.throwPower || 70;
  const throwAccuracy = ratings.throwAccuracy || 70;
  const awareness = ratings.awareness || 70;
  
  // Base attempts based on score and game flow
  const baseAttempts = Math.max(20, Math.min(50, teamScore * 2 + U.rand(15, 35)));
  const attempts = Math.round(baseAttempts);
  
  // Completion percentage based on accuracy and defense
  const baseCompPct = (throwAccuracy + awareness) / 2;
  const defenseFactor = 100 - (defenseStrength || 70);
  const compPct = Math.max(45, Math.min(85, baseCompPct + (defenseFactor - 50) * 0.3));
  const completions = Math.round(attempts * (compPct / 100));
  
  // Yards based on completions, throw power, and score
  const avgYardsPerAttempt = 5 + (throwPower / 20) + (teamScore / 5);
  const yards = Math.round(completions * avgYardsPerAttempt + U.rand(-50, 100));
  
  // Touchdowns based on score and red zone efficiency
  const redZoneEfficiency = (awareness + throwAccuracy) / 200;
  const touchdowns = Math.max(0, Math.min(6, Math.round(teamScore / 7 + redZoneEfficiency * 2 + U.rand(-1, 2))));
  
  // Interceptions based on accuracy and defense
  const intRate = Math.max(0, (100 - throwAccuracy) / 100 + (defenseStrength / 200));
  const interceptions = Math.max(0, Math.min(5, Math.round(attempts * intRate * 0.03 + U.rand(-0.5, 1.5))));
  
  // Sacks based on offensive line and awareness
  const sacks = Math.max(0, Math.min(8, Math.round((100 - awareness) / 25 + U.rand(-1, 2))));
  
  // Longest completion
  const longestPass = Math.max(10, Math.round(yards / completions * U.rand(1.2, 2.5)));
  
  return {
    passAtt: attempts,
    passComp: completions,
    passYd: Math.max(0, yards),
    passTD: touchdowns,
    interceptions: interceptions,
    sacks: sacks,
    longestPass: longestPass,
    completionPct: Math.round((completions / Math.max(1, attempts)) * 1000) / 10
  };
}

/**
 * Generate running back statistics
 * @param {Object} rb - Running back player object
 * @param {number} teamScore - Team's score
 * @param {Object} defenseStrength - Opposing defense strength
 * @param {Object} U - Utils object
 * @returns {Object} Game stats for RB
 */
function generateRBStats(rb, teamScore, defenseStrength, U) {
  const ratings = rb.ratings || {};
  const speed = ratings.speed || 70;
  const trucking = ratings.trucking || 70;
  const juking = ratings.juking || 70;
  const catching = ratings.catching || 50;
  
  // Carries based on score and game flow
  const carries = Math.max(5, Math.min(30, Math.round(teamScore * 1.5 + U.rand(8, 18))));
  
  // Yards per carry based on ratings and defense
  const baseYPC = 3.5 + (speed + trucking + juking) / 100;
  const defenseFactor = (100 - (defenseStrength || 70)) / 50;
  const yardsPerCarry = Math.max(2.0, Math.min(8.0, baseYPC + defenseFactor + U.rand(-0.5, 0.5)));
  const rushYd = Math.round(carries * yardsPerCarry + U.rand(-10, 20));
  
  // Touchdowns
  const touchdowns = Math.max(0, Math.min(4, Math.round(teamScore / 7 * 0.6 + U.rand(-0.5, 1.5))));
  
  // Fumbles
  const fumbles = Math.max(0, Math.min(2, Math.round((100 - (ratings.awareness || 70)) / 150 + U.rand(-0.3, 0.5))));
  
  // Longest run
  const longestRun = Math.max(5, Math.round(rushYd / carries * U.rand(1.5, 3.5)));
  
  // Receiving stats
  const targets = Math.max(0, Math.min(8, Math.round((catching / 20) + U.rand(0, 3))));
  const receptions = Math.max(0, Math.min(targets, Math.round(targets * (catching / 100) + U.rand(-1, 1))));
  const recYd = Math.max(0, Math.round(receptions * (5 + speed / 20) + U.rand(-5, 15)));
  const recTD = receptions > 0 && U.rand(1, 100) < 15 ? 1 : 0;
  const drops = Math.max(0, targets - receptions);
  const yardsAfterCatch = Math.max(0, Math.round(recYd * 0.4 + U.rand(-5, 10)));
  
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
    longestCatch: receptions > 0 ? Math.max(5, Math.round(recYd / receptions * U.rand(1.2, 2.5))) : 0
  };
}

/**
 * Generate wide receiver/tight end statistics
 * @param {Object} receiver - WR/TE player object
 * @param {number} teamScore - Team's score
 * @param {Object} defenseStrength - Opposing defense strength
 * @param {Object} U - Utils object
 * @returns {Object} Game stats for WR/TE
 */
function generateReceiverStats(receiver, teamScore, defenseStrength, U) {
  const ratings = receiver.ratings || {};
  const catching = ratings.catching || 70;
  const catchInTraffic = ratings.catchInTraffic || 70;
  const speed = ratings.speed || 70;
  
  // Targets based on position importance and score
  const baseTargets = receiver.pos === 'WR' ? 8 : 5;
  const targets = Math.max(0, Math.min(15, Math.round(baseTargets + (teamScore / 5) + U.rand(-2, 4))));
  
  // Receptions based on catching ability and defense
  const catchRate = (catching + catchInTraffic) / 2;
  const defenseFactor = (100 - (defenseStrength || 70)) / 100;
  const receptionPct = Math.max(40, Math.min(90, catchRate + defenseFactor * 20));
  const receptions = Math.max(0, Math.min(targets, Math.round(targets * (receptionPct / 100) + U.rand(-1, 1))));
  
  // Yards based on receptions and speed
  const avgYardsPerCatch = 8 + (speed / 15);
  const recYd = Math.round(receptions * avgYardsPerCatch + U.rand(-20, 50));
  
  // Touchdowns
  const recTD = Math.max(0, Math.min(3, Math.round((receptions / 5) * (teamScore / 14) + U.rand(-0.5, 1.5))));
  
  // Drops
  const dropRate = Math.max(0, (100 - catching) / 200);
  const drops = Math.max(0, Math.min(targets - receptions, Math.round(targets * dropRate + U.rand(-0.5, 1.5))));
  
  // Yards after catch
  const yardsAfterCatch = Math.max(0, Math.round(recYd * (0.3 + speed / 200) + U.rand(-10, 20)));
  
  // Longest catch
  const longestCatch = receptions > 0 ? Math.max(10, Math.round(recYd / receptions * U.rand(1.5, 3.5))) : 0;
  
  return {
    targets: targets,
    receptions: receptions,
    recYd: recYd,
    recTD: recTD,
    drops: drops,
    yardsAfterCatch: yardsAfterCatch,
    longestCatch: longestCatch
  };
}

/**
 * Generate defensive back statistics (CB, S)
 * @param {Object} db - Defensive back player object
 * @param {Object} offenseStrength - Opposing offense strength
 * @param {Object} U - Utils object
 * @returns {Object} Game stats for DB
 */
function generateDBStats(db, offenseStrength, U) {
  const ratings = db.ratings || {};
  const coverage = ratings.coverage || 70;
  const speed = ratings.speed || 70;
  const awareness = ratings.awareness || 70;
  
  // Coverage rating (0-100)
  const coverageRating = Math.round((coverage + speed + awareness) / 3 + U.rand(-5, 5));
  
  // Tackles based on position and game flow
  const baseTackles = db.pos === 'S' ? 6 : 4;
  const tackles = Math.max(0, Math.min(15, Math.round(baseTackles + (100 - coverage) / 30 + U.rand(-1, 3))));
  
  // Interceptions based on coverage and awareness
  const intChance = (coverage + awareness) / 200;
  const interceptions = Math.max(0, Math.min(3, Math.round(intChance * 2 + U.rand(-0.5, 1.5))));
  
  // Passes defended
  const passesDefended = Math.max(0, Math.min(5, Math.round((coverage / 30) + U.rand(-0.5, 1.5))));
  
  return {
    coverageRating: Math.max(0, Math.min(100, coverageRating)),
    tackles: tackles,
    interceptions: interceptions,
    passesDefended: passesDefended
  };
}

/**
 * Generate defensive lineman/linebacker statistics (DL, LB, DE)
 * @param {Object} defender - Defensive player object
 * @param {Object} offenseStrength - Opposing offense strength
 * @param {Object} U - Utils object
 * @returns {Object} Game stats for DL/LB
 */
function generateDLStats(defender, offenseStrength, U) {
  const ratings = defender.ratings || {};
  const passRushPower = ratings.passRushPower || 70;
  const passRushSpeed = ratings.passRushSpeed || 70;
  const runStop = ratings.runStop || 70;
  const awareness = ratings.awareness || 70;
  
  // Pressure rating
  const pressureRating = Math.round((passRushPower + passRushSpeed + awareness) / 3 + U.rand(-5, 5));
  
  // Sacks based on pass rush ability
  const sackChance = (passRushPower + passRushSpeed) / 200;
  const sacks = Math.max(0, Math.min(4, Math.round(sackChance * 3 + U.rand(-0.5, 1.5))));
  
  // Tackles based on position and run stop
  const baseTackles = defender.pos === 'LB' ? 8 : 5;
  const tackles = Math.max(0, Math.min(15, Math.round(baseTackles + (runStop / 20) + U.rand(-1, 3))));
  
  // Tackles for loss
  const tacklesForLoss = Math.max(0, Math.min(3, Math.round((runStop / 50) + U.rand(-0.5, 1.5))));
  
  // Forced fumbles
  const forcedFumbles = Math.max(0, Math.min(2, Math.round((passRushPower / 100) + U.rand(-0.3, 0.5))));
  
  return {
    pressureRating: Math.max(0, Math.min(100, pressureRating)),
    sacks: sacks,
    tackles: tackles,
    tacklesForLoss: tacklesForLoss,
    forcedFumbles: forcedFumbles
  };
}

/**
 * Generate offensive lineman statistics
 * @param {Object} ol - Offensive lineman player object
 * @param {Object} defenseStrength - Opposing defense strength
 * @param {Object} U - Utils object
 * @returns {Object} Game stats for OL
 */
function generateOLStats(ol, defenseStrength, U) {
  const ratings = ol.ratings || {};
  const passBlock = ratings.passBlock || 70;
  const runBlock = ratings.runBlock || 70;
  const awareness = ratings.awareness || 70;
  
  // Sacks allowed (inverse of pass block)
  const sackChance = (100 - passBlock) / 200 + (defenseStrength / 300);
  const sacksAllowed = Math.max(0, Math.min(3, Math.round(sackChance * 2 + U.rand(-0.5, 1.5))));
  
  // Tackles for loss allowed
  const tflAllowed = Math.max(0, Math.min(2, Math.round((100 - runBlock) / 100 + U.rand(-0.3, 0.5))));
  
  // Protection grade (0-100)
  const protectionGrade = Math.round((passBlock + runBlock + awareness) / 3 + U.rand(-5, 5));
  
  return {
    sacksAllowed: sacksAllowed,
    tacklesForLossAllowed: tflAllowed,
    protectionGrade: Math.max(0, Math.min(100, protectionGrade))
  };
}

/**
 * Generate kicker statistics
 * @param {Object} kicker - Kicker player object
 * @param {number} teamScore - Team's score
 * @param {Object} U - Utils object
 * @returns {Object} Game stats for K
 */
function generateKickerStats(kicker, teamScore, U) {
  const ratings = kicker.ratings || {};
  const kickPower = ratings.kickPower || 70;
  const kickAccuracy = ratings.kickAccuracy || 70;
  
  // Field goal attempts
  const fgAttempts = Math.max(0, Math.min(5, Math.round(teamScore / 7 + U.rand(-1, 2))));
  
  // Field goals made based on accuracy
  const makeRate = kickAccuracy / 100;
  const fgMade = Math.max(0, Math.min(fgAttempts, Math.round(fgAttempts * makeRate + U.rand(-0.5, 0.5))));
  
  // Longest field goal
  const longestFG = Math.max(20, Math.min(65, Math.round(30 + (kickPower / 2) + U.rand(-5, 10))));
  
  // Extra points (assume 1 per TD, roughly)
  const xpAttempts = Math.max(0, Math.round(teamScore / 7));
  const xpMade = Math.max(0, Math.min(xpAttempts, Math.round(xpAttempts * (kickAccuracy / 100) + U.rand(-0.3, 0.3))));
  
  // Success percentage
  const successPct = fgAttempts > 0 ? Math.round((fgMade / fgAttempts) * 1000) / 10 : 0;
  
  // Average kick distance (for kickoffs)
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

/**
 * Generate punter statistics
 * @param {Object} punter - Punter player object
 * @param {number} teamScore - Team's score (lower = more punts)
 * @param {Object} U - Utils object
 * @returns {Object} Game stats for P
 */
function generatePunterStats(punter, teamScore, U) {
  const ratings = punter.ratings || {};
  const kickPower = ratings.kickPower || 70;
  const kickAccuracy = ratings.kickAccuracy || 70;
  
  // Punts (more if team scored less)
  const punts = Math.max(0, Math.min(8, Math.round((28 - teamScore) / 4 + U.rand(-1, 2))));
  
  // Punt distance based on power
  const avgPuntYards = Math.round(40 + (kickPower / 3) + U.rand(-5, 5));
  const totalPuntYards = punts * avgPuntYards;
  
  // Longest punt
  const longestPunt = Math.max(30, Math.min(70, Math.round(avgPuntYards * U.rand(1.2, 1.8))));
  
  return {
    punts: punts,
    puntYards: totalPuntYards,
    avgPuntYards: punts > 0 ? Math.round((totalPuntYards / punts) * 10) / 10 : 0,
    longestPunt: longestPunt
  };
}

/**
 * Simulates game statistics for a single game between two teams.
 * @param {object} home - The home team object.
 * @param {object} away - The away team object.
 * @returns {object|null} An object with homeScore and awayScore, or null if error.
 */
function simGameStats(home, away) {
  try {
    // Validate dependencies
    if (!window.Constants?.SIMULATION || !window.Utils) {
      console.error('Missing simulation dependencies');
      return null;
    }
    
    const C = window.Constants.SIMULATION;
    const U = window.Utils;

    // Validate team inputs
    if (!home?.roster || !away?.roster || !Array.isArray(home.roster) || !Array.isArray(away.roster)) {
      console.error('Invalid team roster data:', { home: !!home?.roster, away: !!away?.roster });
      return null;
    }

    if (home.roster.length === 0 || away.roster.length === 0) {
      console.warn('Empty roster detected:', { homeRoster: home.roster.length, awayRoster: away.roster.length });
    }

    // Calculate team strengths
    const calculateStrength = (roster) => {
      if (!roster.length) return 50;
      return roster.reduce((acc, p) => acc + (p.ovr || 50), 0) / roster.length;
    };

    const homeStrength = calculateStrength(home.roster);
    const awayStrength = calculateStrength(away.roster);

    // Calculate defensive strengths (for stat generation)
    const calculateDefenseStrength = (roster) => {
      const defenders = roster.filter(p => ['DL', 'LB', 'CB', 'S'].includes(p.pos));
      if (defenders.length === 0) return 70;
      return defenders.reduce((acc, p) => acc + (p.ovr || 50), 0) / defenders.length;
    };

    const homeDefenseStrength = calculateDefenseStrength(away.roster); // Opposing defense
    const awayDefenseStrength = calculateDefenseStrength(home.roster);

    // Add home advantage
    const HOME_ADVANTAGE = C.HOME_ADVANTAGE || 3;
    const BASE_SCORE_MIN = C.BASE_SCORE_MIN || 10;
    const BASE_SCORE_MAX = C.BASE_SCORE_MAX || 35;
    const SCORE_VARIANCE = C.SCORE_VARIANCE || 10;
    
    const strengthDiff = (homeStrength - awayStrength) + HOME_ADVANTAGE;

    // Simulate scores
    let homeScore = U.rand(BASE_SCORE_MIN, BASE_SCORE_MAX) + Math.round(strengthDiff / 5);
    let awayScore = U.rand(BASE_SCORE_MIN, BASE_SCORE_MAX) - Math.round(strengthDiff / 5);

    // Add randomness
    homeScore += U.rand(0, SCORE_VARIANCE);
    awayScore += U.rand(0, SCORE_VARIANCE);

    // Ensure scores are non-negative
    homeScore = Math.max(0, homeScore);
    awayScore = Math.max(0, awayScore);

    // Generate comprehensive stats for all players
    [home, away].forEach((team, teamIndex) => {
      const score = teamIndex === 0 ? homeScore : awayScore;
      const oppDefenseStrength = teamIndex === 0 ? homeDefenseStrength : awayDefenseStrength;
      const oppOffenseStrength = teamIndex === 0 ? awayStrength : homeStrength;
      
      // Initialize stats for all players
      team.roster.forEach(player => {
        initializePlayerStats(player);
        player.stats.game = {};
      });
      
      // Quarterback stats
      const qb = team.roster.find(p => p.pos === 'QB');
      if (qb) {
        Object.assign(qb.stats.game, generateQBStats(qb, score, oppDefenseStrength, U));
      }
      
      // Running back stats
      const rbs = team.roster.filter(p => p.pos === 'RB').slice(0, 2); // Top 2 RBs
      rbs.forEach((rb, index) => {
        // Distribute carries between RBs
        const share = index === 0 ? 0.7 : 0.3;
        const rbStats = generateRBStats(rb, score * share, oppDefenseStrength, U);
        // Scale down stats for backup RB
        if (index > 0) {
          Object.keys(rbStats).forEach(key => {
            if (typeof rbStats[key] === 'number') {
              rbStats[key] = Math.round(rbStats[key] * share);
            }
          });
        }
        Object.assign(rb.stats.game, rbStats);
      });
      
      // Wide receiver stats
      const wrs = team.roster.filter(p => p.pos === 'WR').slice(0, 4); // Top 4 WRs
      wrs.forEach((wr, index) => {
        const share = index === 0 ? 0.35 : index === 1 ? 0.25 : index === 2 ? 0.2 : 0.2;
        const wrStats = generateReceiverStats(wr, score * share, oppDefenseStrength, U);
        if (index > 0) {
          Object.keys(wrStats).forEach(key => {
            if (typeof wrStats[key] === 'number') {
              wrStats[key] = Math.round(wrStats[key] * share);
            }
          });
        }
        Object.assign(wr.stats.game, wrStats);
      });
      
      // Tight end stats
      const tes = team.roster.filter(p => p.pos === 'TE').slice(0, 2);
      tes.forEach((te, index) => {
        const share = index === 0 ? 0.7 : 0.3;
        const teStats = generateReceiverStats(te, score * share, oppDefenseStrength, U);
        if (index > 0) {
          Object.keys(teStats).forEach(key => {
            if (typeof teStats[key] === 'number') {
              teStats[key] = Math.round(teStats[key] * share);
            }
          });
        }
        Object.assign(te.stats.game, teStats);
      });
      
      // Offensive lineman stats
      const ols = team.roster.filter(p => p.pos === 'OL').slice(0, 5);
      ols.forEach(ol => {
        Object.assign(ol.stats.game, generateOLStats(ol, oppDefenseStrength, U));
      });
      
      // Defensive back stats
      const dbs = team.roster.filter(p => ['CB', 'S'].includes(p.pos));
      dbs.forEach(db => {
        Object.assign(db.stats.game, generateDBStats(db, oppOffenseStrength, U));
      });
      
      // Defensive lineman/linebacker stats
      const defenders = team.roster.filter(p => ['DL', 'LB'].includes(p.pos));
      defenders.forEach(defender => {
        Object.assign(defender.stats.game, generateDLStats(defender, oppOffenseStrength, U));
      });
      
      // Kicker stats
      const kicker = team.roster.find(p => p.pos === 'K');
      if (kicker) {
        Object.assign(kicker.stats.game, generateKickerStats(kicker, score, U));
      }
      
      // Punter stats
      const punter = team.roster.find(p => p.pos === 'P');
      if (punter) {
        Object.assign(punter.stats.game, generatePunterStats(punter, score, U));
      }
    });

    return { homeScore, awayScore };
    
  } catch (error) {
    console.error('Error in simGameStats:', error);
    return null;
  }
}

/**
 * Accumulate season stats into career stats for all players
 * @param {Object} league - League object
 */
function accumulateCareerStats(league) {
  if (!league || !league.teams) return;
  
  const year = league.year || new Date().getFullYear();
  
  league.teams.forEach(team => {
    if (!team.roster || !Array.isArray(team.roster)) return;
    
    team.roster.forEach(player => {
      // Record season OVR change
      if (window.recordSeasonOVR) {
        const ovrStart = player.seasonOVRStart || player.ovr || 0;
        const ovrEnd = player.ovr || 0;
        window.recordSeasonOVR(player, year, ovrStart, ovrEnd);
      }
      if (!player.stats || !player.stats.season) return;
      
      initializePlayerStats(player);
      
      const season = player.stats.season;
      const career = player.stats.career;
      
      // Accumulate all numeric season stats into career
      Object.keys(season).forEach(key => {
        const value = season[key];
        if (typeof value === 'number') {
          // For calculated fields, recalculate from totals
          if (key === 'completionPct') {
            const attempts = career.passAtt || 0;
            const completions = career.passComp || 0;
            if (attempts > 0) {
              career.completionPct = Math.round((completions / attempts) * 1000) / 10;
            }
          } else if (key === 'yardsPerCarry') {
            const carries = career.rushAtt || 0;
            const yards = career.rushYd || 0;
            if (carries > 0) {
              career.yardsPerCarry = Math.round((yards / carries) * 10) / 10;
            }
          } else if (key === 'yardsPerReception') {
            const receptions = career.receptions || 0;
            const yards = career.recYd || 0;
            if (receptions > 0) {
              career.yardsPerReception = Math.round((yards / receptions) * 10) / 10;
            }
          } else if (key === 'avgPuntYards') {
            const punts = career.punts || 0;
            const yards = career.puntYards || 0;
            if (punts > 0) {
              career.avgPuntYards = Math.round((yards / punts) * 10) / 10;
            }
          } else if (key === 'successPct') {
            const attempts = career.fgAttempts || 0;
            const made = career.fgMade || 0;
            if (attempts > 0) {
              career.successPct = Math.round((made / attempts) * 1000) / 10;
            }
          } else if (key.includes('Rating') || key.includes('Grade')) {
            // For ratings/grades, track average
            if (!career[key + 'Total']) career[key + 'Total'] = 0;
            if (!career[key + 'Games']) career[key + 'Games'] = 0;
            career[key + 'Total'] += value;
            career[key + 'Games'] += (season.gamesPlayed || 1);
            career[key] = Math.round((career[key + 'Total'] / Math.max(1, career[key + 'Games'])) * 10) / 10;
          } else {
            // Regular accumulation for totals
            career[key] = (career[key] || 0) + value;
          }
        }
      });
      
      // Update longest records (keep maximum)
      const longestFields = ['longestPass', 'longestRun', 'longestCatch', 'longestFG', 'longestPunt'];
      longestFields.forEach(field => {
        if (season[field] && season[field] > (career[field] || 0)) {
          career[field] = season[field];
        }
      });
    });
  });
}

/**
 * Starts the offseason period after the Super Bowl.
 * This allows users to resign players, sign free agents, and draft rookies
 * before starting the new season.
 */
function startOffseason() {
  try {
    const L = window.state?.league;
    if (!L) {
      console.error('No league loaded to start offseason');
      return;
    }

    // FIXED: Prevent multiple calls
    if (window.state.offseason === true) {
      console.log('Already in offseason, skipping');
      return;
    }

    console.log('Starting offseason...');
    
    // Set offseason flag IMMEDIATELY to prevent multiple calls
    window.state.offseason = true;
    window.state.offseasonYear = L.year;
    
    // Accumulate season stats into career stats for all players
    accumulateCareerStats(L);
    
    // Process salary cap rollover for each team
    if (typeof window.processCapRollover === 'function') {
      L.teams.forEach(team => {
        try {
          window.processCapRollover(L, team);
        } catch (error) {
          console.error('Error processing cap rollover for team', team?.abbr || team?.name, error);
        }
      });
    }
    
    // Recalculate cap for all teams after rollover
    if (typeof window.recalcAllTeamCaps === 'function') {
      window.recalcAllTeamCaps(L);
    } else if (typeof window.recalcCap === 'function') {
      L.teams.forEach(team => {
        try {
          window.recalcCap(L, team);
        } catch (error) {
          console.error('Error recalculating cap for team', team?.abbr || team?.name, error);
        }
      });
    }
    
    // Record coach rankings for the season
    if (typeof window.calculateAndRecordCoachRankings === 'function') {
      try {
        window.calculateAndRecordCoachRankings(L, L.year);
      } catch (error) {
        console.error('Error recording coach rankings:', error);
      }
    }
    
    // Calculate and award all season awards
    if (typeof window.calculateAllAwards === 'function') {
      try {
        console.log('Calculating season awards...');
        const awards = window.calculateAllAwards(L, L.year);
        console.log('Awards calculated:', awards);
      } catch (error) {
        console.error('Error calculating awards:', error);
      }
    }
    
    // Update all-time records
    if (typeof window.updateAllRecords === 'function') {
      try {
        window.updateAllRecords(L, L.year);
      } catch (error) {
        console.error('Error updating records:', error);
      }
    }
    
    // Process retirements
    if (typeof window.processRetirements === 'function') {
      try {
        const retirementResults = window.processRetirements(L, L.year);
        if (retirementResults.retired && retirementResults.retired.length > 0) {
          console.log(`Processed ${retirementResults.retired.length} retirements`);
        }
      } catch (error) {
        console.error('Error processing retirements:', error);
      }
    }

    // Run any offseason processing hooks (e.g., coaching stats)
    if (typeof window.runOffseason === 'function') {
      try {
        window.runOffseason();
      } catch (error) {
        console.error('Error in runOffseason:', error);
      }
    }
    
    // Update owner mode at season end
    if (window.state?.ownerMode?.enabled && typeof window.calculateRevenue === 'function' && typeof window.updateFanSatisfaction === 'function') {
      try {
        window.updateFanSatisfaction();
        window.calculateRevenue();
        if (typeof window.renderOwnerModeInterface === 'function') {
          window.renderOwnerModeInterface();
        }
      } catch (ownerError) {
        console.error('Error updating owner mode at season end:', ownerError);
      }
    }
    
    // Save state
    if (typeof window.saveState === 'function') {
      window.saveState();
    }
    
    // Show offseason message and navigate to hub
    if (typeof window.setStatus === 'function') {
      window.setStatus(`🏆 ${L.year} Season Complete! Entering Offseason - Resign players, sign free agents, and draft rookies before the ${L.year + 1} season.`, 'success', 10000);
    }
    
    // Navigate to hub and show offseason prompt
    if (window.location) {
      window.location.hash = '#/hub';
    }
    
    // Render hub to show offseason UI
    if (typeof window.renderHub === 'function') {
      setTimeout(() => {
        window.renderHub();
      }, 100);
    }
    
    // Update cap sidebar if available
    if (typeof window.updateCapSidebar === 'function') {
      window.updateCapSidebar();
    }
    
    console.log('Offseason started successfully');
  } catch (err) {
    console.error('Error starting offseason:', err);
    if (typeof window.setStatus === 'function') {
      window.setStatus(`Error starting offseason: ${err.message}`);
    }
  }
}

/**
 * Advances the game world to the next season.
 *
 * This function processes end-of-season operations, including salary cap rollover
 * (if available), incrementing the global year and season counters, resetting
 * team records and per-game stats, clearing playoff data, regenerating the
 * schedule, and updating the UI. It is safe to call multiple times but will
 * only perform actions when a league is loaded.
 */
function startNewSeason() {
  try {
    const L = window.state?.league;
    if (!L) {
      console.error('No league loaded to start new season');
      return;
    }

    // Clear offseason flag
    window.state.offseason = false;
    window.state.offseasonYear = null;

    // Increment global year and season counters
    window.state.year = (window.state.year || 2025) + 1;
    window.state.season = (window.state.season || 1) + 1;

    // Reset playoff data
    window.state.playoffs = null;

    // Update league year and season. Increment league.season for salary cap tracking.
    L.year = window.state.year;
    L.season = (L.season || 1) + 1;
    
    // Reset week and clear previous results
    L.week = 1;
    L.resultsByWeek = [];

    // Reset team records and clear per-game player stats
    L.teams.forEach(team => {
      team.record = { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
      if (team.roster) {
        team.roster.forEach(p => {
          if (p && p.stats && p.stats.game) {
            delete p.stats.game;
          }
          // Record starting OVR for season tracking
          if (p && p.ovr !== undefined) {
            p.seasonOVRStart = p.ovr;
          }
        });
      }
    });

    // Recalculate cap for all teams (in case of changes during offseason)
    if (typeof window.recalcAllTeamCaps === 'function') {
      window.recalcAllTeamCaps(L);
    } else if (typeof window.recalcCap === 'function') {
      L.teams.forEach(team => {
        try {
          window.recalcCap(L, team);
        } catch (error) {
          console.error('Error recalculating cap for team', team?.abbr || team?.name, error);
        }
      });
    }

    // Generate a new schedule for the upcoming season
    if (typeof window.makeSchedule === 'function') {
      try {
        L.schedule = window.makeSchedule(L.teams);
      } catch (schedErr) {
        console.error('Error generating new schedule:', schedErr);
      }
    }

    // Persist the updated state
    if (typeof window.saveState === 'function') window.saveState();

    // Refresh the UI for the new season
    if (typeof window.renderHub === 'function') window.renderHub();
    if (typeof window.setStatus === 'function') {
      window.setStatus(`Welcome to the ${window.state.year} season!`, 'success', 5000);
    }
    
    // Update cap sidebar if available
    if (typeof window.updateCapSidebar === 'function') {
      window.updateCapSidebar();
    }
  } catch (err) {
    console.error('Error starting new season:', err);
    if (typeof window.setStatus === 'function') {
      window.setStatus(`Error starting new season: ${err.message}`);
    }
  }
}

/**
 * Simulates all games for the current week in the league.
 */
function simulateWeek(options = {}) {
  try {
    // Validate all dependencies first
    if (!validateDependencies()) {
      return;
    }
    
    const L = window.state.league;

    // Enhanced validation
    if (!L) {
      console.error('No league available for simulation');
      window.setStatus('Error: No league loaded');
      return;
    }

    if (!L.schedule) {
      console.error('No schedule available for simulation');
      window.setStatus('Error: No schedule found');
      return;
    }

    // Handle both schedule formats (legacy compatibility)
    const scheduleWeeks = L.schedule.weeks || L.schedule;
    if (!scheduleWeeks || !Array.isArray(scheduleWeeks)) {
      console.error('Invalid schedule format for simulation');
      window.setStatus('Error: Invalid schedule format');
      return;
    }

    // Ensure week is properly initialized
    if (!L.week || typeof L.week !== 'number') {
      L.week = 1;
      console.log('Initialized league week to 1');
    }

    console.log(`Simulating week ${L.week}...`);
    window.setStatus(`Simulating week ${L.week}...`);

    // NEW SEASON PROGRESSION CHECK
    // If the regular season is over and a Super Bowl champion has been crowned,
    // transition to offseason instead of starting new season immediately.
    // FIXED: Add guard to prevent multiple calls
    if (window.state && window.state.playoffs && window.state.playoffs.winner && L.week > scheduleWeeks.length) {
      // Check if already in offseason to prevent multiple calls
      if (window.state.offseason === true) {
        console.log('Already in offseason, skipping transition');
        return;
      }
      
      console.log('Season complete, transitioning to offseason');
      window.setStatus('Season complete! Entering offseason...');
      
      // Set flag immediately to prevent multiple calls
      window.state.offseason = true;
      
      if (typeof window.startOffseason === 'function') {
        window.startOffseason();
      } else {
        // Fallback: start new season if offseason function doesn't exist
        if (typeof window.startNewSeason === 'function') {
          window.startNewSeason();
        }
      }
      return;
    }

    // Check if season is over
    if (L.week > scheduleWeeks.length) {
      console.log('Regular season complete, starting playoffs');
      window.setStatus('Regular season complete!');

      if (typeof window.startPlayoffs === 'function') {
        window.startPlayoffs();
      } else {
        // Fallback if playoffs not implemented
        window.setStatus('Season complete! Check standings.');
        if (window.location) {
          window.location.hash = '#/standings';
        }
      }
      return;
    }

    // Get current week's games
    const weekIndex = L.week - 1;
    const weekData = scheduleWeeks[weekIndex];

    if (!weekData) {
      console.error(`No data found for week ${L.week}`);
      window.setStatus(`Error: No data for week ${L.week}`);
      return;
    }

    const pairings = weekData.games || [];
    console.log(`Found ${pairings.length} games for week ${L.week}`);

    if (pairings.length === 0) {
      console.warn(`No games scheduled for week ${L.week}`);
      window.setStatus(`No games scheduled for week ${L.week}`);
      // Still advance the week
      L.week++;
      if (typeof window.renderHub === 'function') {
        window.renderHub();
      }
      return;
    }

    const results = [];
    let gamesSimulated = 0;
    const overrideResults = Array.isArray(options.overrideResults) ? options.overrideResults : [];
    const overrideLookup = new Map(
      overrideResults
        .filter(result => result && Number.isInteger(result.home) && Number.isInteger(result.away))
        .map(result => [`${result.home}-${result.away}`, result])
    );

    // Simulate each game
    pairings.forEach((pair, index) => {
      try {
        // Handle bye weeks
        if (pair.bye !== undefined) {
          results.push({
            id: `w${L.week}b${pair.bye}`,
            bye: pair.bye
          });
          return;
        }

        // Validate team indices
        if (!L.teams || !Array.isArray(L.teams)) {
          console.error('Invalid teams array in league');
          return;
        }
        
        const home = L.teams[pair.home];
        const away = L.teams[pair.away];

        if (!home || !away) {
          console.warn('Invalid team IDs in pairing:', pair);
          window.setStatus(`Warning: Invalid teams in game ${index + 1}`);
          return;
        }

        const overrideResult = overrideLookup.get(`${pair.home}-${pair.away}`);
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
          // Simulate the game
          const gameScores = simGameStats(home, away);
          
          if (!gameScores) {
            console.error(`Failed to simulate game ${index + 1}`);
            return;
          }
          
          sH = gameScores.homeScore;
          sA = gameScores.awayScore;

          // Capture player stats BEFORE accumulating (snapshot for box score)
          const capturePlayerStats = (roster) => {
            const playerStats = {};
            roster.forEach(player => {
              if (player && player.stats && player.stats.game) {
                playerStats[player.id] = {
                  name: player.name,
                  pos: player.pos,
                  stats: JSON.parse(JSON.stringify(player.stats.game)) // Deep copy
                };
              }
            });
            return playerStats;
          };
          
          homePlayerStats = capturePlayerStats(home.roster);
          awayPlayerStats = capturePlayerStats(away.roster);

          // Update player season stats from game stats (AFTER capturing for box score)
          const updatePlayerStats = (roster) => {
            if (!Array.isArray(roster)) return;
            
            roster.forEach(p => {
              if (p && p.stats && p.stats.game) {
                initializePlayerStats(p);
                
                // Accumulate game stats into season stats
                Object.keys(p.stats.game).forEach(key => {
                  const value = p.stats.game[key];
                  if (typeof value === 'number') {
                    // For averages/percentages, we'll recalculate at season end
                    // For totals, just add them up
                    if (key.includes('Pct') || key.includes('Grade') || key.includes('Rating') || 
                        key === 'yardsPerCarry' || key === 'yardsPerReception' || key === 'avgPuntYards' ||
                        key === 'avgKickYards' || key === 'completionPct') {
                      // These are calculated fields, don't accumulate
                      return;
                    }
                    p.stats.season[key] = (p.stats.season[key] || 0) + value;
                  }
                });
                
                // Track games played
                if (!p.stats.season.gamesPlayed) p.stats.season.gamesPlayed = 0;
                p.stats.season.gamesPlayed++;
              }
            });
          };
          
          updatePlayerStats(home.roster);
          updatePlayerStats(away.roster);
        }
        
        // Store game result with complete box score
        results.push({
          id: `w${L.week}g${index}`,
          home: pair.home,
          away: pair.away,
          scoreHome: sH,
          scoreAway: sA,
          homeWin: sH > sA,
          week: L.week,
          year: L.year,
          homeTeamName: home.name,
          awayTeamName: away.name,
          homeTeamAbbr: home.abbr,
          awayTeamAbbr: away.abbr,
          boxScore: {
            home: homePlayerStats,
            away: awayPlayerStats
          }
        });

        // Create a game object with the actual teams to pass to applyResult
        const game = { home: home, away: away };
        applyResult(game, sH, sA);
        gamesSimulated++;

        console.log(`${away.name || `Team ${pair.away}`} ${sA} @ ${home.name || `Team ${pair.home}`} ${sH}`);
        
      } catch (gameError) {
        console.error(`Error simulating game ${index + 1}:`, gameError);
        window.setStatus(`Error in game ${index + 1}: ${gameError.message}`);
      }
    });

    // Store results for the week
    if (!L.resultsByWeek) L.resultsByWeek = {};
    L.resultsByWeek[L.week - 1] = results;

    // Update single game records
    if (typeof window.updateSingleGameRecords === 'function') {
      try {
        window.updateSingleGameRecords(L, L.year || L.season || 2025, L.week);
      } catch (recordsError) {
        console.error('Error updating single game records:', recordsError);
      }
    }

    // Advance to next week
    const previousWeek = L.week;
    L.week++;

    // Run weekly training if available
    if (typeof window.runWeeklyTraining === 'function') {
      try {
        window.runWeeklyTraining(L);
      } catch (trainingError) {
        console.error('Error in weekly training:', trainingError);
        // Don't stop simulation for training errors
      }
    }

    // Process weekly depth chart updates (playbook knowledge, chemistry)
    if (typeof window.processWeeklyDepthChartUpdates === 'function') {
      try {
        L.teams.forEach(team => {
          if (team && team.roster) {
            window.processWeeklyDepthChartUpdates(team);
          }
        });
      } catch (depthChartError) {
        console.error('Error in depth chart updates:', depthChartError);
        // Don't stop simulation for depth chart errors
      }
    }

    console.log(`Week ${previousWeek} simulation complete - ${gamesSimulated} games simulated`);

    // Update owner mode revenue and fan satisfaction after games
    if (window.state?.ownerMode?.enabled && typeof window.calculateRevenue === 'function' && typeof window.updateFanSatisfaction === 'function') {
      try {
        window.updateFanSatisfaction();
        window.calculateRevenue();
      } catch (ownerError) {
        console.error('Error updating owner mode:', ownerError);
      }
    }

    // Update UI to show results
    try {
      if (typeof window.renderHub === 'function') {
        window.renderHub();
      }
      if (typeof window.updateCapSidebar === 'function') {
        window.updateCapSidebar();
      }

      // Show success message
      window.setStatus(`Week ${previousWeek} simulated - ${gamesSimulated} games completed`);

      // Auto-show results on hub
      if (window.location && window.location.hash !== '#/hub') {
        window.location.hash = '#/hub';
      }

    } catch (uiError) {
      console.error('Error updating UI after simulation:', uiError);
      window.setStatus(`Week simulated but UI update failed`);
    }

  } catch (error) {
    console.error('Error in simulateWeek:', error);
    window.setStatus(`Simulation error: ${error.message}`);
  }
}

// ============================================================================
// ES MODULE EXPORTS
// ============================================================================

export {
  simulateWeek,
  simGameStats,
  applyResult,
  startOffseason,
  startNewSeason,
  initializePlayerStats,
  accumulateCareerStats
};

// ============================================================================
// BACKWARD COMPATIBILITY SHIMS
// ============================================================================
// TODO: Remove these once all code is migrated to ES modules

if (typeof window !== 'undefined') {
  window.simulateWeek = simulateWeek;
  window.simGameStats = simGameStats;
  window.applyResult = applyResult;
  window.startOffseason = startOffseason;
  window.startNewSeason = startNewSeason;
  window.initializePlayerStats = initializePlayerStats;
  window.accumulateCareerStats = accumulateCareerStats;
}
