/**
 * Offseason Free Agency Market V2 — post-merge user-flow smoke (worker level).
 *
 * Integration fallback for tests/e2e/offseasonFaFlow.spec.js: drives the SAME
 * user journey through the real worker message path (the harness from
 * tests/integration/freeAgencyMarketV2.worker.test.js) so the flow stays
 * covered even when Playwright browsers are unavailable.
 *
 * One continuous session against a single player — the sequencing the browser
 * spec exercises and #1581 does not:
 *   open FA → submit offer → pending panel payload + effective cap →
 *   withdraw (reservation releases) → strong offer on the SAME player →
 *   advance FA day(s) → accepted signing leaves the pool and joins the roster.
 *
 * Also pins the payload fields PendingOffersPanel renders (playerName, pos,
 * years, totalValue, annualCapHit, status, feedback) so a worker refactor
 * cannot silently blank the panel.
 */
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toWorker, toUI } from '../../src/worker/protocol.js';
import { cache } from '../../src/db/cache.js';
import { ensureDynastyMeta } from '../../src/core/dynasty-story.js';
import { PENDING_OFFER_STATUS } from '../../src/core/freeAgency/pendingOffers.js';

const SLOT_KEY = 'save_slot_1';
const USER_TEAM_ID = 0;
const BOOT_TIMEOUT_MS = 180_000;
const TEST_TIMEOUT_MS = 120_000;

// ── Minimal worker bridge (same as freeAgencyMarketV2.worker.test.js) ─────────

const waiters = new Map();
let msgSeq = 0;

