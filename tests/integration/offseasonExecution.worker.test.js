/**
 * Offseason EXECUTION integrity (follow-up to PR #1808, which fixed recording).
 *
 * Covers, against the real worker + fake IndexedDB:
 *   1. Confirm extension: the worker quote returns terms the worker accepts;
 *      committing them writes exactly one EXTEND transaction (a repeated
 *      confirm is idempotent), updates contract + cap, and survives reload.
 *   2. Contract expiry at re-signing → free agency: Let Walk, Decide Later and
 *      Pending expiring players leave the roster and enter the FA pool;
 *      extended players keep their new terms; other contracts tick down.
 *   3. Atomicity: a "Sim to Season" whose rollover is refused (Team-19-style
 *      53-player failure) leaves every league IndexedDB store byte-identical.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadWorkerModule, dispatchWorker } from '../../src/testSupport/dynastySoakRunner.js';
import { cache } from '../../src/db/cache.js';
import { Transactions, openDB } from '../../src/db/index.js';
import { DEFAULT_TEAMS } from '../../src/data/default-teams.js';
import { getPlayerCapHit } from '../../src/core/teamValidation.js';
import AiLogic from '../../src/core/ai-logic.js';
import { toWorker, toUI } from '../../src/worker/protocol.js';

const USER = 0; // Buffalo
const payloadOf = (msg) => (msg?.payload?._jsonPayload ? JSON.parse(msg.payload._jsonPayload) : msg?.payload);

async function bootBuffalo(slotKey, rngSeed) {
  const boot = await dispatchWorker(toWorker.NEW_LEAGUE, { teams: DEFAULT_TEAMS, slotKey, options: { year: 2026, rngSeed, userTeamId: USER, salaryCap: 500 } }, { timeoutMs: 180000 });
  const leagueId = payloadOf(boot).activeLeagueId;
  await dispatchWorker(toWorker.LOAD_SAVE, { leagueId });
  return leagueId;
}

/** Deterministic JSON dump of every object store in the active league DB. */
async function dumpLeagueDb() {
  const db = await openDB();
  const names = [...db.objectStoreNames].sort();
  const out = {};
  for (const name of names) {
    out[name] = await new Promise((resolve, reject) => {
      const req = db.transaction(name, 'readonly').objectStore(name).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return out;
}

function diffStores(before, after) {
  const changed = [];
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = JSON.stringify(before[name]);
    const b = JSON.stringify(after[name]);
    if (a === b) continue;
    const rowsA = before[name] ?? [];
    const rowsB = after[name] ?? [];
    const keyOf = (r, i) => String(r?.id ?? r?.key ?? i);
    const mapA = new Map(rowsA.map((r, i) => [keyOf(r, i), JSON.stringify(r)]));
    const diffs = [];
    rowsB.forEach((r, i) => { const k = keyOf(r, i); if (mapA.get(k) !== JSON.stringify(r)) diffs.push(k); });
    for (const k of mapA.keys()) if (!rowsB.some((r, i) => keyOf(r, i) === k)) diffs.push(`-${k}`);
    let detail = '';
    if (diffs.length) {
      const k = diffs[0];
      const ra = rowsA.find((r, i) => keyOf(r, i) === k) ?? {};
      const rb = rowsB.find((r, i) => keyOf(r, i) === k) ?? {};
      const fields = [...new Set([...Object.keys(ra), ...Object.keys(rb)])].filter((f) => JSON.stringify(ra[f]) !== JSON.stringify(rb[f]));
      detail = ` first=${k} fields=${fields.slice(0, 8).join(',')}`;
    }
    changed.push(`${name}: ${rowsA.length}→${rowsB.length} rows, ${diffs.length} differing${detail}`);
  }
  return changed;
}

beforeAll(async () => {
  await loadWorkerModule();
  await dispatchWorker(toWorker.INIT);
}, 60000);

afterEach(() => vi.restoreAllMocks());

describe.sequential('offseason execution', () => {
  let leagueId;
  let extended;

  it('commits a confirmed extension exactly once with worker-quoted terms and persists it', async () => {
    leagueId = await bootBuffalo('save_slot_1', 2311);
    cache.setMeta({ phase: 'offseason_resign' });
    const expiring = cache.getPlayersByTeam(USER).filter((p) => Number(p.contract?.years) <= 1);
    expect(expiring.length).toBeGreaterThan(3);

    let quote = null;
    const refusals = [];
    for (const p of expiring) {
      const res = await dispatchWorker(toWorker.GET_EXTENSION_QUOTE, { playerId: p.id, teamId: USER });
      expect(res.type).toBe(toUI.EXTENSION_QUOTE);
      const q = payloadOf(res);
      if (!q.canCommit) {
        // A refusal must always explain itself.
        expect(String(q.blockReason ?? '')).not.toBe('');
        refusals.push(`${p.name}: ${q.blockCode} ${q.blockReason}`);
        continue;
      }
      quote = q;
      extended = p;
      break;
    }
    expect(quote, `at least one expiring Buffalo player should accept his quoted terms (cap room ${cache.getTeam(USER).capRoom}):\n${refusals.join('\n')}`).toBeTruthy();

    const beforeCap = cache.getTeam(USER).capUsed;
    const priorHit = getPlayerCapHit(cache.getPlayer(extended.id));
    const accepted = await dispatchWorker(toWorker.EXTEND_CONTRACT, { playerId: extended.id, teamId: USER, contract: quote.terms });
    expect(accepted.payload.status, JSON.stringify(accepted.payload)).toBe('accepted');
    expect(cache.getPlayer(extended.id)).toMatchObject({ teamId: USER, extensionDecision: 'extended', contract: quote.terms });
    expect(cache.getTeam(USER).capUsed).toBeCloseTo(beforeCap - priorHit + getPlayerCapHit(cache.getPlayer(extended.id)), 4);

    // A second click on Confirm must not write a second transaction.
    const again = await dispatchWorker(toWorker.EXTEND_CONTRACT, { playerId: extended.id, teamId: USER, contract: quote.terms });
    expect(again.payload).toMatchObject({ status: 'accepted', alreadyCommitted: true });
    const extendRows = (await Transactions.loadRecent(4000)).filter((t) => t.type === 'EXTEND' && String(t.details?.playerId) === String(extended.id));
    expect(extendRows).toHaveLength(1);

    await dispatchWorker(toWorker.SAVE_NOW);
    await dispatchWorker(toWorker.LOAD_SAVE, { leagueId });
    expect(cache.getPlayer(extended.id)).toMatchObject({ extensionDecision: 'extended', contract: quote.terms });
  }, 240000);

  it('releases Let Walk, Decide Later and Pending expirings into the FA pool when re-signing closes', async () => {
    const roster = cache.getPlayersByTeam(USER);
    const expiring = roster.filter((p) => Number(p.contract?.years) <= 1 && String(p.id) !== String(extended.id));
    expect(expiring.length).toBeGreaterThanOrEqual(3);
    const [walk, defer, pending] = expiring;
    await dispatchWorker(toWorker.UPDATE_PLAYER_MANAGEMENT, { playerId: walk.id, teamId: USER, updates: { extensionDecision: 'let_walk' } });
    await dispatchWorker(toWorker.UPDATE_PLAYER_MANAGEMENT, { playerId: defer.id, teamId: USER, updates: { extensionDecision: 'deferred' } });
    const veteran = roster.find((p) => Number(p.contract?.years) >= 3 && Number(p.age) <= 27);
    expect(veteran).toBeTruthy();
    const veteranYears = Number(veteran.contract.years);
    const extendedTerms = structuredClone(cache.getPlayer(extended.id).contract);

    const advanced = await dispatchWorker(toWorker.ADVANCE_OFFSEASON, {}, { timeoutMs: 180000 });
    expect(advanced.type).toBe(toUI.OFFSEASON_PHASE);
    expect(cache.getMeta().phase).toBe('free_agency');

    for (const p of [walk, defer, pending]) {
      expect(cache.getPlayer(p.id), p.name).toMatchObject({ teamId: null, status: 'free_agent', lastTeamId: USER });
    }
    expect(cache.getPlayer(extended.id)).toMatchObject({ teamId: USER, contract: extendedTerms });
    expect(Number(cache.getPlayer(veteran.id).contract.years)).toBe(veteranYears - 1);

    const fa = payloadOf(await dispatchWorker(toWorker.GET_FREE_AGENTS));
    const poolIds = new Set((fa.freeAgents ?? []).map((p) => String(p.id)));
    for (const p of [walk, defer, pending]) expect(poolIds.has(String(p.id)), `${p.name} in FA pool`).toBe(true);
    // League-wide expiry refills the market (previously ~1 player).
    expect(poolIds.size).toBeGreaterThan(50);

    const expiredRows = (await Transactions.loadRecent(4000)).filter((t) => t.type === 'CONTRACT_EXPIRED');
    expect(expiredRows.find((t) => String(t.details?.playerId) === String(walk.id))?.details?.reason).toBe('let_walk');
    expect(expiredRows.find((t) => String(t.details?.playerId) === String(defer.id))?.details?.reason).toBe('deferred');

    await dispatchWorker(toWorker.SAVE_NOW);
    await dispatchWorker(toWorker.LOAD_SAVE, { leagueId });
    expect(cache.getPlayer(walk.id)).toMatchObject({ teamId: null, status: 'free_agent' });
  }, 300000);

  it('rolls a failed Sim to Season back so the save is byte-identical', async () => {
    const id = await bootBuffalo('save_slot_3', 1919);
    cache.setMeta({ phase: 'draft', draftState: null });
    await dispatchWorker(toWorker.START_DRAFT, {}, { timeoutMs: 180000 });
    await dispatchWorker(toWorker.SAVE_NOW);
    const before = await dumpLeagueDb();
    const phaseBefore = cache.getMeta().phase;
    const pickIndexBefore = cache.getMeta().draftState.currentPickIndex;

    // Team-19-style failure: the rollover cannot reach 53 for one AI team.
    vi.spyOn(AiLogic, 'ensureMinimumRosters').mockResolvedValue({
      failures: [{ teamId: 19, rosterCount: 51, missing: 2 }],
      signedByTeam: new Map(),
      completionCandidateIdsByTeam: new Map(),
      teamsChecked: 32,
    });
    vi.spyOn(AiLogic, 'executeAICapManagement').mockResolvedValue({ failures: [], teamsManaged: 0 });

    const result = await dispatchWorker(toWorker.SIM_TO_PHASE, { targetPhase: 'preseason' }, { timeoutMs: 600000 });
    expect(result.type).toBe(toUI.FULL_STATE);
    expect(cache.getMeta().phase).toBe(phaseBefore);
    expect(cache.getMeta().draftState.currentPickIndex).toBe(pickIndexBefore);

    const after = await dumpLeagueDb();
    const changed = diffStores(before, after);
    expect(changed, 'league IndexedDB must be byte-identical after a failed transition').toEqual([]);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));

    // And reloading the save shows the same pre-attempt state.
    await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: id });
    expect(cache.getMeta().phase).toBe('draft');
    expect(cache.getMeta().draftState.currentPickIndex).toBe(pickIndexBefore);
  }, 700000);
});
