# PR #1807 — accepted trades and immediate signing

**Latest follow-up:** [retirement, archive and proposal identity](retirement-archive-proposal-identity.md) records the current repairs, validation and review disposition. Earlier merge recommendations below are historical.

Base: `40a688ba67aad0a03f86cd12fae19776a131f235`.

## Before repair

The new real-worker regression boots both the actual normal generator and the explicit numeric-ID Safe Starter, then loads each through production IndexedDB. It selects a one-player offer produced by the actual `buildAITradeOffer` using generated roster assets and seeded production valuation.

On the reviewed code, the normal acceptance returned `{accepted:true,reason:"Trade completed."}` while target `oylo900psdsd` remained on team 0. The numeric fallback target (ID 6) moved to team 1. Separately, releasing a generated punter and submitting a qualifying regular-season offer left the normal player unsigned; the numeric fallback signed immediately. These are worker/state observations, not UI fingerprints.

Initial pre-fix run: 3 failed / 1 passed. Two failures were the reported normal-ID defects; the numeric trade reached both roster mutations but the new history assertion used the nonexistent Transactions.getAll method. The assertion was corrected to the existing loadRecent API. An earlier offer fixture searching only QB targets found no one-player bundles; the final fixture searches the actual generated roster and selects an actual one-player offer without changing valuation or inventing players.

## Repair boundaries

* Player IDs remain opaque in inbound acceptance and counter bundles. Shared ownership checks, position lookup, package valuation inputs and cap lookup use existing canonical identity handling. The valuation functions, thresholds, seeds and AI strategy are unchanged.
* `capHitOf` is shared at worker scope: the same existing calculation was previously declared inside legality validation despite calls from adjacent offer/counter handlers. This fixes that demonstrated scope defect without changing cap policy.
* Trade legality rejects invalid, unknown, duplicate, incorrectly owned and same-team player references before mutation. Execution validates again, resolves aliases to original stored IDs, verifies the required roster moves actually occurred, and restores participant/team snapshots if roster mutation or post-trade validation fails. Picks and history are written after those checks. This guards required roster mutation failures; it does not introduce a new database transaction format or claim general rollback for arbitrary later storage failures.
* Execution, morale, holdout resolution and transaction history retain the actual player identity. Adjacent incoming/counter/direct trade helpers use the same shared execution routine; commissioner force-trade and trade-block initiation/removal lookups also no longer coerce player IDs to numbers. Commissioner privileges and valuation are unchanged.
* Immediate free-agent resolution uses `canonicalIdKey`/`sameEntityId` for its optional targeted filter; invalid specified references cannot widen to all players. Untargeted weekly resolution is unchanged. No free-agent population or decision algorithm is added.

## Regression coverage

`tests/integration/tradeAndSigningIdentity.worker.test.js` exercises both normal and numeric fallback franchises through the real worker:

* Actual AI-generated one-for-one acceptance exchanges both players, retains contract/ratings/ID types, recalculates both cap totals including dead money, applies trade morale and holdout resolution, logs original IDs, and persists through save/reload.
* Unknown/invalid/duplicate/wrong-owner offers are rejected. A deliberately skipped cache roster update triggers an error, restores players and leaves the offer pending, instead of reporting success. Reusing a stale accepted offer is rejected.
* Counter acceptance uses the actual package valuation and evaluator, including numeric string aliases, exchanges both players and survives reload.
* A legitimately waiting free-agency offer remains unsigned with its offer pending. A separate qualifying regular-season offer signs only its released target immediately; every unrelated player remains byte-for-byte unchanged, including the waiting player. The new contract and original player ID survive reload.

The focused command also retains existing deadline and AI engine coverage:

```sh
node node_modules/vitest/vitest.mjs run \
  tests/integration/tradeAndSigningIdentity.worker.test.js \
  src/worker/__tests__/tradeHandlerCutoff.test.js \
  src/core/trades/__tests__/aiTradeEngine.test.js --maxWorkers=1
```

Focused result at `c90598d1`: **73 passed / 3 files**, 30.61s. Final `b50e31a4` adds an explicit unsigned-player ownership guard (null team must not alias team 0) and exact unrelated pending-player reload preservation: **6 passed / 1 file**, 43.65s. The preceding full production-preview browser run passed **11 tests / 3.1m**. Final-head CI/browser results and review disposition follow below after completion. No existing tests or time limits were weakened. Preliminary new-test runs also recorded 2 failed / 2 passed when the injected mutation was first diagnosed by roster-limit validation rather than the more specific mutation check; execution now checks the required moves first, before cap/legality recalculation. A counter fixture missing the production acquisitionValue metadata yielded 2 failed / 71 passed; it was corrected to retain metadata from the actual generated offer, without changing evaluation rules. Earlier reports remain the source for deterministic generation measurements and independently deferred gameplay issues; the empty initial unsigned pool is separate from this signing fix.

## Fresh-review ledger and UI findings

Review of the transaction fixes found three additional boundaries, all repaired in `755e283b`:

