/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { deriveSuperBowlResult } from '../../src/ui/utils/superBowlResult.js';
import { SeasonCompleteSplash } from '../../src/ui/components/MilestoneModal.jsx';
import { workerReducer, INITIAL_WORKER_STATE } from '../../src/ui/hooks/useWorker.js';

afterEach(cleanup);

const teams = [
  { id: 7, abbr: 'PIT', name: 'Pittsburgh Steelers', wins: 13, losses: 8, conf: 0 },
  { id: 30, abbr: 'SF', name: 'San Francisco 49ers', wins: 14, losses: 7, conf: 1 },
  { id: 0, abbr: 'BUF', name: 'Buffalo Bills', wins: 7, losses: 10, conf: 0 },
];
const sbResult = { gameId: 's1_w22_7_30', week: 22, homeId: 7, awayId: 30, homeName: 'Pittsburgh Steelers', awayName: 'San Francisco 49ers', homeScore: 27, awayScore: 24 };

describe('Super Bowl result derivation', () => {
  it('prefers the WEEK_COMPLETE finale', () => {
    const r = deriveSuperBowlResult({ seasonId: 's1', teams }, { seasonId: 's1', week: 22, results: [sbResult] });
    expect(r).toMatchObject({ homeAbbr: 'PIT', awayAbbr: 'SF', homeScore: 27, awayScore: 24, winnerId: 7, source: 'week_complete' });
  });
  it('falls back to the persisted week-22 schedule row after reload', () => {
    const league = { seasonId: 's1', teams, schedule: { weeks: [{ week: 22, games: [{ home: 30, away: 7, played: true, homeScore: 31, awayScore: 17 }] }] } };
    expect(deriveSuperBowlResult(league, null)).toMatchObject({ homeAbbr: 'SF', homeScore: 31, awayScore: 17, winnerId: 30, source: 'schedule' });
  });
  it('returns null when no Super Bowl was played', () => {
    expect(deriveSuperBowlResult({ teams, schedule: { weeks: [{ week: 22, games: [{ home: 7, away: 30, played: false }] }] } }, null)).toBeNull();
  });
});

describe('Season Complete splash', () => {
  it('shows the Super Bowl final score', () => {
    const league = { phase: 'offseason_resign', championTeamId: 7, userTeamId: 0, teams };
    const view = render(<SeasonCompleteSplash championTeamId={7} teams={teams} league={league} superBowl={deriveSuperBowlResult(league, { week: 22, results: [sbResult] })} onProceed={() => {}} />);
    const score = view.getByTestId('super-bowl-score');
    expect(score.textContent).toContain('SF 24');
    expect(score.textContent).toContain('27 PIT');
  });
});

describe('useWorker reducer keeps the Super Bowl result across the phase flip', () => {
  it('stores the season finale and does not clear it on the offseason STATE_UPDATE', () => {
    let state = { ...INITIAL_WORKER_STATE, league: { seasonId: 's1', phase: 'playoffs', week: 22, teams } };
    state = workerReducer(state, { type: 'WEEK_COMPLETE', week: 22, results: [sbResult], nextWeek: 23, phase: 'offseason_resign', standings: teams, isSeasonOver: true });
    state = workerReducer(state, { type: 'STATE_UPDATE', payload: { phase: 'offseason_resign', week: 0 } });
    expect(state.lastResults).toEqual([]);
    expect(state.seasonFinale).toMatchObject({ week: 22, results: [sbResult] });
    state = workerReducer(state, { type: 'STATE_UPDATE', payload: { phase: 'preseason' } });
    expect(state.seasonFinale).toBeNull();
  });
  it('clears weekly results on an offseason delta that carries no phase field', () => {
    let state = { ...INITIAL_WORKER_STATE, league: { seasonId: 's1', phase: 'offseason_resign', week: 0, teams } };
    state = { ...state, lastResults: [sbResult], lastSimWeek: 22 };
    // STATE_UPDATE dispatches only the delta (e.g. a roster change), not the phase.
    state = workerReducer(state, { type: 'STATE_UPDATE', payload: { teams } });
    expect(state.lastResults).toEqual([]);
    expect(state.lastSimWeek).toBeNull();
  });
  it('keeps weekly results on an in-season delta without a phase field', () => {
    let state = { ...INITIAL_WORKER_STATE, league: { seasonId: 's1', phase: 'regular', week: 5, teams } };
    state = { ...state, lastResults: [sbResult], lastSimWeek: 4 };
    state = workerReducer(state, { type: 'STATE_UPDATE', payload: { teams } });
    expect(state.lastResults).toEqual([sbResult]);
  });
  it('does not treat a normal week as a finale', () => {
    const state = workerReducer({ ...INITIAL_WORKER_STATE, league: { seasonId: 's1' } }, { type: 'WEEK_COMPLETE', week: 20, results: [sbResult], nextWeek: 21, phase: 'playoffs', isSeasonOver: false });
    expect(state.seasonFinale).toBeNull();
  });
});
