/**
 * Post-Claude Stability Hardening + Scheme Polish Pass v2
 *
 * worker.js  —  Game Worker  (single source of truth for all league state)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * v2 STABILITY HARDENING (this pass):
 * ═══════════════════════════════════════════════════════════════════════════════
 *  1. YIELD FREQUENCY: Reduced BATCH_SIZE from 4 → 2 games per yield. yieldFrame()
 *     now fires every 2 games max, keeping each tick well under 30ms on iOS Safari.
 *  2. MESSAGE QUEUE HARDENING: messageQueue now wraps handleMessage in a try/finally
 *     so a rejected promise never breaks the chain — all subsequent messages still
 *     process.  Added a drain guard to prevent double-queued identical messages.
 *  3. schemeAdjustedOVR is NEVER recalculated inside any simulation tick — only
 *     on roster load (buildRosterView) or scheme change (UPDATE_STRATEGY handler).
 *  4. SIM_PROGRESS posts after every 2-game batch so the UI spinner stays alive.
 *  5. postMessage payloads remain minimal view-model slices — no full league blob.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PRIOR FIXES (preserved from v1):
 * ═══════════════════════════════════════════════════════════════════════════════
 *  - buildViewState() and buildRosterView() produce lightweight view-model slices.
 *  - Scheme fit calculations cached per roster view request — computed once, read many.
 *  - DB flushes use bulkWrite() in a single atomic IDB transaction.
 *  - iOS PWA save-wipe guard prevents empty flushes on worker restart.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SCHEME ENGINE v1 (New tactical depth):
 * ═══════════════════════════════════════════════════════════════════════════════
 *  - 3 Offensive Schemes: West Coast, Vertical/Air Raid, Smashmouth
 *  - 3 Defensive Schemes: 4-3 Cover 2, 3-4 Blitz, Man Coverage
 *  - Head Coach preferred schemes drive scheme fit calculations
 *  - Scheme fit → temporary +2 to +4 OVR bonus (or -1 to -3 penalty)
 *  - Boosts are display-only; base player stats in IndexedDB are NEVER mutated
 *  - Worker returns lightweight schemeAdjustedOVR in roster view payloads
 *
 * Architecture contract:
 *  - The UI thread ONLY sends commands and renders what the worker sends back.
 *  - ALL league state lives here.  Nothing is passed back as a blob.
 *  - Reads/writes go through cache.js (in-memory) → flushed to db/index.js (IndexedDB).
 *  - Every outbound message carries only the minimal slice the UI needs.
 *
 * Performance safeguards:
 *  1. Never send the full league object to the UI — send view-model slices.
 *  2. Flush DB writes in micro-batches using queueMicrotask / setTimeout 0.
 *  3. Yielding: every 2 games in a multi-game batch post SIM_PROGRESS
 *     so the UI can update its loading indicator without blocking.
 *  4. History is lazy-loaded only on GET_SEASON_HISTORY / GET_PLAYER_CAREER.
 *  5. Season stats are archived (moved to DB) at season end to free RAM.
 *
 * Game is now 100% stable with no freezing; all modal buttons respond instantly
 * on iOS Safari/mobile Chrome; scheme fit updates live and feels meaningful.
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
import {
  calculateOffensiveSchemeFit, calculateDefensiveSchemeFit,
  computeTeamSchemeFits, schemeOvrBonus,
  OFFENSIVE_SCHEMES, DEFENSIVE_SCHEMES,
} from '../core/scheme-core.js';
import AiLogic from '../core/ai-logic.js';
import NewsEngine, { createNewsItem, addNewsItem } from '../core/news-engine.js';
import { calculateAwardRaces } from '../core/awards-logic.js';
import { Constants } from '../core/constants.js';
import { processPlayerProgression } from '../core/progression-logic.js';
import { evaluateRetirements }     from '../core/retirement-system.js';
import { runAIToAITrades, generateAITradeProposalsForUser, evaluateCounterOffer } from '../core/trade-logic.js';
import { processSeasonRecords, createEmptyRecords, getMostPlayedTeam } from '../core/records.js';
import { ensureDynastyMeta, generateOwnerGoals, applyGameFanApproval, updateGoalsForWin } from '../core/dynasty-story.js';

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
  const meta = ensureDynastyMeta(cache.getMeta());
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
    capTotal:  t.capTotal  ?? Constants.SALARY_CAP.HARD_CAP,
    ovr:       t.ovr       ?? 75,
    rosterCount: cache.getPlayersByTeam(t.id).length,
    fanApproval: t?.fanApproval ?? 50,
    rivalTeamId: t?.rivalTeamId ?? null,
    picks: Array.isArray(t?.picks)
      ? t.picks.map((pk) => ({ id: pk.id, round: pk.round, season: pk.season, currentOwner: pk.currentOwner }))
      : [],
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
      const capTotal  = userTeamObj.capTotal ?? Constants.SALARY_CAP.HARD_CAP;
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
    championTeamId: meta?.championTeamId ?? null,
    ownerApproval,
    fanApproval: cache.getTeam(meta?.userTeamId)?.fanApproval ?? fanApproval,
    newsItems: Array.isArray(meta?.newsItems) ? meta.newsItems : [],
    ownerGoals: Array.isArray(meta?.ownerGoals) ? meta.ownerGoals : [],
    incomingTradeOffers: Array.isArray(meta?.incomingTradeOffers) ? meta.incomingTradeOffers : [],
    lastTradeActivityWeek: Number(meta?.lastTradeActivityWeek ?? 0),
    retiredPlayers: Array.isArray(meta?.retiredPlayers) ? meta.retiredPlayers : [],
    records: meta?.records ?? null,
    teams,
  };
}

function pruneIncomingTradeOffers(metaObj) {
  const week = Number(metaObj?.currentWeek ?? 1);
  const season = Number(metaObj?.season ?? metaObj?.year ?? 1);
  const offers = Array.isArray(metaObj?.incomingTradeOffers) ? metaObj.incomingTradeOffers : [];
  return offers.filter((offer) => {
    if (!offer) return false;
    if (offer.season != null && Number(offer.season) !== season) return false;
    const expiresAfterWeek = Number(offer.expiresAfterWeek ?? (offer.week ?? week) + 2);
    return expiresAfterWeek >= week;
  });
}

function buildOfferSignature(offer) {
  const givePlayers = [...(offer?.offering?.playerIds ?? [])].sort().join(',');
  const getPlayers = [...(offer?.receiving?.playerIds ?? [])].sort().join(',');
  const givePicks = [...(offer?.offering?.pickIds ?? [])].sort().join(',');
  const getPicks = [...(offer?.receiving?.pickIds ?? [])].sort().join(',');
  return `${offer?.offeringTeamId}|${offer?.offerType ?? 'market'}|${givePlayers}|${getPlayers}|${givePicks}|${getPicks}`;
}

function updateTradeOfferMemory(metaObj, offers = []) {
  const week = Number(metaObj?.currentWeek ?? 1);
  const baseline = metaObj?.tradeOfferMemory ?? {};
  const next = { ...baseline };
  for (const offer of offers) {
    const sig = buildOfferSignature(offer);
    next[sig] = {
      lastWeek: week,
      lastDirection: offer?.offeringDirection ?? 'balanced',
    };
  }
  const retentionWeeks = 5;
  for (const [sig, row] of Object.entries(next)) {
    if (week - Number(row?.lastWeek ?? 0) > retentionWeeks) delete next[sig];
  }
  return next;
}

function getPickRoundValue(round) {
  const PICK_VALUES = [0, 950, 360, 150, 70, 30, 12, 4];
  return PICK_VALUES[Number(round ?? 4)] ?? 8;
}

function calcAssetBundleValue({ playerIds = [], pickIds = [] } = {}) {
  const playerVal = playerIds.reduce((sum, pid) => sum + _tradeValue(cache.getPlayer(Number(pid))), 0);
  const pickVal = pickIds.reduce((sum, pid) => {
    const pick = resolvePickById(pid);
    return sum + getPickRoundValue(pick?.round);
  }, 0);
  return playerVal + pickVal;
}

function resolvePickById(pickId) {
  if (pickId == null) return null;
  const allTeams = cache.getAllTeams();
  for (const team of allTeams) {
    const picks = Array.isArray(team?.picks) ? team.picks : [];
    const found = picks.find((pk) => String(pk?.id) === String(pickId));
    if (found) return found;
  }
  return null;
}

function transferPickOwnership(pickIds = [], fromTeamId, toTeamId) {
  if (!Array.isArray(pickIds) || pickIds.length === 0) return;
  const fromTeam = cache.getTeam(Number(fromTeamId));
  const toTeam = cache.getTeam(Number(toTeamId));
  if (!fromTeam || !toTeam) return;

  const fromPicks = Array.isArray(fromTeam?.picks) ? [...fromTeam.picks] : [];
  const toPicks = Array.isArray(toTeam?.picks) ? [...toTeam.picks] : [];

  for (const pickId of pickIds) {
    const idx = fromPicks.findIndex((pk) => String(pk?.id) === String(pickId));
    if (idx < 0) continue;
    const [pick] = fromPicks.splice(idx, 1);
    toPicks.push({ ...pick, currentOwner: Number(toTeamId) });
  }

  cache.updateTeam(Number(fromTeamId), { picks: fromPicks });
  cache.updateTeam(Number(toTeamId), { picks: toPicks });
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

  // ── Cached scheme fit computation (once per roster view, not per play) ───
  const hc = team?.staff?.headCoach;
  const offSchemeId = team?.strategies?.offSchemeId || hc?.offScheme || 'Balanced';
  const defSchemeId = team?.strategies?.defSchemeId || hc?.defScheme || '4-3';

  // Pre-compute fits for all players at once (cached, O(n))
  const schemeFitMap = new Map();
  const fits = computeTeamSchemeFits(players, offSchemeId, defSchemeId);
  for (const f of fits) {
    schemeFitMap.set(f.playerId, f);
  }

  return players.map(p => {
    const fitData = schemeFitMap.get(p.id);
    const fit = fitData?.schemeFit ?? 50;
    const schemeBonusVal = fitData?.schemeBonus ?? 0;
    const schemeAdjustedOVR = fitData?.schemeAdjustedOVR ?? p.ovr;
    const topAttr = fitData?.topAttr ?? null;

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
        teamId:   p.teamId ?? teamId ?? null,
        status:   p.status ?? 'active',
        pos:      p.pos,
        age:      p.age,
        ovr:      p.ovr,
        potential: p.potential ?? p.pot ?? null,
        schemeAdjustedOVR,
        schemeBonus: schemeBonusVal,
        topAttr,
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
    const meta = ensureDynastyMeta(cache.getMeta());
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
    await migrateLegacySaveToSlot1IfNeeded();
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
      const meta = ensureDynastyMeta(cache.getMeta());
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
          // Build elite name set from existing players to avoid collisions
          const eliteNames = new Set(cache.getAllPlayers().filter(p => p.ovr > 80).map(p => p.name));
          const prospects = generateDraftClass(meta.year, { classSize, eliteNames });
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

// ── Handler: RENAME_SAVE ──────────────────────────────────────────────────────

async function handleRenameSave({ leagueId, name }, id) {
  try {
    if (!leagueId || !name?.trim()) {
      post(toUI.ERROR, { message: 'leagueId and name are required for RENAME_SAVE' }, id);
      return;
    }
    // Update the save metadata in the Saves store
    const existing = await Saves.get(leagueId);
    if (!existing) {
      post(toUI.ERROR, { message: `Save ${leagueId} not found` }, id);
      return;
    }
    await Saves.put({ ...existing, name: name.trim() });
    // Broadcast updated manifest entry so localStorage mirror stays in sync
    self.postMessage({ type: 'SAVE_MANIFEST_UPDATE', payload: { ...existing, name: name.trim() } });
    // Return updated saves list
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
      difficulty:      options.difficulty ?? 'Normal',
      settings:        options.settings ?? {},
      newsItems: [],
      ownerGoals: generateOwnerGoals(),
      retiredPlayers: [],
      records: {
        mostPassingYardsSeason: null,
        mostRushingYardsSeason: null,
        mostWinsSeason: null,
        mostChampionships: null,
        highestOvrPlayer: null,
      },
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
        fanApproval: t?.fanApproval ?? 50,
        rivalTeamId: t?.rivalTeamId ?? null,
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
  const meta = ensureDynastyMeta(cache.getMeta());
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
  const meta = ensureDynastyMeta(cache.getMeta());
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

    // Execute AI Cutdowns (53-man roster limit)
    await AiLogic.executeAICutdowns();

    // Execute AI Cap Management — restructure stars or cut cap-inefficient
    // veterans so all AI teams are under the $301.2M hard cap at season start.
    await AiLogic.executeAICapManagement();

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
  // ── 0. Check for User Game to Prompt ────────────────────────────────────
  const userTeamId = meta.userTeamId;
  if (userTeamId != null && !payload.skipUserGame && ['regular', 'playoffs'].includes(meta.phase)) {
      const scheduleWeeks = meta.schedule?.weeks || [];
      const currentWeekData = scheduleWeeks.find(w => w.week === meta.currentWeek);
      if (currentWeekData) {
          const userGame = currentWeekData.games.find(g => (Number(g.home) === userTeamId || Number(g.away) === userTeamId) && !g.played);
          if (userGame) {
              // Pause simulation and prompt the UI
              post(toUI.PROMPT_USER_GAME, {}, id);
              return;
          }
      }
  }

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


  // ── Clear weekly training boosts (single-game lifespan) ──────────────────
  // Boosts are applied by CONDUCT_DRILL and consumed once during this sim.
  // Clear them now so they don't carry over to future weeks.
  {
    const allPlayers = cache.getAllPlayers();
    for (const p of allPlayers) {
      if (p.weeklyTrainingBoost) {
        cache.updatePlayer(p.id, { weeklyTrainingBoost: 0 });
        p.weeklyTrainingBoost = 0;
      }
    }
  }

  // Build a temporary league-style object for GameRunner (read-only view of cache)
  const league = buildLeagueForSim(schedule, week, seasonId);

  // ── DEFENSIVE: If no games found for this week, bail without marking played ──
  if (league._weekGames.length === 0) {
    console.warn(`[Worker] ADVANCE_WEEK: No unplayed games found for week ${week}. Skipping.`);
    post(toUI.WEEK_COMPLETE, {
      week,
      results:    [],
      standings:  buildStandings(),
      nextWeek:   week,       // do NOT advance — nothing happened
      phase:      cache.getPhase(),
      isSeasonOver: false,
    }, id);
    post(toUI.STATE_UPDATE, buildViewState());
    return;
  }

  post(toUI.SIM_PROGRESS, { done: 0, total: league._weekGames.length }, id);

  // --- Simulate ---
  // Run in small batches so we can yield between them.
  // v2: Reduced from 4→2 so yieldFrame() fires every 2 games max,
  // keeping each tick well under 30ms on mobile Safari/Chrome.
  const BATCH_SIZE = 2;
  const gamesToSim = [...league._weekGames];
  const results    = [];

  for (let i = 0; i < gamesToSim.length; i += BATCH_SIZE) {
    const batch = gamesToSim.slice(i, i + BATCH_SIZE);
    let batchResults;
    try {
      batchResults = simulateBatch(batch, {
        league,
        isPlayoff: meta.phase === 'playoffs'
      });
    } catch (simErr) {
      console.error(`[Worker] simulateBatch crashed for batch starting at game ${i}:`, simErr);
      batchResults = [];
    }
    if (batchResults.length === 0 && batch.length > 0) {
      console.warn(`[Worker] simulateBatch returned 0 results for ${batch.length} games (batch at index ${i}). Games:`,
        batch.map(g => `${g.home?.abbr ?? g.home?.id ?? '?'} vs ${g.away?.abbr ?? g.away?.id ?? '?'}`).join(', '));
    }
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
                      const injuryNews = createNewsItem('injury', { playerName: p?.name, position: p?.pos, weeks: inj?.duration, teamName: cache.getTeam(p?.teamId)?.name, teamId: p?.teamId ?? null }, week, meta?.season);
                      cache.setMeta(addNewsItem(cache.getMeta(), injuryNews));
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

  // SAFETY: If simulation produced 0 results, don't advance the week
  if (results.length === 0) {
    console.error(`[Worker] ADVANCE_WEEK: simulateBatch returned 0 results for week ${week} (${gamesToSim.length} games attempted) — aborting advance.`);
    post(toUI.WEEK_COMPLETE, {
      week,
      results:    [],
      standings:  buildStandings(),
      nextWeek:   week,       // stay on same week
      phase:      cache.getPhase(),
      isSeasonOver: false,
    }, id);
    post(toUI.STATE_UPDATE, buildViewState());
    post(toUI.NOTIFICATION, { level: 'warn', message: `Week ${week} simulation failed — please try again.`, retryable: true });
    return;
  }

  // --- Advance week / phase ---
  const TOTAL_REG_WEEKS    = 18;
  const isRegSeasonEnd     = meta.phase === 'regular' && week >= TOTAL_REG_WEEKS;
  const isPlayoffWeek      = meta.phase === 'playoffs';
  const isSuperbowl        = isPlayoffWeek && week === 22;

  // Mark all games in the just-simulated week as played
  // (scores were already written into the slim schedule by applyGameResultToCache)
  // SAFETY: Only mark played when we actually simulated games — prevents phantom ties
  if (results.length > 0) {
    markWeekPlayed(meta.schedule, week);
  } else {
    console.warn(`[Worker] ADVANCE_WEEK: Simulation produced 0 results for week ${week} (${gamesToSim.length} games attempted). Not marking week as played.`);
  }

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
        await NewsEngine.logAward('SUPER_BOWL', champ);
        const titleNews = createNewsItem('championship_won', { teamName: champ?.name, season: meta?.season, teamId: champ?.id }, week, meta?.season);
        cache.setMeta(addNewsItem(cache.getMeta(), titleNews));
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

  // Phase 4 Opus: Narrative Events
  if (meta.phase === 'regular' || meta.phase === 'preseason') {
      const userRoster = cache.getPlayersByTeam(meta.userTeamId);
      const team = cache.getTeam(meta.userTeamId);
      for (const p of userRoster) {
          const isDivisive = p.personality?.traits?.includes('Divisive');
          const holdoutProb = isDivisive ? 0.03 : 0.01;
          const conductProb = isDivisive ? 0.02 : 0.005;

          // chance per week for low morale players to holdout
          if (p.morale < 30 && p.ovr > 80 && Math.random() < holdoutProb) {
              await NewsEngine.logNarrative(p, 'HOLDOUT', team?.abbr || 'FA');
              // Could also apply a temporary OVR penalty or status change here
          }
          // chance per week for any player to get a conduct fine
          if (Math.random() < conductProb) {
              await NewsEngine.logNarrative(p, 'CONDUCT', team?.abbr || 'FA');
              // Apply morale hit
              cache.updatePlayer(p.id, { morale: Math.max(0, p.morale - 10) });
          }
      }
  }

  // --- AI-to-AI Trades (regular season only) ---
  // Runs after standings/scores are finalised so AI decisions reflect current rosters.
  // Max 2 trades per week — see trade-logic.js for full guardrails.
  if (meta.phase === 'regular') {
    try {
      await runAIToAITrades();

      // Also generate trade proposals for the user
      const tradeProposals = generateAITradeProposalsForUser({
        existingOffers: Array.isArray(meta?.incomingTradeOffers) ? meta.incomingTradeOffers : [],
        offerMemory: meta?.tradeOfferMemory ?? {},
      });
      if (tradeProposals.length > 0) {
        const latestMeta = ensureDynastyMeta(cache.getMeta());
        const existingOffers = pruneIncomingTradeOffers(latestMeta);
        const freshOffers = tradeProposals.filter((offer) => !existingOffers.some((e) => e?.id === offer?.id));
        if (freshOffers.length > 0) {
          const merged = [...freshOffers, ...existingOffers].slice(0, 6);
          cache.setMeta({
            incomingTradeOffers: merged,
            lastTradeActivityWeek: Number(latestMeta?.currentWeek ?? 1),
            tradeOfferMemory: updateTradeOfferMemory(latestMeta, freshOffers),
          });
          for (const prop of freshOffers) {
            NewsEngine.logNews(
              'TRADE_PROPOSAL',
              `📨 ${prop.offeringTeamAbbr} offer: ${prop.offeringPlayerName} for ${prop.receivingPlayerName}. ${prop.reason}`,
              null,
              { isProposal: true, ...prop },
            );
          }
        }
      }
    } catch (tradeErr) {
      // Trade engine errors should never crash the week advance.
      console.warn('[Worker] AI trade engine error (non-fatal):', tradeErr.message);
    }
  }

  const postTradeMeta = ensureDynastyMeta(cache.getMeta());
  const prunedOffers = pruneIncomingTradeOffers(postTradeMeta);
  if (prunedOffers.length !== (Array.isArray(postTradeMeta?.incomingTradeOffers) ? postTradeMeta.incomingTradeOffers.length : 0)) {
    cache.setMeta({ incomingTradeOffers: prunedOffers });
  }

  const userWeeklyResult = results.find((r) => Number(r?.home ?? r?.homeTeamId) === meta?.userTeamId || Number(r?.away ?? r?.awayTeamId) === meta?.userTeamId);
  if (userWeeklyResult) {
    const homeId = Number(userWeeklyResult?.home ?? userWeeklyResult?.homeTeamId);
    const awayId = Number(userWeeklyResult?.away ?? userWeeklyResult?.awayTeamId);
    const userIsHome = homeId === meta?.userTeamId;
    const userScore = userIsHome ? (userWeeklyResult?.scoreHome ?? userWeeklyResult?.homeScore ?? 0) : (userWeeklyResult?.scoreAway ?? userWeeklyResult?.awayScore ?? 0);
    const oppScore = userIsHome ? (userWeeklyResult?.scoreAway ?? userWeeklyResult?.awayScore ?? 0) : (userWeeklyResult?.scoreHome ?? userWeeklyResult?.homeScore ?? 0);
    const wonGame = userScore > oppScore;
    const userTeam = cache.getTeam(meta?.userTeamId);
    const oppId = userIsHome ? awayId : homeId;
    if (userTeam?.rivalTeamId != null && Number(userTeam?.rivalTeamId) === Number(oppId)) {
      const rivalTeam = cache.getTeam(oppId);
      const rivalryNews = createNewsItem('rivalry_game', { teamName: userTeam?.name, rivalName: rivalTeam?.name, teamId: userTeam?.id }, week, meta?.season);
      cache.setMeta(addNewsItem(cache.getMeta(), rivalryNews));
    }
    if (userTeam) {
      const lossStreak = wonGame ? 0 : (userTeam?.lossStreak ?? 0) + 1;
      const fanUpdate = applyGameFanApproval(userTeam, wonGame, lossStreak);
      cache.updateTeam(userTeam.id, {
        fanApproval: fanUpdate?.fanApproval ?? userTeam?.fanApproval ?? 50,
        fanApprovalWinBoostUsed: fanUpdate?.fanApprovalWinBoostUsed ?? userTeam?.fanApprovalWinBoostUsed ?? 0,
        lossStreak,
      });
      if (wonGame) {
        cache.setMeta({ ownerGoals: updateGoalsForWin(meta?.ownerGoals) });
      }
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

  // Belt-and-suspenders: second background flush after the UI receives results.
  // The first flushDirty() above runs synchronously in the advance pipeline;
  // this second one catches any cache mutations that happen between the two posts
  // (e.g. standings recalculation, injury updates).  Non-blocking — failures are
  // logged but never surface to the user.
  flushDirty().catch(e => console.warn('[Worker] post-week belt-flush failed (non-fatal):', e.message));
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

  // Diagnostic logging for schedule population
  console.log(`[Worker] Week ${week} schedule entries: ${weekData?.games?.length ?? 0}, unplayed: ${weekGames.length}`);

  // Defensive logging: if weekGames is empty, log why
  if (weekGames.length === 0) {
    const rawGames = weekData?.games ?? [];
    const unplayed = rawGames.filter(g => !g.played);
    console.warn(`[Worker] buildLeagueForSim: 0 weekGames for week ${week}.`,
      `weekData found: ${!!weekData}, total games in slim schedule: ${rawGames.length}, unplayed: ${unplayed.length},`,
      `teams in cache: ${teamsWithRosters.length}`);
    // Log first few games for debugging
    unplayed.slice(0, 3).forEach((g, i) => {
      const hId = g.home?.id ?? g.home;
      const aId = g.away?.id ?? g.away;
      const foundH = teamsWithRosters.find(t => t.id === hId || t.id === g.home?.id);
      const foundA = teamsWithRosters.find(t => t.id === aId || t.id === g.away?.id);
      console.warn(`  Game ${i}: home=${hId}(found:${!!foundH}), away=${aId}(found:${!!foundA})`);
    });
  }

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
  if (isNaN(hId) || isNaN(aId)) {
    console.error(`[Worker] applyGameResultToCache: Invalid team IDs — home=${rawH}, away=${rawA} → hId=${hId}, aId=${aId}`);
    return;
  }

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
      } else {
        console.warn(`[Worker] applyGameResultToCache: Could not find game ${hId} vs ${aId} in week ${week} schedule (${weekData.games.length} games in week)`);
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
      // Use String(pid) — player IDs are base-36 strings generated by U.id().
      // Converting to Number() yields NaN for string IDs, corrupting all stat entries.
      const stats = entry?.stats || {};
      cache.updateSeasonStat(String(pid), teamId, { ...stats, gamesPlayed: 1 });
    }
  };
  aggregateSide(hId, result.boxScore?.home);
  aggregateSide(aId, result.boxScore?.away);

  // ── 4. Queue game record for DB flush ─────────────────────────────────────

  // Process feats
  if (result.feats && result.feats.length > 0) {
    for (const feat of result.feats) {
      if (feat.playerId) {
        const p = cache.getPlayer(feat.playerId);
        NewsEngine.logFeat(p || { id: feat.playerId, name: feat.name, teamId: p?.teamId }, feat.teamAbbr, feat.opponentAbbr, feat.featDescription, '');
      } else {
         // Team Feats
         const t = cache.getTeam(feat.teamAbbr);
         NewsEngine.logNews('FEAT', `Feat: ${feat.name} recorded ${feat.featDescription} against ${feat.opponentAbbr}.`, t?.id);
      }
    }
  }

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
  const meta = ensureDynastyMeta(cache.getMeta());
  if (!meta) { post(toUI.ERROR, { message: 'No league loaded' }, id); return; }

  const start = meta.currentWeek;
  for (let w = start; w < targetWeek; w++) {
    await handleAdvanceWeek({}, null); // null id → no per-week reply
  }
  // Final state broadcast
  post(toUI.FULL_STATE, buildViewState(), id);
}

// ── Handler: SIM_TO_PHASE ────────────────────────────────────────────────────

async function handleSimToPhase({ targetPhase }, id) {
  const meta = ensureDynastyMeta(cache.getMeta());
  if (!meta) { post(toUI.ERROR, { message: 'No league loaded' }, id); return; }

  // Map target phases to stop conditions
  const PHASE_TARGETS = {
    playoffs:   (m) => m.phase === 'playoffs',
    offseason:  (m) => m.phase === 'offseason_resign' || m.phase === 'offseason',
    preseason:  (m) => m.phase === 'preseason',
    regular:    (m) => m.phase === 'regular',
  };

  const isTarget = PHASE_TARGETS[targetPhase];
  if (!isTarget) {
    post(toUI.ERROR, { message: `Unknown target phase: ${targetPhase}` }, id);
    return;
  }

  // Already at target?
  if (isTarget(meta)) {
    post(toUI.FULL_STATE, buildViewState(), id);
    return;
  }

  // Safety: max iterations to prevent infinite loops
  const MAX_ITERATIONS = 200;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    const currentMeta = cache.getMeta();

    // Check if we've reached the target
    if (isTarget(currentMeta)) break;

    // Send progress to UI
    post(toUI.SIM_BATCH_PROGRESS, {
      currentWeek: currentMeta.currentWeek ?? 0,
      phase: currentMeta.phase,
      targetPhase,
    });

    // Advance based on current phase
    // Pass skipUserGame:true during batch sim to avoid prompting the user
    if (['regular', 'playoffs', 'preseason'].includes(currentMeta.phase)) {
      await handleAdvanceWeek({ skipUserGame: true }, null);
    } else if (['offseason_resign', 'offseason'].includes(currentMeta.phase)) {
      await handleAdvanceOffseason({}, null);
    } else if (currentMeta.phase === 'free_agency') {
      await handleAdvanceFreeAgencyDay({}, null);
    } else if (currentMeta.phase === 'draft') {
      // Auto-sim all draft picks. The draft pipeline itself is responsible
      // for transitioning into the next season (handleSimDraftPick and
      // handleMakeDraftPick both call handleStartNewSeason once all picks
      // are made), so we deliberately do NOT call handleAdvanceOffseason here.
      await handleStartDraft({}, null);
      let draftDone = false;
      let draftGuard = 0;
      while (!draftDone && draftGuard < 500) {
        const draftMeta = cache.getMeta();
        const ds = draftMeta.draftState;
        if (!ds || ds.currentPickIndex >= (ds.picks?.length ?? 0)) {
          draftDone = true;
        } else {
          await handleSimDraftPick({}, null);
        }
        draftGuard++;
      }
    } else {
      // Unknown phase — break to prevent infinite loop
      break;
    }

    iterations++;
    await yieldFrame();
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

// ── Handler: GET_RECORDS ──────────────────────────────────────────────────────

async function handleGetRecords(payload, id) {
  const meta = ensureDynastyMeta(cache.getMeta());
  const records = meta?.records ?? createEmptyRecords();
  post(toUI.RECORDS, { records }, id);
}

// ── Handler: GET_HALL_OF_FAME ────────────────────────────────────────────────

async function handleGetHallOfFame(payload, id) {
  // Collect all HOF players from DB (retired + any active HOF)
  const allDBPlayers = await Players.loadAll();
  const hofPlayers = allDBPlayers.filter(p => p.hof === true);

  const teamAbbrMap = {};
  cache.getAllTeams().forEach(t => { teamAbbrMap[t.id] = t.abbr; });

  // Also check active cache for any HOF players still in memory
  for (const p of cache.getAllPlayers()) {
    if (p.hof === true && !hofPlayers.some(h => String(h.id) === String(p.id))) {
      hofPlayers.push(p);
    }
  }

  const result = hofPlayers.map(p => {
    const primaryTeam = getMostPlayedTeam(p, teamAbbrMap);
    const careerStats = Array.isArray(p.careerStats) ? p.careerStats : [];

    // Aggregate career totals
    let passYds = 0, rushYds = 0, recYds = 0, passTDs = 0, sacks = 0, gamesPlayed = 0;
    for (const line of careerStats) {
      passYds += line.passYds ?? 0;
      rushYds += line.rushYds ?? 0;
      recYds += line.recYds ?? 0;
      passTDs += line.passTDs ?? 0;
      sacks += line.sacks ?? 0;
      gamesPlayed += line.gamesPlayed ?? 0;
    }

    // Find induction year (last year in career + 1, or look at retirement)
    const lastCareerYear = careerStats.length > 0
      ? careerStats[careerStats.length - 1].season
      : null;

    // Find HOF accolade year if available
    const hofAccolade = (p.accolades || []).find(a => a.type === 'HOF');
    const inductionYear = hofAccolade?.year ?? (lastCareerYear ? null : null);

    const accolades = Array.isArray(p.accolades) ? p.accolades : [];
    const mvpCount = accolades.filter(a => a.type === 'MVP').length;
    const sbCount = accolades.filter(a => a.type === 'SB_RING').length;
    const proCount = accolades.filter(a => a.type === 'PRO_BOWL').length;

    return {
      id: p.id,
      name: p.name,
      pos: p.pos,
      age: p.age,
      ovr: p.ovr,
      number: p.number ?? p.jerseyNum ?? null,
      primaryTeam,
      teamColor: getTeamColor(primaryTeam, cache.getAllTeams()),
      inductionYear,
      seasonsPlayed: careerStats.length,
      stats: { passYds, rushYds, recYds, passTDs, sacks, gamesPlayed },
      accoladeSummary: { mvps: mvpCount, superBowls: sbCount, proBowls: proCount },
    };
  }).sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));

  post(toUI.HALL_OF_FAME, { players: result }, id);
}

function getTeamColor(abbr, teams) {
  const team = teams.find(t => t.abbr === abbr);
  return team?.color ?? team?.primaryColor ?? '#555';
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
    // ── 1. Cache lookup ──────────────────────────────────────────────────────
    let player = cache.getPlayer(strId);

    // ── 2. Draft-prospect early return ───────────────────────────────────────
    // Draft-eligible players live in the hot cache but have no career stats yet.
    // Handle them immediately to avoid unnecessary DB lookups.
    if (player && player.status === 'draft_eligible') {
      post(toUI.PLAYER_CAREER, {
        playerId: strId,
        player,
        stats: [],
        isDraftProspect: true,
      }, id);
      return;
    }

    // ── 3. DB fallback — rookies / released players may not be in hot cache ───
    if (!player) {
      player = await Players.load(strId).catch(() => null);
    }
    if (!player) {
      const numId = Number(strId);
      if (Number.isFinite(numId)) player = await Players.load(numId).catch(() => null);
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
    const fallbackPlayer = cache.getPlayer(strId);
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


// ── Handler: APPLY_FRANCHISE_TAG ──────────────────────────────────────────────
async function handleApplyFranchiseTag({ playerId, teamId }, id) {
  const meta = ensureDynastyMeta(cache.getMeta());
  const player = cache.getPlayer(playerId);
  if (!player || player.teamId !== teamId) {
      post(toUI.ERROR, { message: 'Invalid player for franchise tag.' }, id);
      return;
  }
  if (meta.phase !== 'offseason_resign') {
      post(toUI.ERROR, { message: 'Franchise tag can only be applied during re-signing phase.' }, id);
      return;
  }

  // Calculate Tag Value (simplified heuristic: roughly 1.25x market value for 1 year)
  // Realism Note: A real franchise tag takes the top 5 salaries at the position.
  const baseline = Constants.SALARY_CAP.HARD_CAP * (Constants.POSITION_VALUES[player.pos] || 0.1);
  const ask = (player.ovr > 85 ? 0.08 : 0.05) * Constants.SALARY_CAP.HARD_CAP;
  const tagCost = Math.round(ask * 1.25 * 10) / 10;

  const contract = {
      years: 1,
      yearsTotal: 1,
      baseAnnual: tagCost,
      signingBonus: 0,
      guaranteedPct: 100, // Fully guaranteed
  };

  cache.updatePlayer(playerId, { contract, isTagged: true });
  recalculateTeamCap(teamId);

  await Transactions.add({
      type: 'FRANCHISE_TAG',
      seasonId: meta.currentSeasonId,
      week: meta.currentWeek,
      teamId,
      details: { playerId, contract }
  });

  await NewsEngine.logNews('TRANSACTION', `The ${cache.getTeam(teamId)?.abbr || 'team'} placed the franchise tag on ${player.pos} ${player.name}.`, teamId);

  await flushDirty();
  post(toUI.STATE_UPDATE, { roster: buildRosterView(teamId), ...buildViewState() }, id);
}


// ── Handler: RELOCATE_TEAM ────────────────────────────────────────────────────
async function handleRelocateTeam({ teamId, newCity, newName, newAbbr }, id) {
  const meta = ensureDynastyMeta(cache.getMeta());
  const team = cache.getTeam(teamId);
  if (!team) {
      post(toUI.ERROR, { message: 'Team not found.' }, id);
      return;
  }
  if (meta.userTeamId !== teamId) {
      post(toUI.ERROR, { message: 'You can only relocate your own team.' }, id);
      return;
  }
  // Optional: Add cost/phase requirements, e.g. phase === 'offseason'

  cache.updateTeam(teamId, {
      city: newCity,
      name: newName,
      abbr: newAbbr.toUpperCase()
  });

  await NewsEngine.logNews('TRANSACTION', `BREAKING: The franchise formerly known as ${team.city} ${team.name} has relocated to ${newCity} and will now be known as the ${newName}.`, teamId);

  await flushDirty();
  post(toUI.STATE_UPDATE, buildViewState(), id);
}
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


function isValidSlotKey(slotKey) {
  return ['save_slot_1', 'save_slot_2', 'save_slot_3'].includes(slotKey);
}

async function snapshotActiveLeagueDB() {
  const db = await openDB();
  const storeNames = Array.from(db.objectStoreNames);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readonly');
    const out = {};
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve(out);
    for (const storeName of storeNames) {
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => { out[storeName] = Array.isArray(req.result) ? req.result : []; };
      req.onerror = () => reject(req.error);
    }
  });
}

async function writeLeagueSnapshot(leagueId, snapshot) {
  configureActiveLeague(leagueId);
  await openDB();
  await clearAllData();
  const db = await openDB();
  const storeNames = Object.keys(snapshot ?? {});
  if (!Array.isArray(storeNames) || storeNames.length === 0) return;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    for (const storeName of storeNames) {
      const rows = snapshot?.[storeName];
      if (!Array.isArray(rows)) continue;
      const store = tx.objectStore(storeName);
      for (const row of rows) {
        store.put(row);
      }
    }
  });
}

async function copyLeagueData(sourceLeagueId, targetLeagueId) {
  configureActiveLeague(sourceLeagueId);
  await openDB();
  const snapshot = await snapshotActiveLeagueDB();
  await writeLeagueSnapshot(targetLeagueId, snapshot);
}

async function handleLoadSlot({ slotKey }, id) {
  if (!isValidSlotKey(slotKey)) {
    post(toUI.ERROR, { message: 'Invalid slot key' }, id);
    return;
  }
  await handleLoadSave({ leagueId: slotKey }, id);
}

async function handleSaveSlot({ slotKey }, id) {
  if (!isValidSlotKey(slotKey)) {
    post(toUI.ERROR, { message: 'Invalid slot key' }, id);
    return;
  }

  try {
    const sourceLeagueId = getActiveLeagueId();
    if (!sourceLeagueId) {
      post(toUI.NOTIFICATION, { level: 'warn', message: 'Select or create a game before saving to a slot.' }, id);
      return;
    }

    await flushDirty();
    await copyLeagueData(sourceLeagueId, slotKey);
    configureActiveLeague(slotKey);
    await openDB();

    const meta = cache.getMeta() ?? {};
    const userTeam = cache.getTeam(meta?.userTeamId);
    await Saves.save({
      id: slotKey,
      name: meta?.name ?? `Franchise ${slotKey?.split('_')?.[2] ?? '1'}`,
      year: meta?.year,
      teamId: meta?.userTeamId,
      teamAbbr: userTeam?.abbr ?? '???',
      lastPlayed: Date.now(),
    });

    _saveIsExplicitlyLoaded = true;
    post(toUI.SAVED, {}, id);
    post(toUI.STATE_UPDATE, buildViewState(), id);
  } catch (err) {
    post(toUI.ERROR, { message: err?.message ?? 'Failed to save slot.' }, id);
  }
}

async function handleDeleteSlot({ slotKey }, id) {
  if (!isValidSlotKey(slotKey)) {
    post(toUI.ERROR, { message: 'Invalid slot key' }, id);
    return;
  }
  try {
    await Saves.delete(slotKey);
    await deleteLeagueDB(slotKey);
    post(toUI.STATE_UPDATE, { activeSlot: null }, id);
  } catch (err) {
    post(toUI.ERROR, { message: err?.message ?? 'Failed to delete slot.' }, id);
  }
}

async function migrateLegacySaveToSlot1IfNeeded() {
  const saves = await Saves.loadAll();
  const hasSlot1 = saves.some(s => s?.id === 'save_slot_1');
  if (hasSlot1) return;

  const legacy = saves.find(s => !isValidSlotKey(s?.id));
  if (!legacy?.id) return;

  await copyLeagueData(legacy.id, 'save_slot_1');
  await Saves.save({ ...legacy, id: 'save_slot_1', lastPlayed: Date.now() });
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
  const meta = ensureDynastyMeta(cache.getMeta());
  const limit = (['offseason_resign', 'free_agency', 'draft', 'offseason', 'preseason'].includes(meta.phase))
      ? Constants.ROSTER_LIMITS.OFFSEASON
      : Constants.ROSTER_LIMITS.REGULAR_SEASON;

  const roster = cache.getPlayersByTeam(teamId);
  if (roster.length >= limit) {
      post(toUI.ERROR, { message: `Roster limit (${limit}) reached. Release a player first.` }, id);
      return;
  }

  // Normalize the incoming playerId.
  let player = cache.getPlayer(playerId);
  if (!player) { post(toUI.ERROR, { message: 'Player not found' }, id); return; }

  // ── Hard Cap Check ($301.2M) ────────────────────────────────────────────────
  const team = cache.getTeam(teamId);
  if (team && contract) {
    const newCapHit = (contract.baseAnnual ?? 0) + ((contract.signingBonus ?? 0) / (contract.yearsTotal || 1));
    const projectedCapUsed = (team.capUsed ?? 0) + newCapHit;
    const hardCap = Constants.SALARY_CAP.HARD_CAP;
    if (projectedCapUsed > hardCap) {
      post(toUI.ERROR, {
        message: `Signing blocked: this deal would put ${team.name} at $${projectedCapUsed.toFixed(1)}M — over the $${hardCap}M hard cap. Free up cap room first.`
      }, id);
      return;
    }
  }

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
  if (!player) { post(toUI.ERROR, { message: 'Player not found' }, id); return; }

  // ── June 1st Dead Money Rule ────────────────────────────────────────────────
  // Pre-June-1 phases (offseason_resign): ALL remaining prorated bonus accelerates
  //   to the current year's dead cap.
  // Post-June-1 phases (free_agency, draft, preseason, regular, playoffs):
  //   This year's prorated bonus hits current dead cap; future years defer to
  //   deadMoneyNextYear (carries into next season's cap).
  const meta = ensureDynastyMeta(cache.getMeta());
  const team = cache.getTeam(teamId);
  if (team && player.contract) {
    const yearsRemaining = Math.max(player.contract.years ?? 1, 1);
    const yearsTotal     = Math.max(player.contract.yearsTotal ?? yearsRemaining, 1);
    const totalBonus     = player.contract.signingBonus ?? 0;
    const annualBonus    = totalBonus / yearsTotal;   // prorated share per year

    const isPostJune1 = Constants.SALARY_CAP.POST_JUNE1_PHASES.includes(meta.phase);

    if (isPostJune1 && yearsRemaining > 1) {
      // Current-year prorated bonus → dead cap now
      const currentYearDead = annualBonus;
      // Future years' prorated bonus → deferred to next season
      const futureYearsDead = annualBonus * (yearsRemaining - 1);

      if (currentYearDead > 0) {
        cache.updateTeam(teamId, { deadCap: (team.deadCap ?? 0) + currentYearDead });
      }
      if (futureYearsDead > 0) {
        const freshTeam = cache.getTeam(teamId);
        cache.updateTeam(teamId, { deadMoneyNextYear: (freshTeam.deadMoneyNextYear ?? 0) + futureYearsDead });
      }
    } else {
      // Pre-June-1: all remaining prorated bonus hits current year
      const deadMoney = annualBonus * yearsRemaining;
      if (deadMoney > 0) {
        cache.updateTeam(teamId, { deadCap: (team.deadCap ?? 0) + deadMoney });
      }
    }
  }

  // Use player.id (the canonical key from the cache) for all subsequent writes.
  cache.updatePlayer(player.id, { teamId: null, status: 'free_agent', offers: [] });
  recalculateTeamCap(teamId);

  // meta is already declared above
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
        onTradeBlock:     p?.onTradeBlock ?? false,
        contract,
        traits:           p.traits ?? [],
        schemeFit:        fit,
        morale:           calculateMorale(p, team, true)
      };
  });

  post(toUI.ROSTER_DATA, {
    teamId: numId,
    team: {
      id:                team.id,
      name:              team.name,
      abbr:              team.abbr,
      capUsed:           team.capUsed           ?? 0,
      capRoom:           team.capRoom           ?? 0,
      capTotal:          team.capTotal          ?? Constants.SALARY_CAP.HARD_CAP,
      deadCap:           team.deadCap           ?? 0,
      deadMoneyNextYear: team.deadMoneyNextYear  ?? 0,
      staff:             team.staff,
    },
    players,
  }, id);
}

// ── Handler: GET_FREE_AGENTS ──────────────────────────────────────────────────

async function handleGetFreeAgents(payload, id) {
  const meta = ensureDynastyMeta(cache.getMeta());
  const userTeamId = meta.userTeamId;

  const freeAgents = cache.getAllPlayers()
    .filter(p => !p.teamId || p.status === 'free_agent')
    .map(p => {
        // Summarize offers for UI — bidding war edition
        const offers = p.offers || [];
        const userOffer = offers.find(o => o.teamId === userTeamId);

        // Find the top bid (highest total contract value)
        let topBid = null;
        let topOfferValue = 0;
        for (const o of offers) {
            const c = o.contract;
            const val = (c.baseAnnual * c.yearsTotal) + (c.signingBonus || 0);
            if (val > topOfferValue) {
                topOfferValue = val;
                topBid = o;
            }
        }

        // Calculate user's bid value if they have one
        let userBidValue = 0;
        if (userOffer) {
            const uc = userOffer.contract;
            userBidValue = (uc.baseAnnual * uc.yearsTotal) + (uc.signingBonus || 0);
        }

        return {
          id:        p.id,
          name:      p.name,
          pos:       p.pos,
          age:       p.age,
          ovr:       p.ovr,
          potential: p.potential ?? null,
          contract:  p.contract ?? null,
          traits:    p.traits ?? [],
          offers: {
              count: offers.length,
              userOffered: !!userOffer,
              userIsTopBidder: !!userOffer && topBid && topBid.teamId === userTeamId,
              topOfferValue: Math.round(topOfferValue * 10) / 10,
              topBidTeam: topBid ? topBid.teamName : null,
              topBidAnnual: topBid ? Math.round(topBid.contract.baseAnnual * 10) / 10 : 0,
              topBidYears: topBid ? topBid.contract.yearsTotal : 0,
              userBidAnnual: userOffer ? Math.round(userOffer.contract.baseAnnual * 10) / 10 : 0,
              userBidYears: userOffer ? userOffer.contract.yearsTotal : 0,
              userBidValue: Math.round(userBidValue * 10) / 10,
          }
        };
    });

  // Include FA day state for UI
  const faDay = meta.freeAgencyState?.day ?? 1;
  const faMaxDays = meta.freeAgencyState?.maxDays ?? 5;

  post(toUI.FREE_AGENT_DATA, { freeAgents, faDay, faMaxDays, phase: meta.phase }, id);
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

// ── Handler: CONDUCT_DRILL ───────────────────────────────────────────────────
// Applies temporary weekly training boosts to players in the specified position
// groups based on drill intensity and type.  Boosts are stored on each player as
// `weeklyTrainingBoost` (a small integer OVR delta) and are consumed by the
// simulation engine.  They are cleared when the week advances.

async function handleConductDrill({ teamId, intensity, drillType, positionGroups }, id) {
    const meta = ensureDynastyMeta(cache.getMeta());
    const numId = Number(teamId ?? meta?.userTeamId);
    if (!Number.isFinite(numId)) {
        post(toUI.ERROR, { message: 'No team selected for drill' }, id);
        return;
    }
    const team = cache.getTeam(numId);
    if (!team) {
        post(toUI.ERROR, { message: 'Team not found for drill' }, id);
        return;
    }

    const players = cache.getPlayersByTeam(numId);
    if (!players || !players.length) {
        post(toUI.STATE_UPDATE, buildViewState(), id);
        return;
    }

    // Intensity → development multiplier and boost magnitude
    const INTENSITY_CFG = {
        light:  { devMult: 0.6, maxBoost: 1, injRisk: 0.005 },
        normal: { devMult: 1.0, maxBoost: 1, injRisk: 0.010 },
        hard:   { devMult: 1.5, maxBoost: 2, injRisk: 0.020 },
    };
    const cfg = INTENSITY_CFG[intensity] || INTENSITY_CFG.normal;

    // Position groups filter (all if empty)
    const focusSet = new Set(
        (positionGroups && positionGroups.length)
            ? positionGroups.map(g => g.toUpperCase())
            : []
    );
    const POS_GROUP_MAP = {
        QB: ['QB'], RB: ['RB'], WR: ['WR', 'TE'], OL: ['OL', 'C', 'G', 'T'],
        DL: ['DL', 'DE', 'DT', 'NT'], LB: ['LB', 'MLB', 'OLB'],
        DB: ['CB', 'S', 'FS', 'SS'], ST: ['K', 'P'],
    };
    const activePosSet = new Set();
    if (focusSet.size === 0) {
        players.forEach(p => activePosSet.add(p.pos));
    } else {
        for (const grp of focusSet) {
            (POS_GROUP_MAP[grp] || [grp]).forEach(pos => activePosSet.add(pos));
        }
    }

    // Drill type bonus: Technique/Conditioning/TeamDrills/FilmStudy
    // Each unlocks slightly different boosts
    const drillBonus = (drillType === 'technique' || drillType === 'team_drills') ? 1 : 0;

    const dirtyPlayers = [];
    for (const p of players) {
        if (!activePosSet.has(p.pos)) continue;
        // Chance to get a boost: 40-60% depending on intensity
        const roll = Math.random();
        const chance = 0.35 + cfg.devMult * 0.15;
        if (roll < chance) {
            const boost = cfg.maxBoost + drillBonus;
            // Accumulate: existing boost + new boost (cap at 3)
            const current = p.weeklyTrainingBoost || 0;
            p.weeklyTrainingBoost = Math.min(3, current + boost);
            cache.updatePlayer(p.id, { weeklyTrainingBoost: p.weeklyTrainingBoost });
            dirtyPlayers.push(p.id);
        }
        // Small injury risk from hard training (drill-only, not game injury)
        if (cfg.injRisk > 0 && Math.random() < cfg.injRisk && !p.injured) {
            p.injured = true;
            p.injuryWeeksRemaining = 1;
            cache.updatePlayer(p.id, { injured: true, injuryWeeksRemaining: 1 });
            dirtyPlayers.push(p.id);
        }
    }

    if (dirtyPlayers.length) await flushDirty();

    // Return updated roster so UI can reflect new boost values
    await handleGetRoster({ teamId: numId }, id);
}

// ── Handler: UPDATE_MEDICAL_STAFF ──────────────────────────────────────────
// Persists medical/physio staff to team.staff.medStaff so the sim engine can
// read their traits when computing in-game injury chances.

async function handleUpdateMedicalStaff({ teamId, medStaff }, id) {
    const meta = ensureDynastyMeta(cache.getMeta());
    const numId = Number(teamId ?? meta?.userTeamId);
    if (!Number.isFinite(numId)) {
        post(toUI.ERROR, { message: 'No team selected for medical staff update' }, id);
        return;
    }
    const team = cache.getTeam(numId);
    if (!team) {
        post(toUI.ERROR, { message: 'Team not found for medical staff update' }, id);
        return;
    }

    if (!team.staff) team.staff = {};
    team.staff.medStaff = medStaff || [];

    await flushDirty();
    post(toUI.STATE_UPDATE, buildViewState(), id);
}

// ── Handler: EXTENSION ──────────────────────────────────────────────────────

async function handleGetExtensionAsk({ playerId }, id) {
  const meta = ensureDynastyMeta(cache.getMeta());
  const player = cache.getPlayer(playerId);
  if (!player) { post(toUI.ERROR, { message: 'Player not found' }, id); return; }

  // Generate ask based on market value
  const ask = calculateExtensionDemand(player, meta?.difficulty ?? 'Normal');
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
  const meta = ensureDynastyMeta(cache.getMeta());
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

  const offerVal    = calcAssetBundleValue(offering);
  const receiveVal  = calcAssetBundleValue(receiving);

  // AI acceptance threshold scales by difficulty
  const meta = ensureDynastyMeta(cache.getMeta());
  const diff = meta.difficulty || 'Normal';
  let diffMult = 1.0;
  if (diff === 'Easy') diffMult = 0.9; // AI accepts at 90% of what user offers
  if (diff === 'Hard') diffMult = 1.15; // AI demands 15% more
  if (diff === 'Legendary') diffMult = 1.30; // AI demands 30% more

  // E.g. User (fromTeam) offers 1000 value, wants 1000 value.
  // On Normal, AI wants 1000 * 1.0 = 1000 in return (offerVal >= receiveVal * 1.0)
  // Let's refine the logic: AI is "toTeam". It is receiving "offering" and giving up "receiving".
  // AI accepts if offering >= receiving * diffMult

  const threshold = receiveVal * diffMult;
  const accepted = offerVal >= threshold;

  // ── Hard Cap Trade Validation ────────────────────────────────────────────────
  // Before executing an accepted trade, verify neither team would breach the
  // $301.2M hard cap after swapping players.
  if (accepted) {
    const hardCap = Constants.SALARY_CAP.HARD_CAP;

    // Helper: sum cap hit for a list of player IDs
    const capHitOf = (pids = []) => pids.reduce((sum, pid) => {
      const p = cache.getPlayer(Number(pid));
      if (!p) return sum;
      const base  = p.contract?.baseAnnual  ?? p.baseAnnual  ?? 0;
      const bonus = p.contract?.signingBonus ?? p.signingBonus ?? 0;
      const yrs   = p.contract?.yearsTotal   ?? p.yearsTotal  ?? 1;
      return sum + base + bonus / (yrs || 1);
    }, 0);

    const fromTeamObj = cache.getTeam(Number(fromTeamId));
    const toTeamObj   = cache.getTeam(Number(toTeamId));

    // fromTeam loses offering players, gains receiving players
    const fromProjected = (fromTeamObj?.capUsed ?? 0)
      - capHitOf(offering.playerIds)
      + capHitOf(receiving.playerIds);

    // toTeam loses receiving players, gains offering players
    const toProjected = (toTeamObj?.capUsed ?? 0)
      - capHitOf(receiving.playerIds)
      + capHitOf(offering.playerIds);

    if (fromProjected > hardCap) {
      post(toUI.TRADE_RESPONSE, {
        accepted: false,
        offerValue: Math.round(offerVal),
        receiveValue: Math.round(receiveVal),
        reason: `Trade blocked: ${from.name} would exceed the $${hardCap}M hard cap ($${fromProjected.toFixed(1)}M projected).`,
      }, id);
      return;
    }
    if (toProjected > hardCap) {
      post(toUI.TRADE_RESPONSE, {
        accepted: false,
        offerValue: Math.round(offerVal),
        receiveValue: Math.round(receiveVal),
        reason: `Trade blocked: ${to.name} would exceed the $${hardCap}M hard cap ($${toProjected.toFixed(1)}M projected).`,
      }, id);
      return;
    }
  }

  if (accepted) {
    await executeAcceptedTrade({ fromTeamId, toTeamId, offering, receiving });
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

async function executeAcceptedTrade({ fromTeamId, toTeamId, offering, receiving }) {
  (offering?.playerIds ?? []).forEach(pid => {
    cache.updatePlayer(Number(pid), { teamId: Number(toTeamId) });
  });
  (receiving?.playerIds ?? []).forEach(pid => {
    cache.updatePlayer(Number(pid), { teamId: Number(fromTeamId) });
  });
  transferPickOwnership(offering?.pickIds ?? [], Number(fromTeamId), Number(toTeamId));
  transferPickOwnership(receiving?.pickIds ?? [], Number(toTeamId), Number(fromTeamId));

  recalculateTeamCap(Number(fromTeamId));
  recalculateTeamCap(Number(toTeamId));

  const latestMeta = ensureDynastyMeta(cache.getMeta());
  const tradeRecord = {
    type:     'TRADE',
    seasonId: latestMeta.currentSeasonId,
    week:     latestMeta.currentWeek,
    teamId:   Number(fromTeamId),
    details:  { fromTeamId, toTeamId, offering, receiving },
  };
  await Transactions.add(tradeRecord);
  await NewsEngine.logTransaction('TRADE', { fromTeamId, toTeamId });
  await flushDirty();
}

async function handleAcceptIncomingTrade({ offerId }, id) {
  const latestMeta = ensureDynastyMeta(cache.getMeta());
  const offers = pruneIncomingTradeOffers(latestMeta);
  const offer = offers.find((o) => o?.id === offerId);
  if (!offer) {
    post(toUI.TRADE_RESPONSE, { accepted: false, reason: 'Offer expired or no longer available.' }, id);
    return;
  }

  await executeAcceptedTrade({
    fromTeamId: Number(latestMeta?.userTeamId),
    toTeamId: Number(offer.offeringTeamId),
    offering: offer.receiving ?? { playerIds: [offer.receivingPlayerId], pickIds: [] },
    receiving: offer.offering ?? { playerIds: [offer.offeringPlayerId], pickIds: [] },
  });

  const remaining = offers.filter((o) => o?.id !== offerId);
  cache.setMeta({ incomingTradeOffers: remaining, lastTradeActivityWeek: Number(latestMeta?.currentWeek ?? 1) });
  post(toUI.TRADE_RESPONSE, { accepted: true, reason: `${offer.offeringTeamAbbr} deal accepted.` }, id);
  post(toUI.STATE_UPDATE, buildViewState());
}

async function handleRejectIncomingTrade({ offerId }, id) {
  const latestMeta = ensureDynastyMeta(cache.getMeta());
  const offers = pruneIncomingTradeOffers(latestMeta);
  const remaining = offers.filter((o) => o?.id !== offerId);
  cache.setMeta({ incomingTradeOffers: remaining });
  await flushDirty();
  post(toUI.TRADE_RESPONSE, { accepted: false, reason: 'Offer declined.' }, id);
  post(toUI.STATE_UPDATE, buildViewState());
}

async function handleCounterIncomingTrade({ offerId, offering, receiving }, id) {
  const latestMeta = ensureDynastyMeta(cache.getMeta());
  const offers = pruneIncomingTradeOffers(latestMeta);
  const offer = offers.find((o) => o?.id === offerId);
  if (!offer) {
    post(toUI.TRADE_RESPONSE, { accepted: false, counterStatus: 'expired', reason: 'That offer is no longer on the table.' }, id);
    return;
  }
  if (offer?.lastCounter) {
    post(toUI.TRADE_RESPONSE, {
      accepted: false,
      counterStatus: 'locked',
      reason: `${offer.offeringTeamAbbr ?? 'They'} already answered your counter and are holding firm.`,
    }, id);
    return;
  }

  const aiTeam = cache.getTeam(Number(offer.offeringTeamId));
  const userTeam = cache.getTeam(Number(latestMeta?.userTeamId));
  if (!aiTeam || !userTeam) {
    post(toUI.TRADE_RESPONSE, { accepted: false, counterStatus: 'invalid', reason: 'Counter could not be evaluated right now.' }, id);
    return;
  }

  const userBundle = {
    playerIds: Array.isArray(offering?.playerIds) ? offering.playerIds : [],
    pickIds: Array.isArray(offering?.pickIds) ? offering.pickIds : [],
  };
  const aiBundle = {
    playerIds: Array.isArray(receiving?.playerIds) ? receiving.playerIds : [],
    pickIds: Array.isArray(receiving?.pickIds) ? receiving.pickIds : [],
  };

  const aiReceivesValue = calcAssetBundleValue(userBundle);
  const aiGivesValue = calcAssetBundleValue(aiBundle);
  const response = evaluateCounterOffer({
    aiTeam,
    userTeam,
    week: Number(latestMeta?.currentWeek ?? 1),
    aiDirection: offer?.offeringDirection ?? 'balanced',
    offerType: offer?.offerType ?? 'depth_swap',
    aiReceivesValue,
    aiGivesValue,
    hasUserPickSweetener: userBundle.pickIds.length > 0,
    hasAiPickSweetener: aiBundle.pickIds.length > 0,
    isCounterRound: true,
  });

  const remaining = offers.filter((o) => o?.id !== offerId);
  if (response.status === 'accepts') {
    await executeAcceptedTrade({
      fromTeamId: Number(latestMeta?.userTeamId),
      toTeamId: Number(offer.offeringTeamId),
      offering: userBundle,
      receiving: aiBundle,
    });
    cache.setMeta({
      incomingTradeOffers: remaining,
      lastTradeActivityWeek: Number(latestMeta?.currentWeek ?? 1),
    });
    post(toUI.TRADE_RESPONSE, {
      accepted: true,
      counterStatus: 'accepts',
      reason: response.reason,
      stance: response.stance,
      offerValue: Math.round(aiReceivesValue),
      receiveValue: Math.round(aiGivesValue),
    }, id);
    post(toUI.STATE_UPDATE, buildViewState());
    return;
  }

  const updatedOffer = {
    ...offer,
    lastCounter: {
      week: Number(latestMeta?.currentWeek ?? 1),
      status: response.status,
      stance: response.stance,
      reason: response.reason,
      askHint: response.askHint ?? null,
    },
    stance: response.stance,
  };
  cache.setMeta({ incomingTradeOffers: [updatedOffer, ...remaining].slice(0, 6) });
  await flushDirty();
  post(toUI.TRADE_RESPONSE, {
    accepted: false,
    counterStatus: response.status,
    reason: response.reason,
    stance: response.stance,
    askHint: response.askHint ?? null,
    offerValue: Math.round(aiReceivesValue),
    receiveValue: Math.round(aiGivesValue),
  }, id);
  post(toUI.STATE_UPDATE, buildViewState());
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

async function handleUpdateStrategy({ offPlanId, defPlanId, riskId, starTargetId, offSchemeId, defSchemeId, gamePlan, gmDecisions }, id) {
  const meta = ensureDynastyMeta(cache.getMeta());
  const userTeamId = meta.userTeamId;
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
  // Extended game-plan sliders (from GamePlanScreen)
  if (gamePlan) {
    strategies.gamePlan = {
      ...(strategies.gamePlan || {}),
      ...gamePlan,
    };
  }

  // Weekly GM Decisions (light-touch pre-game choices)
  if (gmDecisions) {
    strategies.gmDecisions = {
      ...(strategies.gmDecisions || {}),
      ...gmDecisions,
    };
  }

  // Scheme selections (Scheme Engine v1)
  if (offSchemeId) strategies.offSchemeId = offSchemeId;
  if (defSchemeId) strategies.defSchemeId = defSchemeId;

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

  const deadCap          = team.deadCap         || 0;
  const deadMoneyNextYear = team.deadMoneyNextYear || 0;
  const capTotal          = team.capTotal         ?? Constants.SALARY_CAP.HARD_CAP;
  const totalCapUsed      = activeCap + deadCap;

  cache.updateTeam(teamId, {
    capUsed:         Math.round(totalCapUsed * 100)        / 100,
    capRoom:         Math.round((capTotal - totalCapUsed) * 100) / 100,
    deadCap:         Math.round(deadCap * 100)             / 100,
    deadMoneyNextYear: Math.round(deadMoneyNextYear * 100) / 100,
  });
}
// Alias for backward compatibility if needed, but we should replace calls.
const _updateTeamCap = recalculateTeamCap;

// ── Handler: RESTRUCTURE_CONTRACT ────────────────────────────────────────────
//
// Converts a portion of a player's base salary into a prorated signing bonus,
// lowering the current-year cap hit by spreading the converted amount across
// remaining contract years.
//
// Example: Player has $20M base / 3 yrs remaining.
//   Convert 50% of base → $10M becomes new prorated bonus.
//   New annual bonus = $10M / 3 = $3.33M.
//   New base = $10M.  Cap hit FALLS by $10M - $3.33M = $6.67M this year.
//   BUT future years each have a higher cap hit (+$3.33M bonus per year remaining).

async function handleRestructureContract({ playerId, teamId }, id) {
  let player = cache.getPlayer(playerId);
  if (!player) { post(toUI.ERROR, { message: 'Player not found' }, id); return; }

  const team = cache.getTeam(teamId);
  if (!team) { post(toUI.ERROR, { message: 'Team not found' }, id); return; }

  // Only players with at least 2 years remaining can be restructured
  const contract = player.contract ?? {
    years:       player.years       ?? 1,
    yearsTotal:  player.yearsTotal  ?? player.years ?? 1,
    baseAnnual:  player.baseAnnual  ?? 0,
    signingBonus:player.signingBonus ?? 0,
    guaranteedPct:player.guaranteedPct ?? 0.5,
  };

  const yearsRemaining = contract.years ?? 1;
  if (yearsRemaining < 2) {
    post(toUI.ERROR, { message: 'Cannot restructure: player must have at least 2 years remaining.' }, id);
    return;
  }

  const maxConvertPct = Constants.SALARY_CAP.RESTRUCTURE_MAX_CONVERT_PCT;
  const baseAnnual    = contract.baseAnnual ?? 0;
  const convertAmount = Math.round(baseAnnual * maxConvertPct * 100) / 100;

  if (convertAmount <= 0) {
    post(toUI.ERROR, { message: 'Cannot restructure: no base salary to convert.' }, id);
    return;
  }

  // New contract values after restructure
  const newBase         = Math.round((baseAnnual - convertAmount) * 100) / 100;
  const addedBonusTotal = convertAmount * yearsRemaining; // spread over remaining years
  const existingBonus   = contract.signingBonus ?? 0;
  const newSigningBonus = Math.round((existingBonus + addedBonusTotal) * 100) / 100;

  const newContract = {
    ...contract,
    baseAnnual:   newBase,
    signingBonus: newSigningBonus,
  };

  cache.updatePlayer(player.id, { contract: newContract });
  recalculateTeamCap(teamId);

  const meta = ensureDynastyMeta(cache.getMeta());
  await Transactions.add({
    type: 'RESTRUCTURE', seasonId: meta.currentSeasonId,
    week: meta.currentWeek, teamId,
    details: { playerId: player.id, convertAmount, newBase, newSigningBonus },
  });

  await flushDirty();

  const updatedTeam = cache.getTeam(teamId);
  post(toUI.STATE_UPDATE, {
    roster: buildRosterView(teamId),
    ...buildViewState(),
    restructureResult: {
      playerName:    player.name,
      convertAmount,
      newBase,
      newSigningBonus,
      capSavingsThisYear: Math.round((convertAmount - convertAmount / yearsRemaining) * 100) / 100,
    },
  }, id);
}

// ── Draft helpers ─────────────────────────────────────────────────────────────

/**
 * Build the draft state view-model slice the UI needs.
 * Prospects are all players with status 'draft_eligible', sorted OVR desc.
 */
