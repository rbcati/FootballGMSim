# PR 1806 review follow-up

Starting PR head: `4596572168f6d28e92fb9e7cf2a11cfbd7b96e04`.

## Draft-year convention and compatibility

`src/core/league.js:generateDraftPicks` creates three seven-round inventories using the calendar starting year, then year + 1 and year + 2. `pick.season` is the calendar year; `league.season` and `currentSeasonId` are ordinal season identifiers and must not replace it. Trade identity/label/ownership helpers use `pick.season` (with legacy `year` fallback). The worker draft initializer uses `meta.year` for draft selection IDs and current-year compensatory assets.

The fallback used the selected year for the league/schedule but still used 2026 in `makeDraftPicks`. Its generator now receives the already-resolved starting year. Default 2026 IDs stay identical. Starting years 2025 and 2031 get their own year, next year, and second future year in both IDs and `season`. Ownership, round count, and ID format remain unchanged. This is creation-only: no loader, migration, historical ID, or historical pick year is rewritten.

Regression coverage includes omitted/default year and explicit 2025/2026/2031; all 672 unique assets, semantic ownership and trade eligibility; production NEW_LEAGUE, SAVE_NOW, LOAD_SAVE and GET_DRAFT_STATE; all seven selections per team at the real draft phase boundary; and historical traded ownership across load. Browser cases verify selected Miami/year/Hard settings and every pick after slot save/reload. The pre-fix generator tests failed for 2025 and 2031 (two failed, two passed).

The existing loader hydrates the separate pick cache through a legacy `year` index, while canonical assets use `season`. Tests therefore inspect the durable draftPicks store and team pick inventories used by trade resolution, rather than assuming the cache contains all future assets. This pre-existing cache/index mismatch is not changed here; all future assets remain persisted and in team trade inventories after load.

## Actual GitHub Actions failure

Run: https://github.com/rbcati/FootballGMSim/actions/runs/40131295598

Failed job: https://github.com/rbcati/FootballGMSim/actions/runs/40131295598/job/120984499173

The parity job passed. The raw run log archive shows three first-session failures and one pass (12.6 minutes), including both retry attempts. The desktop smoke timed out at `advanceBtn.click()` (line 127), mobile HQ at `power.tap()` (line 272), and mobile schedule at the More button (`helpers/franchise.js:89`). Playwright reported `<div>Tip 1 of 5</div>` / tour backdrop intercepting pointer events. Desktop schedule passed.

This is caused by the PR's year forwarding: setup defaults to 2025; main silently fell back to 2026; the existing tour is enabled for year 2025/1, week 1–2, regular phase. Honoring 2025 makes that real first-session step visible. The prior local run with completion seeded missed this CI behavior.

The helper now waits for the expected visible tour, clicks its real Skip tour button, asserts that it disappears and completion was saved, then runs every original smoke/gameplay/navigation assertion. No test is skipped, no assertions are weakened, no forced clicks or completion seeding are added, and no production onboarding behavior or game logic changes. The workflow itself is unchanged. The new 2025 year E2E also explicitly verifies the visible tour and dismisses it before reload.

## Verification

Final results and new head SHA are recorded in the PR update. No live user storage, old saved picks, simulation probabilities, draft valuation, roster AI, or slot-isolation guards were modified.

Before pushing this update: focused generator/worker regressions passed (8 tests); the normal CI-style Playwright run passed all 11 cases (2.1m), including the exact two first-session workflow specs; the final slot-only run with completion seeding removed passed all four cases (1.1m); and `npm run check:deploy` passed production, routing/artifact, and both Netlify CLI contexts. Full unit/durability results and the new remote Actions run are reported on the PR after completion.
