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
    expect(html).not.toContain('Completed Game Detail');
  });
});
