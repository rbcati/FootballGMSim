// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LineupCommandCenter from './LineupCommandCenter.jsx';

const attrs = (n) => ({ throwAccuracyShort: n, throwAccuracyDeep: n, throwPower: n, release: n, routeRunning: n, separation: n, catchInTraffic: n, ballTracking: n, decisionMaking: n, pocketPresence: n, passBlockFootwork: n, passBlockStrength: n, passRush: n, pressCoverage: n, zoneCoverage: n });
const player = (id, name, order, ovr) => ({ id, name, pos: 'QB', teamId: 1, ovr, attributesV2: attrs(ovr), ratings: { throwPower: ovr, throwAccuracy: ovr, awareness: ovr, intelligence: ovr, speed: ovr }, depthChart: { rowKey: 'QB', order } });
const roster = [player(1, 'Current QB', 1, 55), player(2, 'Challenger QB', 2, 92)];
const team = { id: 1, name: 'Test', strategies: { offSchemeId: 'VERTICAL', defSchemeId: 'MAN_COVERAGE' } };

afterEach(cleanup);

describe('LineupCommandCenter', () => {
  it('preserves player navigation and persists replacements through updateDepthChart', async () => {
    const onPlayerSelect = vi.fn();
    const updateDepthChart = vi.fn(async () => ({}));
    const view = render(<LineupCommandCenter team={team} roster={roster} actions={{ updateDepthChart }} onPlayerSelect={onPlayerSelect} />);
    fireEvent.click(view.getByText('Current QB'));
    expect(onPlayerSelect).toHaveBeenCalledWith(1);
    fireEvent.click(view.getByRole('button', { name: 'Change' }));
    fireEvent.click(view.getByText('Challenger QB'));
    await waitFor(() => expect(updateDepthChart).toHaveBeenCalledTimes(1));
    expect(updateDepthChart.mock.calls[0][0]).toEqual(expect.arrayContaining([
      { playerId: 2, rowKey: 'QB', newOrder: 1 },
      { playerId: 1, rowKey: 'QB', newOrder: 2 },
    ]));
  });

  it('uses a narrow card structure without a wide table', () => {
    const { getByTestId } = render(<LineupCommandCenter team={team} roster={roster} actions={{}} />);
    expect(getByTestId('lineup-command-center').querySelector('table')).toBeNull();
    expect(getByTestId('offense-lineup').querySelector('[data-player-id="1"]')).toBeTruthy();
  });

  it('shows active non-default schemes and routes to the existing Game Plan tab', () => {
    const onNavigate = vi.fn();
    const view = render(<LineupCommandCenter team={team} roster={roster} actions={{}} onNavigate={onNavigate} />);
    expect(view.getByText(/Vertical \/ Air Raid · \d+% fit/)).toBeTruthy();
    expect(view.getByText(/Man Coverage · \d+% fit/)).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Review Game Plan' }));
    expect(onNavigate).toHaveBeenCalledWith('Game Plan');
  });
});
