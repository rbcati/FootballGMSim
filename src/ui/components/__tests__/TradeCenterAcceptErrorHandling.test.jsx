/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react';
import TradeCenter from '../TradeCenter.jsx';

function makePlayer(id, name, { pos = 'WR', ovr = 80, age = 26, baseAnnual = 6 } = {}) {
  return { id, name, pos, ovr, age, contract: { baseAnnual } };
}

function makeTeam(id, { abbr, capRoom = 20, roster = [], picks = [] } = {}) {
  return { id, name: `Team ${id}`, abbr: abbr ?? `T${id}`, wins: 5, losses: 5, ties: 0, capRoom, picks, roster };
}

const USER = makeTeam(1, { abbr: 'CHI', capRoom: 20, roster: [makePlayer(101, 'User Guy', { baseAnnual: 8 })] });
const AI = makeTeam(2, { abbr: 'DET', capRoom: 30, roster: [makePlayer(201, 'AI Guy', { baseAnnual: 5 })] });

function makeIncomingOffer(overrides = {}) {
  return {
    id: 'offer-1',
    offeringTeamId: 2,
    offeringTeamAbbr: 'DET',
    offering: { playerIds: [201], pickIds: [] },
    receiving: { playerIds: [101], pickIds: [] },
    reason: 'DET wants to add a receiver.',
    offerType: 'market_offer',
    urgency: 'standard',
    ...overrides,
  };
}

function makeActions(overrides = {}) {
  return {
    getRoster: vi.fn(async (tid) => {
      const team = Number(tid) === 1 ? USER : AI;
      return { payload: { team, players: team.roster } };
    }),
    submitTrade: vi.fn(async () => ({ payload: { accepted: false, reason: 'unused' } })),
    counterIncomingTrade: vi.fn(async () => ({ payload: { accepted: false } })),
    rejectIncomingTrade: vi.fn(),
    toggleTradeBlock: vi.fn(async () => ({})),
    save: vi.fn(),
    ...overrides,
  };
}

function makeLeague(offers = [makeIncomingOffer()]) {
  return {
    year: 2027,
    season: 2027,
    week: 3,
    phase: 'regular',
    userTeamId: 1,
    teams: [USER, AI],
    incomingTradeOffers: offers,
    inboundTradeOffers: [],
    settings: { tradeDeadlineWeek: 9 },
  };
}

describe('TradeCenter — accept incoming trade error handling', () => {
  afterEach(cleanup);

  it('runs the existing success path on a confirmed accepted response', async () => {
    const acceptIncomingTrade = vi.fn(async () => ({ payload: { accepted: true, reason: 'DET deal accepted.' } }));
    const actions = makeActions({ acceptIncomingTrade });
    const { findByText, getByText } = render(<TradeCenter league={makeLeague()} actions={actions} />);

    await findByText('DET offered a deal');
    fireEvent.click(getByText('Accept'));

    await waitFor(() => expect(acceptIncomingTrade).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getByText('Trade Accepted!')).toBeTruthy());
    await waitFor(() => expect(actions.getRoster).toHaveBeenCalledWith(2));
  });

  it('shows a visible error and clears the pending state when the request rejects', async () => {
    const acceptIncomingTrade = vi.fn(async () => { throw new Error('Worker not ready'); });
    const actions = makeActions({ acceptIncomingTrade });
    const { findByText, getByText, queryByText } = render(<TradeCenter league={makeLeague()} actions={actions} />);

    await findByText('DET offered a deal');
    fireEvent.click(getByText('Accept'));

    await waitFor(() => expect(getByText('Trade Failed')).toBeTruthy());
    expect(queryByText('Trade Accepted!')).toBeNull();
    expect(getByText('Accept').disabled).toBe(false);
  });

  it('shows an error when the response resolves without a usable payload', async () => {
    const acceptIncomingTrade = vi.fn(async () => undefined);
    const actions = makeActions({ acceptIncomingTrade });
    const { findByText, getByText, queryByText } = render(<TradeCenter league={makeLeague()} actions={actions} />);

    await findByText('DET offered a deal');
    fireEvent.click(getByText('Accept'));

    await waitFor(() => expect(getByText('Trade Failed')).toBeTruthy());
    expect(queryByText('Trade Accepted!')).toBeNull();
    expect(getByText('Accept').disabled).toBe(false);
  });

  it('surfaces an explicit unsuccessful result without crashing or claiming success', async () => {
    const acceptIncomingTrade = vi.fn(async () => ({ payload: { accepted: false, reason: 'Offer expired or no longer available.' } }));
    const actions = makeActions({ acceptIncomingTrade });
    const { findByText, getByText, queryByText } = render(<TradeCenter league={makeLeague()} actions={actions} />);

    await findByText('DET offered a deal');
    fireEvent.click(getByText('Accept'));

    await waitFor(() => expect(getByText('Trade Rejected')).toBeTruthy());
    expect(queryByText('Trade Accepted!')).toBeNull();
  });

  it('blocks a second submission while the first request is still pending', async () => {
    let resolveAccept;
    const acceptIncomingTrade = vi.fn(() => new Promise((resolve) => { resolveAccept = resolve; }));
    const actions = makeActions({ acceptIncomingTrade });
    const { findByText, getByText } = render(<TradeCenter league={makeLeague()} actions={actions} />);

    await findByText('DET offered a deal');
    fireEvent.click(getByText('Accept'));
    fireEvent.click(getByText('Accepting…'));
    fireEvent.click(getByText('Accepting…'));

    expect(acceptIncomingTrade).toHaveBeenCalledTimes(1);
    resolveAccept({ payload: { accepted: true, reason: 'DET deal accepted.' } });
    await waitFor(() => expect(getByText('Trade Accepted!')).toBeTruthy());
  });

  it('does not trigger success cleanup or roster refresh on a failed acceptance', async () => {
    const acceptIncomingTrade = vi.fn(async () => { throw new Error('Worker timeout'); });
    const actions = makeActions({ acceptIncomingTrade });
    const { findByText, getByText } = render(<TradeCenter league={makeLeague()} actions={actions} />);

    await findByText('DET offered a deal');
    const rosterCallsBefore = actions.getRoster.mock.calls.length;
    fireEvent.click(getByText('Accept'));

    await waitFor(() => expect(getByText('Trade Failed')).toBeTruthy());
    expect(actions.getRoster.mock.calls.length).toBe(rosterCallsBefore);
  });

  it('clears a prior error banner once a retry succeeds', async () => {
    const acceptIncomingTrade = vi.fn()
      .mockImplementationOnce(async () => { throw new Error('Worker not ready'); })
      .mockImplementationOnce(async () => ({ payload: { accepted: true, reason: 'DET deal accepted.' } }));
    const actions = makeActions({ acceptIncomingTrade });
    const { findByText, getByText, queryByText } = render(<TradeCenter league={makeLeague()} actions={actions} />);

    await findByText('DET offered a deal');
    fireEvent.click(getByText('Accept'));
    await waitFor(() => expect(getByText('Trade Failed')).toBeTruthy());

    fireEvent.click(getByText('Accept'));
    await waitFor(() => expect(getByText('Trade Accepted!')).toBeTruthy());
    expect(queryByText('Trade Failed')).toBeNull();
  });
});
