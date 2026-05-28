/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { cleanup, fireEvent, render } from '@testing-library/react';
import BoxScore, { PlayerButton } from './BoxScore.jsx';

vi.mock('../hooks/useStableRouteRequest.js', () => ({ default: vi.fn(() => ({ data: null })) }));
import useStableRouteRequest from '../hooks/useStableRouteRequest.js';

describe('BoxScore game book rendering', () => {
  const baseLeague = { seasonId: 2031, week: 2, teams: [{ id: 1, abbr: 'KC' }, { id: 2, abbr: 'BUF' }] };
  beforeEach(() => {
    cleanup();
    vi.mocked(useStableRouteRequest).mockReturnValue({ data: null });
  });

  it('renders from actions.getBoxScore archive payload', () => {
    vi.mocked(useStableRouteRequest).mockReturnValue({ data: { homeId: 1, awayId: 2, homeScore: 14, awayScore: 10, teamStats: { home: { passYards: 100 }, away: { passYards: 80 } } } });
    const html = renderToString(<BoxScore gameId="g1" league={baseLeague} actions={{ getBoxScore: vi.fn() }} embedded />);
    expect(html).toContain('Partial detail');
  });

  it('falls back to league.gameById when no action exists', () => {
    const html = renderToString(<BoxScore gameId="g2" league={{ ...baseLeague, gameById: { g2: { homeId: 1, awayId: 2, homeScore: 14, awayScore: 10 } } }} embedded />);
    expect(html).toContain('Score only');
  });

  it('uses completed schedule fallback when getBoxScore returns a null worker envelope', () => {
    vi.mocked(useStableRouteRequest).mockReturnValue({ data: { type: 'BOX_SCORE', payload: { game: null, error: 'not found' } } });
    const scheduleGame = { gameId: '2031_w4_1_2', home: { id: 1, abbr: 'KC' }, away: { id: 2, abbr: 'BUF' }, homeScore: 13, awayScore: 24, played: true, week: 4 };
    const { getByTestId, container } = render(<BoxScore gameId="2031_w4_1_2" league={baseLeague} actions={{ getBoxScore: vi.fn() }} scheduleGame={scheduleGame} embedded />);
    expect(getByTestId('game-book-final-score').textContent).toBe('BUF 24 - 13 KC');
    expect(container.textContent).not.toContain('Game Book unavailable');
  });

  it('renders expanded stat tables when data exists', () => {
    const game = { homeId: 1, awayId: 2, homeScore: 21, awayScore: 17, quarterScores: { home: [7,7,7,0], away: [3,7,0,7] }, teamStats: { home: { passYards: 201 }, away: { passYards: 230 } }, playerStats: { home: { 11: { name: 'K', stats: { fieldGoalsAttempted: 2, fieldGoalsMade: 2, points: 6, punts: 2, puntYards: 90, kickReturns: 1, kickReturnYards: 20, passBlockAttempts: 10, passBlockWinRate: 0.9 } } }, away: { 22: { name: 'QB Away', stats: { passAtt: 24, passComp: 18, passYd: 200 } } } } };
    const html = renderToString(<BoxScore gameId="g3" league={{ ...baseLeague, gameById: { g3: game } }} embedded />);
    expect(html).toContain('Passing');
    expect(html).toContain('Special Teams');
    expect(html).toContain('Kicking');
    expect(html).toContain('Punting');
    expect(html).toContain('Returns');
    expect(html).toContain('Blocking');
  });

  it('uses placeholders for score-only games and omits stat tables', () => {
    const html = renderToString(<BoxScore gameId="g4" league={{ ...baseLeague, gameById: { g4: { homeId: 1, awayId: 2, homeScore: 6, awayScore: 3 } } }} embedded />);
    expect(html).toContain('Score-only archive: no detailed Game Book sections were recorded.');
    expect(html).toContain('Drive summary was not recorded for this game.');
    expect(html).toContain('Play-by-play was not recorded for this game.');
    expect(html).toContain('Scoring summary was not recorded for this game.');
    expect(html).not.toContain('Special Teams');
  });

  it('player buttons trigger selection handlers with Game Book return context when ids are present', () => {
    const onSelect = vi.fn();
    const player = { playerId: 55, name: 'Tester', stats: { passYd: 123 } };
    const { container } = render(<PlayerButton player={player} onSelect={onSelect} context={{ source: 'game-book', gameId: 'g-context', returnTo: 'game-book' }} />);
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

  it('top performers trigger player profile selection when ids are present', () => {
    const onSelect = vi.fn();
    const game = { gameId: 'g4', week: 2, homeId: 1, awayId: 2, homeScore: 28, awayScore: 17, quarterScores: { home: [7,7,7,7], away: [0,7,3,7] }, teamStats: { home: { passYards: 250 }, away: {} }, playerStats: { home: { 11: { name: 'Home QB', stats: { passAtt: 30, passComp: 20, passYd: 250, passTD: 3 } } }, away: {} } };
    const { getAllByTestId } = render(<BoxScore gameId="g4" league={{ ...baseLeague, gameById: { g4: game } }} onPlayerSelect={onSelect} embedded />);
    fireEvent.click(getAllByTestId('game-book-top-performer-link')[0]);
    expect(onSelect.mock.calls[0][0]).toBe(11);
    expect(onSelect.mock.calls[0][1]).toMatchObject({
      source: 'game-book',
      gameId: 'g4',
      week: 2,
      seasonId: 2031,
      role: 'Top offensive player',
      returnTo: 'game-book',
    });
  });

  it('renders Defense and scoring summary rows when detailed stats exist', () => {
    const game = {
      homeId: 1,
      awayId: 2,
      homeScore: 21,
      awayScore: 17,
      quarterScores: { home: [7, 7, 7, 0], away: [3, 7, 0, 7] },
      teamStats: { home: { passYards: 201, sacks: 3 }, away: { passYards: 230 } },
      scoringSummary: [
        { quarter: 1, time: '8:12', teamAbbr: 'BUF', type: 'TD', description: '1-yard run', scoreAfter: { home: 0, away: 7 } },
      ],
      playerStats: {
        home: { 99: { name: 'DE Star', stats: { tackles: 6, sacks: 2, tfl: 1, interceptions: 0, passesDefended: 2 } } },
        away: { 12: { name: 'Away QB', stats: { passAtt: 22, passComp: 14, passYd: 180, passTD: 1, interceptions: 2, sacked: 3, passerRating: 72.5 } } },
      },
    };
    const { container, getByTestId } = render(<BoxScore gameId="g-def" league={{ ...baseLeague, teams: [{ id: 1, abbr: 'KC' }, { id: 2, abbr: 'BUF' }], gameById: { 'g-def': game } }} embedded />);
    expect(getByTestId('game-book-table-defense')).toBeTruthy();
    const scoringBlock = container.querySelector('[data-testid="game-book-scoring-summary"]');
    expect(scoringBlock?.textContent).toContain('8:12');
    expect(scoringBlock?.textContent).toContain('7-0');
  });

  it('renders Drive Summary rows when archived drives exist', () => {
    const game = {
      homeId: 1,
      awayId: 2,
      homeScore: 28,
      awayScore: 17,
      driveSummary: [
        { id: 'd1', teamId: 1, quarter: 2, startClock: '12:00', endClock: '7:42', result: 'TD', plays: 9, yards: 80, points: 7 },
      ],
    };
    const { getByTestId, getAllByTestId } = render(<BoxScore gameId="g-drive" league={{ ...baseLeague, gameById: { 'g-drive': game } }} embedded />);
    expect(getByTestId('game-book-drive-summary').textContent).toContain('Drive Summary');
    expect(getAllByTestId('game-book-drive-row')).toHaveLength(1);
    expect(getByTestId('game-book-drive-summary').textContent).toContain('TD');
    expect(getByTestId('game-book-drive-summary').textContent).toContain('80');
  });

  it('renders Key Plays from playLog and defaults to a curated list', () => {
    const game = {
      homeId: 1,
      awayId: 2,
      homeScore: 35,
      awayScore: 14,
      playLog: [
        { id: 'p1', quarter: 1, clock: '14:30', teamId: 1, text: 'Ordinary run for 3 yards', yards: 3 },
        { id: 'p2', quarter: 1, clock: '12:11', teamId: 1, text: 'Touchdown pass to the corner', isTouchdown: true, yards: 14 },
        { id: 'p3', quarter: 2, clock: '11:00', teamId: 2, text: 'Ordinary pass for 5 yards', yards: 5 },
        { id: 'p4', quarter: 2, clock: '8:33', teamId: 1, text: 'Run up the middle for 4 yards', yards: 4 },
        { id: 'p5', quarter: 3, clock: '13:02', teamId: 2, text: 'Quarterback sack for a loss', yards: -7 },
        { id: 'p6', quarter: 3, clock: '6:22', teamId: 1, text: 'Screen pass for 6 yards', yards: 6 },
        { id: 'p7', quarter: 4, clock: '9:41', teamId: 2, text: 'Draw play for 2 yards', yards: 2 },
        { id: 'p8', quarter: 4, clock: '2:05', teamId: 1, text: 'Kneel down', yards: -1 },
      ],
    };
    const { getAllByTestId, getByTestId, queryByText } = render(<BoxScore gameId="g-plays" league={{ ...baseLeague, gameById: { 'g-plays': game } }} embedded />);
    expect(getByTestId('game-book-play-by-play').textContent).toContain('Key Plays / Play-by-Play');
    expect(getAllByTestId('game-book-play-row')).toHaveLength(2);
    expect(getByTestId('game-book-play-by-play').textContent).toContain('Touchdown pass');
    expect(getByTestId('game-book-play-by-play').textContent).toContain('Quarterback sack');
    expect(queryByText('Ordinary run for 3 yards')).toBeNull();
  });

  it('toggles from key plays to the full play log', () => {
    const game = {
      homeId: 1,
      awayId: 2,
      homeScore: 35,
      awayScore: 14,
      playLog: [
        { id: 'p1', quarter: 1, clock: '14:30', teamId: 1, text: 'Ordinary run for 3 yards', yards: 3 },
        { id: 'p2', quarter: 1, clock: '12:11', teamId: 1, text: 'Touchdown pass to the corner', isTouchdown: true, yards: 14 },
        { id: 'p3', quarter: 2, clock: '11:00', teamId: 2, text: 'Ordinary pass for 5 yards', yards: 5 },
        { id: 'p4', quarter: 2, clock: '8:33', teamId: 1, text: 'Run up the middle for 4 yards', yards: 4 },
        { id: 'p5', quarter: 3, clock: '13:02', teamId: 2, text: 'Quarterback sack for a loss', yards: -7 },
      ],
    };
    const { getAllByTestId, getByTestId, getByText } = render(<BoxScore gameId="g-toggle" league={{ ...baseLeague, gameById: { 'g-toggle': game } }} embedded />);
    expect(getAllByTestId('game-book-play-row')).toHaveLength(2);
    fireEvent.click(getByTestId('game-book-play-toggle'));
    expect(getAllByTestId('game-book-play-row')).toHaveLength(5);
    expect(getByText('Ordinary run for 3 yards')).toBeTruthy();
    expect(getByTestId('game-book-play-toggle').textContent).toBe('Show key plays');
  });

  it('renders final score density, data availability chips, sorted player rows, and embedded back action', () => {
    const onBack = vi.fn();
    const game = {
      homeId: 1,
      awayId: 2,
      homeScore: 30,
      awayScore: 27,
      teamStats: { home: { totalYards: 410, turnovers: 1 }, away: { totalYards: 350, turnovers: 2 } },
      playerStats: {
        home: {
          11: { name: 'Second QB', stats: { passAtt: 15, passYd: 120 } },
          12: { name: 'First QB', stats: { passAtt: 30, passYd: 280 } },
        },
        away: {},
      },
    };
    const { container, getByTestId, getByText, getAllByText } = render(<BoxScore gameId="g-density" league={{ ...baseLeague, gameById: { 'g-density': game } }} onBack={onBack} embedded />);
    expect(getByText('KC defeated BUF by 3')).toBeTruthy();
    expect(getAllByText('Team stats').length).toBeGreaterThan(0);
    expect(getByText('Showing 2 passers')).toBeTruthy();
    const passingText = container.querySelector('[data-testid="game-book-table-passing"]').textContent;
    expect(passingText.indexOf('First QB')).toBeLessThan(passingText.indexOf('Second QB'));
    fireEvent.click(getByTestId('game-book-back-action'));
    expect(onBack).toHaveBeenCalledTimes(1);
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
    const { container } = render(<BoxScore gameId="g-noblank" league={{ ...baseLeague, gameById: { 'g-noblank': game } }} embedded />);
    const passingTable = container.querySelector('[data-testid="game-book-table-passing"]');
    const rushingTable = container.querySelector('[data-testid="game-book-table-rushing"]');
    const defenseTable = container.querySelector('[data-testid="game-book-table-defense"]');
    [passingTable, rushingTable, defenseTable].filter(Boolean).forEach((table) => {
      const cells = table.querySelectorAll('td');
      cells.forEach((cell) => {
        expect(cell.textContent).not.toBe('');
        expect(cell.textContent).not.toBe('undefined');
        expect(cell.textContent).not.toContain('Unknown');
      });
    });
  });

  it('mobile table wrappers have bs-table-wrap class for horizontal scroll', () => {
    const game = {
      homeId: 1, awayId: 2, homeScore: 14, awayScore: 7,
      teamStats: { home: { passYards: 100 }, away: {} },
      playerStats: {
        home: { 11: { name: 'QB Test', stats: { passAtt: 10, passYd: 100 } } },
        away: {},
      },
    };
    const { container } = render(<BoxScore gameId="g-mobile" league={{ ...baseLeague, gameById: { 'g-mobile': game } }} embedded />);
    const tableWrap = container.querySelector('[data-testid="game-book-table-passing"] .bs-table-wrap');
    expect(tableWrap).toBeTruthy();
    expect(tableWrap.className).toContain('bs-table-wrap');
  });
});

describe('BoxScore mobile condensed hierarchy', () => {
  const baseLeague = { seasonId: 2031, week: 2, teams: [{ id: 1, abbr: 'KC' }, { id: 2, abbr: 'BUF' }] };
  const gameWithStats = {
    homeId: 1, awayId: 2, homeScore: 28, awayScore: 17,
    quarterScores: { home: [7, 7, 7, 7], away: [0, 7, 3, 7] },
    teamStats: { home: { passYards: 250, totalYards: 380 }, away: { passYards: 180 } },
    playerStats: {
      home: { 11: { name: 'Home QB', stats: { passAtt: 30, passComp: 20, passYd: 250, passTD: 3 } } },
      away: { 22: { name: 'Away RB', stats: { rushAtt: 15, rushYd: 90, rushTD: 1 } } },
    },
  };
  beforeEach(() => { cleanup(); vi.mocked(useStableRouteRequest).mockReturnValue({ data: null }); });

  it('Key Performers card renders when playerStats exists', () => {
    const { getByTestId } = render(
      <BoxScore gameId="g-kp" league={{ ...baseLeague, gameById: { 'g-kp': gameWithStats } }} embedded />,
    );
    expect(getByTestId('game-book-top-performers')).toBeTruthy();
    expect(getByTestId('game-book-leader-passing')).toBeTruthy();
    expect(getByTestId('game-book-leader-rushing')).toBeTruthy();
  });

  it('Key Performers card appears before Drive Summary in DOM order', () => {
    const { container } = render(
      <BoxScore gameId="g-order" league={{ ...baseLeague, gameById: { 'g-order': gameWithStats } }} embedded />,
    );
    const allSections = Array.from(container.querySelectorAll('[data-testid]'));
    const performersIdx = allSections.findIndex((el) => el.dataset.testid === 'game-book-top-performers');
    const driveIdx = allSections.findIndex((el) => el.dataset.testid === 'game-book-drive-summary');
    expect(performersIdx).toBeGreaterThanOrEqual(0);
    expect(driveIdx).toBeGreaterThanOrEqual(0);
    expect(performersIdx).toBeLessThan(driveIdx);
  });

  it('Key Performers card appears before player stat tables in DOM order', () => {
    const { container } = render(
      <BoxScore gameId="g-order2" league={{ ...baseLeague, gameById: { 'g-order2': gameWithStats } }} embedded />,
    );
    const allSections = Array.from(container.querySelectorAll('[data-testid]'));
    const performersIdx = allSections.findIndex((el) => el.dataset.testid === 'game-book-top-performers');
    const passingTableIdx = allSections.findIndex((el) => el.dataset.testid === 'game-book-table-passing');
    expect(performersIdx).toBeGreaterThanOrEqual(0);
    expect(passingTableIdx).toBeGreaterThanOrEqual(0);
    expect(performersIdx).toBeLessThan(passingTableIdx);
  });

  it('player stat table sections start with aria-expanded="false" (collapsed by default)', () => {
    const { getByTestId } = render(
      <BoxScore gameId="g-collapsed" league={{ ...baseLeague, gameById: { 'g-collapsed': gameWithStats } }} embedded />,
    );
    const passingToggle = getByTestId('game-book-table-toggle-passing');
    expect(passingToggle.getAttribute('aria-expanded')).toBe('false');
    const rushingToggle = getByTestId('game-book-table-toggle-rushing');
    expect(rushingToggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking a stat table toggle expands the section (aria-expanded becomes true)', () => {
    const { getByTestId } = render(
      <BoxScore gameId="g-expand" league={{ ...baseLeague, gameById: { 'g-expand': gameWithStats } }} embedded />,
    );
    const toggle = getByTestId('game-book-table-toggle-passing');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('clicking a stat table toggle twice collapses it back', () => {
    const { getByTestId } = render(
      <BoxScore gameId="g-collapse2" league={{ ...baseLeague, gameById: { 'g-collapse2': gameWithStats } }} embedded />,
    );
    const toggle = getByTestId('game-book-table-toggle-passing');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('stat table content remains in DOM when collapsed (accessible but CSS-hidden on mobile)', () => {
    const { container, getByTestId } = render(
      <BoxScore gameId="g-dom" league={{ ...baseLeague, gameById: { 'g-dom': gameWithStats } }} embedded />,
    );
    // Toggle is collapsed (aria-expanded=false) but content is still in the DOM
    const toggle = getByTestId('game-book-table-toggle-passing');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    // Player name is still in the DOM for accessibility / SSR
    const section = getByTestId('game-book-table-passing');
    expect(section.textContent).toContain('Home QB');
  });

  it('other collapsible sections (drive-summary, play-by-play) start collapsed', () => {
    const gameWithDrives = {
      ...gameWithStats,
      driveSummary: [{ id: 'd1', teamId: 1, quarter: 2, result: 'TD', plays: 9, yards: 80, points: 7 }],
    };
    const { getByTestId } = render(
      <BoxScore gameId="g-coll-sections" league={{ ...baseLeague, gameById: { 'g-coll-sections': gameWithDrives } }} embedded />,
    );
    expect(getByTestId('game-book-section-toggle-drive-summary').getAttribute('aria-expanded')).toBe('false');
    expect(getByTestId('game-book-section-toggle-play-by-play').getAttribute('aria-expanded')).toBe('false');
    expect(getByTestId('game-book-section-toggle-team-comparison').getAttribute('aria-expanded')).toBe('false');
  });

  it('Drive Summary content is still in DOM when collapsed', () => {
    const gameWithDrives = {
      ...gameWithStats,
      driveSummary: [{ id: 'd1', teamId: 1, quarter: 2, result: 'TD', plays: 9, yards: 80, points: 7 }],
    };
    const { getByTestId } = render(
      <BoxScore gameId="g-drive-dom" league={{ ...baseLeague, gameById: { 'g-drive-dom': gameWithDrives } }} embedded />,
    );
    const driveSection = getByTestId('game-book-drive-summary');
    expect(driveSection.textContent).toContain('Drive Summary');
    // Content is in DOM even when collapsed
    expect(driveSection.textContent).toContain('TD');
  });

  it('back label prop controls button text', () => {
    const onBack = vi.fn();
    const { getByTestId, getAllByText } = render(
      <BoxScore gameId="g-label" league={{ ...baseLeague, gameById: { 'g-label': gameWithStats } }} embedded onBack={onBack} backLabel="Back to Result" />,
    );
    const backBtn = getByTestId('game-book-back-action');
    expect(backBtn.textContent).toBe('Back to Result');
  });

  it('back label shows "Back to Weekly Results" when passed', () => {
    const onBack = vi.fn();
    const { getByTestId } = render(
      <BoxScore gameId="g-wrlabel" league={{ ...baseLeague, gameById: { 'g-wrlabel': gameWithStats } }} embedded onBack={onBack} backLabel="Back to Weekly Results" />,
    );
    expect(getByTestId('game-book-back-action').textContent).toBe('Back to Weekly Results');
  });

  it('default back label is "Back to flow" when no backLabel prop given', () => {
    const onBack = vi.fn();
    const { getByTestId } = render(
      <BoxScore gameId="g-defaultlabel" league={{ ...baseLeague, gameById: { 'g-defaultlabel': gameWithStats } }} embedded onBack={onBack} />,
    );
    expect(getByTestId('game-book-back-action').textContent).toBe('Back to flow');
  });

  it('a bottom back button also appears when embedded with onBack', () => {
    const onBack = vi.fn();
    const { getByTestId } = render(
      <BoxScore gameId="g-bottomback" league={{ ...baseLeague, gameById: { 'g-bottomback': gameWithStats } }} embedded onBack={onBack} backLabel="Back to Result" />,
    );
    expect(getByTestId('game-book-bottom-back')).toBeTruthy();
    fireEvent.click(getByTestId('game-book-bottom-back').querySelector('button'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('player names from #1548 still resolve in stat tables', () => {
    const { container } = render(
      <BoxScore gameId="g-names" league={{ ...baseLeague, gameById: { 'g-names': gameWithStats } }} embedded />,
    );
    expect(container.textContent).toContain('Home QB');
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
