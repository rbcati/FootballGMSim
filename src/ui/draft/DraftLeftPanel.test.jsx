import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { DraftLeftPanel } from "./DraftLeftPanel.jsx";
import { DRAFT_ROOM_PHASES } from "./draftShared.js";

const pick = { teamAbbr: "KC", teamName: "Kansas City Chiefs", round: 2, overall: 35 };

const baseProps = {
  isDraftComplete: false,
  isUserPick: false,
  currentPick: pick,
  draftPhase: DRAFT_ROOM_PHASES.CPU_PICKING,
  pickClock: 90,
  userAutoPick: false,
  onAutoPickChange: vi.fn(),
  simming: false,
  disabled: false,
  onSimToMyPick: vi.fn(),
  actions: { getRoster: vi.fn(), submitTrade: vi.fn() },
  showTradeUp: false,
  onShowTradeUp: vi.fn(),
  onHideTradeUp: vi.fn(),
  upcomingPicks: [],
  completedPicks: [],
  activeRound: 1,
  league: { year: 2025, userTeamId: 1, teams: [] },
};

describe("DraftLeftPanel", () => {
  it("renders pick clock and team info without crashing", () => {
    const html = renderToString(<DraftLeftPanel {...baseProps} />);
    expect(html).toContain("On the Clock");
    expect(html).toContain("KC");
    expect(html).toContain("Kansas City Chiefs");
  });

  it("shows Sim to My Pick button when AI is picking", () => {
    const html = renderToString(<DraftLeftPanel {...baseProps} />);
    expect(html).toContain("Sim to My Pick");
  });

  it("hides Sim button when user is on the clock", () => {
    const html = renderToString(<DraftLeftPanel {...baseProps} isUserPick />);
    expect(html).not.toContain("Sim to My Pick");
  });

  it("shows Draft Complete when draft is finished", () => {
    const html = renderToString(<DraftLeftPanel {...baseProps} isDraftComplete />);
    expect(html).toContain("Draft Complete");
  });

  it("renders upcoming picks when provided", () => {
    const upcomingPicks = [{ overall: 35, teamAbbr: "KC", round: 2, isUser: false }];
    const html = renderToString(<DraftLeftPanel {...baseProps} upcomingPicks={upcomingPicks} />);
    expect(html).toContain("Pick Order");
  });
});
