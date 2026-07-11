/**
 * Long-Save Durability Harness — structured report builder.
 *
 * The report schema is STABLE and machine-readable (documented in
 * docs/long-save-durability-harness.md). `toJSON()` returns the full report;
 * `toSummaryJSON()` returns a compact form safe to commit for long runs (drops
 * per-result pass/skip noise, keeps failures + per-checkpoint counts).
 */
export const HARNESS_VERSION = '1.0.0';

export class DurabilityReport {
  constructor({ seed, mode, failureMode, requestedSeasons, gitSha = null, perSeasonStopPhase = 'rollover' }) {
    this.report = {
      harnessVersion: HARNESS_VERSION,
      gitSha,
      seed,
      mode,
      failureMode,
      perSeasonStopPhase,
      requestedSeasons,
      seasonsAttempted: 0,
      seasonsCompleted: 0,
      competitiveSeasonsCompleted: 0,
      completedThrough: null,
      boundedRun: perSeasonStopPhase !== 'rollover',
      unexercisedLifecycleStages: [],
      runtimeMs: 0,
      peakMemoryMb: 0,
      deterministic: null,
      determinismDetail: null,
      firstFailure: null,
      lifecycleException: null,
      saveReload: [],
      checkpoints: [],
      summary: { passed: 0, failed: 0, skipped: 0 },
      crashBlockersPatched: [],
      deferredFindings: [],
      recommendedNextRepairPR: null,
    };
  }

  /** Record a completed checkpoint with its structured invariant results. */
  addCheckpoint({ season, phase, week, results }) {
    const counts = { pass: 0, fail: 0, skip: 0 };
    for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
    this.report.summary.passed += counts.pass;
    this.report.summary.failed += counts.fail;
    this.report.summary.skipped += counts.skip;

    const firstFail = results.find((r) => r.status === 'fail');
    if (firstFail && !this.report.firstFailure) {
      this.report.firstFailure = {
        season,
        phase,
        invariantId: firstFail.id,
        entityType: firstFail.entityType,
        entityId: firstFail.entityId,
        message: firstFail.message,
      };
    }
    this.report.checkpoints.push({ season, phase, week, summary: counts, results });
    return counts;
  }

  addSaveReload(entry) {
    this.report.saveReload.push(entry);
  }

  setLifecycleException(exc) {
    this.report.lifecycleException = exc;
    if (!this.report.firstFailure) {
      this.report.firstFailure = {
        season: exc?.season ?? null,
        phase: exc?.checkpoint ?? exc?.phase ?? null,
        invariantId: 'lifecycle.exception',
        entityType: 'harness',
        entityId: null,
        message: exc?.message ?? 'lifecycle exception',
      };
    }
  }

  setDeterminism(deterministic, detail) {
    this.report.deterministic = deterministic;
    this.report.determinismDetail = detail;
  }

  addCrashBlocker(entry) { this.report.crashBlockersPatched.push(entry); }
  addDeferredFinding(entry) { this.report.deferredFindings.push(entry); }
  setRecommendedNextRepairPR(v) { this.report.recommendedNextRepairPR = v; }

  finalize({
    seasonsAttempted,
    seasonsCompleted,
    competitiveSeasonsCompleted = seasonsCompleted,
    completedThrough = null,
    boundedRun = null,
    unexercisedLifecycleStages = [],
    runtimeMs,
    peakMemoryMb,
  }) {
    this.report.seasonsAttempted = seasonsAttempted;
    this.report.seasonsCompleted = seasonsCompleted;
    this.report.competitiveSeasonsCompleted = competitiveSeasonsCompleted;
    this.report.completedThrough = completedThrough;
    this.report.boundedRun = boundedRun ?? this.report.perSeasonStopPhase !== 'rollover';
    this.report.unexercisedLifecycleStages = unexercisedLifecycleStages;
    this.report.runtimeMs = runtimeMs;
    this.report.peakMemoryMb = peakMemoryMb;
    if (!this.report.recommendedNextRepairPR) {
      this.report.recommendedNextRepairPR = recommendRepair(this.report);
    }
    return this.report;
  }

  get passed() {
    return this.report.summary.failed === 0 && !this.report.lifecycleException;
  }

  toJSON() { return this.report; }

