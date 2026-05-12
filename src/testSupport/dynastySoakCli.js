/**
 * Dynasty soak CLI argument parsing and report helpers (no fake-indexeddb).
 * Used by scripts/dynasty-soak.mjs and Vitest.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const DYNASTY_SOAK_USAGE = `Usage: npm run audit:dynasty -- [options]

Options:
  --ci                    Alias for --audit-profile=ci (fast real-worker smoke audit)
  --audit-profile=ci|full Profile to run: ci=short partial phase path, full=legacy full-season manual audit
  --seasons=N             Number of seasons to simulate with --audit-profile=full (default: 5; CI uses a short path)
  --seed=N                RNG seed (default: 1383)
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
    outDir: null,
    phaseTimeoutMs: null,
    maxRuntimeMs: null,
    skipReportOpen: false,
    teams: null,
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
    else if (a.startsWith('--seasons=')) {
      const parsed = parseRequiredNumber('--seasons', a.slice('--seasons='.length), errors);
      if (parsed.ok) raw.seasons = parsed.value;
    } else if (a.startsWith('--seed=')) {
      const parsed = parseRequiredNumber('--seed', a.slice('--seed='.length), errors);
      if (parsed.ok) raw.seed = parsed.value;
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
  if (!['ci', 'full'].includes(auditProfile)) {
    errors.push(`Unknown audit profile: ${requestedProfile}. Expected --audit-profile=ci or --audit-profile=full.`);
  }
  const requestedSeasons =
    raw.seasons != null && Number.isFinite(Number(raw.seasons))
      ? Math.max(1, Math.min(50, Number(raw.seasons)))
      : null;
  const seasons = auditProfile === 'ci'
    ? 1
    : requestedSeasons ?? 5;
  const seed = raw.seed != null && Number.isFinite(Number(raw.seed)) ? Number(raw.seed) : 1383;

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
      ci: auditProfile === 'ci',
      auditProfile,
      phasePath: auditProfile === 'ci' ? 'short' : 'full-season',
      requestedSeasons,
      effectiveSeasons: seasons,
      ciWeeks: auditProfile === 'ci' ? 2 : null,
      profileNotes: auditProfile === 'ci'
        ? [
            'CI profile runs a short real-worker phase path and does not complete a season.',
            'Use --audit-profile=full --seasons=1 for the full manual season audit.',
          ]
        : ['Full profile preserves the legacy full-season SIM_TO_PHASE audit and may be slow.'],
      deep,
      deepEachSeason,
      phaseTimeoutMs,
      maxRuntimeMs,
      simTimeoutMs: phaseTimeoutMs,
      outDir: raw.outDir || null,
      skipReportOpen: !!raw.skipReportOpen,
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

/**
 * @param {object} result - runDynastySoakOnce output (JSON-serializable)
 */
export function buildMarkdownReport(result) {
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
  }

  if (result.persistenceAssertions?.length) {
    lines.push('## Persistence probes');
    lines.push('');
    for (const a of result.persistenceAssertions) {
      const st = a.status === 'skipped' ? 'skipped' : (a.ok ? 'ok' : 'FAIL');
      lines.push(`- **${st}** \`${a.id}\`: ${mdEscape(a.detail || '')}`);
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
  await writeFile(
    jsonPath,
    JSON.stringify(slimDynastySoakResultForJson(result), null, 2),
    'utf8',
  );
  await writeFile(markdownPath, buildMarkdownReport(result), 'utf8');
  return { outDir: resolvedOutDir, jsonPath, markdownPath };
}
