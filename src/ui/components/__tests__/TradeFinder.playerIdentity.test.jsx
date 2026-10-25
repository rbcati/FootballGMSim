// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TradeFinder from '../TradeFinder.jsx';
import * as finder from '../../utils/tradeFinder.js';

const player = (id, name, pos, teamId) => ({ id, name, pos, teamId, age: 25, ovr: 80, potential: 85, contract: { baseAnnual: 3, years: 3 } });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Trade Finder player identity', () => {
  for (const ids of [['alpha-qb', 'alpha-rb', 'beta-wr'], [11, 12, 21]]) it(`keeps outgoing/incoming selections distinct for ${typeof ids[0]} IDs`, () => {
    const players = [player(ids[0], 'Alpha Quarterback', 'QB', 0), player(ids[1], 'Alpha Runner', 'RB', 0), player(ids[2], 'Beta Receiver', 'WR', 1)];
    const league = { year: 2026, week: 1, userTeamId: 0, teams: [
      { id: 0, name: 'Alphas', abbr: 'AAA', roster: players.slice(0, 2), capRoom: 100, picks: [] },
      { id: 1, name: 'Betas', abbr: 'BBB', roster: players.slice(2), capRoom: 100, picks: [] },
    ] };
    const rank = vi.spyOn(finder, 'rankTradePartners');
    const counter = vi.spyOn(finder, 'buildCounterAdjustment');
    const workspaceChanged = vi.fn();
    render(<TradeFinder league={league} workspace={{ partnerTeamId: 1 }} onWorkspaceChange={workspaceChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /QB Alpha Quarterback/ }));
    expect(rank.mock.calls.at(-1)[0].outgoingPlayers.map(p => p.id)).toEqual([ids[0]]);
    fireEvent.click(screen.getByRole('button', { name: /RB Alpha Runner/ }));
    expect(rank.mock.calls.at(-1)[0].outgoingPlayers.map(p => p.id)).toEqual(ids.slice(0, 2));
    fireEvent.click(screen.getByRole('button', { name: /QB Alpha Quarterback/ }));
    expect(rank.mock.calls.at(-1)[0].outgoingPlayers.map(p => p.id)).toEqual([ids[1]]);
    fireEvent.click(screen.getByRole('button', { name: /WR Beta Receiver/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Make this deal work', exact: true }));
    expect(counter.mock.calls.at(-1)[0].incomingPlayers.map(p => p.id)).toEqual([ids[2]]);
    expect(counter.mock.calls.at(-1)[0].outgoingPlayers.map(p => p.id)).toEqual([ids[1]]);
    expect(workspaceChanged.mock.calls.some(([w]) => w.incomingPlayerIds[0] === ids[2])).toBe(true);
  });
  it('passes the actual incoming opaque selection to package adjustment independently of outgoing selections', () => {
    const receiver = player('incoming-alpha', 'Only Receiver', 'WR', 1);
    const counter = vi.spyOn(finder, 'buildCounterAdjustment');
    render(<TradeFinder league={{ year: 2026, week: 1, userTeamId: 0, teams: [
      { id: 0, name: 'Alphas', abbr: 'AAA', roster: [], picks: [], capRoom: 100 },
      { id: 1, name: 'Betas', abbr: 'BBB', roster: [receiver], picks: [], capRoom: 100 },
    ] }} workspace={{ partnerTeamId: 1, incomingPlayerIds: [receiver.id] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Make this deal work', exact: true }));
    expect(counter.mock.calls.at(-1)[0].incomingPlayers).toEqual([receiver]);
  });

});
