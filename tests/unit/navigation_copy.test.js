import { describe, it, expect } from "vitest";
import { NAV_LABELS, ACTION_LABELS } from "../../src/ui/constants/navigationCopy.js";

describe("navigation copy", () => {
  it("keeps the mobile bottom navigation labels canonical", () => {
    expect(NAV_LABELS.weekly).toBe("Weekly");
    expect(NAV_LABELS.roster).toBe("Roster");
    expect(NAV_LABELS.standings).toBe("League");
    expect(NAV_LABELS.trades).toBe("Trades");
    expect(NAV_LABELS.more).toBe("More");
  });

  it("uses one shared wording for top-level overflow actions", () => {
    expect(NAV_LABELS.more).toBe(ACTION_LABELS.more);
  });
});
