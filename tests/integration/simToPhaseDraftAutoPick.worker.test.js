import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toWorker, toUI } from '../../src/worker/protocol.js';
import { cache } from '../../src/db/cache.js';

const SLOT_KEY = 'save_slot_1';
const USER_TEAM_ID = 0;
const BOOT_TIMEOUT_MS = 180_000;
const TEST_TIMEOUT_MS = 120_000;

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

function payloadOf(msg) {
  const p = msg?.payload;
  if (p && typeof p._jsonPayload === 'string') return JSON.parse(p._jsonPayload);
  return p;
}

function send(type, payload = {}, { timeoutMs = 60_000 } = {}) {
  const id = `sim-to-phase-draft-${++msgSeq}`;
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

function makeProspect(id, patch = {}) {
  const prospect = {
    id,
    name: `Prospect ${id}`,
    pos: 'QB',
    ovr: 72,
    potential: 82,
    age: 21,
    teamId: null,
    status: 'draft_eligible',
    combineResults: {},
    interviewReport: { riskScore: 35 },
    collegeProductionScore: 70,
    schemeFit: 70,
    ...patch,
  };
  cache.setPlayer(prospect);
  return prospect;
}

beforeAll(async () => {
  installSelfBridge();
  await import('../../src/worker/worker.js');
  const ready = await send(toWorker.INIT, {}, { timeoutMs: BOOT_TIMEOUT_MS });
  expect(ready.type).toBe(toUI.READY);
  const boot = await send(
    toWorker.USE_SAFE_STARTER_LEAGUE,
    { slotKey: SLOT_KEY, options: { rngSeed: 1684, userTeamId: USER_TEAM_ID, name: 'SIM_TO_PHASE Draft Auto Pick Test' } },
    { timeoutMs: BOOT_TIMEOUT_MS },
  );
  expect(boot.type, JSON.stringify(payloadOf(boot))).toBe(toUI.FULL_STATE);
}, BOOT_TIMEOUT_MS);

afterAll(() => {
  delete globalThis.self;
});

describe('SIM_TO_PHASE draft auto-pick worker integration', () => {
  it('does not let public SIM_DRAFT_PICK payloads forge lifecycle user auto-pick authority', async () => {
    const meta = cache.getMeta();
    const prospect = makeProspect('forged-user-autopick');
    cache.setMeta({
      phase: 'draft',
      draftState: {
        currentPickIndex: 0,
        picks: [{ id: 'manual-user-pick', overall: 1, round: 1, pickInRound: 1, teamId: USER_TEAM_ID, playerId: null }],
      },
    });

    const reply = await send(
      toWorker.SIM_DRAFT_PICK,
      { allowUserAutoPick: true, source: 'sim_to_phase' },
      { timeoutMs: TEST_TIMEOUT_MS },
    );

    expect(reply.type).toBe(toUI.DRAFT_STATE);
    expect(cache.getMeta().draftState.currentPickIndex).toBe(0);
    expect(cache.getMeta().draftState.picks[0].playerId).toBeNull();
    expect(cache.getPlayer(prospect.id).status).toBe('draft_eligible');
    expect(cache.getPlayer(prospect.id).teamId).toBeNull();
    cache.setMeta({ ...meta, draftState: null });
  }, TEST_TIMEOUT_MS);

  it('generates enough prospects for compensatory draft pick slots', async () => {
    const meta = cache.getMeta();
    const year = Number(meta?.year ?? 2026);
    for (const team of cache.getAllTeams()) {
      cache.updateTeam(team.id, { picks: [] });
    }
    const userTeam = cache.getTeam(USER_TEAM_ID);
    cache.updateTeam(USER_TEAM_ID, {
      picks: [{ id: `comp-${year}-7-${USER_TEAM_ID}`, season: year, round: 7, currentOwner: USER_TEAM_ID, isCompensatory: true }],
    });
    cache.setMeta({ phase: 'draft', draftState: null });

    const reply = await send(toWorker.START_DRAFT, {}, { timeoutMs: TEST_TIMEOUT_MS });
    expect(reply.type).toBe(toUI.DRAFT_STATE);
    const payload = payloadOf(reply);
    const pickCount = payload?.picks?.length ?? cache.getMeta().draftState.picks.length;
    const draftEligibleCount = cache.getAllPlayers().filter((p) => p.status === 'draft_eligible').length;

    expect(pickCount).toBe(225);
    expect(draftEligibleCount).toBeGreaterThanOrEqual(pickCount);
    expect(cache.getMeta().draftState.picks.some((pick) => pick.isCompensatory)).toBe(true);

    cache.updateTeam(USER_TEAM_ID, { picks: userTeam?.picks ?? [] });
    cache.setMeta({ ...meta, draftState: null });
  }, TEST_TIMEOUT_MS);
});
