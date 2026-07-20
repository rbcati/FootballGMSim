/**
 * Post-Rollover Schedule & Archive Reference Integrity — behavior regression.
 *
 * Drives the REAL production worker through the first offseason rollover
 * (INIT → USE_SAFE_STARTER_LEAGUE → SIM_TO_PHASE) into the Season-2 preseason
 * and proves the shared reference boundaries that used to break Year 2:
 *
 *   - the new-season schedule references only canonical teams (no undefined /
 *     bye-marker pseudo-games), has no self-games, and carries valid byes;
 *   - the archived champion resolves to a canonical team id after rollover;
 *   - a real save → reload preserves the roster-membership fingerprint exactly.
 *
 * These are the exact durability invariants that failed at `afterSeasonRollover`
 * on main before this PR (schedule.games-reference-valid-teams,
 * schedule.no-self-games, history.champion-refs-valid,
 * saveReload.canonical-summary-stable).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { LifecycleDriver } from './lifecycleDriver.js';
import * as scheduleInv from './invariants/schedule.js';
import * as historyInv from './invariants/history.js';
import { canonicalSummary, compareCanonical } from './invariants/saveReload.js';
import { resolveTeamRefId } from '../../src/core/referenceIntegrity.js';

describe('post-rollover schedule & archive reference integrity', () => {
  /** @type {LifecycleDriver} */
  let driver;
  let rolloverCtx = null;
  let saveReload = null;

  beforeAll(async () => {
    driver = new LifecycleDriver({ seed: 1684 });
    await driver.initLeague();
    await driver.simToPhase('playoffs', { checkpoint: 'afterRegularSeason' });
    await driver.simToPhase('offseason', { checkpoint: 'afterPlayoffs' });
    await driver.simToPhase('preseason', { checkpoint: 'afterSeasonRollover' });

    rolloverCtx = await driver.buildContext({ season: 1, phase: 'afterSeasonRollover' });

    // Real save → reload → save round-trip for the canonical fingerprint.
    const before = await driver.buildContext({ season: 1, phase: 'preSave', includeDb: true });
    const beforeSummary = canonicalSummary(before);
    await driver.reload();
    const after = await driver.buildContext({ season: 1, phase: 'afterReload', includeDb: true });
    const afterSummary = canonicalSummary(after);
    saveReload = { before: beforeSummary, after: afterSummary };
  }, 200_000);

  it('reaches Season 2 preseason with a valid 18-week schedule', () => {
    expect(rolloverCtx.view.phase).toBe('preseason');
    expect(rolloverCtx.view.year).toBe(2027);
    expect(rolloverCtx.view.schedule?.weeks?.length).toBe(18);
  });

  it('every new-season game references a canonical team (no undefined bye pseudo-games)', () => {
    const res = scheduleInv.check(rolloverCtx);
    const r = res.find((x) => x.id === 'schedule.games-reference-valid-teams');
    expect(r.status).toBe('pass');
  });

  it('contains no self-games and no team playing twice in a week', () => {
    const res = scheduleInv.check(rolloverCtx);
    expect(res.find((x) => x.id === 'schedule.no-self-games').status).toBe('pass');
  });

  it('has valid bye references and no play-and-bye conflicts', () => {
    const res = scheduleInv.check(rolloverCtx);
    expect(res.find((x) => x.id === 'schedule.bye-refs-valid').status).toBe('pass');
    expect(res.find((x) => x.id === 'schedule.no-play-and-bye').status).toBe('pass');
  });

  it('materializes canonical game ids for the new season (schedule identity)', () => {
    const games = rolloverCtx.view.schedule.weeks.flatMap((w) => w.games ?? []);
    const real = games.filter((g) => g.home != null && g.away != null);
    expect(real.length).toBeGreaterThan(0);
    for (const g of real) {
      expect(typeof g.gameId).toBe('string');
      expect(g.gameId).toMatch(/^s2_w\d+_\d+_\d+$/);
      expect(g.seasonId).toBe('s2');
    }
  });

  it('archives a champion that resolves to a canonical team id', () => {
    const res = historyInv.check(rolloverCtx);
    expect(res.find((x) => x.id === 'history.champion-refs-valid').status).toBe('pass');
    const archive = rolloverCtx.view.leagueHistory?.[0];
    expect(archive).toBeTruthy();
    const validIds = new Set(rolloverCtx.view.teams.map((t) => String(t.id)));
    expect(archive.championTeamId).not.toBeUndefined();
    expect(validIds.has(resolveTeamRefId(archive))).toBe(true);
  });

  it('preserves the roster-membership fingerprint across save → reload', () => {
    const cmp = compareCanonical(saveReload.before, saveReload.after);
    expect(cmp.mismatches).toEqual([]);
    expect(cmp.ok).toBe(true);
    expect(saveReload.before.rosterFingerprint).toBe(saveReload.after.rosterFingerprint);
  });
});
