import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseDynastySoakArgv,
  resolveDynastySoakConfig,
  buildMarkdownReport,
  slimDynastySoakResultForJson,
  writeDynastySoakReports,
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
    expect(raw.auditProfile).toBe('ci');
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
    expect(resolved.auditProfile).toBe('ci');
    expect(resolved.phasePath).toBe('short');
    expect(resolved.ci).toBe(true);
    expect(resolved.phaseTimeoutMs).toBe(3_600_000);
    expect(resolved.maxRuntimeMs).toBeNull();
  });

  it('resolves explicit audit profiles', () => {
    const ciParsed = parseDynastySoakArgv(['node', 'x.mjs', '--audit-profile=ci', '--seasons=9']);
    const ciResolved = resolveDynastySoakConfig(ciParsed.raw).resolved;
    expect(ciResolved.auditProfile).toBe('ci');
    expect(ciResolved.seasons).toBe(1);
    expect(ciResolved.requestedSeasons).toBe(9);

    const fullParsed = parseDynastySoakArgv(['node', 'x.mjs', '--audit-profile=full', '--seasons=1']);
    const fullResolved = resolveDynastySoakConfig(fullParsed.raw).resolved;
    expect(fullResolved.auditProfile).toBe('full');
    expect(fullResolved.phasePath).toBe('full-season');
    expect(fullResolved.seasons).toBe(1);
  });

  it('rejects invalid audit profiles', () => {
    const { raw } = parseDynastySoakArgv(['node', 'x.mjs', '--audit-profile=turbo']);
    const { errors, resolved } = resolveDynastySoakConfig(raw);
    expect(resolved).toBeNull();
    expect(errors.some((e) => e.includes('audit profile'))).toBe(true);
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
      auditProfile: 'ci',
      phasePath: 'short',
      profileNotes: ['CI profile runs a short real-worker phase path and does not complete a season.'],
      harnessConfig: { ci: true, auditProfile: 'ci', phasePath: 'short', deep: true, deepEachSeason: false },
      auditCheckpoint: {
        ok: true,
        auditOnly: true,
        archiveType: 'audit_checkpoint',
        completedSeason: false,
        sourcePhase: 'regular',
        sourceYear: 2026,
        sourceSeasonId: 's2026',
        realWeeksSimulated: 2,
        exercised: { dbAuditCheckpointWriteRead: { status: 'exercised', detail: 'read back from DB' } },
        skipped: [{ system: 'completedSeasonArchive', reason: 'archiveSeason is not called by checkpoint' }],
      },
      exerciseMatrix: {
        realWorkerBoot: { status: 'exercised' },
        regularWeeks: { status: 'exercised', count: 2 },
        playoffs: { status: 'skipped', reason: 'CI profile does not complete a full season' },
        draft: { status: 'skipped', reason: 'CI profile does not enter draft' },
      },
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
    expect(md).toContain('profile=ci');
    expect(md).toContain('Audit profile');
    expect(md).toContain('What was exercised');
    expect(md).toContain('What was skipped');
    expect(md).toContain('Short real-worker smoke audit');
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


  it('writes canonical JSON and Markdown artifacts for a realistic CI profile result', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'dynasty-soak-cli-'));
    const result = {
      seed: 1383,
      seasonsSimmed: 0,
      runtimeMs: 18_776,
      passed: true,
      severity: 'warn',
      summary: { rosterHealth: 'ok', archiveHealth: 'warn' },
      failures: [],
      warnings: [{ code: 'hof_empty_young', message: '[CI] Hall of Fame classes empty in early league years' }],
      finalPhase: 'regular',
      finalYear: 2026,
      auditProfile: 'ci',
      phasePath: 'short',
      profileNotes: [
        'CI profile runs a short real-worker phase path and does not complete a season.',
        'Use --audit-profile=full --seasons=1 for the full manual season audit.',
      ],
      harnessConfig: {
        ci: true,
        auditProfile: 'ci',
        phasePath: 'short',
        deep: false,
        deepEachSeason: false,
        phaseTimeoutMs: 3_600_000,
        maxRuntimeMs: null,
      },
      auditCheckpoint: {
        ok: true,
        auditOnly: true,
        archiveType: 'audit_checkpoint',
        completedSeason: false,
        sourcePhase: 'regular',
        sourceYear: 2026,
        sourceSeasonId: 's2026',
        realWeeksSimulated: 2,
        exercised: {
          dbAuditCheckpointWriteRead: { status: 'exercised', detail: 'read back from DB' },
          getRecordsHandler: { status: 'exercised', detail: 'GET_RECORDS handler returned record data' },
          getHallOfFameHandler: { status: 'exercised', detail: 'GET_HALL_OF_FAME handler returned a valid player list' },
        },
        skipped: [{ system: 'completedSeasonArchive', reason: 'archiveSeason is not called by checkpoint' }],
      },
      exerciseMatrix: {
        realWorkerBoot: { status: 'exercised' },
        safeStarterLeague: { status: 'exercised' },
        regularWeeks: { status: 'exercised', count: 2 },
        auditCheckpoint: { status: 'exercised_partial', archiveType: 'audit_checkpoint', completedSeason: false, realWeeksSimulated: 2 },
        workerProbes: {
          status: 'exercised_partial',
          detail: 'GET_ALL_SEASONS, GET_TRANSACTIONS recent, GET_RECORDS, GET_HALL_OF_FAME',
        },
        fullRegularSeason: {
          status: 'skipped',
          reason: 'CI profile runs a short real-worker phase path and does not complete a full season',
        },
        playoffs: { status: 'skipped', reason: 'CI profile does not complete a full season' },
        offseason: { status: 'skipped', reason: 'CI profile does not complete a full season' },
        draft: { status: 'skipped', reason: 'CI profile does not enter draft' },
        fullSeasonArchive: { status: 'skipped', reason: 'CI profile does not create a completed-season archive' },
      },
      timings: {
        phaseBreakdown: { boot: { ms: 365, count: 2 }, getProbes: { ms: 131, count: 4 } },
        topSlowCheckpoints: [{ name: 'ci.ADVANCE_WEEK.regular_2', ms: 11_471, meta: { weekBefore: 0 } }],
      },
      reportSummary: { teamCount: 32, teamsWithoutQb: 0, archetypeDistribution: { contender: 6 } },
      persistenceAssertions: [
        { id: 'latest_season_archive', ok: true, status: 'skipped', detail: 'skipped: CI profile does not complete a season or create a completed-season archive' },
        { id: 'get_all_seasons_probe', ok: true, detail: 'GET_ALL_SEASONS ok' },
        { id: 'audit_checkpoint_exercised_systems', ok: true, detail: 'exercised: dbAuditCheckpointWriteRead, getRecordsHandler, getHallOfFameHandler' },
        { id: 'audit_checkpoint_probe_getRecordsHandler', ok: true, detail: 'getRecordsHandler: GET_RECORDS handler returned record data' },
        { id: 'get_draft_classes', ok: true, status: 'skipped', detail: 'skipped: CI profile does not enter draft, so draft classes are not expected' },
      ],
      finalView: { veryLarge: true },
    };

    try {
      const written = await writeDynastySoakReports(result, 'reports', tmp);
      const json = JSON.parse(await readFile(written.jsonPath, 'utf8'));
      const md = await readFile(written.markdownPath, 'utf8');

      expect(written.outDir).toBe(join(tmp, 'reports'));
      expect(json.finalView).toBeUndefined();
      expect(json.auditProfile).toBe('ci');
      expect(json.phasePath).toBe('short');
      expect(json.seed).toBe(1383);
      expect(json.runtimeMs).toBe(18_776);
      expect(json.finalPhase).toBe('regular');
      expect(json.finalYear).toBe(2026);
      expect(json.exerciseMatrix.workerProbes.status).toBe('exercised_partial');
      expect(json.auditCheckpoint).toMatchObject({ auditOnly: true, completedSeason: false, archiveType: 'audit_checkpoint' });
      expect(json.exerciseMatrix.fullSeasonArchive.status).toBe('skipped');
      expect(json.persistenceAssertions.some((a) => a.status === 'skipped')).toBe(true);
      expect(json.failures).toEqual([]);
      expect(json.warnings).toHaveLength(1);

      expect(md).toContain('**Profile:** ci');
      expect(md).toContain('**Phase path:** short');
      expect(md).toContain('Short real-worker smoke audit. It does not complete a season.');
      expect(md).toContain('Full-season balance, playoffs, offseason, free agency, draft, and completed-season archive are not validated by CI profile.');
      expect(md).toContain('GET_ALL_SEASONS, GET_TRANSACTIONS recent, GET_RECORDS, GET_HALL_OF_FAME');
      expect(md).toContain('GET_RECORDS');
      expect(md).toContain('GET_HALL_OF_FAME');
      expect(md).not.toContain('getRecordsHandler');
      expect(md).not.toContain('getHallOfFameHandler');
      expect(md).toContain('## Audit checkpoint');
      expect(md).toContain('**Audit only:** true');
      expect(md).toContain('**Completed season:** false');
      expect(md).toContain('not full-season balance validation');
      expect(md).toContain('dbAuditCheckpointWriteRead');
      expect(md).toContain('| completedSeasonArchive | archiveSeason is not called by checkpoint |');
      expect(md).toContain('| fullSeasonArchive | CI profile does not create a completed-season archive |');
      expect(md).toContain('**skipped** `latest_season_archive`');
      expect(md).toContain('## Warnings');
      expect(md).toContain('hof_empty_young');
      expect(md).toContain('## Failures');
      expect(md).toContain('npm run audit:dynasty -- --audit-profile=full --seasons=1 --seed=1383');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('slimDynastySoakResultForJson removes finalView', () => {
    const slim = slimDynastySoakResultForJson({ a: 1, finalView: { big: true } });
    expect(slim.finalView).toBeUndefined();
    expect(slim.a).toBe(1);
  });

  it('parses comma-separated seeds and resolves multi-seed-ci defaults', () => {
    const parsed = parseDynastySoakArgv(['node', 'x.mjs', '--audit-profile=multi-seed-ci', '--seeds=1383,1408,1426']);
    expect(parsed.errors).toEqual([]);
    expect(parsed.raw.seeds).toEqual([1383, 1408, 1426]);

    const { errors, resolved } = resolveDynastySoakConfig(parsed.raw);
    expect(errors).toEqual([]);
    expect(resolved.isMultiSeed).toBe(true);
    expect(resolved.runnerProfile).toBe('ci');
    expect(resolved.seasons).toBe(1);
    expect(resolved.seeds).toEqual([1383, 1408, 1426]);
  });

  it('uses default multi-seed-ci seeds when --seeds is omitted', () => {
    const { raw } = parseDynastySoakArgv(['node', 'x.mjs', '--audit-profile=multi-seed-ci']);
    const { resolved } = resolveDynastySoakConfig(raw);
    expect(resolved.seeds).toEqual([1383, 1408, 1426]);
    expect(resolved.ci).toBe(true);
  });

  it('keeps long-ci optional/manual and does not trigger it by default', () => {
    const defaultResolved = resolveDynastySoakConfig(parseDynastySoakArgv(['node', 'x.mjs']).raw).resolved;
    expect(defaultResolved.auditProfile).toBe('full');
    expect(defaultResolved.isLongProfile).toBe(false);

    const longResolved = resolveDynastySoakConfig(parseDynastySoakArgv(['node', 'x.mjs', '--audit-profile=long-ci']).raw).resolved;
    expect(longResolved.auditProfile).toBe('long-ci');
    expect(longResolved.runnerProfile).toBe('full');
    expect(longResolved.isLongProfile).toBe(true);
    expect(longResolved.seasons).toBe(3);
  });



  it('resolves stability-v1 as manual multi-seed completed-season profile', () => {
    const parsed = parseDynastySoakArgv([
      'node',
      'x.mjs',
      '--audit-profile=stability-v1',
      '--seasons=7',
      '--seeds=1,2,2,3',
      '--fail-on-warnings',
      '--max-runtime-ms=90000',
      '--deep',
      '--deep-each-season',
    ]);
    expect(parsed.errors).toEqual([]);

    const { errors, resolved } = resolveDynastySoakConfig(parsed.raw);
    expect(errors).toEqual([]);
    expect(resolved.auditProfile).toBe('stability-v1');
    expect(resolved.runnerProfile).toBe('full');
    expect(resolved.phasePath).toBe('full-season');
    expect(resolved.isMultiSeed).toBe(true);
    expect(resolved.isStabilityV1).toBe(true);
    expect(resolved.seasons).toBe(7);
    expect(resolved.seeds).toEqual([1, 2, 3]);
    expect(resolved.failOnWarnings).toBe(true);
    expect(resolved.maxRuntimeMs).toBe(90000);
    expect(resolved.deep).toBe(true);
    expect(resolved.deepEachSeason).toBe(true);
  });

  it('keeps default CI behavior short and does not accidentally select stability-v1', () => {
    const defaultResolved = resolveDynastySoakConfig(parseDynastySoakArgv(['node', 'x.mjs', '--ci']).raw).resolved;
    expect(defaultResolved.auditProfile).toBe('ci');
    expect(defaultResolved.runnerProfile).toBe('ci');
    expect(defaultResolved.seasons).toBe(1);
    expect(defaultResolved.seeds).toEqual([1383]);
    expect(defaultResolved.isStabilityV1).toBe(false);
  });

  it('uses stability-v1 manual defaults of five seasons and three deterministic seeds', () => {
    const { raw } = parseDynastySoakArgv(['node', 'x.mjs', '--audit-profile=stability-v1']);
    const { resolved } = resolveDynastySoakConfig(raw);
    expect(resolved.seasons).toBe(5);
    expect(resolved.seeds).toEqual([1383, 1408, 1426]);
    expect(resolved.ci).toBe(false);
  });

  it('buildMarkdownReport includes multi-seed summary and grouped warnings', () => {
    const md = buildMarkdownReport({
      multiSeed: true,
      auditProfile: 'multi-seed-ci',
      runnerProfile: 'ci',
      seeds: [1383, 1408],
      seedCount: 2,
      passCount: 1,
      failCount: 1,
      warningSeedCount: 1,
      runtimeTotalMs: 1234,
      passed: false,
      severity: 'error',
      failOnWarnings: false,
      profileNotes: ['multi seed note'],
      seedSummaries: [
        { seed: 1383, passed: true, severity: 'warn', runtimeMs: 100, seasonsSimmed: 0, finalPhase: 'regular', finalYear: 2026, failureCount: 0, warningCount: 1, warningsByCode: { hof_empty_young: 1 }, persistenceAssertionFailures: [] },
        { seed: 1408, passed: false, severity: 'error', runtimeMs: 200, seasonsSimmed: 0, finalPhase: 'regular', finalYear: 2026, failureCount: 1, warningCount: 0, firstFailure: { code: 'runner_fatal', message: 'boom' }, persistenceAssertionFailures: [] },
      ],
      warningsBySeed: [{ seed: 1383, warningsByCode: { hof_empty_young: 1 }, warnings: [{ code: 'hof_empty_young', message: 'young league' }] }],
      failuresBySeed: [{ seed: 1408, failures: [{ code: 'runner_fatal', message: 'boom' }] }],
      economyAggregate: { snapshotsPresent: 1, totals: { teamsOverCap: 0, cpuOfferCount: 2 }, skippedReasonsBySeed: [{ seed: 1408, code: 'economy_snapshot_missing', reason: 'No economyRegressionSnapshot was produced for this seed.' }] },
      persistenceWarningsBySeed: [],
    });
    expect(md).toContain('Dynasty multi-seed soak report');
    expect(md).toContain('Pass / fail');
    expect(md).toContain('Seed 1383');
    expect(md).toContain('runner_fatal');
    expect(md).toContain('Economy warning aggregate');
    expect(md).toContain('Persistence/reload summary');
    expect(md).toContain('What this proves');
    expect(md).toContain('What this does not prove yet');
    expect(md).toContain('Suggested next audit depth command');
    expect(md).toContain('economy_snapshot_missing');
  });

});
