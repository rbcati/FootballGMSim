# Long-Save Durability Harness (V1)

## 1. Purpose

Prove **exactly where multi-season saves fail**. This is a deterministic,
automated franchise-simulation harness that drives the **real production
lifecycle** over many seasons and answers, repeatably:

- how many seasons complete;
- where the first failure occurs (season, phase, week, entity);
- which invariant fails;
- whether the failure is deterministic;
- whether save/reload changes the result;
- which repair PR should come next.

It is **test infrastructure and evidence gathering**, not a gameplay-balance or
broad-repair change. It does **not** re-implement any simulation, schedule,
draft, progression, free-agency, or offseason rule — it invokes the production
worker and validates the state the game itself produces.

### Review-blocker fix status

The follow-up review fixes are intentionally narrow and live in the harness layer:

- `LifecycleDriver.simToPhase()` must throw a structured lifecycle error if retry calls are exhausted before the requested target phase is reached.
- Bounded runs that stop at `playoffs` or `offseason` must not increment `seasonsCompleted`; they instead report `competitiveSeasonsCompleted`, `completedThrough`, `boundedRun`, and `unexercisedLifecycleStages`.
- The committed bounded report is named `long-save-1-season-bounded.json` / `.summary.json` to avoid implying a completed offseason rollover.
- DB-backed draft-pick validation reads every persisted pick instead of only valid-owner index buckets, and explicit depth-chart IDs are validated against the active roster.

## 2. Architecture findings (pre-task investigation, verified against `main`)

| Question | Finding |
|---|---|
| Production league initializer | `buildDefaultLeague` (`src/data/defaultLeague.ts`), invoked through the worker's `USE_SAFE_STARTER_LEAGUE` handler (`src/worker/worker.js:2679`). Validated by `getPlayableLeagueValidation`. |
| New-franchise creation path | `USE_SAFE_STARTER_LEAGUE` is a **real production path** — it is the safe-boot fallback used by the UI (`src/ui/App.jsx` `handleSafeStarterLeague`, `src/ui/hooks/useWorker.js`). It seeds RNG via `Utils.setSeed(options.rngSeed)` and persists through the real DB layer. |
| Season lifecycle orchestrator | `SIM_TO_PHASE` (`handleSimToPhase`, `src/worker/worker.js:5172`) is the single batch orchestrator. It internally calls `handleAdvanceWeek` (regular/playoffs/preseason), `handleAdvanceOffseason` (resign), `handleAdvanceFreeAgencyDay`, `handleAdvanceCombineWeek`, `handleStartDraft`/`handleSimDraftPick` (draft), and rolls into the next season. **`ADVANCE_WEEK` is intentionally rejected during the offseason** — `SIM_TO_PHASE` is the only correct way to advance it. |
| One function advances a full season? | Yes — `SIM_TO_PHASE({ targetPhase: 'preseason' })` advances a complete season (regular → playoffs → offseason → draft → FA → rollover) up to its internal iteration cap (`MAX_ITERATIONS=800`, draft inner guard `500`). |
| User decisions required? | No — the batch path uses `skipUserGame:true` and AI automation for all decisions; deterministic defaults exist. |
| Cache / global state reset | The worker holds a module-level `cache`. `USE_SAFE_STARTER_LEAGUE` calls `clearAllData()` + `cache.reset()` + `cache.hydrate(...)`, so re-initializing fully resets in-memory + DB state between runs. |
| Headless worker-only path | Yes — `src/testSupport/dynastySoakRunner.js` exposes `loadWorkerModule()` + `dispatchWorker()`, a `postMessage` bridge that runs the real worker in Node with `fake-indexeddb`. **This is the same worker the browser uses**, not a shortcut engine. The harness reuses this bridge. |
| Existing multi-season utilities | Yes — the **dynasty soak** stack (`scripts/dynasty-soak.mjs`, `src/testSupport/dynastySoak*.js`, `src/core/dynastySoakAudit.js`). This harness is complementary: it adds a phase-aware, separately-importable invariant framework, checkpoint save/reload validation, and a stable machine-readable report. |
| Save serialization / reload | Real path: `SAVE_NOW` flushes the cache to IndexedDB via `src/db/index.js`; `LOAD_SAVE` rehydrates. The full pool (including free agents, which are **not** in the rostered-only `FULL_STATE` view) is read back through `Players.loadAll()` / `Teams.loadAll()` / `DraftPicks.loadAll()` / `Meta.load()` so orphaned pick owners are still visible to reference checks. |
| In-memory storage adapter | `fake-indexeddb` provides the Node-side IndexedDB; no browser required. |
| Regular vs playoff records | Regular-season W/L/T live on `team.wins/losses/ties`; playoff outcomes are separate (`championTeamId`, `playoffSeeds`). Game counts differ per team — playoffs are evaluated separately and never folded into per-team regular-season expectations. |
| History / awards archive | `meta.leagueHistory[]` (completed seasons), `meta.awardHistory` / `meta.franchiseAwards`, `meta.retiredPlayers`, `meta.recordBook`. Surfaced in the view + persisted. |
| Transitional phases | `offseason_resign`, `offseason`, `free_agency`, `draft_combine`, `draft` legitimately permit temporarily incomplete rosters, unsigned rookies, and cleared champions. |

