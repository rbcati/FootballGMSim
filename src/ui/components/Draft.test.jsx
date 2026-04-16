import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import Draft, { normalizeIncomingDraftState } from "./Draft.jsx";

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
