# PR #1807 — retirement, season archive and proposal identity

Reviewed base: `d9a95455c2748b951f62626367ffd876419eea70`.
Repairs: `735cc163feb00c0e6183827c15ff82703df3b7f5`.
Final executable code: `a3a925b5361d2bd7af936d8c4f29f57ef6581cd1`.

## Reproduction before production edits

* [Retirement recording](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4374001151): the real normal generator and ADVANCE_OFFSEASON returned retiring players with opaque IDs, but their persisted retirement transactions stored `[NaN, NaN]` in the root/details player-ID fields. Numeric fallback IDs survived recording, but both sources lost retirement names after retired players were evicted from the hot cache.
* [Season archive](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4374001155): actual START_NEW_SEASON rollover persisted a RELEASE row with `playerName:null` and headline **“MIA released player”** for a generated player whose identity/name were known. The focused pre-fix archive run failed **1 test**, with the other three new cases intentionally filtered out. The corrected complete retirement/archive pre-fix run failed **all 4 tests**: opaque transaction IDs, opaque archive lookup, and evicted-retiree name lookup for both ID types.
* [Trade Center proposal](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4374044841): the actual TradeCenter component and real worker received **[NaN]** from both Propose Trade and Counter Incoming Trade for opaque selections. Both numeric cases passed (**2 failed / 2 passed**). The adjacent context callback also lost opaque IDs.

Initial new-test fixtures needed two corrections before the final reproductions: Profile transactions use canonical `retirement`/`pos` fields, and retiring an AI archive-fixture player left a fresh AI roster below the required minimum with no unsigned reserve. The archive fixture now uses the human roster for the historical retiree, respecting the existing production preflight policy rather than bypassing it. The preliminary run also reported 4 failures; it is not passing evidence.

## Repairs and production boundaries

`handleAdvanceOffseason` now writes the actual `player.id` in both retirement transaction fields. GET_TRANSACTIONS first resolves a canonical live-cache reference, then uses the existing retiredPlayers snapshots through findEntityById. This retains names/positions after the intentional flush-and-evict retirement boundary. It changes no retirement rule, old ID, transaction schema or historical row.

`archiveSeason` builds its player index with canonicalIdKey and includes existing retired snapshots before live players; live entities retain precedence. The production normalizer/compactor is unchanged. Signing, release, paired legacy trade, draft and retirement names/positions/IDs remain distinct in persisted transactionTimelineV1. Package trade summaries retain their existing count/team presentation; this PR does not add per-asset archive fields. Raw package trade persistence remains covered by the real trade integration tests.

TradeCenter keeps canonical selection keys, resolves payload/context IDs from the selected roster entities, and retains unknown/invalid references for worker rejection. Numeric stored IDs remain numeric. Context reporting also updates after roster hydration, when original entity types become available. useWorker already forwards proposal/counter bundles unchanged; no worker wire format or valuation change is needed.

An actual TradeWorkspace navigation regression additionally reproduced a feedback loop for both ID types. The initial bounded test failed **2/2**. Stabilizing the callback alone still failed: remounting Builder first published an empty package before restoring selected context, causing empty/selected snapshots to alternate. The final focused compatibility fix stabilizes the callback and initializes selections/picks from restored context before first publication. The real Builder → Summary → Builder test verifies both checkboxes remain selected and bounds runaway renders so regressions fail instead of hanging CI. No merge-state, valuation, strategy or simulation policy changed. This is not a claim that the independently reported draft React #185 is fixed.

## What the new tests actually exercise

`retirementArchiveIdentity.worker.test.js` runs real normal and numeric fallback franchises. It changes a generated veteran's age and controls only the random draw inside the real retirement evaluator; it does not stub retirement results. The worker performs progression, retirement, transaction writes, flush and cache eviction. Tests match every retirement row to returned raw IDs, verify Player Profile history and an unrelated player's own signing, then save/reload and compare exact persisted records and history associations.

The archive cases seed supported historical transaction records using actual generated player identities, including a retired snapshot persisted and evicted as production does. An existing completion marker (`championTeamId:0`) enters the actual completed-season archive through START_NEW_SEASON. The archive is staged and committed by production rollover, then read from Seasons, saved/reloaded and read through GET_SEASON_HISTORY. This is actual archival/persistence coverage, not a pure formatter test or a claim to have simulated a full normal season. Names, positions, IDs, teams and paired trade detail are checked against separate generated actors to prevent cross-attribution.

`tradeCenterProposalIdentity.worker.test.jsx` renders the actual component with a bridge matching useWorker's production messages. Tests select both players, inspect context and action payloads, invoke Propose Trade or Counter Incoming Trade, and run the real worker's valuation/validation/resolution. Both players must actually move and both raw IDs must appear in history; contracts/IDs/rosters/history survive save/reload. Invalid/unknown references must be rejected without moving either player. Both opaque and numeric careers run each path. Additional component coverage restores supplied context and navigates the real workspace between views.

No previously corrupt NaN transactions or unnamed archived rows are guessed or migrated. Initial unsigned-player population and previously documented independent economy/draft/progression/input issues are unchanged.

## Commands and results

Node 22 was used throughout final validation. No existing assertions or timeouts were weakened.

New real-worker/component reproductions and post-fix check:

```sh
node node_modules/vitest/vitest.mjs run \
  tests/integration/retirementArchiveIdentity.worker.test.js \
  tests/integration/tradeCenterProposalIdentity.worker.test.jsx --maxWorkers=1
```

**8 passed / 2 files**, 77.35s, on `735cc163`.

