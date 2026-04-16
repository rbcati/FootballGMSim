import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import TradeWorkspace from "./TradeWorkspace.jsx";
import Roster from "./Roster.jsx";
import PlayerStats from "./PlayerStats.jsx";
import OffseasonHub from "./OffseasonHub.jsx";

const baseLeague = {
  week: 1,
  year: 2026,
  phase: "regular",
  userTeamId: 1,
  teams: [
    { id: 1, name: "User Team", abbr: "USR", wins: 0, losses: 0, capRoom: 25, roster: [], picks: [] },
    { id: 2, name: "Other Team", abbr: "OTH", wins: 0, losses: 0, capRoom: 20, roster: [], picks: [] },
  ],
  incomingTradeOffers: [],
};

describe("core management screens", () => {
  it("renders Transactions Offers workspace with empty-state guidance", () => {
    const html = renderToString(
      <TradeWorkspace league={baseLeague} actions={{}} initialView="Offers" />,
    );
    expect(html).toContain("No offers right now");
  });

  it("renders roster in table and depth entry states without throwing", () => {
    expect(() =>
      renderToString(<Roster league={baseLeague} actions={{}} initialState={{ view: "table", filter: "ALL" }} />),
    ).not.toThrow();
    expect(() =>
      renderToString(<Roster league={baseLeague} actions={{}} initialState={{ view: "depth", filter: "DEPTH" }} />),
    ).not.toThrow();
  });

  it("renders stats with empty data and deep-linked family", () => {
    const html = renderToString(<PlayerStats actions={{}} initialFamily="defense" />);
    expect(html).toContain("Player Stats");
  });

  it("renders offseason action center with blockers and guided actions", () => {
    const offseasonLeague = {
      ...baseLeague,
      phase: "offseason_resign",
      teams: [
        {
          ...baseLeague.teams[0],
          capRoom: 6,
          roster: [
            { id: 1, pos: "QB", ovr: 86, contract: { years: 1 }, extensionDecision: "pending" },
            { id: 2, pos: "WR", ovr: 72, contract: { years: 1 }, extensionDecision: "pending" },
          ],
          picks: [{ id: "1-1" }, { id: "2-1" }],
        },
      ],
    };
    const html = renderToString(<OffseasonHub league={offseasonLeague} onNavigate={() => {}} />);
    expect(html).toContain("Offseason Action Center");
    expect(html).toContain("Blocking tasks remain");
    expect(html).toContain("Open Re-sign table");
  });
});
