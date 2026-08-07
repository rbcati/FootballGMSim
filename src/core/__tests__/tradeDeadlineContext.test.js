import { describe, expect, it } from 'vitest';
import { buildTradeDeadlineContext } from '../tradeDeadlineContext.js';

const player = (id, extras = {}) => ({
  id, teamId: 1, name: `Player ${id}`, pos: 'WR', age: 30, ovr: 80, potential: 80,
  status: 'active', depthChart: { order: 1, role: 'starter' },
  contract: { yearsRemaining: 1, baseAnnual: 8 }, ...extras,
});
const leagueFor = (roster, extras = {}) => ({
  userTeamId: 1, phase: 'regular', week: 7, settings: { tradeDeadlineWeek: 9 },
  teams: [{ id: 1, wins: 5, losses: 2, streak: ['W', 'W'], roster }], players: roster, ...extras,
});
const build = (roster, extras = {}) => {
  const league = leagueFor(roster, extras);
  return buildTradeDeadlineContext({ league, team: league.teams[0], roster });
};

describe('buildTradeDeadlineContext', () => {
  it('uses the canonical trade window countdown and reports a passed deadline without negatives', () => {
    expect(build([]).deadline).toMatchObject({ currentWeek: 7, deadlineWeek: 9, weeksUntilDeadline: 2, deadlinePassed: false, deadlineActive: true });
    const passed = build([], { week: 10 });
    expect(passed.deadline).toMatchObject({ weeksUntilDeadline: 0, deadlinePassed: true, deadlineActive: false });
  });

  it.each(['offseason', 'playoffs', 'draft'])('suppresses review context in the %s phase', (phase) => {
    const result = build([player(1)], { phase });
    expect(result.deadline.deadlineActive).toBe(false);
    expect(result.reviewCandidates).toEqual([]);
  });

  it('honors explicit stable week input and canonical legacy deadline defaults', () => {
    const league = leagueFor([], { week: 2, settings: undefined });
    const result = buildTradeDeadlineContext({ league, team: league.teams[0], roster: [], week: 4 });
    expect(result.deadline).toMatchObject({ currentWeek: 4, deadlineWeek: 9, weeksUntilDeadline: 5 });
  });

  it('surfaces factual team record, division place, and recorded streak without posture labels', () => {
    const rival = { id: 2, wins: 6, losses: 1, conf: 'A', div: 'East', roster: [] };
    const league = leagueFor([], { teams: [rival, { id: 1, wins: 5, losses: 2, conf: 'A', div: 'East', streak: ['W', 'W'], roster: [] }] });
    const result = buildTradeDeadlineContext({ league, team: league.teams[1], roster: [] });
    expect(result.teamContext).toMatchObject({ record: { wins: 5, losses: 2, ties: 0 }, divisionPosition: 2, streak: { result: 'W', length: 2 } });
    expect(JSON.stringify(result)).not.toMatch(/buyer|seller|movement/i);
  });

  it('includes a final-year veteran only with meaningful canonical value and unresolved context', () => {
    const result = build([player(1)]);
    expect(result.reviewCandidates[0]).toMatchObject({ playerId: 1, contractYearsRemaining: 1, role: 'Starter', finalYearContext: true });
    expect(result.reviewCandidates[0].reasons).toContain('Contract expires after this season');
    expect(result.reviewCandidates[0].destination).toEqual({ view: 'Transactions', workspace: 'Finder', playerId: 1 });
  });

  it('includes a multi-year veteran depth player for its authoritative role, but not an unsupported starter', () => {
    const depth = player(1, { contract: { yearsRemaining: 3 }, depthChart: { order: 2, role: 'backup' } });
    const starter = player(2, { contract: { yearsRemaining: 3 } });
    const result = build([starter, depth]);
    expect(result.reviewCandidates.map((row) => row.playerId)).toEqual([1]);
    expect(result.reviewCandidates[0].reasons).toContain('Veteran backup role');
  });

  it.each([
    ['free agent', { teamId: 'FA', status: 'free_agent' }],
    ['prospect', { isProspect: true }],
    ['retired player', { retired: true }],
    ['foreign player', { teamId: 2 }],
  ])('excludes a %s', (_label, extras) => expect(build([player(1, extras)]).reviewCandidates).toEqual([]));

  it('excludes stale references and resolved retention decisions', () => {
    const league = leagueFor([player(1, { extensionDecision: 'extended' })]);
    expect(buildTradeDeadlineContext({ league, team: league.teams[0], roster: ['missing', 1] }).reviewCandidates).toEqual([]);
  });

  it('does not turn missing contract, value evidence, or role into candidate facts', () => {
    const sparse = player(1, { age: null, ovr: null, potential: null, contract: { yearsRemaining: '' }, depthChart: null });
    const result = build([sparse]);
    expect(result.reviewCandidates).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/expir|backup|depth|trade value: 0/i);
  });

  it('does not invent demand or destinations from records or another team injury', () => {
    const result = build([player(1)], { injuries: [{ id: 99, teamId: 2, injuryWeeksRemaining: 8 }] });
    expect(JSON.stringify(result)).not.toMatch(/market demand|interest|contender|buyer|seller|plausible destination/i);
  });

  it('orders final-year context, then value, then stable ID independently of roster order', () => {
    const a = player(10, { ovr: 78 });
    const b = player(2, { ovr: 84 });
    const depth = player(1, { ovr: 95, contract: { yearsRemaining: 3 }, depthChart: { order: 2, role: 'reserve' } });
    const first = build([depth, a, b]).reviewCandidates.map((row) => row.playerId);
    const second = build([b, depth, a]).reviewCandidates.map((row) => row.playerId);
    expect(first).toEqual([2, 10, 1]);
    expect(second).toEqual(first);
  });

  it('deduplicates players and reasons, is deterministic, and does not mutate inputs', () => {
    const original = player(1);
    const roster = [original, original, { ...original }];
    const before = structuredClone(roster);
    const one = build(roster);
    const two = build(roster);
    expect(one).toEqual(two);
    expect(one.reviewCandidates).toHaveLength(1);
    expect(new Set(one.reviewCandidates[0].reasons).size).toBe(one.reviewCandidates[0].reasons.length);
    expect(roster).toEqual(before);
  });
});
