import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import FranchiseHQ from '../FranchiseHQ.jsx';
import TradeWorkspace from '../TradeWorkspace.jsx';
import Roster from '../Roster.jsx';
import PlayerStats from '../PlayerStats.jsx';

const freshLeague = {
  year: 2025,
  week: 1,
  seasonId: 's1',
  phase: 'preseason',
  userTeamId: 0,
  teams: [
    {
      id: 0,
      name: 'Chicago Bears',
      abbr: 'CHI',
      conf: 1,
      div: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      capRoom: 18,
      capTotal: 255,
      rosterCount: 53,
      roster: [],
      picks: [],
    },
    {
      id: 1,
      name: 'Detroit Lions',
      abbr: 'DET',
      conf: 1,
      div: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      capRoom: 14,
      capTotal: 255,
      rosterCount: 53,
      roster: [],
      picks: [],
    },
  ],
  schedule: { weeks: [{ week: 1, games: [{ home: 0, away: 1, played: false }] }] },
  incomingTradeOffers: [],
};

const actions = {
  getRoster: vi.fn(async () => ({ payload: { team: freshLeague.teams[0], players: [] } })),
  getAllPlayerStats: vi.fn(async () => ({ payload: { stats: [] } })),
  toggleTradeBlock: vi.fn(async () => ({})),
};

describe('fresh save core screens', () => {
  it('renders HQ with no completed games', () => {
    expect(() => renderToString(
      <FranchiseHQ league={freshLeague} onNavigate={() => {}} onAdvanceWeek={() => {}} busy={false} simulating={false} />,
    )).not.toThrow();
  });

  it('renders trade workspace without offers', () => {
    expect(() => renderToString(
      <TradeWorkspace league={freshLeague} actions={actions} onPlayerSelect={() => {}} initialView="Offers" />,
    )).not.toThrow();
  });

  it('renders roster on fresh save', () => {
    expect(() => renderToString(
      <Roster league={freshLeague} actions={actions} onPlayerSelect={() => {}} initialViewMode="table" />,
    )).not.toThrow();
  });

  it('renders stats on fresh save', () => {
    expect(() => renderToString(
      <PlayerStats league={freshLeague} actions={actions} onPlayerSelect={() => {}} initialFamily="passing" />,
    )).not.toThrow();
  });
});
