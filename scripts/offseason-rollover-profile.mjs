#!/usr/bin/env node
import 'fake-indexeddb/auto';
import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { LifecycleDriver, CHECKPOINTS, DEFAULT_SEED } from '../tests/durability/lifecycleDriver.js';
import { getOffseasonProfiler } from '../src/worker/offseasonProfiler.js';

function arg(name, dflt) { const p = process.argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`)); if (!p) return dflt; if (p === `--${name}`) return true; return p.split('=').slice(1).join('='); }
const seed = Number(arg('seed', DEFAULT_SEED));
const phaseTimeoutMs = Number(arg('phase-timeout-ms', 900000));
const writeReport = Boolean(arg('write-report', false));
const summary = Boolean(arg('summary', false));
const out = String(arg('report-name', `offseason-rollover-profile-seed-${seed}`));
const gitSha = (() => { try { return execSync('git rev-parse HEAD', { encoding:'utf8' }).trim(); } catch { return null; } })();

async function oneRun(runId) {
  globalThis.__OFFSEASON_PROFILE_ENABLED__ = true;
  const profiler = getOffseasonProfiler();
  profiler.enable({ seed, gitSha, startPhase: 'offseason', targetPhase: 'preseason', runId });
  const driver = new LifecycleDriver({ seed, phaseTimeoutMs, onEvent: (ev) => {
    if (ev.type === 'simToPhase') profiler.checkpoint(`simToPhase.${ev.targetPhase}`, ev);
  }});
  let completed = false, err = null, startYear = null, endYear = null;
  try {
    await driver.initLeague(); profiler.checkpoint('after-initialization', { phase: driver.view?.phase, year: driver.view?.year });
    await driver.simToPhase('playoffs', { checkpoint: CHECKPOINTS.AFTER_REGULAR_SEASON }); profiler.checkpoint('after-regular-season', { phase: driver.view?.phase, year: driver.view?.year });
    await driver.simToPhase('offseason', { checkpoint: CHECKPOINTS.AFTER_PLAYOFFS }); profiler.checkpoint('after-playoffs', { phase: driver.view?.phase, year: driver.view?.year });
    startYear = driver.view?.year ?? null;
    await driver.simToPhase('preseason', { checkpoint: CHECKPOINTS.AFTER_SEASON_ROLLOVER });
    completed = driver.view?.phase === 'preseason'; endYear = driver.view?.year ?? null;
  } catch (e) { err = e; endYear = driver.view?.year ?? null; }
  const meta = { completed, startYear, endYear, error: err ? { message: err.message, checkpoint: err.checkpoint ?? null } : null, recommendations: [] };
  const report = profiler.report(meta);
  report.recommendations = recommend(report);
  return report;
}
function recommend(r) {
  const top = r.hotspots?.[0]?.name ?? 'unknown';
  if (top.includes('draft')) return ['#1687 — SIM_TO_PHASE Draft User-Pick Auto-Advance V1: handle user-owned draft picks in the batch rollover path so SIM_TO_PHASE can make forward progress while preserving manual draft behavior outside batch simulation.'];
  if (top.includes('persistence')) return ['#1687 — Draft Pick Persistence Batching V1: batch persistence within existing lifecycle boundaries without changing final save state.'];
  return [`#1687 — ${top} Performance Repair V1: target the measured dominant operation only.`];
}
function table(r) {
  const rows = (r.hotspots ?? []).slice(0,10).map((s,i)=>`${i+1}\t${s.name}\t${(s.totalMs/1000).toFixed(2)}s\t${s.calls}\t${s.avgMs.toFixed(2)}ms\t${s.maxMs.toFixed(2)}ms\t${(s.share*100).toFixed(1)}%`);
  return ['Rank\tStage or function\tTotal time\tCalls\tAvg\tMax\tShare', ...rows].join('\n');
}
const reports = [];
for (let i=1;i<=2;i++) reports.push(await oneRun(i));
const variance = reports.length === 2 ? reports[0].hotspots.slice(0,5).map(a => { const b = reports[1].stages.find(s=>s.name===a.name); return { name:a.name, run1Ms:a.totalMs, run2Ms:b?.totalMs ?? null, deltaPct:b ? ((b.totalMs-a.totalMs)/Math.max(1,a.totalMs))*100 : null }; }) : [];
const final = { ...reports[0], runToRunVariance: variance, comparisonRuns: reports.map(r => ({ runId:r.runId, completed:r.completed, runtimeMs:r.runtimeMs, peakMemoryMb:r.peakMemoryMb, top:r.hotspots?.slice(0,5) })) };
if (summary) console.log(table(final)); else console.log(JSON.stringify(final, null, 2));
if (writeReport) { await fs.mkdir('tests/durability/reports', { recursive:true }); await fs.writeFile(`tests/durability/reports/${out}.summary.json`, JSON.stringify(final, null, 2)); console.log(`[offseason-profile] report → tests/durability/reports/${out}.summary.json`); }
process.exit(0);
