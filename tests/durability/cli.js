/**
 * Long-Save Durability Harness — CLI helpers (pure arg parsing + report I/O).
 *
 * Kept import-light and side-effect-free at module scope so it is unit-testable.
 * The node entrypoint (scripts/long-save-durability.mjs) loads fake-indexeddb
 * first, then delegates here.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const USAGE = `
Long-Save Durability Harness

Usage:
  node scripts/long-save-durability.mjs [mode] [flags]

Modes (default: 1-season):
  1-season | 5-season | 10-season | 20-season

Flags:
  --mode=<mode>        Explicit mode (overrides positional)
  --seed=<n>           Deterministic seed (default 1684)
  --stop-phase=<p>     Bound each season to playoffs|offseason|rollover (default rollover).
                       Use offseason to skip the expensive draft/FA rollover.
  --phase-timeout-ms=<n>  Per-SIM_TO_PHASE timeout. On timeout the run records a
                       performance-timeout finding and finalizes an honest partial report.
  --collect-all        Continue past failures, accumulate all (default: fail-fast)
  --determinism        Run the mode twice and report determinism
  --write-report       Write full JSON report under the reports dir
  --summary            Also write the compact summary report
  --out=<path>         Explicit output file for the full report
  --report-name=<name> Stable base filename (e.g. long-save-1-season)
  -h, --help           Show this help
`;

const KNOWN_MODES = ['1-season', '5-season', '10-season', '20-season'];

export function parseArgv(argv) {
  const args = argv.slice(2);
  const raw = { mode: null, seed: 1684, failureMode: 'fail-fast', determinism: false, writeReport: false, summary: false, out: null, reportName: null, stopPhase: 'rollover', phaseTimeoutMs: null, help: false };
  const errors = [];
  for (const a of args) {
    if (a === '-h' || a === '--help') raw.help = true;
    else if (a === '--collect-all') raw.failureMode = 'collect-all';
    else if (a === '--determinism') raw.determinism = true;
    else if (a === '--write-report') raw.writeReport = true;
    else if (a === '--summary') raw.summary = true;
    else if (a.startsWith('--mode=')) raw.mode = a.slice(7);
    else if (a.startsWith('--stop-phase=')) raw.stopPhase = a.slice(13);
    else if (a.startsWith('--phase-timeout-ms=')) raw.phaseTimeoutMs = Number(a.slice(19));
    else if (a.startsWith('--seed=')) raw.seed = Number(a.slice(7));
    else if (a.startsWith('--out=')) { raw.out = a.slice(6); raw.writeReport = true; }
    else if (a.startsWith('--report-name=')) raw.reportName = a.slice(14);
    else if (KNOWN_MODES.includes(a)) raw.mode = a;
    else errors.push(`Unknown argument: ${a}`);
  }
  if (!raw.mode) raw.mode = '1-season';
  if (!KNOWN_MODES.includes(raw.mode)) errors.push(`Unknown mode: ${raw.mode}`);
  if (!['playoffs', 'offseason', 'rollover'].includes(raw.stopPhase)) errors.push(`Unknown --stop-phase: ${raw.stopPhase}`);
  if (!Number.isFinite(raw.seed)) errors.push('Invalid --seed');
  return { raw, errors };
}

export function defaultReportName(mode) {
  return `long-save-${mode}`;
}

export const REPORTS_DIR = 'tests/durability/reports';

/**
 * Write full + optional summary reports. Filenames are STABLE (no timestamps)
 * so re-running does not create churn; only an explicit run dirties them.
 */
export function writeReports(report, { mode, out, reportName, summary, dir = REPORTS_DIR }) {
  const base = reportName || defaultReportName(mode);
  const fullPath = out || join(dir, `${base}.json`);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, JSON.stringify(report.toJSON(), null, 2) + '\n');
  const written = [fullPath];
  if (summary) {
    const summaryPath = join(dir, `${base}.summary.json`);
    mkdirSync(dirname(summaryPath), { recursive: true });
    writeFileSync(summaryPath, JSON.stringify(report.toSummaryJSON(), null, 2) + '\n');
    written.push(summaryPath);
  }
  return written;
}

/** Best-effort git SHA without spawning a shell dependency at import time. */
export async function resolveGitSha() {
  try {
    const { execSync } = await import('node:child_process');
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}
