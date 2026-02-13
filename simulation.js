/*
 * Updated Simulation Module with Web Worker Support
 *
 * ES Module version - migrated from global exports
 */

// Import dependencies
import { Utils } from './utils.js';
import { Constants } from './constants.js';
import { saveState } from './state.js';
import { calculateWAR, updateAdvancedStats, getZeroStats, updatePlayerSeasonLegacy, checkHallOfFameEligibility } from './player.js';
import { processStaffXp } from './coach-system.js';
import { runWeeklyTraining } from './training.js';
import newsEngine from './news-engine.js';
import { showWeeklyRecap } from './weekly-recap.js';
import { checkAchievements } from './achievements.js';
import { validateLeagueState } from './game-simulator.js'; // Needed for validation
import { processStaffPoaching } from './coach-system.js';
import { checkRosterLegality } from './validation.js';
import { updatePlayerStats } from './stats-tracking.js';

// Simulation Lock
let isSimulating = false;
let simResolve = null;
let simReject = null;
let simWatchdogTimer = null;

// Watchdog: Maximum time (ms) to wait for the worker before forcibly aborting
const SIM_WATCHDOG_TIMEOUT_MS = 5000;

/**
 * Saves a debug snapshot of the current simulation state so that hangs
 * or crashes can be reproduced later with the same seed / conditions.
 */
function saveDebugSnapshot(reason) {
  try {
    const L = window.state?.league;
    const snapshot = {
      reason,
      timestamp: new Date().toISOString(),
      week: L?.week,
      year: L?.year,
      seed: L?.seed ?? null,
      teamCount: L?.teams?.length ?? 0,
      stateVersion: window.state?.version
    };
    const key = 'nflGM4.debugSnapshot';
    window.localStorage.setItem(key, JSON.stringify(snapshot));
    console.warn('[WATCHDOG] Debug snapshot saved:', snapshot);
  } catch (e) {
    console.error('[WATCHDOG] Failed to save debug snapshot:', e);
  }
}

/**
 * Clears the watchdog timer if one is active.
 */
function clearSimWatchdog() {
  if (simWatchdogTimer !== null) {
    clearTimeout(simWatchdogTimer);
    simWatchdogTimer = null;
  }
}

/**
 * Starts a watchdog timer that will forcibly abort the simulation
 * if the worker doesn't respond within SIM_WATCHDOG_TIMEOUT_MS.
 */
function startSimWatchdog() {
  clearSimWatchdog();
  simWatchdogTimer = setTimeout(() => {
    if (!isSimulating) return; // Already resolved

    console.error(`[WATCHDOG] Simulation timed out after ${SIM_WATCHDOG_TIMEOUT_MS}ms`);
    saveDebugSnapshot('WATCHDOG_TIMEOUT');

    // Force-release the simulation lock
    isSimulating = false;
    if (document.body) document.body.style.cursor = 'default';

    if (window.setStatus) {
      window.setStatus(
        'Simulation timed out. Your save has been preserved. Try advancing again or reload.',
        'error',
        10000
      );
    }

    if (simReject) {
      simReject(new Error('SIM_WATCHDOG_TIMEOUT'));
      simResolve = null;
      simReject = null;
    }
  }, SIM_WATCHDOG_TIMEOUT_MS);
}

// =============================================================================
// COMPETITIVE BALANCE - Prevents super-dynasties, keeps league fresh
// =============================================================================

/**
 * Apply competitive balance adjustments at season start.
 * - Top teams face slight regression (players age, key departures)
 * - Bottom teams get development boosts (lottery picks already help, this adds more)
 * - Middle teams stay relatively stable
 *
 * This creates realistic parity: dynasties are possible but require
 * excellent management, not just accumulating talent.
 */
function applyCompetitiveBalance(league) {
    if (!league || !league.teams) return;
    const U = Utils;

    // Sort teams by wins from last season
    const teamsByRecord = league.teams
        .map((team, idx) => ({
            team,
            idx,
            wins: team.wins || 0,
            losses: team.losses || 0
        }))
        .sort((a, b) => b.wins - a.wins);

    const totalTeams = teamsByRecord.length;

    teamsByRecord.forEach((entry, rank) => {
        const team = entry.team;
        if (!team.roster) return;

        const tierPct = rank / totalTeams; // 0.0 = best, 1.0 = worst

        if (tierPct <= 0.25) {
            // TOP QUARTER: Slight regression
            // Simulate the difficulty of staying on top (key FAs leave, coaching turnover, etc.)
            team.roster.forEach(p => {
                if (!p || !p.ratings) return;

                // Veteran fatigue: players on winning teams age slightly faster
                if (p.age >= 28 && U.random() < 0.15) {
                    const stat = U.choice(['speed', 'acceleration', 'agility', 'stamina']);
                    if (p.ratings[stat] && p.ratings[stat] > 50) {
                        p.ratings[stat] = Math.max(50, p.ratings[stat] - 1);
                    }
                }
            });

            // Salary cap pressure: top teams have less room (more expensive roster)
            if (team.capTotal && team.capRoom) {
                team.capRoom = Math.max(0, team.capRoom - U.rand(1, 3));
            }

        } else if (tierPct >= 0.75) {
            // BOTTOM QUARTER: Development boost
            // High draft picks help, plus young players develop faster on bad teams
            // (more playing time for rookies)
            team.roster.forEach(p => {
                if (!p || !p.ratings) return;

                // Young player development boost (more playing time on bad teams)
                if (p.age <= 25 && U.random() < 0.20) {
                    const stat = U.choice(['awareness', 'intelligence']);
                    if (p.ratings[stat]) {
                        p.ratings[stat] = Math.min(99, p.ratings[stat] + U.rand(1, 2));
                    }
                }
            });
        }

        // ALL TEAMS: Age all players by 1 year
        team.roster.forEach(p => {
            if (p) p.age = (p.age || 22) + 1;
        });

        // Note: Retirements are processed in startOffseason(), not here.
        // Processing them here caused double-retirement bugs where players
        // were retired both during competitive balance AND during offseason.
    });

    console.log('[BALANCE] Competitive balance adjustments applied');
}

