/** @vitest-environment jsdom */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { cleanup, fireEvent, render } from '@testing-library/react';
import GameDetailScreen from './GameDetailScreen.jsx';

vi.mock('../hooks/useStableRouteRequest.js', () => ({ default: vi.fn(() => ({ data: null, loading: false, error: null })) }));
import useStableRouteRequest from '../hooks/useStableRouteRequest.js';

const league = {
  id: 'league-test',
  seasonId: 2031,
  week: 4,
  userTeamId: 1,
  teams: [
    { id: 1, abbr: 'PIT', name: 'Pittsburgh' },
    { id: 2, abbr: 'CLE', name: 'Cleveland' },
  ],
  schedule: {
    weeks: [
      {
        week: 3,
        games: [
          {
            gameId: '2031_w3_1_2',
            id: '2031_w3_1_2',
            homeId: 1,
            awayId: 2,
            homeScore: 0,
            awayScore: 0,
            played: true,
          },
        ],
      },
    ],
  },
};

const archiveGame = {
  gameId: '2031_w3_1_2',
  id: '2031_w3_1_2',
  seasonId: 2031,
  week: 3,
  homeId: 1,
  awayId: 2,
  homeScore: 27,
  awayScore: 10,
  played: true,
  teamStats: { home: { passYards: 250 }, away: { passYards: 180 } },
  playerStats: {
    home: { 11: { name: 'PIT QB', stats: { passAtt: 30, passYd: 250, passTD: 2 } } },
    away: { 22: { name: 'CLE QB', stats: { passAtt: 28, passYd: 180, passTD: 1 } } },
  },
};


describe('GameDetailScreen canonical title and prep context', () => {
  beforeEach(() => {
    vi.mocked(useStableRouteRequest).mockReturnValue({ data: null, loading: false, error: null });
  });

  it('uses a single Game Book destination title', () => {
    const html = renderToString(
      <GameDetailScreen
        gameId="2031_w1_1_2"
        league={{ seasonId: '2031' }}
        actions={{ getBoxScore: async () => ({ game: null }) }}
      />,
    );

    expect(html).toContain('Game Book');
    expect(html).toContain('Week');
    expect(html).not.toContain('Completed Game Detail');
  });

  it('renders preparation context strip with non-causal copy when markers are present', () => {
    const html = renderToString(
      <GameDetailScreen
        gameId="2031_w1_1_2"
        league={{
          seasonId: '2031',
          userTeamId: 1,
          teams: [{
            id: 1,
            strategies: { gamePlan: { runPassBalance: 55 } },
            weeklyDevelopmentFocus: { stamp: '2031:1', positionGroups: ['qb'] },
            roster: [{ id: 4, injuryWeeksRemaining: 2 }],
          }],
          schedule: {
            weeks: [{ week: 1, games: [{ gameId: '2031_w1_1_2', home: { id: 1, abbr: 'AAA' }, away: { id: 2, abbr: 'BBB' }, homeScore: 20, awayScore: 17, played: true }] }],
          },
        }}
        actions={{ getBoxScore: async () => ({ game: null }) }}
      />,
    );

    expect(html).toContain('Preparation Context');
    expect(html).toContain('does not assign direct causality');
    expect(html).toContain('Game plan was saved before kickoff');
  });

  it('renders an explicit empty state when no game is selected', () => {
    const html = renderToString(
      <GameDetailScreen
        gameId={null}
        league={{ seasonId: '2031' }}
        actions={{}}
      />,
    );

    expect(html).toContain('No completed game selected yet.');
    expect(html).toContain('No game selected');
  });
});

describe('GameDetailScreen score source of truth', () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(useStableRouteRequest).mockReturnValue({ data: archiveGame, loading: false, error: null });
  });

  it('uses the archived final score for both header summary and Game Book detail when schedule state is stale', () => {
    const { getByTestId, container } = render(
      <GameDetailScreen
        gameId="2031_w3_1_2"
        league={league}
        actions={{ getBoxScore: vi.fn() }}
        onBack={vi.fn()}
      />,
    );

    expect(container.textContent).toContain('PIT defeated CLE by 17');
    expect(container.textContent).toContain('CLE 10 - 27 PIT');
    expect(getByTestId('game-book-final-score').textContent).toBe('CLE 10 - 27 PIT');
    expect(container.textContent).not.toContain('CLE 0 - 0 PIT');
    expect(container.textContent).not.toContain('finished tied');
  });

  it('renders a compact sticky Game Book header with week, teams, score and W/L result', () => {
    const onBack = vi.fn();
    const { getByTestId } = render(
      <GameDetailScreen
        gameId="2031_w3_1_2"
        league={league}
        actions={{ getBoxScore: vi.fn() }}
        onBack={onBack}
      />,
    );

    const header = getByTestId('game-book-sticky-header');
    expect(getByTestId('game-book-sticky-week').textContent).toContain('Wk 3');
    const scoreText = getByTestId('game-book-sticky-score').textContent;
    expect(scoreText).toContain('CLE');
    expect(scoreText).toContain('PIT');
    expect(scoreText).toContain('10');
    expect(scoreText).toContain('27');
    // User team (PIT, id 1) won 27-10 → W badge from the user's perspective.
    expect(header.querySelector('.game-book-sticky-header__badge').textContent).toBe('W');

    fireEvent.click(getByTestId('game-book-sticky-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
