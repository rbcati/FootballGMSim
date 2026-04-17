import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

const mockRequestState = {
  data: null,
  loading: false,
  error: null,
};

vi.mock('../hooks/useStableRouteRequest.js', () => ({
  default: () => mockRequestState,
}));

import BoxScore, { PlayerButton } from './BoxScore.jsx';

describe('BoxScore postgame command center', () => {
  beforeEach(() => {
    mockRequestState.data = null;
    mockRequestState.loading = false;
    mockRequestState.error = null;
  });

  it('renders standout storylines and team leaders for rich completed payloads', () => {
    mockRequestState.data = {
      payload: {
        id: '2031_w1_1_2',
        week: 1,
        seasonId: 2031,
        homeId: 1,
        awayId: 2,
        homeScore: 24,
        awayScore: 31,
        topReason1: 'Pocket survived pressure',
        summary: {
          simOutputs: {
            home: { rushingYpc: 3.9 },
            away: { rushingYpc: 4.8 },
          },
          teamStats: {
            home: { redZoneScores: 2, redZoneTrips: 4, explosivePlays: 3 },
            away: { redZoneScores: 4, redZoneTrips: 5, explosivePlays: 7 },
          },
        },
        teamStats: {
          home: { totalYards: 342, turnovers: 2, sacks: 1, passYards: 212 },
          away: { totalYards: 426, turnovers: 0, sacks: 4, passYards: 294 },
        },
        playerStats: {
          away: {
            201: { name: 'A. QB', pos: 'QB', stats: { passComp: 25, passAtt: 35, passYd: 294, passTD: 3 } },
            202: { name: 'A. RB', pos: 'RB', stats: { rushAtt: 19, rushYd: 101, rushTD: 1 } },
            203: { name: 'A. WR', pos: 'WR', stats: { receptions: 8, recYd: 120, recTD: 2 } },
            204: { name: 'A. LB', pos: 'LB', stats: { tackles: 10, sacks: 2, interceptions: 1 } },
            205: { name: 'A. K', pos: 'K', stats: { fieldGoalsMade: 1, fieldGoalsAttempted: 1, extraPointsMade: 4, extraPointsAttempted: 4 } },
          },
          home: {
            101: { name: 'H. QB', pos: 'QB', stats: { passComp: 22, passAtt: 34, passYd: 212, passTD: 2, interceptions: 2 } },
          },
        },
        playLog: [
          { quarter: 2, clock: '10:20', text: 'Touchdown pass', isTouchdown: true, teamId: 2 },
          { quarter: 1, clock: '1:59', text: 'Field goal', teamId: 1 },
        ],
      },
      errorMessage: null,
    };

    const html = renderToString(
      <BoxScore
        gameId="2031_w1_1_2"
        league={{ seasonId: 2031, teams: [{ id: 1, abbr: 'KC' }, { id: 2, abbr: 'BUF' }] }}
        actions={{}}
        embedded
      />,
    );

    expect(html).toContain('Standout storylines');
    expect(html).toContain('Team leaders');
    expect(html).toContain('Scoring summary');
  });

  it('fails safely for partial archived payloads without crashing', () => {
    mockRequestState.data = {
      payload: {
        id: 'legacy_game',
        homeId: 1,
        awayId: 2,
        homeScore: 14,
        awayScore: 10,
        summary: null,
        playerStats: { home: {}, away: {} },
        teamStats: { home: null, away: null },
        playLog: [],
      },
      errorMessage: null,
    };

    const html = renderToString(
      <BoxScore
        gameId="legacy_game"
        league={{ seasonId: 2031, teams: [{ id: 1, abbr: 'KC' }, { id: 2, abbr: 'BUF' }] }}
        actions={{}}
        embedded
      />,
    );

    expect(html).toContain('Game Book');
    expect(html).toContain('Detailed box score is unavailable');
  });

  it('player buttons trigger existing selection handlers when player ids are present', () => {
    const onSelect = vi.fn();
    const element = PlayerButton({ player: { playerId: 55, name: 'Tester' }, onSelect });
    expect(element.type).toBe('button');
    element.props.onClick();
    expect(onSelect).toHaveBeenCalledWith(55);
  });
});
