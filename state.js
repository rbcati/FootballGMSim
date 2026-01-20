// state-save-manager.js - Unified State Management and Persistence
// ES Module version - migrated from IIFE pattern

// Import dependencies
// TODO: Convert Constants to ES module and import properly
// For now, we access it from window for backward compatibility
const getConstants = () => window.Constants || {};

// --- Configuration Variables ---
const C = getConstants();
const SAVE_KEY_BASE = (C.GAME_CONFIG && C.GAME_CONFIG.SAVE_KEY) || 'nflGM4.state';
const YEAR_START = (C.GAME_CONFIG && C.GAME_CONFIG.YEAR_START) || 2025;

const MAX_SAVE_SLOTS = 5;

function normalizeSlot(slot) {
  const parsed = parseInt(slot, 10);
  if (isNaN(parsed) || parsed < 1) return 1;
  if (parsed > MAX_SAVE_SLOTS) return MAX_SAVE_SLOTS;
  return parsed;
}

function getActiveSaveSlot() {
  const stored = window.localStorage.getItem('nflGM4.activeSlot');
  return normalizeSlot(stored || 1);
}

function setActiveSaveSlot(slot) {
  const normalized = normalizeSlot(slot);
  try {
    window.localStorage.setItem('nflGM4.activeSlot', normalized);
    if (window.state) {
      window.state.saveSlot = normalized;
    }
  } catch (err) {
    console.warn('Unable to persist active save slot', err);
  }
  return normalized;
}

function saveKeyFor(slot) {
  const normalized = normalizeSlot(slot);
  return `${SAVE_KEY_BASE}.slot${normalized}`;
}

// Game Routes (used for UI)
const routes = [
  'hub', 'roster', 'cap', 'schedule', 'standings', 'trade', 'freeagency',
  'draft', 'playoffs', 'settings', 'hallOfFame', 'scouting'
];

// --- Name Data (Fallbacks for Player Generation) ---
const FIRST_NAMES = window.EXPANDED_FIRST_NAMES || [
  'James', 'Michael', 'John', 'Robert', 'David', 'William', 'Richard', 'Joseph', 
  'Thomas', 'Christopher', 'Matthew', 'Anthony', 'Mark', 'Steven', 'Andrew', 'Joshua'
];
const LAST_NAMES = window.EXPANDED_LAST_NAMES || [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson'
];

// --- State Management System ---

/**
 * Centralized utility object for managing the game state schema.
 */
