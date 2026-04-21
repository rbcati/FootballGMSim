import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import PlayerProfile from '../PlayerProfile.jsx';

describe('PlayerProfile', () => {
  it('renders safe unavailable state when no player id is provided', () => {
    const html = renderToString(
      <PlayerProfile
        playerId={null}
        onClose={vi.fn()}
        actions={{ getPlayerCareer: vi.fn() }}
        teams={[]}
        league={{ teams: [], week: 1 }}
      />,
    );

    expect(html).toContain('Player profile unavailable');
    expect(html).toContain('Close');
  });
});
