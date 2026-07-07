/** @vitest-environment jsdom */
/**
 * RosterDecisionBoard.test.jsx
 *
 * Roster Decision Board V2 + commit dry-run V1: expiring-contract triage
 * table with local pending-decision state. Verifies the expiring window
 * filter, safe `_resignMeta` fallbacks, local-only decision pills, the
 * dry-run "Review Decisions" flow (local commit plan, valid/invalid sections,
 * no mutation handlers called), reuse of the hidden dev-trait reveal helper,
 * and that the hiddenTrueOvr sentinel never reaches the DOM.
 *
 * Decision identity: decisions are keyed by String(player.id) only. Rows
 * without a usable id render read-only (disabled pills, muted note) and
 * never appear in the dry-run commit plan.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";

afterEach(cleanup);

vi.mock("../../../core/draft/draftVariance.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getHiddenDevTraitLabel: vi.fn(actual.getHiddenDevTraitLabel),
  };
});

import { getHiddenDevTraitLabel } from "../../../core/draft/draftVariance.js";
import RosterDecisionBoard from "../RosterDecisionBoard.jsx";
import RosterHub from "../RosterHub.jsx";

// hiddenTrueOvr sentinel value chosen to collide with no other rendered number.
const SENTINEL_TRUE_OVR = 97;

function makeRoster() {
  return [
    {
      id: 7,
      name: "Cut Candidate",
      pos: "QB",
      age: 29,
      ovr: 81,
      hiddenDevTrait: "superstar",
      hiddenTrueOvr: SENTINEL_TRUE_OVR,
      ovrHistory: [72, 76, 81], // 3 completed seasons → trait revealed
      contract: { years: 1, baseAnnual: 8.5 },
      _resignMeta: {
        tier: "let_walk",
        label: "Expendable",
        tone: "var(--danger)",
        reason: "Let walk: age and contract demands outpace value",
        score: 40,
        urgency: "Low",
        negotiationRisk: "High",
        replacementDifficulty: "Low",
      },
    },
    {
      id: 8,
      name: "No Meta Man",
      pos: "WR",
      age: 22,
      ovr: 74,
      hiddenDevTrait: "bust",
      hiddenTrueOvr: SENTINEL_TRUE_OVR,
      ovrHistory: [74], // 1 completed season → trait still hidden
      contract: { years: 2, baseAnnual: 3.2 },
      // no _resignMeta on purpose
    },
    {
      id: 9,
      name: "Long Deal Larry",
      pos: "OL",
      age: 27,
      ovr: 79,
      contract: { years: 3, baseAnnual: 6.4 },
    },
    {
      id: 10,
      name: "No Contract Nick",
      pos: "CB",
      age: 24,
      ovr: 71,
      // no contract on purpose
    },
    {
      // no id on purpose: renders read-only, never enters the decisions map
      name: "No ID Ned",
      pos: "RB",
      age: 25,
      ovr: 70,
      contract: { years: 1, baseAnnual: 2.0 },
    },
    null, // malformed row must be ignored
  ];
}

describe("RosterDecisionBoard", () => {
  beforeEach(() => {
    vi.mocked(getHiddenDevTraitLabel).mockClear();
  });

  it("renders with an empty roster and does not crash", () => {
    expect(() => render(<RosterDecisionBoard roster={[]} league={{}} />)).not.toThrow();
    expect(screen.getByText("No expiring contracts")).toBeTruthy();
  });

  it("excludes players without contracts or with more than 2 years remaining", () => {
    render(<RosterDecisionBoard roster={makeRoster()} league={{}} />);
    expect(screen.queryByText("Long Deal Larry")).toBeNull();
    expect(screen.queryByText("No Contract Nick")).toBeNull();
  });

  it("includes players whose contracts expire within 2 seasons", () => {
    render(<RosterDecisionBoard roster={makeRoster()} league={{}} />);
    expect(screen.getByText("Cut Candidate")).toBeTruthy();
    expect(screen.getByText("No Meta Man")).toBeTruthy();
    // Real _resignMeta keys surface as Recommended Action / Risk.
    expect(screen.getByText("Expendable")).toBeTruthy();
    expect(screen.getByText("High")).toBeTruthy();
    // Contract column shows salary per year and years left.
    expect(screen.getByText(/\$8\.5M\/yr · 1y left/)).toBeTruthy();
  });

  it("renders '—' for missing _resignMeta without crashing", () => {
    render(<RosterDecisionBoard roster={makeRoster()} league={{}} />);
    const row = screen.getByTestId("decision-row-8");
    // Recommended Action and Risk both fall back to the em dash.
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("selecting Cut highlights the pill and marks the row pending (local state only)", () => {
    render(<RosterDecisionBoard roster={makeRoster()} league={{}} />);
    const row = screen.getByTestId("decision-row-7");
    expect(row.getAttribute("data-pending")).toBe("false");

    fireEvent.click(within(row).getByRole("button", { name: "Cut" }));

    expect(within(row).getByRole("button", { name: "Cut" }).getAttribute("aria-pressed")).toBe("true");
    expect(row.getAttribute("data-pending")).toBe("true");
    expect(row.className).toContain("roster-decision-board__row--pending");
    // Other rows stay untouched.
    expect(screen.getByTestId("decision-row-8").getAttribute("data-pending")).toBe("false");
  });

  it("Review Decisions builds a local dry-run summary and never calls onCommitDecisions", () => {
    const onCommitDecisions = vi.fn();
    render(
      <RosterDecisionBoard
        roster={makeRoster()}
        league={{ userTeamId: 1, seasonId: 2026 }}
        onCommitDecisions={onCommitDecisions}
      />,
    );

    // No summary before review, and the button enables as soon as decisions are pending.
    expect(screen.queryByTestId("decision-dry-run-summary")).toBeNull();
    const review = screen.getByRole("button", { name: "Review Decisions" });
    expect(review.disabled).toBe(true);
    fireEvent.click(within(screen.getByTestId("decision-row-7")).getByRole("button", { name: "Cut" }));
    fireEvent.click(within(screen.getByTestId("decision-row-8")).getByRole("button", { name: "Extend" }));
    expect(review.disabled).toBe(false);

    fireEvent.click(review);

    // Dry run only: the future real-commit prop is never invoked.
    expect(onCommitDecisions).not.toHaveBeenCalled();
    const summary = screen.getByTestId("decision-dry-run-summary");
    expect(within(summary).getByText(/Dry run only — nothing has been applied/)).toBeTruthy();
    expect(within(summary).getByText("Valid decisions (2)")).toBeTruthy();
    expect(within(summary).getByTestId("plan-valid-7").textContent).toContain("Cut Candidate");
    expect(within(summary).getByTestId("plan-valid-8").textContent).toContain("No Meta Man");
    // Both decisions were structurally valid → no invalid section rendered.
    expect(within(summary).queryByTestId("dry-run-invalid")).toBeNull();
  });

  it("dry-run summary shows valid and invalid decisions separately", () => {
    const roster = makeRoster();
    const { rerender } = render(<RosterDecisionBoard roster={roster} league={{}} />);

    fireEvent.click(within(screen.getByTestId("decision-row-7")).getByRole("button", { name: "Cut" }));
    fireEvent.click(within(screen.getByTestId("decision-row-8")).getByRole("button", { name: "Extend" }));

    // Player 7 leaves the roster while their pending decision survives in
    // local state — reviewing must now split the plan into valid + invalid.
    rerender(<RosterDecisionBoard roster={roster.filter((p) => p?.id !== 7)} league={{}} />);
    fireEvent.click(screen.getByRole("button", { name: "Review Decisions" }));

    const summary = screen.getByTestId("decision-dry-run-summary");
    expect(within(summary).getByText("Valid decisions (1)")).toBeTruthy();
    expect(within(summary).getByTestId("plan-valid-8").textContent).toContain("No Meta Man");
    expect(within(summary).getByText("Invalid decisions (1)")).toBeTruthy();
    expect(within(summary).getByTestId("plan-invalid-7").textContent).toContain("No roster player matches this ID.");
  });

  it("cut and franchise-tag entries surface warnings in the dry-run summary", () => {
    const roster = makeRoster();
    // Give the cut candidate a signing bonus so releasing them carries dead cap.
    roster[0] = { ...roster[0], contract: { ...roster[0].contract, yearsTotal: 4, signingBonus: 6 } };
    render(<RosterDecisionBoard roster={roster} league={{ phase: "regular" }} />);

    fireEvent.click(within(screen.getByTestId("decision-row-7")).getByRole("button", { name: "Cut" }));
    fireEvent.click(within(screen.getByTestId("decision-row-8")).getByRole("button", { name: "Franchise Tag" }));
    fireEvent.click(screen.getByRole("button", { name: "Review Decisions" }));

    const summary = screen.getByTestId("decision-dry-run-summary");
    expect(within(summary).getByTestId("plan-valid-7").textContent).toMatch(/dead cap/i);
    // No Meta Man has 2 years left → tag is blocked as not expiring now.
    expect(within(summary).getByTestId("plan-valid-8").textContent).toMatch(/not expiring/i);
  });

  it("changing or resetting decisions clears a stale dry-run summary", () => {
    render(<RosterDecisionBoard roster={makeRoster()} league={{}} />);
    const row = screen.getByTestId("decision-row-7");

    fireEvent.click(within(row).getByRole("button", { name: "Cut" }));
    fireEvent.click(screen.getByRole("button", { name: "Review Decisions" }));
    expect(screen.getByTestId("decision-dry-run-summary")).toBeTruthy();

    fireEvent.click(within(row).getByRole("button", { name: "Extend" }));
    expect(screen.queryByTestId("decision-dry-run-summary")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Review Decisions" }));
    expect(screen.getByTestId("decision-dry-run-summary")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.queryByTestId("decision-dry-run-summary")).toBeNull();
  });

  it("renders a missing-id row safely with a muted unavailable note", () => {
    render(<RosterDecisionBoard roster={makeRoster()} league={{}} />);
    const row = screen.getByText("No ID Ned").closest("tr");
    expect(row).toBeTruthy();
    expect(within(row).getByText("Decision unavailable: missing player ID.")).toBeTruthy();
  });

  it("disables decision pills for a missing-id row and clicking never marks it pending", () => {
    render(<RosterDecisionBoard roster={makeRoster()} league={{}} />);
    const row = screen.getByText("No ID Ned").closest("tr");

    for (const label of ["Extend", "Cut", "Franchise Tag", "Let Walk"]) {
      const pill = within(row).getByRole("button", { name: label });
      expect(pill.disabled).toBe(true);
      fireEvent.click(pill);
    }

    expect(row.getAttribute("data-pending")).toBe("false");
    expect(within(row).queryAllByRole("button", { pressed: true })).toHaveLength(0);
    // Rows with ids stay interactive.
    expect(within(screen.getByTestId("decision-row-7")).getByRole("button", { name: "Cut" }).disabled).toBe(false);
  });

  it("never includes missing-id rows in the dry-run commit plan", () => {
    render(<RosterDecisionBoard roster={makeRoster()} league={{}} />);

    const nedRow = screen.getByText("No ID Ned").closest("tr");
    fireEvent.click(within(nedRow).getByRole("button", { name: "Cut" }));
    fireEvent.click(within(screen.getByTestId("decision-row-7")).getByRole("button", { name: "Cut" }));
    fireEvent.click(screen.getByRole("button", { name: "Review Decisions" }));

    const summary = screen.getByTestId("decision-dry-run-summary");
    // Only the stable-id decision made it into the plan.
    expect(within(summary).getByText("Valid decisions (1)")).toBeTruthy();
    expect(within(summary).getByTestId("plan-valid-7")).toBeTruthy();
    expect(within(summary).queryByTestId("dry-run-invalid")).toBeNull();
    expect(summary.textContent).not.toContain("No ID Ned");
  });

  it("pending rows keep the background shift but the inset side-border style is gone", () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), "src/ui/styles/components.css"), "utf8");
    const pendingRule = css.match(/\.roster-decision-board__row--pending\s*\{[^}]*\}/);
    expect(pendingRule).toBeTruthy();
    expect(pendingRule[0]).toContain("background");
    expect(pendingRule[0]).not.toContain("box-shadow");
    expect(css).not.toContain("roster-decision-board__row--pending td:first-child");
  });

  it("works preview-only without onCommitDecisions and never mutates players or the league", () => {
    // Frozen players prove render + review never write to player objects.
    const roster = makeRoster().map((p) => (p ? Object.freeze(p) : p));
    const league = Object.freeze({ userTeamId: 1, seasonId: 2026 });
    render(<RosterDecisionBoard roster={roster} league={league} />);

    expect(screen.getByText(/Preview only/)).toBeTruthy();
    const review = screen.getByRole("button", { name: "Review Decisions" });
    expect(review.disabled).toBe(true);

    expect(() => {
      fireEvent.click(within(screen.getByTestId("decision-row-7")).getByRole("button", { name: "Cut" }));
      fireEvent.click(review);
    }).not.toThrow();

    // Reviewing rendered the dry-run summary without touching any state.
    expect(screen.getByTestId("decision-dry-run-summary")).toBeTruthy();
    expect(roster[0].extensionDecision).toBeUndefined();
    expect(roster[0].contract).toEqual({ years: 1, baseAnnual: 8.5 });
  });

  it("never renders the hiddenTrueOvr sentinel in the DOM", () => {
    const { container } = render(<RosterDecisionBoard roster={makeRoster()} league={{}} />);
    expect(container.innerHTML).not.toContain(String(SENTINEL_TRUE_OVR));
    expect(container.innerHTML).not.toContain("hiddenTrueOvr");
  });

  it("reuses the shared hiddenDevTrait reveal helper for badges instead of duplicating reveal logic", () => {
    render(<RosterDecisionBoard roster={makeRoster()} league={{ year: 2027 }} />);
    // The shared helper is consulted for every board row.
    expect(vi.mocked(getHiddenDevTraitLabel)).toHaveBeenCalled();
    // Revealed trait (3 completed seasons) shows the helper's label…
    expect(screen.getByText("Superstar")).toBeTruthy();
    // …while an unrevealed trait shows only the subtle hidden badge.
    expect(screen.getByText("Dev: Hidden")).toBeTruthy();
  });
});

describe("RosterHub Decision Board tab", () => {
  beforeEach(() => {
    global.IntersectionObserver = vi.fn(function () {
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    });
  });

  it("exposes a Decision Board tab that renders the board with the sanitized roster", () => {
    const league = {
      userTeamId: 1,
      seasonId: 2026,
      week: 3,
      teams: [{ id: 1, name: "Sharks", capRoom: 22, roster: makeRoster(), strategies: {} }],
    };
    render(<RosterHub league={league} actions={{}} onPlayerSelect={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Decision Board" }));

    expect(screen.getByTestId("roster-decision-board")).toBeTruthy();
    expect(screen.getByText("Cut Candidate")).toBeTruthy();
    expect(screen.queryByText("Long Deal Larry")).toBeNull();
    // Review stays disabled until a decision is pending; no commit wiring needed.
    expect(screen.getByRole("button", { name: "Review Decisions" }).disabled).toBe(true);
  });
});
