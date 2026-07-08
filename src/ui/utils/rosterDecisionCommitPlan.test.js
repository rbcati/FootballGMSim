/**
 * rosterDecisionCommitPlan.test.js
 *
 * Dry-run commit plan builder for the Roster Decision Board. Pure-function
 * contract: valid entries carry contract context + warnings/blockingErrors,
 * structural failures (missing player, unsupported decision, missing roster)
 * land in `invalid`, malformed input degrades to an empty plan, and no input
 * object is ever mutated.
 */
import { describe, it, expect } from "vitest";
import { buildRosterDecisionCommitPlan, ROSTER_DECISION_KEYS } from "./rosterDecisionCommitPlan.js";

const LEAGUE = { userTeamId: 3, seasonId: 2027, phase: "offseason_resign" };

function makeRoster() {
  return [
    {
      id: 7,
      name: "Cut Candidate",
      pos: "QB",
      contract: { years: 1, yearsTotal: 4, baseAnnual: 8.5, signingBonus: 6 },
    },
    {
      id: 8,
      name: "Clean Cut",
      pos: "WR",
      contract: { years: 1, baseAnnual: 3.2 },
    },
    {
      id: 9,
      name: "Long Deal Larry",
      pos: "OL",
      contract: { years: 2, baseAnnual: 6.4 },
    },
    {
      id: 10,
      name: "No Contract Nick",
      pos: "CB",
    },
  ];
}

