# Offseason Rollover Performance Profile V1

## Executive summary

This PR adds a disabled-by-default production-path profiler for the real offseason rollover path introduced by the long-save durability harness. The profiled entrypoint is:

`INIT → USE_SAFE_STARTER_LEAGUE → SIM_TO_PHASE('playoffs') → SIM_TO_PHASE('offseason') → SIM_TO_PHASE('preseason')`.

Seed `1684` with a 120,000 ms rollover timeout did **not** reach the next preseason. The run timed out at `afterSeasonRollover` while the worker was in the draft path. The dominant measured cost was repeated `stage.draft.pick-batch` calls: 5,550 calls totaling 111.7 seconds in the representative report. The structural blocker is that the production batch path calls `handleSimDraftPick()` repeatedly, but that handler stops at user-owned picks. `SIM_TO_PHASE('preseason')` does not make or skip the user picks, so it repeatedly re-enters a draft batch that cannot advance the pick index.

## Production call graph

1. `LifecycleDriver.initLeague()` sets the headless durability flags, loads the worker, dispatches `INIT`, then dispatches `USE_SAFE_STARTER_LEAGUE` with `rngSeed`.
2. `LifecycleDriver.simToPhase('playoffs')` dispatches worker `SIM_TO_PHASE`.
3. `handleSimToPhase()` loops until a phase predicate matches or the 800-iteration guard is reached.
4. For `regular`, `playoffs`, and `preseason`, `handleSimToPhase()` calls `handleAdvanceWeek({ skipUserGame: true })`.
5. `LifecycleDriver.simToPhase('offseason')` crosses the championship result and stops at `offseason_resign`/`offseason`.
6. `LifecycleDriver.simToPhase('preseason')` enters offseason phases:
   - `offseason_resign`/`offseason` → `handleAdvanceOffseason()`.
   - `free_agency` → `handleAdvanceFreeAgencyDay()`.
   - `draft_combine` → `handleAdvanceCombineWeek()`.
   - `draft` → `handleStartDraft()` and then repeated `handleSimDraftPick()` calls.
7. `handleStartDraft()` creates the draft class, draft order, and draft-state pick table.
8. `handleSimDraftPick()` simulates AI selections only until the current pick belongs to the user team, then returns.
9. `handleSimToPhase()` re-enters `handleSimDraftPick()` until timeout/guard, but the current user pick is still on the clock, so no progress is made.
10. `handleStartNewSeason()` is only reached if the draft state's `currentPickIndex` reaches the end of the pick table.

## Profiling method

The profiler utility records stage names, parent stage, high-resolution duration, call counts, items/teams/players/prospects/picks/offers metadata, persistence flush counters, memory checkpoints, and a draft-pick iteration series. It is disabled by default and is enabled only by `globalThis.__OFFSEASON_PROFILE_ENABLED__` or the manual profiling script.

Manual command examples:

```bash
npm run durability:profile:offseason
npm run durability:profile:offseason -- --seed=1684
npm run durability:profile:offseason -- --phase-timeout-ms=900000
npm run durability:profile:offseason -- --summary
npm run durability:profile:offseason -- --write-report
```

## Environment and hardware limitations

The committed representative report was generated in Node using `fake-indexeddb`, not a browser IndexedDB implementation. Persistence timings are useful for separating simulation CPU from fake-IDB writes, but they should not be treated as browser I/O guarantees. Memory is Node RSS/heap memory, not Chrome renderer memory.

## Seed used

Default and representative seed: `1684`.

## Runtime and memory results

Representative report: `tests/durability/reports/offseason-rollover-profile-seed-1684.summary.json`.

- Rollover completed: `false`.
- Timeout: `120000 ms` waiting for `SIM_TO_PHASE` at `afterSeasonRollover`.
- Total profiled runtime: `140.8 s`.
- Peak RSS: `513 MB`.
- First incomplete stage reported by the profiler: `lifecycle.SIM_TO_PHASE`.
- Active production phase when timing out: draft rollover path.

## Stage timing table

| Rank | Stage or function | Total time | Calls | Avg | Max | Share |
|---:|---|---:|---:|---:|---:|---:|
| 1 | `stage.draft.pick-batch` | 111.71s | 5,550 | 20.13ms | 126.81ms | 79.3% |
| 2 | `draft.sim-batch` | 111.19s | 5,550 | 20.03ms | 126.14ms | 79.0% |
| 3 | `lifecycle.SIM_TO_PHASE` | 19.76s | 2 | 9,877.61ms | 13,414.69ms | 14.0% |
| 4 | `persistence.flushDirty` | 11.48s | 5,635 | 2.04ms | 5,915.35ms | 8.1% |
| 5 | `stage.regular.advance-week` | 7.85s | 18 | 435.99ms | 891.39ms | 5.6% |

