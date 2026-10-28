# PR #1807 — player-ID compatibility review

**Latest follow-up:** [retirement, archive and proposal identity](retirement-archive-proposal-identity.md) records the current repairs, validation and review disposition. Earlier merge recommendations below are historical.

**Current follow-up:** [accepted trades and signing](trade-signing-identity-followup.md) records repairs for the two execution blockers listed historically below, plus fresh-review ledger/UI findings. Consult that report for current validation and merge disposition.

Reviewed base: `3fce7e797639e3c525a8e7bbf99c5a8764c95a74`.
Primary ID/import repair: `0ecf81ab`; management/history repair: `e5fca252`; trade-request response repair: `4c24bf64`; weekly pursuit/rank repair: `3b2b34fa`; bulk release/waiver repair: `7eef2473`.
Original P1: https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4369672008

## Reproductions before production edits

| Consumer | Reproduced result on reviewed code | Repair |
| --- | --- | --- |
| `worker.js:applyImportedRoster` | Real NEW_LEAGUE, seed 1807, 1,696 players. Importing one existing opaque player ID returned **“Imported 1696 player records”**; **all 1,696 serialized players changed**. Invalid IDs could also select an unrelated numeric fallback player. | Canonical comparison keys via existing `canonicalIdKey`; reject invalid keys from the import index and never look up an invalid existing key. Update using the original stored player ID. |
| `rosterReadinessModel.js` | Injured assigned opaque QB yielded **0** replacement concerns instead of 1. An explicitly ordered opaque backup starter was replaced by another QB when assignments were inferred. | Canonical lookup keys and `sameEntityId`, retaining actual IDs in assignments and respecting depth order. |
| `weeklyPrep.js` | With low-rated QB and P starters, feedback instead reported QB/RB/TE/WR from the collapsed last-player lookup, omitting P. After only fixing ID lookup, it still missed the deliberately saved QB choice because existing assignments were not sorted by depth order. | Preserve opaque IDs, use canonical lookup, and sort saved assignments by existing depth order before the unchanged depth builder. No eligibility or roster policy changes. |
| `TradeFinder.jsx` | Selecting an opaque outgoing player sent an **empty** player package to the real ranking function. A separate incoming-only test on a detached reviewed-head worktree sent an **empty** incoming package to the real counter-adjustment function. Numeric fixtures passed. | Use `sameEntityId` for outgoing/incoming entity lookup. Selection values keep their original ID types. No valuation changes or mocked valuation algorithm. |
| `dynastySoakAudit.js` | The normal roster's 1,696 IDs became a **one-entry** audit map. Actual transaction normalization returned null ID/name; two draft transactions produced **zero** draft picks in the report model. | Canonical audit map keys and canonical association in the existing report readers. |

Pre-fix commands: `node node_modules/vitest/vitest.mjs run tests/integration/rosterImportIdentity.worker.test.js --maxWorkers=1` (**2 failed**); the new readiness/Trade Finder tests (**4 failed / 1 passed** before the independent incoming case was added); new audit tests (**2 failed**). Running the final Trade Finder regression on the detached reviewed head produced **2 failed / 1 passed**, separately proving outgoing and incoming loss. A direct reviewed-head production audit/model probe recorded `{ population:1696, auditMapSize:1, normalizedPlayerId:null, normalizedPlayerName:null, expectedDraftPicks:2, actualDraftPicks:0 }`.

## Findings from the first fresh Codex review

Review of `0ecf81ab` found two additional ID boundaries. Both were reproduced before editing their production code:

* P1 [player management / trade block](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4371332938): both real-worker commands returned `Player not found` for normal-generated IDs; numeric fallback management succeeded. Invalid aliases could also change an unintended numeric player. The handlers now reject invalid references and look up a canonical key, while updating the original stored ID and retaining team ownership checks and update allowlists. The missing-ID trade-block error now echoes the request ID rather than causing a request timeout.
* P2 [career transaction filtering](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4371332940): requesting one normal player's history returned both of two distinct SIGN rows. The profile component sent NaN instead of the original opaque ID. The profile now sends the raw ID, and the worker carries a valid canonical player filter through the query and returns no rows for explicitly invalid IDs. Numeric aliases and player ID zero remain valid; omitted/null optional player filters retain their global-history semantics.