### Key determinism finding

Game simulation, draft generation, injuries and progression are seeded through
`Utils.setSeed` (`src/core/utils.js`). **However, many production modules still
call unseeded `Math.random()`** — e.g. `aiTradeEngine`, `aiToAiTradeEngine`,
`aiFaEngine`, `aiRetentionLogic`, `playerMoraleEngine`, `coachingEngine`,
`eventSystem`, `waiverEngine`, `ownerPressureEngine`, `legacyEngine`,
`teamIdentityEngine`, `leaguePulse`, `staff-system`. Consequently **full
byte-for-byte determinism across runs is not currently guaranteed**. This is
recorded as a *non-deterministic behavior* finding (see §22). Per the task
scope, **no broad RNG rewrite is performed here.** The harness therefore
compares a *normalized canonical outcome* for its determinism check, not raw
state.

### Key performance finding

The **offseason (draft + free agency over 32 teams) dominates runtime**. A full
season's regular + playoffs completes in ~15s headless, but the
offseason→preseason rollover (224 AI draft selections with scouting evaluation +
FA waves) can take **several minutes**. This is why the existing dynasty-soak
"full" profile is manual-only, and it drives the CI tiering below (§17).

## 3. Production lifecycle path used

```
INIT
USE_SAFE_STARTER_LEAGUE { rngSeed, userTeamId:0 }   → afterInit checkpoint
loop season s = 1..N:
  SIM_TO_PHASE 'playoffs'    → afterRegularSeason checkpoint
  SIM_TO_PHASE 'offseason'   → afterPlayoffs checkpoint
  SIM_TO_PHASE 'preseason'   → afterSeasonRollover checkpoint (+ DB pool)
  [durability checkpoint] SAVE_NOW → LOAD_SAVE → afterReload checkpoint
```

The driver (`tests/durability/lifecycleDriver.js`) is **thin**: it only invokes
these production messages in order and gathers state. All season business rules
stay inside the worker.

## 4. Real league initializer used

`USE_SAFE_STARTER_LEAGUE` with `{ slotKey: 'save_slot_1', options: { rngSeed:
<seed>, userTeamId: 0, name: 'Durability <seed>' } }`. No synthetic teams,
rosters, schedules, or contracts are constructed. The seed is the only
deterministic input, and it is a first-class option of the production handler.

## 5. Seed & determinism behavior

- Default seed: **1684** (`DEFAULT_SEED`, overridable with `--seed=<n>`).
- The seed flows to `Utils.setSeed` inside the real initializer.
- Determinism is checked with `runDeterminismCheck` (two clean runs, normalized
  outcome comparison). Because of the unseeded `Math.random()` sources above,
  the normalized comparison — not raw state — is authoritative; excluded
  volatile fields are documented in §13.

## 6. Harness structure

