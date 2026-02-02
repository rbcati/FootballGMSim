/*
 * Updated Simulation Module with Season Progression Fix and optimizations
 *
 * ES Module version - migrated from global exports
 * HYBRID ARCHITECTURE: Now uses Web Worker for simulation logic
 */

// Import dependencies
import { Utils } from './utils.js';
import { Constants } from './constants.js';
import { saveState } from './state.js';
import { calculateWAR, calculateQBRating, calculatePasserRatingWhenTargeted, updateAdvancedStats, getZeroStats, updatePlayerSeasonLegacy, checkHallOfFameEligibility } from './player.js';
import { processStaffXp } from './coach-system.js';
import { runWeeklyTraining } from './training.js';
import newsEngine from './news-engine.js';
import { showWeeklyRecap } from './weekly-recap.js';
import { checkAchievements } from './achievements.js';
// Import GameSimulator for Main Thread helpers (applyResult, etc)
import GameSimulator from './game-simulator.js';
const {
  simGameStats,
  applyResult,
  initializePlayerStats,
  accumulateStats,
  simulateBatch,
  validateLeagueState,
  commitGameResult
} = GameSimulator;

// Import GameRunner
import GameRunner from './game-runner.js';

// Import Coaching System
import { processStaffPoaching } from './coach-system.js';

// Simulation Lock
let isSimulating = false;

// Worker Instance
let simWorker = null;

// Initialize Worker
function initWorker() {
    if (!simWorker) {
        try {
            simWorker = new Worker(new URL('./simulation.worker.js', import.meta.url), { type: 'module' });
            console.log('[Simulation] Worker initialized');

            simWorker.onmessage = handleWorkerMessage;
            simWorker.onerror = (e) => {
                console.error('[Simulation] Worker Error:', e);
                window.setStatus('Simulation Worker Error: ' + e.message, 'error');
                isSimulating = false;
            };
        } catch (e) {
            console.error('[Simulation] Failed to initialize worker:', e);
        }
    }
    return simWorker;
}

// Global resolve/reject for the current simulation promise
let currentSimResolve = null;
let currentSimReject = null;
let currentSimOptions = {};

// Handle Worker Messages
function handleWorkerMessage(e) {
    const { type, payload } = e.data;

    if (type === 'SIM_COMPLETE') {
        processWorkerResult(payload);
    } else if (type === 'SIM_ERROR') {
        console.error('[Simulation] Worker reported error:', payload);
        if (window.setStatus) window.setStatus(`Simulation failed: ${payload.message}`, 'error');
        isSimulating = false;
        if (currentSimReject) currentSimReject(new Error(payload.message));
        cleanupSimPromise();
    }
}

function cleanupSimPromise() {
    currentSimResolve = null;
    currentSimReject = null;
    currentSimOptions = {};
}

