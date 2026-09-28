/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import TeamHub from '../TeamHub.jsx';

const rosterSpy = vi.fn(() => <div data-testid="roster-proxy">Roster Proxy</div>);
vi.mock('../Roster.jsx', () => ({ default: (props) => rosterSpy(props) }));

describe('TeamHub roster/depth routing context', () => {
  it('routes Review lineup to the canonical Lineup section', () => {
    const league = {
      userTeamId: 1, year: 2026, week: 4, phase: 'regular', schedule: [],
      teams: [{ id: 1, name: 'Sharks', roster: [
        { id: 1, name: 'Injured QB', pos: 'QB', teamId: 1, injured: true, depthChart: { rowKey: 'QB', order: 1 } },
        { id: 2, name: 'Injured WR', pos: 'WR', teamId: 1, injured: true, depthChart: { rowKey: 'WR', order: 1 } },
      ] }],
    };
    render(<TeamHub league={league} actions={{}} initialSection="Overview" />);
    fireEvent.click(screen.getByRole('button', { name: 'Review lineup' }));
    expect(screen.getByTestId('lineup-command-center')).toBeTruthy();
    expect(screen.queryByTestId('roster-proxy')).toBeNull();
  });

  it('opens depth readiness mode when entering Team:Roster / Depth section', () => {
    const league = {
      userTeamId: 1,
      year: 2026,
      week: 4,
      phase: 'regular',
      teams: [{ id: 1, name: 'Sharks', wins: 2, losses: 1, roster: [] }],
      schedule: [],
    };

    render(<TeamHub league={league} actions={{}} initialSection="Roster / Depth" onNavigate={() => {}} onPlayerSelect={() => {}} />);

    expect(screen.getByTestId('roster-proxy')).toBeTruthy();
    const lastProps = rosterSpy.mock.calls.at(-1)?.[0] ?? {};
    expect(lastProps.initialViewMode).toBe('depth');
  });
});
