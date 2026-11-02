# PR #1807 — live first-install startup verification

## Verdict: CONFIRMED APPLICATION DEFECT

The reviewed/deployed baseline is `4d3ce348c048391caed0912b76e1d88479f92349`; Netlify deploy `6ae374e07c10aa8f9afe4b28` reported state ready and that exact commit_ref. GitHub reported mergeable/clean, all required checks passed and all 19 review threads resolved before this follow-up.

The correct preview hostname uses two ASCII hyphens: https://deploy-preview-1807--footballgmsim.netlify.app.

## Concrete baseline evidence

Three independent fresh Chromium contexts started with zero origin storage usage, no service worker, empty cookies/local storage/IndexedDB and no cached assets. Native registration/install/activate/controllerchange events, top-level navigations, worker messages, console errors and network failures were recorded. No user profile was accessed.

In two fast attempts, Start New Franchise entered team selection before the first controller acquired the page. Controller acquisition then caused the application to navigate back to the empty Save Hub, discarding onboarding. Trial 1: start click → 443ms → controllerchange → 124ms → root navigation; trial 2: start click → 457ms → controllerchange → 124ms → root navigation. Both attempted Buffalo selections were interrupted. No NEW_LEAGUE command was sent; only INIT ran again, and only the global meta database existed. The third attempt reached onboarding after this reload and continued. These event traces are preserved in [startup-baseline-onboarding.json](evidence/startup-baseline-onboarding.json). A second three-context observation landed after activation and did not interrupt onboarding, confirming that the defect depends on event ordering rather than happening on every visit.

The deterministic native-SW regression holds registration until Buffalo and year 2026 have been selected, then invokes the original register method. On the exact reviewed production code it fails in 2.3s: `page.evaluate: Execution context was destroyed, most likely because of a navigation`, immediately after controllerchange. This is an actual application navigation, not merely an action timeout. No service worker is mocked or disabled; only registration timing is gated by observable user progress.

Early live regression attempts also encountered Netlify's collaboration drawer covering Continue. That separate hosting overlay is dismissed using its actual Dismiss UI control. No application click is forced and no game error is suppressed. One early probe's instrumentation ran in the cross-origin toolbar frame and produced a probe-only SecurityError; instrumentation now explicitly runs only in the top-level game document.

## Root cause and minimal repair

`index.html` registers `/sw.js` after page load. `public/sw.js` installs its cache and calls clients.claim() on activation. This expected native first-install acquisition fires controllerchange. `src/ui/App.jsx` previously unconditionally reloaded on that event even when the current page already had the latest application bundle. Onboarding and pendingNewSlot are React state, so the unnecessary reload discarded them before any new career request/commit.

The repair distinguishes first acquisition from replacement of an existing controller. First acquisition leaves the current page and simulation worker intact. A replacement retains the existing update/restart behavior but waits while onboarding, initialization, worker work, simulation or a batch is active. It then uses the existing generation-guarded SAVE_SLOT waitForSave acknowledgement before reloading a loaded career. A failed checkpoint leaves the career/page intact and offers a retry. Listener cleanup removes the controllerchange callback as well as the message callback.

No cache version, registration scope, skipWaiting protocol, offline behavior, save schema, player identity or generator logic is changed. No salary, draft, free-agent, trade, progression or balance code is changed.

## Browser coverage and evidence

`tests/e2e/first_install_startup.spec.js` covers:

- Native first acquisition while Buffalo/2026 onboarding is in progress, followed by normal creation and exact player reload.
- Three natural fresh-context activation/creation/second-navigation repetitions, each requiring one creation command and unique franchise state.
- Real replacement-worker activation during onboarding; restart waits for creation commit and an acknowledged save, then restores the correct slot without a loop.
- Actual 2026 Buffalo Week 1, roster/HQ/schedule, final score/Game Book, Quick Save/reload, a second independent franchise, and reopening Slot 1 with both stored careers intact.
- An injected checkpoint ERROR that must preserve the loaded page/save, followed by a successful saved restart. Only that negative-path response is injected; normal cases execute the real worker and IndexedDB.
- First acquisition after NEW_LEAGUE has been requested, with no lost/duplicate franchise and exact reload.

The tests assert genuinely empty storage/cookies/service-worker state using browser context state and CDP origin quota. They attach chronological lifecycle/navigation/worker/error/network JSON. CI preserves separate desktop/mobile output in its first-session-browser-evidence artifact. The saved game, players, contracts, ratings, team records, scores and generation/slot IDs are compared after reload. Existing-save isolation is also covered by the unchanged four #1806 regressions.

## Commands and result publication

Use Node 22. Local production-preview commands build and serve dist, not the development server. Live commands do not start a local server and use the actual Netlify bundle. Proxy configuration follows the inherited runtime configuration without disabling TLS checks.

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test tests/e2e/first_install_startup.spec.js
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --config playwright.live.config.ts tests/e2e/first_install_startup.spec.js
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium PLAYWRIGHT_VIEWPORT=iphone npx playwright test --config playwright.live.config.ts tests/e2e/first_install_startup.spec.js --grep '2026 Buffalo Week 1'
npm run test:unit
npm run durability:test
npm run check:deploy
git diff --check
```

Exact final revision, deployed commit_ref, all pass/fail/skip counts, full integration/first-session/isolation commands, current check results, fresh review and final merge recommendation are published in the PR description and final evidence comment after execution. This avoids labeling an unexecuted live-host probe as passed. No merge is performed by this workflow.
