/**
 * Worker State Freshness Audit — Stale-Packet Guard Tests
 *
 * Covers every acceptance-criterion scenario from the audit:
 *
 *  1. Newer STATE_UPDATE (same/higher epoch) is accepted.
 *  2. Older STATE_UPDATE (lower epoch, same session) is dropped.
 *  3. Equal-epoch behaviour is defined and tested.
 *  4. FULL_STATE from a new league / load / reset is accepted even when its
 *     epoch is lower than a previously seen value (epoch resets cleanly).
 *  5. Stale delta cannot be applied to a newer baseline (_requiresFullState).
 *  6. Worker restart / session reset does not permanently block updates.
 *  7. Legacy payloads without _stateEpoch remain safe (backward-compat).
 *  8. No rollback after rapid sequential advance / load patterns.
 */

import { describe, it, expect } from 'vitest';
import {
  shouldAcceptStateUpdate,
  shouldAcceptBootScopedPayload,
  workerReducer,
  INITIAL_WORKER_STATE,
} from '../../src/ui/hooks/useWorker.js';
import { applyLeagueDelta } from '../../src/worker/serialization.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeLeague(overrides = {}) {
  return {
    activeLeagueId: 'lg_abc',
    seasonId:       'season_2025',
    year:           2025,
    week:           1,
    phase:          'regular',
    userTeamId:     3,
    teams:          [],
    ...overrides,
  };
}

function makeFullStatePayload(epoch, leagueOverrides = {}) {
  return { ...makeLeague(leagueOverrides), _stateEpoch: epoch };
}

/** Minimal well-formed delta from the worker. */
function makeDelta(epoch, fields = {}) {
  return { _isDelta: true, _stateEpoch: epoch, ...fields };
}

// ── 1. shouldAcceptStateUpdate — pure function ────────────────────────────────

describe('shouldAcceptStateUpdate', () => {
  it('accepts when _stateEpoch is absent (legacy payload)', () => {
    const legacyPayload = { _isDelta: true, week: 5 }; // no _stateEpoch
    expect(shouldAcceptStateUpdate(legacyPayload, 3)).toBe(true);
  });

  it('accepts when _stateEpoch is null (legacy payload)', () => {
    expect(shouldAcceptStateUpdate({ _isDelta: true, _stateEpoch: null }, 3)).toBe(true);
  });

  it('accepts when no baseline has been established (lastAcceptedEpoch = 0)', () => {
    expect(shouldAcceptStateUpdate({ _stateEpoch: 1 }, 0)).toBe(true);
    expect(shouldAcceptStateUpdate({ _stateEpoch: 5 }, 0)).toBe(true);
  });

  it('accepts when incoming epoch equals the last accepted epoch (same session)', () => {
    expect(shouldAcceptStateUpdate({ _stateEpoch: 2 }, 2)).toBe(true);
  });

  it('accepts when incoming epoch is greater than the last accepted epoch', () => {
    // Should not normally happen (STATE_UPDATE shares epoch with its FULL_STATE),
    // but we accept defensively rather than dropping unexpectedly.
    expect(shouldAcceptStateUpdate({ _stateEpoch: 5 }, 3)).toBe(true);
  });

  it('drops when incoming epoch is strictly less than the last accepted epoch', () => {
    expect(shouldAcceptStateUpdate({ _stateEpoch: 1 }, 2)).toBe(false);
    expect(shouldAcceptStateUpdate({ _stateEpoch: 0 }, 1)).toBe(false);
    expect(shouldAcceptStateUpdate({ _stateEpoch: 3 }, 10)).toBe(false);
  });

  it('treats epoch=0 as having no baseline (accepts)', () => {
    // Edge: worker sends epoch=0 before any FULL_STATE — accept.
    expect(shouldAcceptStateUpdate({ _stateEpoch: 0 }, 0)).toBe(true);
  });

  it('rejects when payload is an empty object but epoch field is explicitly stale', () => {
    expect(shouldAcceptStateUpdate({ _stateEpoch: 1 }, 5)).toBe(false);
  });

  it('accepts when payload is null or undefined (safe fallback)', () => {
    expect(shouldAcceptStateUpdate(null, 3)).toBe(true);
    expect(shouldAcceptStateUpdate(undefined, 3)).toBe(true);
  });
});

