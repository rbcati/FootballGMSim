/**
 * Post-Rollover Roster Membership Integrity (PR #1689) — behavior regression.
 *
 * Reproduces the real production lifecycle through the first offseason rollover
 * and proves the user team (id 0) keeps a legal roster.
 *
 * ROOT CAUSE guarded here: the user team has id `0`, and `teamId === 0` is
 * falsy. The offseason free-agency classifier used `!player.teamId` to mean
 * "is a free agent", so every player on the user's roster was misclassified as a
 * free agent and signed away by AI teams — collapsing team 0 to ~11 players by
 * the next preseason while every AI team stayed healthy.
 *
 * This exercises the REAL worker (INIT → USE_SAFE_STARTER_LEAGUE → SIM_TO_PHASE)
 * so it validates the actual mutation path, not a fixture.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { LifecycleDriver } from './lifecycleDriver.js';
import { ROSTER } from './invariants/bounds.js';

const USER_TEAM_ID = 0;

describe('post-rollover roster membership integrity (PR #1689)', () => {
  /** @type {LifecycleDriver} */
  let driver;
  let preRolloverUserCount = 0;
  let preseasonView = null;

  beforeAll(async () => {
    driver = new LifecycleDriver({ seed: 1684 });
    await driver.initLeague();
    await driver.simToPhase('playoffs', { checkpoint: 'afterRegularSeason' });
    await driver.simToPhase('offseason', { checkpoint: 'afterPlayoffs' });
    const preUser = driver.view.teams.find((t) => Number(t.id) === USER_TEAM_ID);
    preRolloverUserCount = preUser?.roster?.length ?? 0;
    await driver.simToPhase('preseason', { checkpoint: 'afterSeasonRollover' });
    preseasonView = driver.view;
  }, 200_000);

  it('reaches the next preseason without a lifecycle crash', () => {
    expect(preseasonView.phase).toBe('preseason');
  });

  it('user team enters the offseason with a full roster', () => {
    expect(preRolloverUserCount).toBeGreaterThanOrEqual(ROSTER.REGULAR_SEASON_MIN);
  });

  it('REGRESSION: user team (id 0) is NOT stripped to ~11 players by AI free agency', () => {
    const team0 = preseasonView.teams.find((t) => Number(t.id) === USER_TEAM_ID);
    expect(team0).toBeTruthy();
    // Pre-fix this collapsed to 11. Post-fix the user keeps its veterans (it does
    // not actively cut/re-sign in a batch sim) plus drafted rookies.
    expect(team0.roster.length).toBeGreaterThanOrEqual(ROSTER.REGULAR_SEASON_MIN);
    expect(team0.roster.length).toBeLessThanOrEqual(ROSTER.ABSOLUTE_MAX);
  });

  it('every team — user and AI alike — holds a legal preseason roster', () => {
    const offenders = preseasonView.teams
      .map((t) => ({ id: t.id, size: Array.isArray(t.roster) ? t.roster.length : 0 }))
      .filter((t) => t.size < ROSTER.REGULAR_SEASON_MIN || t.size > ROSTER.ABSOLUTE_MAX);
    expect(offenders).toEqual([]);
  });

  it('no player is rostered on more than one team after the rollover', () => {
    const owner = new Map();
    for (const team of preseasonView.teams) {
      for (const p of team.roster ?? []) {
        const key = String(p.id);
        if (owner.has(key)) owner.set(key, [...owner.get(key), team.id]);
        else owner.set(key, [team.id]);
      }
    }
    const dupes = [...owner.entries()].filter(([, teams]) => new Set(teams.map(String)).size > 1);
    expect(dupes).toEqual([]);
  });
});
