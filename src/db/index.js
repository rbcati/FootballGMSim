/**
 * db/index.js
 *
 * IndexedDB abstraction layer for Football GM.
 * Supports multiple league databases and a global meta database for save management.
 */

// ── Configuration ────────────────────────────────────────────────────────────

const GLOBAL_DB_NAME    = 'FootballGM_Meta';
const GLOBAL_DB_VERSION = 1;

// Legacy/Default DB name pattern (will be suffixed with leagueId)
const LEAGUE_DB_PREFIX  = 'FootballGM_League_';
const LEAGUE_DB_VERSION = 3;

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

const GLOBAL_STORES = {
  SAVES: 'saves',
};

// ── State ────────────────────────────────────────────────────────────────────

/** currently active league ID (null if none selected) */
let _activeLeagueId = null;

/** Singletons for the active league DB */
let _leagueDB      = null;
let _leagueOpening = null;

/** Singletons for the global meta DB */
let _globalDB      = null;
let _globalOpening = null;

/**
 * Configure which league database is active.
 * Closes any existing connection to a different league.
 */
export function configureActiveLeague(leagueId) {
  if (_activeLeagueId === leagueId) return;

  if (_leagueDB) {
    _leagueDB.close();
    _leagueDB = null;
  }
  _activeLeagueId = leagueId;
}

export function getActiveLeagueId() {
  return _activeLeagueId;
}

// ── Open / Upgrade: League DB ────────────────────────────────────────────────

export function openDB() {
  if (!_activeLeagueId) {
    return Promise.reject(new Error("No active league configured. Call configureActiveLeague(id) first."));
  }

  // Fast path
  if (_leagueDB) return Promise.resolve(_leagueDB);
  if (_leagueOpening) return _leagueOpening;

  const dbName = `${LEAGUE_DB_PREFIX}${_activeLeagueId}`;

  _leagueOpening = new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, LEAGUE_DB_VERSION);

    req.onerror = () => {
      _leagueOpening = null;
      reject(req.error);
    };

    req.onsuccess = () => {
      _leagueDB = req.result;
      _leagueOpening = null;
      _leagueDB.onversionchange = () => { _leagueDB.close(); _leagueDB = null; };
      _leagueDB.onclose = () => { _leagueDB = null; };
      resolve(_leagueDB);
    };

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Ensure all stores exist
      if (!db.objectStoreNames.contains(STORES.META)) {
        db.createObjectStore(STORES.META, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.TEAMS)) {
        db.createObjectStore(STORES.TEAMS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.PLAYERS)) {
        const ps = db.createObjectStore(STORES.PLAYERS, { keyPath: 'id' });
        ps.createIndex('teamId',   'teamId',   { unique: false });
        ps.createIndex('position', 'pos',      { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.ROSTERS)) {
        const rs = db.createObjectStore(STORES.ROSTERS, { keyPath: 'id' });
        rs.createIndex('seasonId', 'seasonId', { unique: false });
        rs.createIndex('teamId',   'teamId',   { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.GAMES)) {
        const gs = db.createObjectStore(STORES.GAMES, { keyPath: 'id' });
        gs.createIndex('seasonId', 'seasonId', { unique: false });
        gs.createIndex('week',     'week',     { unique: false });
        gs.createIndex('homeId',   'homeId',   { unique: false });
        gs.createIndex('awayId',   'awayId',   { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.SEASONS)) {
        const ss = db.createObjectStore(STORES.SEASONS, { keyPath: 'id' });
        ss.createIndex('year', 'year', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.PLAYER_STATS)) {
        const pss = db.createObjectStore(STORES.PLAYER_STATS, { keyPath: 'id' });
        pss.createIndex('seasonId', 'seasonId', { unique: false });
        pss.createIndex('playerId', 'playerId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.TRANSACTIONS)) {
        const ts = db.createObjectStore(STORES.TRANSACTIONS, { keyPath: 'id', autoIncrement: true });
        ts.createIndex('seasonId', 'seasonId', { unique: false });
        ts.createIndex('teamId',   'teamId',   { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.DRAFT_PICKS)) {
        const dp = db.createObjectStore(STORES.DRAFT_PICKS, { keyPath: 'id' });
        dp.createIndex('currentOwner', 'currentOwner', { unique: false });
        dp.createIndex('year',         'year',         { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.NEWS)) {
        const ns = db.createObjectStore(STORES.NEWS, { keyPath: 'id', autoIncrement: true });
        ns.createIndex('seasonId', 'seasonId', { unique: false });
        ns.createIndex('week',     'week',     { unique: false });
        ns.createIndex('type',     'type',     { unique: false });
        ns.createIndex('teamId',   'teamId',   { unique: false });
      }
    };
  });

  return _leagueOpening;
}

// ── Open / Upgrade: Global DB ────────────────────────────────────────────────

export function openGlobalDB() {
  if (_globalDB) return Promise.resolve(_globalDB);
  if (_globalOpening) return _globalOpening;

  _globalOpening = new Promise((resolve, reject) => {
    const req = indexedDB.open(GLOBAL_DB_NAME, GLOBAL_DB_VERSION);

    req.onerror = () => {
      _globalOpening = null;
      reject(req.error);
    };

    req.onsuccess = () => {
      _globalDB = req.result;
      _globalOpening = null;
      _globalDB.onversionchange = () => { _globalDB.close(); _globalDB = null; };
      _globalDB.onclose = () => { _globalDB = null; };
      resolve(_globalDB);
    };

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(GLOBAL_STORES.SAVES)) {
        // id: leagueId
        db.createObjectStore(GLOBAL_STORES.SAVES, { keyPath: 'id' });
      }
    };
  });

  return _globalOpening;
}

