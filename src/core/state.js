// state.js — legacy state compatibility module (quarantined).
//
// The worker (src/worker/worker.js + IndexedDB cache) is the authoritative
// league state; UI mutations flow through useWorker actions. This module
// remains only for legacy schema validation/migration and the localStorage
// save path. It must not install globals at import time:
//   - window.state access goes through src/state/legacyStateBridge.js
//   - save slot storage lives in src/state/saveSlotStorage.js
//   - stat schemas live in src/state/statsSchema.js
//   - async stringify lives in src/state/stringifyWorkerClient.js

// Import dependencies
import { Constants } from './constants.js';
import { ensureFaceConfig } from './face.js';
import { determineInitialPersona } from './ai/frontOfficePersonaEngine.js';
import {
  buildOwnerProfile,
  determineInitialMandate,
} from './meta/ownerPressureEngine.js';
import { getZeroStats, getZeroTeamStats } from '../state/statsSchema.js';
import {
  normalizeSlot,
  getActiveSaveSlot,
  saveKeyFor,
  SAVE_KEY_BASE,
} from '../state/saveSlotStorage.js';
import {
  getLegacyState,
  setLegacyState,
  patchLegacyState,
  resetLegacyState,
  getLegacySaveDelegate,
} from '../state/legacyStateBridge.js';
import { asyncStringify } from '../state/stringifyWorkerClient.js';

// Legacy mutable export. Stays null until loadState()/State.reset() runs —
// nothing is installed eagerly at import time anymore.
export let state = null;

// --- Configuration Variables ---
const C = Constants;
const YEAR_START = (C.GAME_CONFIG && C.GAME_CONFIG.YEAR_START) || 2025;

const DefaultGameState = {
  season: 2024,
  week: 1,
  salaryCap: 255000000,
  currentFunds: 10000000,
  deadCap: 0
};

