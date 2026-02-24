/**
 * db/cache.js  —  In-worker in-memory cache
 *
 * Lives entirely inside the Web Worker.  The UI thread never touches this.
 *
 * Design:
 *  - Hot data (current season, active rosters, player map) stays in RAM
 *  - Historical seasons use a size-bounded LRU map (default: last 5 seasons)
 *  - A dirty-tracking set tells the worker what needs to be flushed to IndexedDB
 *  - Hard memory budget enforced by pruning the LRU when it fills up
 *
 * Lifecycle:
 *  1. Worker boots → loadFromDB() fills hot data
 *  2. Game logic reads/mutates hot data in place (zero DB round-trips)
 *  3. At end of each week the worker calls flushDirty() to persist changes
 *  4. At end of each season the worker calls archiveSeason() to move season
 *     data into the LRU and wipe per-game stats from RAM
 *
 * Memory budget (rough estimate per season):
 *  - 32 teams × ~55 players = ~1760 player objects ≈ 1–2 MB raw
 *  - ~272 games per season (18 reg + playoffs) ≈ 0.5 MB
 *  - Season summary ≈ 20 KB
 *  Total hot: < 3 MB.  With LRU of 5 seasons: < 15 MB — safe for 200+ seasons.
 */

// ── LRU helper ───────────────────────────────────────────────────────────────

/**
 * Minimal LRU cache backed by a Map (insertion-order preserved in JS).
 * When capacity is exceeded the oldest entry is evicted.
 */
class LRU {
  constructor(capacity = 5) {
    this._cap = capacity;
    this._map = new Map();
  }

  get(key) {
    if (!this._map.has(key)) return undefined;
    // refresh (move to end)
    const val = this._map.get(key);
    this._map.delete(key);
    this._map.set(key, val);
    return val;
  }

  set(key, value) {
    if (this._map.has(key)) this._map.delete(key);
    this._map.set(key, value);
    if (this._map.size > this._cap) {
      // evict oldest (first entry)
      const oldest = this._map.keys().next().value;
      this._map.delete(oldest);
    }
  }

  has(key)    { return this._map.has(key); }
  delete(key) { this._map.delete(key); }
  keys()      { return this._map.keys(); }
  get size()  { return this._map.size; }

  /** Evict all entries. */
  clear() { this._map.clear(); }
}

// ── Cache state ──────────────────────────────────────────────────────────────

// ---- Hot (current season) ----

/** League-level metadata (id, userTeamId, phase, currentSeasonId, currentWeek, settings) */
let _meta = null;

/** Map<teamId, teamObject> — full team objects including current-season stats */
const _teams = new Map();

/** Map<playerId, playerObject> — all active (non-retired) players */
const _players = new Map();

/**
 * Current week's games (array of game result objects).
 * Reset to [] at the start of each new week.
 */
let _weekGames = [];

/**
 * Per-player season stat accumulators for the current season.
 * Map<playerId, { seasonId, playerId, teamId, totals: {} }>
 */
const _seasonStats = new Map();

/** Draft picks for current / upcoming years.  Map<pickId, pick> */
const _draftPicks = new Map();

// ---- Cold (recent history, LRU-bounded) ----

/**
 * LRU of past season summaries.
 * Key = seasonId, Value = { id, year, champion, standings[], awards, ... }
 */
const _historyLRU = new LRU(5);

// ---- Dirty tracking ----

/**
 * Sets of keys that have been mutated and need flushing to IndexedDB.
 * Keys match what the DB layer expects:
 *   teams:       teamId
 *   players:     playerId
 *   games:       game objects (stored as array for bulk flush)
 *   seasonStats: `${seasonId}_${playerId}`
 *   draftPicks:  pickId
 *   meta:        'league' (singleton)
 */
const _dirty = {
  meta:        false,
  teams:       new Set(),
  players:     new Set(),
  games:       [],          // accumulates game objects until flush
  seasonStats: new Set(),
  draftPicks:  new Set(),
};

// ── Read accessors ────────────────────────────────────────────────────────────