* [Pending-offer ledger](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4373962323): creation stored Number(playerId), so reconciliation could expire a normal player's bid and release its cap reservation while the actual player offer remained active. The real-worker regression now checks the waiting ledger row after another player's immediate signing triggers reconciliation, as well as the signed target's accepted ledger row. A first assertion before reconciliation alone passed and was insufficient; the post-reconciliation assertion reproduced the reported defect. The ledger/worker pre-fix run produced **2 failed / 33 passed**. Creation and removal records now retain raw player IDs; matching, replacement, withdrawal/resolution and cap-reservation exclusions use sameEntityId. Unit coverage checks distinct opaque/numeric bids, replacement, aliases, reservations, withdrawal and reconciliation. No historical ledger migration is introduced.
* [Quick Counter UI](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4373962330): the actual TradeCenter button passed [NaN] for an opaque target. It now forwards the original ID. The component regression clicks Counter and Quick Counter for opaque/numeric targets and asserts the actual action arguments, complementing the real worker counter execution/persistence test.
* [Extension preview](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4373962333): actual ContractCenter Extend selection failed for opaque IDs. sameEntityId now selects the preview row; component coverage verifies that the chosen player's preview and Confirm extension button render for opaque/numeric IDs. This is preview coverage, not a claim of complete offseason extension validation.

Corrected component reproductions: **2 failed / 14 passed**, then **16 passed / 2 files**, 4.34s. Preliminary component fixtures used the first sorted Extend button and failed to clean up after failed assertions; they were corrected to select the named player's row and always clean up. No production sorting or existing assertions were changed.

```sh
node node_modules/vitest/vitest.mjs run \
  tests/integration/tradeAndSigningIdentity.worker.test.js \
  src/core/freeAgency/__tests__/pendingOffers.test.js \
  src/ui/components/ContractCenter.test.jsx \
  src/ui/components/__tests__/TradeCenterAcceptErrorHandling.test.jsx --maxWorkers=1
```

Combined result: **51 passed / 4 files**, 33.20s. The final code additionally asserts accepted ledger status for the immediately signed player; that assertion is included in full final CI. The preceding ownership-guard code also passed all **11 browser checks / 3.1m**.

## Final browser and fresh-review disposition

Code head: `755e283b874159e9ba315da22a9a42900c8ca333`.

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test \
  tests/e2e/fresh_franchise_first_week_smoke.spec.js \
  tests/e2e/new_franchise_slot_isolation.spec.js \
  tests/e2e/fallback_draft_year.spec.js tests/e2e/nfl_schedule_bye.spec.js

PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium PLAYWRIGHT_VIEWPORT=iphone \
  npx playwright test tests/e2e/fresh_franchise_first_week_smoke.spec.js \
  --grep 'fresh franchise first week smoke'
```

Final-code local preview: **11 passed / 2.9m**, including all four existing PR #1806 slot-isolation cases. Separate complete iPhone Week 1: **1 passed / 43.8s**, body 32.7s. Both build and serve the actual production bundle, use fresh browser contexts and the production worker/IndexedDB, inspect normal provenance and varied contracts, complete Week 1 and verify score/Game Book/standings and reload. Node 22 was used. Preview listeners/Chromium require execution outside the network sandbox; tests and timeouts are unchanged.

[Fresh Codex review request](https://github.com/rbcati/FootballGMSim/pull/1807#issuecomment-6408336187) completed on this code head. Both requested findings and all three subsequent ledger/UI findings have reproduction/regression replies and are resolved. All 13 previously reported threads are resolved. The fresh review returned **two additional unresolved P2s**:

* [Retirement transaction IDs](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4374001151): Codex reports a real-worker retirement whose response retained the opaque ID but whose saved transaction stored NaN. Independent source inspection confirms Number(player.id) in both retirement transaction fields in handleAdvanceOffseason. No new independent retirement regression or repair is claimed here.
* [Season-archive transaction index](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4374001155): Codex reports the exact archive context losing normal-player transaction names/positions; independent source inspection confirms the archive's Number(p.id) map keys collapse opaque identities. No archive pipeline repair is claimed here.

These offseason/history findings remain open for follow-up. They are additional boundaries beyond the requested accepted-trade/immediate-offer paths; passing first-week, trade and signing regressions does not establish offseason archive correctness. The initial unsigned-player pool remains zero, and the earlier reports' broader cap/draft/progression/input issues remain independent deferred work. Extension-preview selection coverage is not complete extension confirmation coverage.

**Merge recommendation: NOT MERGE-READY while the two new P2 review findings remain unresolved.** Keep PR #1807 open. No merge was performed. The requested P1/P2 and discovered ledger/UI gaps are repaired; no claim is made that all numeric player-ID conversions in the application have been audited.

## Full final-code validation

[Final code CI run](https://github.com/rbcati/FootballGMSim/actions/runs/40269906632), code `755e283b874159e9ba315da22a9a42900c8ca333`:

| Command | Exact result |
| --- | --- |
| `npm run test:unit` | **536 files passed / 1 skipped; 6,514 tests passed / 1 pre-existing skipped**, 290.54s |
| `npm run durability:test` | **9 files / 98 passed**, 233.18s |
| `npm run check:deploy` | **Passed**, including Node/Netlify parity, production build, routing rules, Netlify CLI production and deploy-preview build contexts |
| Final-code local production-preview desktop/touch/year/slot-isolation command above | **11 passed**, 2.9m |
| Final-code full iPhone Week 1/save/reload command above | **1 passed**, 43.8s |
| `git diff --check` | Passed |

The optional scheduled/manual five-season job is skipped by the existing PR workflow condition; no five-season run is claimed. The full required durability suite above completed successfully. The final documentation commit does not change executable code; fresh checks it triggers are distinct from the completed code validation linked here.

Final-code CI first-session command also completed:

```sh
npm run test -- tests/e2e/fresh_franchise_first_week_smoke.spec.js tests/e2e/nfl_schedule_bye.spec.js
```

**4 passed (1.2m)**. All required jobs in the final-code workflow are green; this does not override the merge hold for the two fresh-review P2 findings above.
