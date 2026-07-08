/**
 * rosterDecisionCommitExecution.test.js
 *
 * Execution adapter for reviewed Roster Decision Board commit plans. Verifies
 * the safety contract: blocking-error entries and extend decisions are always
 * skipped, only existing action handlers are called (with the exact
 * useWorker / ContractCenter signatures), missing handlers produce skipped
 * (never a throw), rejected action promises land in failed, and the plan
 * object is treated as read-only.
 */
import { describe, it, expect, vi } from "vitest";
import {
  executeRosterDecisionCommitPlan,
  countExecutableCommitPlanEntries,
  isExecutableCommitPlanEntry,
  EXTEND_SKIP_REASON,
} from "./rosterDecisionCommitExecution.js";

function makeEntry(overrides = {}) {
  return {
    playerId: "7",
    decision: "cut",
    playerName: "Cut Candidate",
    pos: "QB",
    contract: { yearsRemaining: 1, annualSalary: 8.5, deadCap: 0 },
    warnings: [],
    blockingErrors: [],
    ...overrides,
  };
}

function makePlan(valid, overrides = {}) {
  return {
    source: "roster_decision_board",
    version: 1,
    teamId: 1,
    season: 2026,
    valid,
    invalid: [],
    ...overrides,
  };
}

function makeActions(overrides = {}) {
  return {
    releasePlayer: vi.fn(() => undefined), // send-based: returns undefined
    applyFranchiseTag: vi.fn(async () => ({ type: "STATE_UPDATE" })),
    updatePlayerManagement: vi.fn(async () => ({ type: "STATE_UPDATE" })),
    ...overrides,
  };
}

