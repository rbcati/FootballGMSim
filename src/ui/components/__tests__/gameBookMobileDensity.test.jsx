/** @vitest-environment jsdom */
/**
 * Mobile Game Book density — verifies the review surface answers "what
 * happened?" (final score, key leaders, decisive moments) before dense
 * stat tables/play-by-play, and that dense sections are collapsed via
 * native <details>/<summary> rather than dumped inline.
 */
import React from 'react';
import { readFileSync, globSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import BoxScore from '../BoxScore.jsx';
import GameDetailScreen from '../GameDetailScreen.jsx';

vi.mock('../../hooks/useStableRouteRequest.js', () => ({ default: vi.fn(() => ({ data: null })) }));
import useStableRouteRequest from '../../hooks/useStableRouteRequest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const league = {
  seasonId: 2031,
  week: 6,
  userTeamId: 1,
  teams: [{ id: 1, abbr: 'HME' }, { id: 2, abbr: 'AWY' }],
};

const richGame = {
  gameId: 'g-density',
  homeId: 1,
  awayId: 2,
  homeScore: 27,
  awayScore: 20,
  teamStats: {
    home: { totalYards: 400, passYards: 250, rushYards: 150, turnovers: 1, sacks: 2 },
    away: { totalYards: 350, passYards: 220, rushYards: 130, turnovers: 2, sacks: 1 },
  },
  playerStats: {
    home: {
      11: { name: 'Home QB', stats: { passAtt: 30, passComp: 22, passYd: 250, passTD: 3 } },
      22: { name: 'Home RB', stats: { rushAtt: 18, rushYd: 110, rushTD: 1 } },
      33: { name: 'Home WR', stats: { targets: 8, receptions: 6, recYd: 120, recTD: 2 } },
      44: { name: 'Home LB', stats: { tackles: 9, sacks: 2, interceptions: 1 } },
    },
    away: {
      55: { name: 'Away QB', stats: { passAtt: 28, passComp: 18, passYd: 220, passTD: 1, interceptions: 1 } },
    },
  },
  scoringSummary: [
    { quarter: 1, time: '10:21', teamAbbr: 'HME', type: 'TD', description: 'Home QB pass to Home WR', scoreAfter: { home: 7, away: 0 } },
    { quarter: 2, time: '4:02', teamAbbr: 'AWY', type: 'FG', description: '38-yard field goal', scoreAfter: { home: 7, away: 3 } },
    { quarter: 3, time: '9:14', teamAbbr: 'HME', type: 'TD', description: 'Home RB run', scoreAfter: { home: 14, away: 3 } },
    { quarter: 4, time: '2:00', teamAbbr: 'AWY', type: 'TD', description: 'Away QB pass', scoreAfter: { home: 27, away: 20 } },
    { quarter: 4, time: '0:45', teamAbbr: 'HME', type: 'FG', description: 'Clinching field goal', scoreAfter: { home: 27, away: 20 } },
  ],
  playLog: [
    { quarter: 1, clock: '14:55', teamId: 1, text: 'Home QB pass complete for 12 yards', yards: 12 },
    { quarter: 1, clock: '10:21', teamId: 1, text: 'Home QB touchdown pass to Home WR', isTouchdown: true, yards: 18 },
    { quarter: 4, clock: '2:00', teamId: 2, text: 'Away QB touchdown pass', isTouchdown: true, yards: 25 },
  ],
};

function renderRichBoxScore(overrides = {}) {
  return render(
    <BoxScore
      gameId="g-density"
      league={{ ...league, gameById: { 'g-density': richGame } }}
      embedded
      {...overrides}
    />,
  );
}

