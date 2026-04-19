import { describe, it, expect } from "vitest";
import {
  deriveLeaders,
  deriveQuarterScores,
  deriveScoringSummary,
  deriveTeamTotals,
  getGameDetailSections,
  toPlayerArray,
} from "../../src/ui/utils/boxScorePresentation.js";

describe("box score presentation helpers", () => {
  const game = {
    homeId: 1,
    awayId: 2,
    stats: {
      home: {
        11: { name: "Home QB", pos: "QB", stats: { passAtt: 30, passComp: 20, passYd: 265, passTD: 2 } },
        12: { name: "Home RB", pos: "RB", stats: { rushAtt: 18, rushYd: 94, rushTD: 1 } },
      },
      away: {
        21: { name: "Away WR", pos: "WR", stats: { targets: 8, receptions: 6, recYd: 110, recTD: 1 } },
        22: { name: "Away LB", pos: "LB", stats: { tackles: 8, sacks: 1 } },
      },
    },
  };

  it("derives leaders from available side stats", () => {
    const leaders = deriveLeaders(game);
    expect(leaders.pass?.name).toBe("Home QB");
    expect(leaders.rush?.name).toBe("Home RB");
    expect(leaders.receive?.name).toBe("Away WR");
    expect(leaders.defense?.name).toBe("Away LB");
  });

  it("handles partial/missing stat data safely", () => {
    expect(toPlayerArray(null, 1)).toEqual([]);
    expect(deriveTeamTotals(undefined).totalYards).toBeNull();
  });

  it("builds scoring and quarter views from logs when quarter arrays are missing", () => {
    const logs = [
      { quarter: 1, teamId: 1, text: "Touchdown pass", isTouchdown: true },
      { quarter: 2, teamId: 2, text: "Field goal is good" },
    ];
    const quarter = deriveQuarterScores({ homeId: 1, awayId: 2 }, logs);
    expect(quarter.home[0]).toBe(6);
    expect(quarter.away[1]).toBe(3);

    const summary = deriveScoringSummary(logs, { 1: { abbr: "HME" }, 2: { abbr: "AWY" } });
    expect(summary).toHaveLength(2);
    expect(summary[0].teamAbbr).toBe("HME");
  });

  it("hides empty archive sections for partial games", () => {
    const sections = getGameDetailSections({
      homeScore: 17,
      awayScore: 13,
      summary: { storyline: "Defensive game" },
      playLog: [],
      driveSummary: [],
      turningPoints: [],
    });
    expect(sections.recap).toBe(true);
    expect(sections.driveSummary).toBe(false);
    expect(sections.playLog).toBe(false);
    expect(sections.quarterByQuarter).toBe(true);
  });

  it("prefers stored quarter scores (including OT) over derived logs", () => {
    const quarter = deriveQuarterScores({
      homeId: 1,
      awayId: 2,
      quarterScores: { home: [3, 3, 7, 7, 3], away: [7, 0, 3, 10, 0] },
    }, [
      { quarter: 1, teamId: 1, text: "Touchdown", isTouchdown: true },
    ]);
    expect(quarter.home).toEqual([3, 3, 7, 7, 3]);
    expect(quarter.away).toEqual([7, 0, 3, 10, 0]);
  });
});
