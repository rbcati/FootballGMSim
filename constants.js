'use strict';

/**
 * Constants for the NFL GM Simulator
 *
 * Includes:
 * - Position definitions and attributes
 * - Team configurations
 * - Salary cap and contract settings
 * - Progression/Regression parameters
 * - Trade logic weights
 * - Draft class generation settings
 */

// ============================================================================
// CORE DEFINITIONS
// ============================================================================

// Positions
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];

// Position Names Map
const POSITION_NAMES = {
  'QB': 'Quarterback',
  'RB': 'Running Back',
  'WR': 'Wide Receiver',
  'TE': 'Tight End',
  'OL': 'Offensive Line',
  'DL': 'Defensive Line',
  'LB': 'Linebacker',
  'CB': 'Cornerback',
  'S':  'Safety',
  'K':  'Kicker',
  'P':  'Punter'
};

// Player Attribute Definitions
const ATTRIBUTES = {
  // Physical
  speed: { label: 'Speed', abbr: 'SPD' },
  acceleration: { label: 'Acceleration', abbr: 'ACC' },
  strength: { label: 'Strength', abbr: 'STR' },
  agility: { label: 'Agility', abbr: 'AGI' },
  jumping: { label: 'Jumping', abbr: 'JMP' },
  stamina: { label: 'Stamina', abbr: 'STA' },
  injury: { label: 'Injury', abbr: 'INJ' },
  
  // Mental
  awareness: { label: 'Awareness', abbr: 'AWR' },
  intelligence: { label: 'Intelligence', abbr: 'INT' },
  
  // Skill - Passing
  throwPower: { label: 'Throw Power', abbr: 'THP' },
  throwAccuracy: { label: 'Throw Accuracy', abbr: 'THA' },
  
  // Skill - Ball Carrier
  carrying: { label: 'Carrying', abbr: 'CAR' },
  trucking: { label: 'Trucking', abbr: 'TRK' },
  juking: { label: 'Juking', abbr: 'JUK' },
  
  // Skill - Receiving
  catching: { label: 'Catching', abbr: 'CTH' },
  catchInTraffic: { label: 'Catch In Traffic', abbr: 'CIT' },
  routeRunning: { label: 'Route Running', abbr: 'RTE' },
  
  // Skill - Blocking
  runBlock: { label: 'Run Block', abbr: 'RBK' },
  passBlock: { label: 'Pass Block', abbr: 'PBK' },
  
  // Skill - Defense
  tackling: { label: 'Tackling', abbr: 'TAK' },
  hitPower: { label: 'Hit Power', abbr: 'POW' },
  blockShedding: { label: 'Block Shedding', abbr: 'BSH' },
  pursuit: { label: 'Pursuit', abbr: 'PUR' },
  playRecognition: { label: 'Play Rec', abbr: 'PRC' },
  manCoverage: { label: 'Man Cover', abbr: 'MCV' },
  zoneCoverage: { label: 'Zone Cover', abbr: 'ZCV' },
  press: { label: 'Press', abbr: 'PRS' },
  
  // Skill - Special Teams
  kickPower: { label: 'Kick Power', abbr: 'KPW' },
  kickAccuracy: { label: 'Kick Accuracy', abbr: 'KAC' }
};

