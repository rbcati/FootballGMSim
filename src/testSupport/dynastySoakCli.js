/**
 * Dynasty soak CLI argument parsing and report helpers (no fake-indexeddb).
 * Used by scripts/dynasty-soak.mjs and Vitest.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const DYNASTY_SOAK_USAGE = `Usage: npm run audit:dynasty -- [options]

Options:
  --ci                    Alias for --audit-profile=ci (fast real-worker smoke audit)
  --audit-profile=ci|full|multi-seed-ci|long-ci|stability
                          Profile to run: ci=short partial phase path, full=legacy manual audit, multi-seed-ci=3 short deterministic seeds, long-ci/stability=bounded 3-season manual audit
  --seasons=N             Number of seasons to simulate with --audit-profile=full/long-ci/stability (default: full=5, long-ci=3; CI uses a short path)
  --seed=N                RNG seed for single-seed profiles (default: 1383)
  --seeds=A,B,C           Comma-separated seeds for multi-seed profiles (default: 1383,1408,1426)
  --fail-on-warnings      Treat warnings as a failing audit exit for manual strict mode (default: false)
  --outDir=PATH           Report output directory (default: artifacts/dynasty-soak)
  --deep                  Full final-season probes plus larger transaction/draft/archive samples
  --deep-each-season      Full GET_* probes every season (slowest; matches legacy harness)
  --phase-timeout-ms=N    Timeout per SIM_TO_PHASE attempt and per GET_* (default: 60m)
  --max-runtime-ms=N      Hard cap on wall time between checkpoints (not mid-SIM_TO_PHASE); default unlimited
  --skip-report-open      Reserved no-op (reports are files only)
  --teams=N               Reserved; only 32 is supported (smaller leagues deferred — see report)
`;

function parseRequiredNumber(flag, value, errors) {
  const rawValue = value == null ? '' : String(value);
  if (rawValue.trim() === '') {
    errors.push(`${flag} requires a finite number`);
    return { ok: false, value: null };
  }

  const numberValue = Number(rawValue);
  if (!Number.isFinite(numberValue)) {
    errors.push(`${flag} requires a finite number`);
    return { ok: false, value: null };
  }

  return { ok: true, value: numberValue };
}

export const DEFAULT_MULTI_SEED_CI_SEEDS = [1383, 1408, 1426];

export function parseSeedList(value, errors = []) {
  const rawValue = value == null ? '' : String(value);
  const parts = rawValue.split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) {
    errors.push('--seeds requires at least one finite numeric seed');
    return [];
  }
  const seeds = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isFinite(n)) {
      errors.push(`--seeds contains a non-finite seed: ${part}`);
      continue;
    }
    seeds.push(n);
  }
  return [...new Set(seeds)];
}

/**
 * @param {string[]} argv - process.argv
 * @returns {{ raw: object, errors: string[] }}
 */
