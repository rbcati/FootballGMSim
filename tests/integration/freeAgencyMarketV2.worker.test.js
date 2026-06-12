/**
 * Free Agency Market V2 — worker lifecycle integration tests (post-merge hardening).
 *
 * Drives the REAL worker message path (self.onmessage → handleMessage) against a
 * full safe-starter league in Node with fake IndexedDB, the same way
 * src/testSupport/dynastySoakRunner.js boots the worker. Covers:
 *   - SUBMIT_OFFER → meta.pendingOffers ledger row + player.offers + cap reservation
 *   - GET_FREE_AGENTS pendingOffers / capSummary payload
 *   - WITHDRAW_OFFER releases the reservation and strips the player bid
 *   - ADVANCE_FREE_AGENCY_DAY sequencing: age → reject/expire → market → reconcile
 *   - strong offers accept (roster join, FA pool removal), weak offers never
 *     force-sign through the old day-3 patience behavior
 *   - save/load preserves pending offers; pre-#1580 saves hydrate pendingOffers: []
 */
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toWorker, toUI } from '../../src/worker/protocol.js';
import { cache } from '../../src/db/cache.js';
import { Meta } from '../../src/db/index.js';
import { ensureDynastyMeta } from '../../src/core/dynasty-story.js';
import { PENDING_OFFER_STATUS } from '../../src/core/freeAgency/pendingOffers.js';

const SLOT_KEY = 'save_slot_1';
const USER_TEAM_ID = 0;
const BOOT_TIMEOUT_MS = 180_000;
const TEST_TIMEOUT_MS = 120_000;

// ── Minimal worker bridge (modeled on dynastySoakRunner.ensureSelfBridge) ──────

const allMessages = [];
const waiters = new Map();
let msgSeq = 0;

function installSelfBridge() {
  globalThis.self = {
    onmessage: null,
    postMessage(msg) {
      allMessages.push(msg);
      if (msg?.id != null && waiters.has(msg.id)) {
        const resolve = waiters.get(msg.id);
        waiters.delete(msg.id);
        resolve(msg);
      }
    },
  };
}

/** Parse the optional JSON fast-path used by post() for large payloads. */
function payloadOf(msg) {
  const p = msg?.payload;
  if (p && typeof p._jsonPayload === 'string') return JSON.parse(p._jsonPayload);
  return p;
}

/**
 * Send a worker message and resolve with the id-correlated reply. The worker
 * serializes all messages through its internal promise queue, so awaiting each
 * send keeps the test deterministic.
 */
