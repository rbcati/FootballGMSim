/**
 * dynastySoakHarness.js — Long-Dynasty Stability Soak V2 harness.
 *
 * A pure, deterministic, fast in-memory harness that advances a seeded league
 * through many seasons while exercising the long-dynasty *meta* stack using the
 * **real engine functions** the worker uses on its season-rollover path:
 *
 *   - front-office personas   (frontOfficePersonaEngine)
 *   - owner expectations       (ownerPressureEngine)
 *   - franchise legacy / ROH   (legacyEngine)
 *   - retired numbers          (teamIdentityEngine)
 *   - league history ledger    (historyEngine)
 *   - prestige honors          (prestigeEngine)
 *   - league media desk         (mediaNarrativeEngine — derived view-state only)
 *   - league pulse / headlines  (leaguePulse caps)
 *
 * It deliberately does NOT run the full game simulation (offense/defense
 * play-by-play). The real multi-season worker sim already has coverage via
 * `npm run audit:dynasty`. This harness isolates the meta-system integration so
 * 10/25/50-season soaks stay fast and non-flaky while still proving the combined
 * meta stack is stable, deterministic, bounded, non-mutating and replay-safe.
 *
 * Rules mirrored from src/worker/worker.js handleStartNewSeason():
 *   - persona drift evaluated once per completed season (worker ~L13485)
 *   - owner pressure evaluated once per completed season, guarded by
 *     meta.ownerPressureEvaluatedForSeason === completedSeasonId (worker ~L13517)
 *   - weeklyHeadlines capped to last 40 (worker ~L1194)
 *   - leaguePulse capped via mergeLeaguePulseItems / last 100 (worker ~L1195)
 *   - mediaStories built fresh from view-state, never persisted (worker ~L1283)
 *
 * Harness modeling note (documented, NOT a behavior change to any engine):
 *   Once a user franchise is terminated (userFranchiseTerminated === true) it is
 *   a terminal game-over state and is not re-evaluated for owner pressure on
 *   subsequent seasons. This keeps the soak bounded and matches the intent of
 *   the job-security engine; no owner-pressure formula is altered.
 *
 * No Math.random, no I/O, no UI/worker imports.
 */

import {
  FRONT_OFFICE_PERSONAS,
  determineInitialPersona,
  maybeDriftPersona,
} from '../core/ai/frontOfficePersonaEngine.js';
import {
  OWNER_MANDATES,
  buildOwnerProfile,
  determineInitialMandate,
  evaluateMandate,
  applyHotSeatDelta,
  shouldFireFrontOffice,
  buildAIFiringOutcome,
} from '../core/meta/ownerPressureEngine.js';
import {
  inductPlayerToRingOfHonor,
} from '../core/history/legacyEngine.js';
import {
  retireJerseyNumber,
  appendChampionshipYear,
} from '../core/history/teamIdentityEngine.js';
import {
  buildLeagueYearSummary,
  appendHistoryLedger,
} from '../core/history/historyEngine.js';
import {
  rankPrestigeCandidates,
  selectAllProTeams,
  selectProBowlTeams,
  buildSeasonHonorsSummary,
} from '../core/awards/prestigeEngine.js';
import {
  buildMediaNarratives,
  MEDIA_STORY_MAX,
} from '../core/news/mediaNarrativeEngine.js';
import {
  mergeLeaguePulseItems,
  MAX_PULSE_ITEMS,
} from '../core/leaguePulse.js';

// ── Constants ───────────────────────────────────────────────────────────────

/** Fixed, documented seed. All soak runs are reproducible from this value. */
export const SOAK_SEED = 0x50ac_2026 >>> 0; // "SOAK 2026"

export const SOAK_DEFAULTS = Object.freeze({
  teamCount: 32,
  startYear: 2025,
  gamesPerSeason: 17,
  weeklyHeadlineCap: 40, // mirrors worker slice(-40)
  leaguePulseCap: 100,   // mirrors worker slice(-100)
});

const ALLOWED_PERSONAS = new Set(Object.values(FRONT_OFFICE_PERSONAS));
const ALLOWED_MANDATES = new Set(Object.values(OWNER_MANDATES));

const ROSTER_TEMPLATE = [
  // pos, count
  ['QB', 1],
  ['RB', 2],
  ['WR', 3],
  ['DL', 3],
  ['OL', 2],
  ['CB', 2],
];

// ── Deterministic PRNG (mulberry32) ───────────────────────────────────────────

