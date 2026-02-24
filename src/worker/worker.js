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
    nextGameStakes,
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
    if (results.length > 0) {
      const sbR = results[0];
      const hScore = sbR.scoreHome ?? sbR.homeScore ?? 0;
      const aScore = sbR.scoreAway ?? sbR.awayScore ?? 0;
      const rawW   = hScore >= aScore ? (sbR.home ?? sbR.homeTeamId) : (sbR.away ?? sbR.awayTeamId);
      const wId    = Number(typeof rawW === 'object' ? rawW?.id : rawW);
      const champ  = cache.getTeam(wId);
      if (champ) {
        post(toUI.NOTIFICATION, { level: 'info', message: `🏆 ${champ.name} win the Super Bowl! Season complete.` });
      }
    }
    cache.setMeta({ phase: 'offseason' });

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

// ── Handler: GET_ROSTER ───────────────────────────────────────────────────────

async function handleGetRoster({ teamId }, id) {
  const numId = Number(teamId);
  const team  = cache.getTeam(numId);
  if (!team) { post(toUI.ERROR, { message: `Team ${teamId} not found` }, id); return; }

  const players = cache.getPlayersByTeam(numId).map(p => ({
    id:        p.id,
    name:      p.name,
    pos:       p.pos,
    age:       p.age,
    ovr:       p.ovr,
    potential: p.potential ?? null,
    status:    p.status ?? 'active',
    contract:  p.contract ?? null,
  }));

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
    players,
  }, id);
}

// ── Handler: GET_FREE_AGENTS ──────────────────────────────────────────────────

async function handleGetFreeAgents(payload, id) {
  const freeAgents = cache.getAllPlayers()
    .filter(p => !p.teamId || p.status === 'free_agent')
    .map(p => ({
      id:        p.id,
      name:      p.name,
      pos:       p.pos,
      age:       p.age,
      ovr:       p.ovr,
      potential: p.potential ?? null,
      contract:  p.contract ?? null,   // last known contract (asking price reference)
    }));

  post(toUI.FREE_AGENT_DATA, { freeAgents }, id);
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

// ── Main message router ───────────────────────────────────────────────────────

self.onmessage = async (event) => {
  const { type, payload = {}, id } = event.data;

  try {
    switch (type) {
      case toWorker.INIT:               return await handleInit(payload, id);
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
      case toWorker.RELEASE_PLAYER:     return await handleReleasePlayer(payload, id);
      case toWorker.UPDATE_SETTINGS:    return await handleUpdateSettings(payload, id);
      case toWorker.GET_ROSTER:         return await handleGetRoster(payload, id);
      case toWorker.GET_FREE_AGENTS:    return await handleGetFreeAgents(payload, id);
      case toWorker.TRADE_OFFER:        return await handleTradeOffer(payload, id);
      case toWorker.GET_BOX_SCORE:      return await handleGetBoxScore(payload, id);

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
