// enhanced-team-statistics.js - Comprehensive Team History & Analytics System
'use strict';

/**
 * Configuration constants
 */
const TEAM_CONSTANTS = {
  NFL_SEASON_LENGTH: 17,
  PLAYOFF_TEAMS: 14,
  CONFERENCE_COUNT: 2,
  DIVISION_COUNT: 8,
  SALARY_CAP: 255000000, // 2025 estimated
  MIN_STADIUM_CAPACITY: 45000,
  MAX_STADIUM_CAPACITY: 90000,
  FOUNDING_YEAR_RANGE: { min: 1920, max: 2024 }
};

/**
 * Utility functions for safe operations
 */
const SafeUtils = {
  /**
   * Safely get nested object property
   */
  safeGet: (obj, path, defaultValue = null) => {
    try {
      return path.split('.').reduce((current, key) => current?.[key], obj) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  },

  /**
   * Safely execute function with error handling
   */
  safeExecute: (fn, defaultValue = null, ...args) => {
    try {
      return fn(...args);
    } catch (error) {
      console.error('Safe execution error:', error);
      return defaultValue;
    }
  },

  /**
   * Validate numeric input
   */
  validateNumber: (value, min = -Infinity, max = Infinity) => {
    const num = Number(value);
    return !isNaN(num) && num >= min && num <= max ? num : null;
  },

  /**
   * Deep clone object
   */
  deepClone: (obj) => {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return null;
    }
  }
};

/**
 * Enhanced team statistics initialization with comprehensive tracking
 * @param {Object} team - Team object
 * @returns {Object} Team with initialized statistics
 */
function initializeEnhancedTeamStatistics(team) {
  if (!team) {
    console.error('Team object is required for initialization');
    return null;
  }
  
  const U = window.Utils;
  const currentYear = new Date().getFullYear();
  
  if (!team.franchiseHistory) {
    team.franchiseHistory = {
      // Basic franchise info
      founded: generateFoundingYear(team),
      totalSeasons: 0,
      establishedYear: currentYear,
      
      // Regular season records
      regularSeason: {
        wins: 0,
        losses: 0,
        ties: 0,
        winPercentage: 0.0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDifferential: 0,
        homeRecord: { wins: 0, losses: 0, ties: 0 },
        awayRecord: { wins: 0, losses: 0, ties: 0 },
        divisionRecord: { wins: 0, losses: 0, ties: 0 },
        conferenceRecord: { wins: 0, losses: 0, ties: 0 }
      },
      
      // Playoff records
      playoffs: {
        appearances: 0,
        wins: 0,
        losses: 0,
        winPercentage: 0.0,
        wildCardWins: 0,
        divisionalWins: 0,
        conferenceChampionshipWins: 0,
        superBowlWins: 0,
        homePlayoffRecord: { wins: 0, losses: 0 },
        roadPlayoffRecord: { wins: 0, losses: 0 }
      },
      
      // Championships and achievements
      championships: {
        superBowls: 0,
        superBowlAppearances: 0,
        superBowlHistory: [], // Array of championship details
        conferenceChampionships: 0,
        divisionTitles: 0,
        wildCardBerths: 0
      },
      
      // Advanced analytics
      analytics: {
        strengthOfSchedule: [],
        pythagoreanWins: 0,
        expectedWins: 0,
        clutchPerformance: 0, // Performance in close games
        primtimeRecord: { wins: 0, losses: 0, ties: 0 },
        weatherGameRecord: { wins: 0, losses: 0, ties: 0 },
        overtime: { wins: 0, losses: 0, ties: 0 },
        shutouts: { given: 0, received: 0 }
      },
      
      // Season-by-season history with enhanced data
      seasonHistory: [],
      
      // Draft history and analysis
      draftHistory: {
        totalPicks: 0,
        firstRoundPicks: [],
        probowl_players: 0,
        hall_of_famers: 0,
        busts: 0, // Highly drafted players who underperformed
        steals: 0, // Late round gems
        tradedPicks: { given: 0, received: 0 }
      },
      
      // Player development and personnel
      personnel: {
        retiredNumbers: [],
        hallOfFamers: [],
        franchise_players: [], // Players who spent majority of career with team
        coaching_tree: [], // Coaches who came from this organization
        front_office_executives: []
      },
      
      // Financial and business metrics
      business: {
        estimatedValue: U ? U.rand(2000000000, 8000000000) : 4000000000,
        revenue: U ? U.rand(300000000, 700000000) : 500000000,
        payroll_efficiency: 0, // Success per dollar spent
        salary_cap_management: {
          over_cap_years: 0,
          under_cap_years: 0,
          average_cap_space: 0
        }
      },
      
      // Rivalries and relationships
      rivalries: {
        division_rivals: [],
        historic_rivals: [],
        rivalry_records: {}
      },
      
      // Stadium and facilities
      facilities: {
        stadium: {
          name: generateStadiumName(team),
          capacity: generateStadiumCapacity(),
          opened: U ? U.rand(1950, currentYear) : 1980,
          surface: U ? U.choice(['Grass', 'Artificial Turf', 'Hybrid']) : 'Grass',
          climate: U ? U.choice(['Outdoor', 'Dome', 'Retractable']) : 'Outdoor',
          homeFieldAdvantage: U ? U.rand(0.45, 0.75) : 0.6
        },
        training_facility: {
          name: `${team.name} Training Center`,
          opened: U ? U.rand(1990, currentYear) : 2000,
          rating: U ? U.rand(70, 95) : 85
        }
      },
      
      // Performance trends and streaks
      streaks: {
        currentWinStreak: 0,
        currentLossStreak: 0,
        longestWinStreak: { games: 0, startYear: 0, endYear: 0, description: '' },
        longestLossStreak: { games: 0, startYear: 0, endYear: 0, description: '' },
        playoffDrought: 0,
        longestPlayoffDrought: 0,
        winningSeasons: 0,
        losingSeasons: 0,
        consecutiveWinningSeasons: 0,
        consecutiveLosingSeasons: 0
      },
      
      // Notable achievements and milestones
      achievements: [],
      milestones: [],
      
      // Best/worst seasons with more detail
      bestSeason: initializeSeasonRecord('best'),
      worstSeason: initializeSeasonRecord('worst'),
      
      // Coaching history
      coachingHistory: {
        total_coaches: 0,
        average_tenure: 0,
        most_successful_coach: null,
        current_coaching_tree_size: 0,
        coaching_philosophy_evolution: []
      },
      
      // Injury and health statistics
      healthMetrics: {
        totalInjuries: 0,
        gamesLostToInjury: 0,
        injury_prone_positions: {},
        medical_staff_rating: U ? U.rand(70, 95) : 85
      },
      
      // Social and community impact
      community: {
        charity_work_rating: U ? U.rand(60, 95) : 80,
        community_programs: U ? U.rand(5, 25) : 15,
        fan_engagement_score: U ? U.rand(60, 95) : 80,
        social_media_following: U ? U.rand(500000, 5000000) : 1500000
      }
    };
  }
  
  // Initialize enhanced team culture
  if (!team.culture) {
    team.culture = initializeEnhancedTeamCulture(team);
  }
  
  // Initialize coaching preferences with more detail
  if (!team.coachingPreferences) {
    team.coachingPreferences = generateAdvancedCoachingPreferences(team);
  }
  
  return team;
}

