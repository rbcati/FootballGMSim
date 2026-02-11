// retirement-system.js - Realistic Player Retirement System
// Better than competitors - Realistic retirement logic with announcements and career summaries

(function() {
  'use strict';

  /**
   * Processes retirements at the end of the season
   * @param {Object} league - League object
   * @param {number} year - Current year
   */
  window.processRetirements = function(league, year) {
    if (!league || !league.teams) {
      console.error('Invalid league for retirement processing');
      return { retired: [], announcements: [] };
    }

    const C = window.Constants;
    const U = window.Utils;
    const retiredPlayers = [];
    const announcements = [];

    league.teams.forEach(team => {
      if (!team.roster) return;

      team.roster.forEach(player => {
        if (!player || player.retired) return;

        const shouldRetire = checkRetirement(player, league, year, C, U);
        
        if (shouldRetire) {
          retirePlayer(player, team, year);
          retiredPlayers.push({ player, team: team.name, year });
          
          // Create retirement announcement
          const announcement = createRetirementAnnouncement(player, team, year);
          announcements.push(announcement);
        }
      });
    });

    // Remove retired players from rosters
    league.teams.forEach(team => {
      if (team.roster) {
        team.roster = team.roster.filter(p => !p.retired);
      }
    });

    // Log announcements
    if (announcements.length > 0) {
      console.log(`\n🏈 RETIREMENT ANNOUNCEMENTS (Year ${year}):`);
      announcements.forEach(ann => {
        console.log(ann);
        if (league.news && Array.isArray(league.news)) {
          league.news.push(ann);
        }
      });
    }

    return { retired: retiredPlayers, announcements };
  };

  /**
   * Checks if a player should retire
   * @param {Object} player - Player object
   * @param {Object} league - League object
   * @param {number} year - Current year
   * @param {Object} C - Constants
   * @param {Object} U - Utils
   * @returns {boolean} Whether player should retire
   */
  function checkRetirement(player, league, year, C, U) {
    const age = player.age || 21;
    const ovr = player.ovr || 50;
    const forcedRetirementAge = C.HALL_OF_FAME?.FORCED_RETIREMENT_AGE || 38;
    const retirementAgeStart = C.HALL_OF_FAME?.RETIREMENT_AGE_START || 33;
    const baseRetirementChance = C.HALL_OF_FAME?.RETIREMENT_CHANCE_PER_YEAR || 0.20;

    // Force retirement at max age
    if (age >= forcedRetirementAge) {
      return true;
    }

    // No retirement before retirement age start
    if (age < retirementAgeStart) {
      return false;
    }

    // Calculate retirement probability
    let retirementChance = baseRetirementChance;

    // Age factor (increases with age)
    const ageFactor = (age - retirementAgeStart) / (forcedRetirementAge - retirementAgeStart);
    retirementChance += ageFactor * 0.3; // Up to 50% at max age

    // OVR factor (lower OVR = more likely to retire)
    if (ovr < 70) {
      retirementChance += 0.15;
    } else if (ovr < 80) {
      retirementChance += 0.05;
    } else if (ovr >= 90) {
      retirementChance -= 0.10; // Elite players less likely to retire early
    }

    // Injury factor (more injuries = more likely to retire)
    if (player.injuryHistory && Array.isArray(player.injuryHistory)) {
      const recentInjuries = player.injuryHistory.filter(i => 
        i.year >= year - 2 && i.severity === 'major'
      ).length;
      retirementChance += recentInjuries * 0.10;
    }

    // Contract factor (expiring contract = more likely)
    if (player.years === 0 || player.years === 1) {
      retirementChance += 0.10;
    }

    // Career achievements (Hall of Fame players less likely to retire early)
    if (player.legacy?.hallOfFame?.inducted) {
      retirementChance -= 0.20;
    }

    // Clamp between 0 and 1
    retirementChance = Math.max(0, Math.min(1, retirementChance));

    // Roll for retirement
    return U && U.rand ? (U.rand(1, 100) / 100) <= retirementChance : (window.Utils?.random || Math.random)() <= retirementChance;
  }

  /**
   * Retires a player
   * @param {Object} player - Player to retire
   * @param {Object} team - Player's team
   * @param {number} year - Retirement year
   */
  function retirePlayer(player, team, year) {
    player.retired = true;
    player.retirementYear = year;
    player.retirementAge = player.age;
    player.retirementTeam = team.name;
    player.retirementTeamAbbr = team.abbr;

    // Calculate final career stats
    if (player.stats && player.stats.career) {
      player.careerStats = { ...player.stats.career };
    }

    // Mark contract as expired
    player.years = 0;
    player.yearsTotal = 0;
  }

  /**
   * Creates retirement announcement
   * @param {Object} player - Retired player
   * @param {Object} team - Player's team
   * @param {number} year - Retirement year
   * @returns {string} Announcement text
   */
  function createRetirementAnnouncement(player, team, year) {
    const stats = player.stats?.career || {};
    const legacy = player.legacy || {};
    
    let announcement = `🏈 ${player.name} (${player.pos}) has announced his retirement from the ${team.name} at age ${player.age}.`;

    // Add career highlights
    const highlights = [];
    
    if (stats.passYd && stats.passYd > 0) {
      highlights.push(`${stats.passYd.toLocaleString()} passing yards`);
    }
    if (stats.rushYd && stats.rushYd > 0) {
      highlights.push(`${stats.rushYd.toLocaleString()} rushing yards`);
    }
    if (stats.receptions && stats.receptions > 0) {
      highlights.push(`${stats.receptions.toLocaleString()} receptions`);
    }
    if (stats.sacks && stats.sacks > 0) {
      highlights.push(`${stats.sacks} sacks`);
    }
    if (stats.defensiveInterceptions && stats.defensiveInterceptions > 0) {
      highlights.push(`${stats.defensiveInterceptions} interceptions`);
    }

    if (highlights.length > 0) {
      announcement += ` Career: ${highlights.slice(0, 3).join(', ')}.`;
    }

    // Add awards
    if (player.awards && player.awards.length > 0) {
      const awardCounts = {};
      player.awards.forEach(award => {
        awardCounts[award.award] = (awardCounts[award.award] || 0) + 1;
      });
      const awardList = Object.entries(awardCounts)
        .map(([award, count]) => count > 1 ? `${award} (${count}x)` : award)
        .slice(0, 3);
      if (awardList.length > 0) {
        announcement += ` Awards: ${awardList.join(', ')}.`;
      }
    }

    // Add Super Bowl wins
    if (legacy.superBowls && legacy.superBowls.length > 0) {
      announcement += ` ${legacy.superBowls.length} Super Bowl${legacy.superBowls.length > 1 ? 's' : ''} won.`;
    }

    return announcement;
  }

  /**
   * Gets all retired players
   * @param {Object} league - League object
   * @returns {Array} Array of retired players
   */
  window.getRetiredPlayers = function(league) {
    if (!league || !league.teams) return [];

    const retired = [];

    // Check league-level retired players (primary storage)
    if (league.retiredPlayers && Array.isArray(league.retiredPlayers)) {
        retired.push(...league.retiredPlayers);
    }

    league.teams.forEach(team => {
      // Check if team has a retired players list
      if (team.retiredPlayers && Array.isArray(team.retiredPlayers)) {
        retired.push(...team.retiredPlayers);
      }
    });

    // Also check free agents for retired players
    if (window.state?.freeAgents) {
      window.state.freeAgents.forEach(player => {
        if (player.retired) {
          retired.push(player);
        }
      });
    }

    return retired;
  };

  console.log('✅ Retirement System loaded');

})();