export const State = {
  /**
   * Initialize a clean game state object.
   * @returns {Object} Fresh state object
   */
  init() {
    console.log('Initializing fresh state...');
    
    const freshState = {
      // Core game data
      league: null,
      season: 1,
      year: YEAR_START,
      
      // Player/Team data
      player: {
        teamId: 0,
        name: 'GM',
        role: 'GM'
      },
      userTeamId: 0,
      
      // Game settings
      namesMode: 'fictional',  // 'fictional' or 'real'
      gameMode: 'gm',         // 'gm' or 'career'
      playerRole: 'GM',       // 'GM', 'OC', 'DC'
      onboarded: false,
      
      // Game systems
      freeAgents: [],
      draftClass: [],
      playoffs: null,
      trainingPlan: null,
      pendingOffers: [],
      
      // User interface
      currentView: 'hub',
      theme: 'dark',
      
      // Settings
      settings: {
        autoSave: true,
        difficulty: 'normal',
        simSpeed: 'normal',
        notifications: true,
        sound: false,
        salaryCapEnabled: true,
        allowCoachFiring: true
      },

      // Persistence helpers
      saveSlot: getActiveSaveSlot(),
      
      // Version info and persistence
      version: '4.0.0',
      lastSaved: null,
      created: new Date().toISOString()
    };
    
    console.log('Fresh state created');
    return freshState;
  },
  
  /**
   * ENHANCED: Comprehensive state validation with nested structure checks
   */
  validate(stateObj) {
    if (!stateObj || typeof stateObj !== 'object') {
      return { valid: false, errors: ['State is null or undefined'], warnings: [] };
    }
    
    const errors = [];
    const warnings = [];
    
    // Required top-level properties
    const requiredProps = [
      'namesMode', 'onboarded', 'gameMode', 'playerRole', 'userTeamId', 'version'
    ];
    
    requiredProps.forEach(prop => {
      if (stateObj[prop] === undefined) {
        errors.push(`Missing required property: ${prop}`);
      }
    });
    
    // Value validation
    if (stateObj.namesMode && !['fictional', 'real'].includes(stateObj.namesMode)) {
      errors.push('Invalid namesMode');
    }
    
    if (stateObj.userTeamId !== undefined && (typeof stateObj.userTeamId !== 'number' || stateObj.userTeamId < 0)) {
      errors.push('Invalid userTeamId');
    }
    
    // Validate league structure if present
    if (stateObj.league) {
      const leagueErrors = this.validateLeague(stateObj.league);
      errors.push(...leagueErrors);
    } else {
      warnings.push('No league data present (new game?)');
    }
    
    // Validate nested collections
    if (stateObj.freeAgents && !Array.isArray(stateObj.freeAgents)) {
      errors.push('freeAgents must be an array');
    }
    
    if (stateObj.draftClass && !Array.isArray(stateObj.draftClass)) {
      errors.push('draftClass must be an array');
    }
    
    if (stateObj.pendingOffers && !Array.isArray(stateObj.pendingOffers)) {
      errors.push('pendingOffers must be an array');
    }
    
    // Validate settings structure
    if (stateObj.settings && typeof stateObj.settings !== 'object') {
      errors.push('settings must be an object');
    }
    
    // Check for data integrity issues
    if (stateObj.league && stateObj.league.teams) {
      const teamCount = stateObj.league.teams.length;
      if (teamCount !== 32 && teamCount !== 0) {
        warnings.push(`Unexpected team count: ${teamCount} (expected 32 or 0 for new game)`);
      }
      
      // Validate userTeamId is within bounds
      if (stateObj.userTeamId >= teamCount && teamCount > 0) {
        errors.push(`userTeamId (${stateObj.userTeamId}) out of bounds for ${teamCount} teams`);
      }
    }
    
    return { 
      valid: errors.length === 0, 
      errors, 
      warnings,
      schemaVersion: stateObj.version || 'unknown'
    };
  },
  
  /**
   * Validate league structure
   */
  validateLeague(league) {
    const errors = [];
    
    if (!league || typeof league !== 'object') {
      errors.push('League must be an object');
      return errors;
    }
    
    // Check required league properties
    if (league.year !== undefined && (typeof league.year !== 'number' || league.year < 2020 || league.year > 2100)) {
      errors.push('Invalid league.year');
    }
    
    if (league.week !== undefined && (typeof league.week !== 'number' || league.week < 1 || league.week > 18)) {
      errors.push('Invalid league.week');
    }
    
    // Validate teams array
    if (league.teams) {
      if (!Array.isArray(league.teams)) {
        errors.push('league.teams must be an array');
      } else {
        league.teams.forEach((team, index) => {
          if (!team || typeof team !== 'object') {
            errors.push(`Team at index ${index} is invalid`);
            return;
          }
          
          // Check team has required properties
          if (!team.name && !team.abbr) {
            errors.push(`Team at index ${index} missing name/abbr`);
          }
          
          // Validate roster if present
          if (team.roster && !Array.isArray(team.roster)) {
            errors.push(`Team ${index} roster must be an array`);
          }
          
          // Validate picks if present
          if (team.picks && !Array.isArray(team.picks)) {
            errors.push(`Team ${index} picks must be an array`);
          }
        });
      }
    }
    
    return errors;
  },
  
  /**
   * ENHANCED: Version-aware migration with schema updates
   */
  migrate(oldState) {
    if (!oldState) return this.init();
    
    const oldVersion = oldState.version || '1.0.0';
    console.log('Migrating state from version:', oldVersion, 'to', this.init().version);
    
    let migratedState = { ...oldState };
    
    // Version-specific migrations
    if (this.compareVersions(oldVersion, '4.0.0') < 0) {
      // Migrate from pre-4.0.0
      migratedState = this.migrateToV4(migratedState);
    }
    
    // Always ensure current schema structure
    const newState = this.init();
    
    // Safe copy function with type checking
    const safeCopy = (prop, fallback, validator = null) => {
      const value = migratedState[prop];
      if (value !== undefined && value !== null) {
        if (validator && !validator(value)) {
          console.warn(`Invalid value for ${prop}, using fallback`);
          newState[prop] = fallback;
        } else {
          newState[prop] = value;
        }
      } else if (fallback !== undefined) {
        newState[prop] = fallback;
      }
    };
    
    // Copy core properties with validation
    safeCopy('league', null, (v) => typeof v === 'object');
    safeCopy('freeAgents', [], (v) => Array.isArray(v));
    safeCopy('playoffs', null, (v) => v === null || typeof v === 'object');
    safeCopy('trainingPlan', null);
    safeCopy('pendingOffers', [], (v) => Array.isArray(v));
    safeCopy('draftClass', [], (v) => Array.isArray(v));

    // Copy settings and user data
    safeCopy('namesMode', 'fictional', (v) => ['fictional', 'real'].includes(v));
    safeCopy('onboarded', false, (v) => typeof v === 'boolean');
    safeCopy('gameMode', 'gm', (v) => ['gm', 'career'].includes(v));
    safeCopy('playerRole', 'GM', (v) => ['GM', 'OC', 'DC'].includes(v));
    safeCopy('userTeamId', 0, (v) => typeof v === 'number' && v >= 0);
    safeCopy('currentView', 'hub');
    safeCopy('theme', 'dark', (v) => ['dark', 'light'].includes(v));
    safeCopy('season', 1, (v) => typeof v === 'number' && v > 0);
    safeCopy('year', YEAR_START, (v) => typeof v === 'number' && v >= 2020);

    // Merge nested objects
    if (migratedState.player && typeof migratedState.player === 'object') {
      newState.player = { ...newState.player, ...migratedState.player };
    }
    if (migratedState.settings && typeof migratedState.settings === 'object') {
      newState.settings = { ...newState.settings, ...migratedState.settings };
    }
    
    // Migrate league structure if present
    if (migratedState.league) {
      newState.league = this.migrateLeague(migratedState.league);
    }
    
    // Final updates
    newState.version = this.init().version;
    newState.lastSaved = new Date().toISOString();
    
    // Preserve creation date if exists
    if (migratedState.created) {
      newState.created = migratedState.created;
    }
    
    console.log('State migration complete');
    return newState;
  },
  
  /**
   * Migrate league structure
   */
  migrateLeague(league) {
    if (!league || typeof league !== 'object') return null;
    
    const migrated = { ...league };
    
    // Ensure teams array exists and is valid
    if (!Array.isArray(migrated.teams)) {
      migrated.teams = [];
    }
    
    // Migrate each team
    migrated.teams = migrated.teams.map((team, index) => {
      if (!team || typeof team !== 'object') {
        console.warn(`Invalid team at index ${index}, skipping`);
        return null;
      }
      
      const migratedTeam = { ...team };
      
      // Ensure roster is array
      if (!Array.isArray(migratedTeam.roster)) {
        migratedTeam.roster = [];
      }
      
      // Ensure picks is array
      if (!Array.isArray(migratedTeam.picks)) {
        migratedTeam.picks = [];
      }
      
      // Migrate player structures if needed
      migratedTeam.roster = migratedTeam.roster.map(player => {
        if (!player || typeof player !== 'object') return null;
        
        // Ensure player has required properties
        const migratedPlayer = { ...player };
        if (!migratedPlayer.id) {
          migratedPlayer.id = `migrated_${Date.now()}_${Math.random()}`;
        }
        if (!migratedPlayer.stats) {
          migratedPlayer.stats = { game: {}, season: {}, career: {} };
        }
        
        return migratedPlayer;
      }).filter(p => p !== null);
      
      return migratedTeam;
    }).filter(t => t !== null);
    
    // Ensure records structure exists
    if (!migrated.records) {
      migrated.records = {};
    }
    
    // Ensure history structure exists
    if (!migrated.history) {
      migrated.history = {
        superBowls: [],
        mvps: [],
        awards: [],
        coachRankings: []
      };
    }
    
    return migrated;
  },
  
  /**
   * Migrate to version 4.0.0 schema
   */
  migrateToV4(state) {
    console.log('Applying v4.0.0 migration...');
    
    // Add new properties that didn't exist in older versions
    if (!state.settings) {
      state.settings = {
        autoSave: true,
        difficulty: 'normal',
        simSpeed: 'normal',
        notifications: true,
        sound: false,
        salaryCapEnabled: true,
        allowCoachFiring: true
      };
    }
    
    // Ensure version is set
    state.version = '4.0.0';
    
    return state;
  },
  
  /**
   * Compare version strings (returns -1, 0, or 1)
   */
  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;
      
      if (part1 < part2) return -1;
      if (part1 > part2) return 1;
    }
    
    return 0;
  },
  
  /**
   * Reset state to initial values.
   */
  reset() {
    console.log('Resetting state...');
    const newState = this.init();
    // Clear all properties on the existing global state object
    Object.keys(window.state).forEach(key => {
      delete window.state[key];
    });
    // Assign new properties
    Object.assign(window.state, newState);
    return window.state;
  }
};

