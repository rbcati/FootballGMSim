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

describe("RosterDecisionBoard commit execution", () => {
  const league = { userTeamId: 1, seasonId: 2026 };

  function makeActions(overrides = {}) {
    return {
      releasePlayer: vi.fn(() => undefined),
      applyFranchiseTag: vi.fn(async () => ({ type: "STATE_UPDATE" })),
      updatePlayerManagement: vi.fn(async () => ({ type: "STATE_UPDATE" })),
      ...overrides,
    };
  }

  it("shows Apply Executable Decisions only after a dry-run with executable entries", () => {
    render(<RosterDecisionBoard roster={makeRoster()} league={league} actions={makeActions()} />);

    // No apply button before any review.
    expect(screen.queryByRole("button", { name: /Apply Executable Decisions/ })).toBeNull();

    // A plan whose only entry is extend has nothing executable.
    const row7 = screen.getByTestId("decision-row-7");
    fireEvent.click(within(row7).getByRole("button", { name: "Extend" }));
    fireEvent.click(screen.getByRole("button", { name: "Review Decisions" }));
    expect(screen.getByTestId("decision-dry-run-summary")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Apply Executable Decisions/ })).toBeNull();

    // Switching to an executable decision and re-reviewing surfaces the button.
    fireEvent.click(within(row7).getByRole("button", { name: "Cut" }));
    fireEvent.click(screen.getByRole("button", { name: "Review Decisions" }));
    expect(screen.getByRole("button", { name: /Apply Executable Decisions \(1\)/ })).toBeTruthy();
  });

  it("applies executable entries, renders Applied/Skipped/Failed, and prunes only applied decisions", async () => {
    const actions = makeActions();
    render(<RosterDecisionBoard roster={makeRoster()} league={league} actions={actions} />);

    // Row 7 (1y left): executable cut. Row 8 (2y left): tag is blocked by the dry-run.
    fireEvent.click(within(screen.getByTestId("decision-row-7")).getByRole("button", { name: "Cut" }));
    fireEvent.click(within(screen.getByTestId("decision-row-8")).getByRole("button", { name: "Franchise Tag" }));
    fireEvent.click(screen.getByRole("button", { name: "Review Decisions" }));

    // Pending decisions survive the review; nothing is cleared before results.
    expect(screen.getByTestId("decision-row-7").getAttribute("data-pending")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Apply Executable Decisions \(1\)/ }));

    const results = await screen.findByTestId("decision-execution-result");
    expect(actions.releasePlayer).toHaveBeenCalledTimes(1);
    expect(actions.releasePlayer).toHaveBeenCalledWith("7", 1);
    expect(actions.applyFranchiseTag).not.toHaveBeenCalled();

    // Three sections, with skipped explicitly marked as not applied. The
    // results section is an aria-live region so screen readers announce the
    // asynchronously rendered outcome.
    expect(results.getAttribute("aria-live")).toBe("polite");
    expect(results.getAttribute("aria-label")).toBe("Execution results");
    expect(within(results).getByText("Applied / Dispatched (1)")).toBeTruthy();
    expect(within(results).getByText("Skipped (not applied) (1)")).toBeTruthy();
    expect(within(results).getByText("Failed (0)")).toBeTruthy();
    expect(within(results).getByText(/were NOT applied/)).toBeTruthy();
    // Fire-and-forget release: the copy claims dispatch, never confirmed success.
    const releaseEntry = within(results).getByTestId("execution-applied-7").textContent;
    expect(releaseEntry).toContain("Cut Candidate");
    expect(releaseEntry).toMatch(/dispatched|submitted/i);
    expect(releaseEntry).not.toMatch(/confirmed|succeeded|successfully/i);
    expect(within(results).getByTestId("execution-skipped-8").textContent).toContain("No Meta Man");

    // Only the applied decision leaves local pending state.
    expect(screen.getByTestId("decision-row-7").getAttribute("data-pending")).toBe("false");
    expect(screen.getByTestId("decision-row-8").getAttribute("data-pending")).toBe("true");
    expect(screen.getByText(/1 pending decision\b/)).toBeTruthy();
    // The apply button is gone until the plan is re-reviewed.
    expect(screen.queryByRole("button", { name: /Apply Executable Decisions/ })).toBeNull();
  });

  it("a stale plan cannot be applied twice — double-click and post-result re-apply both no-op", async () => {
    const actions = makeActions();
    render(<RosterDecisionBoard roster={makeRoster()} league={league} actions={actions} />);

    fireEvent.click(within(screen.getByTestId("decision-row-7")).getByRole("button", { name: "Cut" }));
    fireEvent.click(screen.getByRole("button", { name: "Review Decisions" }));

    const apply = screen.getByRole("button", { name: /Apply Executable Decisions \(1\)/ });
    // Two clicks in the same tick, before the isExecuting re-render lands —
    // the re-entrancy guard must collapse them into a single execution.
    fireEvent.click(apply);
    fireEvent.click(apply);

    await screen.findByTestId("decision-execution-result");
    expect(actions.releasePlayer).toHaveBeenCalledTimes(1);

    // Once results exist, the stale plan's apply button is unmounted; clicking
    // the detached element must not execute again either.
    expect(screen.queryByRole("button", { name: /Apply Executable Decisions/ })).toBeNull();
    fireEvent.click(apply);
    await Promise.resolve();
    expect(actions.releasePlayer).toHaveBeenCalledTimes(1);
    // The reviewed plan stays visible as a record, alongside the results.
    expect(screen.getByTestId("decision-dry-run-summary")).toBeTruthy();
    expect(screen.getByTestId("decision-execution-result")).toBeTruthy();
  });

  it("a rejected action lands in Failed and the decision stays pending", async () => {
    const actions = makeActions({
      updatePlayerManagement: vi.fn(async () => {
        throw new Error("Player is not on the selected team");
      }),
    });
    render(<RosterDecisionBoard roster={makeRoster()} league={league} actions={actions} />);

    fireEvent.click(within(screen.getByTestId("decision-row-7")).getByRole("button", { name: "Let Walk" }));
    fireEvent.click(screen.getByRole("button", { name: "Review Decisions" }));
    fireEvent.click(screen.getByRole("button", { name: /Apply Executable Decisions \(1\)/ }));

    const results = await screen.findByTestId("decision-execution-result");
    expect(within(results).getByText("Failed (1)")).toBeTruthy();
    expect(within(results).getByTestId("execution-failed-7").textContent)
      .toContain("Player is not on the selected team");
    expect(within(results).getByText("Applied / Dispatched (0)")).toBeTruthy();
    // Failed decisions remain pending for user adjustment.
    expect(screen.getByTestId("decision-row-7").getAttribute("data-pending")).toBe("true");
  });

  it("without an actions prop, applying reports every entry as skipped and mutates nothing", async () => {
    const roster = makeRoster().map((p) => (p ? Object.freeze(p) : p));
    render(<RosterDecisionBoard roster={roster} league={Object.freeze({ ...league })} />);

    fireEvent.click(within(screen.getByTestId("decision-row-7")).getByRole("button", { name: "Cut" }));
    fireEvent.click(screen.getByRole("button", { name: "Review Decisions" }));
    fireEvent.click(screen.getByRole("button", { name: /Apply Executable Decisions \(1\)/ }));

    const results = await screen.findByTestId("decision-execution-result");
    expect(within(results).getByText("Applied / Dispatched (0)")).toBeTruthy();
    expect(within(results).getByText("Skipped (not applied) (1)")).toBeTruthy();
    expect(screen.getByTestId("decision-row-7").getAttribute("data-pending")).toBe("true");
    expect(roster[0].contract).toEqual({ years: 1, baseAnnual: 8.5 });
  });

  it("changing a decision clears stale execution results along with the plan", async () => {
    render(<RosterDecisionBoard roster={makeRoster()} league={league} actions={makeActions()} />);
    const row7 = screen.getByTestId("decision-row-7");

    fireEvent.click(within(row7).getByRole("button", { name: "Let Walk" }));
    fireEvent.click(screen.getByRole("button", { name: "Review Decisions" }));
    fireEvent.click(screen.getByRole("button", { name: /Apply Executable Decisions \(1\)/ }));
    await screen.findByTestId("decision-execution-result");

    fireEvent.click(within(row7).getByRole("button", { name: "Cut" }));
    expect(screen.queryByTestId("decision-execution-result")).toBeNull();
    expect(screen.queryByTestId("decision-dry-run-summary")).toBeNull();
  });
});

