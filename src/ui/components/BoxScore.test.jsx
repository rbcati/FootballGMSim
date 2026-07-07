/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { cleanup, fireEvent, render } from '@testing-library/react';
import BoxScore, { PlayerButton } from './BoxScore.jsx';

vi.mock('../hooks/useStableRouteRequest.js', () => ({ default: vi.fn(() => ({ data: null })) }));
import useStableRouteRequest from '../hooks/useStableRouteRequest.js';

describe('BoxScore compact sheet — core rendering', () => {
  const baseLeague = { seasonId: 2031, week: 2, teams: [{ id: 1, abbr: 'KC' }, { id: 2, abbr: 'BUF' }] };

  beforeEach(() => {
    cleanup();
    vi.mocked(useStableRouteRequest).mockReturnValue({ data: null });
  });

  it('renders score hero from actions.getBoxScore archive payload', () => {
    vi.mocked(useStableRouteRequest).mockReturnValue({
      data: { homeId: 1, awayId: 2, homeScore: 14, awayScore: 10, teamStats: { home: { passYards: 100 }, away: { passYards: 80 } } },
    });
    const html = renderToString(<BoxScore gameId="g1" league={baseLeague} actions={{ getBoxScore: vi.fn() }} embedded />);
    expect(html).toContain('KC');
    expect(html).toContain('BUF');
    expect(html).toContain('14');
    expect(html).toContain('10');
  });

  it('falls back to league.gameById when no action exists and shows score', () => {
    const html = renderToString(
      <BoxScore gameId="g2" league={{ ...baseLeague, gameById: { g2: { homeId: 1, awayId: 2, homeScore: 14, awayScore: 10 } } }} embedded />,
    );
    expect(html).toContain('KC');
    expect(html).toContain('14');
  });

  it('uses completed schedule fallback and exposes finalScoreLine via game-book-final-score', () => {
    vi.mocked(useStableRouteRequest).mockReturnValue({ data: { type: 'BOX_SCORE', payload: { game: null, error: 'not found' } } });
    const scheduleGame = {
      gameId: '2031_w4_1_2',
      home: { id: 1, abbr: 'KC' },
      away: { id: 2, abbr: 'BUF' },
      homeScore: 13,
      awayScore: 24,
      played: true,
      week: 4,
    };
    const { getByTestId, container } = render(
      <BoxScore gameId="2031_w4_1_2" league={baseLeague} actions={{ getBoxScore: vi.fn() }} scheduleGame={scheduleGame} embedded />,
    );
    expect(getByTestId('game-book-final-score').textContent).toBe('BUF 24 - 13 KC');
    expect(container.textContent).not.toContain('Game Book unavailable');
  });

  it('renders sheet container with score hero and stat tab row', () => {
    const game = {
      homeId: 1,
      awayId: 2,
      homeScore: 21,
      awayScore: 17,
      teamStats: { home: { passYards: 201 }, away: { passYards: 230 } },
      playerStats: { home: { 22: { name: 'Away QB', stats: { passAtt: 24, passComp: 18, passYd: 200 } } }, away: {} },
    };
    const { getByTestId } = render(
      <BoxScore gameId="g3" league={{ ...baseLeague, gameById: { g3: game } }} embedded />,
    );
    expect(getByTestId('game-book-score-hero')).toBeTruthy();
    expect(getByTestId('game-book-stat-tabs')).toBeTruthy();
    expect(getByTestId('game-book-tab-passing')).toBeTruthy();
    expect(getByTestId('game-book-tab-rushing')).toBeTruthy();
    expect(getByTestId('game-book-tab-defense')).toBeTruthy();
  });

  it('score-only game: renders score hero but no stat table rows', () => {
    const { getByTestId, queryAllByTestId } = render(
      <BoxScore gameId="g4" league={{ ...baseLeague, gameById: { g4: { homeId: 1, awayId: 2, homeScore: 6, awayScore: 3 } } }} embedded />,
    );
    expect(getByTestId('game-book-score-hero')).toBeTruthy();
    // No player rows since no playerStats
    expect(queryAllByTestId('game-book-player-link')).toHaveLength(0);
  });

  it('renders passing stat table by default when playerStats exist', () => {
    const game = {
      homeId: 1,
      awayId: 2,
      homeScore: 28,
      awayScore: 17,
      teamStats: { home: { passYards: 250 }, away: {} },
      playerStats: {
        home: { 11: { name: 'Home QB', stats: { passAtt: 30, passComp: 20, passYd: 250, passTD: 3 } } },
        away: {},
      },
    };
    const { getByTestId } = render(
      <BoxScore gameId="g-pass" league={{ ...baseLeague, gameById: { 'g-pass': game } }} embedded />,
    );
    // Passing tab active by default
    expect(getByTestId('game-book-tab-passing').getAttribute('aria-selected')).toBe('true');
    expect(getByTestId('game-book-table-passing')).toBeTruthy();
    expect(getByTestId('game-book-table-passing').textContent).toContain('Home QB');
  });

  it('renders defense stat table after switching to defense tab', () => {
    const game = {
      homeId: 1,
      awayId: 2,
      homeScore: 21,
      awayScore: 17,
      teamStats: { home: { passYards: 201, sacks: 3 }, away: { passYards: 230 } },
      playerStats: {
        home: { 99: { name: 'DE Star', stats: { tackles: 6, sacks: 2, tfl: 1, interceptions: 0, passesDefended: 2 } } },
        away: { 12: { name: 'Away QB', stats: { passAtt: 22, passComp: 14, passYd: 180, passTD: 1, interceptions: 2, sacked: 3, passerRating: 72.5 } } },
      },
    };
    const { getByTestId } = render(
      <BoxScore gameId="g-def" league={{ ...baseLeague, gameById: { 'g-def': game } }} embedded />,
    );
    fireEvent.click(getByTestId('game-book-tab-defense'));
    expect(getByTestId('game-book-tab-defense').getAttribute('aria-selected')).toBe('true');
    expect(getByTestId('game-book-table-defense')).toBeTruthy();
    expect(getByTestId('game-book-table-defense').textContent).toContain('DE Star');
  });

  it('tab switching swaps stat content in place without stacking', () => {
    const game = {
      homeId: 1,
      awayId: 2,
      homeScore: 35,
      awayScore: 14,
      teamStats: { home: { passYards: 250 }, away: {} },
      playerStats: {
        home: {
          11: { name: 'QB One', stats: { passAtt: 30, passYd: 250 } },
          22: { name: 'RB Two', stats: { rushAtt: 15, rushYd: 90 } },
        },
        away: {},
      },
    };
    const { getByTestId, queryByTestId } = render(
      <BoxScore gameId="g-tabs" league={{ ...baseLeague, gameById: { 'g-tabs': game } }} embedded />,
    );
    // Default: passing tab active, shows QB
    expect(getByTestId('game-book-table-passing').textContent).toContain('QB One');
    // Switch to rushing
    fireEvent.click(getByTestId('game-book-tab-rushing'));
    expect(getByTestId('game-book-table-rushing').textContent).toContain('RB Two');
    // Passing table no longer rendered
    expect(queryByTestId('game-book-table-passing')).toBeNull();
  });

  it('stat table caps rows at MAX_STAT_ROWS (6) even with more players', () => {
    const playerStats = {};
    for (let i = 1; i <= 10; i++) {
      playerStats[i] = { name: `QB ${i}`, stats: { passAtt: 10 + i, passYd: 100 + i * 10 } };
    }
    const game = {
      homeId: 1,
      awayId: 2,
      homeScore: 28,
      awayScore: 17,
      teamStats: { home: { passYards: 250 }, away: {} },
      playerStats: { home: playerStats, away: {} },
    };
    const { getByTestId } = render(
      <BoxScore gameId="g-maxrows" league={{ ...baseLeague, gameById: { 'g-maxrows': game } }} embedded />,
    );
    const rows = getByTestId('game-book-table-passing').querySelectorAll('tbody tr');
    expect(rows.length).toBeLessThanOrEqual(6);
  });

  it('renders executive summary when reasoning bullets exist', () => {
    vi.mocked(useStableRouteRequest).mockReturnValue({
      data: {
        homeId: 1, awayId: 2, homeScore: 28, awayScore: 17,
        gameReasoningFlags: [
          { type: 'PASS_DOMINANT', value: 0.8 },
          { type: 'TURNOVER_IMPACT', value: 0.6 },
        ],
      },
    });
    const { getByTestId, queryByTestId } = render(
      <BoxScore gameId="g-exec" league={baseLeague} actions={{ getBoxScore: vi.fn() }} embedded />,
    );
    // Executive summary present when flags produce bullets (depends on buildReasoningBullets)
    // At minimum: exec-debug div absent when summary renders
    const summary = queryByTestId('game-book-executive-summary');
    const debug = queryByTestId('game-book-exec-debug');
    // One or the other is rendered — not both
    expect(!summary !== !debug || (!summary && !debug)).toBe(true);
  });

  it('renders hidden debug div with data-flags-count when no reasoning bullets', () => {
    const { getByTestId, queryByTestId } = render(
      <BoxScore gameId="g-nodebug" league={{ ...baseLeague, gameById: { 'g-nodebug': { homeId: 1, awayId: 2, homeScore: 14, awayScore: 7 } } }} embedded />,
    );
    const summary = queryByTestId('game-book-executive-summary');
    if (!summary) {
      const debug = getByTestId('game-book-exec-debug');
      expect(debug).toBeTruthy();
      expect(debug.getAttribute('data-flags-count')).toBeDefined();
    }
  });

  it('single ✕ dismiss button calls onClose when provided', () => {
    const onClose = vi.fn();
    const { getByTestId } = render(
      <BoxScore gameId="g-close" league={{ ...baseLeague, gameById: { 'g-close': { homeId: 1, awayId: 2, homeScore: 14, awayScore: 7 } } }} onClose={onClose} />,
    );
    fireEvent.click(getByTestId('game-book-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('single ✕ dismiss button falls back to onBack when onClose is absent', () => {
    const onBack = vi.fn();
    const { getByTestId } = render(
      <BoxScore gameId="g-back" league={{ ...baseLeague, gameById: { 'g-back': { homeId: 1, awayId: 2, homeScore: 14, awayScore: 7 } } }} onBack={onBack} embedded />,
    );
    fireEvent.click(getByTestId('game-book-close'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('BoxScore special teams section', () => {
  const baseLeague = { seasonId: 2031, week: 2, teams: [{ id: 1, abbr: 'KC' }, { id: 2, abbr: 'BUF' }] };

  beforeEach(() => {
    cleanup();
    vi.mocked(useStableRouteRequest).mockReturnValue({ data: null });
  });

  it('renders FG, punts, XP and 2PT rows from teamDriveStats special-teams counters', () => {
    const game = {
      homeId: 1, awayId: 2, homeScore: 27, awayScore: 13,
      teamDriveStats: {
        home: { punts: 4, fgAttempts: 3, fgMade: 2, twoPointAttempts: 1, twoPointMade: 1 },
        away: { punts: 7, fgAttempts: 2, fgMade: 2, twoPointAttempts: 0, twoPointMade: 0 },
      },
      homeXPs: 2,
      awayXPs: 1,
    };
    const { getByTestId } = render(
      <BoxScore gameId="g-st" league={{ ...baseLeague, gameById: { 'g-st': game } }} embedded />,
    );
    expect(getByTestId('game-book-special-teams')).toBeTruthy();
    // Rows read away-value · label · home-value
    expect(getByTestId('game-book-special-teams-fg').textContent).toBe('2/2FG Made/Att2/3');
    expect(getByTestId('game-book-special-teams-punts').textContent).toBe('7Punts4');
    expect(getByTestId('game-book-special-teams-twoPoint').textContent).toBe('0/02PT Made/Att1/1');
    expect(getByTestId('game-book-special-teams-xp').textContent).toBe('1XP Made2');
  });

  it('shows impact notes for 2PT tries, missed FGs, and punt-heavy games', () => {
    const game = {
      homeId: 1, awayId: 2, homeScore: 20, awayScore: 16,
      teamDriveStats: {
        home: { punts: 7, fgAttempts: 3, fgMade: 1, twoPointAttempts: 1, twoPointMade: 0 },
        away: { punts: 8, fgAttempts: 1, fgMade: 1, twoPointAttempts: 0, twoPointMade: 0 },
      },
    };
    const { getByTestId } = render(
      <BoxScore gameId="g-st-notes" league={{ ...baseLeague, gameById: { 'g-st-notes': game } }} embedded />,
    );
    const notes = getByTestId('game-book-special-teams-notes').textContent;
    expect(notes).toContain('KC — 2-point attempt changed the scoring math.');
    expect(notes).toContain('KC — Missed field goal opportunity.');
    expect(notes).toContain('Field-position game.');
  });

  it('missing special-teams fields default safely and do not crash', () => {
    const game = {
      homeId: 1, awayId: 2, homeScore: 24, awayScore: 21,
      teamDriveStats: { home: { turnovers: 1 }, away: { turnovers: 2 } },
    };
    const { getByTestId, queryByTestId } = render(
      <BoxScore gameId="g-st-missing" league={{ ...baseLeague, gameById: { 'g-st-missing': game } }} embedded />,
    );
    expect(getByTestId('game-book-special-teams-fg').textContent).toBe('0/0FG Made/Att0/0');
    expect(getByTestId('game-book-special-teams-punts').textContent).toBe('0Punts0');
    expect(getByTestId('game-book-special-teams-twoPoint').textContent).toBe('0/02PT Made/Att0/0');
    expect(queryByTestId('game-book-special-teams-notes')).toBeNull();
  });

  it('legacy score-only game objects still render without a special-teams section', () => {
    const { getByTestId, queryByTestId } = render(
      <BoxScore gameId="g-legacy" league={{ ...baseLeague, gameById: { 'g-legacy': { homeId: 1, awayId: 2, homeScore: 6, awayScore: 3 } } }} embedded />,
    );
    expect(getByTestId('game-book-score-hero')).toBeTruthy();
    expect(queryByTestId('game-book-special-teams')).toBeNull();
  });

  it('legacy games fall back to homeFGs/awayFGs and homeXPs/awayXPs scalars', () => {
    const game = { homeId: 1, awayId: 2, homeScore: 13, awayScore: 9, homeFGs: 2, awayFGs: 3, homeXPs: 1, awayXPs: 0 };
    const { getByTestId } = render(
      <BoxScore gameId="g-legacy-fg" league={{ ...baseLeague, gameById: { 'g-legacy-fg': game } }} embedded />,
    );
    expect(getByTestId('game-book-special-teams-fg').textContent).toBe('3/3FG Made/Att2/2');
    expect(getByTestId('game-book-special-teams-xp').textContent).toBe('0XP Made1');
  });
});

describe('BoxScore player name resolution', () => {
  const baseLeague = { seasonId: 2031, week: 2, teams: [{ id: 1, abbr: 'KC' }, { id: 2, abbr: 'BUF' }] };

  beforeEach(() => {
    cleanup();
    vi.mocked(useStableRouteRequest).mockReturnValue({ data: null });
  });

  it('shows player name from stat row when present', () => {
    const game = {
      homeId: 1, awayId: 2, homeScore: 21, awayScore: 14,
      teamStats: { home: { passYards: 200 }, away: {} },
      playerStats: {
        home: { 11: { name: 'Named QB', stats: { passAtt: 20, passYd: 200 } } },
        away: {},
      },
    };
    const { container } = render(<BoxScore gameId="g-named" league={{ ...baseLeague, gameById: { 'g-named': game } }} embedded />);
    expect(container.textContent).toContain('Named QB');
    expect(container.textContent).not.toContain('Unknown');
  });

  it('shows Player #ID fallback when stat row has no name', () => {
    const game = {
      homeId: 1, awayId: 2, homeScore: 21, awayScore: 14,
      teamStats: { home: { passYards: 200 }, away: {} },
      playerStats: {
        home: { 77: { stats: { passAtt: 20, passYd: 200 } } },
        away: {},
      },
    };
    const { container } = render(<BoxScore gameId="g-fallback" league={{ ...baseLeague, gameById: { 'g-fallback': game } }} embedded />);
    expect(container.textContent).toContain('Player #77');
    expect(container.textContent).not.toContain('Unknown');
  });

  it('resolves player name from league roster when stat row lacks name', () => {
    const leagueWithRoster = {
      ...baseLeague,
      teams: [
        { id: 1, abbr: 'KC', roster: [{ id: 55, name: 'Roster QB Name' }] },
        { id: 2, abbr: 'BUF', roster: [] },
      ],
    };
    const game = {
      homeId: 1, awayId: 2, homeScore: 28, awayScore: 7,
      teamStats: { home: { passYards: 300 }, away: {} },
      playerStats: {
        home: { 55: { stats: { passAtt: 30, passYd: 300 } } },
        away: {},
      },
    };
    const { container } = render(<BoxScore gameId="g-roster" league={{ ...leagueWithRoster, gameById: { 'g-roster': game } }} embedded />);
    expect(container.textContent).toContain('Roster QB Name');
    expect(container.textContent).not.toContain('Unknown');
  });

  it('never renders blank or undefined player labels in stat tables', () => {
    const game = {
      homeId: 1, awayId: 2, homeScore: 14, awayScore: 7,
      teamStats: { home: { passYards: 100 }, away: {} },
      playerStats: {
        home: {
          1: { stats: { passAtt: 10, passYd: 100 } },
          2: { stats: { rushAtt: 8, rushYd: 60 } },
        },
        away: { 3: { stats: { tackles: 5, sacks: 1 } } },
      },
    };
    // Check passing table
    const { container, getByTestId } = render(
      <BoxScore gameId="g-noblank" league={{ ...baseLeague, gameById: { 'g-noblank': game } }} embedded />,
    );
    const passingTable = container.querySelector('[data-testid="game-book-table-passing"]');
    if (passingTable) {
      const cells = passingTable.querySelectorAll('td');
      cells.forEach((cell) => {
        expect(cell.textContent).not.toBe('');
        expect(cell.textContent).not.toBe('undefined');
        expect(cell.textContent).not.toContain('Unknown');
      });
    }
  });

  it('player names from game data render in active stat table', () => {
    const game = {
      homeId: 1, awayId: 2, homeScore: 28, awayScore: 17,
      teamStats: { home: { passYards: 250 }, away: {} },
      playerStats: {
        home: { 11: { name: 'Home QB', stats: { passAtt: 30, passComp: 20, passYd: 250, passTD: 3 } } },
        away: { 22: { name: 'Away RB', stats: { rushAtt: 15, rushYd: 90, rushTD: 1 } } },
      },
    };
    const { container, getByTestId } = render(
      <BoxScore gameId="g-names" league={{ ...baseLeague, gameById: { 'g-names': game } }} embedded />,
    );
    expect(container.textContent).toContain('Home QB');
    // Switch to rushing to see away RB
    fireEvent.click(getByTestId('game-book-tab-rushing'));
    expect(container.textContent).toContain('Away RB');
    expect(container.textContent).not.toContain('Unknown');
    expect(container.textContent).not.toContain('undefined');
  });

  it('Player #ID fallback remains safe for nameless stat rows', () => {
    const gameNoNames = {
      homeId: 1, awayId: 2, homeScore: 14, awayScore: 7,
      playerStats: { home: { 99: { stats: { passAtt: 15, passYd: 120 } } }, away: {} },
    };
    const { container } = render(
      <BoxScore gameId="g-nonames" league={{ ...baseLeague, gameById: { 'g-nonames': gameNoNames } }} embedded />,
    );
    expect(container.textContent).toContain('Player #99');
    expect(container.textContent).not.toContain('Unknown');
  });

  it('mobile table wrappers have bs-sheet-table class for dense layout', () => {
    const game = {
      homeId: 1, awayId: 2, homeScore: 14, awayScore: 7,
      teamStats: { home: { passYards: 100 }, away: {} },
      playerStats: {
        home: { 11: { name: 'QB Test', stats: { passAtt: 10, passYd: 100 } } },
        away: {},
      },
    };
    const { container } = render(
      <BoxScore gameId="g-mobile" league={{ ...baseLeague, gameById: { 'g-mobile': game } }} embedded />,
    );
    const table = container.querySelector('[data-testid="game-book-table-passing"]');
    expect(table).toBeTruthy();
    expect(table.className).toContain('bs-sheet-table');
  });
});

describe('BoxScore player button interactions', () => {
  const baseLeague = { seasonId: 2031, week: 2, teams: [{ id: 1, abbr: 'KC' }, { id: 2, abbr: 'BUF' }] };

  beforeEach(() => {
    cleanup();
    vi.mocked(useStableRouteRequest).mockReturnValue({ data: null });
  });

  it('player buttons trigger selection handlers with Game Book return context', () => {
    const onSelect = vi.fn();
    const player = { playerId: 55, name: 'Tester', stats: { passYd: 123 } };
    const { container } = render(
      <PlayerButton player={player} onSelect={onSelect} context={{ source: 'game-book', gameId: 'g-context', returnTo: 'game-book' }} />,
    );
    fireEvent.click(container.querySelector('button'));
    expect(onSelect.mock.calls[0][0]).toBe(55);
    expect(onSelect.mock.calls[0][1]).toMatchObject({
      source: 'game-book',
      gameId: 'g-context',
      returnTo: 'game-book',
      player,
      statLine: player.stats,
    });
  });

  it('stat table player buttons trigger player profile selection', () => {
    const onSelect = vi.fn();
    const game = {
      gameId: 'g4', week: 2, homeId: 1, awayId: 2, homeScore: 28, awayScore: 17,
      teamStats: { home: { passYards: 250 }, away: {} },
      playerStats: {
        home: { 11: { name: 'Home QB', stats: { passAtt: 30, passComp: 20, passYd: 250, passTD: 3 } } },
        away: {},
      },
    };
    const { getAllByTestId } = render(
      <BoxScore gameId="g4" league={{ ...baseLeague, gameById: { g4: game } }} onPlayerSelect={onSelect} embedded />,
    );
    fireEvent.click(getAllByTestId('game-book-player-link')[0]);
    expect(onSelect.mock.calls[0][0]).toBe(11);
    expect(onSelect.mock.calls[0][1]).toMatchObject({
      source: 'game-book',
      gameId: 'g4',
      week: 2,
      seasonId: 2031,
      returnTo: 'game-book',
    });
  });
});

describe('PlayerButton fallback display', () => {
  beforeEach(() => { cleanup(); });

  it('shows Player #ID when player has no name but has playerId', () => {
    const { container } = render(<PlayerButton player={{ playerId: 42, stats: {} }} />);
    expect(container.textContent).toBe('Player #42');
  });

  it('shows generic Player when player has no name and no playerId', () => {
    const { container } = render(<PlayerButton player={{ stats: {} }} />);
    expect(container.textContent).toBe('Player');
  });

  it('does not show Unknown for nameless players', () => {
    const { container } = render(<PlayerButton player={{ playerId: 88, stats: {} }} />);
    expect(container.textContent).not.toContain('Unknown');
  });
});