/**
 * Initialize season record template
 * @param {string} type - 'best' or 'worst'
 * @returns {Object} Season record object
 */
function initializeSeasonRecord(type) {
  return {
    year: 0,
    wins: type === 'best' ? 0 : 17,
    losses: type === 'best' ? 17 : 0,
    ties: 0,
    winPercentage: type === 'best' ? 0.0 : 1.0,
    pointsFor: 0,
    pointsAgainst: 0,
    note: '',
    achievements: [],
    key_players: [],
    head_coach: '',
    playoff_result: '',
    season_context: ''
  };
}

/**
 * Enhanced team culture initialization with deeper organizational characteristics
 * @param {Object} team - Team object
 * @returns {Object} Enhanced team culture object
 */
function initializeEnhancedTeamCulture(team) {
  const U = window.Utils;
  
  return {
    // Core organizational identity
    identity: {
      primary_philosophy: U ? U.choice([
        'Championship or Bust', 'Build Through Draft', 'Win Now', 
        'Player Development', 'Analytics-Driven', 'Traditional'
      ]) : 'Player Development',
      
      offensive_identity: U ? U.choice([
        'Power Running', 'Air Raid', 'West Coast', 'Spread', 
        'Pro Style', 'RPO Heavy', 'Vertical Passing'
      ]) : 'Pro Style',
      
      defensive_identity: U ? U.choice([
        '3-4', '4-3', 'Hybrid', 'Multiple', 'Nickel Base', 
        'Aggressive', 'Bend but Don\'t Break'
      ]) : '4-3',
      
      special_teams_emphasis: U ? U.rand(60, 95) : 80
    },
    
    // Organizational values with more depth
    values: {
      player_development: U ? U.rand(50, 95) : 75,
      loyalty: U ? U.rand(50, 95) : 75,
      innovation: U ? U.rand(50, 95) : 75,
      tradition: U ? U.rand(50, 95) : 75,
      community: U ? U.rand(50, 95) : 75,
      accountability: U ? U.rand(60, 95) : 80,
      competitiveness: U ? U.rand(70, 95) : 85,
      professionalism: U ? U.rand(60, 95) : 80,
      family_atmosphere: U ? U.rand(40, 90) : 70,
      media_savvy: U ? U.rand(40, 90) : 65
    },
    
    // Decision making approach
    decisionMaking: {
      front_office_structure: U ? U.choice([
        'GM Driven', 'Coach Driven', 'Owner Driven', 
        'Committee Approach', 'Analytics Department'
      ]) : 'GM Driven',
      
      draft_strategy: U ? U.choice([
        'Best Available', 'Need Based', 'Character First',
        'Athletic Ability', 'System Fit', 'High Floor'
      ]) : 'Best Available',
      
      free_agency_approach: U ? U.choice([
        'Big Splash', 'Value Signings', 'Avoid Free Agency',
        'Fill Holes', 'Youth Movement'
      ]) : 'Value Signings',
      
      risk_tolerance: U ? U.rand(30, 80) : 55
    },
    
    // Financial philosophy
    financialApproach: {
      salary_cap_strategy: U ? U.choice([
        'Max Spend', 'Conservative', 'Strategic',
        'All In Windows', 'Steady Investment'
      ]) : 'Strategic',
      
      contract_structure: U ? U.choice([
        'Front Loaded', 'Back Loaded', 'Balanced', 
        'Incentive Heavy', 'Guaranteed Money'
      ]) : 'Balanced',
      
      facility_investment: U ? U.choice([
        'Cutting Edge', 'Modern', 'Adequate', 'Basic'
      ]) : 'Modern',
      
      scouting_budget: U ? U.choice([
        'Top Tier', 'Above Average', 'Average', 'Limited'
      ]) : 'Above Average'
    },
    
    // Communication and media
    communication: {
      media_transparency: U ? U.rand(30, 90) : 60,
      fan_accessibility: U ? U.rand(40, 90) : 70,
      internal_communication: U ? U.rand(60, 95) : 80,
      crisis_management: U ? U.rand(50, 90) : 70
    },
    
    // Performance expectations
    expectations: {
      playoff_expectation: U ? U.choice([
        'Every Year', 'Most Years', 'Competitive', 'Building'
      ]) : 'Competitive',
      
      championship_window: U ? U.choice([
        'Now', '2-3 Years', '3-5 Years', 'Building'
      ]) : '3-5 Years',
      
      patience_level: U ? U.rand(30, 80) : 55,
      rebuild_tolerance: U ? U.rand(20, 70) : 45
    },
    
    // Fan base characteristics with more detail
    fanBase: {
      size: U ? U.choice(['Massive', 'Large', 'Medium', 'Small']) : 'Medium',
      loyalty: U ? U.rand(60, 95) : 80,
      expectations: U ? U.choice([
        'Championship', 'Playoffs', 'Competitive', 'Patient', 'Realistic'
      ]) : 'Competitive',
      
      demographics: {
        local_support: U ? U.rand(60, 95) : 80,
        national_following: U ? U.rand(20, 80) : 50,
        generational_fans: U ? U.rand(50, 90) : 70,
        social_media_engagement: U ? U.rand(40, 90) : 65
      },
      
      traditions: generateEnhancedTeamTraditions(team),
      notable_fan_groups: generateFanGroups(team)
    }
  };
}

