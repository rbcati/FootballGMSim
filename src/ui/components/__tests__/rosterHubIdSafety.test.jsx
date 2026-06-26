/** @vitest-environment jsdom */
/**
 * rosterHubIdSafety.test.jsx
 *
 * Integration regression for the Roster Hub crash
 *   "(e.id ?? \"x\").split is not a function"
 *
 * Opens the real RosterHub (default "cards" view → PlayerCardGrid) with a team
 * whose roster carries numeric / missing / object ids and a null row. The hub
 * must render without throwing and surface the well-formed players.
 */
import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RosterHub from "../RosterHub.jsx";

beforeEach(() => {
  global.IntersectionObserver = vi.fn(function () {
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  });
});

function makeLeague(roster) {
  return {
    userTeamId: 1,
    seasonId: 2026,
    week: 3,
    teams: [{ id: 1, name: "Sharks", abbr: "SHK", capRoom: 22, roster, strategies: {} }],
  };
}

describe("RosterHub id safety (split crash regression, integration)", () => {
  it("renders the cards view without crashing on malformed roster ids", () => {
    const roster = [
      { id: 7, name: "Numeric Id", pos: "QB", ovr: 82, age: 26 },
      { id: undefined, name: "Missing Id", pos: "WR", ovr: 78, age: 24 },
      { id: { weird: true }, name: "Object Id", pos: "RB", ovr: 80, age: 25 },
      null, // malformed row
      { id: "good-str", name: "String Id", pos: "TE", ovr: 75, age: 28 },
    ];
    expect(() =>
      render(<RosterHub league={makeLeague(roster)} actions={{}} onPlayerSelect={() => {}} />),
    ).not.toThrow();

    expect(screen.getByText("Numeric Id")).toBeTruthy();
    expect(screen.getByText("Missing Id")).toBeTruthy();
    expect(screen.getByText("Object Id")).toBeTruthy();
    expect(screen.getByText("String Id")).toBeTruthy();
  });

  it("renders an empty roster without crashing", () => {
    expect(() =>
      render(<RosterHub league={makeLeague([])} actions={{}} onPlayerSelect={() => {}} />),
    ).not.toThrow();
  });
});
