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
      rosterState: { view: "depth", filter: "DEPTH" },
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

  it("supports league command center section deep links with default", () => {
    expect(normalizeManagementDestination("League:Results")).toMatchObject({
      tab: "League",
      leagueSection: "Results",
    });
    expect(normalizeManagementDestination("League:unknown")).toMatchObject({
      tab: "League",
      leagueSection: "Overview",
    });
  });

  it("supports team command center section deep links with default", () => {
    expect(normalizeManagementDestination("Team:Contracts")).toMatchObject({
      tab: "Team",
      teamSection: "Contracts",
    });
    expect(normalizeManagementDestination("Team:unknown")).toMatchObject({
      tab: "Team",
      teamSection: "Overview",
    });
  });

  it("leaves unknown tabs untouched", () => {
    expect(normalizeManagementDestination("Financials")).toMatchObject({
      tab: "Financials",
      tradeView: null,
      rosterState: null,
      statsFamily: null,
      leagueSection: null,
      teamSection: null,
    });
  });
});