/**
 * Generate advanced coaching preferences
 * @param {Object} team - Team object
 * @returns {Object} Advanced coaching preferences
 */
function generateAdvancedCoachingPreferences(team) {
  const U = window.Utils;
  
  return {
    // Personality and leadership style
    leadership: {
      preferred_style: U ? U.choice([
        'Authoritarian', 'Democratic', 'Transformational', 
        'Servant Leader', 'Charismatic', 'Collaborative'
      ]) : 'Transformational',
      
      communication_style: U ? U.choice([
        'Direct', 'Diplomatic', 'Motivational', 'Analytical', 'Emotional'
      ]) : 'Direct',
      
      media_comfort: U ? U.rand(40, 90) : 65,
      player_relationships: U ? U.choice([
        'Close Personal', 'Professional', 'Authoritative', 'Mentoring'
      ]) : 'Professional'
    },
    
    // Strategic preferences
    strategy: {
      offensive_philosophy: U ? U.choice([
        'Conservative', 'Balanced', 'Aggressive', 'Innovative', 'Adaptive'
      ]) : 'Balanced',
      
      defensive_philosophy: U ? U.choice([
        'Attacking', 'Bend Don\'t Break', 'Multiple', 'Fundamental'
      ]) : 'Multiple',
      
      fourth_down_aggressiveness: U ? U.rand(30, 80) : 55,
      timeout_management: U ? U.rand(50, 95) : 75,
      challenge_frequency: U ? U.rand(40, 80) : 60
    },
    
    // Development approach
    development: {
      veteran_vs_youth: U ? U.rand(30, 70) : 50, // Lower = prefers youth
      player_development_focus: U ? U.rand(70, 95) : 85,
      rookie_integration: U ? U.choice([
        'Immediate Impact', 'Gradual Integration', 'Redshirt Year'
      ]) : 'Gradual Integration',
      
      position_flexibility: U ? U.rand(60, 90) : 75
    },
    
    // Staff preferences
    staff: {
      coordinator_autonomy: U ? U.rand(50, 90) : 70,
      staff_loyalty_importance: U ? U.rand(60, 95) : 80,
      hiring_from_tree: U ? U.rand(40, 80) : 60,
      diversity_emphasis: U ? U.rand(50, 90) : 70
    },
    
    // Contract and job security expectations
    contract: {
      preferred_length: U ? U.rand(4, 7) : 5,
      minimum_salary: U ? U.rand(3000000, 8000000) : 5000000,
      maximum_salary: U ? U.rand(8000000, 15000000) : 10000000,
      job_security_importance: U ? U.rand(60, 95) : 80,
      performance_bonuses: U ? U.choice(['High', 'Medium', 'Low']) : 'Medium'
    }
  };
}

/**
 * Generate enhanced team traditions
 * @param {Object} team - Team object
 * @returns {Array} Array of detailed team traditions
 */
