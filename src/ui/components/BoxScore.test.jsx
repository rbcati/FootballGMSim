/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { cleanup, fireEvent, render } from '@testing-library/react';
import BoxScore, { PlayerButton } from './BoxScore.jsx';

vi.mock('../hooks/useStableRouteRequest.js', () => ({ default: vi.fn(() => ({ data: null })) }));
import useStableRouteRequest from '../hooks/useStableRouteRequest.js';

describe('BoxScore game book rendering', () => {
  const baseLeague = { seasonId: 2031, week: 2, teams: [{ id: 1, abbr: 'KC' }, { id: 2, abbr: 'BUF' }] };
  beforeEach(() => {
    cleanup();
    vi.mocked(useStableRouteRequest).mockReturnValue({ data: null });
  });

  it('renders from actions.getBoxScore archive payload', () => {
    vi.mocked(useStableRouteRequest).mockReturnValue({ data: { homeId: 1, awayId: 2, homeScore: 14, awayScore: 10, teamStats: { home: { passYards: 100 }, away: { passYards: 80 } } } });
    const html = renderToString(<BoxScore gameId="g1" league={baseLeague} actions={{ getBoxScore: vi.fn() }} embedded />);
    expect(html).toContain('Partial detail');
  });

  it('falls back to league.gameById when no action exists', () => {
    const html = renderToString(<BoxScore gameId="g2" league={{ ...baseLeague, gameById: { g2: { homeId: 1, awayId: 2, homeScore: 14, awayScore: 10 } } }} embedded />);
    expect(html).toContain('Score only');
  });

  it('uses completed schedule fallback when getBoxScore returns a null worker envelope', () => {
    vi.mocked(useStableRouteRequest).mockReturnValue({ data: { type: 'BOX_SCORE', payload: { game: null, error: 'not found' } } });
    const scheduleGame = { gameId: '2031_w4_1_2', home: { id: 1, abbr: 'KC' }, away: { id: 2, abbr: 'BUF' }, homeScore: 13, awayScore: 24, played: true, week: 4 };
    const { getByTestId, container } = render(<BoxScore gameId="2031_w4_1_2" league={baseLeague} actions={{ getBoxScore: vi.fn() }} scheduleGame={scheduleGame} embedded />);
    expect(getByTestId('game-book-final-score').textContent).toBe('BUF 24 - 13 KC');
    expect(container.textContent).not.toContain('Game Book unavailable');
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
    expect(html).toContain('Drive summary was not recorded for this game.');
    expect(html).toContain('Play-by-play was not recorded for this game.');
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

  it('renders Drive Summary rows when archived drives exist', () => {
    const game = {
      homeId: 1,
      awayId: 2,
      homeScore: 28,
      awayScore: 17,
      driveSummary: [
        { id: 'd1', teamId: 1, quarter: 2, startClock: '12:00', endClock: '7:42', result: 'TD', plays: 9, yards: 80, points: 7 },
      ],
    };
    const { getByTestId, getAllByTestId } = render(<BoxScore gameId="g-drive" league={{ ...baseLeague, gameById: { 'g-drive': game } }} embedded />);
    expect(getByTestId('game-book-drive-summary').textContent).toContain('Drive Summary');
    expect(getAllByTestId('game-book-drive-row')).toHaveLength(1);
    expect(getByTestId('game-book-drive-summary').textContent).toContain('TD');
    expect(getByTestId('game-book-drive-summary').textContent).toContain('80');
  });

  it('renders Key Plays from playLog and defaults to a curated list', () => {
    const game = {
      homeId: 1,
      awayId: 2,
      homeScore: 35,
      awayScore: 14,
      playLog: [
        { id: 'p1', quarter: 1, clock: '14:30', teamId: 1, text: 'Ordinary run for 3 yards', yards: 3 },
        { id: 'p2', quarter: 1, clock: '12:11', teamId: 1, text: 'Touchdown pass to the corner', isTouchdown: true, yards: 14 },
        { id: 'p3', quarter: 2, clock: '11:00', teamId: 2, text: 'Ordinary pass for 5 yards', yards: 5 },
        { id: 'p4', quarter: 2, clock: '8:33', teamId: 1, text: 'Run up the middle for 4 yards', yards: 4 },
        { id: 'p5', quarter: 3, clock: '13:02', teamId: 2, text: 'Quarterback sack for a loss', yards: -7 },
        { id: 'p6', quarter: 3, clock: '6:22', teamId: 1, text: 'Screen pass for 6 yards', yards: 6 },
        { id: 'p7', quarter: 4, clock: '9:41', teamId: 2, text: 'Draw play for 2 yards', yards: 2 },
        { id: 'p8', quarter: 4, clock: '2:05', teamId: 1, text: 'Kneel down', yards: -1 },
      ],
    };
    const { getAllByTestId, getByTestId, queryByText } = render(<BoxScore gameId="g-plays" league={{ ...baseLeague, gameById: { 'g-plays': game } }} embedded />);
    expect(getByTestId('game-book-play-by-play').textContent).toContain('Key Plays / Play-by-Play');
    expect(getAllByTestId('game-book-play-row')).toHaveLength(2);
    expect(getByTestId('game-book-play-by-play').textContent).toContain('Touchdown pass');
    expect(getByTestId('game-book-play-by-play').textContent).toContain('Quarterback sack');
    expect(queryByText('Ordinary run for 3 yards')).toBeNull();
  });

  it('toggles from key plays to the full play log', () => {
    const game = {
      homeId: 1,
      awayId: 2,
      homeScore: 35,
      awayScore: 14,
      playLog: [
        { id: 'p1', quarter: 1, clock: '14:30', teamId: 1, text: 'Ordinary run for 3 yards', yards: 3 },
        { id: 'p2', quarter: 1, clock: '12:11', teamId: 1, text: 'Touchdown pass to the corner', isTouchdown: true, yards: 14 },
        { id: 'p3', quarter: 2, clock: '11:00', teamId: 2, text: 'Ordinary pass for 5 yards', yards: 5 },
        { id: 'p4', quarter: 2, clock: '8:33', teamId: 1, text: 'Run up the middle for 4 yards', yards: 4 },
        { id: 'p5', quarter: 3, clock: '13:02', teamId: 2, text: 'Quarterback sack for a loss', yards: -7 },
      ],
    };
    const { getAllByTestId, getByTestId, getByText } = render(<BoxScore gameId="g-toggle" league={{ ...baseLeague, gameById: { 'g-toggle': game } }} embedded />);
    expect(getAllByTestId('game-book-play-row')).toHaveLength(2);
    fireEvent.click(getByTestId('game-book-play-toggle'));
    expect(getAllByTestId('game-book-play-row')).toHaveLength(5);
    expect(getByText('Ordinary run for 3 yards')).toBeTruthy();
    expect(getByTestId('game-book-play-toggle').textContent).toBe('Show key plays');
  });

  it('renders final score density, data availability chips, sorted player rows, and embedded back action', () => {
    const onBack = vi.fn();
    const game = {
      homeId: 1,
      awayId: 2,
      homeScore: 30,
      awayScore: 27,
      teamStats: { home: { totalYards: 410, turnovers: 1 }, away: { totalYards: 350, turnovers: 2 } },
      playerStats: {
        home: {
          11: { name: 'Second QB', stats: { passAtt: 15, passYd: 120 } },
          12: { name: 'First QB', stats: { passAtt: 30, passYd: 280 } },
        },
        away: {},
      },
    };
    const { container, getByTestId, getByText, getAllByText } = render(<BoxScore gameId="g-density" league={{ ...baseLeague, gameById: { 'g-density': game } }} onBack={onBack} embedded />);
    expect(getByText('KC defeated BUF by 3')).toBeTruthy();
    expect(getAllByText('Team stats').length).toBeGreaterThan(0);
    expect(getByText('Showing 2 passers')).toBeTruthy();
    const passingText = container.querySelector('[data-testid="game-book-table-passing"]').textContent;
    expect(passingText.indexOf('First QB')).toBeLessThan(passingText.indexOf('Second QB'));
    fireEvent.click(getByTestId('game-book-back-action'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

});