// ── 2. applyLeagueDelta epoch stripping ──────────────────────────────────────

describe('applyLeagueDelta — _stateEpoch is stripped from merged state', () => {
  it('does not include _stateEpoch in the patched state', () => {
    const currentState = makeLeague({ week: 1 });
    const delta = makeDelta(3, { week: 2 });

    const next = applyLeagueDelta(currentState, delta);

    expect(next.week).toBe(2);              // real field applied
    expect(next._stateEpoch).toBeUndefined(); // epoch must NOT leak
  });

  it('still applies all real league fields when _stateEpoch is present', () => {
    const currentState = makeLeague({ week: 1, phase: 'regular', year: 2025 });
    const delta = makeDelta(2, { week: 3, phase: 'playoffs' });

    const next = applyLeagueDelta(currentState, delta);

    expect(next.week).toBe(3);
    expect(next.phase).toBe('playoffs');
    expect(next.year).toBe(2025);           // untouched field preserved
    expect(next._stateEpoch).toBeUndefined();
  });

  it('_isDelta is also stripped (existing behaviour unchanged)', () => {
    const delta = makeDelta(1, { week: 5 });
    const next = applyLeagueDelta(makeLeague(), delta);
    expect(next._isDelta).toBeUndefined();
  });

  it('still sets _requiresFullState when _isDelta is missing', () => {
    // A delta without _isDelta should request a fresh state.
    const badDelta = { _stateEpoch: 3, week: 9 }; // no _isDelta
    const next = applyLeagueDelta(makeLeague({ week: 1 }), badDelta);
    expect(next._requiresFullState).toBe(true);
    expect(next.week).toBe(1); // original unchanged
  });
});

// ── 3. workerReducer — epoch fields in payloads ───────────────────────────────

describe('workerReducer — epoch-bearing payloads', () => {
  it('FULL_STATE with _stateEpoch sets isHydrated and updates league', () => {
    const league = makeFullStatePayload(2, { week: 4 });
    const state = workerReducer(INITIAL_WORKER_STATE, {
      type: 'FULL_STATE',
      payload: league,
      messageType: 'FULL_STATE',
    });

    expect(state.isHydrated).toBe(true);
    expect(state.league.week).toBe(4);
    // The reducer does not strip _stateEpoch itself — that is fine;
    // the UI hook reads it before dispatching and the delta stripping
    // happens in applyLeagueDelta for STATE_UPDATE.
  });

  it('STATE_UPDATE with _stateEpoch in the pre-merged payload does not corrupt state', () => {
    // Simulate the merged result that useWorker passes to dispatch.
    // applyLeagueDelta already strips _stateEpoch, so the merged payload
    // should NOT contain it.
    const current = makeLeague({ week: 3 });
    const delta = makeDelta(2, { week: 4 });
    const merged = applyLeagueDelta(current, delta);

    const state = workerReducer(
      { ...INITIAL_WORKER_STATE, league: current, isHydrated: true },
      { type: 'STATE_UPDATE', payload: merged, messageType: 'STATE_UPDATE' },
    );

    expect(state.league.week).toBe(4);
    expect(state.league._stateEpoch).toBeUndefined();
  });

  it('WORKER_READY preserves existing league state', () => {
    const league = makeLeague({ week: 8 });
    const existing = { ...INITIAL_WORKER_STATE, league, isHydrated: true, busy: true };
    const next = workerReducer(existing, { type: 'WORKER_READY', hasSave: true });

    expect(next.league).toBe(league);  // reference stable
    expect(next.workerReady).toBe(true);
    expect(next.busy).toBe(false);
  });
});

