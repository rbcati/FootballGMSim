import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import SocialFeed from '../SocialFeed.jsx';

describe('SocialFeed', () => {
  it('renders feed entries and action buttons', () => {
    const html = renderToString(
      <SocialFeed
        league={{
          userTeamId: 1,
          newsItems: [{
            id: 'evt-1',
            type: 'holdout',
            headline: 'Star WR skips workouts',
            body: 'Negotiations stalled.',
            teamId: 1,
            playerId: 7,
            actionLabel: 'Negotiate',
            actionTarget: 'Contract Center',
            week: 5,
            year: 2027,
            timestamp: Date.now(),
          }],
        }}
      />,
    );

    expect(html).toContain('Social Feed');
    expect(html).toContain('Star WR skips workouts');
    expect(html).toContain('View Profile');
  });
});
