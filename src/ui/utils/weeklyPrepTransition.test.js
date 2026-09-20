/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWeeklyPrepProgress, markWeeklyPrepStep } from './weeklyPrep.js';
import { buildWeeklyPrepMarker, transitionWeeklyPrep } from './weeklyPrepTransition.js';

const leagueAt = (activeLeagueId, week) => ({
  activeLeagueId,
  seasonId: '2026',
  year: 2026,
  week,
  userTeamId: 7,
});

describe('weekly prep transition cleanup', () => {
  beforeEach(() => localStorage.clear());

  it('preserves canonical league identity in the previous-week marker', () => {
    expect(buildWeeklyPrepMarker(leagueAt('league_A', 1))).toEqual({
      activeLeagueId: 'league_A',
      seasonId: '2026',
      week: 1,
      userTeamId: 7,
    });
  });

  it('clears with the exact prior league, season, week, and team context', () => {
    const prior = buildWeeklyPrepMarker(leagueAt('league_A', 1));
    const clearPrep = vi.fn();
    const current = transitionWeeklyPrep(prior, leagueAt('league_A', 2), clearPrep);

    expect(clearPrep).toHaveBeenCalledOnce();
    expect(clearPrep).toHaveBeenCalledWith({
      activeLeagueId: 'league_A', seasonId: '2026', week: 1, userTeamId: 7,
    });
    expect(current.week).toBe(2);
  });

  it('removes prior-week prep when the same league advances', () => {
    const weekOne = leagueAt('league_A', 1);
    markWeeklyPrepStep(weekOne, 'lineupChecked', true);
    markWeeklyPrepStep(weekOne, 'opponentScouted', true);

    transitionWeeklyPrep(buildWeeklyPrepMarker(weekOne), leagueAt('league_A', 2));

    expect(getWeeklyPrepProgress(weekOne)).toMatchObject({ lineupChecked: false, opponentScouted: false });
    expect(getWeeklyPrepProgress(leagueAt('league_A', 2))).toMatchObject({ lineupChecked: false, opponentScouted: false });
  });

  it('does not mutate either save when switching between identical coordinates', () => {
    const saveA = leagueAt('league_A', 1);
    const saveB = leagueAt('league_B', 1);
    markWeeklyPrepStep(saveA, 'lineupChecked', true);
    markWeeklyPrepStep(saveB, 'opponentScouted', true);
    const clearPrep = vi.fn();

    transitionWeeklyPrep(buildWeeklyPrepMarker(saveA), saveB, clearPrep);

    expect(clearPrep).not.toHaveBeenCalled();
    expect(getWeeklyPrepProgress(saveA).lineupChecked).toBe(true);
    expect(getWeeklyPrepProgress(saveB).opponentScouted).toBe(true);
  });

  it('does not clear current prep when the same league rehydrates unchanged', () => {
    const save = leagueAt('league_A', 4);
    const clearPrep = vi.fn();
    transitionWeeklyPrep(buildWeeklyPrepMarker(save), { ...save }, clearPrep);
    expect(clearPrep).not.toHaveBeenCalled();
  });
});
