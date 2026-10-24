# PR #1804 final statistical consistency review

> Historical review: the sections below record pre-calibration verification at
> `bebba8285ccbed8c995e7b4df551905dcf309905` and its earlier reviewed base. Their
> failed yardage gates and BLOCKED verdict are historical. Fresh integration
> evidence is recorded in the post-calibration section at the end; these original
> measurements have not been rewritten.

Reviewed base: `65bc42b79589fd1264e64596d304843cb5e7909b`. Scope remains statistical integrity, existing persistence and synthetic-fixture correctness. No scoring probabilities, calibration thresholds, cap rules, roster UI or historical records are changed.

## Confirmed defects and repairs

### Season passer rating

`accumulateStatLine` correctly excludes derived `passerRating`, but `handleGetAllPlayerStats` read that omitted value and emitted 0. AnalyticsHub displayed it directly. League Stats and player game logs also used independent noncanonical formulas. Player Profile and the leaderboard contained duplicate canonical formulas.

The existing `calculateCanonicalPasserRating` function has moved unchanged from the simulation orchestrator to its pure `mathHelpers.js` module, with its old export retained for compatibility. The worker's season readers, leaderboard, League Stats normalization, Player Profile and player game logs now call this same authority on cumulative attempts/completions/yards/TDs/interceptions. Zero-attempt display sentinels are preserved. No game ratings are summed or averaged, and stale saved ratings are ignored rather than migrated.

Evidence: a cumulative 60/100, 700-yard, 5-TD, 1-INT line displays **93.8**, even with a stale stored rating of 999. The new component regression renders AnalyticsHub and Player Profile and checks League Stats against that value. The worker regression simulates 32 actual regular-season games over two weeks, compares cumulative passing counts with the archived ledgers, and checks all three reader paths before/after SAVE_NOW and LOAD_SAVE. Existing full-season durability checks now assert canonical ratings too.

### Sack-adjusted net team offense

The live ledger credited positive `sackYards` losses to the passer but omitted them from team totals. Gross `passYd` now remains exactly equal to receiving yards; `sackYards` is accumulated separately and `netPassYards = passYd - sackYards`. Team `totalYards = passYd + rushYd - sackYards`, and `yardsPerPlay` uses that net numerator.

The canonical postgame builder and archive fallback apply the same explicit-loss accounting, include all-sack passers in participation, and count sack plays without adding duplicate alias counters. Missing legacy sack yardage is not fabricated. League Stats preserves explicit zero and negative team net yardage instead of replacing zero with gross pass-plus-rush yards. Total-offense rankings consume net yards; existing individual passing/receiving columns remain gross. No display manipulation compensates for invalid attribution.

Tests cover zero/one/multiple sacks, an all-sack passer with zero attempts, fumbles/turnovers, negative net yards, authoritative zero, downstream team rankings, and 32 real seeded simulations. Full worker durability now validates archived net yards against the player ledger for both teams.

### Touchdown-drive yardage

Confirmed: `curDrive.yards` accumulated sampled `yardsGained` even when the play resolver had capped `nextYardLine` at 100. It now accumulates `nextYardLine - priorYardLine` before possession changes. This uses actual field movement, including the resolver's field boundaries, without changing RNG draws, the resolver, scoring, clock, down or possession decisions.

Natural reproduction: seed **1**, opening drive, own 25 to opponent goal line, **81 sampled drive yards before → 75 actual/archived yards after**, score **27–28 unchanged**. A controlled deterministic regression forces an over-goal-line touchdown and compares credited gains, field movement, drive summary and serialized archive. The existing full-season worker campaign additionally compares persisted drive summaries with the unchanged real simulator outputs.

### Depleted-QB soak lifecycle

The synthetic soak ran consecutive seasons without weekly recovery, then ran the rich engine on the same legacy-injured roster objects. It also stripped availability/personnel information from rich player references. This accumulated impossible injury carryover and confounded the engine comparison.

The production worker's existing recovery mutation has been extracted, without changing its cadence or staff/RNG draws, into `advanceInjuryRecovery`. The harness uses that exact helper before each synthetic week and advances the remaining 35 calendar weeks between its 17-week seasons. It gives each engine an independent copy of the same initial league and passes full existing player references to rich attribution. Long injuries are not cleared early: the regression keeps a 40-week season-ending injury unavailable after 35 weeks and recovers it only after all 40 weeks expire. No failed game is ignored or counted as completed, and the zero-error requirement is unchanged.