// --- Persistence Functions ---

/**
 * Load game state from localStorage, validate, and migrate if necessary.
 * @returns {Object|null} Loaded state or null
 */
export function loadState() {
  try {
    console.log('Loading state...');
    
    const activeSlot = getActiveSaveSlot();
    const activeKey = saveKeyFor(activeSlot);
    let saved = window.localStorage.getItem(activeKey);
    let legacyKeyUsed = false;
    if (!saved) {
      // Migrate legacy single-save key if present
      saved = window.localStorage.getItem(SAVE_KEY_BASE);
      legacyKeyUsed = !!saved;
    }
    if (!saved) {
      console.log('No saved state found');
      return null;
    }
    
    const parsed = JSON.parse(saved);
    const validation = State.validate(parsed);
    
    let loadedState;
    
    // Show warnings if any
    if (validation.warnings && validation.warnings.length > 0) {
      console.warn('State validation warnings:', validation.warnings);
    }
    
    // Migrate if invalid, outdated, or has errors
    if (!validation.valid || parsed.version !== State.init().version || validation.errors.length > 0) {
      if (validation.errors.length > 0) {
        console.warn('Invalid state found, migrating...', validation.errors);
      } else {
        console.log('Outdated state version, migrating...');
      }
      loadedState = State.migrate(parsed);
      
      // Re-validate after migration
      const postMigrationValidation = State.validate(loadedState);
      if (!postMigrationValidation.valid) {
        console.error('State still invalid after migration:', postMigrationValidation.errors);
        // Try to salvage what we can
        loadedState = State.init();
      }
    } else {
      console.log('Valid state loaded');
      loadedState = parsed;
    }
    
    // Overwrite/initialize global state with loaded data
    window.state = window.state || State.init();
    Object.assign(window.state, loadedState, { saveSlot: activeSlot });

    if (legacyKeyUsed) {
      // Re-save into the active slot to migrate forward
      saveState(loadedState);
      try { window.localStorage.removeItem(SAVE_KEY_BASE); } catch (err) { /* ignore */ }
    }

    return window.state;
    
  } catch (error) {
    console.error('Error loading state:', error);
    return null;
  }
}

