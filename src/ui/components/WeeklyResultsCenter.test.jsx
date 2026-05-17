/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import WeeklyResultsCenter from './WeeklyResultsCenter.jsx';
import { buildWeeklyLeagueRecap } from '../utils/weeklyLeagueRecap.js';
import { openResolvedBoxScore } from '../utils/boxScoreAccess.js';

const league = {
  seasonId: '2026',
  week: 3,
  userTeamId: 1,
  teams: [
    { id: 1, abbr: 'DAL', name: 'Dallas', conf: 1, div: 0 },
    { id: 2, abbr: 'PHI', name: 'Philadelphia', conf: 1, div: 0 },
    { id: 3, abbr: 'NYG', name: 'New York', conf: 1, div: 0 },
    { id: 4, abbr: 'WSH', name: 'Washington', conf: 1, div: 0 },
    { id: 5, abbr: 'BUF', name: 'Buffalo', conf: 0, div: 0 },
    { id: 6, abbr: 'KC', name: 'Kansas City', conf: 0, div: 1 },
    { id: 7, abbr: 'MIA', name: 'Miami', conf: 0, div: 0 },
    { id: 8, abbr: 'NE', name: 'New England', conf: 0, div: 0 },
  ],
  schedule: {
    weeks: [
      { week: 1, games: [
        { gameId: '2026_w1_1_2', home: 1, away: 2, played: true, homeScore: 21, awayScore: 17, summary: { storyline: 'Turnovers decided it.' } },
      ] },
      { week: 2, games: [
        { gameId: '2026_w2_2_3', home: 2, away: 3, played: true, homeScore: 14, awayScore: 10, summary: { headline: 'Red zone defense sealed it.' } },
        { gameId: '2026_w2_1_4', home: 1, away: 4, played: true, homeScore: 20, awayScore: 21, summary: { storyline: 'Game-winning drive in final minute.' }, quarterScores: { home: [7, 3, 7, 3], away: [7, 7, 0, 7] } },
      ] },
      { week: 3, games: [
        { gameId: '2026_w3_6_8', home: 6, away: 8, played: false },
      ] },
    ],
  },
};

