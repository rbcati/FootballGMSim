/**
 * Dynasty soak CLI argument parsing and report helpers (no fake-indexeddb).
 * Used by scripts/dynasty-soak.mjs and Vitest.
 */

export const DYNASTY_SOAK_USAGE = `Usage: npm run audit:dynasty -- [options]

Options:
  --ci                    CI short soak (1 season, tighter timeouts, shallow mid-season probes)
  --seasons=N             Number of seasons to simulate (default: 5, or 1 with --ci)
  --seed=N                RNG seed (default: 1383)
  --outDir=PATH           Report output directory (default: artifacts/dynasty-soak)
  --deep                  No-op (reserved); default is full probes on the final season only
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
    if (a === '--ci') raw.ci = true;
    else if (a === '--deep') {
      /* reserved: default harness already runs full probes on the last season */
    } else if (a === '--deep-each-season') raw.deepEachSeason = true;
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
  const seasons =
    raw.seasons != null && Number.isFinite(Number(raw.seasons))
      ? Math.max(1, Math.min(50, Number(raw.seasons)))
      : raw.ci
        ? 1
        : 5;
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

  const deepEachSeason = !!raw.deepEachSeason;

  if (errors.length) {
    return { errors, resolved: null };
  }

  return {
    errors: [],
    resolved: {
      seasons,
      seed,
      ci: !!raw.ci,
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
    lines.push(`- **Harness:** ci=${result.harnessConfig.ci} deepEachSeason=${result.harnessConfig.deepEachSeason}`);
  }
  lines.push('');

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
      const st = a.ok ? 'ok' : 'FAIL';
      lines.push(`- **${st}** \`${a.id}\`: ${mdEscape(a.detail || '')}`);
    }
    lines.push('');
  }

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
