/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDraftBoard } from "./useDraftBoard.js";
import { DRAFT_ROOM_PHASES } from "./draftShared.js";

vi.mock("../utils/playerCompare.js", () => ({
  usePlayerCompare: () => ({
    compareIds: [],
    setCompareIds: vi.fn(),
    showComparison: false,
    setShowComparison: vi.fn(),
    toggleCompare: vi.fn(),
    comparePlayerA: null,
    comparePlayerB: null,
  }),
}));

const emptyDraftState = {
  currentPick: null,
  isUserPick: false,
  isDraftComplete: false,
  prospects: [],
  completedPicks: [],
  upcomingPicks: [],
  pendingTradeProposal: null,
  recommendedPick: null,
  userBigBoard: [],
};

describe("useDraftBoard", () => {
  it("initializes with PRE_DRAFT phase when no currentPick", () => {
    const { result } = renderHook(() =>
      useDraftBoard({
        draftState: emptyDraftState,
        onDraftPlayer: vi.fn(),
        onSimToMyPick: vi.fn(),
        league: { userTeamId: 1, teams: [] },
      }),
    );
    expect(result.current.draftPhase).toBe(DRAFT_ROOM_PHASES.PRE_DRAFT);
  });

  it("returns empty sortedProspects when prospects array is empty", () => {
    const { result } = renderHook(() =>
      useDraftBoard({
        draftState: emptyDraftState,
        onDraftPlayer: vi.fn(),
        onSimToMyPick: vi.fn(),
        league: { userTeamId: 1, teams: [] },
      }),
    );
    expect(result.current.sortedProspects).toEqual([]);
  });

  it("toggleSort flips sortDir when called with the same key twice", () => {
    const { result } = renderHook(() =>
      useDraftBoard({
        draftState: emptyDraftState,
        onDraftPlayer: vi.fn(),
        onSimToMyPick: vi.fn(),
        league: { userTeamId: 1, teams: [] },
      }),
    );
    const initialDir = result.current.sortDir; // -1
    act(() => { result.current.toggleSort("ovr"); });
    expect(result.current.sortDir).toBe(-initialDir); // 1
  });

  it("initializes with DRAFT_COMPLETE phase when isDraftComplete is true", () => {
    const { result } = renderHook(() =>
      useDraftBoard({
        draftState: { ...emptyDraftState, isDraftComplete: true },
        onDraftPlayer: vi.fn(),
        onSimToMyPick: vi.fn(),
        league: { userTeamId: 1, teams: [] },
      }),
    );
    expect(result.current.draftPhase).toBe(DRAFT_ROOM_PHASES.DRAFT_COMPLETE);
  });

  it("returns to ON_THE_CLOCK after the pick flash (no stuck PICK_MADE)", () => {
    vi.useFakeTimers();
    try {
      const state = {
        ...emptyDraftState,
        currentPick: { overall: 8, round: 1, teamId: 1 },
        isUserPick: true,
        completedPicks: [{ overall: 7, round: 1, teamId: 3, playerName: "A", playerOvr: 70 }],
      };
      const { result, rerender } = renderHook((props) => useDraftBoard(props), {
        initialProps: { draftState: state, onDraftPlayer: vi.fn(), onSimToMyPick: vi.fn(), league: { userTeamId: 1, teams: [] } },
      });
      expect(result.current.draftPhase).toBe(DRAFT_ROOM_PHASES.PICK_MADE);
      // A re-render with an equivalent state must not cancel the flash timer.
      rerender({ draftState: { ...state, completedPicks: [...state.completedPicks] }, onDraftPlayer: vi.fn(), onSimToMyPick: vi.fn(), league: { userTeamId: 1, teams: [] } });
      act(() => { vi.advanceTimersByTime(800); });
      expect(result.current.draftPhase).toBe(DRAFT_ROOM_PHASES.ON_THE_CLOCK);
    } finally {
      vi.useRealTimers();
    }
  });
});
