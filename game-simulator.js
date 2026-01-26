// game-simulator.js - Core Game Logic Module
import { Utils } from './utils.js';
import { getCoachingMods } from './coach-system.js';
import { updateAdvancedStats, getZeroStats } from './player.js'; // Ensure getZeroStats is imported

// 1. Helper to determine if a player can play (not injured)
function canPlayerPlay(player) {
  if (!player) return false;
  // If injuryWeeks is > 0, they are out
  return !(player.injuryWeeks && player.injuryWeeks > 0);
}

// 2. Helper to group players by position
function groupPlayersByPosition(roster) {
  const groups = {};
  roster.forEach(p => {
    if (!groups[p.pos]) groups[p.pos] = [];
    groups[p.pos].push(p);
  });
  return groups;
}

// 3. Helper to get positional rating
function getPosRating(groups, pos, count = 1) {
  if (!groups[pos]) return 50;
  // Sort by OVR desc, take top 'count'
  // Only consider active players
  const active = groups[pos].filter(canPlayerPlay).sort((a, b) => b.ovr - a.ovr);
  if (active.length === 0) return 40; // Penalty for no players at position

  let sum = 0;
  let taken = 0;
  for (let i = 0; i < Math.min(count, active.length); i++) {
    sum += active[i].ovr;
    taken++;
  }
  return sum / taken;
}

// 4. Calculate effective team ratings for the game
function getEffectiveRating(team) {
    if (!team || !team.roster) return { off: 70, def: 70, ovr: 70 };

    const groups = groupPlayersByPosition(team.roster);

    // Offense Weights
    const qb = getPosRating(groups, 'QB', 1);
    const rb = getPosRating(groups, 'RB', 2);
    const wr = getPosRating(groups, 'WR', 3);
    const ol = getPosRating(groups, 'OL', 5);

    const offRating = (qb * 0.35) + (rb * 0.15) + (wr * 0.25) + (ol * 0.25);

    // Defense Weights
    const dl = getPosRating(groups, 'DL', 4);
    const lb = getPosRating(groups, 'LB', 3);
    const db = getPosRating(groups, 'CB', 3); // mixed CB/S
    const s = getPosRating(groups, 'S', 2);

    // Combine secondary
    const secondary = (db * 0.6) + (s * 0.4);

    const defRating = (dl * 0.35) + (lb * 0.30) + (secondary * 0.35);

    return {
        off: offRating,
        def: defRating,
        ovr: (offRating + defRating) / 2
    };
}

// 5. Initialize Stats Object for a Player
function initializePlayerStats(player) {
    if (!player.stats) player.stats = {};

    // Ensure season stats exist
    if (!player.stats.season) {
        player.stats.season = getZeroStats ? getZeroStats() : {};
    }

    // Ensure career stats exist
    if (!player.stats.career) {
        player.stats.career = getZeroStats ? getZeroStats() : {};
    }

    // Always reset game stats for the new game
    player.stats.game = getZeroStats ? getZeroStats() : {};
}

// 6. Accumulate source stats into target stats
function accumulateStats(source, target) {
    if (!source || !target) return;

    Object.keys(source).forEach(key => {
        if (typeof source[key] === 'number') {
            target[key] = (target[key] || 0) + source[key];
        }
    });

    // Recalculate derived stats
    if (target.passAtt > 0) {
        target.completionPct = (target.passComp / target.passAtt) * 100;
    }
    if (target.rushAtt > 0) {
        target.yardsPerCarry = target.rushYd / target.rushAtt;
    }
}


// --- MAIN SIMULATION FUNCTION ---
function simGameStats(homeTeam, awayTeam) {
    // 1. Setup Validation
    if (!homeTeam || !awayTeam) return null;

    // Initialize stats containers for all players
    if (homeTeam.roster) homeTeam.roster.forEach(initializePlayerStats);
    if (awayTeam.roster) awayTeam.roster.forEach(initializePlayerStats);

    // Initialize team game stats
    if (!homeTeam.stats) homeTeam.stats = {};
    homeTeam.stats.game = getZeroStats();

    if (!awayTeam.stats) awayTeam.stats = {};
    awayTeam.stats.game = getZeroStats();

    // 2. Get Ratings & Mods
    const homeRat = getEffectiveRating(homeTeam);
    const awayRat = getEffectiveRating(awayTeam);

    const homeMods = getCoachingMods(homeTeam.staff);
    const awayMods = getCoachingMods(awayTeam.staff);

    // Apply coaching mods to ratings
    // (Example: Blitz Happy DC increases Def rating but might allow big plays)
    // Simplified: Just use modifiers to adjust effective ratings slightly
    if (homeMods.passVolume) homeRat.off *= 1.0; // Placeholder for strategy impact

    // 3. Determine Possession Count (Pace)
    // Average NFL game is ~12 possessions per team
    const basePossessions = 12;
    const possessions = Math.floor(basePossessions + (Math.random() * 4 - 2)); // 10-14

    let homeScore = 0;
    let awayScore = 0;

    // 4. Simulate Possessions
    for (let i = 0; i < possessions; i++) {
        homeScore += simPossession(homeTeam, awayTeam, homeRat.off, awayRat.def, homeMods, awayMods, true);
        awayScore += simPossession(awayTeam, homeTeam, awayRat.off, homeRat.def, awayMods, homeMods, false);
    }

    // OT Check (Regular Season only? Logic handled by caller usually, but let's resolve ties for simplicity if desired)
    // For now, allow ties in regular season logic, but playoffs will need a winner.
    // This function just returns scores.

    return {
        homeScore,
        awayScore,
        possessions
    };
}

