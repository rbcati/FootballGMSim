/** @vitest-environment jsdom */
import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import ExtensionNegotiationModal from '../ExtensionNegotiationModal.jsx';
import CapImpactSummary from '../common/CapImpactSummary.jsx';
import { __resetStableRouteRequestCache } from '../../hooks/useStableRouteRequest.js';

/**
 * Scouting Intel integration — the re-sign / extension modal surfaces the
 * display-only NegotiationContextPanel above the offer area, without
 * duplicating the existing Negotiation Stance section (PR #1634) and without
 * changing offer submission behavior.
 */

const league = { seasonId: 2026, year: 2026, week: 8 };

function expiringStar(overrides = {}) {
  return {
    id: 42,
    name: 'Marcus Lane',
    pos: 'WR',
    age: 29,
    ovr: 88,
    potential: 90,
    morale: 72,
    schemeFit: 78,
    tenureYears: 5,
    contract: { baseAnnual: 18, years: 1, yearsTotal: 4 },
    negotiationState: { negotiationsFrozenUntilSeason: null },
    ...overrides,
  };
}

function contenderTeam(overrides = {}) {
  return {
    id: 1,
    name: 'Contenders',
    wins: 13,
    losses: 4,
    ties: 0,
    frontOffice: { persona: 'WIN_NOW' },
    ...overrides,
  };
}

const resolvedAsk = {
  years: 3,
  yearsTotal: 3,
  baseAnnual: 24.5,
  signingBonus: 10,
  guaranteedPct: 0.6,
  willingness: 0.55,
  profileHeadline: 'Money-focused',
  marketHeat: 1.3,
  marketHeatLabel: 'Warm',
};

function makeActions(overrides = {}) {
  return {
    getExtensionAsk: vi.fn(async () => ({ payload: { ask: resolvedAsk } })),
    extendContract: vi.fn(async () => ({ payload: { status: 'accepted' } })),
    ...overrides,
  };
}

function renderModal({ actions = makeActions(), player = expiringStar(), onComplete = () => {}, onClose = () => {} } = {}) {
  return render(
    <ExtensionNegotiationModal
      player={player}
      actions={actions}
      teamId={1}
      team={contenderTeam()}
      league={league}
      currentSeason={2026}
      onClose={onClose}
      onComplete={onComplete}
    />,
  );
}

describe('ExtensionNegotiationModal — Scouting Intel panel wiring', () => {
  beforeEach(() => __resetStableRouteRequestCache());
  afterEach(cleanup);

  it('renders the NegotiationContextPanel once the ask resolves', async () => {
    const { getByTestId, getByText } = renderModal();
    await waitFor(() => expect(getByTestId('negotiation-context-panel')).toBeTruthy());
    expect(getByText('Scouting Intel')).toBeTruthy();
    expect(getByTestId('negotiation-context-urgency')).toBeTruthy();
  });

  it('places the panel above the offer fields and submit actions', async () => {
    const { getByTestId, getByText } = renderModal();
    await waitFor(() => expect(getByTestId('negotiation-context-panel')).toBeTruthy());
    const panel = getByTestId('negotiation-context-panel');
    const offerArea = getByText('Agent demand');
    const submit = getByText('Submit Offer');
    expect(panel.compareDocumentPosition(offerArea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(panel.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The stance section (PR #1634) stays above the new panel.
    const stance = getByTestId('negotiation-stance-section');
    expect(stance.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leaves offer submission behavior unchanged', async () => {
    const actions = makeActions();
    const onComplete = vi.fn();
    const { getByText } = renderModal({ actions, onComplete });
    await waitFor(() => expect(getByText('Submit Offer')).toBeTruthy());
    fireEvent.click(getByText('Submit Offer'));
    await waitFor(() => expect(actions.extendContract).toHaveBeenCalledTimes(1));
    expect(actions.extendContract).toHaveBeenCalledWith(42, 1, resolvedAsk);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it('does not regress CapImpactSummary rendering alongside the panel', async () => {
    const { getByTestId } = render(
      <div>
        <ExtensionNegotiationModal
          player={expiringStar()}
          actions={makeActions()}
          teamId={1}
          team={contenderTeam()}
          league={league}
          currentSeason={2026}
          onClose={() => {}}
        />
        <CapImpactSummary currentRoom={30} incoming={12} outgoing={0} />
      </div>,
    );
    await waitFor(() => expect(getByTestId('negotiation-context-panel')).toBeTruthy());
    expect(getByTestId('cap-impact-summary')).toBeTruthy();
  });

  it('never exposes raw recommendation enum values in the DOM', async () => {
    const { container, getByTestId } = renderModal();
    await waitFor(() => expect(getByTestId('negotiation-context-panel')).toBeTruthy());
    expect(container.textContent).not.toMatch(
      /priority_resign|resign_if_price|trade_or_tag|let_walk|replaceable_depth/,
    );
  });

  it('shows exactly one negotiation/scouting context cluster — no duplicate stance or intel blocks', async () => {
    const { getAllByTestId, getByTestId } = renderModal();
    await waitFor(() => expect(getByTestId('negotiation-context-panel')).toBeTruthy());
    expect(getAllByTestId('negotiation-stance-section')).toHaveLength(1);
    expect(getAllByTestId('negotiation-context-panel')).toHaveLength(1);
  });
});
