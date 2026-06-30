/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import NegotiationStanceBadge from '../common/NegotiationStanceBadge.jsx';
import ExtensionNegotiationModal from '../ExtensionNegotiationModal.jsx';
import CapImpactSummary from '../common/CapImpactSummary.jsx';

/**
 * Negotiation Context V1 — display-only surface integration.
 *
 * Verifies the stance badge (Free Agency row surface) and the "Negotiation
 * Stance" section (re-sign / extension modal) render the derived, display-only
 * context, and that UNAVAILABLE renders its dedicated copy. No economics,
 * acceptance, or cap logic is exercised here — these are presentation checks.
 */

const league = { seasonId: 2026, year: 2026 };

function loyalStar(overrides = {}) {
  return {
    id: 42,
    name: 'Marcus Lane',
    pos: 'WR',
    age: 29,
    ovr: 88,
    tenureYears: 5,
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

describe('NegotiationStanceBadge — Free Agency row surface', () => {
  afterEach(cleanup);

  it('renders a stance badge with plain-language reasons for a player with known context', () => {
    const { getByTestId, queryByText } = render(
      <NegotiationStanceBadge player={loyalStar()} team={contenderTeam()} league={league} testId="fa-stance-42" />,
    );
    const badge = getByTestId('fa-stance-42');
    expect(badge.getAttribute('data-stance')).toBe('EAGER');
    expect(badge.textContent).toMatch(/eager to re-sign/i);
    // Plain-language reason — never a raw code.
    expect(badge.textContent).toMatch(/winning now/i);
    expect(queryByText(/WIN_NOW_URGENCY/)).toBeNull();
  });

  it('renders the muted UNAVAILABLE stance with no reasons when negotiations are frozen', () => {
    const player = loyalStar({ negotiationState: { negotiationsFrozenUntilSeason: 2026 } });
    const { getByTestId } = render(
      <NegotiationStanceBadge player={player} team={contenderTeam()} league={league} testId="fa-stance-42" />,
    );
    const badge = getByTestId('fa-stance-42');
    expect(badge.getAttribute('data-stance')).toBe('UNAVAILABLE');
    expect(badge.textContent).toMatch(/not available to re-sign/i);
  });

  it('renders exactly one stance badge per player (no duplicate displays)', () => {
    const { getAllByTestId } = render(
      <NegotiationStanceBadge player={loyalStar()} team={contenderTeam()} league={league} testId="fa-stance-42" />,
    );
    expect(getAllByTestId('fa-stance-42')).toHaveLength(1);
  });
});

describe('ExtensionNegotiationModal — Negotiation Stance section', () => {
  afterEach(cleanup);

  // getExtensionAsk never resolves: the stance section renders independently of
  // the async ask, so the section is present synchronously.
  const pendingActions = { getExtensionAsk: vi.fn(() => new Promise(() => {})) };

  it('renders a "Negotiation Stance" section with stance + reasons', () => {
    const { getByTestId, getByText } = render(
      <ExtensionNegotiationModal
        player={loyalStar()}
        actions={pendingActions}
        teamId={1}
        team={contenderTeam()}
        league={league}
        currentSeason={2026}
        onClose={() => {}}
      />,
    );
    expect(getByText('Negotiation Stance')).toBeTruthy();
    const section = getByTestId('negotiation-stance-section');
    expect(section.getAttribute('data-stance')).toBe('EAGER');
    expect(section.textContent).toMatch(/winning now/i);
  });

  it('renders the dedicated UNAVAILABLE copy when the player cannot re-sign', () => {
    const player = loyalStar({ negotiationState: { negotiationsFrozenUntilSeason: 2026 } });
    const { getByTestId } = render(
      <ExtensionNegotiationModal
        player={player}
        actions={pendingActions}
        teamId={1}
        team={contenderTeam()}
        league={league}
        currentSeason={2026}
        onClose={() => {}}
      />,
    );
    const section = getByTestId('negotiation-stance-section');
    expect(section.getAttribute('data-stance')).toBe('UNAVAILABLE');
    expect(section.textContent).toMatch(/player is not available to re-sign/i);
  });

  it('renders exactly one Negotiation Stance section (no duplicate displays)', () => {
    const { getAllByTestId } = render(
      <ExtensionNegotiationModal
        player={loyalStar()}
        actions={pendingActions}
        teamId={1}
        team={contenderTeam()}
        league={league}
        currentSeason={2026}
        onClose={() => {}}
      />,
    );
    expect(getAllByTestId('negotiation-stance-section')).toHaveLength(1);
  });
});

describe('CapImpactSummary — no regression alongside stance display', () => {
  afterEach(cleanup);

  it('still renders its cap breakdown independently of the new stance surface', () => {
    const { getByTestId } = render(
      <div>
        <NegotiationStanceBadge player={loyalStar()} team={contenderTeam()} league={league} testId="fa-stance-42" />
        <CapImpactSummary currentRoom={30} incoming={12} outgoing={0} />
      </div>,
    );
    expect(getByTestId('fa-stance-42')).toBeTruthy();
    expect(getByTestId('cap-impact-summary')).toBeTruthy();
  });
});
