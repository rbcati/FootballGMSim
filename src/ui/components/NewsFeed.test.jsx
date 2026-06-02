/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { act, cleanup, render } from '@testing-library/react';
import NewsFeed, { NEWS_ICON, resolveNewsIcon } from './NewsFeed.jsx';

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

beforeEach(() => {
  cleanup();
});

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

// ── Worker-news regression tests ─────────────────────────────────────────────

describe('NewsFeed worker-news refresh', () => {
  const workerItem = { id: 'wn1', headline: 'Worker headline', body: 'From worker.', priority: 'high', week: 7, phase: 'regular', category: 'major_result' };
  const freshItem  = { id: 'wn2', headline: 'Fresh after advance', body: 'New week.', priority: 'medium', week: 8, phase: 'regular', category: 'major_result' };

  it('renders worker-fetched news on initial mount', async () => {
    const getNews = vi.fn().mockResolvedValue([workerItem]);

    const { container } = render(
      <NewsFeed league={{ ...league, newsItems: [] }} actions={{ getNews }} onNavigate={() => {}} />,
    );

    await act(async () => {});

    expect(getNews).toHaveBeenCalledWith(10);
    expect(container.textContent).toContain('Worker headline');
  });

  it('refetches and shows updated headlines when league.week advances', async () => {
    const getNews = vi.fn()
      .mockResolvedValueOnce([workerItem])
      .mockResolvedValueOnce([freshItem]);

    const baseLeague = { ...league, week: 7, newsItems: [workerItem] };

    const { rerender, container } = render(
      <NewsFeed league={baseLeague} actions={{ getNews }} onNavigate={() => {}} />,
    );
    await act(async () => {});
    expect(container.textContent).toContain('Worker headline');

    await act(async () => {
      rerender(
        <NewsFeed
          league={{ ...baseLeague, week: 8, newsItems: [workerItem, freshItem] }}
          actions={{ getNews }}
          onNavigate={() => {}}
        />,
      );
    });

    expect(getNews).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Fresh after advance');
  });

  it('shows league.newsItems when workerNews snapshot is not yet available', () => {
    // No actions prop → workerNews stays null → league.newsItems surface immediately.
    const leagueItem = { id: 'li1', headline: 'League-state headline', body: '.', priority: 'medium', week: 7, phase: 'regular', category: 'team' };
    const html = renderToString(
      <NewsFeed league={{ ...league, newsItems: [leagueItem] }} onNavigate={() => {}} />,
    );
    expect(html).toContain('League-state headline');
  });

  it('renders loading spinner while getNews is pending', async () => {
    let resolveGetNews;
    const getNews = vi.fn(() => new Promise((r) => { resolveGetNews = r; }));

    const { getByRole } = render(
      <NewsFeed league={{ ...league, newsItems: [] }} actions={{ getNews }} onNavigate={() => {}} />,
    );

    // Spinner should be visible before the fetch resolves
    expect(getByRole('status')).toBeTruthy();

    await act(async () => { resolveGetNews([]); });
  });

  it('renders error banner when getNews rejects', async () => {
    const getNews = vi.fn().mockRejectedValue(new Error('Network error'));

    const { getByRole } = render(
      <NewsFeed league={{ ...league, newsItems: [] }} actions={{ getNews }} onNavigate={() => {}} />,
    );

    await act(async () => {});

    const alert = getByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain('Unable to load news');
  });
});

// ── NEWS_ICON / resolveNewsIcon unit tests ────────────────────────────────────

describe('resolveNewsIcon', () => {
  it('every built-in type maps to a non-empty icon string with a label', () => {
    const supported = ['injury', 'trade', 'signing', 'release', 'award', 'milestone', 'narrative', 'default'];
    for (const key of supported) {
      const { icon, label } = NEWS_ICON[key];
      expect(icon.trim()).not.toBe('');
      expect(label.trim()).not.toBe('');
    }
  });

  it('resolves injury type items to the injury icon', () => {
    expect(resolveNewsIcon({ type: 'injury' })).toBe(NEWS_ICON.injury);
    expect(resolveNewsIcon({ category: 'player_injury' })).toBe(NEWS_ICON.injury);
  });

  it('resolves trade type items to the trade icon', () => {
    expect(resolveNewsIcon({ type: 'trade_completed' })).toBe(NEWS_ICON.trade);
  });

  it('resolves signing/release/award/milestone/narrative types correctly', () => {
    expect(resolveNewsIcon({ type: 'signing' })).toBe(NEWS_ICON.signing);
    expect(resolveNewsIcon({ type: 'release' })).toBe(NEWS_ICON.release);
    expect(resolveNewsIcon({ type: 'award' })).toBe(NEWS_ICON.award);
    expect(resolveNewsIcon({ type: 'milestone' })).toBe(NEWS_ICON.milestone);
    expect(resolveNewsIcon({ type: 'narrative' })).toBe(NEWS_ICON.narrative);
  });

  it('falls back to the default icon for unknown types', () => {
    expect(resolveNewsIcon({ type: 'unknown_xyz' })).toBe(NEWS_ICON.default);
    expect(resolveNewsIcon(null)).toBe(NEWS_ICON.default);
  });
});
