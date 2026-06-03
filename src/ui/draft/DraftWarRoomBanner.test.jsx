import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { DraftWarRoomBanner } from "./DraftWarRoomBanner.jsx";

const pick = { teamName: "Kansas City Chiefs", teamAbbr: "KC", round: 1, overall: 5 };

describe("DraftWarRoomBanner", () => {
  it("renders nothing when draft is complete", () => {
    const html = renderToString(<DraftWarRoomBanner isUserPick={false} currentPick={pick} isDraftComplete />);
    expect(html).toBe("");
  });

  it("shows AI picking label when not user pick", () => {
    const html = renderToString(<DraftWarRoomBanner isUserPick={false} currentPick={pick} isDraftComplete={false} />);
    expect(html).toContain("War Room");
    expect(html).toContain("Kansas City Chiefs");
  });

  it("shows on-the-clock label for user pick", () => {
    const html = renderToString(<DraftWarRoomBanner isUserPick currentPick={pick} isDraftComplete={false} />);
    expect(html).toContain("On The Clock");
  });
});
