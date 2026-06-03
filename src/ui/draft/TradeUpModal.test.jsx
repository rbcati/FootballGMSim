import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { TradeUpModal } from "./TradeUpModal.jsx";

const currentPick = { overall: 12, teamAbbr: "SF", teamId: 2, round: 1 };
const league = { year: 2025, userTeamId: 1 };
const actions = { getRoster: vi.fn(async () => ({ payload: { players: [] } })), submitTrade: vi.fn() };

describe("TradeUpModal", () => {
  it("renders trade modal header without crashing", () => {
    const html = renderToString(
      <TradeUpModal currentPick={currentPick} league={league} actions={actions} onClose={() => {}} onTradeComplete={() => {}} />,
    );
    // React 18 SSR adds <!-- --> between adjacent text and expression nodes
    expect(html).toContain("Trade for Pick");
    expect(html).toContain("SF");
    expect(html).toContain("Propose Trade");
    expect(html).toContain("Offer Draft Picks");
  });

  it("renders round picker buttons R1–R5", () => {
    const html = renderToString(
      <TradeUpModal currentPick={currentPick} league={league} actions={actions} onClose={() => {}} />,
    );
    expect(html).toContain("+ R");
    expect(html).toContain("Offer Players");
  });
});
