import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as generator from '../../src/core/league.js';
import { makeLeague } from '../../src/core/league.js';
import { validateNflSchedule } from '../../src/core/nflSchedule.js';
import { makeAccurateSchedule } from '../../src/core/schedule.js';
import { DEFAULT_TEAMS } from '../../src/data/default-teams.js';
import { autoBuildDepthChart, applyDepthChartToPlayers, DEPTH_CHART_ROWS } from '../../src/core/depthChart.js';
import { Constants } from '../../src/core/constants.js';
import { Utils } from '../../src/core/utils.js';
import { getPlayableLeagueValidation } from '../../src/state/leagueInit.ts';
import { loadWorkerModule, dispatchWorker } from '../../src/testSupport/dynastySoakRunner.js';
import { DraftPicks } from '../../src/db/index.js';
import { cache } from '../../src/db/cache.js';
import { toWorker, toUI } from '../../src/worker/protocol.js';

const copy = value => JSON.parse(JSON.stringify(value));
const distribution = (players, key) => players.reduce((counts, p) => ({ ...counts, [p[key]]: (counts[p[key]] ?? 0) + 1 }), {});

describe('production normal generation boundary', () => {
  for (const year of [2025, 2026, 2031]) it(`accepts the real ${year} generator without recovery`, () => {
    Utils.setSeed(1806 + year);
    const league = makeLeague(DEFAULT_TEAMS, { year, rngSeed: 1806 + year }, { makeSchedule: makeAccurateSchedule });
    const validation = getPlayableLeagueValidation(league);
    const players = league.teams.flatMap(t => t.roster);
    console.log('NORMAL GENERATION', JSON.stringify({ year, season: league.season, week: league.week, phase: league.phase, validation, roster: league.teams[0].roster.length, positions: distribution(league.teams[0].roster, 'pos'), lengths: distribution(players, 'years'), salary: { distinct: new Set(players.map(p => p.baseAnnual)).size, min: Math.min(...players.map(p => p.baseAnnual)), max: Math.max(...players.map(p => p.baseAnnual)) }, unsigned: players.filter(p => p.teamId == null).length, weeks: league.schedule.weeks.length, picks: league.teams.flatMap(t => t.picks).length }));
    const roster = league.teams[0].roster;
    const chart = autoBuildDepthChart(roster);
    const assigned = applyDepthChartToPlayers(roster, chart);
    for (const row of DEPTH_CHART_ROWS) {
      expect(chart[row.key].length).toBeGreaterThanOrEqual(row.min);
      for (const id of chart[row.key]) {
        expect(roster.some(p => p.id === id)).toBe(true);
        expect(assigned.find(p => p.id === id).depthChart.rowKey).toBe(row.key);
      }
    }
    expect(validation.reasons).toEqual([]);
    expect(validateNflSchedule(league.schedule, league.teams)).toEqual({ valid: true, errors: [] });
    expect(league).toMatchObject({ year, season: 1, week: 1, phase: 'regular', offseason: false });
    expect(new Set(players.map(p => p.id)).size).toBe(players.length);
    expect(new Set(league.teams.map(t => t.id)).size).toBe(32);
    for (const team of league.teams) {
      expect(distribution(team.roster, 'pos')).toEqual(Constants.DEPTH_NEEDS);
      expect(team.roster.every(p => p.teamId === team.id)).toBe(true);
      expect(team.picks).toHaveLength(21);
      for (const season of [year, year + 1, year + 2]) expect(team.picks.filter(p => p.season === season && p.currentOwner === team.id && p.originalOwner === team.id)).toHaveLength(7);
    }
    expect(Object.keys(distribution(players, 'years')).length).toBeGreaterThan(1);
    expect(Object.keys(distribution(players, 'baseAnnual')).length).toBeGreaterThan(10);
    for (const p of players) {
      expect(String(p.name).trim().length).toBeGreaterThan(0);
      expect(p.contract).toMatchObject({ baseAnnual: p.baseAnnual, years: p.years, yearsTotal: p.yearsTotal, signingBonus: p.signingBonus });
      expect(p.contract.guaranteedPct).toBeGreaterThanOrEqual(0);
      expect(p.contract.guaranteedPct).toBeLessThanOrEqual(1);
      expect(p.years).toBeGreaterThan(0);
      expect(p.yearsTotal).toBeGreaterThanOrEqual(p.years);
      expect(Number.isFinite(p.baseAnnual) && p.baseAnnual > 0).toBe(true);
      expect(Number.isFinite(p.signingBonus) && p.signingBonus >= 0).toBe(true);
    }
    for (const week of league.schedule.weeks) for (const game of week.games) expect(game.gameId ?? game.id).toMatch(/^s1_w\d+_\d+_\d+$/);
  });
  it('declares the existing offseason start point at its source', () => {
    const league = makeLeague(DEFAULT_TEAMS, { startPoint: 'offseason' }, { makeSchedule: makeAccurateSchedule });
    expect(league).toMatchObject({ phase: 'offseason', offseason: true, week: 1 });
  });
});

