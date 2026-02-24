/**
 * db/index.js
 *
 * IndexedDB abstraction layer for Football GM.
 *
 * Schema design goals:
 *  - Separate stores so we never read/write the full league blob
 *  - Historical seasons are only touched when the user browses history
 *  - Current-season data is mirrored in worker memory (cache.js) and
 *    flushed to DB at end of each week / phase boundary
 *  - Supports 200+ seasons without noticeable size growth in hot paths
 *
 * Store layout:
 *
 *  meta          { id, userTeamId, currentSeasonId, currentWeek, phase, settings }
 *  teams         { id, name, abbr, conf, div, ovr, strategy, history[] }
 *  players       { id, name, pos, age, ovr, potential, attributes, contract, teamId }
 *  rosters       { id=`${seasonId}_${teamId}`, seasonId, teamId, playerIds[], capUsed }
 *  games         { id, seasonId, week, homeId, awayId, homeScore, awayScore, stats }
 *  seasons       { id=seasonId, year, champion, mvp, standings[], awards, leagueLeaders }
 *  playerStats   { id=`${seasonId}_${playerId}`, seasonId, playerId, teamId, totals{} }
 *  transactions  { id, seasonId, week, type, teamId, details }
 *  draftPicks    { id, originalOwner, currentOwner, round, year, playerId? }
 */

const DB_NAME    = 'FootballGM_v1';
const DB_VERSION = 3;

const STORES = {
  META:          'meta',
  TEAMS:         'teams',
  PLAYERS:       'players',
  ROSTERS:       'rosters',
  GAMES:         'games',
  SEASONS:       'seasons',
  PLAYER_STATS:  'playerStats',
  TRANSACTIONS:  'transactions',
  DRAFT_PICKS:   'draftPicks',
  NEWS:          'news',
};

// ── Open / upgrade ───────────────────────────────────────────────────────────

/** Persistent singleton — never closed except on versionchange or unexpected disconnect. */
let _db = null;
/** In-flight open promise — prevents concurrent indexedDB.open() races. */
let _opening = null;

export function openDB() {
  // Fast path: connection is already open and healthy.
  if (_db) return Promise.resolve(_db);
  // If a previous call is already opening, return the same promise so all
  // concurrent callers share a single IDBOpenDBRequest.
  if (_opening) return _opening;

  _opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => {
      _opening = null;
      reject(req.error);
    };
    req.onsuccess = () => {
      _db      = req.result;
      _opening = null;
      // Another context (tab) requested a version upgrade — yield gracefully.
      _db.onversionchange = () => { _db.close(); _db = null; };
      // Null out the singleton whenever the connection is closed for any reason
      // so the next openDB() call transparently re-establishes it.
      _db.onclose = () => { _db = null; };
      resolve(_db);
    };

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      // meta — single row keyed by 'league'
      if (!db.objectStoreNames.contains(STORES.META)) {
        db.createObjectStore(STORES.META, { keyPath: 'id' });
      }

      // teams — keyed by team id
      if (!db.objectStoreNames.contains(STORES.TEAMS)) {
        db.createObjectStore(STORES.TEAMS, { keyPath: 'id' });
      }

      // players — keyed by player id
      if (!db.objectStoreNames.contains(STORES.PLAYERS)) {
        const ps = db.createObjectStore(STORES.PLAYERS, { keyPath: 'id' });
        ps.createIndex('teamId',   'teamId',   { unique: false });
        ps.createIndex('position', 'pos',      { unique: false });
      }

      // rosters — keyed by `${seasonId}_${teamId}`, indexed by seasonId
      if (!db.objectStoreNames.contains(STORES.ROSTERS)) {
        const rs = db.createObjectStore(STORES.ROSTERS, { keyPath: 'id' });
        rs.createIndex('seasonId', 'seasonId', { unique: false });
        rs.createIndex('teamId',   'teamId',   { unique: false });
      }

      // games — keyed by game id, indexed by season + week
      if (!db.objectStoreNames.contains(STORES.GAMES)) {
        const gs = db.createObjectStore(STORES.GAMES, { keyPath: 'id' });
        gs.createIndex('seasonId', 'seasonId', { unique: false });
        gs.createIndex('week',     'week',     { unique: false });
        gs.createIndex('homeId',   'homeId',   { unique: false });
        gs.createIndex('awayId',   'awayId',   { unique: false });
      }

      // seasons — one summary row per completed season
      if (!db.objectStoreNames.contains(STORES.SEASONS)) {
        const ss = db.createObjectStore(STORES.SEASONS, { keyPath: 'id' });
        ss.createIndex('year', 'year', { unique: false });
      }

      // playerStats — keyed by `${seasonId}_${playerId}`
      if (!db.objectStoreNames.contains(STORES.PLAYER_STATS)) {
        const pss = db.createObjectStore(STORES.PLAYER_STATS, { keyPath: 'id' });
        pss.createIndex('seasonId', 'seasonId', { unique: false });
        pss.createIndex('playerId', 'playerId', { unique: false });
      }

      // transactions
      if (!db.objectStoreNames.contains(STORES.TRANSACTIONS)) {
        const ts = db.createObjectStore(STORES.TRANSACTIONS, { keyPath: 'id', autoIncrement: true });
        ts.createIndex('seasonId', 'seasonId', { unique: false });
        ts.createIndex('teamId',   'teamId',   { unique: false });
      }

      // draftPicks
      if (!db.objectStoreNames.contains(STORES.DRAFT_PICKS)) {
        const dp = db.createObjectStore(STORES.DRAFT_PICKS, { keyPath: 'id' });
        dp.createIndex('currentOwner', 'currentOwner', { unique: false });
        dp.createIndex('year',         'year',         { unique: false });
      }

      // news
      if (!db.objectStoreNames.contains(STORES.NEWS)) {
        const ns = db.createObjectStore(STORES.NEWS, { keyPath: 'id', autoIncrement: true });
        ns.createIndex('seasonId', 'seasonId', { unique: false });
        ns.createIndex('week',     'week',     { unique: false });
        ns.createIndex('type',     'type',     { unique: false });
        ns.createIndex('teamId',   'teamId',   { unique: false });
      }
    };
  });

  return _opening;
}

