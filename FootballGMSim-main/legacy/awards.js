// awards.js - Comprehensive Award System
'use strict';

(function() {
  'use strict';

  /**
   * Calculate MVP (Most Valuable Player)
   * Considers stats + team success
   * @param {Object} league - League object
   * @param {number} year - Season year
   * @returns {Object|null} MVP player with details
   */
  function calculateMVP(league, year) {
    if (!league || !league.teams) return null;

    const candidates = [];
    
    // Get all players with season stats
    league.teams.forEach(team => {
      if (!team.roster || !Array.isArray(team.roster)) return;
      
      team.roster.forEach(player => {
        if (!player.stats || !player.stats.season) return;
        const seasonStats = player.stats.season;
        
        // Must have played significant games
        if ((seasonStats.gamesPlayed || 0) < 10) return;
        
        let mvpScore = 0;
        const teamWins = team.wins || 0;
        const teamLosses = team.losses || 0;
        const teamWinPct = teamWins / Math.max(1, teamWins + teamLosses);
        
        // Position-specific scoring
        if (player.pos === 'QB') {
          const passYd = seasonStats.passYd || 0;
          const passTD = seasonStats.passTD || 0;
          const interceptions = seasonStats.interceptions || 0;
          const completionPct = seasonStats.completionPct || 0;
          
          // Base score from stats
          mvpScore = (passYd / 100) + (passTD * 20) - (interceptions * 10) + (completionPct * 2);
          
          // Team success multiplier (critical for MVP)
          mvpScore *= (0.5 + teamWinPct * 0.5);
          
          // Threshold: Must have at least 3500 pass yards or 30 TDs
          if (passYd < 3500 && passTD < 30) return;
        } else if (player.pos === 'RB') {
          const rushYd = seasonStats.rushYd || 0;
          const rushTD = seasonStats.rushTD || 0;
          const recYd = seasonStats.recYd || 0;
          
          mvpScore = (rushYd / 50) + (rushTD * 15) + (recYd / 100);
          mvpScore *= (0.6 + teamWinPct * 0.4);
          
          // Threshold: Must have at least 1200 rush yards or 12 TDs
          if (rushYd < 1200 && rushTD < 12) return;
        } else if (player.pos === 'WR' || player.pos === 'TE') {
          const recYd = seasonStats.recYd || 0;
          const recTD = seasonStats.recTD || 0;
          const receptions = seasonStats.receptions || 0;
          
          mvpScore = (recYd / 80) + (recTD * 12) + (receptions / 5);
          mvpScore *= (0.6 + teamWinPct * 0.4);
          
          // Threshold: Must have at least 1000 rec yards or 10 TDs
          if (recYd < 1000 && recTD < 10) return;
        } else {
          // Defensive players can win MVP but need exceptional stats
          const tackles = seasonStats.tackles || 0;
          const sacks = seasonStats.sacks || 0;
          const interceptions = seasonStats.interceptions || 0;
          
          mvpScore = (tackles * 2) + (sacks * 15) + (interceptions * 20);
          mvpScore *= (0.7 + teamWinPct * 0.3);
          
          // Threshold: Must have exceptional stats
          if (sacks < 15 && interceptions < 6 && tackles < 100) return;
        }
        
        candidates.push({
          player: player,
          team: team,
          score: mvpScore,
          seasonStats: seasonStats
        });
      });
    });
    
    if (candidates.length === 0) return null;
    
    // Sort by score and return winner
    candidates.sort((a, b) => b.score - a.score);
    const winner = candidates[0];
    
    return {
      player: winner.player,
      team: winner.team,
      year: year,
      stats: winner.seasonStats
    };
  }

  /**
   * Calculate Offensive Player of Year
   * If QB wins MVP, OPOY goes to best RB or WR
   * @param {Object} league - League object
   * @param {number} year - Season year
   * @param {Object} mvp - MVP winner (to exclude if QB)
   * @returns {Object|null} OPOY winner
   */
  function calculateOPOY(league, year, mvp) {
    if (!league || !league.teams) return null;

    const candidates = [];
    const excludePlayerId = (mvp && mvp.player && mvp.player.pos === 'QB') ? mvp.player.id : null;
    
    league.teams.forEach(team => {
      if (!team.roster || !Array.isArray(team.roster)) return;
      
      team.roster.forEach(player => {
        // Skip if this is the MVP QB
        if (player.id === excludePlayerId) return;
        
        // Only offensive players
        if (!['QB', 'RB', 'WR', 'TE', 'OL'].includes(player.pos)) return;
        
        if (!player.stats || !player.stats.season) return;
        const seasonStats = player.stats.season;
        
        if ((seasonStats.gamesPlayed || 0) < 10) return;
        
        let opoyScore = 0;
        
        if (player.pos === 'QB') {
          const passYd = seasonStats.passYd || 0;
          const passTD = seasonStats.passTD || 0;
          const interceptions = seasonStats.interceptions || 0;
          
          opoyScore = (passYd / 100) + (passTD * 20) - (interceptions * 10);
          
          // Threshold: Must have at least 4000 pass yards or 35 TDs
          if (passYd < 4000 && passTD < 35) return;
        } else if (player.pos === 'RB') {
          const rushYd = seasonStats.rushYd || 0;
          const rushTD = seasonStats.rushTD || 0;
          const recYd = seasonStats.recYd || 0;
          const recTD = seasonStats.recTD || 0;
          
          opoyScore = (rushYd / 50) + (rushTD * 15) + (recYd / 100) + (recTD * 10);
          
          // Threshold: Must have at least 1400 rush yards or 14 TDs
          if (rushYd < 1400 && rushTD < 14) return;
        } else if (player.pos === 'WR' || player.pos === 'TE') {
          const recYd = seasonStats.recYd || 0;
          const recTD = seasonStats.recTD || 0;
          const receptions = seasonStats.receptions || 0;
          
          opoyScore = (recYd / 80) + (recTD * 12) + (receptions / 5);
          
          // Threshold: Must have at least 1200 rec yards or 12 TDs
          if (recYd < 1200 && recTD < 12) return;
        } else {
          return; // OL not eligible for OPOY
        }
        
        candidates.push({
          player: player,
          team: team,
          score: opoyScore,
          seasonStats: seasonStats
        });
      });
    });
    
    if (candidates.length === 0) return null;
    
    candidates.sort((a, b) => b.score - a.score);
    const winner = candidates[0];
    
    return {
      player: winner.player,
      team: winner.team,
      year: year,
      stats: winner.seasonStats
    };
  }

  /**
   * Calculate Defensive Player of Year
   * @param {Object} league - League object
   * @param {number} year - Season year
   * @returns {Object|null} DPOY winner
   */
  function calculateDPOY(league, year) {
    if (!league || !league.teams) return null;

    const candidates = [];
    
    league.teams.forEach(team => {
      if (!team.roster || !Array.isArray(team.roster)) return;
      
      team.roster.forEach(player => {
        // Only defensive players
        if (!['DL', 'LB', 'CB', 'S'].includes(player.pos)) return;
        
        if (!player.stats || !player.stats.season) return;
        const seasonStats = player.stats.season;
        
        if ((seasonStats.gamesPlayed || 0) < 10) return;
        
        const tackles = seasonStats.tackles || 0;
        const sacks = seasonStats.sacks || 0;
        const interceptions = seasonStats.interceptions || 0;
        const forcedFumbles = seasonStats.forcedFumbles || 0;
        const tacklesForLoss = seasonStats.tacklesForLoss || 0;
        const passesDefended = seasonStats.passesDefended || 0;
        const coverageRating = seasonStats.coverageRating || 0;
        const pressureRating = seasonStats.pressureRating || 0;
        
        let dpoyScore = 0;
        
        if (player.pos === 'DL') {
          dpoyScore = (sacks * 20) + (tackles * 1.5) + (tacklesForLoss * 5) + (forcedFumbles * 10) + (pressureRating / 2);
          
          // Threshold: Must have at least 12 sacks or 80 tackles
          if (sacks < 12 && tackles < 80) return;
        } else if (player.pos === 'LB') {
          dpoyScore = (tackles * 2) + (sacks * 15) + (tacklesForLoss * 5) + (interceptions * 15) + (forcedFumbles * 10);
          
          // Threshold: Must have at least 100 tackles or 10 sacks
          if (tackles < 100 && sacks < 10) return;
        } else if (player.pos === 'CB' || player.pos === 'S') {
          dpoyScore = (interceptions * 25) + (passesDefended * 3) + (tackles * 1.5) + (coverageRating / 2);
          
          // Threshold: Must have at least 5 INTs or 15 PD
          if (interceptions < 5 && passesDefended < 15) return;
        }
        
        candidates.push({
          player: player,
          team: team,
          score: dpoyScore,
          seasonStats: seasonStats
        });
      });
    });
    
    if (candidates.length === 0) return null;
    
    candidates.sort((a, b) => b.score - a.score);
    const winner = candidates[0];
    
    return {
      player: winner.player,
      team: winner.team,
      year: year,
      stats: winner.seasonStats
    };
  }

  /**
   * Calculate Offensive Rookie of Year
   * @param {Object} league - League object
   * @param {number} year - Season year
   * @returns {Object|null} OROTY winner
   */
  function calculateOROTY(league, year) {
    if (!league || !league.teams) return null;

    const candidates = [];
    
    league.teams.forEach(team => {
      if (!team.roster || !Array.isArray(team.roster)) return;
      
      team.roster.forEach(player => {
        // Must be offensive rookie
        if (!['QB', 'RB', 'WR', 'TE', 'OL'].includes(player.pos)) return;
        
        // Check if rookie (first season in league)
        const isRookie = (player.legacy?.teamHistory?.length || 0) <= 1 && 
                         (player.age || 0) <= 24;
        if (!isRookie) return;
        
        if (!player.stats || !player.stats.season) return;
        const seasonStats = player.stats.season;
        
        if ((seasonStats.gamesPlayed || 0) < 8) return;
        
        let orotyScore = 0;
        
        if (player.pos === 'QB') {
          const passYd = seasonStats.passYd || 0;
          const passTD = seasonStats.passTD || 0;
          orotyScore = (passYd / 100) + (passTD * 20);
          
          // Threshold: Must have at least 2500 pass yards or 20 TDs
          if (passYd < 2500 && passTD < 20) return;
        } else if (player.pos === 'RB') {
          const rushYd = seasonStats.rushYd || 0;
          const rushTD = seasonStats.rushTD || 0;
          orotyScore = (rushYd / 50) + (rushTD * 15);
          
          // Threshold: Must have at least 800 rush yards or 8 TDs
          if (rushYd < 800 && rushTD < 8) return;
        } else if (player.pos === 'WR' || player.pos === 'TE') {
          const recYd = seasonStats.recYd || 0;
          const recTD = seasonStats.recTD || 0;
          orotyScore = (recYd / 80) + (recTD * 12);
          
          // Threshold: Must have at least 600 rec yards or 6 TDs
          if (recYd < 600 && recTD < 6) return;
        } else {
          return; // OL not typically eligible
        }
        
        candidates.push({
          player: player,
          team: team,
          score: orotyScore,
          seasonStats: seasonStats
        });
      });
    });
    
    if (candidates.length === 0) return null;
    
    candidates.sort((a, b) => b.score - a.score);
    const winner = candidates[0];
    
    return {
      player: winner.player,
      team: winner.team,
      year: year,
      stats: winner.seasonStats
    };
  }

  /**
   * Calculate Defensive Rookie of Year
   * @param {Object} league - League object
   * @param {number} year - Season year
   * @returns {Object|null} DROTY winner
   */
  function calculateDROTY(league, year) {
    if (!league || !league.teams) return null;

    const candidates = [];
    
    league.teams.forEach(team => {
      if (!team.roster || !Array.isArray(team.roster)) return;
      
      team.roster.forEach(player => {
        // Must be defensive rookie
        if (!['DL', 'LB', 'CB', 'S'].includes(player.pos)) return;
        
        // Check if rookie
        const isRookie = (player.legacy?.teamHistory?.length || 0) <= 1 && 
                         (player.age || 0) <= 24;
        if (!isRookie) return;
        
        if (!player.stats || !player.stats.season) return;
        const seasonStats = player.stats.season;
        
        if ((seasonStats.gamesPlayed || 0) < 8) return;
        
        const tackles = seasonStats.tackles || 0;
        const sacks = seasonStats.sacks || 0;
        const interceptions = seasonStats.interceptions || 0;
        
        let drotyScore = (tackles * 2) + (sacks * 15) + (interceptions * 20);
        
        // Threshold: Must have at least 50 tackles or 5 sacks or 3 INTs
        if (tackles < 50 && sacks < 5 && interceptions < 3) return;
        
        candidates.push({
          player: player,
          team: team,
          score: drotyScore,
          seasonStats: seasonStats
        });
      });
    });
    
    if (candidates.length === 0) return null;
    
    candidates.sort((a, b) => b.score - a.score);
    const winner = candidates[0];
    
    return {
      player: winner.player,
      team: winner.team,
      year: year,
      stats: winner.seasonStats
    };
  }

  /**
   * Calculate Comeback Player of Year
   * Player who had significant improvement from previous season
   * @param {Object} league - League object
   * @param {number} year - Season year
   * @returns {Object|null} Comeback Player winner
   */
  function calculateComebackPlayer(league, year) {
    if (!league || !league.teams) return null;

    const candidates = [];
    
    league.teams.forEach(team => {
      if (!team.roster || !Array.isArray(team.roster)) return;
      
      team.roster.forEach(player => {
        if (!player.stats || !player.stats.season) return;
        const seasonStats = player.stats.season;
        
        if ((seasonStats.gamesPlayed || 0) < 10) return;
        
        // Check previous season performance
        const teamHistory = player.legacy?.teamHistory || [];
        if (teamHistory.length < 2) return; // Need at least 2 seasons
        
        const prevSeason = teamHistory[teamHistory.length - 2];
        const prevStats = prevSeason.stats || {};
        
        let improvementScore = 0;
        
        if (player.pos === 'QB') {
          const prevYd = prevStats.passYd || 0;
          const currYd = seasonStats.passYd || 0;
          const prevTD = prevStats.passTD || 0;
          const currTD = seasonStats.passTD || 0;
          
          improvementScore = ((currYd - prevYd) / 100) + ((currTD - prevTD) * 20);
          
          // Must show significant improvement
          if (currYd < prevYd + 1000 && currTD < prevTD + 10) return;
        } else if (player.pos === 'RB') {
          const prevYd = prevStats.rushYd || 0;
          const currYd = seasonStats.rushYd || 0;
          improvementScore = (currYd - prevYd) / 50;
          
          if (currYd < prevYd + 500) return;
        } else if (player.pos === 'WR' || player.pos === 'TE') {
          const prevYd = prevStats.recYd || 0;
          const currYd = seasonStats.recYd || 0;
          improvementScore = (currYd - prevYd) / 80;
          
          if (currYd < prevYd + 400) return;
        } else {
          // Defensive players
          const prevTackles = prevStats.tackles || 0;
          const currTackles = seasonStats.tackles || 0;
          const prevSacks = prevStats.sacks || 0;
          const currSacks = seasonStats.sacks || 0;
          
          improvementScore = ((currTackles - prevTackles) * 2) + ((currSacks - prevSacks) * 15);
          
          if (currTackles < prevTackles + 30 && currSacks < prevSacks + 5) return;
        }
        
        candidates.push({
          player: player,
          team: team,
          score: improvementScore,
          seasonStats: seasonStats
        });
      });
    });
    
    if (candidates.length === 0) return null;
    
    candidates.sort((a, b) => b.score - a.score);
    const winner = candidates[0];
    
    return {
      player: winner.player,
      team: winner.team,
      year: year,
      stats: winner.seasonStats
    };
  }

  /**
   * Calculate All-Pro teams (AFC and NFC)
   * Multiple players per position
   * @param {Object} league - League object
   * @param {number} year - Season year
   * @returns {Object} All-Pro teams by conference
   */
  function calculateAllPro(league, year) {
    if (!league || !league.teams) return { afc: {}, nfc: {} };

    const allPro = {
      afc: {
        QB: [],
        RB: [],
        WR: [],
        TE: [],
        OL: [],
        DL: [],
        LB: [],
        CB: [],
        S: [],
        K: [],
        P: []
      },
      nfc: {
        QB: [],
        RB: [],
        WR: [],
        TE: [],
        OL: [],
        DL: [],
        LB: [],
        CB: [],
        S: [],
        K: [],
        P: []
      }
    };

    // All-Pro team sizes per position (Per Conference)
    // User requested totals: 4 QBs, 8 RBs, 10 WRs, 5 TEs, 10 OL, 10 DL, 10 LB, 10 CB, 10 S, 2 K, 2 P
    // We split these by 2 for AFC/NFC.
    const allProSizes = {
      QB: 2,
      RB: 4,
      WR: 5,
      TE: 3, // 5 total requested, so we do 3 per conf (6 total) to cover it
      OL: 5,
      DL: 5,
      LB: 5,
      CB: 5,
      S: 5,
      K: 1,
      P: 1
    };

    // Get players by conference and position
    const byConference = { 0: [], 1: [] }; // 0 = AFC, 1 = NFC
    
    league.teams.forEach(team => {
      if (!team.roster || !Array.isArray(team.roster)) return;
      const conf = team.conf || 0;
      
      team.roster.forEach(player => {
        if (!player.stats || !player.stats.season) return;
        const seasonStats = player.stats.season;
        
        if ((seasonStats.gamesPlayed || 0) < 10) return;
        
        byConference[conf].push({
          player: player,
          team: team,
          seasonStats: seasonStats
        });
      });
    });

    // Calculate All-Pro for each conference
    [0, 1].forEach(conf => {
      const confName = conf === 0 ? 'afc' : 'nfc';
      const players = byConference[conf];
      
      Object.keys(allProSizes).forEach(pos => {
        const size = allProSizes[pos];
        const candidates = players.filter(p => p.player.pos === pos);
        
        if (candidates.length === 0) return;
        
        // Score each candidate
        candidates.forEach(candidate => {
          const stats = candidate.seasonStats;
          let score = 0;
          
          if (pos === 'QB') {
            score = ((stats.passYd || 0) / 100) + ((stats.passTD || 0) * 20) - ((stats.interceptions || 0) * 10);
          } else if (pos === 'RB') {
            score = ((stats.rushYd || 0) / 50) + ((stats.rushTD || 0) * 15) + ((stats.recYd || 0) / 100);
          } else if (pos === 'WR' || pos === 'TE') {
            score = ((stats.recYd || 0) / 80) + ((stats.recTD || 0) * 12) + ((stats.receptions || 0) / 5);
          } else if (pos === 'OL') {
            score = (stats.protectionGrade || 0) + ((stats.sacksAllowed || 0) * -5);
          } else if (pos === 'DL') {
            score = ((stats.sacks || 0) * 20) + ((stats.tackles || 0) * 1.5) + ((stats.tacklesForLoss || 0) * 5);
          } else if (pos === 'LB') {
            score = ((stats.tackles || 0) * 2) + ((stats.sacks || 0) * 15) + ((stats.interceptions || 0) * 15);
          } else if (pos === 'CB' || pos === 'S') {
            score = ((stats.interceptions || 0) * 25) + ((stats.passesDefended || 0) * 3) + ((stats.tackles || 0) * 1.5);
          } else if (pos === 'K') {
            score = ((stats.fgMade || 0) * 10) + ((stats.successPct || 0) * 2) + ((stats.longestFG || 0) / 2);
          } else if (pos === 'P') {
            score = ((stats.avgPuntYards || 0) * 2) + ((stats.punts || 0) * 0.5);
          }
          
          candidate.score = score;
        });
        
        // Sort and take top players
        candidates.sort((a, b) => b.score - a.score);
        allPro[confName][pos] = candidates.slice(0, size).map(c => ({
          player: c.player,
          team: c.team,
          stats: c.seasonStats
        }));
      });
    });

    return allPro;
  }

  /**
   * Calculate all awards for a season
   * @param {Object} league - League object
   * @param {number} year - Season year
   * @returns {Object} All awards
   */
  function calculateAllAwards(league, year) {
    console.log(`Calculating awards for ${year} season...`);
    
    const mvp = calculateMVP(league, year);
    const opoy = calculateOPOY(league, year, mvp);
    const dpoy = calculateDPOY(league, year);
    const oroty = calculateOROTY(league, year);
    const droty = calculateDROTY(league, year);
    const comeback = calculateComebackPlayer(league, year);
    const allPro = calculateAllPro(league, year);
    
    // Award the winners
    if (mvp && mvp.player) {
      awardPlayer(mvp.player, mvp.team, 'MVP', year, mvp.stats);
      // Record MVP in history
      if (window.recordMVP) {
        window.recordMVP(league, year, mvp.player, mvp.team, mvp.stats);
      }
    }
    if (opoy && opoy.player) {
      awardPlayer(opoy.player, opoy.team, 'OPOY', year, opoy.stats);
    }
    if (dpoy && dpoy.player) {
      awardPlayer(dpoy.player, dpoy.team, 'DPOY', year, dpoy.stats);
    }
    if (oroty && oroty.player) {
      awardPlayer(oroty.player, oroty.team, 'OROTY', year, oroty.stats);
    }
    if (droty && droty.player) {
      awardPlayer(droty.player, droty.team, 'DROTY', year, droty.stats);
    }
    if (comeback && comeback.player) {
      awardPlayer(comeback.player, comeback.team, 'Comeback Player', year, comeback.stats);
    }
    
    // Award All-Pro
    ['afc', 'nfc'].forEach(conf => {
      Object.keys(allPro[conf]).forEach(pos => {
        allPro[conf][pos].forEach(selection => {
          awardPlayer(selection.player, selection.team, `All-Pro ${conf.toUpperCase()}`, year, selection.stats);
        });
      });
    });
    
    return {
      mvp: mvp,
      opoy: opoy,
      dpoy: dpoy,
      oroty: oroty,
      droty: droty,
      comeback: comeback,
      allPro: allPro
    };
  }

  /**
   * Award a player
   * @param {Object} player - Player object
   * @param {Object} team - Team object
   * @param {string} awardName - Award name
   * @param {number} year - Season year
   * @param {Object} stats - Season stats
   */
  function awardPlayer(player, team, awardName, year, stats) {
    if (!player || !team) return;
    
    // Initialize legacy if needed
    if (window.initializePlayerLegacy) {
      window.initializePlayerLegacy(player);
    }
    
    const awards = player.legacy.awards;
    
    // Update award counts
    if (awardName === 'MVP') {
      awards.playerOfYear = (awards.playerOfYear || 0) + 1;
    } else if (awardName.includes('All-Pro')) {
      awards.allPro = (awards.allPro || 0) + 1;
    } else if (awardName === 'OROTY' || awardName === 'DROTY') {
      awards.rookie = (awards.rookie || 0) + 1;
    }
    
    // Add to awards array
    if (!player.awards) player.awards = [];
    player.awards.push({
      year: year,
      award: awardName,
      team: team.abbr,
      teamName: team.name,
      details: `${awardName} - ${year}`
    });
    
    // Record in history
    if (window.recordAward) {
      window.recordAward(window.state?.league, year, awardName, player, team);
    }
  }

  // Export functions
  window.calculateAllAwards = calculateAllAwards;
  window.calculateMVP = calculateMVP;
  window.calculateOPOY = calculateOPOY;
  window.calculateDPOY = calculateDPOY;
  window.calculateOROTY = calculateOROTY;
  window.calculateDROTY = calculateDROTY;
  window.calculateComebackPlayer = calculateComebackPlayer;
  window.calculateAllPro = calculateAllPro;

  console.log('✅ Comprehensive Award System loaded');

})();