// Helper: Simulate a single possession
function simPossession(offTeam, defTeam, offRating, defRating, offMods, defMods, isHome) {
    // Basic success probability
    // Delta of 10 points = ~60% win rate per drive?
    // NFL points per drive avg is ~2.0

    const ratingDelta = offRating - defRating + (isHome ? 2 : 0); // Home field advantage
    const basePoints = 2.0;
    const potentialPoints = basePoints + (ratingDelta * 0.05);

    // Random fluctuation
    const roll = Math.random() * 100;

    // Determine outcome type
    // TD: ~20-25%, FG: ~15-20%, Punt/TO: ~50-60%

    // Adjusted thresholds based on rating
    let tdThresh = 25 + (ratingDelta * 0.5);
    let fgThresh = 45 + (ratingDelta * 0.5);

    // Apply coaching mods
    if (offMods.passVolume > 1.1) tdThresh += 2; // Aggressive
    if (defMods.sackChance > 1.1) tdThresh -= 2; // Good defense

    let points = 0;
    let driveType = 'punt'; // punt, td, fg, turnover

    if (roll < tdThresh) {
        points = 7;
        driveType = 'td';
    } else if (roll < fgThresh) {
        points = 3;
        driveType = 'fg';
    } else if (roll > 95 - (ratingDelta * 0.1)) {
        // Turnover?
        driveType = 'turnover';
    }

    // Distribute Stats
    distributeStats(offTeam, defTeam, driveType, offMods, defMods);

    return points;
}

// Helper: Distribute stats to players based on drive outcome
function distributeStats(offTeam, defTeam, driveType, offMods, defMods) {
    if (!offTeam.roster || !defTeam.roster) return;

    const groups = groupPlayersByPosition(offTeam.roster);

    // Identify key players
    const qb = groups['QB'] ? groups['QB'][0] : null;
    const rbs = groups['RB'] || [];
    const wrs = (groups['WR'] || []).concat(groups['TE'] || []);

    if (!qb) return; // Need a QB

    // Determine play mix (Run vs Pass)
    let passProb = 0.58;
    if (offMods.passVolume) passProb *= offMods.passVolume;
    if (offMods.runVolume) passProb /= offMods.runVolume;

    const isPass = Math.random() < passProb;

    // --- OFFENSE STATS ---

    if (isPass) {
        // Passing Play
        qb.stats.game.passAtt = (qb.stats.game.passAtt || 0) + 1;

        if (driveType === 'turnover' && Math.random() > 0.5) {
            // Interception
            qb.stats.game.interceptions = (qb.stats.game.interceptions || 0) + 1;
        } else {
             // Completion check
             const compChance = 0.65; // Base
             if (Math.random() < compChance || driveType === 'td' || driveType === 'fg') {
                 qb.stats.game.passComp = (qb.stats.game.passComp || 0) + 1;

                 // Yards
                 const yards = Math.floor(Math.random() * 20) + 5; // simplified
                 qb.stats.game.passYd = (qb.stats.game.passYd || 0) + yards;

                 // Receiver
                 if (wrs.length > 0) {
                     const target = wrs[Math.floor(Math.random() * wrs.length)];
                     initializePlayerStats(target);
                     target.stats.game.receptions = (target.stats.game.receptions || 0) + 1;
                     target.stats.game.recYd = (target.stats.game.recYd || 0) + yards;

                     if (driveType === 'td') {
                         target.stats.game.recTD = (target.stats.game.recTD || 0) + 1;
                         qb.stats.game.passTD = (qb.stats.game.passTD || 0) + 1;
                     }
                 }
             }
        }
    } else {
        // Run Play
        if (rbs.length > 0) {
            const runner = rbs[0]; // Lead back
            initializePlayerStats(runner);
            runner.stats.game.rushAtt = (runner.stats.game.rushAtt || 0) + 1;

            const yards = Math.floor(Math.random() * 10) + 1; // simplified
            runner.stats.game.rushYd = (runner.stats.game.rushYd || 0) + yards;

            if (driveType === 'td') {
                runner.stats.game.rushTD = (runner.stats.game.rushTD || 0) + 1;
            }
        }
    }

    // --- DEFENSE STATS ---
    // Randomly award tackles/sacks
    const defGroups = groupPlayersByPosition(defTeam.roster);
    const defPlayers = (defGroups['DL'] || []).concat(defGroups['LB'] || []).concat(defGroups['CB'] || []).concat(defGroups['S'] || []);

    if (defPlayers.length > 0) {
        const tackler = defPlayers[Math.floor(Math.random() * defPlayers.length)];
        initializePlayerStats(tackler);
        tackler.stats.game.tackles = (tackler.stats.game.tackles || 0) + 1;

        if (driveType === 'turnover' && isPass) {
            // INT
             const db = (defGroups['CB'] || []).concat(defGroups['S'] || [])[0];
             if (db) {
                 initializePlayerStats(db);
                 db.stats.game.interceptions = (db.stats.game.interceptions || 0) + 1;
             }
        }
    }
}