describe("buildRosterDecisionCommitPlan", () => {
  it("produces a valid commit plan with the documented shape for a valid payload", () => {
    const plan = buildRosterDecisionCommitPlan({
      decisions: { 7: "extend", 8: "cut" },
      roster: makeRoster(),
      league: LEAGUE,
    });

    expect(plan.source).toBe("roster_decision_board");
    expect(plan.version).toBe(1);
    expect(plan.teamId).toBe(3);
    expect(plan.season).toBe(2027);
    expect(plan.invalid).toEqual([]);
    expect(plan.valid).toHaveLength(2);

    const extend = plan.valid.find((e) => e.decision === "extend");
    expect(extend).toMatchObject({
      playerId: "7",
      playerName: "Cut Candidate",
      pos: "QB",
      contract: { yearsRemaining: 1, annualSalary: 8.5 },
      blockingErrors: [],
    });
    // extendContract handler exists (audit) → no missing-handler warning.
    expect(extend.warnings).toEqual([]);
  });

  it("falls back to league.year for season and null team/season when league is missing", () => {
    expect(buildRosterDecisionCommitPlan({ decisions: {}, roster: [], league: { year: 2031 } }).season).toBe(2031);
    const plan = buildRosterDecisionCommitPlan({ decisions: { 7: "cut" }, roster: makeRoster() });
    expect(plan.teamId).toBeNull();
    expect(plan.season).toBeNull();
    expect(plan.valid).toHaveLength(1); // missing league never throws or invalidates
  });

  it("marks a player ID that matches no roster player as invalid", () => {
    const plan = buildRosterDecisionCommitPlan({
      decisions: { 999: "cut", 7: "cut" },
      roster: makeRoster(),
      league: LEAGUE,
    });
    expect(plan.valid.map((e) => e.playerId)).toEqual(["7"]);
    expect(plan.invalid).toEqual([
      { playerId: "999", decision: "cut", reason: "No roster player matches this ID." },
    ]);
  });

  it("marks unsupported decisions as invalid", () => {
    const plan = buildRosterDecisionCommitPlan({
      decisions: { 7: "trade", 8: null, 9: 42 },
      roster: makeRoster(),
      league: LEAGUE,
    });
    expect(plan.valid).toEqual([]);
    expect(plan.invalid).toHaveLength(3);
    expect(plan.invalid[0]).toEqual({ playerId: "7", decision: "trade", reason: 'Unsupported decision "trade".' });
  });

  it("returns an empty plan for a missing or malformed decisions map", () => {
    for (const decisions of [undefined, null, "cut", 42, ["cut"]]) {
      const plan = buildRosterDecisionCommitPlan({ decisions, roster: makeRoster(), league: LEAGUE });
      expect(plan.valid).toEqual([]);
      expect(plan.invalid).toEqual([]);
    }
  });

  it("returns invalid entries for every supplied decision when the roster is missing", () => {
    const plan = buildRosterDecisionCommitPlan({
      decisions: { 7: "extend", 8: "cut" },
      roster: undefined,
      league: LEAGUE,
    });
    expect(plan.valid).toEqual([]);
    expect(plan.invalid).toEqual([
      { playerId: "7", decision: "extend", reason: "Roster data unavailable — cannot match player." },
      { playerId: "8", decision: "cut", reason: "Roster data unavailable — cannot match player." },
    ]);
  });

  it("cut warns when dead-cap data exists and is non-zero, stays quiet otherwise", () => {
    const plan = buildRosterDecisionCommitPlan({
      decisions: { 7: "cut", 8: "cut" },
      roster: makeRoster(),
      league: LEAGUE,
    });
    const withBonus = plan.valid.find((e) => e.playerId === "7");
    const withoutBonus = plan.valid.find((e) => e.playerId === "8");
    // 6M bonus / 4 yearsTotal × 1 year remaining = 1.5M dead cap.
    expect(withBonus.contract.deadCap).toBe(1.5);
    expect(withBonus.warnings.some((w) => /dead cap/i.test(w))).toBe(true);
    expect(withBonus.blockingErrors).toEqual([]);
    expect(withoutBonus.contract.deadCap).toBe(0);
    expect(withoutBonus.warnings).toEqual([]);
  });

  it("franchise_tag blocks a player who is not expiring now", () => {
    const plan = buildRosterDecisionCommitPlan({
      decisions: { 9: "franchise_tag" },
      roster: makeRoster(),
      league: LEAGUE,
    });
    const entry = plan.valid[0];
    expect(entry.blockingErrors).toHaveLength(1);
    expect(entry.blockingErrors[0]).toMatch(/not expiring/i);
  });

  it("franchise_tag on an expiring player is valid during the re-signing phase, warns outside it", () => {
    const expiring = buildRosterDecisionCommitPlan({
      decisions: { 7: "franchise_tag" },
      roster: makeRoster(),
      league: LEAGUE,
    }).valid[0];
    expect(expiring.blockingErrors).toEqual([]);
    expect(expiring.warnings).toEqual([]);

    const wrongPhase = buildRosterDecisionCommitPlan({
      decisions: { 7: "franchise_tag" },
      roster: makeRoster(),
      league: { ...LEAGUE, phase: "regular" },
    }).valid[0];
    expect(wrongPhase.blockingErrors).toEqual([]);
    expect(wrongPhase.warnings.some((w) => /re-signing phase/i.test(w))).toBe(true);
  });

  it("franchise_tag warns instead of guessing when availability cannot be determined", () => {
    // No contract → expiration unknown.
    const noContract = buildRosterDecisionCommitPlan({
      decisions: { 10: "franchise_tag" },
      roster: makeRoster(),
      league: LEAGUE,
    }).valid[0];
    expect(noContract.blockingErrors).toEqual([]);
    expect(noContract.warnings.some((w) => /could not be determined/i.test(w))).toBe(true);

    // Expiring player but league phase unknown.
    const noPhase = buildRosterDecisionCommitPlan({
      decisions: { 7: "franchise_tag" },
      roster: makeRoster(),
      league: { userTeamId: 3, seasonId: 2027 },
    }).valid[0];
    expect(noPhase.blockingErrors).toEqual([]);
    expect(noPhase.warnings.some((w) => /could not be verified/i.test(w))).toBe(true);
  });

  it("let_walk is valid but flagged as a planning-only note", () => {
    const plan = buildRosterDecisionCommitPlan({
      decisions: { 7: "let_walk" },
      roster: makeRoster(),
      league: LEAGUE,
    });
    const entry = plan.valid[0];
    expect(entry.blockingErrors).toEqual([]);
    expect(entry.warnings.some((w) => /planning note only/i.test(w))).toBe(true);
  });

  it("clear_let_walk is valid and flagged as clearing the saved intent (no roster change)", () => {
    const plan = buildRosterDecisionCommitPlan({
      decisions: { 7: "clear_let_walk" },
      roster: makeRoster(),
      league: LEAGUE,
    });
    const entry = plan.valid[0];
    expect(entry).toMatchObject({ playerId: "7", decision: "clear_let_walk" });
    expect(entry.blockingErrors).toEqual([]);
    expect(entry.warnings.some((w) => /clears the saved let-walk intent/i.test(w))).toBe(true);
    expect(entry.warnings.some((w) => /no roster change/i.test(w))).toBe(true);
  });

  it("never mutates decisions, roster, players, or league", () => {
    const roster = makeRoster().map((p) => Object.freeze({ ...p, contract: p.contract ? Object.freeze({ ...p.contract }) : undefined }));
    Object.freeze(roster);
    const decisions = Object.freeze({ 7: "cut", 8: "franchise_tag", 9: "extend", 999: "let_walk", 10: "bogus" });
    const league = Object.freeze({ ...LEAGUE });

    const before = JSON.stringify({ roster, decisions, league });
    expect(() => buildRosterDecisionCommitPlan({ decisions, roster, league })).not.toThrow();
    expect(JSON.stringify({ roster, decisions, league })).toBe(before);
  });

  it("exposes exactly the five supported decision keys", () => {
    expect([...ROSTER_DECISION_KEYS]).toEqual([
      "extend",
      "cut",
      "franchise_tag",
      "let_walk",
      "clear_let_walk",
    ]);
  });
});