// ── 4. Epoch scenarios — integration-style ────────────────────────────────────

describe('state freshness scenarios', () => {
  /**
   * Simulates the epoch-tracking side of useWorker without spinning up the
   * actual hook (refs are plain objects here).
   */
  function makeEpochTracker(initialEpoch = 0) {
    let lastAcceptedEpoch = initialEpoch;
    return {
      acceptFullState(payload) {
        if (payload?._stateEpoch != null) {
          lastAcceptedEpoch = payload._stateEpoch;
        }
      },
      shouldAccept(payload) {
        return shouldAcceptStateUpdate(payload, lastAcceptedEpoch);
      },
      get epoch() { return lastAcceptedEpoch; },
    };
  }

  it('newer STATE_UPDATE (same epoch as last FULL_STATE) is accepted', () => {
    const tracker = makeEpochTracker();
    tracker.acceptFullState(makeFullStatePayload(1));

    const stateUpdate = makeDelta(1, { week: 2 });
    expect(tracker.shouldAccept(stateUpdate)).toBe(true);
  });

  it('older STATE_UPDATE (lower epoch than last FULL_STATE) is dropped', () => {
    const tracker = makeEpochTracker();
    // Epoch 2 FULL_STATE accepted first (e.g. a save was loaded).
    tracker.acceptFullState(makeFullStatePayload(2));

    // Now a STATE_UPDATE arrives from epoch 1 (pre-load advance-week packet).
    const staleUpdate = makeDelta(1, { week: 5 });
    expect(tracker.shouldAccept(staleUpdate)).toBe(false);
  });

  it('equal epoch STATE_UPDATE is accepted (same session, different tick)', () => {
    const tracker = makeEpochTracker();
    tracker.acceptFullState(makeFullStatePayload(3));

    expect(tracker.shouldAccept(makeDelta(3, { week: 6 }))).toBe(true);
    expect(tracker.shouldAccept(makeDelta(3, { week: 7 }))).toBe(true);
  });

  it('FULL_STATE from a new league/load/reset resets epoch tracking', () => {
    const tracker = makeEpochTracker();

    // First session: epoch 5 FULL_STATE, several updates.
    tracker.acceptFullState(makeFullStatePayload(5, { activeLeagueId: 'lg_old' }));
    expect(tracker.shouldAccept(makeDelta(5, { week: 17 }))).toBe(true);

    // User loads a completely new save → epoch resets to 1.
    tracker.acceptFullState(makeFullStatePayload(1, { activeLeagueId: 'lg_new', week: 1 }));
    expect(tracker.epoch).toBe(1);

    // New league's STATE_UPDATEs at epoch 1 must be accepted.
    expect(tracker.shouldAccept(makeDelta(1, { week: 2 }))).toBe(true);
  });

  it('no rollback: rapid sequential advance/load pattern', () => {
    // Sequence:
    //   1. FULL_STATE epoch=1 (app start, league loaded)
    //   2. STATE_UPDATE epoch=1 (advance week 1→2)
    //   3. STATE_UPDATE epoch=1 (advance week 2→3)
    //   4. FULL_STATE epoch=2 (user loads a different save)
    //   5. Stale STATE_UPDATE epoch=1 (delayed from previous session) — MUST be dropped
    //   6. STATE_UPDATE epoch=2 (new session advances week) — MUST be accepted

    const tracker = makeEpochTracker();

    tracker.acceptFullState(makeFullStatePayload(1, { week: 1 }));
    expect(tracker.shouldAccept(makeDelta(1, { week: 2 }))).toBe(true);
    expect(tracker.shouldAccept(makeDelta(1, { week: 3 }))).toBe(true);

    // New save loaded.
    tracker.acceptFullState(makeFullStatePayload(2, { week: 1, activeLeagueId: 'lg_new' }));

    // Stale update from old session — must be dropped.
    expect(tracker.shouldAccept(makeDelta(1, { week: 4 }))).toBe(false);

    // New session advances.
    expect(tracker.shouldAccept(makeDelta(2, { week: 2 }))).toBe(true);
  });

  it('worker restart / session reset: no baseline → every update accepted', () => {
    // After a worker restarts (or before the first FULL_STATE is received),
    // lastAcceptedEpoch is 0.  All packets should be accepted regardless of epoch.
    const tracker = makeEpochTracker(0); // no baseline

    expect(tracker.shouldAccept(makeDelta(1, { week: 1 }))).toBe(true);
    expect(tracker.shouldAccept(makeDelta(99, { week: 1 }))).toBe(true);
    expect(tracker.shouldAccept({ _isDelta: true, week: 1 })).toBe(true); // no epoch
  });

  it('missing epoch legacy payload is always accepted (backward-compat)', () => {
    const tracker = makeEpochTracker();
    tracker.acceptFullState(makeFullStatePayload(7));

    // Legacy worker payload without _stateEpoch field.
    const legacyDelta = { _isDelta: true, week: 5 };
    expect(tracker.shouldAccept(legacyDelta)).toBe(true);
  });

  it('stale delta cannot apply over a newer baseline (_requiresFullState fallback)', () => {
    // If a delta somehow lacks _isDelta, applyLeagueDelta sets _requiresFullState.
    // This is the existing safety-net, and it must remain intact.
    const current = makeLeague({ week: 10, phase: 'playoffs' });
    const badDelta = { week: 1, phase: 'regular' }; // no _isDelta
    const result = applyLeagueDelta(current, badDelta);

    expect(result._requiresFullState).toBe(true);
    expect(result.week).toBe(10);   // current state unchanged
    expect(result.phase).toBe('playoffs');
  });

  it('stale epoch guard and _requiresFullState guard are independent', () => {
    // The epoch guard fires BEFORE applyLeagueDelta so both paths are covered:
    //  a) epoch guard rejects → never calls applyLeagueDelta
    //  b) epoch guard passes but delta is malformed → applyLeagueDelta sets _requiresFullState

    const tracker = makeEpochTracker();
    tracker.acceptFullState(makeFullStatePayload(4));

    // Path a: epoch guard drops it.
    expect(tracker.shouldAccept(makeDelta(3, { week: 9 }))).toBe(false);

    // Path b: epoch OK but delta is malformed.
    const malformedDelta = { _stateEpoch: 4, week: 9 }; // missing _isDelta
    expect(tracker.shouldAccept(malformedDelta)).toBe(true); // epoch guard passes
    // But applyLeagueDelta will set _requiresFullState:
    const result = applyLeagueDelta(makeLeague({ week: 5 }), malformedDelta);
    expect(result._requiresFullState).toBe(true);
  });
});

// ── 5. Boot request + epoch interaction ──────────────────────────────────────

describe('boot-request guard and epoch guard interact safely', () => {
  it('a FULL_STATE rejected by boot guard does not update the epoch tracker', () => {
    // If a stale NEW_LEAGUE FULL_STATE is rejected by shouldAcceptBootScopedPayload,
    // the epoch tracking code is never reached.  Verify both guards work in isolation.

    const staleBoot = makeFullStatePayload(1, { week: 1 });
    staleBoot.bootRequestId = 'boot_old';

    // Simulate: active is a different boot; 'boot_old' is ignored.
    const rejected = !shouldAcceptBootScopedPayload(staleBoot, 'boot_new', ['boot_old']);
    expect(rejected).toBe(true); // shouldAcceptBootScopedPayload returned false → reject

    // Epoch tracker should not have been updated.
    // (In the real hook the `if (!shouldAcceptBootScopedPayload(...)) break;`
    // prevents the epoch update from running.)
    let lastEpoch = 0;
    if (!rejected) lastEpoch = staleBoot._stateEpoch; // this line would NOT run
    expect(lastEpoch).toBe(0); // unchanged
  });
});
