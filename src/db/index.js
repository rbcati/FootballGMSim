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
const DB_VERSION = 1;

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
};

// ── Open / upgrade ───────────────────────────────────────────────────────────

let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      _db = req.result;
      _db.onversionchange = () => { _db.close(); _db = null; };
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
    };
  });
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
