import { describe, expect, it } from 'vitest';
import {
  parseDynastySoakArgv,
  resolveDynastySoakConfig,
  buildMarkdownReport,
  slimDynastySoakResultForJson,
} from '../../src/testSupport/dynastySoakCli.js';

describe('dynastySoakCli', () => {
  it('parses --ci, --seasons, --seed, --deep, --deep-each-season', () => {
    const { raw, errors } = parseDynastySoakArgv([
      'node',
      'dynasty-soak.mjs',
      '--ci',
      '--seasons=2',
      '--seed=99',
      '--deep',
      '--deep-each-season',
    ]);
    expect(errors).toEqual([]);
    expect(raw.ci).toBe(true);
    expect(raw.seasons).toBe(2);
    expect(raw.seed).toBe(99);
    expect(raw.deep).toBe(true);
    expect(raw.deepEachSeason).toBe(true);
  });

  it('resolves --deep into an explicit runner config field without enabling deep-each-season', () => {
    const { raw, errors: parseErrors } = parseDynastySoakArgv(['node', 'x.mjs', '--deep']);
    expect(parseErrors).toEqual([]);
    expect(raw.deep).toBe(true);

    const { errors, resolved } = resolveDynastySoakConfig(raw);
    expect(errors).toEqual([]);
    expect(resolved.deep).toBe(true);
    expect(resolved.deepEachSeason).toBe(false);
  });

  it('resolves --deep-each-season into an explicit runner config field', () => {
    const { raw, errors: parseErrors } = parseDynastySoakArgv(['node', 'x.mjs', '--deep-each-season']);
    expect(parseErrors).toEqual([]);
    expect(raw.deepEachSeason).toBe(true);

    const { errors, resolved } = resolveDynastySoakConfig(raw);
    expect(errors).toEqual([]);
    expect(resolved.deepEachSeason).toBe(true);
  });

  it('rejects unknown flags', () => {
    const { errors } = parseDynastySoakArgv(['node', 'x.mjs', '--nope']);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid numeric args in equals form', () => {
    for (const flag of ['--seasons', '--seed', '--phase-timeout-ms', '--max-runtime-ms', '--teams']) {
      for (const value of ['', 'NaN', 'Infinity', 'abc']) {
        const { errors } = parseDynastySoakArgv(['node', 'x.mjs', `${flag}=${value}`]);
        expect(errors.length, `${flag}=${value}`).toBeGreaterThan(0);
      }
    }
  });

  it('rejects invalid numeric args in space-separated form', () => {
    for (const flag of ['--seasons', '--seed', '--phase-timeout-ms', '--max-runtime-ms', '--teams']) {
      for (const value of ['', 'NaN', 'Infinity', 'abc']) {
        const { errors } = parseDynastySoakArgv(['node', 'x.mjs', flag, value]);
        expect(errors.length, `${flag} ${value}`).toBeGreaterThan(0);
      }
    }
  });

  it('resolves CI defaults and phase timeout', () => {
    const { raw } = parseDynastySoakArgv(['node', 'x.mjs', '--ci']);
    const { errors, resolved } = resolveDynastySoakConfig(raw);
    expect(errors).toEqual([]);
    expect(resolved.seasons).toBe(1);
    expect(resolved.ci).toBe(true);
    expect(resolved.phaseTimeoutMs).toBe(3_600_000);
    expect(resolved.maxRuntimeMs).toBeNull();
  });

  it('defaults to 5 seasons when not CI', () => {
    const { raw } = parseDynastySoakArgv(['node', 'x.mjs']);
    const { resolved } = resolveDynastySoakConfig(raw);
    expect(resolved.seasons).toBe(5);
    expect(resolved.seed).toBe(1383);
  });

  it('rejects --teams other than 32', () => {
    const { raw } = parseDynastySoakArgv(['node', 'x.mjs', '--teams=8']);
    const { errors, resolved } = resolveDynastySoakConfig(raw);
    expect(resolved).toBeNull();
    expect(errors.some((e) => e.includes('32'))).toBe(true);
  });

  it('buildMarkdownReport includes timing and AI snapshot sections', () => {
    const md = buildMarkdownReport({
      seed: 1,
      seasonsSimmed: 1,
      runtimeMs: 100,
      passed: true,
      severity: 'ok',
      summary: { rosterHealth: 'ok' },
      failures: [],
      warnings: [],
      finalPhase: 'preseason',
      finalYear: 2027,
      harnessConfig: { ci: true, deep: true, deepEachSeason: false },
      timings: {
        phaseBreakdown: {
          boot: { ms: 5, count: 1 },
          sim: { ms: 80, count: 1 },
          getProbes: { ms: 12, count: 2 },
          auditEvaluation: { ms: 3, count: 1 },
          finalAdvance: { ms: 7, count: 1 },
        },
        topSlowCheckpoints: [
          {
            name: 'S1.SIM_TO_PHASE',
            ms: 80,
            meta: {
              iterationsUsed: 42,
              reachedTarget: true,
              hitIterationCap: false,
              lastPhase: 'preseason',
              targetPhase: 'preseason',
            },
          },
          { name: 'boot.INIT', ms: 5 },
        ],
      },
      reportSummary: {
        teamCount: 32,
        teamsWithoutQb: 0,
        archetypeDistribution: { contender: 10 },
        transactionCountsByType: { DRAFT: 32 },
        draftClassCount: 1,
      },
      persistenceAssertions: [{ id: 'latest_season_archive', ok: true, detail: 'ok' }],
    });
    expect(md).toContain('- **Harness:** ci=true deep=true deepEachSeason=false');
    expect(md).toContain('Phase timing breakdown');
    expect(md).toContain('GET probes');
    expect(md).toContain('| Simulation | 80 | 1 |');
    expect(md).toContain('Slowest checkpoints');
    expect(md).toContain('S1.SIM_TO_PHASE');
    expect(md).toContain('iterationsUsed');
    expect(md).toContain('hitIterationCap');
    expect(md).toContain('AI / roster snapshot');
    expect(md).toContain('contender');
    expect(md).toContain('Persistence probes');
  });

  it('slimDynastySoakResultForJson removes finalView', () => {
    const slim = slimDynastySoakResultForJson({ a: 1, finalView: { big: true } });
    expect(slim.finalView).toBeUndefined();
    expect(slim.a).toBe(1);
  });
});