// Game Routes (used for UI)
const routes = [
  'hub', 'roster', 'cap', 'schedule', 'standings', 'trade', 'freeagency',
  'draft', 'playoffs', 'settings', 'hallOfFame', 'scouting'
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


    const freshState = {
      // Core game data
      league: null,
      season: DefaultGameState.season, // Use DefaultGameState
      week: DefaultGameState.week, // Use DefaultGameState
      year: YEAR_START,

      // Financial defaults
      salaryCap: DefaultGameState.salaryCap,
      currentFunds: DefaultGameState.currentFunds,
      deadCap: DefaultGameState.deadCap,

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
      weeklyDevelopmentLog: [],
      developmentModel: {
        version: 1,
        lastEvolutionStamp: null,
      },

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

    if (league.week !== undefined && (typeof league.week !== 'number' || league.week < 1 || league.week > 25)) {
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

      migratedTeam.fanApproval = migratedTeam?.fanApproval ?? 50;
      migratedTeam.franchiseInvestments = migratedTeam?.franchiseInvestments ?? {
        stadiumLevel: 1,
        concessionsStrategy: 'balanced',
        trainingLevel: 1,
        scoutingLevel: 1,
        scoutingRegion: 'national',
        ownerCapacity: 10,
        usedCapacity: 4,
        trainingFocus: 'balanced',
        history: [],
      };
      migratedTeam.rivalTeamId = migratedTeam?.rivalTeamId ?? null;
      migratedTeam.weeklyDevelopmentFocus = migratedTeam?.weeklyDevelopmentFocus ?? null;
      migratedTeam.roster = migratedTeam.roster.map((player) => ({
        ...player,
        attributeXp: player?.attributeXp ?? {},
        growthHistory: Array.isArray(player?.growthHistory) ? player.growthHistory : [],
        lastEvolutionWeek: player?.lastEvolutionWeek ?? null,
      }));
      if (migratedTeam.staff && typeof migratedTeam.staff === 'object') {
        Object.keys(migratedTeam.staff).forEach((key) => {
          if (migratedTeam.staff[key] && typeof migratedTeam.staff[key] === 'object') {
            migratedTeam.staff[key] = ensureFaceConfig(migratedTeam.staff[key], 'staff');
          }
        });
      }

      // Ensure team stats are initialized
      if (!migratedTeam.stats) {
        migratedTeam.stats = { season: getZeroTeamStats(), game: getZeroTeamStats() };
      }

      // Migrate player structures if needed
      migratedTeam.roster = migratedTeam.roster.map(player => {
        if (!player || typeof player !== 'object') return null;

        // Ensure player has required properties
        const migratedPlayer = { ...player };
        if (!migratedPlayer.id) {
          migratedPlayer.id = `migrated_${Date.now()}_${(window.Utils?.random || Math.random)()}`;
        }

        // Initialize or fix player stats
        if (!migratedPlayer.stats) {
          migratedPlayer.stats = {
            game: getZeroStats(),
            season: getZeroStats(),
            career: getZeroStats()
          };
        } else {
          // Ensure sub-objects exist and have default values if empty
          if (!migratedPlayer.stats.game) migratedPlayer.stats.game = getZeroStats();
          if (!migratedPlayer.stats.season) migratedPlayer.stats.season = getZeroStats();
          else if (Object.keys(migratedPlayer.stats.season).length === 0) migratedPlayer.stats.season = getZeroStats();

          if (!migratedPlayer.stats.career) migratedPlayer.stats.career = getZeroStats();
          else if (Object.keys(migratedPlayer.stats.career).length === 0) migratedPlayer.stats.career = getZeroStats();
        }

        return ensureFaceConfig(migratedPlayer, 'player');
      }).filter(p => p !== null);

      return migratedTeam;
    }).filter(t => t !== null);

    migrated.newsItems = migrated?.newsItems ?? [];
    migrated.ownerGoals = migrated?.ownerGoals ?? [];
    migrated.retiredPlayers = migrated?.retiredPlayers ?? [];

    // ── Franchise Legacy — Ring of Honor & All-Time Leaders ─────────────────
    // Backward-compatible: old saves get empty/null safe defaults per team.
    migrated.teams = migrated.teams.map((team) => {
      if (!team) return team;
      const t = { ...team };
      if (!Array.isArray(t.ringOfHonor)) t.ringOfHonor = [];
      if (!t.allTimeLeaders || typeof t.allTimeLeaders !== 'object') {
        t.allTimeLeaders = { passingYards: null, rushingYards: null, receivingYards: null, sacks: null };
      } else {
        t.allTimeLeaders = {
          passingYards:   t.allTimeLeaders.passingYards   ?? null,
          rushingYards:   t.allTimeLeaders.rushingYards   ?? null,
          receivingYards: t.allTimeLeaders.receivingYards ?? null,
          sacks:          t.allTimeLeaders.sacks          ?? null,
        };
      }
      return t;
    });

    // ── Team Identity — Retired Numbers & Championship Years ─────────────────
    // Backward-compatible: old saves hydrate safely with empty arrays.
    migrated.teams = migrated.teams.map((team) => {
      if (!team) return team;
      const t = { ...team };
      if (!Array.isArray(t.retiredNumbers)) t.retiredNumbers = [];
      if (!Array.isArray(t.championshipYears)) t.championshipYears = [];
      return t;
    });

    // ── Owner Mandate — deterministic hydration for old saves ────────────────
    // Backward-compatible: old saves get a safe owner profile derived from real
    // team signals. Same save always derives the same initial mandate.
    migrated.teams = migrated.teams.map((team) => {
      if (!team) return team;
      if (team.owner && typeof team.owner === 'object' && team.owner.mandate) return team;
      const mandate = determineInitialMandate(team, { allTeams: migrated.teams });
      return { ...team, owner: buildOwnerProfile(mandate) };
    });

    // ── User franchise termination flag — backward-compatible default ────────
    migrated.userFranchiseTerminated = migrated.userFranchiseTerminated ?? false;

    // ── Front Office Persona — deterministic hydration for old saves ──────────
    // Never random-assigned; same save always derives the same initial persona.
    migrated.teams = migrated.teams.map((team) => {
      if (!team) return team;
      if (team.frontOffice && typeof team.frontOffice === 'object' && team.frontOffice.persona) {
        return team;
      }
      return {
        ...team,
        frontOffice: determineInitialPersona(team, { allTeams: migrated.teams }),
      };
    });

    // ── History Ledger & Record Book (historyEngine schema) ─────────────────
    // Backward-compatible: old saves hydrate safely with empty/null defaults.
    migrated.historyLedger = Array.isArray(migrated.historyLedger)
      ? migrated.historyLedger
      : [];
    if (!migrated.recordBook || typeof migrated.recordBook !== 'object') {
      migrated.recordBook = {};
    }
    if (!migrated.recordBook.singleGame || typeof migrated.recordBook.singleGame !== 'object') {
      migrated.recordBook = {
        ...migrated.recordBook,
        singleGame: { passingYards: null, passingTds: null, rushingYards: null, sacks: null },
      };
    }
    if (!migrated.recordBook.singleSeasonBests || typeof migrated.recordBook.singleSeasonBests !== 'object') {
      migrated.recordBook = {
        ...migrated.recordBook,
        singleSeasonBests: { passingYards: null, passingTds: null, rushingYards: null, sacks: null },
      };
    }

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
   * Legacy consumers hold references to the global state object, so the
   * bridge clears it in place rather than swapping the object identity.
   */
  reset() {
    state = resetLegacyState(() => this.init());
    return state;
  }
};

