# Main-only and #1804 combined validation

This report distinguishes statistical acceptance, main compatibility, and cross-system integrity. #1804 was never merged into production to conduct this comparison.

## Exact states and authorities

| State | Ref | Purpose |
|---|---|---|
| A | main `0185cd0b1182fda4d6f76fb4517298b83e13c93d` | Existing-main compatibility baseline |
| B | `calibration/football-production-v1` | Independently reviewable main-targeting calibration |
| Corrected before | #1804 `bebba8285ccbed8c995e7b4df551905dcf309905` | Actual, attributed production baseline |
| C | `integration/football-production-v1` | Corrected ledger plus exactly the same calibration |

The sole gameplay change is source commit `c313bcc0` on B and identical source commit `ed64210d` on C: snap-clock base 22 → 20. Harness/audit changes and evidence are separate. Each worktree shares installed dependencies but has its own tracked source. No integrity, persistence or display changes were copied into B.

The corrected baseline fails passing/rushing only. All four C seed populations pass every original numerical gate. See [analysis](pr-1809-football-production-calibration.md) and [full measurements](pr-1809-statistics.json); main-only passing/rushing are compatibility results, not calibration acceptance evidence.

## Executed checks

Node 22.23.0 locally; Actions uses the repository's Node 22 workflow. TypeScript 5.9.3 came from temporary tooling, with no manifest or lockfile changes. There is no configured linter.

| Check | A / before evidence | B | C |
|---|---|---|---|
| Four-season engine gate, seed 20260605 | A passes; corrected before fails passing/rushing | PASS, all bands | PASS, all bands |
| Three extra corrected seeds | Corrected-before yardage fails | Not used as corrected evidence | PASS: 4242, 8675309, 314159 |
| Full unit suite | A Actions: **6,401 pass / 519 files**; local loaded run has 2 timeout failures, then isolated 10-test gate passes | Source-head Actions: **6,402 pass / 520 files** | Source-head Actions: **6,446 pass / 524 files, 1 pre-existing controlled-audit skip** |
| Targeted simulator / overtime tests | Existing tests retained | Shared 192-game adversarial test passes; full gate passes in Actions | Existing simulator/OT: **36 pass**; final isolated adversarial + gate: **11 pass**; integrity tests pass in full Actions suite |
| Durability / real worker + IndexedDB | A Actions: **92 pass / 6 files** | Source-head Actions: **92 pass / 6 files** | Local and source-head Actions: **98 pass / 9 files** |
| Dynasty engine stress, `npm run test:soak` | Dedicated local run: **103 pass / 8 files** | Dedicated local run: **103 pass / 8 files** | Dedicated local run: **103 pass / 8 files** |
| Simulator strict type check | PASS | PASS | PASS |
| Production build | A head-specific Actions passes | Local PASS | Local and source-head Actions PASS |
| Netlify production/preview parity | A Actions PASS | Source-head Actions PASS | Source-head Actions PASS |
| Browser smoke / schedule | A Actions **4 pass**; stale-quarter failure reproduced; revised control recorded below | Source-head Actions **4 pass**; expanded local **6 pass** | Source-head Actions **4 pass**; expanded local **6 pass** |
| Diff whitespace | Baseline untouched | PASS | PASS |

The only existing skipped unit test on C is #1804's explicit worktree-controlled audit (`gameStatCalibrationComparison.test.js`) when its environment paths are absent. It is not the calibration gate. No test, threshold, timeout or required workflow was disabled or relaxed here.

## Actual Actions evidence