// 7. Update Team Records (Wins/Losses)
function applyResult(game, homeScore, awayScore) {
    if (!game.home || !game.away) return;

    const h = game.home;
    const a = game.away;

    // Update Points
    // Check if properties exist, initialize if not (though makeLeague should have done this)
    if (h.ptsFor === undefined) h.ptsFor = 0;
    if (h.ptsAgainst === undefined) h.ptsAgainst = 0;
    if (a.ptsFor === undefined) a.ptsFor = 0;
    if (a.ptsAgainst === undefined) a.ptsAgainst = 0;

    h.ptsFor += homeScore;
    h.ptsAgainst += awayScore;
    a.ptsFor += awayScore;
    a.ptsAgainst += homeScore;

    // Legacy record update
    if (!h.record) h.record = { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
    if (!a.record) a.record = { w: 0, l: 0, t: 0, pf: 0, pa: 0 };

    h.record.pf += homeScore;
    h.record.pa += awayScore;
    a.record.pf += awayScore;
    a.record.pa += homeScore;

    // Update W-L-T
    if (homeScore > awayScore) {
        h.wins = (h.wins || 0) + 1;
        a.losses = (a.losses || 0) + 1;
        h.record.w++;
        a.record.l++;
    } else if (awayScore > homeScore) {
        a.wins = (a.wins || 0) + 1;
        h.losses = (h.losses || 0) + 1;
        a.record.w++;
        h.record.l++;
    } else {
        h.ties = (h.ties || 0) + 1;
        a.ties = (a.ties || 0) + 1;
        h.record.t++;
        a.record.t++;
    }
}

// 8. Update team standings (Global Helper)
function updateTeamStandings(team) {
    // This is handled by applyResult now, but kept for compatibility if needed
}

// --- NEW UNIFIED SIMULATOR ---
function simulateMatchup(homeTeam, awayTeam, context = 'season') {
    // 1. Run the core simulation
    const result = simGameStats(homeTeam, awayTeam);

    if (!result) return null;

    // 2. Accumulate stats
    const updateStats = (team) => {
        if (!team.roster) return;
        team.roster.forEach(p => {
            if (p.stats && p.stats.game) {
                // Determine target bucket
                let target = p.stats.season;
                if (context === 'playoff') {
                    if (!p.stats.playoffs) p.stats.playoffs = getZeroStats();
                    target = p.stats.playoffs;
                }

                accumulateStats(p.stats.game, target);

                // Track games
                if (!target.gamesPlayed) target.gamesPlayed = 0;
                target.gamesPlayed++;

                // Advanced Stats (War, etc)
                if (updateAdvancedStats) {
                    updateAdvancedStats(p, target);
                }
            }
        });
    };

    updateStats(homeTeam);
    updateStats(awayTeam);

    // 3. Return full result object
    return {
        home: homeTeam,
        away: awayTeam,
        homeScore: result.homeScore,
        awayScore: result.awayScore
    };
}


const GameSimulator = {
  simGameStats,
  applyResult,
  initializePlayerStats,
  accumulateStats,
  groupPlayersByPosition,
  simulateMatchup, // New export
  updateTeamStandings
};

export default GameSimulator;
export { simGameStats, applyResult, initializePlayerStats, accumulateStats, groupPlayersByPosition, simulateMatchup, updateTeamStandings };

// Legacy window support
if (typeof window !== 'undefined') {
    window.simGameStats = simGameStats;
    window.applyResult = applyResult;
    window.initializePlayerStats = initializePlayerStats;
    window.groupPlayersByPosition = groupPlayersByPosition;
    window.simulateMatchup = simulateMatchup;
}