function generateEnhancedTeamTraditions(team) {
  const traditionCategories = {
    'Game Day': [
      'Unique pre-game ritual', 'Special entrance music', 'Fan chants',
      'Touchdown celebrations', 'Victory formations', 'Post-game traditions'
    ],
    'Season': [
      'Training camp traditions', 'Rookie initiations', 'Awards ceremonies',
      'Ring of honor', 'Retired number ceremonies', 'Alumni events'
    ],
    'Community': [
      'Charity partnerships', 'Youth programs', 'Community service',
      'Local business partnerships', 'Educational initiatives'
    ],
    'Historic': [
      'Championship celebrations', 'Legendary rivalries', 'Famous games',
      'Coaching legacies', 'Player legends', 'Franchise milestones'
    ]
  };
  
  const U = window.Utils;
  const selectedTraditions = [];
  
  // Select 2-4 traditions from different categories
  const numTraditions = U ? U.rand(2, 4) : 3;
  const categories = Object.keys(traditionCategories);
  
  for (let i = 0; i < numTraditions; i++) {
    const category = U ? U.choice(categories) : categories[i % categories.length];
    const tradition = U ? U.choice(traditionCategories[category]) : traditionCategories[category][0];
    
    if (!selectedTraditions.some(t => t.tradition === tradition)) {
      selectedTraditions.push({
        category: category,
        tradition: tradition,
        established: U ? U.rand(team.franchiseHistory?.founded || 1970, new Date().getFullYear()) : 1980,
        significance: U ? U.choice(['High', 'Medium', 'Low']) : 'Medium'
      });
    }
  }
  
  return selectedTraditions;
}

/**
 * Generate fan groups and organizations
 * @param {Object} team - Team object
 * @returns {Array} Array of fan groups
 */
function generateFanGroups(team) {
  const groupTypes = [
    'Official Fan Club', 'Booster Club', 'Alumni Network', 
    'Season Ticket Holders', 'Corporate Sponsors', 'Youth Programs',
    'Military Support', 'International Fans', 'Fantasy League'
  ];
  
  const U = window.Utils;
  const numGroups = U ? U.rand(2, 5) : 3;
  const fanGroups = [];
  
  for (let i = 0; i < numGroups; i++) {
    const groupType = U ? U.choice(groupTypes) : groupTypes[i];
    if (!fanGroups.some(g => g.type === groupType)) {
      fanGroups.push({
        type: groupType,
        name: `${team.name} ${groupType}`,
        members: U ? U.rand(500, 15000) : 5000,
        activity_level: U ? U.choice(['High', 'Medium', 'Low']) : 'Medium'
      });
    }
  }
  
  return fanGroups;
}

/**
 * Advanced game statistics update with comprehensive tracking
 * @param {Object} team - Team object
 * @param {Object} gameResult - Detailed game result
 * @param {Object} gameContext - Additional game context
 */
function updateAdvancedGameStats(team, gameResult, gameContext = {}) {
  if (!team || !gameResult || !team.franchiseHistory) {
    console.error('Invalid parameters for game stats update');
    return;
  }
  
  const stats = team.franchiseHistory;
  const { isPlayoff = false, isHome = true, isDivision = false, 
          isConference = false, isPrimetime = false, weather = null } = gameContext;
  
  try {
    // Basic win/loss/tie tracking
    const result = determineGameResult(gameResult);
    
    if (isPlayoff) {
      updatePlayoffStats(stats, result, isHome);
    } else {
      updateRegularSeasonStats(stats, result, isHome, isDivision, isConference);
    }
    
    // Advanced situational statistics
    updateSituationalStats(stats, gameResult, gameContext);
    
    // Update scoring statistics
    updateScoringStats(stats, gameResult);
    
    // Update streak tracking
    updateStreakTracking(stats, result);
    
    // Update analytics
    updateGameAnalytics(stats, gameResult, gameContext);
    
  } catch (error) {
    console.error('Error updating advanced game stats:', error);
  }
}

/**
 * Determine game result from game data
 * @param {Object} gameResult - Game result object
 * @returns {string} 'win', 'loss', or 'tie'
 */
function determineGameResult(gameResult) {
  if (gameResult.win === true) return 'win';
  if (gameResult.tie === true) return 'tie';
  return 'loss';
}

/**
 * Update playoff-specific statistics
 * @param {Object} stats - Team franchise history stats
 * @param {string} result - Game result ('win', 'loss', 'tie')
 * @param {boolean} isHome - Is home game
 */
function updatePlayoffStats(stats, result, isHome) {
  const playoffs = stats.playoffs;
  
  if (result === 'win') {
    playoffs.wins++;
    if (isHome) playoffs.homePlayoffRecord.wins++;
    else playoffs.roadPlayoffRecord.wins++;
  } else if (result === 'loss') {
    playoffs.losses++;
    if (isHome) playoffs.homePlayoffRecord.losses++;
    else playoffs.roadPlayoffRecord.losses++;
  }
  
  // Update playoff win percentage
  const totalGames = playoffs.wins + playoffs.losses;
  if (totalGames > 0) {
    playoffs.winPercentage = playoffs.wins / totalGames;
  }
}

/**
 * Update regular season statistics with enhanced tracking
 * @param {Object} stats - Team franchise history stats
 * @param {string} result - Game result
 * @param {boolean} isHome - Is home game
 * @param {boolean} isDivision - Is division game
 * @param {boolean} isConference - Is conference game
 */
function updateRegularSeasonStats(stats, result, isHome, isDivision, isConference) {
  const rs = stats.regularSeason;
  
  // Update main record
  if (result === 'win') {
    rs.wins++;
    if (isHome) rs.homeRecord.wins++;
    else rs.awayRecord.wins++;
    if (isDivision) rs.divisionRecord.wins++;
    if (isConference) rs.conferenceRecord.wins++;
  } else if (result === 'tie') {
    rs.ties++;
    if (isHome) rs.homeRecord.ties++;
    else rs.awayRecord.ties++;
    if (isDivision) rs.divisionRecord.ties++;
    if (isConference) rs.conferenceRecord.ties++;
  } else {
    rs.losses++;
    if (isHome) rs.homeRecord.losses++;
    else rs.awayRecord.losses++;
    if (isDivision) rs.divisionRecord.losses++;
    if (isConference) rs.conferenceRecord.losses++;
  }
  
  // Update win percentage
  const totalGames = rs.wins + rs.losses + rs.ties;
  if (totalGames > 0) {
    rs.winPercentage = (rs.wins + (rs.ties * 0.5)) / totalGames;
  }
}

