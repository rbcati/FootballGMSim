import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import GameDetailV2 from './GameDetailV2';

describe('GameDetailV2 tactical recap stability', () => {
  const teams = {
    awayTeam: { id: 1, abbr: 'AWY' },
    homeTeam: { id: 2, abbr: 'HME' },
  };

  it('renders rich tactical recap payloads', () => {
    const html = renderToString(
      <GameDetailV2
        game={{
          eventDigest: [{ quarter: 2, clockSec: 201, team: 'away', type: 'explosive_play', text: 'Deep shot sets up score', awayScore: 10, homeScore: 7 }],
          summary: {
            headlineMoments: ['QB scramble flips field position'],
            teamStats: {
              away: { successRate: 0.48, explosivePlays: 5, redZoneScores: 2, redZoneTrips: 3, passYd: 260, rushYd: 110, plays: 65, sacksMade: 2, turnovers: 1 },
              home: { successRate: 0.44, explosivePlays: 3, redZoneScores: 1, redZoneTrips: 3, passYd: 215, rushYd: 102, plays: 63, sacksMade: 1, turnovers: 2 },
            },
          },
          topReason1: 'Controlled early-down efficiency',
        }}
        {...teams}
      />,
    );

    expect(html).toContain('Tactical recap');
    expect(html).toContain('Controlled early-down efficiency');
  });

  it('fails safely (returns empty output) for partial/malformed detail payloads', () => {
    const html = renderToString(
      <GameDetailV2
        game={{
          eventDigest: { not: 'an array' },
          summary: { headlineMoments: null, teamStats: {} },
          topReason1: null,
        }}
        {...teams}
      />,
    );

    expect(html).toBe('');
  });
});
