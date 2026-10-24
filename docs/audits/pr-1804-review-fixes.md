# PR #1804 review corrections

Reviewed head: fc98cdb4292a4b43cedb18bc854b864902cec4df. Baseline main remains 0185cd0b1182fda4d6f76fb4517298b83e13c93d. No calibration thresholds, scoring probabilities, financial systems, roster UI, or historical records are changed.

## Confirmed defects and repairs

1. **Unsafe ID dictionaries.** CodeQL's review identifies `js/prototype-polluting-assignment` at richGameSimulator.ts:727, alert 82. Although the original offensive ledger used a null-prototype dictionary, its mutable row escaped to a dynamic lookup/write, while `allocatePlayers` and `toBoxScore` used ordinary objects. `__proto__` could alter the output object's prototype and vanish from enumeration. Legacy `capturePlayerStats`, `transformStatsForBoxScore`, and the live narration dictionary had the same problem. `playerGameLogs` also mistook inherited names for a home player's participation after JSON reload. The ledger now owns a `Map` and validates drop credits internally. Mutable ID dictionaries use null prototypes, serialized maps use `Object.fromEntries`, and consumer membership checks use `Object.hasOwn`. This preserves valid unusual IDs rather than silently dropping or renaming them.

2. **Partial hot-cache commits.** `applyGameResultToCache` previously accumulated season stats and standings before archiving, setting `statisticsCommitted` only at the end. A throw during these mutations made a retry accumulate again. `cache.withGameResultTransaction` now restores participating team fields, season rows, metadata, weekly archives and dirty tracking on synchronous failure, using the cache's existing clone/reference restoration primitives. Team roster references are retained. The persisted schedule marker is explicitly dirtied and joins games/season rows in the existing `bulkWrite` transaction. Failed storage retains the successful hot commit and restores dirty tracking via existing `flushDirty`; replay sees the marker and retries persistence without accumulating again. Missing schedule authority fails visibly before mutation. No new persistence mechanism or schema was added.

3. **Legacy passing without a passer.** `generateStatsForTeam` defaulted to 30 attempts when no active QB existed. Receiver/RB production could then survive with no passer. There is no supported emergency passer in this path. Empty eligible QB groups now fail before generating offensive attribution, using the existing simulator error/retry path. Attempts start at zero and no longer fall back to 30. Legitimate pre-injury statistics and existing backup shares remain supported.

## Regression evidence

- `offensiveLedger.test.ts`: reserved IDs credit independent pass/rush/drop rows; unknown inherited names are rejected.
- `gameStatAttributionIntegrity.test.ts`: 12 rich games with reserved IDs spanning QB/RB/WR/defense/kicker, JSON round trips, own-row checks, exact reconciliation and unchanged Object.prototype; real legacy batch with reserved QB/RB/WR IDs; missing, injured and inactive QB rooms fail without returning a credited game. Existing event/eligibility sweeps remain in place.
- `tacticalTendency.test.js`: independent trials now clone their initial rosters, instead of carrying prior-trial injuries into later seeds/comparisons. The no-QB guard exposed this invalid fixture reuse; all existing tendency assertions remain unchanged.
- `playerGameLogs.test.js`: four restored away IDs resolve to the correct opponent/stat line; absent inherited names produce no game row.
- `gameStatCommitFailures.worker.test.js`: real initialized franchise and three rich games, seeds 1804–1806. Injects throws after all season accumulation, after archive insertion, and inside IndexedDB game writes. Checks both teams, standings, archive uniqueness, commit markers, dirty retries, SAVE_NOW/LOAD_SAVE and replay after reload. Uses the existing database transaction and worker save/hydration paths.

## Controlled calibration diagnosis

The diagnostic is deliberately separate from the unchanged `engineSoak.test.js` gate. Reproduce with:

