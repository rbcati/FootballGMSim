/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AnalyticsHub from '../AnalyticsHub.jsx';
import PlayerProfile from '../PlayerProfile.jsx';
import { buildLeagueStatsHubModel } from '../../utils/leagueStatsHub.js';
import { calculateCanonicalPasserRating } from '../../../core/simulation/mathHelpers.js';

vi.mock('../AnalyticsDashboard.jsx', () => ({ default: () => null }));
const totals = { gamesPlayed: 2, passAtt: 100, passComp: 60, passYd: 700, passTD: 5, interceptions: 1, passerRating: 999 };
const qb = { id: 'rating-review-qb', name: 'Season Rating QB', pos: 'QB', teamId: 1, age: 25, ovr: 80, status: 'active', ratings: {}, traits: [] };
const league = { seasonId: '2026', week: 2, userTeamId: 1, teams: [{ id: 1, name: 'One', abbr: 'ONE', roster: [{ ...qb, seasonStats: totals }] }], schedule: [] };

afterEach(cleanup);
describe('season passer-rating display authority', () => {
  it('renders the same cumulative rating in AnalyticsHub, League Stats and Player Profile', async () => {
    const expected = calculateCanonicalPasserRating(totals);
    expect(expected).toBe(93.8);
    const model = buildLeagueStatsHubModel(league);
    expect(model.playerTables.passing[0].rate).toBe(expected);
    const actions = {
      getAllPlayerStats: vi.fn(async () => ({ payload: { stats: [{ ...qb, gamesPlayed: 2, passYards: 700, passTDs: 5, int: 1, passerRating: expected }] } })),
      getPlayerCareer: vi.fn(async () => ({ payload: { player: qb, stats: [{ seasonId: '2026', teamId: 1, totals }] } })),
      getAllSeasons: vi.fn(async () => ({ payload: { seasons: [] } })),
      getPlayerDraftContext: vi.fn(async () => ({ payload: { context: { known: false } } })),
      getRecords: vi.fn(async () => ({ payload: { recordBook: null } })),
      getTransactions: vi.fn(async () => ({ payload: { transactions: [] } })),
    };
    render(<AnalyticsHub league={league} actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Players', exact: true }));
    expect(await screen.findByRole('cell', { name: expected.toFixed(1) })).toBeTruthy();
    cleanup();
    global.IntersectionObserver = vi.fn(function () { return { observe() {}, unobserve() {}, disconnect() {} }; });
    render(<PlayerProfile playerId={qb.id} teams={league.teams} league={league} actions={actions} onClose={() => {}} />);
    await screen.findByText(qb.name);
    fireEvent.click(screen.getByRole('button', { name: 'Career', exact: true }));
    fireEvent.click(await screen.findByText('Season-by-season stat detail'));
    expect(await screen.findByRole('cell', { name: expected.toFixed(1) })).toBeTruthy();
    expect(screen.queryByRole('cell', { name: '999.0' })).toBeNull();
  });
});
