import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import StandingsCenter, { getConferenceRankings } from './StandingsCenter.jsx';

const teams = [
  { id: 1, conf: 0, div: 0, name: 'Buffalo', abbr: 'BUF', wins: 11, losses: 5, ties: 0, ptsFor: 410, ptsAgainst: 335, ovr: 86, capRoom: 19, recentResults: ['W', 'W'] },
  { id: 2, conf: 0, div: 1, name: 'Kansas City', abbr: 'KC', wins: 12, losses: 4, ties: 0, ptsFor: 430, ptsAgainst: 340, ovr: 89, capRoom: 11, recentResults: ['W', 'L'] },
  { id: 3, conf: 0, div: 0, name: 'Miami', abbr: 'MIA', wins: 10, losses: 6, ties: 0, ptsFor: 399, ptsAgainst: 360, ovr: 84, capRoom: 8, recentResults: ['L'] },
  { id: 4, conf: 1, div: 0, name: 'Dallas', abbr: 'DAL', wins: 9, losses: 7, ties: 0, ptsFor: 380, ptsAgainst: 360, ovr: 82, capRoom: 6, recentResults: ['W'] },
];

describe('StandingsCenter', () => {
  it('computes playoff picture pools with division winners and wild cards', () => {
    const rankings = getConferenceRankings(teams, 0);
    expect(rankings.divWinnerList.length).toBeGreaterThan(0);
    expect(rankings.wildcards.find((team) => team.id === 3)).toBeTruthy();
  });

  it('renders standings center shell and division hierarchy', () => {
    const html = renderToString(
      <StandingsCenter
        teams={teams}
        userTeamId={1}
        onTeamSelect={() => {}}
        leagueSettings={{ conferenceNames: ['AFC', 'NFC'], divisionNames: ['East', 'North', 'South', 'West'] }}
        standingsContext={{ label: 'Snapshot · Week 16' }}
      />,
    );

    expect(html).toContain('Standings Center');
    expect(html).toContain('AFC standings');
    expect(html).toContain('AFC East');
    expect(html).toContain('Snapshot · Week 16');
  });

  it('renders safe fallback for empty/partial standings data', () => {
    const html = renderToString(
      <StandingsCenter
        teams={[]}
        userTeamId={1}
        onTeamSelect={() => {}}
        leagueSettings={{ conferenceNames: ['AFC', 'NFC'] }}
      />,
    );

    expect(html).toContain('No conference data');
  });
});
