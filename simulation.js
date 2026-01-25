/*
 * Updated Simulation Module with Season Progression Fix and optimizations
 *
 * ES Module version - migrated from global exports
 */

// Import dependencies
import { Utils } from './utils.js';
import { Constants } from './constants.js';
import { saveState } from './state.js';
import { calculateWAR, calculateQBRating, calculatePasserRatingWhenTargeted, updateAdvancedStats } from './player.js';

// Import GameSimulator
import GameSimulator from './game-simulator.js';
const {
  simGameStats,
  applyResult,
  initializePlayerStats
} = GameSimulator;

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
      // Record season OVR change
      if (window.recordSeasonOVR) {
        const ovrStart = player.seasonOVRStart || player.ovr || 0;
        const ovrEnd = player.ovr || 0;
        window.recordSeasonOVR(player, year, ovrStart, ovrEnd);
      }
      if (!player.stats || !player.stats.season) return;
      
      // Calculate advanced stats (WAR, Ratings, etc.) BEFORE snapshotting
      // This ensures they are saved in history and available for awards
      if (calculateWAR) {
          player.stats.season.war = calculateWAR(player, player.stats.season);
      }
      if (calculateQBRating && player.pos === 'QB') {
          player.stats.season.passerRating = calculateQBRating(player.stats.season);
      }
      if (calculatePasserRatingWhenTargeted && ['WR', 'TE', 'RB'].includes(player.pos)) {
          player.stats.season.ratingWhenTargeted = calculatePasserRatingWhenTargeted(player.stats.season);
      }

      // Snapshot season stats to history
      if (Object.keys(player.stats.season).length > 0) {
          if (!player.statsHistory) player.statsHistory = [];
          player.statsHistory.push({
              season: year,
              team: team.abbr || team.name,
              ...player.stats.season
          });
      }

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

    // Reset team records, clear per-game stats, and reset season stats
    L.teams.forEach(team => {
      team.record = { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
      if (team.stats) team.stats.season = {};
      if (team.roster) {
        team.roster.forEach(p => {
          if (p && p.stats) {
            if (p.stats.game) delete p.stats.game;
            // Reset season stats for the new season
            p.stats.season = {};
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

    // Generate new draft class for the next season
    if (typeof window.generateDraftClass === 'function') {
        // Pass year + 1 because the class is for the NEXT draft
        window.generateDraftClass(window.state.year + 1);
    } else if (typeof window.generateProspects === 'function') {
        // Fallback
        window.state.draftClass = window.generateProspects(window.state.year + 1);
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
          // Simulate the game (USING GameSimulator Logic)
          let gameScores = simGameStats(home, away);
          
          if (!gameScores) {
            console.warn(`SimGameStats failed for ${away.abbr || 'Away'} @ ${home.abbr || 'Home'}, using fallback score.`);
            // Fallback: Generate random score to prevent season stall
            // Use basic random generation if Utils unavailable
            const r = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
            const fallbackHome = r(10, 42);
            const fallbackAway = r(7, 35);
            gameScores = { homeScore: fallbackHome, awayScore: fallbackAway };
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
                  stats: { ...player.stats.game } // Shallow copy (sufficient as stats are flat)
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

                // Update Advanced Stats (WAR, etc.) - Weekly Update
                if (updateAdvancedStats) {
                    updateAdvancedStats(p, p.stats.season);
                }
              }
            });
          };
          
          updatePlayerStats(home.roster);
          updatePlayerStats(away.roster);

          // NEW: Update team season stats from game stats
          const updateTeamSeasonStats = (team) => {
              if (!team || !team.stats || !team.stats.game) return;
              if (!team.stats.season) team.stats.season = {};

              Object.keys(team.stats.game).forEach(key => {
                  const val = team.stats.game[key];
                  if (typeof val === 'number') {
                      team.stats.season[key] = (team.stats.season[key] || 0) + val;
                  }
              });
          };

          updateTeamSeasonStats(home);
          updateTeamSeasonStats(away);
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

        // FORCE-FIX: Direct Injection Logic to ensure records persist
        // We re-fetch the teams from the global state to be absolutely sure we have the reference
        if (window.state && window.state.league && window.state.league.teams) {
            const globalHome = window.state.league.teams[pair.home];
            const globalAway = window.state.league.teams[pair.away];

            if (globalHome && globalAway) {
                 // Update Wins/Losses directly on the gameState object
                if (sH > sA) {
                    globalHome.wins = (globalHome.wins || 0) + 1;
                    globalAway.losses = (globalAway.losses || 0) + 1;
                } else if (sA > sH) {
                    globalAway.wins = (globalAway.wins || 0) + 1;
                    globalHome.losses = (globalHome.losses || 0) + 1;
                } else {
                    globalHome.draws = (globalHome.draws || 0) + 1;
                    globalAway.draws = (globalAway.draws || 0) + 1;
                    // Also update ties for legacy support
                    globalHome.ties = (globalHome.ties || 0) + 1;
                    globalAway.ties = (globalAway.ties || 0) + 1;
                }

                // Update Point Differentials
                globalHome.pointsFor = (globalHome.pointsFor || 0) + sH;
                globalHome.pointsAgainst = (globalHome.pointsAgainst || 0) + sA;
                globalAway.pointsFor = (globalAway.pointsFor || 0) + sA;
                globalAway.pointsAgainst = (globalAway.pointsAgainst || 0) + sH;

                // Sync legacy record object
                if (globalHome.record) {
                    globalHome.record.w = globalHome.wins;
                    globalHome.record.l = globalHome.losses;
                    globalHome.record.t = globalHome.ties || globalHome.draws || 0;
                    globalHome.record.pf = globalHome.pointsFor;
                    globalHome.record.pa = globalHome.pointsAgainst;
                }
                 if (globalAway.record) {
                    globalAway.record.w = globalAway.wins;
                    globalAway.record.l = globalAway.losses;
                    globalAway.record.t = globalAway.ties || globalAway.draws || 0;
                    globalAway.record.pf = globalAway.pointsFor;
                    globalAway.record.pa = globalAway.pointsAgainst;
                }
            }
        }

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

    // Update UI to show results (if render option is true, default to true)
    try {
      if (options.render !== false) {
        // FORCE-FIX: Save state immediately
        if (saveState) saveState();
        else if (window.saveState) window.saveState();

        // FORCE-FIX: Refresh UI
        if (typeof window.renderStandings === 'function') window.renderStandings();

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
