import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { DraftTicker } from "./DraftTicker.jsx";

const pick = (n) => ({ overall: n, teamAbbr: "KC", playerPos: "QB", playerName: `Player${n}`, playerOvr: 72 });

describe("DraftTicker", () => {
  it("renders nothing when completedPicks is empty", () => {
    const html = renderToString(<DraftTicker completedPicks={[]} />);
    expect(html).toBe("");
  });

  it("renders LATEST label and pick info when picks exist", () => {
    const html = renderToString(<DraftTicker completedPicks={[pick(1), pick(2)]} />);
    expect(html).toContain("LATEST");
    expect(html).toContain("KC");
    expect(html).toContain("QB");
    expect(html).toContain("Player1");
    expect(html).toContain("Player2");
  });

  it("shows at most 5 picks from a 7-pick list (most recent first)", () => {
    const picks = [1, 2, 3, 4, 5, 6, 7].map(pick);
    const html = renderToString(<DraftTicker completedPicks={picks} />);
    // Last 5 reversed: players 7,6,5,4,3 should appear; 2 and 1 should not
    expect(html).toContain("Player7");
    expect(html).toContain("Player3");
    expect(html).not.toContain("Player2");
    expect(html).not.toContain("Player1");
  });
});
