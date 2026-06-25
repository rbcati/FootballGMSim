import { describe, it, expect } from "vitest";
import { resolveFreeAgencyLoadStatus } from "./freeAgencyLoadStatus.js";

/**
 * Free Agency load/empty state regression (Priority 4).
 * Each branch maps to an honest, distinct message so the page never shows
 * filters over an unexplained blank list.
 */
describe("resolveFreeAgencyLoadStatus", () => {
  it("reports loading while the fetch is in flight", () => {
    const s = resolveFreeAgencyLoadStatus({ loading: true });
    expect(s.state).toBe("loading");
  });

  it("reports error when the load failed", () => {
    const s = resolveFreeAgencyLoadStatus({ loading: false, error: "boom", faState: { freeAgents: [] } });
    expect(s.state).toBe("error");
    expect(s.title).toMatch(/failed to load/i);
    expect(s.body).toBe("boom");
  });

  it("reports error when no payload arrived (silent failure)", () => {
    const s = resolveFreeAgencyLoadStatus({ loading: false, error: null, faState: null });
    expect(s.state).toBe("error");
  });

  it("reports ready (populated) when the pool has players", () => {
    const s = resolveFreeAgencyLoadStatus({
      loading: false,
      faState: { phase: "free_agency", freeAgents: [{ id: 1 }] },
      poolCount: 1,
    });
    expect(s.state).toBe("ready");
  });

  it("stays ready when the pool has players but filters hid them (filtered-empty handled by the table)", () => {
    // poolCount reflects the UNFILTERED pool; a filtered-empty view is still "ready".
    const s = resolveFreeAgencyLoadStatus({
      loading: false,
      faState: { phase: "free_agency", freeAgents: [{ id: 1 }, { id: 2 }] },
      poolCount: 2,
    });
    expect(s.state).toBe("ready");
  });

  it("reports true-empty when free agency is open but the pool is empty", () => {
    const s = resolveFreeAgencyLoadStatus({
      loading: false,
      faState: { phase: "free_agency", freeAgents: [] },
      poolCount: 0,
    });
    expect(s.state).toBe("empty");
    expect(s.title).toMatch(/no free agents/i);
  });

  it("reports phase-unavailable when the pool is empty during a non-FA phase", () => {
    const s = resolveFreeAgencyLoadStatus({
      loading: false,
      faState: { phase: "draft", freeAgents: [] },
      poolCount: 0,
    });
    expect(s.state).toBe("unavailable");
    expect(s.title).toMatch(/unavailable during this phase/i);
  });

  it("uses a re-sign specific message during the resign phase", () => {
    const s = resolveFreeAgencyLoadStatus({
      loading: false,
      faState: { phase: "offseason_resign", freeAgents: [] },
      poolCount: 0,
    });
    expect(s.state).toBe("empty");
    expect(s.title).toMatch(/re-sign/i);
  });
});
