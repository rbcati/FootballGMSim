import { describe, expect, it } from "vitest";
import { normalizeManagementDestination } from "./managementScreenRouting.js";

describe("normalizeManagementDestination", () => {
  it("round-trips transactions tokens with fallback", () => {
    expect(normalizeManagementDestination("Transactions:Offers")).toMatchObject({
      tab: "Transactions",
      tradeView: "Offers",
    });
    expect(normalizeManagementDestination("Transactions:Unknown")).toMatchObject({
      tab: "Transactions",
      tradeView: "Finder",
    });
  });

  it("supports roster deep links to depth and expiring focus", () => {
    expect(normalizeManagementDestination("Roster:depth|EXPIRING")).toMatchObject({
      tab: "Roster",
      rosterState: { view: "depth", filter: "EXPIRING" },
    });
    expect(normalizeManagementDestination("Roster:Depth")).toMatchObject({
      tab: "Roster",
      rosterState: { view: "depth", filter: "ALL" },
    });
  });

  it("supports stats family deep links with default", () => {
    expect(normalizeManagementDestination("Stats:defense")).toMatchObject({
      tab: "Stats",
      statsFamily: "defense",
    });
    expect(normalizeManagementDestination("Stats:")).toMatchObject({
      tab: "Stats",
      statsFamily: "passing",
    });
  });
});
