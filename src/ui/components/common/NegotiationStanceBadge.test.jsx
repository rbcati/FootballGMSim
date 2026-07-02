/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import NegotiationStanceBadge from './NegotiationStanceBadge.jsx';

/**
 * Regression coverage for the STANCE_TONE reference-before-declaration bug:
 * the badge must render without throwing for every known stance plus any
 * stance value the selector hasn't been taught yet, falling back to a safe
 * tone instead of crashing the Free Agency row.
 */

const league = { seasonId: 2026, year: 2026 };

describe('NegotiationStanceBadge — renders without throwing per stance', () => {
  afterEach(cleanup);

  it('EAGER — renders visibly', () => {
    const player = { id: 1, name: 'Eager Star', ovr: 88, tenureYears: 5, age: 27 };
    const team = { frontOffice: { persona: 'WIN_NOW' } };
    const { getByTestId } = render(
      <NegotiationStanceBadge player={player} team={team} league={league} testId="badge-eager" />,
    );
    const badge = getByTestId('badge-eager');
    expect(badge.getAttribute('data-stance')).toBe('EAGER');
    expect(badge.textContent).toMatch(/eager to re-sign/i);
  });

  it('NEUTRAL — renders visibly', () => {
    const player = { id: 2, name: 'Neutral Guy', ovr: 70, tenureYears: 1, age: 24 };
    const team = {};
    const { getByTestId } = render(
      <NegotiationStanceBadge player={player} team={team} league={league} testId="badge-neutral" />,
    );
    const badge = getByTestId('badge-neutral');
    expect(badge.getAttribute('data-stance')).toBe('NEUTRAL');
    expect(badge.textContent).toMatch(/open to discussions/i);
  });

  it('RELUCTANT — renders visibly', () => {
    const player = { id: 3, name: 'Reluctant Vet', ovr: 85, tenureYears: 1, age: 27 };
    const team = { frontOffice: { persona: 'CAP_HOARDER' } };
    const { getByTestId } = render(
      <NegotiationStanceBadge player={player} team={team} league={league} testId="badge-reluctant" />,
    );
    const badge = getByTestId('badge-reluctant');
    expect(badge.getAttribute('data-stance')).toBe('RELUCTANT');
    expect(badge.textContent).toMatch(/hesitant on a new deal/i);
  });

  it('UNAVAILABLE — renders "not available to re-sign"', () => {
    const player = {
      id: 4,
      name: 'Frozen Player',
      negotiationState: { negotiationsFrozenUntilSeason: 2026 },
    };
    const team = {};
    const { getByTestId } = render(
      <NegotiationStanceBadge player={player} team={team} league={league} testId="badge-unavailable" />,
    );
    const badge = getByTestId('badge-unavailable');
    expect(badge.getAttribute('data-stance')).toBe('UNAVAILABLE');
    expect(badge.textContent).toMatch(/not available to re-sign/i);
  });

  it('unknown stance — renders with the fallback tone instead of throwing', async () => {
    vi.resetModules();
    vi.doMock('../../selectors/deriveNegotiationContext.js', async () => {
      const actual = await vi.importActual('../../selectors/deriveNegotiationContext.js');
      return {
        ...actual,
        deriveNegotiationContext: () => ({
          stance: 'FUTURE_STANCE',
          stanceLabel: 'Future Stance',
          reasons: [],
          reasonLabels: [],
        }),
      };
    });

    const { default: BadgeWithMockedSelector } = await import('./NegotiationStanceBadge.jsx');
    const { getByTestId } = render(
      <BadgeWithMockedSelector player={{ id: 5 }} team={{}} league={league} testId="badge-unknown" />,
    );
    const badge = getByTestId('badge-unknown');
    expect(badge.getAttribute('data-stance')).toBe('FUTURE_STANCE');
    expect(badge.querySelector('span').style.color).toBe('var(--text-muted)');

    vi.doUnmock('../../selectors/deriveNegotiationContext.js');
    vi.resetModules();
  });
});
