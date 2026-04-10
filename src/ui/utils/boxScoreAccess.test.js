import { describe, expect, it, vi } from "vitest";
import {
  buildCompletedGamePresentation,
  getBoxScoreAvailability,
  openResolvedBoxScore,
  resolveBoxScoreGameId,
} from "./boxScoreAccess.js";

describe("boxScoreAccess", () => {
  it("resolves canonical ids from legacy-shaped game rows", () => {
    expect(resolveBoxScoreGameId({ seasonId: "2030", week: 5, home: 1, away: 4 })).toBe("2030_w5_1_4");
  });

  it("marks missing archive games as not openable", () => {
    const availability = getBoxScoreAvailability({ seasonId: "2030", week: 4, home: 3, away: 8, homeScore: 20, awayScore: 17 });
    expect(availability.archiveQuality).toBe("missing");
    expect(availability.canOpen).toBe(false);
  });

  it("builds partial archive CTA labels", () => {
    const vm = buildCompletedGamePresentation({
      seasonId: "2030",
      week: 9,
      home: 2,
      away: 6,
      homeScore: 27,
      awayScore: 24,
      recap: "Legacy recap only",
    });
    expect(vm.archiveQuality).toBe("partial");
    expect(vm.ctaLabel).toBe("View Partial Archive");
  });

  it("opens resolved game IDs through shared flow", () => {
    const onOpen = vi.fn();
    const opened = openResolvedBoxScore({
      seasonId: "2030",
      week: 9,
      home: 2,
      away: 6,
      homeScore: 27,
      awayScore: 24,
      recap: "Legacy recap only",
    }, {}, onOpen);
    expect(opened).toBe(true);
    expect(onOpen).toHaveBeenCalledWith("2030_w9_2_6");
  });
});