/**
 * Update situational and contextual statistics
 * @param {Object} stats - Team franchise history stats
 * @param {Object} gameResult - Game result data
 * @param {Object} gameContext - Game context information
 */
function updateSituationalStats(stats, gameResult, gameContext) {
  const analytics = stats.analytics;
  const { isPrimetime, weather, overtime, margin } = gameContext;
  
  // Primetime games
  if (isPrimetime) {
    const result = determineGameResult(gameResult);
    if (result === 'win') analytics.primtimeRecord.wins++;
    else if (result === 'tie') analytics.primtimeRecord.ties++;
    else analytics.primtimeRecord.losses++;
  }
  
  // Weather games (defined as significant weather impact)
  if (weather && weather.impact === 'significant') {
    const result = determineGameResult(gameResult);
    if (result === 'win') analytics.weatherGameRecord.wins++;
    else if (result === 'tie') analytics.weatherGameRecord.ties++;
    else analytics.weatherGameRecord.losses++;
  }
  
  // Overtime games
  if (overtime) {
    const result = determineGameResult(gameResult);
    if (result === 'win') analytics.overtime.wins++;
    else if (result === 'tie') analytics.overtime.ties++;
    else analytics.overtime.losses++;
  }
  
  // Clutch performance (games decided by 7 points or less)
  if (margin !== undefined && Math.abs(margin) <= 7) {
    const result = determineGameResult(gameResult);
    if (result === 'win') {
      analytics.clutchPerformance += 1;
    } else if (result === 'loss') {
      analytics.clutchPerformance -= 1;
    }
  }
  
  // Shutout tracking
  if (gameResult.pointsFor === 0) {
    analytics.shutouts.received++;
  }
  if (gameResult.pointsAgainst === 0) {
    analytics.shutouts.given++;
  }
}

/**
 * Update scoring statistics
 * @param {Object} stats - Team franchise history stats
 * @param {Object} gameResult - Game result with scoring data
 */
function updateScoringStats(stats, gameResult) {
  const rs = stats.regularSeason;
  
  if (SafeUtils.validateNumber(gameResult.pointsFor, 0)) {
    rs.pointsFor += gameResult.pointsFor;
  }
  
  if (SafeUtils.validateNumber(gameResult.pointsAgainst, 0)) {
    rs.pointsAgainst += gameResult.pointsAgainst;
  }
  
  rs.pointDifferential = rs.pointsFor - rs.pointsAgainst;
}

/**
 * Advanced season statistics update
 * @param {Object} team - Team object
 * @param {Object} seasonStats - Comprehensive season statistics
 * @param {number} year - Season year
 */
function updateAdvancedSeasonStats(team, seasonStats, year) {
  if (!team || !seasonStats || !team.franchiseHistory) {
    console.error('Invalid parameters for season stats update');
    return;
  }
  
  try {
    const stats = team.franchiseHistory;
    stats.totalSeasons++;
    
    // Create comprehensive season record
    const seasonRecord = createSeasonRecord(seasonStats, year);
    stats.seasonHistory.push(seasonRecord);
    
    // Update best/worst seasons
    updateBestWorstSeasons(stats, seasonRecord, seasonStats);
    
    // Update playoff tracking
    updatePlayoffTracking(stats, seasonStats);
    
    // Update winning/losing seasons count
    updateSeasonRecords(stats, seasonStats);
    
    // Add achievements and milestones
    processSeasonAchievements(team, seasonStats, year);
    
    // Update advanced analytics
    updateSeasonAnalytics(stats, seasonStats, year);
    
    // Update coaching history if applicable
    updateCoachingHistory(team, seasonStats, year);
    
  } catch (error) {
    console.error('Error updating advanced season stats:', error);
  }
}

/**
 * Create comprehensive season record
 * @param {Object} seasonStats - Season statistics
 * @param {number} year - Season year
 * @returns {Object} Season record
 */
