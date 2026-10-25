# Normal franchise generation recovery V1

Base: main `68303625c99d1132fab3e1f935538f0978f66e4d` (PR #1806).

## Reproduction before edits

`npx vitest run tests/integration/normalGeneration.test.js` failed 7/7 tests before production edits. The real `makeLeague(DEFAULT_TEAMS, options, { makeSchedule: makeAccurateSchedule })` was rejected for 2025, 2026 and 2031. **All** validation reasons were `["Missing phase"]` for each year; no roster or schedule rejection was hidden. Three real NEW_LEAGUE dispatches logged `NEW_LEAGUE produced an invalid league payload; falling back to default league.` This is direct worker evidence, independent of the flat-contract playtest fingerprint.

See `normal-generation-before.json` for measurements captured before editing production code and `normal-generation-after.json` for reproducible post-fix measurements. Run `node --import tsx scripts/audit-normal-generation.mjs` to reproduce the latter. Seeds are `1806 + year`. Global save entropy remains independently generated as designed; these summaries concern seeded roster and schedule generation, not deterministic franchise IDs.

## Production trace and consumer assumptions

1. `src/ui/components/NewLeagueSetup.jsx` sends selected team, year, difficulty and advanced settings through `actions.newLeague`.
2. `src/ui/hooks/useWorker.js` dispatches NEW_LEAGUE with team definitions and options.
3. `src/worker/worker.js:handleNewLeague` normalizes settings, chooses configured teams and calls the real `src/core/league.js:makeLeague` with the production schedule and staff factories.
4. `src/state/leagueInit.ts:getPlayableLeagueValidation` requires a phase, year, week, user team (inferred at this pre-persistence boundary), roster data and real scheduled matchups. Previously the generator omitted phase, so the worker replaced the entire roster/schedule/pick payload with `src/data/defaultLeague.ts:buildDefaultLeague`.
5. After validation, the worker slimifies the schedule, validates NFL structure, creates an independent league DB ID and franchise generation ID, flattens players/picks, hydrates the cache and commits Meta, Teams, Players and DraftPicks to IndexedDB. The Saves index is written last. Opening-slot promotion remains governed by PR #1806.
6. Loading uses the existing contract normalizer and depth repair. First-week consumers require coherent opaque player IDs, assigned depth rows, valid cap inputs and canonical `s1_wN_home_away` matchup IDs. Passing boot validation alone does not establish these conditions.

## Focused compatibility repairs

* `makeLeague` owns the canonical initial phase: `regular` by default, `offseason` for the existing explicit offseason start point. The worker persists this value instead of overwriting it with `regular`. No UI patch or validator relaxation.
* Worker creation records `generationDiagnostics: { source, validationReasons }` in existing metadata and exposes it in the view state. Legacy saves need no field or migration. Rejection reasons are logged in full. Invalid generation still takes Safe Starter recovery; explicit Safe Starter remains available. An injected missing-phase result from the **real** generator regression-tests recovery.
* Generated roster cap clamping previously changed flat salary fields while retaining the original nested contract salary. Canonicalize each newly generated player's contract with the existing normalizer **after** clamping, so the first reload cannot resurrect pre-clamp salary. No global contract rules or old-save migration changed.
* Normal players have string IDs. Shared depth helpers coerced these to `NaN`, collapsing identity and applying the same assignment across players. Comparisons now use string keys, while assignments retain original IDs and numeric legacy IDs remain numeric. New creation invokes the existing depth repair routine before persistence. No position counts, roster generation, depth eligibility or optimization policy changed.

## Deterministic roster and assets

All three years: 32 teams, 1,696 roster players, 53 per team; QB 3, RB 4, WR 6, TE 3, OL 9, DL 9, LB 7, CB 6, S 4, K 1, P 1. Season ordinal 1, regular phase, week 1. Schedule: 18 weeks / 272 games. Picks: 672 = 32 teams × 7 rounds × 3 calendar years, beginning at the selected year; original/current owner equal at creation. The generator's actual salaries and 1–5-year distributions are recorded in the JSON evidence, without synthetic players or hard-coded contract fixtures.


| Year / seed | 1 year | 2 years | 3 years | 4 years | 5 years | Salary min / median / max ($M) |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 2025 / 3831 | 362 | 320 | 352 | 322 | 340 | 0.80 / 2.20 / 44.80 |
| 2026 / 3832 | 315 | 357 | 346 | 355 | 323 | 0.80 / 2.70 / 42.10 |
| 2031 / 3837 | 339 | 329 | 355 | 332 | 341 | 0.80 / 2.30 / 44.70 |

## Initial free agency

Initial unsigned count is **zero**, separately from roster size. NEW_LEAGUE flattens only team rosters. `src/worker/handlers/freeAgencyHandlers.js` identifies free agents using `teamId == null || status === 'free_agent'`; normal creation provides neither group. Later releases/expiry/draft flows can populate the pool. This PR adds no unsigned-player generator and does not claim to fix free agency.

## Independent issues / limits

| Issue | Status |
| --- | --- |
| Zero initial unsigned players | Reproduced; independent, remains zero |
| Zero next-draft-pick summary | Independent cache mismatch found: `DraftPicks.byYear(meta.year)` queries `year`, while assets use `season`. Persisted rows and team-owned pick arrays are checked separately; summary-screen behavior not yet proven |
| Inconsistent cap screens | Not tested end to end; creation/reload contract disagreement repaired, no claim about every screen |
| Incorrect position-room assignments | Opaque-ID collapse reproduced and repaired in shared depth helpers; broader room UI not assumed fixed |
| Trade `capHitOf is not defined` | Independent: declaration local to trade validation, references also appear outside that scope in worker trade paths; live trade reproduction not performed |
| Draft React #185 | Not tested; no claim of repair |
| Contract-years progression across seasons | Not tested by creation/first-week checks; no claim of repair |
| Starting Year clamps every input event | Confirmed in NewLeagueSetup; deferred to a separate keyboard/input PR |
| First-playable smoke `.franchise-hq` selector | Updated obsolete class selector to the existing stable `franchise-hq` test ID, retaining the one-HQ and render-boundary assertions |

The draft-year browser regression previously demanded `safe-pick-*` IDs on normal creation. It now requires normal provenance, unique nonempty IDs, correct years/ownership/count and exact reload preservation. This intentionally removes the obsolete fallback fingerprint requirement, not asset validation. Explicit recovery remains covered separately.

## Validation and merge recommendation

Validation applies to code commit `e3e9fb26`; the subsequent commit only completes this report. Node 22 was used for final local checks and CI. Local Playwright used `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`; mobile additionally used `PLAYWRIGHT_VIEWPORT=iphone`. No assertions or existing test time limits were removed or loosened.

| Command / evidence | Exact result |
| --- | --- |
| Pre-change `npx vitest run tests/integration/normalGeneration.test.js` | 7 failed / 7; phase rejection and worker fallback reproduced |
| `node node_modules/vitest/vitest.mjs run tests/integration/normalGeneration.test.js tests/integration/fallbackDraftYear.test.js --maxWorkers=1` | 2 files / **12 passed**, 333.78s; includes real worker Week 1 in all three years, save/reload, forced fallback, older career preservation and historical traded picks |
| `npm run test:soak -- --maxWorkers=1` | 8 files / **103 passed**, 13.50s |
| `npm run test:unit` in CI | **527 files passed / 1 skipped; 6,462 tests passed / 1 skipped**, 220.08s |
| `npm run durability:test` in CI | **9 files / 98 passed**, 233.19s |
| Initial repaired preview: `npx playwright test --config .normal-playwright.config.ts tests/e2e/fresh_franchise_first_week_smoke.spec.js tests/e2e/fallback_draft_year.spec.js` | **5 passed**, 4.0m; temporary config only selected isolated preview port 4174 and `/tmp` output directory; no test overrides |
| Broad final `npx playwright test tests/e2e/fresh_franchise_first_week_smoke.spec.js tests/e2e/fresh_franchise_first_playable.spec.js tests/e2e/new_franchise_slot_isolation.spec.js tests/e2e/fallback_draft_year.spec.js` | **8 passed / 2 failed**, 7.4m; failures: first-week total 120s timeout at standings, and one HQ navigation wait in isolation. Retained as failures, not suppressed |
| `npx playwright test tests/e2e/fresh_franchise_first_week_smoke.spec.js --grep 'fresh franchise first week smoke'` | Desktop repeat: **1 passed**, 1.4m |
| Same command with `PLAYWRIGHT_VIEWPORT=iphone` | Full mobile first-week repeat: **1 passed**, 38.5s |
| `npx playwright test tests/e2e/new_franchise_slot_isolation.spec.js --grep 'new franchise in empty slot'` | Unchanged Week 6 / Slot 2 repeat: **1 passed**, 2.8m. The other three isolation scenarios passed in the broad final run; all four also passed in the earlier run |
| CI `npm run test -- tests/e2e/fresh_franchise_first_week_smoke.spec.js tests/e2e/nfl_schedule_bye.spec.js` | **4 passed**, 1.2m |
| `npm run build` | Passed locally and in Netlify CLI production/preview builds; expected chunk-size warning only |
| `npm run check:netlify-parity` | Passed on Node 22.23.4 |
| `npm run check:netlify-rules` | Passed |
| `npm run check:netlify-cli-build` | Production context passed; build command 39.1s |
| `npm run check:netlify-cli-build:preview` | Deploy-preview context passed; Netlify build 16.7s |
| CI `npm run check:deploy` | Passed; complete parity job including unit and durability: 9m1s |
| `node --import tsx scripts/audit-normal-generation.mjs` | Passed; committed actual measured distributions |
| `git diff --check` | Passed |

CI evidence: [complete unit/durability/deploy job](https://github.com/rbcati/FootballGMSim/actions/runs/40161885734/job/121074992494), [first-session smoke](https://github.com/rbcati/FootballGMSim/actions/runs/40161885734/job/121076631445). CodeQL also passed. [Hosted preview](https://deploy-preview-1807--footballgmsim.netlify.app) built successfully with passing header/redirect checks.

### First-week and preservation evidence

The expanded smoke inspects all 1,696 persisted players, salary/length variation, normal provenance and roster-owned depth IDs; opens Roster and Lineup; reloads before simulation; completes Week 1; views weekly final score and Game Book; opens standings and checks one game in the user's record; then reloads and verifies the same franchise identity, final score and Game Book. Both desktop and iPhone repeats passed with fresh browser contexts against the actual built Netlify preview bundle. Creation and week completion commit through production IndexedDB persistence, not a test-only state substitute.

Worker tests additionally exercise explicit SAVE_NOW / LOAD_SAVE for all three years, compare player IDs/contracts/ratings and stored/team-owned pick rows, verify independent generation IDs, and complete Week 1 followed by another save/reload. The forced-fallback test loads and saves an older fallback career at Week 6, preserves its generation/records/players/picks across a failed creation and a second normal career, and independently reloads both. Browser isolation checks cover the actual slot promotion, cancellation/interruption, failure and generation-guard paths from PR #1806. Historical traded-pick IDs/seasons/owners remain unchanged; no rebase or roster migration is introduced.

### Local-run limitations, retained explicitly

Early Node 24 runs were exploratory; one overlap with Netlify's configured `npm ci` interrupted the local dependency tree. Those runs are not passing evidence. Final redundant local full runs (`npm run test:unit -- --maxWorkers=2`, `npm run durability:test -- --maxWorkers=1`) hit existing stress-test time limits under concurrent load on the two-CPU environment: stat attribution 5s, engine soak 30s, and the 18-week durability attribution case 480s. They were stopped after the complete independent CI runs passed; no local full-suite completion or green local durability claim is made.

The stat-attribution timeout was independently reproduced on unchanged main `68303625` in a detached worktree: `node node_modules/vitest/vitest.mjs run src/core/__tests__/gameStatAttributionIntegrity.test.ts --maxWorkers=1` yielded **7 passed / 1 failed**, specifically the existing 5s limit (8.82s total test time). Other stress timeouts were not separately reproduced on main. The broad browser run's timing/navigation failures are recorded above; successful sequential repeats and CI provide the final acceptance evidence. A preliminary new preservation test exceeded its original 60s budget under contention; the new real-worker integration cases use 180s budgets, while existing assertions and limits remain intact.

**Merge recommendation:** ready for independent engineering review of this focused creation-boundary repair, with merge conditional on required checks remaining green. First-week acceptance, save preservation, full unit, durability, and deployment parity are demonstrated. Do not merge automatically. The independently documented empty unsigned pool and other unproven adjacent issues are not claimed fixed by this PR.