Four-season seed **20260605** before: **3 legacy errors**, 1,088 rich games at 209.872243 passing yards. After fixture repair: **0 legacy errors / 0 rich errors**, **1,088 completed games per engine**, 213.982077 legitimate rich passing yards. The earlier controlled 213.161305 figure used the old input corpus and stripped player refs; the new figure comes from independent, valid fixture inputs. Neither figure is a target to tune toward.

## Normal-franchise QB depletion: supported resolution and limits

QB depletion is **not exclusively synthetic**. Normal weekly recovery can leave every rostered QB injured for more than one week, inactive, or otherwise unavailable. The production simulation must reject that game rather than invent a passer. This error now remains a `SimulationError` with team ID and an explicit “Activate or sign an available quarterback” instruction; it is no longer swallowed and mislabeled “no scoring”.

The new worker regression tests both the user team (0) and AI team (1): injure every rostered QB for six weeks, attempt actual legacy ADVANCE_WEEK, require a visible failure with unchanged current week, no archived games and no credited passing stats; release a receiver if needed; sign an existing healthy free-agent QB through the real `RELEASE_PLAYER`/`SIGN_PLAYER` commands; then simulate, save and reload. Only the legitimately signed participant receives the passing statistics. These tests stock a free-agent fixture with the production player factory **before** the failed attempt; the simulator never creates emergency players or statistics.

Availability constraints remain explicit: safe-starter leagues have no free-agent pool, and no existing automatic in-season AI replacement mechanism was found. A healthy signed/activated player must actually exist and satisfy existing roster/cap rules. The signing command supports explicit team context, but this is not a new autonomous AI roster policy. With no eligible replacement, the game remains blocked; a trade or other existing roster action is needed. This PR does not claim universal automatic resolution of arbitrary depleted rosters, bypass restrictions, or heal players early. Separately, weekly recovery currently occurs on ADVANCE_WEEK attempts, so retrying a failed week can consume another recovery tick; changing that broader lifecycle transaction boundary is deferred rather than hidden here.

## Calibration dependency and merge sequence

The unchanged full gate now reaches its original passing-yard assertion at engineSoak.test.js:71. Complete metrics are in [final harness report](pr-1804-final-review-engine-soak.json):

| Rich metric | Measured | Existing gate | Result |
| --- | ---: | ---: | --- |
| Passing yards/team-game | 213.982077 | 220–280 | FAIL |
| Rushing yards/team-game | 97.908088 | 100–130 | FAIL |
| Points/team-game | 24.75 | 20–27 | PASS |
| Top-quartile win fraction | 0.75 | 0.68–0.76 | PASS |
| Final ties | 0 | at most 1% | PASS |
| Crashes | 0 | 0 | PASS |

Score variance and performance also pass. These remaining yardage distributions belong to **#1809**. The fixture defects above are fixed independently; there is no threshold reduction, skipped calibration assertion or restored end-zone/phantom yardage.

Safe sequence: keep #1804 unmerged while required CI is red. Develop the #1809 prerequisite independently, validate it both on main and combined with the #1804 integrity branch using the same valid fixture lifecycle and unchanged gates. Merge #1809 first only if its required main checks pass and the combined integrity checks pass; then rebase #1804 onto that main and require its entire workflow to pass before merging. Do not merge a red #1804 first, waive checks or hide global calibration changes inside this attribution PR.

## Paired no-gameplay-change audit

Run with the reviewed head checked out in a dependency-enabled worktree:

```sh
node --import tsx scripts/game-stat-final-review-audit.mjs /tmp/football-final-before docs/audits/pr-1804-final-review-paired.json
```

Executed **256 paired games, seeds 1–256**. The script requires unchanged final/quarter scores, individual player lines, and drive result/play-count/clock transitions; it separately checks every team net-yard difference equals its credited sack losses. All checks passed. [Results and natural before/after examples](pr-1804-final-review-paired.json).

## Verification evidence

The final PR description records executed full-suite results and the actual head-specific Actions run. Focused verification completed 8 unit/component regressions and 3 new worker scenarios; build and strict simulator type checks passed. TypeScript 5.9.3 is supplied through temporary tooling because it is not a repository dependency. Existing lint tooling is absent. Historical saves are not migrated; newly generated records persist explicit net/sack fields, and missing historical sack gains are never synthesized.

Verdict remains **BLOCKED** until the unchanged required workflow passes. Calibration and the absence of universal automatic AI QB replacement are disclosed limitations, not grounds to manufacture production or label a red workflow ready.


## Post-calibration integration — 2026-10-23

Rebased the existing #1804 branch from `bebba8285ccbed8c995e7b4df551905dcf309905`
onto latest fetched main `d04896fa0aba07d54b87eff9bc5b43d3fd8bc22f` (the #1805
merge). Rebased implementation head: `94ce8aeae5752d00d6430cea4fec9675b3194c78`;
the subsequent audit commit changes documentation/evidence only.

