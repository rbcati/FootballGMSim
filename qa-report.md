# QA & Regression Report

## 1. Executive verdict
- **Is the current build safe to keep building on today?**: Yes, the core gameplay loop and primary features function well without any blockers for playability, based on smoke and daily regression tests.
- **Should the current open PR be merged, fixed, or paused?**: Any PR that relies on `.catch(() => {})` in E2E tests should be paused/fixed. The `simulateSingleWeek` helper currently hides UI failures, breaking test integrity.
- **Biggest risk**: The E2E tests are providing a false sense of security. Several critical user actions (like clicking "Advance anyway" or "Simulate (Skip)") silently swallow failures, meaning that broken UI/Readiness Gates could be passing tests. Assertions like `length > 0` are too relaxed for E2E and integration tests.

## 2. Newly found blockers/high bugs
- *None.* The playability tests passed cleanly, and there are no direct crashes or missing states on a new franchise/first session.

## 3. Regression check results
- **First-session**: Pass. A fresh franchise loads properly without render boundary errors.
- **Save/load**: Pass. Slot loading and metadata rendering succeed.
- **Weekly loop**: Pass, but with asterisks. Playwright test runs succeeded, but tests actively hide potential issues with silent catches.
- **Postgame/result truth**: Pass. Shared box score opens properly, scores propagate up to HQ correctly.
- **League Pulse/news**: Pass. News feed renders story items after advance.
- **Roster/front-office**: Pass. Contracts & cap logic behaves as expected.
- **Mobile**: Pass. Daily regression check for mobile UI scrolling and buttons passes.

## 4. Test integrity concerns
- **Tests that hide bugs**:
  - `tests/e2e/helpers/franchise.js`: The `simulateSingleWeek` helper uses `.catch(() => {})` when clicking `Advance anyway` and `Simulate (Skip)`. If these buttons are meant to be visible, they should be waited for or their absence correctly asserted against based on the `advanceAnyway` option.
  - `tests/e2e/fresh_franchise_first_week_smoke.spec.js`: Same issue with `skipPrompt.click({ timeout: 10000 }).catch(() => {})`. It swallows the Playwright TimeoutError if the button is missing or unclickable.
  - Across multiple `.spec.js` files, there are patterns of `.isVisible().catch(() => false)` combined with conditionals which makes tests pass silently if elements are absent instead of verifying the required behavior path.
- **Weakened expectations**:
  - `tests/integration/fullSeasonSmoke.test.js`, `tests/unit/aiToAiTradeEngine.test.js`, etc: using `.length > 0` checks instead of stricter deterministic matchings.
- **Missing tests for recent changes**: Tests covering explicit readiness gate behavior explicitly (without the bypass).

## 5. Code hygiene concerns
- **Artifacts**: Clean, no patch files or stray scripts found in the root directory.
- **Conflict residue**: Clean.
- **Duplicate logic**: N/A for this review.
- **Risky patterns**: Extensive use of `window.state` and global fallback states bypassing standard React render loops in tests. Heavy reliance on `.catch(() => {})` for locator actions.

## 6. Recommended next action
request cleanup PR

## 7. Focused implementation prompt
**Objective**: Fix test integrity by removing silent `.catch(() => {})` on Playwright locator clicks in the E2E helper `simulateSingleWeek` and smoke test, and ensure bypassing the readiness gate explicitly uses the `advanceAnyway` option.

**Files to inspect**:
- `tests/e2e/helpers/franchise.js`
- `tests/e2e/fresh_franchise_first_week_smoke.spec.js`

**Exact changes**:
1. In `tests/e2e/helpers/franchise.js` within `simulateSingleWeek`:
   - Remove `.catch(() => {})` from the `click()` commands for "Advance anyway" and "Simulate (Skip)".
   - Refactor the click logic: Use the `advanceAnyway` boolean to conditionally expect and wait for these buttons, failing the test if they do not appear when requested. If `advanceAnyway` is false, it should not attempt to click them at all.
2. In `tests/e2e/fresh_franchise_first_week_smoke.spec.js`:
   - Remove the `.catch(() => {})` on line 132 for `skipPrompt.click()`. Explicitly handle the skip flow or wait for the prompt to ensure we don't hide UI bugs.

**Constraints**:
- Do not add dependencies unless absolutely necessary.
- Do not change IndexedDB schema/version unless the bug truly requires it.
- Do not rewrite the whole app.
- Do not alter simulation balance unless the bug is explicitly sim-related.
- Do not make broad visual redesigns.
- Do not commit scratch files.
- Do not weaken tests to pass.
- Do not use destructive git commands.
- Preserve first-session playability.
- Preserve mobile usability.
- Prefer small, focused PRs.

**Acceptance criteria**:
- Playwright tests fail if a click target (like "Advance anyway") is genuinely unclickable or blocked.
- `simulateSingleWeek` cleanly handles both explicit bypass (via `{ advanceAnyway: true }`) and natural flows.
- No `click().catch(() => {})` anti-patterns remain in the reviewed files.

**Tests**:
Tests must still pass when the UI functions correctly.

**Validation commands**:
Always run:
npm run test:unit
npm run build
npx playwright test tests/e2e/fresh_franchise_first_week_smoke.spec.js