describe('WeeklyResultsCenter', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders weekly recap, spotlight, and the user-team game card', () => {
    render(<WeeklyResultsCenter league={league} onGameSelect={() => {}} onNavigate={() => {}} />);

    expect(screen.getByText('Your Game Result')).toBeTruthy();
    expect(screen.getByText(/loss.*vs wsh/i)).toBeTruthy();
    expect(screen.getByText('Weekly League Recap')).toBeTruthy();
    expect(screen.getByText('Weekly Spotlight')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /open game book/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/close game|point margin|blowout/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/partial detail/i).length).toBeGreaterThan(0);
  });

  it('shows game-plan recap and reasons when prep impact exists', () => {
    const leagueWithPrep = {
      ...league,
      schedule: {
        weeks: [
          ...league.schedule.weeks.slice(0, 1),
          {
            week: 2,
            games: [
              {
                gameId: '2026_w2_1_4', home: 1, away: 4, played: true, homeScore: 20, awayScore: 21,
                summary: { storyline: 'Game-winning drive in final minute.' },
                prepImpact: { home: { narrative: 'Our run-heavy plan attacked a weak run defense.', activeReasons: ['Run Matchup Advantage: run-heavy script targets a soft front.'] } },
              },
            ],
          },
        ],
      },
    };
    render(<WeeklyResultsCenter league={leagueWithPrep} initialWeek={2} onGameSelect={() => {}} onNavigate={() => {}} />);
    expect(screen.getByText(/game-plan impact recap/i)).toBeTruthy();
    expect(screen.getByRole('list', { name: /game plan reasons/i })).toBeTruthy();
  });

  it('opens Game Book from the user-team spotlight card', () => {
    const onGameSelect = vi.fn();
    render(<WeeklyResultsCenter league={league} initialWeek={2} onGameSelect={onGameSelect} onNavigate={() => {}} />);

    const userGameSection = screen.getByText('Your Game Result').closest('section');
    fireEvent.click(within(userGameSection).getByRole('button', { name: /^open game book$/i }));

    expect(onGameSelect).toHaveBeenCalledTimes(1);
    expect(onGameSelect.mock.calls[0][0]).toMatch(/2026_w2_/);
  });


  it('renders decision review in Your Game and routes recommended action', () => {
    const onNavigate = vi.fn();
    const leagueWithInjuryContext = {
      ...league,
      teams: league.teams.map((team) => (team.id === 1
        ? { ...team, roster: [{ id: 88, injuryWeeksRemaining: 2 }], strategies: { gamePlan: { runPassBalance: 60 } } }
        : team)),
    };
    render(<WeeklyResultsCenter league={leagueWithInjuryContext} initialWeek={2} onGameSelect={() => {}} onNavigate={onNavigate} />);

    expect(screen.getByRole('list', { name: /decision review/i })).toBeTruthy();
    const cta = screen.getByRole('button', { name: /review availability/i });
    fireEvent.click(cta);
    expect(onNavigate).toHaveBeenCalledWith('Team:Injuries');
  });
  it('is safe for older partial payloads with score-only games', () => {
    const legacyLeague = {
      ...league,
      schedule: { weeks: [{ week: 3, games: [{ gameId: '2026_w3_1_2', home: 1, away: 2, played: true, homeScore: 7, awayScore: 3 }] }] },
    };
    const html = renderToString(<WeeklyResultsCenter league={legacyLeague} initialWeek={3} onGameSelect={() => {}} onNavigate={() => {}} />);
    expect(html).toContain('DAL won by 4 (3-7).');
    expect(html).toContain('Open Game Book');
    expect(html).toContain('Score only');
    expect(html).not.toContain('Game-plan impact recap');
  });

  it('routes spotlight game records through current game book open helper', () => {
    const recap = buildWeeklyLeagueRecap(league, { week: 2 });
    const onGameSelect = vi.fn();
    const opened = openResolvedBoxScore(recap.spotlights[0].game, { seasonId: league.seasonId, week: 2, source: 'test_spotlight' }, onGameSelect);

    expect(opened).toBe(true);
    expect(onGameSelect).toHaveBeenCalledTimes(1);
    expect(onGameSelect.mock.calls[0][0]).toMatch(/2026_w2_/);
  });
  it('opens player profile from weekly top performer when player stats have ids', () => {
    const onPlayerSelect = vi.fn();
    const leagueWithStats = {
      ...league,
      teams: league.teams.map((team) => team.id === 1 ? { ...team, roster: [{ id: 101, name: 'Dak Test', pos: 'QB', teamId: 1, ovr: 80, potential: 85, contract: { years: 2 } }] } : team),
      schedule: {
        weeks: [
          { week: 2, games: [{
            gameId: '2026_w2_1_4', home: 1, away: 4, played: true, homeScore: 28, awayScore: 21,
            quarterScores: { home: [7, 7, 7, 7], away: [7, 7, 0, 7] },
            teamStats: { home: { passYards: 260 }, away: {} },
            playerStats: { home: { 101: { name: 'Dak Test', stats: { passAtt: 31, passComp: 21, passYd: 260, passTD: 3 } } }, away: {} },
          }] },
        ],
      },
    };
    render(<WeeklyResultsCenter league={leagueWithStats} initialWeek={2} onGameSelect={() => {}} onNavigate={() => {}} onPlayerSelect={onPlayerSelect} />);

    fireEvent.click(screen.getByTestId('weekly-results-top-performer-link'));
    expect(onPlayerSelect.mock.calls[0][0]).toBe(101);
    expect(onPlayerSelect.mock.calls[0][1]).toMatchObject({ source: 'weekly-results', gameId: '2026_w2_1_4', week: 2 });
  });

});
