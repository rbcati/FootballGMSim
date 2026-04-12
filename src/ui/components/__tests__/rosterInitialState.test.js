import { describe, it, expect } from "vitest";
import { normalizeInitialRosterState } from "../Roster.jsx";

describe("normalizeInitialRosterState", () => {
  it("falls back safely for null/partial state", () => {
    expect(normalizeInitialRosterState(null, "table")).toEqual({ safeView: "table", safeFilter: "ALL" });
    expect(normalizeInitialRosterState({ view: "cards" }, "table")).toEqual({ safeView: "cards", safeFilter: "ALL" });
    expect(normalizeInitialRosterState({ filter: "injured" }, "table")).toEqual({ safeView: "table", safeFilter: "INJURED" });
  });

  it("guards invalid view values", () => {
    expect(normalizeInitialRosterState({ view: "grid" }, "depth")).toEqual({ safeView: "depth", safeFilter: "ALL" });
    expect(normalizeInitialRosterState({ view: "grid" }, "oops")).toEqual({ safeView: "table", safeFilter: "ALL" });
  });
});
