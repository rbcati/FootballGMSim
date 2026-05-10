import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import Draft, { normalizeIncomingDraftState } from "./Draft.jsx";
import DraftBigBoard from "./DraftBigBoard.jsx";

describe("Draft safeguards", () => {
  it("normalizes incomplete draft payloads", () => {
    const normalized = normalizeIncomingDraftState({ currentPickIndex: 1, notStarted: false });
    expect(normalized.prospects).toEqual([]);
    expect(normalized.completedPicks).toEqual([]);
    expect(normalized.upcomingPicks).toEqual([]);
    expect(normalized.totalPicks).toBe(0);
  });

  it("renders draft shell without crashing for offseason flow", () => {
    const html = renderToString(
      <Draft
        league={{ year: 2026, userTeamId: 1, teams: [] }}
        actions={{ getDraftState: async () => ({ payload: null }) }}
        onNavigate={() => {}}
      />,
    );
    expect(html).toContain("NFL Draft");
  });
});

describe("DraftBigBoard", () => {
  it("renders board controls and class identity", () => {
    const html = renderToString(
      <DraftBigBoard
        league={{ userTeamId: 1, teams: [{ id: 1, roster: [] }], draftClass: [{ id: 1, name: 'A', pos: 'QB' }], draftState: { picks: [] } }}
      />,
    );
    expect(html).toContain("Board Controls");
    expect(html).toContain("Class:");
    expect(html).toContain("draft-board-scouting-inline");
  });
});
