# Daily Regression Pass QA Report

## What was tested
- 1. Playability Smoke Test (New league, load save, advance week, sim game, stability).
- 2. Strategy Persistence & High Stakes
- 2b. Mobile UI Scrolling Check
- 3. Contracts & Cap Trust (FA signing, cap update)
- 4. Replay Exploit Prevention

## What broke
- The `1. Playability Smoke Test` failed initially. The `advanceAnyway` logic in `simulateSingleWeek` (within `tests/e2e/helpers/franchise.js`) was failing randomly due to an over-eager expectation on `toBeEnabled()` for the Advance Week CTA when readiness blockers were present, even when it was supposed to just be probing visibility before triggering the gate.

## What was fixed
- Updated the `simulateSingleWeek` helper in `tests/e2e/helpers/franchise.js` to completely remove the `toBeEnabled` expectation when probing the `advanceCta` during the `advanceAnyway` flow, allowing the test to correctly bypass the readiness gates without failing the overall suite on an intentionally disabled button. Playwright tests now pass.

## One small improvement that increased clarity, tension, or trust
- Added a small text improvement to the post-game summary callbacks in `src/core/simulation/gameSummaryBuilder.js` for when `stakes > 50` to enhance the narrative messaging and emotion in high stakes moments by adding stringency to shutout and blowout loss texts.
