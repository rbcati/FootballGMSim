/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react';
import TradeCenter from '../TradeCenter.jsx';
import TradeValueSummary from '../common/TradeValueSummary.jsx';
import { MOTIVATION_CODES, TRADE_BALANCE } from '../../selectors/deriveTradeContext.js';

function makePlayer(id, name, { pos = 'WR', ovr = 80, age = 26, baseAnnual = 6 } = {}) {
  return { id, name, pos, ovr, age, contract: { baseAnnual } };
}

function makeTeam(id, { abbr, capRoom = 20, roster = [], picks = [], frontOffice } = {}) {
  return { id, name: `Team ${id}`, abbr: abbr ?? `T${id}`, wins: 5, losses: 5, ties: 0, capRoom, picks, roster, frontOffice };
}

const USER = makeTeam(1, { abbr: 'CHI', capRoom: 20, roster: [makePlayer(101, 'Give Guy', { ovr: 84, age: 24, baseAnnual: 8 })] });
const AI = makeTeam(2, {
  abbr: 'DET',
  capRoom: 30,
  roster: [makePlayer(201, 'Get Guy', { pos: 'RB', ovr: 80, age: 31, baseAnnual: 5 })],
  frontOffice: { persona: 'WIN_NOW' },
});

function makeActions() {
  return {
    getRoster: vi.fn(async (tid) => {
      const team = Number(tid) === 1 ? USER : AI;
      return { payload: { team, players: team.roster } };
    }),
    submitTrade: vi.fn(async () => ({ payload: { accepted: false, reason: 'AI passed.' } })),
    acceptIncomingTrade: vi.fn(async () => ({ payload: { accepted: false } })),
    counterIncomingTrade: vi.fn(async () => ({ payload: { accepted: false } })),
    toggleTradeBlock: vi.fn(async () => ({})),
    save: vi.fn(),
  };
}

function makeLeague() {
  return {
    year: 2027,
    season: 2027,
    week: 3,
    phase: 'regular',
    userTeamId: 1,
    teams: [USER, AI],
    incomingTradeOffers: [],
    inboundTradeOffers: [],
    settings: { tradeDeadlineWeek: 9 },
  };
}

describe('TradeCenter — Trade Breakdown integration', () => {
  afterEach(cleanup);

  it('renders the Trade Breakdown section on the trade screen', async () => {
    const { findByText, getByTestId } = render(
      <TradeCenter league={makeLeague()} actions={makeActions()} />,
    );
    expect(await findByText('Trade Breakdown')).toBeTruthy();
    expect(getByTestId('trade-value-summary')).toBeTruthy();
  });

  it('shows neutral preview copy for an incomplete trade (no assets selected)', async () => {
    const { findByText } = render(
      <TradeCenter league={makeLeague()} actions={makeActions()} />,
    );
    expect(await findByText('Add players or picks to preview trade context.')).toBeTruthy();
  });

  it('keeps CapImpactSummary rendering alongside the breakdown once assets are selected', async () => {
    const { findByLabelText, getByTestId } = render(
      <TradeCenter league={makeLeague()} actions={makeActions()} />,
    );
    fireEvent.click(await findByLabelText(/Add to Trade Give Guy/i));
    fireEvent.click(await findByLabelText(/Add to Trade Get Guy/i));
    await waitFor(() => {
      expect(getByTestId('cap-impact-summary')).toBeTruthy();
      expect(getByTestId('trade-value-summary')).toBeTruthy();
    });
  });

  it('surfaces motivation copy without ever leaking raw signal codes into the DOM', async () => {
    const { findByLabelText, container, findByText } = render(
      <TradeCenter league={makeLeague()} actions={makeActions()} />,
    );
    // Give Guy (84 OVR) heading to a WIN_NOW front office → win-now motivation.
    fireEvent.click(await findByLabelText(/Add to Trade Give Guy/i));
    fireEvent.click(await findByLabelText(/Add to Trade Get Guy/i));
    expect(await findByText('Their interest:')).toBeTruthy();
    expect(await findByText('This fits a win-now roster push.')).toBeTruthy();

    const text = container.textContent;
    for (const code of Object.values(MOTIVATION_CODES)) {
      expect(text).not.toContain(code);
    }
    expect(text).not.toContain('FAVORABLE');
    expect(text).not.toContain('UNFAVORABLE');
  });

  it('renders exactly one Trade Breakdown (no duplicate balance displays)', async () => {
    const { findByLabelText, queryAllByTestId, getAllByText } = render(
      <TradeCenter league={makeLeague()} actions={makeActions()} />,
    );
    fireEvent.click(await findByLabelText(/Add to Trade Give Guy/i));
    fireEvent.click(await findByLabelText(/Add to Trade Get Guy/i));
    await waitFor(() => {
      expect(queryAllByTestId('trade-value-summary')).toHaveLength(1);
    });
    expect(getAllByText('Trade Breakdown')).toHaveLength(1);
  });

  it('leaves trade submit behavior unchanged (propose still calls submitTrade)', async () => {
    const actions = makeActions();
    const { findByLabelText, getAllByText, getByTestId } = render(
      <TradeCenter league={makeLeague()} actions={actions} />,
    );
    fireEvent.click(await findByLabelText(/Add to Trade Give Guy/i));
    fireEvent.click(await findByLabelText(/Add to Trade Get Guy/i));
    fireEvent.click(getAllByText('Propose Trade')[0]);

    await waitFor(() => {
      expect(actions.submitTrade).toHaveBeenCalledTimes(1);
      expect(getByTestId('trade-status-banner').textContent).toContain('Trade rejected');
    });
    expect(actions.submitTrade).toHaveBeenCalledWith(
      1,
      2,
      { playerIds: [101], pickIds: [] },
      { playerIds: [201], pickIds: [] },
    );
  });
});

describe('TradeValueSummary — class-based styling', () => {
  afterEach(cleanup);

  it('renders with Trade Breakdown classes instead of inline raw style values', () => {
    const context = {
      userBalance: TRADE_BALANCE.FAVORABLE,
      userBalanceLabel: 'This package leans in your favor.',
      motivationLabels: ['This fits a win-now roster push.'],
      capNote: 'Your cap room tightens after this deal.',
    };
    const { getByTestId, getByText } = render(<TradeValueSummary context={context} hasSelection />);
    const card = getByTestId('trade-value-summary');

    expect(card.classList.contains('trade-value-summary')).toBe(true);
    expect(card.querySelector('.trade-value-summary__eyebrow')).toBeTruthy();
    expect(card.querySelector('.trade-value-summary__value-row--favorable')).toBeTruthy();
    expect(getByText('Value read').classList.contains('trade-value-summary__pill')).toBe(true);
    expect(card.querySelectorAll('[style]')).toHaveLength(0);
  });
});

describe('TradeValueSummary — unavailable-context state', () => {
  afterEach(cleanup);

  it('shows "Limited trade context available." when a selection yields no readable context', () => {
    const context = {
      userBalance: TRADE_BALANCE.UNKNOWN,
      userBalanceLabel: 'Not enough selected to read this deal yet.',
      otherTeamMotivation: [],
      motivationLabels: [],
      capNote: null,
    };
    const { getByText } = render(<TradeValueSummary context={context} hasSelection />);
    expect(getByText('Limited trade context available.')).toBeTruthy();
  });

  it('shows the empty preview copy when nothing is selected', () => {
    const { getByText } = render(<TradeValueSummary context={undefined} hasSelection={false} />);
    expect(getByText('Add players or picks to preview trade context.')).toBeTruthy();
  });
});
