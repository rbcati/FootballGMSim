/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import FranchiseHQ from '../FranchiseHQ.jsx';
import { buildHqDivisionSnapshot, buildHqNextAction, buildHqStrengthSnapshot, deriveSpecialTeamsPresentationRating } from '../../utils/hqCommandCenterV2.js';
import { prepareStandingsView } from '../../../views/standingsView.js';
import { buildPowerRankings } from '../../utils/franchiseCommandCenter.js';
import { markWeeklyPrepStep } from '../../utils/weeklyPrep.js';
import { buildOffseasonActionCenter } from '../../utils/offseasonActionCenter.js';
import { DEPTH_CHART_ROWS } from '../../../core/depthChart.js';

const player = (id, name, pos, ovr, rowKey, order = 1) => ({ id, teamId: 7, name, pos, ovr, depthChart: { rowKey, order } });
const roster = [
  player(1, 'Justin Fields', 'QB', 78, 'QB'), player(2, 'Runner One', 'RB', 76, 'RB'),
  player(3, 'Wide One', 'WR', 80, 'WR'), player(4, 'Tight One', 'TE', 77, 'TE'),
  ...Array.from({ length: 5 }, (_, i) => player(10 + i, `Line ${i}`, 'OL', 74 + i, 'OL', i + 1)),
  player(20, 'Edge One', 'EDGE', 82, 'EDGE'), player(21, 'Tackle One', 'DT', 79, 'IDL'),
  player(22, 'Backer One', 'LB', 78, 'LB'), player(23, 'Corner One', 'CB', 83, 'CB'), player(24, 'Safety One', 'S', 80, 'S'),
];
const specialists = [player(31, 'Kicker', 'K', 75, 'K'), player(32, 'Punter', 'P', 72, 'P'), player(33, 'Returner', 'WR', 81, 'RS')];
const backups = DEPTH_CHART_ROWS.filter((row) => row.group !== 'SPECIAL').flatMap((row, index) => {
  const existing = roster.filter((member) => member.depthChart.rowKey === row.key).length;
  return Array.from({ length: Math.max(0, row.min - existing) }, (_, i) => player(400 + index * 10 + i, `${row.key} Backup ${i}`, row.match[0], 65, row.key, existing + i + 1));
}).concat([player(600, 'Receiver Depth 1', 'WR', 64, 'WR', 6), player(601, 'Receiver Depth 2', 'WR', 63, 'WR', 7), player(602, 'Return Depth', 'WR', 62, 'RS', 2)]);

function league(overrides = {}) {
  const teams = [
    { id: 7, city: 'Pittsburgh', name: 'Steelers', abbr: 'PIT', conf: 0, div: 1, wins: 2, losses: 1, ovr: 78, roster: [...roster, ...specialists, ...backups] },
    { id: 4, abbr: 'BAL', conf: 0, div: 1, wins: 2, losses: 1, ovr: 77, offenseRating: 77, defenseRating: 78, roster: [] },
    { id: 5, abbr: 'CIN', conf: 0, div: 1, wins: 1, losses: 2, ovr: 74, offenseRating: 73, defenseRating: 75, roster: [] },
    { id: 6, abbr: 'CLE', conf: 0, div: 1, wins: 3, losses: 0, ovr: 82, offenseRating: 81, defenseRating: 83, roster: [] },
    { id: 16, abbr: 'DAL', conf: 1, div: 0, wins: 3, losses: 0, ovr: 83, offenseRating: 84, defenseRating: 80, roster: [] },
  ];
  return { id: 'save-a', franchiseGenerationId: 'a', year: 2026, seasonId: 's1', week: 4, phase: 'regular', userTeamId: 7, teams, weeklyPrep: { lineupChecked: true, planReviewed: true, opponentScouted: true }, schedule: { weeks: [{ week: 1, games: [{ home: 7, away: 4, homeScore: 24, awayScore: 17, played: true }] }, { week: 2, games: [{ home: 5, away: 7, homeScore: 21, awayScore: 17, played: true }] }, { week: 3, games: [{ home: 7, away: 16, homeScore: 28, awayScore: 14, played: true }] }, { week: 4, games: [{ home: 7, away: 6, played: false }] }] }, ...overrides };
}