  /** Compact, commit-safe report: strips pass/skip result bodies. */
  toSummaryJSON() {
    return {
      ...this.report,
      checkpoints: this.report.checkpoints.map((c) => ({
        season: c.season,
        phase: c.phase,
        week: c.week,
        summary: c.summary,
        failures: c.results.filter((r) => r.status === 'fail'),
        skipped: c.results.filter((r) => r.status === 'skip').map((r) => ({ id: r.id, reason: r.message })),
      })),
    };
  }
}

/** Heuristic: name the most likely next repair PR from the first failure. */
export function recommendRepair(report) {
  const f = report.firstFailure;
  if (!f) return null;
  if (report.lifecycleException) {
    const exc = report.lifecycleException;
    if (exc.classification === 'performance-timeout') {
      return `Offseason performance-profiling PR: the draft/FA rollover did not complete within the phase budget at ${exc.checkpoint ?? 'rollover'} (season ${exc.season ?? '?'}). This is a performance limitation, not state corruption.`;
    }
    return `Lifecycle-crash repair: fix "${exc.message}" at ${exc.checkpoint ?? 'unknown'} (season ${exc.season ?? '?'})`;
  }
  const domain = String(f.invariantId).split('.')[0];
  const map = {
    roster: 'Roster-membership integrity repair PR',
    cap: 'Cap/contract numeric-safety repair PR',
    schedule: 'Schedule/standings reconciliation repair PR',
    progression: 'Ratings/aging numeric-safety repair PR',
    retirement: 'Retirement-transition integrity repair PR',
    draft: 'Draft pick-ownership integrity repair PR',
    freeAgency: 'Free-agency/player-pool integrity repair PR',
    history: 'Season-history/awards integrity repair PR',
    references: 'Dangling entity-reference repair PR',
    numericSafety: 'Durable-state numeric-corruption repair PR',
    saveReload: 'Save/reload divergence repair PR',
  };
  return `${map[domain] || 'State-integrity repair PR'} (first failure: ${f.invariantId} @ season ${f.season} ${f.phase})`;
}

/** Human-readable console rendering of a report. */
export function formatConsole(report) {
  const lines = [];
  const r = report.toJSON ? report.toJSON() : report;
  lines.push(`── Long-Save Durability Report ──────────────────────────────`);
  lines.push(`mode=${r.mode} seed=${r.seed} failureMode=${r.failureMode}`);
  lines.push(`seasons: requested=${r.requestedSeasons} attempted=${r.seasonsAttempted} completed=${r.seasonsCompleted} competitive=${r.competitiveSeasonsCompleted ?? r.seasonsCompleted}`);
  if (r.boundedRun) lines.push(`boundedRun=true completedThrough=${r.completedThrough ?? 'unknown'} unexercised=${(r.unexercisedLifecycleStages || []).join(',')}`);
  lines.push(`runtime=${(r.runtimeMs / 1000).toFixed(1)}s peakMem=${r.peakMemoryMb}MB`);
  lines.push(`invariants: pass=${r.summary.passed} fail=${r.summary.failed} skip=${r.summary.skipped}`);
  if (r.deterministic != null) lines.push(`deterministic=${r.deterministic} (${r.determinismDetail ?? ''})`);
  if (r.lifecycleException) lines.push(`LIFECYCLE CRASH: ${r.lifecycleException.message} @ ${r.lifecycleException.checkpoint} season ${r.lifecycleException.season}`);
  if (r.firstFailure) {
    lines.push(`FIRST FAILURE: ${r.firstFailure.invariantId} @ season ${r.firstFailure.season} phase ${r.firstFailure.phase}`);
    lines.push(`   entity=${r.firstFailure.entityType}:${r.firstFailure.entityId} — ${r.firstFailure.message}`);
  } else {
    lines.push(`FIRST FAILURE: none`);
  }
  for (const sr of r.saveReload) {
    lines.push(`save/reload @ s${sr.season} ${sr.phase}: ${sr.ok ? 'OK' : 'DIVERGED ' + JSON.stringify(sr.mismatches)}`);
  }
  if (r.recommendedNextRepairPR) lines.push(`NEXT REPAIR PR: ${r.recommendedNextRepairPR}`);
  lines.push(`─────────────────────────────────────────────────────────────`);
  return lines.join('\n');
}
