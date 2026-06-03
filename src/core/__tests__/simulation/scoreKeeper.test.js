import { describe, it, expect } from 'vitest';
import {
  resolveTouchdownScore,
  resolveFieldGoalScore,
  resolveSafetyScore,
  applyResult,
} from '../../simulation/scoreKeeper.js';

describe('scoreKeeper scoring handlers', () => {
  it('TD + PAT: a successful extra point yields 7 points', () => {
    const td = resolveTouchdownScore(0.5, 1.0);
    expect(td.points).toBe(7);
    expect(td.xpMade).toBe(1);
    expect(td.twoPtMade).toBe(0);
  });

  it('FG: a made field goal yields 3 points', () => {
    const fg = resolveFieldGoalScore(0.1, 1.0);
    expect(fg.made).toBe(true);
    expect(fg.points).toBe(3);
  });

  it('Safety: always worth 2 points to the defense', () => {
    expect(resolveSafetyScore().points).toBe(2);
  });

  it('Missed FG (touchback): no points scored', () => {
    const fg = resolveFieldGoalScore(0.99, 1.0);
    expect(fg.made).toBe(false);
    expect(fg.points).toBe(0);
  });
});

describe('scoreKeeper.applyResult', () => {
  it('credits a win/loss and points for/against to both teams', () => {
    const home = { id: 1, abbr: 'HOM' };
    const away = { id: 2, abbr: 'AWY' };
    const league = { teams: [home, away] };
    applyResult(league, { home, away }, 24, 17);
    expect(home.wins).toBe(1);
    expect(home.losses).toBe(0);
    expect(away.losses).toBe(1);
    expect(home.ptsFor).toBe(24);
    expect(home.ptsAgainst).toBe(17);
    expect(away.ptsFor).toBe(17);
  });
});
