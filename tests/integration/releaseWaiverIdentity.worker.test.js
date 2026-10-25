import 'fake-indexeddb/auto';
import { beforeAll, describe, it, expect } from 'vitest';
import { loadWorkerModule, dispatchWorker } from '../../src/testSupport/dynastySoakRunner.js';
import { cache } from '../../src/db/cache.js';
import { DEFAULT_TEAMS } from '../../src/data/default-teams.js';
import { canTeamClaimWaiverPlayer } from '../../src/core/transactions/waiverEngine.js';
import { toWorker } from '../../src/worker/protocol.js';

const snapshot = () => new Map(cache.getAllPlayers().map(p => [p.id, JSON.stringify(p)]));
const unchangedExcept = (before, ids, allowUserDepthRepair = false) => {
  for (const p of cache.getAllPlayers()) if (!ids.includes(p.id)) {
    const previous = JSON.parse(before.get(p.id));
    if (allowUserDepthRepair && p.teamId === 0) {
      // Releasing a player intentionally rebuilds the remaining team's depth
      // assignments. Every other field and every other team's player is stable.
      const { depthChart: _chart, depthOrder: _order, ...actual } = p;
      const { depthChart: _oldChart, depthOrder: _oldOrder, ...expected } = previous;
      expect(actual).toEqual(expected);
    } else expect(JSON.stringify(p)).toBe(before.get(p.id));
  }
};

describe.sequential('release and waiver worker identity', () => {
  beforeAll(async () => { await loadWorkerModule(); await dispatchWorker(toWorker.INIT); });
  for (const source of ['normal', 'fallback']) describe.sequential(source, () => {
    let boot;
    beforeAll(async () => {
      boot = source === 'normal'
        ? await dispatchWorker(toWorker.NEW_LEAGUE, { teams: DEFAULT_TEAMS, options: { year: 2026, rngSeed: 1812, userTeamId: 0, salaryCap: 301.2 } })
        : await dispatchWorker(toWorker.USE_SAFE_STARTER_LEAGUE, { slotKey: 'save_slot_2', options: { year: 2026, rngSeed: 1812, userTeamId: 0, salaryCap: 301.2 } });
      await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
    }, 60000);

    it('bulk releases only distinct selected players, retaining stored IDs after reload', async () => {
      const selected = cache.getPlayersByTeam(0).slice(-2);
      const ids = selected.map(p => p.id);
      const before = snapshot();
      const result = await dispatchWorker(toWorker.BULK_RELEASE_PLAYERS, { teamId: 0, playerIds: [ids[0], String(ids[0]), ids[1]] });
      console.log('BULK RELEASE REPRO', source, JSON.stringify(result.payload));
      expect(result.payload).toEqual({ ok: true, released: ids });
      for (const id of ids) expect(cache.getPlayer(id)).toMatchObject({ id, teamId: null, status: 'free_agent' });
      unchangedExcept(before, ids, true);
      await dispatchWorker(toWorker.SAVE_NOW);
      await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
      for (const id of ids) expect(cache.getPlayer(id)).toMatchObject({ id, teamId: null, status: 'free_agent' });
      unchangedExcept(before, ids, true);
      const after = snapshot();
      const ignored = await dispatchWorker(toWorker.BULK_RELEASE_PLAYERS, { teamId: 0, playerIds: [null, '', true, {}, NaN] });
      expect(ignored.payload).toEqual({ ok: true, released: [] });
      unchangedExcept(after, []);
      await expect(dispatchWorker(toWorker.BULK_RELEASE_PLAYERS, { teamId: 0, playerIds: ['unknown-id'] })).rejects.toThrow('Player not found');
      unchangedExcept(after, []);
    }, 60000);

    it('accepts a real released player on waivers without changing player IDs or claim rules', async () => {
      cache.setMeta({ currentWeek: 12 });
      // Make cap space using the real release path, rather than bypassing the
      // production cap eligibility check or inventing a test salary.
      const outgoing = [...cache.getPlayersByTeam(0)].sort((a, b) => b.contract.baseAnnual - a.contract.baseAnnual)[0];
      await dispatchWorker(toWorker.RELEASE_PLAYER, { playerId: outgoing.id, teamId: 0 });
      const team = cache.getTeam(0);
      const player = cache.getAllPlayers().find(p => p.teamId !== 0 && p.teamId != null && canTeamClaimWaiverPlayer(team, { ...p, waiverContract: p.contract }));
      expect(player).toBeTruthy();
      await dispatchWorker(toWorker.RELEASE_PLAYER, { playerId: player.id, teamId: player.teamId });
      expect(cache.getPlayer(player.id).waiverStatus).toBe('ACTIVE');
      const before = snapshot();
      await dispatchWorker(toWorker.SUBMIT_WAIVER_CLAIM, { playerId: String(player.id) });
      expect(cache.getMeta().activeWaiverClaims).toEqual(expect.arrayContaining([expect.objectContaining({ playerId: String(player.id), teamId: 0, submittedWeek: 12 })]));
      unchangedExcept(before, []);
      await expect(dispatchWorker(toWorker.SUBMIT_WAIVER_CLAIM, { playerId: player.id })).rejects.toThrow('CLAIM_ALREADY_EXISTS');
      for (const playerId of ['unknown-id', null, '', true, {}, NaN]) await expect(dispatchWorker(toWorker.SUBMIT_WAIVER_CLAIM, { playerId })).rejects.toThrow('PLAYER_NOT_ON_WAIVERS');
      await dispatchWorker(toWorker.SAVE_NOW);
      await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
      expect(cache.getPlayer(player.id)).toMatchObject({ id: player.id, waiverStatus: 'ACTIVE' });
      expect(cache.getMeta().activeWaiverClaims).toEqual(expect.arrayContaining([expect.objectContaining({ playerId: String(player.id), teamId: 0 })]));
      unchangedExcept(before, []);
      cache.setMeta({ currentWeek: 1 });
      await expect(dispatchWorker(toWorker.SUBMIT_WAIVER_CLAIM, { playerId: player.id })).rejects.toThrow('WAIVERS_CLOSED');
    }, 60000);
  });
});