export function parseDynastySoakArgv(argv) {
  const raw = {
    ci: false,
    auditProfile: null,
    deep: false,
    deepEachSeason: false,
    seasons: null,
    seed: null,
    seeds: null,
    outDir: null,
    phaseTimeoutMs: null,
    maxRuntimeMs: null,
    skipReportOpen: false,
    teams: null,
    failOnWarnings: false,
    unknown: [],
  };
  const errors = [];
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--ci') {
      raw.ci = true;
      raw.auditProfile = 'ci';
    }
    else if (a.startsWith('--audit-profile=')) {
      raw.auditProfile = a.slice('--audit-profile='.length);
    }
    else if (a === '--audit-profile') {
      raw.auditProfile = argv[i + 1];
      i += 1;
    }
    else if (a === '--deep') raw.deep = true;
    else if (a === '--deep-each-season') raw.deepEachSeason = true;
    else if (a === '--skip-report-open') raw.skipReportOpen = true;
    else if (a === '--fail-on-warnings') raw.failOnWarnings = true;
    else if (a.startsWith('--seasons=')) {
      const parsed = parseRequiredNumber('--seasons', a.slice('--seasons='.length), errors);
      if (parsed.ok) raw.seasons = parsed.value;
    } else if (a.startsWith('--seed=')) {
      const parsed = parseRequiredNumber('--seed', a.slice('--seed='.length), errors);
      if (parsed.ok) raw.seed = parsed.value;
    } else if (a.startsWith('--seeds=')) {
      raw.seeds = parseSeedList(a.slice('--seeds='.length), errors);
    } else if (a.startsWith('--outDir=')) raw.outDir = a.split('=').slice(1).join('=');
    else if (a.startsWith('--phase-timeout-ms=')) {
      const parsed = parseRequiredNumber('--phase-timeout-ms', a.slice('--phase-timeout-ms='.length), errors);
      if (parsed.ok) raw.phaseTimeoutMs = parsed.value;
    } else if (a.startsWith('--max-runtime-ms=')) {
      const parsed = parseRequiredNumber('--max-runtime-ms', a.slice('--max-runtime-ms='.length), errors);
      if (parsed.ok) raw.maxRuntimeMs = parsed.value;
    } else if (a.startsWith('--teams=')) {
      const parsed = parseRequiredNumber('--teams', a.slice('--teams='.length), errors);
      if (parsed.ok) raw.teams = parsed.value;
    } else if (a === '--seasons') {
      const v = argv[i + 1];
      const parsed = parseRequiredNumber('--seasons', v, errors);
      if (parsed.ok) {
        raw.seasons = parsed.value;
        i += 1;
      }
    } else if (a === '--seed') {
      const v = argv[i + 1];
      const parsed = parseRequiredNumber('--seed', v, errors);
      if (parsed.ok) {
        raw.seed = parsed.value;
        i += 1;
      }
    } else if (a === '--seeds') {
      raw.seeds = parseSeedList(argv[i + 1], errors);
      i += 1;
    } else if (a === '--phase-timeout-ms') {
      const v = argv[i + 1];
      const parsed = parseRequiredNumber('--phase-timeout-ms', v, errors);
      if (parsed.ok) {
        raw.phaseTimeoutMs = parsed.value;
        i += 1;
      }
    } else if (a === '--max-runtime-ms') {
      const v = argv[i + 1];
      const parsed = parseRequiredNumber('--max-runtime-ms', v, errors);
      if (parsed.ok) {
        raw.maxRuntimeMs = parsed.value;
        i += 1;
      }
    } else if (a === '--teams') {
      const v = argv[i + 1];
      const parsed = parseRequiredNumber('--teams', v, errors);
      if (parsed.ok) {
        raw.teams = parsed.value;
        i += 1;
      }
    } else if (a.startsWith('-')) {
      raw.unknown.push(a);
      errors.push(`Unknown option: ${a}`);
    }
  }
  return { raw, errors };
}

/**
 * @param {ReturnType<typeof parseDynastySoakArgv>['raw']} raw
 * @returns {{ errors: string[], resolved: object | null }}
 */
