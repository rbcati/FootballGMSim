import 'fake-indexeddb/auto';
import { beforeAll, describe, it, expect } from 'vitest';
import { loadWorkerModule, dispatchWorker } from '../../src/testSupport/dynastySoakRunner.js';
import { toWorker, toUI } from '../../src/worker/protocol.js';
import { DEFAULT_TEAMS } from '../../src/data/default-teams.js';
import { cache } from '../../src/db/cache.js';
import { DraftPicks, getActiveLeagueId } from '../../src/db/index.js';
import { validateTradePickAssets } from '../../src/core/trades/draftPickIntegrity.js';

const copy = value => JSON.parse(JSON.stringify(value));

describe('fallback draft assets through worker persistence and draft entry', () => {
  beforeAll(async () => { await loadWorkerModule(); await dispatchWorker(toWorker.INIT); });
  for (const year of [2025, 2026, 2031]) {
    it(`persists tradable assets and exposes the ${year} draft on entry`, async () => {
      const boot = await dispatchWorker(toWorker.NEW_LEAGUE, { teams: DEFAULT_TEAMS, options: { year, userTeamId: 21, difficulty: 'Hard', salaryCap: 301.2, rngSeed: 1806 + year } });
      expect(boot.type).toBe(toUI.FULL_STATE);
      expect(boot.payload).toMatchObject({ year, userTeamId: 21 });
      expect(cache.getMeta().settings.difficultyPreset).toBe('Hard');
      const before = copy(cache.getAllDraftPicks());
      expect(before).toHaveLength(672);
      expect([...new Set(before.map(p => p.season))].sort()).toEqual([year, year + 1, year + 2]);
      await dispatchWorker(toWorker.SAVE_NOW);
      expect(await DraftPicks.loadAll()).toEqual(expect.arrayContaining(before));
      await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
      expect(await DraftPicks.loadAll()).toEqual(expect.arrayContaining(before));
      for (const team of cache.getAllTeams()) {
        expect(validateTradePickAssets({ teams: cache.getAllTeams() }, team.picks.map(p => p.id), team.id).valid).toBe(true);
        expect(team.picks.filter(p => p.season === year)).toHaveLength(7);
      }
      // Enter the real draft initializer at its phase boundary; no simulated
      // seasons or reimplemented draft rules are needed to verify availability.
      cache.setMeta({ phase: 'draft', draftState: null });
      const draft = await dispatchWorker(toWorker.GET_DRAFT_STATE);
      expect(draft.type).toBe(toUI.DRAFT_STATE);
      const state = cache.getMeta().draftState;
      expect(state.picks).toHaveLength(224);
      for (const team of cache.getAllTeams()) {
        expect(state.picks.filter(p => p.teamId === team.id)).toHaveLength(7);
      }
      expect(state.picks.every(p => p.id.startsWith(`${year}-`))).toBe(true);
      expect(await DraftPicks.loadAll()).toEqual(expect.arrayContaining(before));
    }, 60000);
  }
  it('leaves historical IDs, years and traded ownership untouched on load', async () => {
    const historical = { id: 'legacy-pick-1999-r2', season: 1999, round: 2, originalOwner: 4, currentOwner: 21, isCompensatory: false };
    cache.setDraftPick(historical);
    cache.updateTeam(21, { picks: [...cache.getTeam(21).picks, historical] });
    await dispatchWorker(toWorker.SAVE_NOW);
    await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: getActiveLeagueId() });
    expect((await DraftPicks.loadAll()).find(p => p.id === historical.id)).toEqual(historical);
    expect(cache.getTeam(21).picks.find(p => p.id === historical.id)).toEqual(historical);
  }, 60000);
});
