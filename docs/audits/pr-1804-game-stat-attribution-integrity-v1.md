# Game Stat Attribution Integrity V1

Base audited: `0185cd0b1182fda4d6f76fb4517298b83e13c93d` (latest fetched main, #1803 merge). No post-#1803 commits existed at fetch. Branch: `fix/pr-1804-game-stat-attribution-integrity`.

## Preimplementation audit

The audit was completed and reported before editing implementation. B1 and B2 were reproduced, not assumed.

- `src/core/sim/richGameSimulator.ts`: `allocatePlayers` independently called `distributeTotal` for catches, receiving yards and receiving TDs. It independently split carries and rushing yards after reserving arbitrary QB percentages; it omitted rush TDs and individual longest plays. Zero-volume receiving rows could have yards/TDs, negative totals were clamped away, all turnovers became QB interceptions. Missing receiving personnel fell back to arbitrary roster members; an explicit empty roster manufactured default players.
- `simulateRichGame` already ran individual `resolveMatchup` results and selected each pass target using existing rating, morale, role and depth weights. Advanced attribution events existed, but the final basic box score discarded that ownership. There were no live runner IDs or retained individual rush gains. No rich-engine in-game injury generator existed. Pregame eligibility belongs to `isAvailableForGameDay`, through `deriveGameDayAvailability` at the worker boundary. Selected starting units describe effective team attributes, not the entire legitimate rotation pool.
- Rich passing counters included sacks and unsuccessful-pass losses, including independent interception rolls on otherwise successful results. The resolver can also tag a failed run as `isSack`; that flag cannot make it a passing sack. The resolver samples gains beyond the goal line. These are bookkeeping problems at the resolution/credit boundary; field movement and final scores remain owned by the existing resolver/orchestrator.
- `src/core/simulation/index.js`, `statAccumulator.js`: default settings enable rich simulation, but legacy remains a supported explicit/fallback path. Legacy scoring comes from `driveEngine`/`canonicalGameEvents`; per-player offense comes from aggregate generators, not the narration's independent `liveStats`. RB receiving yardage had an additive yardage draw with zero catches. TD selection did not constrain catches/carries, and QB completions and yardage were apportioned independently. Active groups checked only `canPlayerPlay`, omitting holdout, ownership and roster-status gates. Capture normalized even empty player lines, manufacturing games played. Legacy longest plays were estimates from aggregates, not authoritative events. Injury substitution generates the starter's played share plus backup share; filtering those players after the injury would erase valid production.
- `src/worker/worker.js`: `buildWeekMatchupsFromLeague` → `SimulationManager`/`SimWorker` → `mapGameSummaryToLegacyResult` → `applyGameResultToCache` → `buildArchivedGame`/`normalizeArchivedGamePayload` → cache dirty buffer → IndexedDB. The worker accumulated box-score stats in `cache.updateSeasonStat`, independent of the legacy roster mirrors. It summed maxima and rates, mixed playoffs into regular totals, lacked a persisted commit marker and did not copy injury entries into the completed-game archive. All-time leaders combined current persisted and live season rows twice. A populated prior-season leaderboard could also fall into all-time aggregation.
- Game Book consumes persisted `playerStats`; no simulation occurs on reads. Its longest columns use `rushLong`/`recLong`, while the player schema uses `longestRun`/`longestCatch`. League Stats has similar aliases. Player Profile preferred partial available game logs over complete recorded totals; its game-log sum could include playoff production, and traded-player log opponent/result used current ownership instead of the represented side.
- Save/load restores `PlayerStats` and does not replay games. Rollover archives regular-season `totals` and clears the current cache. Historical game records do not need regeneration or migration.

## Repair and ownership

`offensiveLedger.ts` credits one resolved pass or run atomically. Completion, gain, receiver, passer and TD travel together; sacks are dropbacks without attempts/carries; interceptions are incompletions; fumbles belong to the participant. Kneels belong to the actual primary QB. Every longest gain is a maximum of that participant's credited gains, including all-negative outings. Zero is canonicalized before serialization. IDs are indexed once and invalid ownership fails visibly.

`simulateRichGame` reuses the already-selected pass target and existing depth/rating/morale weighting. Runners use the previous primary-QB 9% carry share plus weighted remainder, precomputed once. Runner selection uses the existing seeded PRNG algorithm in a separate deterministic attribution stream, avoiding new scoring-stream draws. No target-usage system, scoring odds or playbook was added. Team offensive counters and player counters share the same ledger. Yards stop at the goal line; passing yards are completed-pass yards, not sack or failed-pass losses. Sacks and their loss are explicit QB fields. The resolver's existing field movement and score remain authoritative and unchanged.

Legacy aggregate generation remains aggregate. Existing receiving/rushing usage and injury share generation remain in place. Receiving yards require catches; bounded largest-remainder QB apportionment assigns yards only to QBs with completions; offensive TD selection consumes catch/carry capacity and passer TDs consume completion capacity. Impossible attribution throws a detectable simulation failure rather than crediting an inactive fallback. Empty lines are excluded before normalization and accumulation.

**Legacy longest limitation:** reliable individual gains do not exist in the legacy scoring authority. New legacy results omit estimated offensive longest fields; they do not invent gains from aggregate totals or borrow nonauthoritative narration. Rich results provide measured longest plays. Existing saved legacy estimates remain untouched. This is an explicit limitation, not a claim that legacy gained play-level accounting. Legacy TD ownership is coordinated aggregate attribution, not a reconstructed scoring-play timeline. The rich engine still does not generate midgame injuries; legacy substitutions retain their pre-injury credited shares.

`statAggregation.js` supplies shared addition/max/rate semantics. Persisted season `totals` contain regular games; additive `playoffTotals` preserve playoff statistics separately. New games carry `statAttributionVersion: 1`, `statScope`, and a persisted schedule `statisticsCommitted` marker. The worker copies the same box score into the game archive and accumulator. All-time leaders deduplicate `(seasonId, playerId)` with live rows preferred, and apply maximum semantics. Rushing rankings include QB/WR carries. Display adapters resolve canonical longest aliases; Player Profile prefers recorded current-season totals and keeps playoff logs outside the regular-season sum. Historical trade logs use the side that credited the player.

## Compatibility and risks

No broad migration or historical repair runs. Existing game records and old season totals, including previous invalid attribution or estimated longest plays, remain unchanged on load/read. New games appended to a legacy season are correct individually; an old season's already-corrupt cumulative totals are not silently rebuilt. New playoffs use `playoffTotals`; previously mixed totals are not retrospectively separated. Optional new fields are backward compatible. Existing zero-initialized stat schemas are retained; signed first-game maxima are handled by participation counts.

Usage distributions can change because ownership now follows events and invalid allocation is removed. No global RB/WR calibration was performed. Removing postgame offensive RNG draws changes randomized aggregate defensive box-score allocation, but not the rich game outcome. The legacy generator's constrained TD selection can change later seeded aggregate draws where impossible recipients previously existed. No additional full play-by-play is persisted. Runtime work is linear in plays plus roster size; lookup/pools and runner weights are cached. Validation is pure and test-only; it never repairs records.

## Verification

Final executed checks and counts follow. The focused regressions, real-worker campaign, baseline comparison and browser smoke use actual production simulation and persistence functions; spies call through to the real engines.

Baseline comparison (fixed identical rosters, seeds 1–256): 256 games, 141 baseline invariant failures, zero repaired invariant failures, **0 changed final scores**. Seed 1 home RB2: before 0 catches/46 receiving yards/1 receiving TD; after 3 catches/36 yards/1 TD, supported longest catch 17. Final score remains 27–28. See `pr-1804-stat-comparison.json`.

The old scheme parity snapshots were observed failing after intended stat changes. Only their result digests were updated; all twelve original final-score and scheme-fit expectations remain unchanged. Fixtures with a defense-only opponent now supply legitimate offensive personnel. Two prior tests that required fabricated default players for explicitly empty eligible rosters now require visible failure.

The realism soak's existing yardage gates are deliberately unchanged. At seed 20260605 over 4 synthetic seasons (1,088 games per engine), repaired reported passing/rushing averages were 209.2/96.5, outside existing 220–280/100–130 bands; baseline was 228.4/101.1. This is disclosed, not tuned away. The win-distribution gate also fails at 77.2% versus its 68–76% band (baseline 75.2%). Scoring, variance, performance, zero-crash and tie gates pass. The soak runs engines sequentially on a shared league mutated by legacy injuries, so cross-version campaign aggregates also reflect differing legacy injury histories; the fixed-state comparison separately proves unchanged rich outcomes. Do not infer that 1,088 soak games exercised the full worker save pathway.

## Deferred work and review disposition

- #1809: assess calibration using corrected credited yardage; investigate the unchanged failing realism bands separately. Do not restore phantom yards or adjust probabilities in this correctness PR.
- #1807: no depth-chart UI changes. Existing canonical injury flags remain authoritative; descriptive legacy injury metadata is not reinterpreted by this PR.
- #1805, #1806 and #1808: no salary-cap, game-plan-persistence or weekly-navigation work included.
- Future legacy engine work, if retained: retain authoritative individual gains during scoring resolution before offering measured longest plays. This PR does not claim that information exists.

Final disposition: REVIEW WITH WARNINGS. In particular, the realism gate and unsupported legacy longest plays prevent an unconditional ready verdict.


### Final executed evidence

Runtime: Node **22.23.3**. Dependencies installed with `npm ci --cache /tmp/football-npm-cache`. The repository does not declare TypeScript despite providing `check:sim-types`; TypeScript **5.9.3** was installed in `/tmp/football-tooling`, with that bin directory added to PATH for the actual script. No dependency/lockfile changes. No lint script or linter is configured.

| Executed command | Result |
| --- | --- |
| `npm run test:unit -- --exclude tests/unit/engineSoak.test.js --maxWorkers=2` | **520 files, 6,417 tests passed** |
| `npm run test:unit -- tests/unit/engineSoak.test.js` | **9 passed, 1 failed**: corrected passing yards 209.23897 are below the unchanged 220 floor; the deterministic paired-soak test passes |
| `npm run durability:test -- tests/durability/gameStatAttribution.worker.test.js` | **2 passed**, 448.00 seconds of tests: 272 rich regular games, complete postseason and rollover to Season 2; 64 legacy regular games and one persisted in-game injury |
| `npm run durability:test -- --exclude tests/durability/gameStatAttribution.worker.test.js --maxWorkers=1` | **6 files, 92 tests passed**, including existing multi-season scheduling/save lifecycle checks |
| `npm run test:soak` | **8 files, 103 tests passed** |
| `npm run test:unit -- src/core/__tests__/holdoutEngine.test.js src/core/__tests__/gameStatAttributionIntegrity.test.ts src/core/sim/offensiveLedger.test.ts src/ui/utils/playerGameLogs.test.js` | **4 files, 92 tests passed**, including the final five explicit inactive/released/suspended cases |
| `npm run test:unit -- src/core/__tests__/gameStatAttributionIntegrity.test.ts src/core/sim/offensiveLedger.test.ts src/core/__tests__/simulation/canonicalGameAuthority.test.js src/ui/utils/playerGameLogs.test.js tests/unit/schemeSimulationParity.test.js --update` | **5 files, 49 tests passed**; snapshot result digests updated, original scores/fits retained |
| `npm run check:sim-types` | Passed with TypeScript 5.9.3 available on PATH |
| `npm run build` | Passed, 13.37 seconds; existing chunk-size warning |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test tests/e2e/fresh_franchise_first_week_smoke.spec.js` | **2 passed**, desktop first-week / player-profile / Game Book reload and 390px mobile smoke |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test tests/e2e/box_score_clickthrough.spec.js` | **2 passed**, actual player-table and final-score equality after restoring the same saved franchise |
| `git diff --check` | Passed |

The complete unsplit unit run was also executed: 520 files passed; the engine-soak file had two 30-second timeouts under concurrent load. The isolated rerun resolves the timing uncertainty: determinism passes, realism fails. No thresholds or timeout assertions were loosened. Earlier failures in incomplete test rosters, estimated longest values, signed zero, stale quarter-score selectors and a fresh-start reload helper were fixed and rerun. The corrected browser test compares the actual Players table instead of requiring a quarter-score element removed by an earlier UI revision.

Final isolated counts across the split unit run: **521 files / 6,427 tests, 6,426 passed and 1 disclosed realism failure**. This is not a claim that the whole suite is green. The separate durability total is **94 tests passed**.

The fixed-state comparison is reproducible:

```sh
git worktree add --detach /tmp/football-before 0185cd0b1182fda4d6f76fb4517298b83e13c93d
ln -s "$PWD/node_modules" /tmp/football-before/node_modules
node --import tsx scripts/game-stat-attribution-sweep.mjs --baseline=/tmp/football-before --baseline-ref=0185cd0b1182fda4d6f76fb4517298b83e13c93d --output=docs/audits/pr-1804-stat-comparison.json
```

Direct invariant tests cover seeds **1–64**, three rich personnel configurations (192 unique cases, each replayed deterministically), **65 legacy cases** (1–64 and 122), and **500 aggregate-generator seeds** with low receiving volume. Worker franchise seeds are **1804** and **4180**. The four-season synthetic calibration comparison uses **20260605**; the paired soak determinism check uses **4242**. Calibration runs each complete 1,088 games per engine, but do not use the save lifecycle.

Machine-readable evidence:

- `pr-1804-stat-comparison.json`: baseline violations, corrected invariants, unchanged fixed-state scores, actual before/after line.
- `pr-1804-worker-stat-evidence.json`: both real-worker campaigns, persistence/readout reconciliation, injury count, completed regular season and rollover status.
- `pr-1804-baseline-engine-soak.json` / `pr-1804-corrected-engine-soak.json`: full calibration gate results and measured runtime. Final corrected mean was 13.42 ms/game, below the existing 50 ms limit; this timing was measured while other checks ran and is not a controlled speed comparison.

All new-game receiving/rushing participation, exact team sums, rich event-supported TD/longest identity, inactive exclusions, preserved injury shares, persistence, regular-season accumulation, leaderboard deduplication, repeated reads, advancement and rollover checks passed in their executed campaigns. Existing scoring categories and probabilities remain unchanged. **Review with warnings** remains appropriate: the calibration gate is red and legacy measured longest plays remain unavailable. No PR is declared merge-ready, and no merge or production deploy is requested.