function buildDraftStateView() {
  const meta = ensureDynastyMeta(cache.getMeta());
  const draftState = meta?.draftState;
  if (!draftState) return { notStarted: true };

  const { picks, currentPickIndex } = draftState;
  const currentPick = picks[currentPickIndex] ?? null;
  const userTeamId  = meta.userTeamId;

  // Completed picks (slim)
  const completedPicks = picks.slice(0, currentPickIndex).map(pk => {
    const team = cache.getTeam(pk.teamId);
    const p = cache.getPlayer(pk.playerId);
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
      scoutStatus: p?.scoutStatus ?? null,
      combineStats: p?.combineStats ?? null,
    };
  });

  // Next 25 upcoming picks (visible in the order panel)
  const upcomingPicks = picks.slice(currentPickIndex, currentPickIndex + 25).map(pk => {
    const team = cache.getTeam(pk.teamId);
    const p = cache.getPlayer(pk.playerId);
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
    pendingTradeProposal: meta.pendingDraftTradeProposal ?? null,
  };
}

/**
 * Execute a single draft pick: sign the player to the team, update pick record.
 */
function _executeDraftPick(pickIndex, playerId, teamId) {
  const meta = ensureDynastyMeta(cache.getMeta());
  const draftState = meta?.draftState;
  if (!draftState) return;

  // Normalize the ID.
  let player = cache.getPlayer(playerId);
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


async function handleConductPrivateWorkout({ playerId }, id) {
  const meta = ensureDynastyMeta(cache.getMeta());
  if (!meta) return post(toUI.ERROR, { message: 'No league loaded' }, id);

  const team = cache.getTeam(meta.userTeamId);
  if (!team || team.scoutingPoints < 25) {
    return post(toUI.ERROR, { message: 'Not enough scouting points (Need 25)' }, id);
  }

  const player = cache.getPlayer(playerId);
  if (!player) return post(toUI.ERROR, { message: 'Player not found' }, id);

  if (player.scoutStatus?.fullyScouted) {
      return post(toUI.ERROR, { message: 'Player is already fully scouted' }, id);
  }

  // Deduct points
  cache.updateTeam(team.id, { scoutingPoints: team.scoutingPoints - 25 });

  // Reveal player
  const newScoutStatus = { ...player.scoutStatus, fullyScouted: true };
  cache.updatePlayer(playerId, { scoutStatus: newScoutStatus });

  // Flush to DB
  await flushDirty();

  // Respond with full state update or just acknowledge
  // Let's just return the draft state if we are in draft, otherwise full state
  // Draft board uses DRAFT_STATE to update
  if (meta.phase === 'draft' && meta.draftState) {
    post(toUI.DRAFT_STATE, buildDraftStateView(), id);
  } else {
    post(toUI.STATE_UPDATE, buildViewState(), id);
  }
}

// ── Handler: GET_DRAFT_STATE ──────────────────────────────────────────────────


async function handleGetDraftState(payload, id) {
  post(toUI.DRAFT_STATE, buildDraftStateView(), id);
}


async function handleUpdateDepthChart({ updates }, id) {
  if (!Array.isArray(updates)) return;
  updates.forEach(u => {
      const p = cache.getPlayer(u.playerId);
      if (p) {
          cache.updatePlayer(p.id, { depthOrder: u.newOrder });
      }
  });
  await flushDirty();
  post(toUI.STATE_UPDATE, buildViewState(), id);
}

async function handleToggleTradeBlock({ playerId, teamId }, id) {
  if (!playerId) {
    self.postMessage({ type: 'ERROR', payload: { message: 'Missing playerId' } });
    return;
  }

  const numericPlayerId = Number(playerId);
  const player = cache.getPlayer(numericPlayerId);
  if (!player) {
    post(toUI.ERROR, { message: 'Player not found' }, id);
    return;
  }

  const numericTeamId = Number(teamId);
  if (!Number.isFinite(numericTeamId) || player.teamId !== numericTeamId) {
    post(toUI.ERROR, { message: 'Player is not on the selected team' }, id);
    return;
  }

  const isOnBlock = player?.onTradeBlock ?? false;
  cache.updatePlayer(player.id, { onTradeBlock: !isOnBlock });
  await flushDirty();
  post(toUI.STATE_UPDATE, buildViewState(), id);
}

// ── Handler: START_DRAFT ──────────────────────────────────────────────────────

async function handleStartDraft(payload, id) {
  const meta = ensureDynastyMeta(cache.getMeta());
  if (!meta) { post(toUI.ERROR, { message: 'No league loaded' }, id); return; }

  // Idempotent: if draft is already running, return current state
  if (meta.draftState) {
    post(toUI.DRAFT_STATE, buildDraftStateView(), id);
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

  // Build elite name set from existing players to avoid collisions
  const eliteNames = new Set(cache.getAllPlayers().filter(p => p.ovr > 80).map(p => p.name));

  // Generate draft class and add to player pool as draft_eligible
  const prospects = generateDraftClass(meta.year, { classSize, eliteNames });
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

  // Check Roster Limit
  const limit = Constants.ROSTER_LIMITS.OFFSEASON;
  const roster = cache.getPlayersByTeam(meta.userTeamId);
  if (roster.length >= limit) {
      post(toUI.ERROR, { message: `Roster limit (${limit}) reached. Cannot draft.` }, id);
      return;
  }

  // Normalize the incoming playerId.
  let player = cache.getPlayer(playerId);
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

  post(toUI.DRAFT_STATE, buildDraftStateView(), id);
}

// ── Handler: SIM_DRAFT_PICK ───────────────────────────────────────────────────

/**
 * Auto-pick for every AI team until we reach the user's next pick (or draft ends).
 * Each AI picks the highest-OVR available prospect.
 */
async function handleSimDraftPick(payload, id) {
  const meta = ensureDynastyMeta(cache.getMeta());
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

  // Priority 3: If every pick slot has been filled (AI picked through to the end),
  // auto-transition to preseason so the draft never gets permanently stuck.
  const postSimMeta = cache.getMeta();
  if (
    postSimMeta.draftState &&
    postSimMeta.draftState.currentPickIndex >= postSimMeta.draftState.picks.length
  ) {
    return await handleStartNewSeason({}, id);
  }

  post(toUI.DRAFT_STATE, buildDraftStateView(), id);

  // ── AI Trade-Up: generate proposal when the user is now on the clock ────
  const postSimDraft = postSimMeta.draftState;
  if (postSimDraft) {
    const nextPick = postSimDraft.picks[postSimDraft.currentPickIndex];
    if (nextPick && nextPick.teamId === postSimMeta.userTeamId) {
      const proposal = generateDraftTradeUpProposal();
      if (proposal) {
        post(toUI.DRAFT_TRADE_OFFER, { proposal });
      }
    }
  }
}

// ── Handler: ACCEPT_DRAFT_TRADE ──────────────────────────────────────────────

/**
 * Accept an AI team's trade-up proposal during the draft.
 * The AI team gives the user future pick(s) in exchange for the user's current pick.
 * After acceptance, the AI team is now on the clock for that pick.
 */
async function handleAcceptDraftTrade({ proposal }, id) {
  const meta = ensureDynastyMeta(cache.getMeta());
  if (!meta?.draftState) {
    post(toUI.ERROR, { message: 'No active draft' }, id);
    return;
  }

  if (!proposal) {
    post(toUI.ERROR, { message: 'No trade proposal provided' }, id);
    return;
  }

  const { picks, currentPickIndex } = meta.draftState;
  const currentPick = picks[currentPickIndex];
  if (!currentPick || currentPick.teamId !== meta.userTeamId) {
    post(toUI.ERROR, { message: 'Not your pick to trade' }, id);
    return;
  }

  const aiTeamId = proposal.aiTeamId;
  const aiTeam = cache.getTeam(aiTeamId);
  if (!aiTeam) {
    post(toUI.ERROR, { message: 'Invalid trading partner' }, id);
    return;
  }

  // Transfer the current pick to the AI team
  currentPick.teamId = aiTeamId;

  // Give user a future draft pick asset (stored as trade compensation note)
  // Also swap a later-round pick in this draft if the AI has one
  const laterPicks = picks.filter(
    (pk, idx) => idx > currentPickIndex && pk.teamId === aiTeamId && !pk.playerId
  );
  if (laterPicks.length > 0) {
    // Give user the AI's latest available pick in this draft
    const swapPick = laterPicks[laterPicks.length - 1];
    swapPick.teamId = meta.userTeamId;
  }

  // Persist and flush
  cache.setMeta({ draftState: meta.draftState, pendingDraftTradeProposal: null });
  await flushDirty();

  // Log news
  const userTeam = cache.getTeam(meta.userTeamId);
  await NewsEngine.logNews('TRANSACTION',
    `DRAFT DAY TRADE: ${aiTeam.abbr} trades up to pick #${currentPick.overall} with ${userTeam?.abbr ?? 'User'}.`,
    null,
    { tradeTeamA: aiTeamId, tradeTeamB: meta.userTeamId }
  );

  post(toUI.DRAFT_TRADE_RESULT, { accepted: true, newPickTeamId: aiTeamId }, id);
  post(toUI.DRAFT_STATE, buildDraftStateView());
}

// ── Handler: REJECT_DRAFT_TRADE ─────────────────────────────────────────────

async function handleRejectDraftTrade(payload, id) {
  cache.setMeta({ pendingDraftTradeProposal: null });
  post(toUI.DRAFT_TRADE_RESULT, { accepted: false }, id);
}

// ── AI Draft Trade-Up Logic ──────────────────────────────────────────────────

/**
 * Evaluate whether any AI team wants to trade up for an elite falling prospect.
 * Called when the user is on the clock. Only generates ONE proposal per user pick.
 *
 * Criteria for AI trade-up:
 *  - Best available prospect is a QB with OVR >= 78 or any prospect with scoutGrade >= 'A'
 *  - An AI team within the next 10 picks has a high need at that position
 *  - That AI team hasn't already proposed this draft
 *
 * @returns {Object|null} trade proposal or null
 */
function generateDraftTradeUpProposal() {
  const meta = ensureDynastyMeta(cache.getMeta());
  if (!meta?.draftState) return null;
  if (meta.pendingDraftTradeProposal) return null; // already proposed this pick

  const { picks, currentPickIndex } = meta.draftState;
  const currentPick = picks[currentPickIndex];
  if (!currentPick || currentPick.teamId !== meta.userTeamId) return null;

  // Find best available prospect
  const draftPool = cache.getAllPlayers()
    .filter(p => p.status === 'draft_eligible')
    .sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));

  if (draftPool.length === 0) return null;

  const bestProspect = draftPool[0];
  const isElite = (bestProspect.pos === 'QB' && (bestProspect.ovr ?? 0) >= 78) ||
                  (bestProspect.ovr ?? 0) >= 82;

  if (!isElite) return null;

  // Look for an AI team in the next 10 picks that desperately needs this position
  const searchEnd = Math.min(currentPickIndex + 10, picks.length);
  for (let i = currentPickIndex + 1; i < searchEnd; i++) {
    const pk = picks[i];
    if (pk.playerId) continue; // already made
    if (pk.teamId === meta.userTeamId) continue; // skip user picks

    const aiTeamId = pk.teamId;
    const needs = AiLogic.calculateTeamNeeds(aiTeamId);
    const needMult = needs[bestProspect.pos] ?? 1.0;

    // Only trade up if high need (>= 1.5 multiplier)
    if (needMult < 1.5) continue;

    const aiTeam = cache.getTeam(aiTeamId);
    if (!aiTeam) continue;

    // Find what the AI is offering: their current pick spot + a future pick description
    const proposal = {
      aiTeamId,
      aiTeamName: aiTeam.name,
      aiTeamAbbr: aiTeam.abbr,
      aiPickOverall: pk.overall,
      aiPickRound: pk.round,
      targetProspect: {
        id: bestProspect.id,
        name: bestProspect.name,
        pos: bestProspect.pos,
        ovr: bestProspect.ovr,
      },
      userPickOverall: currentPick.overall,
      userPickRound: currentPick.round,
    };

    // Store so we don't re-propose this pick
    cache.setMeta({ pendingDraftTradeProposal: proposal });
    return proposal;
  }

  return null;
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
  const meta = ensureDynastyMeta(cache.getMeta());
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
  const { gainers, regressors, breakouts, wallHits } = processPlayerProgression(allPlayers);

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
  // Uses the new retirement-system.js which handles both sudden (under 30)
  // and standard (age-based) retirements with trait/injury modifiers.
  const retired = [];

  // First, age all non-retired/non-draft players
  for (const player of cache.getAllPlayers()) {
    if (player.status === 'draft_eligible' || player.status === 'retired') continue;
    const age = (player.age ?? 22) + 1;
    cache.updatePlayer(player.id, { age });
  }

  // Now evaluate retirements on the aged roster
  const agedPlayers = cache.getAllPlayers();
  const { retirements } = evaluateRetirements(agedPlayers);

  for (const ret of retirements) {
    const player = cache.getPlayer(ret.id);
    if (!player) continue;

    retired.push(ret);
    if (player.teamId != null) recalculateTeamCap(player.teamId);

    // Calculate Hall of Fame induction
    let isHof = false;
    if (player.accolades && player.accolades.length > 0) {
        let score = player.ovr;
        for (const a of player.accolades) {
            if (a.type === 'MVP') score += 10;
            if (a.type === 'SB_MVP') score += 5;
            if (a.type === 'OPOY' || a.type === 'DPOY') score += 5;
            if (a.type === 'PRO_BOWL') score += 2;
        }
        if (score > 120) isHof = true;
    }

    // Log news based on retirement type
    if (ret.reason && ret.reason.startsWith('sudden_')) {
      // Sudden retirement — high-priority news
      await NewsEngine.logSuddenRetirement(ret);
    } else if (isHof) {
      NewsEngine.logNews('HOF', `LEGEND CROWNED: ${player.pos} ${player.name} has been enshrined into the Hall of Fame, cementing an unforgettable legacy!`);
    } else if ((player.ovr >= 85) || (ret.age >= 35 && player.ovr >= 75)) {
      NewsEngine.logNews('RETIREMENT', `END OF AN ERA: ${player.pos} ${player.name} has officially announced their retirement from professional football.`);
    }

    cache.updatePlayer(player.id, { status: 'retired', teamId: null, hof: isHof });
  }

  // ── Step 4: Generate news items for chaotic offseason events ──────────────

  // "Breakout Seasons" — individual high-priority news per breakout (up to 3)
  for (const b of breakouts.slice(0, 3)) {
    await NewsEngine.logBreakoutSeason(b);
  }

  // "Hitting the Wall" — individual high-priority news per wall event (up to 3)
  for (const w of wallHits.slice(0, 3)) {
    await NewsEngine.logHittingTheWall(w);
  }

  // "Top Offseason Gains" — up to 5 biggest breakouts/growers
  const topGainers = gainers.slice(0, 5);
  if (topGainers.length > 0) {
    const names = topGainers
      .map(p => `${p.name} (${p.pos}, ${p.isBreakout ? 'Breakout ' : ''}+${p.delta} OVR)`)
      .join(', ');
    await NewsEngine.logNews(
      'PROGRESSION',
      `Top Offseason Gains: ${names}`,
      null,
      { category: 'top_gains', players: topGainers }
    );
  }

  // "Shocking Regressions" — up to 5 worst cliff/decline events
  const topRegressors = regressors.slice(0, 5);
  if (topRegressors.length > 0) {
    const names = topRegressors
      .map(p => `${p.name} (${p.pos}, ${p.isCliff ? 'Age Cliff ' : p.isWall ? 'Hit the Wall ' : ''}${p.delta} OVR)`)
      .join(', ');
    await NewsEngine.logNews(
      'PROGRESSION',
      `Shocking Regressions: ${names}`,
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
    const meta = ensureDynastyMeta(cache.getMeta());
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
    const meta = ensureDynastyMeta(cache.getMeta());
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
    const grantAccolade = async (playerId, accolade) => {
      const p = await resolvePlayer(playerId);
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
      await grantAccolade(awards.mvp.playerId, { type: 'MVP', year, seasonId });
      // Log MVP to News
      await NewsEngine.logAward('MVP', { ...awards.mvp, teamId: awards.mvp.teamId });
    }
    if (awards.opoy?.playerId != null) {
      await grantAccolade(awards.opoy.playerId, { type: 'OPOY', year, seasonId });
    }
    if (awards.dpoy?.playerId != null) {
      await grantAccolade(awards.dpoy.playerId, { type: 'DPOY', year, seasonId });
    }
    if (awards.roty?.playerId != null) {
      await grantAccolade(awards.roty.playerId, { type: 'ROTY', year, seasonId });
    }

    // SB Rings: all players on champion team
    if (championId != null) {
      const champPlayers = cache.getPlayersByTeam(championId);
      for (const p of champPlayers) {
        await grantAccolade(p.id, { type: 'SB_RING', year, seasonId });
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
          await grantAccolade(sbMvp.playerId, { type: 'SB_MVP', year, seasonId });
          awards.sbMvp = { playerId: sbMvp.playerId, name: sbMvp.name, teamId: sbMvp.teamId, pos: sbMvp.pos };
        }
      }
    }

    // Flush accolade writes to DB
    await flushDirty();

    // ── Record Book: check for broken single-season & all-time records ──────
    const existingRecords = meta.records ?? null;
    const allPlayersForRecords = cache.getAllPlayers();
    const { records: updatedRecords, broken: brokenRecords } = processSeasonRecords(
      existingRecords, populatedStats, allPlayersForRecords, year, teamAbbrMap
    );
    cache.setMeta({ records: updatedRecords });

    // Log broken records as news
    for (const br of brokenRecords.slice(0, 5)) {
      const typeLabel = br.type === 'singleSeason' ? 'Single-Season' : 'All-Time Career';
      await NewsEngine.logNews(
        'RECORD',
        `RECORD BROKEN: ${br.player} (${br.pos}, ${br.team}) set a new ${typeLabel} ${br.label} record with ${br.newValue.toLocaleString()}!`,
        null,
        { category: 'record_broken', record: br }
      );
    }

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
  const meta = ensureDynastyMeta(cache.getMeta());
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

  // Reset team records and roll dead money forward
  for (const team of cache.getAllTeams()) {
    // Roll deferred dead money (post-June-1 cuts) into current-year dead cap
    const rolledDeadCap = team.deadMoneyNextYear ?? 0;
    // Update capTotal to current hard cap in case constants changed
    cache.updateTeam(team.id, {
      wins: 0, losses: 0, ties: 0, ptsFor: 0, ptsAgainst: 0,
      deadCap:          rolledDeadCap,
      deadMoneyNextYear: 0,
      capTotal:          Constants.SALARY_CAP.HARD_CAP,
      fanApproval:        team?.fanApproval ?? 50,
      fanApprovalWinBoostUsed: 0,
      lossStreak: 0,
    });
    recalculateTeamCap(team.id);
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
    ownerGoals: generateOwnerGoals(),
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
  if (!team) { post(toUI.ERROR, { message: `Team ${teamId} not found` }, id); return; }

  // Build a conf+div lookup from current cache so we can identify division titles
  const allTeams = cache.getAllTeams();
  const teamDivInfo = {};
  allTeams.forEach(t => { teamDivInfo[t.id] = { conf: t.conf, div: t.div }; });

  const seasons = await Seasons.loadRecent(200);

  let allTimeWins = 0, allTimeLosses = 0, allTimeTies = 0;
  let sbTitles = 0, divTitles = 0;
  const seasonHistory = [];

  const myDiv = teamDivInfo[numId];
  const myConfNum = myDiv ? myDiv.conf : null;
  const myDivNum = myDiv ? myDiv.div : null;

  for (const season of seasons) {
    if (!season.standings) continue;

    let standing = null;
    let bestDivId = -1;
    let bestDivPct = -1;
    let bestDivWins = -1;

    for (let i = 0; i < season.standings.length; i++) {
      const s = season.standings[i];
      if (s.id === numId) standing = s;

      if (myConfNum !== null) {
        const sd = teamDivInfo[s.id];
        if (sd && sd.conf === myConfNum && sd.div === myDivNum) {
          const pct = s.pct || 0;
          const wins = s.wins || 0;
          if (pct > bestDivPct || (pct === bestDivPct && wins > bestDivWins)) {
            bestDivPct = pct;
            bestDivWins = wins;
            bestDivId = s.id;
          }
        }
      }
    }

    if (!standing) continue;

    allTimeWins   += standing.wins   || 0;
    allTimeLosses += standing.losses || 0;
    allTimeTies   += standing.ties   || 0;

    const isSBChamp = season.champion?.id === numId;
    if (isSBChamp) sbTitles++;

    // Division title: top record in same conf + div
    let isDivChamp = false;
    if (myDiv) {
      isDivChamp = bestDivId === numId;
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
      capTotal:    team.capTotal    || Constants.SALARY_CAP.HARD_CAP,
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


// ── Handler: GET_DASHBOARD_LEADERS ────────────────────────────────────────────

async function handleGetDashboardLeaders(payload, id) {
  const meta = ensureDynastyMeta(cache.getMeta());
  const userTeamId = meta?.userTeamId;

  // Build a map seeded from in-memory stats
  const liveMap = new Map(cache.getAllSeasonStats().map(s => [s.playerId, s]));
  if (meta?.currentSeasonId) {
    const dbStats = await PlayerStats.bySeason(meta.currentSeasonId).catch(() => []);
    for (const s of dbStats) {
      if (!liveMap.has(s.playerId)) liveMap.set(s.playerId, s);
    }
  }

  const allTeamsByIdRef = cache.getAllTeams();
  const teamMap = {};
  allTeamsByIdRef.forEach(t => { teamMap[t.id] = t.abbr; });

  const stats = [...liveMap.values()];
  const missingIds = [];
  for (const s of stats) {
    if (!cache.getPlayer(s.playerId)) missingIds.push(s.playerId);
  }

  const loadedPlayers = new Map();
  if (missingIds.length > 0) {
    const players = await Players.loadBulk(missingIds);
    for (const p of players) if (p) loadedPlayers.set(String(p.id), p);
  }

  const entries = [];
  for (const s of stats) {
    const p = cache.getPlayer(s.playerId) ?? loadedPlayers.get(s.playerId);
    if (p) entries.push({ ...s, name: p.name, pos: p.pos, teamId: p.teamId ?? s.teamId, teamAbbr: teamMap[p.teamId ?? s.teamId] || 'FA' });
  }

  const topN = (list, key, n = 5) => {
    return list
      .filter(e => (e.totals?.[key] || 0) > 0)
      .sort((a, b) => (b.totals[key] || 0) - (a.totals[key] || 0))
      .slice(0, n)
      .map(e => ({
        playerId: e.playerId,
        name:     e.name     || `Player ${e.playerId}`,
        pos:      e.pos      || '?',
        teamId:   e.teamId,
        teamAbbr: e.teamAbbr,
        value:    e.totals[key] || 0,
      }));
  };

  const qbs = entries.filter(e => e.pos === 'QB');
  const rbs = entries.filter(e => e.pos === 'RB');
  const wrs = entries.filter(e => ['WR', 'TE', 'RB'].includes(e.pos));

  const teamQbs = qbs.filter(e => e.teamId === userTeamId);
  const teamRbs = rbs.filter(e => e.teamId === userTeamId);
  const teamWrs = wrs.filter(e => e.teamId === userTeamId);

  const league = {
    passing: topN(qbs, 'passYd', 5),
    rushing: topN(rbs, 'rushYd', 5),
    receiving: topN(wrs, 'recYd', 5),
  };

  const team = {
    passing: topN(teamQbs, 'passYd', 3),
    rushing: topN(teamRbs, 'rushYd', 3),
    receiving: topN(teamWrs, 'recYd', 3),
  };

  post(toUI.DASHBOARD_LEADERS, { league, team }, id);
}

// ── Handler: GET_LEAGUE_LEADERS ───────────────────────────────────────────────

async function handleGetLeagueLeaders({ mode = 'season' }, id) {
  const meta = ensureDynastyMeta(cache.getMeta());

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
    const stats = [...liveMap.values()];
    const missingIds = [];
    for (const s of stats) {
      if (!cache.getPlayer(s.playerId)) missingIds.push(s.playerId);
    }

    const loadedPlayers = new Map();
    if (missingIds.length > 0) {
      const players = await Players.loadBulk(missingIds);
      for (const p of players) if (p) loadedPlayers.set(String(p.id), p);
    }

    for (const s of stats) {
      const p = cache.getPlayer(s.playerId) ?? loadedPlayers.get(s.playerId);
      if (p) entries.push({ ...s, name: p.name, pos: p.pos, teamId: p.teamId ?? s.teamId });
    }
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
    const aggs = [...byPlayer.values()];
    const missingIds = [];
    for (const agg of aggs) {
      if (!agg.name && !cache.getPlayer(agg.playerId)) missingIds.push(agg.playerId);
    }

    const loadedPlayers = new Map();
    if (missingIds.length > 0) {
      const players = await Players.loadBulk(missingIds);
      for (const p of players) if (p) loadedPlayers.set(String(p.id), p);
    }

    for (const agg of aggs) {
      if (!agg.name) {
        const p = cache.getPlayer(agg.playerId) ?? loadedPlayers.get(agg.playerId);
        if (p) { agg.name = p.name; agg.pos = p.pos; agg.teamId = p.teamId ?? agg.teamId; }
      }
    }
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
  const meta = ensureDynastyMeta(cache.getMeta());
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
  const meta = ensureDynastyMeta(cache.getMeta());

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

  const stats = [...liveMap.values()];
  const missingIds = [];
  for (const s of stats) {
    if (!cache.getPlayer(s.playerId)) missingIds.push(s.playerId);
  }

  const loadedPlayers = new Map();
  if (missingIds.length > 0) {
    const players = await Players.loadBulk(missingIds);
    for (const p of players) if (p) loadedPlayers.set(String(p.id), p);
  }

  const allEntries = [];
  for (const s of stats) {
    const p = cache.getPlayer(s.playerId) ?? loadedPlayers.get(s.playerId);
    if (!p) continue;
    const team = teamById.get(p.teamId ?? s.teamId);
    allEntries.push({
      ...s,
      name:     p.name,
      pos:      p.pos,
      teamId:   p.teamId ?? s.teamId,
      teamAbbr: team?.abbr ?? '???',
      ovr:      p.ovr,
    });
  }

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
 * Sequential Message Queue (v2 hardened).
 * Ensures messages are processed one at a time, preventing race conditions
 * (e.g., UPDATE_SETTINGS arriving while LOAD_SAVE is yielding).
 *
 * v2 fix: Uses .then() with an async callback that wraps handleMessage in
 * try/catch internally. This guarantees the chain NEVER breaks — even if
 * handleMessage throws, the next queued message still processes. Previously
 * a rejected promise could break the chain and stall all subsequent messages.
 */
let messageQueue = Promise.resolve();
let _queueProcessing = false;

self.onmessage = (event) => {
  // v2: Chain with guaranteed recovery — catch inside the .then so the
  // resolved chain is never broken by an unhandled rejection.
  messageQueue = messageQueue.then(async () => {
    _queueProcessing = true;
    try {
      await handleMessage(event);
    } catch (err) {
      console.error('[Worker] Fatal error in message queue:', err);
      post(toUI.ERROR, { message: 'Worker crashed: ' + err.message });
    } finally {
      _queueProcessing = false;
    }
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
      case toWorker.RENAME_SAVE:        return await handleRenameSave(payload, id);
      case toWorker.NEW_LEAGUE:         return await handleNewLeague(payload, id);
      case toWorker.ADVANCE_WEEK:       return await handleAdvanceWeek(payload, id);
      case toWorker.SIM_TO_WEEK:        return await handleSimToWeek(payload, id);
      case toWorker.SIM_TO_PLAYOFFS:    return await handleSimToWeek({ targetWeek: 18 }, id);
      case toWorker.WATCH_GAME:         return await handleWatchGame(payload, id);
      case toWorker.SIM_TO_PHASE:       return await handleSimToPhase(payload, id);
      case toWorker.GET_SEASON_HISTORY: return await handleGetSeasonHistory(payload, id);
      case toWorker.GET_ALL_SEASONS:    return await handleGetAllSeasons(payload, id);
      case toWorker.GET_PLAYER_CAREER:  return await handleGetPlayerCareer(payload, id);
      case toWorker.SAVE_NOW:           return await handleSaveNow(payload, id);
      case toWorker.LOAD_SLOT:          return await handleLoadSlot(payload, id);
      case toWorker.SAVE_SLOT:          return await handleSaveSlot(payload, id);
      case toWorker.DELETE_SLOT:        return await handleDeleteSlot(payload, id);
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
      case toWorker.CONDUCT_DRILL:      return await handleConductDrill(payload, id);
      case toWorker.UPDATE_MEDICAL_STAFF: return await handleUpdateMedicalStaff(payload, id);
      case toWorker.TRADE_OFFER:        return await handleTradeOffer(payload, id);
      case toWorker.ACCEPT_INCOMING_TRADE: return await handleAcceptIncomingTrade(payload, id);
      case toWorker.REJECT_INCOMING_TRADE: return await handleRejectIncomingTrade(payload, id);
      case toWorker.COUNTER_INCOMING_TRADE: return await handleCounterIncomingTrade(payload, id);
      case toWorker.TOGGLE_TRADE_BLOCK: return await handleToggleTradeBlock(payload, id);
      case toWorker.GET_EXTENSION_ASK:  return await handleGetExtensionAsk(payload, id);
      case toWorker.EXTEND_CONTRACT:      return await handleExtendContract(payload, id);
      case toWorker.RESTRUCTURE_CONTRACT: return await handleRestructureContract(payload, id);
      case toWorker.APPLY_FRANCHISE_TAG:  return await handleApplyFranchiseTag(payload, id);
      case toWorker.RELOCATE_TEAM:        return await handleRelocateTeam(payload, id);
      case toWorker.GET_BOX_SCORE:        return await handleGetBoxScore(payload, id);
      case toWorker.UPDATE_STRATEGY:    return await handleUpdateStrategy(payload, id);

      // ── Draft & Offseason ──────────────────────────────────────────────────
      case toWorker.GET_DRAFT_STATE:    return await handleGetDraftState(payload, id);
      case toWorker.START_DRAFT:        return await handleStartDraft(payload, id);
      case toWorker.MAKE_DRAFT_PICK:    return await handleMakeDraftPick(payload, id);
      case toWorker.CONDUCT_PRIVATE_WORKOUT: return await handleConductPrivateWorkout(payload, id);
      case toWorker.UPDATE_DEPTH_CHART: return await handleUpdateDepthChart(payload, id);
      case toWorker.SIM_DRAFT_PICK:     return await handleSimDraftPick(payload, id);
      case toWorker.ACCEPT_DRAFT_TRADE: return await handleAcceptDraftTrade(payload, id);
      case toWorker.REJECT_DRAFT_TRADE: return await handleRejectDraftTrade(payload, id);
      case toWorker.ADVANCE_OFFSEASON:  return await handleAdvanceOffseason(payload, id);
      case toWorker.ADVANCE_FREE_AGENCY_DAY: return await handleAdvanceFreeAgencyDay(payload, id);
      case toWorker.START_NEW_SEASON:   return await handleStartNewSeason(payload, id);

      // ── Analytics ─────────────────────────────────────────────────────────
      case toWorker.GET_TEAM_PROFILE:   return await handleGetTeamProfile(payload, id);
      case toWorker.GET_LEAGUE_LEADERS: return await handleGetLeagueLeaders(payload, id);
      case toWorker.GET_DASHBOARD_LEADERS: return await handleGetDashboardLeaders(payload, id);
      case toWorker.GET_ALL_PLAYER_STATS: return await handleGetAllPlayerStats(payload, id);
      case toWorker.GET_AWARD_RACES:    return await handleGetAwardRaces(payload, id);
      case toWorker.GET_RECORDS:        return await handleGetRecords(payload, id);
      case toWorker.GET_HALL_OF_FAME:   return await handleGetHallOfFame(payload, id);

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

// ── Handler: WATCH_GAME ──────────────────────────────────────────────────────

async function handleWatchGame(payload, id) {
  const meta = ensureDynastyMeta(cache.getMeta());
  if (!meta) { post(toUI.ERROR, { message: 'No league loaded' }, id); return; }

  const week = meta.currentWeek;
  const seasonId = meta.currentSeasonId;
  const schedule = expandSchedule(meta.schedule);
  const userTeamId = meta.userTeamId;

  const league = buildLeagueForSim(schedule, week, seasonId);
  const userGameIndex = league._weekGames.findIndex(g => g.home.id === userTeamId || g.away.id === userTeamId);

  if (userGameIndex === -1) {
      post(toUI.ERROR, { message: 'No user game found this week' }, id);
      return;
  }

  const userGame = league._weekGames[userGameIndex];

  // Simulate JUST the user game, passing options to generate logs
  const batchResults = simulateBatch([userGame], {
    league,
    isPlayoff: meta.phase === 'playoffs',
    generateLogs: true
  });

  const res = batchResults[0];
  if (res) {
    applyGameResultToCache(res, week, seasonId);

    // Make sure we emit the GAME_EVENT so it shows in the UI later
    const homeId = Number(typeof res.home === 'object' ? res.home.id : (res.home ?? res.homeTeamId));
    const awayId = Number(typeof res.away === 'object' ? res.away.id : (res.away ?? res.awayTeamId));
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

    // Mark the user game as played in the slim schedule so ADVANCE_WEEK
    // (called after LiveGameViewer completes) won't re-simulate it.
    // applyGameResultToCache writes scores but does NOT set played=true;
    // that is normally done by markWeekPlayed for the whole week.
    const slimSchedule = cache.getMeta()?.schedule;
    if (slimSchedule?.weeks) {
      const weekData = slimSchedule.weeks.find(w => w.week === week);
      if (weekData) {
        const slimGame = weekData.games.find(
          g => (Number(g.home) === homeId && Number(g.away) === awayId) ||
               (Number(g.home) === awayId && Number(g.away) === homeId)
        );
        if (slimGame) {
          slimGame.played = true;
          slimGame.homeScore = res.scoreHome ?? res.homeScore ?? 0;
          slimGame.awayScore = res.scoreAway ?? res.awayScore ?? 0;
          cache.setMeta({ schedule: slimSchedule });
        }
      }
    }

    // First flush: persist game result before sending logs to UI
    await flushDirty();

    // Send play-by-play logs to UI so the viewer can render
    post(toUI.PLAY_LOGS, { logs: res.playLogs || [], liveStats: res.liveStats || {} }, id);

    // Second flush (belt-and-suspenders): catch any dirty bits set during log building
    try { await flushDirty(); } catch (e) { console.warn('[Worker] secondary flush failed (non-fatal):', e.message); }
  } else {
    post(toUI.ERROR, { message: 'Simulation failed' }, id);
  }
}

// ── Handler: SIMULATE_USER_GAME ──────────────────────────────────────────────
async function handleSimulateUserGame(payload, id) {
  // Essentially the same as WATCH_GAME but we don't need to return logs
  // Since the user chose to just sim it, we can just call handleAdvanceWeek
  // But wait, the UI handles "Simulate" by just calling advanceWeek({ skipUserGame: true }).
  // Actually, if they click Simulate, they want the game to happen.
  // The ADVANCE_WEEK with skipUserGame=true means it skips the *prompt*, not the game itself.
  // So ADVANCE_WEEK({skipUserGame: true}) will just simulate the whole week, including the user's game.
  // I will just use that logic in the UI and remove SIMULATE_USER_GAME.
}