function send(type, payload = {}, { timeoutMs = 60_000 } = {}) {
  const id = `fa-v2-test-${++msgSeq}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(id);
      reject(new Error(`Timeout (${timeoutMs}ms) waiting for reply to ${type}`));
    }, timeoutMs);
    waiters.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
    globalThis.self.onmessage({ data: { type, payload, id } });
  });
}

/**
 * ADVANCE_FREE_AGENCY_DAY posts no id-correlated reply; queue a GET_FREE_AGENTS
 * behind it — the worker's message queue guarantees the advance fully completes
 * first — and return the fresh FA payload.
 */
async function advanceFaDayAndRefresh() {
  globalThis.self.onmessage({ data: { type: toWorker.ADVANCE_FREE_AGENCY_DAY, payload: {} } });
  const reply = await send(toWorker.GET_FREE_AGENTS, {});
  expect(reply.type).toBe(toUI.FREE_AGENT_DATA);
  return payloadOf(reply);
}

async function getFreeAgents() {
  const reply = await send(toWorker.GET_FREE_AGENTS, {});
  expect(reply.type).toBe(toUI.FREE_AGENT_DATA);
  return payloadOf(reply);
}

function getLedger() {
  return ensureDynastyMeta(cache.getMeta()).pendingOffers;
}

// ── League fixtures ────────────────────────────────────────────────────────────

/**
 * Put the league into a fresh free-agency state. Each scenario resets the
 * ledger and the FA day clock so prior scenarios cannot leak into it.
 */
function enterFreeAgency() {
  cache.setMeta({
    phase: 'free_agency',
    freeAgencyState: { day: 1, maxDays: 5, complete: false },
    pendingOffers: [],
    contractMarketMemory: {},
    offseasonFaMovements: [],
  });
  cache.updateTeam(USER_TEAM_ID, { capRoom: 150 });
}

/**
 * Convert a roster player from a donor AI team into a high-leverage free agent.
 * ovr 92 / age 24 keeps buildDecisionTiming out of the `decision_imminent`
 * immediate-resolution path so submitted offers stay pending (Market V2 flow).
 */
function makeFreeAgentFromTeam(donorTeamId, { ovr = 92, age = 24 } = {}) {
  const donor = cache.getTeam(donorTeamId);
  const player = cache.getPlayersByTeam(donorTeamId).find((p) => p?.id != null);
  expect(player, `donor team ${donorTeamId} has no players`).toBeTruthy();
  cache.updatePlayer(player.id, {
    teamId: null,
    status: 'free_agent',
    offers: [],
    ovr,
    age,
    morale: 70,
  });
  cache.updateTeam(donorTeamId, {
    rosterIds: (donor.rosterIds ?? []).filter((pid) => pid !== player.id),
    rosterCount: Math.max(0, Number(donor.rosterCount ?? 1) - 1),
  });
  return cache.getPlayer(player.id);
}

/** Read the player's current asking price from the real GET_FREE_AGENTS payload. */
async function getAsk(playerId) {
  const fa = await getFreeAgents();
  const row = fa.freeAgents.find((p) => p.id === playerId);
  expect(row, `player ${playerId} missing from GET_FREE_AGENTS`).toBeTruthy();
  return { askAnnual: Number(row.demandProfile.askAnnual), askYears: Number(row.demandProfile.askYears) };
}

function offerCapHit(contract) {
  return Math.round((contract.baseAnnual + contract.signingBonus / contract.yearsTotal) * 10) / 10;
}

// ── Boot ───────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  installSelfBridge();
  await import('../../src/worker/worker.js');
  const ready = await send(toWorker.INIT, {}, { timeoutMs: BOOT_TIMEOUT_MS });
  expect(ready.type).toBe(toUI.READY);
  const boot = await send(
    toWorker.USE_SAFE_STARTER_LEAGUE,
    { slotKey: SLOT_KEY, options: { rngSeed: 20260612, userTeamId: USER_TEAM_ID, name: 'FA Market V2 Hardening' } },
    { timeoutMs: BOOT_TIMEOUT_MS },
  );
  expect(boot.type).toBe(toUI.FULL_STATE);
}, BOOT_TIMEOUT_MS);

afterAll(() => {
  delete globalThis.self;
});

// ── TASK 1: submit through the real worker path ────────────────────────────────

describe('SUBMIT_OFFER worker lifecycle', () => {
  let fa;
  let contract;

  it('records a pending ledger row, the player bid, and the cap reservation', async () => {
    enterFreeAgency();
    fa = makeFreeAgentFromTeam(2);
    const { askAnnual, askYears } = await getAsk(fa.id);
    contract = {
      baseAnnual: Math.round(askAnnual * 1.2 * 10) / 10,
      yearsTotal: askYears,
      signingBonus: Math.round(askAnnual * 10) / 10,
    };

    const reply = await send(toWorker.SUBMIT_OFFER, { playerId: fa.id, teamId: USER_TEAM_ID, contract });
    expect(reply.type).toBe(toUI.STATE_UPDATE);

    // League-level ledger holds exactly one pending row for this bid.
    const ledger = getLedger();
    expect(ledger).toHaveLength(1);
    const row = ledger[0];
    expect(row.status).toBe(PENDING_OFFER_STATUS.PENDING);
    expect(row.playerId).toBe(Number(fa.id));
    expect(row.teamId).toBe(USER_TEAM_ID);
    expect(row.annualCapHit).toBeCloseTo(offerCapHit(contract), 1);
    expect(Array.isArray(row.feedback)).toBe(true);
    expect(row.feedback.length).toBeGreaterThan(0);
    expect(row.playerDemandSnapshot).toBeTruthy();

    // The operational bid lives on the player for the AI decision pipeline.
    const playerOffers = cache.getPlayer(fa.id).offers ?? [];
    expect(playerOffers.some((o) => Number(o.teamId) === USER_TEAM_ID)).toBe(true);

    // GET_FREE_AGENTS reflects the pending offer + reserved/effective cap.
    const faData = await getFreeAgents();
    expect(faData.pendingOffers).toHaveLength(1);
    expect(faData.pendingOffers[0].id).toBe(row.id);
    expect(faData.pendingOffers[0].status).toBe(PENDING_OFFER_STATUS.PENDING);
    expect(faData.capSummary.reservedPendingCap).toBeCloseTo(row.annualCapHit, 1);
    expect(faData.capSummary.effectiveCapRoom).toBeCloseTo(
      faData.capSummary.capRoom - faData.capSummary.reservedPendingCap,
      1,
    );
  }, TEST_TIMEOUT_MS);

  it('replaces a re-submitted offer for the same player instead of double-reserving', async () => {
    const replacement = {
      baseAnnual: contract.baseAnnual + 2,
      yearsTotal: contract.yearsTotal,
      signingBonus: contract.signingBonus,
    };
    const reply = await send(toWorker.SUBMIT_OFFER, { playerId: fa.id, teamId: USER_TEAM_ID, contract: replacement });
    expect(reply.type).toBe(toUI.STATE_UPDATE);

    const pendingRows = getLedger().filter(
      (r) => r.status === PENDING_OFFER_STATUS.PENDING && r.playerId === Number(fa.id),
    );
    expect(pendingRows).toHaveLength(1);
    expect(pendingRows[0].annualCapHit).toBeCloseTo(offerCapHit(replacement), 1);

    // Only one bid from the user team on the player, and only one reservation.
    const userBids = (cache.getPlayer(fa.id).offers ?? []).filter((o) => Number(o.teamId) === USER_TEAM_ID);
    expect(userBids).toHaveLength(1);
    const faData = await getFreeAgents();
    expect(faData.capSummary.reservedPendingCap).toBeCloseTo(offerCapHit(replacement), 1);
  }, TEST_TIMEOUT_MS);

  // ── TASK 2: withdraw releases cap and cleans player offers ──────────────────

  it('WITHDRAW_OFFER marks the row withdrawn, releases cap, and strips the bid', async () => {
    expect(getLedger().some((r) => r.status === PENDING_OFFER_STATUS.PENDING)).toBe(true);

    const reply = await send(toWorker.WITHDRAW_OFFER, { playerId: fa.id, teamId: USER_TEAM_ID });
    expect(reply.type).toBe(toUI.STATE_UPDATE);

    const ledger = getLedger();
    const row = ledger.find((r) => r.playerId === Number(fa.id) && r.teamId === USER_TEAM_ID);
    expect(row.status).toBe(PENDING_OFFER_STATUS.WITHDRAWN);
    expect(ledger.some((r) => r.status === PENDING_OFFER_STATUS.PENDING)).toBe(false);

    const playerOffers = cache.getPlayer(fa.id).offers ?? [];
    expect(playerOffers.some((o) => Number(o.teamId) === USER_TEAM_ID)).toBe(false);

    const faData = await getFreeAgents();
    expect(faData.capSummary.reservedPendingCap).toBe(0);
    expect(faData.capSummary.effectiveCapRoom).toBeCloseTo(faData.capSummary.capRoom, 1);
    const withdrawnRow = faData.pendingOffers.find((r) => r.playerId === Number(fa.id));
    expect(withdrawnRow.status).toBe(PENDING_OFFER_STATUS.WITHDRAWN);
  }, TEST_TIMEOUT_MS);
});

// ── TASK 3: daily resolution sequencing ────────────────────────────────────────

describe('ADVANCE_FREE_AGENCY_DAY resolution', () => {
  it('accepts a strong above-demand offer: roster join, FA-pool removal, cap release', async () => {
    enterFreeAgency();
    const fa = makeFreeAgentFromTeam(3);
    const { askAnnual, askYears } = await getAsk(fa.id);
    const contract = {
      baseAnnual: Math.round(askAnnual * 1.8 * 10) / 10,
      yearsTotal: askYears,
      signingBonus: Math.round(askAnnual * 1.5 * 10) / 10,
    };
    const submit = await send(toWorker.SUBMIT_OFFER, { playerId: fa.id, teamId: USER_TEAM_ID, contract });
    expect(submit.type).toBe(toUI.STATE_UPDATE);
    expect(getLedger().find((r) => r.playerId === Number(fa.id)).status).toBe(PENDING_OFFER_STATUS.PENDING);

    let faData = null;
    let row = null;
    for (let i = 0; i < 4; i += 1) {
      faData = await advanceFaDayAndRefresh();
      row = getLedger().find((r) => r.playerId === Number(fa.id) && r.teamId === USER_TEAM_ID);
      if (row.status !== PENDING_OFFER_STATUS.PENDING) break;
    }

    // Ledger row reconciled to accepted after the market acted.
    expect(row.status).toBe(PENDING_OFFER_STATUS.ACCEPTED);

    // Accepted player joined the user roster and left the FA pool.
    const player = cache.getPlayer(fa.id);
    expect(Number(player.teamId)).toBe(USER_TEAM_ID);
    expect(player.status).toBe('active');
    expect(faData.freeAgents.some((p) => p.id === fa.id)).toBe(false);

    // Resolved offers stop reserving cap, and the FA payload reflects the
    // final ledger state.
    expect(faData.capSummary.reservedPendingCap).toBe(0);
    const payloadRow = faData.pendingOffers.find((r) => r.playerId === Number(fa.id));
    expect(payloadRow.status).toBe(PENDING_OFFER_STATUS.ACCEPTED);
  }, TEST_TIMEOUT_MS);

  it('rejects/expires a clearly-below-demand offer without the old day-3 force-sign', async () => {
    enterFreeAgency();
    const fa = makeFreeAgentFromTeam(4);
    const { askAnnual, askYears } = await getAsk(fa.id);
    const lowball = {
      baseAnnual: Math.max(0.5, Math.round(askAnnual * 0.35 * 10) / 10),
      yearsTotal: Math.max(1, askYears - 1),
      signingBonus: 0,
    };
    const submit = await send(toWorker.SUBMIT_OFFER, { playerId: fa.id, teamId: USER_TEAM_ID, contract: lowball });
    expect(submit.type).toBe(toUI.STATE_UPDATE);

    let faData = null;
    let row = null;
    for (let i = 0; i < 4; i += 1) {
      faData = await advanceFaDayAndRefresh();
      row = getLedger().find((r) => r.playerId === Number(fa.id) && r.teamId === USER_TEAM_ID);
      if (row.status !== PENDING_OFFER_STATUS.PENDING) break;
    }

    // The lowball must never sign with the user team (old day-3 patience
    // behavior force-signed clearly-below-ask offers).
    const player = cache.getPlayer(fa.id);
    expect(Number(player?.teamId ?? -1)).not.toBe(USER_TEAM_ID);

    // Ledger resolves to rejected (below market / signed elsewhere) or expired.
    expect([PENDING_OFFER_STATUS.REJECTED, PENDING_OFFER_STATUS.EXPIRED]).toContain(row.status);

    // Dead bid removed from player.offers; reservation released; payload final.
    const offers = cache.getPlayer(fa.id)?.offers ?? [];
    expect(offers.some((o) => Number(o.teamId) === USER_TEAM_ID)).toBe(false);
    expect(faData.capSummary.reservedPendingCap).toBe(0);
    const payloadRow = faData.pendingOffers.find((r) => r.playerId === Number(fa.id));
    expect([PENDING_OFFER_STATUS.REJECTED, PENDING_OFFER_STATUS.EXPIRED]).toContain(payloadRow.status);
  }, TEST_TIMEOUT_MS);
});

// ── TASK 4 + TASK 6.10: save/load round-trip and old-save migration ───────────

describe('save/load and pre-#1580 meta migration', () => {
  it('preserves pending offer state across a real save → load round-trip', async () => {
    enterFreeAgency();
    const fa = makeFreeAgentFromTeam(5);
    const { askAnnual, askYears } = await getAsk(fa.id);
    const contract = {
      baseAnnual: Math.round(askAnnual * 1.1 * 10) / 10,
      yearsTotal: askYears,
      signingBonus: 1,
    };
    const submit = await send(toWorker.SUBMIT_OFFER, { playerId: fa.id, teamId: USER_TEAM_ID, contract });
    expect(submit.type).toBe(toUI.STATE_UPDATE);
    const pendingRowId = getLedger().find((r) => r.playerId === Number(fa.id)).id;

    // SUBMIT_OFFER already flushed meta to the (fake) IndexedDB save. Reload
    // the save through the real LOAD_SAVE pipeline.
    cache.reset();
    const load = await send(toWorker.LOAD_SAVE, { leagueId: SLOT_KEY }, { timeoutMs: BOOT_TIMEOUT_MS });
    expect(load.type).toBe(toUI.FULL_STATE);

    const ledger = getLedger();
    const restored = ledger.find((r) => r.id === pendingRowId);
    expect(restored).toBeTruthy();
    expect(restored.status).toBe(PENDING_OFFER_STATUS.PENDING);

    const faData = await getFreeAgents();
    expect(faData.pendingOffers.some((r) => r.id === pendingRowId)).toBe(true);
    expect(faData.capSummary.reservedPendingCap).toBeCloseTo(restored.annualCapHit, 1);
  }, TEST_TIMEOUT_MS);

  it('hydrates a pre-#1580 save (no meta.pendingOffers) without corrupting adjacent fields', async () => {
    // Simulate an old save: persist the current meta with the Market V2 field
    // removed and sentinel values on the adjacent fields that must survive.
    const sentinelFaState = { day: 2, maxDays: 5, complete: false };
    const sentinelMemory = { 4242: { waitCycles: 1 } };
    const sentinelMovements = [
      { id: 'mv-sentinel', playerId: 4242, playerName: 'Sentinel Back', pos: 'RB', prevTeamId: 7, newTeamId: 9 },
    ];
    const sentinelGoals = [
      { id: 'goal-sentinel', type: 'win_games', description: 'Win 10 games', target: 10, current: 3, complete: false, reward: 'Fan approval +15' },
    ];

    const oldMeta = {
      ...cache.getMeta(),
      phase: 'free_agency',
      freeAgencyState: sentinelFaState,
      contractMarketMemory: sentinelMemory,
      offseasonFaMovements: sentinelMovements,
      ownerGoals: sentinelGoals,
    };
    delete oldMeta.pendingOffers;
    await Meta.save(oldMeta);

    cache.reset();
    const load = await send(toWorker.LOAD_SAVE, { leagueId: SLOT_KEY }, { timeoutMs: BOOT_TIMEOUT_MS });
    expect(load.type).toBe(toUI.FULL_STATE);

    // Missing pendingOffers hydrates to [] through ensureDynastyMeta.
    const meta = ensureDynastyMeta(cache.getMeta());
    expect(meta.pendingOffers).toEqual([]);

    // Adjacent FA / dynasty / user-team fields survive unchanged.
    expect(meta.freeAgencyState).toEqual(sentinelFaState);
    expect(meta.contractMarketMemory).toEqual(sentinelMemory);
    expect(meta.offseasonFaMovements).toEqual(sentinelMovements);
    expect(meta.ownerGoals).toEqual(sentinelGoals);
    expect(Number(meta.userTeamId)).toBe(USER_TEAM_ID);
    expect(Array.isArray(meta.newsItems)).toBe(true);
    expect(Array.isArray(meta.retiredPlayers)).toBe(true);

    // The loaded old save serves GET_FREE_AGENTS without crashing, with an
    // empty ledger and a zeroed reservation.
    const faData = await getFreeAgents();
    expect(faData.pendingOffers).toEqual([]);
    expect(faData.capSummary.reservedPendingCap).toBe(0);
    expect(faData.capSummary.effectiveCapRoom).toBeCloseTo(faData.capSummary.capRoom, 1);
  }, TEST_TIMEOUT_MS);
});
