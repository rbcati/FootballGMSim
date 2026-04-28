import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import GameDetailScreen from './GameDetailScreen.jsx';

describe('GameDetailScreen canonical title', () => {
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
