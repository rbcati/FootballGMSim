import { describe, expect, it, vi } from "vitest";
import { createBoxScoreTapHandler } from "./scoreTapTarget.js";

describe("createBoxScoreTapHandler", () => {
  it("returns an interactive handler that opens the matching game id", () => {
    const onOpenBoxScore = vi.fn();
    const handler = createBoxScoreTapHandler({ gameId: "g-22", onOpenBoxScore });
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    handler?.({ preventDefault, stopPropagation });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onOpenBoxScore).toHaveBeenCalledWith("g-22");
  });

  it("returns undefined when game id is missing", () => {
    const handler = createBoxScoreTapHandler({ gameId: null, onOpenBoxScore: vi.fn() });
    expect(handler).toBeUndefined();
  });
});
