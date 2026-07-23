# Long-Save Durability Authority V2

Base SHA: `a4f47f47e46e38db834024248484852aeac63ddf`.

## Why V1 determinism was insufficient

The previous durability report could set `deterministic=true` when two runs had the same lifecycle completion metadata, the same first-failure shape, and the same save/reload booleans. It did not compare durable roster, contract, cap, player, pick, schedule, or history state at corresponding checkpoints. V2 adds a canonical durable-state snapshot and compares checkpoint state directly.

## Snapshot fields

Snapshot schema `2.0.0` includes:

- League: season, year, week, phase, season id, user team id, live salary cap.
- Teams: canonical team id, record, roster membership, current/deferred dead cap, stable cap fields from durable team data.
- Active players: canonical player id/team id, age, OVR/potential, injury availability, canonical contract years remaining/total, base annual, signing bonus, and calculated active cap hit.
- Retired players: canonical player id and retirement year where available.
- Draft picks: pick id, season, round, original/current owner.
- Schedule: canonical game id, season/week, home/away, played/final status, final scores only for completed games.
- League history: season/year, champion, runner up.
- Pool counts: active, rostered, free agent, retired.

Exclusions remain timestamps, narrative/UI-only text, raw serialization order not guaranteed by production, and volatile completion metadata.

## Stable cap equation

At stable regular/playoff cap checkpoints, each team is legal when:

`sum(active roster cap hits from canonical contracts) + current dead cap + counted pending commitments <= live salary cap`

The live cap is resolved from `view.economy.currentSalaryCap` or `db.meta.economy.currentSalaryCap`. Team dead cap and roster contracts come from authoritative DB team/player records when available. Staff payroll is excluded because production cap legality excludes it. Preseason/offseason transition checkpoints skip cap legality with a documented reason rather than pretending those reconciliation windows are final legal gates.

## Isolation model

CLI determinism legs and `--seeds` runs execute in clean child processes. This avoids reusing worker module globals, caches, fake IndexedDB state, and seeded RNG state between legs/seeds. In-process harness helpers remain available for unit tests and bounded stubs.

## Current evidence

Commands run on this branch:

- `node --check ...` across changed JS harness files — passed.
- `npm run durability:test` — passed, 5 files / 75 tests.
- `npm run durability:smoke` — passed one full season, save/reload OK, peak RSS 470 MB after V2 continuity/cap updates.
- `npm run durability:smoke -- --determinism` — passed; two isolated one-season child runs were state deterministic.
- `npm run durability:smoke -- --seeds=1702` — passed and proved `--seeds=1702` runs seed 1702 through the child-process path.
- `npm run check:sim-types` — passed.
- `npm run build` — passed with the expected Vite chunk-size warning.
- `npm run test:unit` — passed, 462 files / 5651 tests.
- `npm run durability:5 -- --seed=1684 --determinism --collect-all --write-report --summary` — rerun after the first ordering repair still did not pass; first leg had zero invariant failures, second leg surfaced a season-5 roster-size failure, and state determinism remained false.

Latest five-season determinism result:

- Seed: 1684
- Completed: 5/5 seasons in each isolated child leg
- First leg runtime/peak RSS: 396.7 seconds / 2236 MB
- Second leg runtime/peak RSS: 399.8 seconds / 2165 MB
- First incorrect write cluster identified so far: AI offseason/free-agency offer ordering consumed same-OVR free agents and extension ties without canonical ID tie-breaks, causing different players to receive different generated contracts before the later `activeCapHit` diff.
- Narrow repair applied: canonical ID tie-breaks for AI extension priority ties and AI free-agent offer pools/team/player iteration.
- Remaining result: still not green; second leg produced `roster.size-within-legal-range` at season 5 for team 30 (52 players), and the determinism comparator then reported first durable divergence at checkpoint `3:afterSeasonRollover`, domain `players`, entity `it5p5hz6olpp`, field `activeCapHit`.

## Remaining unproven areas

The V2 harness no longer has false-green cap behavior and no longer treats lifecycle-only equality as determinism. The first contract-ordering boundary has been narrowed and repaired, but the required five-season seed-1684 determinism proof is still not green: the latest run exposes a later roster-size failure plus a later generated-player active-cap-hit divergence. Because that state-level divergence remains, this branch must not claim five-season deterministic, ten-season-safe, or multi-seed durable authority yet. The next repair must trace the remaining generated-player contract write/RNG/order boundary and the team-30 roster shortfall before running the full requested matrix and ten-season proof.
