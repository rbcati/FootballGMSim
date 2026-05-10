/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
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
});
