/**
 * Post-Rollover Reference Integrity — invariant-level unit coverage.
 *
 * These exercise the durability invariants directly (pure functions over a
 * synthetic ctx) so the schedule/champion/save-reload reference contracts are
 * pinned without a full multi-minute lifecycle run.
 */
import { describe, it, expect } from 'vitest';
import * as schedule from './invariants/schedule.js';
import * as history from './invariants/history.js';
import {
  canonicalSummary,
  compareCanonical,
  classifyRosterFingerprintDiff,
} from './invariants/saveReload.js';

function teams32() {
  return Array.from({ length: 32 }, (_, i) => ({
    id: i, wins: 0, losses: 0, ties: 0, ptsFor: 0, ptsAgainst: 0,
  }));
}

function ctx({ view = {}, phase = 'regular', season = 2 } = {}) {
  return {
    season, phase, week: view.week ?? 1, seed: 1684, expectedTeamCount: 32,
    view: { teams: teams32(), championTeamId: null, leagueHistory: [], ...view },
    db: null, probes: {},
  };
}

/** A canonical bye-free week: 16 real games covering all 32 teams. */
function fullWeek(week) {
  const games = [];
  for (let i = 0; i < 32; i += 2) {
    games.push({ id: `s2_w${week}_${i}_${i + 1}`, gameId: `s2_w${week}_${i}_${i + 1}`, seasonId: 's2', week, home: i, away: i + 1, played: false });
  }
  return { week, games, teamsWithBye: [] };
}

describe('schedule invariant — team-reference & self-game contract', () => {
  it('passes a clean materialized schedule (team 0 as home & away)', () => {
    const c = ctx({ view: { schedule: { weeks: [fullWeek(1)] } } });
    const res = schedule.check(c);
    expect(res.find((r) => r.id === 'schedule.games-reference-valid-teams').status).toBe('pass');
    expect(res.find((r) => r.id === 'schedule.no-self-games').status).toBe('pass');
    // team 0 genuinely appears (game 0 vs 1)
    expect(c.view.schedule.weeks[0].games[0].home).toBe(0);
  });

  it('treats a bye entry as a bye, not a self-game or invalid ref', () => {
    // Week with 30 teams playing (15 games) and teams 30,31 on bye.
    const games = [];
    for (let i = 0; i < 30; i += 2) games.push({ week: 5, home: i, away: i + 1, played: false });
    const c = ctx({ view: { schedule: { weeks: [{ week: 5, games, teamsWithBye: [30, 31] }] } } });
    const res = schedule.check(c);
    expect(res.find((r) => r.id === 'schedule.games-reference-valid-teams').status).toBe('pass');
    expect(res.find((r) => r.id === 'schedule.no-self-games').status).toBe('pass');
    expect(res.find((r) => r.id === 'schedule.bye-refs-valid').status).toBe('pass');
    expect(res.find((r) => r.id === 'schedule.no-play-and-bye').status).toBe('pass');
  });

  it('tolerates a LEGACY bye marker inside games (undefined home/away) without failing', () => {
    const games = [{ week: 5, bye: [30, 31] }, { week: 5, home: undefined, away: undefined, played: false }];
    for (let i = 0; i < 30; i += 2) games.push({ week: 5, home: i, away: i + 1 });
    const c = ctx({ view: { schedule: { weeks: [{ week: 5, games, teamsWithBye: [30, 31] }] } } });
    const res = schedule.check(c);
    expect(res.find((r) => r.id === 'schedule.games-reference-valid-teams').status).toBe('pass');
    expect(res.find((r) => r.id === 'schedule.no-self-games').status).toBe('pass');
  });

  it('team 0 can be on bye and is validated as a bye reference', () => {
    const games = [];
    for (let i = 2; i < 32; i += 2) games.push({ week: 6, home: i, away: i + 1 <= 31 ? i + 1 : 1 });
    // Ensure teams 0 and 1 are the byes; rebuild cleanly.
    const g2 = [];
    for (let i = 2; i < 32; i += 2) g2.push({ week: 6, home: i, away: i + 1 });
    const c = ctx({ view: { schedule: { weeks: [{ week: 6, games: g2, teamsWithBye: [0, 1] }] } } });
    const res = schedule.check(c);
    expect(res.find((r) => r.id === 'schedule.bye-refs-valid').status).toBe('pass');
    expect(res.find((r) => r.id === 'schedule.no-play-and-bye').status).toBe('pass');
  });

  it('detects a genuine self-game via canonical identity (numeric vs string)', () => {
    const c = ctx({ view: { schedule: { weeks: [{ week: 1, games: [{ week: 1, home: 5, away: '5' }] }] } } });
    const res = schedule.check(c);
    expect(res.find((r) => r.id === 'schedule.no-self-games').status).toBe('fail');
  });

  it('detects an invalid team reference and reports value + type + known ids', () => {
    const c = ctx({ view: { schedule: { weeks: [{ week: 1, games: [{ week: 1, home: 0, away: 99 }] }] } } });
    const res = schedule.check(c);
    const f = res.find((r) => r.id === 'schedule.games-reference-valid-teams');
    expect(f.status).toBe('fail');
    expect(f.details.sample[0]).toMatchObject({ away: 99, awayType: 'number' });
    expect(Array.isArray(f.details.knownIds)).toBe(true);
  });

  it('flags a bye reference that is not a known team', () => {
    const g2 = [];
    for (let i = 2; i < 32; i += 2) g2.push({ week: 6, home: i, away: i + 1 });
    const c = ctx({ view: { schedule: { weeks: [{ week: 6, games: g2, teamsWithBye: [0, 999] }] } } });
    const res = schedule.check(c);
    expect(res.find((r) => r.id === 'schedule.bye-refs-valid').status).toBe('fail');
  });

  it('flags a team that both plays and has a bye in the same week', () => {
    const g2 = [];
    for (let i = 2; i < 32; i += 2) g2.push({ week: 6, home: i, away: i + 1 });
    // team 2 plays AND is listed on bye
    const c = ctx({ view: { schedule: { weeks: [{ week: 6, games: g2, teamsWithBye: [0, 1, 2] }] } } });
    const res = schedule.check(c);
    expect(res.find((r) => r.id === 'schedule.no-play-and-bye').status).toBe('fail');
  });
});