export function resolveDynastySoakConfig(raw) {
  const errors = [];
  if (raw.unknown?.length) {
    /* already in parse errors */
  }
  const requestedProfile = raw.auditProfile ?? (raw.ci ? 'ci' : 'full');
  const auditProfile = String(requestedProfile || '').toLowerCase();
  const supportedProfiles = ['ci', 'full', 'multi-seed-ci', 'long-ci', 'stability'];
  if (!supportedProfiles.includes(auditProfile)) {
    errors.push(`Unknown audit profile: ${requestedProfile}. Expected one of: ${supportedProfiles.join(', ')}.`);
  }
  const isMultiSeed = auditProfile === 'multi-seed-ci';
  const isLongProfile = auditProfile === 'long-ci' || auditProfile === 'stability';
  const runnerProfile = isMultiSeed ? 'ci' : isLongProfile ? 'full' : auditProfile;
  const requestedSeasons =
    raw.seasons != null && Number.isFinite(Number(raw.seasons))
      ? Math.max(1, Math.min(50, Number(raw.seasons)))
      : null;
  const seasons = runnerProfile === 'ci'
    ? 1
    : requestedSeasons ?? (isLongProfile ? 3 : 5);
  const seed = raw.seed != null && Number.isFinite(Number(raw.seed)) ? Number(raw.seed) : 1383;
  const seeds = isMultiSeed ? (Array.isArray(raw.seeds) && raw.seeds.length ? raw.seeds : DEFAULT_MULTI_SEED_CI_SEEDS) : [seed];

  if (raw.teams != null && Number.isFinite(raw.teams) && Number(raw.teams) !== 32) {
    errors.push(
      `--teams=${raw.teams} is not supported. Playoff/schedule/conference logic assumes a 32-team league; smaller audit leagues are deferred.`,
    );
  }

  const phaseTimeoutMs =
    raw.phaseTimeoutMs != null && Number.isFinite(Number(raw.phaseTimeoutMs))
      ? Math.max(10_000, Number(raw.phaseTimeoutMs))
      : 3_600_000;

  const maxRuntimeMs =
    raw.maxRuntimeMs != null && Number.isFinite(Number(raw.maxRuntimeMs))
      ? Math.max(30_000, Number(raw.maxRuntimeMs))
      : null;

  const deep = !!raw.deep;
  const deepEachSeason = !!raw.deepEachSeason;

  if (errors.length) {
    return { errors, resolved: null };
  }

  return {
    errors: [],
    resolved: {
      seasons,
      seed,
      seeds,
      ci: runnerProfile === 'ci',
      auditProfile,
      runnerProfile,
      isMultiSeed,
      isLongProfile,
      phasePath: runnerProfile === 'ci' ? 'short' : 'full-season',
      requestedSeasons,
      effectiveSeasons: seasons,
      ciWeeks: runnerProfile === 'ci' ? 2 : null,
      profileNotes: isMultiSeed
        ? [
            'Multi-seed CI profile runs the existing short real-worker CI path once per deterministic seed.',
            'It intentionally does not complete seasons; use --audit-profile=long-ci for bounded completed-season coverage.',
          ]
        : runnerProfile === 'ci'
          ? [
              'CI profile runs a short real-worker phase path and does not complete a season.',
              'Use --audit-profile=full --seasons=1 for the full manual season audit.',
            ]
          : isLongProfile
            ? [
                'Long CI/stability profile is optional/manual and runs a bounded 3-season full-season audit by default.',
                'It is not part of the default push/parity profile because SIM_TO_PHASE can be slow.',
              ]
            : ['Full profile preserves the legacy full-season SIM_TO_PHASE audit and may be slow.'],
      deep,
      deepEachSeason,
      phaseTimeoutMs,
      maxRuntimeMs,
      simTimeoutMs: phaseTimeoutMs,
      outDir: raw.outDir || null,
      skipReportOpen: !!raw.skipReportOpen,
      failOnWarnings: !!raw.failOnWarnings,
      teams: 32,
      smallerLeagueNote:
        'Only 32-team safe starter leagues are enabled; parameterized default league counts require playoff seeding and conference balance work — deferred.',
    },
  };
}

export function mdEscape(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}


function formatPhaseBreakdownLabel(key) {
  const labels = {
    boot: 'Boot',
    sim: 'Simulation',
    getProbes: 'GET probes',
    auditEvaluation: 'Audit evaluation',
    finalAdvance: 'Final advance',
  };
  return labels[key] || key;
}

function formatCheckpointMeta(meta) {
  if (!meta || typeof meta !== 'object' || !Object.keys(meta).length) return '';
  return mdEscape(JSON.stringify(meta));
}

function formatCheckpointSystemLabel(name) {
  switch (String(name ?? '')) {
    case 'getAllSeasonsHandler':
      return 'GET_ALL_SEASONS';
    case 'getTransactionsRecentHandler':
      return 'GET_TRANSACTIONS recent';
    case 'getRecordsHandler':
      return 'GET_RECORDS';
    case 'getHallOfFameHandler':
      return 'GET_HALL_OF_FAME';
    default:
      return String(name ?? 'unknown');
  }
}

