import { describe, it, expect } from "vitest";
import { attachSeasonStatsToRoster } from "../viewStateStats.js";

// Mirrors the cache season-stat shape: totals are keyed by player id.
function lookupFrom(map) {
  return (pid) => map[String(pid)] ?? null;
}

describe("attachSeasonStatsToRoster", () => {
  it("copies recorded totals onto each player as seasonStats", () => {
    const totalsById = {
      "1": { passYd: 320, passTD: 3, gamesPlayed: 1 },
      "2": { rushYd: 110, rushTD: 1, gamesPlayed: 1 },
    };
    const roster = [
      { id: 1, name: "QB" },
      { id: 2, name: "RB" },
    ];

    const out = attachSeasonStatsToRoster(roster, lookupFrom(totalsById));

    expect(out[0].seasonStats).toEqual(totalsById["1"]);
    expect(out[1].seasonStats).toEqual(totalsById["2"]);
  });

  it("does not mutate the original cache player objects", () => {
    const roster = [{ id: 1, name: "QB" }];
    const out = attachSeasonStatsToRoster(roster, lookupFrom({ "1": { passYd: 100 } }));
    expect(roster[0].seasonStats).toBeUndefined();
    expect(out[0]).not.toBe(roster[0]);
  });

  it("leaves players without recorded totals unchanged", () => {
    const roster = [{ id: 9, name: "Benchwarmer" }];
    const out = attachSeasonStatsToRoster(roster, lookupFrom({}));
    expect(out[0].seasonStats).toBeUndefined();
  });

  it("respects an already-present seasonStats object", () => {
    const existing = { passYd: 999 };
    const roster = [{ id: 1, name: "QB", seasonStats: existing }];
    const out = attachSeasonStatsToRoster(roster, lookupFrom({ "1": { passYd: 1 } }));
    expect(out[0].seasonStats).toBe(existing);
  });

  it("passes malformed rows through without throwing", () => {
    const roster = [null, undefined, 42, { id: 1, name: "QB" }];
    const out = attachSeasonStatsToRoster(roster, lookupFrom({ "1": { passYd: 50 } }));
    expect(out[0]).toBeNull();
    expect(out[3].seasonStats).toEqual({ passYd: 50 });
  });

  it("returns [] for non-array input and tolerates a missing lookup", () => {
    expect(attachSeasonStatsToRoster(null, lookupFrom({}))).toEqual([]);
    const roster = [{ id: 1 }];
    expect(attachSeasonStatsToRoster(roster, undefined)).toBe(roster);
  });
});