export function getIsSimulating() { return isSimulating; }
if (typeof window !== 'undefined') window.isGameSimulating = getIsSimulating;

// Worker Initialization
const worker = new Worker(new URL('./simulation.worker.js', import.meta.url), { type: 'module' });

// Worker Message Handler
worker.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === 'SIM_COMPLETE') {
    handleSimulationComplete(payload);
  } else if (type === 'SIM_ERROR') {
    handleSimulationError(payload);
  }
};

worker.onerror = (error) => {
  handleSimulationError({ message: error.message, stack: error.stack });
};

/**
 * Validates that required global dependencies are available
 * @returns {boolean} True if all dependencies are available
 */
function validateDependencies() {
  const missing = [];
  
  if (!Constants?.SIMULATION) missing.push('Constants.SIMULATION');
  if (!Utils) missing.push('Utils');
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
 * Accumulate season stats into career stats for all players
 * @param {Object} league - League object
 */
function accumulateCareerStats(league) {
  // ... (Same logic as before, omitting for brevity in thought process, but will include in file)
  if (!league || !league.teams) return;

  const year = league.year || new Date().getFullYear();
  
  league.teams.forEach(team => {
    if (!team.roster || !Array.isArray(team.roster)) return;
    
    team.roster.forEach(player => {
      // 1. Snapshot Season Stats
      if (!player.stats || !player.stats.season) return;
      
      if (typeof calculateWAR === 'function') {
          player.stats.season.war = calculateWAR(player, player.stats.season);
      }

      const seasonSnapshot = { ...player.stats.season };

      if (Object.keys(seasonSnapshot).length > 0) {
          if (!player.statsHistory) player.statsHistory = [];
          player.statsHistory.push({
              season: year,
              team: team.abbr || team.name,
              ...seasonSnapshot
          });
      }

      // 2. Reset Season Stats (Using imported helper if possible, or manual reset)
      // We can't import initializePlayerStats easily if it's in game-simulator.js which is now pure/module
      // But we can reset manually or use getZeroStats

      player.stats.season = getZeroStats();
      
      const career = player.stats.career;

      const derivedFields = [
          'completionPct', 'yardsPerCarry', 'yardsPerReception',
          'avgPuntYards', 'successPct', 'passerRating', 'ratingWhenTargeted'
      ];

      Object.keys(seasonSnapshot).forEach(key => {
        const value = seasonSnapshot[key];
        if (typeof value === 'number') {
            if (derivedFields.includes(key) || key.includes('Rating') || key.includes('Grade')) {
                return;
            }
            career[key] = (career[key] || 0) + value;
        }
      });

      const longestFields = ['longestPass', 'longestRun', 'longestCatch', 'longestFG', 'longestPunt'];
      longestFields.forEach(field => {
        if (typeof seasonSnapshot[field] === 'number' && seasonSnapshot[field] > (career[field] || 0)) {
          career[field] = seasonSnapshot[field];
        }
      });

      if (career.passAtt > 0) {
          career.completionPct = Math.round((career.passComp / career.passAtt) * 1000) / 10;
      }
      if (career.rushAtt > 0) {
          career.yardsPerCarry = Math.round((career.rushYd / career.rushAtt) * 10) / 10;
      }
      if (career.receptions > 0) {
          career.yardsPerReception = Math.round((career.recYd / career.receptions) * 10) / 10;
      }
      if (career.punts > 0) {
          career.avgPuntYards = Math.round((career.puntYards / career.punts) * 10) / 10;
      }
      if (career.fgAttempts > 0) {
          career.successPct = Math.round((career.fgMade / career.fgAttempts) * 1000) / 10;
      }
    });
  });
}

// ... startOffseason and startNewSeason functions are identical to previous version ...
// I will include them fully.

function startOffseason() {
  try {
    const L = window.state?.league;
    if (!L) {
      console.error('No league loaded to start offseason');
      return;
    }

    if (window.state.offseason === true) {
      console.log('Already in offseason, skipping');
      return;
    }

    console.log('Starting offseason...');
    
    window.state.offseason = true;
    window.state.offseasonYear = L.year;
    
    if (updatePlayerSeasonLegacy) {
        console.log('Updating player season legacy...');
        L.teams.forEach(team => {
            if (team.roster) {
                team.roster.forEach(player => {
                    if (player.stats && player.stats.season) {
                        updatePlayerSeasonLegacy(player, player.stats.season, team, L.year);
                    }
                });
            }
        });
    }

    accumulateCareerStats(L);

    if (L.ownerChallenge && L.ownerChallenge.status === 'PENDING') {
        const challenge = L.ownerChallenge;
        const userTeam = L.teams[window.state.userTeamId];
        let success = false;

        if (challenge.target === 'WINS_6') {
            const wins = userTeam.wins || userTeam.record.w || 0;
            success = wins >= 6;
        } else if (challenge.target === 'PLAYOFFS') {
            success = window.state.playoffs && window.state.playoffs.teams.some(t => t.id === userTeam.id);
        } else if (challenge.target === 'CONF_CHAMP') {
            const sb = window.state.playoffs?.results?.find(r => r.name === 'Super Bowl')?.games?.[0];
            if (sb) {
                const inSB = (sb.home.id === userTeam.id || sb.away.id === userTeam.id);
                success = inSB;
            }
        }

        const adjustment = success ? challenge.reward : challenge.penalty;
        userTeam.pendingCapAdjustment = adjustment;
        challenge.status = 'COMPLETED';
        challenge.result = success ? 'SUCCESS' : 'FAILURE';

        console.log(`[GAMBLE] Result: ${success ? 'SUCCESS' : 'FAILURE'}, Cap Adjustment: ${adjustment}M`);

        if (window.setStatus) {
            window.setStatus(`Owner's Gamble ${success ? 'WON' : 'LOST'}: Cap adjustment ${adjustment > 0 ? '+' : ''}${adjustment}M for next season.`, success ? 'success' : 'error', 8000);
        }
    }
    
    L.teams.forEach(team => {
        try {
            if (typeof window.processCapRollover === 'function') {
                window.processCapRollover(L, team);
            } else if (window.calculateRollover) {
                team.capRollover = window.calculateRollover(team, L);
            }

            if (team.pendingCapAdjustment) {
                console.log(`[CAP] Applying Owner's Gamble Adjustment for ${team.name}: ${team.pendingCapAdjustment}M`);
                team.capRollover = (team.capRollover || 0) + team.pendingCapAdjustment;
                delete team.pendingCapAdjustment;
            }
        } catch (error) {
            console.error('Error processing cap rollover for team', team?.abbr || team?.name, error);
        }
    });
    
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
    
    try {
        const playoffs = window.state.playoffs;
        const playoffTeamIds = new Set();
        if (playoffs && playoffs.teams) {
             playoffs.teams.forEach(t => playoffTeamIds.add(t.id));
        } else if (playoffs && playoffs.results) {
             playoffs.results.forEach(r => {
                 if(r.games) r.games.forEach(g => {
                     if(g.home) playoffTeamIds.add(g.home.id);
                     if(g.away) playoffTeamIds.add(g.away.id);
                 });
             });
        }

        L.teams.forEach(team => {
            if (!team.legacy) team.legacy = {
                playoffStreak: 0,
                championships: [],
                divisionTitles: 0,
                bestSeason: null
            };

            if (playoffTeamIds.has(team.id)) {
                 team.legacy.playoffStreak++;
            } else {
                 team.legacy.playoffStreak = 0;
            }

            const wins = team.wins || 0;
            const pointDiff = (team.ptsFor || 0) - (team.ptsAgainst || 0);
            const seasonScore = wins * 10 + pointDiff * 0.1;

            if (!team.legacy.bestSeason || seasonScore > team.legacy.bestSeason.score) {
                team.legacy.bestSeason = {
                    year: L.year,
                    wins: wins,
                    losses: team.losses || 0,
                    pointDiff: pointDiff,
                    score: seasonScore
                };
                if (newsEngine && team.id === window.state.userTeamId) {
                     newsEngine.addNewsItem(L,
                        `Franchise Record: ${team.name}`,
                        `The ${team.name} have set a new franchise record for best season performance with ${wins} wins.`,
                        null, 'team'
                    );
                }
            }
        });
    } catch (e) {
        console.error("Error updating team legacy:", e);
    }

    if (typeof window.calculateAndRecordCoachRankings === 'function') {
      try {
        window.calculateAndRecordCoachRankings(L, L.year);
      } catch (error) {
        console.error('Error recording coach rankings:', error);
      }
    }
    
    if (typeof window.calculateAllAwards === 'function') {
      try {
        console.log('Calculating season awards...');
        const awards = window.calculateAllAwards(L, L.year);
        console.log('Awards calculated:', awards);
      } catch (error) {
        console.error('Error calculating awards:', error);
      }
    }
    
    if (typeof window.updateAllRecords === 'function') {
      try {
        window.updateAllRecords(L, L.year);
      } catch (error) {
        console.error('Error updating records:', error);
      }
    }
    
    let newlyRetired = [];
    if (typeof window.processRetirements === 'function') {
      try {
        const retirementResults = window.processRetirements(L, L.year);
        if (retirementResults && retirementResults.retired) {
            newlyRetired = retirementResults.retired.map(item => item.player);
            console.log(`Processed ${newlyRetired.length} retirements`);

            if (!L.retiredPlayers) L.retiredPlayers = [];

            const candidates = newlyRetired.filter(p => {
                const score = p.legacy?.metrics?.legacyScore || 0;
                return score > 40 || p.ovr > 80;
            });

            L.retiredPlayers.push(...candidates);
        }
      } catch (error) {
        console.error('Error processing retirements:', error);
      }
    }

    if (checkHallOfFameEligibility && L.retiredPlayers) {
        const inducted = [];
        L.retiredPlayers.forEach(p => {
            if (checkHallOfFameEligibility(p, L.year)) {
                 inducted.push(p);
                 if (newsEngine) {
                    newsEngine.addNewsItem(L,
                        `Hall of Fame: ${p.name} Inducted`,
                        `${p.name} has been elected to the Hall of Fame following a legendary career.`,
                        null, 'award'
                    );
                }
            }
        });

        if (inducted.length > 0) {
             if (window.setStatus) window.setStatus(`${inducted.length} players inducted into Hall of Fame!`, 'success');
        }
    }

    if (typeof window.runOffseason === 'function') {
      try {
        window.runOffseason();
      } catch (error) {
        console.error('Error in runOffseason:', error);
      }
    }

    const leagueRef = window.state?.league || L;

    if (processStaffXp && leagueRef && leagueRef.teams) {
        console.log('Processing staff XP progression...');
        const playoffs = window.state.playoffs;
        const championId = playoffs && playoffs.winner ? playoffs.winner.id : -1;

        leagueRef.teams.forEach(team => {
            if (!team.staff) return;

            const isChampion = team.id === championId;
            const wins = team.wins || (team.record ? team.record.w : 0);

            let playoffWins = 0;
            if (playoffs && playoffs.results && Array.isArray(playoffs.results)) {
                playoffs.results.forEach(round => {
                    if (round && round.games && Array.isArray(round.games)) {
                        round.games.forEach(g => {
                            if (g.home && g.home.id === team.id && g.scoreHome > g.scoreAway) playoffWins++;
                            if (g.away && g.away.id === team.id && g.scoreAway > g.scoreHome) playoffWins++;
                        });
                    }
                });
            }

            const performance = {
                wins: wins,
                playoffWins: playoffWins,
                isChampion: isChampion
            };

            const staffList = [team.staff.headCoach, team.staff.offCoordinator, team.staff.defCoordinator, team.staff.scout];
            staffList.forEach(s => {
                if (s) {
                   const leveledUp = processStaffXp(s, performance);
                   if (leveledUp) {
                       console.log(`${s.name} (${s.position}) leveled up to ${s.level}!`);
                       if (window.state.userTeamId === team.id && window.setStatus) {
                           window.setStatus(`Staff Level Up: ${s.name} is now level ${s.level}!`, 'success');
                       }
                   }
                }
            });
        });

        if (processStaffPoaching) {
            processStaffPoaching(leagueRef);
        }
    }
    
    if (window.state?.ownerMode?.enabled && typeof window.calculateRevenue === 'function' && typeof window.updateFanSatisfaction === 'function') {
      try {
        window.updateFanSatisfaction();
        window.calculateRevenue();

        if (typeof window.checkJobSecurity === 'function') {
            const firingResult = window.checkJobSecurity(window.state.league.teams[window.state.userTeamId]);
            if (firingResult.fired) {
                if (window.Modal) {
                    new window.Modal({
                        title: 'TERMINATED',
                        content: `<div style="text-align:center;">
                                    <h2 style="color: #ef4444; margin-bottom: 15px;">You Have Been Fired</h2>
                                    <p style="margin-bottom: 20px;">${firingResult.reason}</p>
                                    <button class="btn danger large" onclick="localStorage.removeItem('football_gm_league_' + window.state.leagueName); location.reload()">Game Over (Delete Save)</button>
                                  </div>`,
                        size: 'normal'
                    }).render();
                    return;
                } else {
                    alert(`FIRED: ${firingResult.reason}`);
                    location.reload();
                    return;
                }
            }
        }

        if (typeof window.renderOwnerModeInterface === 'function') {
          window.renderOwnerModeInterface();
        }
      } catch (ownerError) {
        console.error('Error updating owner mode at season end:', ownerError);
      }
    }
    
    // Auto-save on phase change
    if (window.saveGameState) {
        window.saveGameState().catch(e => console.error("Auto-save failed:", e));
    } else if (typeof window.saveState === 'function') {
        window.saveState();
    }
    
    if (typeof window.setStatus === 'function') {
      window.setStatus(`🏆 ${L.year} Season Complete! Entering Offseason - Resign players, sign free agents, and draft rookies before the ${L.year + 1} season.`, 'success', 10000);
    }
    
    if (window.location) {
      window.location.hash = '#/hub';
    }
    
    if (typeof window.renderHub === 'function') {
      setTimeout(() => {
        window.renderHub();
      }, 100);
    }
    
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
 * Prune active memory to prevent the game state from growing unbounded.
 * - Strips box scores from resultsByWeek older than the most recent season
 * - Caps retiredPlayers to the top 50 by legacy score (rest are archived)
 * - Limits per-player statsHistory to last 5 seasons in active memory
 *
 * Archived data is serialized to a separate localStorage key so users
 * can view it via "View History" without it bloating active state.
 */
function pruneActiveMemory(league) {
    if (!league) return;

    const MAX_RETIRED_IN_MEMORY = 50;
    const MAX_STATS_HISTORY_SEASONS = 5;
    const archiveKey = 'nflGM4.archive.' + (window.state?.leagueName || 'default');

    // 1. Strip box scores from all resultsByWeek (keep only scores/summary)
    if (league.resultsByWeek) {
        const strip = (weekResults) => {
            if (!Array.isArray(weekResults)) return weekResults;
            return weekResults.map(result => {
                if (!result || typeof result !== 'object') return result;
                const { boxScore, playerStats, ...summary } = result;
                return summary;
            });
        };

        if (Array.isArray(league.resultsByWeek)) {
            league.resultsByWeek = league.resultsByWeek.map(strip);
        } else if (typeof league.resultsByWeek === 'object') {
            Object.keys(league.resultsByWeek).forEach(key => {
                league.resultsByWeek[key] = strip(league.resultsByWeek[key]);
            });
        }
    }

    // 2. Cap retired players in active memory
    if (league.retiredPlayers && league.retiredPlayers.length > MAX_RETIRED_IN_MEMORY) {
        // Sort by legacy score descending, keep top entries
        league.retiredPlayers.sort((a, b) => {
            const scoreA = a.legacy?.metrics?.legacyScore || 0;
            const scoreB = b.legacy?.metrics?.legacyScore || 0;
            return scoreB - scoreA;
        });

        // Archive overflow to separate storage
        const overflow = league.retiredPlayers.slice(MAX_RETIRED_IN_MEMORY);
        league.retiredPlayers = league.retiredPlayers.slice(0, MAX_RETIRED_IN_MEMORY);

        try {
            const existing = JSON.parse(window.localStorage.getItem(archiveKey) || '{}');
            if (!existing.retiredPlayers) existing.retiredPlayers = [];
            // Append overflow with minimal data
            overflow.forEach(p => {
                existing.retiredPlayers.push({
                    name: p.name, pos: p.pos,
                    legacyScore: p.legacy?.metrics?.legacyScore || 0,
                    hallOfFame: !!p.legacy?.hallOfFame?.inducted,
                    archivedYear: league.year
                });
            });
            window.localStorage.setItem(archiveKey, JSON.stringify(existing));
        } catch (e) {
            console.warn('[MEMORY] Failed to archive retired players:', e);
        }
    }

    // 3. Trim per-player statsHistory to last N seasons
    if (league.teams) {
        league.teams.forEach(team => {
            if (!team.roster) return;
            team.roster.forEach(player => {
                if (player.statsHistory && player.statsHistory.length > MAX_STATS_HISTORY_SEASONS) {
                    player.statsHistory = player.statsHistory.slice(-MAX_STATS_HISTORY_SEASONS);
                }
            });
        });
    }

    console.log('[MEMORY] Active memory pruned for season transition');
}

// Expose archive loader globally so the UI can load archived history on demand
if (typeof window !== 'undefined') {
    window.loadArchivedHistory = function() {
        const archiveKey = 'nflGM4.archive.' + (window.state?.leagueName || 'default');
        try {
            const data = JSON.parse(window.localStorage.getItem(archiveKey) || '{}');
            return data;
        } catch (e) {
            console.error('Failed to load archive:', e);
            return {};
        }
    };
}

function startNewSeason() {
  try {
    const L = window.state?.league;
    if (!L) return;

    window.state.offseason = false;
    window.state.offseasonYear = null;

    const currentYear = Number.isInteger(L.year) ? L.year : (window.state.year || 2025);
    const nextYear = currentYear + 1;

    window.state.year = nextYear;
    L.year = nextYear;
    L.season = (L.season || 1) + 1;
    
    L.week = 1;
    L.resultsByWeek = [];

    if (window.state.ownerMode && window.state.ownerMode.revenue) {
        window.state.ownerMode.revenue.playoffs = 0;
    }

    L.teams.forEach(team => {
      if (team.rivalries) {
        Object.keys(team.rivalries).forEach(oppId => {
          const riv = team.rivalries[oppId];
          riv.score = Math.floor((riv.score || 0) * 0.75);

          if (riv.events && riv.events.length > 0) {
              if (riv.score < 10) riv.events = [];
          }

          if (riv.score < 5 && (!riv.events || riv.events.length === 0)) {
            delete team.rivalries[oppId];
          }
        });
      }
    });

    L.teams.forEach(team => {
      team.record = { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
      team.wins = 0;
      team.losses = 0;
      team.ties = 0;
      team.draws = 0;
      team.ptsFor = 0;
      team.ptsAgainst = 0;
      team.pointsFor = 0;
      team.pointsAgainst = 0;

      if (team.stats) team.stats.season = {};
      if (team.roster) {
        team.roster.forEach(p => {
          if (p && p.stats) {
            delete p.stats.game;
            p.stats.season = {};
          }
          if (p && p.ovr !== undefined) p.seasonOVRStart = p.ovr;
          p.seasonNews = [];
        });
      }
    });

    if (window.generateOwnerGoals && window.state.userTeamId !== undefined) {
        window.generateOwnerGoals(L.teams[window.state.userTeamId]);
    }

    if (typeof window.makeSchedule === 'function') L.schedule = window.makeSchedule(L.teams);

    // Fix Empty Array Bug: Ensure draft class exists
    if (!window.state.draftClass || window.state.draftClass.length === 0) {
        if (typeof window.generateDraftClass === 'function') window.generateDraftClass(nextYear + 1);
    }

    // CPU Free Agency - simulate other teams signing free agents
    try {
        if (typeof window.simulateCpuFreeAgencyRound === 'function') {
            // Run 3 rounds of CPU FA to simulate offseason activity
            for (let round = 0; round < 3; round++) {
                window.simulateCpuFreeAgencyRound(L);
            }
            console.log(`[OFFSEASON] CPU free agency complete. ${window.state?.freeAgents?.length || 0} free agents remaining.`);
        }
    } catch (e) {
        console.error('Error in CPU free agency:', e);
    }

    // MEMORY MANAGEMENT - Archive old season data to prevent memory bloat
    // Only keep current + last season results in active memory.
    // Full history is archived to a separate localStorage key on demand.
    try {
        pruneActiveMemory(L);
    } catch (e) {
        console.error('Error pruning active memory:', e);
    }

    // COMPETITIVE BALANCE - regression to mean
    // Top teams lose some edge, bottom teams get a boost
    // This prevents super-dynasties and keeps the game fresh
    try {
        applyCompetitiveBalance(L);
    } catch (e) {
        console.error('Error applying competitive balance:', e);
    }

    if (typeof window.updateLeaguePlayers === 'function') {
        window.updateLeaguePlayers(L);
    }
    if (typeof window.updateAllTeamRatings === 'function') {
        window.updateAllTeamRatings(L);
    }

    // Auto-save on phase change
    if (window.saveGameState) {
        window.saveGameState().catch(e => console.error("Auto-save failed:", e));
    } else if (typeof window.saveState === 'function') {
        window.saveState();
    }

    if (typeof window.renderHub === 'function') window.renderHub();

  } catch (err) {
    console.error('Error starting new season:', err);
  }
}

/**
 * Enforces roster minimums for AI teams before simulation
 * @param {Object} league - League object
 */
function enforceAIRosterMinimums(league) {
    if (!league || !league.teams) return;
    const U = window.Utils;
    const freeAgents = window.state.freeAgents;
    if (!freeAgents) return;

    // Minimums: QB >= 2, OL >= 4, DL >= 3
    const MINS = { 'QB': 2, 'OL': 4, 'DL': 3 };

    league.teams.forEach(team => {
        // Skip user team (handled by blockers)
        if (team.id === window.state.userTeamId) return;

        // Check each required position
        Object.keys(MINS).forEach(pos => {
            // Count players at this position
            // Handle position grouping (OL = OT, G, C; DL = DE, DT) if needed
            // Assuming simple POS strings for now as per codebase convention
            // If the game uses specific pos like 'LT', 'LG', we need a helper.
            // Based on 'teams.js', positions seem standard.
            // However, 'OL' usually maps to OT, OG, C. 'DL' to DE, DT.
            // Let's assume strict checking or group checking.
            // The prompt asks specifically for "QB, OL, DL".
            // If the game uses OT/OG/C, we need to map.

            const count = team.roster.filter(p => {
                if (pos === 'OL') return ['OL', 'OT', 'OG', 'C', 'LT', 'RT', 'LG', 'RG'].includes(p.pos);
                if (pos === 'DL') return ['DL', 'DE', 'DT', 'LE', 'RE', 'NT'].includes(p.pos);
                return p.pos === pos;
            }).length;

            const needed = MINS[pos] - count;

            if (needed > 0) {
                // Find best FAs
                const candidates = freeAgents.filter(p => {
                    if (pos === 'OL') return ['OL', 'OT', 'OG', 'C', 'LT', 'RT', 'LG', 'RG'].includes(p.pos);
                    if (pos === 'DL') return ['DL', 'DE', 'DT', 'LE', 'RE', 'NT'].includes(p.pos);
                    return p.pos === pos;
                }).sort((a, b) => b.ovr - a.ovr);

                // Sign needed amount
                for (let i = 0; i < needed; i++) {
                    if (candidates.length > 0) {
                        const signee = candidates.shift();
                        // Remove from FA
                        const faIndex = freeAgents.indexOf(signee);
                        if (faIndex > -1) freeAgents.splice(faIndex, 1);

                        // Add to Team
                        signee.teamId = team.id;
                        // Give minimum contract
                        signee.baseAnnual = 0.8;
                        signee.years = 1;
                        signee.yearsTotal = 1;
                        signee.signingBonus = 0;

                        team.roster.push(signee);
                        console.log(`[AI-ROSTER] ${team.name} signed ${signee.name} (${signee.pos}) to meet minimums.`);
                    }
                }
            }
        });

        // Ensure not over 53?
        // If over 53, AI should cut lowest rated players not at minimums positions.
        // For now, we focus on minimums as requested.
    });
}

/**
 * Simulates all games for the current week via Web Worker.
 * @returns {Promise} Resolves when simulation completes
 */
function simulateWeek(options = {}) {
  return new Promise((resolve, reject) => {
    // Prevent re-entrancy
    if (isSimulating) {
      console.warn('Simulation already in progress.');
      reject(new Error('Simulation already in progress'));
      return;
    }

    try {
      // Check User Roster Legality (Enforce 53-man limit)
      if (window.state && window.state.userTeamId !== undefined) {
          const userTeam = window.state.league.teams[window.state.userTeamId];
          if (userTeam) {
              const rosterCheck = checkRosterLegality(userTeam);
              if (!rosterCheck.valid) {
                  window.setStatus(`Cannot advance: ${rosterCheck.errors.join(' ')}`, 'error');
                  reject(new Error(rosterCheck.errors[0]));
                  return;
              }
          }
      }

      // Enforce AI Roster Minimums before simulation
      if (window.state && window.state.league) {
          enforceAIRosterMinimums(window.state.league);
      }

      isSimulating = true;
      simResolve = resolve;
      simReject = reject;

      // UI Lock (if applicable)
      if (document.body) document.body.style.cursor = 'wait';

      // Validate dependencies
      if (!validateDependencies()) {
        isSimulating = false;
        simResolve = null;
        simReject = null;
        reject(new Error('Missing dependencies'));
        return;
      }
      
      const L = window.state.league;

      if (!L) {
        console.error('No league available');
        window.setStatus('Error: No league loaded');
        isSimulating = false;
        simResolve = null;
        simReject = null;
        reject(new Error('No league loaded'));
        return;
      }

      if (!L.schedule) {
        console.error('No schedule available');
        window.setStatus('Error: No schedule found');
        isSimulating = false;
        simResolve = null;
        simReject = null;
        reject(new Error('No schedule found'));
        return;
      }

      // Check Season Progression BEFORE calling worker
      const scheduleWeeks = L.schedule.weeks || L.schedule;
      if (window.state && window.state.playoffs && window.state.playoffs.winner && L.week > scheduleWeeks.length) {
        if (window.state.offseason === true) {
          console.log('Already in offseason');
          isSimulating = false;
          simResolve = null;
          simReject = null;
          resolve({ status: 'OFFSEASON_ALREADY' });
          return;
        }

        console.log('Season complete, transitioning to offseason');
        window.setStatus('Season complete! Entering offseason...');

        if (startOffseason) {
          startOffseason();
        } else if (startNewSeason) {
          startNewSeason();
        }

        isSimulating = false;
        simResolve = null;
        simReject = null;
        if (document.body) document.body.style.cursor = 'default';
        resolve({ status: 'SEASON_COMPLETE' });
        return;
      }

      console.log(`[SIM-DEBUG] Requesting Week ${L.week} Simulation from Worker`);

      // Prepare payload
      const payload = {
          league: L, // Structured Clone handles deep copy
          options: {
              ...options,
              ownerMode: window.state.ownerMode // Pass owner mode settings
          }
      };

      // Start watchdog timer before posting to worker
      startSimWatchdog();

      // Post message to worker
      worker.postMessage({ type: 'SIM_WEEK', payload });

    } catch (error) {
      console.error('Error initiating simulation:', error);
      window.setStatus(`Simulation start error: ${error.message}`);
      isSimulating = false;
      simResolve = null;
      simReject = null;
      if (document.body) document.body.style.cursor = 'default';
      reject(error);
    }
  });
}

/**
 * Handles successful simulation response from worker
 */
function handleSimulationComplete(payload) {
    clearSimWatchdog();
    console.log(`[SIM-DEBUG] Worker completed simulation for Week ${payload.week}`);

  try {
    const L = window.state.league;
    const { results, updatedTeams, weeklyGamePlan, strategyHistory, scheduleUpdates } = payload;

    // 1. Merge Updated Teams (Delta)
    if (updatedTeams && updatedTeams.length > 0) {
        updatedTeams.forEach(updatedTeam => {
            const index = L.teams.findIndex(t => t.id === updatedTeam.id);
            if (index !== -1) {
                // Merge properties carefully or replace?
                // Replacing is safer for deeply nested stats that changed
                L.teams[index] = updatedTeam;
            }
        });
    } else if (results && results.length > 0) {
        // Fallback: If no team updates from worker, calculate stats locally (Stats Tracking System)
        // This ensures the Stats Tracking System is utilized even if the worker optimization fails
        const L = window.state.league;
        results.forEach(res => {
            if (res.boxScore) {
                 const homeTeam = L.teams[typeof res.home === 'object' ? res.home.id : res.home];
                 const awayTeam = L.teams[typeof res.away === 'object' ? res.away.id : res.away];

                 if (homeTeam && res.boxScore.home) {
                     Object.entries(res.boxScore.home).forEach(([pid, data]) => {
                         const p = homeTeam.roster.find(pl => pl.id === pid || pl.id === parseInt(pid));
                         if (p && data.stats) updatePlayerStats(p, data.stats);
                     });
                 }
                 if (awayTeam && res.boxScore.away) {
                     Object.entries(res.boxScore.away).forEach(([pid, data]) => {
                         const p = awayTeam.roster.find(pl => pl.id === pid || pl.id === parseInt(pid));
                         if (p && data.stats) updatePlayerStats(p, data.stats);
                     });
                 }
            }
        });
    }

    // 1b. Safety Net: Reconstruct records for any teams the delta missed
    // This protects against bugs (e.g., team ID 0 being falsy-skipped in worker)
    if (results && results.length > 0) {
        const teamsInDelta = new Set(updatedTeams ? updatedTeams.map(t => t.id) : []);
        const teamsInResults = new Set();
        results.forEach(res => {
            if (res.home !== undefined && res.home !== null) teamsInResults.add(res.home);
            if (res.away !== undefined && res.away !== null) teamsInResults.add(res.away);
        });

        teamsInResults.forEach(teamId => {
            if (!teamsInDelta.has(teamId)) {
                console.warn(`[SIM-SAFETY] Team ${teamId} played but was missing from worker delta. Reconstructing record from results.`);
                const team = L.teams.find(t => t.id === teamId);
                if (team) {
                    results.forEach(res => {
                        let isHome = res.home === teamId;
                        let isAway = res.away === teamId;
                        if (!isHome && !isAway) return;

                        const teamScore = isHome ? res.scoreHome : res.scoreAway;
                        const oppScore = isHome ? res.scoreAway : res.scoreHome;

                        if (teamScore > oppScore) {
                            team.wins = (team.wins || 0) + 1;
                            if (team.record) team.record.w = (team.record.w || 0) + 1;
                        } else if (teamScore < oppScore) {
                            team.losses = (team.losses || 0) + 1;
                            if (team.record) team.record.l = (team.record.l || 0) + 1;
                        } else {
                            team.ties = (team.ties || 0) + 1;
                            if (team.record) team.record.t = (team.record.t || 0) + 1;
                        }
                        team.ptsFor = (team.ptsFor || 0) + teamScore;
                        team.ptsAgainst = (team.ptsAgainst || 0) + oppScore;
                        team.pointsFor = (team.pointsFor || 0) + teamScore;
                        team.pointsAgainst = (team.pointsAgainst || 0) + oppScore;
                        if (team.record) {
                            team.record.pf = (team.record.pf || 0) + teamScore;
                            team.record.pa = (team.record.pa || 0) + oppScore;
                        }
                    });
                }
            }
        });
    }

    // 2. Merge Results
    const weekIndex = (L.week || 1) - 1;
    if (!L.resultsByWeek) L.resultsByWeek = {};

    // We can assume the worker returned the full array for this week
    // Or we can merge. If results are partial? Worker returns results for the simulated games.
    // If it's a batch, it returns results.
    if (!L.resultsByWeek[weekIndex]) L.resultsByWeek[weekIndex] = [];

    // Merge new results into existing week results (idempotency check)
    results.forEach(res => {
        const existingIdx = L.resultsByWeek[weekIndex].findIndex(r => r.home === res.home && r.away === res.away);
        if (existingIdx !== -1) {
            L.resultsByWeek[weekIndex][existingIdx] = res;
        } else {
            L.resultsByWeek[weekIndex].push(res);
        }
    });

    // 3. Mark Schedule as Played
    // results array implies these games are done.
    // We can iterate L.schedule to mark them.
    if (L.schedule) {
        const weekSchedule = (L.schedule.weeks || L.schedule)[weekIndex];
        if (weekSchedule && weekSchedule.games) {
            results.forEach(res => {
                const game = weekSchedule.games.find(g =>
                    (g.home === res.home || (typeof g.home === 'object' && g.home.id === res.home)) &&
                    (g.away === res.away || (typeof g.away === 'object' && g.away.id === res.away))
                );
                if (game) {
                    game.played = true;
                    game.homeScore = res.scoreHome;
                    game.awayScore = res.scoreAway;
                }
            });
        }
    }

    // 4. Update Game Plan / Strategy History
    if (weeklyGamePlan) L.weeklyGamePlan = weeklyGamePlan;
    if (strategyHistory) L.strategyHistory = strategyHistory;

    // 5. Run Main Thread Side Effects

    // Update single game records
    if (typeof window.updateSingleGameRecords === 'function') {
        try {
            window.updateSingleGameRecords(L, L.year, L.week);
        } catch (e) {
            console.error('Error updating records:', e);
        }
    }

    // Decrement negotiation lockouts (User Team) - handled in simulateWeek previously, but safe to do here
    const userTeam = L.teams[window.state.userTeamId];
    if (userTeam && userTeam.roster) {
        userTeam.roster.forEach(p => {
            if (p.negotiationStatus === 'LOCKED' && p.lockoutWeeks > 0) {
                p.lockoutWeeks--;
                if (p.lockoutWeeks <= 0) {
                    p.negotiationStatus = 'OPEN';
                    if (window.setStatus) window.setStatus(`Negotiations re-opened with ${p.name}.`, 'info');
                }
            }
        });
    }

    // Increment Week
    const previousWeek = L.week;
    L.week++;

    // Training
    try {
        if (typeof runWeeklyTraining === 'function') {
            runWeeklyTraining(L);
        } else if (typeof window.runWeeklyTraining === 'function') {
            window.runWeeklyTraining(L);
        }
    } catch (e) {
        console.error('Error in weekly training:', e);
    }

    // Depth Chart Updates
    if (typeof window.processWeeklyDepthChartUpdates === 'function') {
        try {
            L.teams.forEach(team => {
                if (team && team.roster) window.processWeeklyDepthChartUpdates(team);
            });
        } catch (e) {
            console.error('Error in depth chart updates:', e);
        }
    }

    // Owner Mode
    if (window.state?.ownerMode?.enabled && typeof window.calculateRevenue === 'function') {
        try {
            window.updateFanSatisfaction();
            window.calculateRevenue();
        } catch (e) {
            console.error('Error updating owner mode:', e);
        }
    }

    // News
    try {
        if (newsEngine && newsEngine.generateWeeklyNews) {
            newsEngine.generateWeeklyNews(L);
        }
        if (newsEngine && newsEngine.generateInteractiveEvent) {
            const event = newsEngine.generateInteractiveEvent(L);
            if (event) window.state.pendingEvent = event;
        }
    } catch (e) {
        console.error('Error generating news:', e);
    }

    // CPU Trade Activity (league feels alive)
    try {
        if (typeof window.simulateCpuTrades === 'function' && L.week >= 4 && L.week <= 12) {
            // Trade deadline window: weeks 4-12
            const cpuTrades = window.simulateCpuTrades(1);
            if (cpuTrades && cpuTrades.length > 0) {
                console.log(`[SIM] ${cpuTrades.length} CPU-to-CPU trades completed`);
            }
        }
    } catch (e) {
        console.error('Error in CPU trade simulation:', e);
    }

    // Achievements
    if (checkAchievements) {
        checkAchievements(window.state);
    }

    // Recap
    // options from payload? We don't get options back. Assume render=true unless we store pending options.
    // Since simulateWeek is void, we can assume default options or use a pending var.
    // For simplicity, always show recap if not disabled globally.
    if (showWeeklyRecap) {
        showWeeklyRecap(previousWeek, results, L.news);
    }

    // Save State
    if (saveState) saveState();
    else if (window.saveState) window.saveState();

    // Update UI
    try {
        if (typeof window.renderStandings === 'function') window.renderStandings();
        if (typeof window.renderHub === 'function') window.renderHub();
        if (typeof window.updateCapSidebar === 'function') window.updateCapSidebar();

        window.setStatus(`Week ${previousWeek} simulated - ${payload.gamesSimulated} games completed`);
    } catch (uiError) {
        console.error('Error updating UI after simulation:', uiError);
    }

    // Cleanup
    isSimulating = false;
    if (document.body) document.body.style.cursor = 'default';

    // Resolve Promise
    if (simResolve) {
        simResolve(payload);
        simResolve = null;
        simReject = null;
    }

  } catch (stateUpdateError) {
    // Save debug snapshot with seed so this crash can be reproduced
    console.error('[SIM] State update crashed:', stateUpdateError);
    saveDebugSnapshot('STATE_UPDATE_CRASH: ' + stateUpdateError.message);

    isSimulating = false;
    if (document.body) document.body.style.cursor = 'default';

    if (window.setStatus) {
      window.setStatus(
        'Simulation completed but failed to update state. Debug snapshot saved. Try reloading.',
        'error',
        10000
      );
    }

    if (simReject) {
      simReject(stateUpdateError);
      simResolve = null;
      simReject = null;
    }
  }
}

function handleSimulationError(payload) {
    clearSimWatchdog();
    console.error('[Worker] Simulation Error:', payload);
    saveDebugSnapshot('WORKER_ERROR: ' + payload.message);
    window.setStatus(`Simulation failed: ${payload.message}`, 'error');
    isSimulating = false;
    if (document.body) document.body.style.cursor = 'default';

    // Reject Promise
    if (simReject) {
        simReject(new Error(payload.message));
        simResolve = null;
        simReject = null;
    }
}

// ============================================================================
// ES MODULE EXPORTS
// ============================================================================

export {
  simulateWeek,
  startOffseason,
  startNewSeason
};