function formatProbeText(value) {
  return String(value ?? '')
    .replaceAll('getAllSeasonsHandler', 'GET_ALL_SEASONS')
    .replaceAll('getTransactionsRecentHandler', 'GET_TRANSACTIONS recent')
    .replaceAll('getRecordsHandler', 'GET_RECORDS')
    .replaceAll('getHallOfFameHandler', 'GET_HALL_OF_FAME');
}

function formatPersistenceProbeLabel(id) {
  const raw = String(id ?? 'unknown');
  if (raw.startsWith('audit_checkpoint_probe_')) {
    return `audit_checkpoint_probe_${formatProbeText(raw.slice('audit_checkpoint_probe_'.length))}`;
  }
  return formatProbeText(raw);
}

function exerciseStatusLabel(entry) {
  if (!entry || typeof entry !== 'object') return 'unknown';
  return String(entry.status ?? 'unknown');
}

function exerciseDetail(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const parts = [];
  if (entry.count != null) parts.push(`count=${entry.count}`);
  if (entry.reason) parts.push(`reason=${entry.reason}`);
  if (entry.detail) parts.push(String(entry.detail));
  return parts.join('; ');
}


export function buildMultiSeedMarkdownReport(result) {
  const lines = [];
  lines.push('# Dynasty multi-seed soak report');
  lines.push('');
  lines.push(`- **Profile:** ${mdEscape(result.auditProfile ?? 'multi-seed-ci')}`);
  lines.push(`- **Runner profile:** ${mdEscape(result.runnerProfile ?? 'ci')}`);
  lines.push(`- **Seeds:** ${(result.seeds ?? []).join(', ')}`);
  lines.push(`- **Seed count:** ${result.seedCount ?? 0}`);
  lines.push(`- **Pass / fail:** ${result.passCount ?? 0} / ${result.failCount ?? 0}`);
  lines.push(`- **Warning seeds:** ${result.warningSeedCount ?? 0}`);
  lines.push(`- **Runtime total ms:** ${result.runtimeTotalMs ?? result.runtimeMs ?? 0}`);
  lines.push(`- **Passed:** ${result.passed ? 'yes' : 'no'}`);
  lines.push(`- **Severity:** ${mdEscape(result.severity ?? 'unknown')}`);
  lines.push(`- **Fail on warnings:** ${result.failOnWarnings ? 'yes' : 'no'}`);
  lines.push('');

  lines.push('## Profile notes');
  lines.push('');
  for (const note of result.profileNotes ?? []) lines.push(`- ${mdEscape(note)}`);
  lines.push('- Default seeds are `1383`, `1408`, and `1426` to exercise three deterministic starter-league RNG paths without changing the existing single-seed CI audit runtime.');
  lines.push('- Full 20–50 season soaks and always-on long-run CI remain intentionally manual/deferred.');
  lines.push('');

  lines.push('## Per-seed summary');
  lines.push('');
  lines.push('| Seed | Passed | Severity | Runtime ms | Seasons | Final phase | Final year | Failures | Warnings | First failure |');
  lines.push('| --- | --- | --- | ---: | ---: | --- | --- | ---: | ---: | --- |');
  for (const row of result.seedSummaries ?? []) {
    const firstFailure = row.firstFailure ? `${row.firstFailure.code}: ${row.firstFailure.message}` : '';
    lines.push(`| ${row.seed} | ${row.passed ? 'yes' : 'no'} | ${mdEscape(row.severity)} | ${row.runtimeMs} | ${row.seasonsSimmed} | ${mdEscape(row.finalPhase ?? 'n/a')} | ${row.finalYear ?? 'n/a'} | ${row.failureCount} | ${row.warningCount} | ${mdEscape(firstFailure)} |`);
  }
  lines.push('');

  lines.push('## Warnings by seed');
  lines.push('');
  if (!result.warningsBySeed?.length) lines.push('_None_');
  else {
    for (const row of result.warningsBySeed) {
      lines.push(`- **Seed ${row.seed}:** ${mdEscape(JSON.stringify(row.warningsByCode ?? {}))}`);
    }
  }
  lines.push('');

  lines.push('## Failures by seed');
  lines.push('');
  if (!result.failuresBySeed?.length) lines.push('_None_');
  else {
    for (const row of result.failuresBySeed) {
      lines.push(`- **Seed ${row.seed}:** ${mdEscape((row.failures ?? []).map((f) => `${f.code}: ${f.message}`).join('; '))}`);
    }
  }
  lines.push('');

  lines.push('## Economy warning aggregate');
  lines.push('');
  const eco = result.economyAggregate ?? {};
  lines.push(`- **Snapshots present:** ${eco.snapshotsPresent ?? 0} / ${result.seedCount ?? 0}`);
  const totals = eco.totals ?? {};
  lines.push(`- **Cap / pending offers:** teams over cap=${totals.teamsOverCap ?? 0}, teams pending-overcommitted=${totals.teamsWithPendingOfferOvercommit ?? 0}, overcommitted offers=${totals.pendingOfferOvercommitCount ?? 0}, unknown offer values=${totals.unknownOfferValueCount ?? 0}`);
  lines.push(`- **CPU offer sanity:** CPU offers=${totals.cpuOfferCount ?? 0}, duplicate expensive same-group buckets=${totals.duplicateExpensiveSameGroupOffers ?? 0}, rebuild old-vet offers=${totals.oldVeteranOffersByRebuildTeams ?? 0}, contender veteran offers=${totals.contenderVeteranOfferCount ?? 0}, severe QB exceptions=${totals.severeQbNeedOfferCount ?? 0}`);
  lines.push(`- **Trade realism flags:** young premium discount flags=${totals.premiumYoungPlayerTradeDiscountFlags ?? 0}, expensive veteran swap flags=${totals.expensiveVeteranSwapFlags ?? 0}`);
  if (Array.isArray(eco.skippedReasonsBySeed) && eco.skippedReasonsBySeed.length) {
    lines.push(`- **Unknown/skipped:** ${mdEscape(eco.skippedReasonsBySeed.map((row) => `seed ${row.seed} ${row.code}: ${row.reason}`).join('; '))}`);
  }
  if (Array.isArray(eco.warningsBySeed) && eco.warningsBySeed.length) {
    lines.push(`- **Economy warnings:** ${mdEscape(eco.warningsBySeed.map((row) => `seed ${row.seed}: ${row.warnings.join('; ')}`).join(' | '))}`);
  }
  lines.push('');

  lines.push('## Persistence/archive warnings by seed');
  lines.push('');
  if (!result.persistenceWarningsBySeed?.length) lines.push('_None_');
  else {
    for (const row of result.persistenceWarningsBySeed) {
      lines.push(`- **Seed ${row.seed}:** ${mdEscape((row.assertionFailures ?? []).map((a) => `${a.id}: ${a.detail}`).join('; '))}`);
    }
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- Failures block CI; warnings are informational unless `--fail-on-warnings` is set.');
  lines.push('- Per-seed raw results are stored in `latest.json` under `results`.');
  return lines.join('\n');
}

/**
 * @param {object} result - runDynastySoakOnce output (JSON-serializable)
 */
export function buildMarkdownReport(result) {
  if (result?.multiSeed) return buildMultiSeedMarkdownReport(result);
  const lines = [];
  lines.push('# Dynasty soak report');
  lines.push('');
  lines.push(`- **Seed:** ${result.seed}`);
  lines.push(`- **Seasons completed:** ${result.seasonsSimmed}`);
  lines.push(`- **Runtime ms:** ${result.runtimeMs}`);
  lines.push(`- **Final phase:** ${result.finalPhase ?? 'n/a'}`);
  lines.push(`- **Final year:** ${result.finalYear ?? 'n/a'}`);
  lines.push(`- **Passed:** ${result.passed ? 'yes' : 'no'}`);
  lines.push(`- **Severity:** ${result.severity}`);
  if (result.harnessConfig) {
    lines.push(
      `- **Harness:** ci=${result.harnessConfig.ci} profile=${result.auditProfile ?? result.harnessConfig.auditProfile ?? 'full'} phasePath=${result.phasePath ?? result.harnessConfig.phasePath ?? 'full-season'} deep=${!!result.harnessConfig.deep} deepEachSeason=${result.harnessConfig.deepEachSeason}`,
    );
  }
  lines.push('');

  lines.push('## Audit profile');
  lines.push('');
  const profile = result.auditProfile ?? result.harnessConfig?.auditProfile ?? (result.harnessConfig?.ci ? 'ci' : 'full');
  const phasePath = result.phasePath ?? result.harnessConfig?.phasePath ?? (profile === 'ci' ? 'short' : 'full-season');
  lines.push(`- **Profile:** ${mdEscape(profile)}`);
  lines.push(`- **Phase path:** ${mdEscape(phasePath)}`);
  if (profile === 'ci') {
    lines.push('- **Scope:** Short real-worker smoke audit. It does not complete a season.');
    lines.push('- **Full manual audit:** `npm run audit:dynasty -- --audit-profile=full --seasons=1 --seed=1383`');
  } else {
    lines.push('- **Scope:** Full manual audit that uses `SIM_TO_PHASE` and may be slow.');
  }
  for (const note of result.profileNotes ?? result.harnessConfig?.profileNotes ?? []) {
    lines.push(`- ${mdEscape(note)}`);
  }
  lines.push('');

  const exerciseEntries = Object.entries(result.exerciseMatrix || {});
  if (exerciseEntries.length) {
    lines.push('## What was exercised');
    lines.push('');
    lines.push('| System | Status | Detail |');
    lines.push('| --- | --- | --- |');
    for (const [name, entry] of exerciseEntries.filter(([, entry]) => !String(entry?.status ?? '').startsWith('skipped'))) {
      lines.push(`| ${mdEscape(name)} | ${mdEscape(exerciseStatusLabel(entry))} | ${mdEscape(exerciseDetail(entry))} |`);
    }
    lines.push('');

    lines.push('## What was skipped');
    lines.push('');
    const skipped = exerciseEntries.filter(([, entry]) => String(entry?.status ?? '').startsWith('skipped'));
    if (!skipped.length) lines.push('_None_');
    else {
      lines.push('| System | Reason |');
      lines.push('| --- | --- |');
      for (const [name, entry] of skipped) {
        lines.push(`| ${mdEscape(name)} | ${mdEscape(entry?.reason || 'skipped by profile')} |`);
      }
    }
    lines.push('');
  }

  if (result.auditCheckpoint) {
    const cp = result.auditCheckpoint;
    lines.push('## Audit checkpoint');
    lines.push('');
    lines.push(`- **Status:** ${cp.ok === true ? 'ok' : 'FAIL'}`);
    lines.push(`- **Type:** ${mdEscape(cp.archiveType ?? 'unknown')}`);
    lines.push(`- **Audit only:** ${cp.auditOnly === true ? 'true' : 'false'}`);
    lines.push(`- **Completed season:** ${cp.completedSeason === false ? 'false' : mdEscape(String(cp.completedSeason))}`);
    lines.push(`- **Source:** phase=${mdEscape(cp.sourcePhase ?? 'n/a')} year=${mdEscape(cp.sourceYear ?? 'n/a')} seasonId=${mdEscape(cp.sourceSeasonId ?? 'n/a')}`);
    lines.push(`- **Real weeks simulated before checkpoint:** ${mdEscape(cp.realWeeksSimulated ?? 'n/a')}`);
    lines.push('- **Warning:** This checkpoint is audit-only partial-season coverage, not full-season balance validation and not a completed-season archive.');
    lines.push('- **Full completed-season validation:** `npm run audit:dynasty -- --audit-profile=full --seasons=1 --seed=1383`');
    lines.push('');
    const exercised = Object.entries(cp.exercised || {});
    lines.push('### Checkpoint systems exercised');
    lines.push('');
    if (!exercised.length) lines.push('_None_');
    else {
      lines.push('| System | Status | Detail |');
      lines.push('| --- | --- | --- |');
      for (const [name, entry] of exercised) {
        lines.push(`| ${mdEscape(formatCheckpointSystemLabel(name))} | ${mdEscape(entry?.status ?? 'exercised')} | ${mdEscape(entry?.detail || '')} |`);
      }
    }
    lines.push('');
    lines.push('### Checkpoint systems skipped');
    lines.push('');
    if (!Array.isArray(cp.skipped) || cp.skipped.length === 0) lines.push('_None_');
    else {
      lines.push('| System | Reason |');
      lines.push('| --- | --- |');
      for (const row of cp.skipped) {
        lines.push(`| ${mdEscape(row?.system ?? 'unknown')} | ${mdEscape(row?.reason || 'missing reason')} |`);
      }
    }
    lines.push('');
  }

  if (result.smallerLeagueNote) {
    lines.push('## League mode');
    lines.push('');
    lines.push(mdEscape(result.smallerLeagueNote));
    lines.push('');
  }

  const phaseBreakdown = result.timings?.phaseBreakdown;
  if (phaseBreakdown && Object.keys(phaseBreakdown).length) {
    lines.push('## Phase timing breakdown');
    lines.push('');
    lines.push('| Phase group | ms | Checkpoints |');
    lines.push('| --- | --- | --- |');
    for (const [key, value] of Object.entries(phaseBreakdown)) {
      const entry = value && typeof value === 'object' ? value : { ms: value, count: null };
      lines.push(`| ${mdEscape(formatPhaseBreakdownLabel(key))} | ${entry.ms ?? 0} | ${entry.count ?? 'n/a'} |`);
    }
    lines.push('');
  }

  if (result.timings?.topSlowCheckpoints?.length) {
    lines.push('## Slowest checkpoints');
    lines.push('');
    lines.push('| Rank | Checkpoint | ms | Metadata |');
    lines.push('| --- | --- | --- | --- |');
    let r = 1;
    for (const c of result.timings.topSlowCheckpoints) {
      lines.push(`| ${r} | ${mdEscape(c.name)} | ${c.ms} | ${formatCheckpointMeta(c.meta)} |`);
      r += 1;
    }
    lines.push('');
  }

  if (result.reportSummary) {
    const rs = result.reportSummary;
    lines.push('## AI / roster snapshot (last audited season)');
    lines.push('');
    lines.push(`- **Teams:** ${rs.teamCount ?? 'n/a'}`);
    lines.push(`- **Teams without QB:** ${rs.teamsWithoutQb ?? 'n/a'}`);
    lines.push(`- **Archetype distribution:** ${mdEscape(JSON.stringify(rs.archetypeDistribution ?? {}))}`);
    if (rs.transactionCountsByType && Object.keys(rs.transactionCountsByType).length) {
      lines.push(`- **Transaction counts (sample strip):** ${mdEscape(JSON.stringify(rs.transactionCountsByType))}`);
    }
    lines.push(`- **Draft classes listed:** ${rs.draftClassCount ?? 'n/a'}`);
    lines.push('');

    if (rs.economyRegressionSnapshot) {
      const eco = rs.economyRegressionSnapshot;
      lines.push('## Economy regression snapshot');
      lines.push('');
      lines.push(`- **Pending offer cap health:** overcommitted teams=${eco.teamsWithPendingOfferOvercommit ?? 'n/a'}, overcommitted offers=${eco.pendingOfferOvercommitCount ?? 'n/a'}, unknown offer values=${eco.unknownOfferValueCount ?? 'n/a'}`);
      lines.push(`- **CPU FA offer sanity:** CPU offers=${eco.cpuOfferCount ?? 'n/a'}, duplicate expensive same-group buckets=${eco.duplicateExpensiveSameGroupOffers ?? 'n/a'}, rebuild old-vet offers=${eco.oldVeteranOffersByRebuildTeams ?? 'n/a'}, contender veteran offers=${eco.contenderVeteranOfferCount ?? 'n/a'}, severe QB exceptions=${eco.severeQbNeedOfferCount ?? 'n/a'}`);
      lines.push(`- **Market realism warnings:** teams over cap=${eco.teamsOverCap ?? 'n/a'}`);
      lines.push(`- **Trade realism warnings:** young premium discount flags=${eco.premiumYoungPlayerTradeDiscountFlags ?? 'n/a'}, expensive veteran swap flags=${eco.expensiveVeteranSwapFlags ?? 'n/a'}`);
      if (Array.isArray(eco.skippedReasons) && eco.skippedReasons.length) {
        lines.push(`- **Unknown/skipped:** ${mdEscape(eco.skippedReasons.map((row) => `${row.code}: ${row.reason}`).join('; '))}`);
      }
      if (Array.isArray(eco.warnings) && eco.warnings.length) {
        lines.push(`- **Warnings:** ${mdEscape(eco.warnings.join('; '))}`);
      }
      lines.push('');
    }
  }

  if (result.persistenceAssertions?.length) {
    lines.push('## Persistence probes');
    lines.push('');
    for (const a of result.persistenceAssertions) {
      const st = a.status === 'skipped' ? 'skipped' : (a.ok ? 'ok' : 'FAIL');
      lines.push(`- **${st}** \`${mdEscape(formatPersistenceProbeLabel(a.id))}\`: ${mdEscape(formatProbeText(a.detail || ''))}`);
    }
    lines.push('');
  }

  lines.push('## Runtime notes');
  lines.push('');
  if ((result.auditProfile ?? result.harnessConfig?.auditProfile) === 'ci') {
    lines.push('- CI profile intentionally avoids `SIM_TO_PHASE`; `--max-runtime-ms` is checked between short worker checkpoints.');
    lines.push('- Full-season balance, playoffs, offseason, free agency, draft, and completed-season archive are not validated by CI profile.');
  } else {
    lines.push('- Full profile uses `SIM_TO_PHASE`; a single worker request may run for a long time before `--max-runtime-ms` can be checked.');
  }
  lines.push('');

  lines.push('## Summary buckets');
  lines.push('');
  lines.push('| Bucket | Status |');
  lines.push('| --- | --- |');
  for (const [k, v] of Object.entries(result.summary || {})) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push('');
  lines.push('## Failures');
  lines.push('');
  if (!result.failures?.length) lines.push('_None_');
  else {
    for (const f of result.failures) {
      lines.push(`- **${f.code}:** ${mdEscape(f.message)}`);
    }
  }
  lines.push('');
  lines.push('## Warnings');
  lines.push('');
  if (!result.warnings?.length) lines.push('_None_');
  else {
    for (const w of result.warnings) {
      lines.push(`- **${w.code}:** ${mdEscape(w.message)}`);
    }
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- Failures block CI; warnings are informational.');
  lines.push('- Phase timings and checkpoints are stored in `latest.json` under `checkpoints` / `timings`.');
  return lines.join('\n');
}

/**
 * Strip huge fields before writing latest.json
 * @param {object} result
 */
export function slimDynastySoakResultForJson(result) {
  const out = { ...result };
  delete out.finalView;
  return out;
}

/**
 * Write the canonical dynasty soak JSON and Markdown reports.
 * Kept in the CLI helper so tests can exercise the real artifact path without
 * launching the worker.
 * @param {object} result
 * @param {string} [outDir]
 * @param {string} [cwd]
 * @returns {Promise<{ outDir: string, jsonPath: string, markdownPath: string }>}
 */
export async function writeDynastySoakReports(result, outDir = 'artifacts/dynasty-soak', cwd = process.cwd()) {
  const resolvedOutDir = resolve(cwd, outDir);
  const jsonPath = resolve(resolvedOutDir, 'latest.json');
  const markdownPath = resolve(resolvedOutDir, 'latest.md');
  await mkdir(resolvedOutDir, { recursive: true });
  const jsonText = JSON.stringify(slimDynastySoakResultForJson(result), null, 2);
  const markdownText = buildMarkdownReport(result);
  await writeFile(jsonPath, jsonText, 'utf8');
  await writeFile(markdownPath, markdownText, 'utf8');
  if (result?.multiSeed) {
    await writeFile(resolve(resolvedOutDir, 'latest-multi-seed.json'), jsonText, 'utf8');
    await writeFile(resolve(resolvedOutDir, 'latest-multi-seed.md'), markdownText, 'utf8');
  }
  return { outDir: resolvedOutDir, jsonPath, markdownPath };
}
