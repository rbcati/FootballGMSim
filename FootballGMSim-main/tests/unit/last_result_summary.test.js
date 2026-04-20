import { describe, it, expect } from "vitest";
import { buildLatestResultsSummary } from "../../src/ui/utils/lastResultSummary.js";

describe("buildLatestResultsSummary", () => {
  it("builds compact scoreboard text from authoritative sim results", () => {
    const summary = buildLatestResultsSummary({
      results: [
        { homeId: 1, awayId: 2, homeScore: 24, awayScore: 17 },
        { homeId: 3, awayId: 4, homeScore: 31, awayScore: 28 },
      ],
      teamById: {
        1: { abbr: "NE" },
        2: { abbr: "NYJ" },
        3: { abbr: "KC" },
        4: { abbr: "BUF" },
      },
    });

    expect(summary).toEqual(["NYJ 17-24 NE", "BUF 28-31 KC"]);
  });

  it("returns an empty summary when no authoritative results are available", () => {
    expect(buildLatestResultsSummary({ results: [] })).toEqual([]);
    expect(buildLatestResultsSummary({})).toEqual([]);
  });
});