```
tests/durability/
  lifecycleDriver.js        # thin production-lifecycle driver + DB pool reader
  longSaveHarness.js        # orchestrator: modes, checkpoints, fail-fast/collect-all, determinism
  report.js                 # stable machine-readable report + console formatter
  cli.js                    # pure arg parsing + report file I/O
  longSaveHarness.test.js   # pure invariant unit tests + bounded real-lifecycle smoke
  reports/                  # committed representative reports (stable filenames)
  invariants/
    helpers.js  bounds.js  derive.js  index.js   # framework + registry
    roster.js  cap.js  draft.js  freeAgency.js  schedule.js
    progression.js  retirement.js  history.js  references.js
    numericSafety.js  saveReload.js
scripts/long-save-durability.mjs   # node entrypoint (loads fake-indexeddb first)
vitest.durability.config.ts        # dedicated config for the focused test
```

Lifecycle driving, invariant evaluation, report formatting and the test entry
point are separated so follow-up PRs can add invariants without touching one
giant file.

## 7. Fail-fast mode (default)

Stops at the **first** invariant failure or lifecycle exception and reports the
exact season, phase, week and entity. Intended for CI and focused debugging.

## 8. Collect-all mode (`--collect-all`)

Continues as far as safely possible, accumulating every invariant failure,
grouped by checkpoint (season + phase) in `report.checkpoints[]`. A lifecycle
crash still stops the run, but all failures discovered beforehand are preserved.

## 9. Checkpoint definitions & mapping

| Harness checkpoint | Real league phase reached | Notes |
|---|---|---|
| `afterInit` | `regular` (week 1) | full DB pool + probes |
| `afterRegularSeason` | `playoffs` | view-only |
| `afterPlayoffs` | `offseason_resign`/`offseason` | champion present; full DB pool |
| `afterSeasonRollover` | `preseason` (next year) | full DB pool + probes; save/reload baseline |
| `afterReload` | `preseason` (reloaded) | at durability checkpoints only |

The task's finer-grained checkpoints (after draft, after free agency, before/
after rollover) are **bundled** into the `SIM_TO_PHASE 'preseason'` transition
because the production offseason (draft → FA → rollover) advances as one
orchestrated batch that cannot be paused between those sub-phases without
driving internal worker handlers directly (out of scope for a thin driver).
`afterSeasonRollover` therefore represents the post-draft, post-FA, post-rollover
state, and this mapping is asserted honestly rather than faked.

## 10. Invariants

Each returns structured results `{ id, status, season, phase, week, entityType,
entityId, message, details }`. Categories & ids:

- **roster** — `size-within-legal-range`, `no-duplicate-membership`,
  `no-intra-team-duplicates`, `entries-have-valid-id`,
  `team-id-agrees-with-ownership`, `no-roster-and-free-agent-overlap`,
  `no-missing-player-reference`.
- **cap** — `aggregates-finite`, `contract-values-safe`,
  `contract-years-non-negative`.
- **schedule** — `standings-finite`, `games-reference-valid-teams`,
  `no-self-games`, `completed-games-have-result`, `champion-valid`.
- **progression** — `ovr-within-bounds`, `ratings-numeric-safe`,
  `active-age-reasonable`, `no-duplicate-ids`.
- **retirement** — `retired-not-active`, `ledger-valid-ids`,
  `no-impossibly-old-actives`.
- **draft** — `pick-single-owner`, `pick-references-valid-team`,
  `pick-round-season-valid`, `pick-population-bounded`,
  `no-duplicate-class-seasons`.
- **freeAgency** — `pool-size-bounded`, `no-duplicate-player-ids`,
  `no-multi-team-players`, `status-coherent`.
- **history** — `season-archive-exists`, `accumulates`,
  `champion-refs-valid`, `no-duplicate-seasons`, `award-refs-valid`.
- **references** — `player-to-team`, `depth-chart-to-roster`, `pick-to-team`,
  `offer-to-entities`.
- **numericSafety** — `durable-state-finite` (bounded recursive NaN/±Infinity
  scan with a schema-aware denylist).
- **saveReload** — `canonical-summary-stable`.