export const cache = {

  // --- Meta ---

  getMeta:           ()    => _meta,
  setMeta:           (m)   => { _meta = { ..._meta, ...m }; _dirty.meta = true; },
  getCurrentSeasonId:()    => _meta?.currentSeasonId ?? null,
  getCurrentWeek:    ()    => _meta?.currentWeek ?? 1,
  getPhase:          ()    => _meta?.phase ?? 'regular',
  getUserTeamId:     ()    => _meta?.userTeamId ?? null,

  // --- Teams ---

  getTeam:      (id)    => _teams.get(id) ?? null,
  getAllTeams:   ()      => [..._teams.values()],
  setTeam:      (team)  => {
    _teams.set(team.id, team);
    _dirty.teams.add(team.id);
  },
  updateTeam:   (id, patch) => {
    const t = _teams.get(id);
    if (!t) return;
    Object.assign(t, patch);
    _dirty.teams.add(id);
  },

  // --- Players ---

  getPlayer:    (id)     => _players.get(id) ?? null,
  getAllPlayers: ()       => [..._players.values()],
  getPlayersByTeam: (teamId) => [..._players.values()].filter(p => p.teamId === teamId),
  setPlayer:    (player) => {
    _players.set(player.id, player);
    _dirty.players.add(player.id);
  },
  removePlayer: (id)     => {
    _players.delete(id);
    _dirty.players.add(id);          // will be a delete operation during flush
  },
  updatePlayer: (id, patch) => {
    const p = _players.get(id);
    if (!p) return;
    Object.assign(p, patch);
    _dirty.players.add(id);
  },

  // --- Weekly games ---

  getWeekGames:  ()      => _weekGames,
  addGame:       (game)  => {
    _weekGames.push(game);
    _dirty.games.push(game);
  },
  clearWeekGames:()      => { _weekGames = []; },

  // --- Season stats ---

  getSeasonStat:    (playerId) => _seasonStats.get(playerId) ?? null,
  /** Non-destructive read of all current-season stat entries. */
  getAllSeasonStats: ()        => [..._seasonStats.values()],
  updateSeasonStat: (playerId, teamId, partialTotals) => {
    const seasonId = _meta?.currentSeasonId;
    if (!seasonId) return;
    let entry = _seasonStats.get(playerId);
    if (!entry) {
      entry = { seasonId, playerId, teamId, totals: {} };
      _seasonStats.set(playerId, entry);
    }
    // Merge totals (numeric accumulation)
    for (const [k, v] of Object.entries(partialTotals)) {
      entry.totals[k] = (entry.totals[k] ?? 0) + v;
    }
    _dirty.seasonStats.add(playerId);
  },

  // --- Draft picks ---

  getDraftPick:    (id)      => _draftPicks.get(id) ?? null,
  getAllDraftPicks: ()        => [..._draftPicks.values()],
  setDraftPick:    (pick)    => {
    _draftPicks.set(pick.id, pick);
    _dirty.draftPicks.add(pick.id);
  },
  removeDraftPick: (id)      => {
    _draftPicks.delete(id);
    _dirty.draftPicks.add(id);       // signals delete during flush
  },

  // --- History LRU ---

  getHistorySeason: (seasonId) => _historyLRU.get(seasonId),
  setHistorySeason: (seasonId, data) => _historyLRU.set(seasonId, data),

  // ── Dirty tracking ─────────────────────────────────────────────────────────

  /** Returns a snapshot of what needs persisting, then clears dirty flags. */
  drainDirty() {
    const snapshot = {
      meta:        _dirty.meta,
      teams:       [..._dirty.teams],
      players:     [..._dirty.players],
      games:       [..._dirty.games],
      seasonStats: [..._dirty.seasonStats],
      draftPicks:  [..._dirty.draftPicks],
    };
    _dirty.meta = false;
    _dirty.teams.clear();
    _dirty.players.clear();
    _dirty.games.length = 0;
    _dirty.seasonStats.clear();
    _dirty.draftPicks.clear();
    return snapshot;
  },

  isDirty() {
    return (
      _dirty.meta ||
      _dirty.teams.size > 0 ||
      _dirty.players.size > 0 ||
      _dirty.games.length > 0 ||
      _dirty.seasonStats.size > 0 ||
      _dirty.draftPicks.size > 0
    );
  },

  // ── Bootstrap / archive helpers ────────────────────────────────────────────

  /**
   * Hydrate the cache from DB-loaded objects.
   * Called once at worker startup.
   */
  hydrate({ meta, teams, players, draftPicks } = {}) {
    if (meta)       { _meta = meta; }
    if (teams)      { _teams.clear(); teams.forEach(t => _teams.set(t.id, t)); }
    if (players)    { _players.clear(); players.forEach(p => _players.set(p.id, p)); }
    if (draftPicks) { _draftPicks.clear(); draftPicks.forEach(dp => _draftPicks.set(dp.id, dp)); }
    _weekGames = [];
    _seasonStats.clear();
    // Do NOT mark anything dirty — data just came from DB
  },

  /**
   * Archive the current season's stat accumulators and return them
   * as an array ready for DB bulk-insert.  Clears RAM after archiving.
   */
  archiveSeasonStats() {
    const rows = [..._seasonStats.values()];
    _seasonStats.clear();
    return rows;
  },

  /**
   * Reset everything (used when starting a brand-new league or resetting save).
   */
  reset() {
    _meta = null;
    _teams.clear();
    _players.clear();
    _weekGames = [];
    _seasonStats.clear();
    _draftPicks.clear();
    _historyLRU.clear();
    _dirty.meta = false;
    _dirty.teams.clear();
    _dirty.players.clear();
    _dirty.games.length = 0;
    _dirty.seasonStats.clear();
    _dirty.draftPicks.clear();
  },

  /** Diagnostic: approximate item count per bucket */
  stats() {
    return {
      teams:       _teams.size,
      players:     _players.size,
      seasonStats: _seasonStats.size,
      draftPicks:  _draftPicks.size,
      historyLRU:  _historyLRU.size,
      pendingGames: _dirty.games.length,
    };
  },
};