describe('history invariant — champion reference normalization', () => {
  it('resolves a champion stored as a display-snapshot object', () => {
    const c = ctx({
      phase: 'afterSeasonRollover', season: 1,
      view: { leagueHistory: [{ id: 's1', year: 2026, championTeamId: 6, champion: { id: 6, name: 'Cleveland Browns', abbr: 'CLE' } }] },
    });
    const res = history.check(c);
    expect(res.find((r) => r.id === 'history.champion-refs-valid').status).toBe('pass');
  });

  it('resolves a legacy archive that only has a champion OBJECT (no championTeamId)', () => {
    const c = ctx({
      phase: 'afterSeasonRollover', season: 1,
      view: { leagueHistory: [{ id: 's1', year: 2026, champion: { id: 6, abbr: 'CLE' } }] },
    });
    const res = history.check(c);
    expect(res.find((r) => r.id === 'history.champion-refs-valid').status).toBe('pass');
  });

  it('accepts team 0 as champion', () => {
    const c = ctx({
      phase: 'afterSeasonRollover', season: 1,
      view: { leagueHistory: [{ id: 's1', year: 2026, championTeamId: 0, champion: { id: 0, abbr: 'ARI' } }] },
    });
    const res = history.check(c);
    expect(res.find((r) => r.id === 'history.champion-refs-valid').status).toBe('pass');
  });

  it('fails when a champion reference resolves to an unknown team', () => {
    const c = ctx({
      phase: 'afterSeasonRollover', season: 1,
      view: { leagueHistory: [{ id: 's1', year: 2026, championTeamId: 77 }] },
    });
    const res = history.check(c);
    const f = res.find((r) => r.id === 'history.champion-refs-valid');
    expect(f.status).toBe('fail');
    expect(f.details.sample[0].candidateNormalizedId).toBe('77');
  });
});

describe('save/reload roster fingerprint — mixed numeric/string ids', () => {
  const mkTeam = (id, ids) => ({ id, capUsed: 10, roster: ids.map((pid) => ({ id: pid })) });

  it('produces an identical fingerprint for identical membership in a different order', () => {
    const before = canonicalSummary({ season: 2, view: { teams: [mkTeam(0, [1, 2, 'rookie-s2-1', 'rookie-s2-10', '1003'])] } });
    const after = canonicalSummary({ season: 2, view: { teams: [mkTeam(0, ['1003', 'rookie-s2-10', 2, 'rookie-s2-1', 1])] } });
    expect(before.rosterFingerprint).toBe(after.rosterFingerprint);
    expect(compareCanonical(before, after).ok).toBe(true);
  });

  it('never yields NaN ordering and is stable across number/string alias', () => {
    const before = canonicalSummary({ season: 2, view: { teams: [mkTeam(0, [1, 2, 3])] } });
    const after = canonicalSummary({ season: 2, view: { teams: [mkTeam(0, ['1', '2', '3'])] } });
    expect(before.rosterFingerprint).toBe(after.rosterFingerprint);
  });

  it('still FAILS on a genuine membership difference (missing player)', () => {
    const before = canonicalSummary({ season: 2, view: { teams: [mkTeam(0, [1, 2, 'rookie-s2-1'])] } });
    const after = canonicalSummary({ season: 2, view: { teams: [mkTeam(0, [1, 2])] } });
    const cmp = compareCanonical(before, after);
    expect(cmp.ok).toBe(false);
    const m = cmp.mismatches.find((x) => x.field === 'rosterFingerprint');
    expect(m.diagnostic.classification).toBe('semantic');
  });

  it('still FAILS on a duplicate (does not silently dedupe)', () => {
    const before = canonicalSummary({ season: 2, view: { teams: [mkTeam(0, [1, 2, 3])] } });
    const after = canonicalSummary({ season: 2, view: { teams: [mkTeam(0, [1, 2, 2])] } });
    const cmp = compareCanonical(before, after);
    expect(cmp.ok).toBe(false);
  });

  it('classifies an ordering-only difference distinctly from a semantic one', () => {
    const orderingOnly = classifyRosterFingerprintDiff('0:rookie-b,rookie-a', '0:rookie-a,rookie-b');
    expect(orderingOnly.classification).toBe('ordering-only');
    const semantic = classifyRosterFingerprintDiff('0:1,2,3', '0:1,2,4');
    expect(semantic.classification).toBe('semantic');
  });
});