Before these repairs, `playerManagementIdentity.worker.test.js` plus `PlayerProfile.test.jsx` yielded **6 failed / 55 passed**, including the exact player-not-found and two-history-rows failures. After repair, those files plus existing management-handler guards passed **3 files / 66 tests** in **31.19s**. The new worker tests cover normal/fallback intent updates, trade-block selection, unrelated-player byte equality, original ID/ratings/contract preservation, invalid-reference errors (not request timeouts), persistence and exact player-specific transaction results. Profile component tests verify raw opaque and numeric request IDs. A second fresh `@codex review` was requested on `e5fca252` after both threads received fix/evidence replies and were resolved.

The second fresh review found P2 [trade-request response handlers](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4371357226). All three commands were independently reproduced through the actual worker: normal IDs returned `Player not found`; numeric fallback responses succeeded (**3 failed / 3 passed**, eight non-response cases intentionally deselected in that focused pre-fix run). `4c24bf64` changes only those lookups to canonical keys and preserves `player.id` in the extension redirect producer. Real-worker regressions verify honored/pending/withdrawn state, stonewall progression, unknown-ID rejection, unrelated-player byte equality, original ID types, and persistence for both sources. The complete management/profile suite then passed **72 tests / 3 files** in **51.32s**. No existing test was disabled or weakened.

An initial new response test also exposed a separate pre-existing transport issue: `serializeLeagueDelta` drops the unused `extensionRedirect` field for numeric and opaque IDs alike, and there is no UI consumer for that field. This is deferred rather than adding serializer/UI behavior to an ID patch. The final regression observes the real serializer input to verify that the redirect producer retains the correct original ID, and separately proves the actual request-state update and reload. It does not claim an end-to-end extension-dialog redirect was repaired. The first diagnostic run including that unrelated wire assertion reported **4 failed / 10 passed**; after placing the identity assertion at the producer boundary, the expected **3 normal-ID failures / 3 numeric-ID passes** were reproduced before the lookup edits.

A third fresh `@codex review` was requested on `4c24bf64`, after the fourth thread received a fix/evidence reply and was resolved.

The third fresh review found two weekly-engine boundaries, addressed in `3b2b34fa`:

* P1 [AI trade-block target resolution](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4371390641): actual normal-franchise weekly advancement produced **3 pursuits / 0 offer-builder calls**, while the numeric fallback case reached the real builder. The target cache lookup and existing-offer/pursuer association now preserve identity. The actual valuation and marketplace RNG rules are unchanged.
* P2 [weekly request depth rankings](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4371390645): opaque backups were evaluated as rank 0, and teammate effects were absent. Rank, teammate and self comparisons now use `sameEntityId`; the valid-ID guard also honors numeric zero. No request triggers, sorting rules, morale deltas or eligibility policy changed.

`weeklyPlayerIdentity.worker.test.js` exercises real normal/fallback week advancement, observes the real AI pursuit/offer functions and the actual request evaluator, verifies persisted inbound offers, actual third-QB `playing_time` requests, new-request and stonewall starter morale effects without self-attribution, and reload. The stable pre-fix run produced **3 failed / 3 passed**. An initial fixture had additionally assumed a tied fallback QB ordering survived weekly progression; it was corrected to use actual rank at evaluation time, rather than altering generation or progression. Post-fix weekly plus existing AI-trade-engine tests passed **58 tests / 2 files** in **18.86s**.

All six findings have fix/evidence replies and are resolved. Fresh Codex review was requested again on `3b2b34fa` after the weekly changes. Marketplace RNG seed policy and downstream trade execution remain outside this identity lookup/comparison repair.

## Bulk release and waiver compatibility

The latest review found [bulk release selections](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4371437647) and [waiver claim lookup](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4371437650). On `3b2b34fa`, actual-worker bulk release returned `{ok:true,released:[]}` for distinct normal IDs, while numeric fallback returned both selected IDs. Releasing a real normal player at Week 12 set ACTIVE waiver status, but submitting its claim returned PLAYER_NOT_ON_WAIVERS; numeric fallback claims worked. The pre-fix test run had **3 failed / 1 passed**: these two normal failures and a numeric-invalid-reference bulk failure.

`7eef2473` uses canonical valid keys for bulk deduplication and claim lookup, returns released entities' original IDs, and retains the existing string waiver-reference format. Tests cover normal and numeric fallback, distinct selections, aliases, invalid/unknown IDs, duplicate/closed-window claims and persistence. Release tests preserve other teams' byte-identical players and all surviving user-player fields except depthChart/depthOrder, which the existing release path intentionally rebuilds. Claim tests preserve every player byte-for-byte. They make cap space through an actual roster release and select a contract using the actual cap predicate; cap rules are not bypassed. Initial new-test failures also exposed those legitimate depth/cap prerequisites; the fixture was corrected without changing production release or cap behavior.

