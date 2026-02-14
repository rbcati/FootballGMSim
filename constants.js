// constants.js - Cleaned, organized, and properly exported properties
'use strict';

  // --- I. GAME CONFIGURATION ---
  const GAME_CONFIG = {
    YEAR_START: 2025,
    SAVE_KEY: 'nflGM4.league',
    ROUTES: ['hub','roster','contracts','cap','schedule','standings','trade','freeagency','draft','playoffs','settings', 'hallOfFame', 'scouting']
  };

  // --- II. SALARY & CONTRACTS (REFACTORED) ---
  const SALARY_CAP = {
    BASE: 255, // Updated to 2025 projection
    MAX_ROLLOVER: 10,
    MIN_CONTRACT: 0.75, // $750k - Standard league minimum
    MAX_CONTRACT: 55.0, // $55M - Current star QB ceiling

    // NEW: Positional Salary Weights
    // (Ensures QBs cost more than Punters naturally)
    POS_SALARY_WEIGHTS: {
      QB: 1.15,  // Reduced from 1.25 to help cap
      WR: 1.05,  // Reduced from 1.10
      OL: 1.05,
      CB: 1.05,
      DL: 1.05,
      RB: 0.90,  // Devalued positions
      LB: 0.90,
      S:  0.85,
      TE: 0.85,
      K:  0.40,  // Specialists
      P:  0.40
    },

    ROOKIE_DISCOUNT: 0.9,
    GUARANTEED_PCT_DEFAULT: 0.5,
    // Keeping existing bonus config
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
    QB: 3, RB: 4, WR: 6, TE: 3, OL: 9,
    DL: 9, LB: 7, CB: 6, S: 4, K: 1, P: 1
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
    HOME_ADVANTAGE: 2.5, BASE_SCORE_MIN: 7, BASE_SCORE_MAX: 24, SCORE_VARIANCE: 14,
    MIN_PASS_ATTEMPTS: 25, MAX_PASS_ATTEMPTS: 45, MIN_COMPLETION_PCT: 55, MAX_COMPLETION_PCT: 80,
    MIN_RUSH_ATTEMPTS: 15, MAX_RUSH_ATTEMPTS: 30,
    YARDS_PER_COMPLETION: { MIN: 8, MAX: 15 }, YARDS_PER_CARRY: { MIN: 3, MAX: 6 }
  };

  const PLAYOFFS = {
    TEAMS_PER_CONF: 7
  };
  
  const HALL_OF_FAME = {
    MIN_YEARS: 5, LEGACY_THRESHOLD: 30, RETIREMENT_AGE_START: 33,
    RETIREMENT_CHANCE_PER_YEAR: 0.20, FORCED_RETIREMENT_AGE: 38,
    STATS_THRESHOLDS: {
      QB: { passYd: 30000, passTD: 200 }, RB: { rushYd: 8000, rushTD: 60 }, WR: { recYd: 10000, recTD: 65 }
    }
  };

  // --- VI. NAMES, COLLEGES, ABILITIES (REFACTORED FOR SAFETY) ---
  // We use a function to ensure we get the names EVEN IF the other script loads late
  const getFirstNames = () => ((typeof window !== 'undefined' && window.EXPANDED_FIRST_NAMES) || ['James', 'Michael', 'John', 'Robert', 'David', 'William', 'Richard', 'Joseph', 'Thomas', 'Christopher']);
  const getLastNames = () => ((typeof window !== 'undefined' && window.EXPANDED_LAST_NAMES) || ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez']);
  
  // NAMES object also needs to be dynamic or a getter, but for simplicity in this structure we use the getters in Constants
  
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

  // --- VII. LEAGUE STRUCTURE & TRADES (REFACTORED) ---
  const YEARS_OF_PICKS = 3;
  const CONF_NAMES = ["AFC","NFC"];
  const DIV_NAMES = ["East","North","South","West"];
  
  const TRADE_CONFIG = {
    // Instead of a giant table, we use a base value and a decay factor
    PICK_ONE_VALUE: 3000,
    PICK_DECAY: 0.96, // Each subsequent pick is worth 4% less than the one before it
    POSITION_MULTIPLIERS: {
        QB: 1.5,
        WR: 1.2,
        CB: 1.2,
        // ... etc
    }
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

  const POSITION_TRAINING_WEIGHTS = {
    "QB": {
      "primary": ["throwPower", "throwAccuracy", "awareness"],
      "secondary": ["speed", "agility", "stamina"],
      "tertiary": ["strength", "toughness"]
    },
    "RB": {
      "primary": ["speed", "agility", "carrying"],
      "secondary": ["catching", "strength", "awareness"],
      "tertiary": ["passBlock", "toughness"]
    },
    "WR": {
      "primary": ["catching", "speed", "routeRunning"],
      "secondary": ["agility", "jumping", "stamina"],
      "tertiary": ["awareness", "runBlock"]
    },
    "TE": {
      "primary": ["catching", "runBlock", "strength"],
      "secondary": ["speed", "routeRunning", "awareness"],
      "tertiary": ["agility", "passBlock"]
    },
    "OL": {
      "primary": ["runBlock", "passBlock", "strength"],
      "secondary": ["awareness", "stamina", "toughness"],
      "tertiary": ["agility", "speed"]
    },
    "DL": {
      "primary": ["tackle", "strength", "blockShedding"],
      "secondary": ["speed", "agility", "awareness"],
      "tertiary": ["stamina", "toughness"]
    },
    "LB": {
      "primary": ["tackle", "awareness", "zoneCoverage"],
      "secondary": ["speed", "strength", "blockShedding"],
      "tertiary": ["manCoverage", "agility"]
    },
    "CB": {
      "primary": ["manCoverage", "zoneCoverage", "speed"],
      "secondary": ["agility", "catching", "awareness"],
      "tertiary": ["tackle", "strength"]
    },
    "S": {
      "primary": ["manCoverage", "zoneCoverage", "speed"],
      "secondary": ["agility", "catching", "awareness"],
      "tertiary": ["tackle", "strength"]
    },
    "K": {
      "primary": ["kickPower", "kickAccuracy"],
      "secondary": ["awareness", "stamina"],
      "tertiary": ["speed", "strength"]
    },
    "P": {
      "primary": ["kickPower", "kickAccuracy"],
      "secondary": ["awareness", "stamina"],
      "tertiary": ["speed", "strength"]
    }
  };

  // --- IX. NEW CONSOLIDATED CONFIGURATIONS ---

  const PLAYOFF_CONFIG = {
    TEAMS_PER_CONF: 7
  };

  const SIM_CONFIG = {
    WATCHDOG_TIMEOUT_MS: 5000,
    COMP_BALANCE: {
      TOP_TIER_CUTOFF: 0.25,
      BOTTOM_TIER_CUTOFF: 0.75,
      VETERAN_AGE: 28,
      YOUNG_AGE: 25,
      FATIGUE_CHANCE: 0.15,
      DEVELOPMENT_CHANCE: 0.20
    },
    ROSTER_MINIMUMS: { QB: 2, OL: 4, DL: 3 },
    AI_SIGNING: {
      BASE_ANNUAL: 0.8,
      YEARS: 1
    }
  };

  const CONTRACT_MGMT = {
    MIN_BASE_SALARY: 0.5,
    EXTENSION_LIMITS: { MIN: 2, MAX: 7 },
    NEGOTIATION_THRESHOLDS: { LOWBALL: 0.75, OVERPAY: 1.10 },
    TAG_MULTIPLIERS: {
      FRANCHISE: 1.2,
      TRANSITION: 1.1,
      FIFTH_YEAR: 1.25
    },
    TAG_ESTIMATES: {
      FRANCHISE: { 'QB': 30, 'OL': 18, 'DL': 15, 'WR': 16, 'CB': 14, 'LB': 10, 'RB': 8, 'S': 9, 'TE': 7, 'K': 4, 'P': 3 },
      TRANSITION: { 'QB': 25, 'OL': 15, 'DL': 12, 'WR': 13, 'CB': 11, 'LB': 8, 'RB': 6, 'S': 7, 'TE': 5, 'K': 3, 'P': 2 }
    },
    ROOKIE_CONTRACT_LENGTH: 4,
    MAX_GUARANTEED_PCT: 0.95,
    MAX_TAGS: { FRANCHISE: 1, TRANSITION: 1 },
    LEVERAGE: {
        POS_MULTIPLIERS: {
          QB: 2.5, WR: 1.15, OL: 1.10, CB: 1.10, DL: 1.05,
          LB: 0.95, S: 0.90, TE: 0.85, RB: 0.70, K: 0.35, P: 0.30
        },
        MARKET_AAV_LADDER: [
          { ovr: 95, aav: 26 },
          { ovr: 90, aav: 20 },
          { ovr: 85, aav: 15 },
          { ovr: 80, aav: 10 },
          { ovr: 75, aav: 6 },
          { ovr: 70, aav: 3.5 },
          { ovr: 65, aav: 2 },
          { ovr: 0, aav: 1 }
        ]
    }
  };

  const SCOUTING_CONFIG = {
    INITIAL_BUDGET: 2000000,
    SCOUTING_ACCURACY: {
      BASIC: 60,
      THOROUGH: 85,
      COMBINE: 95
    },
    SCOUTING_COSTS: {
      BASIC: 50000,
      THOROUGH: 150000,
      COMBINE: 500000
    },
    SCOUTING_LIMITS: {
      BASIC_PER_WEEK: 10,
      THOROUGH_PER_WEEK: 5,
      COMBINE_PER_WEEK: 2
    }
  };

  const TRADE_LOGIC_CONFIG = {
    DRAFT_PICK_VALUES: {
      1: 3000, 2: 2600, 3: 2200, 4: 1800, 5: 1700, 6: 1600, 7: 1500, 8: 1400,
      9: 1350, 10: 1300, 11: 1250, 12: 1200, 13: 1150, 14: 1100, 15: 1050,
      16: 1000, 17: 950, 18: 900, 19: 875, 20: 850, 21: 825, 22: 800,
      23: 760, 24: 740, 25: 720, 26: 700, 27: 680, 28: 660, 29: 640, 30: 620,
      31: 600, 32: 590
    },
    PLAYER_VALUE_CURVE: { A: 1.5, K: 2.1, THRESHOLD: 55 },
    EXPECTED_SALARY: { A: 0.017, THRESHOLD: 60, MIN: 0.8 },
    POS_MULTIPLIERS: {
        QB: 1.4, DE: 1.1, EDGE: 1.1, LT: 1.1, OT: 1.0, WR: 1.1, CB: 1.0,
        DT: 0.9, LB: 0.8, S: 0.7, RB: 0.6, TE: 0.6, K: 0.2, P: 0.2
    },
    FUTURE_DISCOUNT: { ONE_YEAR: 0.75, TWO_PLUS_YEARS: 0.80 }
  };

  const DRAFT_LOGIC_CONFIG = {
    POSITION_WEIGHTS: {
      'QB': 8,   'RB': 15,  'WR': 25,  'TE': 12,  'OL': 35,
      'DL': 30,  'LB': 20,  'CB': 18,  'S': 15,   'K': 3,   'P': 2
    },
    TALENT_TIERS: [
      { maxIndex: 32, mean: 81, stdDev: 4 },
      { maxIndex: 64, mean: 75, stdDev: 4 },
      { maxIndex: 96, mean: 70, stdDev: 4 },
      { maxIndex: 160, mean: 64, stdDev: 4 },
      { maxIndex: 224, mean: 58, stdDev: 3 },
      { default: true, mean: 53, stdDev: 3 }
    ],
    BOOM_BUST_THRESHOLDS: { BOOM: 6, BUST: -6 },
    ROOKIE_WAGE_SCALE: {
      1: { min: 4.0, max: 8.5 },
      2: { min: 2.5, max: 4.0 },
      3: { min: 1.8, max: 2.5 },
      4: { min: 1.2, max: 1.8 },
      5: { min: 0.9, max: 1.2 },
      6: { min: 0.7, max: 0.9 },
      7: { min: 0.5, max: 0.7 }
    }
  };

  const LEAGUE_GEN_CONFIG = {
    STARTERS_COUNT: {
      QB: 1, RB: 1, WR: 3, TE: 1, OL: 5,
      DL: 4, LB: 3, CB: 2, S: 2, K: 1, P: 1
    },
    ROSTER_OVR_RANGES: {
      STAR: [82, 95],
      STARTER: [76, 90],
      BACKUP: [65, 75],
      DEPTH: [60, 74]
    }
  };

  // --- X. EXPORT EVERYTHING ---
  const Constants = {
    GAME_CONFIG,
    SALARY_CAP,
    PLAYER_CONFIG,
    TRAINING,
    DRAFT_CONFIG,
    FREE_AGENCY,
    SIMULATION,
    PLAYOFFS,
    HALL_OF_FAME,
    
    // Position/Roster/Scheme
    POSITIONS, OFFENSIVE_POSITIONS, DEFENSIVE_POSITIONS, DEPTH_NEEDS,
    OVR_WEIGHTS, POS_RATING_RANGES,
    OFFENSIVE_SCHEMES, DEFENSIVE_SCHEMES,
    POSITION_TRAINING_WEIGHTS,

    // New Configurations
    PLAYOFF_CONFIG,
    SIM_CONFIG,
    CONTRACT_MGMT,
    SCOUTING_CONFIG,
    TRADE_LOGIC_CONFIG,
    DRAFT_LOGIC_CONFIG,
    LEAGUE_GEN_CONFIG,

    // Names/Generation - Replaced hard-coded names with getters to prevent "Race Condition" bugs
    get FIRST_NAMES() { return getFirstNames(); },
    get LAST_NAMES() { return getLastNames(); },

    // Helper to get NAMES object dynamically
    get NAMES() { return { first: getFirstNames(), last: getLastNames() }; },

    COLLEGES, ABILITIES_BY_POS,
    
    // League/Trade
    CONF_NAMES, DIV_NAMES,
    TRADE_CONFIG, // Replaces TRADE_VALUES
    POSITION_VALUES,
    
    // Legacy/Compatibility:
    CAP_BASE: SALARY_CAP.BASE,
    HOME_ADVANTAGE: SIMULATION.HOME_ADVANTAGE,
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

      // We can't assign window.FIRST_NAMES = getFirstNames() directly as an array here if it's not loaded
      // But we can define a getter on window if we want true "ghost" behavior,
      // OR we just rely on Constants.FIRST_NAMES
      Object.defineProperty(window, 'FIRST_NAMES', {
        get: getFirstNames,
        configurable: true
      });
      Object.defineProperty(window, 'LAST_NAMES', {
        get: getLastNames,
        configurable: true
      });

      // Make constants available in legacy format too
      window.constants = window.Constants;
  }