function createSeasonRecord(seasonStats, year) {
  const winPct = calculateWinPercentage(
    seasonStats.wins || 0, 
    seasonStats.losses || 0, 
    seasonStats.ties || 0
  );
  
  return {
    year: year,
    wins: seasonStats.wins || 0,
    losses: seasonStats.losses || 0,
    ties: seasonStats.ties || 0,
    winPercentage: winPct,
    pointsFor: seasonStats.pointsFor || 0,
    pointsAgainst: seasonStats.pointsAgainst || 0,
    pointDifferential: (seasonStats.pointsFor || 0) - (seasonStats.pointsAgainst || 0),
    
    // Records by situation
    homeRecord: seasonStats.homeRecord || { wins: 0, losses: 0, ties: 0 },
    awayRecord: seasonStats.awayRecord || { wins: 0, losses: 0, ties: 0 },
    divisionRecord: seasonStats.divisionRecord || { wins: 0, losses: 0, ties: 0 },
    conferenceRecord: seasonStats.conferenceRecord || { wins: 0, losses: 0, ties: 0 },
    
    // Playoff information
    playoffAppearance: seasonStats.madePlayoffs || false,
    playoffSeed: seasonStats.playoffSeed || null,
    playoffWins: seasonStats.playoffWins || 0,
    playoffLosses: seasonStats.playoffLosses || 0,
    playoffResult: seasonStats.playoffResult || '',
    
    // Championships
    divisionChampion: seasonStats.divisionChampion || false,
    conferenceChampion: seasonStats.conferenceChampion || false,
    superBowlChampion: seasonStats.superBowlChampion || false,
    
    // Team information
    headCoach: seasonStats.headCoach || 'Unknown',
    keyPlayers: seasonStats.keyPlayers || [],
    draftPicks: seasonStats.draftPicks || [],
    
    // Advanced metrics
    strengthOfSchedule: seasonStats.strengthOfSchedule || 0.5,
    pythagoreanWins: calculatePythagoreanWins(seasonStats),
    injuries: seasonStats.majorInjuries || [],
    
    // Context and notes
    seasonNotes: seasonStats.notes || [],
    significance: determineSeasonSignificance(seasonStats),
    
    // Awards and recognition
    individualAwards: seasonStats.individualAwards || [],
    teamAwards: seasonStats.teamAwards || []
  };
}

/**
 * Calculate Pythagorean expected wins
 * @param {Object} seasonStats - Season statistics
 * @returns {number} Expected wins based on points scored/allowed
 */
function calculatePythagoreanWins(seasonStats) {
  const pointsFor = seasonStats.pointsFor || 0;
  const pointsAgainst = seasonStats.pointsAgainst || 0;
  
  if (pointsFor === 0 || pointsAgainst === 0) return 0;
  
  const exponent = 2.37; // NFL-specific exponent
  const expectedWinPct = Math.pow(pointsFor, exponent) / 
                        (Math.pow(pointsFor, exponent) + Math.pow(pointsAgainst, exponent));
  
  return Math.round(expectedWinPct * TEAM_CONSTANTS.NFL_SEASON_LENGTH * 100) / 100;
}

/**
 * Determine season significance level
 * @param {Object} seasonStats - Season statistics
 * @returns {string} Significance level
 */
function determineSeasonSignificance(seasonStats) {
  if (seasonStats.superBowlChampion) return 'Legendary';
  if (seasonStats.conferenceChampion) return 'Historic';
  if (seasonStats.wins >= 15 || seasonStats.wins === 0) return 'Memorable';
  if (seasonStats.madePlayoffs) return 'Successful';
  if (seasonStats.wins >= 9) return 'Solid';
  return 'Rebuilding';
}

/**
 * Calculate comprehensive coaching fit score
 * @param {Object} coach - Coach object with detailed attributes
 * @param {Object} team - Team object with culture and preferences
 * @returns {Object} Detailed fit analysis
 */
function calculateAdvancedCoachingFit(coach, team) {
  if (!coach || !team || !team.culture || !team.coachingPreferences) {
    return { score: 50, breakdown: {}, concerns: [] };
  }
  
  try {
    const culture = team.culture;
    const prefs = team.coachingPreferences;
    let fitScore = 50; // Base score
    const breakdown = {};
    const concerns = [];
    
    // Leadership style compatibility (25% weight)
    const leadershipFit = calculateLeadershipFit(coach, prefs.leadership);
    fitScore += leadershipFit * 0.25;
    breakdown.leadership = leadershipFit;
    
    // Strategic philosophy alignment (20% weight)
    const strategyFit = calculateStrategyFit(coach, prefs.strategy, culture.identity);
    fitScore += strategyFit * 0.20;
    breakdown.strategy = strategyFit;
    
    // Experience and track record (20% weight)
    const experienceFit = calculateExperienceFit(coach, culture.expectations);
    fitScore += experienceFit * 0.20;
    breakdown.experience = experienceFit;
    
    // Cultural values alignment (15% weight)
    const valuesFit = calculateValuesFit(coach, culture.values);
    fitScore += valuesFit * 0.15;
    breakdown.values = valuesFit;
    
    // Development approach (10% weight)
    const developmentFit = calculateDevelopmentFit(coach, prefs.development);
    fitScore += developmentFit * 0.10;
    breakdown.development = developmentFit;
    
    // Contract and expectations (10% weight)
    const contractFit = calculateContractFit(coach, prefs.contract);
    fitScore += contractFit * 0.10;
    breakdown.contract = contractFit;
    
    // Identify concerns
    if (leadershipFit < -10) concerns.push('Leadership style mismatch');
    if (strategyFit < -10) concerns.push('Strategic philosophy conflict');
    if (experienceFit < -15) concerns.push('Experience level concerns');
    if (contractFit < -10) concerns.push('Contract expectations mismatch');
    
    return {
      score: Math.max(0, Math.min(100, Math.round(fitScore))),
      breakdown: breakdown,
      concerns: concerns,
      strengths: identifyFitStrengths(breakdown),
      recommendation: getFitRecommendation(fitScore)
    };
    
  } catch (error) {
    console.error('Error calculating advanced coaching fit:', error);
    return { score: 50, breakdown: {}, concerns: ['Error in calculation'] };
  }
}

/**
 * Calculate leadership style fit
 * @param {Object} coach - Coach object
 * @param {Object} preferences - Leadership preferences
 * @returns {number} Fit adjustment (-25 to +25)
 */