```sh
node node_modules/vitest/vitest.mjs run \
  tests/integration/releaseWaiverIdentity.worker.test.js \
  src/core/transactions/__tests__/waiverEngine.unit.test.js \
  src/worker/__tests__/releaseHandlerGuards.test.js \
  src/worker/__tests__/depthChartRepairAfterRelease.test.js \
  src/worker/__tests__/waiverEngine.integration.test.js --maxWorkers=1
```

Result: **124 passed / 5 files**, 26.16s. No waiver award/priority algorithm, release ownership rule or cap policy changed.

The browser CI installation failed on the prior head before executing any tests: ubuntu-latest had advanced to Ubuntu 26.04, unsupported by Playwright 1.59.1. The first-session job now pins Ubuntu 24.04. Other jobs, test assertions and retry policies are unchanged. A local browser launch inside the network sandbox also failed to start the preview listener; the same command runs with local listener/Chromium permissions for acceptance evidence.

## Boundary and identity rules

`referenceIntegrity.js` already defines numeric/string identity equivalence, invalid references and deterministic ID ordering. Those rules remain the authority. The added read-only `findEntityById` accepts raw-ID maps, canonical-key maps or arrays, checks entity identity, and cannot resolve an invalid reference through a NaN/null map entry. Tests cover numeric zero, numeric aliases, distinct opaque strings, the distinct IDs `7` and `"007"`, missing/invalid references, and original ID types.

The audit fix must include its `transactionTimeline.js` and `draftClassHistory.js` readers: changing only the audit maps left the readers coercing IDs back to zero/NaN and dropping player associations. The narrowly related changes preserve transaction/draft player IDs through lookup, deduplication, filtering, redraft association and draft context. They do not change statistics, outcome scoring, trade valuation, team-ID semantics or persistence schema. Canonical keys exist only at comparison/index boundaries; no player ID migration is performed.

## Real-worker import isolation and durability

The new integration test runs both a real normal franchise and a numeric-ID Safe Starter franchise. It establishes the pre-existing load-normalization baseline, imports one player's name/age/OVR, checks exactly one changed record and checks every unrelated serialized record byte-for-byte. It then imports two distinct players, exercises numeric aliases without replacing numeric stored IDs, and submits unknown IDs plus null, empty/whitespace, object, array, boolean, NaN and Infinity IDs. Invalid/unknown references import zero records and leave all existing players unchanged. Explicit SAVE_NOW and LOAD_SAVE compare exact serialized player rows, including ratings/contracts and ID types.

The original normal-generation regression remains unchanged: all three starting years retain normal provenance, varied contracts, correct assets, independent identities and playable Week 1 through save/reload. The existing fallback-career, historical pick and PR #1806 isolation coverage is retained.

## Validation

The targeted command below passed **13 files / 98 tests** in **107.96s**, on Node 22.23.4:

```sh
node node_modules/vitest/vitest.mjs run \
  tests/integration/rosterImportIdentity.worker.test.js \
  tests/integration/normalGeneration.test.js tests/integration/fallbackDraftYear.test.js \
  tests/unit/dynastySoakPlayerIdentity.test.js tests/unit/opaqueEntityLookup.test.js \
  tests/unit/referenceIntegrity.test.js tests/unit/dynastySoakAudit.test.js \
  tests/unit/draftClassHistory.test.js tests/unit/transactionTimeline.test.js \
  src/ui/utils/opaquePlayerReadiness.test.js src/ui/utils/rosterReadinessModel.test.js \
  src/ui/utils/weeklyPrep.test.js src/ui/components/__tests__/TradeFinder.playerIdentity.test.jsx \
  --maxWorkers=1
```

Supplemental management/profile command:

```sh
node node_modules/vitest/vitest.mjs run \
  tests/integration/playerManagementIdentity.worker.test.js \
  src/ui/components/__tests__/PlayerProfile.test.jsx \
  src/worker/__tests__/playerManagementHandler.test.js --maxWorkers=1
```

