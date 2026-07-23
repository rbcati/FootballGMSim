# Long-Save Durability Authority V2

Base SHA: `a4f47f47e46e38db834024248484852aeac63ddf`.

## Why V1 determinism was insufficient

The previous durability report could set `deterministic=true` when two runs had the same lifecycle completion metadata, first-failure shape, and save/reload booleans. It did not compare durable roster, contract, cap, player, pick, schedule, or history state at corresponding checkpoints. V2 adds a canonical durable-state snapshot and compares checkpoint state directly.

## Snapshot fields and normalization

Snapshot schema `2.0.0` includes league phase/year/week/season id/user team/live salary cap; authoritative DB-backed teams with records, roster membership, dead cap, deferred dead cap, and stable cap fields; active players with canonical ids, team ids, age, ratings, injury availability, canonical normalized contract fields, and active cap hit; retired-player ledger rows; draft picks; schedule identity/results; completed history champion/runner-up references; and pool counts/source.

Normalization now resolves object-shaped legacy champion and runner-up team references with the canonical team-reference resolver, includes retired ledger evidence from view and DB meta, preserves duplicate entity occurrences during structured comparison, and reports diffs with canonical entity ids rather than array positions.

Excluded fields remain timestamps, narrative/UI-only text, raw serialization order not guaranteed by production, and volatile completion metadata.

## Stable cap equation

At stable cap checkpoints, each team is legal when:

`sum(active roster cap hits from canonical contracts) + current dead cap + counted pending commitments <= live salary cap`

The live cap is resolved from `view.economy.currentSalaryCap` or `db.meta.economy.currentSalaryCap`. Team dead cap and roster contracts come from authoritative DB team/player records when available. Staff payroll is excluded because production cap legality excludes it. Transitional offseason windows skip cap legality with a documented reason rather than pretending those reconciliation windows are final legal gates.

## Continuity rules

V2 continuity now checks that completed history grows exactly once at completed rollover checkpoints, schedule game ids are not reused across seasons, active/retired populations do not overlap, full-pool checkpoints do not lose established players without retirement/draft/release/free-agency/removal evidence, and contract years do not increase unless there is transaction evidence or a signing/extension-shaped contract transition.

Roster-only checkpoints explicitly skip player-disappearance proof with a narrow reason because the full free-agent/retired pool is not present in those view-only snapshots.

## Isolation model

CLI determinism legs and `--seeds` runs execute in clean child processes. This avoids reusing worker module globals, caches, fake IndexedDB state, and seeded RNG state between legs/seeds. In-process harness helpers remain available for unit tests and bounded stubs.

## Production root causes repaired in this iteration

- Retired players were evicted from the hot cache after offseason retirement without durable `meta.retiredPlayers` evidence, so continuity could not distinguish retirement from disappearance after old players left the DB player pool. The repair persists a compact retired-player ledger before eviction.
- AI stable rollover could enter preseason with an AI roster below the legal minimum after retirements/cuts/free agency. The repair adds a deterministic minimum-roster reconciliation pass that signs from the existing free-agent pool, respects interactive-user isolation, and recalculates all team caps before the preseason save surface.
- Save/reload could observe stale pre-save cap aggregates because not every final rollover roster mutation recalculated team cap fields before flushing. The repair recalculates every team cap after final rollover roster reconciliation.
- Several ordering boundaries that affect offers/releases/RNG draw order lacked canonical tie-breaks: AI FA target inputs, equal-score FA offer resolution, offseason roster-cut candidate ties, offseason extension/progression team/player iteration, and staff-carousel team/market ties. These were narrowed to canonical id/name tie-breaks without changing balance formulas.

## Current evidence

Commands run on this branch after the schedule, continuity, minimum-roster, and additional ordering repairs:

- `node --check src/core/ai-logic.js src/core/freeAgency/freeAgencyMarketAnalysis.js src/core/retention/reSigning.js tests/durability/invariants/continuity.js tests/durability/invariants/durableSnapshot.js` — passed.
- `npx vitest run tests/unit/aiCapManagementExecution.test.js tests/unit/aiFaEngine.unit.test.js tests/unit/aiRetentionLogic.test.js --config vitest.config.ts` — passed, 3 files / 67 tests.
- `npm run durability:test` — passed, 5 files / 81 tests.
- `npm run durability:smoke` — passed one full season with save/reload OK.
- `npm run check:sim-types` — passed.
- `npm run build` — passed with the expected Vite chunk-size warning.
- `npm run test:unit` — passed, 462 files / 5659 tests.
- `npm run durability:5 -- --seed=1684 --determinism --collect-all --write-report --summary` — completed both isolated five-season legs with zero invariant failures and save/reload OK, but exited nonzero because state determinism remains false.

Latest five-season determinism result:

- Seed: 1684
- Completed: 5/5 seasons in each isolated child leg
- First leg runtime/peak RSS: 398.0 seconds / 2174 MB
- Second leg runtime/peak RSS: 401.9 seconds / 2221 MB
- Invariants: 750 pass / 0 fail / 132 skip in both legs
- Save/reload: OK at season 1 and season 5 in both legs
- Lifecycle deterministic: true
- State deterministic: false
- First remaining durable divergence: checkpoint `2:afterSeasonRollover`, domain `players`, entity `1005`, field `activeCapHit`

## Remaining limitations / not yet proven

This branch must still not claim five-season state determinism, ten-season safety, or multi-seed durable authority. The season-5 roster-size failure is gone, schedule season identity is stronger, continuity no longer accepts substring transaction evidence, and minimum-roster reconciliation now produces valid cap-checked contracts or rolls back. However, the defining state-determinism gate remains red because generated-player/player-1005 contract state still diverges by season 2. Because that principal determinism gate is still red, the three-seed five-season matrix, ten-season seed-1684 proof, and optional twenty-season run were not run as proof artifacts from this head.