```sh
git worktree add --detach /tmp/football-before 0185cd0b1182fda4d6f76fb4517298b83e13c93d
git worktree add --detach /tmp/football-reviewed fc98cdb4292a4b43cedb18bc854b864902cec4df
# Make the repository's installed dependencies available in both worktrees.
GAME_STAT_BASELINE=/tmp/football-before GAME_STAT_REVIEWED=/tmp/football-reviewed \
GAME_STAT_CALIBRATION_OUTPUT=docs/audits/pr-1804-controlled-calibration.json \
npx vitest run tests/unit/gameStatCalibrationComparison.test.js
```

Executed with Node 22.23.3; one diagnostic passed. Seed 20260605, four seasons, 1,088 fixture games from each of main, reviewed head and corrected head. Each of the 3,264 fixtures is replayed by baseline and repaired rich engines using identical deep-copied inputs (including roster, seed and injury-conditioned attributes). A spy observes the real matchup resolver; it does not replace outcomes or RNG. **Zero unexplained yards and zero final-score differences in all 3,264 pairs.** Detailed output: [controlled calibration](pr-1804-controlled-calibration.json).

| Input corpus | Baseline engine PY/game | Repaired engine PY/game | Net excluded uncompleted-pass yards | Completed-pass end-zone excess |
| --- | ---: | ---: | ---: | ---: |
| Main soak inputs | 228.428768 | 213.161305 | 2.519761 | 12.747702 |
| Reviewed soak inputs | 224.220129 | 209.238971 | 2.455882 | 12.525276 |
| Corrected soak inputs | 224.808364 | 209.872243 | 2.380515 | 12.555607 |

On main's identical inputs, 15.267463 yards/team-game of movement is attribution correction: remove 12.747702 beyond the goal line and 3.827665 positive yards on uncompleted passes, while removing previously subtracted failed-pass/sack losses **adds back** 1.307904. This decomposition sums exactly to the baseline/repaired difference; it does not restore phantom gains.

The original sequential soak compares 228.428768 with 209.238971, a drop of 19.189798. Of that, 15.267463 is the controlled attribution effect and 3.922335 is changed input conditions. The harness runs legacy games first and then rich games on the same mutated rosters across seasons, without normal franchise injury recovery. Attribution changes in legacy TD selection can change later RNG/injury paths. This is not evidence of a rich-engine scoring rebalance: paired final scores are identical.

The review guard exposes three legacy games with no eligible QB in the four-season soak. Those games now return an error instead of fictitious passing. That changes subsequent legacy injury draws and moves the corrected sequential result by +0.633272 to 209.872243; it does not make the calibration gate pass. The diagnostic reports these legacy errors, never treats them as completed games, and still requires zero rich crashes. The existing zero-error gate remains active.

**Merge impact:** the 220-yard passing floor still fails even under controlled original inputs (213.16). Passing/rushing distribution calibration belongs to #1809. Separately, the soak's cross-season injury lifecycle needs valid fixture maintenance or an explicitly supported emergency-passership design; this PR does not invent one or relax its zero-crash gate. No thresholds were changed, skipped or marked expected-failure. PR #1804 remains blocked while required checks are red.

## Compatibility and ownership

Completed-game ledgers, season totals and schedule markers continue to use the existing archive/IndexedDB schema and atomic writer. Old games are not regenerated or migrated. The normal-ID rich simulation uses the same seeded gameplay RNG; these review fixes alter dictionary safety and failure handling. Depleted legacy QB rooms now fail visibly. Historical invalid attribution remains untouched.

## Verification status

The final PR description and review response record completed command results and head-specific GitHub Actions status. Initial focused verification passed 34 tests in three files, the retry/persistence worker test passed, the dynasty soak passed 103 tests in eight files, and production build and simulator type checking passed. The calibration gate remains deliberately active and failing. Security alert details API access is denied to the repository integration (HTTP 403); the review comment identifies alert 82. A passing CodeQL job alone is not proof that all repository alerts are resolved.
