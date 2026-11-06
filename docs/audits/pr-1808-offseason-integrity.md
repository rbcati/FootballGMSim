# Offseason decision integrity verification

Base: `255a0d708cd821a80ec8419e2e7ce6a9efcf19ed` (verified checkout before edits).
Branch: `fix/offseason-decision-integrity`.

## Confirmed causes and scope

- ContractCenter, Roster management controls, and Financials rejected valid numeric team ID 0; Roster also hid management controls for player ID 0.
- ContractCenter's offseason early return hid its action feedback.
- Management and tag feedback now requires the worker's STATE_UPDATE acknowledgement. Accepted extensions and tags already persist their decision in the worker; redundant follow-up management mutations were removed.
- The worker's management handler flushes intent without releasing the player. Extension/tag handlers own contract mutations, cap recalculation, transactions and flushes. These handlers and save schema are unchanged.
- Advance uses request/response in useWorker, but App discarded its promise. App now catches failures and resets its local guard. Native unresolved-contract confirmation remains, pending browser acceptance/cancellation verification. The reported six-click incident is not yet independently reproduced.
- The modal's Reject button only closes the offer; its label now says Close offer.

## Verification status

- Node 22 runtime installed separately for repository engine parity.
- Production build passed (42.31s), expected large-chunk warning.
- Component regression run: 3 files, 25 tests passed (14.08s), including numeric team/player zero and opaque player identities.
- Existing fresh-franchise first-week browser smoke passed (1.4m).
- Existing mobile HQ acceptance failed tooltip placement: y=177.140625, expected >=201.75. Outside changed contract workflow; assertion unchanged.
- Initial Buffalo season-progression browser attempt timed out at Week 12 during active simulation before reaching re-signing. Rerun has a longer bounded simulation timeout.
- Worker integration, full unit suite, durability suite and Buffalo/Miami browser regression verification are in progress. No pass is claimed yet.
- Netlify preview URL, deployed head and live save/reload evidence: pending draft PR deployment.

This PR must remain draft and unmerged until outstanding checks and live preview verification are recorded.

## Additional verified findings

The default 1280×720 browser exposed a separate blocker in the exact requested path: the fixed Season Complete splash's Proceed to Offseason button was outside the viewport, with no scroll container. Playwright's unforced click trace confirms this. Its layout now uses safe centering and vertical scrolling; it has dialog semantics. No championship or playoff calculation changed.

Normal and fallback worker integration now both pass (2 tests, 226.41s before adding transaction assertions; 2 tests, 55.51s with transaction assertions). This includes persisted intent, rejection preservation, actual acceptance/cap update, independent saves, saved free-agency transition, and exactly one persisted extension transaction.

Final component checks: 27 tests / 3 files passed (16.34s). Soak: 103 tests / 8 files passed (14.13s). Broader durability: 97 passed, 1 timed out (9 files, 901.54s); failing test is gameStatAttribution.worker.test.js seed=1804 engine=true at its existing 480000ms timeout. Baseline attribution unit test also exceeded its existing 5000ms limit in this environment (7 passed, 1 timeout).

Clean commit 585190aa passed GitHub Actions parity (full unit suite, production and preview build/deploy parity) in 7m7s: https://github.com/rbcati/FootballGMSim/actions/runs/42164163199/job/127716593015 . The first long local full-suite run was invalidated by concurrent source/test edits and superseded by this clean-commit CI run.

Live Netlify preview: https://deploy-preview-1808--footballgmsim.netlify.app ; deploy 6aed5ae41073299859a78488 served 585190aa. The Netlify Drawer intercepted the initial click; its visible Dismiss control can be activated by keyboard, after which the real New Franchise button works. Live workflow rerun remains required after the splash layout fix.

Live verification identified an additional state-transport root cause: serializeLeagueDelta omitted roster-only extensionDecision / contractPlan / tradeStatus changes when team totals and membership stayed unchanged. The live preview acknowledged Ronald Herbert's Let Walk commit while rendering Pending. Delta detection now compares these fields and changed contract terms, retaining the unchanged-snapshot optimization. New messaging/delta regressions: 58 tests passed (342ms). Combined final component and actual normal/fallback worker tests: 29 passed (46.00s), including an assertion on the worker's transported decision. Production build after transport fix: passed (16.78s).

The next browser assertion also identified a read-model omission: GET_ROSTER did not return extensionDecision, contractPlan or tradeStatus. Its response now includes those persisted management fields and teamId. Its read-only analysis also stops treating Buffalo players as free agents solely because teamId is zero. The canonical free-agent pool is unchanged. Actual normal/fallback GET_ROSTER reads now assert committed decisions after reload; isolation assertions also compare the second franchise's contracts and cap. Build after this correction passed (29.59s).
