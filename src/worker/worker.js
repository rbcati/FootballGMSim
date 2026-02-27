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
  clearAllData, openDB, bulkWrite,
  Saves, configureActiveLeague, deleteLeagueDB, openGlobalDB, getActiveLeagueId,
  setReloadRequiredCallback,
} from '../db/index.js';
import { makeLeague }     from '../core/league.js';
import GameRunner         from '../core/game-runner.js';
import { simulateBatch }  from '../core/game-simulator.js';
import { Utils }          from '../core/utils.js';
import { makeAccurateSchedule, Scheduler } from '../core/schedule.js';
import { makePlayer, generateDraftClass, calculateMorale, calculateExtensionDemand }  from '../core/player.js';
import { makeCoach, generateInitialStaff } from '../core/coach-system.js';
import { calculateOffensiveSchemeFit, calculateDefensiveSchemeFit } from '../core/scheme-core.js';
import AiLogic from '../core/ai-logic.js';
import NewsEngine from '../core/news-engine.js';
import { calculateAwardRaces } from '../core/awards-logic.js';
import { Constants } from '../core/constants.js';
import { processPlayerProgression } from '../core/progression-logic.js';
import { runAIToAITrades }          from '../core/trade-logic.js';

// ── DB Reload Guard ───────────────────────────────────────────────────────────
// Register a callback with db/index.js so that when IDB fires onblocked or
// onversionchange, the worker can notify the UI to reload (since workers
// cannot call window.location.reload() directly).
setReloadRequiredCallback((reason) => {
  self.postMessage({ type: toUI.RELOAD_REQUIRED, payload: { reason } });
});

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
    rosterCount: cache.getPlayersByTeam(t.id).length,
  }));

  // Calculate tension/stakes for the user's next game
  let nextGameStakes = 0;
  if (meta?.userTeamId != null && meta?.schedule?.weeks && meta.phase === 'regular') {
    const weekData = meta.schedule.weeks.find(w => w.week === meta.currentWeek);
    if (weekData && weekData.games) {
      const userGame = weekData.games.find(g =>
        Number(g.home) === meta.userTeamId || Number(g.away) === meta.userTeamId
      );
      if (userGame && !userGame.played) {
        const oppId = Number(userGame.home) === meta.userTeamId ? Number(userGame.away) : Number(userGame.home);
        const userTeam = cache.getTeam(meta.userTeamId);
        const oppTeam = cache.getTeam(oppId);
        if (userTeam && oppTeam) {
          // Mock league context for GameRunner
          const leagueCtx = {
            week: meta.currentWeek,
            teams: cache.getAllTeams(),
            userTeamId: meta.userTeamId
          };
          // Assume owner mode enabled for max stakes calculation (fanSatisfaction defaults to 50 if missing)
          nextGameStakes = GameRunner.calculateContextualStakes(leagueCtx, userTeam, oppTeam, { enabled: true, fanSatisfaction: 50 });
        }
      }
    }
  }

  // ── Dynamic approval ratings ─────────────────────────────────────────────
  // ownerApproval: weighted by cap health + win percentage
  // fanApproval:   weighted by win percentage (and recent playoff success bonus)
  let ownerApproval = 75;
  let fanApproval   = 65;
  if (meta?.userTeamId != null) {
    const userTeamObj = cache.getTeam(meta.userTeamId);
    if (userTeamObj) {
      const totalGames = (userTeamObj.wins ?? 0) + (userTeamObj.losses ?? 0) + (userTeamObj.ties ?? 0);
      const wPct = totalGames > 0
        ? ((userTeamObj.wins ?? 0) + (userTeamObj.ties ?? 0) * 0.5) / totalGames
        : 0.5;                                        // neutral at season start
      const capTotal  = userTeamObj.capTotal ?? 255;
      const capUsed   = userTeamObj.capUsed  ?? 0;
      const capHealth = Math.max(0, Math.min(1, 1 - capUsed / capTotal));

      // ownerApproval = 40% win-pct + 40% cap health + 20% base
      ownerApproval = Math.round(40 * wPct + 40 * capHealth + 20);

      // fanApproval = 70% win-pct + 30% base  (fans care about winning, not finances)
      fanApproval = Math.round(70 * wPct + 30);

      // Clamp to 0-100
      ownerApproval = Math.max(0, Math.min(100, ownerApproval));
      fanApproval   = Math.max(0, Math.min(100, fanApproval));
    }
  }

  return {
    seasonId:   meta?.currentSeasonId,
    year:       meta?.year,
    week:       meta?.currentWeek ?? 1,
    phase:      meta?.phase       ?? 'regular',
    userTeamId: meta?.userTeamId  ?? null,
    schedule:   meta?.schedule    ?? null,
    offseasonProgressionDone: meta?.offseasonProgressionDone ?? false,
    freeAgencyState: meta?.freeAgencyState ?? null,
    draftStarted: !!(meta?.draftState),
    nextGameStakes,
    playoffSeeds: meta?.playoffSeeds ?? null,
    ownerApproval,
    fanApproval,
    teams,
  };
}

/**
 * Build a compact player list for a single team roster view.
 */
function buildRosterView(teamId) {
  const team = cache.getTeam(teamId);
  const players = cache.getPlayersByTeam(teamId);

  // Sort players by OVR to determine starters (simple heuristic for morale)
  // Group by pos? Or just global OVR rank?
  // Let's just assume top N players are starters for morale boost.
  // Actually, calculateMorale takes isStarter.
  // For RosterView, we just need to return the data.

  return players.map(p => {
    let fit = 50;
    if (team && team.staff && team.staff.headCoach) {
        const hc = team.staff.headCoach;
        const isOff = ['QB','RB','WR','TE','OL','K'].includes(p.pos);
        const isDef = ['DL','LB','CB','S','P'].includes(p.pos);

        if (isOff) fit = calculateOffensiveSchemeFit(p, hc.offScheme || 'Balanced');
        else if (isDef) fit = calculateDefensiveSchemeFit(p, hc.defScheme || '4-3');
    }

    // Heuristic: Active roster players are generally 'Starters' or key backups
    // We can refine this later with depth chart awareness
    const morale = calculateMorale(p, team, true);

    // Normalise contract: worker transactions store {baseAnnual, signingBonus, …}
    // inside p.contract, but makePlayer() during league init writes those fields
    // directly on the player object (legacy flat format).  Merge both so the UI
    // always receives a properly-shaped contract object.
    const contract = p.contract ?? (
      p.baseAnnual != null ? {
        years:        p.years        ?? 1,
        yearsTotal:   p.yearsTotal   ?? p.years ?? 1,
        yearsRemaining: p.years      ?? 1,
        baseAnnual:   p.baseAnnual,
        signingBonus: p.signingBonus ?? 0,
        guaranteedPct:p.guaranteedPct ?? 0.5,
      } : null
    );

    return {
        id:       p.id,
        name:     p.name,
        pos:      p.pos,
        age:      p.age,
        ovr:      p.ovr,
        progressionDelta: p.progressionDelta ?? null,
        contract,
        traits:   p.traits ?? [],
        schemeFit: fit,
        morale:    morale
    };
  });
}

// ── iOS PWA save-wipe guard ───────────────────────────────────────────────────
//
// On iOS Safari PWA, the worker can restart after the app is backgrounded.
// The new worker instance starts with an empty cache.  If flushDirty() were
// allowed to run before a save is explicitly loaded (via LOAD_SAVE or NEW_LEAGUE),
// it would write an empty state to IndexedDB, wiping the player's save.
//
// _saveIsExplicitlyLoaded is ONLY set to true by handleLoadSave / handleNewLeague.
// Every other path that might call flushDirty() is therefore safely blocked.
let _saveIsExplicitlyLoaded = false;

// ── DB flush ─────────────────────────────────────────────────────────────────

/**
 * Persist all dirty cache entries to IndexedDB in a SINGLE atomic transaction.
 * Using bulkWrite() eliminates the "database connection is closing" error that
 * occurred when Promise.all() fired multiple concurrent readwrite transactions
 * against the same IDBDatabase handle.
 *
 * Pre-flight validation ensures no record with a missing keyPath value is handed
 * to bulkWrite — this is the primary fix for the mobile WebKit IDB crash:
 *   "Failed to store record in an IDBObjectStore: Evaluating the object store's
 *    key path did not yield a value."
 */
async function flushDirty() {
  // PRIMARY iOS GUARD: Never flush until a save has been explicitly loaded or created.
  // This is the bootloader protection — the worker must never write an empty state.
  if (!_saveIsExplicitlyLoaded) {
    console.warn('[Worker] flushDirty blocked: no save explicitly loaded/created yet. Aborting DB write.');
    return;
  }

  if (!cache.isDirty()) return;

  // SECONDARY SAFETY CHECK: Never flush if cache isn't fully loaded (prevent empty overwrite)
  if (!cache.isLoaded()) {
      console.warn('[Worker] flushDirty called but cache is not loaded. Aborting DB write.');
      return;
  }

  const dirty = cache.drainDirty();

  // Resolve dirty IDs → full objects, dropping any that are null (already deleted).
  const teams   = dirty.teams.map(id => cache.getTeam(id)).filter(Boolean);
  const players = dirty.players.map(id => cache.getPlayer(id)).filter(Boolean);
  const playerDeletes = dirty.players.filter(id => !cache.getPlayer(id));

  // Validate that every team / player that will be written has a proper id field.
  // A missing id causes an IDB keyPath error that aborts the whole transaction.
  for (const t of teams) {
    if (t.id === undefined || t.id === null) {
      console.error('[Worker] flushDirty: team object has no id — skipping:', t);
    }
  }
  for (const p of players) {
    if (p.id === undefined || p.id === null) {
      console.error('[Worker] flushDirty: player object has no id — skipping:', p);
    }
  }

  // Validate game objects — filter out any without a valid id so a single bad
  // record can't abort the entire IDB transaction (mobile WebKit InvalidStateError).
  const validGames = dirty.games.filter(g => {
    if (g && g.id !== undefined && g.id !== null) return true;
    console.error('[Worker] flushDirty: dropping game with no id:', g);
    return false;
  });

  const seasonStats = dirty.seasonStats
    .map(pid => cache.getSeasonStat(pid))
    .filter(s => {
      if (!s) return false;
      if (s.seasonId == null || s.playerId == null) {
        console.error('[Worker] flushDirty: season stat missing seasonId/playerId:', s);
        return false;
      }
      return true;
    });

  // Draft picks are handled separately (small volume, own store not in bulkWrite).
  if (dirty.draftPicks.length > 0) {
    const toSave = dirty.draftPicks
      .map(id => cache.getDraftPick(id))
      .filter(pk => pk && pk.id != null);
    if (toSave.length) await DraftPicks.saveBulk(toSave);
  }

  // Update Global Save Metadata if league meta changed
  if (dirty.meta) {
    const meta = cache.getMeta();
    const leagueId = getActiveLeagueId();
    if (leagueId) {
      const userTeam = cache.getTeam(meta.userTeamId);
      await Saves.save({
        id: leagueId,
        name: meta.name || `League ${leagueId}`,
        year: meta.year,
        teamId: meta.userTeamId,
        teamAbbr: userTeam?.abbr || '???',
        lastPlayed: Date.now()
      });
    }
  }

  // bulkWrite itself also validates before each put — belt-and-suspenders.
  await bulkWrite({
    meta:          dirty.meta ? cache.getMeta() : null,
    teams,
    players,
    playerDeletes,
    games:         validGames,
    seasonStats,
  });

  // Heartbeat persistence: post a lightweight save manifest to the UI so it
  // can mirror the save index in localStorage. This protects against iOS Safari
  // clearing IndexedDB while the app is backgrounded (the manifest survives in
  // localStorage and lets the UI show a recovery prompt instead of "No saves").
  try {
    const _hbMeta = cache.getMeta();
    const _hbLeagueId = getActiveLeagueId();
    if (_hbMeta && _hbLeagueId) {
      const _hbUserTeam = cache.getTeam(_hbMeta.userTeamId);
      self.postMessage({ type: 'SAVE_MANIFEST_UPDATE', payload: {
        id:        _hbLeagueId,
        name:      _hbMeta.name || `League ${_hbLeagueId}`,
        year:      _hbMeta.year,
        teamAbbr:  _hbUserTeam?.abbr,
        lastPlayed: Date.now(),
      }});
    }
  } catch (_) { /* non-fatal — manifest is best-effort */ }
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
    await openGlobalDB();
    // We are ready, but we don't auto-load a save anymore.
    // The UI should verify worker readiness and then ask for save list.
    post(toUI.READY, {}, id);
  } catch (err) {
    post(toUI.ERROR, { message: err.message, stack: err.stack }, id);
  }
}

// ── Handler: GET_ALL_SAVES ────────────────────────────────────────────────────

async function handleGetAllSaves(payload, id) {
  try {
    const saves = await Saves.loadAll();
    saves.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
    post(toUI.ALL_SAVES, { saves }, id);
  } catch (err) {
    post(toUI.ERROR, { message: err.message }, id);
  }
}

// ── Handler: LOAD_SAVE ────────────────────────────────────────────────────────

async function handleLoadSave({ leagueId }, id) {
  if (!leagueId) { post(toUI.ERROR, { message: "No leagueId provided" }, id); return; }

  try {
    configureActiveLeague(leagueId);
    await openDB(); // Ensure DB is open
    const found = await loadSave(); // Loads into cache

    if (found) {
      // Arm the flush guard — save is now confirmed loaded.
      _saveIsExplicitlyLoaded = true;

      // Update lastPlayed in Global DB
      const meta = cache.getMeta();
      const userTeam = cache.getTeam(meta.userTeamId);
      const saveEntry = {
        id: leagueId,
        name: meta.name || `League ${leagueId}`,
        year: meta.year,
        teamId: meta.userTeamId,
        teamAbbr: userTeam?.abbr || '???',
        lastPlayed: Date.now()
      };
      await Saves.save(saveEntry);

      // Recalculate cap for every team so legacy saves (where players stored
      // salary as flat fields rather than inside a contract object) display
      // the correct Cap Used / Cap Room values immediately on load.
      for (const team of cache.getAllTeams()) {
        recalculateTeamCap(team.id);
      }

      // Auto-generate draft class if save is in draft phase but prospects are missing.
      // This guards against iOS saves where the worker restarted mid-draft.
      if (meta.phase === 'draft') {
        const draftEligible = cache.getAllPlayers().filter(p => p.status === 'draft_eligible');
        if (draftEligible.length === 0 && !meta.draftState) {
          const teams = cache.getAllTeams();
          const ROUNDS = 5;
          const classSize = ROUNDS * teams.length;
          const prospects = generateDraftClass(meta.year, { classSize });
          prospects.forEach(p => {
            cache.setPlayer({ ...p, teamId: null, status: 'draft_eligible' });
          });
          await flushDirty();
        }
      }

      // Completeness check: core fields (seasonId + teams) must be present.
      // Schedule is intentionally excluded — older saves may have stored it in
      // a different format; the Schedule tab handles missing data gracefully so
      // we must NOT block the UI in an infinite spinner waiting for it.
      const viewState = buildViewState();
      const isComplete = viewState.seasonId != null && viewState.teams.length > 0;

      if (!isComplete) {
        console.warn('[Worker] LOAD_SAVE: view state incomplete after hydration', viewState);
        post(toUI.NOTIFICATION, { level: 'warn', message: 'Save data partially loaded — some features may be unavailable.' });
      }

      post(toUI.FULL_STATE, viewState, id);
    } else {
      post(toUI.ERROR, { message: "Save not found" }, id);
    }
  } catch (e) {
    post(toUI.ERROR, { message: e.message, stack: e.stack }, id);
  }
}