/**
 * Save the entire game state to localStorage.
 * @param {Object} stateToSave - State to save (optional, uses window.state by default)
 * @returns {boolean} Success status
 */
function optimizeResultsByWeek(resultsByWeek, keepBoxScoreWeeks = 1) {
  if (!resultsByWeek) return resultsByWeek;

  const keepCount = Math.max(0, Number(keepBoxScoreWeeks) || 0);

  if (Array.isArray(resultsByWeek)) {
    const lastIndex = resultsByWeek.length - 1;
    const keepFrom = lastIndex - keepCount + 1;

    return resultsByWeek.map((weekResults, index) => {
      if (!Array.isArray(weekResults)) return weekResults;
      const keepBoxScore = keepCount > 0 && index >= keepFrom;
      if (keepBoxScore) return weekResults;

      return weekResults.map(result => {
        if (!result || typeof result !== 'object' || !result.boxScore) return result;
        const { boxScore, ...rest } = result;
        return rest;
      });
    });
  }

  const entries = Object.entries(resultsByWeek);
  const numericKeys = entries
    .map(([key]) => Number(key))
    .filter(value => !Number.isNaN(value));
  const lastIndex = numericKeys.length ? Math.max(...numericKeys) : 0;
  const keepFrom = lastIndex - keepCount + 1;

  const optimizedEntries = entries.map(([key, weekResults]) => {
    if (!Array.isArray(weekResults)) return [key, weekResults];
    const weekIndex = Number(key);
    const keepBoxScore = keepCount > 0 && !Number.isNaN(weekIndex) && weekIndex >= keepFrom;
    if (keepBoxScore) return [key, weekResults];

    const trimmed = weekResults.map(result => {
      if (!result || typeof result !== 'object' || !result.boxScore) return result;
      const { boxScore, ...rest } = result;
      return rest;
    });

    return [key, trimmed];
  });

  return Object.fromEntries(optimizedEntries);
}

