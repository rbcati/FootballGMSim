/** @vitest-environment jsdom */
/**
 * RosterDecisionBoard.test.jsx
 *
 * Roster Decision Board V2: expiring-contract triage table with local
 * pending-decision state. Verifies the expiring window filter, safe
 * `_resignMeta` fallbacks, local-only decision pills, the preview-only
 * commit path, reuse of the hidden dev-trait reveal helper, and that the
 * hiddenTrueOvr sentinel never reaches the DOM.
 */
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

  it("Commit Decisions calls onCommitDecisions with the local decisions map", () => {
    const onCommitDecisions = vi.fn();
    render(<RosterDecisionBoard roster={makeRoster()} league={{}} onCommitDecisions={onCommitDecisions} />);

    fireEvent.click(within(screen.getByTestId("decision-row-7")).getByRole("button", { name: "Cut" }));
    fireEvent.click(within(screen.getByTestId("decision-row-8")).getByRole("button", { name: "Extend" }));
    fireEvent.click(screen.getByRole("button", { name: "Commit Decisions" }));

    expect(onCommitDecisions).toHaveBeenCalledTimes(1);
    expect(onCommitDecisions).toHaveBeenCalledWith({ 7: "cut", 8: "extend" });
  });

  it("without onCommitDecisions the commit button is disabled, shows preview state, and never mutates players", () => {
    // Frozen players prove render + interaction never write to player objects.
    const roster = makeRoster().map((p) => (p ? Object.freeze(p) : p));
    render(<RosterDecisionBoard roster={roster} league={{}} />);

    const commit = screen.getByRole("button", { name: "Commit Decisions" });
    expect(commit.disabled).toBe(true);
    expect(screen.getByText(/Preview only/)).toBeTruthy();

    expect(() => {
      fireEvent.click(within(screen.getByTestId("decision-row-7")).getByRole("button", { name: "Cut" }));
      fireEvent.click(commit);
    }).not.toThrow();
    expect(roster[0].extensionDecision).toBeUndefined();
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
    // RosterHub has no safe batch-commit action yet → preview-only.
    expect(screen.getByRole("button", { name: "Commit Decisions" }).disabled).toBe(true);
  });
});
