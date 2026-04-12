import { describe, it, expect } from "vitest";
import { NAV_LABELS, ACTION_LABELS } from "../../src/ui/constants/navigationCopy.js";

describe("navigation copy", () => {
  it("keeps the shell navigation labels canonical", () => {
    expect(NAV_LABELS.hq).toBe("HQ");
    expect(NAV_LABELS.team).toBe("Team");
    expect(NAV_LABELS.league).toBe("League");
    expect(NAV_LABELS.transactions).toBe("Transactions");
    expect(NAV_LABELS.history).toBe("History");
  });

  it("uses one shared wording for top-level overflow actions", () => {
    expect(NAV_LABELS.more).toBe(ACTION_LABELS.more);
  });
});