function calculateLeadershipFit(coach, preferences) {
  let fit = 0;
  
  // Leadership style match
  if (coach.leadership_style === preferences.preferred_style) fit += 20;
  else if (isCompatibleLeadershipStyle(coach.leadership_style, preferences.preferred_style)) fit += 10;
  else fit -= 15;
  
  // Communication style
  if (coach.communication_style === preferences.communication_style) fit += 10;
  else if (isCompatibleCommunicationStyle(coach.communication_style, preferences.communication_style)) fit += 5;
  else fit -= 10;
  
  // Media comfort
  const mediaComfortDiff = Math.abs((coach.media_comfort || 50) - preferences.media_comfort);
  fit += (20 - mediaComfortDiff) * 0.5;
  
  return Math.max(-25, Math.min(25, fit));
}

/**
 * Check if leadership styles are compatible
 * @param {string} coachStyle - Coach's leadership style
 * @param {string} preferredStyle - Team's preferred style
 * @returns {boolean} Are styles compatible
 */
function isCompatibleLeadershipStyle(coachStyle, preferredStyle) {
  const compatibility = {
    'Authoritarian': ['Disciplinarian', 'Traditional'],
    'Democratic': ['Collaborative', 'Player-Friendly'],
    'Transformational': ['Motivational', 'Inspiring'],
    'Servant Leader': ['Player Development', 'Supportive'],
    'Charismatic': ['Motivational', 'Inspiring'],
    'Collaborative': ['Democratic', 'Team-Oriented']
  };
  
  return compatibility[coachStyle]?.includes(preferredStyle) || false;
}

/**
 * Check if communication styles are compatible
 * @param {string} coachStyle - Coach's communication style
 * @param {string} preferredStyle - Team's preferred style
 * @returns {boolean} Are styles compatible
 */
function isCompatibleCommunicationStyle(coachStyle, preferredStyle) {
  const compatibility = {
    'Direct': ['Honest', 'Straightforward'],
    'Diplomatic': ['Professional', 'Measured'],
    'Motivational': ['Inspirational', 'Positive'],
    'Analytical': ['Data-Driven', 'Logical'],
    'Emotional': ['Passionate', 'Personal']
  };
  
  return compatibility[coachStyle]?.includes(preferredStyle) || false;
}

/**
 * Calculate strategy fit
 * @param {Object} coach - Coach object
 * @param {Object} strategyPrefs - Strategy preferences
 * @param {Object} identity - Team identity
 * @returns {number} Fit adjustment (-20 to +20)
 */
function calculateStrategyFit(coach, strategyPrefs, identity) {
  let fit = 0;
  
  // Offensive philosophy match
  if (coach.offensive_philosophy === identity.offensive_identity) fit += 10;
  else if (isCompatibleOffense(coach.offensive_philosophy, identity.offensive_identity)) fit += 5;
  else fit -= 8;
  
  // Defensive philosophy match
  if (coach.defensive_philosophy === identity.defensive_identity) fit += 10;
  else if (isCompatibleDefense(coach.defensive_philosophy, identity.defensive_identity)) fit += 5;
  else fit -= 8;
  
  // Risk tolerance alignment
  const riskDiff = Math.abs((coach.risk_taking || 50) - strategyPrefs.riskTaking);
  fit += (30 - riskDiff) * 0.2;
  
  return Math.max(-20, Math.min(20, fit));
}

/**
 * Calculate comprehensive franchise legacy score with multiple factors
 * @param {Object} team - Team object
 * @returns {Object} Detailed legacy analysis
 */
function calculateComprehensiveFranchiseLegacy(team) {
  if (!team || !team.franchiseHistory) {
    return { score: 0, factors: {}, ranking: 'Expansion' };
  }
  
  const stats = team.franchiseHistory;
  const factors = {};
  let totalScore = 0;
  
  try {
    // Championship success (40% of total score)
    const championshipScore = calculateChampionshipLegacy(stats.championships);
    factors.championships = championshipScore;
    totalScore += championshipScore * 0.4;
    
    // Regular season success (25% of total score)
    const regularSeasonScore = calculateRegularSeasonLegacy(stats.regularSeason, stats.totalSeasons);
    factors.regularSeason = regularSeasonScore;
    totalScore += regularSeasonScore * 0.25;
    
    // Playoff performance (15% of total score)
    const playoffScore = calculatePlayoffLegacy(stats.playoffs);
    factors.playoffs = playoffScore;
    totalScore += playoffScore * 0.15;
    
    // Historical significance (10% of total score)
    const historicalScore = calculateHistoricalLegacy(stats);
    factors.historical = historicalScore;
    totalScore += historicalScore * 0.1;
    
    // Personnel legacy (5% of total score)
    const personnelScore = calculatePersonnelLegacy(stats.personnel);
    factors.personnel = personnelScore;
    totalScore += personnelScore * 0.05;
    
    // Innovation and influence (5% of total score)
    const innovationScore = calculateInnovationLegacy(stats);
    factors.innovation = innovationScore;
    totalScore += innovationScore * 0.05;
    
    return {
      score: Math.max(0, Math.min(100, Math.round(totalScore))),
      factors: factors,
      ranking: determineLegacyRanking(totalScore),
      strengths: identifyLegacyStrengths(factors),
      weaknesses: identifyLegacyWeaknesses(factors),
      era: determineFranchiseEra(stats)
    };
    
  } catch (error) {
    console.error('Error calculating franchise legacy:', error);
    return { score: 0, factors: {}, ranking: 'Unknown' };
  }
}

