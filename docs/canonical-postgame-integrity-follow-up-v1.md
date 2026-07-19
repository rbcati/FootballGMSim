# Canonical Postgame Integrity Follow-Up V1

## Executive summary
This follow-up completes the narrow correctness cleanup after #1698. It keeps the canonical player box score as the postgame authority while fixing interception semantics, reconciled QB dependent fields, and watched-game team-stat transport.

## #1698 context
#1698 moved postgame leaders, grades, and archived player statistics off narration-derived logs and onto canonical player box-score rows. This document covers only defects left at that boundary.

## Three confirmed defects
1. A QB row's `interceptions` value means interceptions thrown, but a defensive row's `interceptions` means takeaways.
2. Reconciled QB passing yards/completions could leave dependent `dropbacks`, `longestPass`, and rates stale.
3. The worker reducer stored `userGameTeamStats`, but App did not include it in `buildWatchPostGameResult`, so PostGameScreen archived player stats without the canonical team package.

## Passer-versus-defender interception semantics
Postgame summary code now treats passing rows (`passAtt > 0` or `pos === QB`) as offensive turnover rows. Defensive interceptions are zero for passing rows and nonnegative only for non-passing rows.

## Defensive leader policy
Defensive leaders score only defensive production: sacks made, defensive interceptions, tackles, tackles for loss, passes defended, forced fumbles, fumble recoveries, and defensive touchdowns. Interceptions thrown never qualify a passer as the defensive leader.

## Player of Game turnover policy
Player of Game impact now applies a modest deterministic penalty for interceptions thrown. The policy is intentionally narrow: legitimate passing, rushing, receiving, defensive, and kicking production remain positive, but passer interceptions cannot add positive impact.

## QB dependent-field authority
After final passing reconciliation, each QB line is clamped to nonnegative attempts, completions, yards, touchdowns, interceptions, and sacks taken. Completion percentage and passer rating are recomputed from the final line.

## Longest-pass policy
Receiver-to-QB attribution is not available at this seam. The honest repair is deterministic clamping: no completions or no passing yards means `longestPass = 0`; otherwise `longestPass = min(existingLongestPass, passYd)`. No RNG draw is consumed and receiving yards are not redistributed.

## Dropback policy
Dropbacks are authoritative as `passAtt + sacksTaken`, using the existing generated QB sack-taken field on the QB row. Defensive sacks made remain separate.

## Team-stat transport map
The fixed path is: worker `PLAY_LOGS.userGameTeamStats` → App state destructuring → `buildWatchPostGameResult.teamStats` → `PostGameScreen teamStats` prop → `onArchiveReady.teamStats` → saved archive → Game Book view model.

## First dropped teamStats boundary
The first confirmed drop was App: `useWorker` already stored `userGameTeamStats`, but `buildWatchPostGameResult` accepted and returned only `playerStats`.

## Archive behavior
When canonical team stats are supplied, PostGameScreen includes them unchanged in the archive payload. Archive normalization can still apply established legacy normalization afterward.

## Legacy fallback behavior
Games without canonical team stats continue through the existing fallback path. Safely derivable totals may be computed from player rows; rich drive-only fields such as first downs, possession, red-zone, and third-down detail are not fabricated by this PR.

## Files changed
- `src/core/gameSummary.js`
- `src/core/simulation/index.js`
- `src/ui/App.jsx`
- `src/ui/components/PostGameScreen.jsx`
- Focused unit tests for those seams

## Tests added
Regression tests cover defensive interception semantics, Player of Game turnover penalty, App team-stat carry, useWorker team-stat transport/clearing, and PostGameScreen archive preservation.

## Determinism confirmation
The QB reconciliation repair uses no random numbers, does not redistribute receiving yards, and does not alter injury probability or workload generation.

## Unit-test result
Run result is recorded in the PR and final report.

## Build result
Run result is recorded in the PR and final report.

## Playwright result
Run result is recorded in the PR and final report.

## Explicit untouched systems
Final-score generation, score distributions, play-by-play narration, scoring summary authority, quarter-score authority, schedule generation, standings, playoffs, free agency, draft, contracts, progression, salary cap, and Game Performance Grades are untouched.

## Recommended next PR
#1700 — E2E Assertion Integrity V1. This should clean up brittle E2E assertion boundaries before any future canonical play-by-play work unless evidence shows that cleanup already landed.
