import { describe, expect, it } from 'vitest';
import { getNextUserGame, getPreviousUserGame } from './userWeeklyGames.js';
import { getNextGame } from './weeklyPrep.js';

const league = {
  year: 2026,
  week: 1,
  userTeamId: 1,
  teams: [{ id: 1, abbr: 'BAL' }, { id: 2, abbr: 'CLE' }, { id: 3, abbr: 'HOU' }],
  schedule: { weeks: [
    { week: 1, games: [{ id: 'wk1', home: 1, away: 2, played: false }] },
    { week: 2, games: [{ id: 'wk2', home: 3, away: 1, played: false }] },
  ] },
};

describe('canonical user weekly games', () => {
  it('gives HQ/prep and Team the identical Week 1 opponent', () => {
    const canonical = getNextUserGame(league);
    const hqPrep = getNextGame(league);
    expect(canonical).toMatchObject({ week: 1, isHome: true, oppId: 2, opp: { abbr: 'CLE' } });
    expect(hqPrep).toMatchObject({ week: canonical.week, oppId: canonical.oppId });
  });

  it('does not mistake a valid nested matchup for an empty schedule', () => {
    expect(getNextUserGame(league)).not.toBeNull();
  });

  it('selects only played games as previous results', () => {
    expect(getPreviousUserGame(league)).toBeNull();
    const completed = structuredClone(league);
    completed.schedule.weeks[0].games[0].played = true;
    expect(getPreviousUserGame(completed)).toMatchObject({ week: 1, oppId: 2 });
  });

  it('uses the canonical indexed final when the schedule still says unplayed', () => {
    const stale = {
      ...league,
      gameById: { wk1: { id: 'wk1', home: 1, away: 2, homeScore: 24, awayScore: 17 } },
    };
    expect(getPreviousUserGame(stale)).toMatchObject({ id: 'wk1', week: 1, oppId: 2, isCompleted: true, homeScore: 24 });
    expect(getNextUserGame(stale)).toMatchObject({ id: 'wk2', week: 2, oppId: 3 });
    expect(getNextGame(stale)).toMatchObject({ id: 'wk2', week: 2, oppId: 3 });
  });
});