describe.sequential('normal generation worker persistence', () => {
  beforeAll(async () => { await loadWorkerModule(); await dispatchWorker(toWorker.INIT); });
  const generationIds = new Set();
  for (const year of [2025, 2026, 2031]) it(`persists ${year} normal players and identity across reload`, async () => {
    const boot = await dispatchWorker(toWorker.NEW_LEAGUE, { teams: DEFAULT_TEAMS, options: { year, userTeamId: 21, name: `Normal ${year}`, difficulty: 'Hard', salaryCap: 301.2, injuryFrequency: 'high', tradeRealism: 'strict', rngSeed: 1806 + year, settings: { draftRounds: 7, scoutingFogStrength: 63, playerMoodVolatility: 58 } } });
    expect(boot.type).toBe(toUI.FULL_STATE);
    expect(boot.payload).toMatchObject({ year, phase: 'regular', week: 1, userTeamId: 21 });
    expect(cache.getMeta()).toMatchObject({ name: `Normal ${year}`, difficulty: 'Hard', generationDiagnostics: { source: 'normal', validationReasons: [] } });
    expect(cache.getMeta().settings).toMatchObject({ scoutingFogStrength: 63, playerMoodVolatility: 58, injuryFrequency: 75, tradeDifficulty: 75, salaryCap: 301.2 });
    expect(cache.getTeam(21).name).toBe(DEFAULT_TEAMS.find(t => t.id === 21).name);
    expect(generationIds.has(cache.getMeta().franchiseGenerationId)).toBe(false);
    generationIds.add(cache.getMeta().franchiseGenerationId);
    const before = copy({ players: cache.getAllPlayers(), picks: cache.getAllDraftPicks(), generation: cache.getMeta().franchiseGenerationId });
    expect(new Set(before.players.map(p => p.years)).size).toBeGreaterThan(1);
    expect(before.picks).toHaveLength(672);
    await dispatchWorker(toWorker.SAVE_NOW);
    await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
    expect(await DraftPicks.loadAll()).toEqual(expect.arrayContaining(before.picks));
    for (const team of cache.getAllTeams()) expect(team.picks).toEqual(expect.arrayContaining(before.picks.filter(p => p.currentOwner === team.id)));
    expect(cache.getMeta().franchiseGenerationId).toBe(before.generation);
    for (const p of before.players) expect(cache.getPlayer(p.id)).toMatchObject({ id: p.id, contract: p.contract, ratings: p.ratings, years: p.years, baseAnnual: p.baseAnnual });
    const week = await dispatchWorker(toWorker.ADVANCE_WEEK, { skipUserGame: true }, { timeoutMs: 120000 });
    expect([toUI.WEEK_COMPLETE, toUI.FULL_STATE]).toContain(week.type);
    expect(cache.getMeta().currentWeek).toBe(2);
    await dispatchWorker(toWorker.SAVE_NOW);
    await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
    expect(cache.getMeta()).toMatchObject({ currentWeek: 2, franchiseGenerationId: before.generation });
  }, 180000);
});

describe.sequential('emergency recovery and existing career preservation', () => {
  it('recovers a real generator payload rejected for missing phase, and preserves that career', async () => {
    await loadWorkerModule();
    const realGenerator = generator.makeLeague;
    const spy = vi.spyOn(generator, 'makeLeague').mockImplementationOnce((...args) => {
      const league = realGenerator(...args);
      delete league.phase;
      return league;
    });
    let boot;
    try {
      boot = await dispatchWorker(toWorker.NEW_LEAGUE, { teams: DEFAULT_TEAMS, options: { year: 2026, userTeamId: 3, rngSeed: 1806, salaryCap: 301.2 } });
    } finally { spy.mockRestore(); }
    expect(boot.type).toBe(toUI.FULL_STATE);
    expect(cache.getMeta().generationDiagnostics).toEqual({ source: 'fallback', validationReasons: ['Missing phase'] });
    expect(new Set(cache.getAllPlayers().map(p => p.years))).toEqual(new Set([2]));
    // Establish the existing load-time normalization baseline, then verify no
    // creation action rewrites this older fallback career.
    await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
    cache.setMeta({ currentWeek: 6, records: { preservationMarker: 1806 } });
    await dispatchWorker(toWorker.SAVE_NOW);
    const prior = copy({ players: cache.getAllPlayers(), picks: await DraftPicks.loadAll(), meta: cache.getMeta() });
    await expect(dispatchWorker(toWorker.NEW_LEAGUE, { teams: null })).rejects.toThrow();
    expect(cache.getMeta().franchiseGenerationId).toBe(prior.meta.franchiseGenerationId);
    const next = await dispatchWorker(toWorker.NEW_LEAGUE, { teams: DEFAULT_TEAMS, options: { year: 2031, userTeamId: 21, salaryCap: 301.2 } });
    expect(next.type).toBe(toUI.FULL_STATE);
    expect(next.payload.activeLeagueId).not.toBe(boot.payload.activeLeagueId);
    const nextGeneration = cache.getMeta().franchiseGenerationId;
    await dispatchWorker(toWorker.SAVE_NOW);
    await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
    expect(cache.getMeta()).toMatchObject({ currentWeek: 6, records: prior.meta.records, franchiseGenerationId: prior.meta.franchiseGenerationId });
    expect(await DraftPicks.loadAll()).toEqual(expect.arrayContaining(prior.picks));
    for (const p of prior.players) expect(cache.getPlayer(p.id)).toMatchObject({ id: p.id, ratings: p.ratings, contract: p.contract });
    await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: next.payload.activeLeagueId });
    expect(cache.getMeta()).toMatchObject({ year: 2031, franchiseGenerationId: nextGeneration, generationDiagnostics: { source: 'normal' } });
  }, 180000);
});