Bounds (roster 53/90, cap hard-cap 301.2, OVR 40–99, ages, draft 7×32, pool
envelope) are sourced from `src/core/constants.js` and documented with rationale
in `tests/durability/invariants/bounds.js`. They are **safety guards, not
balance rules.**

## 11. Phase-aware activation rules

Phase-aware invariants classify on the **actual league phase**
(`ctx.view.phase`), never on the harness checkpoint label.

- Roster **size** limits (53-man band) apply only in stable phases
  (`regular`/`playoffs`/`preseason`). During `offseason*`/`draft*`/`free_agency`
  the floor relaxes to "team owns ≥1 player, ≤ absolute ceiling".
- `history.season-archive-exists`/`accumulates` activate only at
  `afterSeasonRollover` for season ≥ 2 (season-1 archive semantics are skipped
  to avoid a transitional false positive).
- `schedule.champion-valid` activates in offseason/preseason; a champion cleared
  immediately after rollover is a **skip**, not a fail.
- `freeAgency.*`, `roster.no-roster-and-free-agent-overlap`, `references.player-
  to-team`, `progression.*` and `retirement.*` require the full DB pool; at
  view-only checkpoints they **skip with a reason**.

Every skip carries a documented reason; the registry demotes any reasonless skip
to a harness-bug failure.

## 12. Known false-positive risks

- **Offseason roster dips** — mitigated by phase-aware size floors.
- **Cleared champion after rollover** — treated as skip.
- **Unsigned rookies between draft and contract assignment** — the harness never
  asserts rookies must be signed at `afterSeasonRollover`.
- **Award omission** — optional awards the production system legitimately omits
  are not required; award checks only validate references when awards exist.
- **Pool-size envelope** — deliberately wide (`POOL.MAX_PLAYERS`) so normal
  churn never trips; only order-of-magnitude growth/collapse fails.
- **Draft-year pick population** — comp picks add slack (`MAX_PICKS_ENVELOPE`).

## 13. Save/reload strategy

At each durability checkpoint: capture a canonical pre-save summary → `SAVE_NOW`
→ `LOAD_SAVE` (real hydration) → re-read DB pool → re-run applicable invariants →
compare canonical summaries.

- **Compared for exact equality:** year, week, phase, teamCount,
  playerPoolSize, freeAgentCount, completedSeasonCount, championTeamId,
  userTeamId, and fingerprints for cap totals, roster membership, and draft-pick
  ownership.
- **Reconstructed / excluded (not compared):** derived view-only fields
  (`nextGameStakes`, `ownerApproval`, `fanApproval`, `mediaStories`,
  standings-tie ordering), narrative logs, and cache-only counters — these are
  rebuilt on hydration and are not part of the durable contract.

After reload the run **continues** into the next season, proving the save
remains playable, not merely parseable.

## 14. Report schema

Stable JSON (see `report.js`, `DurabilityReport`):

```jsonc
{
  "harnessVersion": "1.0.0", "gitSha": "…", "seed": 1684,
  "mode": "1-season", "failureMode": "fail-fast",
  "requestedSeasons": 1, "seasonsAttempted": 1, "seasonsCompleted": 0,
  "competitiveSeasonsCompleted": 1, "completedThrough": "afterPlayoffs", "boundedRun": true,
  "runtimeMs": 0, "peakMemoryMb": 0,
  "deterministic": null, "determinismDetail": null,
  "firstFailure": null,            // {season,phase,invariantId,entityType,entityId,message}
  "lifecycleException": null,
  "saveReload": [ { "season": 1, "phase": "afterReload", "ok": true, "mismatches": [] } ],
  "checkpoints": [ { "season", "phase", "week", "summary": {pass,fail,skip}, "results": [ … ] } ],
  "summary": { "passed": 0, "failed": 0, "skipped": 0 },
  "crashBlockersPatched": [], "deferredFindings": [],
  "recommendedNextRepairPR": null
}
```

`toSummaryJSON()` drops pass/skip result bodies (keeps failures + per-checkpoint
counts) for commit-safe long-run artifacts.

