# `game-simulator.js` Responsibility Audit (Step 1)

This document maps every distinct responsibility owned by the original
`src/core/game-simulator.js` (4047 lines, ~184 KB) prior to the decomposition,
grouped into the seven target domains. Line ranges refer to the **pre-refactor**
file.

The decomposition relocates these responsibilities into focused modules under
`src/core/simulation/`. `index.js` remains the orchestrator: it owns the
RNG-sensitive per-game flow (`simGameStats`, `simulateBatch`, `commitGameResult`)
and calls the domain modules in sequence. No domain module imports a sibling
module — shared pure helpers (passer rating, RNG) are kept private per module so
the seeded RNG call order is preserved byte-for-byte.

## Play execution → `playExecution.js`
Per-play outcome resolution inside the live play-by-play drive loop.
- `1899-2011` player-selection + name-format helpers (`_pick`, `_pickRec`,
  `_pickRusher`, `_pickDB`, `_pickTackler`, `_pickCoverage`, `_n`)
- `2184-2245` scoring-drive play resolution (pass / run / incomplete / sack /
  penalty / screen branch selection)
- `2378-2427` non-scoring-drive play resolution
- `2428-2476` drive-ending play resolution (INT / fumble / punt / 4th-down)

## Drive logic → `driveEngine.js`
Down-and-distance tracking, field position, deterministic drive-level scoring.
- `169-256` `buildDriveBasedSummary` (seeded, deterministic score generator —
  the authoritative `homeScore` / `awayScore` source)
- `2117-2121, 2241-2244, 2423-2426` inline down/distance/field-position updates
- `2023-2031` drive count + possession initialization

## Score tracking → `scoreKeeper.js`
TD / FG / PAT / safety / two-point handling + league standings & rivalries.
- `2284-2305` touchdown + PAT + field-goal scoring resolution
- `2334-2366` defensive-TD, turnover, and safety scoring
- `2490-2501` return-TD scoring
- `403-453` `updateTeamStandings`, `392-401` `ensureTeamsMap`
- `462-574` `applyResult` (win/loss/tie + points + head-to-head)
- `584-651` `updateRivalries`

## Stat accumulation → `statAccumulator.js`
Per-player stat generation and season/career accumulation.
- `90-107` passer-rating helpers
- `263-352` roster grouping (`groupPlayersByPosition`, `getCachedGroups`,
  `getActiveGroups`)
- `358-372` `initializePlayerStats`
- `925-950` `rollPerformanceVariance`
- `982-1466` position stat generators (QB / RB / WR / DB / DL / OL / K / P +
  `distributePassingTargets`)
- `3109-3126` `accumulateStats` + `DERIVED_STAT_KEYS`

## Quarter / clock management → `clockManager.js`
Game clock, quarter transitions, momentum, late-game decisions, overtime end.
- `109-117` `getSimulationSpeedDelay`
- `119-132` `calculateMomentumSwing`
- `134-167` `decideLateGameSequence`
- `2109-2115` quarter + clock derivation per drive
- `2539-2645` overtime loop end-of-game / end-of-half decision logic

## Injury resolution → `injuryResolver.js`
In-game injury rolls + substitution share handling.
- `2649-2716` `processPositionGroup` injury roll + backup-share logic
- `2760-2791` receiver in-game injury rolls
- `2954-2956, 3017-3039` game-injury collection + depth-impact diagnostics

## Game summary assembly → `gameSummaryBuilder.js`
Box-score shaping + final-result object assembly + post-game narrative.
- `661-911` `generatePostGameCallbacks`
- `3442-3479` `transformStatsForBoxScore`
- `3481-3560` `sumPlayerStat`, `deriveCanonicalTeamSideStats`,
  `buildCanonicalTeamStats`
- `3562-3647` `normalizeGameStatsForBoxScore`

## Orchestration (stays in `index.js`)
- `29-56` `SimulationError`, `assertGameProducedScoring`
- `58-69` `buildTeamRatingsSnapshot`
- `1481-3100` `simGameStats` / `simulateMatchup` (per-game RNG flow)
- `3136-3437` `commitGameResult`
- `3662-3995` `simulateBatch`
- `4002-4033` `validateLeagueState`
