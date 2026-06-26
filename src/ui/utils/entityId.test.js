import { describe, it, expect } from "vitest";
import { toEntityId, toPlayerId, toEntityKey } from "./entityId.js";

describe("toEntityId", () => {
  it("returns trimmed non-empty strings unchanged", () => {
    expect(toEntityId("abc")).toBe("abc");
    expect(toEntityId("  abc  ")).toBe("abc");
  });

  it("coerces finite numbers (the .split crash vector) to strings", () => {
    expect(toEntityId(7)).toBe("7");
    expect(toEntityId(0)).toBe("0");
    expect(toEntityId(-12)).toBe("-12");
  });

  it("coerces bigints to strings", () => {
    expect(toEntityId(42n)).toBe("42");
  });

  it("falls back for missing / malformed values", () => {
    expect(toEntityId(undefined)).toBe("");
    expect(toEntityId(null)).toBe("");
    expect(toEntityId("")).toBe("");
    expect(toEntityId("   ")).toBe("");
    expect(toEntityId(NaN)).toBe("");
    expect(toEntityId(Infinity)).toBe("");
    expect(toEntityId(() => {})).toBe("");
  });

  it("honors the provided fallback", () => {
    expect(toEntityId(null, "x")).toBe("x");
    expect(toEntityId({}, "fallback")).toBe("fallback");
  });

  it("unwraps nested id-bearing objects", () => {
    expect(toEntityId({ id: 9 })).toBe("9");
    expect(toEntityId({ pid: "qb1" })).toBe("qb1");
    expect(toEntityId({ tid: 3 })).toBe("3");
    expect(toEntityId({ name: "no id" })).toBe("");
  });

  it("always returns a string that exposes .split (regression guard)", () => {
    for (const v of [7, 0, "abc", null, undefined, {}, NaN, 42n, { id: 5 }]) {
      const id = toEntityId(v, "x");
      expect(typeof id).toBe("string");
      expect(() => id.split("")).not.toThrow();
    }
  });
});

describe("toPlayerId", () => {
  it("resolves id then pid aliases", () => {
    expect(toPlayerId({ id: 5 })).toBe("5");
    expect(toPlayerId({ pid: "p9" })).toBe("p9");
    expect(toPlayerId({ id: null, pid: 3 })).toBe("3");
  });

  it("falls back for malformed players", () => {
    expect(toPlayerId(null, "x")).toBe("x");
    expect(toPlayerId(undefined, "x")).toBe("x");
    expect(toPlayerId({}, "x")).toBe("x");
  });
});

describe("toEntityKey", () => {
  it("uses the id when present", () => {
    expect(toEntityKey(7, 0)).toBe("7");
    expect(toEntityKey("abc", 3)).toBe("abc");
  });

  it("falls back to a unique index-based key when the id is missing", () => {
    expect(toEntityKey(null, 4, "player")).toBe("player-4");
    expect(toEntityKey(undefined, 2)).toBe("row-2");
    expect(toEntityKey("", 1, "player")).toBe("player-1");
  });
});
