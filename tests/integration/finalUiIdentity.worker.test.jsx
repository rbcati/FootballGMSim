/** @vitest-environment jsdom */
import 'fake-indexeddb/auto';
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import Roster from '../../src/ui/components/Roster.jsx';
import { loadWorkerModule, dispatchWorker } from '../../src/testSupport/dynastySoakRunner.js';
import { cache } from '../../src/db/cache.js';
import { Transactions } from '../../src/db/index.js';
import { DEFAULT_TEAMS } from '../../src/data/default-teams.js';
import { toWorker } from '../../src/worker/protocol.js';

const snapshot = () => new Map(cache.getAllPlayers().map(p => [p.id, JSON.stringify(p)]));
function unchanged(before, released = []) {
  for (const p of cache.getAllPlayers()) if (!released.includes(p.id)) {
    const old = JSON.parse(before.get(p.id));
    if (p.teamId === 0 && released.length) {
      // Production release legitimately repairs surviving teammates' depth rows.
      const { depthOrder: a, depthChart: b, ...actual } = p;
      const { depthOrder: c, depthChart: d, ...expected } = old;
      expect(actual).toEqual(expected);
    } else expect(JSON.stringify(p)).toBe(before.get(p.id));
  }
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe.sequential('actual roster bulk-release UI and worker', () => {
  beforeAll(async () => { await loadWorkerModule(); await dispatchWorker(toWorker.INIT); });
  for (const source of ['normal','fallback']) it(`${source}: cancel then confirm releases exactly two selected players and persists`, async () => {
    const boot = await dispatchWorker(source === 'normal' ? toWorker.NEW_LEAGUE : toWorker.USE_SAFE_STARTER_LEAGUE, { teams: DEFAULT_TEAMS, slotKey:'save_slot_2', options:{year:2026,rngSeed:1807,userTeamId:0,salaryCap:500} });
    await dispatchWorker(toWorker.LOAD_SAVE, {leagueId:boot.payload.activeLeagueId});
    const roster = cache.getPlayersByTeam(0);
    const selected = [...roster.filter(p => p.pos === 'WR')].sort((a,b) => (b.depthChart?.order ?? 99)-(a.depthChart?.order ?? 99)).slice(0,2);
    const ids = selected.map(p => p.id);
    const before = snapshot();
    const alert = vi.spyOn(window,'alert').mockImplementation(() => {});
    const actions = {
      getRoster: vi.fn(async id => ({payload:{team:structuredClone(cache.getTeam(id)),players:structuredClone(cache.getPlayersByTeam(id))}})),
      bulkReleasePlayers: vi.fn(async (teamId,playerIds) => dispatchWorker(toWorker.BULK_RELEASE_PLAYERS,{teamId,playerIds})),
    };
    const league = { year:2026,week:1,phase:'regular',userTeamId:0,teams:structuredClone(cache.getAllTeams()),settings:cache.getMeta().settings };
    const view = render(<Roster league={league} actions={actions} initialState={{view:'table',filter:'ALL'}} initialViewMode="table" />);
    fireEvent.click(await view.findByRole('button',{name:/bulk cut mode off/i}));
    for (const p of selected) fireEvent.click(await view.findByRole('checkbox',{name:`Select ${p.name}`}));
    fireEvent.click(view.getByRole('button',{name:/preview bulk release/i}));
    fireEvent.click(view.getByRole('button',{name:'Cancel',exact:true}));
    expect(actions.bulkReleasePlayers).not.toHaveBeenCalled();
    unchanged(before);
    fireEvent.click(view.getByRole('button',{name:/preview bulk release/i}));
    fireEvent.click(view.getByRole('button',{name:/confirm bulk release/i}));
    await waitFor(() => expect(actions.bulkReleasePlayers).toHaveBeenCalledTimes(1));
    expect(new Set(actions.bulkReleasePlayers.mock.calls[0][1])).toEqual(new Set(ids));
    await act(async () => { await actions.bulkReleasePlayers.mock.results[0].value; });
    await waitFor(() => expect(cache.getPlayersByTeam(0)).toHaveLength(roster.length-2));
    await waitFor(() => expect(view.queryByRole('dialog',{name:/bulk release preview/i})).toBeNull());
    expect(alert).not.toHaveBeenCalled();
    for (const id of ids) expect(cache.getPlayer(id)).toMatchObject({id,teamId:null,status:'free_agent'});
    unchanged(before,ids);
    const releases = (await Transactions.bySeason('s1')).filter(t => t.type === 'RELEASE');
    expect(releases).toHaveLength(2);
    expect(new Set(releases.map(t => t.details.playerId))).toEqual(new Set(ids));
    cleanup();
    await dispatchWorker(toWorker.SAVE_NOW);
    await dispatchWorker(toWorker.LOAD_SAVE,{leagueId:boot.payload.activeLeagueId});
    expect(cache.getPlayersByTeam(0)).toHaveLength(roster.length-2);
    unchanged(before,ids);
    expect((await Transactions.bySeason('s1')).filter(t => t.type === 'RELEASE')).toEqual(releases);
    const after = snapshot();
    const ignored = await dispatchWorker(toWorker.BULK_RELEASE_PLAYERS,{teamId:0,playerIds:[null,'',{},true,NaN]});
    expect(ignored.payload.released).toEqual([]);
    await expect(dispatchWorker(toWorker.BULK_RELEASE_PLAYERS,{teamId:0,playerIds:['unknown-id']})).rejects.toThrow('Player not found');
    await expect(dispatchWorker(toWorker.BULK_RELEASE_PLAYERS,{teamId:0,playerIds:[ids[0],ids[0],String(ids[0])]})).rejects.toThrow('not on selected roster');
    unchanged(after);
    expect((await Transactions.bySeason('s1')).filter(t => t.type === 'RELEASE')).toHaveLength(2);
  },180000);
});