describe('Game Book mobile density — section hierarchy', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(useStableRouteRequest).mockReturnValue({ data: null });
  });

  function isBefore(a, b) {
    // true if `a` appears before `b` in document order
    return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  it('renders the final score before any dense stat table', () => {
    const { getByTestId } = renderRichBoxScore();
    const hero = getByTestId('game-book-score-hero');
    const playerStats = getByTestId('game-book-player-stats');
    expect(isBefore(hero, playerStats)).toBe(true);
  });

  it('renders key leaders above the full player stat tables', () => {
    const { getByTestId } = renderRichBoxScore();
    const leaders = getByTestId('game-book-leaders');
    const playerStats = getByTestId('game-book-player-stats');
    expect(isBefore(leaders, playerStats)).toBe(true);
    // Sanity: leaders actually surface top performers, not just a label.
    expect(leaders.textContent).toMatch(/Home QB|Home RB|Home WR|Away QB/);
  });

  it('renders decisive moments above the full player stat tables and full play-by-play', () => {
    const { getByTestId } = renderRichBoxScore();
    const moments = getByTestId('game-book-moments');
    const playerStats = getByTestId('game-book-player-stats');
    const playByPlay = getByTestId('game-book-play-by-play');
    expect(isBefore(moments, playerStats)).toBe(true);
    expect(isBefore(moments, playByPlay)).toBe(true);
  });

  it('renders team stat comparison above the full player stat tables', () => {
    const { getByTestId } = renderRichBoxScore();
    const teamStats = getByTestId('game-book-team-stats');
    const playerStats = getByTestId('game-book-player-stats');
    expect(isBefore(teamStats, playerStats)).toBe(true);
  });

  it('collapses dense sections behind native <details> closed by default', () => {
    const { getByTestId } = renderRichBoxScore();
    for (const testId of ['game-book-scoring-summary', 'game-book-team-stats', 'game-book-player-stats', 'game-book-play-by-play']) {
      const el = getByTestId(testId);
      expect(el.tagName).toBe('DETAILS');
      expect(el.hasAttribute('open')).toBe(false);
      // A summary teaser must still be visible without expansion.
      expect(el.querySelector('summary')).toBeTruthy();
    }
  });

  it('places the full play-by-play log lower in DOM order than the score hero and leaders', () => {
    const { getByTestId } = renderRichBoxScore();
    const hero = getByTestId('game-book-score-hero');
    const leaders = getByTestId('game-book-leaders');
    const playByPlay = getByTestId('game-book-play-by-play');
    expect(isBefore(hero, playByPlay)).toBe(true);
    expect(isBefore(leaders, playByPlay)).toBe(true);
  });

  it('does not mutate the game/archive data it renders', () => {
    const frozenClone = JSON.parse(JSON.stringify(richGame));
    Object.freeze(frozenClone);
    Object.freeze(frozenClone.teamStats);
    Object.freeze(frozenClone.playerStats);
    Object.freeze(frozenClone.scoringSummary);
    Object.freeze(frozenClone.playLog);
    const before = JSON.stringify(richGame);
    render(
      <BoxScore gameId="g-density" league={{ ...league, gameById: { 'g-density': richGame } }} embedded />,
    );
    expect(JSON.stringify(richGame)).toBe(before);
  });
});

describe('Game Book navigation copy — consistent return affordances', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(useStableRouteRequest).mockReturnValue({ data: null });
  });

  it('defaults the sticky header and screen header back label to "Return to HQ"', () => {
    const { getByTestId } = render(
      <GameDetailScreen
        gameId="g-density"
        league={{ ...league, gameById: { 'g-density': richGame } }}
        actions={{}}
        onBack={vi.fn()}
      />,
    );
    expect(getByTestId('game-book-sticky-back').textContent).toContain('Return to HQ');
    expect(getByTestId('return-to-hq').textContent).toContain('Return to HQ');
  });

  it('honors an explicit backLabel (e.g. returning to an intermediate results screen) consistently', () => {
    const { getByTestId } = render(
      <GameDetailScreen
        gameId="g-density"
        league={{ ...league, gameById: { 'g-density': richGame } }}
        actions={{}}
        onBack={vi.fn()}
        backLabel="Back to Weekly Results"
      />,
    );
    expect(getByTestId('game-book-sticky-back').textContent).toContain('Back to Weekly Results');
  });
});

describe('Game Book canonical CTA — "View Game Book" only', () => {
  it('never reintroduces "View Box Score" copy in active src/ui JSX', () => {
    const files = globSync('src/ui/**/*.jsx', { cwd: REPO_ROOT });
    const offenders = [];
    for (const relPath of files) {
      if (relPath.includes('__tests__') || relPath.endsWith('.test.jsx')) continue;
      const contents = readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
      if (contents.includes('View Box Score')) offenders.push(relPath);
    }
    expect(offenders).toEqual([]);
  });
});
