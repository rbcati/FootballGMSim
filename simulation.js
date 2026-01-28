/*
 * Updated Simulation Module with Season Progression Fix and optimizations
 *
 * ES Module version - migrated from global exports
 */

// Import dependencies
import { Utils } from './utils.js';
import { Constants } from './constants.js';
import { saveState } from './state.js';
import { calculateWAR, calculateQBRating, calculatePasserRatingWhenTargeted, updateAdvancedStats, getZeroStats } from './player.js';
import { processStaffXp } from './coach-system.js';
import { runWeeklyTraining } from './training.js';
import newsEngine from './news-engine.js';
import { showWeeklyRecap } from './weekly-recap.js';
import { checkAchievements } from './achievements.js';

// Import GameSimulator
import GameSimulator from './game-simulator.js';
const {
  simGameStats,
  applyResult,
  initializePlayerStats,
  accumulateStats,
  simulateBatch
} = GameSimulator;

// Import Coaching System
import { processStaffPoaching } from './coach-system.js';

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
    if (typeof window.saveState === 'function') window.saveState();
    if (typeof window.renderHub === 'function') window.renderHub();

  } catch (err) {
    console.error('Error starting new season:', err);
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

    console.log(`[SIM-DEBUG] Simulating week ${L.week}...`);
    console.log(`[QA-AUDIT] simulateWeek: Week ${L.week}, Schedule Length: ${scheduleWeeks.length}`);
    window.setStatus(`Simulating week ${L.week}...`);

    // NEW SEASON PROGRESSION CHECK
    if (window.state && window.state.playoffs && window.state.playoffs.winner && L.week > scheduleWeeks.length) {
      // Check if already in offseason
      if (window.state.offseason === true) {
        console.log('Already in offseason, skipping transition');
        return;
      }
      
      console.log('Season complete, transitioning to offseason');
      window.setStatus('Season complete! Entering offseason...');
      
      // DO NOT set window.state.offseason = true here.
      // startOffseason() checks this flag to prevent double-execution.
      
      if (typeof window.startOffseason === 'function') {
        window.startOffseason();
      } else if (typeof window.startNewSeason === 'function') {
        window.startNewSeason();
      }
      return;
    }

    // Check if season is over
    if (L.week > scheduleWeeks.length) {
      console.log('Regular season complete, checking playoffs...');

      // FIXED: If playoffs are already active, don't restart them
      if (window.state.playoffs && !window.state.playoffs.winner) {
          console.log('Playoffs active, navigating to bracket');
          if (window.location && window.location.hash !== '#/playoffs') {
              window.location.hash = '#/playoffs';
          }
          if (typeof window.renderPlayoffs === 'function') {
              window.renderPlayoffs();
          }
          return;
      }

      console.log('Starting playoffs');
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
    console.log(`[SIM-DEBUG] Found ${pairings.length} games for week ${L.week}`);
    console.log(`[QA-AUDIT] simulateWeek: Pairings found: ${pairings.length}`);

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

    // Prepare games for batch simulation
    const gamesToSim = pairings.map(pair => {
        // Handle bye weeks - pass through
        if (pair.bye !== undefined) {
            return { bye: pair.bye };
        }

        const home = L.teams[pair.home];
        const away = L.teams[pair.away];

        if (!home || !away) {
             console.warn('Invalid team IDs in pairing:', pair);
             return null;
        }

        return {
            home: home,
            away: away,
            week: L.week,
            year: L.year
        };
    }).filter(g => g !== null);

    // Run Batch Simulation
    const results = simulateBatch(gamesToSim, options);
    console.log(`[QA-AUDIT] simulateBatch returned ${results.length} results.`);
    const gamesSimulated = results.filter(r => !r.bye).length;

    // Store results for the week
    if (!L.resultsByWeek) L.resultsByWeek = {};
    L.resultsByWeek[L.week - 1] = results;
    console.log(`[QA-AUDIT] Stored results for week ${L.week - 1}. Keys in resultsByWeek: ${Object.keys(L.resultsByWeek).join(',')}`);

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

    // Run weekly training
    if (typeof runWeeklyTraining === 'function') {
      try {
        runWeeklyTraining(L);
      } catch (trainingError) {
        console.error('Error in weekly training:', trainingError);
        // Don't stop simulation for training errors
      }
    } else if (typeof window.runWeeklyTraining === 'function') {
      try {
        window.runWeeklyTraining(L);
      } catch (trainingError) {
        console.error('Error in weekly training (window):', trainingError);
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

    console.log(`[SIM-DEBUG] Week ${previousWeek} simulation complete - ${gamesSimulated} games simulated`);

    // Update owner mode revenue and fan satisfaction after games
    if (window.state?.ownerMode?.enabled && typeof window.calculateRevenue === 'function' && typeof window.updateFanSatisfaction === 'function') {
      try {
        window.updateFanSatisfaction();
        window.calculateRevenue();
      } catch (ownerError) {
        console.error('Error updating owner mode:', ownerError);
      }
    }

    // Generate Weekly News
    try {
        if (newsEngine && newsEngine.generateWeeklyNews) {
            newsEngine.generateWeeklyNews(L);
        }
    } catch (newsError) {
        console.error('Error generating news:', newsError);
    }

    // Check for Interactive Events (The Newsroom)
    try {
        if (newsEngine && newsEngine.generateInteractiveEvent) {
             const event = newsEngine.generateInteractiveEvent(L);
             if (event) {
                 console.log("Interactive event triggered:", event.title);
                 window.state.pendingEvent = event;
             }
        }
    } catch (eventError) {
        console.error('Error generating interactive event:', eventError);
    }

    // Check Achievements (New Feature)
    if (checkAchievements) {
        checkAchievements(window.state);
    }

    // Update UI to show results (if render option is true, default to true)
    try {
      if (options.render !== false) {
        // DB COMMIT: Save state immediately to persist W/L updates
        // This satisfies the requirement to commit changes after results are written.
        if (saveState) saveState();
        else if (window.saveState) window.saveState();

        // UI REFRESH: Force re-fetch of table data (equivalent to useEffect)
        if (typeof window.renderStandings === 'function') window.renderStandings();

        if (typeof window.renderHub === 'function') {
          window.renderHub();
        }
        if (typeof window.updateCapSidebar === 'function') {
          window.updateCapSidebar();
        }

        // Show Weekly Recap (New Feature)
        if (showWeeklyRecap) {
            showWeeklyRecap(previousWeek, results, L.news);
        }

        // Reset Strategy for Next Week (Task 5)
        if (L.weeklyGamePlan) {
             L.weeklyGamePlan = { offPlanId: 'BALANCED', defPlanId: 'BALANCED', riskId: 'BALANCED' };
        }

        // Show success message
        window.setStatus(`Week ${previousWeek} simulated - ${gamesSimulated} games completed`);

        // Auto-show results on hub
        if (window.location && window.location.hash !== '#/hub') {
          window.location.hash = '#/hub';
        }
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