The first repaired-head browser run passed **all 10 tests** in **2.9m** (first-playable render, three draft-year save/reloads, full desktop Week 1 and 390px touch readiness, all four PR #1806 isolation cases). Its complete deployment check passed, and the soak subset passed **103 tests / 8 files** in **2.89s**. Final-head CI, deployment and desktop/iPhone results are recorded below after completion.

## Review disposition and deferred scope

The original P1 thread has a fix/evidence reply and is resolved. Fresh `@codex review` was requested after each repair iteration. The first fresh review returned a P1/P2 pair; the second returned the three-response-handler P2; all were reproduced, fixed and resolved. The third review returned the weekly pursuit/rank pair, now fixed and resolved; the latest request targets `3b2b34fa`. The final handoff records any new unresolved threads; resolving the original thread is not a claim that fresh review has completed.

The unused/dropped extension-redirect transport described above is deferred. The prior report's independent issues also remain deferred: zero initial unsigned players, draft-pick cache `year`/`season` mismatch, broader cap-screen consistency, trade-resolution `capHitOf`, draft React #185, contract-years progression, and Starting Year keystroke clamping. This focused audit does not claim all numeric player-ID conversions elsewhere in the worker (for example, offseason/free-agency and AI trade paths) have been repaired. It addresses the confirmed importer and the four requested essential consumers, with the report-reader dependencies required to make the audit associations correct. No old career is migrated or rebased.

Do not merge automatically. Independent review and green required checks are prerequisites to merge.

## Final reviewed code and remaining blockers

Code head: `7eef2473ef13d8e6bd1baab2d457b28afe543e9e`. The final report commit changes documentation only.

[Complete CI run](https://github.com/rbcati/FootballGMSim/actions/runs/40210083297):

| Command | Exact result |
| --- | --- |
| `npm run test:unit` | **535 files passed / 1 skipped; 6,502 tests passed / 1 skipped**, 290.05s |
| `npm run durability:test` | **9 files / 98 passed**, 275.61s |
| `npm run check:deploy` | **Passed**: production build, Node/Netlify parity, routing rules, Netlify CLI production and deploy-preview contexts |
| `npm run test -- tests/e2e/fresh_franchise_first_week_smoke.spec.js tests/e2e/nfl_schedule_bye.spec.js` | **4 passed**, 1.2m; includes desktop complete Week 1 and touch readiness |

The preceding code head `3b2b34fa` also passed the complete local production-preview acceptance command (first-week, first-playable, slot-isolation and draft-year files): **10 passed / 2.8m**; its separate full iPhone Week 1 run passed **1 / 45.1s**. All four PR #1806 browser isolation cases passed. The final-head local broad run was interrupted by environment replacement before its result could be recovered and is not counted as passing evidence. CI provides the completed final-head desktop result. The latest mobile result is appended below.

Fresh Codex review was requested on each code revision, most recently [7eef2473](https://github.com/rbcati/FootballGMSim/pull/1807#issuecomment-6399935117). All eight earlier threads have fix/evidence replies and are resolved. The fresh review returned **two unresolved threads**:

* **P1 [accepted trade execution](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4371475795)**: Codex reports a real-worker one-for-one acceptance returning accepted:true without exchanging normal players; numeric fallback exchanged them. Source inspection independently confirms numeric coercion in `handleAcceptTradeOffer`, `executeAcceptedTrade`, and related legality boundaries. The Trade Finder selection repair does not fix trade execution. No independent new acceptance regression or execution repair is claimed here.
* **P2 [immediate free-agent offer resolution](https://github.com/rbcati/FootballGMSim/pull/1807#discussion_r4371475800)**: Codex reports an actual released normal player's generous offer remaining pending while numeric fallback signed immediately. Source inspection confirms `resolvePendingFreeAgencyOffers` converts the requested opaque ID to NaN and excludes all players. This is distinct from the zero initial unsigned-player pool. No end-to-end immediate signing repair is claimed here.

These are intentionally left open for follow-up implementation and review. They affect additional transaction execution paths beyond the four requested consumer audits and the confirmed import boundary. In particular, accepted trade legality/execution must receive its own real-worker mutation/persistence coverage before activation can be considered safe. Passing creation, Week 1 and save tests cannot establish that safety.

**Merge recommendation: NOT MERGE-READY.** The original P1 importer and all four requested consumer defects are repaired with regression coverage, but the newly reported accepted-trade P1 and immediate-offer P2 remain unresolved. Keep PR #1807 open and do not merge. Existing broader independent issues listed above also remain outside this repair.

Final-code iPhone production-preview command (Node 22, system Chromium):

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium PLAYWRIGHT_VIEWPORT=iphone \
  npx playwright test tests/e2e/fresh_franchise_first_week_smoke.spec.js \
  --grep 'fresh franchise first week smoke'
```

**1 passed (47.1s)**, test body 34.7s. Fresh browser context, real production bundle/worker/IndexedDB; normal provenance, varied contracts, roster/lineup inspection, complete Week 1, score/Game Book/standings, and reload before and after simulation. This confirms first-week acceptance while leaving the two transaction blockers above unresolved.
