/**
 * worker.js  —  Game Worker  (single source of truth for all league state)
 *
 * Architecture contract:
 *  - The UI thread ONLY sends commands and renders what the worker sends back.
 *  - ALL league state lives here.  Nothing is passed back as a blob.
 *  - Reads/writes go through cache.js (in-memory) → flushed to db/index.js (IndexedDB).
 *  - Every outbound message carries only the minimal slice the UI needs.
 *
 * Message protocol → see protocol.js for all type constants.
 *
 * Performance safeguards:
 *  1. Never send the full league object to the UI — send view-model slices.
 *  2. Flush DB writes in micro-batches using queueMicrotask / setTimeout 0.
 *  3. Yielding: after every game in a multi-game batch post a SIM_PROGRESS
 *     so the UI can update its loading indicator without blocking.
 *  4. History is lazy-loaded only on GET_SEASON_HISTORY / GET_PLAYER_CAREER.
 *  5. Season stats are archived (moved to DB) at season end to free RAM.
 */

import { toWorker, toUI } from './protocol.js';
import { cache }          from '../db/cache.js';
import {
  Meta, Teams, Players, Rosters, Games,
  Seasons, PlayerStats, Transactions, DraftPicks,
  clearAllData, openDB,
} from '../db/index.js';
import { makeLeague }     from '../core/league.js';
import GameRunner         from '../core/game-runner.js';
import { simulateBatch }  from '../core/game-simulator.js';
import { Utils }          from '../core/utils.js';
import { makeAccurateSchedule, Scheduler } from '../core/schedule.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Send a typed message to the UI thread. */
function post(type, payload = {}, id = null) {
  const msg = { type, payload };
  if (id) msg.id = id;
  self.postMessage(msg);
}

/** Yield to the event loop so the worker stays responsive during long batches. */
function yieldFrame() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Build the minimal "view state" slice the UI needs to render the current screen.
 * NEVER includes per-game stat arrays or historical data.
 */
function buildViewState() {
  const meta = cache.getMeta();
  const teams = cache.getAllTeams().map(t => ({
    id:        t.id,
    name:      t.name,
    abbr:      t.abbr,
    conf:      t.conf,
    div:       t.div,
    wins:      t.wins      ?? 0,
    losses:    t.losses    ?? 0,
    ties:      t.ties      ?? 0,
    ptsFor:    t.ptsFor    ?? 0,
    ptsAgainst:t.ptsAgainst?? 0,
    capUsed:   t.capUsed   ?? 0,
    capRoom:   t.capRoom   ?? 0,
    capTotal:  t.capTotal  ?? 255,
    ovr:       t.ovr       ?? 75,
  }));
  return {
    seasonId:   meta?.currentSeasonId,
    year:       meta?.year,
    week:       meta?.currentWeek ?? 1,
    phase:      meta?.phase       ?? 'regular',
    userTeamId: meta?.userTeamId  ?? null,
    schedule:   meta?.schedule    ?? null,
    teams,
  };
}

/**
 * Build a compact player list for a single team roster view.
 */
function buildRosterView(teamId) {
  return cache.getPlayersByTeam(teamId).map(p => ({
    id:       p.id,
    name:     p.name,
    pos:      p.pos,
    age:      p.age,
    ovr:      p.ovr,
    contract: p.contract ?? null,
  }));
}

// ── DB flush ─────────────────────────────────────────────────────────────────

/**
 * Persist all dirty cache entries to IndexedDB.
 * This is the ONLY place we write to the DB.
 */
