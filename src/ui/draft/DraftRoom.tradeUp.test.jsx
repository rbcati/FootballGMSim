/**
 * DraftRoom.tradeUp.test.jsx
 *
 * UI-level tests for the Draft-Day Trade-Up Engine surface area:
 *  - DraftTicker trade-up amber badge
 *  - DraftTradeDownPanel 'draft_trade_up' origin branch
 */

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { DraftTicker } from "./DraftTicker.jsx";
import { DraftTradeDownPanel } from "./DraftTradeDownPanel.jsx";

// ── DraftTicker — trade-up event rendering ─────────────────────────────────────

describe("DraftTicker — tradeUpTicker prop", () => {
  it("renders the amber badge when tradeUpTicker is provided", () => {
    const tradeUpTicker = {
      type: "draft_trade_up",
      text: "📢 TRADE-UP: MTN acquired Pick #5!",
      pickNumber: 5,
      buyerTeam: "Mountain Lions",
      buyerTeamAbbr: "MTN",
    };

    const html = renderToString(
      <DraftTicker completedPicks={[]} tradeUpTicker={tradeUpTicker} />,
    );

    expect(html).toContain("TRADE-UP");
    expect(html).toContain("MTN acquired Pick #5");
  });

  it("renders the correct trade-up text from ticker payload", () => {
    const tradeUpTicker = {
      type: "draft_trade_up",
      text: "📢 TRADE-UP: BUY acquired Pick #3!",
      pickNumber: 3,
      buyerTeam: "Buyers FC",
      buyerTeamAbbr: "BUY",
    };

    const html = renderToString(
      <DraftTicker completedPicks={[]} tradeUpTicker={tradeUpTicker} />,
    );

    expect(html).toContain("BUY acquired Pick #3");
  });

  it("uses amber badge styling (amber background and border color values)", () => {
    const tradeUpTicker = {
      type: "draft_trade_up",
      text: "📢 TRADE-UP: TST acquired Pick #7!",
      pickNumber: 7,
      buyerTeamAbbr: "TST",
    };

    const html = renderToString(
      <DraftTicker completedPicks={[]} tradeUpTicker={tradeUpTicker} />,
    );

    // Amber color values from DraftTicker.jsx styles
    expect(html).toMatch(/rgba\(251,191,36,0\.15\)/);
    expect(html).toMatch(/rgba\(251,191,36,0\.4\)/);
  });

  it("is hidden (returns empty) when both completedPicks and tradeUpTicker are absent", () => {
    const html = renderToString(<DraftTicker completedPicks={[]} />);
    expect(html).toBe("");
  });

  it("shows ticker when tradeUpTicker present but completedPicks is empty", () => {
    const tradeUpTicker = { type: "draft_trade_up", text: "📢 TRADE-UP: AAA acquired Pick #1!" };
    const html = renderToString(
      <DraftTicker completedPicks={[]} tradeUpTicker={tradeUpTicker} />,
    );
    expect(html).not.toBe("");
    expect(html).toContain("TRADE-UP");
  });

  it("shows both ticker sections when completedPicks and tradeUpTicker both present", () => {
    const pick = { overall: 1, teamAbbr: "KC", playerPos: "QB", playerName: "Player1", playerOvr: 75 };
    const tradeUpTicker = { type: "draft_trade_up", text: "📢 TRADE-UP: MTN acquired Pick #5!" };

    const html = renderToString(
      <DraftTicker completedPicks={[pick]} tradeUpTicker={tradeUpTicker} />,
    );

    expect(html).toContain("LATEST");
    expect(html).toContain("Player1");
    expect(html).toContain("TRADE-UP");
    expect(html).toContain("MTN acquired Pick #5");
  });

  it("has aria-live polite on the amber badge for accessibility", () => {
    const tradeUpTicker = { type: "draft_trade_up", text: "📢 TRADE-UP: AAA acquired Pick #2!" };
    const html = renderToString(
      <DraftTicker completedPicks={[]} tradeUpTicker={tradeUpTicker} />,
    );
    expect(html).toContain('aria-live="polite"');
  });
});

