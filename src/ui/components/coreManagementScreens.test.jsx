import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import TradeWorkspace from "./TradeWorkspace.jsx";
import Roster from "./Roster.jsx";
import PlayerStats from "./PlayerStats.jsx";

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
});