/**
 * Deterministic 32-bit PRNG. Same seed → same sequence. No Math.random.
 * @param {number} seed
 * @returns {() => number} fn returning a float in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Combine integers into a stable 32-bit seed (FNV-ish). */
function seedFrom(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    }
  }
  return h >>> 0;
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(v, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

// ── Deterministic player / roster / team generation ────────────────────────────

function buildSeasonStatsForPos(pos, ovr, rng) {
  // Stats scaled by OVR + small jitter so prestige ordering is stable but varied.
  const f = ovr / 99;
  const j = 0.85 + rng() * 0.3;
  switch (pos) {
    case 'QB':
      return { passYd: Math.round(3200 * f * j + 400), passTD: Math.round(28 * f * j), interceptions: Math.round(14 * (1 - f) * j), rushYd: Math.round(120 * f * j) };
    case 'RB':
      return { rushYd: Math.round(1100 * f * j + 150), rushTD: Math.round(9 * f * j), recYd: Math.round(280 * f * j), recTD: Math.round(2 * f * j), receptions: Math.round(40 * f * j) };
    case 'WR':
      return { recYd: Math.round(1150 * f * j + 200), recTD: Math.round(8 * f * j), receptions: Math.round(78 * f * j) };
    case 'DL':
      return { sacks: Math.round(11 * f * j), tackles: Math.round(48 * f * j), interceptions: 0 };
    default:
      return {};
  }
}

function buildPlayer(teamId, slotIndex, pos, year, rng) {
  const ovr = clampInt(58 + rng() * 40, 40, 99);
  const age = clampInt(21 + rng() * 14, 21, 38);
  const jerseyNumber = clampInt(1 + rng() * 98, 1, 99);
  return {
    id: `t${teamId}-p${slotIndex}`,
    name: `Player ${teamId}-${slotIndex}`,
    pos,
    age,
    ovr,
    potential: clampInt(ovr + rng() * 10, 40, 99),
    jerseyNumber,
    teamId,
    contract: { yearsRemaining: clampInt(1 + rng() * 4, 1, 5), baseAnnual: clampInt(1 + rng() * 30, 1, 40) },
    stats: { season: buildSeasonStatsForPos(pos, ovr, rng) },
    careerStats: [],
  };
}

function buildRoster(teamId, year, rng) {
  const roster = [];
  let slot = 0;
  for (const [pos, count] of ROSTER_TEMPLATE) {
    for (let c = 0; c < count; c++) {
      roster.push(buildPlayer(teamId, slot, pos, year, rng));
      slot += 1;
    }
  }
  return roster;
}

function buildTeam(teamId, teamCount, year, rng) {
  const roster = buildRoster(teamId, year, rng);
  const avgOvr = roster.reduce((s, p) => s + p.ovr, 0) / roster.length;
  const capTotal = 255_000_000;
  // Spread cap usage so REDUCE_PAYROLL / CAP_HOARDER signals fire for some teams.
  const capUsed = clampInt(150_000_000 + rng() * 110_000_000, 0, capTotal + 10_000_000);
  return {
    id: teamId,
    name: `Team ${teamId}`,
    abbr: `T${String(teamId).padStart(2, '0')}`,
    conf: teamId < teamCount / 2 ? 0 : 1,
    div: Math.floor(teamId / 4) % 4,
    ovr: Math.round(avgOvr),
    wins: 0,
    losses: 0,
    ties: 0,
    ptsFor: 0,
    ptsAgainst: 0,
    capUsed,
    capTotal,
    roster,
    picks: [],
    owner: null,        // old-save shaped: hydrated lazily on first rollover
    frontOffice: null,  // old-save shaped: hydrated lazily on first rollover
    ringOfHonor: [],
    retiredNumbers: [],
    championshipYears: [],
    allTimeLeaders: { passingYards: null, rushingYards: null, receivingYards: null, sacks: null },
  };
}

/**
 * Build a fresh deterministic soak league + meta.
 * @param {{ seed?: number, teamCount?: number, startYear?: number }} [opts]
 */
export function createSoakLeague(opts = {}) {
  const seed = (opts.seed ?? SOAK_SEED) >>> 0;
  const teamCount = opts.teamCount ?? SOAK_DEFAULTS.teamCount;
  const startYear = opts.startYear ?? SOAK_DEFAULTS.startYear;

  const teams = [];
  for (let i = 0; i < teamCount; i++) {
    const rng = mulberry32(seedFrom(seed, 'team', i));
    teams.push(buildTeam(i, teamCount, startYear, rng));
  }

  const meta = {
    seed,
    year: startYear,
    season: 1,
    currentSeasonId: 's1',
    userTeamId: 0,
    phase: 'regular',
    userFranchiseTerminated: false,
    ownerPressureEvaluatedForSeason: null,
    playoffSeeds: {},
    historyLedger: [],
    weeklyHeadlines: [],
    leaguePulse: [],
    currentSeasonHonors: null,
    newsItems: [],
  };

  return { teams, meta };
}

// ── Season simulation (deterministic, meta-only) ───────────────────────────────

function simulateRecords(state) {
  const { teams, meta } = state;
  for (const team of teams) {
    const rng = mulberry32(seedFrom(meta.seed, 'season', meta.season, 'team', team.id));
    // Win propensity from roster strength + jitter, mapped to a 17-game record.
    const strength = (team.ovr - 55) / 35; // ~0..1.25
    const p = Math.max(0.05, Math.min(0.95, strength * 0.6 + rng() * 0.4));
    let wins = 0;
    for (let g = 0; g < SOAK_DEFAULTS.gamesPerSeason; g++) {
      if (rng() < p) wins += 1;
    }
    team.wins = wins;
    team.losses = SOAK_DEFAULTS.gamesPerSeason - wins;
    team.ties = 0;
    team.ptsFor = 17 * wins + 120;
    team.ptsAgainst = 17 * team.losses + 120;
  }
}

function computePlayoffSeeds(teams) {
  const seeds = {};
  const byConf = new Map();
  for (const t of teams) {
    const key = String(t.conf ?? 0);
    if (!byConf.has(key)) byConf.set(key, []);
    byConf.get(key).push(t);
  }
  for (const [key, list] of byConf) {
    const sorted = [...list].sort((a, b) => (b.wins - a.wins) || (a.id - b.id));
    seeds[key] = sorted.slice(0, 7).map((t) => ({ teamId: t.id }));
  }
  return seeds;
}

function pickChampion(teams, playoffSeeds) {
  const playoffIds = new Set(
    Object.values(playoffSeeds).flatMap((s) => (Array.isArray(s) ? s.map((x) => x.teamId) : [])),
  );
  let champ = null;
  for (const t of teams) {
    if (!playoffIds.has(t.id)) continue;
    if (!champ || t.wins > champ.wins || (t.wins === champ.wins && t.id < champ.id)) champ = t;
  }
  return champ ?? teams[0] ?? null;
}

/**
 * Front-office persona drift step. Mirrors worker handleStartNewSeason persona
 * block: hydrate if missing, else maybeDriftPersona for the completed season.
 */
export function applyPersonaDrift(state) {
  const { teams, meta } = state;
  const playoffIds = new Set(
    Object.values(meta.playoffSeeds ?? {}).flatMap((s) => (Array.isArray(s) ? s.map((x) => x.teamId) : [])),
  );
  for (const team of teams) {
    if (!team.frontOffice?.persona) {
      team.frontOffice = determineInitialPersona(team, { allTeams: teams });
      continue;
    }
    const madePostseason = playoffIds.has(team.id);
    const updated = maybeDriftPersona(team, { madePostseason });
    if (updated !== null) team.frontOffice = updated;
  }
}

/**
 * Owner-pressure rollover step, guarded against double-apply for the same
 * completed season. Mirrors worker handleStartNewSeason owner block exactly,
 * including the ownerPressureEvaluatedForSeason guard.
 *
 * Safe to call repeatedly for the same completed season — the guard makes
 * subsequent calls no-ops (replay-safe).
 *
 * @returns {boolean} true if pressure was applied this call, false if skipped.
 */
export function applyOwnerPressureRollover(state) {
  const { teams, meta } = state;
  const completedSeasonId = meta.currentSeasonId;
  if (!completedSeasonId) return false;
  if (meta.ownerPressureEvaluatedForSeason === completedSeasonId) return false;

  const playoffIds = new Set(
    Object.values(meta.playoffSeeds ?? {}).flatMap((s) => (Array.isArray(s) ? s.map((x) => x.teamId) : [])),
  );

  for (const team of teams) {
    // Terminal game-over: a terminated user franchise is not re-evaluated.
    if (team.id === meta.userTeamId && meta.userFranchiseTerminated) continue;

    if (!team.owner?.mandate) {
      const mandate = determineInitialMandate(team, { allTeams: teams });
      team.owner = buildOwnerProfile(mandate);
    }
    if (!team.owner?.mandate) continue;

    const evaluation = evaluateMandate(team, {
      allTeams: teams,
      playoffTeamIds: playoffIds,
      teamRoster: team.roster,
    });
    const updatedOwner = applyHotSeatDelta(team.owner, evaluation);

    if (shouldFireFrontOffice(updatedOwner)) {
      if (team.id === meta.userTeamId) {
        team.owner = updatedOwner;
        meta.userFranchiseTerminated = true;
      } else {
        const outcome = buildAIFiringOutcome(team, { allTeams: teams });
        team.owner = outcome.newOwnerProfile;
        team.frontOffice = { persona: outcome.newPersona, missedPostseasonStreak: 0 };
      }
    } else {
      team.owner = updatedOwner;
    }
  }

  meta.ownerPressureEvaluatedForSeason = completedSeasonId;
  return true;
}

/** History / legacy / retired-number / ROH bookkeeping for the completed season. */
function applyHistoryAndLegacy(state, champion) {
  const { teams, meta } = state;
  const year = meta.year;

  // History ledger — keyed by year, idempotent re-runs (no duplicates).
  const yearSummary = buildLeagueYearSummary({
    season: year,
    championshipResult: {
      championTeamId: champion?.id ?? null,
      championName: champion?.name ?? 'Unknown',
      runnerUpName: 'Runner Up',
      homeScore: 27,
      awayScore: 20,
    },
    awards: { mvpName: `MVP ${year}`, opoyName: `OPOY ${year}`, dpoyName: `DPOY ${year}` },
  });
  meta.historyLedger = appendHistoryLedger(meta.historyLedger, yearSummary);

  if (!champion) return;
  const champIdx = teams.findIndex((t) => t.id === champion.id);
  if (champIdx < 0) return;
  let team = teams[champIdx];

  // Championship year (deduped by engine).
  team = appendChampionshipYear(team, year);

  // Each title season, the champion enshrines a franchise legend: induct to ROH
  // and retire their number. Engines dedupe by player id / number respectively.
  const legendBase = team.roster[year % team.roster.length];
  if (legendBase) {
    const teamAbbr = team.abbr;
    const legend = {
      id: `${team.abbr}-legend-${year}`,
      name: `Legend ${team.abbr} ${year}`,
      pos: legendBase.pos,
      jerseyNumber: legendBase.jerseyNumber,
      ovr: 88,
      careerStats: [
        { team: teamAbbr, season: year, gamesPlayed: 16, passYds: 4200, rushYds: 0, recYds: 0, sacks: 0 },
        { team: teamAbbr, season: year - 1, gamesPlayed: 16, passYds: 4000, rushYds: 0, recYds: 0, sacks: 0 },
      ],
      accolades: [{ type: 'champion', year }],
    };
    team = inductPlayerToRingOfHonor(team, legend, year);
    team = retireJerseyNumber(team, legend);
  }
  teams[champIdx] = team;
}

/** Prestige honors (currentSeasonHonors) for the completed season. */
function applyPrestigeHonors(state) {
  const { teams, meta } = state;
  const allPlayers = [];
  for (const t of teams) {
    for (const p of t.roster) allPlayers.push({ ...p, teamId: t.id });
  }
  const teamResolver = (teamId) => teams.find((t) => t.id === teamId) ?? null;
  const ranked = rankPrestigeCandidates(allPlayers, teamResolver, meta.year);
  const assignments = [
    ...selectAllProTeams(ranked, meta.year),
    ...selectProBowlTeams(ranked, meta.year),
  ];
  meta.currentSeasonHonors = buildSeasonHonorsSummary(allPlayers, assignments, teamResolver);
}

/** Append capped weekly headlines + league pulse for the completed season. */
function applyNewsCaps(state, champion) {
  const { meta } = state;
  const year = meta.year;

  const headline = {
    id: `hl-${meta.season}`,
    headline: `${champion?.name ?? 'A team'} wins the title in ${year}`,
    week: SOAK_DEFAULTS.gamesPerSeason,
    year,
  };
  meta.weeklyHeadlines = [...(meta.weeklyHeadlines ?? []), headline].slice(-SOAK_DEFAULTS.weeklyHeadlineCap);

  const pulseItems = [
    {
      id: `pulse-champ-${meta.season}`,
      season: meta.season,
      week: SOAK_DEFAULTS.gamesPerSeason,
      type: 'CHAMPIONSHIP',
      relatedTeamId: champion?.id ?? null,
      headline: `${champion?.name ?? 'A team'} are champions`,
      importance: 100,
    },
  ];
  meta.leaguePulse = mergeLeaguePulseItems(meta.leaguePulse ?? [], pulseItems, {
    maxTimelineLength: SOAK_DEFAULTS.leaguePulseCap,
  });
}

/** Roll team records / advance year+season pointers for the next season. */
function rolloverToNextSeason(state) {
  const { teams, meta } = state;
  meta.year += 1;
  meta.season += 1;
  meta.currentSeasonId = `s${meta.season}`;
  for (const team of teams) {
    team.wins = 0;
    team.losses = 0;
    team.ties = 0;
    team.ptsFor = 0;
    team.ptsAgainst = 0;
    team.capTotal = 255_000_000;
  }
}

/**
 * Advance the soak league through exactly one full season + offseason rollover.
 * Order matches the worker: simulate season → persona drift → owner pressure →
 * history/legacy → prestige → news caps → roll to next season.
 *
 * @param {{teams: object[], meta: object}} state - mutated in place
 * @returns {{teams: object[], meta: object}} the same state object
 */
export function advanceSoakSeason(state) {
  simulateRecords(state);
  state.meta.playoffSeeds = computePlayoffSeeds(state.teams);
  const champion = pickChampion(state.teams, state.meta.playoffSeeds);

  applyPersonaDrift(state);
  applyOwnerPressureRollover(state);
  applyHistoryAndLegacy(state, champion);
  applyPrestigeHonors(state);
  applyNewsCaps(state, champion);
  rolloverToNextSeason(state);
  return state;
}

/**
 * Run the soak for N seasons from a fresh league.
 * @param {{ seasons: number, seed?: number, teamCount?: number, onSeason?: Function }} cfg
 * @returns {{ state: object, summaries: object[] }}
 */
export function runSoak(cfg = {}) {
  const seasons = cfg.seasons ?? 10;
  const state = createSoakLeague({ seed: cfg.seed, teamCount: cfg.teamCount });
  const summaries = [];
  for (let s = 0; s < seasons; s++) {
    advanceSoakSeason(state);
    const summary = buildInvariantSummary(state);
    summaries.push(summary);
    if (typeof cfg.onSeason === 'function') cfg.onSeason(summary, state);
  }
  return { state, summaries };
}

// ── Derived view-state (media) — must never mutate or persist ──────────────────

/**
 * Build the media-desk leagueCtx the worker assembles for the full-state view.
 * Returns the *derived* media stories. These are never written back to meta.
 */
export function buildMediaViewState(state) {
  const { teams, meta } = state;
  const standings = teams.map((t) => ({
    id: t.id, name: t.name, abbr: t.abbr, conf: t.conf, div: t.div,
    wins: t.wins, losses: t.losses, ties: t.ties,
  }));
  const leagueCtx = {
    teams,
    standings,
    week: SOAK_DEFAULTS.gamesPerSeason,
    year: meta.year,
    season: meta.year,
    newsItems: Array.isArray(meta.newsItems) ? meta.newsItems : [],
    currentSeasonHonors: meta.currentSeasonHonors ?? null,
    leaguePulse: Array.isArray(meta.leaguePulse) ? meta.leaguePulse.slice(-100) : [],
    userTeamId: meta.userTeamId,
  };
  return buildMediaNarratives(leagueCtx);
}

// ── Invariant summary + assertions ─────────────────────────────────────────────

function countPrestigeHonors(honors) {
  if (!honors || typeof honors !== 'object') return 0;
  let n = 0;
  for (const type of Object.keys(honors)) {
    const byPos = honors[type];
    if (!byPos || typeof byPos !== 'object') continue;
    for (const pos of Object.keys(byPos)) {
      if (Array.isArray(byPos[pos])) n += byPos[pos].length;
    }
  }
  return n;
}

/**
 * Build a compact invariant summary for the current state. Cheap to compare
 * across runs; never snapshots large objects.
 */
export function buildInvariantSummary(state) {
  const { teams, meta } = state;
  const teamIds = new Set(teams.map((t) => t.id));

  let playerCount = 0;
  let ownerProfileCount = 0;
  let invalidOwnerProfiles = 0;
  let invalidPersonaProfiles = 0;
  let retiredNumbersCount = 0;
  let ringOfHonorCount = 0;
  let invalidReferences = 0;
  let maxHotSeat = 0;
  let maxAiHotSeat = 0;

  const retiredKeySeen = new Set();
  let duplicateRetiredNumberKeys = 0;

  for (const team of teams) {
    playerCount += Array.isArray(team.roster) ? team.roster.length : 0;

    // Owner profile validity
    const owner = team.owner;
    if (owner?.mandate) {
      ownerProfileCount += 1;
      const hot = Number(owner.hotSeatRating);
      if (!ALLOWED_MANDATES.has(owner.mandate) || !Number.isFinite(hot)) invalidOwnerProfiles += 1;
      if (Number.isFinite(hot)) {
        maxHotSeat = Math.max(maxHotSeat, hot);
        if (team.id !== meta.userTeamId) maxAiHotSeat = Math.max(maxAiHotSeat, hot);
      }
    }

    // Persona validity
    const persona = team.frontOffice?.persona;
    if (persona != null && !ALLOWED_PERSONAS.has(persona)) invalidPersonaProfiles += 1;

    // Retired numbers + duplicate detection (per team/number key)
    const retired = Array.isArray(team.retiredNumbers) ? team.retiredNumbers : [];
    retiredNumbersCount += retired.length;
    for (const n of retired) {
      if (!Number.isInteger(n) || n < 1 || n > 99) invalidReferences += 1;
      const key = `${team.id}#${n}`;
      if (retiredKeySeen.has(key)) duplicateRetiredNumberKeys += 1;
      else retiredKeySeen.add(key);
    }

    // Ring of honor reference validity
    const roh = Array.isArray(team.ringOfHonor) ? team.ringOfHonor : [];
    ringOfHonorCount += roh.length;
    const rohIds = new Set();
    for (const m of roh) {
      if (m == null || m.id == null || m.id === '') invalidReferences += 1;
      else if (rohIds.has(String(m.id))) invalidReferences += 1; // dup induction
      else rohIds.add(String(m.id));
    }
  }

  // History ledger reference validity (champion team ids must resolve)
  const ledger = Array.isArray(meta.historyLedger) ? meta.historyLedger : [];
  const ledgerYears = new Set();
  let duplicateLedgerYears = 0;
  for (const e of ledger) {
    if (ledgerYears.has(e?.year)) duplicateLedgerYears += 1;
    else ledgerYears.add(e?.year);
    if (e?.championTeamId != null && !teamIds.has(e.championTeamId)) invalidReferences += 1;
  }

  // Playoff seed reference validity
  for (const seeds of Object.values(meta.playoffSeeds ?? {})) {
    if (!Array.isArray(seeds)) continue;
    for (const s of seeds) {
      if (!teamIds.has(s?.teamId)) invalidReferences += 1;
    }
  }

  // Derived media stories (view-state only)
  const mediaStories = buildMediaViewState(state);
  const mediaIds = mediaStories.map((s) => s.id);
  const mediaSeen = new Set();
  let duplicateMediaStoryIds = 0;
  for (const id of mediaIds) {
    if (mediaSeen.has(id)) duplicateMediaStoryIds += 1;
    else mediaSeen.add(id);
  }

  return {
    season: meta.season,
    year: meta.year,
    teamCount: teams.length,
    playerCount,
    ownerProfileCount,
    invalidOwnerProfiles,
    invalidPersonaProfiles,
    historyLedgerCount: ledger.length,
    duplicateLedgerYears,
    retiredNumbersCount,
    ringOfHonorCount,
    prestigeHonorCount: countPrestigeHonors(meta.currentSeasonHonors),
    weeklyHeadlinesCount: Array.isArray(meta.weeklyHeadlines) ? meta.weeklyHeadlines.length : 0,
    leaguePulseCount: Array.isArray(meta.leaguePulse) ? meta.leaguePulse.length : 0,
    mediaStoryCount: mediaStories.length,
    duplicateRetiredNumberKeys,
    duplicateMediaStoryIds,
    invalidReferences,
    maxHotSeat,
    maxAiHotSeat,
    userFranchiseTerminated: meta.userFranchiseTerminated,
    ownerPressureEvaluatedForSeason: meta.ownerPressureEvaluatedForSeason,
  };
}

/** JSON round-trip serialization guard. Throws if not serializable. */
export function assertSerializable(value, label = 'value') {
  const json = JSON.stringify(value);
  if (typeof json !== 'string') throw new Error(`${label} did not serialize to a string`);
  JSON.parse(json);
  return json;
}

/** Deep clone via JSON (used for mutation guards on pure view-state builders). */
export function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export { FRONT_OFFICE_PERSONAS, OWNER_MANDATES, MEDIA_STORY_MAX, MAX_PULSE_ITEMS, ALLOWED_PERSONAS, ALLOWED_MANDATES };