- [A, existing main head](https://github.com/rbcati/FootballGMSim/actions/runs/39781847236): existing green workflow, exact main SHA above.
- [Corrected #1804 before calibration](https://github.com/rbcati/FootballGMSim/actions/runs/39727143492): existing failed yardage gate, not waived.
- [First main-only audit](https://github.com/rbcati/FootballGMSim/actions/runs/39896084416), `04e3b508`: 6,401 passed, one newly authored audit fixture failed. It submitted unavailable refs directly to old main's simulator, which lacks #1804's internal filtering. The shared fixture now uses canonical eligible personnel and an IR status supported by both branches; stronger raw inactive/foreign-player tests stay in #1804. No production availability mechanics were changed, and the final shared fixture passes locally on B/C.
- [First combined integration run](https://github.com/rbcati/FootballGMSim/actions/runs/39896114517), `d5469b9f`: unit **6,446 pass / 1 skip**, durability **98 pass**, deploy parity pass; optional five-season durability passed. All workflow jobs, including the **4-test browser job**, passed.
- [Final-fixture B run](https://github.com/rbcati/FootballGMSim/actions/runs/39896673833), `1178c74f`: **SUCCESS**, all required jobs plus optional five-season durability.
- [Final-fixture C run](https://github.com/rbcati/FootballGMSim/actions/runs/39896679574), `fb8207c0`: **SUCCESS**, all required jobs plus optional five-season durability.

These manual workflow runs exercise the unchanged required jobs and additionally run the existing optional five-season job. The main-targeting PR must also have its own green PR-triggered workflow and CodeQL at its final documentation/test-only head before claiming merge readiness; its live check links and final outcome are recorded in the PR description.

## Integrity and consumer evidence on C

The four seed populations check **4,352 rich games / 8,704 team-games**: pass yards equal receiving yards, completions equal receptions, rush attempts/yards/TDs reconcile, and players cannot earn yards or TDs without their recorded catch/carry. `netPassYards = grossPassYards - sackYards`; net team total is gross passing + rushing − explicit sacks. Plays equal attempts + sacks + carries. No gross/net interchange is used to meet the yardage gate.

The existing real-worker durability suite was rerun with calibration. Its unchanged attribution campaign executes a full 272-game rich regular season plus postseason/rollover, 64 legacy games, repeated consumer reads and save/reload. It compares the actual completed-game box scores, archives, Game Book presentation, cumulative season totals, League Stats and canonical passer rating. The final-review tests add 32 actual games over two weeks and save/reload; depleted user/AI QB-room tests require a visible block, legitimate available signing, then resimulation. The full suite passes 98 tests. No emergency player, fake participation or migrated historical statistics were added.

The existing `offensiveLedger.test.ts` explicitly checks signed rushing/receiving gains, longest gains, designed QB runs, kneels, zero catches and rotation. `gameStatAttributionIntegrity.test.ts` records actual credited events across 192 configurations/replays and asserts each player's totals/longest gains derive from their own plays. `gameStatFinalReview.test.ts` enforces sack-adjusted net totals, end-zone-capped actual/archived drive movement and authoritative zero/negative net offense. These checks run unchanged on C.

The shared adversarial test adds 192 actual games with independent game seeds and mixed talent/personnel/plan settings. Plan settings are bundled stress cases, not isolated causal estimates of one slider. Its exact replays compare within the same version. Its old-clock pairing reports score changes; it does not require version-to-version score identity. The existing no-gameplay-change #1804 paired audit is not repurposed to reject legitimate score changes from this calibration.

## Local timeout and fixture attempts

The first local A full suite ran under several competing CPU-intensive jobs: **6,399 pass / 2 timeout failures**. Both failures are the existing 30-second soak tests; rerunning that file with less contention produced **10/10 passing** without changing timeouts. An early C targeted run similarly had two soak timeouts while all 40 other targeted tests passed. The final isolated C run passed **11 tests**, the A isolated gate passed **10**, and both source-head Actions suites passed. Those successful reruns are acceptance evidence, not the loaded failures.

The first B full/local and Actions audit attempts exposed the new fixture error described above; that failure is not a calibration dependency requiring an integrity merge. Both final-fixture source-head workflows fully passed; B has 6,402 unit tests and C has 6,446 passing plus the existing controlled-audit skip. No production calibration was changed to resolve the fixture issue.

## Browser baseline control and test-only correction

The original main box-score test fails on untouched A and calibrated B because it requires `game-book-quarter-scores`. The unchanged model explicitly forbids a chronological quarter table for canonical-ledger games; see `src/ui/utils/boxScoreViewModel.js` and the #1700 contract in `docs/canonical-gamecast-playable-tomorrow-v1.md`. B's original reload test also timed out in its generic launcher. These results were not reported as passes, and C's earlier six passes used #1804's revised tests rather than that stale assertion.

The separate test-only commit `cf7b2e2f` copies exactly #1804's reviewed browser correction. It requires recorded player links, then waits for the same franchise identity and checks identical final score/player-table text after reload. No production display or persistence code is changed; no test is skipped, threshold reduced, or invalid chronology restored. The expanded revised B suite passes all **6 cases**, including reload, desktop/mobile first-session and schedule scenarios. C also passes all **6**. An unchanged-main production control ran the two revised cases with only the test file substituted, then restored that file; both revised cases **pass (2/2)** on untouched main production, confirming the test-only repair is independent of calibration and #1804.

Initial local browser attempts could not start a preview server in the network-restricted sandbox. Reruns with approved network access built and served their own worktree; CI mode prevented accidentally reusing another branch's preview. The final passing runs supersede those startup failures.

## Safe merge order

1. Keep the integration branch as evidence only; do not merge it.
2. Merge the independently main-targeting calibration only after its own required checks and C's required checks are green.
3. Rebase #1804 onto the calibrated main, preserve its ledger/integrity commits, and require all of its workflow jobs green before merging.

No automatic merge is enabled. A future failure should keep the prerequisite blocked; do not force a red merge, lower bands, or move unreviewed integrity changes into B. The documented role-usage, red-zone-counter and gain-shape limitations require separate structural work and are not solved by this calibration.
