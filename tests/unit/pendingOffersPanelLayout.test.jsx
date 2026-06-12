/** @vitest-environment jsdom */
/**
 * Free Agency Market V2 — pending offer panel layout regression (mobile-safe).
 *
 * No visual redesign here; these tests only pin that the structural pieces a
 * user depends on never drop out of the DOM:
 *   - the pending offers panel renders long player names,
 *   - the Withdraw button stays present on pending rows,
 *   - the effective-cap badge stays present,
 *   - the FA table row keeps its offer-status chip.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import React from "react";
import FreeAgency, { PendingOffersPanel } from "../../src/ui/components/FreeAgency.jsx";

// Vitest globals are off in this repo, so testing-library cannot auto-cleanup.
afterEach(cleanup);

const LONG_NAME = "Maximiliano Bartholomew Featherstonehaugh-Worthington III";

const pendingOffer = {
  id: "fa-offer-42-0-1-1",
  playerId: 42,
  playerName: LONG_NAME,
  pos: "QB",
  years: 4,
  totalValue: 88,
  annualCapHit: 22,
  status: "pending",
  feedback: ["Competitive offer — close to the player’s asking price."],
  competingTeamIds: [3, 7],
};

const capSummary = { capRoom: 100, reservedPendingCap: 22, effectiveCapRoom: 78 };

describe("PendingOffersPanel layout", () => {
  it("renders a long player name without dropping the withdraw button or cap badge", () => {
    render(
      <PendingOffersPanel
        pendingOffers={[pendingOffer]}
        capSummary={capSummary}
        onWithdraw={() => {}}
      />,
    );
    const panel = screen.getByTestId("pending-offers-panel");
    const row = within(panel).getByTestId("pending-offer-42");
    expect(within(row).getByText(new RegExp(LONG_NAME))).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Withdraw" })).toBeTruthy();
    expect(within(row).getByText("Pending")).toBeTruthy();
    const badge = screen.getByTestId("effective-cap-badge");
    expect(badge.textContent).toContain("$78.0M");
    expect(badge.textContent).toContain("reserved $22.0M");
  });

  it("calls onWithdraw with the playerId", () => {
    const onWithdraw = vi.fn();
    render(
      <PendingOffersPanel
        pendingOffers={[pendingOffer]}
        capSummary={capSummary}
        onWithdraw={onWithdraw}
      />,
    );
    within(screen.getByTestId("pending-offer-42"))
      .getByRole("button", { name: "Withdraw" })
      .click();
    expect(onWithdraw).toHaveBeenCalledWith(42);
  });

  it("keeps the status badge but hides Withdraw on resolved rows", () => {
    for (const [status, label] of [
      ["accepted", "Accepted"],
      ["rejected", "Rejected"],
      ["expired", "Expired"],
      ["withdrawn", "Withdrawn"],
    ]) {
      render(
        <PendingOffersPanel
          pendingOffers={[{ ...pendingOffer, id: `row-${status}`, status }]}
          capSummary={{ ...capSummary, reservedPendingCap: 0, effectiveCapRoom: 100 }}
          onWithdraw={() => {}}
        />,
      );
      const row = screen.getByTestId("pending-offer-42");
      expect(within(row).getByText(label)).toBeTruthy();
      expect(within(row).queryByRole("button", { name: "Withdraw" })).toBeNull();
      cleanup();
    }
  });

  it("renders nothing when there are no offers and no reservation", () => {
    const { container } = render(
      <PendingOffersPanel pendingOffers={[]} capSummary={{ ...capSummary, reservedPendingCap: 0 }} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("FreeAgency table row status chip", () => {
  const freeAgent = {
    id: 42,
    name: LONG_NAME,
    pos: "QB",
    age: 27,
    ovr: 78,
    potential: 82,
    traits: [],
    contract: null,
    schemeFit: 60,
    offers: { count: 1, userOffered: true, userIsTopBidder: true },
    market: { heat: 1, bidderCount: 1 },
    demandProfile: { askAnnual: 18, askYears: 3, headline: "Balanced priorities" },
    playbookKnowledge: { score: 10, label: "Low" },
  };

  const league = {
    userTeamId: 0,
    week: 1,
    phase: "free_agency",
    teams: [
      {
        id: 0,
        name: "Test Team",
        abbr: "TST",
        capTotal: 255,
        capUsed: 150,
        deadCap: 5,
        capRoom: 100,
        roster: [],
        gamePlan: {},
      },
    ],
  };

  const payload = {
    phase: "free_agency",
    faDay: 1,
    faMaxDays: 5,
    freeAgents: [freeAgent],
    pendingOffers: [pendingOffer],
    capSummary,
  };

  function makeActions() {
    return {
      getFreeAgents: vi.fn(async () => ({ payload })),
      submitOffer: vi.fn(async () => ({})),
      withdrawOffer: vi.fn(async () => ({})),
      signPlayer: vi.fn(async () => ({})),
      advanceFreeAgencyDay: vi.fn(),
    };
  }

  it("keeps the pending status chip on the table row, plus panel + badge, with a long name", async () => {
    render(<FreeAgency userTeamId={0} league={league} actions={makeActions()} />);

    // Wait for the async FA load, then find the player's table row.
    const cells = await screen.findAllByText(LONG_NAME, undefined, { timeout: 5000 });
    const tableRow = cells.map((el) => el.closest("tr")).find(Boolean);
    expect(tableRow, "player row missing from the desktop FA table").toBeTruthy();

    // The status chip sits next to the player name inside the row.
    expect(within(tableRow).getByText("Pending")).toBeTruthy();

    // Panel structure survives alongside the table: withdraw + cap badge.
    const panel = screen.getByTestId("pending-offers-panel");
    expect(within(panel).getByRole("button", { name: "Withdraw" })).toBeTruthy();
    expect(screen.getByTestId("effective-cap-badge")).toBeTruthy();
  });
});
