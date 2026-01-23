// football-db.js - Persistent Football Database using IndexedDB
// Mirrors the functionality of the Python FootballDB class

export class FootballDB {
  constructor(dbName = "football_sim_db") {
    this.dbName = dbName;
    this.db = null;
    this.initPromise = this.connect();
  }

  /**
   * Connect to IndexedDB and initialize schema
   */
  connect() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Players
        if (!db.objectStoreNames.contains('players')) {
            db.createObjectStore('players', { keyPath: 'player_id' });
        }

        // 2. Games
        if (!db.objectStoreNames.contains('games')) {
            const gamesStore = db.createObjectStore('games', { keyPath: 'game_id' });
            gamesStore.createIndex('season', 'season', { unique: false });
        }

        // 3. Season Stats (Permanent History)
        if (!db.objectStoreNames.contains('season_stats')) {
            const statsStore = db.createObjectStore('season_stats', { keyPath: 'stat_id', autoIncrement: true });
            statsStore.createIndex('player_id', 'player_id', { unique: false });
            statsStore.createIndex('season', 'season', { unique: false });
            // Compound index for unique constraint check if needed, but we'll handle upsert in logic
        }

        // 4. Play Logs (Temporary / High Detail)
        if (!db.objectStoreNames.contains('play_logs')) {
            const logsStore = db.createObjectStore('play_logs', { keyPath: 'play_id', autoIncrement: true });
            logsStore.createIndex('game_id', 'game_id', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log(`✅ FootballDB connected: ${this.dbName}`);
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error("FootballDB connection error:", event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Log a play execution
   * @param {number} gameId
   * @param {number} playerId
   * @param {string} playType
   * @param {number} yards
   */
  async logPlay(gameId, playerId, playType, yards) {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["play_logs"], "readwrite");
      const store = transaction.objectStore("play_logs");
      const request = store.add({
        game_id: gameId,
        player_id: playerId,
        play_type: playType,
        result_yards: yards
      });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Converts raw play logs into permanent season stats.
   * Call this at the end of every season before purging logs.
   * @param {number} seasonYear
   */
  async finalizeSeason(seasonYear) {
    await this.initPromise;
    console.log(`Aggregating stats for Season ${seasonYear}...`);

    try {
        // 1. Get all games for the season
        const games = await this.getGamesBySeason(seasonYear);
        const gameIds = games.map(g => g.game_id);
        const gameIdSet = new Set(gameIds);

        if (gameIds.length === 0) {
            console.warn(`No games found for season ${seasonYear}`);
            return;
        }

        // 2. Get all play logs for these games
        // Since we can't do "WHERE game_id IN (...)" easily without iterating all or many logs,
        // we'll use the game_id index.
        const playerStats = new Map(); // player_id -> { rush_yards: 0, ... }

        for (const gameId of gameIds) {
            const logs = await this.getLogsByGameId(gameId);
            for (const log of logs) {
                if (log.play_type === 'run') { // Matches python: WHERE play_type = 'run'
                    const pid = log.player_id;
                    if (!playerStats.has(pid)) {
                        playerStats.set(pid, { rush_yards: 0 });
                    }
                    const stats = playerStats.get(pid);
                    stats.rush_yards += (log.result_yards || 0);
                }
                // Add more play types here as needed
            }
        }

        // 3. Insert into season_stats
        const transaction = this.db.transaction(["season_stats"], "readwrite");
        const statsStore = transaction.objectStore("season_stats");

        for (const [playerId, stats] of playerStats.entries()) {
            // Check if entry exists? For now we just insert like the python code (INSERT)
            // Python code was INSERT, so we insert new rows.
            statsStore.add({
                player_id: playerId,
                season: seasonYear,
                rush_yards: stats.rush_yards,
                pass_yards: 0, // Placeholder
                pass_tds: 0,
                interceptions: 0
            });
        }

        await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = reject;
        });

        console.log("Stats aggregated.");

        // 4. Purge old logs
        await this.purgeOldLogs(seasonYear);

    } catch (error) {
        console.error("Error finalizing season:", error);
        throw error;
    }
  }

  /**
   * Internal: Removes play-by-play data older than 1 season to save space.
   */
  async purgeOldLogs(currentSeason) {
    await this.initPromise;
    const cutoffSeason = currentSeason - 1;
    console.log(`Purging logs older than Season ${cutoffSeason}...`);

    // Find games <= cutoffSeason
    // This requires iterating games or using a range on an index if we had one on season
    // We have index on season in 'games'.

    // We want all games where season <= cutoffSeason
    // IDBKeyRange.upperBound(cutoffSeason)
    const games = await this.getGamesBySeasonRange(cutoffSeason); // Implement this

    if (games.length === 0) {
        console.log("No old games to purge logs for.");
        return;
    }

    const gameIdsToDelete = games.map(g => g.game_id);

    const transaction = this.db.transaction(["play_logs"], "readwrite");
    const logsStore = transaction.objectStore("play_logs");
    const index = logsStore.index("game_id");

    // This is inefficient if there are millions of logs, but fine for local browser DB usually.
    // Better approach: store season in logs? No, keep normalized.
    // We iterate games and delete logs for each game.

    for (const gameId of gameIdsToDelete) {
        // Delete logs for this game
        // We need to find keys first.
        // Or we can just iterate the cursor on the index and delete.
        const request = index.openKeyCursor(IDBKeyRange.only(gameId));

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                logsStore.delete(cursor.primaryKey);
                cursor.continue();
            }
        };
    }

    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            console.log(`Purged logs for ${games.length} old games.`);
            resolve();
        };
        transaction.onerror = reject;
    });
  }

  // Helper: Get games by season
  async getGamesBySeason(season) {
      return new Promise((resolve, reject) => {
          const transaction = this.db.transaction(["games"], "readonly");
          const store = transaction.objectStore("games");
          const index = store.index("season");
          const request = index.getAll(season);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
      });
  }

  // Helper: Get games by season range (<= maxSeason)
  async getGamesBySeasonRange(maxSeason) {
    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["games"], "readonly");
        const store = transaction.objectStore("games");
        const index = store.index("season");
        const request = index.getAll(IDBKeyRange.upperBound(maxSeason));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
  }

  // Helper: Get logs by game_id
  async getLogsByGameId(gameId) {
      return new Promise((resolve, reject) => {
          const transaction = this.db.transaction(["play_logs"], "readonly");
          const store = transaction.objectStore("play_logs");
          const index = store.index("game_id");
          const request = index.getAll(gameId);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
      });
  }

  // Helper for testing: Insert a game
  async addGame(gameId, season) {
    await this.initPromise;
    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["games"], "readwrite");
        const store = transaction.objectStore("games");
        const request = store.put({ game_id: gameId, season: season }); // put uses Upsert logic
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
  }

  // Helper for testing: Insert a player
  async addPlayer(playerId, lastName) {
    await this.initPromise;
    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["players"], "readwrite");
        const store = transaction.objectStore("players");
        const request = store.put({ player_id: playerId, last_name: lastName });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
  }

  // Helper for testing: Get stats
  async getSeasonStats(playerId, season) {
      await this.initPromise;
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["season_stats"], "readonly");
        const store = transaction.objectStore("season_stats");
        const index = store.index("player_id"); // This gets all stats for player
        // We need to filter by season manually or use compound index.
        // For simplicity, getAll and find.
        const request = index.getAll(playerId);
        request.onsuccess = () => {
            const results = request.result;
            const stat = results.find(s => s.season === season);
            resolve(stat);
        };
        request.onerror = () => reject(request.error);
    });
  }

  close() {
      if (this.db) {
          this.db.close();
          this.db = null;
      }
  }
}

// Make it available globally
if (typeof window !== 'undefined') {
  window.FootballDB = FootballDB;
  // Initialize global instance
  window.footballDB = new FootballDB();
}
