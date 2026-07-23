# Long-Save Durability Authority V2

Base SHA: `a4f47f47e46e38db834024248484852aeac63ddf`.

## Why V1 determinism was insufficient

The previous durability report could set `deterministic=true` when two runs had the same lifecycle completion metadata, the same first-failure shape, and the same save/reload booleans. It did not compare durable roster, contract, cap, player, pick, schedule, or history state at corresponding checkpoints. V2 adds a canonical durable-state snapshot and compares checkpoint state directly.

## Snapshot fields

Snapshot schema `2.0.0` includes:

- League: season, year, week, phase, season id, user team id, live salary cap.
- Teams: canonical team id, record, roster membership, current/deferred dead cap, stable cap fields.
- Active players: canonical player id/team id, age, OVR/potential, injury availability, contract years/base salary/signing bonus/cap hit.
- Retired players: canonical player id and retirement year where available.
- Draft picks: pick id, season, round, original/current owner.
- Schedule: canonical game id, season/week, home/away, played/final status, final scores only for completed games.
- League history: season/year, champion, runner up.
- Pool counts: active, rostered, free agent, retired.

Exclusions remain timestamps, narrative/UI-only text, raw serialization order not guaranteed by production, and volatile completion metadata.

## Stable cap equation

At roster-stable phases, each team is legal when:

`sum(active roster cap hits) + current dead cap + counted pending commitments <= live salary cap`

The live cap is resolved from `meta.economy.currentSalaryCap`/production-visible live cap sources before falling back to team cap totals. Staff payroll is excluded because production cap legality excludes it. Transitional offseason phases skip with a documented reason.

## Current evidence

Commands run on this branch:

- `npm run durability:test` — passed, 5 files / 67 tests.
- `npm run durability:smoke` — passed one full season, save/reload OK, peak RSS 476 MB.
- `npm run durability:5 -- --seed=1684 --determinism --collect-all --write-report --summary` — completed both five-season runs but did **not** pass: V2 correctly reported state/lifecycle non-determinism and a first invariant failure.

Latest five-season report:

- Seed: 1684
- Completed: 5/5 seasons in each determinism leg
- Run A report runtime: 394.4 seconds, peak RSS 2278 MB
- First durable divergence: checkpoint `2:afterSeasonRollover`, domain `players`, entity `1590`, field `signingBonus`
- First invariant failure: `roster.size-within-legal-range` at season 5 `afterSeasonRollover`, team 7 roster size 51
- Save/reload: OK at seasons 1 and 5

## Remaining unproven areas

Because the strengthened harness uncovered a real state-level divergence and a roster legality failure, this branch must not claim ten-season-safe or state deterministic. The next repair should trace the season-2 offseason/draft/free-agency contract divergence to the first write that changes player 1590's signing bonus between clean runs, then separately assess whether the season-5 team-7 roster size is in the same causal cluster or a later roster-management defect.
