import { describe, expect, it } from "vitest";
import { evaluateOwnerMessageContext, ownerToneLabel } from "./ownerMessages.js";

function makeTeam(overrides = {}) {
  return {
    id: 1,
    wins: 2,
    losses: 6,
    recentResults: ["W", "L", "L", "L", "L"],
    capSpace: 36,
    roster: [],
    ...overrides,
  };
}

function makeLeague(overrides = {}) {
  return {
    year: 3,
    week: 9,
    ownerApproval: 34,
    ownerGoals: [{ id: "g1", target: 10, current: 4, complete: false }],
    phase: "regular",
    ...overrides,
  };
}

describe("evaluateOwnerMessageContext", () => {
  it("prioritizes urgent pressure when approval is low and performance is poor", () => {
    const context = evaluateOwnerMessageContext({
      league: makeLeague(),
      userTeam: makeTeam(),
      currentWeek: 9,
      currentSeason: 3,
    });

    expect(context).toBeTruthy();
    expect(context.triggerKey).toBe("low_owner_approval");
    expect(context.tone).toBe("urgent_demand");
    expect(context.pressureState).toBe("urgent_demand");
    expect(context.message.length).toBeGreaterThan(20);
  });

  it("returns encouragement when team is stable and no pressure trigger exists", () => {
    const context = evaluateOwnerMessageContext({
      league: makeLeague({ ownerApproval: 82, ownerGoals: [], week: 7 }),
      userTeam: makeTeam({ wins: 5, losses: 2, recentResults: ["W", "W", "L", "W"], capSpace: 8 }),
      currentWeek: 7,
      currentSeason: 2,
    });

    expect(context).toBeTruthy();
    expect(context.triggerKey).toBe("steady_progress");
    expect(context.tone).toBe("cautious_encouragement");
    expect(context.pressureState).toBe("cooling");
  });

  it("detects goal failure pressure late in the season", () => {
    const context = evaluateOwnerMessageContext({
      league: makeLeague({ ownerApproval: 66, week: 14, ownerGoals: [{ id: "g1", target: 12, current: 5, complete: false }] }),
      userTeam: makeTeam({ wins: 6, losses: 8, recentResults: ["L", "W", "L"] }),
      currentWeek: 14,
      currentSeason: 4,
    });

    expect(context).toBeTruthy();
    expect(context.triggerKey).toBe("missed_owner_goals");
    expect(["disappointment", "urgent_demand"]).toContain(context.tone);
    expect(context.expectedAction).toBeTruthy();
  });
});

describe("ownerToneLabel", () => {
  it("maps tone identifiers to user-facing labels", () => {
    expect(ownerToneLabel("urgent_demand")).toBe("Urgent demand");
    expect(ownerToneLabel("warning")).toBe("Warning");
    expect(ownerToneLabel("unknown")).toBe("Owner message");
  });
});
