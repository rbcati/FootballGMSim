import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import PostGameScreen from './PostGameScreen.jsx';

describe('PostGameScreen resilience', () => {
  it('renders without crashing when logs are missing', () => {
    const html = renderToString(
      <PostGameScreen
        homeTeam={{ id: 1, abbr: 'HME', name: 'Home' }}
        awayTeam={{ id: 2, abbr: 'AWY', name: 'Away' }}
        homeScore={21}
        awayScore={14}
        userTeamId={1}
        onContinue={() => {}}
      />,
    );

    expect(html).toContain('Back to Hub');
  });
});