describe("RosterDecisionBoard durable let-walk intent", () => {
  const league = { userTeamId: 1, seasonId: 2026 };

  function makeActions(overrides = {}) {
    return {
      releasePlayer: vi.fn(() => undefined),
      applyFranchiseTag: vi.fn(async () => ({ type: "STATE_UPDATE" })),
      updatePlayerManagement: vi.fn(async () => ({ type: "STATE_UPDATE" })),
      ...overrides,
    };
  }

  // Player 7 (1y left) carries a persisted let-walk intent from a previous
  // session / Contract Center.
  function makePersistedRoster() {
    const roster = makeRoster();
    roster[0] = { ...roster[0], extensionDecision: "let_walk" };
    return roster;
  }

  it("pre-populates let_walk from player.extensionDecision on mount", () => {
    render(<RosterDecisionBoard roster={makePersistedRoster()} league={league} actions={makeActions()} />);

    const row = screen.getByTestId("decision-row-7");
    expect(row.getAttribute("data-pending")).toBe("true");
    expect(within(row).getByRole("button", { name: "Let Walk" }).getAttribute("aria-pressed")).toBe("true");
    // Players without persisted intent stay untouched.
    expect(screen.getByTestId("decision-row-8").getAttribute("data-pending")).toBe("false");
  });

  it("pre-populates ONLY let_walk — other persisted extensionDecision values are ignored", () => {
    const roster = makeRoster();
    roster[0] = { ...roster[0], extensionDecision: "deferred" };
    roster[1] = { ...roster[1], extensionDecision: "tagged" };
    render(<RosterDecisionBoard roster={roster} league={league} actions={makeActions()} />);

    expect(screen.getByTestId("decision-row-7").getAttribute("data-pending")).toBe("false");
    expect(screen.getByTestId("decision-row-8").getAttribute("data-pending")).toBe("false");
  });

  it("a roster sync arriving before any interaction still pre-populates", () => {
    const { rerender } = render(<RosterDecisionBoard roster={makeRoster()} league={league} actions={makeActions()} />);
    expect(screen.getByTestId("decision-row-7").getAttribute("data-pending")).toBe("false");

    rerender(<RosterDecisionBoard roster={makePersistedRoster()} league={league} actions={makeActions()} />);

    const row = screen.getByTestId("decision-row-7");
    expect(row.getAttribute("data-pending")).toBe("true");
    expect(within(row).getByRole("button", { name: "Let Walk" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("pre-population never overwrites a user edit made this session", () => {
    const { rerender } = render(<RosterDecisionBoard roster={makeRoster()} league={league} actions={makeActions()} />);
    fireEvent.click(within(screen.getByTestId("decision-row-7")).getByRole("button", { name: "Cut" }));

    // A fresh roster sync now carries a persisted let-walk for the same player.
    rerender(<RosterDecisionBoard roster={makePersistedRoster()} league={league} actions={makeActions()} />);

    const row = screen.getByTestId("decision-row-7");
    expect(within(row).getByRole("button", { name: "Cut" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(row).getByRole("button", { name: "Let Walk" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("toggling off a pre-populated let_walk becomes a pending clear intent without calling the worker", () => {
    const actions = makeActions();
    render(<RosterDecisionBoard roster={makePersistedRoster()} league={league} actions={actions} />);

    const row = screen.getByTestId("decision-row-7");
    fireEvent.click(within(row).getByRole("button", { name: "Let Walk" }));

    // Still pending — as a clear intent: no pill pressed, muted note shown.
    expect(row.getAttribute("data-pending")).toBe("true");
    expect(within(row).queryAllByRole("button", { pressed: true })).toHaveLength(0);
    expect(within(row).getByText(/clears the saved Let Walk intent/i)).toBeTruthy();
    // Clear-intent rule: a pill toggle never reaches the worker directly.
    expect(actions.updatePlayerManagement).not.toHaveBeenCalled();
    expect(actions.releasePlayer).not.toHaveBeenCalled();
  });

  it("the pending clear intent flows through Review/Apply and calls updatePlayerManagement with null", async () => {
    const actions = makeActions();
    render(<RosterDecisionBoard roster={makePersistedRoster()} league={league} actions={actions} />);

    fireEvent.click(within(screen.getByTestId("decision-row-7")).getByRole("button", { name: "Let Walk" }));
    fireEvent.click(screen.getByRole("button", { name: "Review Decisions" }));

    const summary = screen.getByTestId("decision-dry-run-summary");
    expect(within(summary).getByTestId("plan-valid-7").textContent).toContain("Clear Let Walk");
    expect(actions.updatePlayerManagement).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Apply Executable Decisions \(1\)/ }));
    await screen.findByTestId("decision-execution-result");

    expect(actions.updatePlayerManagement).toHaveBeenCalledTimes(1);
    expect(actions.updatePlayerManagement).toHaveBeenCalledWith("7", 1, { extensionDecision: null });
  });

  it("a pre-populated let_walk reviews and applies identically to a user-entered one", async () => {
    const actions = makeActions();
    render(<RosterDecisionBoard roster={makePersistedRoster()} league={league} actions={actions} />);

    // No pill click at all — straight from pre-population to review/apply.
    fireEvent.click(screen.getByRole("button", { name: "Review Decisions" }));
    const summary = screen.getByTestId("decision-dry-run-summary");
    expect(within(summary).getByTestId("plan-valid-7").textContent).toContain("Let Walk");

    fireEvent.click(screen.getByRole("button", { name: /Apply Executable Decisions \(1\)/ }));
    await screen.findByTestId("decision-execution-result");

    // Exact same handler + payload as the user-entered let_walk path.
    expect(actions.updatePlayerManagement).toHaveBeenCalledTimes(1);
    expect(actions.updatePlayerManagement).toHaveBeenCalledWith("7", 1, { extensionDecision: "let_walk" });
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