// ── DraftTradeDownPanel — draft_trade_up origin branch ────────────────────────

describe("DraftTradeDownPanel — origin: draft_trade_up", () => {
  const tradeUpProposal = {
    origin: "draft_trade_up",
    aiTeamName: "Mountain Lions",
    aiTeamAbbr: "MTN",
    userPickOverall: 4,
    aiPickOverall: 11,
    targetProspect: {
      name: "JetSpeed Jones",
      pos: "WR",
      combineGrade: 9.1,
    },
    sweetenerRound: 0,
    futurePkLabel: null,
  };

  it("renders Trade-Up Offer title for origin: draft_trade_up", () => {
    const html = renderToString(
      <DraftTradeDownPanel
        pendingTradeProposal={tradeUpProposal}
        processing={false}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("Trade-Up Offer");
  });

  it("renders correct offer body text describing the trade-up", () => {
    const html = renderToString(
      <DraftTradeDownPanel
        pendingTradeProposal={tradeUpProposal}
        processing={false}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // React SSR inserts <!-- --> between JSX text and expression nodes, so
    // "Pick #{value}" renders as "Pick #<!-- -->11<!-- -->". Check pieces separately.
    expect(html).toContain("Mountain Lions");
    expect(html).toContain("Pick #");
    expect(html).toContain(">11<");   // aiPickOverall in its own text node
    expect(html).toContain(">4<");    // userPickOverall in its own text node
    expect(html).toContain("JetSpeed Jones");
    expect(html).toContain("WR");
  });

  it("shows combine grade in the offer body", () => {
    const html = renderToString(
      <DraftTradeDownPanel
        pendingTradeProposal={tradeUpProposal}
        processing={false}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("9.1");
  });

  it("shows 'Accept and Trade Down' button label for trade-up offers", () => {
    const html = renderToString(
      <DraftTradeDownPanel
        pendingTradeProposal={tradeUpProposal}
        processing={false}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("Accept and Trade Down");
  });

  it("shows 'Decline and Keep Pick' button label for trade-up offers", () => {
    const html = renderToString(
      <DraftTradeDownPanel
        pendingTradeProposal={tradeUpProposal}
        processing={false}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("Decline and Keep Pick");
  });

  it("only shows the trade-up branch for origin: draft_trade_up (not the legacy text)", () => {
    const html = renderToString(
      <DraftTradeDownPanel
        pendingTradeProposal={tradeUpProposal}
        processing={false}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // Legacy text should NOT appear
    expect(html).not.toContain("are offering to trade up");
    expect(html).not.toContain("You receive: their pick");
  });

  it("does NOT show trade-up title for legacy proposals (no origin field)", () => {
    const legacyProposal = {
      aiTeamName: "Dallas Cowboys",
      aiTeamAbbr: "DAL",
      userPickOverall: 8,
      aiPickOverall: 15,
      aiPickRound: 1,
      targetProspect: { name: "Joe Smith", pos: "QB", ovr: 82 },
    };

    const html = renderToString(
      <DraftTradeDownPanel
        pendingTradeProposal={legacyProposal}
        processing={false}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("Trade Offer from");
    expect(html).not.toContain("Trade-Up Offer");
    expect(html).toContain("Accept Trade");
  });

  it("shows Processing… on accept button when processing=true", () => {
    const html = renderToString(
      <DraftTradeDownPanel
        pendingTradeProposal={tradeUpProposal}
        processing
        onAccept={vi.fn()}
        onDecline={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("Processing…");
  });

  it("renders future pick label in offer body when futurePkLabel is set", () => {
    const withFuture = {
      ...tradeUpProposal,
      futurePkLabel: "2026 Round 2",
    };
    const html = renderToString(
      <DraftTradeDownPanel
        pendingTradeProposal={withFuture}
        processing={false}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("2026 Round 2");
  });
});
