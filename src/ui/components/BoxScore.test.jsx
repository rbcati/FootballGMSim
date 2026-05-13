/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { fireEvent, render } from '@testing-library/react';
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
    expect(html).toContain('Passing');
    expect(html).toContain('Special Teams');
    expect(html).toContain('Kicking');
    expect(html).toContain('Punting');
    expect(html).toContain('Returns');
    expect(html).toContain('Blocking');
  });

  it('uses placeholders for score-only games and omits stat tables', () => {
    const html = renderToString(<BoxScore gameId="g4" league={{ ...baseLeague, gameById: { g4: { homeId: 1, awayId: 2, homeScore: 6, awayScore: 3 } } }} embedded />);
    expect(html).toContain('Detailed box score data was not recorded for this game.');
    expect(html).toContain('Scoring summary was not recorded for this game.');
    expect(html).not.toContain('Special Teams');
  });

  it('player buttons trigger selection handlers with Game Book return context when ids are present', () => {
    const onSelect = vi.fn();
    const player = { playerId: 55, name: 'Tester', stats: { passYd: 123 } };
    const { container } = render(<PlayerButton player={player} onSelect={onSelect} context={{ source: 'game-book', gameId: 'g-context', returnTo: 'game-book' }} />);
    fireEvent.click(container.querySelector('button'));
    expect(onSelect.mock.calls[0][0]).toBe(55);
    expect(onSelect.mock.calls[0][1]).toMatchObject({
      source: 'game-book',
      gameId: 'g-context',
      returnTo: 'game-book',
      player,
      statLine: player.stats,
    });
  });

  it('top performers trigger player profile selection when ids are present', () => {
    const onSelect = vi.fn();
    const game = { gameId: 'g4', week: 2, homeId: 1, awayId: 2, homeScore: 28, awayScore: 17, quarterScores: { home: [7,7,7,7], away: [0,7,3,7] }, teamStats: { home: { passYards: 250 }, away: {} }, playerStats: { home: { 11: { name: 'Home QB', stats: { passAtt: 30, passComp: 20, passYd: 250, passTD: 3 } } }, away: {} } };
    const { getAllByTestId } = render(<BoxScore gameId="g4" league={{ ...baseLeague, gameById: { g4: game } }} onPlayerSelect={onSelect} embedded />);
    fireEvent.click(getAllByTestId('game-book-top-performer-link')[0]);
    expect(onSelect.mock.calls[0][0]).toBe(11);
    expect(onSelect.mock.calls[0][1]).toMatchObject({
      source: 'game-book',
      gameId: 'g4',
      week: 2,
      seasonId: 2031,
      role: 'Top offensive player',
      returnTo: 'game-book',
    });
  });

  it('renders Defense and scoring summary rows when detailed stats exist', () => {
    const game = {
      homeId: 1,
      awayId: 2,
      homeScore: 21,
      awayScore: 17,
      quarterScores: { home: [7, 7, 7, 0], away: [3, 7, 0, 7] },
      teamStats: { home: { passYards: 201, sacks: 3 }, away: { passYards: 230 } },
      scoringSummary: [
        { quarter: 1, time: '8:12', teamAbbr: 'BUF', type: 'TD', description: '1-yard run', scoreAfter: { home: 0, away: 7 } },
      ],
      playerStats: {
        home: { 99: { name: 'DE Star', stats: { tackles: 6, sacks: 2, tfl: 1, interceptions: 0, passesDefended: 2 } } },
        away: { 12: { name: 'Away QB', stats: { passAtt: 22, passComp: 14, passYd: 180, passTD: 1, interceptions: 2, sacked: 3, passerRating: 72.5 } } },
      },
    };
    const { container, getByTestId } = render(<BoxScore gameId="g-def" league={{ ...baseLeague, teams: [{ id: 1, abbr: 'KC' }, { id: 2, abbr: 'BUF' }], gameById: { 'g-def': game } }} embedded />);
    expect(getByTestId('game-book-table-defense')).toBeTruthy();
    const scoringBlock = container.querySelector('[data-testid="game-book-scoring-summary"]');
    expect(scoringBlock?.textContent).toContain('8:12');
    expect(scoringBlock?.textContent).toContain('7-0');
  });
});
