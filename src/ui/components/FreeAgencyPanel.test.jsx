// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FreeAgencyPanel from './FreeAgencyPanel.jsx';

function buildLeague() {
  return {
    year: 2026,
    week: 5,
    userTeamId: 1,
    franchiseChronicle: [],
    teams: [{
      id: 1,
      name: 'Pittsburgh',
      abbr: 'PIT',
      capRoom: 35,
      capUsed: 210,
      capTotal: 255,
    }],
  };
}

function buildActions(overrides = {}) {
  return {
    getFreeAgents: vi.fn().mockResolvedValue({
      payload: {
        freeAgents: [{ id: 44, name: 'Max Lane', pos: 'WR', ovr: 78, age: 26, teamId: null, contract: { baseAnnual: 6.5 } }],
      },
    }),
    signPlayer: vi.fn().mockResolvedValue({
      payload: {
        freeAgentSigning: {
          playerId: 44,
          playerName: 'Max Lane',
          pos: 'WR',
          ovr: 78,
          teamId: 1,
          teamLabel: 'PIT',
          years: 2,
          totalValue: 13,
          aav: 6.5,
          season: 2026,
          week: 5,
        },
      },
    }),
    updateFranchiseChronicle: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe('FreeAgencyPanel direct signing chronicle logging', () => {
  it('logs and persists a confirmed direct free-agent signing', async () => {
    const league = buildLeague();
    const actions = buildActions();

    render(<FreeAgencyPanel league={league} actions={actions} />);

    expect(await screen.findByText('Max Lane')).toBeTruthy();
    fireEvent.click(screen.getByText('Sign'));
    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => expect(actions.signPlayer).toHaveBeenCalledWith(44, 1, expect.objectContaining({ yearsTotal: 2 })));
    await waitFor(() => expect(actions.updateFranchiseChronicle).toHaveBeenCalledTimes(1));
    expect(league.franchiseChronicle).toHaveLength(1);
    expect(league.franchiseChronicle[0]).toMatchObject({
      id: 'free-agent-signing-2026-wk5-1-44',
      type: 'contract',
      meta: {
        source: 'free_agent_signing',
        player: { name: 'Max Lane', pos: 'WR', ovr: 78 },
        totalValue: 13,
        aav: 6.5,
      },
    });
  });

  it('does not log failed direct free-agent signings', async () => {
    const league = buildLeague();
    const actions = buildActions({
      signPlayer: vi.fn().mockRejectedValue(new Error('Player not found')),
    });

    render(<FreeAgencyPanel league={league} actions={actions} />);

    expect(await screen.findByText('Max Lane')).toBeTruthy();
    fireEvent.click(screen.getByText('Sign'));
    fireEvent.click(screen.getByText('Confirm'));

    expect((await screen.findByRole('alert')).textContent).toContain('Player not found');
    expect(actions.updateFranchiseChronicle).not.toHaveBeenCalled();
    expect(league.franchiseChronicle).toEqual([]);
  });
});
