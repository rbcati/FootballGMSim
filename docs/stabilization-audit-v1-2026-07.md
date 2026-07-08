# Whole-Codebase Stabilization Audit + Safe Fixes V1 — July 2026

Scope: stabilization and risk-reduction pass across app stability, worker/action
architecture, simulation safety, UI/UX integrity, and test gaps. Only localized,
low-risk, testable P0/P1 fixes were implemented; everything else is recorded
here as the handoff roadmap.

Baseline before changes: 428 unit test files / 5346 tests, all passing.

---

## A. Audit summary

| # | Area | Issue | Severity | Why it matters | Status |
|---|------|-------|----------|----------------|--------|
| 1 | Worker actions — release/cut | `handleReleasePlayer` ignored the `releasePlayerWithValidation` outcome. A failed release (player not found / not on the selected roster — stale UI, double-click, wrong team) posted a normal `STATE_UPDATE` and no `ERROR`, so the UI (Roster, Decision Board "dispatched" copy) treated the failure as success. | **P1** | Fire-and-forget action overstated success; user believes a cut happened when it did not. | **Fixed** |
| 2 | Worker actions — bulk release | `toUI.SUCCESS` was posted by `handleBulkReleasePlayers` but never defined in `protocol.js` → messages went out with `type: undefined`. Separately, `STATE_UPDATE` was posted with the request id *before* `SUCCESS`, so the caller's promise (which resolves on the first message carrying the id) resolved with the view-state payload — no `ok`/`released`. | **P1** | Combined with #3, every successful bulk release was reported to the user as a failure. | **Fixed** |
| 3 | UI — Roster bulk release | `confirmBulkRelease` read `result?.ok` from a `{ type, payload }` envelope (always `undefined`) → success showed the "Bulk release stopped after 0 release(s): Unknown error" alert. A rejected promise (worker ERROR on partial stop) escaped the handler → unhandled rejection, preview modal stuck open, selections not cleared. | **P1** | Incorrect user-facing outcome reporting on a destructive action; stuck modal on partial failure. | **Fixed** |
| 4 | Hidden data leak | `buildViewState()` serialized raw cache player objects into `league.teams[].roster`, including `hiddenTrueOvr` — the hidden draft-variance anchor documented as "internal-only and must never be rendered" (`draftVariance.js`). Not rendered by any component (sentinel tests cover that), but fully inspectable from the UI thread via devtools/console. | **P1** | Defeats the hidden draft-variance system for savvy users; contradicts the documented data contract. | **Fixed** (field stripped worker-side) |
| 5 | Hidden data leak | `hiddenDevTrait` is serialized to the UI pre-reveal (the reveal helpers need to know it exists to render the "Hidden" chip). The *value* is devtools-inspectable before the ~2-season reveal. | P2 | Softer leak than #4; masking it requires a worker-side reveal computation and a UI contract change (e.g. `hasHiddenDevTrait` boolean + value only after reveal). | Deferred |
| 6 | Data-path inconsistency | `GET_ROSTER` (rosterHandlers.js) whitelists player fields and does **not** include `hiddenDevTrait`/`ovrHistory`, while `league.teams[].roster` (buildViewState) does. Screens fed by `getRoster` can never show the dev-trait row; screens fed by league state can. | P2 | Feature appears/disappears depending on which data path fed the screen. | Deferred |
| 7 | Advance Week flow | `WEEK_COMPLETE` reducer replaces `league.teams` with slim standings rows (no roster/cap fields) until the follow-up `STATE_UPDATE` restores full teams. One-message window of empty roster/cap data; RosterHub's guards render empty states rather than crash. | P2 | Transient flash only, self-heals within the same message batch; a reducer merge (instead of replace) would remove it. | Deferred |
| 8 | UI feedback | `handleTag` / `handleRestructure` in Roster.jsx `await` request-based actions with no try/catch → worker ERROR causes an unhandled rejection. The global error banner still appears (the hook's message switch dispatches `ERROR` even after rejecting the pending promise), so user feedback exists; the rejection is console noise. | P3 | Console noise; feedback path already works via the banner. | Deferred |
| 9 | Dead code | `handleApplyFranchiseTag` computes an unused `baseline` variable. | P3 | Cosmetic. | Deferred |
| 10 | Free agency | `handleGetFreeAgents` top-bid loop reads `o.contract.baseAnnual` without a null guard on `o.contract`. All current offer-creation paths attach a contract, so no observed crash path. | P3 | Would only bite if a malformed offer ever persisted. | Deferred (report-only) |
| 11 | Save/migration | `migrateSaveMetaToCurrent` chain reviewed (v0 → 5.7): monotonic version bumps, no gaps, future-versioned saves pass through untouched. `migrateV56ToV57` uses `String(Math.random())` only as a last-resort offer-id fallback. | OK | — | No action |
| 12 | Draft | `buildDraftStateView` prospects are whitelisted; `trueOvr` explicitly not exposed. `truePotential` **is** exposed alongside fogged `potential` — appears intentional (existing UI consumes it), flagging for owner review. | P2/report | If unintended, scouting fog on potential is defeated. Do not change without product intent. | Deferred (needs owner decision) |
| 13 | Decision Board execution | `rosterDecisionCommitPlan` / `rosterDecisionCommitExecution` / `RosterDecisionBoard` reviewed: stale-plan guard, re-entrancy ref, dispatched-vs-applied copy, and id-only payloads are all correct. Release entries reported as "dispatched" are accurate — and with fix #1, a failed dispatch now surfaces through the error banner instead of silently passing. | OK | — | No action |
| 14 | useWorker hook | Epoch/boot-scope stale-packet guards, request timeout handling, duplicate-id guard, and localStorage manifest mirroring reviewed — sound. `send()`-based actions clear `busy` via `STATE_UPDATE`/`ERROR` in all paths after fix #1. | OK | — | No action |
| 15 | Franchise tag / player management | `handleApplyFranchiseTag` (team/player/phase validation) and `handleUpdatePlayerManagement` (whitelisted enums, no-op rejection) reviewed — sound. | OK | — | No action |

## B. Fix summary

### Fix 1 — Failed single release silently succeeded
- **Files:** `src/worker/worker.js` (`handleReleasePlayer`)
- **Before:** validation outcome discarded; failed release posted a success-shaped `STATE_UPDATE`.
- **After:** failure posts `ERROR` ("Release failed: …") with the request id and returns; the reducer surfaces it in the error banner and clears `busy`. Success path unchanged. `releasePlayerWithValidation` is mutation-free on failure, so no flush/refresh is needed on that branch.
- **Tests:** `src/worker/__tests__/releaseHandlerGuards.test.js` (source-sentinel suite, matching the repo's `loadPipelineRegression.test.js` idiom for the worker monolith).

### Fix 2 — Bulk release protocol + ordering
- **Files:** `src/worker/protocol.js`, `src/worker/worker.js` (`handleBulkReleasePlayers`)
- **Before:** `toUI.SUCCESS` undefined (`type: undefined` on the wire); `STATE_UPDATE` carried the request id and resolved the caller's promise before `SUCCESS` was posted.
- **After:** `SUCCESS` defined in the protocol; posted with the request id *before* the refresh `STATE_UPDATE` (which no longer carries the id). Failure path ERROR now includes the released-so-far count and still refreshes state.
- **Tests:** `releaseHandlerGuards.test.js` — protocol contract (`toUI.SUCCESS` defined; no undefined `toUI.*` member used anywhere in worker.js), ordering assertions, id-free refresh posts.

### Fix 3 — Roster bulk release confirm flow
- **Files:** `src/ui/components/Roster.jsx` (`confirmBulkRelease`)
- **Before:** read `result?.ok` (always undefined) → false failure alert on every success; rejection escaped → stuck modal + unhandled rejection.
- **After:** reads `result?.payload?.ok`; try/catch surfaces the worker's rejection message via the existing alert; `finally` always closes the modal, clears selection, refetches.
- **Tests:** `src/ui/components/__tests__/RosterBulkRelease.test.jsx` — full UI drive (bulk mode → select visible → preview → confirm) for both the success path (no alert, modal closes, correct payload `(teamId, [ids])`) and the rejected path (worker message alerted, modal closes).

### Fix 4 — `hiddenTrueOvr` stripped from UI payloads
- **Files:** `src/worker/viewStateStats.js` (new `sanitizeRosterForClient`), `src/worker/worker.js` (`buildViewState` wraps each team roster)
- **Before:** every `FULL_STATE`/`STATE_UPDATE` carried `hiddenTrueOvr` for every rostered player.
- **After:** the field is deleted from shallow copies before posting; players without the field pass through uncopied; canonical cache objects never mutated; `hiddenDevTrait` intentionally preserved (reveal helpers depend on it). No UI code read `hiddenTrueOvr` (verified by grep + existing DOM sentinel tests), so this is not a behavior change for any component.
- **Tests:** `src/worker/__tests__/viewStateStats.test.js` (4 new cases), plus sentinel assertions in `releaseHandlerGuards.test.js` that `buildViewState` routes rosters through the sanitizer.

## C. Deferred roadmap (next safest PRs, in order)

1. **Pre-reveal masking of `hiddenDevTrait` (from #5) + GET_ROSTER parity (#6).**
   Scope: compute reveal worker-side (`shouldRevealHiddenDevTrait` is pure and already importable), serialize `hiddenDevTrait` only when revealed plus a `hasHiddenDevTrait` boolean; update `getHiddenDevTraitLabel` call sites to use the boolean for the "Hidden" chip; add `hiddenDevTrait`(masked)/`ovrHistory`-derived reveal fields to the `GET_ROSTER` whitelist so both data paths agree.
   Files: `viewStateStats.js`, `worker.js`, `rosterHandlers.js`, `draftVariance.js`, `PlayerProfile.jsx`, `RosterDecisionBoard.jsx` + tests.
   Tests required: reveal-boundary unit tests both sides of the 2-season threshold; DOM sentinel that the raw trait string is absent pre-reveal.
   Risks: UI contract change — coordinate the boolean flag and label helper in one PR. Do NOT change the reveal threshold or trait distribution (simulation balance).
2. **`WEEK_COMPLETE` reducer merge (#7).** Merge standings fields into existing team objects instead of replacing `league.teams`. Files: `useWorker.js` (reducer only) + `workerReducer` unit tests. Risk: verify no consumer depends on the slim shape between the two messages (StandingsCenter reads `league.standings`, not `teams`).
3. **Roster action feedback consistency (#8).** try/catch around `handleTag`/`handleRestructure` mirroring `handleManagementUpdate`'s `setActionError` pattern. Files: `Roster.jsx` + component test. Risk: minimal.
4. **`truePotential` exposure decision (#12).** Needs a product decision before any code change — if it is a leak, fix is a one-line removal in `buildDraftStateView` + sentinel test; if intentional, document it in the field comment.
5. **Dead code / guards (#9, #10).** Remove unused `baseline`; add `o?.contract` guard in the FA top-bid loop. Trivial, bundle with any worker PR.

**What NOT to touch** (re-confirmed during this audit): StateStore/legacyStateBridge (single sanctioned `window.state` writer), simulation math and dev-trait distributions, contract business rules, save schema (no migration bugs found), the epoch/boot-scope guards in `useWorker` (subtle and correct).

## D. Tests run

- Targeted: 21 new/updated tests across `viewStateStats.test.js`, `releaseHandlerGuards.test.js` (new), `RosterBulkRelease.test.jsx` (new) — all pass.
- Related suites: Roster integration, BulkReleasePreviewModal, ReleasePreviewModal, RosterDecisionBoard, workerApi, loadPipelineRegression, rosterDecisionCommitExecution — 59 tests, all pass.
- Full unit suite: `npm run test:unit` — 430 files / 5361 tests, all pass (baseline was 428 / 5346).
- Production build: `npm run build` — succeeds (expected >500KB chunk warning only).
