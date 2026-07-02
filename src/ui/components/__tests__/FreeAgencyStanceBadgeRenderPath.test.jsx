/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import FreeAgency from '../FreeAgency.jsx';

/**
 * Guards the actual Free Agency row render path: #1634 shipped a
 * NegotiationStanceBadge reference-before-declaration bug that unit tests on
 * the badge alone never caught, because nothing rendered it inside a real FA
 * player row. This mounts the live FreeAgency screen with one free agent and
 * asserts the row (and its stance badge) render without throwing.
 */

function buildLeague() {
  return {
    year: 2026,
    week: 5,
    phase: 'free_agency',
    userTeamId: 1,
    teams: [
      {
        id: 1,
        name: 'Pittsburgh',
        abbr: 'PIT',
        capRoom: 35,
        capUsed: 210,
        capTotal: 255,
        frontOffice: { persona: 'WIN_NOW' },
      },
    ],
  };
}

function buildActions() {
  return {
    getFreeAgents: vi.fn().mockResolvedValue({
      payload: {
        phase: 'free_agency',
        faDay: 1,
        faMaxDays: 5,
        freeAgents: [{ id: 44, name: 'Max Lane', pos: 'WR', ovr: 82, age: 26, teamId: null, contract: { baseAnnual: 6.5 } }],
      },
    }),
  };
}

describe('FreeAgency — player row render path', () => {
  afterEach(cleanup);

  it('renders a free agent row with its negotiation stance badge without throwing', async () => {
    render(<FreeAgency league={buildLeague()} userTeamId={1} actions={buildActions()} />);

    const badge = await screen.findByTestId('fa-stance-44');
    expect(badge).toBeTruthy();
    expect(['EAGER', 'NEUTRAL', 'RELUCTANT', 'UNAVAILABLE']).toContain(badge.getAttribute('data-stance'));
  });
});
