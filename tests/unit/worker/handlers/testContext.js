/**
 * Shared test doubles for extracted worker handler tests.
 *
 * makeFakeCache mirrors the db/cache.js read/update surface the migrated
 * handlers use; makeCtx mirrors the capability object worker.js builds with
 * createWorkerContext, with the ledger helpers implemented exactly like their
 * worker.js counterparts (backed by the fake cache's meta).
 */
import { vi } from 'vitest';
import {
  ensurePendingOffersList,
  prunePendingOffers,
} from '../../../../src/core/freeAgency/pendingOffers.js';

export function makeFakeCache({ meta = {}, teams = [], players = [] } = {}) {
  const state = { meta: { ...meta } };
  const teamMap = new Map(teams.map((t) => [Number(t.id), t]));
  const playerMap = new Map(players.map((p) => [String(p.id), p]));
  return {
    getMeta: () => state.meta,
    setMeta: (patch) => { state.meta = { ...state.meta, ...patch }; },
    getTeam: (id) => teamMap.get(Number(id)) ?? null,
    getAllTeams: () => [...teamMap.values()],
    getPlayer: (id) => (id != null ? (playerMap.get(String(id)) ?? null) : null),
    getAllPlayers: () => [...playerMap.values()],
    getPlayersByTeam: (teamId) =>
      [...playerMap.values()].filter((p) => p?.teamId != null && Number(p.teamId) === Number(teamId)),
    updatePlayer: (id, patch) => {
      const p = playerMap.get(String(id));
      if (p) Object.assign(p, patch);
    },
    updateTeam: (id, patch) => {
      const t = teamMap.get(Number(id));
      if (t) Object.assign(t, patch);
    },
  };
}

export function makeCtx(cache, overrides = {}) {
  const posts = [];
  return {
    cache,
    /** Recorded { type, payload, id } posts, in order. */
    posts,
    post: (type, payload = {}, id = null) => { posts.push({ type, payload, id }); },
    flushDirty: vi.fn(async () => {}),
    buildViewState: () => ({ viewState: 'stub' }),
    getSafeMeta: () => cache.getMeta() ?? {},
    getLeagueSetting: (key, fallback = null) => cache.getMeta()?.settings?.[key] ?? fallback,
    // Mirrors worker.js resolveTeamContext (payload teamId → meta.userTeamId fallback).
    resolveTeamContext: (explicitTeamId) => {
      const meta = cache.getMeta() ?? {};
      const teamId = explicitTeamId ?? meta.userTeamId ?? null;
      if (teamId == null) {
        return { ok: false, message: 'Active team context is missing. Please select your franchise and try again.' };
      }
      const team = cache.getTeam(teamId);
      if (!team) {
        return { ok: false, message: 'Active franchise team could not be resolved. Please reload and try again.' };
      }
      return { ok: true, meta, teamId, team };
    },
    getOffseasonReturnSnapshot: () => null,
    // Ledger helpers mirror the worker.js implementations exactly.
    getPendingOffersLedger: () => ensurePendingOffersList(cache.getMeta()?.pendingOffers),
    savePendingOffersLedger: (list, { day = null } = {}) => {
      const faDay = day ?? Number(cache.getMeta()?.freeAgencyState?.day ?? 1);
      cache.setMeta({ pendingOffers: prunePendingOffers(list, { day: faDay }) });
    },
    syncPendingOfferLedger: vi.fn(() => ({ accepted: [], rejected: [], expired: [] })),
    buildDemandSnapshotForOffer: () => ({
      baseAnnual: 8,
      yearsTotal: 3,
      signingBonus: 4,
      guaranteedPct: 0.5,
      willingness: 60,
      marketHeat: 1,
      leverageLabel: 'Neutral',
      reputationLabel: 'Neutral',
      feedbackLine: '',
      leverageReasons: [],
      franchiseReasons: [],
      negotiationShift: 0,
    }),
    resolvePendingFreeAgencyOffers: vi.fn(async () => ({ signedCount: 0, results: [] })),
    buildDraftStateView: () => ({ draftState: 'stub' }),
    startDraft: vi.fn(async () => {}),
    getActiveLeagueId: () => 'league_test',
    openDB: vi.fn(async () => {}),
    ...overrides,
  };
}

/** Meta fixture with the fields the migrated FA handlers read. */
export function makeFaMeta(overrides = {}) {
  return {
    userTeamId: 0,
    phase: 'free_agency',
    year: 2027,
    season: 3,
    currentWeek: 1,
    currentSeasonId: 'season_3',
    freeAgencyState: { day: 1, maxDays: 5, complete: false },
    pendingOffers: [],
    contractMarketMemory: {},
    economy: {},
    settings: {},
    ...overrides,
  };
}

export function makeUserTeam(overrides = {}) {
  return {
    id: 0,
    name: 'Testville Turbines',
    abbr: 'TVT',
    wins: 8,
    losses: 8,
    ties: 0,
    capUsed: 140,
    capRoom: 60,
    capTotal: 200,
    deadCap: 0,
    coachHistory: [],
    staff: null,
    picks: [],
    ...overrides,
  };
}

export function makeFreeAgent(overrides = {}) {
  return {
    id: 101,
    name: 'Free Agent Freddy',
    pos: 'WR',
    age: 27,
    ovr: 82,
    potential: 86,
    morale: 70,
    schemeFit: 65,
    status: 'free_agent',
    teamId: null,
    traits: [],
    offers: [],
    contract: null,
    awards: [],
    moraleEvents: [],
    ...overrides,
  };
}
