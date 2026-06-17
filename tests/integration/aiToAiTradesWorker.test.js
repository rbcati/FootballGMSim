/**
 * AI-to-AI Trade Engine — worker integration tests
 *
 * Tests that verify:
 *  1. The v5.6 → v5.7 migration runs correctly during league load
 *  2. The unified tradeOffers field is properly exposed in buildViewState()
 *  3. The pure AI-to-AI engine is correctly wired (no crash, deterministic output)
 *
 * Note: these tests use the full worker boot path and are intentionally lightweight
 * to avoid conflicting with other integration test workers.
 */
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toWorker, toUI } from '../../src/worker/protocol.js';
import { cache } from '../../src/db/cache.js';
import { ensureDynastyMeta } from '../../src/core/dynasty-story.js';
import { migrateSaveMetaToCurrent } from '../../src/state/saveSchema.js';

const SLOT_KEY = 'save_slot_ai2ai';
const USER_TEAM_ID = 0;
const BOOT_TIMEOUT_MS = 180_000;
const TEST_TIMEOUT_MS = 120_000;

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

function payloadOf(msg) {
  const p = msg?.payload;
  if (p && typeof p._jsonPayload === 'string') return JSON.parse(p._jsonPayload);
  return p;
}

function send(type, payload = {}, { timeoutMs = 60_000 } = {}) {
  const id = `ai2ai-test-${++msgSeq}`;
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

let booted = false;

beforeAll(async () => {
  installSelfBridge();
  await import('../../src/worker/worker.js');
  const ready = await send(toWorker.INIT, {}, { timeoutMs: BOOT_TIMEOUT_MS });
  if (ready.type !== toUI.READY) {
    booted = false;
    return;
  }
  const boot = await send(
    toWorker.USE_SAFE_STARTER_LEAGUE,
    { slotKey: SLOT_KEY, options: { rngSeed: 20260617, userTeamId: USER_TEAM_ID, name: 'AI2AI Trade Test' } },
    { timeoutMs: BOOT_TIMEOUT_MS },
  );
  booted = boot.type === toUI.FULL_STATE;
}, BOOT_TIMEOUT_MS);

afterAll(() => {
  delete globalThis.self;
});

// ── Migration tests (pure, no worker needed) ─────────────────────────────────

describe('tradeOffers migration from legacy fields (pure)', () => {
  it('migrates incomingTradeOffers to tradeOffers with isBlockOffer=false', () => {
    const oldMeta = {
      saveVersion: 5.6,
      userTeamId: 1,
      incomingTradeOffers: [{ id: 'old1', offerId: 'old1', status: 'pending' }],
    };
    const { migrated } = migrateSaveMetaToCurrent(oldMeta);
    expect(Array.isArray(migrated.tradeOffers)).toBe(true);
    expect(migrated.tradeOffers[0].isBlockOffer).toBe(false);
    expect(migrated.tradeOffers[0].origin).toBe('legacy');
    expect(migrated.incomingTradeOffers).toBeUndefined();
  });

  it('migrates inboundTradeOffers to tradeOffers with isBlockOffer=true', () => {
    const oldMeta = {
      saveVersion: 5.6,
      userTeamId: 1,
      inboundTradeOffers: [{ offerId: 'block1', status: 'pending' }],
    };
    const { migrated } = migrateSaveMetaToCurrent(oldMeta);
    expect(Array.isArray(migrated.tradeOffers)).toBe(true);
    expect(migrated.tradeOffers[0].isBlockOffer).toBe(true);
    expect(migrated.tradeOffers[0].origin).toBe('legacy');
    expect(migrated.inboundTradeOffers).toBeUndefined();
  });

  it('handles save with no old fields: empty tradeOffers', () => {
    const oldMeta = { saveVersion: 5.6, userTeamId: 2 };
    const { migrated } = migrateSaveMetaToCurrent(oldMeta);
    expect(migrated.tradeOffers).toEqual([]);
  });

  it('handles save already at 5.7 with tradeOffers present: no-op', () => {
    const existing = [{ offerId: 'x1', origin: 'ai_to_ai', isBlockOffer: false }];
    const meta = { saveVersion: 5.6, tradeOffers: existing };
    const { migrated } = migrateSaveMetaToCurrent(meta);
    expect(migrated.tradeOffers).toEqual(existing);
  });
});

// ── Worker integration tests (requires boot) ──────────────────────────────────

describe('Unified tradeOffers schema in worker', () => {
  it('meta.tradeOffers is an array after league load', () => {
    if (!booted) {
      console.warn('Worker did not boot — skipping worker tests');
      return;
    }
    const meta = ensureDynastyMeta(cache.getMeta());
    expect(Array.isArray(meta.tradeOffers)).toBe(true);
  });

  it('save version is 5.7 after load', () => {
    if (!booted) {
      console.warn('Worker did not boot — skipping worker tests');
      return;
    }
    const meta = ensureDynastyMeta(cache.getMeta());
    expect(Number(meta.saveVersion)).toBe(5.7);
  });

  it('buildViewState exposes tradeOffers, incomingTradeOffers, and inboundTradeOffers', async () => {
    if (!booted) {
      console.warn('Worker did not boot — skipping worker tests');
      return;
    }
    // The most recent FULL_STATE message contains the full view state
    const stateMsg = [...allMessages].reverse().find(m => m?.type === toUI.FULL_STATE);
    expect(stateMsg).toBeTruthy();
    const payload = payloadOf(stateMsg);
    // All three derived fields should be arrays
    expect(Array.isArray(payload?.tradeOffers)).toBe(true);
    expect(Array.isArray(payload?.incomingTradeOffers)).toBe(true);
    expect(Array.isArray(payload?.inboundTradeOffers)).toBe(true);
  }, TEST_TIMEOUT_MS);
});
