import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import NewsFeed from './NewsFeed.jsx';

const league = {
  week: 7,
  userTeamId: 10,
  teams: [{ id: 10, name: 'Portland', wins: 4, losses: 2, roster: [{ id: 55, name: 'Rookie WR', pos: 'WR' }] }],
  standings: [{ id: 10, wins: 4, losses: 2, ties: 0, pointsFor: 150, pointsAgainst: 140 }],
  newsItems: [
    { id: 'n1', headline: 'Big upset in prime time', body: 'The underdog won late.', priority: 'high', week: 7, phase: 'regular', gameId: '2026_w7_1_2', category: 'major_result' },
    { id: 'n2', headline: 'Team extends star receiver', body: 'New contract secures target share.', priority: 'medium', week: 7, phase: 'regular', teamId: 10, category: 'team' },
    { id: 'n3', headline: 'Veteran traded for picks', body: 'Deadline move shakes standings.', priority: 'medium', week: 7, phase: 'regular', teamId: 8, category: 'trade_completed' },
    { id: 'n4', headline: 'Rookie on injury report', body: 'Day-to-day with hamstring tightness.', priority: 'low', week: 7, phase: 'regular', playerId: 55, category: 'injury' },
  ],
};

describe('NewsFeed', () => {
  it('renders premium desk sections with featured story and CTA buttons', () => {
    const html = renderToString(
      <NewsFeed
        league={league}
        onTeamSelect={() => {}}
        onOpenBoxScore={() => {}}
        onPlayerSelect={() => {}}
        onNavigate={() => {}}
      />,
    );

    expect(html).toContain('Weekly Intelligence');
    expect(html).toContain('News &amp; Injuries');
    expect(html).toContain('Featured Lead Story');
    expect(html).toContain('Open game');
    expect(html).toContain('Open team');
    expect(html).toContain('Open player');
    expect(html).toContain('Team Desk');
    expect(html).toContain('League Pulse');
    expect(html).toContain('Use filters to keep this desk focused by context.');
  });



  it('renders recoverable unavailable actions for stale player and team references', () => {
    const html = renderToString(
      <NewsFeed
        league={{
          ...league,
          newsItems: [
            { id: 'stale-player', headline: 'Injury update', body: 'A player reference is stale.', priority: 'low', week: 7, phase: 'regular', playerId: 999, category: 'injury' },
            { id: 'stale-team', headline: 'Trade request', body: 'A team reference is stale.', priority: 'medium', week: 7, phase: 'regular', teamId: 999, category: 'trade_request' },
          ],
        }}
        onTeamSelect={() => {}}
        onOpenBoxScore={() => {}}
        onPlayerSelect={() => {}}
        onNavigate={() => {}}
      />,
    );

    expect(html).toContain('Player unavailable');
    expect(html).toContain('Team unavailable');
    expect(html).not.toContain('We couldn');
  });

  it('renders an empty state safely when there are no stories', () => {
    const html = renderToString(
      <NewsFeed
        league={{ ...league, newsItems: [] }}
        onTeamSelect={() => {}}
        onOpenBoxScore={() => {}}
        onPlayerSelect={() => {}}
        onNavigate={() => {}}
      />,
    );

    expect(html).toContain('No news yet.');
  });
});