## 15. Commands

| Command | What |
|---|---|
| `npm run durability:test` | **Required-tier** focused tests: all pure invariant unit tests + a **bounded real-lifecycle smoke** (real worker, init→regular→playoffs, ~18s). |
| `npm run durability:smoke` | 1-season full lifecycle incl. rollover + save/reload. |
| `npm run durability:5` | 5-season durability. |
| `npm run durability:10` | 10-season durability (manual). |
| `npm run durability:20` | 20-season durability (manual). |
| `npm run durability:report` | Regenerate committed 1- and 5-season reports. |
| `… -- --collect-all` | Collect-all failure mode. |
| `… -- --seed=1234` | Custom seed. |
| `… -- --determinism` | Two clean runs + determinism verdict. |
| `… -- --write-report --summary` | Write full + compact reports (stable names). |

## 16. Runtime & peak-memory benchmarks

Measured headless (Node 22, `fake-indexeddb`, seed 1684) on the CI-class
container used for this PR:

| Mode | Wall-clock | Peak RSS | Seasons completed | Notes |
|---|---|---|---|---|
| `durability:test` (units + bounded real smoke) | **~18 s** | ~0.3 GB | n/a (init→regular→playoffs) | 29 tests |
| 1-season, `--stop-phase=offseason` (+ save/reload) | **~23.3 s** | **377 MB** | 0 full rollover / 1 competitive (bounded) | 126 pass / 0 fail / 31 skip — see `reports/long-save-1-season-bounded.json` |
| 1-season, full rollover (default) | **did NOT complete in-window** | — | 0 | offseason draft rollover dominates (see below) |
| 5-season, full rollover, 5-min phase budget | **~315 s** then phase-timeout | **508 MB** | 0 | 91 pass / 0 fail / 26 skip through `afterPlayoffs`; timed out in the season-1 rollover — see `reports/long-save-5-season.json` |
| 10-season / 20-season | manual; blocked by same rollover cost | — | — | commands left available |

Per-phase costs (seed 1684, representative): boot ~0.3 s; `SIM_TO_PHASE
playoffs` (full regular season) **~9.4 s**; `SIM_TO_PHASE offseason`
(retirements/re-signings) **~5.0 s**; `SIM_TO_PHASE preseason` — the
draft/FA rollover — is the **dominant, blocking cost**: the `draft` phase runs
at **~7 s per batch iteration** and did not reach `preseason` within a 5-minute
budget (instrumented: still drafting at 12+ minutes). See §22.

> Because a single full-season rollover exceeds any practical CI budget, the
> **committed 1-season report is bounded at the offseason checkpoint** (it still
> exercises init → regular → playoffs → offseason + a full save/reload), and the
> **committed 5-season report is the honest partial artifact** from attempting
> the full rollover with a 5-minute phase budget. Both are regenerated by
> `npm run durability:report`.

### 10- and 20-season modes (manual) — commands & measured result

```
npm run durability:10   # tsx scripts/long-save-durability.mjs 10-season
npm run durability:20   # tsx scripts/long-save-durability.mjs 20-season
```

**Measured result:** not attempted to completion. Both modes reuse the same
lifecycle driver and would each need to complete the season-1 offseason
rollover first, which does not finish within the execution window (see the
performance limitation in §22). They are left available for manual runs on
hardware/time budgets that can absorb the offseason cost, e.g. with a large
`--phase-timeout-ms` and `--collect-all`. **This PR does not claim either mode
passed.**

## 17. CI tier placement (measurement-driven)

- **Required on every PR:** `npm run durability:test` (~12 s). It exercises the
  real production lifecycle through playoffs plus the full invariant framework,
  and is fast + stable.
- **Optional / scheduled:** `durability:smoke` (1 full season). Because the
  offseason rollover costs minutes, the full-season run is **not** a required
  per-PR gate.
- **Manual only:** `durability:5`, `durability:10`, `durability:20`.

Per task scope: the 10- and 20-season modes are **not** added to required PR CI,
and the full-season modes are demoted from required CI purely on measured cost —
not because they currently pass or fail.