// ── Transaction Helpers ──────────────────────────────────────────────────────

/** Execute transaction on Active League DB */
function txOp(storeName, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], mode);
    const store = transaction.objectStore(storeName);
    transaction.onerror = () => reject(transaction.error);
    fn(store, resolve, reject);
  }));
}

/** Execute transaction on Global Meta DB */
function txOpGlobal(storeName, mode, fn) {
  return openGlobalDB().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], mode);
    const store = transaction.objectStore(storeName);
    transaction.onerror = () => reject(transaction.error);
    fn(store, resolve, reject);
  }));
}

// ── Generic Helpers (League DB) ──────────────────────────────────────────────

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

function dbGetAll(storeName) {
  return txOp(storeName, 'readonly', (store, resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

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

// ── Generic Helpers (Global DB) ──────────────────────────────────────────────

function dbGetAllGlobal(storeName) {
  return txOpGlobal(storeName, 'readonly', (store, resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function dbPutGlobal(storeName, value) {
  return txOpGlobal(storeName, 'readwrite', (store, resolve, reject) => {
    const req = store.put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function dbDelGlobal(storeName, key) {
  return txOpGlobal(storeName, 'readwrite', (store, resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── Public API (Repositories) ────────────────────────────────────────────────

// --- Global Saves ---

export const Saves = {
  loadAll: ()   => dbGetAllGlobal(GLOBAL_STORES.SAVES),
  save:    (s)  => dbPutGlobal(GLOBAL_STORES.SAVES, s),
  delete:  (id) => dbDelGlobal(GLOBAL_STORES.SAVES, id),
};

// --- Meta (League Specific) ---

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
  loadAll:  ()                   => dbGetAll(STORES.PLAYER_STATS),
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

function _hasValidKey(record, keyPath) {
  if (!record || typeof record !== 'object') return false;
  const val = record[keyPath];
  return val !== undefined && val !== null;
}

export async function bulkWrite({
  meta          = null,
  teams         = [],
  players       = [],
  playerDeletes = [],
  games         = [],
  seasonStats   = [],
} = {}) {
  // Validate records
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

  const validSeasonStats = seasonStats.filter(s => {
    if (s && s.seasonId != null && s.playerId != null) return true;
    console.error('[bulkWrite] Dropping season stat with missing seasonId/playerId:', s);
    return false;
  });

  const needed = new Set();
  if (meta)                                           needed.add(STORES.META);
  if (validTeams.length)                              needed.add(STORES.TEAMS);
  if (validPlayers.length || playerDeletes.length)    needed.add(STORES.PLAYERS);
  if (validGames.length)                              needed.add(STORES.GAMES);
  if (validSeasonStats.length)                        needed.add(STORES.PLAYER_STATS);

  if (needed.size === 0) return;

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

// ── Wipe helpers ─────────────────────────────────────────────────────────────

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

/**
 * Completely delete the current league database.
 */
export function deleteLeagueDB(leagueId) {
  if (_activeLeagueId === leagueId && _leagueDB) {
    _leagueDB.close();
    _leagueDB = null;
    _activeLeagueId = null;
  }

  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(`${LEAGUE_DB_PREFIX}${leagueId}`);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => console.warn(`Delete blocked for league ${leagueId}`);
  });
}

export { STORES, GLOBAL_STORES };