// --- Persistence Functions ---

/**
 * Load game state from localStorage, validate, and migrate if necessary.
 * @returns {Object|null} Loaded state or null
 */
export async function loadState() {
  try {


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

      loadedState = parsed;
    }

    // Overwrite/initialize global state with loaded data (bridge-managed)
    setLegacyState(getLegacyState() || State.init());
    state = patchLegacyState({ ...loadedState, saveSlot: activeSlot });

    if (legacyKeyUsed) {
      // Re-save into the active slot to migrate forward
      saveState(loadedState);
      try { window.localStorage.removeItem(SAVE_KEY_BASE); } catch (err) { /* ignore */ }
    }

    return state;

  } catch (error) {
    console.error('Error loading state:', error);
    return null;
  }
}

/**
 * Save the entire game state to localStorage.
 * @param {Object} stateToSave - State to save (optional, uses legacy global state by default)
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
  // Prevent function cloning error by removing pendingEvent from saved state
  if (stateObj.pendingEvent) {
      const { pendingEvent, ...rest } = stateObj;
      stateObj = rest;
  }

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

export async function saveState(stateToSave = null, options = {}) {
  try {
    const stateObj = stateToSave || getLegacyState();


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

    // Use Dashboard Save System if available (read via the legacy bridge).
    // This ensures auto-saves via beforeunload go to the same DB as manual
    // saves, and avoids main-thread serialization blocking.
    const legacySaveDelegate = getLegacySaveDelegate();
    if (legacySaveDelegate && !options.legacyOnly) {
        // Pass object directly to the delegate - do NOT stringify here
        await legacySaveDelegate(stateForSave, options);
        return true;
    }

    // Use worker-based JSON stringify to avoid main-thread UI freeze
    const serialized = await asyncStringify(stateForSave);

    const activeSlot = stateObj.saveSlot || getActiveSaveSlot();
    const saveKey = saveKeyFor(activeSlot);
    window.localStorage.setItem(saveKey, serialized);




    if (typeof window.setStatus === 'function') {
      window.setStatus('Game saved');
    }

    return true;

  } catch (error) {
    if (error?.name === 'QuotaExceededError') {
      console.warn('Save failed: storage quota exceeded');
      try {
        const fallbackState = prepareStateForSave(stateToSave || getLegacyState(), { keepBoxScoreWeeks: 0 });
        const fallbackSerialized = await asyncStringify(fallbackState);
        const activeSlot = (stateToSave || getLegacyState())?.saveSlot || getActiveSaveSlot();
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
 * No longer installed at import time — legacy callers must opt in explicitly.
 */

// --- UI/Helper Functions ---

/**
 * Get current team based on user selection
 */
export function currentTeam() {
  const legacyState = getLegacyState();
  const L = legacyState?.league;
  if (!L || !L.teams) return null;

  const teamId = legacyState.userTeamId || legacyState.player?.teamId || 0;
  return L.teams[teamId] || null;
}

/**
 * Get teams by conference
 */
export function getTeamsByConference(conference) {
  const L = getLegacyState()?.league;
  if (!L || !L.teams) return [];

  return L.teams.filter(team => team.conf === conference);
}

/**
 * Get teams by division
 */
export function getTeamsByDivision(conference, division) {
  const L = getLegacyState()?.league;
  if (!L || !L.teams) return [];

  return L.teams.filter(team => team.conf === conference && team.div === division);
}

// Legacy compat: coaching.js still calls window.currentTeam(). This installs
// a plain read helper, not global state — remove once coaching imports it.
if (typeof window !== 'undefined') {
    window.currentTeam = currentTeam;
}

// Re-export extracted helpers so legacy imports of this module keep working.
export { getZeroStats } from '../state/statsSchema.js';
export {
  getActiveSaveSlot,
  setActiveSaveSlot,
  saveKeyFor,
  getSaveMetadata,
  listSaveSlots,
} from '../state/saveSlotStorage.js';

export const init = State.init;