describe('HQ Command Center V2', () => {
  beforeEach(() => {
    window.localStorage.clear();
    for (const step of ['lineupChecked', 'injuriesReviewed', 'planReviewed', 'opponentScouted']) markWeeklyPrepStep(league(), step);
  });
  afterEach(cleanup);

  it('puts the authoritative lineup blocker first and routes to Team:Lineup', () => {
    const onNavigate = vi.fn();
    const onAdvanceWeek = vi.fn();
    const blocked = league({ teams: league().teams.map((team) => team.id === 7 ? { ...team, roster: team.roster.map((member) => [1, 3].includes(member.id) ? { ...member, injured: true, injuryWeeksRemaining: 2 } : member) } : team) });
    render(<FranchiseHQ league={blocked} onNavigate={onNavigate} onAdvanceWeek={onAdvanceWeek} />);
    expect(screen.getByTestId('hq-next-action').textContent).toContain('2 lineup issues need attention');
    expect(screen.getByTestId('hq-next-action').compareDocumentPosition(screen.getByTestId('hq-division-card')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /review depth chart/i }));
    expect(onNavigate).toHaveBeenCalledWith('Team:Lineup');
    expect(screen.queryByRole('button', { name: /play week|advance week/i })).toBeNull();
    const game = screen.getByTestId('hq-next-game');
    expect(game.textContent).toContain('vs CLE');
    expect(game.textContent).toContain('3-0 · 82 OVR');
    expect(within(game).queryAllByRole('button')).toHaveLength(0);
    for (const element of [game, ...game.querySelectorAll('*')]) fireEvent.click(element);
    for (const button of screen.getAllByRole('button')) fireEvent.click(button);
    expect(onAdvanceWeek).not.toHaveBeenCalled();
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
    const advance = screen.getAllByRole('button', { name: /play week|advance week/i });
    expect(advance).toHaveLength(1);
    expect(within(screen.getByTestId('hq-next-action')).getByRole('button', { name: /play week/i })).toBe(advance[0]);
    fireEvent.click(advance[0]);
    expect(onAdvanceWeek).toHaveBeenCalledTimes(1);
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

  it('refreshes team and league leaders from week 4 to 5 with stable actions and save scope', async () => {
    const data = (teamYards, leagueYards) => ({ team: { passing: [{ name: 'Team Passer', value: teamYards }] }, league: { passing: [{ name: 'League Passer', value: leagueYards }] } });
    let resolveNext;
    const actions = { getDashboardLeaders: vi.fn().mockResolvedValueOnce(data(1000, 1200)).mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve; })) };
    const state = league();
    const view = render(<FranchiseHQ league={state} actions={actions} />);
    await screen.findByText('1,000 yds');
    expect(screen.getByText('1,200 yds')).toBeTruthy();
    expect(actions.getDashboardLeaders).toHaveBeenCalledTimes(1);
    view.rerender(<FranchiseHQ league={{ ...state, week: 5 }} actions={actions} />);
    expect(actions.getDashboardLeaders).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('1,000 yds')).toBeNull();
    expect(screen.queryByText('1,200 yds')).toBeNull();
    await act(async () => resolveNext({ payload: data(1300, 1600) }));
    expect(screen.getByText('1,300 yds')).toBeTruthy();
    expect(screen.getByText('1,600 yds')).toBeTruthy();
  });

  it('does not refetch leaders for same-week presentation changes or help and More Prep interactions', async () => {
    const actions = { getDashboardLeaders: vi.fn().mockResolvedValue({ team: { passing: [{ name: 'Current Passer', value: 1300 }] }, league: {} }) };
    const state = league({ week: 5 });
    const view = render(<FranchiseHQ league={state} actions={actions} />);
    await screen.findByText('1,300 yds');
    view.rerender(<FranchiseHQ league={{ ...state, teams: state.teams.map((team) => ({ ...team, city: 'Updated City' })) }} actions={actions} />);
    fireEvent.click(screen.getByText('More Prep'));
    fireEvent.click(screen.getByRole('button', { name: /power rank help/i }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(actions.getDashboardLeaders).toHaveBeenCalledTimes(1);
    expect(screen.getByText('1,300 yds')).toBeTruthy();
  });

  it('prevents a slow previous-week response from overwriting the current leaders', async () => {
    let resolveOld;
    let resolveNew;
    const actions = { getDashboardLeaders: vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; })) };
    const state = league();
    const view = render(<FranchiseHQ league={state} actions={actions} />);
    view.rerender(<FranchiseHQ league={{ ...state, week: 5 }} actions={actions} />);
    expect(actions.getDashboardLeaders).toHaveBeenCalledTimes(2);
    await act(async () => resolveNew({ team: { passing: [{ name: 'New Leader', value: 1300 }] }, league: {} }));
    expect(screen.getByText('N. Leader')).toBeTruthy();
    await act(async () => resolveOld({ team: { passing: [{ name: 'Old Leader', value: 1000 }] }, league: {} }));
    expect(screen.getByText('N. Leader')).toBeTruthy();
    expect(screen.queryByText('O. Leader')).toBeNull();
    expect(screen.queryByText('1,000 yds')).toBeNull();
  });

  it('clears displayed leaders immediately when switching to another save generation', async () => {
    let resolveNew;
    const actions = { getDashboardLeaders: vi.fn()
      .mockResolvedValueOnce({ team: { passing: [{ name: 'Old Leader', value: 1000 }] }, league: {} })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; })) };
    const view = render(<FranchiseHQ league={league()} actions={actions} />);
    await screen.findByText('O. Leader');
    view.rerender(<FranchiseHQ league={league({ id: 'save-b', franchiseGenerationId: 'b' })} actions={actions} />);
    expect(screen.queryByText('O. Leader')).toBeNull();
    expect(actions.getDashboardLeaders).toHaveBeenCalledTimes(2);
    await act(async () => resolveNew({ team: { passing: [{ name: 'New Leader', value: 300 }] }, league: {} }));
    expect(screen.getByText('N. Leader')).toBeTruthy();
    expect(screen.queryByText('O. Leader')).toBeNull();
  });

  it.each([
    { played: false },
    { played: false, homeScore: 0, awayScore: 0 },
    { played: 0, homeScore: 0, awayScore: 0 },
  ])('does not request leaders for a fresh Week 1 with unplayed game %j', (game) => {
    const actions = { getDashboardLeaders: vi.fn().mockResolvedValue({ team: {}, league: {} }) };
    const state = league({ week: 1, schedule: { weeks: [{ week: 1, games: [{ home: 7, away: 6, ...game }] }] } });
    render(<FranchiseHQ league={state} actions={actions} />);
    expect(actions.getDashboardLeaders).not.toHaveBeenCalled();
    expect(screen.getByText('Season leaders appear after games are played.')).toBeTruthy();
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

  it('cannot bypass a game-plan warning through Next Game', () => {
    markWeeklyPrepStep(league(), 'planReviewed', false);
    const onAdvanceWeek = vi.fn();
    const onNavigate = vi.fn();
    render(<FranchiseHQ league={league()} onAdvanceWeek={onAdvanceWeek} onNavigate={onNavigate} />);
    expect(screen.getByTestId('hq-next-action').textContent).toContain('Game plan not reviewed');
    fireEvent.click(screen.getByRole('button', { name: /review game plan/i }));
    expect(onNavigate).toHaveBeenCalledWith('Game Plan');
    for (const element of screen.getByTestId('hq-next-game').querySelectorAll('*')) fireEvent.click(element);
    expect(screen.queryByRole('button', { name: /play week/i })).toBeNull();
    expect(onAdvanceWeek).not.toHaveBeenCalled();
  });

  it.each(['offseason_resign', 'offseason'])('uses re-signing authority without mutating phase %s', (phase) => {
    const state = league({ phase });
    state.teams[0] = { ...state.teams[0], capRoom: 20, roster: [...state.teams[0].roster, { id: 100, pos: 'QB', ovr: 80, contract: { years: 1 } }] };
    const canonical = buildOffseasonActionCenter({ ...state, phase: 'offseason_resign' });
    const action = buildHqNextAction({ league: state });
    expect(action.title).toBe(canonical.blockers[0]);
    expect(action.destination).toBe('Contract Center');
    expect(state.phase).toBe(phase);
    render(<FranchiseHQ league={state} />);
    expect(screen.getByRole('button', { name: /open re-signing center/i })).toBeTruthy();
    expect(screen.queryByText(/ready for game day/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /play week/i })).toBeNull();
  });

  it('shows Re-signing when decisions are clear, without making suggestions blockers', () => {
    const state = league({ phase: 'offseason' });
    state.teams[0] = { ...state.teams[0], capRoom: 20, roster: ['QB', 'LT', 'EDGE', 'CB'].map((pos, id) => ({ id, pos, contract: { years: 3 } })) };
    expect(buildOffseasonActionCenter({ ...state, phase: 'offseason_resign' }).priorities.length).toBeGreaterThan(0);
    expect(buildHqNextAction({ league: state }).title).toBe('Re-signing');
  });

  it.each([['free_agency', 'Open market board', 'Free Agency'], ['draft', 'Open Draft Room', 'Draft Room'], ['post_draft', 'Review Draft Class', '🎓 Draft'], ['draft_combine', 'Open Draft Combine', 'Draft']])('routes %s to its lifecycle surface', (phase, cta, destination) => {
    const state = league({ phase, draftClass: [] });
    const action = buildHqNextAction({ league: state });
    expect(action).toMatchObject({ eyebrow: 'NEXT UP', cta, destination });
    expect(action.advance).toBeUndefined();
    render(<FranchiseHQ league={state} />);
    expect(screen.queryByText(/ready for game day/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /play week/i })).toBeNull();
  });

  it.each([20, 4, 0, -2])('prioritizes preseason cutdown with a scheduled game and cap room %s', (capRoom) => {
    const state = league({ phase: 'preseason' });
    state.teams[0] = { ...state.teams[0], capRoom, roster: [...roster, ...specialists, ...Array.from({ length: 43 }, (_, i) => player(200 + i, `Backup ${i}`, 'WR', 60, 'WR', i + 10))] };
    const onNavigate = vi.fn();
    const onAdvanceWeek = vi.fn();
    render(<FranchiseHQ league={state} onNavigate={onNavigate} onAdvanceWeek={onAdvanceWeek} />);
    expect(screen.getByTestId('hq-next-action').textContent).toContain('Roster cutdown required (60/53)');
    fireEvent.click(screen.getByRole('button', { name: /run final cuts/i }));
    expect(onNavigate).toHaveBeenCalledWith('Roster');
    expect(onAdvanceWeek).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /play week/i })).toBeNull();
  });

  it('allows clean legal preseason to use the one game-day action', () => {
    const state = league({ phase: 'preseason' });
    state.teams[0] = { ...state.teams[0], capRoom: 20 };
    const onAdvanceWeek = vi.fn();
    render(<FranchiseHQ league={state} onAdvanceWeek={onAdvanceWeek} />);
    expect(screen.getByText('READY FOR GAME DAY')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /play week/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /play week/i }));
    expect(onAdvanceWeek).toHaveBeenCalledTimes(1);
  });

  it.each([false, 0])('excludes unplayed %s zero-score games from DIV while preserving real played ties', (played) => {
    const state = league();
    state.schedule.weeks[3].games[0] = { home: 7, away: 6, played, homeScore: 0, awayScore: 0 };
    const before = JSON.stringify(state);
    const snapshot = buildHqDivisionSnapshot(state);
    expect(snapshot.teams.find((team) => team.id === 7).divisionRecord).toBe('1-1');
    const canonical = prepareStandingsView(state).divisions.find((division) => division.teams.some((team) => team.id === 7));
    expect(snapshot.teams.map((team) => team.id)).toEqual(canonical.teams.map((team) => team.id));
    expect(JSON.stringify(state)).toBe(before);
    state.schedule.weeks.push({ week: 5, games: [{ home: 7, away: 6, played: true, homeScore: 0, awayScore: 0 }] });
    expect(buildHqDivisionSnapshot(state).teams.find((team) => team.id === 7).divisionRecord).toBe('1-1-1');
  });

  it('renders a 1-0 DIV record and the completed-game standings order with a future 0-0 matchup', () => {
    const records = { 7: [1, 0, 24, 17], 4: [1, 0, 21, 17], 5: [0, 2, 34, 45] };
    const state = league({
      teams: league().teams.filter((team) => records[team.id]).map((team) => {
        const [wins, losses, ptsFor, ptsAgainst] = records[team.id];
        return { ...team, wins, losses, ptsFor, ptsAgainst };
      }),
      schedule: { weeks: [
        { week: 1, games: [{ home: 7, away: 5, played: true, homeScore: 24, awayScore: 17 }] },
        { week: 2, games: [{ home: 4, away: 5, played: true, homeScore: 21, awayScore: 17 }] },
        { week: 4, games: [{ home: 7, away: 5, played: false, homeScore: 0, awayScore: 0 }] },
      ] },
    });
    const snapshot = buildHqDivisionSnapshot(state);
    const standings = prepareStandingsView(state).divisions[0];
    expect(snapshot.teams.map((team) => team.id)).toEqual([7, 4, 5]);
    expect(snapshot.teams.map((team) => team.id)).toEqual(standings.teams.map((team) => team.id));
    expect(snapshot.teams.find((team) => team.id === 7).divisionRecord).toBe('1-0');
    render(<FranchiseHQ league={state} />);
    const card = screen.getByTestId('hq-division-card');
    expect(card.querySelector('[data-user-team="true"]').lastElementChild.textContent).toBe('1-0YOU');
    expect([...card.querySelectorAll('.hq-v2-division-row strong')].map((team) => team.textContent)).toEqual(['PIT', 'BAL', 'CIN']);
  });

  it('uses truthful in-season bye copy', () => {
    render(<FranchiseHQ league={league({ schedule: { weeks: [{ week: 4, games: [] }] } })} />);
    expect(screen.getByText('READY TO ADVANCE')).toBeTruthy();
    expect(screen.getByRole('button', { name: /advance week/i })).toBeTruthy();
    expect(screen.queryByText(/ready for game day|no game scheduled/i)).toBeNull();
  });

  it('keeps a later opponent informational on a bye and scopes prep to its actual week', () => {
    window.localStorage.clear();
    const state = league({ schedule: { weeks: [{ week: 4, games: [] }, { week: 5, games: [{ home: 7, away: 6, played: false }] }] } });
    const onAdvanceWeek = vi.fn();
    const view = render(<FranchiseHQ league={state} onAdvanceWeek={onAdvanceWeek} />);
    expect(screen.getByText('READY TO ADVANCE')).toBeTruthy();
    expect(screen.getByTestId('hq-next-game').textContent).toContain('vs CLE');
    expect(screen.queryByRole('button', { name: /review game plan|scout|play week/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /advance week/i }));
    expect(onAdvanceWeek).toHaveBeenCalledTimes(1);
    view.rerender(<FranchiseHQ league={{ ...state, week: 5 }} onAdvanceWeek={onAdvanceWeek} />);
    expect(screen.getByRole('button', { name: /review game plan/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /play week/i })).toBeNull();
  });

  it('keeps informational scouting optional in More Prep while allowing the one progression action', () => {
    markWeeklyPrepStep(league(), 'opponentScouted', false);
    const onAdvanceWeek = vi.fn();
    const onNavigate = vi.fn();
    const info = { id: 'opponent-not-scouted', severity: 'info', fixDestination: 'Weekly Prep' };
    expect(buildHqNextAction({ league: league(), gate: { riskItems: [info] }, nextGame: { isHome: true, opp: { abbr: 'CLE' } } })).toMatchObject({ advance: true, cta: 'Play Week' });
    render(<FranchiseHQ league={league()} onAdvanceWeek={onAdvanceWeek} onNavigate={onNavigate} />);
    expect(screen.getByText('READY FOR GAME DAY')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /play week/i })).toHaveLength(1);
    const more = screen.getByText('More Prep').closest('details');
    expect(more.hasAttribute('open')).toBe(false);
    fireEvent.click(screen.getByText('More Prep'));
    const scout = within(more).getByRole('button', { name: /opponent has not been scouted.*optional/i });
    fireEvent.click(scout);
    expect(onNavigate).toHaveBeenCalledWith('Weekly Prep');
    expect(onAdvanceWeek).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /play week/i }));
    expect(onAdvanceWeek).toHaveBeenCalledTimes(1);
  });

  it.each([[0, 1, 'AFC NORTH'], ['AFC', 'North', 'AFC NORTH'], ['nfc', 'west', 'NFC WEST'], ['AFC', 'AFC_NORTH', 'AFC NORTH']])('normalizes %s / %s and preserves canonical membership/order', (conf, div, title) => {
    const state = league();
    state.teams = state.teams.map((team) => team.id === 16 ? { ...team, conf: 3, div: 2 } : { ...team, conf, div });
    const canonical = prepareStandingsView(state).divisions.find((row) => row.teams.some((team) => team.id === 7));
    const snapshot = buildHqDivisionSnapshot(state);
    expect(snapshot.title).toBe(title);
    expect(snapshot.teams.map((team) => team.id)).toEqual(canonical.teams.map((team) => team.id));
    expect(snapshot.teams).toHaveLength(4);
    expect(snapshot.teams.find((team) => team.id === 7).divisionRecord).toBe('1-1');
  });

  it('respects configured conference/division names, including additional groups', () => {
    const state = league({ settings: { conferenceNames: ['Alpha', 'Beta', 'Gamma'], divisionNames: ['Coastal', 'Central'] } });
    expect(buildHqDivisionSnapshot(state).title).toBe('ALPHA CENTRAL');
    state.teams = state.teams.map((team) => ({ ...team, conf: 2 }));
    expect(buildHqDivisionSnapshot(state).title).toBe('GAMMA CENTRAL');
  });

  it.each([[0, 1], ['AFC', 'North']])('enriches archived preseason membership %s / %s without changing records or league state', (conf, div) => {
    const state = league({ phase: 'preseason', standingsContext: { mode: 'archive' }, schedule: { weeks: [{ week: 1, games: [{ home: 7, away: 4, played: false }] }] } });
    state.teams = state.teams.map((team) => team.id === 16 ? team : { ...team, conf, div });
    state.standings = state.teams.map((team) => ({ id: team.id, abbr: team.abbr, name: team.name, wins: team.wins, losses: team.losses, ties: 0, conf: null, div: null }));
    state.teams = state.teams.map((team) => ({ ...team, wins: 0, losses: 0 }));
    const canonicalInput = { ...state, standings: state.standings.map((row) => {
      const team = state.teams.find((team) => team.id === row.id);
      return { ...row, conf: team.conf, div: team.div };
    }) };
    const canonical = prepareStandingsView(canonicalInput).divisions.find((row) => row.teams.some((team) => team.id === 7));
    const before = JSON.stringify(state);
    const snapshot = buildHqDivisionSnapshot(state);
    expect(snapshot.title).toBe('AFC NORTH');
    expect(snapshot.teams.map((team) => team.id)).toEqual(canonical.teams.map((team) => team.id));
    expect(snapshot.teams).toHaveLength(4);
    expect(snapshot.teams.find((team) => team.id === 7).record).toBe('2-1');
    expect(snapshot.teams.every((team) => team.divisionRecord === null)).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
    // Current-season preseason results must not become archive DIV records.
    state.schedule.weeks[0].games[0] = { home: 7, away: 4, homeScore: 24, awayScore: 17, played: true };
    expect(buildHqDivisionSnapshot(state).teams.every((team) => team.divisionRecord === null)).toBe(true);
    render(<FranchiseHQ league={state} />);
    const card = screen.getByTestId('hq-division-card');
    expect([...card.querySelectorAll('.hq-v2-division-row > span:last-child')].map((cell) => cell.textContent)).toEqual(expect.arrayContaining(['—', '—YOU']));
    fireEvent.click(within(card).getByRole('button', { name: /division record help/i }));
    expect(screen.getByText('Previous-season division records are unavailable.')).toBeTruthy();
  });

  it('opens metric help on tap at 390px and closes with Escape, a second tap or outside tap', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    render(<FranchiseHQ league={league()} />);
    const power = screen.getByRole('button', { name: /power rank help/i });
    expect(power.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(power);
    expect(power.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(power.getAttribute('aria-controls')).textContent).toContain('Weekly team ranking');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText(/weekly team ranking/i)).toBeNull();
    expect(document.activeElement).toBe(power);
    const div = screen.getByRole('button', { name: /division record help/i });
    fireEvent.click(div);
    expect(screen.getByText('Record against teams in your division.')).toBeTruthy();
    fireEvent.click(div);
    expect(screen.queryByText('Record against teams in your division.')).toBeNull();
    fireEvent.click(power);
    fireEvent.pointerDown(document.body);
    expect(power.getAttribute('aria-expanded')).toBe('false');
  });

  it('ignores a late leader response from the previous save generation', async () => {
    let resolveOld;
    const actions = { getDashboardLeaders: vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValue({ team: {}, league: {} }) };
    const view = render(<FranchiseHQ league={league()} actions={actions} />);
    view.rerender(<FranchiseHQ league={league({ franchiseGenerationId: 'new' })} actions={actions} />);
    resolveOld({ team: { passing: [{ name: 'Stale Leader', value: 999 }] } });
    await waitFor(() => expect(actions.getDashboardLeaders).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('S. Leader')).toBeNull();
    expect(screen.getByText(/season leaders appear/i)).toBeTruthy();
  });
});
