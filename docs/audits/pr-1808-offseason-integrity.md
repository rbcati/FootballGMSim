# PR #1808 — Offseason decision integrity

Buffalo can complete manual re-signing decisions and reach a saved/reloaded free-agency phase. The same browser flow passes for Miami, including advancing after all decisions are resolved. No Sim to Season shortcut is used.

## Revisions and deployment

- Verified base before edits: `255a0d708cd821a80ec8419e2e7ce6a9efcf19ed` (PR #1807).
- Branch: `fix/offseason-decision-integrity`; target: `main`.
- Production source tested locally and live: `e0e50fa48a671a5835202c71cbcd00bc554c4f6a`.
- Final test revision: `4b858b1db1a88a057380605e6aa976bb2e4bdbd9`. Subsequent delivery documentation does not change application code. The delivery head SHA is recorded in the PR description.
- Actual PR preview: https://deploy-preview-1808--footballgmsim.netlify.app
- Verified ready Netlify deploy: `6aed6139bb152c479f05ccb8`, serving `e0e50fa48a671a5835202c71cbcd00bc554c4f6a`.
- The PR remains unmerged.

## Confirmed causes and repair

1. Contract Center, Roster and Financials rejected valid numeric team ID `0`. Roster also rejected/hid controls for player ID `0`. Missing-ID checks now preserve zero and opaque player IDs.
2. Contract Center's offseason early return hid its feedback. Re-signing now renders accessible worker-confirmed feedback. Management/tag success requires a `STATE_UPDATE`; extensions use the actual negotiation response. A history-save failure after acceptance explicitly says the contract committed.
3. `serializeLeagueDelta` ignored roster-only management and contract changes when cap, membership and depth were unchanged. Live verification reproduced a committed Let Walk acknowledgement alongside a stale Pending row. Delta detection now includes decisions, plans, trade status and changed contract terms, while excluding unchanged snapshots.
4. `GET_ROSTER` omitted persisted management fields. It now returns the decision, plan, trade status and team identity. Its read-only roster analysis also stops classifying Buffalo players as free agents merely because their team ID is zero. The canonical free-agent pool is unchanged.
5. The fixed Season Complete splash placed Proceed to Offseason outside the default 720px-tall viewport without a scroll container. Unforced browser click traces reproduced this blocker. The splash now scrolls, uses safe centering and has dialog semantics. Championship/playoff calculations are unchanged.

The worker already flushes Let Walk as intent without releasing the player on the initial click. Accepted extensions and tags already persist their own decisions; redundant follow-up decision writes were removed. Worker contract validation, negotiation, cap calculation, transactions and save schema remain authoritative. The extension modal's former Reject control only closed the offer; its label now says Close offer.

## Advance investigation

`handleAdvanceWeek` → `actions.advanceOffseason()` → `ADVANCE_OFFSEASON` → `handleAdvanceOffseason` already uses a correlated worker request. App previously discarded that promise; it now catches failures and resets its local advancing guard.

The exact reported six-click session was unavailable. Browser traces reproduced UI overlays intercepting navigation/Advance access, and committed decisions remaining visually unresolved because of delta omission. Once those blockers were addressed, the existing worker transition worked. No additional worker phase-state mismatch was found.

Browser assertions verify that the native unresolved-contract confirmation actually appears, cancellation leaves `offseason_resign` unchanged, acceptance reaches `free_agency`, and Miami can advance after its unresolved count reaches zero. Worker and browser tests verify that the transition survives load/reload.

## Validation

All commands use Node 22 and the repository's unchanged assertions unless an additive response contract is explicitly extended. The existing exact-key roster response assertion now includes the four new read-model fields; its original fields and contract checks remain, with an additional management-value/read-only-array test. No new skips were introduced.

| Check | Result |
| --- | --- |
| Production build after final application change | Passed, 29.59s; expected large-chunk warning |
| Final component + normal/fallback worker checks | 29 passed / 4 files, 46.00s |
| Messaging and decision delta regression checks | 58 passed / 2 files, 342ms |
| Worker + delta/read-model checks | 60 passed / 3 files, 81.26s |
| Strengthened independent-save worker checks | 2 passed / 1 file, 49.32s |
| Exact roster response/read-only tests | 6 passed / 1 file, 787ms |
| Final dynasty soak | 103 passed / 8 files, 2.24s |
| Local Buffalo 2026 manual flow | Passed, 3.0m |
| Local Miami 2026 manual flow, including resolved decisions | Passed, 2.7m (2.8m runner total) |
| Live Netlify Buffalo 2026 manual flow | Passed, 2.7m |
| Existing fresh-franchise first-week browser smoke | Passed, 1.4m |
| Existing mobile HQ acceptance rerun | Passed unchanged, 7.2s (8.9s runner total) |

The normal/fallback worker scenarios use real generation and actual IndexedDB save/load. The fallback fixture ages two real generated contracts into expiry because starter contracts do not expire in year one. A supported $500M cap setting funds an actual acceptable extension; there is no acceptance mock or negotiation override. The checks cover rejected-contract preservation, accepted terms/cap changes, exactly one persisted extension transaction, stable IDs, and unchanged contracts/cap in a second franchise.

The browser scenarios use the normal franchise creation UI, year 2026, and the existing `simToPhase('offseason')` helper for season/postseason simulation. Re-signing actions are real clicks. They check row/unresolved-count updates, page reload/save reopening, actual extension acceptance or explicit rejection with unchanged contract, another reload, cancellation, manual advancement and a final reload. The harness dismisses the existing season/playoff/weekly briefing overlays through their controls and Netlify's Drawer by its keyboard Dismiss control, including after reload.

Reproduction commands:

```sh
npm run build
npx vitest run tests/unit/offseasonDecisionDelta.test.js tests/unit/workerMessaging.test.js tests/unit/worker/handlers/rosterHandlers.test.js
npx vitest run tests/integration/offseasonDecisionIntegrity.worker.test.js src/ui/components/__tests__/OffseasonDecisions.test.jsx src/ui/components/__tests__/RosterResignPriorityBadges.integration.test.jsx src/ui/components/__tests__/FinancialsExpiringDashboard.integration.test.jsx
npm run test:soak
npm run test:unit
npm run durability:test
npx playwright test tests/e2e/offseason_decision_integrity.spec.js
```

Local focused Vitest runs used `--pool=threads --maxWorkers=1` or `2`. Browser runs served the production build on isolated preview ports to avoid sharing a server with earlier runs. Live verification used the same spec against the actual preview URL, through the configured environment proxy and its pinned CA.

Clean-commit CI on `585190aa` passed 6,569 unit tests (545 files; one existing skipped test), all 98 durability tests, and production/preview build/deploy parity:
https://github.com/rbcati/FootballGMSim/actions/runs/42164163199/job/127716593015

The read-model revision initially reported 6,588 passing tests and one failure in the legacy exact-key response assertion. That assertion is updated and its focused suite passes 6/6. Final clean-commit CI for the delivery test revision is recorded in the PR checks/description.

## Evidence

- [Live Buffalo free-agency UI](pr-1808/buffalo-live-free-agency.png)
- [Local Miami free-agency UI](pr-1808/miami-local-free-agency.png)

Both screenshots show the actual Free Agency phase label. The corresponding passing browser tests also assert the canonical phase again after reload.

## Files changed

Application:

- `src/ui/App.jsx`
- `src/ui/components/ContractCenter.jsx`
- `src/ui/components/ExtensionNegotiationModal.jsx`
- `src/ui/components/FinancialsView.jsx`
- `src/ui/components/MilestoneModal.jsx`
- `src/ui/components/Roster.jsx`
- `src/worker/handlers/rosterHandlers.js`
- `src/worker/serialization.js`

Tests/support:

- `src/testSupport/dynastySoakRunner.js`
- `src/ui/components/__tests__/FinancialsExpiringDashboard.integration.test.jsx`
- `src/ui/components/__tests__/OffseasonDecisions.test.jsx`
- `src/ui/components/__tests__/RosterResignPriorityBadges.integration.test.jsx`
- `tests/e2e/offseason_decision_integrity.spec.js`
- `tests/integration/offseasonDecisionIntegrity.worker.test.js`
- `tests/unit/offseasonDecisionDelta.test.js`
- `tests/unit/worker/handlers/rosterHandlers.test.js`

Documentation: this report and its two evidence screenshots.

## Other observed issues

An initial mobile HQ acceptance run failed its unrelated tooltip-position assertion (`177.140625px`, expected at least `201.75px`). The final focused rerun passed unchanged in 7.2s (8.9s runner total). No HQ tooltip code or assertion was changed.

Under concurrent load on this two-CPU environment, the attribution unit test exceeded its existing 5s limit even on untouched baseline (7 passed, 1 timeout); the local broader durability run had 97 passes and one existing 480s game-stat timeout. The clean CI run passed those suites. A superseded local full-suite process was stopped after concurrent edits invalidated its source snapshot; clean-commit CI supplies the full-suite evidence.

Batch simulation also displayed an existing GET_DASHBOARD_LEADERS timeout during an earlier run. It did not prevent the final manual workflow. No simulation tuning, trade valuation, initial free-agent population, draft logic, salary-cap architecture, save schema or migrations were changed.
