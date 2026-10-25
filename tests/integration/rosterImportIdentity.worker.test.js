import 'fake-indexeddb/auto';
import { beforeAll, describe, it, expect } from 'vitest';
import { loadWorkerModule, dispatchWorker } from '../../src/testSupport/dynastySoakRunner.js';
import { cache } from '../../src/db/cache.js';
import { Players } from '../../src/db/index.js';
import { DEFAULT_TEAMS } from '../../src/data/default-teams.js';
import { toWorker, toUI } from '../../src/worker/protocol.js';

const snapshot = () => new Map(cache.getAllPlayers().map(p => [p.id, JSON.stringify(p)]));
const imported = (p, name) => ({ id: p.id, name, age: p.age, pos: p.pos, ovr: p.ovr, potential: p.potential ?? p.pot ?? p.ovr, teamId: p.teamId });
const sendImport = players => dispatchWorker(toWorker.IMPORT_CUSTOM_ROSTER, { roster: { players } }, { timeoutMs: 30000 });
const unchangedExcept = (before, ids) => {
  for (const p of cache.getAllPlayers()) if (!ids.includes(p.id)) expect(JSON.stringify(p), `unchanged player ${p.id}`).toBe(before.get(p.id));
};

describe.sequential('real-worker roster import identity', () => {
  beforeAll(async () => { await loadWorkerModule(); await dispatchWorker(toWorker.INIT); });
  for (const source of ['normal', 'fallback']) it(`${source}: imports only matching players, preserves ID types and persists without rewriting others`, async () => {
    const boot = source === 'normal'
      ? await dispatchWorker(toWorker.NEW_LEAGUE, { teams: DEFAULT_TEAMS, options: { year: 2026, userTeamId: 0, salaryCap: 301.2, rngSeed: 1807 } })
      : await dispatchWorker(toWorker.USE_SAFE_STARTER_LEAGUE, { slotKey: 'save_slot_3', options: { year: 2026, userTeamId: 0, rngSeed: 1807 } });
    expect(boot.type).toBe(toUI.FULL_STATE);
    // Establish the existing load normalization baseline independently of import.
    await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
    await dispatchWorker(toWorker.SAVE_NOW);
    const before = snapshot();
    expect(before.size).toBe(1696);
    const [first, second] = cache.getAllPlayers().map(p => structuredClone(p));
    expect(typeof first.id).toBe(source === 'normal' ? 'string' : 'number');
    const reply = await sendImport([{ ...imported(first, 'One imported player'), age: first.age + 1, ovr: first.ovr + 1 }]);
    const changedIds = cache.getAllPlayers().filter(p => JSON.stringify(p) !== before.get(p.id)).map(p => p.id);
    console.log('IMPORT REPRO', JSON.stringify({ source, population: before.size, message: reply.payload.message, changed: changedIds.length }));
    expect(reply.payload).toMatchObject({ ok: true, message: 'Imported 1 player records.' });
    expect(changedIds).toEqual([first.id]);
    expect(cache.getPlayer(first.id)).toMatchObject({ id: first.id, name: 'One imported player', age: first.age + 1, ovr: first.ovr + 1, ratings: first.ratings, contract: first.contract });
    unchangedExcept(before, [first.id]);

    // Canonical numeric aliases must target the original numeric entity without
    // replacing its persisted ID type; opaque IDs remain distinct.
    const next = await sendImport([
      { ...imported(first, 'First distinct import'), id: source === 'fallback' ? String(first.id) : first.id },
      imported(second, 'Second distinct import'),
    ]);
    expect(next.payload.message).toBe('Imported 2 player records.');
    expect(cache.getPlayer(first.id)).toMatchObject({ id: first.id, name: 'First distinct import' });
    expect(cache.getPlayer(second.id)).toMatchObject({ id: second.id, name: 'Second distinct import' });
    unchangedExcept(before, [first.id, second.id]);

    for (const id of ['unknown-player', null, '', '   ', {}, [], true, false, NaN, Infinity]) {
      const prior = snapshot();
      const result = await sendImport([{ ...imported(first, 'Must not apply'), id }]);
      expect(result.payload.message).toBe('Imported 0 player records.');
      unchangedExcept(prior, []);
    }
    await dispatchWorker(toWorker.SAVE_NOW);
    const expected = snapshot();
    const persisted = new Map((await Players.loadAll()).map(p => [p.id, JSON.stringify(p)]));
    for (const [id, bytes] of expected) expect(persisted.get(id), `persisted ${id}`).toBe(bytes);
    await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
    unchangedExcept(expected, []);
    expect(snapshot().size).toBe(before.size);
  }, 180000);
});
