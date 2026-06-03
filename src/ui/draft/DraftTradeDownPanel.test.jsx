import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { DraftTradeDownPanel } from "./DraftTradeDownPanel.jsx";

const proposal = {
  aiTeamAbbr: "DAL",
  aiTeamName: "Dallas Cowboys",
  userPickOverall: 8,
  targetProspect: { name: "Joe Smith", pos: "QB", ovr: 82 },
  aiPickOverall: 15,
  aiPickRound: 1,
};

describe("DraftTradeDownPanel", () => {
  it("renders trade offer details without crashing", () => {
    const html = renderToString(
      <DraftTradeDownPanel
        pendingTradeProposal={proposal}
        processing={false}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // React 18 SSR: "Trade Offer from <!-- -->DAL"
    expect(html).toContain("Trade Offer from");
    expect(html).toContain("Dallas Cowboys");
    expect(html).toContain("Joe Smith");
    expect(html).toContain("Accept Trade");
    expect(html).toContain("Decline");
  });

  it("shows Processing… when processing is true", () => {
    const html = renderToString(
      <DraftTradeDownPanel
        pendingTradeProposal={proposal}
        processing
        onAccept={vi.fn()}
        onDecline={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("Processing…");
  });
});