## Top hot functions

The top hot operations are the same draft batch loop at two levels of instrumentation: the `SIM_TO_PHASE` draft stage wrapper and the `handleSimDraftPick()` wrapper. Persistence is visible but secondary in this Node/fake-IDB run.

## Draft per-pick timing analysis

The iteration series recorded only 24 completed AI draft-pick selections before the loop stopped making forward progress. After that point, `stage.draft.pick-batch` continued to be called thousands of times. This shows the bottleneck is not simply an expensive late-round pick; it is repeated orchestration against an unchanged user-pick blocker.

## Persistence analysis

`flushDirty()` was called 5,635 times in the representative profile, totaling 11.48 seconds. During durability batch simulation, non-forced flushes drain dirty state into `pendingBatchDirty` instead of writing immediately, then final forced flush writes pending dirty state. That means persistence is not the primary reason the phase cannot reach preseason in Node, although repeated flush calls are measurable overhead.

## Memory analysis

Peak RSS reached 513 MB. Memory rose through full-season simulation and draft setup, but the representative evidence points to repeated draft orchestration as the first-order blocker. This PR does not include speculative memory cleanup.

## Repeated-work findings

| Function/caller | Frequency | Changed inputs | Unchanged inputs | Potential repair |
|---|---:|---|---|---|
| `handleSimToPhase()` → `handleSimDraftPick()` | 5,550 calls | None after user pick is reached | Current pick remains a user pick; draft state does not advance | Teach batch rollover to handle user picks explicitly or choose a production-equivalent auto-pick policy for `SIM_TO_PHASE` only. |
| `handleSimDraftPick()` startup work | 5,550 calls | Usually no pick advancement after user pick | Draft pool/current pick unchanged | Add a guard/result signal so the outer loop stops or handles the user pick instead of retrying. |
| `flushDirty()` | 5,635 calls | Dirty state often empty/drained | Batch-sim persistence mode unchanged | Avoid no-op flush attempts inside the stuck loop after the lifecycle orchestration fix. |

## Run-to-run variance

The script performs two primary profiles by default. The committed representative report includes a comparison object. The dominant draft batch totals were stable within about 1% across the two attempts captured in the report, confirming a structural bottleneck rather than random timing noise.

## Whether rollover completed

The representative run did not complete. It did not reach `preseason`, so no full rollover success is claimed.

## First incomplete stage

The profiler's coarse active stage at timeout was `lifecycle.SIM_TO_PHASE`; the production sub-path was the draft stage, specifically repeated `handleSimDraftPick()` batches after user-pick progress stopped.

## Confirmed non-bottlenecks

In this profile, free agency, combine advancement, offseason advance, and playoff advancement were not dominant. Persistence was material but not the reason the worker failed to reach preseason.

## Safe optimization candidates

No production optimization was included in this PR. Safe follow-up work should first fix the lifecycle progress semantics for user picks during batch rollover.

## High-risk optimization candidates

Do not start with broad draft-board caching, free-agency batching, progression changes, retirement changes, scouting changes, draft talent changes, or save-schema changes. Those risk behavior changes and are not necessary to address the measured first blocker.

## Recommended PR #1687 scope

Recommended title: **#1687 — SIM_TO_PHASE Draft User-Pick Auto-Advance V1**.

Scope: make `SIM_TO_PHASE('preseason')` advance through user-owned draft picks using an explicit production-equivalent policy, with deterministic parity tests proving the lifecycle reaches preseason and preserving existing manual draft behavior outside batch rollover. This is narrower than a broad offseason optimization and attacks the measured no-progress loop.

## Explicit do-not-touch list

Do not change draft talent generation, scouting math, prospect value math, free-agency behavior, contract rules, progression, retirement, schedule generation, save schema, worker protocol, or UI in this profiling PR.

## Raw report location

Committed summary report: `tests/durability/reports/offseason-rollover-profile-seed-1684.summary.json`.

Large raw traces are not committed. Generate locally with:

```bash
npm run durability:profile:offseason -- --seed=1684 --phase-timeout-ms=900000 --write-report
```