describe("executeRosterDecisionCommitPlan", () => {
  it("skips entries with blockingErrors without calling any handler", async () => {
    const actions = makeActions();
    const plan = makePlan([
      makeEntry({
        playerId: "8",
        decision: "franchise_tag",
        blockingErrors: ["Franchise tag unavailable: contract has 2 years remaining and is not expiring now."],
      }),
    ]);

    const result = await executeRosterDecisionCommitPlan({ plan, actions });

    expect(result.applied).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({ playerId: "8", decision: "franchise_tag" });
    expect(result.skipped[0].reason).toContain("blocked by dry-run validation");
    expect(result.skipped[0].reason).toContain("not expiring now");
    expect(actions.releasePlayer).not.toHaveBeenCalled();
    expect(actions.applyFranchiseTag).not.toHaveBeenCalled();
    expect(actions.updatePlayerManagement).not.toHaveBeenCalled();
  });

  it("always skips extend with the contract-terms reason", async () => {
    const actions = makeActions();
    const plan = makePlan([makeEntry({ decision: "extend" })]);

    const result = await executeRosterDecisionCommitPlan({ plan, actions });

    expect(result.skipped).toEqual([
      { playerId: "7", decision: "extend", reason: EXTEND_SKIP_REASON },
    ]);
    expect(result.applied).toHaveLength(0);
    expect(actions.applyFranchiseTag).not.toHaveBeenCalled();
    expect(actions.updatePlayerManagement).not.toHaveBeenCalled();
  });

  it("calls the release action with (playerId, teamId) for an executable cut", async () => {
    const actions = makeActions();
    const plan = makePlan([makeEntry({ decision: "cut" })]);

    const result = await executeRosterDecisionCommitPlan({ plan, actions });

    expect(actions.releasePlayer).toHaveBeenCalledTimes(1);
    expect(actions.releasePlayer).toHaveBeenCalledWith("7", 1);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]).toMatchObject({ playerId: "7", decision: "cut" });
    expect(result.skipped).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it("fire-and-forget release copy says dispatched/submitted, never confirmed success", async () => {
    // releasePlayer is send-based (returns undefined) — worker-side success is
    // unobservable here, so the message must only claim dispatch.
    const actions = makeActions();
    const plan = makePlan([makeEntry({ decision: "cut" })]);

    const result = await executeRosterDecisionCommitPlan({ plan, actions });

    const message = result.applied[0].message;
    expect(message).toMatch(/dispatched|submitted/i);
    expect(message).not.toMatch(/confirmed|succeeded|successfully|was applied/i);
  });

  it("calls applyFranchiseTag only for executable tag entries", async () => {
    const actions = makeActions();
    const plan = makePlan([
      makeEntry({ playerId: "5", decision: "franchise_tag" }),
      makeEntry({ playerId: "8", decision: "franchise_tag", blockingErrors: ["Not expiring."] }),
    ]);

    const result = await executeRosterDecisionCommitPlan({ plan, actions });

    expect(actions.applyFranchiseTag).toHaveBeenCalledTimes(1);
    expect(actions.applyFranchiseTag).toHaveBeenCalledWith("5", 1);
    expect(result.applied.map((e) => e.playerId)).toEqual(["5"]);
    expect(result.skipped.map((e) => e.playerId)).toEqual(["8"]);
  });

  it("marks let_walk intent via updatePlayerManagement without removing the player", async () => {
    const actions = makeActions();
    const plan = makePlan([makeEntry({ decision: "let_walk" })]);

    const result = await executeRosterDecisionCommitPlan({ plan, actions });

    // Exact ContractCenter intent signature.
    expect(actions.updatePlayerManagement).toHaveBeenCalledTimes(1);
    expect(actions.updatePlayerManagement).toHaveBeenCalledWith("7", 1, { extensionDecision: "let_walk" });
    // Intent only — the release handler is never involved.
    expect(actions.releasePlayer).not.toHaveBeenCalled();
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].message).toMatch(/intent only/i);
  });

  it("missing handlers produce skipped, never a throw", async () => {
    const plan = makePlan([
      makeEntry({ playerId: "1", decision: "cut" }),
      makeEntry({ playerId: "2", decision: "franchise_tag" }),
      makeEntry({ playerId: "3", decision: "let_walk" }),
    ]);

    const result = await executeRosterDecisionCommitPlan({ plan, actions: {} });

    expect(result.applied).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(result.skipped).toHaveLength(3);
    for (const item of result.skipped) {
      expect(item.reason).toMatch(/no .* action handler is available/i);
    }
  });

  it("handles a completely missing actions object as skipped", async () => {
    const plan = makePlan([makeEntry({ decision: "cut" })]);
    const result = await executeRosterDecisionCommitPlan({ plan });
    expect(result.skipped).toHaveLength(1);
    expect(result.applied).toHaveLength(0);
  });

  it("skips unsupported decision keys with a clear reason", async () => {
    const actions = makeActions();
    const plan = makePlan([makeEntry({ decision: "trade" })]);

    const result = await executeRosterDecisionCommitPlan({ plan, actions });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('no execution mapping exists for decision "trade"');
  });

  it("skips executable entries when the plan has no teamId", async () => {
    const actions = makeActions();
    const plan = makePlan([makeEntry({ decision: "cut" })], { teamId: null });

    const result = await executeRosterDecisionCommitPlan({ plan, actions });

    expect(actions.releasePlayer).not.toHaveBeenCalled();
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/missing the player or team ID/i);
  });

  it("a rejected action promise lands the entry in failed and continues", async () => {
    const actions = makeActions({
      applyFranchiseTag: vi.fn(async () => {
        throw new Error("Franchise tag can only be applied during re-signing phase.");
      }),
    });
    const plan = makePlan([
      makeEntry({ playerId: "5", decision: "franchise_tag" }),
      makeEntry({ playerId: "7", decision: "cut" }),
    ]);

    const result = await executeRosterDecisionCommitPlan({ plan, actions });

    expect(result.failed).toEqual([
      {
        playerId: "5",
        decision: "franchise_tag",
        reason: "Franchise tag can only be applied during re-signing phase.",
      },
    ]);
    // Execution continues past the failure.
    expect(result.applied.map((e) => e.playerId)).toEqual(["7"]);
  });

  it("processes valid[] only — invalid entries never reach a handler", async () => {
    const actions = makeActions();
    const plan = makePlan([], {
      invalid: [{ playerId: "99", decision: "cut", reason: "No roster player matches this ID." }],
    });

    const result = await executeRosterDecisionCommitPlan({ plan, actions });

    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(actions.releasePlayer).not.toHaveBeenCalled();
  });

  it("never mutates the plan object", async () => {
    const actions = makeActions();
    const entryA = makeEntry({ playerId: "5", decision: "franchise_tag" });
    const entryB = makeEntry({ playerId: "7", decision: "extend" });
    const plan = makePlan([entryA, entryB]);
    Object.freeze(plan);
    Object.freeze(plan.valid);
    Object.freeze(plan.invalid);
    Object.freeze(entryA);
    Object.freeze(entryA.blockingErrors);
    Object.freeze(entryB);
    const snapshot = JSON.parse(JSON.stringify(plan));

    await expect(executeRosterDecisionCommitPlan({ plan, actions })).resolves.toBeTruthy();
    expect(JSON.parse(JSON.stringify(plan))).toEqual(snapshot);
  });

  it("returns empty buckets for malformed plans without throwing", async () => {
    for (const plan of [null, undefined, {}, { valid: "nope" }]) {
      const result = await executeRosterDecisionCommitPlan({ plan, actions: makeActions() });
      expect(result).toEqual({ applied: [], skipped: [], failed: [] });
    }
  });
});

describe("executable-entry helpers", () => {
  it("isExecutableCommitPlanEntry requires empty blockingErrors and a non-extend decision", () => {
    expect(isExecutableCommitPlanEntry(makeEntry({ decision: "cut" }))).toBe(true);
    expect(isExecutableCommitPlanEntry(makeEntry({ decision: "let_walk" }))).toBe(true);
    expect(isExecutableCommitPlanEntry(makeEntry({ decision: "extend" }))).toBe(false);
    expect(isExecutableCommitPlanEntry(makeEntry({ blockingErrors: ["blocked"] }))).toBe(false);
    expect(isExecutableCommitPlanEntry(makeEntry({ blockingErrors: undefined }))).toBe(false);
    expect(isExecutableCommitPlanEntry(null)).toBe(false);
  });

  it("countExecutableCommitPlanEntries counts only executable valid entries", () => {
    const plan = makePlan([
      makeEntry({ playerId: "1", decision: "cut" }),
      makeEntry({ playerId: "2", decision: "extend" }),
      makeEntry({ playerId: "3", decision: "franchise_tag", blockingErrors: ["blocked"] }),
    ]);
    expect(countExecutableCommitPlanEntries(plan)).toBe(1);
    expect(countExecutableCommitPlanEntries(null)).toBe(0);
    expect(countExecutableCommitPlanEntries({})).toBe(0);
  });
});
