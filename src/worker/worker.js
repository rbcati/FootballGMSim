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
} from '../db/index.js';
import { makeLeague }     from '../core/league.js';
import GameRunner         from '../core/game-runner.js';
import { simulateBatch }  from '../core/game-simulator.js';
import { Utils }          from '../core/utils.js';
import { makeAccurateSchedule, Scheduler } from '../core/schedule.js';
import { makePlayer, generateDraftClass, calculateMorale }  from '../core/player.js';
import { makeCoach, generateInitialStaff } from '../core/coach-system.js';
import { calculateOffensiveSchemeFit, calculateDefensiveSchemeFit } from '../core/scheme-core.js';
import AiLogic from '../core/ai-logic.js';

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

    return {
        id:       p.id,
        name:     p.name,
        pos:      p.pos,
        age:      p.age,
        ovr:      p.ovr,
        contract: p.contract ?? null,
        traits:   p.traits ?? [],
        schemeFit: fit,
        morale:    morale
    };
  });
}

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
  if (!cache.isDirty()) return;
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

      post(toUI.FULL_STATE, buildViewState(), id);
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

    // Create Save Entry
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

    // Apply each game result to cache and emit GAME_EVENT per game
    for (const res of batchResults) {
      applyGameResultToCache(res, week, seasonId);

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
      if (champ) {
        sbChampId = wId;
        post(toUI.NOTIFICATION, { level: 'info', message: `🏆 ${champ.name} win the Super Bowl! Season complete.` });
      }
    }
    cache.setMeta({ phase: 'offseason', championTeamId: sbChampId, offseasonProgressionDone: false, draftState: null });

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

  // --- Flush to DB (non-blocking) ---
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
  const aggregateSide = (teamId, boxSide) => {
    if (!boxSide) return;
    for (const [pid, entry] of Object.entries(boxSide)) {
      if (entry?.stats) {
        cache.updateSeasonStat(Number(pid), teamId, entry.stats);
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
  const stats = await PlayerStats.byPlayer(playerId);
  const player = cache.getPlayer(playerId) ?? await Players.load(playerId);
  post(toUI.PLAYER_CAREER, {
    playerId,
    player: player ?? null,
    stats:  stats  ?? [],
  }, id);
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
  cache.updatePlayer(playerId, { teamId, contract, status: 'active', offers: [] });

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

// ── Handler: GET_ROSTER ───────────────────────────────────────────────────────

async function handleGetRoster({ teamId }, id) {
  const numId = Number(teamId);
  const team  = cache.getTeam(numId);
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

      return {
        id:        p.id,
        name:      p.name,
        pos:       p.pos,
        age:       p.age,
        ovr:       p.ovr,
        potential: p.potential ?? null,
        status:    p.status ?? 'active',
        contract:  p.contract ?? null,
        traits:    p.traits ?? [],
        schemeFit: fit,
        morale:    calculateMorale(p, team, true)
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
      staff:   team.staff // Send staff data
    },
    players,
  }, id);
}

// ── Handler: GET_FREE_AGENTS ──────────────────────────────────────────────────

async function handleGetFreeAgents(payload, id) {
  const meta = cache.getMeta();
  const userTeamId = meta.userTeamId;

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

  post(toUI.FREE_AGENT_DATA, { freeAgents }, id);
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
    _updateTeamCap(Number(fromTeamId));
    _updateTeamCap(Number(toTeamId));

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
    await flushDirty();
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

  const player = cache.getPlayer(playerId);
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

  _updateTeamCap(teamId);

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
  post(toUI.DRAFT_STATE, buildDraftStateView(), id);
}

// ── Handler: START_DRAFT ──────────────────────────────────────────────────────

async function handleStartDraft(payload, id) {
  const meta = cache.getMeta();
  if (!meta) { post(toUI.ERROR, { message: 'No league loaded' }, id); return; }

  // Idempotent: if draft is already running, return current state
  if (meta.draftState) {
    post(toUI.DRAFT_STATE, buildDraftStateView(), id);
    return;
  }

  if (meta.phase !== 'offseason') {
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

  post(toUI.DRAFT_STATE, buildDraftStateView(), id);
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

  const player = cache.getPlayer(playerId);
  if (!player || player.status !== 'draft_eligible') {
    post(toUI.ERROR, { message: 'Player not available' }, id);
    return;
  }

  _executeDraftPick(currentPickIndex, playerId, currentPick.teamId);
  await flushDirty();
  post(toUI.DRAFT_STATE, buildDraftStateView(), id);
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
  post(toUI.DRAFT_STATE, buildDraftStateView(), id);
}

// ── Stats / Awards Helpers ────────────────────────────────────────────────────

/**
 * Calculate statistical leaders for the season.
 * @param {Array} stats - Array of enriched player stats objects (with name, pos, teamId).
 */
function calculateLeaders(stats) {
  const getTop = (key, n = 5) => stats
    .filter(s => s.totals && s.totals[key] > 0)
    .sort((a, b) => (b.totals[key] || 0) - (a.totals[key] || 0))
    .slice(0, n)
    .map(s => ({ playerId: s.playerId, name: s.name, value: s.totals[key] || 0, teamId: s.teamId }));

  return {
    passingYards:   getTop('passingYards'),
    rushingYards:   getTop('rushingYards'),
    receivingYards: getTop('receivingYards'),
    sacks:          getTop('sacks'),
    interceptions:  getTop('interceptions'),
    touchdowns:     getTop('touchdowns'),
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

    // Base stats
    score += (t.passingYards || 0) / 25;
    score += (t.rushingYards || 0) / 10;
    score += (t.receivingYards || 0) / 10;
    score += (t.touchdowns || 0) * 6;
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
    return (t.passingYards||0)/20 + (t.rushingYards||0)/10 + (t.receivingYards||0)/10 + (t.touchdowns||0)*6;
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
 * Run yearly player progression and retirement loop:
 *  - Age < 26  → improve OVR by 0–3
 *  - Age 30–32 → decline OVR by 0–2
 *  - Age 33+   → decline OVR by 1–3
 *  - Age 34+   → increasing retirement chance
 */
async function handleAdvanceOffseason(payload, id) {
  const meta = cache.getMeta();
  if (!meta || meta.phase !== 'offseason') {
    post(toUI.ERROR, { message: 'Not in offseason phase' }, id);
    return;
  }

  // AI: Process Extensions
  const allTeams = cache.getAllTeams();
  for (const team of allTeams) {
      if (team.id !== meta.userTeamId) {
          await AiLogic.processExtensions(team.id);
      }
  }

  const retired = [];

  for (const player of cache.getAllPlayers()) {
    if (player.status === 'draft_eligible') continue; // skip draft prospects

    const age = player.age ?? 22;
    let ovrDelta = 0;

    if (age < 26) {
      ovrDelta = Utils.rand(0, 3);
    } else if (age >= 30 && age < 33) {
      ovrDelta = -Utils.rand(0, 2);
    } else if (age >= 33) {
      ovrDelta = -Utils.rand(1, 3);
    }
    // Ages 26–29: prime — no change

    const newOvr = Utils.clamp((player.ovr ?? 70) + ovrDelta, 40, 99);

    // Retirement: 20 % base at 34, +15 % per year after, capped at 85 %
    let willRetire = false;
    if (age >= 34) {
      const retireChance = Math.min(0.85, 0.20 + (age - 34) * 0.15);
      willRetire = Utils.random() < retireChance;
    }

    if (willRetire) {
      retired.push({ id: player.id, name: player.name, pos: player.pos, age, ovr: player.ovr });
      if (player.teamId != null) _updateTeamCap(player.teamId);
      cache.removePlayer(player.id);
    } else {
      cache.updatePlayer(player.id, { age: age + 1, ovr: newOvr });
    }
  }

  // Initialize Free Agency Phase
  // DO NOT RUN executeAIFreeAgency instantly anymore.
  cache.setMeta({
      offseasonProgressionDone: true,
      freeAgencyState: { day: 1, maxDays: 5, complete: false }
  });

  await flushDirty();

  post(toUI.OFFSEASON_PHASE, {
    phase:   'progression_complete',
    retired,
    message: `Offseason: ${retired.length} player(s) retired. Free Agency Begins!`,
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
        post(toUI.NOTIFICATION, { level: 'info', message: 'Free Agency period is over.' });
        return;
    }

    // Process Day
    await AiLogic.processFreeAgencyDay(day);

    // Increment Day
    const nextDay = day + 1;
    const isComplete = nextDay > maxDays;

    cache.setMeta({
        freeAgencyState: {
            ...meta.freeAgencyState,
            day: nextDay,
            complete: isComplete
        }
    });

    await flushDirty();

    post(toUI.NOTIFICATION, { level: 'info', message: `Free Agency Day ${day} Complete.` });

    // Refresh views
    post(toUI.STATE_UPDATE, buildViewState());
    // Also trigger FA list refresh
    await handleGetFreeAgents({}, null);
}

/**
 * Archive the current season into history.
 * - Saves a season summary to the 'seasons' store.
 * - Clears in-memory season stats.
 */
async function archiveSeason(seasonId) {
  const meta = cache.getMeta();
  const teams = cache.getAllTeams();

  // 1. Ensure DB is up to date
  await flushDirty();

  // 2. Get all season stats and CLEAR them from cache
  const seasonStats = cache.archiveSeasonStats();

  // Helper to resolve player info (active or retired/db)
  const resolvePlayer = async (pid) => {
    let p = cache.getPlayer(pid);
    if (!p) {
        // Player might have retired in the offseason phase
        p = await Players.load(pid);
    }
    return p;
  };

  // 3. Populate stats with player details
  const populatedStats = [];
  // Use Promise.all to fetch potentially retired players in parallel
  await Promise.all(seasonStats.map(async (s) => {
    const p = await resolvePlayer(s.playerId);
    if (p) {
      populatedStats.push({ ...s, name: p.name, pos: p.pos, teamId: p.teamId, age: p.age });
    }
  }));

  // 4. Determine Champion
  const championId = meta.championTeamId;
  const champion = teams.find(t => t.id === championId);

  // 5. Standings (snapshot before reset)
  const standings = buildStandings();

  // 6. Leaders
  const leaders = calculateLeaders(populatedStats);

  // 7. Awards
  const awards = calculateAwards(populatedStats, teams);

  const seasonSummary = {
    id: seasonId,
    year: meta.year,
    champion: champion ? { id: champion.id, name: champion.name, abbr: champion.abbr } : null,
    mvp: awards.mvp,
    standings: standings.map(s => ({
        id: s.id, name: s.name, wins: s.wins, losses: s.losses, ties: s.ties, pct: s.pct,
        pf: s.pf, pa: s.pa
    })),
    leaders,
    awards
  };

  await Seasons.save(seasonSummary);
}

// ── Handler: START_NEW_SEASON ─────────────────────────────────────────────────

async function handleStartNewSeason(payload, id) {
  const meta = cache.getMeta();
  if (!meta) { post(toUI.ERROR, { message: 'No league loaded' }, id); return; }

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
    phase:                   'regular',
    schedule:                slimSchedule,
    playoffSeeds:            null,
    draftState:              null,
    freeAgencyState:         null, // Reset FA state
    championTeamId:          null,
    offseasonProgressionDone:false,
  });

  await flushDirty();
  post(toUI.FULL_STATE, buildViewState(), id);
}

// ── Main message router ───────────────────────────────────────────────────────

self.onmessage = async (event) => {
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
      case toWorker.GET_BOX_SCORE:      return await handleGetBoxScore(payload, id);

      // ── Draft & Offseason ──────────────────────────────────────────────────
      case toWorker.GET_DRAFT_STATE:    return await handleGetDraftState(payload, id);
      case toWorker.START_DRAFT:        return await handleStartDraft(payload, id);
      case toWorker.MAKE_DRAFT_PICK:    return await handleMakeDraftPick(payload, id);
      case toWorker.SIM_DRAFT_PICK:     return await handleSimDraftPick(payload, id);
      case toWorker.ADVANCE_OFFSEASON:  return await handleAdvanceOffseason(payload, id);
      case toWorker.ADVANCE_FREE_AGENCY_DAY: return await handleAdvanceFreeAgencyDay(payload, id);
      case toWorker.START_NEW_SEASON:   return await handleStartNewSeason(payload, id);

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
