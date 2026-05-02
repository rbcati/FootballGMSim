import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import BoxScore, { PlayerButton } from './BoxScore.jsx';

vi.mock('../hooks/useStableRouteRequest.js', () => ({ default: vi.fn(() => ({ data: null })) }));
import useStableRouteRequest from '../hooks/useStableRouteRequest.js';

describe('BoxScore game book rendering', () => {
  const baseLeague = { seasonId: 2031, week: 2, teams: [{ id: 1, abbr: 'KC' }, { id: 2, abbr: 'BUF' }] };
  beforeEach(() => vi.mocked(useStableRouteRequest).mockReturnValue({ data: null }));

  it('renders from actions.getBoxScore archive payload', () => {
    vi.mocked(useStableRouteRequest).mockReturnValue({ data: { homeId: 1, awayId: 2, homeScore: 14, awayScore: 10, teamStats: { home: { passYards: 100 }, away: { passYards: 80 } } } });
    const html = renderToString(<BoxScore gameId="g1" league={baseLeague} actions={{ getBoxScore: vi.fn() }} embedded />);
    expect(html).toContain('Partial detail');
  });

  it('falls back to league.gameById when no action exists', () => {
    const html = renderToString(<BoxScore gameId="g2" league={{ ...baseLeague, gameById: { g2: { homeId: 1, awayId: 2, homeScore: 14, awayScore: 10 } } }} embedded />);
    expect(html).toContain('Score only');
  });

  it('renders expanded stat tables when data exists', () => {
    const game = { homeId: 1, awayId: 2, homeScore: 21, awayScore: 17, quarterScores: { home: [7,7,7,0], away: [3,7,0,7] }, teamStats: { home: { passYards: 201 }, away: { passYards: 230 } }, playerStats: { home: { 11: { name: 'K', stats: { fieldGoalsAttempted: 2, fieldGoalsMade: 2, points: 6, punts: 2, puntYards: 90, kickReturns: 1, kickReturnYards: 20, passBlockAttempts: 10, passBlockWinRate: 0.9 } } }, away: { 22: { name: 'QB Away', stats: { passAtt: 24, passComp: 18, passYd: 200 } } } } };
    const html = renderToString(<BoxScore gameId="g3" league={{ ...baseLeague, gameById: { g3: game } }} embedded />);
    expect(html).toContain('Kicking');
    expect(html).toContain('Punting');
    expect(html).toContain('Returns');
    expect(html).toContain('Blocking');
  });

  it('player buttons trigger selection handlers when ids are present', () => {
    const onSelect = vi.fn();
    const element = PlayerButton({ player: { playerId: 55, name: 'Tester' }, onSelect });
    element.props.onClick();
    expect(onSelect).toHaveBeenCalledWith(55);
  });
});
