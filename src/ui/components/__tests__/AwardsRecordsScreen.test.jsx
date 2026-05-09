/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AwardsRecordsScreen from '../AwardsRecordsScreen.jsx';

describe('AwardsRecordsScreen', () => {
  it('renders archived V1 awards by season and record book when getRecords returns data', async () => {
    render(
      <AwardsRecordsScreen
        onBack={vi.fn()}
        onPlayerSelect={vi.fn()}
        league={{ teams: [{ id: 1, name: 'BOS' }], userTeamId: 1 }}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [{
                year: 2031,
                awards: {
                  mvp: { playerId: 1, name: 'Ace QB', pos: 'QB' },
                  opoy: { playerId: 2, name: 'Top RB', pos: 'RB' },
                  dpoy: { playerId: 3, name: 'Edge Star', pos: 'EDGE' },
                  bestQB: { playerId: 4, name: 'Also QB', pos: 'QB' },
                },
              }],
            },
          }),
          getRecords: vi.fn().mockResolvedValue({
            payload: {
              recordBook: {
                schemaVersion: 1,
                singleSeasonV1: {
                  passingYards: { value: 4800, playerId: 1, playerName: 'Ace QB', position: 'QB', year: 2031, teamAbbr: 'BOS' },
                },
                careerLeadersV1: { passingYards: [{ playerId: 1, playerName: 'Ace QB', value: 4800, position: 'QB' }] },
                teamSeasonV1: {
                  wins: { value: 14, teamId: 1, teamAbbr: 'BOS', teamName: 'BOS', year: 2031 },
                },
                meta: {},
              },
            },
          }),
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/By season/i)).toBeTruthy();
      expect(screen.getAllByText(/Season 2031/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Most Valuable Player:/i)).toBeTruthy();
      expect(screen.getAllByText(/Ace QB/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/2031 · Most Valuable Player/i)).toBeTruthy();
      expect(screen.getByText(/Single-season records/i)).toBeTruthy();
      expect(screen.getByText(/4,?800/)).toBeTruthy();
    });
  });

  it('shows honest empty state when no record book', async () => {
    render(
      <AwardsRecordsScreen
        onBack={vi.fn()}
        onPlayerSelect={vi.fn()}
        league={{ teams: [], userTeamId: null }}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({ payload: { seasons: [] } }),
          getRecords: vi.fn().mockResolvedValue({ payload: { recordBook: { schemaVersion: 0 } } }),
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/No record book data in this save yet/i)).toBeTruthy();
    });
  });
});