// Process results from worker (Main Thread Merge)
function processWorkerResult(data) {
    try {
        console.log('[Simulation] Worker completed. Merging Delta...');
        const L = window.state.league;
        const { week, results, updatedTeams, scheduleUpdates, news, pendingEvent } = data;

        // 1. Update League Globals
        L.week = week; // Should be incremented

        // 2. Merge Results
        if (!L.resultsByWeek) L.resultsByWeek = {};
        // Find correct index (week - 2 because week was incremented?)
        // GameRunner increments week AFTER sim. So if we sent week 1, it comes back as week 2.
        // The results correspond to week 1.
        // GameRunner logic: results stored in `weekNum - 1`. Then `league.week++`.
        // So results are for `week - 2` (if 1-based and incremented).
        // Let's rely on GameRunner behavior inside worker.
        // Worker returns `results` which is the array of game results.
        // We can place it at `week - 2`.
        // Better: results contains `week` property in each game result? Yes usually.
        // But let's use the same logic as GameRunner main thread: `league.resultsByWeek[previousWeek - 1] = results`
        // `previousWeek` is `week - 1`. So index is `week - 2`.
        const previousWeek = week - 1;
        L.resultsByWeek[previousWeek - 1] = results;

        // 3. Merge Team Updates (Delta)
        // We use Object.assign to update the existing objects in memory, preventing reference breaks
        if (updatedTeams) {
            updatedTeams.forEach(workerTeam => {
                const localTeam = L.teams.find(t => t.id === workerTeam.id);
                if (localTeam) {
                    // Update simple properties
                    localTeam.wins = workerTeam.wins;
                    localTeam.losses = workerTeam.losses;
                    localTeam.ties = workerTeam.ties;
                    localTeam.ptsFor = workerTeam.ptsFor;
                    localTeam.ptsAgainst = workerTeam.ptsAgainst;
                    localTeam.record = workerTeam.record;
                    localTeam.rivalries = workerTeam.rivalries;

                    // Update Roster (Deep Merge or Replacement?)
                    // Worker sent back the whole roster with updated stats/attributes.
                    // We can replace the roster array, but we should be careful if UI holds refs to players.
                    // However, standard React/Frameworks usually handle array replacement fine.
                    // Vanilla JS UI usually re-renders from state.
                    localTeam.roster = workerTeam.roster;

                    // Update History/Stats
                    if (workerTeam.stats) localTeam.stats = workerTeam.stats;
                }
            });
        }

        // 4. Merge Schedule Updates
        if (scheduleUpdates && L.schedule) {
            // Mark games as played
            const updateGame = (game) => {
                if (game && scheduleUpdates.includes(game.id)) {
                    game.played = true;
                    // Find result to update score?
                    const res = results.find(r => r.id === game.id);
                    if (res) {
                        game.homeScore = res.scoreHome;
                        game.awayScore = res.scoreAway;
                    }
                }
            };

            // Iterate schedule (support nested weeks or flat)
            const weeks = L.schedule.weeks || L.schedule;
            if (Array.isArray(weeks)) {
                weeks.forEach(w => {
                    if (w.games) w.games.forEach(updateGame);
                    else updateGame(w); // Flat schedule
                });
            }
        }

        // 5. Merge News
        if (news) {
            L.news = news;
        }

        // 6. Pending Event
        if (pendingEvent && window.state) {
            window.state.pendingEvent = pendingEvent;
        }

        // --- MAIN THREAD POST-SIM HOOKS ---

        // Depth Chart Updates (if window function exists)
        if (typeof window.processWeeklyDepthChartUpdates === 'function') {
            L.teams.forEach(team => {
                if (team && team.roster) window.processWeeklyDepthChartUpdates(team);
            });
        }

        // Owner Mode
        if (window.state?.ownerMode?.enabled) {
            if (typeof window.updateFanSatisfaction === 'function') window.updateFanSatisfaction();
            if (typeof window.calculateRevenue === 'function') window.calculateRevenue();
        }

        // Achievements
        if (checkAchievements) {
            checkAchievements(window.state);
        }

        // Show Weekly Recap (UI)
        if (currentSimOptions.render !== false && showWeeklyRecap) {
             showWeeklyRecap(previousWeek, results, L.news);
        }

        // Save State
        if (saveState) saveState();

        // Update UI
        if (currentSimOptions.render !== false) {
            if (typeof window.renderStandings === 'function') window.renderStandings();
            if (typeof window.renderHub === 'function') window.renderHub();
            if (typeof window.updateCapSidebar === 'function') window.updateCapSidebar();

            if (window.setStatus) window.setStatus(`Week ${previousWeek} simulated - ${results.length} games completed`);
        }

        // Check for Season Over logic (from original GameRunner return)
        // GameRunner in worker doesn't return `seasonOver` explicitly in our skeleton?
        // Wait, GameRunner.simulateRegularSeasonWeek returns { seasonOver: ... }
        // We didn't pass it back in worker payload explicitly!
        // CHECK worker code: `const simResult = ...` then `const response = { ... }`.
        // We missed `seasonOver` in worker response!
        // FIX: We can deduce it. If `week > schedule.length`.
        // OR rely on `simulateWeek` checks.

        const scheduleWeeks = L.schedule.weeks || L.schedule;
        if (L.week > scheduleWeeks.length) {
            console.log('Season complete, checking playoffs...');
             if (window.state.playoffs && !window.state.playoffs.winner) {
                  if (typeof window.renderPlayoffs === 'function') window.renderPlayoffs();
             } else {
                  if (typeof window.startPlayoffs === 'function') window.startPlayoffs();
                  else if (window.location) window.location.hash = '#/standings';
             }
        }

        if (currentSimResolve) currentSimResolve();

    } catch (e) {
        console.error('[Simulation] Error processing worker result:', e);
        if (window.setStatus) window.setStatus('Error merging simulation results', 'error');
        if (currentSimReject) currentSimReject(e);
    } finally {
        isSimulating = false;
        cleanupSimPromise();
    }
}

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
  if (!league || !league.teams) return;

  const year = league.year || new Date().getFullYear();
  
  league.teams.forEach(team => {
    if (!team.roster || !Array.isArray(team.roster)) return;
    
    team.roster.forEach(player => {
      // 1. Snapshot Season Stats
      if (!player.stats || !player.stats.season) return;
      
      // Calculate advanced stats explicitly before snapshot
      if (typeof calculateWAR === 'function') {
          player.stats.season.war = calculateWAR(player, player.stats.season);
      }

      // Create a deep copy of season stats to preserve data before reset
      const seasonSnapshot = { ...player.stats.season };

      // Add to history
      if (Object.keys(seasonSnapshot).length > 0) {
          if (!player.statsHistory) player.statsHistory = [];
          player.statsHistory.push({
              season: year,
              team: team.abbr || team.name,
              ...seasonSnapshot
          });
      }

      // 2. Reset Season Stats (Now safe to do)
      initializePlayerStats(player);
      
      const career = player.stats.career;

      // 3. Accumulate Counting Stats ONLY
      // List of fields that are averages/ratings and should NOT be summed
      const derivedFields = [
          'completionPct', 'yardsPerCarry', 'yardsPerReception',
          'avgPuntYards', 'successPct', 'passerRating', 'ratingWhenTargeted'
      ];

      Object.keys(seasonSnapshot).forEach(key => {
        const value = seasonSnapshot[key];
        if (typeof value === 'number') {
            // Skip derived fields and ratings during summation
            if (derivedFields.includes(key) || key.includes('Rating') || key.includes('Grade')) {
                return;
            }
            career[key] = (career[key] || 0) + value;
        }
      });

      // 4. Update Longest Records
      const longestFields = ['longestPass', 'longestRun', 'longestCatch', 'longestFG', 'longestPunt'];
      longestFields.forEach(field => {
        if (typeof seasonSnapshot[field] === 'number' && seasonSnapshot[field] > (career[field] || 0)) {
          career[field] = seasonSnapshot[field];
        }
      });

      // 5. Recalculate Career Derived Stats from new Totals
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
    
    // LEGACY: Update season legacy before wiping season stats
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

    // Accumulate season stats into career stats for all players
    accumulateCareerStats(L);

    // --- OWNER'S GAMBLE RESOLUTION ---
    if (L.ownerChallenge && L.ownerChallenge.status === 'PENDING') {
        const challenge = L.ownerChallenge;
        const userTeam = L.teams[window.state.userTeamId];
        let success = false;

        // Evaluate Challenge
        if (challenge.target === 'WINS_6') {
            const wins = userTeam.wins || userTeam.record.w || 0;
            success = wins >= 6;
        } else if (challenge.target === 'PLAYOFFS') {
            // Check if made playoffs
            success = window.state.playoffs && window.state.playoffs.teams.some(t => t.id === userTeam.id);
        } else if (challenge.target === 'CONF_CHAMP') {
            // Check if won conference (made it to Super Bowl)
            // Simplified: Check if in Super Bowl game
            const sb = window.state.playoffs?.results?.find(r => r.name === 'Super Bowl')?.games?.[0];
            if (sb) {
                const inSB = (sb.home.id === userTeam.id || sb.away.id === userTeam.id);
                // "Win Conference Championship" usually means winning the CCG, so making the SB is enough.
                // If it meant winning the SB, it would be "Win Super Bowl".
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
    
    // Process salary cap rollover for each team (Enhanced with Gamble Logic)
    L.teams.forEach(team => {
        try {
            // 1. Standard Rollover Calculation
            if (typeof window.processCapRollover === 'function') {
                window.processCapRollover(L, team);
            } else if (window.calculateRollover) {
                // Fallback: Use calculated rollover
                team.capRollover = window.calculateRollover(team, L);
            }

            // 2. Apply Owner's Gamble Adjustment (if any)
            if (team.pendingCapAdjustment) {
                console.log(`[CAP] Applying Owner's Gamble Adjustment for ${team.name}: ${team.pendingCapAdjustment}M`);
                team.capRollover = (team.capRollover || 0) + team.pendingCapAdjustment;
                delete team.pendingCapAdjustment; // Clear after applying
            }
        } catch (error) {
            console.error('Error processing cap rollover for team', team?.abbr || team?.name, error);
        }
    });
    
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
    
    // Update Team Legacy (Phase 6)
    try {
        const playoffs = window.state.playoffs;
        const playoffTeamIds = new Set();
        if (playoffs && playoffs.teams) {
             playoffs.teams.forEach(t => playoffTeamIds.add(t.id));
        } else if (playoffs && playoffs.results) {
             // Fallback: extract from results
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

            // Update Playoff Streak
            if (playoffTeamIds.has(team.id)) {
                 team.legacy.playoffStreak++;
            } else {
                 team.legacy.playoffStreak = 0;
            }

            // Track Best Season (Wins + Point Diff)
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
                // News for user team
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
    let newlyRetired = [];
    if (typeof window.processRetirements === 'function') {
      try {
        const retirementResults = window.processRetirements(L, L.year);
        if (retirementResults && retirementResults.retired) {
            // retirementResults.retired is array of { player, team, year }
            newlyRetired = retirementResults.retired.map(item => item.player);
            console.log(`Processed ${newlyRetired.length} retirements`);

            // Persist noteworthy retired players for future HOF voting
            if (!L.retiredPlayers) L.retiredPlayers = [];

            // Only keep players who might make HOF (Legacy Score > 40 or OVR > 80) to save space
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

    // Hall of Fame Induction (Check ALL eligible retired players)
    if (checkHallOfFameEligibility && L.retiredPlayers) {
        const inducted = [];

        // Scan all retired players
        L.retiredPlayers.forEach(p => {
            // checkHallOfFameEligibility handles the "5 years wait" internally if we pass currentYear
            // It also checks if already inducted.
            if (checkHallOfFameEligibility(p, L.year)) {
                 inducted.push(p);

                 // Add news
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

    // Run any offseason processing hooks (e.g., coaching stats)
    if (typeof window.runOffseason === 'function') {
      try {
        window.runOffseason();
      } catch (error) {
        console.error('Error in runOffseason:', error);
      }
    }

    // Process Staff Progression (RPG System)
    // Use window.state.league just to be safe about variable scope, though L should be available
    const leagueRef = window.state?.league || L;

    if (processStaffXp && leagueRef && leagueRef.teams) {
        console.log('Processing staff XP progression...');
        const playoffs = window.state.playoffs;
        const championId = playoffs && playoffs.winner ? playoffs.winner.id : -1;

        leagueRef.teams.forEach(team => {
            if (!team.staff) return;

            const isChampion = team.id === championId;
            const wins = team.wins || (team.record ? team.record.w : 0);

            // Calculate playoff wins
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

        // Run the Coaching Carousel (Poaching)
        if (processStaffPoaching) {
            processStaffPoaching(leagueRef);
        }
    }
    
    // Update owner mode at season end
    if (window.state?.ownerMode?.enabled && typeof window.calculateRevenue === 'function' && typeof window.updateFanSatisfaction === 'function') {
      try {
        window.updateFanSatisfaction();
        window.calculateRevenue();

        // Check Job Security (New Feature)
        if (typeof window.checkJobSecurity === 'function') {
            const firingResult = window.checkJobSecurity(window.state.league.teams[window.state.userTeamId]);
            if (firingResult.fired) {
                // Show modal and reset
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
                    return; // Stop processing
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
    if (!L) return;

    // Clear offseason flag
    window.state.offseason = false;
    window.state.offseasonYear = null;

    // Update Year - Derive from League Year to prevent desync
    const currentYear = Number.isInteger(L.year) ? L.year : (window.state.year || 2025);
    const nextYear = currentYear + 1;

    window.state.year = nextYear;
    L.year = nextYear;
    L.season = (L.season || 1) + 1;
    
    L.week = 1;
    L.resultsByWeek = [];

    // Reset Owner Mode Seasonal Data
    if (window.state.ownerMode && window.state.ownerMode.revenue) {
        window.state.ownerMode.revenue.playoffs = 0;
    }

    // Decay Rivalries (Persistence Layer)
    L.teams.forEach(team => {
      if (team.rivalries) {
        Object.keys(team.rivalries).forEach(oppId => {
          const riv = team.rivalries[oppId];
          // Decay score
          riv.score = Math.floor((riv.score || 0) * 0.75);

          // Clear old events
          if (riv.events && riv.events.length > 0) {
              // Maybe keep only the most recent one? Or just let them fade naturally.
              // Logic: Only keep events if score is high enough to matter
              if (riv.score < 10) riv.events = [];
          }

          // Cleanup weak rivalries
          if (riv.score < 5 && (!riv.events || riv.events.length === 0)) {
            delete team.rivalries[oppId];
          }
        });
      }
    });

    // Reset team records completely
    L.teams.forEach(team => {
      // 1. Reset UI Record Object
      team.record = { w: 0, l: 0, t: 0, pf: 0, pa: 0 };

      // 2. Reset Flat Stats (The source of truth conflicts)
      team.wins = 0;
      team.losses = 0;
      team.ties = 0;
      team.draws = 0;
      team.ptsFor = 0;
      team.ptsAgainst = 0;
      team.pointsFor = 0;
      team.pointsAgainst = 0;

      // 3. Reset Player Stats
      if (team.stats) team.stats.season = {};
      if (team.roster) {
        team.roster.forEach(p => {
          if (p && p.stats) {
            delete p.stats.game;
            p.stats.season = {};
          }
          if (p && p.ovr !== undefined) p.seasonOVRStart = p.ovr;

          // Reset Season News
          p.seasonNews = [];
        });
      }
    });

    // Generate Owner Goals
    if (window.generateOwnerGoals && window.state.userTeamId !== undefined) {
        window.generateOwnerGoals(L.teams[window.state.userTeamId]);
    }

    if (typeof window.makeSchedule === 'function') L.schedule = window.makeSchedule(L.teams);
    if (typeof window.generateDraftClass === 'function') window.generateDraftClass(nextYear + 1);

    // Recalibrate player ratings for the new season
    if (typeof window.updateLeaguePlayers === 'function') {
        window.updateLeaguePlayers(L);
    }
    // Update team ratings
    if (typeof window.updateAllTeamRatings === 'function') {
        window.updateAllTeamRatings(L);
    }

    if (typeof window.saveState === 'function') window.saveState();
    if (typeof window.renderHub === 'function') window.renderHub();

  } catch (err) {
    console.error('Error starting new season:', err);
  }
}

/**
 * Simulates all games for the current week in the league.
 * HYBRID: Uses Web Worker for processing
 * @returns {Promise} Resolves when simulation completes
 */
async function simulateWeek(options = {}) {
  // Prevent re-entrancy
  if (isSimulating) {
    console.warn('Simulation already in progress.');
    return;
  }

  return new Promise((resolve, reject) => {
      currentSimResolve = resolve;
      currentSimReject = reject;
      currentSimOptions = options;

      try {
        isSimulating = true;
        if (window.setStatus) window.setStatus('Simulating week...', 'loading');

        // Validate all dependencies first
        if (!validateDependencies()) {
          throw new Error("Missing dependencies");
        }

        const L = window.state.league;

        // Enhanced validation
        if (!L) {
          throw new Error('No league available for simulation');
        }

        if (!L.schedule) {
          throw new Error('No schedule available for simulation');
        }

        // NEW SEASON PROGRESSION CHECK (Pre-Simulation)
        const scheduleWeeks = L.schedule.weeks || L.schedule;
        if (window.state && window.state.playoffs && window.state.playoffs.winner && L.week > scheduleWeeks.length) {
          // Check if already in offseason
          if (window.state.offseason === true) {
            console.log('Already in offseason, skipping transition');
            isSimulating = false;
            resolve();
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
          resolve();
          return;
        }

        console.log(`[SIM-DEBUG] Advance Week: Season ${L.year}, Week ${L.week} - Starting Simulation (Worker)`);

        // Decrement Negotiation Lockouts (User Team) - Run on Main Thread for safety
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

        // Initialize Worker
        const worker = initWorker();
        if (!worker) {
            throw new Error("Worker initialization failed");
        }

        // Post Message
        // Inject global context required by GameRunner
        if (L.userTeamId === undefined) L.userTeamId = window.state.userTeamId;

        worker.postMessage({
            type: 'SIM_WEEK',
            payload: {
                league: L, // Structured Clone handles deep copy
                options: options
            }
        });

      } catch (error) {
        console.error('Error in simulateWeek:', error);
        if (window.setStatus) window.setStatus(`Simulation error: ${error.message}`);
        isSimulating = false;
        reject(error);
      }
  });
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
  accumulateCareerStats,
  commitGameResult
};
