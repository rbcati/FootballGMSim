/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import FranchiseHQ from '../FranchiseHQ.jsx';
import { buildHqDivisionSnapshot, buildHqNextAction, buildHqStrengthSnapshot, deriveSpecialTeamsPresentationRating } from '../../utils/hqCommandCenterV2.js';
import { prepareStandingsView } from '../../../views/standingsView.js';
import { buildPowerRankings } from '../../utils/franchiseCommandCenter.js';

const player = (id, name, pos, ovr, rowKey, order = 1) => ({ id, name, pos, ovr, depthChart: { rowKey, order } });
const roster = [
  player(1, 'Justin Fields', 'QB', 78, 'QB'), player(2, 'Runner One', 'RB', 76, 'RB'),
  player(3, 'Wide One', 'WR', 80, 'WR'), player(4, 'Tight One', 'TE', 77, 'TE'),
  ...Array.from({ length: 5 }, (_, i) => player(10 + i, `Line ${i}`, 'OL', 74 + i, 'OL', i + 1)),
  player(20, 'Edge One', 'EDGE', 82, 'EDGE'), player(21, 'Tackle One', 'DT', 79, 'IDL'),
  player(22, 'Backer One', 'LB', 78, 'LB'), player(23, 'Corner One', 'CB', 83, 'CB'), player(24, 'Safety One', 'S', 80, 'S'),
];
const specialists = [player(31, 'Kicker', 'K', 75, 'K'), player(32, 'Punter', 'P', 72, 'P'), player(33, 'Returner', 'WR', 81, 'RS')];

function league(overrides = {}) {
  const teams = [
    { id: 7, city: 'Pittsburgh', name: 'Steelers', abbr: 'PIT', conf: 0, div: 1, wins: 2, losses: 1, ovr: 78, roster: [...roster, ...specialists] },
    { id: 4, abbr: 'BAL', conf: 0, div: 1, wins: 2, losses: 1, ovr: 77, offenseRating: 77, defenseRating: 78, roster: [] },
    { id: 5, abbr: 'CIN', conf: 0, div: 1, wins: 1, losses: 2, ovr: 74, offenseRating: 73, defenseRating: 75, roster: [] },
    { id: 6, abbr: 'CLE', conf: 0, div: 1, wins: 3, losses: 0, ovr: 82, offenseRating: 81, defenseRating: 83, roster: [] },
    { id: 16, abbr: 'DAL', conf: 1, div: 0, wins: 3, losses: 0, ovr: 83, offenseRating: 84, defenseRating: 80, roster: [] },
  ];
  return { id: 'save-a', franchiseGenerationId: 'a', year: 2026, seasonId: 's1', week: 4, phase: 'regular', userTeamId: 7, teams, weeklyPrep: { lineupChecked: true, planReviewed: true, opponentScouted: true }, schedule: { weeks: [{ week: 1, games: [{ home: 7, away: 4, homeScore: 24, awayScore: 17, played: true }] }, { week: 2, games: [{ home: 5, away: 7, homeScore: 21, awayScore: 17, played: true }] }, { week: 3, games: [{ home: 7, away: 16, homeScore: 28, awayScore: 14, played: true }] }, { week: 4, games: [{ home: 7, away: 6, played: false }] }] }, ...overrides };
}

