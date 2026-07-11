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

function makeLeague(offers = [makeIncomingOffer()], overrides = {}) {
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
    ...overrides,
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

  it('shows the outcome-unknown message and clears the pending state when the request rejects', async () => {
    const acceptIncomingTrade = vi.fn(async () => { throw new Error('Worker not ready'); });
    const actions = makeActions({ acceptIncomingTrade });
    const { findByText, getByText, queryByText } = render(<TradeCenter league={makeLeague()} actions={actions} />);

    await findByText('DET offered a deal');
    fireEvent.click(getByText('Accept'));

    await waitFor(() => expect(getByText('Trade Failed')).toBeTruthy());
    expect(queryByText('Trade Accepted!')).toBeNull();
    expect(getByText('Accept').disabled).toBe(false);
    // A worker timeout doesn't cancel the in-flight trade — the outcome is
    // unknown, not confirmed-failed, so the copy must not overclaim either way
    // and must not tell the user to just retry immediately.
    expect(getByText(/Trade outcome could not be confirmed/i)).toBeTruthy();
    expect(getByText(/Reload before retrying/i)).toBeTruthy();
    expect(queryByText(/Please try again/i)).toBeNull();
    expect(queryByText(/No roster changes were made/i)).toBeNull();
  });

  it('shows the outcome-unknown message when the response resolves without a usable payload', async () => {
    const acceptIncomingTrade = vi.fn(async () => undefined);
    const actions = makeActions({ acceptIncomingTrade });
    const { findByText, getByText, queryByText } = render(<TradeCenter league={makeLeague()} actions={actions} />);

    await findByText('DET offered a deal');
    fireEvent.click(getByText('Accept'));

    await waitFor(() => expect(getByText('Trade Failed')).toBeTruthy());
    expect(queryByText('Trade Accepted!')).toBeNull();
    expect(getByText('Accept').disabled).toBe(false);
    expect(getByText(/Trade outcome could not be confirmed/i)).toBeTruthy();
    expect(queryByText(/Please try again/i)).toBeNull();
    expect(queryByText(/No roster changes were made/i)).toBeNull();
  });

  it('surfaces an explicit unsuccessful result without crashing or claiming success', async () => {
    const acceptIncomingTrade = vi.fn(async () => ({ payload: { accepted: false, reason: 'Offer expired or no longer available.' } }));
    const actions = makeActions({ acceptIncomingTrade });
    const { findByText, getByText, queryByText } = render(<TradeCenter league={makeLeague()} actions={actions} />);

    await findByText('DET offered a deal');
    fireEvent.click(getByText('Accept'));

    await waitFor(() => expect(getByText('Trade Rejected')).toBeTruthy());
    expect(queryByText('Trade Accepted!')).toBeNull();
    // A confirmed rejection is unaffected by the outcome-unknown copy change —
    // it still shows the worker-provided reason verbatim.
    expect(getByText('Offer expired or no longer available.')).toBeTruthy();
    expect(queryByText(/Trade outcome could not be confirmed/i)).toBeNull();
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

  it('treats an empty payload object as a malformed result, not a legitimate rejection', async () => {
    const acceptIncomingTrade = vi.fn(async () => ({ payload: {} }));
    const actions = makeActions({ acceptIncomingTrade });
    const { findByText, getByText, queryByText } = render(<TradeCenter league={makeLeague()} actions={actions} />);

    await findByText('DET offered a deal');
    fireEvent.click(getByText('Accept'));

    await waitFor(() => expect(getByText('Trade Failed')).toBeTruthy());
    expect(queryByText('Trade Rejected')).toBeNull();
    expect(queryByText('Trade Accepted!')).toBeNull();
    expect(getByText(/Trade outcome could not be confirmed/i)).toBeTruthy();
    expect(queryByText(/Please try again/i)).toBeNull();
  });

  it('keeps showing "Trade Accepted!" even when post-commit chronicle sync fails', async () => {
    const acceptIncomingTrade = vi.fn(async () => ({ payload: { accepted: true, reason: 'DET deal accepted.' } }));
    const updateFranchiseChronicle = vi.fn(async () => { throw new Error('chronicle write failed'); });
    const actions = makeActions({ acceptIncomingTrade, updateFranchiseChronicle });
    const league = makeLeague([makeIncomingOffer()], { franchiseChronicle: [] });
    const { findByText, getByText, queryByText } = render(<TradeCenter league={league} actions={actions} />);

    await findByText('DET offered a deal');
    fireEvent.click(getByText('Accept'));

    await waitFor(() => expect(getByText('Trade Accepted!')).toBeTruthy());
    // The trade committed on the worker side — a follow-up sync failure must
    // never relabel it as failed or claim no roster changes were made.
    expect(queryByText('Trade Failed')).toBeNull();
    expect(queryByText(/No roster changes were made/i)).toBeNull();
    await waitFor(() => expect(getByText(/could not refresh/i)).toBeTruthy());
  });

  it('never shows "No roster changes were made" for a post-commit follow-up failure', async () => {
    const acceptIncomingTrade = vi.fn(async () => ({ payload: { accepted: true, reason: 'DET deal accepted.' } }));
    const updateFranchiseChronicle = vi.fn(async () => { throw new Error('chronicle write failed'); });
    const actions = makeActions({ acceptIncomingTrade, updateFranchiseChronicle });
    const league = makeLeague([makeIncomingOffer()], { franchiseChronicle: [] });
    const { findByText, getByText, queryByText } = render(<TradeCenter league={league} actions={actions} />);

    await findByText('DET offered a deal');
    fireEvent.click(getByText('Accept'));

    await waitFor(() => expect(getByText('Trade Accepted!')).toBeTruthy());
    expect(queryByText(/No roster changes were made/i)).toBeNull();
  });

  it('shows neutral "Trade action failed" status copy for a worker/transport error, not a data-integrity diagnosis', async () => {
    const acceptIncomingTrade = vi.fn(async () => { throw new Error('Worker timeout'); });
    const actions = makeActions({ acceptIncomingTrade });
    const { findByText, getByText, getByTestId, queryByText } = render(<TradeCenter league={makeLeague()} actions={actions} />);

    await findByText('DET offered a deal');
    fireEvent.click(getByText('Accept'));

    await waitFor(() => expect(getByText('Trade Failed')).toBeTruthy());
    const banner = getByTestId('trade-status-banner');
    expect(banner.textContent).toContain('Trade action failed');
    expect(banner.textContent).not.toContain('Missing team or player data');
    expect(queryByText('Invalid trade')).toBeNull();
  });
});