## 18. How to add a new invariant

1. Create `tests/durability/invariants/<name>.js` exporting `id` and
   `check(ctx) => Result[]` (use `pass`/`fail`/`skip` from `helpers.js`; classify
   phase with `gamePhase(ctx)`; source any bound from `bounds.js`).
2. Register the module in `invariants/index.js` `INVARIANT_MODULES`.
3. Add a fixture-driven unit test in `longSaveHarness.test.js`.
No orchestrator edits are required.

## 19. How to reproduce a failure

Run the same mode + seed the report records: `npm run durability:smoke -- --seed=<seed>`.
`report.firstFailure` names the season, phase, invariant id and entity. Use
`--collect-all` to see every failure at once, and `--write-report` to capture
the full JSON for a repair PR.

## 20. How to change the seed

`--seed=<n>` on any `durability:*` script (default 1684). The seed is threaded
into `Utils.setSeed` through the real initializer.

## 21. Crash blockers patched

`<!-- CRASH_BLOCKERS -->` None required for V1 — the harness reached its
checkpoints without a production crash on the exercised path. Any future
crash-blocker fix will be listed here with before/after behavior and regression
coverage, per the crash-blocker policy.

## 22. Current findings

Classified per the required taxonomy:

- **performance limitation (top priority)** — the offseason **draft rollover
  does not complete within a practical window**. Instrumented on seed 1684, the
  `draft` phase advances at ~7 s per batch iteration and was still drafting at
  12+ minutes; the committed 5-season run times out in the season-1 rollover
  after a 5-minute phase budget (`reports/long-save-5-season.json`,
  `lifecycleException.classification: "performance-timeout"`). This blocks
  full-season and multi-season completion and is the recommended next repair
  (see §23). **Root-cause note:** the `SIM_TO_PHASE` batch loop re-enters the
  `draft` phase branch across many outer iterations rather than draining the
  draft in one pass — a profiling target, not a state-corruption bug.
- **non-deterministic behavior** — unseeded `Math.random()` in multiple
  production modules (see §2). Prevents byte-for-byte determinism guarantees;
  documented, not rewritten in this PR. The determinism check therefore compares
  a normalized outcome.
- **phase-model uncertainty** — draft/FA/rollover sub-phases are bundled into one
  `SIM_TO_PHASE 'preseason'` batch; finer checkpoints would require driving
  internal worker handlers.
- **test-harness limitation** — free agents are absent from the rostered-only
  `FULL_STATE` view; pool-dependent invariants require a `SAVE_NOW` + DB read and
  skip at view-only checkpoints.

**No invariant failures or save/reload divergences were found on the exercised
path.** Through `afterInit`, `afterRegularSeason`, `afterPlayoffs`, and (bounded)
`afterReload`, the committed runs report **0 invariant failures** and a clean
save/reload (`saveReload.ok = true`). The multi-season signal is currently
gated by the performance limitation above, not by a state-integrity failure.

## 23. Recommended follow-up repair PRs

Ordered:

1. **Offseason performance profiling** — reduce draft/FA headless cost so
   full-season durability modes are CI-viable.
2. **RNG seeding completeness** — thread the seeded RNG through the unseeded
   `Math.random()` modules to enable true reproducibility (behavior-preserving).
3. **Finer offseason checkpoints** — optional harness enhancement to validate
   post-draft and post-FA states separately.
4. Any concrete state-integrity failure surfaced by a durability run gets its own
   repair PR named by `report.recommendedNextRepairPR`.

## 24. Explicit do-not-touch list

This PR and its follow-ups must **not**:

- change gameplay balance, progression, retirement, contract, cap, draft-value/
  talent, or AI decision weights;
- change worker protocol, save schema, or UI behavior;
- add new feature surface;
- introduce a synthetic league generator or a parallel simulation engine;
- re-implement production lifecycle rules inside the harness;
- perform a broad worker or RNG refactor;
- add the 5/10/20-season modes to required PR CI;
- weaken an invariant to hide corruption (only phase-aware, documented skips are
  allowed).