describe('HQ Command Center V2', () => {
  afterEach(cleanup);

  it('puts the authoritative lineup blocker first and routes to Team:Lineup', () => {
    const onNavigate = vi.fn();
    const blocked = league({ teams: league().teams.map((team) => team.id === 7 ? { ...team, roster: team.roster.map((member) => member.id === 1 ? { ...member, injuryWeeksRemaining: 2 } : member) } : team) });
    render(<FranchiseHQ league={blocked} onNavigate={onNavigate} onAdvanceWeek={vi.fn()} />);
    expect(screen.getByTestId('hq-next-action').compareDocumentPosition(screen.getByTestId('hq-division-card')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /review depth chart/i }));
    expect(onNavigate).toHaveBeenCalledWith('Team:Lineup');
  });

  it('uses existing risk severity and preserves order within a severity', () => {
    const action = buildHqNextAction({ league: league(), gameDayReadiness: {}, gate: { riskItems: [{ id: 'scout', severity: 'info', label: 'Scout', fixDestination: 'Weekly Prep' }, { id: 'cap', severity: 'danger', label: 'Cap blocker', fixDestination: 'Financials' }, { id: 'depth-blocker', severity: 'danger', label: 'Lineup blocker', fixDestination: 'old' }] } });
    expect(action.title).toBe('Cap blocker');
    expect(action.destination).toBe('Financials');
  });

  it('shows ready state and advances when no authoritative work remains', () => {
    const onAdvanceWeek = vi.fn();
    const ready = buildHqNextAction({ league: league(), gate: { riskItems: [] }, gameDayReadiness: {}, nextGame: { isHome: true, opp: { abbr: 'CLE' } } });
    expect(ready.eyebrow).toBe('READY FOR GAME DAY');
    render(<FranchiseHQ league={league()} actions={{ getDashboardLeaders: vi.fn().mockResolvedValue({ team: {}, league: {} }) }} onAdvanceWeek={onAdvanceWeek} />);
    fireEvent.click(screen.getByRole('button', { name: /play week/i }));
    expect(onAdvanceWeek).toHaveBeenCalled();
  });

  it('uses canonical division membership, ordering, and played-game division record', () => {
    const state = league();
    const snapshot = buildHqDivisionSnapshot(state);
    const canonical = prepareStandingsView(state).divisions.find((division) => Number(division.conf) === 0 && Number(division.div) === 1);
    expect(snapshot.teams.map((team) => team.id)).toEqual(canonical.teams.map((team) => team.id));
    expect(snapshot.teams.map((team) => team.abbr)).not.toContain('DAL');
    expect(snapshot.teams.find((team) => team.id === 7).divisionRecord).toBe('1-1');
  });

  it('highlights the user and renders honest canonical/presentation strength values', () => {
    render(<FranchiseHQ league={league()} actions={{ getDashboardLeaders: vi.fn().mockResolvedValue({ team: {}, league: {} }) }} />);
    expect(document.querySelector('[data-user-team="true"].is-user')).toBeTruthy();
    const card = screen.getByTestId('hq-team-strength');
    for (const label of ['TEAM', 'OFF', 'DEF', 'SPEC']) expect(within(card).getByText(label)).toBeTruthy();
    expect(deriveSpecialTeamsPresentationRating(league().teams[0])).toBe(76);
    expect(deriveSpecialTeamsPresentationRating({ roster: specialists.slice(0, 2) })).toBeNull();
  });

  it('matches existing power rank and deterministically ranks displayed unit strength', () => {
    const state = league();
    const snapshot = buildHqStrengthSnapshot({ league: state, team: state.teams[0] });
    expect(snapshot.powerRank).toBe(buildPowerRankings(state).find((row) => row.teamId === 7).rank);
    expect(snapshot.offenseRank).toBeGreaterThan(0);
    expect(snapshot.defenseRank).toBeGreaterThan(0);
  });

  it('renders exactly the six headline yardage leaders from dashboard authority', async () => {
    const category = (prefix, value) => [{ playerId: prefix, name: `${prefix} Player`, value }];
    const data = { team: { passing: category('TeamPass', 1000), rushing: category('TeamRush', 500), receiving: category('TeamRec', 600) }, league: { passing: category('LeaguePass', 1200), rushing: category('LeagueRush', 700), receiving: category('LeagueRec', 800) } };
    render(<FranchiseHQ league={league()} actions={{ getDashboardLeaders: vi.fn().mockResolvedValue(data) }} />);
    await waitFor(() => expect(screen.getAllByText('T. Player')).toHaveLength(3));
    expect(screen.getAllByText(/Player$/)).toHaveLength(6);
    expect(screen.queryByText(/completion|fantasy|passing td|ppg/i)).toBeNull();
  });

  it('keeps fresh saves truthful and clears leaders across save generations', async () => {
    const actions = { getDashboardLeaders: vi.fn().mockResolvedValue({ team: { passing: [{ name: 'Old Leader', value: 10 }] }, league: {} }) };
    const view = render(<FranchiseHQ league={league()} actions={actions} />);
    await screen.findByText('O. Leader');
    const fresh = league({ franchiseGenerationId: 'b', week: 1, teams: league().teams.map((team) => ({ ...team, wins: 0, losses: 0, ties: 0 })), schedule: { weeks: [{ week: 1, games: [{ home: 7, away: 6, played: false }] }] } });
    view.rerender(<FranchiseHQ league={fresh} actions={actions} />);
    expect(screen.queryByText('O. Leader')).toBeNull();
    expect(screen.getByText(/season leaders appear after games are played/i)).toBeTruthy();
    expect(within(screen.getByTestId('hq-division-card')).getAllByText('0-0').length).toBeGreaterThan(0);
  });

  it('uses the existing offseason action center instead of game-day copy', () => {
    const action = buildHqNextAction({ league: league({ phase: 'offseason_resign' }), gate: {}, gameDayReadiness: {} });
    expect(action.destination).toBe('Contract Center');
    expect(action.eyebrow).toBe('NEXT UP');
    expect(action.title).not.toMatch(/game day/i);
  });
});
