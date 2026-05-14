/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import FranchiseHQ from '../FranchiseHQ.jsx';
import LeagueDashboard from '../LeagueDashboard.jsx';
import { normalizeManagementDestination, parseGameBookDestination } from '../../utils/managementScreenRouting.js';

const baseLeague = {
  year: 2026,
  week: 10,
  seasonId: 's10',
  phase: 'regular',
  userTeamId: 10,
  ownerApproval: 58,
  teams: [
    {
      id: 10,
      city: 'Chicago',
      name: 'Bears',
      abbr: 'CHI',
      conf: 1,
      div: 0,
      wins: 6,
      losses: 3,
      ties: 0,
      ovr: 84,
      offenseRating: 82,
      defenseRating: 83,
      capRoom: 7,
      roster: [{ id: 1 }, { id: 2 }],
      recentResults: ['W', 'W', 'L', 'W'],
    },
    { id: 11, city: 'Detroit', name: 'Lions', abbr: 'DET', conf: 1, div: 0, wins: 5, losses: 4, ties: 0, ovr: 83, offenseRating: 86, defenseRating: 80, capRoom: 11, roster: [] },
  ],
  schedule: {
    weeks: [
      { week: 9, games: [{ id: 'g-9', home: { id: 11, abbr: 'DET' }, away: { id: 10, abbr: 'CHI' }, homeId: 11, awayId: 10, homeAbbr: 'DET', awayAbbr: 'CHI', homeScore: 20, awayScore: 23, played: true }] },
      { week: 10, games: [{ id: 'g-10', home: { id: 10, abbr: 'CHI' }, away: { id: 11, abbr: 'DET' }, played: false }] },
    ],
  },
  gameById: {
    'g-9': { id: 'g-9', home: 11, away: 10, homeId: 11, awayId: 10, week: 9, played: true, homeScore: 20, awayScore: 23 },
  },
  incomingTradeOffers: [],
  newsItems: [{ id: 'n1', teamId: 10, headline: 'Starter upgraded to probable status.' }],
};

