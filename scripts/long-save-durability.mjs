#!/usr/bin/env node
/**
 * Long-Save Durability Harness — node entrypoint.
 *
 * MUST load fake IndexedDB before any db/worker import (the worker's persistence
 * layer touches indexedDB at module load). Then delegates to the pure CLI +
 * orchestrator. Run via the durability:* package scripts.
 *
 * Examples:
 *   npm run durability:smoke
 *   npm run durability:5 -- --write-report
 *   npm run durability:20 -- --collect-all --seed=1684
 */
import 'fake-indexeddb/auto';
import { parseArgv, USAGE, writeReports, resolveGitSha, defaultReportName } from '../tests/durability/cli.js';
import { formatConsole } from '../tests/durability/report.js';

async function main() {
  const { raw, errors } = parseArgv(process.argv);
  if (raw.help) { console.log(USAGE); return; }
  if (errors.length) {
    console.error(USAGE);
    for (const e of errors) console.error(`[durability] ${e}`);
    process.exitCode = 1;
    return;
  }

  const { runDurabilityHarness, runDeterminismCheck } = await import('../tests/durability/longSaveHarness.js');
  const gitSha = await resolveGitSha();

  const onEvent = (ev) => {
    if (ev.type === 'seasonStart') console.log(`[durability] season ${ev.season} start`);
    else if (ev.type === 'simToPhase') console.log(`[durability]   sim→${ev.targetPhase} ${(ev.ms / 1000).toFixed(1)}s (${ev.calls} call/s) phase=${ev.phase} year=${ev.year}`);
    else if (ev.type === 'checkpoint') console.log(`[durability]   checkpoint ${ev.phase}: pass=${ev.counts.pass} fail=${ev.counts.fail} skip=${ev.counts.skip}`);
    else if (ev.type === 'saveReload') console.log(`[durability]   save/reload s${ev.season}: ${ev.ok ? 'OK' : 'DIVERGED'}`);
    else if (ev.type === 'lifecycleCrash') console.error(`[durability]   LIFECYCLE CRASH s${ev.season}: ${ev.message}`);
    else if (ev.type === 'stopped') console.log(`[durability]   stopped: ${ev.reason}`);
  };

  console.log(`[durability] mode=${raw.mode} seed=${raw.seed} failureMode=${raw.failureMode} stopPhase=${raw.stopPhase} determinism=${raw.determinism}`);

  const base = { mode: raw.mode, seed: raw.seed, failureMode: raw.failureMode, perSeasonStopPhase: raw.stopPhase, gitSha, onEvent };
  if (Number.isFinite(raw.phaseTimeoutMs)) base.phaseTimeoutMs = raw.phaseTimeoutMs;
  let report;
  if (raw.determinism) {
    const det = await runDeterminismCheck(base);
    report = det.reports[0];
    report.setDeterminism(det.deterministic, det.detail);
    console.log(`[durability] deterministic=${det.deterministic} — ${det.detail}`);
  } else {
    report = await runDurabilityHarness(base);
  }

  console.log('\n' + formatConsole(report));

  if (raw.writeReport) {
    const written = writeReports(report, {
      mode: raw.mode, out: raw.out, reportName: raw.reportName || defaultReportName(raw.mode), summary: raw.summary,
    });
    console.log(`[durability] reports → ${written.join(', ')}`);
  }

  if (!report.passed) process.exitCode = 1;
}

main()
  .then(() => {
    // A phase-timeout leaves the worker's setTimeout-driven batch loop running,
    // which keeps the event loop alive. Force a clean exit once the report is
    // written so the process (and its orphaned sim work) terminates.
    process.exit(process.exitCode ?? 0);
  })
  .catch((e) => {
    console.error('[durability] fatal:', e);
    process.exit(1);
  });