The exact #1805 file overlap is `scripts/engineSoak.js` (observer hook introduced
by `04e3b508`) and `tests/e2e/box_score_clickthrough.spec.js` (reviewed browser
correction `cf7b2e2f`). Only the soak file produced a textual conflict, while
replaying `bebba828`. Resolution keeps independent `structuredClone(league)`
inputs for each engine AND forwards the observer into rich simulation. Detached
`structuredClone(res)` audit snapshots, full roster references, canonical weekly
recovery and the remaining offseason calendar survive together, with one audit
hook per game. The browser file is identical to main: actual player links,
identical score/player rows after reload, and matching active league/franchise
generation. No obsolete chronological quarter-table assertion returns.

`git range-diff` confirms the other changes to the replayed patches are removal
of the already-merged browser correction and adapting the soak edits to the
observer API. The implementation, fixtures, tests and snapshots exactly match
previous combined branch `fb8207c0` (`integration/football-production-v1`). The
only tree differences from that branch before this audit are the four #1805
audit documents. All reviewed #1804 production integrity code is unchanged;
`matchupEngine.ts` is identical to main, preserving `c313bcc0`'s 20-second snap
clock. There is no new probability, scoring, RNG, roster/cap, schema or historical
save migration change. Existing signed-QB recovery tests remain explicit; no
automatic emergency QB or invented passing production is added.

Fresh calibration uses Node 22.23.3 and the existing four-season gate with its
original thresholds. Command: `CORRECTED_LEDGER=1 node --import tsx
scripts/football-calibration-audit.mjs . /tmp/pr1804-rebased-calibration.json`.
[Fresh metrics and invariant counts](pr-1804-post-calibration-integration.json):

| Seed | Passing/team-game | Rushing/team-game | Points/team-game | Top-quartile wins | Gate |
| --- | ---: | ---: | ---: | ---: | --- |
| 20260605 | 226.527574 | 104.446232 | 26.181985 | 75.9191% | PASS |
| 4242 | 226.563419 | 104.974265 | 26.154871 | 73.7132% | PASS |
| 8675309 | 227.247702 | 104.508272 | 26.064338 | 75.3676% | PASS |
| 314159 | 226.573989 | 104.941636 | 26.234375 | 72.7941% | PASS |

Each seed completes 1,088 games per engine with zero errors and zero rich final
ties. All 8,704 rich team-game ledgers satisfy the corrected player/team,
reception/carry/TD, gross/net and plays identities. Fresh numeric metrics,
efficiencies, player/position/team distributions and drive summaries exactly
match historical `pr-1809-statistics.json/C_integrityPlusCalibration`. Only
wall-clock measurements and explanatory red-zone limitation wording differ.
All nine gate checks pass on all seeds; thresholds and the snap clock were not
changed. Existing role-usage and red-zone limitations remain disclosed in #1805.


Fresh verification on the rebased implementation (Node 22.23.3):

| Check | Result |
| --- | --- |
| Full unit suite, `npm run test:unit -- --maxWorkers=2` | 6,446 passed; 1 existing controlled-audit skip; 524 files passed, 1 skipped |
| Focused attribution, ledger, final-review, calibration and rendered rating regressions, 5 files | 34 passed |
| Existing dynasty soak, `npm run test:soak -- --maxWorkers=1` | 103 passed / 8 files |
| Real-worker durability, `npm run durability:test -- --maxWorkers=1` | 98 passed / 9 files: full 272-game rich regular season, postseason/rollover, 64 legacy games, canonical season ratings, eligible-QB signing, save/reload, duplicate commits and mutation/storage fault injection |
| Built-app browser: Game Book clickthrough/reload, desktop/mobile first-week and schedule/bye | 6 passed |
| Production build; TypeScript 5.9.3 `tsc -p tsconfig.sim.json`; Netlify artifact rules | Passed |
| `git diff --check` | Passed |

The controlled-audit skip predates this integration; the mandatory calibration
file ran in the full unit suite and passed. No assertion, timeout, threshold or
snapshot was changed during integration. TypeScript and Node tooling are outside
the repository; dependencies and the lockfile are unchanged.

Latest-head GitHub Actions, including downstream durability/deploy-parity/browser
jobs, and CodeQL must pass after pushing the existing PR branch. Their run links
and final status belong in the PR integration readout; historical Actions links
above are not evidence for the rebased head. No automatic merge is enabled or
performed. The optional five-season workflow is a separate manual check.