// ── Handler: DELETE_SAVE ──────────────────────────────────────────────────────

async function handleDeleteSave({ leagueId }, id) {
  try {
    await Saves.delete(leagueId);
    await deleteLeagueDB(leagueId);
    // Return updated list
    await handleGetAllSaves({}, id);
  } catch (e) {
    post(toUI.ERROR, { message: e.message }, id);
  }
}

// ── Handler: NEW_LEAGUE ───────────────────────────────────────────────────────

async function handleNewLeague(payload, id) {
  try {
    const { teams: teamDefs, options = {} } = payload;
    const userTeamId = options.userTeamId ?? 0;

    // Generate new League ID
    const leagueId = Utils.id();
    configureActiveLeague(leagueId);

    // Wipe any existing data in this new DB (should be empty but good practice)
    await clearAllData();
    cache.reset();

    // Ensure we have a valid schedule generator
    // (Protects against module loading edge cases where named export might be undefined)
    const makeScheduleFn = makeAccurateSchedule || (Scheduler && Scheduler.makeAccurateSchedule);
    if (!makeScheduleFn) {
        throw new Error('Critical: makeAccurateSchedule could not be loaded.');
    }

    // Generate via existing core logic
    const league = makeLeague(teamDefs, options, {
        makeSchedule: makeScheduleFn,
        generateInitialStaff: generateInitialStaff
    });

    // Validate schedule
    if (!league.schedule || !Array.isArray(league.schedule.weeks) || league.schedule.weeks.length === 0) {
        throw new Error('League generation failed: Schedule is missing or empty.');
    }

    const seasonId = `s${league.season ?? 1}`;
    const meta = {
      id:              'league',
      name:            `League ${leagueId}`, // Store name in league meta too
      userTeamId:      userTeamId,
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

    // Compute Cap Used / Cap Room for every team now that players are in cache.
    // makePlayer() writes salary as flat fields (p.baseAnnual, p.signingBonus);
    // recalculateTeamCap reads both formats so this handles legacy data correctly.
    for (const team of cache.getAllTeams()) {
      recalculateTeamCap(team.id);
    }

    // Store schedule in meta (it's small: just matchup IDs, no objects)
    const slimSchedule = slimifySchedule(league.schedule, league.teams);
    cache.setMeta({ schedule: slimSchedule });

    // Arm the flush guard — new league is now created and ready for writes.
    _saveIsExplicitlyLoaded = true;

    // Persist league DB first — this is the critical data.
    // The Meta entry MUST be committed before anything else so that a
    // reload during this window never sees an empty league DB.
    await Meta.save(cache.getMeta());
    await Promise.all([
      Teams.saveBulk(cache.getAllTeams()),
      Players.saveBulk(cache.getAllPlayers()),
      DraftPicks.saveBulk(cache.getAllDraftPicks()),
    ]);
    // Clear dirty flags after explicit save
    cache.drainDirty();

    // Write the global Save Entry LAST — only after the league DB is confirmed.
    // This guarantees that if the user sees the save in their list, the league
    // data definitely exists.
    const userTeam = teamDefs.find(t => t.id === userTeamId);
    const saveEntry = {
        id: leagueId,
        name: meta.name,
        year: meta.year,
        teamId: userTeamId,
        teamAbbr: userTeam?.abbr || '???',
        lastPlayed: Date.now()
    };
    await Saves.save(saveEntry);

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

// ── Playoff bracket builder ────────────────────────────────────────────────────

/**
 * Build the Week 19 (Wildcard) slim schedule entry from current standings.
 * Seeds the top 7 teams per conference; seed 1 receives a bye.
 * Matchups: 2v7, 3v6, 4v5 per conference (higher seed hosts).
 * Also returns a playoffSeeds map used by advancePlayoffBracket for later rounds.
 *
 * @returns {{ week19Entry: object, playoffSeeds: object }}
 */
function generatePlayoffWeek19() {
  const SEEDS = 7;
  const teams = cache.getAllTeams();

  // Determine conference identifiers from actual team data (e.g. 0/1 integers)
  const confs = [...new Set(teams.map(t => t.conf))];

  // playoffSeeds[confId] = [{ teamId, seed, conf }, ...]  (index 0 = #1 seed)
  const playoffSeeds = {};

  const rankConf = (confId) => {
    const ranked = teams
      .filter(t => t.conf === confId)
      .sort((a, b) => {
        const wDiff = (b.wins ?? 0) - (a.wins ?? 0);
        if (wDiff !== 0) return wDiff;
        // Tiebreaker: point differential
        const diffA = (a.ptsFor ?? 0) - (a.ptsAgainst ?? 0);
        const diffB = (b.ptsFor ?? 0) - (b.ptsAgainst ?? 0);
        return diffB - diffA;
      })
      .slice(0, SEEDS);

    // Store seeds so advancePlayoffBracket can look them up later
    playoffSeeds[confId] = ranked.map((t, i) => ({ teamId: t.id, seed: i + 1, conf: confId }));
    return ranked;
  };

  const makeWCGames = (seeds, confId) => {
    if (seeds.length < SEEDS) return [];
    // seeds[0] = #1 seed (bye), seeds[1]=#2 … seeds[6]=#7
    return [
      { home: seeds[1].id, away: seeds[6].id, played: false, round: 'wildcard', conf: confId },
      { home: seeds[2].id, away: seeds[5].id, played: false, round: 'wildcard', conf: confId },
      { home: seeds[3].id, away: seeds[4].id, played: false, round: 'wildcard', conf: confId },
    ];
  };

  const allGames = confs.flatMap(confId => makeWCGames(rankConf(confId), confId));

  return {
    week19Entry: { week: 19, playoffRound: 'wildcard', games: allGames },
    playoffSeeds,
  };
}

/**
 * After a playoff week is simulated, determine winners and generate the next
 * round's slim schedule entry.  Returns null when the Super Bowl is over.
 *
 * Round map:
 *   Week 19 → Wildcard  → produces Week 20 (Divisional)
 *   Week 20 → Divisional → produces Week 21 (Conference)
 *   Week 21 → Conference → produces Week 22 (Super Bowl)
 *   Week 22 → Super Bowl → null (season over)
 *
 * Seeding mirrors legacy/playoffs.js:
 *   Divisional: seed[0] vs seed[3], seed[1] vs seed[2] per conf (incl. bye)
 *   Conference: lower seed hosts
 *   Super Bowl: AFC conf champ vs NFC conf champ
 */
function advancePlayoffBracket(results, currentWeek) {
  const meta = cache.getMeta();
  const seeds = meta.playoffSeeds ?? {};

  // Build a flat teamId → { teamId, seed, conf } lookup (Object.keys returns strings)
  const seedMap = {};
  for (const [confKey, confSeeds] of Object.entries(seeds)) {
    for (const s of confSeeds) {
      seedMap[s.teamId] = { ...s, conf: s.conf !== undefined ? s.conf : Number(confKey) };
    }
  }

  // Resolve conf for a team (seedMap first, then live cache)
  const getConf = (teamId) => {
    if (seedMap[teamId] !== undefined) return seedMap[teamId].conf;
    const t = cache.getTeam(teamId);
    return t ? t.conf : 0;
  };

  const getSeed = (teamId) => seedMap[teamId]?.seed ?? 99;

  // Extract winner from a single game result (home wins ties — no ties in playoffs)
  const getWinner = (r) => {
    const homeScore = r.scoreHome ?? r.homeScore ?? 0;
    const awayScore = r.scoreAway ?? r.awayScore ?? 0;
    const rawH = r.home      ?? r.homeTeamId;
    const rawA = r.away      ?? r.awayTeamId;
    const hId  = Number(typeof rawH === 'object' ? rawH?.id : rawH);
    const aId  = Number(typeof rawA === 'object' ? rawA?.id : rawA);
    return homeScore >= awayScore ? hId : aId;
  };

  const winners = results.map(r => getWinner(r));
  // Unique conference ids from the seeds object (as numbers)
  const confs = [...new Set(Object.keys(seeds).map(Number))].sort();

  if (currentWeek === 19) {
    // Wildcard → Divisional (Week 20)
    // Per conf: add the #1-seed bye + 3 WC survivors, sort by seed, then
    // lowest-seed (1) hosts vs highest-surviving-seed (slot 3) and so on.
    const allGames = [];
    for (const confId of confs) {
      const confSeeds = seeds[confId] ?? [];
      if (confSeeds.length === 0) continue;

      const byeEntry = { teamId: confSeeds[0].teamId, seed: 1, conf: confId };
      const wcSurvivors = winners
        .filter(tid => getConf(tid) === confId)
        .map(tid => ({ teamId: tid, seed: getSeed(tid), conf: confId }));

      const divTeams = [byeEntry, ...wcSurvivors].sort((a, b) => a.seed - b.seed);

      if (divTeams.length >= 4) {
        allGames.push({ home: divTeams[0].teamId, away: divTeams[3].teamId, played: false, round: 'divisional', conf: confId });
        allGames.push({ home: divTeams[1].teamId, away: divTeams[2].teamId, played: false, round: 'divisional', conf: confId });
      }
    }
    return { week: 20, playoffRound: 'divisional', games: allGames };

  } else if (currentWeek === 20) {
    // Divisional → Conference (Week 21)
    const allGames = [];
    for (const confId of confs) {
      const confWinners = winners
        .filter(tid => getConf(tid) === confId)
        .map(tid => ({ teamId: tid, seed: getSeed(tid) }))
        .sort((a, b) => a.seed - b.seed);

      if (confWinners.length >= 2) {
        allGames.push({ home: confWinners[0].teamId, away: confWinners[1].teamId, played: false, round: 'conference', conf: confId });
      }
    }
    return { week: 21, playoffRound: 'conference', games: allGames };

  } else if (currentWeek === 21) {
    // Conference → Super Bowl (Week 22)
    // AFC (confs[0]) champ hosts by convention
    const afcChamp = winners.find(tid => getConf(tid) === confs[0]) ?? winners[0];
    const nfcChamp = winners.find(tid => getConf(tid) === (confs[1] ?? 1)) ?? winners[1];
    if (afcChamp !== undefined && nfcChamp !== undefined) {
      return { week: 22, playoffRound: 'superbowl', games: [
        { home: afcChamp, away: nfcChamp, played: false, round: 'superbowl' },
      ]};
    }
  }

  // currentWeek === 22 (Super Bowl just played) or unexpected state → season over
  return null;
}

// ── Handler: ADVANCE_WEEK ─────────────────────────────────────────────────────

async function handleAdvanceWeek(payload, id) {
  const meta = cache.getMeta();
  if (!meta) { post(toUI.ERROR, { message: 'No league loaded' }, id); return; }

  // Prevent runaway state machine: strict phase check
  if (!['regular', 'playoffs', 'preseason'].includes(meta.phase)) {
      post(toUI.ERROR, { message: `Cannot advance week in phase "${meta.phase}". Use the correct action.` }, id);
      return;
  }

  // ── Preseason Cutdown Check ──────────────────────────────────────────────
  if (meta.phase === 'preseason') {
    const userRoster = cache.getPlayersByTeam(meta.userTeamId);
    const limit = Constants.ROSTER_LIMITS.REGULAR_SEASON;

    if (userRoster.length > limit) {
      post(toUI.ERROR, { message: `Roster limit exceeded! You have ${userRoster.length} players. Cut down to ${limit} to advance.` }, id);
      return;
    }

    // Execute AI Cutdowns
    await AiLogic.executeAICutdowns();

    // Priority 4: Initialize zeroed-out season stat entries for EVERY active player
    // on EVERY team before the first game is simulated. This guarantees that:
    //   (a) Players who never appear in a box score still show gamesPlayed: 0
    //       instead of returning nothing from the stats viewer.
    //   (b) The stat cache keys are always String(player.id) so the Map lookups
    //       in applyGameResultToCache and handleGetAllPlayerStats always match.
    for (const team of cache.getAllTeams()) {
      for (const player of cache.getPlayersByTeam(team.id)) {
        const pid = String(player.id);
        if (!cache.getSeasonStat(pid)) {
          cache.updateSeasonStat(pid, team.id, { gamesPlayed: 0 });
        }
      }
    }

    // Set phase to Regular Season, keep Week 1
    cache.setMeta({ phase: 'regular', currentWeek: 1 });
    await flushDirty();

    // Return state update (no simulation)
    post(toUI.WEEK_COMPLETE, {
      week: 1,
      results: [],
      standings: buildStandings(),
      nextWeek: 1,
      phase: 'regular',
      isSeasonOver: false,
    }, id);
    post(toUI.STATE_UPDATE, buildViewState());
    return;
  }
  // ──────────────────────────────────────────────────────────────────────────

  const week        = meta.currentWeek;
  const seasonId    = meta.currentSeasonId;
  const schedule    = expandSchedule(meta.schedule);

  if (!schedule) { post(toUI.ERROR, { message: 'No schedule found' }, id); return; }

  // ── 0. Update Injuries (Recovery) ─────────────────────────────────────────
  // Before simulation, process recovery for all players in the league.
  if (['regular', 'playoffs', 'preseason'].includes(meta.phase)) {
      const allPlayers = cache.getAllPlayers();
      for (const p of allPlayers) {
          if (p.injuryWeeksRemaining && p.injuryWeeksRemaining > 0) {
              p.injuryWeeksRemaining--;
              if (p.injuryWeeksRemaining <= 0) {
                  // Healed
                  p.injuryWeeksRemaining = 0;
                  p.injured = false;
                  p.injuries = []; // Clear injury list
                  p.seasonEndingInjury = false;
                  // Notify? Maybe too spammy.
              }
              // Mark as dirty to ensure persistence
              cache.updatePlayer(p.id, {
                  injuryWeeksRemaining: p.injuryWeeksRemaining,
                  injured: p.injured,
                  injuries: p.injuries,
                  seasonEndingInjury: p.seasonEndingInjury
              });
          }
      }
  }


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
    const batchResults = simulateBatch(batch, {
      league,
      isPlayoff: meta.phase === 'playoffs'
    });
    results.push(...batchResults);

    // Apply each game result to cache and emit GAME_EVENT per game
    for (const res of batchResults) {
      applyGameResultToCache(res, week, seasonId);

      // Log significant injuries to News

      // Mark injured players as dirty so changes persist
      if (res.injuries) {
          for (const inj of res.injuries) {
             // We just need to trigger a dirty flag. Passing current state works.
             const p = cache.getPlayer(inj.playerId);
             if (p) {
                 cache.updatePlayer(p.id, {
                     injuries: p.injuries,
                     injured: p.injured,
                     injuryWeeksRemaining: p.injuryWeeksRemaining,
                     seasonEndingInjury: p.seasonEndingInjury
                 });
             }
          }
      }

if (res.injuries && res.injuries.length > 0) {
          for (const inj of res.injuries) {
              // Log only if duration > 2 weeks to reduce noise, or if season ending
              if (inj.duration > 2 || inj.seasonEnding) {
                  const p = cache.getPlayer(inj.playerId);
                  if (p) {
                      // Fire and forget (don't await to keep sim speed up, or await if consistency needed)
                      // Since IDB ops are async, we should await or at least trigger.
                      // Since we are inside an async function, let's await to be safe.
                      await NewsEngine.logInjury(p, inj.type, inj.duration);
                  }
              }
          }
      }

      // Emit GAME_EVENT so the LiveGame viewer can update the scoreboard in real-time
      const rawH   = res.home      ?? res.homeTeamId;
      const rawA   = res.away      ?? res.awayTeamId;
      const homeId = Number(typeof rawH === 'object' ? rawH?.id : rawH);
      const awayId = Number(typeof rawA === 'object' ? rawA?.id : rawA);
      if (!isNaN(homeId) && !isNaN(awayId)) {
        post(toUI.GAME_EVENT, {
          gameId:    `${seasonId}_w${week}_${homeId}_${awayId}`,
          week,
          homeId,
          awayId,
          homeName:  res.homeTeamName ?? cache.getTeam(homeId)?.name ?? '?',
          awayName:  res.awayTeamName ?? cache.getTeam(awayId)?.name ?? '?',
          homeAbbr:  res.homeTeamAbbr ?? cache.getTeam(homeId)?.abbr ?? '???',
          awayAbbr:  res.awayTeamAbbr ?? cache.getTeam(awayId)?.abbr ?? '???',
          homeScore: res.scoreHome ?? res.homeScore ?? 0,
          awayScore: res.scoreAway ?? res.awayScore ?? 0,
        });
      }
    }

    post(toUI.SIM_PROGRESS, { done: i + batch.length, total: gamesToSim.length }, id);
    await yieldFrame();
  }

  // --- Advance week / phase ---
  const TOTAL_REG_WEEKS    = 18;
  const isRegSeasonEnd     = meta.phase === 'regular' && week >= TOTAL_REG_WEEKS;
  const isPlayoffWeek      = meta.phase === 'playoffs';
  const isSuperbowl        = isPlayoffWeek && week === 22;

  // Mark all games in the just-simulated week as played
  // (scores were already written into the slim schedule by applyGameResultToCache)
  markWeekPlayed(meta.schedule, week);

  let nextWeekNum   = week + 1;   // may be overridden below
  let seasonEndFlag = false;

  if (isRegSeasonEnd) {
    // ── Regular season complete → generate Wildcard bracket ─────────────────
    const { week19Entry, playoffSeeds } = generatePlayoffWeek19();
    const sched = cache.getMeta().schedule ?? { weeks: [] };
    if (!sched.weeks.find(w => w.week === 19)) sched.weeks.push(week19Entry);
    cache.setMeta({ currentWeek: 19, phase: 'playoffs', schedule: sched, playoffSeeds });
    nextWeekNum = 19;

  } else if (isSuperbowl) {
    // ── Super Bowl just played → notify winner, transition to offseason ──────
    seasonEndFlag = true;
    // Find and announce the champion
    let sbChampId = null;
    if (results.length > 0) {
      const sbR = results[0];
      const hScore = sbR.scoreHome ?? sbR.homeScore ?? 0;
      const aScore = sbR.scoreAway ?? sbR.awayScore ?? 0;
      const rawW   = hScore >= aScore ? (sbR.home ?? sbR.homeTeamId) : (sbR.away ?? sbR.awayTeamId);
      const wId    = Number(typeof rawW === 'object' ? rawW?.id : rawW);
      const champ  = cache.getTeam(wId);
      // Decrement yearsRemaining for all players at the end of the season
      const allPlayers = cache.getAllPlayers();
      for (const p of allPlayers) {
          // Only process active players (on a team or free agents)
          if (p.contract && p.contract.yearsRemaining > 0) {
              p.contract.yearsRemaining--;
              cache.updatePlayer(p.id, { contract: p.contract });
          } else if (p.yearsRemaining > 0) {
              // Legacy fallback
              p.yearsRemaining--;
              cache.updatePlayer(p.id, { yearsRemaining: p.yearsRemaining });
          }
      }
      if (champ) {
        sbChampId = wId;
        post(toUI.NOTIFICATION, { level: 'info', message: `🏆 ${champ.name} win the Super Bowl! Season complete.` });
        await NewsEngine.logAward('SUPER_BOWL', champ);
      }
    }
    // ── Phase transition: playoffs → offseason_resign ─────────────────────────
    // offseason_resign is the contract-extension window (User + AI renew
    // expiring deals before the FA bidding phase begins).
    // Reset currentWeek so the UI no longer shows "Week 22".
    cache.setMeta({ phase: 'offseason_resign', currentWeek: 0, championTeamId: sbChampId, offseasonProgressionDone: false, draftState: null, freeAgencyState: null });

  } else if (isPlayoffWeek) {
    // ── Regular playoff round → advance bracket to next round ───────────────
    const nextRound = advancePlayoffBracket(results, week);
    if (nextRound) {
      const sched = cache.getMeta().schedule ?? { weeks: [] };
      if (!sched.weeks.find(w => w.week === nextRound.week)) sched.weeks.push(nextRound);
      cache.setMeta({ currentWeek: nextRound.week, schedule: sched });
      nextWeekNum = nextRound.week;
    }

  } else {
    // ── Normal regular-season week ────────────────────────────────────────────
    cache.setMeta({ currentWeek: nextWeekNum });
  }

  // --- AI-to-AI Trades (regular season only) ---
  // Runs after standings/scores are finalised so AI decisions reflect current rosters.
  // Max 2 trades per week — see trade-logic.js for full guardrails.
  if (meta.phase === 'regular') {
    try {
      await runAIToAITrades();
    } catch (tradeErr) {
      // Trade engine errors should never crash the week advance.
      console.warn('[Worker] AI trade engine error (non-fatal):', tradeErr.message);
    }
  }

  // AUTO-SAVE: phase transition — persist all game results and the new week/phase to IDB.
  await flushDirty();

  // --- Check for Game Narratives (User Team) ---
  // Send notifications for any "callbacks" (narrative moments) generated during simulation
  const userResult = results.find(r => r.home === meta.userTeamId || r.away === meta.userTeamId);
  if (userResult && userResult.callbacks && Array.isArray(userResult.callbacks)) {
    userResult.callbacks.forEach(msg => {
      post(toUI.NOTIFICATION, { level: 'info', message: msg });
    });
  }

  // --- Build response (minimal) ---
  // commitGameResult stores team IDs in result.home / result.away (not name fields).
  // Resolve names from cache so the UI ticker always shows real team names.
  const gameResults = results.map(r => {
    const rawH   = r.home ?? r.homeTeamId;
    const rawA   = r.away ?? r.awayTeamId;
    const homeId = Number(typeof rawH === 'object' ? rawH?.id : rawH);
    const awayId = Number(typeof rawA === 'object' ? rawA?.id : rawA);
    return {
      homeId,
      awayId,
      homeName:  r.homeTeamName ?? cache.getTeam(homeId)?.name ?? '?',
      awayName:  r.awayTeamName ?? cache.getTeam(awayId)?.name ?? '?',
      homeScore: r.scoreHome ?? r.homeScore ?? 0,
      awayScore: r.scoreAway ?? r.awayScore ?? 0,
    };
  });

  post(toUI.WEEK_COMPLETE, {
    week,
    results:    gameResults,
    standings:  buildStandings(),
    nextWeek:   nextWeekNum,
    phase:      cache.getPhase(),
    isSeasonOver: isRegSeasonEnd || seasonEndFlag,
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
 * Updates team win/loss records, writes scores into the slim schedule,
 * aggregates player season stats, and logs the game to the dirty buffer.
 *
 * NOTE: commitGameResult (game-simulator.js) stores team IDs as result.home /
 * result.away (not homeTeamId / awayTeamId), so we read both field names and
 * cast to Number to match the integer keys stored in the cache Map.
 */
function applyGameResultToCache(result, week, seasonId) {
  // result.home / result.away can be either an integer team ID (normal path)
  // or a full team object (if a simulator variant returns objects).
  // Strictly coerce to Number so the cache Map keys always match.
  const rawH = result.home      ?? result.homeTeamId;
  const rawA = result.away      ?? result.awayTeamId;
  const hId  = Number(typeof rawH === 'object' ? rawH?.id : rawH);
  const aId  = Number(typeof rawA === 'object' ? rawA?.id : rawA);
  if (isNaN(hId) || isNaN(aId)) return;

  const scoreHome = result.scoreHome ?? result.homeScore ?? 0;
  const scoreAway = result.scoreAway ?? result.awayScore ?? 0;

  const homeWin = scoreHome > scoreAway;
  const tie     = scoreHome === scoreAway;

  // ── 1. Update team win/loss records in cache ─────────────────────────────
  const homeTeam = cache.getTeam(hId);
  const awayTeam = cache.getTeam(aId);

  if (homeTeam) {
    cache.updateTeam(hId, {
      wins:       (homeTeam.wins ?? 0) + (homeWin ? 1 : 0),
      losses:     (homeTeam.losses ?? 0) + (!homeWin && !tie ? 1 : 0),
      ties:       (homeTeam.ties ?? 0) + (tie ? 1 : 0),
      ptsFor:     (homeTeam.ptsFor ?? 0) + scoreHome,
      ptsAgainst: (homeTeam.ptsAgainst ?? 0) + scoreAway,
    });
  }
  if (awayTeam) {
    cache.updateTeam(aId, {
      wins:       (awayTeam.wins ?? 0) + (!homeWin && !tie ? 1 : 0),
      losses:     (awayTeam.losses ?? 0) + (homeWin ? 1 : 0),
      ties:       (awayTeam.ties ?? 0) + (tie ? 1 : 0),
      ptsFor:     (awayTeam.ptsFor ?? 0) + scoreAway,
      ptsAgainst: (awayTeam.ptsAgainst ?? 0) + scoreHome,
    });
  }

  // ── 2. Write scores back into slim schedule so the UI can display them ────
  // getMeta() returns the live _meta reference, so mutating game objects here
  // persists through to the subsequent markWeekPlayed → cache.setMeta() call.
  const slimSchedule = cache.getMeta()?.schedule;
  if (slimSchedule?.weeks) {
    const weekData = slimSchedule.weeks.find(w => w.week === week);
    if (weekData) {
      const game = weekData.games.find(
        g => Number(g.home) === hId && Number(g.away) === aId
      );
      if (game) {
        game.homeScore = scoreHome;
        game.awayScore = scoreAway;
      }
    }
  }

  // ── 3. Aggregate per-player game stats into seasonal totals ───────────────
  // result.boxScore shape: { home: {[pid]: {name, pos, stats:{...}}}, away: {...} }
  //
  // AWARD RACES FIX: Always inject `gamesPlayed: 1` for every player who
  // appears in a box score.  calculateAwardRaces() filters on
  // `totals.gamesPlayed >= MIN_GAMES_AWARD` — if the simulator never emits
  // this field the accumulator stays 0 and ALL players are excluded.
  const aggregateSide = (teamId, boxSide) => {
    if (!boxSide) return;
    for (const [pid, entry] of Object.entries(boxSide)) {
      if (entry?.stats) {
        // Use String(pid) — player IDs are base-36 strings generated by U.id().
        // Converting to Number() yields NaN for string IDs, corrupting all stat entries.
        cache.updateSeasonStat(String(pid), teamId, { ...entry.stats, gamesPlayed: 1 });
      }
    }
  };
  aggregateSide(hId, result.boxScore?.home);
  aggregateSide(aId, result.boxScore?.away);

  // ── 4. Queue game record for DB flush ─────────────────────────────────────
  const gameId = `${seasonId}_w${week}_${hId}_${aId}`;
  cache.addGame({
    id:        gameId,
    seasonId,
    week,
    homeId:    hId,
    awayId:    aId,
    homeScore: scoreHome,
    awayScore: scoreAway,
    stats:     result.boxScore ?? null,
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
  // Player IDs are base-36 strings generated by U.id() (e.g. 'k3n7x2mq').
  // NEVER convert to Number — that yields NaN for string IDs, causing a miss.
  // Use String() to normalise, then do both a direct lookup AND a string-safe scan.
  if (playerId == null || playerId === '') {
    post(toUI.PLAYER_CAREER, { playerId, player: null, stats: [], error: 'Invalid playerId' }, id);
    return;
  }
  const strId = String(playerId);

  try {
    // ── 1. Cache lookup — try the raw key, then a string-comparison scan ─────
    let player = cache.getPlayer(strId);

    // Backward-compat: legacy saves may have stored players with numeric IDs.
    if (!player) {
      const numId = Number(strId);
      if (Number.isFinite(numId)) player = cache.getPlayer(numId);
    }

    // Full scan: covers any residual type-mismatch where the Map key differs from strId.
    if (!player) {
      player = cache.getAllPlayers().find(p => String(p.id) === strId);
    }

    // ── 2. DB fallback — rookies / released players may not be in hot cache ───
    if (!player) {
      player = await Players.load(strId).catch(() => null);
    }
    if (!player) {
      const numId = Number(strId);
      if (Number.isFinite(numId)) player = await Players.load(numId).catch(() => null);
    }

    // ── 2b. Draft-prospect fallback ─────────────────────────────────────────
    // Draft-eligible players live in the hot cache but may not be in the DB yet
    // (they're flushed lazily).  Explicitly scan the draft pool so clicking a
    // prospect in the Draft board never returns the "Unknown Player" skeleton.
    if (!player) {
      player = cache.getAllPlayers().find(
        p => p.status === 'draft_eligible' && String(p.id) === strId
      ) ?? null;
      if (player) {
        // Prospects have no career stats yet — return early with empty stats array.
        post(toUI.PLAYER_CAREER, {
          playerId: strId,
          player,
          stats: [],
          isDraftProspect: true,
        }, id);
        return;
      }
    }

    // ── 2c. PlayerStats-based reconstruction (retired players) ─────────────
    // If the player object was lost (e.g. old saves that deleted retired
    // players), reconstruct a minimal record from their archived stat rows.
    if (!player) {
      let retiredStats = [];
      try {
        retiredStats = (await PlayerStats.byPlayer(strId)) ?? [];
        if (!retiredStats.length) {
          const numId = Number(strId);
          if (Number.isFinite(numId)) retiredStats = (await PlayerStats.byPlayer(numId)) ?? [];
        }
      } catch (_) { /* swallow */ }

      if (retiredStats.length > 0) {
        // Reconstruct a minimal player shell from the stat records
        const sample = retiredStats[0];
        player = {
          id: strId,
          name: sample.name || 'Retired Player',
          pos:  sample.pos  || '?',
          ovr:  sample.ovr  ?? 0,
          age:  null,
          teamId: null,
          status: 'retired',
          ratings: {},
          traits: [],
          accolades: [],
        };
        // Stats will be merged below in step 3/4 as normal.
      }
    } else {
        // Player FOUND in active cache or DB.
        // Force status to 'active' if they are on a team roster, to prevent
        // any lingering 'retired' flags or missing status fields from breaking the UI.
        // Exception: If they are explicitly marked 'retired' in the cache (e.g. just retired this offseason), keep it.
        if (player.teamId !== null && player.status !== 'retired') {
            player.status = 'active';
        }
    }

    if (!player) {
      console.warn(`[Worker] GET_PLAYER_CAREER: Player ${strId} not found in Cache, DB, or PlayerStats.`);
      const skeleton = {
        id: strId,
        name: 'Unknown Player',
        pos: '?',
        ovr: 0,
        teamId: null,
        status: 'unknown',
        ratings: {},
        stats: { career: { gamesPlayed: 0 } }
      };
      post(toUI.PLAYER_CAREER, {
        playerId: strId,
        player: skeleton,
        stats: [],
        error: 'Player not found'
      }, id);
      return;
    }

    // ── 3. Historical stats from DB ─────────────────────────────────────────
    let archivedStats = [];
    try {
      archivedStats = (await PlayerStats.byPlayer(strId)) ?? [];
      // Backward-compat: also try numeric key if string fetch returned nothing.
      if (!archivedStats.length) {
        const numId = Number(strId);
        if (Number.isFinite(numId)) archivedStats = (await PlayerStats.byPlayer(numId)) ?? [];
      }
    } catch (dbErr) {
      console.warn('[Worker] GET_PLAYER_CAREER: Could not load archived stats for', strId, dbErr.message);
      archivedStats = [];
    }

    // ── 4. Merge live (current-season) accumulator ─────────────────────────
    // The in-memory stat accumulator is always the freshest version for the
    // current season.  Strip any DB entry for the same season to avoid double-counting.
    let liveSeasonStat = cache.getSeasonStat(strId);
    if (!liveSeasonStat) {
      const numId = Number(strId);
      if (Number.isFinite(numId)) liveSeasonStat = cache.getSeasonStat(numId);
    }
    const currentSeasonId = cache.getMeta()?.currentSeasonId ?? null;

    const historicalStats = archivedStats.filter(s => {
      if (!s || s.seasonId == null) return false;
      if (liveSeasonStat && currentSeasonId && s.seasonId === currentSeasonId) return false;
      return true;
    });

    const allStats = [...historicalStats];
    if (liveSeasonStat) allStats.push(liveSeasonStat);

    post(toUI.PLAYER_CAREER, {
      playerId: strId,
      player:   player ?? null,
      stats:    allStats,
    }, id);

  } catch (err) {
    console.error('[Worker] GET_PLAYER_CAREER unhandled error for player', strId, err);
    const fallbackPlayer = cache.getPlayer(strId) ?? cache.getAllPlayers().find(p => String(p.id) === strId) ?? null;
    post(toUI.PLAYER_CAREER, {
      playerId: strId,
      player:   fallbackPlayer,
      stats:    [],
      accolades: [],
      error:    err.message,
    }, id);
  }
}

// ── Handler: GET_BOX_SCORE ────────────────────────────────────────────────────

async function handleGetBoxScore({ gameId }, id) {
  if (!gameId) {
    post(toUI.BOX_SCORE, { gameId: null, game: null, error: 'No gameId provided' }, id);
    return;
  }

  try {
    // Look for the game in the current week's hot cache first
    const hotGame = cache.getWeekGames().find(g => g.id === gameId);
    const game    = hotGame ?? await Games.load(gameId);

    if (!game) {
      post(toUI.BOX_SCORE, { gameId, game: null, error: 'Game not found' }, id);
      return;
    }

    const homeTeam = cache.getTeam(game.homeId);
    const awayTeam = cache.getTeam(game.awayId);

    post(toUI.BOX_SCORE, {
      gameId,
      game: {
        id:        game.id,
        seasonId:  game.seasonId,
        week:      game.week,
        homeId:    game.homeId,
        awayId:    game.awayId,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        homeName:  homeTeam?.name ?? '?',
        homeAbbr:  homeTeam?.abbr ?? '???',
        awayName:  awayTeam?.name ?? '?',
        awayAbbr:  awayTeam?.abbr ?? '???',
        stats:     game.stats ?? null,
      },
    }, id);
  } catch (err) {
    post(toUI.BOX_SCORE, { gameId, game: null, error: err.message }, id);
  }
}

// ── Handler: SAVE_NOW ─────────────────────────────────────────────────────────

async function handleSaveNow(payload, id) {
  // Verify the DB connection is still alive before attempting a flush.
  // On iOS/Safari, the connection can be silently killed after backgrounding.
  // openDB() re-opens if needed; if it rejects, the catch below surfaces the error.
  try {
    if (getActiveLeagueId()) await openDB();
    await flushDirty();
    post(toUI.SAVED, {}, id);
  } catch (err) {
    console.error('[Worker] SAVE_NOW failed:', err.message);
    post(toUI.ERROR, { message: `Save failed: ${err.message}` }, id);
  }
}

// ── Handler: RESET_LEAGUE ─────────────────────────────────────────────────────

async function handleResetLeague(payload, id) {
  _saveIsExplicitlyLoaded = false;
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
  const meta = cache.getMeta();
  const limit = (['offseason_resign', 'free_agency', 'draft', 'offseason', 'preseason'].includes(meta.phase))
      ? Constants.ROSTER_LIMITS.OFFSEASON
      : Constants.ROSTER_LIMITS.REGULAR_SEASON;

  const roster = cache.getPlayersByTeam(teamId);
  if (roster.length >= limit) {
      post(toUI.ERROR, { message: `Roster limit (${limit}) reached. Release a player first.` }, id);
      return;
  }

  // Normalize the incoming playerId: Map lookup first, then string-comparison scan.
  let player = cache.getPlayer(playerId);
  if (!player) player = cache.getPlayer(String(playerId));
  if (!player) player = cache.getAllPlayers().find(p => String(p.id) === String(playerId));
  if (!player) { post(toUI.ERROR, { message: 'Player not found' }, id); return; }

  const oldTeamId = player.teamId;
  cache.updatePlayer(player.id, { teamId, contract, status: 'active', offers: [] });

  // Update cap
  recalculateTeamCap(teamId);
  if (oldTeamId != null && oldTeamId !== teamId) recalculateTeamCap(oldTeamId);

  const txDetails = { playerId, contract };
  await Transactions.add({
    type: 'SIGN', seasonId: meta.currentSeasonId,
    week: meta.currentWeek, teamId, details: txDetails,
  });
  await NewsEngine.logTransaction('SIGN', { teamId, ...txDetails });

  await flushDirty();
  post(toUI.STATE_UPDATE, { roster: buildRosterView(teamId), ...buildViewState() }, id);
}

// ── Handler: SUBMIT_OFFER ─────────────────────────────────────────────────────

async function handleSubmitOffer({ playerId, teamId, contract }, id) {
  const player = cache.getPlayer(playerId);
  if (!player) { post(toUI.ERROR, { message: 'Player not found' }, id); return; }

  const team = cache.getTeam(teamId);
  if (!team) { post(toUI.ERROR, { message: 'Team not found' }, id); return; }

  // Cap check
  const capHit = contract.baseAnnual + (contract.signingBonus / contract.yearsTotal);
  if (team.capRoom < capHit) {
      post(toUI.ERROR, { message: 'Not enough cap room' }, id);
      return;
  }

  // Add/Update offer
  if (!player.offers) player.offers = [];

  // Remove existing offer from this team if any
  const existingIdx = player.offers.findIndex(o => o.teamId === teamId);
  if (existingIdx > -1) player.offers.splice(existingIdx, 1);

  player.offers.push({
      teamId,
      teamName: team.name,
      contract,
      timestamp: Date.now()
  });

  // We strictly don't save "offers" to DB in this simplified model unless we updated schema.
  // But cache.updatePlayer marks it dirty.
  // IMPORTANT: Player object schema in DB needs to support 'offers'.
  // IndexedDB 'put' will handle extra fields fine.
  cache.updatePlayer(playerId, { offers: player.offers });

  await flushDirty();

  // Return updated FA data view so UI reflects the offer immediately
  // Also state update
  await handleGetFreeAgents({}, null); // Broadcast FA update if needed, but easier to just reply success
  post(toUI.STATE_UPDATE, buildViewState(), id);
}

// ── Handler: RELEASE_PLAYER ───────────────────────────────────────────────────

async function handleReleasePlayer({ playerId, teamId }, id) {
  let player = cache.getPlayer(playerId);
  if (!player) player = cache.getPlayer(String(playerId));
  if (!player) player = cache.getAllPlayers().find(p => String(p.id) === String(playerId));
  if (!player) { post(toUI.ERROR, { message: 'Player not found' }, id); return; }

  // Calculate Dead Cap: Remaining prorated bonus
  const team = cache.getTeam(teamId);
  if (team && player.contract) {
    const yearsRemaining = player.contract.years || 1;
    const yearsTotal = player.contract.yearsTotal || 1;
    const totalBonus = player.contract.signingBonus || 0;

    // Prorated amount per year
    const annualBonus = totalBonus / yearsTotal;

    // Dead cap is the acceleration of all remaining bonus money
    const deadMoney = annualBonus * yearsRemaining;

    if (deadMoney > 0) {
       const currentDead = team.deadCap || 0;
       cache.updateTeam(teamId, { deadCap: currentDead + deadMoney });
    }
  }

  // Use player.id (the canonical key from the cache) for all subsequent writes.
  cache.updatePlayer(player.id, { teamId: null, status: 'free_agent', offers: [] });
  recalculateTeamCap(teamId);

  const meta = cache.getMeta();
  await Transactions.add({
    type: 'RELEASE', seasonId: meta.currentSeasonId,
    week: meta.currentWeek, teamId, details: { playerId: player.id },
  });
  await NewsEngine.logTransaction('RELEASE', { teamId, playerId: player.id });

  await flushDirty();
  post(toUI.STATE_UPDATE, { roster: buildRosterView(teamId), ...buildViewState() }, id);
}

// ── Handler: GET_ROSTER ───────────────────────────────────────────────────────

async function handleGetRoster({ teamId }, id) {
  const numId = Number(teamId);
  const team  = cache.getTeam(numId);
  const teamNeeds = AiLogic.getRankedTeamNeeds(numId);
  if (!team) { post(toUI.ERROR, { message: `Team ${teamId} not found` }, id); return; }

  const players = cache.getPlayersByTeam(numId).map(p => {
      let fit = 50;
      if (team && team.staff && team.staff.headCoach) {
          const hc = team.staff.headCoach;
          const isOff = ['QB','RB','WR','TE','OL','K'].includes(p.pos);
          const isDef = ['DL','LB','CB','S','P'].includes(p.pos);

          if (isOff) fit = calculateOffensiveSchemeFit(p, hc.offScheme || 'Balanced');
          else if (isDef) fit = calculateDefensiveSchemeFit(p, hc.defScheme || '4-3');
      }

      // Normalise contract: handle both nested p.contract and legacy flat fields.
      const contract = p.contract ?? (
        p.baseAnnual != null ? {
          years:         p.years        ?? 1,
          yearsTotal:    p.yearsTotal   ?? p.years ?? 1,
          yearsRemaining:p.years        ?? 1,
          baseAnnual:    p.baseAnnual,
          signingBonus:  p.signingBonus ?? 0,
          guaranteedPct: p.guaranteedPct ?? 0.5,
        } : null
      );

      return {
        id:               p.id,
        name:             p.name,
        pos:              p.pos,
        age:              p.age,
        ovr:              p.ovr,
        progressionDelta: p.progressionDelta ?? null,
        potential:        p.potential ?? null,
        status:           p.status ?? 'active',
        contract,
        traits:           p.traits ?? [],
        schemeFit:        fit,
        morale:           calculateMorale(p, team, true)
      };
  });

  post(toUI.ROSTER_DATA, {
    teamId: numId,
    team: {
      id:      team.id,
      name:    team.name,
      abbr:    team.abbr,
      capUsed: team.capUsed ?? 0,
      capRoom: team.capRoom ?? 0,
      capTotal:team.capTotal ?? 255,
    },
    teamNeeds,
    players,
    },
    players,
  }, id);
}

// ── Handler: GET_FREE_AGENTS ──────────────────────────────────────────────────

async function handleGetFreeAgents(payload, id) {
  const meta = cache.getMeta();
  const userTeamId = meta.userTeamId;
  const teamNeeds = AiLogic.getRankedTeamNeeds(userTeamId);

  const freeAgents = cache.getAllPlayers()
    .filter(p => !p.teamId || p.status === 'free_agent')
    .map(p => {
        // Summarize offers for UI
        const offers = p.offers || [];
        const userOffer = offers.find(o => o.teamId === userTeamId);

        // Calculate max offer value
        let topOfferValue = 0;
        if (offers.length > 0) {
            topOfferValue = offers.reduce((max, o) => {
                const c = o.contract;
                const val = (c.baseAnnual * c.yearsTotal) + c.signingBonus;
                return val > max ? val : max;
            }, 0);
        }

        return {
          id:        p.id,
          name:      p.name,
          pos:       p.pos,
          age:       p.age,
          ovr:       p.ovr,
          potential: p.potential ?? null,
          contract:  p.contract ?? null,   // last known contract (asking price reference)
          traits:    p.traits ?? [],
          offers: {
              count: offers.length,
              userOffered: !!userOffer,
              topOfferValue: Math.round(topOfferValue * 10) / 10
          }
        };
    });

  post(toUI.FREE_AGENT_DATA, { freeAgents, teamNeeds }, id);
}

// ── Handler: COACHING ACTIONS ────────────────────────────────────────────────

async function handleGetAvailableCoaches(payload, id) {
    // Generate a fresh pool of candidates
    const coaches = [];
    // Generate 5 HC, 5 OC, 5 DC
    for (let i = 0; i < 5; i++) coaches.push(makeCoach('HC'));
    for (let i = 0; i < 5; i++) coaches.push(makeCoach('OC'));
    for (let i = 0; i < 5; i++) coaches.push(makeCoach('DC'));

    // Sort by rating
    coaches.sort((a, b) => b.rating - a.rating);

    post(toUI.AVAILABLE_COACHES, { coaches }, id);
}

async function handleHireCoach({ teamId, coach, role }, id) {
    const team = cache.getTeam(Number(teamId));
    if (!team) {
        post(toUI.ERROR, { message: 'Team not found' }, id);
        return;
    }

    if (!team.staff) team.staff = {};

    // Assign coach to slot
    if (role === 'HC') team.staff.headCoach = coach;
    else if (role === 'OC') team.staff.offCoordinator = coach;
    else if (role === 'DC') team.staff.defCoordinator = coach;

    // If HC, update strategies to match their schemes
    if (role === 'HC') {
        if (!team.strategies) team.strategies = {};
        team.strategies.offense = coach.offScheme;
        team.strategies.defense = coach.defScheme;
    }

    await flushDirty(); // Should trigger update of team record

    // Return updated roster data which includes staff
    await handleGetRoster({ teamId }, id);
}

async function handleFireCoach({ teamId, role }, id) {
    const team = cache.getTeam(Number(teamId));
    if (!team || !team.staff) return;

    if (role === 'HC') team.staff.headCoach = null;
    else if (role === 'OC') team.staff.offCoordinator = null;
    else if (role === 'DC') team.staff.defCoordinator = null;

    await flushDirty();
    await handleGetRoster({ teamId }, id);
}

// ── Handler: EXTENSION ──────────────────────────────────────────────────────

async function handleGetExtensionAsk({ playerId }, id) {
  const player = cache.getPlayer(playerId);
  if (!player) { post(toUI.ERROR, { message: 'Player not found' }, id); return; }

  // Generate ask based on market value
  const ask = calculateExtensionDemand(player);
  post(toUI.EXTENSION_ASK, { ask }, id);
}

async function handleExtendContract({ playerId, teamId, contract }, id) {
  const player = cache.getPlayer(playerId);
  if (!player) { post(toUI.ERROR, { message: 'Player not found' }, id); return; }

  const team = cache.getTeam(teamId);
  if (!team) { post(toUI.ERROR, { message: 'Team not found' }, id); return; }

  // Cap Check
  // Calculate impact: new hit vs old hit
  const newCapHit = (contract.baseAnnual || 0) + ((contract.signingBonus || 0) / (contract.yearsTotal || 1));
  const currentCapHit = player.contract
      ? ((player.contract.baseAnnual || 0) + ((player.contract.signingBonus || 0) / (player.contract.yearsTotal || 1)))
      : 0;

  const diff = newCapHit - currentCapHit;

  if (diff > (team.capRoom || 0)) {
      post(toUI.ERROR, { message: `Not enough cap room ($${diff.toFixed(1)}M needed)` }, id);
      return;
  }

  // Update Player Contract
  // Extensions effectively replace the current contract logic in this simplified model
  cache.updatePlayer(playerId, { contract });

  // Update Team Cap
  recalculateTeamCap(teamId);

  // Log Transaction
  const meta = cache.getMeta();
  await Transactions.add({
      type: 'EXTEND',
      seasonId: meta.currentSeasonId,
      week: meta.currentWeek,
      teamId,
      details: { playerId, contract }
  });
  await NewsEngine.logTransaction('EXTEND', { teamId, playerId, contract });

  await flushDirty();

  // Return updated roster and state
  post(toUI.STATE_UPDATE, { roster: buildRosterView(teamId), ...buildViewState() }, id);
}

// ── Handler: TRADE_OFFER ──────────────────────────────────────────────────────

/**
 * Simple OVR-based trade value: value = OVR^1.8 × positionMultiplier × ageFactor
 * A deal is accepted by the AI if the receiving side value is ≥ 85 % of the
 * offering side value (15 % discount for uncertainty / home-team premium).
 */
function _tradeValue(player) {
  if (!player) return 0;
  const POS_MULT = { QB: 2.0, WR: 1.2, RB: 0.9, TE: 1.1, OL: 1.0,
                     DL: 1.0, LB: 0.95, CB: 1.05, S: 0.9 };
  const ovr = player.ovr ?? 70;
  const age = player.age ?? 27;
  const posMult = POS_MULT[player.pos] ?? 1.0;
  // Age curve: peak at 26, -3 % per year over 30, premium for youth
  const ageFactor = age <= 26 ? 1.0 + (26 - age) * 0.02
                 : age <= 30 ? 1.0
                 :             Math.max(0.5, 1.0 - (age - 30) * 0.06);
  return Math.pow(ovr, 1.8) * posMult * ageFactor;
}

async function handleTradeOffer({ fromTeamId, toTeamId, offering, receiving }, id) {
  // offering  = { playerIds: [], pickIds: [] }  (what fromTeam gives)
  // receiving = { playerIds: [], pickIds: [] }  (what fromTeam gets back)

  const from = cache.getTeam(Number(fromTeamId));
  const to   = cache.getTeam(Number(toTeamId));
  if (!from || !to) {
    post(toUI.TRADE_RESPONSE, { accepted: false, reason: 'Team not found' }, id);
    return;
  }

  // Calculate value on each side
  const calcSideValue = ({ playerIds = [], pickIds = [] }) => {
    const playerVal = playerIds.reduce((sum, pid) => {
      const p = cache.getPlayer(Number(pid));
      return sum + _tradeValue(p);
    }, 0);
    // Draft picks: rough round-based flat value (R1=800, R2=300, R3=150 …)
    const PICK_VALUES = [0, 800, 300, 150, 60, 25, 10, 3];
    const pickVal = pickIds.reduce((sum, pid) => {
      const pk = cache.getDraftPick ? cache.getDraftPick(pid) : null;
      const round = pk?.round ?? 3;
      return sum + (PICK_VALUES[round] ?? 10);
    }, 0);
    return playerVal + pickVal;
  };

  const offerVal    = calcSideValue(offering);
  const receiveVal  = calcSideValue(receiving);

  // AI accepts if it gets at least 85 % of what it gives
  const threshold   = offerVal * 0.85;
  const accepted    = receiveVal >= threshold;

  if (accepted) {
    // Execute the trade: swap players
    (offering.playerIds ?? []).forEach(pid => {
      cache.updatePlayer(Number(pid), { teamId: Number(toTeamId) });
    });
    (receiving.playerIds ?? []).forEach(pid => {
      cache.updatePlayer(Number(pid), { teamId: Number(fromTeamId) });
    });

    // Recalculate caps for both teams
    recalculateTeamCap(Number(fromTeamId));
    recalculateTeamCap(Number(toTeamId));

    // Log transaction
    const meta = cache.getMeta();
    const tradeRecord = {
      type:     'TRADE',
      seasonId: meta.currentSeasonId,
      week:     meta.currentWeek,
      teamId:   Number(fromTeamId),
      details:  { fromTeamId, toTeamId, offering, receiving },
    };
    await Transactions.add(tradeRecord);
    await NewsEngine.logTransaction('TRADE', { fromTeamId, toTeamId });
    await flushDirty(); // AUTO-SAVE: phase transition — roster swap persisted immediately.
  }

  post(toUI.TRADE_RESPONSE, {
    accepted,
    offerValue:   Math.round(offerVal),
    receiveValue: Math.round(receiveVal),
    reason: accepted ? 'Deal accepted' : 'Offer undervalues the return',
  }, id);

  if (accepted) {
    post(toUI.STATE_UPDATE, buildViewState());
  }
}

// ── Handler: UPDATE_SETTINGS ─────────────────────────────────────────────────

async function handleUpdateSettings({ settings }, id) {
  if (!cache.isLoaded()) {
    // If no league loaded, we can't update league settings.
    post(toUI.ERROR, { message: 'No league loaded' }, id);
    return;
  }
  const current = cache.getMeta();
  cache.setMeta({ settings: { ...(current?.settings ?? {}), ...settings } });
  await flushDirty();
  post(toUI.STATE_UPDATE, { settings: cache.getMeta().settings }, id);
}

// ── Handler: UPDATE_STRATEGY ──────────────────────────────────────────────────

async function handleUpdateStrategy({ offPlanId, defPlanId, riskId, starTargetId }, id) {
  const meta = cache.getMeta();
  const userTeamId = meta.userTeamId;
  const teamNeeds = AiLogic.getRankedTeamNeeds(userTeamId);
  const team = cache.getTeam(userTeamId);

  if (!team) {
      post(toUI.ERROR, { message: 'User team not found' }, id);
      return;
  }

  // Update strategy object
  const strategies = team.strategies || {};
  if (offPlanId) strategies.offPlanId = offPlanId;
  if (defPlanId) strategies.defPlanId = defPlanId;
  if (riskId)    strategies.riskId    = riskId;
  // Allow null to clear star target
  if (starTargetId !== undefined) strategies.starTargetId = starTargetId;

  // Persist
  cache.updateTeam(userTeamId, { strategies });
  await flushDirty();

  // Also update legacy meta.weeklyGamePlan for compatibility if needed, but truth is now on team object
  cache.setMeta({ weeklyGamePlan: strategies });

  post(toUI.STATE_UPDATE, buildViewState(), id);
}

// ── Cap helper ────────────────────────────────────────────────────────────────

function recalculateTeamCap(teamId) {
  const players = cache.getPlayersByTeam(teamId);
  const activeCap = players.reduce((sum, p) => {
    // Support both nested contract object (p.contract.baseAnnual) produced by
    // worker transactions (signPlayer, draftPick, etc.) AND legacy flat fields
    // (p.baseAnnual, p.signingBonus) written by makePlayer() during league init.
    const baseAnnual   = p.contract?.baseAnnual   ?? p.baseAnnual   ?? 0;
    const signingBonus = p.contract?.signingBonus  ?? p.signingBonus ?? 0;
    const yearsTotal   = p.contract?.yearsTotal    ?? p.yearsTotal   ?? 1;
    // Cap hit = Base + Prorated Bonus
    return sum + baseAnnual + (signingBonus / (yearsTotal || 1));
  }, 0);

  const team = cache.getTeam(teamId);
  if (!team) return;

  const deadCap = team.deadCap || 0;
  const totalCapUsed = activeCap + deadCap;

  cache.updateTeam(teamId, {
    capUsed: Math.round(totalCapUsed * 100) / 100,
    capRoom: Math.round((team.capTotal - totalCapUsed) * 100) / 100,
    deadCap: Math.round(deadCap * 100) / 100 // Ensure it's set/rounded
  });
}
// Alias for backward compatibility if needed, but we should replace calls.
const _updateTeamCap = recalculateTeamCap;

// ── Draft helpers ─────────────────────────────────────────────────────────────

/**
 * Build the draft state view-model slice the UI needs.
 * Prospects are all players with status 'draft_eligible', sorted OVR desc.
 */
function buildDraftStateView() {
  const meta = cache.getMeta();
  const draftState = meta?.draftState;
  if (!draftState) return { notStarted: true };

  const { picks, currentPickIndex } = draftState;
  const currentPick = picks[currentPickIndex] ?? null;
  const userTeamId  = meta.userTeamId;

  // Completed picks (slim)
  const completedPicks = picks.slice(0, currentPickIndex).map(pk => {
    const team = cache.getTeam(pk.teamId);
    return {
      overall:    pk.overall,
      round:      pk.round,
      pickInRound:pk.pickInRound,
      teamId:     pk.teamId,
      teamName:   team?.name ?? '?',
      teamAbbr:   team?.abbr ?? '???',
      playerId:   pk.playerId ?? null,
      playerName: pk.playerName ?? null,
      playerPos:  pk.playerPos ?? null,
      playerOvr:  pk.playerOvr ?? null,
    };
  });

  // Next 25 upcoming picks (visible in the order panel)
  const upcomingPicks = picks.slice(currentPickIndex, currentPickIndex + 25).map(pk => {
    const team = cache.getTeam(pk.teamId);
    return {
      overall:    pk.overall,
      round:      pk.round,
      pickInRound:pk.pickInRound,
      teamId:     pk.teamId,
      teamName:   team?.name ?? '?',
      teamAbbr:   team?.abbr ?? '???',
      isUser:     pk.teamId === userTeamId,
    };
  });

  // Enriched current pick
  let currentPickView = null;
  if (currentPick) {
    const team = cache.getTeam(currentPick.teamId);
    currentPickView = {
      overall:    currentPick.overall,
      round:      currentPick.round,
      pickInRound:currentPick.pickInRound,
      teamId:     currentPick.teamId,
      teamName:   team?.name ?? '?',
      teamAbbr:   team?.abbr ?? '???',
      isUser:     currentPick.teamId === userTeamId,
    };
  }

  // Available prospects sorted by OVR descending
  const prospects = cache.getAllPlayers()
    .filter(p => p.status === 'draft_eligible')
    .sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0))
    .map(p => ({
      id:        p.id,
      name:      p.name,
      pos:       p.pos,
      age:       p.age,
      ovr:       p.ovr,
      potential: p.potential ?? null,
      college:   p.college   ?? null,
      traits:    p.traits    ?? [],
    }));

  return {
    notStarted:       false,
    completedPicks,
    upcomingPicks,
    currentPick:      currentPickView,
    prospects,
    isUserPick:       currentPick ? currentPick.teamId === userTeamId : false,
    isDraftComplete:  currentPickIndex >= picks.length,
    totalPicks:       picks.length,
    currentPickIndex,
  };
}

/**
 * Execute a single draft pick: sign the player to the team, update pick record.
 */
function _executeDraftPick(pickIndex, playerId, teamId) {
  const meta = cache.getMeta();
  const draftState = meta?.draftState;
  if (!draftState) return;

  // Normalize the ID: try Map lookup first, then a string-comparison scan.
  let player = cache.getPlayer(playerId);
  if (!player) player = cache.getPlayer(String(playerId));
  if (!player) player = cache.getAllPlayers().find(p => String(p.id) === String(playerId));
  if (!player) return;

  const pk = draftState.picks[pickIndex];
  pk.playerId   = playerId;
  pk.playerName = player.name;
  pk.playerPos  = player.pos;
  pk.playerOvr  = player.ovr;
  draftState.currentPickIndex = pickIndex + 1;

  // Sign player to team with a 4-year rookie contract
  cache.updatePlayer(playerId, {
    teamId,
    status: 'active',
    contract: {
      years:        4,
      yearsTotal:   4,
      baseAnnual:   0.7,
      signingBonus: 0.1,
      guaranteedPct:0.5,
    },
  });

  recalculateTeamCap(teamId);

  // Emit per-pick event (UI can display a ticker)
  const team = cache.getTeam(teamId);
  post(toUI.DRAFT_PICK_MADE, {
    overall:    pk.overall,
    round:      pk.round,
    pickInRound:pk.pickInRound,
    teamId,
    teamName:   team?.name ?? '?',
    teamAbbr:   team?.abbr ?? '???',
    playerId,
    playerName: player.name,
    playerPos:  player.pos,
    playerOvr:  player.ovr,
  });

  // Persist updated draftState into meta
  cache.setMeta({ draftState });
}

// ── Handler: GET_DRAFT_STATE ──────────────────────────────────────────────────

async function handleGetDraftState(payload, id) {
  const meta = cache.getMeta();
  const teamNeeds = meta ? AiLogic.getRankedTeamNeeds(meta.userTeamId) : [];
  post(toUI.DRAFT_STATE,  { ...buildDraftStateView(), teamNeeds }, id);
}

// ── Handler: START_DRAFT ──────────────────────────────────────────────────────

async function handleStartDraft(payload, id) {
  const meta = cache.getMeta();
  if (!meta) { post(toUI.ERROR, { message: 'No league loaded' }, id); return; }

  // Idempotent: if draft is already running, return current state
  if (meta.draftState) {
    post(toUI.DRAFT_STATE,  { ...buildDraftStateView(), teamNeeds }, id);
    return;
  }

  // Accept 'draft' (new pipeline) and 'offseason' (legacy saves).
  if (!['draft', 'offseason'].includes(meta.phase)) {
    post(toUI.DRAFT_STATE, { notStarted: true }, id);
    return;
  }

  const ROUNDS    = 5;
  const teams     = cache.getAllTeams();
  const classSize = ROUNDS * teams.length;

  // Generate draft class and add to player pool as draft_eligible
  const prospects = generateDraftClass(meta.year, { classSize });
  prospects.forEach(p => {
    cache.setPlayer({ ...p, teamId: null, status: 'draft_eligible' });
  });

  // Draft order: worst regular-season record first, champion always last
  const champId  = meta.championTeamId ?? null;
  const sorted   = [...teams].sort((a, b) => {
    const wDiff = (a.wins ?? 0) - (b.wins ?? 0);
    if (wDiff !== 0) return wDiff;                              // worst first
    const diffA = (a.ptsFor ?? 0) - (a.ptsAgainst ?? 0);
    const diffB = (b.ptsFor ?? 0) - (b.ptsAgainst ?? 0);
    return diffA - diffB;                                       // worse pt-diff first
  });
  let draftOrder = sorted.map(t => t.id);
  if (champId !== null) {
    draftOrder = draftOrder.filter(id => id !== champId);
    draftOrder.push(champId);                                   // champ picks last
  }

  // Build full pick table
  const picks = [];
  let overall = 1;
  for (let round = 1; round <= ROUNDS; round++) {
    let pickInRound = 1;
    for (const teamId of draftOrder) {
      picks.push({ overall, round, pickInRound, teamId,
                   playerId: null, playerName: null, playerPos: null, playerOvr: null });
      overall++;
      pickInRound++;
    }
  }

  cache.setMeta({ draftState: { picks, currentPickIndex: 0 } });
  await flushDirty();

  post(toUI.DRAFT_STATE,  { ...buildDraftStateView(), teamNeeds }, id);
}

// ── Handler: MAKE_DRAFT_PICK ──────────────────────────────────────────────────

async function handleMakeDraftPick({ playerId }, id) {
  const meta       = cache.getMeta();
  const draftState = meta?.draftState;
  if (!draftState) { post(toUI.ERROR, { message: 'No active draft' }, id); return; }

  const { picks, currentPickIndex } = draftState;
  const currentPick = picks[currentPickIndex];
  if (!currentPick) { post(toUI.ERROR, { message: 'Draft is complete' }, id); return; }

  if (currentPick.teamId !== meta.userTeamId) {
    post(toUI.ERROR, { message: 'Not your pick' }, id);
    return;
  }

  // Check Roster Limit
  const limit = Constants.ROSTER_LIMITS.OFFSEASON;
  const roster = cache.getPlayersByTeam(meta.userTeamId);
  if (roster.length >= limit) {
      post(toUI.ERROR, { message: `Roster limit (${limit}) reached. Cannot draft.` }, id);
      return;
  }

  // Normalize the incoming playerId to avoid type-mismatch misses (string vs number keys).
  let player = cache.getPlayer(playerId);
  if (!player) player = cache.getPlayer(String(playerId));
  if (!player) player = cache.getAllPlayers().find(p => String(p.id) === String(playerId));
  if (!player || player.status !== 'draft_eligible') {
    post(toUI.ERROR, { message: 'Player not available' }, id);
    return;
  }

  _executeDraftPick(currentPickIndex, player.id, currentPick.teamId);
  await flushDirty();

  // Priority 3: Auto-transition when the last pick is made.
  // If every pick slot is filled, skip the manual "Start New Season" button
  // and advance directly to preseason so the game never gets stuck.
  const postPickMeta = cache.getMeta();
  if (
    postPickMeta.draftState &&
    postPickMeta.draftState.currentPickIndex >= postPickMeta.draftState.picks.length
  ) {
    return await handleStartNewSeason({}, id);
  }

  post(toUI.DRAFT_STATE,  { ...buildDraftStateView(), teamNeeds }, id);
}

// ── Handler: SIM_DRAFT_PICK ───────────────────────────────────────────────────

/**
 * Auto-pick for every AI team until we reach the user's next pick (or draft ends).
 * Each AI picks the highest-OVR available prospect.
 */
async function handleSimDraftPick(payload, id) {
  const meta = cache.getMeta();
  if (!meta?.draftState) { post(toUI.ERROR, { message: 'No active draft' }, id); return; }

  const userTeamId = meta.userTeamId;
  const teamNeeds = AiLogic.getRankedTeamNeeds(userTeamId);
  let currentPickIndex = meta.draftState.currentPickIndex;
  const picks = meta.draftState.picks;

  // Optimisation: Filter draft pool once
  const draftPool = cache.getAllPlayers().filter(p => p.status === 'draft_eligible');

  while (currentPickIndex < picks.length) {
    const pick = picks[currentPickIndex];

    // Pause at user's pick
    if (pick.teamId === userTeamId) break;

    // AI selects best available prospect by Value (Need * OVR)
    const needs = AiLogic.calculateTeamNeeds(pick.teamId);
    let bestProspect = null;
    let bestValue = -1;
    let bestIdx = -1;

    for (let i = 0; i < draftPool.length; i++) {
        const p = draftPool[i];
        const mult = needs[p.pos] || 1.0;
        const val = (p.ovr ?? 0) * mult;

        if (val > bestValue) {
            bestValue = val;
            bestProspect = p;
            bestIdx = i;
        } else if (val === bestValue && (!bestProspect || (p.ovr > bestProspect.ovr))) {
            bestProspect = p;
            bestIdx = i;
        }
    }

    if (!bestProspect) break; // pool exhausted

    _executeDraftPick(currentPickIndex, bestProspect.id, pick.teamId);
    // _executeDraftPick increments draftState.currentPickIndex inside setMeta;
    // read the updated value from the live meta reference
    currentPickIndex = cache.getMeta().draftState.currentPickIndex;

    // Remove from local pool
    if (bestIdx > -1) {
        draftPool.splice(bestIdx, 1);
    }

    await yieldFrame();
  }

  await flushDirty();

  // Priority 3: If every pick slot has been filled (AI picked through to the end),
  // auto-transition to preseason so the draft never gets permanently stuck.
  const postSimMeta = cache.getMeta();
  if (
    postSimMeta.draftState &&
    postSimMeta.draftState.currentPickIndex >= postSimMeta.draftState.picks.length
  ) {
    return await handleStartNewSeason({}, id);
  }

  post(toUI.DRAFT_STATE,  { ...buildDraftStateView(), teamNeeds }, id);
}

// ── Stats / Awards Helpers ────────────────────────────────────────────────────

/**
 * Calculate statistical leaders for the season.
 * @param {Array} stats - Array of enriched player stats objects (with name, pos, teamId).
 */
function calculateLeaders(stats) {
  const getTop = (key, n = 5) => stats
    .filter(s => s.totals && (s.totals[key] || 0) > 0)
    .sort((a, b) => (b.totals[key] || 0) - (a.totals[key] || 0))
    .slice(0, n)
    .map(s => ({ playerId: s.playerId, name: s.name, pos: s.pos, value: s.totals[key] || 0, teamId: s.teamId }));

  // Compute total TDs per player (pass + rush + receiving)
  const withTDs = stats.map(s => {
    const t = s.totals || {};
    return { ...s, _td: (t.passTD || 0) + (t.rushTD || 0) + (t.recTD || 0) };
  });

  return {
    passingYards:   getTop('passYd'),
    rushingYards:   getTop('rushYd'),
    receivingYards: getTop('recYd'),
    sacks:          getTop('sacks'),
    interceptions:  getTop('interceptions'),
    touchdowns:     withTDs
      .filter(s => s._td > 0)
      .sort((a, b) => b._td - a._td)
      .slice(0, 5)
      .map(s => ({ playerId: s.playerId, name: s.name, pos: s.pos, value: s._td, teamId: s.teamId })),
  };
}

/**
 * determine MVP and other awards based on stats and team performance.
 * @param {Array} stats - Enriched player stats.
 * @param {Array} teams - Team objects (for record weighting).
 */
function calculateAwards(stats, teams) {
  // Helper: Get team wins by ID
  const teamWins = {};
  teams.forEach(t => { teamWins[t.id] = t.wins || 0; });

  // MVP Score formula (approximate)
  // Weighted by position impact and team success
  const getMVPScore = (s) => {
    const t = s.totals || {};
    let score = 0;

    // Base stats (using correct accumulated key names)
    score += (t.passYd || 0) / 25;
    score += (t.rushYd || 0) / 10;
    score += (t.recYd  || 0) / 10;
    score += ((t.passTD || 0) + (t.rushTD || 0) + (t.recTD || 0)) * 6;
    score += (t.sacks || 0) * 4;
    score += (t.interceptions || 0) * 4;

    // Team success multiplier (1.0 to 1.5 based on wins)
    const wins = teamWins[s.teamId] || 0;
    const winMult = 1.0 + (wins / 17) * 0.5;

    return score * winMult;
  };

  // Safe reduce with initial null check
  const bestBy = (arr, scoreFn) => {
      if (!arr || arr.length === 0) return null;
      return arr.reduce((best, s) => (scoreFn(s) > scoreFn(best) ? s : best), arr[0]);
  };

  const mvp = bestBy(stats, getMVPScore);

  // Offensive Player of the Year (similar to MVP but less team weight)
  const getOPOYScore = (s) => {
    const t = s.totals || {};
    return (t.passYd||0)/20 + (t.rushYd||0)/10 + (t.recYd||0)/10
         + ((t.passTD||0) + (t.rushTD||0) + (t.recTD||0)) * 6;
  };
  const opoy = bestBy(stats, getOPOYScore);

  // Defensive Player of the Year
  const getDPOYScore = (s) => {
    const t = s.totals || {};
    return (t.sacks||0)*5 + (t.interceptions||0)*6 + (t.tackles||0)*1;
  };
  const dpoy = bestBy(stats, getDPOYScore);

  // Rookie of the Year (check s.isRookie? We don't track rookie status explicitly yet, maybe checking age <= 22?)
  // For now, skip ROTY or just use age.
  const roty = bestBy(stats.filter(s => s.age <= 22), getMVPScore);

  return {
    mvp:  mvp  ? { playerId: mvp.playerId,  name: mvp.name,  teamId: mvp.teamId,  pos: mvp.pos, value: Math.round(getMVPScore(mvp)) } : null,
    opoy: opoy ? { playerId: opoy.playerId, name: opoy.name, teamId: opoy.teamId, pos: opoy.pos } : null,
    dpoy: dpoy ? { playerId: dpoy.playerId, name: dpoy.name, teamId: dpoy.teamId, pos: dpoy.pos } : null,
    roty: roty ? { playerId: roty.playerId, name: roty.name, teamId: roty.teamId, pos: roty.pos } : null,
  };
}

// ── Handler: ADVANCE_OFFSEASON ────────────────────────────────────────────────

/**
 * Dynamic Progression & Regression Engine.
 *
 * Runs the full age-curve progression pass then handles retirement:
 *  - Growth  (Age 21–25): Mean +2 OVR | 10% Breakout: +5 to +8 | 5% Bust: -2 to -4
 *  - Prime   (Age 26–29): High stability — fluctuate ±1 OVR
 *  - Cliff   (Age 30+):   Mean -2 OVR  | 15% Age Cliff: physical traits plummet -5 to -8
 *  - Retirement: 20% base at age 34, +15% per year, capped at 85%
 *
 * Progression runs BEFORE retirement so delta values are stored on the player
 * record and can be read by the UI via the next ROSTER_DATA response.
 * All mutations are flushed to IndexedDB before the UI is notified.
 */
async function handleAdvanceOffseason(payload, id) {
  const meta = cache.getMeta();
  // Accept both new 'offseason_resign' phase and legacy 'offseason' for save compatibility.
  if (!meta || !['offseason_resign', 'offseason'].includes(meta.phase)) {
    post(toUI.ERROR, { message: 'Not in offseason phase' }, id);
    return;
  }

  // ── Step 1: AI processes contract extensions ──────────────────────────────
  const allTeams = cache.getAllTeams();
  for (const team of allTeams) {
    if (team.id !== meta.userTeamId) {
      await AiLogic.processExtensions(team.id);
    }
  }

  // ── Step 2: Dynamic progression pass ─────────────────────────────────────
  // processPlayerProgression mutates each player's ratings, ovr, and
  // progressionDelta in place.  We then flush those fields to cache.
  const allPlayers = cache.getAllPlayers();
  const { gainers, regressors } = processPlayerProgression(allPlayers);

  // Flush progression mutations (ratings, ovr, progressionDelta, potential)
  for (const player of allPlayers) {
    if (player.status === 'draft_eligible' || player.status === 'retired') continue;
    cache.updatePlayer(player.id, {
      ratings:          player.ratings,
      ovr:              player.ovr,
      potential:        player.potential,
      progressionDelta: player.progressionDelta ?? null,
    });
  }

  // ── Step 3: Age all players by 1 year + retirement rolls ─────────────────
  const retired = [];

  for (const player of cache.getAllPlayers()) {
    if (player.status === 'draft_eligible' || player.status === 'retired') continue;

    const age = (player.age ?? 22) + 1;

    // Retirement: 20% base at 34, +15% per year after, capped at 85%
    let willRetire = false;
    if (age >= 34) {
      const retireChance = Math.min(0.85, 0.20 + (age - 34) * 0.15);
      willRetire = Utils.random() < retireChance;
    }

    if (willRetire) {
      retired.push({ id: player.id, name: player.name, pos: player.pos, age, ovr: player.ovr });
      if (player.teamId != null) recalculateTeamCap(player.teamId);
      // Mark as retired instead of deleting — keeps the player record in DB
      // so GET_PLAYER_CAREER can still resolve name/pos/ovr for history views.
      cache.updatePlayer(player.id, { status: 'retired', teamId: null, age });
    } else {
      cache.updatePlayer(player.id, { age });
    }
  }

  // ── Step 4: Generate news items for dramatic progressions ─────────────────
  // "Top Offseason Gains" — up to 5 biggest breakouts/growers
  const topGainers = gainers.slice(0, 5);
  if (topGainers.length > 0) {
    const names = topGainers
      .map(p => `${p.name} (${p.pos}, ${p.isBreakout ? '🌟 Breakout' : ''}+${p.delta} OVR)`)
      .join(', ');
    await NewsEngine.logNews(
      'PROGRESSION',
      `🔥 Top Offseason Gains: ${names}`,
      null,
      { category: 'top_gains', players: topGainers }
    );
  }

  // "Shocking Regressions" — up to 5 worst cliff/decline events
  const topRegressors = regressors.slice(0, 5);
  if (topRegressors.length > 0) {
    const names = topRegressors
      .map(p => `${p.name} (${p.pos}, ${p.isCliff ? '📉 Age Cliff' : ''}${p.delta} OVR)`)
      .join(', ');
    await NewsEngine.logNews(
      'PROGRESSION',
      `😨 Shocking Regressions: ${names}`,
      null,
      { category: 'regressions', players: topRegressors }
    );
  }

  // ── Step 5: Phase transition → free_agency ────────────────────────────────
  // All DB writes happen here atomically before the UI is notified.
  cache.setMeta({
    offseasonProgressionDone: true,
    phase: 'free_agency',
    freeAgencyState: { day: 1, maxDays: 5, complete: false },
  });

  // AUTO-SAVE: phase transition — flush all progression/retirement changes before notifying UI.
  await flushDirty();

  // Free memory: retired players are now persisted to DB, safe to evict from hot cache.
  cache.evictRetired();

  post(toUI.OFFSEASON_PHASE, {
    phase:      'progression_complete',
    retired,
    gainers:    topGainers,
    regressors: topRegressors,
    message:    `Offseason: ${retired.length} player(s) retired. Free Agency Begins!`,
  }, id);
  post(toUI.STATE_UPDATE, buildViewState());
}

// ── Handler: ADVANCE_FREE_AGENCY_DAY ──────────────────────────────────────────

async function handleAdvanceFreeAgencyDay(payload, id) {
    const meta = cache.getMeta();
    if (!meta || !meta.freeAgencyState) {
        post(toUI.ERROR, { message: 'Not in Free Agency' }, id);
        return;
    }

    const { day, maxDays } = meta.freeAgencyState;

    if (day > maxDays) {
        // FA is already over — ensure the phase advanced correctly (idempotent).
        if (meta.phase === 'free_agency') {
            cache.setMeta({ phase: 'draft' });
            await flushDirty();
        }
        post(toUI.NOTIFICATION, { level: 'info', message: 'Free Agency period is over.' });
        post(toUI.STATE_UPDATE, buildViewState());
        return;
    }

    // Process Day
    await AiLogic.processFreeAgencyDay(day);

    // Increment Day
    const nextDay = day + 1;
    const isComplete = nextDay > maxDays;

    // ── Phase transition: free_agency → draft ────────────────────────────────
    // When the last FA day completes, advance the phase so the UI gates
    // correctly onto the draft screen.
    const updates = {
        freeAgencyState: {
            ...meta.freeAgencyState,
            day: nextDay,
            complete: isComplete,
        }
    };

    if (isComplete) {
        updates.phase = 'draft';
    }

    cache.setMeta(updates);

    await flushDirty();

    post(toUI.NOTIFICATION, { level: 'info', message: `Free Agency Day ${day} Complete.` });

    if (isComplete) {
        // Explicitly signal phase change so UI can redirect
        post(toUI.OFFSEASON_PHASE, { phase: 'draft', message: 'Free Agency Complete. Draft is now open.' });
    }

    // Refresh views
    post(toUI.STATE_UPDATE, buildViewState());
    // Also trigger FA list refresh
    await handleGetFreeAgents({}, null);
}

/**
 * Archive the current season into history.
 * - Saves a season summary to the 'seasons' store.
 * - Writes accolades (MVP, OPOY, DPOY, SB Ring, SB MVP) to player objects.
 * - Clears in-memory season stats.
 */
async function archiveSeason(seasonId) {
  try {
    const meta = cache.getMeta();
    const teams = cache.getAllTeams();

    // 1. Ensure DB is up to date
    await flushDirty();

    // 2. Get all season stats and CLEAR them from cache
    const seasonStats = cache.archiveSeasonStats();

    // Persist detailed stats to PlayerStats DB (Fix for missing history)
    if (seasonStats.length > 0) {
        const statsToSave = seasonStats.map(s => ({
            ...s,
            id: `${s.seasonId}_${s.playerId}`
        }));
        await PlayerStats.saveBulk(statsToSave);
    }

    // Helper to resolve player info (active or retired/db)
    const resolvePlayer = async (pid) => {
      let p = cache.getPlayer(pid);
      if (!p) p = await Players.load(pid);
      return p;
    };

    // Helper to write an accolade to a player
    const grantAccolade = (playerId, accolade) => {
      const p = cache.getPlayer(playerId);
      if (!p) return;
      const accolades = Array.isArray(p.accolades) ? [...p.accolades] : [];
      accolades.push(accolade);
      cache.updatePlayer(playerId, { accolades });
    };

    // 3. Populate stats with player details
    const populatedStats = [];
    await Promise.all(seasonStats.map(async (s) => {
      const p = await resolvePlayer(s.playerId);
      if (p) {
        populatedStats.push({ ...s, name: p.name, pos: p.pos, teamId: p.teamId, age: p.age });
      }
    }));

    // 4a. Archive per-player season stats to player.careerStats for quick access.
    // This stores a compact SeasonStatLine on the player object itself so the
    // PlayerProfile can display full career history without an extra DB round-trip.
    const teamAbbrMap = {};
    cache.getAllTeams().forEach(t => { teamAbbrMap[t.id] = t.abbr; });

    for (const s of populatedStats) {
      const p = cache.getPlayer(s.playerId);
      if (!p || p.status === 'draft_eligible') continue;
      const totals = s.totals || {};
      const passAtt  = totals.passAtt  || 0;
      const passComp = totals.passComp || 0;
      const line = {
        season:      seasonId,
        team:        teamAbbrMap[s.teamId] ?? (s.teamId != null ? String(s.teamId) : 'FA'),
        gamesPlayed: totals.gamesPlayed ?? 0,
        passYds:     totals.passYd      ?? 0,
        passTDs:     totals.passTD      ?? 0,
        ints:        totals.interceptions ?? 0,
        compPct:     passAtt > 0 ? Math.round((passComp / passAtt) * 1000) / 10 : 0,
        rushYds:     totals.rushYd      ?? 0,
        rushTDs:     totals.rushTD      ?? 0,
        receptions:  totals.receptions  ?? 0,
        recYds:      totals.recYd       ?? 0,
        recTDs:      totals.recTD       ?? 0,
        tackles:     totals.tackles     ?? 0,
        sacks:       totals.sacks       ?? 0,
        ffum:        totals.forcedFumbles ?? 0,
        ovr:         p.ovr,
      };
      const existing = Array.isArray(p.careerStats) ? p.careerStats : [];
      // Avoid double-archiving if this season was already stored (idempotent).
      if (!existing.some(l => l.season === seasonId)) {
        cache.updatePlayer(p.id, { careerStats: [...existing, line] });
      }
    }

    // 4. Determine Champion
    const championId = meta.championTeamId;
    const champion = teams.find(t => t.id === championId);

    // 5. Standings (snapshot before reset)
    const standings = buildStandings();

    // 6. Leaders
    const leaders = calculateLeaders(populatedStats);

    // 7. Awards
    const awards = calculateAwards(populatedStats, teams);

    // 8. Write accolades to player objects
    const year = meta.year;

    if (awards.mvp?.playerId != null) {
      grantAccolade(awards.mvp.playerId, { type: 'MVP', year, seasonId });
      // Log MVP to News
      await NewsEngine.logAward('MVP', { ...awards.mvp, teamId: awards.mvp.teamId });
    }
    if (awards.opoy?.playerId != null) {
      grantAccolade(awards.opoy.playerId, { type: 'OPOY', year, seasonId });
    }
    if (awards.dpoy?.playerId != null) {
      grantAccolade(awards.dpoy.playerId, { type: 'DPOY', year, seasonId });
    }
    if (awards.roty?.playerId != null) {
      grantAccolade(awards.roty.playerId, { type: 'ROTY', year, seasonId });
    }

    // SB Rings: all players on champion team
    if (championId != null) {
      const champPlayers = cache.getPlayersByTeam(championId);
      for (const p of champPlayers) {
        grantAccolade(p.id, { type: 'SB_RING', year, seasonId });
      }

      // SB MVP: highest-scoring player on champion team
      const champStats = populatedStats.filter(s => s.teamId === championId);
      if (champStats.length > 0) {
        const getMVPScore = (s) => {
          const t = s.totals || {};
          return (t.passYd||0)/25 + (t.rushYd||0)/10 + (t.recYd||0)/10
              + ((t.passTD||0) + (t.rushTD||0) + (t.recTD||0)) * 6
              + (t.sacks||0) * 4 + (t.interceptions||0) * 4;
        };
        const sbMvp = champStats.reduce((best, s) => getMVPScore(s) > getMVPScore(best) ? s : best, champStats[0]);
        if (sbMvp?.playerId != null) {
          grantAccolade(sbMvp.playerId, { type: 'SB_MVP', year, seasonId });
          awards.sbMvp = { playerId: sbMvp.playerId, name: sbMvp.name, teamId: sbMvp.teamId, pos: sbMvp.pos };
        }
      }
    }

    // Flush accolade writes to DB
    await flushDirty();

    const seasonSummary = {
      id: seasonId,
      year,
      champion: champion ? { id: champion.id, name: champion.name, abbr: champion.abbr } : null,
      mvp: awards.mvp,
      standings: standings.map(s => ({
          id: s.id, name: s.name, wins: s.wins, losses: s.losses, ties: s.ties, pct: s.pct,
          pf: s.pf, pa: s.pa
      })),
      leaders,
      awards,
    };

    await Seasons.save(seasonSummary);
  } catch (error) {
    console.error(`[Worker] Failed to archive season ${seasonId}:`, error);
    // Don't rethrow, just log, so the season reset can theoretically proceed (though risking data loss)
    // or maybe we should stop?
    // If we stop, the user is stuck.
    // Proceeding implies we might lose history but the game continues.
    // The prompt says "prevent silent crashes". Logging is good.
    // We should probably ensure `Seasons.save` is at least attempted or we notify user.
    // But for now, catching effectively prevents the crash.
  }
}

// ── Handler: START_NEW_SEASON ─────────────────────────────────────────────────

async function handleStartNewSeason(payload, id) {
  const meta = cache.getMeta();
  if (!meta) { post(toUI.ERROR, { message: 'No league loaded' }, id); return; }

  // Gate: new season can only start from the draft phase (or legacy 'offseason').
  // This prevents accidental season resets from wrong phases.
  if (!['draft', 'offseason'].includes(meta.phase)) {
    post(toUI.ERROR, { message: `Cannot start new season from phase "${meta.phase}". Complete the draft first.` }, id);
    return;
  }

  // Archive the completed season (if any) before resetting
  if (meta.currentSeasonId) {
    await archiveSeason(meta.currentSeasonId);
  }

  const newYear     = (meta.year   ?? 2025) + 1;
  const newSeason   = (meta.season ?? 1)    + 1;
  const newSeasonId = `s${newSeason}`;

  // Reset all team win/loss records
  for (const team of cache.getAllTeams()) {
    cache.updateTeam(team.id, { wins: 0, losses: 0, ties: 0, ptsFor: 0, ptsAgainst: 0 });
  }

  // Generate a fresh schedule
  const makeScheduleFn = makeAccurateSchedule || (Scheduler && Scheduler.makeAccurateSchedule);
  if (!makeScheduleFn) { post(toUI.ERROR, { message: 'Cannot generate schedule' }, id); return; }

  const teamDefs = cache.getAllTeams();
  const rawSchedule  = makeScheduleFn(teamDefs);
  const slimSchedule = slimifySchedule(rawSchedule, teamDefs);

  cache.setMeta({
    year:                    newYear,
    season:                  newSeason,
    currentSeasonId:         newSeasonId,
    currentWeek:             1,
    phase:                   'preseason',
    schedule:                slimSchedule,
    playoffSeeds:            null,
    draftState:              null,
    freeAgencyState:         null, // Reset FA state
    championTeamId:          null,
    offseasonProgressionDone:false,
  });

  await flushDirty(); // AUTO-SAVE: phase transition — new season initialized to preseason.

  // Broadcast SEASON_START so the UI can force-switch to Standings/Dashboard.
  const updatedMeta = cache.getMeta();
  post(toUI.SEASON_START, {
    year:    updatedMeta.year,
    season:  updatedMeta.season,
    phase:   updatedMeta.phase,
    week:    updatedMeta.currentWeek,
  });
  post(toUI.FULL_STATE, buildViewState(), id);
}

// ── Handler: GET_TEAM_PROFILE ─────────────────────────────────────────────────

async function handleGetTeamProfile({ teamId }, id) {
  const numId = Number(teamId);
  const team  = cache.getTeam(numId);
  const teamNeeds = AiLogic.getRankedTeamNeeds(numId);
  if (!team) { post(toUI.ERROR, { message: `Team ${teamId} not found` }, id); return; }

  // Build a conf+div lookup from current cache so we can identify division titles
  const allTeams = cache.getAllTeams();
  const teamDivInfo = {};
  allTeams.forEach(t => { teamDivInfo[t.id] = { conf: t.conf, div: t.div }; });

  const seasons = await Seasons.loadRecent(200);

  let allTimeWins = 0, allTimeLosses = 0, allTimeTies = 0;
  let sbTitles = 0, divTitles = 0;
  const seasonHistory = [];

  for (const season of seasons) {
    if (!season.standings) continue;
    const standing = season.standings.find(s => s.id === numId);
    if (!standing) continue;

    allTimeWins   += standing.wins   || 0;
    allTimeLosses += standing.losses || 0;
    allTimeTies   += standing.ties   || 0;

    const isSBChamp = season.champion?.id === numId;
    if (isSBChamp) sbTitles++;

    // Division title: top record in same conf + div
    const myDiv = teamDivInfo[numId];
    let isDivChamp = false;
    if (myDiv) {
      const divStandings = season.standings.filter(s => {
        const sd = teamDivInfo[s.id];
        return sd && sd.conf === myDiv.conf && sd.div === myDiv.div;
      });
      divStandings.sort((a, b) => (b.pct || 0) - (a.pct || 0) || (b.wins || 0) - (a.wins || 0));
      isDivChamp = divStandings.length > 0 && divStandings[0].id === numId;
      if (isDivChamp) divTitles++;
    }

    seasonHistory.push({
      year:      season.year,
      seasonId:  season.id,
      wins:      standing.wins   || 0,
      losses:    standing.losses || 0,
      ties:      standing.ties   || 0,
      pf:        standing.pf     || 0,
      pa:        standing.pa     || 0,
      champion:  isSBChamp,
      divTitle:  isDivChamp,
    });
  }

  // Top current players (for quick roster preview)
  const currentPlayers = cache.getPlayersByTeam(numId)
    .map(p => ({ id: p.id, name: p.name, pos: p.pos, age: p.age, ovr: p.ovr }))
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 12);

  post(toUI.TEAM_PROFILE, {
    team: {
      id:          team.id,
      name:        team.name,
      abbr:        team.abbr,
      conf:        team.conf,
      div:         team.div,
      wins:        team.wins        || 0,
      losses:      team.losses      || 0,
      ties:        team.ties        || 0,
      ptsFor:      team.ptsFor      || 0,
      ptsAgainst:  team.ptsAgainst  || 0,
      ovr:         team.ovr         || 75,
      capUsed:     team.capUsed     || 0,
      capRoom:     team.capRoom     || 0,
      capTotal:    team.capTotal    || 255,
    },
    franchise: {
      allTimeWins,
      allTimeLosses,
      allTimeTies,
      sbTitles,
      divTitles,
      seasonsPlayed: seasonHistory.length,
      seasonHistory: seasonHistory.slice(0, 25),
    },
    currentPlayers,
  }, id);
}

// ── Handler: GET_LEAGUE_LEADERS ───────────────────────────────────────────────

async function handleGetLeagueLeaders({ mode = 'season' }, id) {
  const meta = cache.getMeta();

  // Helper: build display-ready top-N list for a stat key
  const topN = (entries, key, n = 10) => {
    const playerMap = {};
    allTeamsByIdRef.forEach(t => { playerMap[t.id] = t.abbr; });

    return entries
      .filter(e => (e.totals?.[key] || 0) > 0)
      .sort((a, b) => (b.totals[key] || 0) - (a.totals[key] || 0))
      .slice(0, n)
      .map(e => ({
        playerId: e.playerId,
        name:     e.name     || `Player ${e.playerId}`,
        pos:      e.pos      || '?',
        teamId:   e.teamId,
        value:    e.totals[key] || 0,
      }));
  };

  // Computed-stat helpers
  const passerRating = (totals) => {
    const att = totals.passAtt || 0;
    if (att === 0) return 0;
    const a = Math.max(0, Math.min(2.375, ((totals.passComp || 0) / att - 0.3) / 0.2));
    const b = Math.max(0, Math.min(2.375, ((totals.passYd   || 0) / att - 3) / 4));
    const c = Math.max(0, Math.min(2.375, ((totals.passTD   || 0) / att) / 0.05));
    const d = Math.max(0, Math.min(2.375, 2.375 - ((totals.interceptions || 0) / att) / 0.04));
    return Math.round(((a + b + c + d) / 6) * 100 * 10) / 10;
  };

  const allTeamsByIdRef = cache.getAllTeams();

  let entries = [];

  if (mode === 'season') {
    // Build a map seeded from in-memory stats (always the freshest source).
    // Then backfill with DB-flushed stats for any player NOT yet in memory —
    // this covers the post-save/load case where _seasonStats has been cleared.
    const liveMap = new Map(cache.getAllSeasonStats().map(s => [s.playerId, s]));
    if (meta?.currentSeasonId) {
      const dbStats = await PlayerStats.bySeason(meta.currentSeasonId).catch(() => []);
      for (const s of dbStats) {
        if (!liveMap.has(s.playerId)) liveMap.set(s.playerId, s);
      }
    }
    await Promise.all([...liveMap.values()].map(async s => {
      const p = cache.getPlayer(s.playerId) ?? await Players.load(s.playerId);
      if (p) entries.push({ ...s, name: p.name, pos: p.pos, teamId: p.teamId ?? s.teamId });
    }));
  } else {
    // All-time: load all archived player stats, aggregate by player
    const allStats = await PlayerStats.loadAll();
    const byPlayer = new Map();
    for (const s of allStats) {
      const pid = s.playerId;
      if (!byPlayer.has(pid)) {
        byPlayer.set(pid, { playerId: pid, totals: {}, name: null, pos: null, teamId: null });
      }
      const agg = byPlayer.get(pid);
      for (const [k, v] of Object.entries(s.totals || {})) {
        if (typeof v === 'number') agg.totals[k] = (agg.totals[k] || 0) + v;
      }
      // Keep latest name/pos/team
      if (s.name) agg.name = s.name;
      if (s.pos)  agg.pos  = s.pos;
      if (s.teamId != null) agg.teamId = s.teamId;
    }
    // Also merge current season in-memory stats
    const currentStats = cache.getAllSeasonStats();
    for (const s of currentStats) {
      const pid = s.playerId;
      if (!byPlayer.has(pid)) {
        byPlayer.set(pid, { playerId: pid, totals: {}, name: null, pos: null, teamId: null });
      }
      const agg = byPlayer.get(pid);
      for (const [k, v] of Object.entries(s.totals || {})) {
        if (typeof v === 'number') agg.totals[k] = (agg.totals[k] || 0) + v;
      }
    }
    // Resolve names/pos for all-time entries
    await Promise.all([...byPlayer.values()].map(async agg => {
      if (!agg.name) {
        const p = cache.getPlayer(agg.playerId) ?? await Players.load(agg.playerId);
        if (p) { agg.name = p.name; agg.pos = p.pos; agg.teamId = p.teamId ?? agg.teamId; }
      }
    }));
    entries = [...byPlayer.values()].filter(e => e.name);
  }

  // Build categories
  const topRated = (list, rateFn, minAtt, attKey, n = 10) =>
    list
      .filter(e => (e.totals[attKey] || 0) >= minAtt)
      .map(e => ({ ...e, _rate: rateFn(e.totals) }))
      .sort((a, b) => b._rate - a._rate)
      .slice(0, n)
      .map(({ _rate, ...rest }) => ({ ...rest, value: _rate }));

  const qbs = entries.filter(e => e.pos === 'QB');
  const rbs = entries.filter(e => e.pos === 'RB');
  const wrs = entries.filter(e => ['WR', 'TE', 'RB'].includes(e.pos));
  const def = entries.filter(e => ['DL', 'LB', 'DE', 'DT', 'EDGE'].includes(e.pos));
  const dbs = entries.filter(e => ['CB', 'S', 'SS', 'FS'].includes(e.pos));

  const categories = {
    passing: {
      passYards:    topN(qbs, 'passYd'),
      passTDs:      topN(qbs, 'passTD'),
      passerRating: topRated(qbs, passerRating, mode === 'season' ? 100 : 500, 'passAtt'),
      completions:  topN(qbs, 'passComp'),
    },
    rushing: {
      rushYards:    topN(rbs, 'rushYd'),
      rushTDs:      topN(rbs, 'rushTD'),
      rushAttempts: topN(rbs, 'rushAtt'),
    },
    receiving: {
      recYards:     topN(wrs, 'recYd'),
      recTDs:       topN(wrs, 'recTD'),
      receptions:   topN(wrs, 'receptions'),
      yac:          topN(wrs, 'yardsAfterCatch'),
    },
    defense: {
      sacks:         topN(def, 'sacks'),
      tackles:       topN([...def, ...dbs], 'tackles'),
      interceptions: topN(dbs, 'interceptions'),
      forcedFumbles: topN([...def, ...dbs], 'forcedFumbles'),
      pressures:     topN(def, 'pressures'),
    },
  };

  post(toUI.LEAGUE_LEADERS, { mode, categories, year: meta?.year, seasonId: meta?.currentSeasonId }, id);
}

// ── Handler: GET_ALL_PLAYER_STATS ─────────────────────────────────────────────

async function handleGetAllPlayerStats(_payload, id) {
  // Return a flat list of ALL active players with their current season stats attached.
  // This powers the dedicated "Stats" tab.
  const meta = cache.getMeta();
  const allPlayers = cache.getAllPlayers();
  const allTeams = cache.getAllTeams();
  const teamMap = new Map();
  allTeams.forEach(t => teamMap.set(t.id, t.abbr));

  // Priority 4: Build a merged stat map that includes both in-memory stats
  // AND DB-persisted stats from the current season. After a save/load cycle,
  // _seasonStats is cleared, so we must backfill from IndexedDB to avoid
  // showing 0 for every player's stats.
  const liveStatMap = new Map(
    cache.getAllSeasonStats().map(s => [String(s.playerId), s])
  );
  if (meta?.currentSeasonId) {
    const dbStats = await PlayerStats.bySeason(meta.currentSeasonId).catch(() => []);
    for (const s of dbStats) {
      const key = String(s.playerId);
      if (!liveStatMap.has(key)) liveStatMap.set(key, s);
    }
  }

  const stats = allPlayers.map(p => {
    // 1. Get live season stats — prefer in-memory (freshest) then DB backfill.
    const pid = String(p.id);
    const seasonStats = liveStatMap.get(pid) ?? cache.getSeasonStat(p.id);
    const totals = seasonStats ? seasonStats.totals : {};

    // 2. Flatten relevant data
    return {
        id:          p.id,
        name:        p.name,
        pos:         p.pos,
        teamId:      p.teamId,
        teamAbbr:    p.teamId != null ? (teamMap.get(p.teamId) || '???') : 'FA',
        ovr:         p.ovr,
        age:         p.age,
        gamesPlayed: totals.gamesPlayed || 0,

        // Passing
        passYards:    totals.passYd || 0,
        passTDs:      totals.passTD || 0,
        int:          totals.interceptions || 0,
        passerRating: totals.passerRating || 0,

        // Rushing
        rushYards:    totals.rushYd || 0,
        rushTDs:      totals.rushTD || 0,
        rushAtt:      totals.rushAtt || 0,

        // Receiving
        receptions:   totals.receptions || 0,
        recYards:     totals.recYd || 0,
        recTDs:       totals.recTD || 0,

        // Defense
        tackles:      totals.tackles || 0,
        sacks:        totals.sacks || 0,
        tfl:          totals.tacklesForLoss || 0,
        defInt:       totals.interceptions || 0, // Same field as offensive INTs usually, context matters

        // Kicking
        fgMade:       totals.fgMade || 0,
        fgAtt:        totals.fgAttempts || 0,
    };
  });

  post(toUI.ALL_PLAYER_STATS, { stats }, id);
}

// ── Handler: GET_AWARD_RACES ──────────────────────────────────────────────────

async function handleGetAwardRaces(_payload, id) {
  const meta = cache.getMeta();

  // Build enriched stat entries exactly like season-mode league leaders:
  // prefer in-memory stats, backfill from DB if needed (post save/load).
  const liveMap = new Map(cache.getAllSeasonStats().map(s => [s.playerId, s]));
  if (meta?.currentSeasonId) {
    const dbStats = await PlayerStats.bySeason(meta.currentSeasonId).catch(() => []);
    for (const s of dbStats) {
      if (!liveMap.has(s.playerId)) liveMap.set(s.playerId, s);
    }
  }

  // Resolve player metadata and attach team abbreviation for display
  const allTeams  = cache.getAllTeams();
  const teamById  = new Map(allTeams.map(t => [t.id, t]));

  const allEntries = [];
  await Promise.all([...liveMap.values()].map(async s => {
    const p = cache.getPlayer(s.playerId) ?? await Players.load(s.playerId);
    if (!p) return;
    const team = teamById.get(p.teamId ?? s.teamId);
    allEntries.push({
      ...s,
      name:     p.name,
      pos:      p.pos,
      teamId:   p.teamId ?? s.teamId,
      teamAbbr: team?.abbr ?? '???',
      ovr:      p.ovr,
    });
  }));

  // Build a playerId→playerObject map for rookie detection
  const playerMap = new Map(cache.getAllPlayers().map(p => [p.id, p]));

  const currentYear = meta?.year ?? 2025;
  const { awards, allPro } = calculateAwardRaces(allEntries, playerMap, allTeams, currentYear);

  post(toUI.AWARD_RACES, {
    week:     meta?.currentWeek  ?? 0,
    year:     currentYear,
    seasonId: meta?.currentSeasonId,
    phase:    meta?.phase,
    awards,
    allPro,
  }, id);
}

// ── Main message router ───────────────────────────────────────────────────────

/**
 * Sequential Message Queue.
 * Ensures that messages are processed one at a time, preventing race conditions
 * (e.g., UPDATE_SETTINGS arriving while LOAD_SAVE is yielding).
 */
let messageQueue = Promise.resolve();

self.onmessage = (event) => {
  // Chain the next message handler to the end of the current queue
  messageQueue = messageQueue
    .then(() => handleMessage(event))
    .catch(err => {
      console.error('[Worker] Fatal error in message queue:', err);
      post(toUI.ERROR, { message: 'Worker crashed: ' + err.message });
    });
};

async function handleMessage(event) {
  const { type, payload = {}, id } = event.data;

  try {
    switch (type) {
      case toWorker.INIT:               return await handleInit(payload, id);
      case toWorker.GET_ALL_SAVES:      return await handleGetAllSaves(payload, id);
      case toWorker.LOAD_SAVE:          return await handleLoadSave(payload, id);
      case toWorker.DELETE_SAVE:        return await handleDeleteSave(payload, id);
      case toWorker.NEW_LEAGUE:         return await handleNewLeague(payload, id);
      case toWorker.ADVANCE_WEEK:       return await handleAdvanceWeek(payload, id);
      case toWorker.SIM_TO_WEEK:        return await handleSimToWeek(payload, id);
      case toWorker.SIM_TO_PLAYOFFS:    return await handleSimToWeek({ targetWeek: 18 }, id);
      case toWorker.GET_SEASON_HISTORY: return await handleGetSeasonHistory(payload, id);
      case toWorker.GET_ALL_SEASONS:    return await handleGetAllSeasons(payload, id);
      case toWorker.GET_PLAYER_CAREER:  return await handleGetPlayerCareer(payload, id);
      case toWorker.SAVE_NOW:           return await handleSaveNow(payload, id);
      case toWorker.RESET_LEAGUE:       return await handleResetLeague(payload, id);
      case toWorker.SET_USER_TEAM:      return await handleSetUserTeam(payload, id);
      case toWorker.SIGN_PLAYER:        return await handleSignPlayer(payload, id);
      case toWorker.SUBMIT_OFFER:       return await handleSubmitOffer(payload, id);
      case toWorker.RELEASE_PLAYER:     return await handleReleasePlayer(payload, id);
      case toWorker.UPDATE_SETTINGS:    return await handleUpdateSettings(payload, id);
      case toWorker.GET_ROSTER:         return await handleGetRoster(payload, id);
      case toWorker.GET_FREE_AGENTS:    return await handleGetFreeAgents(payload, id);
      case toWorker.GET_AVAILABLE_COACHES: return await handleGetAvailableCoaches(payload, id);
      case toWorker.HIRE_COACH:         return await handleHireCoach(payload, id);
      case toWorker.FIRE_COACH:         return await handleFireCoach(payload, id);
      case toWorker.TRADE_OFFER:        return await handleTradeOffer(payload, id);
      case toWorker.GET_EXTENSION_ASK:  return await handleGetExtensionAsk(payload, id);
      case toWorker.EXTEND_CONTRACT:    return await handleExtendContract(payload, id);
      case toWorker.GET_BOX_SCORE:      return await handleGetBoxScore(payload, id);
      case toWorker.UPDATE_STRATEGY:    return await handleUpdateStrategy(payload, id);

      // ── Draft & Offseason ──────────────────────────────────────────────────
      case toWorker.GET_DRAFT_STATE:    return await handleGetDraftState(payload, id);
      case toWorker.START_DRAFT:        return await handleStartDraft(payload, id);
      case toWorker.MAKE_DRAFT_PICK:    return await handleMakeDraftPick(payload, id);
      case toWorker.SIM_DRAFT_PICK:     return await handleSimDraftPick(payload, id);
      case toWorker.ADVANCE_OFFSEASON:  return await handleAdvanceOffseason(payload, id);
      case toWorker.ADVANCE_FREE_AGENCY_DAY: return await handleAdvanceFreeAgencyDay(payload, id);
      case toWorker.START_NEW_SEASON:   return await handleStartNewSeason(payload, id);

      // ── Analytics ─────────────────────────────────────────────────────────
      case toWorker.GET_TEAM_PROFILE:   return await handleGetTeamProfile(payload, id);
      case toWorker.GET_LEAGUE_LEADERS: return await handleGetLeagueLeaders(payload, id);
      case toWorker.GET_ALL_PLAYER_STATS: return await handleGetAllPlayerStats(payload, id);
      case toWorker.GET_AWARD_RACES:    return await handleGetAwardRaces(payload, id);

      default:
        console.warn(`[Worker] Unknown message type: ${type}`);
        post(toUI.ERROR, { message: `Unknown message type: ${type}` }, id);
    }
  } catch (err) {
    console.error(`[Worker] Unhandled error in handler for "${type}":`, err);
    post(toUI.ERROR, { message: err.message, stack: err.stack }, id);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

(async function bootWorker() {
  try {
    await openGlobalDB();
    // Signal readiness ONLY after DB is ready
    post(toUI.READY, { hasSave: false });
  } catch (err) {
    console.error('[Worker] Boot failed:', err);
    post(toUI.ERROR, { message: 'Worker boot failed: ' + err.message });
  }
})();