All existing/new PR #1807 worker identity regressions plus normal/fallback generation:

```sh
node node_modules/vitest/vitest.mjs run \
  tests/integration/normalGeneration.test.js tests/integration/fallbackDraftYear.test.js \
  tests/integration/rosterImportIdentity.worker.test.js \
  tests/integration/playerManagementIdentity.worker.test.js \
  tests/integration/weeklyPlayerIdentity.worker.test.js \
  tests/integration/releaseWaiverIdentity.worker.test.js \
  tests/integration/tradeAndSigningIdentity.worker.test.js \
  tests/integration/retirementArchiveIdentity.worker.test.js \
  tests/integration/tradeCenterProposalIdentity.worker.test.jsx --maxWorkers=1
```

**52 passed / 9 files**, 292.70s, on the transaction-fix code. The subsequent executable changes only address workspace initialization/callback stability; full final-code CI includes all nine files again.

```sh
node node_modules/vitest/vitest.mjs run \
  src/ui/components/__tests__/TradeWorkspace.identity.test.jsx \
  src/ui/components/__tests__/TradeCenterAcceptErrorHandling.test.jsx \
  src/ui/utils/tradeWorkspaceState.test.js --maxWorkers=1
npm run test:soak -- --maxWorkers=1
```

Workspace/context subset: **20 passed / 3 files**, 4.36s. Final-code soak subset: **103 passed / 8 files**, 2.88s.

Full final-code CI, browser results and fresh-review disposition are recorded below after completion. The later documentation-only commit does not change executable code.

Final-code production-preview browser command:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test \
  tests/e2e/fresh_franchise_first_week_smoke.spec.js \
  tests/e2e/fresh_franchise_first_playable.spec.js \
  tests/e2e/new_franchise_slot_isolation.spec.js \
  tests/e2e/fallback_draft_year.spec.js tests/e2e/nfl_schedule_bye.spec.js
```

**12 passed / 3.2m**, on final executable code `a3a925b5`: first playable render, normal provenance/varied contracts, three selected starting years, full Week 1/Game Book/standings and reload, desktop/touch schedule/bye views, all four PR #1806 isolation cases. These use fresh browser contexts, the production worker/IndexedDB and a freshly built production bundle served by preview. Local Chromium/HTTP listeners require running outside the execution network sandbox; browser assertions and retry limits are unchanged.

Separate final-code full iPhone playthrough:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium PLAYWRIGHT_VIEWPORT=iphone \
  npx playwright test tests/e2e/fresh_franchise_first_week_smoke.spec.js \
  --grep 'fresh franchise first week smoke'
```

**1 passed / 45.5s** (body 33.5s): fresh normal-franchise creation, roster/contract/lineup checks, save and reload, full Week 1, standings/final score/Game Book, then another save/reload.

## Fresh review and remaining findings

[Fresh Codex review request](https://github.com/rbcati/FootballGMSim/pull/1807#issuecomment-6470550063) completed on final executable code. All three requested threads have reproduction/regression evidence replies and are resolved; no requested finding is deferred. Fresh review returned two additional unresolved P2s:

* [Bulk-release confirmation modal](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4401326475): Codex reproduced the actual modal confirming an empty list for two normal-generated players while numeric players were retained. Independent source inspection confirms Number(p.id) and finite filtering in BulkReleasePreviewModal. The earlier worker bulk-release repair does not fix this UI boundary. This follow-up does not claim a new independent modal reproduction or repair.
* [Injury Report replacement readiness](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4401326483): Codex reproduced false replacement risks/Critical severity for opaque depth IDs compared with the equivalent numeric roster. Independent source inspection confirms numeric player/assignment indexing in injuryReadinessModel. The previously repaired roster/weekly-prep models are separate consumers. This follow-up does not claim a new independent injury-model reproduction or repair.

Both remain open for the next scoped repair. **Merge recommendation: NOT MERGE-READY until these two new findings are addressed.** Passing the requested retirement/archive/proposal regressions and first-week smoke does not establish those separate flows are correct. Keep PR #1807 open; do not merge automatically.

## Complete final-code CI

[CI run for a3a925b5](https://github.com/rbcati/FootballGMSim/actions/runs/40698469746):

| Command | Exact result |
| --- | --- |
| `npm run test:unit` | **539 files passed / 1 skipped; 6,526 tests passed / 1 pre-existing skipped**, 343.09s |
| `npm run durability:test` | **9 files / 98 passed**, 240.63s |
| `npm run check:deploy` | **Passed**: production build, Node/Netlify parity, routing rules, Netlify CLI production and deploy-preview build contexts |
| Final-code local desktop/touch/year/slot-isolation preview command above | **12 passed**, 3.2m |
| Final-code full mobile Week 1/save/reload preview command above | **1 passed**, 45.5s |
| `npm run test:soak -- --maxWorkers=1` | **103 passed / 8 files**, 2.88s |
| `git diff --check` | Passed |

The optional five-season scheduled/manual workflow job is skipped by the existing PR condition; no five-season run is claimed. The required full durability suite above completed. The subsequent report-only commit changes no executable code, and any fresh checks it triggers are separate from this completed code validation.

Final-code CI first-session command:

```sh
npm run test -- tests/e2e/fresh_franchise_first_week_smoke.spec.js tests/e2e/nfl_schedule_bye.spec.js
```

**4 passed / 1.0m**. All required jobs in the executable-code workflow completed successfully. This does not override the merge hold for the two new P2 findings above. All three requested findings are resolved with evidence; no merge was performed.
