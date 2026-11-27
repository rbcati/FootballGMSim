/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useWorker } from './useWorker.js';
import TeamHub from '../components/TeamHub.jsx';
import { toUI, toWorker } from '../../worker/protocol.js';
import { serializeLeagueDelta } from '../../worker/serialization.js';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('exposes intent-specific Legacy actions and refreshes TeamHub from worker updates', () => {
  let worker;
  class TestWorker {
    constructor() { worker = this; }
    postMessage = vi.fn();
    terminate = vi.fn();
    emit(type, payload) { this.onmessage({ data: { type, payload } }); }
  }
  vi.stubGlobal('Worker', TestWorker);
  let hook;
  function Harness() {
    hook = useWorker();
    return hook.state.league ? <TeamHub league={hook.state.league} actions={hook.actions} initialSection="Overview" /> : null;
  }
  render(<Harness />);
  expect(hook.actions.inductRingOfHonor).toBeTypeOf('function');
  expect(hook.actions.retireJerseyNumber).toBeTypeOf('function');
  expect(hook.actions.send).toBeUndefined();
  const league = { activeLeagueId: 'save_slot_1', franchiseGenerationId: 'legacy-generation', phase: 'regular', year: 2026, week: 1, userTeamId: 1, teams: [{ id: 1, name: 'Bears', abbr: 'CHI', roster: [] }], pendingRohCandidates: [{ playerId: 50, teamId: 1, title: 'Candidate Legend', body: 'Eligible for induction.' }], ringOfHonor: [], retiredNumbers: [] };
  act(() => worker.emit(toUI.FULL_STATE, league));
  fireEvent.click(screen.getByText('Franchise Legacy', { selector: 'summary' }));
  fireEvent.click(screen.getByTestId('induct-roh-button'));
  expect(worker.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: toWorker.INDUCT_PLAYER_TO_ROH, payload: { playerId: 50, teamId: 1 } }));
  expect(hook.state.busy).toBe(true);
  const inducted = { ...league, pendingRohCandidates: [], ringOfHonor: [{ id: 50, name: 'Candidate Legend', position: 'QB', jerseyNumber: 12, totalPassingYards: 20000, inductionYear: 2026 }] };
  act(() => worker.emit(toUI.STATE_UPDATE, serializeLeagueDelta(inducted, league).delta));
  expect(screen.queryByTestId('induct-roh-button')).toBeNull();
  expect(hook.state.busy).toBe(false);
  fireEvent.click(screen.getByTestId('leaderboard-row-passing-yards-0'));
  fireEvent.click(screen.getByTestId('retire-number-button'));
  expect(worker.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: toWorker.RETIRE_JERSEY_NUMBER, payload: { playerId: 50, teamId: 1 } }));
  const retired = { ...inducted, retiredNumbers: [12], retiredNumberDisplay: [{ jerseyNumber: 12, surname: 'Legend' }] };
  act(() => worker.emit(toUI.STATE_UPDATE, serializeLeagueDelta(retired, inducted).delta));
  expect(screen.getByTestId('retired-number-badge').textContent).toContain('12');
  expect(hook.state.league.retiredNumbers).toEqual([12]);
  expect(hook.state.busy).toBe(false);
});

it('applies back-to-back STATE_UPDATE deltas cumulatively (no stale-ref revert)', () => {
  let worker;
  class TestWorker {
    constructor() { worker = this; }
    postMessage = vi.fn();
    terminate = vi.fn();
    emit(type, payload) { this.onmessage({ data: { type, payload } }); }
  }
  vi.stubGlobal('Worker', TestWorker);
  let hook;
  function Harness() { hook = useWorker(); return null; }
  render(<Harness />);
  const player = { id: 'p1', name: 'Darnell Brown', contract: { years: 1, baseAnnual: 8.8 }, extensionDecision: null };
  const league = { activeLeagueId: 'save_slot_1', franchiseGenerationId: 'g', phase: 'offseason_resign', year: 2026, week: 0, userTeamId: 0, teams: [{ id: 0, abbr: 'BUF', capUsed: 200, roster: [player] }], franchiseChronicle: [] };
  act(() => worker.emit(toUI.FULL_STATE, league));
  const extended = { ...league, teams: [{ id: 0, abbr: 'BUF', capUsed: 201, roster: [{ ...player, contract: { years: 1, baseAnnual: 9.6 }, extensionDecision: 'extended' }] }] };
  const chronicled = { ...extended, franchiseChronicle: [{ id: 'c1', headline: 'Darnell Brown signs extension' }] };
  // Both deltas arrive before React re-renders.
  act(() => {
    worker.emit(toUI.STATE_UPDATE, serializeLeagueDelta(extended, league).delta);
    worker.emit(toUI.STATE_UPDATE, serializeLeagueDelta(chronicled, extended).delta);
  });
  const roster = hook.state.league.teams[0].roster;
  expect(roster[0]).toMatchObject({ extensionDecision: 'extended', contract: { baseAnnual: 9.6 } });
  expect(hook.state.league.franchiseChronicle).toHaveLength(1);
});
