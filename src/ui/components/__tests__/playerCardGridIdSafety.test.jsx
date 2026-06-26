/** @vitest-environment jsdom */
/**
 * playerCardGridIdSafety.test.jsx
 *
 * Regression for the Roster Hub crash:
 *   "(e.id ?? \"x\").split is not a function"
 *
 * Root cause: PlayerCardGrid.getAttrValue() called .split() directly on a raw
 * player id, which throws when the id is numeric / missing / an object — a
 * shape that occurs in seeded fixtures and legacy saves. The grid (and the
 * Roster Hub card view that renders it) must never crash on malformed ids; bad
 * rows should be skipped and the rest should render with fallback labels.
 */
import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PlayerCardGrid from "../PlayerCardGrid.jsx";

// facesjs (rendered via FaceAvatar) touches IntersectionObserver, which jsdom
// does not implement. Stub it so the grid mounts in the test environment.
beforeEach(() => {
  global.IntersectionObserver = vi.fn(function () {
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  });
});

// No `ratings`/`attrs` so getAttrValue() takes the id-seeded fallback branch —
// the exact code path that crashed.
function barePlayer(id, name, pos = "QB") {
  return { id, name, pos, ovr: 80, age: 25 };
}

describe("PlayerCardGrid id safety (split crash regression)", () => {
  it("renders a numeric id without throwing", () => {
    const roster = [barePlayer(7, "Numeric Id")];
    expect(() => render(<PlayerCardGrid roster={roster} />)).not.toThrow();
    expect(screen.getByText("Numeric Id")).toBeTruthy();
  });

  it("renders missing / null / object ids without throwing", () => {
    const roster = [
      barePlayer(undefined, "No Id"),
      barePlayer(null, "Null Id"),
      barePlayer({ nested: true }, "Object Id"),
      barePlayer("base36str", "String Id"),
      barePlayer(0, "Zero Id"),
    ];
    expect(() => render(<PlayerCardGrid roster={roster} />)).not.toThrow();
    // Every well-formed row still renders (fallback labels for bad ids).
    for (const name of ["No Id", "Null Id", "Object Id", "String Id", "Zero Id"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it("skips malformed (null / non-object) rows instead of crashing", () => {
    const roster = [barePlayer(1, "Good One"), null, undefined, 42, barePlayer(2, "Good Two")];
    expect(() => render(<PlayerCardGrid roster={roster} />)).not.toThrow();
    expect(screen.getByText("Good One")).toBeTruthy();
    expect(screen.getByText("Good Two")).toBeTruthy();
  });

  it("gives missing-id rows distinct React keys (no duplicate-key warning)", () => {
    const errors = [];
    const original = console.error;
    console.error = (...args) => { errors.push(args.join(" ")); };
    try {
      const roster = [
        barePlayer(undefined, "No Id A"),
        barePlayer(undefined, "No Id B"),
        barePlayer(null, "Null Id C"),
      ];
      render(<PlayerCardGrid roster={roster} />);
    } finally {
      console.error = original;
    }
    expect(errors.join(" ")).not.toMatch(/same key|duplicate key/i);
  });
});
