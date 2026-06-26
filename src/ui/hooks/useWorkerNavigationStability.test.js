import { describe, it, expect } from "vitest";
import { INITIAL_WORKER_STATE, workerReducer } from "./useWorker.js";

/**
 * Navigation stability smoke test (Priority 5).
 *
 * "Starting game engine…" renders whenever `workerReady` is false, and the
 * worker is spawned exactly once (useEffect with [] deps). So the engine can
 * only "remount" if `workerReady` flips back to false. Normal navigation
 * between HQ / Roster / Schedule / Standings / Stats only fires read requests
 * (BUSY → STATE_UPDATE → IDLE) and busy toggles — none of which may reset
 * `workerReady` or drop the loaded `league`.
 *
 * These tests pin that invariant at the reducer level (the single source of
 * truth for the boot screen), without standing up the heavy dashboard tree.
 */

const league = {
  activeLeagueId: "save_slot_1",
  seasonId: 2026,
  year: 2026,
  week: 4,
  phase: "regular",
  userTeamId: 7,
  teams: [{ id: 7, abbr: "BOS", name: "Bostons", roster: [{ id: "p1", name: "QB" }] }],
  schedule: { weeks: [{ week: 1, games: [{ home: 7, away: 8, played: true, homeScore: 21, awayScore: 14 }] }] },
};

function readyState() {
  return { ...INITIAL_WORKER_STATE, workerReady: true, hasSave: true, league };
}

// Simulate the dispatch sequence a single tab switch produces: a (silent) read
// request sets BUSY, the worker replies with STATE_UPDATE, then IDLE/CLEAR_BUSY.
function navigateOnce(state, patch = {}) {
  let s = workerReducer(state, { type: "BUSY" });
  s = workerReducer(s, { type: "STATE_UPDATE", payload: { ...league, ...patch }, messageType: "STATE_UPDATE" });
  s = workerReducer(s, { type: "IDLE" });
  return workerReducer(s, { type: "CLEAR_BUSY" });
}

describe("worker navigation stability (no engine remount / no state loss)", () => {
  it("keeps workerReady true across a navigation request cycle", () => {
    const next = navigateOnce(readyState());
    expect(next.workerReady).toBe(true); // → never shows "Starting game engine…"
    expect(next.busy).toBe(false);
  });

  it("preserves league across HQ → Roster → Schedule → Standings → Stats → Roster", () => {
    let state = readyState();
    for (const _tab of ["Roster", "Schedule", "Standings", "Stats", "Roster"]) {
      state = navigateOnce(state);
      expect(state.workerReady).toBe(true);
      expect(state.league).toBeTruthy();
      expect(state.league.userTeamId).toBe(7);
      expect(state.league.teams[0].abbr).toBe("BOS");
      expect(state.league.week).toBe(4);
    }
  });

  it("STATE_UPDATE merges into league instead of replacing it (partial payloads keep prior fields)", () => {
    // A read action that returns only a slice must not wipe unrelated league data.
    const state = readyState();
    const next = workerReducer(state, {
      type: "STATE_UPDATE",
      payload: { week: 5 },
      messageType: "STATE_UPDATE",
    });
    expect(next.week).toBeUndefined; // sanity: week lives under league
    expect(next.league.week).toBe(5);
    expect(next.league.teams[0].abbr).toBe("BOS"); // preserved
    expect(next.league.schedule.weeks[0].games[0].homeScore).toBe(21); // preserved
    expect(next.workerReady).toBe(true);
  });

  it("busy toggles during navigation never touch workerReady or league", () => {
    const state = readyState();
    expect(workerReducer(state, { type: "BUSY" }).workerReady).toBe(true);
    expect(workerReducer(state, { type: "BUSY" }).league).toBe(league);
    expect(workerReducer(state, { type: "IDLE" }).workerReady).toBe(true);
    expect(workerReducer(state, { type: "CLEAR_BUSY" }).league).toBe(league);
  });
});