// Overall Calculation Weights
const OVR_WEIGHTS = {
  QB: { throwPower: 0.3, throwAccuracy: 0.3, awareness: 0.2, speed: 0.1, intelligence: 0.1 },
  RB: { speed: 0.25, agility: 0.2, trucking: 0.15, juking: 0.15, carrying: 0.15, catching: 0.1 },
  WR: { catching: 0.25, speed: 0.2, routeRunning: 0.2, agility: 0.15, catchInTraffic: 0.1, awareness: 0.1 },
  TE: { catching: 0.2, runBlock: 0.2, passBlock: 0.15, speed: 0.15, strength: 0.15, awareness: 0.15 },
  OL: { runBlock: 0.35, passBlock: 0.35, strength: 0.2, awareness: 0.1 },
  DL: { strength: 0.25, blockShedding: 0.25, tackling: 0.2, powerMoves: 0.15, acceleration: 0.15 },
  LB: { tackling: 0.25, awareness: 0.2, speed: 0.15, zoneCoverage: 0.15, blockShedding: 0.15, strength: 0.1 },
  CB: { manCoverage: 0.25, zoneCoverage: 0.25, speed: 0.2, acceleration: 0.15, awareness: 0.15 },
  S:  { zoneCoverage: 0.3, speed: 0.2, awareness: 0.2, tackling: 0.15, playRecognition: 0.15 },
  K:  { kickPower: 0.5, kickAccuracy: 0.5 },
  P:  { kickPower: 0.5, kickAccuracy: 0.5 }
};

// ============================================================================
// GAME CONFIGURATION
// ============================================================================

// Salary Cap Settings
const SALARY_CAP = {
  CAP_LIMIT: 255.0, // $255M (2024 NFL Cap approx)
  MIN_SPENDING: 0.89, // 89% floor
  ROOKIE_RESERVE: 10.0, // Reserved for draft picks
  MAX_CONTRACT: 60.0, // Max APY ($60M/yr)
  MIN_CONTRACT: 0.795, // Min salary ($795k)
  FRANCHISE_TAG_MULTIPLIER: 1.2, // 120% of previous salary or top 5 avg
  FIFTH_YEAR_OPTION_PCT: 1.0, // Fully guaranteed
  DEAD_CAP_ACCELERATION: true, // Accelerate remaining bonus on cut
  GUARANTEED_PCT_DEFAULT: 0.5, // 50% guaranteed for average vet
  SIGNING_BONUS_MAX: 0.4, // Max 40% of contract as signing bonus
  SIGNING_BONUS_MIN: 0.15 // Min 15%
};

// Salary Weight Multipliers by Position
// This scales the max contract based on position value (e.g. QB > P)
const POS_SALARY_WEIGHTS = {
    QB: 1.3,
    WR: 1.0,
    DL: 1.0,
    LB: 0.9,
    CB: 0.9,
    OL: 0.8,
    S: 0.7,
    TE: 0.6,
    RB: 0.6,
    K: 0.3,
    P: 0.3
};

// Player Generation Config
const PLAYER_CONFIG = {
  MIN_AGE: 21,
  MAX_AGE: 24, // Rookie max age
  MIN_OVR: 55,
  MAX_OVR: 85, // Generational rookie
  DEV_TRAIT_CHANCE: {
    NORMAL: 0.60,
    STAR: 0.25,
    SUPERSTAR: 0.12,
    XFACTOR: 0.03
  },
  PEAK_AGES: {
    QB: 28, RB: 24, WR: 26, TE: 27,
    OL: 28, DL: 27, LB: 26, CB: 26, S: 27,
    K: 30, P: 30
  }
};

// Positional Value for Trades (0-1.0 Scale)
const POSITIONAL_VALUE = {
  QB: 1.0,
  DL: 0.85,
  WR: 0.8,
  OT: 0.8,
  CB: 0.75,
  LB: 0.7,
  S:  0.6,
  TE: 0.55,
  OG: 0.5,
  C:  0.5,
  RB: 0.45,
  K:  0.1,
  P:  0.1
};

// Draft Pick Trade Value Chart (Jimmy Johnson / Rich Hill Hybrid Model)
const DRAFT_PICK_VALUE = {
  // Round 1
  1: 3000, 2: 2600, 3: 2200, 4: 1800, 5: 1700, 6: 1600, 7: 1500, 8: 1400,
  9: 1350, 10: 1300, 11: 1250, 12: 1200, 13: 1150, 14: 1100, 15: 1050, 16: 1000,
  17: 950, 18: 900, 19: 875, 20: 850, 21: 825, 22: 800, 23: 760, 24: 740,
  25: 720, 26: 700, 27: 680, 28: 660, 29: 640, 30: 620, 31: 600, 32: 590,
  // Round 2 (approx)
  33: 580, 48: 420, 64: 270,
  // Round 3
  65: 265, 80: 190, 96: 116,
  // Round 4
  97: 112, 128: 44,
  // Round 5
  129: 43, 160: 27,
  // Round 6
  161: 26, 192: 15,
  // Round 7
  193: 14, 224: 2
};

