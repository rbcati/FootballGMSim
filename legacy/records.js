// records.js - All-Time Records and Leaderboards System
'use strict';

(function() {
  'use strict';

  /**
   * Initialize records structure in league
   * @param {Object} league - League object
   */
  function initializeRecords(league) {
    if (!league) return;
    
    if (!league.records) {
      league.records = {
        // Career totals (all-time records)
        careerTotals: {
          // Passing
          passYd: { player: null, value: 0, year: null },
          passTD: { player: null, value: 0, year: null },
          passAtt: { player: null, value: 0, year: null },
          passComp: { player: null, value: 0, year: null },
          interceptions: { player: null, value: 0, year: null },
          sacks: { player: null, value: 0, year: null },
          
          // Rushing
          rushYd: { player: null, value: 0, year: null },
          rushTD: { player: null, value: 0, year: null },
          rushAtt: { player: null, value: 0, year: null },
          
          // Receiving
          recYd: { player: null, value: 0, year: null },
          recTD: { player: null, value: 0, year: null },
          receptions: { player: null, value: 0, year: null },
          targets: { player: null, value: 0, year: null },
          drops: { player: null, value: 0, year: null },
          
          // All-purpose
          allTD: { player: null, value: 0, year: null },
          
          // Defense
          tackles: { player: null, value: 0, year: null },
          tacklesForLoss: { player: null, value: 0, year: null },
          forcedFumbles: { player: null, value: 0, year: null },
          defensiveInterceptions: { player: null, value: 0, year: null },
          pickSixes: { player: null, value: 0, year: null },
          safeties: { player: null, value: 0, year: null },
          passesDefended: { player: null, value: 0, year: null },
          defensiveTD: { player: null, value: 0, year: null },
          
          // Special teams
          fgMade: { player: null, value: 0, year: null },
          fgAttempts: { player: null, value: 0, year: null },
          punts: { player: null, value: 0, year: null },
          puntYards: { player: null, value: 0, year: null }
        },
        
        // Career averages/percentages (leaderboards - top 10)
        careerAverages: {
          passYd: [],
          completionPct: [],
          rushYd: [],
          passerRating: [],
          qbRating: [],
          recYd: [],
          receptions: [],
          drops: [],
          rushTD: [],
          recTD: [],
          allTD: [],
          passTD: [],
          sacks: [],
          tackles: [],
          tacklesForLoss: [],
          defensiveTD: [],
          forcedFumbles: [],
          interceptions: [],
          pickSixes: [],
          safeties: [],
          passesDefended: []
        },
        
        // Single season records
        singleSeason: {
          passYd: { player: null, value: 0, year: null },
          passTD: { player: null, value: 0, year: null },
          rushYd: { player: null, value: 0, year: null },
          rushTD: { player: null, value: 0, year: null },
          recYd: { player: null, value: 0, year: null },
          recTD: { player: null, value: 0, year: null },
          receptions: { player: null, value: 0, year: null },
          sacks: { player: null, value: 0, year: null },
          tackles: { player: null, value: 0, year: null },
          interceptions: { player: null, value: 0, year: null }
        },
        
        // Single game records
        singleGame: {
          passYd: { player: null, value: 0, year: null, week: null },
          passTD: { player: null, value: 0, year: null, week: null },
          rushYd: { player: null, value: 0, year: null, week: null },
          rushTD: { player: null, value: 0, year: null, week: null },
          recYd: { player: null, value: 0, year: null, week: null },
          recTD: { player: null, value: 0, year: null, week: null },
          sacks: { player: null, value: 0, year: null, week: null },
          interceptions: { player: null, value: 0, year: null, week: null }
        },
        
        // Team records (year-by-year tracking)
        teamHistory: {}, // {teamId: [{year, wins, losses, ptsFor, ptsAgainst, playoffWins, playoffLosses, superBowlWins, superBowlLosses}]}
        
        // Team leaderboards
        teamLeaderboards: {
          mostWins: [], // All-time wins
          mostPlayoffWins: [], // Playoff wins
          mostSuperBowlWins: [], // Super Bowl wins (active teams)
          mostSuperBowlWinsRetired: [], // Super Bowl wins (retired players)
          mostSuperBowlWinsActive: [], // Super Bowl wins (active players)
          mostHallOfFame: [], // Teams with most HoF players
          mostAllPro: [], // Teams with most All-Pro selections
          rushYardsAllowed: [], // Defensive rushing yards allowed (career)
          passYardsAllowed: [], // Defensive passing yards allowed (career)
          passDefenseRank: [], // Pass defense ranking (best)
          passOffenseRank: [] // Pass offense ranking (best)
        },
        
        // Player playoff/Super Bowl leaderboards
        playerLeaderboards: {
          mostPlayoffWins: [], // Players with most playoff wins
          mostSuperBowlWins: [], // All players (active + retired)
          mostSuperBowlWinsActive: [], // Active players only
          mostSuperBowlWinsRetired: [], // Retired players only
          mostWins: [] // Most career wins (players)
        }
      };
    }
    
    // Initialize team history structure
    if (!league.records.teamHistory) {
      league.records.teamHistory = {};
    }
  }

  /**
   * Update career totals records
   * @param {Object} league - League object
   */
  function updateCareerTotals(league) {
    if (!league || !league.teams) return;
    
    initializeRecords(league);
    
    const records = league.records.careerTotals;
    const statFields = Object.keys(records);
    
    // Reset all records
    statFields.forEach(field => {
      records[field] = { player: null, value: 0, year: null };
    });
    
    // Find all-time leaders
    league.teams.forEach(team => {
      if (!team.roster || !Array.isArray(team.roster)) return;
      
      team.roster.forEach(player => {
        if (!player.stats || !player.stats.career) return;
        
        const career = player.stats.career;
        
        // Check each stat field
        statFields.forEach(field => {
          const value = career[field];
          if (typeof value === 'number' && value > (records[field].value || 0)) {
            records[field] = {
              player: {
                id: player.id,
                name: player.name,
                pos: player.pos
              },
              value: value,
              year: league.year || null
            };
          }
        });
      });
    });
  }

  /**
   * Calculate career averages/percentages and create leaderboards
   * @param {Object} league - League object
   */
  function updateCareerAverages(league) {
    if (!league || !league.teams) return;
    
    initializeRecords(league);
    
    const leaderboards = league.records.careerAverages;
    
    // Define leaderboard configurations
    const leaderboardConfigs = {
      passYd: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          const games = career.gamesPlayed || 1;
          return (career.passYd || 0) / games; // Yards per game
        },
        format: (val) => val.toFixed(1) + ' YPG'
      },
      completionPct: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          const att = career.passAtt || 1;
          const comp = career.passComp || 0;
          return att >= 100 ? (comp / att) * 100 : 0; // Minimum 100 attempts
        },
        format: (val) => val.toFixed(1) + '%'
      },
      rushYd: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          const games = career.gamesPlayed || 1;
          return (career.rushYd || 0) / games;
        },
        format: (val) => val.toFixed(1) + ' YPG'
      },
      passerRating: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          return career.passerRating || 0;
        },
        format: (val) => val.toFixed(1)
      },
      qbRating: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          return career.qbRating || 0;
        },
        format: (val) => val.toFixed(1)
      },
      recYd: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          const games = career.gamesPlayed || 1;
          return (career.recYd || 0) / games;
        },
        format: (val) => val.toFixed(1) + ' YPG'
      },
      receptions: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          const games = career.gamesPlayed || 1;
          return (career.receptions || 0) / games;
        },
        format: (val) => val.toFixed(1) + ' RPG'
      },
      drops: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          const targets = career.targets || 1;
          return targets >= 50 ? ((career.drops || 0) / targets) * 100 : 0; // Drop percentage
        },
        format: (val) => val.toFixed(1) + '%'
      },
      rushTD: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          return career.rushTD || 0;
        },
        format: (val) => val.toLocaleString()
      },
      recTD: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          return career.recTD || 0;
        },
        format: (val) => val.toLocaleString()
      },
      allTD: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          return (career.passTD || 0) + (career.rushTD || 0) + (career.recTD || 0);
        },
        format: (val) => val.toLocaleString()
      },
      passTD: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          return career.passTD || 0;
        },
        format: (val) => val.toLocaleString()
      },
      sacks: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          return career.sacks || 0;
        },
        format: (val) => val.toLocaleString()
      },
      tackles: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          return career.tackles || 0;
        },
        format: (val) => val.toLocaleString()
      },
      tacklesForLoss: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          return career.tacklesForLoss || 0;
        },
        format: (val) => val.toLocaleString()
      },
      defensiveTD: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          return career.defensiveTD || 0;
        },
        format: (val) => val.toLocaleString()
      },
      forcedFumbles: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          return career.forcedFumbles || 0;
        },
        format: (val) => val.toLocaleString()
      },
      interceptions: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          // For QBs, this is INTs thrown (lower is better), for DBs it's INTs caught (higher is better)
          // We'll track defensive interceptions separately
          return career.defensiveInterceptions || career.interceptions || 0;
        },
        format: (val) => val.toLocaleString()
      },
      pickSixes: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          return career.pickSixes || 0;
        },
        format: (val) => val.toLocaleString()
      },
      safeties: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          return career.safeties || 0;
        },
        format: (val) => val.toLocaleString()
      },
      passesDefended: {
        calculate: (player) => {
          const career = player.stats?.career || {};
          return career.passesDefended || 0;
        },
        format: (val) => val.toLocaleString()
      }
    };
    
    // Calculate leaderboards for each stat
    Object.keys(leaderboardConfigs).forEach(statKey => {
      const config = leaderboardConfigs[statKey];
      const entries = [];
      
      league.teams.forEach(team => {
        if (!team.roster || !Array.isArray(team.roster)) return;
        
        team.roster.forEach(player => {
          if (!player.stats || !player.stats.career) return;
          
          const value = config.calculate(player);
          if (value > 0) {
            entries.push({
              player: {
                id: player.id,
                name: player.name,
                pos: player.pos,
                team: team.name,
                teamAbbr: team.abbr
              },
              value: value,
              formatted: config.format(value)
            });
          }
        });
      });
      
      // Sort and take top 10
      entries.sort((a, b) => b.value - a.value);
      leaderboards[statKey] = entries.slice(0, 10);
    });
  }

  /**
   * Check and update single season records
   * @param {Object} league - League object
   * @param {number} year - Season year
   */
  function updateSingleSeasonRecords(league, year) {
    if (!league || !league.teams) return;
    
    initializeRecords(league);
    
    const records = league.records.singleSeason;
    const statFields = ['passYd', 'passTD', 'rushYd', 'rushTD', 'recYd', 'recTD', 'receptions', 'sacks', 'tackles', 'interceptions'];
    
    league.teams.forEach(team => {
      if (!team.roster || !Array.isArray(team.roster)) return;
      
      team.roster.forEach(player => {
        if (!player.stats || !player.stats.season) return;
        
        const season = player.stats.season;
        
        statFields.forEach(field => {
          const value = season[field];
          if (typeof value === 'number' && value > (records[field]?.value || 0)) {
            records[field] = {
              player: {
                id: player.id,
                name: player.name,
                pos: player.pos
              },
              value: value,
              year: year
            };
          }
        });
      });
    });
  }

  /**
   * Record team season history (called at end of season)
   * @param {Object} league - League object
   * @param {number} year - Season year
   */
  function recordTeamSeason(league, year) {
    if (!league || !league.teams) return;
    
    initializeRecords(league);
    
    league.teams.forEach((team, teamId) => {
      if (!team) return;
      
      // Get playoff stats from history or team data
      const playoffWins = team.playoffWins || 0;
      const playoffLosses = team.playoffLosses || 0;
      const madePlayoffs = (playoffWins + playoffLosses) > 0 || team.madePlayoffs || false;
      
      // Get Super Bowl stats from history
      const superBowlWins = (league.history?.superBowls || []).filter(sb => 
        sb.winner && (sb.winner.id === teamId || sb.winner.name === team.name)
      ).length;
      const superBowlLosses = (league.history?.superBowls || []).filter(sb => 
        sb.runnerUp && (sb.runnerUp.id === teamId || sb.runnerUp.name === team.name)
      ).length;
      
      // Create season record
      const seasonRecord = {
        year: year,
        wins: team.wins || 0,
        losses: team.losses || 0,
        ties: team.ties || 0,
        ptsFor: team.ptsFor || 0,
        ptsAgainst: team.ptsAgainst || 0,
        madePlayoffs: madePlayoffs,
        playoffWins: playoffWins,
        playoffLosses: playoffLosses,
        superBowlWins: superBowlWins,
        superBowlLosses: superBowlLosses
      };
      
      // Add to team history
      if (!league.records.teamHistory[teamId]) {
        league.records.teamHistory[teamId] = [];
      }
      league.records.teamHistory[teamId].push(seasonRecord);
    });
  }

  /**
   * Update team leaderboards
   * @param {Object} league - League object
   */
  function updateTeamLeaderboards(league) {
    if (!league || !league.teams) return;
    
    initializeRecords(league);
    const leaderboards = league.records.teamLeaderboards;
    
    // Reset leaderboards
    Object.keys(leaderboards).forEach(key => {
      leaderboards[key] = [];
    });
    
    // Calculate team totals from history
    const teamTotals = {};
    league.teams.forEach((team, teamId) => {
      const history = league.records.teamHistory[teamId] || [];
      
      const totals = {
        teamId: teamId,
        team: {
          name: team.name,
          abbr: team.abbr || team.name
        },
        totalWins: 0,
        totalLosses: 0,
        totalPlayoffWins: 0,
        totalPlayoffLosses: 0,
        totalSuperBowlWins: 0,
        totalSuperBowlLosses: 0,
        totalPtsFor: 0,
        totalPtsAgainst: 0,
        totalRushYardsAllowed: 0,
        totalPassYardsAllowed: 0
      };
      
      history.forEach(season => {
        totals.totalWins += season.wins || 0;
        totals.totalLosses += season.losses || 0;
        totals.totalPlayoffWins += season.playoffWins || 0;
        totals.totalPlayoffLosses += season.playoffLosses || 0;
        totals.totalSuperBowlWins += season.superBowlWins || 0;
        totals.totalSuperBowlLosses += season.superBowlLosses || 0;
        totals.totalPtsFor += season.ptsFor || 0;
        totals.totalPtsAgainst += season.ptsAgainst || 0;
      });
      
      teamTotals[teamId] = totals;
    });
    
    // Most wins
    Object.values(teamTotals).forEach(totals => {
      leaderboards.mostWins.push({
        team: totals.team,
        value: totals.totalWins
      });
    });
    leaderboards.mostWins.sort((a, b) => b.value - a.value);
    
    // Most playoff wins
    Object.values(teamTotals).forEach(totals => {
      if (totals.totalPlayoffWins > 0) {
        leaderboards.mostPlayoffWins.push({
          team: totals.team,
          value: totals.totalPlayoffWins
        });
      }
    });
    leaderboards.mostPlayoffWins.sort((a, b) => b.value - a.value);
    
    // Most Super Bowl wins (teams)
    Object.values(teamTotals).forEach(totals => {
      if (totals.totalSuperBowlWins > 0) {
        leaderboards.mostSuperBowlWins.push({
          team: totals.team,
          value: totals.totalSuperBowlWins
        });
      }
    });
    leaderboards.mostSuperBowlWins.sort((a, b) => b.value - a.value);
    
    // Most Hall of Fame players (by team)
    league.teams.forEach((team, teamId) => {
      if (!team.roster) return;
      const hofCount = team.roster.filter(p => p.legacy?.hallOfFame || p.hallOfFame).length;
      if (hofCount > 0) {
        leaderboards.mostHallOfFame.push({
          team: { name: team.name, abbr: team.abbr || team.name },
          value: hofCount
        });
      }
    });
    leaderboards.mostHallOfFame.sort((a, b) => b.value - a.value);
    
    // Most All-Pro selections (by team)
    league.teams.forEach((team, teamId) => {
      if (!team.roster) return;
      let allProCount = 0;
      team.roster.forEach(player => {
        const allProAwards = (player.awards || []).filter(a => 
          a.award && a.award.includes('All-Pro')
        ).length;
        allProCount += allProAwards;
      });
      if (allProCount > 0) {
        leaderboards.mostAllPro.push({
          team: { name: team.name, abbr: team.abbr || team.name },
          value: allProCount
        });
      }
    });
    leaderboards.mostAllPro.sort((a, b) => b.value - a.value);
  }

  /**
   * Update player playoff/Super Bowl leaderboards
   * @param {Object} league - League object
   */
  function updatePlayerLeaderboards(league) {
    if (!league || !league.teams) return;
    
    initializeRecords(league);
    const leaderboards = league.records.playerLeaderboards;
    
    // Reset
    Object.keys(leaderboards).forEach(key => {
      leaderboards[key] = [];
    });
    
    // Collect all players (active and retired)
    const allPlayers = [];
    league.teams.forEach(team => {
      if (team.roster) {
        team.roster.forEach(player => {
          allPlayers.push({ player, team });
        });
      }
    });
    
    // Most playoff wins (players)
    allPlayers.forEach(({ player, team }) => {
      const playoffWins = player.legacy?.playoffStats?.wins || 0;
      if (playoffWins > 0) {
        leaderboards.mostPlayoffWins.push({
          player: {
            id: player.id,
            name: player.name,
            pos: player.pos,
            team: team.name,
            teamAbbr: team.abbr
          },
          value: playoffWins,
          retired: player.retired || false
        });
      }
    });
    leaderboards.mostPlayoffWins.sort((a, b) => b.value - a.value);
    
    // Most Super Bowl wins (all players)
    allPlayers.forEach(({ player, team }) => {
      const superBowlWins = (player.awards || []).filter(a => 
        a.award === 'Super Bowl Champion'
      ).length;
      if (superBowlWins > 0) {
        const isRetired = player.retired || false;
        leaderboards.mostSuperBowlWins.push({
          player: {
            id: player.id,
            name: player.name,
            pos: player.pos,
            team: team.name,
            teamAbbr: team.abbr
          },
          value: superBowlWins,
          retired: isRetired
        });
        
        // Separate by active/retired
        if (isRetired) {
          leaderboards.mostSuperBowlWinsRetired.push({
            player: {
              id: player.id,
              name: player.name,
              pos: player.pos,
              team: team.name,
              teamAbbr: team.abbr
            },
            value: superBowlWins
          });
        } else {
          leaderboards.mostSuperBowlWinsActive.push({
            player: {
              id: player.id,
              name: player.name,
              pos: player.pos,
              team: team.name,
              teamAbbr: team.abbr
            },
            value: superBowlWins
          });
        }
      }
    });
    
    leaderboards.mostSuperBowlWins.sort((a, b) => b.value - a.value);
    leaderboards.mostSuperBowlWinsActive.sort((a, b) => b.value - a.value);
    leaderboards.mostSuperBowlWinsRetired.sort((a, b) => b.value - a.value);
    
    // Most wins (players - career wins with team)
    allPlayers.forEach(({ player, team }) => {
      const careerWins = player.legacy?.careerWins || 0;
      if (careerWins > 0) {
        leaderboards.mostWins.push({
          player: {
            id: player.id,
            name: player.name,
            pos: player.pos,
            team: team.name,
            teamAbbr: team.abbr
          },
          value: careerWins,
          retired: player.retired || false
        });
      }
    });
    leaderboards.mostWins.sort((a, b) => b.value - a.value);
  }

  /**
   * Check and update single game records
   * @param {Object} league - League object
   * @param {number} year - Season year
   * @param {number} week - Week number
   */
  function updateSingleGameRecords(league, year, week) {
    if (!league || !league.resultsByWeek) return;
    
    initializeRecords(league);
    
    const records = league.records.singleGame;
    const weekResults = league.resultsByWeek[week - 1];
    if (!weekResults || !Array.isArray(weekResults)) return;
    
    weekResults.forEach(gameResult => {
      if (!gameResult || !gameResult.boxScore) return;
      
      // Check both teams
      ['home', 'away'].forEach(side => {
        const playerStats = gameResult.boxScore[side];
        if (!playerStats) return;
        
        Object.values(playerStats).forEach(playerData => {
          if (!playerData || !playerData.stats) return;
          
          const gameStats = playerData.stats;
          const statFields = ['passYd', 'passTD', 'rushYd', 'rushTD', 'recYd', 'recTD', 'sacks', 'interceptions'];
          
          statFields.forEach(field => {
            const value = gameStats[field];
            if (typeof value === 'number' && value > (records[field]?.value || 0)) {
              records[field] = {
                player: {
                  id: playerData.id || playerData.name,
                  name: playerData.name,
                  pos: playerData.pos
                },
                value: value,
                year: year,
                week: week
              };
            }
          });
        });
      });
    });
  }

  /**
   * Update all records (called at end of season)
   * @param {Object} league - League object
   * @param {number} year - Season year
   */
  function updateAllRecords(league, year) {
    if (!league) return;
    
    console.log(`Updating all-time records for ${year}...`);
    
    // Record team season history first
    recordTeamSeason(league, year);
    
    // Update player records
    updateCareerTotals(league);
    updateCareerAverages(league);
    updateSingleSeasonRecords(league, year);
    
    // Update team and player leaderboards
    updateTeamLeaderboards(league);
    updatePlayerLeaderboards(league);
    
    // Update single game records for all weeks
    if (league.resultsByWeek) {
      Object.keys(league.resultsByWeek).forEach(weekIndex => {
        const week = parseInt(weekIndex) + 1;
        updateSingleGameRecords(league, year, week);
      });
    }
    
    console.log('✅ All-time records updated');
  }

  /**
   * Render records view
   */
  function renderRecords() {
    const container = document.getElementById('records');
    if (!container) {
      console.warn('Records container not found');
      return;
    }
    
    const L = window.state?.league;
    if (!L) {
      container.innerHTML = '<div class="card"><p>No league loaded.</p></div>';
      return;
    }
    
    initializeRecords(L);
    const records = L.records;
    
    let html = `
      <div class="card">
        <h2>All-Time Records</h2>
        
        <div class="records-tabs">
          <button class="tab-btn active" data-tab="career-totals">Career Totals</button>
          <button class="tab-btn" data-tab="career-averages">Career Leaderboards</button>
          <button class="tab-btn" data-tab="team-records">Team Records</button>
          <button class="tab-btn" data-tab="player-playoffs">Playoffs & Super Bowls</button>
          <button class="tab-btn" data-tab="single-season">Single Season</button>
          <button class="tab-btn" data-tab="single-game">Single Game</button>
        </div>
        
        <div class="records-content">
          <div id="career-totals-tab" class="records-tab-content active">
            ${renderCareerTotals(records.careerTotals)}
          </div>
          
          <div id="career-averages-tab" class="records-tab-content">
            ${renderCareerAverages(records.careerAverages)}
          </div>
          
          <div id="team-records-tab" class="records-tab-content">
            ${renderTeamRecords(records.teamLeaderboards, records.teamHistory, L)}
          </div>
          
          <div id="player-playoffs-tab" class="records-tab-content">
            ${renderPlayerPlayoffRecords(records.playerLeaderboards)}
          </div>
          
          <div id="single-season-tab" class="records-tab-content">
            ${renderSingleSeason(records.singleSeason)}
          </div>
          
          <div id="single-game-tab" class="records-tab-content">
            ${renderSingleGame(records.singleGame)}
          </div>
        </div>
      </div>
    `;
    
    container.innerHTML = html;
    
    // Set up tab switching
    const tabButtons = container.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        
        // Update button states
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update content visibility
        container.querySelectorAll('.records-tab-content').forEach(content => {
          content.classList.remove('active');
        });
        const targetContent = container.querySelector(`#${tab}-tab`);
        if (targetContent) {
          targetContent.classList.add('active');
        }
      });
    });
  }

  /**
   * Render career totals
   */
  function renderCareerTotals(careerTotals) {
    if (!careerTotals) return '<p>No career totals available.</p>';
    
    const statNames = {
      passYd: 'Passing Yards',
      passTD: 'Passing Touchdowns',
      passAtt: 'Pass Attempts',
      passComp: 'Pass Completions',
      interceptions: 'Interceptions Thrown',
      sacks: 'Sacks Taken',
      rushYd: 'Rushing Yards',
      rushTD: 'Rushing Touchdowns',
      rushAtt: 'Rush Attempts',
      recYd: 'Receiving Yards',
      recTD: 'Receiving Touchdowns',
      receptions: 'Receptions',
      targets: 'Targets',
      drops: 'Drops',
      allTD: 'Total Touchdowns',
      tackles: 'Tackles',
      tacklesForLoss: 'Tackles for Loss',
      forcedFumbles: 'Forced Fumbles',
      pickSixes: 'Pick Sixes',
      safeties: 'Safeties',
      passesDefended: 'Passes Defended',
      defensiveTD: 'Defensive Touchdowns',
      fgMade: 'Field Goals Made',
      fgAttempts: 'Field Goal Attempts',
      punts: 'Punts',
      puntYards: 'Punt Yards'
    };
    
    const entries = Object.entries(careerTotals)
      .filter(([key, record]) => record && record.player && record.value > 0)
      .sort((a, b) => b[1].value - a[1].value);
    
    if (entries.length === 0) {
      return '<p>No career totals recorded yet.</p>';
    }
    
    return `
      <div class="records-table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Statistic</th>
              <th>Player</th>
              <th>Position</th>
              <th>Value</th>
              <th>Year Set</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(([stat, record]) => `
              <tr>
                <td><strong>${statNames[stat] || stat}</strong></td>
                <td>${record.player.name}</td>
                <td>${record.player.pos}</td>
                <td>${record.value.toLocaleString()}</td>
                <td>${record.year || 'N/A'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Render career averages/leaderboards
   */
  function renderCareerAverages(careerAverages) {
    if (!careerAverages) return '<p>No leaderboards available.</p>';
    
    const leaderboardNames = {
      passYd: 'Passing Yards per Game',
      completionPct: 'Completion Percentage',
      rushYd: 'Rushing Yards per Game',
      passerRating: 'Passer Rating',
      qbRating: 'QB Rating',
      recYd: 'Receiving Yards per Game',
      receptions: 'Receptions per Game',
      drops: 'Drop Percentage',
      rushTD: 'Rushing Touchdowns',
      recTD: 'Receiving Touchdowns',
      allTD: 'Total Touchdowns',
      passTD: 'Passing Touchdowns',
      sacks: 'Sacks',
      tackles: 'Tackles',
      tacklesForLoss: 'Tackles for Loss',
      defensiveTD: 'Defensive Touchdowns',
      forcedFumbles: 'Forced Fumbles',
      interceptions: 'Interceptions',
      pickSixes: 'Pick Sixes',
      safeties: 'Safeties',
      passesDefended: 'Passes Defended'
    };
    
    const leaderboards = Object.entries(careerAverages)
      .filter(([key, entries]) => entries && entries.length > 0);
    
    if (leaderboards.length === 0) {
      return '<p>No leaderboards available yet.</p>';
    }
    
    return `
      <div class="leaderboards-grid">
        ${leaderboards.map(([stat, entries]) => `
          <div class="leaderboard-card">
            <h3>${leaderboardNames[stat] || stat}</h3>
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Pos</th>
                  <th>Team</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                ${entries.map((entry, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${entry.player.name}</td>
                    <td>${entry.player.pos}</td>
                    <td>${entry.player.teamAbbr || entry.player.team}</td>
                    <td><strong>${entry.formatted}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * Render single season records
   */
  function renderSingleSeason(singleSeason) {
    if (!singleSeason) return '<p>No single season records available.</p>';
    
    const statNames = {
      passYd: 'Passing Yards',
      passTD: 'Passing Touchdowns',
      rushYd: 'Rushing Yards',
      rushTD: 'Rushing Touchdowns',
      recYd: 'Receiving Yards',
      recTD: 'Receiving Touchdowns',
      receptions: 'Receptions',
      sacks: 'Sacks',
      tackles: 'Tackles',
      interceptions: 'Interceptions'
    };
    
    const entries = Object.entries(singleSeason)
      .filter(([key, record]) => record && record.player && record.value > 0)
      .sort((a, b) => b[1].value - a[1].value);
    
    if (entries.length === 0) {
      return '<p>No single season records yet.</p>';
    }
    
    return `
      <div class="records-table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Statistic</th>
              <th>Player</th>
              <th>Position</th>
              <th>Value</th>
              <th>Year</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(([stat, record]) => `
              <tr>
                <td><strong>${statNames[stat] || stat}</strong></td>
                <td>${record.player.name}</td>
                <td>${record.player.pos}</td>
                <td>${record.value.toLocaleString()}</td>
                <td>${record.year || 'N/A'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Render single game records
   */
  function renderSingleGame(singleGame) {
    if (!singleGame) return '<p>No single game records available.</p>';
    
    const statNames = {
      passYd: 'Passing Yards',
      passTD: 'Passing Touchdowns',
      rushYd: 'Rushing Yards',
      rushTD: 'Rushing Touchdowns',
      recYd: 'Receiving Yards',
      recTD: 'Receiving Touchdowns',
      sacks: 'Sacks',
      interceptions: 'Interceptions'
    };
    
    const entries = Object.entries(singleGame)
      .filter(([key, record]) => record && record.player && record.value > 0)
      .sort((a, b) => b[1].value - a[1].value);
    
    if (entries.length === 0) {
      return '<p>No single game records yet.</p>';
    }
    
    return `
      <div class="records-table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Statistic</th>
              <th>Player</th>
              <th>Position</th>
              <th>Value</th>
              <th>Year</th>
              <th>Week</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(([stat, record]) => `
              <tr>
                <td><strong>${statNames[stat] || stat}</strong></td>
                <td>${record.player.name}</td>
                <td>${record.player.pos}</td>
                <td>${record.value.toLocaleString()}</td>
                <td>${record.year || 'N/A'}</td>
                <td>${record.week || 'N/A'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Render team records and leaderboards
   */
  function renderTeamRecords(teamLeaderboards, teamHistory, league) {
    if (!teamLeaderboards) return '<p>No team records available.</p>';
    
    return `
      <div class="team-records-section">
        <h3>Team Leaderboards</h3>
        
        <div class="leaderboards-grid">
          <div class="leaderboard-card">
            <h4>Most All-Time Wins</h4>
            <table class="table table-sm">
              <thead>
                <tr><th>Rank</th><th>Team</th><th>Wins</th></tr>
              </thead>
              <tbody>
                ${(teamLeaderboards.mostWins || []).slice(0, 10).map((entry, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${entry.team.abbr || entry.team.name}</td>
                    <td><strong>${entry.value}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="leaderboard-card">
            <h4>Most Playoff Wins</h4>
            <table class="table table-sm">
              <thead>
                <tr><th>Rank</th><th>Team</th><th>Wins</th></tr>
              </thead>
              <tbody>
                ${(teamLeaderboards.mostPlayoffWins || []).slice(0, 10).map((entry, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${entry.team.abbr || entry.team.name}</td>
                    <td><strong>${entry.value}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="leaderboard-card">
            <h4>Most Super Bowl Wins</h4>
            <table class="table table-sm">
              <thead>
                <tr><th>Rank</th><th>Team</th><th>Wins</th></tr>
              </thead>
              <tbody>
                ${(teamLeaderboards.mostSuperBowlWins || []).slice(0, 10).map((entry, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${entry.team.abbr || entry.team.name}</td>
                    <td><strong>${entry.value}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="leaderboard-card">
            <h4>Most Hall of Fame Players</h4>
            <table class="table table-sm">
              <thead>
                <tr><th>Rank</th><th>Team</th><th>HoF Players</th></tr>
              </thead>
              <tbody>
                ${(teamLeaderboards.mostHallOfFame || []).slice(0, 10).map((entry, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${entry.team.abbr || entry.team.name}</td>
                    <td><strong>${entry.value}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="leaderboard-card">
            <h4>Most All-Pro Selections</h4>
            <table class="table table-sm">
              <thead>
                <tr><th>Rank</th><th>Team</th><th>All-Pros</th></tr>
              </thead>
              <tbody>
                ${(teamLeaderboards.mostAllPro || []).slice(0, 10).map((entry, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${entry.team.abbr || entry.team.name}</td>
                    <td><strong>${entry.value}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render player playoff and Super Bowl records
   */
  function renderPlayerPlayoffRecords(playerLeaderboards) {
    if (!playerLeaderboards) return '<p>No playoff records available.</p>';
    
    return `
      <div class="player-playoff-records-section">
        <h3>Playoff & Super Bowl Records</h3>
        
        <div class="leaderboards-grid">
          <div class="leaderboard-card">
            <h4>Most Playoff Wins (Players)</h4>
            <table class="table table-sm">
              <thead>
                <tr><th>Rank</th><th>Player</th><th>Pos</th><th>Team</th><th>Wins</th></tr>
              </thead>
              <tbody>
                ${(playerLeaderboards.mostPlayoffWins || []).slice(0, 10).map((entry, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${entry.player.name}</td>
                    <td>${entry.player.pos}</td>
                    <td>${entry.player.teamAbbr || entry.player.team}</td>
                    <td><strong>${entry.value}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="leaderboard-card">
            <h4>Most Super Bowl Wins (All Players)</h4>
            <table class="table table-sm">
              <thead>
                <tr><th>Rank</th><th>Player</th><th>Pos</th><th>Team</th><th>Wins</th></tr>
              </thead>
              <tbody>
                ${(playerLeaderboards.mostSuperBowlWins || []).slice(0, 10).map((entry, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${entry.player.name} ${entry.retired ? '(Retired)' : ''}</td>
                    <td>${entry.player.pos}</td>
                    <td>${entry.player.teamAbbr || entry.player.team}</td>
                    <td><strong>${entry.value}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="leaderboard-card">
            <h4>Most Super Bowl Wins (Active Players)</h4>
            <table class="table table-sm">
              <thead>
                <tr><th>Rank</th><th>Player</th><th>Pos</th><th>Team</th><th>Wins</th></tr>
              </thead>
              <tbody>
                ${(playerLeaderboards.mostSuperBowlWinsActive || []).slice(0, 10).map((entry, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${entry.player.name}</td>
                    <td>${entry.player.pos}</td>
                    <td>${entry.player.teamAbbr || entry.player.team}</td>
                    <td><strong>${entry.value}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="leaderboard-card">
            <h4>Most Super Bowl Wins (Retired Players)</h4>
            <table class="table table-sm">
              <thead>
                <tr><th>Rank</th><th>Player</th><th>Pos</th><th>Team</th><th>Wins</th></tr>
              </thead>
              <tbody>
                ${(playerLeaderboards.mostSuperBowlWinsRetired || []).slice(0, 10).map((entry, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${entry.player.name}</td>
                    <td>${entry.player.pos}</td>
                    <td>${entry.player.teamAbbr || entry.player.team}</td>
                    <td><strong>${entry.value}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="leaderboard-card">
            <h4>Most Career Wins (Players)</h4>
            <table class="table table-sm">
              <thead>
                <tr><th>Rank</th><th>Player</th><th>Pos</th><th>Team</th><th>Wins</th></tr>
              </thead>
              <tbody>
                ${(playerLeaderboards.mostWins || []).slice(0, 10).map((entry, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${entry.player.name} ${entry.retired ? '(Retired)' : ''}</td>
                    <td>${entry.player.pos}</td>
                    <td>${entry.player.teamAbbr || entry.player.team}</td>
                    <td><strong>${entry.value}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // Export functions
  window.initializeRecords = initializeRecords;
  window.updateAllRecords = updateAllRecords;
  window.updateCareerTotals = updateCareerTotals;
  window.updateCareerAverages = updateCareerAverages;
  window.updateSingleSeasonRecords = updateSingleSeasonRecords;
  window.updateSingleGameRecords = updateSingleGameRecords;
  window.recordTeamSeason = recordTeamSeason;
  window.updateTeamLeaderboards = updateTeamLeaderboards;
  window.updatePlayerLeaderboards = updatePlayerLeaderboards;
  window.renderRecords = renderRecords;

  console.log('✅ All-Time Records System loaded');

})();
