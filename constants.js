// constants.js - Cleaned, organized, and properly exported properties
'use strict';

  // --- I. GAME CONFIGURATION ---
  const GAME_CONFIG = {
    YEAR_START: 2025,
    SAVE_KEY: 'nflGM4.league',
    ROUTES: ['hub','roster','contracts','cap','schedule','standings','trade','freeagency','draft','playoffs','settings', 'hallOfFame', 'scouting']
  };

  // --- II. SALARY & CONTRACTS ---
  const SALARY_CAP = {
    BASE: 220, // Base Salary Cap in Millions
    MAX_ROLLOVER: 10,
    ROOKIE_DISCOUNT: 0.9,
    GUARANTEED_PCT_DEFAULT: 0.5,
    SIGNING_BONUS_MIN: 0.25,
    SIGNING_BONUS_MAX: 0.6
  };

  // --- III. PLAYER & ROSTER DEFINITION ---
  const POSITIONS = ["QB","RB","WR","TE","OL","DL","LB","CB","S","K","P"];
  const OFFENSIVE_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'K'];
  const DEFENSIVE_POSITIONS = ['DL', 'LB', 'CB', 'S', 'P'];
  
  const PLAYER_CONFIG = {
    MIN_AGE: 21,
    MAX_AGE: 34,
    ROOKIE_MIN_AGE: 21,
    ROOKIE_MAX_AGE: 23,
    MIN_OVR: 40,
    MAX_OVR: 99,
    PEAK_AGES: { QB: 28, RB: 25, WR: 27, OL: 29, DL: 28, LB: 27, CB: 26, S: 27, TE: 27, K: 30, P: 30 },
    // Re-added specific age/potential checks to PLAYER_CONFIG for clarity/compatibility:
    PLAYER_AGE_MIN: 21,
    PLAYER_AGE_MAX: 34,
    PLAYER_POTENTIAL_MIN: 40,
    PLAYER_POTENTIAL_MAX: 95,
    PLAYER_RETIREMENT_AGE_MAX: 40
  };
  
  const DEPTH_NEEDS = {
    QB: 2, RB: 3, WR: 4, TE: 2, OL: 6,
    DL: 5, LB: 4, CB: 4, S: 3, K: 1, P: 1
  };

  // --- IV. RATING & ATTRIBUTE LOGIC ---
  const OVR_WEIGHTS = {
    QB: { throwPower: 0.2, throwAccuracy: 0.3, awareness: 0.3, speed: 0.1, intelligence: 0.1 },
    RB: { speed: 0.2, acceleration: 0.2, trucking: 0.15, juking: 0.15, catching: 0.1, awareness: 0.2 },
    WR: { speed: 0.3, acceleration: 0.2, catching: 0.3, catchInTraffic: 0.2 },
    TE: { speed: 0.15, catching: 0.25, catchInTraffic: 0.2, runBlock: 0.2, passBlock: 0.2 },
    OL: { runBlock: 0.5, passBlock: 0.5 },
    DL: { passRushPower: 0.3, passRushSpeed: 0.3, runStop: 0.4 },
    LB: { speed: 0.2, runStop: 0.3, coverage: 0.3, awareness: 0.2 },
    CB: { speed: 0.3, acceleration: 0.2, coverage: 0.4, intelligence: 0.1 },
    S:  { speed: 0.25, coverage: 0.3, runStop: 0.25, awareness: 0.2 },
    K:  { kickPower: 0.6, kickAccuracy: 0.4 },
    P:  { kickPower: 0.6, kickAccuracy: 0.4 }
  };
  
  const POS_RATING_RANGES = {
    QB: { throwPower: [60, 99], throwAccuracy: [55, 99], awareness: [50, 99], speed: [40, 85], intelligence: [60, 99] },
    RB: { speed: [70, 99], acceleration: [70, 99], trucking: [50, 99], juking: [50, 99], catching: [40, 90], awareness: [50, 90] },
    WR: { speed: [70, 99], acceleration: [70, 99], catching: [65, 99], catchInTraffic: [55, 99], awareness: [50, 90] },
    TE: { catching: [55, 95], catchInTraffic: [50, 90], runBlock: [60, 95], passBlock: [55, 90], speed: [50, 85], awareness: [50, 90] },
    OL: { runBlock: [70, 99], passBlock: [70, 99], awareness: [60, 95], speed: [30, 65] },
    DL: { passRushPower: [60, 99], passRushSpeed: [55, 99], runStop: [65, 99], awareness: [50, 90], speed: [45, 85] },
    LB: { speed: [60, 95], runStop: [60, 95], coverage: [45, 90], awareness: [55, 95], passRushSpeed: [40, 85] },
    CB: { speed: [75, 99], acceleration: [75, 99], coverage: [60, 99], intelligence: [50, 95], awareness: [55, 90] },
    S: { speed: [65, 95], coverage: [55, 95], runStop: [50, 90], awareness: [60, 95], intelligence: [55, 90] },
    K: { kickPower: [70, 99], kickAccuracy: [60, 99], awareness: [50, 80] },
    P: { kickPower: [65, 99], kickAccuracy: [60, 99], awareness: [50, 80] }
  };

  // --- V. GAME SYSTEMS (Draft, FA, Training, HoF, Sim) ---
  const TRAINING = {
    SUCCESS_BASE_RATE: 0.55, SUCCESS_MIN_RATE: 0.15, SUCCESS_MAX_RATE: 0.85,
    COACH_SKILL_MODIFIER: 0.15, AGE_PENALTY_PER_YEAR: 0.015,
    HIGH_RATING_PENALTY: 0.01, FATIGUE_GAIN_SUCCESS: 2,
    FATIGUE_GAIN_FAIL: 1, MAX_RATING_IMPROVEMENT: 4
  };
  
  const DRAFT_CONFIG = {
    TOTAL_PROSPECTS: 250, SCOUTABLE_PROSPECTS: 150, ROUNDS: 7, TEAMS: 32
  };
  
  const FREE_AGENCY = {
    POOL_SIZE: 120, CONTRACT_DISCOUNT: 0.9, DEFAULT_YEARS: 2, GUARANTEED_PCT: 0.5
  };
  
  const SIMULATION = {
    HOME_ADVANTAGE: 2.5, BASE_SCORE_MIN: 14, BASE_SCORE_MAX: 31, SCORE_VARIANCE: 17,
    MIN_PASS_ATTEMPTS: 25, MAX_PASS_ATTEMPTS: 45, MIN_COMPLETION_PCT: 55, MAX_COMPLETION_PCT: 80,
    MIN_RUSH_ATTEMPTS: 15, MAX_RUSH_ATTEMPTS: 30,
    YARDS_PER_COMPLETION: { MIN: 8, MAX: 15 }, YARDS_PER_CARRY: { MIN: 3, MAX: 6 }
  };
  
  const HALL_OF_FAME = {
    MIN_YEARS: 5, LEGACY_THRESHOLD: 30, RETIREMENT_AGE_START: 33,
    RETIREMENT_CHANCE_PER_YEAR: 0.20, FORCED_RETIREMENT_AGE: 38,
    STATS_THRESHOLDS: {
      QB: { passYd: 30000, passTD: 200 }, RB: { rushYd: 8000, rushTD: 60 }, WR: { recYd: 10000, recTD: 65 }
    }
  };

  // --- VI. NAMES, COLLEGES, ABILITIES (Relies on expanded-names.js being loaded first) ---
  // Ensure we check window for names if they were loaded by expanded-names.js
  const FIRST_NAMES = (typeof window !== 'undefined' && window.EXPANDED_FIRST_NAMES) || ['James', 'Michael', 'John', 'Robert', 'David', 'William', 'Richard', 'Joseph', 'Thomas', 'Christopher'];
  const LAST_NAMES = (typeof window !== 'undefined' && window.EXPANDED_LAST_NAMES) || ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
  
  const NAMES = { first: FIRST_NAMES, last: LAST_NAMES };
  
  const NAMES_BY_POS = {
    QB: NAMES, RB: NAMES, WR: NAMES, TE: NAMES, OL: NAMES,
    DL: NAMES, LB: NAMES, CB: NAMES, S: NAMES, K: NAMES, P: NAMES
  };
  
  const COLLEGES = [
    'Alabama', 'Ohio State', 'Georgia', 'Clemson', 'Oklahoma', 'LSU', 'Florida',
    'Michigan', 'Penn State', 'Texas', 'Notre Dame', 'USC', 'Oregon', 'Wisconsin'
  ];
  
  const ABILITIES_BY_POS = {
    QB: ['Cannon Arm', 'Deadeye', 'Escape Artist', 'Field General', 'Clutch'],
    RB: ['Bruiser', 'Ankle Breaker', 'Breakaway Speed', 'Pass Catcher', 'Workhorse'],
    WR: ['Deep Threat', 'Possession', 'Route Runner', 'Sure Hands', 'YAC Monster'],
    TE: ['Mismatch', 'Red Zone Target', 'Blocking TE', 'Seam Threat'],
    OL: ['Pancake Block', 'Pass Pro', 'Road Grader', 'Anchor'],
    DL: ['Pass Rush', 'Run Stopper', 'Bull Rush', 'Finesse'],
    LB: ['Coverage LB', 'Run Defender', 'Pass Rusher', 'Sideline to Sideline'],
    CB: ['Shutdown Corner', 'Ball Hawk', 'Press Coverage', 'Slot Defender'],
    S: ['Ball Hawk', 'Enforcer', 'Coverage Safety', 'Box Safety'],
    K: ['Clutch Kicker', 'Big Leg', 'Accurate'],
    P: ['Coffin Corner', 'Hang Time', 'Directional']
  };

  // --- VII. LEAGUE STRUCTURE & TRADES ---
  const YEARS_OF_PICKS = 3;
  const CONF_NAMES = ["AFC","NFC"];
  const DIV_NAMES = ["East","North","South","West"];
  
  const TRADE_VALUES = {
    PICKS: {
      1: { 1: 3000, 2: 2600, 3: 2200, 4: 1800, 5: 1600, 6: 1400, 7: 1200 },
      2: { 1: 1800, 2: 1600, 3: 1400, 4: 1200, 5: 1000, 6: 800, 7: 600 },
      3: { 1: 800, 2: 600, 3: 400, 4: 300, 5: 200, 6: 150, 7: 100 },
      4: { 1: 300, 2: 200, 3: 150, 4: 100, 5: 75, 6: 50, 7: 25 },
      5: { 1: 150, 2: 100, 3: 75, 4: 50, 5: 25, 6: 15, 7: 10 },
      6: { 1: 75, 2: 50, 3: 25, 4: 15, 5: 10, 6: 8, 7: 5 },
      7: { 1: 25, 15: 15, 3: 10, 4: 8, 5: 5, 6: 3, 7: 1 }
    },
    FUTURE_DISCOUNT: 0.8
  };
  
  const POSITION_VALUES = {
    QB: 1.6, WR: 1.25, CB: 1.2, DL: 1.15, OL: 1.1,
    RB: 1.0, LB: 1.0, S: 1.0, TE: 0.9, K: 0.5, P: 0.5
  };
  
  const OFFENSIVE_SCHEMES = {
    'Pass Heavy': { keyStats: ['throwAccuracy', 'throwPower', 'catching', 'passBlock'], description: 'Air it out with a pass-first approach.' },
    'Run Heavy': { keyStats: ['trucking', 'runBlock', 'acceleration', 'strength'], description: 'Ground and pound to control the clock.' },
    'Balanced': { keyStats: ['throwAccuracy', 'trucking', 'catching', 'runBlock'], description: 'Mix of run and pass plays.' },
    'West Coast': { keyStats: ['throwAccuracy', 'catching', 'passBlock', 'awareness'], description: 'High-percentage, short passes.' },
    'Vertical': { keyStats: ['throwPower', 'speed', 'passBlock', 'catching'], description: 'Deep shots and explosive plays.' }
  };
  
  const DEFENSIVE_SCHEMES = {
    '4-3': { keyStats: ['runStop', 'tackling', 'awareness', 'coverage'], description: 'Traditional 4-3 defense with strong run support.' },
    '3-4': { keyStats: ['passRushPower', 'speed', 'coverage', 'awareness'], description: '3-4 defense with versatile linebackers.' },
    'Nickel': { keyStats: ['coverage', 'speed', 'awareness', 'intelligence'], description: 'Extra defensive back for pass coverage.' },
    'Aggressive': { keyStats: ['passRushPower', 'passRushSpeed', 'tackling', 'speed'], description: 'Attack the quarterback and force turnovers.' },
    'Conservative': { keyStats: ['coverage', 'awareness', 'tackling', 'intelligence'], description: 'Bend but don\'t break, prevent big plays.' }
  };
  
  // --- VIII. EXPORT EVERYTHING ---
  const Constants = {
    GAME_CONFIG,
    SALARY_CAP,
    PLAYER_CONFIG,
    TRAINING,
    DRAFT_CONFIG,
    FREE_AGENCY,
    SIMULATION,
    HALL_OF_FAME,
    
    // Position/Roster/Scheme
    POSITIONS, OFFENSIVE_POSITIONS, DEFENSIVE_POSITIONS, DEPTH_NEEDS,
    OVR_WEIGHTS, POS_RATING_RANGES,
    OFFENSIVE_SCHEMES, DEFENSIVE_SCHEMES,

    // Names/Generation
    FIRST_NAMES, LAST_NAMES, NAMES, NAMES_BY_POS, COLLEGES, ABILITIES_BY_POS,
    
    // League/Trade
    CONF_NAMES, DIV_NAMES, TRADE_VALUES, POSITION_VALUES,
    
    // Legacy/Compatibility:
    CAP_BASE: SALARY_CAP.BASE, 
    YEARS_OF_PICKS,
    PLAYER_AGE_MIN: PLAYER_CONFIG.MIN_AGE, 
    PLAYER_AGE_MAX: PLAYER_CONFIG.MAX_AGE,
    PLAYER_POTENTIAL_MIN: PLAYER_CONFIG.PLAYER_POTENTIAL_MIN,
    PLAYER_POTENTIAL_MAX: PLAYER_CONFIG.PLAYER_POTENTIAL_MAX,
    PLAYER_RETIREMENT_AGE_MAX: PLAYER_CONFIG.PLAYER_RETIREMENT_AGE_MAX
  };

  export { Constants };
  
  // Make individual arrays globally available (for compatibility with state.js and expanded-names)
  if (typeof window !== 'undefined') {
      window.Constants = Object.assign(window.Constants || {}, Constants);
      window.FIRST_NAMES = FIRST_NAMES;
      window.LAST_NAMES = LAST_NAMES;
      // Make constants available in legacy format too
      window.constants = window.Constants;
  }
