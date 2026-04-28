# Weekly Loop Audit Notes (2026-04-28)

This document captures code-traced findings for weekly decision impact and postgame attribution.

- `UPDATE_STRATEGY` persists scheme IDs, plan IDs, risk ID, and `gamePlan` to `team.strategies`.
- `buildWeekMatchupsFromLeague` computes prep multipliers from heuristics and `gamePlan`, but does not use UI weekly prep completion tracking (`hasTracking: false`).
- `weeklyPrep` completion is stored in browser `localStorage`, not worker state.
- New AttributesV2 sim path aggregates top players by OVR and position priority, not depth chart order.
- `weeklyTrainingBoost` is applied in legacy simulator and cleared after advancing week.
- `conductDrill` and drill injuries use `Math.random()` in worker path.
