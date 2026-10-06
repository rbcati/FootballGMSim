// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEPTH_CHART_ROWS } from '../../core/depthChart.js';
import LineupCommandCenter from './LineupCommandCenter.jsx';

const attrs = (n) => ({ throwAccuracyShort: n, throwAccuracyDeep: n, throwPower: n, release: n, routeRunning: n, separation: n, catchInTraffic: n, ballTracking: n, decisionMaking: n, pocketPresence: n, passBlockFootwork: n, passBlockStrength: n, passRush: n, pressCoverage: n, zoneCoverage: n });
const player = (id, name, order, ovr) => ({ id, name, pos: 'QB', teamId: 1, ovr, attributesV2: attrs(ovr), ratings: { throwPower: ovr, throwAccuracy: ovr, awareness: ovr, intelligence: ovr, speed: ovr }, depthChart: { rowKey: 'QB', order } });
const roster = [player(1, 'Current QB', 1, 55), player(2, 'Challenger QB', 2, 92)];
const team = { id: 1, name: 'Test', strategies: { offSchemeId: 'VERTICAL', defSchemeId: 'MAN_COVERAGE' } };

afterEach(cleanup);

describe('LineupCommandCenter', () => {
  it('uses canonical availability for actionable starter guidance', () => {
    const view = render(<LineupCommandCenter team={team} roster={[{ ...roster[0], injured: true }, roster[1]]} actions={{}} />);
    expect(view.getByTestId('lineup-what-matters').textContent).toContain('1 starter needs attention');
    expect(view.getByTestId('lineup-what-matters').textContent).toContain('QB Current QB unavailable');
    expect(view.getByTestId('offense-lineup').textContent).toContain('55');
    expect(view.getByTestId('offense-lineup').textContent).toContain('Unavailable');
  });

  it('uses calm copy when every canonical depth group has an available starter', () => {
    let id = 0;
    const complete = DEPTH_CHART_ROWS.flatMap((row) => Array.from({ length: row.slots }, (_, index) => ({ ...player(++id, `${row.label} ${index + 1}`, index + 1, 78), pos: row.match[0], depthChart: { rowKey: row.key, order: index + 1 } })));
    const view = render(<LineupCommandCenter team={team} roster={complete} actions={{}} />);
    expect(view.getByTestId('lineup-what-matters').textContent).toContain('Starting lineup is ready');
    const help = view.getByText('Why scheme fit matters').closest('details');
    expect(help.open).toBe(false);
    expect(help.textContent).toContain('does not promise a fixed ratings bonus');
    expect(help.textContent).not.toMatch(/\d+%/);
    expect(view.getByText('Compare scheme fits').closest('details').open).toBe(false);
  });

  it('routes empty persisted assignments to the existing depth editor', () => {
    const onNavigate = vi.fn();
    const view = render(<LineupCommandCenter team={team} roster={[]} actions={{}} onNavigate={onNavigate} />);
    expect(view.getByTestId('lineup-what-matters').textContent).toContain('depth groups need a starter');
    fireEvent.click(view.getByRole('button', { name: 'Fill empty depth assignments' }));
    expect(onNavigate).toHaveBeenCalledWith('Depth Chart');
  });

  it.each([{ injuryWeeksRemaining: 2 }, { injury: { weeksRemaining: 2 } }, { status: 'injured' }])('surfaces existing readiness health concerns without redefining eligibility: %j', (injury) => {
    let id = 0;
    const complete = DEPTH_CHART_ROWS.flatMap((row) => Array.from({ length: row.slots }, (_, index) => ({ ...player(++id, `${row.label} ${index + 1}`, index + 1, 78), pos: row.match[0], depthChart: { rowKey: row.key, order: index + 1 } })));
    complete[0] = { ...complete[0], ...injury };
    const onNavigate = vi.fn();
    const view = render(<LineupCommandCenter team={team} roster={complete} actions={{}} onNavigate={onNavigate} />);
    expect(view.getByTestId('lineup-what-matters').textContent).toContain('Starter health needs review');
    expect(view.getByTestId('lineup-what-matters').textContent).not.toContain('Starting lineup is ready');
    expect(view.getByText('QB · Ready')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Review starter health' }));
    expect(onNavigate).toHaveBeenCalledWith('Depth Chart');
  });

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

  it('keeps an unavailable canonical QB visible and replaces the actual order-one assignment', async () => {
    const unavailableStarter = { ...player(1, 'Unavailable QB', 1, 78), injured: true };
    const healthyBackup = player(2, 'Healthy QB', 2, 74);
    const updateDepthChart = vi.fn(async () => ({}));
    const view = render(<LineupCommandCenter team={team} roster={[unavailableStarter, healthyBackup]} actions={{ updateDepthChart }} />);

    expect(view.getByText('Unavailable QB')).toBeTruthy();
    expect(view.getByText('QB · Unavailable')).toBeTruthy();
    expect(view.getByText('Game-day fallback: Healthy QB')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Change' }));
    fireEvent.click(view.getByText('Healthy QB'));
    await waitFor(() => expect(updateDepthChart).toHaveBeenCalledWith(expect.arrayContaining([
      { playerId: 2, rowKey: 'QB', newOrder: 1 },
      { playerId: 1, rowKey: 'QB', newOrder: 2 },
    ])));
  });

  it('uses a narrow card structure without a wide table', () => {
    const { getByTestId } = render(<LineupCommandCenter team={team} roster={roster} actions={{}} />);
    expect(getByTestId('lineup-command-center').querySelector('table')).toBeNull();
    expect(getByTestId('offense-lineup').querySelector('[data-player-id="1"]')).toBeTruthy();
  });

  it('shows active non-default schemes and routes to the existing Game Plan tab', () => {
    const onNavigate = vi.fn();
    const view = render(<LineupCommandCenter team={team} roster={roster} actions={{}} onNavigate={onNavigate} />);
    expect(view.getByText(/Vertical \/ Air Raid · (Good|Average|Poor) fit/)).toBeTruthy();
    expect(view.getByText(/Man Coverage · (Good|Average|Poor) fit/)).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Review Game Plan' }));
    expect(onNavigate).toHaveBeenCalledWith('Game Plan');
  });

  it('persists a defensive starter replacement with its canonical row', async () => {
    const defender = (id, name, order, ovr) => ({ id, name, pos: 'CB', teamId: 1, ovr, attributesV2: attrs(ovr), ratings: {}, depthChart: { rowKey: 'CB', order } });
    const defenseRoster = Array.from({ length: 12 }, (_, index) => defender(11 + index, `CB ${index + 1}`, index + 1, 75 + index));
    const updateDepthChart = vi.fn(async () => ({}));
    const view = render(<LineupCommandCenter team={team} roster={defenseRoster} actions={{ updateDepthChart }} />);
    fireEvent.click(view.getByRole('tab', { name: 'defense' }));
    fireEvent.click(view.getAllByRole('button', { name: 'Change' })[0]);
    fireEvent.click(view.getByText('CB 12'));
    await waitFor(() => expect(updateDepthChart).toHaveBeenCalledWith(expect.arrayContaining([
      { playerId: 22, rowKey: 'CB', newOrder: 1 },
      { playerId: 11, rowKey: 'CB', newOrder: 2 },
    ])));
  });

  it('keeps an unavailable canonical defensive starter visible and editable', async () => {
    const defender = (id, name, order, injured = false) => ({ id, name, pos: 'CB', teamId: 1, ovr: 75, injured, attributesV2: attrs(75), ratings: {}, depthChart: { rowKey: 'CB', order } });
    const defenseRoster = Array.from({ length: 12 }, (_, index) => defender(31 + index, `Defender ${index + 1}`, index + 1, index === 0));
    const updateDepthChart = vi.fn(async () => ({}));
    const view = render(<LineupCommandCenter team={team} roster={defenseRoster} actions={{ updateDepthChart }} />);
    fireEvent.click(view.getByRole('tab', { name: 'defense' }));
    expect(view.getByText('Defender 1')).toBeTruthy();
    expect(view.getByText('CB · Unavailable')).toBeTruthy();
    fireEvent.click(view.getAllByRole('button', { name: 'Change' })[0]);
    fireEvent.click(view.getByText('Defender 12'));
    await waitFor(() => expect(updateDepthChart).toHaveBeenCalledWith(expect.arrayContaining([
      { playerId: 42, rowKey: 'CB', newOrder: 1 },
      { playerId: 31, rowKey: 'CB', newOrder: 2 },
    ])));
  });

  it('offers only non-starting same-row returners without changing scrimmage rows or showing fake scheme fit', async () => {
    const offense = ['QB', 'RB', 'WR', 'WR', 'TE', 'OL', 'OL', 'OL', 'OL', 'OL', 'WR'].map((row, index) => ({
      id: 100 + index, name: index === 2 ? 'Starting WR' : `Offense ${index}`, pos: row === 'OL' ? 'LT' : row, teamId: 1, ovr: 75, attributesV2: attrs(75), ratings: {}, depthChart: { rowKey: row, order: index + 1 },
    }));
    const defense = ['EDGE', 'IDL', 'IDL', 'LB', 'LB', 'LB', 'CB', 'CB', 'S', 'S', 'EDGE'].map((row, index) => ({
      id: 200 + index, name: index === 6 ? 'Starting CB' : `Defense ${index}`, pos: row === 'EDGE' ? 'DE' : row === 'IDL' ? 'DT' : row, teamId: 1, ovr: 75, attributesV2: attrs(75), ratings: {}, depthChart: { rowKey: row, order: index + 1 },
    }));
    const returners = [
      { id: 301, name: 'Current Returner', pos: 'WR', teamId: 1, ovr: 70, attributesV2: attrs(70), ratings: {}, depthChart: { rowKey: 'RS', order: 1 } },
      { id: 302, name: 'Backup Returner', pos: 'WR', teamId: 1, ovr: 72, attributesV2: attrs(72), ratings: {} },
      { id: 303, name: 'Kicker Returner', pos: 'WR', secondaryPositions: ['K'], teamId: 1, ovr: 71, attributesV2: attrs(71), ratings: {}, depthChart: { rowKey: 'K', order: 1 } },
    ];
    const updateDepthChart = vi.fn(async () => ({}));
    const view = render(<LineupCommandCenter team={team} roster={[...offense, ...defense, ...returners]} actions={{ updateDepthChart }} />);
    fireEvent.click(view.getByRole('tab', { name: 'Special Teams' }));
    fireEvent.click(view.getAllByRole('button', { name: 'Change' }).at(-1));
    const alternatives = view.getByLabelText('Replace Current Returner');
    expect(alternatives.textContent).toContain('Backup Returner');
    expect(alternatives.textContent).not.toContain('Starting WR');
    expect(alternatives.textContent).not.toContain('Starting CB');
    expect(alternatives.textContent).not.toContain('Kicker Returner');
    expect(alternatives.textContent).not.toContain('FIT');
    fireEvent.click(view.getByText('Backup Returner'));
    await waitFor(() => expect(updateDepthChart).toHaveBeenCalledWith([
      { playerId: 302, rowKey: 'RS', newOrder: 1 },
      { playerId: 301, rowKey: 'RS', newOrder: 2 },
    ]));
    expect(updateDepthChart.mock.calls[0][0].some((update) => update.rowKey !== 'RS')).toBe(false);
  });

  it.each([
    ['K', 'Kicker'],
    ['P', 'Punter'],
  ])('offers an unassigned eligible %s and persists the canonical row without inventing ST', async (rowKey, label) => {
    const pos = rowKey === 'RS' ? 'WR' : rowKey;
    const specialists = [
      { id: `${rowKey}-1`, name: `${label} 1`, pos, teamId: 1, ovr: 71, attributesV2: attrs(71), ratings: {}, depthChart: { rowKey, order: 1 } },
      { id: `${rowKey}-2`, name: `${label} 2`, pos, teamId: 1, ovr: 72, attributesV2: attrs(72), ratings: {} },
      { id: `${rowKey}-3`, name: `${label} 3`, pos, teamId: 1, ovr: 73, attributesV2: attrs(73), ratings: {} },
    ];
    const updateDepthChart = vi.fn(async () => ({}));
    const view = render(<LineupCommandCenter team={team} roster={specialists} actions={{ updateDepthChart }} />);
    fireEvent.click(view.getByRole('tab', { name: 'Special Teams' }));
    fireEvent.click(view.getByRole('button', { name: 'Change' }));
    fireEvent.click(view.getByText(`${label} 2`));
    await waitFor(() => expect(updateDepthChart).toHaveBeenCalledWith([
      { playerId: `${rowKey}-2`, rowKey, newOrder: 1 },
      { playerId: `${rowKey}-1`, rowKey, newOrder: 2 },
    ]));
    expect(JSON.stringify(updateDepthChart.mock.calls)).not.toContain(`${rowKey}-3`);
    expect(JSON.stringify(updateDepthChart.mock.calls)).not.toContain('"ST"');
  });
});