function prepareStateForSave(stateObj, { keepBoxScoreWeeks = 1 } = {}) {
  const league = stateObj?.league;
  if (!league?.resultsByWeek) {
    return stateObj;
  }

  const optimizedResults = optimizeResultsByWeek(league.resultsByWeek, keepBoxScoreWeeks);
  if (optimizedResults === league.resultsByWeek) {
    return stateObj;
  }

  return {
    ...stateObj,
    league: {
      ...league,
      resultsByWeek: optimizedResults
    }
  };
}

export function saveState(stateToSave = null, options = {}) {
  try {
    const stateObj = stateToSave || window.state;
    
    if (!stateObj) {
      console.error('No state object available to save');
      return false;
    }
    
    // Update save timestamp
    stateObj.lastSaved = new Date().toISOString();
    
    // Ensure current version is recorded
    if (!stateObj.version) stateObj.version = State.init().version;

    const stateForSave = prepareStateForSave(stateObj, {
      keepBoxScoreWeeks: options.keepBoxScoreWeeks ?? 1
    });
    const serialized = JSON.stringify(stateForSave);
    const activeSlot = stateObj.saveSlot || getActiveSaveSlot();
    const saveKey = saveKeyFor(activeSlot);
    window.localStorage.setItem(saveKey, serialized);

    
    console.log('State saved successfully');

    if (typeof window.setStatus === 'function') {
      window.setStatus('Game saved');
    }

    return true;

  } catch (error) {
    if (error?.name === 'QuotaExceededError') {
      console.warn('Save failed: storage quota exceeded');
      try {
        const fallbackState = prepareStateForSave(stateToSave || window.state, { keepBoxScoreWeeks: 0 });
        const fallbackSerialized = JSON.stringify(fallbackState);
        const activeSlot = (stateToSave || window.state)?.saveSlot || getActiveSaveSlot();
        const saveKey = saveKeyFor(activeSlot);
        window.localStorage.setItem(saveKey, fallbackSerialized);
        if (typeof window.setStatus === 'function') {
          window.setStatus('Save optimized: older box scores trimmed to free space.', 'success');
        }
        return true;
      } catch (fallbackError) {
        if (typeof window.setStatus === 'function') {
          window.setStatus('Save failed: storage is full. Clear a slot in Settings → Save Data, then try again.', 'error');
        }
        console.error('Save failed after optimization:', fallbackError);
      }
    } else {
      console.error('Error saving state:', error);
    }
    return false;
  }
}

/**
 * Clear saved game data from localStorage.
 */
