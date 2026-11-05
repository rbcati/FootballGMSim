# Daily Regression Pass Summary

**What was tested:**
- Playability Smoke Test (New league, advance week).
- State & Persistence Audit (Strategy persistence).
- UI Interaction & Mobile Check (Mobile scrolling on standings, stats, roster).
- Contracts, Free Agency, and Cap Trust.
- Replay Exploit Prevention.

**What broke:**
- The Playability Smoke Test failed due to a hidden assertion error in `tests/e2e/helpers/franchise.js`. The test was expecting the 'Advance Week' CTA button to be enabled, but it was disabled because `busy` or `simulating` props were true, causing `toBeEnabled()` to throw a Playwright expectation Error. This error was originally swallowed by a blanket `catch` block that only re-threw `TimeoutError`s, hiding the underlying state failure and failing the overall test ungracefully.

**What was fixed:**
- Updated the error filtering in `tests/e2e/helpers/franchise.js` `simulateSingleWeek` helper to correctly allow Playwright assertion errors (like those containing `toBeEnabled`) to bubble up instead of silently swallowing them. This ensures true assertion failures fail the test properly instead of masquerading as timeouts or being ignored.

**One small improvement:**
- Improved the resilience of E2E testing by ensuring that expectation timeouts throw their proper standard `Error` containing the matcher name, improving test clarity, trust, and debuggability.