function installSelfBridge() {
  globalThis.self = {
    onmessage: null,
    postMessage(msg) {
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

function send(type, payload = {}, { timeoutMs = 60_000 } = {}) {
  const id = `fa-smoke-${++msgSeq}`;
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

async function getFreeAgents() {
  const reply = await send(toWorker.GET_FREE_AGENTS, {});
  expect(reply.type).toBe(toUI.FREE_AGENT_DATA);
  return payloadOf(reply);
}

/**
 * ADVANCE_FREE_AGENCY_DAY posts no id-correlated reply; queue a GET_FREE_AGENTS
 * behind it — the worker's message queue guarantees the advance completes
 * first — and return the fresh FA payload.
 */
async function advanceFaDayAndRefresh() {
  globalThis.self.onmessage({ data: { type: toWorker.ADVANCE_FREE_AGENCY_DAY, payload: {} } });
  return getFreeAgents();
}

function getLedger() {
  return ensureDynastyMeta(cache.getMeta()).pendingOffers;
}

// ── League fixtures (same shape as the #1581 harness) ─────────────────────────

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
    { slotKey: SLOT_KEY, options: { rngSeed: 20260613, userTeamId: USER_TEAM_ID, name: 'Offseason FA Smoke' } },
    { timeoutMs: BOOT_TIMEOUT_MS },
  );
  expect(boot.type).toBe(toUI.FULL_STATE);
}, BOOT_TIMEOUT_MS);

afterAll(() => {
  delete globalThis.self;
});

// ── One continuous user session against a single target player ────────────────

describe('offseason FA smoke: the user loop through worker messages', () => {
  let fa;
  let ask;
  let modest;

  it('opens Free Agency with an empty ledger and an unreserved cap', async () => {
    enterFreeAgency();
    fa = makeFreeAgentFromTeam(2);
    const data = await getFreeAgents();
    expect(data.phase).toBe('free_agency');
    expect(data.pendingOffers).toEqual([]);
    expect(data.capSummary.reservedPendingCap).toBe(0);
    expect(data.capSummary.effectiveCapRoom).toBeCloseTo(data.capSummary.capRoom, 1);
  }, TEST_TIMEOUT_MS);

  it('submit: the pending panel payload carries every field the UI renders, and cap is reserved', async () => {
    ask = await getAsk(fa.id);
    modest = {
      baseAnnual: Math.round(ask.askAnnual * 1.15 * 10) / 10,
      yearsTotal: ask.askYears,
      signingBonus: 0,
    };
    const reply = await send(toWorker.SUBMIT_OFFER, { playerId: fa.id, teamId: USER_TEAM_ID, contract: modest });
    expect(reply.type).toBe(toUI.STATE_UPDATE);

    const data = await getFreeAgents();
    expect(data.pendingOffers).toHaveLength(1);
    const row = data.pendingOffers[0];
    // Fields rendered by PendingOffersPanel (FreeAgency.jsx). If any of these
    // go missing the panel renders blanks, so pin them here.
    expect(row.status).toBe(PENDING_OFFER_STATUS.PENDING);
    expect(row.playerName).toBe(fa.name);
    expect(typeof row.pos).toBe('string');
    expect(row.years).toBe(modest.yearsTotal);
    expect(row.totalValue).toBeCloseTo(modest.baseAnnual * modest.yearsTotal, 1);
    expect(row.annualCapHit).toBeCloseTo(offerCapHit(modest), 1);
    expect(Array.isArray(row.feedback)).toBe(true);
    expect(row.feedback.length).toBeGreaterThan(0);

    // Effective cap = cap room minus the reservation (the badge's numbers).
    expect(data.capSummary.reservedPendingCap).toBeCloseTo(offerCapHit(modest), 1);
    expect(data.capSummary.effectiveCapRoom).toBeCloseTo(
      data.capSummary.capRoom - data.capSummary.reservedPendingCap,
      1,
    );
  }, TEST_TIMEOUT_MS);

  it('withdraw: the reservation releases and the row reads withdrawn', async () => {
    const reply = await send(toWorker.WITHDRAW_OFFER, { playerId: fa.id, teamId: USER_TEAM_ID });
    expect(reply.type).toBe(toUI.STATE_UPDATE);

    const data = await getFreeAgents();
    const row = data.pendingOffers.find((r) => r.playerId === Number(fa.id));
    expect(row.status).toBe(PENDING_OFFER_STATUS.WITHDRAWN);
    expect(data.capSummary.reservedPendingCap).toBe(0);
    expect(data.capSummary.effectiveCapRoom).toBeCloseTo(data.capSummary.capRoom, 1);
    // The withdrawn bid no longer sits on the player for the AI pipeline.
    const playerOffers = cache.getPlayer(fa.id).offers ?? [];
    expect(playerOffers.some((o) => Number(o.teamId) === USER_TEAM_ID)).toBe(false);
  }, TEST_TIMEOUT_MS);

  it('re-offer after withdraw: a strong bid on the same player goes pending again', async () => {
    const strong = {
      baseAnnual: Math.round(ask.askAnnual * 1.8 * 10) / 10,
      yearsTotal: ask.askYears,
      signingBonus: Math.round(ask.askAnnual * 1.5 * 10) / 10,
    };
    const reply = await send(toWorker.SUBMIT_OFFER, { playerId: fa.id, teamId: USER_TEAM_ID, contract: strong });
    expect(reply.type).toBe(toUI.STATE_UPDATE);

    // Withdraw + re-offer leaves two ledger rows for the player; the newest
    // (returned first by GET_FREE_AGENTS) must be the pending strong bid.
    const data = await getFreeAgents();
    const rows = data.pendingOffers.filter((r) => r.playerId === Number(fa.id));
    expect(rows.length).toBe(2);
    expect(rows[0].status).toBe(PENDING_OFFER_STATUS.PENDING);
    expect(rows[0].annualCapHit).toBeCloseTo(offerCapHit(strong), 1);
    expect(rows[1].status).toBe(PENDING_OFFER_STATUS.WITHDRAWN);
    // Exactly one reservation — the withdrawn row must not count.
    expect(data.capSummary.reservedPendingCap).toBeCloseTo(offerCapHit(strong), 1);
  }, TEST_TIMEOUT_MS);

  it('advance FA day: the strong offer is accepted — roster join, pool removal, cap release', async () => {
    let data = null;
    let row = null;
    for (let i = 0; i < 4; i += 1) {
      data = await advanceFaDayAndRefresh();
      row = getLedger().find(
        (r) => r.playerId === Number(fa.id) && r.teamId === USER_TEAM_ID && r.status !== PENDING_OFFER_STATUS.WITHDRAWN,
      );
      if (row.status !== PENDING_OFFER_STATUS.PENDING) break;
    }

    expect(row.status).toBe(PENDING_OFFER_STATUS.ACCEPTED);

    const player = cache.getPlayer(fa.id);
    expect(Number(player.teamId)).toBe(USER_TEAM_ID);
    expect(player.status).toBe('active');
    expect(data.freeAgents.some((p) => p.id === fa.id)).toBe(false);

    // Resolved offers stop reserving cap; the payload tells the same story
    // the re-opened Free Agency screen renders.
    expect(data.capSummary.reservedPendingCap).toBe(0);
    const payloadRow = data.pendingOffers.find(
      (r) => r.playerId === Number(fa.id) && r.status !== PENDING_OFFER_STATUS.WITHDRAWN,
    );
    expect(payloadRow.status).toBe(PENDING_OFFER_STATUS.ACCEPTED);
  }, TEST_TIMEOUT_MS);
});
