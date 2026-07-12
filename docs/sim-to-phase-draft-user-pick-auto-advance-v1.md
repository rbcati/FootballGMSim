# SIM_TO_PHASE Draft User-Pick Auto-Advance V1

## Root cause

`SIM_TO_PHASE({ targetPhase: 'preseason' })` entered the draft and called the same `handleSimDraftPick()` path used by the interactive Draft UI. That handler intentionally stopped when `pick.teamId === meta.userTeamId`, so the lifecycle re-entered the unchanged user-owned pick until the outer timeout/guard stopped the rollover.

## Live call path audit

- UI/harness dispatches `SIM_TO_PHASE` through the worker protocol.
- `handleSimToPhase()` loops phases and uses `handleAdvanceWeek`, `handleAdvanceOffseason`, `handleAdvanceFreeAgencyDay`, `handleAdvanceCombineWeek`, then the draft branch.
- Draft branch calls `handleStartDraft()` to initialize the generated class and pick table, then calls `handleSimDraftPick()` in draft batches.
- `handleSimDraftPick()` resolves the user team from `meta.userTeamId`, pauses normal interactive simulation at user-owned picks, evaluates AI-to-AI draft trade-up opportunities, selects a prospect with `buildAiTeamStrategy()`, `AiLogic.calculateTeamNeeds()`, `scoreDraftBoardEntry()`, and `getAIDraftBoardAdjustment()`, then commits with `_executeDraftPick()`.
- `handleMakeDraftPick()` remains the manual user command. It validates that the current pick belongs to the user, validates the selected draft-eligible player, commits through `_executeDraftPick()`, logs the transaction, runs scouting reveal, and transitions after the final pick.
- `_executeDraftPick()` is the canonical mutation point for draft pick data, player team/status/rookie contract, roster/cap recalculation, draft-pick event emission, current pick advancement, and draft state persistence.
- Draft completion in `handleSimDraftPick()` and `handleMakeDraftPick()` runs post-draft minicamp, legality validation, and `handleStartNewSeason()` to reach preseason.
- No worker protocol change was required; the context is an internal Symbol-keyed token on the existing handler call, so public worker payloads cannot forge batch auto-pick authority.

## Behavior contract

Interactive/manual behavior remains default-safe. `SIM_DRAFT_PICK` callers do not pass the internal lifecycle context, so user-owned picks still return a blocked user-pick result and leave `currentPickIndex` unchanged for manual UI control.

Batch lifecycle behavior is explicit. Only the `SIM_TO_PHASE` draft branch passes the internal Symbol-keyed context, allowing the preseason rollover to make a real user-owned pick through the same weighted draft-board selector used for AI picks.

## Selection path and trade-up decision

The prospect-selection scoring previously embedded in `handleSimDraftPick()` is now factored into `selectCanonicalDraftProspectForTeam()`. It preserves the existing inputs: team roster, AI team strategy, team needs, positional priority, scheme/board scoring, upside, combine/interview adjustment, risk tiebreaking, and same-session need-group hoarding penalty.

The batch user auto-pick does **not** add autonomous user trade acceptance. AI-to-AI trade-up behavior is preserved. User-owned batch picks are made at the currently owned slot using the canonical selection helper and `_executeDraftPick()`.

## No-progress contract

`handleSimToPhase()` now captures draft progress state before and after each draft batch. A batch must advance the pick index, change pick identity, complete the draft, or change phase. Blocked/error results are treated as lifecycle stops rather than progress, and unchanged state throws `DRAFT_BATCH_NO_PROGRESS` with season, phase, pick index, pick identity, and team ID.

## Files changed

- `src/worker/worker.js` (draft lifecycle context, no-progress guard, shared selector, and prospect class size alignment with compensatory picks)
- `src/worker/__tests__/simToPhaseDraftAutoPickRegression.test.js`
- `tests/integration/simToPhaseDraftAutoPick.worker.test.js`
- `docs/offseason-rollover-performance-profile-v1.md`
- `docs/sim-to-phase-draft-user-pick-auto-advance-v1.md`

## Do-not-touch list honored

No draft scoring weights, prospect generation, hidden development, roster limits, cap rules, free agency, progression, retirement, scheduling, save schema, worker protocol, UI behavior, or persistence optimization were intentionally changed.

## Validation notes

Post-fix validation should compare the preserved #1687 before numbers to the new profiler output: draft-batch calls, completed picks, rollover completion, runtime, flush count, peak memory, and first incomplete stage. The target evidence is not simply speed; it is that user-owned draft picks no longer create an unchanged retry loop.

## Recommended next PR

Choose PR #1689 only from post-fix durability/profiler evidence. If another blocker appears after the draft now progresses, scope that PR to the newly exposed first failure rather than broadening this repair.

## Post-fix validation results (seed 1684)

- Before profile from #1687: 5,550 draft-batch calls, 24 completed picks, 111.7s in draft batch, 5,635 flushes, peak memory 513 MB, timed out before preseason.
- After profiler attempt: draft-batch calls dropped to 1, the draft consumed 225 picks, the unchanged user-pick retry loop was not reproduced, and the rollover moved past the draft. The run then exposed a separate post-rollover roster/history blocker rather than the old draft stall.
- One-season durability: reached preseason 2027 in one `SIM_TO_PHASE('preseason')` call after playoffs/offseason, but failed fail-fast invariants at `afterSeasonRollover` with `roster.size-within-legal-range` for team 0 (roster size 11) and a non-fatal archive warning in `processSeasonRecords()` reading missing `passYd`. Save/reload therefore was not claimed green for the full rollover checkpoint.
- Five-season attempt: attempted 5 seasons, completed 0 full seasons, stopped at the same season-1 post-rollover roster invariant failure.
- Recommended next PR from new evidence: roster-membership integrity repair for post-rollover roster size, with a side audit of the season archive stat shape that produced the `passYd` warning.