async function flushDirty() {
  if (!cache.isDirty()) return;
  const dirty = cache.drainDirty();

  const ops = [];

  if (dirty.meta) {
    ops.push(Meta.save(cache.getMeta()));
  }

  if (dirty.teams.length > 0) {
    const rows = dirty.teams.map(id => cache.getTeam(id)).filter(Boolean);
    ops.push(Teams.saveBulk(rows));
  }

  if (dirty.players.length > 0) {
    const toSave   = dirty.players.map(id => cache.getPlayer(id)).filter(Boolean);
    const toDelete = dirty.players.filter(id => !cache.getPlayer(id));
    if (toSave.length)   ops.push(Players.saveBulk(toSave));
    if (toDelete.length) ops.push(...toDelete.map(id => Players.delete(id)));
  }

  if (dirty.games.length > 0) {
    ops.push(Games.saveBulk(dirty.games));
  }

  if (dirty.seasonStats.length > 0) {
    const rows = dirty.seasonStats
      .map(pid => cache.getSeasonStat(pid))
      .filter(Boolean);
    if (rows.length) ops.push(PlayerStats.saveBulk(rows));
  }

  if (dirty.draftPicks.length > 0) {
    const toSave   = dirty.draftPicks.map(id => cache.getDraftPick(id)).filter(Boolean);
    const toDelete = dirty.draftPicks.filter(id => !cache.getDraftPick(id));
    if (toSave.length)   ops.push(DraftPicks.saveBulk(toSave));
    // For deleted picks just leave them in DB (they become historical records)
  }

  await Promise.all(ops);
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

/**
 * Load an existing save from IndexedDB into the cache.
 * Returns true if a save was found.
 */
async function loadSave() {
  const meta = await Meta.load();
  if (!meta) return false;

  const [teams, players, draftPicks] = await Promise.all([
    Teams.loadAll(),
    Players.loadAll(),
    DraftPicks.byYear(meta.year).catch(() => []),
  ]);

  cache.hydrate({ meta, teams, players, draftPicks });
  return true;
}

// ── Handler: INIT ─────────────────────────────────────────────────────────────

async function handleInit(payload, id) {
  try {
    await openDB(); // ensure DB is open
    const found = await loadSave();

    if (found) {
      post(toUI.FULL_STATE, buildViewState(), id);
    } else {
      post(toUI.READY, { hasSave: false }, id);
    }
  } catch (err) {
    post(toUI.ERROR, { message: err.message, stack: err.stack }, id);
  }
}

// ── Handler: NEW_LEAGUE ───────────────────────────────────────────────────────

async function handleNewLeague(payload, id) {
  try {
    const { teams: teamDefs, options = {} } = payload;

    // Wipe any existing save
    await clearAllData();
    cache.reset();

    // Ensure we have a valid schedule generator
    // (Protects against module loading edge cases where named export might be undefined)
    const makeScheduleFn = makeAccurateSchedule || (Scheduler && Scheduler.makeAccurateSchedule);
    if (!makeScheduleFn) {
        throw new Error('Critical: makeAccurateSchedule could not be loaded.');
    }

    // Generate via existing core logic
    const league = makeLeague(teamDefs, options, { makeSchedule: makeScheduleFn });

    // Validate schedule
    if (!league.schedule || !Array.isArray(league.schedule.weeks) || league.schedule.weeks.length === 0) {
        throw new Error('League generation failed: Schedule is missing or empty.');
    }

    const seasonId = `s${league.season ?? 1}`;
    const meta = {
      id:              'league',
      userTeamId:      options.userTeamId ?? 0,
      currentSeasonId: seasonId,
      currentWeek:     1,
      year:            league.year,
      season:          league.season ?? 1,
      phase:           'regular',
      settings:        options.settings ?? {},
    };

    // Separate flat data from the league blob
    // Teams — strip rosters (players stored separately)
    const teams = league.teams.map(t => {
      const { roster, ...teamWithoutRoster } = t;
      return {
        ...teamWithoutRoster,
        wins:       0,
        losses:     0,
        ties:       0,
        ptsFor:     0,
        ptsAgainst: 0,
      };
    });

    // Players — flatten all rosters
    const players = [];
    league.teams.forEach(t => {
      (t.roster ?? []).forEach(p => {
        players.push({ ...p, teamId: t.id });
      });
    });

    // Draft picks — flatten
    const draftPicks = [];
    league.teams.forEach(t => {
      (t.picks ?? []).forEach(pk => {
        draftPicks.push({ ...pk, currentOwner: t.id });
      });
    });

    // Hydrate cache
    cache.hydrate({ meta, teams, players, draftPicks });

    // Store schedule in meta (it's small: just matchup IDs, no objects)
    const slimSchedule = slimifySchedule(league.schedule, league.teams);
    cache.setMeta({ schedule: slimSchedule });

    // Persist everything
    await Promise.all([
      Meta.save(cache.getMeta()),
      Teams.saveBulk(cache.getAllTeams()),
      Players.saveBulk(cache.getAllPlayers()),
      DraftPicks.saveBulk(cache.getAllDraftPicks()),
    ]);
    // Clear dirty flags after explicit save
    cache.drainDirty();

    post(toUI.FULL_STATE, buildViewState(), id);
  } catch (err) {
    console.error('[Worker] NEW_LEAGUE error:', err);
    post(toUI.ERROR, { message: err.message, stack: err.stack }, id);
  }
}

/**
 * Convert a schedule from team-objects to team-id references only.
 * This keeps the schedule small enough to live in the meta record.
 */
function slimifySchedule(schedule, teams) {
  if (!schedule?.weeks) return null;
  return {
    weeks: schedule.weeks.map(week => ({
      week:  week.week,
      games: (week.games ?? []).map(g => ({
        home:   (typeof g.home === 'object') ? g.home.id : g.home,
        away:   (typeof g.away === 'object') ? g.away.id : g.away,
        played: g.played ?? false,
      })),
    })),
  };
}

/** Rebuild a full league-style schedule from the slimified version + cache teams. */
function expandSchedule(slimSchedule) {
  if (!slimSchedule?.weeks) return null;
  return {
    weeks: slimSchedule.weeks.map(week => ({
      week:  week.week,
      games: (week.games ?? []).map(g => ({
        home: cache.getTeam(g.home),
        away: cache.getTeam(g.away),
        played: g.played ?? false,
      })).filter(g => g.home && g.away),
    })),
  };
}

// ── Handler: ADVANCE_WEEK ─────────────────────────────────────────────────────

async function handleAdvanceWeek(payload, id) {
  const meta = cache.getMeta();
  if (!meta) { post(toUI.ERROR, { message: 'No league loaded' }, id); return; }

  const week        = meta.currentWeek;
  const seasonId    = meta.currentSeasonId;
  const schedule    = expandSchedule(meta.schedule);

  if (!schedule) { post(toUI.ERROR, { message: 'No schedule found' }, id); return; }

  // Build a temporary league-style object for GameRunner (read-only view of cache)
  const league = buildLeagueForSim(schedule, week, seasonId);

  post(toUI.SIM_PROGRESS, { done: 0, total: league._weekGames.length }, id);

  // --- Simulate ---
  // Run in small batches so we can yield between them
  const BATCH_SIZE = 4;
  const gamesToSim = [...league._weekGames];
  const results    = [];

  for (let i = 0; i < gamesToSim.length; i += BATCH_SIZE) {
    const batch = gamesToSim.slice(i, i + BATCH_SIZE);
    const batchResults = simulateBatch(batch, { league });
    results.push(...batchResults);

    // Apply each game result to cache
    for (const res of batchResults) {
      applyGameResultToCache(res, week, seasonId);
    }

    post(toUI.SIM_PROGRESS, { done: i + batch.length, total: gamesToSim.length }, id);
    await yieldFrame();
  }

  // --- Advance week counter ---
  const TOTAL_WEEKS = 18; // NFL regular season
  const newWeek = week + 1;
  const isSeasonOver = week >= TOTAL_WEEKS;

  // Mark games as played in schedule
  markWeekPlayed(meta.schedule, week);

  if (isSeasonOver) {
    // Transition to playoffs/offseason
    cache.setMeta({ currentWeek: newWeek, phase: 'playoffs' });
  } else {
    cache.setMeta({ currentWeek: newWeek });
  }

  // --- Flush to DB (non-blocking) ---
  await flushDirty();

  // --- Build response (minimal) ---
  const gameResults = results.map(r => ({
    homeId:    r.homeTeamId   ?? null,
    awayId:    r.awayTeamId   ?? null,
    homeName:  r.homeTeamName ?? '?',
    awayName:  r.awayTeamName ?? '?',
    homeScore: r.scoreHome    ?? 0,
    awayScore: r.scoreAway    ?? 0,
  }));

  post(toUI.WEEK_COMPLETE, {
    week,
    results:    gameResults,
    standings:  buildStandings(),
    nextWeek:   newWeek,
    phase:      cache.getPhase(),
    isSeasonOver,
  }, id);

  // Also send a full state update so UI can re-render all panels
  post(toUI.STATE_UPDATE, buildViewState());
}

/**
 * Build the minimal league object GameRunner / simulateBatch need.
 * Crucially: team objects here are REFERENCES to cache entries,
 * so mutations (wins/losses) by the sim functions propagate to cache automatically.
 */
function buildLeagueForSim(schedule, week, seasonId) {
  const meta   = cache.getMeta();
  const teams  = cache.getAllTeams();
  // Attach rosters to teams temporarily (simulateBatch needs player arrays for ratings)
  const teamsWithRosters = teams.map(t => ({
    ...t,
    roster: cache.getPlayersByTeam(t.id),
  }));

  // Replace team references in schedule with full team objects
  const weekData = schedule.weeks.find(w => w.week === week);
  const weekGames = (weekData?.games ?? [])
    .filter(g => !g.played)
    .map(g => {
      const home = teamsWithRosters.find(t => t.id === g.home?.id || t.id === g.home);
      const away = teamsWithRosters.find(t => t.id === g.away?.id || t.id === g.away);
      if (!home || !away) return null;
      return { home, away, week, year: meta.year };
    })
    .filter(Boolean);

  // Rebuild a league-compatible object (only what GameRunner reads)
  const leagueObj = {
    teams:       teamsWithRosters,
    week,
    year:        meta.year,
    season:      meta.season,
    userTeamId:  meta.userTeamId,
    schedule,
    _weekGames:  weekGames,
  };

  return leagueObj;
}

/**
 * Apply a game result coming from simulateBatch back to the cache.
 * Updates team win/loss records and logs the game to the dirty buffer.
 */
function applyGameResultToCache(result, week, seasonId) {
  const { homeTeamId, awayTeamId, scoreHome, scoreAway } = result;
  if (homeTeamId == null || awayTeamId == null) return;

  const homeWin = scoreHome > scoreAway;
  const tie     = scoreHome === scoreAway;

  const homeTeam = cache.getTeam(homeTeamId);
  const awayTeam = cache.getTeam(awayTeamId);

  if (homeTeam) {
    cache.updateTeam(homeTeamId, {
      wins:       (homeTeam.wins ?? 0) + (homeWin ? 1 : 0),
      losses:     (homeTeam.losses ?? 0) + (!homeWin && !tie ? 1 : 0),
      ties:       (homeTeam.ties ?? 0) + (tie ? 1 : 0),
      ptsFor:     (homeTeam.ptsFor ?? 0) + scoreHome,
      ptsAgainst: (homeTeam.ptsAgainst ?? 0) + scoreAway,
    });
  }
  if (awayTeam) {
    cache.updateTeam(awayTeamId, {
      wins:       (awayTeam.wins ?? 0) + (!homeWin && !tie ? 1 : 0),
      losses:     (awayTeam.losses ?? 0) + (homeWin ? 1 : 0),
      ties:       (awayTeam.ties ?? 0) + (tie ? 1 : 0),
      ptsFor:     (awayTeam.ptsFor ?? 0) + scoreAway,
      ptsAgainst: (awayTeam.ptsAgainst ?? 0) + scoreHome,
    });
  }

  // Queue game for DB
  const gameId = `${seasonId}_w${week}_${homeTeamId}_${awayTeamId}`;
  cache.addGame({
    id:        gameId,
    seasonId,
    week,
    homeId:    homeTeamId,
    awayId:    awayTeamId,
    homeScore: scoreHome,
    awayScore: scoreAway,
    stats:     result.stats ?? null,
  });
}

/** Mark all games in a week as played in the slim schedule. */
function markWeekPlayed(slimSchedule, week) {
  if (!slimSchedule?.weeks) return;
  const weekData = slimSchedule.weeks.find(w => w.week === week);
  if (weekData) weekData.games.forEach(g => { g.played = true; });
  cache.setMeta({ schedule: slimSchedule });
}

/** Build a standings array sorted by win% for the current state. */
function buildStandings() {
  return cache.getAllTeams()
    .map(t => ({
      id:      t.id,
      name:    t.name,
      abbr:    t.abbr,
      conf:    t.conf,
      div:     t.div,
      wins:    t.wins    ?? 0,
      losses:  t.losses  ?? 0,
      ties:    t.ties    ?? 0,
      pf:      t.ptsFor  ?? 0,
      pa:      t.ptsAgainst ?? 0,
      pct:     winPct(t),
    }))
    .sort((a, b) => b.pct - a.pct || b.pf - a.pf);
}

function winPct(t) {
  const g = (t.wins ?? 0) + (t.losses ?? 0) + (t.ties ?? 0);
  return g === 0 ? 0 : ((t.wins ?? 0) + (t.ties ?? 0) * 0.5) / g;
}

// ── Handler: SIM_TO_WEEK ─────────────────────────────────────────────────────

async function handleSimToWeek({ targetWeek }, id) {
  const meta = cache.getMeta();
  if (!meta) { post(toUI.ERROR, { message: 'No league loaded' }, id); return; }

  const start = meta.currentWeek;
  for (let w = start; w < targetWeek; w++) {
    await handleAdvanceWeek({}, null); // null id → no per-week reply
  }
  // Final state broadcast
  post(toUI.FULL_STATE, buildViewState(), id);
}

// ── Handler: GET_SEASON_HISTORY ───────────────────────────────────────────────

async function handleGetSeasonHistory({ seasonId }, id) {
  // Check LRU first
  let data = cache.getHistorySeason(seasonId);
  if (!data) {
    data = await Seasons.load(seasonId);
    if (data) cache.setHistorySeason(seasonId, data);
  }
  post(toUI.SEASON_HISTORY, { seasonId, data: data ?? null }, id);
}

// ── Handler: GET_ALL_SEASONS ──────────────────────────────────────────────────

async function handleGetAllSeasons(payload, id) {
  const seasons = await Seasons.loadRecent(200);
  post(toUI.ALL_SEASONS, { seasons }, id);
}

// ── Handler: GET_PLAYER_CAREER ────────────────────────────────────────────────

async function handleGetPlayerCareer({ playerId }, id) {
  const stats = await PlayerStats.byPlayer(playerId);
  const player = cache.getPlayer(playerId) ?? await Players.load(playerId);
  post(toUI.PLAYER_CAREER, {
    playerId,
    player: player ?? null,
    stats:  stats  ?? [],
  }, id);
}

// ── Handler: SAVE_NOW ─────────────────────────────────────────────────────────

async function handleSaveNow(payload, id) {
  await flushDirty();
  post(toUI.SAVED, {}, id);
}

// ── Handler: RESET_LEAGUE ─────────────────────────────────────────────────────

async function handleResetLeague(payload, id) {
  await clearAllData();
  cache.reset();
  post(toUI.READY, { hasSave: false }, id);
}

// ── Handler: SET_USER_TEAM ────────────────────────────────────────────────────

async function handleSetUserTeam({ teamId }, id) {
  cache.setMeta({ userTeamId: teamId });
  await flushDirty();
  post(toUI.STATE_UPDATE, buildViewState(), id);
}

// ── Handler: SIGN_PLAYER ──────────────────────────────────────────────────────

async function handleSignPlayer({ playerId, teamId, contract }, id) {
  const player = cache.getPlayer(playerId);
  if (!player) { post(toUI.ERROR, { message: 'Player not found' }, id); return; }

  const oldTeamId = player.teamId;
  cache.updatePlayer(playerId, { teamId, contract, status: 'active' });

  // Update cap
  _updateTeamCap(teamId);
  if (oldTeamId != null && oldTeamId !== teamId) _updateTeamCap(oldTeamId);

  const meta = cache.getMeta();
  await Transactions.add({
    type: 'SIGN', seasonId: meta.currentSeasonId,
    week: meta.currentWeek, teamId, details: { playerId, contract },
  });

  await flushDirty();
  post(toUI.STATE_UPDATE, { roster: buildRosterView(teamId), ...buildViewState() }, id);
}

// ── Handler: RELEASE_PLAYER ───────────────────────────────────────────────────

async function handleReleasePlayer({ playerId, teamId }, id) {
  const player = cache.getPlayer(playerId);
  if (!player) { post(toUI.ERROR, { message: 'Player not found' }, id); return; }

  cache.updatePlayer(playerId, { teamId: null, status: 'free_agent' });
  _updateTeamCap(teamId);

  const meta = cache.getMeta();
  await Transactions.add({
    type: 'RELEASE', seasonId: meta.currentSeasonId,
    week: meta.currentWeek, teamId, details: { playerId },
  });

  await flushDirty();
  post(toUI.STATE_UPDATE, { roster: buildRosterView(teamId), ...buildViewState() }, id);
}

// ── Handler: UPDATE_SETTINGS ─────────────────────────────────────────────────

async function handleUpdateSettings({ settings }, id) {
  const current = cache.getMeta();
  cache.setMeta({ settings: { ...(current?.settings ?? {}), ...settings } });
  await flushDirty();
  post(toUI.STATE_UPDATE, { settings: cache.getMeta().settings }, id);
}

// ── Cap helper ────────────────────────────────────────────────────────────────

function _updateTeamCap(teamId) {
  const players = cache.getPlayersByTeam(teamId);
  const capUsed = players.reduce((sum, p) => {
    const c = p.contract;
    if (!c) return sum;
    return sum + (c.baseAnnual ?? 0) + ((c.signingBonus ?? 0) / (c.yearsTotal || 1));
  }, 0);
  const team = cache.getTeam(teamId);
  if (!team) return;
  cache.updateTeam(teamId, {
    capUsed: Math.round(capUsed * 100) / 100,
    capRoom: Math.round((team.capTotal - capUsed) * 100) / 100,
  });
}

// ── Main message router ───────────────────────────────────────────────────────

self.onmessage = async (event) => {
  const { type, payload = {}, id } = event.data;

  try {
    switch (type) {
      case toWorker.INIT:               return await handleInit(payload, id);
      case toWorker.NEW_LEAGUE:         return await handleNewLeague(payload, id);
      case toWorker.ADVANCE_WEEK:       return await handleAdvanceWeek(payload, id);
      case toWorker.SIM_TO_WEEK:        return await handleSimToWeek(payload, id);
      case toWorker.SIM_TO_PLAYOFFS:    return await handleSimToWeek({ targetWeek: 19 }, id);
      case toWorker.GET_SEASON_HISTORY: return await handleGetSeasonHistory(payload, id);
      case toWorker.GET_ALL_SEASONS:    return await handleGetAllSeasons(payload, id);
      case toWorker.GET_PLAYER_CAREER:  return await handleGetPlayerCareer(payload, id);
      case toWorker.SAVE_NOW:           return await handleSaveNow(payload, id);
      case toWorker.RESET_LEAGUE:       return await handleResetLeague(payload, id);
      case toWorker.SET_USER_TEAM:      return await handleSetUserTeam(payload, id);
      case toWorker.SIGN_PLAYER:        return await handleSignPlayer(payload, id);
      case toWorker.RELEASE_PLAYER:     return await handleReleasePlayer(payload, id);
      case toWorker.UPDATE_SETTINGS:    return await handleUpdateSettings(payload, id);

      default:
        console.warn(`[Worker] Unknown message type: ${type}`);
        post(toUI.ERROR, { message: `Unknown message type: ${type}` }, id);
    }
  } catch (err) {
    console.error(`[Worker] Unhandled error in handler for "${type}":`, err);
    post(toUI.ERROR, { message: err.message, stack: err.stack }, id);
  }
};

// Signal to UI that the worker script has loaded and is ready
post(toUI.READY, { hasSave: false });
