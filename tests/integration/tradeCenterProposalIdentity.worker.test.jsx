/** @vitest-environment jsdom */
import 'fake-indexeddb/auto';
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import TradeCenter from '../../src/ui/components/TradeCenter.jsx';
import { loadWorkerModule, dispatchWorker } from '../../src/testSupport/dynastySoakRunner.js';
import { cache } from '../../src/db/cache.js';
import { Transactions } from '../../src/db/index.js';
import { DEFAULT_TEAMS } from '../../src/data/default-teams.js';
import { toWorker } from '../../src/worker/protocol.js';

afterEach(cleanup);
describe.sequential('Trade Center proposal through real worker', () => {
  beforeAll(async () => { await loadWorkerModule(); await dispatchWorker(toWorker.INIT); });
  for (const source of ['normal', 'fallback']) for (const mode of ['proposal', 'incoming_counter']) it(`${source} ${mode} preserves selected IDs, context, rosters and history`, async () => {
    const boot = await dispatchWorker(source === 'normal' ? toWorker.NEW_LEAGUE : toWorker.USE_SAFE_STARTER_LEAGUE, { teams: DEFAULT_TEAMS, slotKey: 'save_slot_2', options: { year: 2026, rngSeed: 1807, userTeamId: 0, salaryCap: 500 } });
    await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
    const outgoing = [...cache.getPlayersByTeam(0)].sort((a,b) => b.ovr-a.ovr)[0];
    const incoming = [...cache.getPlayersByTeam(1)].sort((a,b) => a.ovr-b.ovr)[0];
    const offer = { id: 'identity-counter', offeringTeamId: 1, offeringTeamAbbr: cache.getTeam(1).abbr, offering: { playerIds: [incoming.id], pickIds: [] }, receiving: { playerIds: [outgoing.id], pickIds: [] }, status: 'pending', isBlockOffer: false, week: 1, season: 1 };
    cache.setMeta({ tradeOffers: mode === 'incoming_counter' ? [offer] : [] });
    let result;
    const actions = {
      getRoster: vi.fn(async teamId => ({ payload: { team: structuredClone(cache.getTeam(teamId)), players: structuredClone(cache.getPlayersByTeam(teamId)) } })),
      submitTrade: vi.fn(async (fromTeamId, toTeamId, offering, receiving) => (result = await dispatchWorker(toWorker.TRADE_OFFER, { fromTeamId, toTeamId, offering, receiving }))),
      counterIncomingTrade: vi.fn(async (offerId, offering, receiving) => (result = await dispatchWorker(toWorker.COUNTER_INCOMING_TRADE, { offerId, offering, receiving }))),
      save: vi.fn(async () => dispatchWorker(toWorker.SAVE_NOW)),
    };
    const context = vi.fn();
    const league = { year: 2026, season: 1, seasonId: 's1', phase: 'regular', week: 1, userTeamId: 0, teams: structuredClone(cache.getAllTeams()), settings: cache.getMeta().settings, incomingTradeOffers: mode === 'incoming_counter' ? [offer] : [], inboundTradeOffers: [] };
    const view = render(<TradeCenter league={league} actions={actions} initialTradeContext={{ partnerTeamId: 1 }} onTradeContextChange={context} />);
    await view.findByRole('checkbox', { name: `Add to Trade ${outgoing.name}` });
    if (mode === 'incoming_counter') fireEvent.click(await view.findByText('Counter'));
    else {
      fireEvent.click(view.getByRole('checkbox', { name: `Add to Trade ${outgoing.name}` }));
      fireEvent.click(await view.findByRole('checkbox', { name: `Add to Trade ${incoming.name}` }));
    }
    await waitFor(() => expect(context.mock.calls.some(([c]) => c.outgoingPlayerIds.length === 1 && c.incomingPlayerIds.length === 1)).toBe(true));
    fireEvent.click(view.getAllByText(mode === 'proposal' ? 'Propose Trade' : 'Send Counter')[0]);
    const called = mode === 'proposal' ? actions.submitTrade : actions.counterIncomingTrade;
    await waitFor(() => expect(called).toHaveBeenCalledTimes(1));
    const args = called.mock.calls[0];
    expect(args.at(-2).playerIds).toEqual([outgoing.id]);
    expect(args.at(-1).playerIds).toEqual([incoming.id]);
    expect(context.mock.calls.some(([c]) => c.outgoingPlayerIds[0] === outgoing.id && c.incomingPlayerIds[0] === incoming.id)).toBe(true);
    await waitFor(() => expect(result?.payload.accepted, JSON.stringify(result?.payload)).toBe(true), { timeout: 30000 });
    expect(cache.getPlayer(outgoing.id).teamId).toBe(1);
    expect(cache.getPlayer(incoming.id).teamId).toBe(0);
    const transaction = (await Transactions.bySeason('s1')).find(t => t.type === 'TRADE');
    expect(transaction.details.offering.playerIds).toEqual([outgoing.id]);
    expect(transaction.details.receiving.playerIds).toEqual([incoming.id]);
    cleanup();
    await dispatchWorker(toWorker.SAVE_NOW);
    await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
    expect(cache.getPlayer(outgoing.id)).toMatchObject({ id: outgoing.id, teamId: 1, contract: outgoing.contract });
    expect(cache.getPlayer(incoming.id)).toMatchObject({ id: incoming.id, teamId: 0, contract: incoming.contract });
    expect((await Transactions.bySeason('s1')).find(t => t.id === transaction.id)).toEqual(transaction);
    for (const playerId of [NaN, null, true, {}, '', 'unknown-id']) {
      const invalid = await dispatchWorker(toWorker.TRADE_OFFER, { fromTeamId: 0, toTeamId: 1, offering: { playerIds: [playerId], pickIds: [] }, receiving: { playerIds: [outgoing.id], pickIds: [] } });
      expect(invalid.payload.accepted).toBe(false);
      expect(cache.getPlayer(outgoing.id).teamId).toBe(1);
      expect(cache.getPlayer(incoming.id).teamId).toBe(0);
    }
  }, 180000);
});