/**
 * Calculate championship legacy score
 * @param {Object} championships - Championship data
 * @returns {number} Championship legacy score (0-100)
 */
function calculateChampionshipLegacy(championships) {
  let score = 0;
  
  // Super Bowl wins (most important)
  score += championships.superBowls * 25;
  
  // Super Bowl appearances
  score += (championships.superBowlAppearances - championships.superBowls) * 8;
  
  // Conference championships
  score += championships.conferenceChampionships * 5;
  
  // Division titles
  score += championships.divisionTitles * 2;
  
  // Wild card berths
  score += championships.wildCardBerths * 1;
  
  // Dynasty bonus (multiple championships in short period)
  if (championships.superBowls >= 3) {
    score += 15; // Dynasty bonus
  }
  
  return Math.min(100, score);
}

/**
 * Advanced team ranking system with multiple criteria
 * @param {Array} teams - Array of team objects
 * @returns {Object} Comprehensive rankings
 */
function calculateAdvancedTeamRankings(teams) {
  if (!teams || teams.length === 0) {
    return { error: 'No teams provided for ranking' };
  }
  
  try {
    return {
      // Traditional rankings
      byWins: rankTeamsByWins(teams),
      byWinPercentage: rankTeamsByWinPercentage(teams),
      bySuperBowls: rankTeamsBySuperBowls(teams),
      
      // Advanced rankings
      byLegacyScore: rankTeamsByLegacy(teams),
      byPlayoffSuccess: rankTeamsByPlayoffSuccess(teams),
      byRecentSuccess: rankTeamsByRecentSuccess(teams, 10), // Last 10 years
      byConsistency: rankTeamsByConsistency(teams),
      
      // Era-specific rankings
      byModernEra: rankTeamsByEra(teams, 'modern'), // Post-2000
      byClassicEra: rankTeamsByEra(teams, 'classic'), // 1970-1999
      
      // Specialized rankings
      byHomeFieldAdvantage: rankTeamsByHomeField(teams),
      byDraftSuccess: rankTeamsByDraftSuccess(teams),
      byBusinessSuccess: rankTeamsByBusiness(teams),
      
      // Composite rankings
      overallRanking: calculateOverallRanking(teams),
      
      // Statistical analysis
      statistics: calculateRankingStatistics(teams)
    };
    
  } catch (error) {
    console.error('Error calculating advanced team rankings:', error);
    return { error: 'Failed to calculate rankings' };
  }
}

// Utility functions for rankings (sample implementations)

function rankTeamsByWins(teams) {
  return teams
    .map(team => ({
      team: team,
      wins: SafeUtils.safeGet(team, 'franchiseHistory.regularSeason.wins', 0)
    }))
    .sort((a, b) => b.wins - a.wins)
    .map((item, index) => ({
      rank: index + 1,
      team: item.team,
      value: item.wins
    }));
}

function rankTeamsByLegacy(teams) {
  return teams
    .map(team => ({
      team: team,
      legacy: calculateComprehensiveFranchiseLegacy(team).score
    }))
    .sort((a, b) => b.legacy - a.legacy)
    .map((item, index) => ({
      rank: index + 1,
      team: item.team,
      value: item.legacy
    }));
}

function calculateOverallRanking(teams) {
  // Weighted combination of multiple factors
  return teams
    .map(team => {
      const legacy = calculateComprehensiveFranchiseLegacy(team).score * 0.4;
      const winPct = (SafeUtils.safeGet(team, 'franchiseHistory.regularSeason.winPercentage', 0) * 100) * 0.3;
      const championships = SafeUtils.safeGet(team, 'franchiseHistory.championships.superBowls', 0) * 15 * 0.3;
      
      return {
        team: team,
        overall: legacy + winPct + championships
      };
    })
    .sort((a, b) => b.overall - a.overall)
    .map((item, index) => ({
      rank: index + 1,
      team: item.team,
      score: Math.round(item.overall * 100) / 100
    }));
}

// Export all functions to global scope
window.TEAM_CONSTANTS = TEAM_CONSTANTS;
window.SafeUtils = SafeUtils;
window.initializeEnhancedTeamStatistics = initializeEnhancedTeamStatistics;
window.initializeEnhancedTeamCulture = initializeEnhancedTeamCulture;
window.generateAdvancedCoachingPreferences = generateAdvancedCoachingPreferences;
window.updateAdvancedGameStats = updateAdvancedGameStats;
window.updateAdvancedSeasonStats = updateAdvancedSeasonStats;
window.calculateAdvancedCoachingFit = calculateAdvancedCoachingFit;
window.calculateComprehensiveFranchiseLegacy = calculateComprehensiveFranchiseLegacy;
window.calculateAdvancedTeamRankings = calculateAdvancedTeamRankings;

// Legacy function exports (for backward compatibility)
window.initializeTeamStatistics = initializeEnhancedTeamStatistics;
window.updateTeamGameStats = updateAdvancedGameStats;
window.updateTeamSeasonStats = updateAdvancedSeasonStats;
window.calculateCoachingFit = calculateAdvancedCoachingFit;
window.calculateFranchiseLegacy = calculateComprehensiveFranchiseLegacy;
window.calculateTeamRankings = calculateAdvancedTeamRankings;

console.log('Enhanced Team Statistics System loaded successfully');
