/*
 * Game Simulator Module
 * Core game simulation logic extracted from simulation.js
 */

import { Utils as U } from './utils.js';
import { Constants as C } from './constants.js';
import { calculateGamePerformance, getCoachingMods } from './coach-system.js';
import { updateAdvancedStats, getZeroStats, updatePlayerGameLegacy, calculateMorale } from './player.js';
import { getStrategyModifiers } from './strategy.js';
import { getEffectiveRating, canPlayerPlay, generateInjury } from './injury-core.js';
import { calculateTeamRatingWithSchemeFit } from './scheme-core.js';
import { TRAITS } from './traits.js';

/**
 * Helper to group players by position and sort by OVR descending.
 * @param {Array} roster - Team roster array
 * @returns {Object} Map of position -> sorted array of players
 */
export function groupPlayersByPosition(roster) {
  const groups = {};
  if (!roster) return groups;
  for (let i = 0; i < roster.length; i++) {
    const player = roster[i];
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
 * Helper to get cached groups from team object.
 * Caches groups on team object keyed by league week.
 * @param {Object} team - Team object
 * @param {Object} league - League object (for current week)
 * @returns {Object} Map of position -> sorted array of players (full roster)
 */
function getCachedGroups(team, league) {
  if (!team || !team.roster) return {};

  const currentWeek = league ? league.week : undefined;

  // Check cache validity
  if (league && team._cachedGroups && team._cachedGroupsWeek === currentWeek) {
    return team._cachedGroups;
  }

  // Compute groups
  const groups = groupPlayersByPosition(team.roster);

  // Cache if league context is available
  if (league) {
    Object.defineProperty(team, '_cachedGroups', {
      value: groups,
      writable: true,
      configurable: true,
      enumerable: false
    });
    Object.defineProperty(team, '_cachedGroupsWeek', {
      value: currentWeek,
      writable: true,
      configurable: true,
      enumerable: false
    });
  }

  return groups;
}

/**
 * Helper to get active roster groups and flattened active roster.
 * Uses cached full groups and filters by injury status.
 * @param {Object} team - Team object
 * @param {Object} league - League object
 * @returns {Object} { active: Array, groups: Object }
 */
function getActiveGroups(team, league) {
  const fullGroups = getCachedGroups(team, league);
  const active = [];
  const groups = {};

  const positions = Object.keys(fullGroups);
  for (let j = 0; j < positions.length; j++) {
    const pos = positions[j];
    const activeInPos = [];
    const fullGroup = fullGroups[pos];
    for (let i = 0; i < fullGroup.length; i++) {
        const p = fullGroup[i];
        if (canPlayerPlay(p)) {
            activeInPos.push(p);
            active.push(p);
        }
    }
    groups[pos] = activeInPos;
  }

  return { active, groups };
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

    // Helper to sum stats across all players on a team.
    // capturePlayerStats creates flat objects { name, pos, passYd, ... } so
    // we access the stat directly on p rather than through p.stats.
    const sumStat = (teamStats, statName) => {
        if (!teamStats || !teamStats.players) return 0;
        return Object.values(teamStats.players).reduce((sum, p) => sum + (p[statName] || 0), 0);
    };

    // Helper to check for big plays (simplistic check on longest)
    const hasBigPlay = (teamStats) => {
        if (!teamStats || !teamStats.players) return false;
        return Object.values(teamStats.players).some(p => (p.longestPass > 45) || (p.longestRun > 35));
    };

    // Helper to find the top performer at a given position from a team's stats map
    const getTopPlayer = (teamStats, posFilter, statName) => {
        if (!teamStats || !teamStats.players) return null;
        let best = null;
        let bestVal = 0;
        for (const p of Object.values(teamStats.players)) {
            const passes = posFilter ? posFilter(p.pos) : true;
            if (passes && (p[statName] || 0) > bestVal) {
                bestVal = p[statName];
                best = p;
            }
        }
        return best;
    };

    const isQB = pos => pos === 'QB';
    const isRB = pos => pos === 'RB';
    const isWRTE = pos => pos === 'WR' || pos === 'TE';
    const isDef = pos => pos === 'DL' || pos === 'LB' || pos === 'CB' || pos === 'S';

    const userRushYds = sumStat(userStats, 'rushYd');
    const userPassYds = sumStat(userStats, 'passYd');
    const userTurnovers = sumStat(userStats, 'interceptions') + sumStat(userStats, 'fumbles');
    const userSacks = sumStat(userStats, 'sacksAllowed'); // sacks allowed by offense
    const userDefSacks = sumStat(userStats, 'sacks');    // sacks made by defense
    const userBigPlays = hasBigPlay(userStats);
    const userTotalYds = userPassYds + userRushYds;
    const userPassTDs = sumStat(userStats, 'passTD');
    const userDefInts = sumStat(userStats, 'interceptions'); // user DEF interceptions

    const oppRushYds = sumStat(oppStats, 'rushYd');
    const oppPassYds = sumStat(oppStats, 'passYd');
    const oppTurnovers = sumStat(oppStats, 'interceptions') + sumStat(oppStats, 'fumbles');

    const scoreDiff = Math.abs(userScore - oppScore);
    const isBlowout = scoreDiff >= 21;
    const isClose = scoreDiff <= 7;
    const isOT = (userScore !== oppScore) && (userScore > 0) && (oppScore > 0) &&
                  (userScore + oppScore > 0) && context._wasOT; // flag set below if applicable

    // Named player helpers
    const topPasser = getTopPlayer(userStats, isQB, 'passYd');
    const topRusher = getTopPlayer(userStats, isRB, 'rushYd');
    const topReceiver = getTopPlayer(userStats, isWRTE, 'recYd');
    const topDefender = getTopPlayer(userStats, isDef, 'sacks') ||
                        getTopPlayer(userStats, isDef, 'tackles');
    const userAbbr = context.userTeamAbbr || 'your team';
    const oppAbbr = context.oppTeamAbbr || 'the opponent';

    // 1. Matchup Callbacks
    if (matchup) {
        if (matchup.toLowerCase().includes("passing") && userPassYds > 275) {
            const name = topPasser ? topPasser.name.split(' ').pop() : 'the QB';
            callbacks.push(`${name} exploited the favorable passing matchup with ${userPassYds} yards through the air.`);
        } else if (matchup.toLowerCase().includes("passing") && userPassYds < 175) {
            callbacks.push(`Despite a favorable passing matchup, ${userAbbr}'s air attack never got going (${userPassYds} yds).`);
        } else if (matchup.toLowerCase().includes("rushing") && userRushYds > 160) {
            const name = topRusher ? topRusher.name.split(' ').pop() : 'the run game';
            callbacks.push(`${name} ran all over their weak run defense — ${userRushYds} rushing yards.`);
        } else if (matchup.toLowerCase().includes("rushing") && userRushYds < 60) {
            callbacks.push(`The run game failed to capitalize despite the favorable matchup (${userRushYds} rushing yds).`);
        }
    }

    // 2. Offensive Strategy Callbacks
    if (offPlanId === 'AGGRESSIVE_PASSING') {
        if (userPassYds > 300) {
            const name = topPasser ? topPasser.name.split(' ').pop() : 'the QB';
            callbacks.push(`Aggressive passing paid off — ${name} carved them up for ${userPassYds} yards.`);
        } else if (userTurnovers >= 3) {
            callbacks.push(`Going aggressive through the air backfired with ${userTurnovers} costly turnovers.`);
        } else if (userPassTDs >= 3) {
            callbacks.push(`The aggressive air attack found paydirt ${userPassTDs} times today.`);
        }
    } else if (offPlanId === 'BALL_CONTROL') {
        if (userRushYds > 150 && won) {
            const name = topRusher ? topRusher.name.split(' ').pop() : 'the backfield';
            callbacks.push(`${name} wore them down — ${userRushYds} rushing yards made ball control the perfect call.`);
        } else if (userScore < 14) {
            callbacks.push(`Ball-control backfired — the conservative offense couldn't generate points.`);
        } else if (userRushYds > 120) {
            callbacks.push(`Ground-and-pound kept the chains moving with ${userRushYds} rushing yards.`);
        }
    } else if (offPlanId === 'PROTECT_QB') {
        if (userSacks === 0) {
            callbacks.push(`Protection schemes worked flawlessly — the QB was never sacked.`);
        } else if (userSacks >= 4) {
            callbacks.push(`The pocket collapsed despite prioritizing QB protection (${userSacks} sacks allowed).`);
        } else if (userSacks <= 1 && userPassYds > 250) {
            callbacks.push(`Clean pocket led to a sharp passing performance with ${userPassYds} yards.`);
        }
    } else if (offPlanId === 'FEED_STAR') {
        const starId = context.starTargetId;
        const starName = context.starPlayerName;
        // Find the star's stats in the user's player map
        let starStats = null;
        if (starId && userStats && userStats.players) {
            starStats = userStats.players[String(starId)];
        }
        if (starStats) {
            const totalStarYds = (starStats.recYd || 0) + (starStats.rushYd || 0);
            const starTDs = (starStats.recTD || 0) + (starStats.rushTD || 0);
            const displayName = (starName || (starStats.name || 'the star')).split(' ').pop();
            if (totalStarYds > 120 || starTDs >= 2) {
                callbacks.push(`Feeding ${displayName} paid dividends — ${totalStarYds} yards${starTDs > 0 ? ` and ${starTDs} TD${starTDs > 1 ? 's' : ''}` : ''} today.`);
            } else if (totalStarYds < 50) {
                callbacks.push(`${displayName} was well-covered and couldn't get untracked (${totalStarYds} yds).`);
            } else {
                callbacks.push(`${displayName} was a steady presence with ${totalStarYds} yards.`);
            }
        } else if (starName) {
            callbacks.push(`The game plan revolved around ${starName.split(' ').pop()}, with mixed results.`);
        }
    }

    // 3. Defensive Strategy Callbacks
    if (defPlanId === 'BLITZ_HEAVY') {
        if (userDefSacks >= 4) {
            callbacks.push(`The blitz was relentless — ${userDefSacks} sacks left their QB rattled.`);
        } else if (oppScore > 28) {
            callbacks.push(`Blitzing backfired badly; ${oppAbbr} found the open receivers for ${oppScore} points.`);
        } else if (userDefSacks >= 2 && oppTurnovers >= 2) {
            callbacks.push(`Pressure and takeaways: the blitz scheme created chaos in ${oppAbbr}'s backfield.`);
        }
    } else if (defPlanId === 'SELL_OUT_RUN') {
        if (oppPassYds > 280) {
            callbacks.push(`Stacking the box opened up the air — ${oppAbbr} threw for ${oppPassYds} yards over the top.`);
        } else if (oppRushYds < 60) {
            callbacks.push(`Selling out to stop the run worked: ${oppAbbr} held to ${oppRushYds} rushing yards.`);
        } else if (oppRushYds < 100 && oppPassYds < 200) {
            callbacks.push(`Run-stop focus kept ${oppAbbr} one-dimensional all afternoon.`);
        }
    } else if (defPlanId === 'DISGUISE_COVERAGE') {
        if (userDefInts >= 2) {
            callbacks.push(`Mixed coverages paid off — the defense forced ${userDefInts} interceptions.`);
        } else if (oppPassYds > 280) {
            callbacks.push(`${oppAbbr}'s QB solved the disguised looks and threw for ${oppPassYds} yards.`);
        } else if (oppTurnovers >= 2) {
            callbacks.push(`Confusing looks created ${oppTurnovers} turnovers and kept the offense off-balance.`);
        }
    } else if (defPlanId === 'ZONE_COVERAGE') {
        if (oppPassYds < 180) {
            callbacks.push(`Zone coverage smothered ${oppAbbr}'s passing attack (${oppPassYds} yds allowed).`);
        } else if (oppPassYds > 300) {
            callbacks.push(`Zone had too many holes today — ${oppAbbr} found space for ${oppPassYds} passing yards.`);
        }
    }

    // 4. Risk Profile Callbacks
    if (riskId === 'AGGRESSIVE') {
        if (userBigPlays && won) {
            callbacks.push(`High-risk football paid off — explosive plays were the difference.`);
        } else if (userTurnovers >= 3) {
            callbacks.push(`Gambling backfired: ${userTurnovers} turnovers handed ${oppAbbr} momentum they never gave back.`);
        } else if (userBigPlays && !won) {
            callbacks.push(`Big plays were there, but too many mistakes allowed ${oppAbbr} to hang around.`);
        }
    } else if (riskId === 'CONSERVATIVE') {
        if (won && userTurnovers === 0) {
            callbacks.push(`Mistake-free football — zero turnovers and steady execution sealed the win.`);
        } else if (!won && userScore < 17) {
            callbacks.push(`Playing it safe stalled the offense; ${userAbbr} couldn't generate enough firepower.`);
        } else if (won && scoreDiff <= 6) {
            callbacks.push(`Conservative execution was enough to grind out a close one.`);
        }
    }

    // 5. Score-context Callbacks (close games, blowouts, OT, standout performances)
    if (isBlowout && won) {
        if (userTotalYds > 400) {
            callbacks.push(`Dominant from start to finish — ${userTotalYds} total yards in a ${userScore}-${oppScore} blowout.`);
        } else {
            callbacks.push(`${userAbbr} was in full control all day, winning by ${scoreDiff} points.`);
        }
    } else if (isBlowout && !won) {
        callbacks.push(`A forgettable day — ${oppAbbr} dominated and won by ${scoreDiff} points.`);
    } else if (isClose && won) {
        if (topPasser && (topPasser.passYd || 0) > 250) {
            callbacks.push(`${topPasser.name.split(' ').pop()} came through when it mattered — ${topPasser.passYd} yards in a ${userScore}-${oppScore} nail-biter.`);
        } else {
            callbacks.push(`A gutsy ${userScore}-${oppScore} win — ${userAbbr} found a way to close it out.`);
        }
    } else if (isClose && !won) {
        callbacks.push(`Heartbreaker — ${userAbbr} fell by just ${scoreDiff} points.`);
    }

    // 6. Individual standout callbacks (only when no other context covered performance)
    if (callbacks.length < 2) {
        if (topReceiver && (topReceiver.recYd || 0) > 130) {
            const tds = topReceiver.recTD || 0;
            callbacks.push(`${topReceiver.name.split(' ').pop()} was impossible to stop: ${topReceiver.recYd} yards${tds > 0 ? `, ${tds} TD` : ''}.`);
        } else if (topRusher && (topRusher.rushYd || 0) > 120) {
            const tds = topRusher.rushTD || 0;
            callbacks.push(`${topRusher.name.split(' ').pop()} carried the load with ${topRusher.rushYd} rushing yards${tds > 0 ? ` and ${tds} TD${tds > 1 ? 's' : ''}` : ''}.`);
        } else if (topDefender && (topDefender.sacks || 0) >= 2) {
            callbacks.push(`${topDefender.name.split(' ').pop()} wrecked the game plan — ${topDefender.sacks} sacks.`);
        }
    }

    // 7. Stakes Callbacks
    if (stakes && stakes > 50) {
        if (won) {
            callbacks.push(`${stakes >= 90 ? 'Season-defining' : 'Clutch'} performance when it mattered most — ${userScore}-${oppScore}.`);
        } else {
            callbacks.push(`Crushing ${scoreDiff}-point defeat when the stakes couldn't be higher.`);
        }
    }

    // 8. Weather Callbacks (if context carries weather info)
    if (context.weather) {
        const w = context.weather;
        if (w === 'snow' && won) {
            callbacks.push(`${userAbbr} embraced the snow and ice to grind out a win in the elements.`);
        } else if (w === 'snow' && !won) {
            callbacks.push(`The blizzard conditions neutralized ${userAbbr}'s offense in a tough loss.`);
        } else if (w === 'rain' && userTurnovers >= 2) {
            callbacks.push(`Slippery conditions contributed to ${userTurnovers} turnovers in the rain.`);
        } else if (w === 'wind' && userPassYds < 150) {
            callbacks.push(`Heavy winds grounded ${userAbbr}'s passing attack (${userPassYds} yards).`);
        }
    }


    // --- 9. Check for Statistical Feats ---
    const logFeat = (player, text, category) => {
        if (!player || !player.id) return;
        if (!league.feats) league.feats = [];
        league.feats.push({
            playerId: player.id,
            name: player.name,
            teamId: player.teamId || null,
            text: text,
            week: league.week,
            seasonId: league.currentSeasonId,
            category: category
        });

        // Push callback for immediate UI notification
        callbacks.push(`🏆 ${player.name.split(' ').pop()} achieved a Statistical Feat: ${text}`);
    };

    // Iterate over box score to find feats
    const checkFeats = (teamStats) => {
        if (!teamStats || !teamStats.players) return;
        for (const [pid, p] of Object.entries(teamStats.players)) {
            if (!p || typeof p !== 'object') continue;

            // Passing Feats
            if ((p.passYd || 0) >= 400) logFeat(p, `${p.passYd} Passing Yards`, 'passing');
            if ((p.passTD || 0) >= 5) logFeat(p, `${p.passTD} Passing TDs`, 'passing');

            // Rushing Feats
            if ((p.rushYd || 0) >= 150) logFeat(p, `${p.rushYd} Rushing Yards`, 'rushing');
            if ((p.rushTD || 0) >= 3) logFeat(p, `${p.rushTD} Rushing TDs`, 'rushing');

            // Receiving Feats
            if ((p.recYd || 0) >= 150) logFeat(p, `${p.recYd} Receiving Yards`, 'receiving');
            if ((p.receptions || 0) >= 12) logFeat(p, `${p.receptions} Receptions`, 'receiving');
            if ((p.recTD || 0) >= 3) logFeat(p, `${p.recTD} Receiving TDs`, 'receiving');

            // Defensive Feats
            if ((p.sacks || 0) >= 3) logFeat(p, `${p.sacks} Sacks`, 'defense');
            if ((p.interceptions || 0) >= 2) logFeat(p, `${p.interceptions} Interceptions`, 'defense');
        }
    };

    checkFeats(stats?.home);
    checkFeats(stats?.away);

    // Deduplicate and limit to 3 lines

    return [...new Set(callbacks)].slice(0, 3);
}

// --- PERFORMANCE VARIANCE SYSTEM ---
// Adds "career games" and "duds" for drama. Players can have hot or cold games.
// NFL reality: even elite QBs have 4-INT games, and journeymen can throw for 400.

/**
 * Roll for a performance modifier that creates variance.
 * Returns a multiplier: 1.0 = normal, >1.0 = hot game, <1.0 = cold game.
 * Frequency: ~8% chance of career game, ~8% chance of dud, ~84% normal.
 * @param {Object} player - Player object
 * @param {Object} U - Utils
 * @returns {{ multiplier: number, type: string }}
 */
function rollPerformanceVariance(player, U) {
  const roll = U.random();
  const ovr = player.ovr || 70;

  // Elite players have slightly lower dud chance, slightly higher career game chance
  const eliteBonus = Math.max(0, (ovr - 80) * 0.003); // up to +0.06 for 100 OVR

  if (roll < 0.04 + eliteBonus) {
    // CAREER GAME: player is on fire
    return { multiplier: U.randFloat(1.25, 1.55), type: 'career_game' };
  } else if (roll < 0.08 + eliteBonus) {
    // HOT GAME: noticeable uptick
    return { multiplier: U.randFloat(1.10, 1.25), type: 'hot' };
  } else if (roll > 0.96 - eliteBonus * 0.5) {
    // DUD GAME: off day
    return { multiplier: U.randFloat(0.55, 0.78), type: 'dud' };
  } else if (roll > 0.92 - eliteBonus * 0.5) {
    // COLD GAME: slightly below average
    return { multiplier: U.randFloat(0.80, 0.92), type: 'cold' };
  }
  return { multiplier: 1.0, type: 'normal' };
}

// --- STAT GENERATION HELPERS ---

/**
 * Generate QB stats that are CONSISTENT with the team's score.
 *
 * KEY FIXES:
 * 1. Removed `teamScore / 20` from yards calculation — this created a circular
 *    dependency where score influenced stats that should influence score.
 * 2. TD count is now derived from passing production (yards/completions),
 *    NOT from `teamScore / 7`. A team scoring 7 points via a defensive TD
 *    won't show a QB with 3 passing TDs anymore.
 * 3. Added score-consistency check: total TDs from all players can't exceed
 *    what the score allows (enforced at the team stats aggregation level).
 * 4. Interception rate now uses a proper NFL-calibrated formula:
 *    ~2.5% INT rate average, scaling with QB accuracy and defense quality.
 *
 * NFL statistical distributions (2023 season averages):
 * - Pass attempts: 33.5/game, completions: 21.8, comp%: 65.1%
 * - Pass yards: 213.4/game, YPA: 6.8, YPC: 10.5
 * - Pass TDs: 1.4/game, INTs: 0.8/game
 * - Sacks: 2.4/game
 *
 * @param {Object} qb - QB player object
 * @param {number} teamScore - Team's final score (for game-script adjustments)
 * @param {number} oppScore - Opponent's final score
 * @param {number} defenseStrength - Opposing defense strength rating
 * @param {Object} U - Utils reference
 * @param {Object} modifiers - Coaching/strategy modifiers
 * @returns {Object} QB game stats
 */
function generateQBStats(qb, teamScore, oppScore, defenseStrength, U, modifiers = {}, share = 1.0) {
  const ratings = qb.ratings || {};
  const throwPower = ratings.throwPower || 70;
  const throwAccuracy = ratings.throwAccuracy || 70;
  const awareness = ratings.awareness || 70;

  // Performance variance: career game or dud
  const perfVar = rollPerformanceVariance(qb, U);
  const perfMult = perfVar.multiplier;

  // Game script: trailing teams pass more, leading teams pass less
  const scoreDiff = oppScore - teamScore;
  const scriptMod = Math.max(-12, Math.min(12, scoreDiff * 0.5));

  // 4th-quarter blowout suppression: 21+ point lead reduces pass volume
  const blowoutLead = teamScore - oppScore;
  const blowoutMod = blowoutLead >= 21 ? 0.72 : 1.0; // suppress passing by ~28% in blowouts

  let baseAttempts = 32 + scriptMod + U.rand(-4, 4); // reduced from 34
  if (share < 1.0) baseAttempts *= share;
  if (modifiers.passVolume) baseAttempts *= modifiers.passVolume;
  baseAttempts *= blowoutMod;
  const attempts = Math.max(18, Math.min(50, Math.round(baseAttempts))); // tightened max from 55

  // Completion percentage: NFL average ~63%, range 48-74%
  // ATTENUATION: Reduced base by ~13% to bring league averages down
  let baseCompPct = (throwAccuracy + awareness) / 2;
  if (modifiers.passAccuracy) baseCompPct *= modifiers.passAccuracy;
  const defenseFactor = (100 - (defenseStrength || 70)) / 100;

  // Gaussian distribution for Comp% — recalibrated (Task 15):
  //   Base raised 55→57 (closer to NFL avg 63%)
  //   Coefficient raised 0.35→0.55 (wider spread between good/bad QBs)
  //   Ceiling raised 78→84 (allows elite single-game peaks)
  const meanCompPct = 57 + (baseCompPct - 70) * 0.55 + defenseFactor * 12;
  const compPct = U.gaussianClamped(meanCompPct * (perfMult > 1 ? 1 + (perfMult - 1) * 0.3 : 1 - (1 - perfMult) * 0.3), 6.0, 35, 84);

  const completions = Math.round(attempts * (compPct / 100));

  // Yards per completion: NFL average ~10.0, driven by arm strength
  // ATTENUATION: Reduced base YPC by ~12% (was 10.5, now 9.2)
  const meanYPC = 9.2 + (throwPower - 75) * 0.08 + defenseFactor * 1.6;
  const avgYPC = U.gaussianClamped(meanYPC, 1.8, 5.0, 17.0); // tightened range

  const yards = Math.max(0, Math.round(completions * avgYPC * perfMult));

  // TDs: derived from PRODUCTION (yards, completions), not from score
  // NFL average: ~1.4 pass TD/game. Roughly 1 TD per ~150 passing yards.
  // Also factor in red zone efficiency
  const redZoneEff = (awareness + throwAccuracy) / 200;
  const baseTDs = yards / 150 * (0.8 + redZoneEff * 0.6);
  const touchdowns = Math.max(0, Math.min(6,
    Math.round(baseTDs + U.rand(-0.5, 1.0))
  ));

  // Interceptions: NFL average ~2.5% of attempts
  // Better QBs throw fewer (1.5%), worse QBs throw more (4%)
  const intRate = 0.025 + (70 - throwAccuracy) * 0.0005 + (defenseStrength - 70) * 0.0003;
  const interceptions = Math.max(0, Math.min(4,
    Math.round(attempts * Math.max(0.005, intRate) + U.rand(-0.3, 0.7))
  ));

  // Sacks: NFL average ~2.4/game. Awareness and OL protection matter.
  let sackCount = 2.4 + (70 - awareness) * 0.04 + U.rand(-1, 2);
  if (qb.traits && qb.traits.includes(TRAITS.POCKET_PRESENCE.id)) sackCount *= 0.8;

  const sacks = Math.max(0, Math.min(7, Math.round(sackCount)));

  const longestPass = completions > 0
    ? Math.max(12, Math.round(avgYPC * U.rand(2.0, 3.5)))
    : 0;

  // --- QB RUSHING STATS ---
  // Dual-threat QBs (high speed) run significantly more.
  // NFL averages: ~3.2 rush att/game for QBs, mobile QBs: 6-10 att/game
  const qbSpeed = ratings.speed || 60;
  const qbAgility = ratings.agility || 60;
  const mobilityFactor = (qbSpeed - 55) / 45; // 0 at speed 55, 1 at speed 100
  let qbRushAtt = Math.max(1, Math.round(2 + mobilityFactor * 7 + U.rand(-2, 2)));
  if (share < 1.0) qbRushAtt = Math.round(qbRushAtt * share);

  // Scramble boost: blowout suppression reduces QB runs too
  qbRushAtt = Math.round(qbRushAtt * blowoutMod);
  qbRushAtt = Math.max(0, Math.min(15, qbRushAtt));

  const qbYPC = U.gaussianClamped(3.5 + mobilityFactor * 3.5, 2.0, -2.0, 15.0);
  const qbRushYd = Math.max(0, Math.round(qbRushAtt * qbYPC));

  // QB Rush TDs: mobile QBs score ~0.3 rush TD/game, pocket passers ~0.05
  const qbRushTdChance = 0.03 + mobilityFactor * 0.12;
  const qbRushTD = U.random() < qbRushTdChance ? 1 : 0;

  const qbLongestRun = qbRushAtt > 0
    ? Math.max(2, Math.round(qbYPC * U.rand(1.5, 3.0)))
    : 0;

  // NFL Passer Rating formula
  const att = Math.max(1, attempts);
  const _a = Math.max(0, Math.min(2.375, ((completions / att) - 0.3) / 0.2));
  const _b = Math.max(0, Math.min(2.375, ((yards / att) - 3) / 4));
  const _c = Math.max(0, Math.min(2.375, (touchdowns / att) / 0.05));
  const _d = Math.max(0, Math.min(2.375, 2.375 - (interceptions / att) / 0.04));
  const passerRating = Math.round(((_a + _b + _c + _d) / 6) * 100 * 10) / 10;

  return {
    gamesPlayed: 1,
    passAtt: attempts,
    passComp: completions,
    passYd: yards,
    passTD: touchdowns,
    interceptions: interceptions,
    sacks: sacks,
    dropbacks: attempts + sacks,
    longestPass: longestPass,
    completionPct: Math.round((completions / Math.max(1, attempts)) * 1000) / 10,
    passerRating,
    // QB rushing
    rushAtt: qbRushAtt,
    rushYd: qbRushYd,
    rushTD: qbRushTD,
    longestRun: qbLongestRun,
    yardsPerCarry: qbRushAtt > 0 ? Math.round((qbRushYd / qbRushAtt) * 10) / 10 : 0,
  };
}

function generateRBStats(rb, teamScore, oppScore, defenseStrength, U, modifiers = {}, share = 1.0) {
  const ratings = rb.ratings || {};
  const speed = ratings.speed || 70;
  const trucking = ratings.trucking || 70;
  const juking = ratings.juking || 70;
  const catching = ratings.catching || 50;

  // Performance variance
  const perfVar = rollPerformanceVariance(rb, U);
  const perfMult = perfVar.multiplier;

  // Realistic Game Script Logic
  // Baseline ~26 team carries. Increase if leading, decrease if trailing.
  const scoreDiff = teamScore - oppScore; // Positive if leading
  const scriptMod = Math.max(-10, Math.min(12, scoreDiff * 0.4));

  // 4th-quarter blowout clock-burn: 21+ point lead boosts run weight by 40%
  const blowoutLead = teamScore - oppScore;
  const blowoutRunBoost = blowoutLead >= 21 ? 1.40 : 1.0;

  let baseTeamCarries = 26 + scriptMod + U.rand(-5, 8);
  baseTeamCarries *= blowoutRunBoost;

  if (modifiers.runVolume) baseTeamCarries *= modifiers.runVolume;

  // Apply share and bounds
  let carries = Math.round(baseTeamCarries * share);
  carries = Math.max(2, Math.min(35, carries));

  // Reduced base YPC to ~4.2 average
  const baseYPC = 3.5 + (speed + trucking + juking - 210) / 40; // ~4.2 at 70s
  const defenseFactor = (100 - (defenseStrength || 70)) / 50;

  // Gaussian distribution for YPC (Mean: rating-based, StdDev: 1.2)
  const yardsPerCarry = U.gaussianClamped(baseYPC + defenseFactor, 1.2, 1.5, 12.0);
  const rushYd = Math.round(carries * yardsPerCarry * perfMult);

  // TDs: derived from rushing production, not from team score
  // NFL average: ~0.6 rush TD/game for lead back. ~1 TD per 80 rushing yards.
  const rushTdRate = rushYd / 80 * (0.4 + (trucking - 50) * 0.005);
  const touchdowns = Math.max(0, Math.min(4,
    Math.round(rushTdRate + U.rand(-0.3, 0.8))
  ));

  let fumbleCount = (100 - (ratings.awareness || 70)) / 150 + U.rand(-0.3, 0.5);
  if (rb.traits && rb.traits.includes(TRAITS.WORKHORSE.id)) fumbleCount *= 0.7;
  const fumbles = Math.max(0, Math.min(2, Math.round(fumbleCount)));

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
    gamesPlayed: 1,
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
    targetsWithSeparation: targetsWithSeparation,
  };
}

function distributePassingTargets(receivers, totalTargets, U, starTargetId) {
  if (!receivers || receivers.length === 0) return [];

  const weights = receivers.map(r => {
      const ratings = r.ratings || {};
      let w = (r.ovr * 0.5) + ((ratings.awareness || 50) * 0.3) + ((ratings.speed || 50) * 0.2);

      // Star Target Logic: +25% weight if this is the focal point
      if (starTargetId && (r.id === starTargetId || String(r.id) === String(starTargetId))) {
          w *= 1.25;
      }
      return w;
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

  // Performance variance
  const perfVar = rollPerformanceVariance(receiver, U);
  const perfMult = perfVar.multiplier;

  const targets = targetCount;

  const catchRate = (catching + catchInTraffic) / 2;
  const defenseFactor = (100 - (defenseStrength || 70)) / 100;
  // Lowered catch rate to realistic ~60%
  let receptionPct = Math.max(40, Math.min(90, catchRate - 15 + defenseFactor * 20));
  if (receiver.traits && receiver.traits.includes(TRAITS.ROUTE_RUNNER.id)) receptionPct *= 1.1;

  const receptions = Math.max(0, Math.min(targets, Math.round(targets * (receptionPct / 100) + U.rand(-1, 1))));

  // Adjusted YPC to match attenuated QB output ~9.2
  // ATTENUATION: Reduced from 11.0 to 9.5 (~13% reduction)
  let meanYPR = 9.5 + (speed - 70) * 0.12;
  if (receiver.traits && receiver.traits.includes(TRAITS.DEEP_THREAT.id)) meanYPR *= 1.1;

  const avgYardsPerCatch = U.gaussianClamped(meanYPR, 2.2, 4.0, 25.0);
  const recYd = Math.round(receptions * avgYardsPerCatch * perfMult);

  // TDs: derived from receiving production, not from team score.
  // NFL average: ~0.4 rec TD/game for primary WR. ~1 TD per 100 rec yards.
  const recTdRate = recYd / 100 * (0.4 + (catching - 60) * 0.005);
  const recTD = Math.max(0, Math.min(3, Math.round(recTdRate + U.rand(-0.3, 0.8))));

  const dropRate = Math.max(0, (100 - catching) / 200);
  const drops = Math.max(0, Math.min(targets - receptions, Math.round(targets * dropRate + U.rand(-0.5, 1.5))));

  const yardsAfterCatch = Math.max(0, Math.round(recYd * (0.3 + speed / 200) + U.rand(-10, 20)));

  let longestCatch = receptions > 0 ? Math.max(10, Math.round(recYd / receptions * U.rand(1.5, 3.5))) : 0;
  if (receiver.traits && receiver.traits.includes(TRAITS.DEEP_THREAT.id)) longestCatch *= 1.15;

  const routesRun = Math.round(targets * 4 + U.rand(10, 20));
  const separationChance = ((ratings.agility || 70) + (ratings.speed || 70)) / 250;
  const targetsWithSeparation = Math.round(targets * separationChance);

  return {
    gamesPlayed: 1,
    targets: targets,
    receptions: receptions,
    recYd: recYd,
    recTD: recTD,
    drops: drops,
    yardsAfterCatch: yardsAfterCatch,
    longestCatch: longestCatch,
    routesRun: routesRun,
    targetsWithSeparation: targetsWithSeparation,
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
  if (db.traits && db.traits.includes(TRAITS.BALLHAWK.id)) intChance *= 1.25;

  const interceptions = Math.max(0, Math.min(3, Math.round(intChance * 2 + U.rand(-0.5, 1.5))));

  const passesDefended = Math.max(0, Math.min(5, Math.round((coverage / 30) + U.rand(-0.5, 1.5))));

  const targetsAllowed = Math.round(5 + (100 - coverage) / 10 + U.rand(-1, 2));
  let completionPctAllowed = Math.max(0.4, (100 - coverage) / 100);
  if (db.traits && db.traits.includes(TRAITS.SHUTDOWN.id)) completionPctAllowed *= 0.9;

  const completionsAllowed = Math.round(targetsAllowed * completionPctAllowed);
  const yardsAllowed = Math.round(completionsAllowed * (10 + (100 - speed)/10));
  const tdsAllowed = U.rand(0, 100) < (100 - coverage) ? 1 : 0;

  return {
    gamesPlayed: 1,
    coverageRating: Math.max(0, Math.min(100, coverageRating)),
    tackles: tackles,
    interceptions: interceptions,
    passesDefended: passesDefended,
    targetsAllowed: targetsAllowed,
    completionsAllowed: completionsAllowed,
    yardsAllowed: yardsAllowed,
    tdsAllowed: tdsAllowed,
  };
}

function generateDLStats(defender, offenseStrength, U, modifiers = {}) {
  const ratings = defender.ratings || {};
  const passRushPower = ratings.passRushPower || 70;
  const passRushSpeed = ratings.passRushSpeed || 70;
  const runStop = ratings.runStop || 70;
  const awareness = ratings.awareness || 70;

  // Performance variance - defensive players can have monster games too
  const perfVar = rollPerformanceVariance(defender, U);
  const perfMult = perfVar.multiplier;

  const pressureRating = Math.round((passRushPower + passRushSpeed + awareness) / 3 + U.rand(-5, 5));

  // ── Sacks ──────────────────────────────────────────────────────────────────
  // NFL average: ~0.4 sacks/game for a starter. Elite pass-rushers: 0.8–1.2.
  // Single-game record: 4.5 (hard cap at 4.0 to stay realistic).
  const rushComposite = (passRushPower + passRushSpeed) / 2;   // 0–100
  const olStrength = Math.max(50, offenseStrength || 70);       // opponent OL quality
  let baseSacks = (rushComposite - 50) / 80;                    // 0–0.625 for 50–100 rated
  baseSacks += U.rand(-0.3, 0.6);                               // variance
  if (modifiers.sackChance) baseSacks *= modifiers.sackChance;
  if (defender.traits && defender.traits.includes(TRAITS.SPEED_RUSHER.id)) baseSacks *= 1.25;
  baseSacks *= (1 - (olStrength - 50) / 200);                   // better OL = fewer sacks
  baseSacks *= perfMult; // career game can mean 3-4 sack game
  const sacks = Math.max(0, Math.min(5, Math.round(baseSacks)));

  // ── Tackles ────────────────────────────────────────────────────────────────
  const baseTackles = defender.pos === 'LB' ? 8 : 4;
  const tackles = Math.max(0, Math.min(15, Math.round(baseTackles + (runStop / 25) + U.rand(-2, 2))));

  // ── TFL ────────────────────────────────────────────────────────────────────
  let tflCount = (runStop / 60) + U.rand(-0.3, 1.0);
  if (defender.traits && defender.traits.includes(TRAITS.RUN_STUFFER.id)) tflCount *= 1.15;
  const tacklesForLoss = Math.max(0, Math.min(3, Math.round(tflCount)));

  // ── Forced fumbles / recoveries ────────────────────────────────────────────
  const forcedFumbles = Math.max(0, Math.min(2, Math.round((passRushPower / 100) + U.rand(-0.4, 0.3))));
  const fumbleRecoveries = Math.max(0, U.random() < 0.06 ? 1 : 0);

  // ── Pressures ──────────────────────────────────────────────────────────────
  // NFL average: ~3–5 pressures/game for starters. Elite: 6–8 max.
  // Hard cap at 10 per game (single-game outlier ceiling).
  const passRushSnaps = Math.round(20 + (passRushPower + passRushSpeed) / 8);
  const pressureRate = Math.max(0, (rushComposite - 40) / 250);  // ~0.04–0.24
  let pressures = Math.round(passRushSnaps * pressureRate * perfMult + U.rand(-1, 1));
  pressures = Math.max(0, Math.min(10, pressures));              // HARD CAP: 10/game

  return {
    gamesPlayed: 1,
    pressureRating: Math.max(0, Math.min(100, pressureRating)),
    sacks: sacks,
    tackles: tackles,
    tacklesForLoss: tacklesForLoss,
    forcedFumbles: forcedFumbles,
    fumbleRecoveries: fumbleRecoveries,
    passRushSnaps: passRushSnaps,
    pressures: pressures,
  };
}

function generateOLStats(ol, defenseStrength, U) {
  const ratings = ol.ratings || {};
  const passBlock = ratings.passBlock || 70;
  const runBlock = ratings.runBlock || 70;
  const awareness = ratings.awareness || 70;

  let sackChance = (100 - passBlock) / 200 + (defenseStrength / 300);
  if (ol.traits && ol.traits.includes(TRAITS.STONE_WALL.id)) sackChance *= 0.75;
  const sacksAllowed = Math.max(0, Math.min(3, Math.round(sackChance * 2 + U.rand(-0.5, 1.5))));

  const tflAllowed = Math.max(0, Math.min(2, Math.round((100 - runBlock) / 100 + U.rand(-0.3, 0.5))));

  const protectionGrade = Math.round((passBlock + runBlock + awareness) / 3 + U.rand(-5, 5));

  const passBlockSnaps = Math.round(30 + (passBlock / 5) + U.rand(-5, 5));
  const runBlockSnaps  = Math.round(25 + (runBlock  / 5) + U.rand(-5, 5));
  const blocksWon = Math.max(0, Math.round((passBlockSnaps + runBlockSnaps) * (passBlock + runBlock) / 20000));

  return {
    gamesPlayed: 1,
    sacksAllowed: sacksAllowed,
    tacklesForLossAllowed: tflAllowed,
    protectionGrade: Math.max(0, Math.min(100, protectionGrade)),
    passBlockSnaps: passBlockSnaps,
    runBlockSnaps: runBlockSnaps,
    blocksWon: blocksWon,
  };
}

/**
 * Generate kicker stats derived directly from actual drive results (Task 9).
 * Accepts actualFGs and actualXPs from the drive engine as the ground truth.
 * fgAttempts is calculated as made + missed (based on accuracy); never < actualFGs.
 */
function generateKickerStats(kicker, actualFGs, actualXPs, U) {
  const ratings = kicker.ratings || {};
  const kickPower    = ratings.kickPower    || 70;
  const kickAccuracy = ratings.kickAccuracy || 70;

  let makeRate = kickAccuracy / 100;
  if (kicker.traits && kicker.traits.includes(TRAITS.CLUTCH_KICKER.id)) makeRate *= 1.1;
  makeRate = Math.min(makeRate, 0.99); // cap at 99%

  // Derive attempts from made + estimated misses (how many tries to get actualFGs makes)
  const fgMissed    = actualFGs > 0 ? Math.max(0, Math.round((actualFGs / makeRate) - actualFGs)) : 0;
  const fgAttempts  = actualFGs + fgMissed;

  const xpMissed    = actualXPs > 0 ? Math.max(0, Math.round((actualXPs / (kickAccuracy / 100)) - actualXPs)) : 0;
  const xpAttempts  = actualXPs + xpMissed;

  const longestFG   = actualFGs > 0
      ? Math.max(20, Math.min(65, Math.round(30 + (kickPower / 2) + U.rand(-5, 10))))
      : 0;

  const successPct  = fgAttempts > 0 ? Math.round((actualFGs / fgAttempts) * 1000) / 10 : 0;
  const avgKickYards = Math.round(60 + (kickPower / 3) + U.rand(-5, 5));

  return {
    gamesPlayed: 1,
    fgAttempts,
    fgMade:    actualFGs,
    fgMissed,
    longestFG,
    xpAttempts,
    xpMade:    actualXPs,
    xpMissed,
    successPct,
    avgKickYards,
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
    gamesPlayed: 1,
    punts: punts,
    puntYards: totalPuntYards,
    avgPuntYards: punts > 0 ? Math.round((totalPuntYards / punts) * 10) / 10 : 0,
    longestPunt: longestPunt,
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
    // Use cached grouping + injury filtering
    const { active: homeActive, groups: homeGroups } = getActiveGroups(home, options.league);
    const { active: awayActive, groups: awayGroups } = getActiveGroups(away, options.league);

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

    // FIX: Defense strength should come from each team's OWN defensive players.
    // Previously swapped: home defense was calculated from away groups.
    // Now: homeDefenseStrength = how good HOME team's defense is (from homeGroups).
    let homeDefenseStrength = calculateDefenseStrength(homeGroups);
    let awayDefenseStrength = calculateDefenseStrength(awayGroups);

    // Apply Scheme Penalty
    // If a team is running a 3-4 but has more DL talent than LB talent (or vice versa), apply a penalty
    const applySchemePenalty = (team, defenseStrength, groups) => {
        const defPlan = team.strategies?.defPlanId;
        // Basic heuristic: check if they are running a mismatch
        // '3-4' logic: Needs strong LBs. If DL > LB (by count of quality players?), penalty.
        // Simplified check: if plan is 3-4 or BLITZ_HEAVY (LB dependent)
        if (defPlan === 'BLITZ_HEAVY' || (team.strategies?.baseDefense === '3-4')) {
             const dlCount = (groups['DL'] || []).filter(p => p.ovr > 75).length;
             const lbCount = (groups['LB'] || []).filter(p => p.ovr > 75).length;

             if (dlCount > lbCount + 1) {
                 // They have DL talent but are forcing a LB scheme
                 return defenseStrength * 0.95; // 5% penalty
             }
        }
        return defenseStrength;
    };

    homeDefenseStrength = applySchemePenalty(home, homeDefenseStrength, homeGroups);
    awayDefenseStrength = applySchemePenalty(away, awayDefenseStrength, awayGroups);

    // --- STAFF PERKS & STRATEGY INTEGRATION ---
    const homeMods = getCoachingMods(home.staff);
    const awayMods = getCoachingMods(away.staff);

    // Determine strategy modifiers
    // New logic: Read directly from team.strategies (supported for both User and AI)
    // Fallback: Read from league.weeklyGamePlan for legacy user setups
    const league = options.league;
    const history = league?.strategyHistory || {};

    const applyStrategy = (team, mods) => {
        // 1. Prefer team.strategies (source of truth)
        if (team.strategies && team.strategies.offPlanId) {
            const { offPlanId, defPlanId, riskId } = team.strategies;
            const stratMods = getStrategyModifiers(offPlanId, defPlanId, riskId, history);
            if (verbose) console.log(`[SIM-DEBUG] Strategy Mods (${team.abbr}):`, stratMods);
            Object.assign(mods, stratMods);
            return;
        }

        // 2. Legacy/User Fallback via league.weeklyGamePlan
        const userTeamId = league?.userTeamId;
        if (userTeamId !== undefined && team.id === userTeamId && league?.weeklyGamePlan) {
             const { offPlanId, defPlanId, riskId } = league.weeklyGamePlan;
             const stratMods = getStrategyModifiers(offPlanId, defPlanId, riskId, history);
             if (verbose) console.log(`[SIM-DEBUG] Legacy Strategy Mods (${team.abbr}):`, stratMods);
             Object.assign(mods, stratMods);
        }
    };

    applyStrategy(home, homeMods);
    applyStrategy(away, awayMods);

    if (verbose) console.log(`[SIM-DEBUG] Mods Applied: Home=${JSON.stringify(homeMods)}, Away=${JSON.stringify(awayMods)}`);
    // --- SCHEME FIT IMPACT ---
    let schemeNote = null;

    if (calculateTeamRatingWithSchemeFit) {
        // Cache scheme fit per team per batch (cleared in simulateBatch between weeks)
        if (!home._cachedSchemeFit) home._cachedSchemeFit = calculateTeamRatingWithSchemeFit(home);
        if (!away._cachedSchemeFit) away._cachedSchemeFit = calculateTeamRatingWithSchemeFit(away);
        const homeFit = home._cachedSchemeFit;
        const awayFit = away._cachedSchemeFit;

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

    // --- MORALE IMPACT ---
    const calculateTeamMorale = (activeRoster, team) => {
        if (!activeRoster || !activeRoster.length) return 75;
        let totalMorale = 0;
        activeRoster.forEach(p => {
             // Assuming active players are happy to be playing (treated as starters for calculation simplicity)
             const morale = calculateMorale(p, team, true);
             totalMorale += morale;
        });
        return totalMorale / activeRoster.length;
    };

    // Cache morale per team per batch (only changes weekly, not per-game)
    if (home._cachedMorale === undefined) home._cachedMorale = calculateTeamMorale(homeActive, home);
    if (away._cachedMorale === undefined) away._cachedMorale = calculateTeamMorale(awayActive, away);
    const homeMorale = home._cachedMorale;
    const awayMorale = away._cachedMorale;

    // Morale Mod: 50 is neutral. 100 is +2%, 0 is -2% strength impact
    // Formula: 1.0 + ((morale - 50) / 50) * 0.02
    const getMoraleMod = (m) => 1.0 + ((m - 50) / 50) * 0.02;

    const homeMoraleMod = getMoraleMod(homeMorale);
    const awayMoraleMod = getMoraleMod(awayMorale);

    homeStrength *= homeMoraleMod;
    awayStrength *= awayMoraleMod;

    if (verbose) console.log(`[SIM-DEBUG] Morale Mods: Home ${homeMoraleMod.toFixed(3)} (${Math.round(homeMorale)}), Away ${awayMoraleMod.toFixed(3)} (${Math.round(awayMorale)})`);

    // =================================================================
    // ENHANCED NFL SCORING ENGINE v2
    // Drive-by-drive simulation with momentum, weather, turnovers,
    // defensive/special teams TDs, and clutch mechanics.
    // Average NFL game: ~22 points per team, range 0-50+ realistic.
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

    // --- WEATHER SYSTEM ---
    // Weather affects passing, kicking, and turnover rates
    const WEATHER_TYPES = [
      { id: 'clear', weight: 40, passMod: 1.0, kickMod: 1.0, turnoverMod: 1.0, runMod: 1.0 },
      { id: 'dome', weight: 15, passMod: 1.05, kickMod: 1.02, turnoverMod: 0.92, runMod: 1.0 },
      { id: 'rain', weight: 15, passMod: 0.88, kickMod: 0.90, turnoverMod: 1.35, runMod: 1.08 },
      { id: 'snow', weight: 8, passMod: 0.82, kickMod: 0.82, turnoverMod: 1.45, runMod: 1.12 },
      { id: 'wind', weight: 12, passMod: 0.90, kickMod: 0.80, turnoverMod: 1.15, runMod: 1.05 },
      { id: 'cold', weight: 10, passMod: 0.95, kickMod: 0.92, turnoverMod: 1.10, runMod: 1.02 },
    ];
    // Determine game weather
    const isDome = home.stadium?.dome === true;
    let weather;
    if (isDome) {
      weather = WEATHER_TYPES[1]; // dome
    } else {
      const weatherWeights = WEATHER_TYPES.map(w => w.weight);
      weather = WEATHER_TYPES[U.weightedChoice(weatherWeights)];
    }

    /**
     * Full game simulation with alternating possessions, momentum, and
     * defensive/special teams scoring.
     *
     * Returns results for BOTH teams simultaneously to model interaction.
     */
    const simulateFullGame = (homeStr, awayStr, homeDefStr, awayDefStr, diff, hMods, aMods) => {
        const result = {
          home: { score: 0, touchdowns: 0, field_goals: 0, xpMade: 0, twoPtMade: 0,
                  defensiveTDs: 0, turnoversForced: 0, safeties: 0 },
          away: { score: 0, touchdowns: 0, field_goals: 0, xpMade: 0, twoPtMade: 0,
                  defensiveTDs: 0, turnoversForced: 0, safeties: 0 },
        };

        // Momentum tracker: -100 (away hot) to +100 (home hot)
        let momentum = 0;

        // NFL game: ~22 total possessions (11 per team)
        const totalDrives = U.rand(20, 26);
        let possession = U.random() < 0.5 ? 'home' : 'away';

        // Track consecutive scores/stops for momentum
        let lastScoringTeam = null;
        let scoringStreak = 0;

        for (let d = 0; d < totalDrives; d++) {
            const isHome = possession === 'home';
            const offStr = isHome ? homeStr : awayStr;
            const defStr = isHome ? awayDefStr : homeDefStr;
            const mods = isHome ? hMods : aMods;
            const defMods = isHome ? aMods : hMods;
            const offTeam = isHome ? result.home : result.away;
            const defTeam = isHome ? result.away : result.home;
            const advantage = isHome ? diff : -diff;

            const offFactor = (offStr - 50) / 40;
            const defFactor = (defStr - 50) / 40;
            const netQuality = offFactor - defFactor + (advantage / 50);

            // Momentum modifier: ±5% scoring probability
            const momentumMod = isHome
              ? U.clamp(momentum / 2000, -0.05, 0.05)
              : U.clamp(-momentum / 2000, -0.05, 0.05);

            // Game script: trailing team gets more aggressive in later drives
            const scoreDiffNow = result.home.score - result.away.score;
            const trailingMod = (d >= totalDrives * 0.6) ? (
              (isHome && scoreDiffNow < -10) ? 0.06 :
              (!isHome && scoreDiffNow > 10) ? 0.06 : 0
            ) : 0;

            // Garbage time: leading team runs more, scores less efficiently late
            const garbageMod = (d >= totalDrives * 0.75 && Math.abs(scoreDiffNow) >= 21) ? -0.08 : 0;

            const varianceMod = (mods.variance || 1.0);
            const upsetChance = varianceBoost * 0.012;
            const rzFactor = (offStr - 60) * 0.004;

            // Scoring probability per drive
            let scoreProb = 0.33 + netQuality * 0.18 + upsetChance + momentumMod + trailingMod + garbageMod;
            scoreProb *= weather.passMod * 0.3 + 0.7; // weather has partial effect on scoring
            scoreProb = U.clamp(scoreProb, 0.10, 0.60);

            // TD share within scoring drives
            let tdShare = 0.55 + rzFactor;
            if (mods.passVolume && mods.passVolume > 1.1) tdShare += 0.05;
            if (mods.runVolume && mods.runVolume > 1.1) tdShare -= 0.05;
            tdShare = U.clamp(tdShare, 0.35, 0.75);

            const driveRoll = U.random();

            if (driveRoll < scoreProb) {
                // --- SCORING DRIVE ---
                const typeRoll = U.random();

                if (typeRoll < tdShare) {
                    // Touchdown
                    const xpRoll = U.random();
                    if (xpRoll < 0.94 * weather.kickMod) {
                        offTeam.score += 7;
                        offTeam.xpMade++;
                    } else if (xpRoll < 0.97) {
                        offTeam.score += 6; // Missed XP
                    } else {
                        offTeam.score += 8; // 2-point conversion
                        offTeam.twoPtMade++;
                    }
                    offTeam.touchdowns++;
                } else {
                    // Field goal (weather affects accuracy)
                    const fgMakeChance = 0.85 * weather.kickMod;
                    if (U.random() < fgMakeChance) {
                        offTeam.score += 3;
                        offTeam.field_goals++;
                    }
                    // Else: missed FG, no points
                }

                // Momentum shift towards scoring team
                if (lastScoringTeam === possession) {
                    scoringStreak++;
                    momentum += (isHome ? 12 : -12) * Math.min(scoringStreak, 3);
                } else {
                    scoringStreak = 1;
                    lastScoringTeam = possession;
                    momentum += isHome ? 10 : -10;
                }
            } else {
                // --- NON-SCORING DRIVE ---
                // Check for turnover (fumble, INT)
                const baseTurnoverRate = 0.14 * weather.turnoverMod;
                let turnoverChance = baseTurnoverRate;
                if (mods.intChance) turnoverChance *= (mods.intChance - 1) * 0.3 + 1;
                if (defMods.defIntChance) turnoverChance *= (defMods.defIntChance - 1) * 0.3 + 1;
                if (defMods.defPressure) turnoverChance *= 1 + (defMods.defPressure - 1) * 0.15;

                if (U.random() < turnoverChance) {
                    defTeam.turnoversForced++;

                    // Defensive/Special Teams TD chance (pick-six, fumble return, scoop-and-score)
                    // NFL average: ~5% of turnovers returned for TD
                    const defTDChance = 0.05 + (defStr - 70) * 0.002;
                    if (U.random() < defTDChance) {
                        defTeam.defensiveTDs++;
                        const xpRoll = U.random();
                        if (xpRoll < 0.95) {
                            defTeam.score += 7;
                            defTeam.xpMade++;
                        } else {
                            defTeam.score += 6;
                        }

                        // Huge momentum swing on defensive TD
                        momentum += isHome ? -25 : 25;
                    } else {
                        // Normal turnover — moderate momentum swing
                        momentum += isHome ? -8 : 8;
                    }
                }

                // Safety chance (~0.5% of drives in NFL)
                if (U.random() < 0.005 + (defStr - offStr) * 0.0001) {
                    defTeam.score += 2;
                    defTeam.safeties++;
                    momentum += isHome ? -15 : 15;
                }

                // Momentum decays towards neutral on non-scoring drives
                momentum *= 0.92;
            }

            // Clamp momentum
            momentum = U.clamp(momentum, -100, 100);

            // Alternate possession
            possession = isHome ? 'away' : 'home';
        }

        // --- SPECIAL TEAMS SCORING (Kick/Punt Return TDs) ---
        // NFL average: ~2-3 return TDs per team per season (~0.15/game)
        const checkReturnTD = (team, oppDefStr) => {
            const returnTDChance = 0.04 + (team === result.home ? homeStr : awayStr - 70) * 0.001;
            if (U.random() < returnTDChance) {
                team.score += 7;
                team.touchdowns++;
                team.xpMade++;
            }
        };
        checkReturnTD(result.home, awayDefStr);
        checkReturnTD(result.away, homeDefStr);

        return result;
    };

    const fullGameResult = simulateFullGame(
        homeStrength, awayStrength, homeDefenseStrength, awayDefenseStrength,
        strengthDiff, homeMods, awayMods
    );

    const homeRes = fullGameResult.home;
    const awayRes = fullGameResult.away;

    let homeScore = Math.max(0, homeRes.score);
    let awayScore = Math.max(0, awayRes.score);
    let homeTDs = homeRes.touchdowns;
    let awayTDs = awayRes.touchdowns;
    let homeFGs = homeRes.field_goals;
    let awayFGs = awayRes.field_goals;
    let homeXPs = homeRes.xpMade;
    let awayXPs = awayRes.xpMade;

    // --- OVERTIME LOGIC WITH CLUTCH MECHANICS ---
    // If tied at end of regulation, simulate OT
    // Clutch trait on QB gives a scoring boost in OT
    if (homeScore === awayScore) {
        if (verbose) console.log(`[SIM-DEBUG] Regulation tied at ${homeScore}. Entering OT...`);
        const isPlayoff = options.isPlayoff === true;
        const allowTies = !isPlayoff && (options.allowTies !== false);

        // Calculate clutch bonuses from QB traits and personality
        const getClutchBonus = (groups) => {
            const qbs = groups['QB'] || [];
            if (qbs.length === 0) return 0;
            const qb = qbs[0];
            let bonus = 0;
            // Clutch personality trait
            if (qb.personality?.traits?.includes('Clutch')) bonus += 0.06;
            // High awareness helps in pressure situations
            if ((qb.ratings?.awareness || 70) >= 85) bonus += 0.03;
            // X-Factor dev trait
            if (qb.devTrait === 'X-Factor') bonus += 0.04;
            else if (qb.devTrait === 'Superstar') bonus += 0.02;
            return bonus;
        };

        const homeClutch = getClutchBonus(homeGroups);
        const awayClutch = getClutchBonus(awayGroups);

        let gameOver = false;
        let possession = U.random() < 0.5 ? 'home' : 'away';
        let possessions = 0;

        const maxPossessions = allowTies ? 8 : 50;
        const HARD_ITERATION_CAP = 50;

        while (!gameOver && possessions < maxPossessions && possessions < HARD_ITERATION_CAP) {
            possessions++;
            const offStrength = possession === 'home' ? homeStrength : awayStrength;
            const defStrength = possession === 'home' ? awayStrength : homeStrength;
            const clutchBonus = possession === 'home' ? homeClutch : awayClutch;

            const diff = offStrength - defStrength;
            const scoreChance = 0.35 + (diff / 200) + clutchBonus;

            let drivePoints = 0;
            if (U.rand(0, 100) / 100 < scoreChance) {
                if (U.rand(0, 100) < 60) {
                    // Touchdown
                    drivePoints = 6;
                    let xp = 0;
                    if (U.rand(0,100) < 95) {
                        drivePoints += 1;
                        xp = 1;
                    }
                    if (possession === 'home') { homeTDs++; homeXPs += xp; }
                    else { awayTDs++; awayXPs += xp; }
                } else {
                    // Field Goal
                    drivePoints = 3;
                    if (possession === 'home') homeFGs++;
                    else awayFGs++;
                }
            }

            if (verbose) console.log(`[SIM-DEBUG] OT Drive ${possessions}: ${possession} scores ${drivePoints}`);

            // Apply score
            if (drivePoints > 0) {
                if (possession === 'home') {
                    homeScore += drivePoints;
                } else {
                    awayScore += drivePoints;
                }
            }

            // Apply NFL OT Rules (2024+):
            //   Pair 1 (possessions 1-2): Both teams guaranteed a drive. End if unequal after pair.
            //   Pairs 2+ (possessions 3+): Sudden death — evaluate only after complete pairs (even count).
            //   Regular season: allow tie after 2 complete pairs (4 possessions).
            //   Playoffs: continue indefinitely until winner after complete pair.
            const isCompletePair = (possessions % 2 === 0); // both teams had equal drives
            const pairsCompleted = Math.floor(possessions / 2);

            if (isCompletePair) {
                if (homeScore !== awayScore) {
                    gameOver = true;
                } else if (allowTies && pairsCompleted >= 2) {
                    // Regular season: tie after 2 complete pairs (4 total drives)
                    gameOver = true;
                }
            }
            // Odd possessions: no game-over check — other team must get their drive

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

    const generateStatsForTeam = (team, score, oppScore, oppDefenseStrength, oppOffenseStrength, groups, mods, actualTDs, actualFGs, actualXPs, actualTwoPts) => {
      // Helper to handle positional injuries (QB/RB/WR)
      // Returns { stats, injury }
      const processPositionGroup = (players, generateStatsFn, shareDistribution = [1.0], ...args) => {
          if (!players || players.length === 0) return;

          // Only check injury for the starter (index 0) for now, or iterate
          // Simpler: iterate provided players and apply shares

          // Special logic for QB/RB/WR starters getting injured mid-game
          const starter = players[0];
          let starterShare = shareDistribution[0] || 1.0;
          let backupShare = 0;
          let injury = null;

          // Roll for injury on starter
          if (starter && generateInjury && canPlayerPlay(starter)) {
             // Roll for in-game injury
             const dur = starter.ratings?.durability || 80;
             // Modulate chance based on durability (already handled in generateInjury, but we might want extra 'in-game' factor)
             // generateInjury handles the probability.

             // We need to simulate "did they get injured during this game"
             // If we call generateInjury(starter), it returns an injury object if they get hurt.
             injury = generateInjury(starter);

             if (injury) {
                 // They got hurt. Determine when.
                 // Random share 0.1 to 0.9 (10% to 90% of game played)
                 const playedShare = 0.1 + (U.random() * 0.8);
                 starterShare *= playedShare;
                 backupShare = (shareDistribution[0] || 1.0) - starterShare;

                 // Apply injury to player
                 if (!starter.injuries) starter.injuries = [];
                 starter.injuries.push(injury);
                 starter.injured = true;
                 starter.injuryWeeksRemaining = Math.max(starter.injuryWeeksRemaining || 0, injury.weeksRemaining);
                 if (injury.seasonEnding) starter.seasonEndingInjury = true;

                 gameInjuries.push({
                      playerId: starter.id,
                      name: starter.name,
                      teamId: team.id,
                      type: injury.name,
                      duration: injury.weeksRemaining,
                      seasonEnding: injury.seasonEnding
                 });
             }
          }

          // Process Starter
          if (starter) {
              const stats = generateStatsFn(starter, ...args, starterShare);
              // Zero out random TDs (handled later)
              if (stats.passTD !== undefined) stats.passTD = 0;
              if (stats.rushTD !== undefined) stats.rushTD = 0;
              if (stats.recTD !== undefined) stats.recTD = 0;
              Object.assign(starter.stats.game, stats);
          }

          // Process Backup if needed (either due to injury or rotation)
          const backup = players[1];
          // Normal rotation share + extra form injury
          let rotationShare = shareDistribution[1] || 0;
          let totalBackupShare = rotationShare + backupShare;

          if (backup && totalBackupShare > 0.05) {
               const stats = generateStatsFn(backup, ...args, totalBackupShare);
               if (stats.passTD !== undefined) stats.passTD = 0;
               if (stats.rushTD !== undefined) stats.rushTD = 0;
               if (stats.recTD !== undefined) stats.recTD = 0;
               Object.assign(backup.stats.game, stats);
          }
      };

       team.roster.forEach(player => {
        initializePlayerStats(player);
        player.stats.game = {};
      });

      const qbs = groups['QB'] || [];
      let totalPassAttempts = 30;

      // QB Injury/Stats Logic
      if (qbs.length > 0) {
          processPositionGroup(qbs,
            (p, s, os, d, u, m, share) => generateQBStats(p, s, os, d, u, m, share),
            [1.0], // 100% share for starter normally
            score, oppScore, oppDefenseStrength, U, mods
          );

          // Update totalPassAttempts based on whoever played
          const starterStats = qbs[0].stats.game;
          const backupStats = qbs[1] ? qbs[1].stats.game : {};
          totalPassAttempts = (starterStats.passAtt || 0) + (backupStats.passAtt || 0) || 30;

          // Assign Win/Loss to starter
          if (qbs[0]) {
             if (score > oppScore) qbs[0].stats.game.wins = 1;
             else if (score < oppScore) qbs[0].stats.game.losses = 1;
          }
      }

      const rbs = (groups['RB'] || []).slice(0, 3);
      // RB Injury/Stats Logic
      // 70/30 split normally
      processPositionGroup(rbs,
        (p, s, os, d, u, m, share) => generateRBStats(p, s, os, d, u, m, share),
        [0.7, 0.3],
        score, oppScore, oppDefenseStrength, U, mods
      );

      const wrs = (groups['WR'] || []).slice(0, 5);
      const tes = (groups['TE'] || []).slice(0, 2);
      const receiverTargetsPool = Math.round(totalPassAttempts * 0.85);
      const allReceivers = [...wrs, ...tes];

      // Check WR/TE In-Game Injuries
      // Save original OVRs so injury does NOT permanently mutate player objects
      const originalReceiverOvrs = new Map();
      allReceivers.forEach(rec => originalReceiverOvrs.set(rec.id, rec.ovr));

      allReceivers.forEach(rec => {
          if (generateInjury && canPlayerPlay(rec)) {
              if (!rec.injured && U.random() < 0.015) { // 1.5% chance per game
                   const injury = generateInjury(rec);
                   if (injury) {
                       if (!rec.injuries) rec.injuries = [];
                       rec.injuries.push(injury);
                       rec.injured = true;
                       rec.injuryWeeksRemaining = Math.max(rec.injuryWeeksRemaining || 0, injury.weeksRemaining);
                       if (injury.seasonEnding) rec.seasonEndingInjury = true;

                       // Temporarily reduce OVR for target distribution weight only
                       rec.ovr = (originalReceiverOvrs.get(rec.id) || rec.ovr) * 0.5;

                       gameInjuries.push({
                          playerId: rec.id,
                          name: rec.name,
                          teamId: team.id,
                          type: injury.name,
                          duration: injury.weeksRemaining,
                          seasonEnding: injury.seasonEnding
                       });
                   }
              }
          }
      });

      // Pass starTargetId from strategies
      const starTargetId = team.strategies?.starTargetId;
      const distributedTargets = distributePassingTargets(allReceivers, receiverTargetsPool, U, starTargetId);

      distributedTargets.forEach(item => {
        const wrStats = generateReceiverStats(item.player, item.targets, score, oppDefenseStrength, U);
        // Zero out random TDs
        wrStats.recTD = 0;
        Object.assign(item.player.stats.game, wrStats);
      });

      // Restore original OVRs after target distribution (injury reduced them temporarily)
      allReceivers.forEach(rec => {
        const origOvr = originalReceiverOvrs.get(rec.id);
        if (origOvr !== undefined) rec.ovr = origOvr;
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
        const k = kickers[0];
        // Pass drive-engine results directly; no post-hoc patching needed
        const kStats = generateKickerStats(k, actualFGs, actualXPs, U);
        Object.assign(k.stats.game, kStats);
      }

      const punters = groups['P'] || [];
      if (punters.length > 0) {
        Object.assign(punters[0].stats.game, generatePunterStats(punters[0], score, U));
      }

      // --- DISTRIBUTE TOUCHDOWNS ---
      // Enhanced: QB can now score rush TDs, and defensive TDs are tracked.
      // NFL average: ~55-60% of offensive TDs are passing TDs.
      let tdsToAssign = actualTDs;
      let totalRecTDs = 0;

      const scorers = [];

      // QBs are eligible for rushing TDs (dual-threat)
      qbs.forEach(p => {
          if (p.stats && p.stats.game && (p.stats.game.rushYd || 0) > 0) {
              const qbSpeed = (p.ratings?.speed || 60);
              // Weight by rush yards and mobility
              const w = Math.max(1, (p.stats.game.rushYd || 0) * (qbSpeed > 75 ? 1.5 : 0.5));
              scorers.push({ p, weight: w, type: 'QB' });
          }
      });

      // RBs are eligible
      rbs.forEach(p => {
          if (p.stats && p.stats.game) {
              const w = (p.stats.game.rushYd || 0) + (p.stats.game.recYd || 0);
              scorers.push({ p, weight: Math.max(1, w), type: 'RB' });
          }
      });

      // Receivers are eligible
      distributedTargets.forEach(item => {
          if (item.player.stats && item.player.stats.game) {
              const w = (item.player.stats.game.recYd || 0);
              scorers.push({ p: item.player, weight: Math.max(1, w), type: 'WR' });
          }
      });

      const receiverScorers = scorers.filter(s => s.type === 'WR');

      if (scorers.length > 0) {
          // Step 1: Guarantee a minimum of 50% of TDs go to receivers (pass TDs)
          const passTdFloor = receiverScorers.length > 0
              ? Math.min(tdsToAssign, Math.round(actualTDs * 0.50))
              : 0;

          for (let i = 0; i < passTdFloor; i++) {
              const weights = receiverScorers.map(s => s.weight);
              const idx = U.weightedChoice(weights);
              const winner = receiverScorers[idx];
              winner.p.stats.game.recTD = (winner.p.stats.game.recTD || 0) + 1;
              totalRecTDs++;
              tdsToAssign--;
          }

          // Step 2: Distribute remaining TDs among all scorers (QBs + RBs + receivers)
          while (tdsToAssign > 0) {
              const weights = scorers.map(s => s.weight);
              const idx = U.weightedChoice(weights);
              const winner = scorers[idx];

              if (winner.type === 'QB') {
                  // QB rushing TD
                  winner.p.stats.game.rushTD = (winner.p.stats.game.rushTD || 0) + 1;
              } else if (winner.type === 'RB') {
                  // Bias towards rush TD if rush yards > rec yards
                  const rushY = winner.p.stats.game.rushYd || 0;
                  const recY = winner.p.stats.game.recYd || 0;
                  const rushChance = rushY / Math.max(1, rushY + recY);

                  if (U.random() < rushChance) {
                      winner.p.stats.game.rushTD = (winner.p.stats.game.rushTD || 0) + 1;
                  } else {
                      winner.p.stats.game.recTD = (winner.p.stats.game.recTD || 0) + 1;
                      totalRecTDs++;
                  }
              } else {
                  winner.p.stats.game.recTD = (winner.p.stats.game.recTD || 0) + 1;
                  totalRecTDs++;
              }
              tdsToAssign--;
          }
      }

      // --- DISTRIBUTE 2-POINT CONVERSIONS ---
      if (actualTwoPts > 0) {
          let ptsToAssign = actualTwoPts;

          if (scorers.length > 0) {
              while (ptsToAssign > 0) {
                  const tdScorers = scorers.filter(s => (s.p.stats.game.rushTD > 0 || s.p.stats.game.recTD > 0));
                  const pool = tdScorers.length > 0 ? tdScorers : scorers;

                  const weights = pool.map(s => s.weight);
                  const idx = U.weightedChoice(weights);
                  const winner = pool[idx];

                  if (winner && winner.p && winner.p.stats && winner.p.stats.game) {
                      winner.p.stats.game.twoPtMade = (winner.p.stats.game.twoPtMade || 0) + 1;
                  }
                  ptsToAssign--;
              }
          }
      }

      // Assign Pass TDs to QB (receiving TDs = passing TDs for the QB)
      const starterQB = qbs.length > 0 ? qbs[0] : null;
      if (starterQB && starterQB.stats.game) {
          starterQB.stats.game.passTD = totalRecTDs;
      }


// In-game injuries handled within position groups
    };

    // Pass the mods to the team generation
    // Pass actualTwoPts (homeRes.twoPtMade / awayRes.twoPtMade)
    const homeTwoPts = homeRes.twoPtMade || 0;
    const awayTwoPts = awayRes.twoPtMade || 0;

    // Collect all injuries for this game
    const gameInjuries = [];

    // CORRECTED: Pass the OPPONENT'S defense strength when generating stats for a team.
    // generateStatsForTeam(team, score, oppScore, oppDefenseStrength, ...)
    generateStatsForTeam(home, homeScore, awayScore, awayDefenseStrength, awayStrength, homeGroups, homeMods, homeTDs, homeFGs, homeXPs, homeTwoPts);
    generateStatsForTeam(away, awayScore, homeScore, homeDefenseStrength, homeStrength, awayGroups, awayMods, awayTDs, awayFGs, awayXPs, awayTwoPts);

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

    return {
      homeScore, awayScore, schemeNote, injuries: gameInjuries,
      weather: weather.id,
      homeDefTDs: homeRes.defensiveTDs || 0,
      awayDefTDs: awayRes.defensiveTDs || 0,
      homeSafeties: homeRes.safeties || 0,
      awaySafeties: awayRes.safeties || 0,
      homeTurnoversForced: homeRes.turnoversForced || 0,
      awayTurnoversForced: awayRes.turnoversForced || 0,
    };

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
    'ratingWhenTargeted',
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

    const { homeTeamId, awayTeamId, homeScore, awayScore, stats, injuries } = gameData;
    let home, away;
    if (league._teamsMap) {
        home = league._teamsMap[homeTeamId];
        away = league._teamsMap[awayTeamId];
    } else {
        home = league.teams.find(t => t && t.id === homeTeamId);
        away = league.teams.find(t => t && t.id === awayTeamId);
    }

    if (!home || !away) {
        throw new Error(`Teams not found: ${homeTeamId}, ${awayTeamId}`);
    }

    // 1. Update Schedule (Find the game)
    const weekIndex = (league.week || 1) - 1;
    let scheduledGame = null;

    if (league._scheduleMap) {
        scheduledGame = league._scheduleMap[`${homeTeamId}-${awayTeamId}`];
    } else {
        const scheduleWeeks = league.schedule?.weeks || league.schedule || [];

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
                // Use String(p.id) to match the stringified keys written by capturePlayerStats.
                const pid = String(p.id);
                const pStats = teamStats.players[pid] ?? teamStats.players[p.id];
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
        injuries: injuries || [],
        week: league.week,
        year: league.year,
        isPlayoff: isPlayoff,
        weather: gameData.weather || null,
        defensiveTDs: {
            home: gameData.homeDefTDs || 0,
            away: gameData.awayDefTDs || 0
        },
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

    // OPTIMIZATION: Create a map for fast roster lookups O(N) instead of O(N*M)
    const pids = Object.keys(playerStatsMap);

    // Instead of looping all roster players, only lookup players that have stats
    for (let i = 0; i < pids.length; i++) {
        const pid = pids[i];
        // We do have to search the array, but roster is small (53 elements)
        // Alternatively we can use the map approach but without array checks if already map
        // Given earlier benchmarks, ObjectKeys is taking time
        // Let's optimize by just looping through the roster!

        let p = null;
        for (let j = 0; j < roster.length; j++) {
            if (String(roster[j].id) === pid) {
                p = roster[j];
                break;
            }
        }

        if (p) {
            box[pid] = {
                name: p.name,
                pos: p.pos,
                stats: playerStatsMap[pid]
            };
        }
    }
    return box;
}

/**
 * Simulates a batch of games.
 *
 * BATCHING OPTIMIZATION:
 * This function collects all game results into an in-memory buffer (array) and returns them.
 * It does NOT perform individual database transactions per game. The caller (worker.js)
 * is responsible for applying these results to the state cache and performing a single
 * bulk flush via flushDirty().
 *
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

    // Clear per-batch caches so scheme fit and morale are recalculated fresh each week
    if (league.teams) {
        for (const t of league.teams) {
            if (t) { delete t._cachedSchemeFit; delete t._cachedMorale; }
        }
    }

    // OPTIMIZATION: create maps for fast lookups during commit
    if (league.teams && !league._teamsMap) {
        league._teamsMap = {};
        for (let i = 0; i < league.teams.length; i++) {
            const t = league.teams[i];
            if (t && t.id !== undefined) league._teamsMap[t.id] = t;
        }
    }

    if (league.schedule && !league._scheduleMap) {
        league._scheduleMap = {};
        const weekIndex = (league.week || 1) - 1;
        const scheduleWeeks = league.schedule?.weeks || league.schedule || [];
        const weekSchedule = scheduleWeeks[weekIndex];
        if (weekSchedule && weekSchedule.games) {
            for (let i = 0; i < weekSchedule.games.length; i++) {
                const g = weekSchedule.games[i];
                if (g && g.home !== undefined && g.away !== undefined) {
                    const hId = typeof g.home === 'object' ? g.home.id : g.home;
                    const aId = typeof g.away === 'object' ? g.away.id : g.away;
                    league._scheduleMap[`${hId}-${aId}`] = g;
                }
            }
        }
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
                     if (verbose) console.log(`[SIM-DEBUG] Game ${home.abbr} vs ${away.abbr} already finalized. Using existing result.`);
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
            let gameInjuries = [];

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
                if (gameScores.injuries) gameInjuries = gameScores.injuries;

                // Store weather and defensive scoring data for the result
                pair._weather = gameScores.weather || null;
                pair._homeDefTDs = gameScores.homeDefTDs || 0;
                pair._awayDefTDs = gameScores.awayDefTDs || 0;

                // Capture stats for box score.
                // Always key by String(player.id) so numeric and string IDs
                // (legacy saves vs. new base-36 IDs) produce consistent keys.
                const capturePlayerStats = (roster) => {
                    const playerStats = {};
                    for (let i = 0; i < roster.length; i++) {
                        const player = roster[i];
                        if (player && player.stats && player.stats.game) {
                            playerStats[String(player.id)] = {
                                name: player.name,
                                pos: player.pos,
                                ...player.stats.game
                            };
                        }
                    }
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
                },
                injuries: gameInjuries,
                weather: pair._weather,
                homeDefTDs: pair._homeDefTDs || 0,
                awayDefTDs: pair._awayDefTDs || 0,
            };

            const resultObj = commitGameResult(league, gameData, { persist: false });
            if (schemeNote && resultObj) {
                resultObj.schemeNote = schemeNote;
            }
            if (resultObj && pair._weather) {
                resultObj.weather = pair._weather;
            }

            if (resultObj) {
                results.push(resultObj);
            }

        } catch (error) {
            console.error(`[SIM-DEBUG] Error simulating game ${index}:`, error);
        }
    });

    if (league._teamsMap) {
        delete league._teamsMap;
    }
    if (league._scheduleMap) {
        delete league._scheduleMap;
    }

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