// Trade Logic Config
const TRADE_CONFIG = {
  ACCEPTANCE_THRESHOLD: 0.95, // Offer must be 95% of value
  CPU_DECLINE_VARIANCE: 0.1, // +/- 10% randomness
  CAP_PENALTY_WEIGHT: 1.5, // Multiplier for cap hit impact
  FUTURE_PICK_DISCOUNT: 0.8, // Future picks worth 80% of current year
  USER_TEAM_TAX: 1.1 // CPU demands 10% more from user
};

// Game Simulation Config
const SIMULATION = {
  INJURY_CHANCE: 0.015, // Per play
  HOME_FIELD_ADVANTAGE: 3.0, // Points
  WEATHER_IMPACT: true,
  MOMENTUM_FACTOR: 0.5,
  FATIGUE_RATE: 1.2,
  RECOVERY_RATE: 5.0
};

// Progression / Regression
const TRAINING = {
  XP_PER_GAME: 100,
  XP_PER_WIN: 50,
  XP_PER_AWARD: 500,
  MAX_RATING_IMPROVEMENT: 5, // Per offseason
  REGRESSION_START_AGE: 29,
  REGRESSION_SEVERE_AGE: 33
};

// Team Needs Calculation
const DEPTH_NEEDS = {
  QB: 2, RB: 3, WR: 5, TE: 3,
  OL: 8, DL: 6, LB: 6, CB: 5, S: 4,
  K: 1, P: 1
};

// ============================================================================
// DATA SETS
// ============================================================================

// Colleges (Top programs)
const COLLEGES = [
  'Alabama', 'Georgia', 'Ohio State', 'Michigan', 'Clemson', 'LSU',
  'Notre Dame', 'Oklahoma', 'Texas', 'USC', 'Oregon', 'Penn State',
  'Florida', 'Florida State', 'Miami', 'Tennessee', 'Auburn', 'Texas A&M',
  'Wisconsin', 'Iowa', 'Washington', 'Utah', 'TCU', 'Ole Miss',
  'North Carolina', 'UCLA', 'Kentucky', 'Oklahoma State', 'Michigan State'
];

// Names handled via getters to avoid race conditions with expanded-names.js
const FIRST_NAMES_GETTER = {
  get: () => window.EXPANDED_FIRST_NAMES || window.FIRST_NAMES || ['John', 'Mike', 'Chris', 'David', 'James']
};

const LAST_NAMES_GETTER = {
  get: () => window.EXPANDED_LAST_NAMES || window.LAST_NAMES || ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones']
};

// ============================================================================
// EXPORTS
// ============================================================================

const Constants = {
  POSITIONS,
  POSITION_NAMES,
  ATTRIBUTES,
  OVR_WEIGHTS,
  SALARY_CAP,
  POS_SALARY_WEIGHTS,
  PLAYER_CONFIG,
  POSITIONAL_VALUE,
  DRAFT_PICK_VALUE,
  TRADE_CONFIG,
  SIMULATION,
  TRAINING,
  DEPTH_NEEDS,
  COLLEGES
};

// Define properties for names to ensure they are read at runtime
Object.defineProperty(Constants, 'FIRST_NAMES', FIRST_NAMES_GETTER);
Object.defineProperty(Constants, 'LAST_NAMES', LAST_NAMES_GETTER);

// Export for ES Modules
export { Constants };

// Backward compatibility for browser global
if (typeof window !== 'undefined') {
  // Use Object.assign to merge with existing window.Constants if it exists
  // This prevents overwriting data loaded by other scripts
  window.Constants = Object.assign(window.Constants || {}, Constants);
}