export function clearSavedState(slot = null) {
  try {
    const activeSlot = getActiveSaveSlot();
    const normalizedSlot = slot ? normalizeSlot(slot) : activeSlot;
    const saveKey = saveKeyFor(normalizedSlot);
    window.localStorage.removeItem(saveKey);
    console.log('Saved state cleared for slot', normalizedSlot);
    // Optional: Reset in-memory state after clearing save
    if (normalizedSlot === activeSlot) {
      State.reset();
    }
  } catch (err) {
    console.error('Error clearing save:', err);
  }
}

/**
 * Set up an automatic save when the user closes the tab/window.
 */
export function hookAutoSave() {
  // Only hook if setting is enabled, if it exists
  if (!window.state || window.state.settings?.autoSave !== false) {
    window.addEventListener('beforeunload', function () {
      try {
        saveState();
      } catch (err) {
        // swallow; user is leaving anyway
      }
    });
    console.log('Auto-save hook installed');
  }
}

export function getSaveMetadata(slot) {
  const normalized = normalizeSlot(slot);
  const key = saveKeyFor(normalized);
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      slot: normalized,
      lastSaved: parsed.lastSaved || null,
      team: parsed.league?.teams?.[parsed.userTeamId || 0]?.name || null,
      season: parsed.season || 1,
      mode: parsed.namesMode || 'fictional'
    };
  } catch (err) {
    console.warn('Could not parse save metadata for slot', normalized, err);
    return null;
  }
}

export function listSaveSlots() {
  const slots = [];
  for (let i = 1; i <= MAX_SAVE_SLOTS; i++) {
    slots.push(getSaveMetadata(i));
  }
  return slots;
}

// --- UI/Helper Functions ---

/**
 * Get current team based on user selection
 */
export function currentTeam() {
  const L = window.state?.league;
  if (!L || !L.teams) return null;
  
  const teamId = window.state.userTeamId || window.state.player?.teamId || 0;
  return L.teams[teamId] || null;
}

/**
 * Get teams by conference
 */
export function getTeamsByConference(conference) {
  const L = window.state?.league;
  if (!L || !L.teams) return [];
  
  return L.teams.filter(team => team.conf === conference);
}

/**
 * Get teams by division
 */
export function getTeamsByDivision(conference, division) {
  const L = window.state?.league;
  if (!L || !L.teams) return [];
  
  return L.teams.filter(team => team.conf === conference && team.div === division);
}

// Export utility functions
export { getActiveSaveSlot, setActiveSaveSlot, saveKeyFor };

// --- Backward Compatibility & Initialization ---

/**
 * Initialize the global state object if it doesn't exist.
 * Attempt to load a saved game first.
 */
function initializeGlobalState() {
  if (!window.state) {
    // Try to load state first
    const loaded = loadState(); 
    if (!loaded) {
        console.log('Creating initial global state (no save found)...');
        window.state = State.init();
    }
  } else {
    console.log('Global state already exists, skipping initialization.');
  }
}

// Initialize state immediately (attempts load first)
initializeGlobalState();

// Expose functions globally for backward compatibility
// TODO: Remove these once all code is migrated to ES modules
window.State = State;
window.loadState = loadState;
window.saveState = saveState;
window.clearSavedState = clearSavedState;
window.hookAutoSave = hookAutoSave;
window.getActiveSaveSlot = getActiveSaveSlot;
window.setActiveSaveSlot = setActiveSaveSlot;
window.saveKeyFor = saveKeyFor;
window.getSaveMetadata = getSaveMetadata;
window.listSaveSlots = listSaveSlots;

window.currentTeam = currentTeam;
window.getTeamsByConference = getTeamsByConference;
window.getTeamsByDivision = getTeamsByDivision;

// Legacy aliases
window.saveLeague = saveState; // New games should use saveState
window.loadLeague = loadState; // New games should use loadState

// Install autosave hook
hookAutoSave();

// Expose name arrays for generation (if they were not globally defined already)
window.FIRST_NAMES = window.FIRST_NAMES || FIRST_NAMES;
window.LAST_NAMES = window.LAST_NAMES || LAST_NAMES;

console.log('✅ State-Save Manager loaded. Full state persistence is active.');
