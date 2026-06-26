/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react';
import TradeCenter from '../TradeCenter.jsx';

function makePlayer(id, name, { pos = 'WR', ovr = 80, age = 26, baseAnnual = 6 } = {}) {
  return { id, name, pos, ovr, age, contract: { baseAnnual } };
}

function makeTeam(id, { abbr, capRoom = 20, roster = [], picks = [] } = {}) {
  return { id, name: `Team ${id}`, abbr: abbr ?? `T${id}`, wins: 5, losses: 5, ties: 0, capRoom, picks, roster };
}

const USER = makeTeam(1, { abbr: 'CHI', capRoom: 20, roster: [makePlayer(101, 'Give Guy', { baseAnnual: 8 })] });
const AI = makeTeam(2, { abbr: 'DET', capRoom: 30, roster: [makePlayer(201, 'Get Guy', { baseAnnual: 5 })] });

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

describe('TradeCenter — UX cleanup', () => {
  afterEach(cleanup);

  it('renders without selected assets and shows the "no assets selected" status', () => {
    const html = renderToString(<TradeCenter league={makeLeague()} actions={makeActions()} />);
    expect(html).toContain('No assets selected');
    expect(html).toContain('Clear Trade');
  });

  it('separates "Your Assets" and "Their Assets" and exposes Add to Trade / View Player affordances', async () => {
    const { findByText, findByLabelText } = render(
      <TradeCenter league={makeLeague()} actions={makeActions()} />,
    );
    // Rosters load asynchronously via getRoster (driven by mount effects).
    expect(await findByText('Your Assets · You Give')).toBeTruthy();
    expect(await findByText('Their Assets · You Receive')).toBeTruthy();
    expect(await findByLabelText(/Add to Trade Give Guy/i)).toBeTruthy();
    expect(await findByLabelText(/View Player Give Guy/i)).toBeTruthy();
  });

  it('shows the cap impact breakdown and "ready to propose" once assets are on both sides', async () => {
    const { findByLabelText, getByTestId } = render(
      <TradeCenter league={makeLeague()} actions={makeActions()} />,
    );

    fireEvent.click(await findByLabelText(/Add to Trade Give Guy/i));
    fireEvent.click(await findByLabelText(/Add to Trade Get Guy/i));

    await waitFor(() => {
      const cap = getByTestId('cap-impact-summary');
      // current 20, freed 8, absorbed 5 → projected 23.0
      expect(cap.textContent).toContain('$20.0M');
      expect(cap.textContent).toContain('+$8.0M');
      expect(cap.textContent).toContain('-$5.0M');
      expect(cap.textContent).toContain('$23.0M');
    });

    const banner = getByTestId('trade-status-banner');
    expect(banner.textContent).toContain('Package ready to propose');
    expect(banner.getAttribute('data-tone')).toBe('success');
  });

  it('renders exactly one cap projected-room display (no duplicate legacy block)', async () => {
    const { findByLabelText, getByTestId, queryAllByTestId, container } = render(
      <TradeCenter league={makeLeague()} actions={makeActions()} />,
    );

    fireEvent.click(await findByLabelText(/Add to Trade Give Guy/i));
    fireEvent.click(await findByLabelText(/Add to Trade Get Guy/i));

    await waitFor(() => {
      expect(getByTestId('cap-impact-summary')).toBeTruthy();
    });

    // Only the shared CapImpactSummary should render the projected-room readout.
    expect(queryAllByTestId('cap-impact-summary')).toHaveLength(1);
    // The legacy stacked "Cap After" block must be gone.
    expect(container.textContent).not.toContain('CAPSPACEAFTER');
    expect(container.textContent).not.toMatch(/CHI · Cap After/);
  });

  it('reports a rejected package clearly after a failed proposal', async () => {
    const { findByLabelText, getByTestId, getAllByText } = render(
      <TradeCenter league={makeLeague()} actions={makeActions()} />,
    );
    fireEvent.click(await findByLabelText(/Add to Trade Get Guy/i));
    fireEvent.click(getAllByText('Propose Trade')[0]);

    await waitFor(() => {
      expect(getByTestId('trade-status-banner').textContent).toContain('Trade rejected');
    });
  });
});