// ── Generic helpers ──────────────────────────────────────────────────────────

/** Execute a transaction and return a promise that resolves with the result. */
function txOp(storeName, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], mode);
    const store = transaction.objectStore(storeName);
    transaction.onerror = () => reject(transaction.error);
    fn(store, resolve, reject);
  }));
}

function dbGet(storeName, key) {
  return txOp(storeName, 'readonly', (store, resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

function dbPut(storeName, value) {
  return txOp(storeName, 'readwrite', (store, resolve, reject) => {
    const req = store.put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function dbDel(storeName, key) {
  return txOp(storeName, 'readwrite', (store, resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/** Get all records from a store (use sparingly – for small stores only) */
function dbGetAll(storeName) {
  return txOp(storeName, 'readonly', (store, resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** Get all records matching an index value */
function dbGetAllByIndex(storeName, indexName, value) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const req = index.getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}

/**
 * Bulk-put an array of records in a single transaction.
 * Much faster than calling put() in a loop.
 */
function dbPutBulk(storeName, records) {
  if (!records || records.length === 0) return Promise.resolve();
  return openDB().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    transaction.oncomplete = () => resolve();
    transaction.onerror    = () => reject(transaction.error);
    for (const record of records) {
      store.put(record);
    }
  }));
}

// ── Public API ───────────────────────────────────────────────────────────────

// --- Meta ---

export const Meta = {
  load: ()     => dbGet(STORES.META, 'league'),
  save: (meta) => dbPut(STORES.META, { ...meta, id: 'league' }),
};

// --- Teams ---

export const Teams = {
  load:     (id)    => dbGet(STORES.TEAMS, id),
  loadAll:  ()      => dbGetAll(STORES.TEAMS),
  save:     (team)  => dbPut(STORES.TEAMS, team),
  saveBulk: (teams) => dbPutBulk(STORES.TEAMS, teams),
};

// --- Players ---

export const Players = {
  load:     (id)     => dbGet(STORES.PLAYERS, id),
  loadAll:  ()       => dbGetAll(STORES.PLAYERS),
  byTeam:   (teamId) => dbGetAllByIndex(STORES.PLAYERS, 'teamId', teamId),
  save:     (player) => dbPut(STORES.PLAYERS, player),
  saveBulk: (pls)    => dbPutBulk(STORES.PLAYERS, pls),
  delete:   (id)     => dbDel(STORES.PLAYERS, id),
};

// --- Rosters ---

export const Rosters = {
  id:      (seasonId, teamId) => `${seasonId}_${teamId}`,
  load:    (seasonId, teamId) => dbGet(STORES.ROSTERS, `${seasonId}_${teamId}`),
  bySeason:(seasonId)         => dbGetAllByIndex(STORES.ROSTERS, 'seasonId', seasonId),
  save:    (roster)           => dbPut(STORES.ROSTERS, { ...roster, id: `${roster.seasonId}_${roster.teamId}` }),
};

// --- Games ---

export const Games = {
  load:         (id)       => dbGet(STORES.GAMES, id),
  save:         (game)     => dbPut(STORES.GAMES, game),
  saveBulk:     (games)    => dbPutBulk(STORES.GAMES, games),
  bySeason:     (seasonId) => dbGetAllByIndex(STORES.GAMES, 'seasonId', seasonId),
  bySeasonWeek: (seasonId, week) =>
    dbGetAllByIndex(STORES.GAMES, 'seasonId', seasonId).then(gs => gs.filter(g => g.week === week)),
};

// --- Seasons ---

export const Seasons = {
  load:       (id) => dbGet(STORES.SEASONS, id),
  loadAll:    ()   => dbGetAll(STORES.SEASONS),
  save:       (s)  => dbPut(STORES.SEASONS, s),
  loadRecent: (n)  => dbGetAll(STORES.SEASONS).then(all =>
    all.sort((a, b) => b.year - a.year).slice(0, n)
  ),
};

// --- Player Stats ---

export const PlayerStats = {
  id:       (seasonId, playerId) => `${seasonId}_${playerId}`,
  load:     (seasonId, playerId) => dbGet(STORES.PLAYER_STATS, `${seasonId}_${playerId}`),
  bySeason: (seasonId)           => dbGetAllByIndex(STORES.PLAYER_STATS, 'seasonId', seasonId),
  byPlayer: (playerId)           => dbGetAllByIndex(STORES.PLAYER_STATS, 'playerId', playerId),
  save:     (stat)               => dbPut(STORES.PLAYER_STATS, {
    ...stat, id: `${stat.seasonId}_${stat.playerId}`
  }),
  saveBulk: (stats) => dbPutBulk(STORES.PLAYER_STATS, stats),
};

// --- Transactions ---

export const Transactions = {
  add:      (tx)       => dbPut(STORES.TRANSACTIONS, tx),
  bySeason: (seasonId) => dbGetAllByIndex(STORES.TRANSACTIONS, 'seasonId', seasonId),
  byTeam:   (teamId)   => dbGetAllByIndex(STORES.TRANSACTIONS, 'teamId',   teamId),
};

// --- Draft Picks ---

export const DraftPicks = {
  load:     (id)     => dbGet(STORES.DRAFT_PICKS, id),
  save:     (pick)   => dbPut(STORES.DRAFT_PICKS, pick),
  saveBulk: (picks)  => dbPutBulk(STORES.DRAFT_PICKS, picks),
  byOwner:  (teamId) => dbGetAllByIndex(STORES.DRAFT_PICKS, 'currentOwner', teamId),
  byYear:   (year)   => dbGetAllByIndex(STORES.DRAFT_PICKS, 'year',         year),
};

// --- News ---

export const News = {
  add:      (item)   => dbPut(STORES.NEWS, item),
  getRecent:(limit)  => dbGetAll(STORES.NEWS).then(all =>
    all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit || 50)
  ),
  byTeam:   (teamId) => dbGetAllByIndex(STORES.NEWS, 'teamId', teamId),
};

// ── Atomic multi-store flush ──────────────────────────────────────────────────

/**
 * Validate that a record has a defined, non-null value for the given keyPath
 * before attempting an IDB put().  Returns true if the record is safe to write.
 *
 * Background: Safari / WebKit IDB throws
 *   "Failed to store record in an IDBObjectStore: Evaluating the object store's
 *    key path did not yield a value."
 * whenever the keyPath field is undefined or absent — even if the value is 0.
 * Strict validation here prevents the entire transaction from aborting due to a
 * single bad record.
 */
function _hasValidKey(record, keyPath) {
  if (!record || typeof record !== 'object') return false;
  const val = record[keyPath];
  return val !== undefined && val !== null;
}

/**
 * Write all dirty data in a SINGLE multi-store readwrite transaction.
 *
 * Using one transaction instead of parallel per-store transactions eliminates
 * the "database connection is closing" race that occurs when several
 * concurrent readwrite transactions compete on the same IDBDatabase handle.
 *
 * @param {object} opts
 * @param {object|null}  opts.meta          - Raw meta object (will have id:'league' forced)
 * @param {Array}        opts.teams         - Team records to put
 * @param {Array}        opts.players       - Player records to put
 * @param {Array}        opts.playerDeletes - Player IDs to delete
 * @param {Array}        opts.games         - Game records to put
 * @param {Array}        opts.seasonStats   - PlayerStat records to put
 */
export async function bulkWrite({
  meta          = null,
  teams         = [],
  players       = [],
  playerDeletes = [],
  games         = [],
  seasonStats   = [],
} = {}) {
  // ── Pre-flight key validation ────────────────────────────────────────────
  // Strip any record that is missing its required keyPath value BEFORE we open
  // the IDB transaction.  A single bad record aborts the entire transaction on
  // WebKit, causing the mobile "Evaluating the object store's key path did not
  // yield a value" crash.

  const validTeams = teams.filter(t => {
    if (_hasValidKey(t, 'id')) return true;
    console.error('[bulkWrite] Dropping team with missing id:', t);
    return false;
  });

  const validPlayers = players.filter(p => {
    if (_hasValidKey(p, 'id')) return true;
    console.error('[bulkWrite] Dropping player with missing id:', p);
    return false;
  });

  const validGames = games.filter(g => {
    if (_hasValidKey(g, 'id')) return true;
    console.error('[bulkWrite] Dropping game with missing id:', g);
    return false;
  });

  // seasonStats: the id is assembled from seasonId + playerId at write time.
  // Both must be defined and non-null for the resulting composite key to be valid.
  const validSeasonStats = seasonStats.filter(s => {
    if (s && s.seasonId != null && s.playerId != null) return true;
    console.error('[bulkWrite] Dropping season stat with missing seasonId/playerId:', s);
    return false;
  });

  // Determine which stores we actually need; avoid opening stores unnecessarily.
  const needed = new Set();
  if (meta)                                           needed.add(STORES.META);
  if (validTeams.length)                              needed.add(STORES.TEAMS);
  if (validPlayers.length || playerDeletes.length)    needed.add(STORES.PLAYERS);
  if (validGames.length)                              needed.add(STORES.GAMES);
  if (validSeasonStats.length)                        needed.add(STORES.PLAYER_STATS);

  if (needed.size === 0) return; // nothing to do

  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([...needed], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(new Error('bulkWrite transaction aborted'));

    if (meta) {
      tx.objectStore(STORES.META).put({ ...meta, id: 'league' });
    }
    for (const t of validTeams) {
      tx.objectStore(STORES.TEAMS).put(t);
    }
    for (const p of validPlayers) {
      tx.objectStore(STORES.PLAYERS).put(p);
    }
    for (const id of playerDeletes) {
      tx.objectStore(STORES.PLAYERS).delete(id);
    }
    for (const g of validGames) {
      tx.objectStore(STORES.GAMES).put(g);
    }
    for (const s of validSeasonStats) {
      tx.objectStore(STORES.PLAYER_STATS).put({
        ...s,
        id: `${s.seasonId}_${s.playerId}`,
      });
    }
  });
}

// ── Wipe helpers (for reset) ─────────────────────────────────────────────────

export async function clearAllData() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const storeNames = Object.values(STORES);
    const transaction = db.transaction(storeNames, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror    = () => reject(transaction.error);
    for (const name of storeNames) {
      transaction.objectStore(name).clear();
    }
  });
}

export { STORES };
