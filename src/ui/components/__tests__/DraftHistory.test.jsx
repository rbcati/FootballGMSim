/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup, within } from '@testing-library/react';
import DraftHistory from '../DraftHistory.jsx';

describe('DraftHistory', () => {
  afterEach(() => cleanup());

  it('renders empty state when no draft classes', async () => {
    render(
      <DraftHistory
        league={{ year: 2030, teams: [] }}
        actions={{
          getDraftClasses: vi.fn().mockResolvedValue({ payload: { classes: [] } }),
          getDraftClass: vi.fn(),
        }}
        onPlayerSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Draft history will appear after completed drafts/i)).toBeTruthy();
    });
  });

  it('renders redraft top 10 when model has data', async () => {
    const model = {
      year: 2029,
      seasonId: 's1',
      picks: [
        {
          playerId: 1,
          playerName: 'A',
          pos: 'QB',
          draftTeamAbbr: 'XX',
          overall: 5,
          redraftRank: 1,
          redraftDelta: 4,
          outcomeLabel: 'Star',
          legacyScore: 70,
          reasons: ['Strong'],
        },
      ],
      redraftTop10: [
        {
          playerId: 1,
          playerName: 'A',
          pos: 'QB',
          originalOverall: 5,
          redraftRank: 1,
          redraftDelta: 4,
          outcomeLabel: 'Star',
          reason: 'Strong',
        },
      ],
      steals: [],
      busts: [],
      teamGrades: [],
      classSummary: {
        totalPicks: 1,
        starCount: 1,
        starterCount: 1,
        hofCount: 0,
        mvpCount: 0,
        allProCount: 0,
        avgLegacyScore: 70,
        classLeagueStatus: 'mature',
        isDevelopingClass: false,
        seasonsSinceDraft: 4,
      },
      meta: { isDevelopingClass: false, suppressStealsBusts: false, seasonsSinceDraft: 4 },
    };
    render(
      <DraftHistory
        league={{ year: 2033, teams: [{ id: 1, abbr: 'XX' }] }}
        actions={{
          getDraftClasses: vi.fn().mockResolvedValue({
            payload: { classes: [{ seasonId: 's1', year: 2029, pickCount: 1, teamIds: [1] }] },
          }),
          getDraftClass: vi.fn().mockResolvedValue({ payload: { model } }),
        }}
        onPlayerSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Redraft top 10/i)).toBeTruthy();
    });
    expect(screen.getAllByRole('button', { name: 'A' }).length).toBeGreaterThanOrEqual(1);
  });

  it('supports search, filters, sort controls, showing count, and card view in full class', async () => {
    const model = {
      year: 2029,
      seasonId: 's1',
      picks: [
        {
          playerId: 1,
          playerName: 'Anchor QB',
          pos: 'QB',
          draftTeamAbbr: 'XX',
          overall: 1,
          redraftRank: 3,
          redraftDelta: -2,
          outcomeLabel: 'Reach',
          legacyScore: 50,
        },
        {
          playerId: 2,
          playerName: 'Sleeper WR',
          pos: 'WR',
          draftTeamAbbr: 'XX',
          overall: 18,
          redraftRank: 1,
          redraftDelta: 17,
          outcomeLabel: 'Star',
          legacyScore: 92,
        },
        {
          playerId: 3,
          playerName: 'Solid LB',
          pos: 'LB',
          draftTeamAbbr: 'YY',
          overall: 9,
          redraftRank: 2,
          redraftDelta: 7,
          outcomeLabel: 'Starter',
          legacyScore: 75,
        },
      ],
      redraftTop10: [],
      steals: [],
      busts: [],
      teamGrades: [],
      classSummary: {
        totalPicks: 3,
        starCount: 1,
        starterCount: 2,
        avgLegacyScore: 72,
        classLeagueStatus: 'mature',
        isDevelopingClass: false,
      },
    };

    render(
      <DraftHistory
        league={{ year: 2033, teams: [{ id: 1, abbr: 'XX' }, { id: 2, abbr: 'YY' }] }}
        actions={{
          getDraftClasses: vi.fn().mockResolvedValue({
            payload: { classes: [{ seasonId: 's1', year: 2029, pickCount: 3, teamIds: [1, 2] }] },
          }),
          getDraftClass: vi.fn().mockResolvedValue({ payload: { model } }),
        }}
        onPlayerSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('draft-history-class-count').textContent).toContain('Showing 3 of 3 picks');
    });

    fireEvent.change(screen.getByLabelText(/Search draft history picks/i), { target: { value: 'Sleeper' } });
    await waitFor(() => {
      expect(screen.getByTestId('draft-history-class-count').textContent).toContain('Showing 1 of 3 picks');
    });
    expect(screen.getByTestId('draft-history-class-cards').textContent).toContain('Sleeper WR');

    fireEvent.click(screen.getByRole('button', { name: /Reset filters/i }));
    await waitFor(() => {
      expect(screen.getByTestId('draft-history-class-count').textContent).toContain('Showing 3 of 3 picks');
    });

    fireEvent.change(screen.getByLabelText(/Filter draft history picks by team/i), { target: { value: 'XX' } });
    await waitFor(() => {
      expect(screen.getByTestId('draft-history-class-count').textContent).toContain('Showing 2 of 3 picks');
    });

    fireEvent.change(screen.getByLabelText(/Sort draft history picks/i), { target: { value: 'redraftDelta' } });
    fireEvent.click(screen.getByLabelText(/Toggle draft history sort direction/i));
    await waitFor(() => {
      const cards = within(screen.getByTestId('draft-history-class-cards')).getAllByTestId(/draft-history-pick-card-/);
      expect(cards[0].textContent).toContain('Sleeper WR');
      expect(cards[0].textContent).toContain('Δ17');
    });
  });
});
