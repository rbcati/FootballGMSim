import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { ProspectRow } from "./ProspectRow.jsx";
import { DRAFT_ROOM_PHASES } from "./draftShared.js";

const prospect = {
  id: 1,
  name: "Tom Brady",
  pos: "QB",
  age: 22,
  ovr: 75,
  potential: "A",
  traits: [],
  combineResults: { fortyTime: "4.8", benchPress: 20 },
  college: "Michigan",
};

const baseProps = {
  prospect,
  rank: 1,
  boardRank: 1,
  isUserPick: false,
  isDraftComplete: false,
  draftPhase: DRAFT_ROOM_PHASES.CPU_PICKING,
  onDraftPlayer: vi.fn(),
  onPlayerClick: vi.fn(),
  compareIds: [],
  onToggleCompare: vi.fn(),
  onMoveUp: vi.fn(),
  onMoveDown: vi.fn(),
  disabled: false,
  userTeam: null,
  isRecommended: false,
  isTopByPos: false,
};

describe("ProspectRow", () => {
  it("renders prospect name and position without crashing", () => {
    const html = renderToString(<table><tbody><ProspectRow {...baseProps} /></tbody></table>);
    expect(html).toContain("Tom Brady");
    expect(html).toContain("QB");
    expect(html).toContain("Michigan");
  });

  it("hides Draft button when not user pick", () => {
    const html = renderToString(<table><tbody><ProspectRow {...baseProps} isUserPick={false} /></tbody></table>);
    expect(html).not.toContain(">Draft<");
  });

  it("shows Draft button when user is on the clock", () => {
    const html = renderToString(
      <table><tbody>
        <ProspectRow {...baseProps} isUserPick draftPhase={DRAFT_ROOM_PHASES.ON_THE_CLOCK} />
      </tbody></table>,
    );
    expect(html).toContain("Draft");
  });

  it("shows scout grade before draft completes (potential hidden)", () => {
    const html = renderToString(<table><tbody><ProspectRow {...baseProps} isDraftComplete={false} /></tbody></table>);
    expect(html).toContain("??");
  });

  it("shows true OVR value after draft completes", () => {
    const html = renderToString(<table><tbody><ProspectRow {...baseProps} isDraftComplete /></tbody></table>);
    // After draft, OvrBadge shows the numeric OVR (75) and potential ("A")
    expect(html).toContain("75");
    expect(html).not.toContain("??");
  });
});
