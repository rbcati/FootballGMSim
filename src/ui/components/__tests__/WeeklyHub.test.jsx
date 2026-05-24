/** @vitest-environment jsdom */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import WeeklyHub from "../WeeklyHub.jsx";

// ── Fixture ───────────────────────────────────────────────────────────────────

function makeLeague({ incomingTradeOffers = [], week = 5 } = {}) {
  return {
    year: 2027,
    week,
    seasonId: `s${week}`,
    phase: "regular",
    userTeamId: 1,
    teams: [
      {
        id: 1,
        name: "Bears",
        abbr: "CHI",
        conf: 0,
        div: 0,
        wins: 3,
        losses: 2,
        ties: 0,
        ovr: 80,
        offenseRating: 78,
        defenseRating: 79,
        recentResults: ["W", "L", "W"],
        roster: [{ id: 11, pos: "QB", ovr: 80, teamId: 1 }],
      },
      {
        id: 2,
        name: "Lions",
        abbr: "DET",
        conf: 0,
        div: 1,
        wins: 2,
        losses: 3,
        ties: 0,
        ovr: 82,
        offenseRating: 80,
        defenseRating: 81,
        roster: [],
      },
    ],
    schedule: {
      weeks: [
        {
          week,
          games: [
            { id: `g${week}`, home: { id: 1 }, away: { id: 2 }, played: false },
          ],
        },
      ],
    },
    incomingTradeOffers,
    leaguePulse: [],
    newsItems: [],
  };
}

function makeFakeOffer(id = "offer-1") {
  return {
    id,
    week: 4,
    season: 2027,
    offeringTeamId: 2,
    offeringTeamAbbr: "DET",
    receivingTeamId: 1,
    userTeamId: 1,
    offerType: "proactive_ai_offer",
    urgency: "low",
    stance: "Roster balance",
    reason: "DET floated a conservative trade-block offer.",
    reasonTags: ["cap_burden"],
    expiresAfterWeek: 6,
    offering: { playerIds: [201], pickIds: [] },
    receiving: { playerIds: [104], pickIds: [] },
    offeringPlayerSnapshots: [{ id: 201, name: "VetWR", pos: "WR", ovr: 80, age: 31 }],
    receivingPlayerSnapshots: [{ id: 104, name: "SurplusRB", pos: "RB", ovr: 74, age: 27 }],
    signature: "sig-1",
  };
}

// ── Notification badge tests ──────────────────────────────────────────────────

describe("WeeklyHub — incoming trade offer notification", () => {
  afterEach(cleanup);

  it("does not show trade offer banner when there are no incoming offers", () => {
    const league = makeLeague({ incomingTradeOffers: [] });
    render(
      <WeeklyHub
        league={league}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        onOpenBoxScore={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("trade-offer-banner")).toBeNull();
  });

  it("shows trade offer banner when there is 1 incoming offer", () => {
    const league = makeLeague({ incomingTradeOffers: [makeFakeOffer()] });
    render(
      <WeeklyHub
        league={league}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        onOpenBoxScore={vi.fn()}
      />,
    );
    expect(screen.getByTestId("trade-offer-banner")).toBeTruthy();
    expect(screen.getByText(/you have 1 pending trade offer/i)).toBeTruthy();
  });

  it("shows plural wording when there are multiple incoming offers", () => {
    const league = makeLeague({
      incomingTradeOffers: [makeFakeOffer("o1"), makeFakeOffer("o2")],
    });
    render(
      <WeeklyHub
        league={league}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        onOpenBoxScore={vi.fn()}
      />,
    );
    expect(screen.getByText(/you have 2 pending trade offers/i)).toBeTruthy();
  });

  it("includes a CTA button inside the banner", () => {
    const league = makeLeague({ incomingTradeOffers: [makeFakeOffer()] });
    render(
      <WeeklyHub
        league={league}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        onOpenBoxScore={vi.fn()}
      />,
    );
    const banner = screen.getByTestId("trade-offer-banner");
    expect(banner.querySelector("button")).toBeTruthy();
  });

  it("clicking the CTA navigates to Trade Center", () => {
    const onNavigate = vi.fn();
    const league = makeLeague({ incomingTradeOffers: [makeFakeOffer()] });
    render(
      <WeeklyHub
        league={league}
        onNavigate={onNavigate}
        onAdvanceWeek={vi.fn()}
        onOpenBoxScore={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Open Trade Center"));
    expect(onNavigate).toHaveBeenCalledWith("Trade Center");
  });

  it("banner disappears when incomingTradeOffers becomes empty (re-render)", () => {
    const offer = makeFakeOffer();
    const { rerender } = render(
      <WeeklyHub
        league={makeLeague({ incomingTradeOffers: [offer] })}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        onOpenBoxScore={vi.fn()}
      />,
    );
    expect(screen.getByTestId("trade-offer-banner")).toBeTruthy();

    rerender(
      <WeeklyHub
        league={makeLeague({ incomingTradeOffers: [] })}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        onOpenBoxScore={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("trade-offer-banner")).toBeNull();
  });
});