describe('FranchiseHQ', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders visible weekly command center essentials and one primary advance CTA', () => {
    render(<FranchiseHQ league={baseLeague} onNavigate={() => {}} onAdvanceWeek={() => {}} busy={false} simulating={false} />);

    expect(screen.getByRole('heading', { name: /week 10/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /advance week/i })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /advance week/i })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: /weekly command hub/i })).toBeTruthy();
    expect(screen.getByText(/must handle/i)).toBeTruthy();
    expect(screen.getByText(/tactical edge/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /coordinator brief/i })).toBeTruthy();
    const seasonPulse = within(screen.getByTestId('season-pulse'));
    expect(seasonPulse.getByText(/owner mandate/i)).toBeTruthy();
    expect(seasonPulse.getByText(/momentum/i)).toBeTruthy();
    expect(seasonPulse.getByText(/roster lever/i)).toBeTruthy();
    expect(seasonPulse.getByText(/film room/i)).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: /game plan impact/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/home matchup vs det/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/ratings are tightly clustered/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /tactical edge: review game plan/i })).toBeTruthy();
  });

  it('routes weekly command hub action through onNavigate', () => {
    const onNavigate = vi.fn();
    const view = render(<FranchiseHQ league={baseLeague} onNavigate={onNavigate} onAdvanceWeek={() => {}} busy={false} simulating={false} />);

    fireEvent.click(within(view.container).getAllByRole('button', { name: /tactical edge: review game plan/i })[0]);
    expect(onNavigate).toHaveBeenCalledWith('Game Plan');
  });

  it('routes season pulse roster action through onNavigate', () => {
    const onNavigate = vi.fn();
    render(<FranchiseHQ league={baseLeague} onNavigate={onNavigate} onAdvanceWeek={() => {}} busy={false} simulating={false} />);

    fireEvent.click(screen.getByRole('button', { name: /open team builder/i }));
    expect(onNavigate).toHaveBeenCalledWith('Team:Roster / Team Builder');
  });


  it('renders weekly decision review and routes the recommended action', () => {
    const onNavigate = vi.fn();
    render(<FranchiseHQ league={baseLeague} onNavigate={onNavigate} onAdvanceWeek={() => {}} busy={false} simulating={false} />);

    expect(screen.getAllByRole('heading', { name: /what mattered last week|decision review/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: /roster needs/i })).toBeNull();
    const button = screen.getByRole('button', { name: /decision review:/i });
    fireEvent.click(button);
    expect(onNavigate).toHaveBeenCalled();
  });

  it('renders League Pulse preview and opens the full News timeline', () => {
    const onNavigate = vi.fn();
    render(
      <FranchiseHQ
        league={{
          ...baseLeague,
          newsItems: [
            { id: 'pulse-1', source: 'league_pulse_v1', category: 'league_pulse', headline: 'Rookie hype is building', body: 'A young runner just forced more weekly attention.', priority: 'medium', importance: 75, week: 9, relatedTeamId: 10, teamId: 10 },
          ],
        }}
        onNavigate={onNavigate}
        onAdvanceWeek={() => {}}
        busy={false}
        simulating={false}
      />,
    );

    const pulseSection = screen.getByRole('heading', { name: /league pulse/i }).closest('section');
    expect(pulseSection).toBeTruthy();
    expect(within(pulseSection).getByText(/rookie hype is building/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /open full pulse/i }));
    expect(onNavigate).toHaveBeenCalledWith('News');
  });

  it('renders Review Game Book as the postgame next action and emits a Game Book route', () => {
    const onNavigate = vi.fn();
    render(<FranchiseHQ league={baseLeague} onNavigate={onNavigate} onAdvanceWeek={() => {}} busy={false} simulating={false} />);

    const nextAction = within(screen.getByTestId('hq-next-action'));
    expect(nextAction.getAllByText('Review Game Book').length).toBeGreaterThan(0);
    fireEvent.click(nextAction.getByRole('button', { name: /review game book/i }));

    expect(onNavigate).toHaveBeenCalledWith('Game Book:g-9');
  });

  it('parses Game Book route intents before tab normalization can reject them', () => {
    expect(parseGameBookDestination('Game Book:g-9')).toEqual({ type: 'gameBook', gameId: 'g-9' });
    expect(parseGameBookDestination({ type: 'gameBook', gameId: 'g-9' })).toEqual({ type: 'gameBook', gameId: 'g-9' });
    expect(normalizeManagementDestination('Game Book:g-9').tab).toBe('Game Book');
  });

  it('opens Game Detail from the HQ Review Game Book next action and returns to Franchise HQ', async () => {
    window.matchMedia = window.matchMedia ?? (() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<LeagueDashboard league={baseLeague} actions={{ getDashboardLeaders: vi.fn(() => Promise.resolve({ league: {}, team: {} })) }} busy={false} simulating={false} onAdvanceWeek={() => {}} />);

    const nextAction = within(screen.getByTestId('hq-next-action'));
    fireEvent.click(nextAction.getByRole('button', { name: /review game book/i }));

    expect(await screen.findByTestId('game-book')).toBeTruthy();
    expect(screen.getByTestId('game-book-final-score').textContent).toContain('CHI 23 - 20 DET');

    fireEvent.click(screen.getByTestId('return-to-hq'));
    expect(await screen.findByTestId('franchise-hq')).toBeTruthy();
  });

  it('renders record, standing, and fallback copy when schedule is missing', () => {
    render(
      <FranchiseHQ
        league={{ year: 2026, week: 2, phase: 'regular', userTeamId: 1, teams: [{ id: 1, name: 'Legacy Team', city: 'Legacy', conf: 0, div: 0, wins: 0, losses: 0, ties: 0 }], schedule: { weeks: [] } }}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    );

    expect(screen.getByText(/no completed game yet/i)).toBeTruthy();
    expect(screen.getByText(/no opponent is locked yet/i)).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: /game plan impact/i }).length).toBeGreaterThan(0);
    expect(screen.getByText(/no future games on file/i)).toBeTruthy();
    expect(screen.getAllByText(/0-0 · 0 0/i).length).toBeGreaterThan(0);
  });
});
