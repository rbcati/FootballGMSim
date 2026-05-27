# Worker State Freshness Audit V1 (May 27, 2026)

## Scope
- `src/ui/hooks/useWorker.js`
- `src/worker/worker.js`
- `src/worker/serialization.js`
- `src/worker/protocol.js`
- `src/db/cache.js`
- `src/state/saveSchema.js`
- `src/ui/components/LeagueDashboard.jsx`
- freshness tests under `tests/unit/workerStateFreshness.test.js`

## Findings

### 1) Message types that can mutate primary league UI state
- `FULL_STATE` (authoritative baseline snapshot).
- `STATE_UPDATE` (delta patch stream).
- `WEEK_COMPLETE` (week/result patch for post-sim transitions).
- `OFFSEASON_PHASE` / `SEASON_START` (phase and season transition patches).
- `ERROR` and recovery path `REQUEST_FULL_STATE` do not directly mutate league fields, but force re-hydration paths.

`DRAFT_STATE` and other lazy data response packets are request/response data and do not commit into `state.league` in `workerReducer`.

### 2) Existing worker freshness metadata
- Worker currently emits `_stateEpoch` on every `FULL_STATE` and `STATE_UPDATE` packet via `post()` in `worker.js`.
- `_stateEpoch` is incremented on every emitted `FULL_STATE` and copied into subsequent `STATE_UPDATE`s.
- Boot/new-league flows include optional `bootRequestId` used by the UI boot scope guard.
- No additional request-level league revision field is required for current guard behavior.

### 3) Existing UI stale-packet guards
- `shouldAcceptBootScopedPayload()` drops stale/new-league boot responses when `bootRequestId` is no longer active.
- `shouldAcceptStateUpdate()` drops only `STATE_UPDATE` packets with `_stateEpoch < lastAcceptedEpoch`.
- `hasFullStateBaselineRef` prevents applying deltas before first baseline and requests `REQUEST_FULL_STATE`.
- `applyLeagueDelta()` fallback marks malformed deltas `_requiresFullState`, triggering forced rehydrate.

### 4) Rollback risk assessment
- A late `STATE_UPDATE` from a pre-load/pre-reset epoch can roll back UI if unguarded.
- Current production guard drops that packet and requests a fresh baseline.
- `FULL_STATE` is not blocked by epoch comparisons; accepted snapshots reset accepted epoch.
- Therefore rollback risk existed conceptually but is already mitigated by current code.

### 5) Test evidence
- `tests/unit/workerStateFreshness.test.js` covers:
  - newer/equal update accepted,
  - stale lower-epoch update dropped,
  - full-state epoch reset on load/new/reset,
  - worker-restart/no-baseline acceptance behavior,
  - legacy no-epoch compatibility,
  - malformed delta fallback safety,
  - rapid advance/load no-rollback sequence,
  - boot guard and epoch guard interaction.

## Conclusion
No additional protocol/schema change is required in V1. Existing `_stateEpoch` + boot scoping + `_requiresFullState` fallback already provides the minimal stale-packet guard and recovery behavior requested.
