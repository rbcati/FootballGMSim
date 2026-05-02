import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import BoxScore, { PlayerButton } from './BoxScore.jsx';

describe('BoxScore game book rendering', () => {
  const baseLeague = { seasonId: 2031, week: 2, teams: [{ id: 1, abbr: 'KC' }, { id: 2, abbr: 'BUF' }] };

  it('renders score-only game', () => {
    const html = renderToString(<BoxScore gameId="g1" league={{ ...baseLeague, gameById: { g1: { homeId: 1, awayId: 2, homeScore: 14, awayScore: 10 } } }} embedded />);
    expect(html).toContain('Score only');
    expect(html).toContain('Quarter-by-quarter scoring was not recorded for this game.');
  });

  it('renders partial game', () => {
    const html = renderToString(<BoxScore gameId="g2" league={{ ...baseLeague, gameById: { g2: { homeId: 1, awayId: 2, homeScore: 21, awayScore: 17, teamStats: { home: { passYards: 201 }, away: { passYards: 230 } } } } }} embedded />);
    expect(html).toContain('Partial detail');
    expect(html).toContain('Team comparison');
  });

  it('renders full-detail game with player tables', () => {
    const html = renderToString(<BoxScore gameId="g3" league={{ ...baseLeague, gameById: { g3: { homeId: 1, awayId: 2, homeScore: 21, awayScore: 17, quarterScores: { home: [7,7,7,0], away: [3,7,0,7] }, teamStats: { home: { passYards: 201 }, away: { passYards: 230 } }, playerStats: { home: { 11: { name: 'QB Home', stats: { passAtt: 20, passComp: 14 } } }, away: { 22: { name: 'QB Away', stats: { passAtt: 24, passComp: 18 } } } } } } }} embedded />);
    expect(html).toContain('Full detail');
    expect(html).toContain('Passing');
  });

  it('renders missing-detail fallback', () => {
    const html = renderToString(<BoxScore gameId="g4" league={baseLeague} embedded />);
    expect(html).toContain('Game Book unavailable');
  });

  it('player buttons trigger selection handlers when ids are present', () => {
    const onSelect = vi.fn();
    const element = PlayerButton({ player: { playerId: 55, name: 'Tester' }, onSelect });
    element.props.onClick();
    expect(onSelect).toHaveBeenCalledWith(55);
  });
});
