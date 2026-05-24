/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReplayableGameFlowViewer, { REPLAY_INTERVAL_MS } from "../ReplayableGameFlowViewer.jsx";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const HOME_TEAM = { id: 20, abbr: "KC" };
const AWAY_TEAM = { id: 10, abbr: "BUF" };
const FINAL_SCORE = { home: 28, away: 24 };

const MOCK_GFS = {
  version: 1,
  scoringTimeline: [
    {
      quarter: 1,
      teamId: 10,
      points: 7,
      scoreAfter: { home: 0, away: 7 },
      label: "Touchdown",
      description: "Pass to WR",
    },
    {
      quarter: 2,
      teamId: 20,
      points: 3,
      scoreAfter: { home: 3, away: 7 },
      label: "Field Goal",
      description: "47-yard FG",
    },
    {
      quarter: 3,
      teamId: 10,
      points: 7,
      scoreAfter: { home: 3, away: 14 },
      label: "Touchdown",
      description: "Rush TD",
    },
    {
      quarter: 4,
      teamId: 20,
      points: 28,
      scoreAfter: { home: 28, away: 24 },
      label: "Touchdown",
      description: "Game-winning score",
    },
  ],
  turningPoints: [
    {
      quarter: 2,
      teamId: null,
      type: "turnover",
      label: "Turnover",
      description: "Fumble recovery",
      scoreContext: { home: 0, away: 7 },
    },
  ],
  teamFlow: {
    "10": { scoringDrives: 2, turnovers: 1, redZoneTrips: 3, redZoneScores: 2, explosivePlays: 4 },
    "20": { scoringDrives: 3, turnovers: 2, redZoneTrips: 4, redZoneScores: 3, explosivePlays: 2 },
  },
};

// After sorting by quarter: Q1 TD, Q2 FG, Q2 Turnover, Q3 TD, Q4 TD  → 5 events
const TOTAL_EVENTS = 5;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderViewer(props = {}) {
  const defaults = {
    gameFlowSummary: MOCK_GFS,
    homeTeam: HOME_TEAM,
    awayTeam: AWAY_TEAM,
    finalScore: FINAL_SCORE,
  };
  return render(<ReplayableGameFlowViewer {...defaults} {...props} />);
}

// ---------------------------------------------------------------------------
// Static / SSR tests — no jsdom interactions needed
// ---------------------------------------------------------------------------

describe("ReplayableGameFlowViewer – null/fallback cases", () => {
  it("renders nothing when gameFlowSummary is null", () => {
    const html = renderToString(
      <ReplayableGameFlowViewer gameFlowSummary={null} />,
    );
    expect(html).toBe("");
  });

  it("renders nothing when gameFlowSummary is undefined", () => {
    const html = renderToString(<ReplayableGameFlowViewer />);
    expect(html).toBe("");
  });

  it("renders nothing when both timelines are empty arrays", () => {
    const emptyGfs = { version: 1, scoringTimeline: [], turningPoints: [], teamFlow: null };
    const html = renderToString(
      <ReplayableGameFlowViewer gameFlowSummary={emptyGfs} />,
    );
    expect(html).toBe("");
  });

  it("renders nothing when summary lacks scoring and turning point arrays", () => {
    const html = renderToString(
      <ReplayableGameFlowViewer gameFlowSummary={{ version: 1 }} />,
    );
    expect(html).toBe("");
  });

  it("renders nothing when summary has only teamFlow and no timeline events", () => {
    const gfs = {
      version: 1,
      scoringTimeline: [],
      turningPoints: [],
      teamFlow: { "1": { scoringDrives: 2, turnovers: 1, redZoneTrips: 2, redZoneScores: 1, explosivePlays: 3 } },
    };
    const html = renderToString(
      <ReplayableGameFlowViewer gameFlowSummary={gfs} />,
    );
    expect(html).toBe("");
  });
});

describe("ReplayableGameFlowViewer – initial render with data", () => {
  afterEach(cleanup);

  it("renders the root container when summary has events", () => {
    const html = renderToString(
      <ReplayableGameFlowViewer gameFlowSummary={MOCK_GFS} homeTeam={HOME_TEAM} awayTeam={AWAY_TEAM} />,
    );
    expect(html).toContain("rgfv-root");
  });

  it("shows Event 1 of N progress on first render", () => {
    const { container } = renderViewer();
    // Use textContent (not raw HTML) to avoid React 19 comment-separator issues
    expect(container.textContent).toContain(`Event 1 of ${TOTAL_EVENTS}`);
  });

  it("renders the first event label — Q1 · Touchdown", () => {
    const html = renderToString(
      <ReplayableGameFlowViewer gameFlowSummary={MOCK_GFS} homeTeam={HOME_TEAM} awayTeam={AWAY_TEAM} />,
    );
    expect(html).toContain("Q1");
    expect(html).toContain("Touchdown");
  });

  it("renders team abbreviation in first event when teamId matches awayTeam", () => {
    const html = renderToString(
      <ReplayableGameFlowViewer gameFlowSummary={MOCK_GFS} homeTeam={HOME_TEAM} awayTeam={AWAY_TEAM} />,
    );
    // First event teamId=10 = AWAY_TEAM.id
    expect(html).toContain("BUF");
  });

  it("renders score context for first event", () => {
    const html = renderToString(
      <ReplayableGameFlowViewer gameFlowSummary={MOCK_GFS} />,
    );
    // First event scoreAfter: away 7, home 0
    expect(html).toContain("7");
    expect(html).toContain("0");
  });

  it("renders team flow table when teamFlow data is present", () => {
    const html = renderToString(
      <ReplayableGameFlowViewer
        gameFlowSummary={MOCK_GFS}
        homeTeam={HOME_TEAM}
        awayTeam={AWAY_TEAM}
      />,
    );
    expect(html).toContain("Scoring Drives");
    expect(html).toContain("Turnovers");
    expect(html).toContain("Red Zone");
    expect(html).toContain("Explosive Plays");
  });

  it("does not render history list when at first event", () => {
    const { queryByTestId } = renderViewer();
    expect(queryByTestId("rgfv-history")).toBeNull();
  });

  it("renders all playback control buttons", () => {
    const { getByTestId } = renderViewer();
    expect(getByTestId("rgfv-btn-restart")).toBeTruthy();
    expect(getByTestId("rgfv-btn-play")).toBeTruthy();
    expect(getByTestId("rgfv-btn-step")).toBeTruthy();
    expect(getByTestId("rgfv-btn-skip-end")).toBeTruthy();
  });
});

describe("ReplayableGameFlowViewer – legacy / partial data safety", () => {
  it("handles events with missing score safely", () => {
    const gfs = {
      version: 1,
      scoringTimeline: [
        { quarter: 1, teamId: null, points: 7, label: "Touchdown", description: "Old TD" },
      ],
      turningPoints: [],
      teamFlow: null,
    };
    const html = renderToString(<ReplayableGameFlowViewer gameFlowSummary={gfs} />);
    expect(html).toContain("Touchdown");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
  });

  it("handles events with missing description safely", () => {
    const gfs = {
      version: 1,
      scoringTimeline: [{ quarter: 2, label: "Field Goal", scoreAfter: { home: 3, away: 0 } }],
      turningPoints: [],
      teamFlow: null,
    };
    const html = renderToString(<ReplayableGameFlowViewer gameFlowSummary={gfs} />);
    expect(html).toContain("Field Goal");
  });

  it("handles turning points with missing scoreContext safely", () => {
    const gfs = {
      version: 1,
      scoringTimeline: [],
      turningPoints: [{ quarter: 3, type: "turnover", label: "Turnover", description: "INT" }],
      teamFlow: null,
    };
    const html = renderToString(<ReplayableGameFlowViewer gameFlowSummary={gfs} />);
    expect(html).toContain("Turnover");
  });

  it("handles non-numeric quarter by defaulting to Q1", () => {
    const gfs = {
      version: 1,
      scoringTimeline: [
        { quarter: null, label: "Touchdown", description: "Legacy play", scoreAfter: { home: 7, away: 0 } },
      ],
      turningPoints: [],
      teamFlow: null,
    };
    const html = renderToString(<ReplayableGameFlowViewer gameFlowSummary={gfs} />);
    expect(html).toContain("Q1");
  });

  it("renders with only turningPoints and no scoringTimeline", () => {
    const gfs = {
      version: 1,
      scoringTimeline: [],
      turningPoints: [
        { quarter: 2, type: "lead_change", label: "Lead Change", description: "Lead flipped", scoreContext: { home: 10, away: 7 } },
      ],
      teamFlow: null,
    };
    const html = renderToString(<ReplayableGameFlowViewer gameFlowSummary={gfs} />);
    expect(html).toContain("Lead Change");
  });
});

// ---------------------------------------------------------------------------
// Interactive control tests (jsdom + fireEvent)
// ---------------------------------------------------------------------------

describe("ReplayableGameFlowViewer – Step Next control", () => {
  afterEach(cleanup);

  it("Step Next advances by one event", () => {
    const { getByTestId } = renderViewer();
    expect(getByTestId("rgfv-current-label").textContent).toContain("Q1");

    fireEvent.click(getByTestId("rgfv-btn-step"));
    // After step: index=1, second event is Q2 · Field Goal
    expect(getByTestId("rgfv-current-label").textContent).toContain("Q2");
  });

  it("Step Next shows progress as Event 2 of N", () => {
    const { getByTestId, container } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-step"));
    expect(container.textContent).toContain(`Event 2 of ${TOTAL_EVENTS}`);
  });

  it("Step Next reveals history entry for previous event", () => {
    const { getByTestId, getAllByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-step"));
    const historyItems = getAllByTestId("rgfv-history-item");
    expect(historyItems.length).toBe(1);
    expect(historyItems[0].textContent).toContain("Q1");
  });

  it("Step Next is disabled when at last event", () => {
    const { getByTestId } = renderViewer();
    for (let i = 0; i < TOTAL_EVENTS - 1; i++) {
      fireEvent.click(getByTestId("rgfv-btn-step"));
    }
    expect(getByTestId("rgfv-btn-step").disabled).toBe(true);
    expect(getByTestId("rgfv-btn-skip-end").disabled).toBe(true);
  });
});

describe("ReplayableGameFlowViewer – Skip to End control", () => {
  afterEach(cleanup);

  it("Skip to End jumps directly to the last event", () => {
    const { getByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-skip-end"));
    const label = getByTestId("rgfv-current-label").textContent;
    // Last event is Q4 · Touchdown
    expect(label).toContain("Q4");
    expect(label).toContain("Touchdown");
  });

  it("Skip to End shows progress as Event N of N", () => {
    const { getByTestId, container } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-skip-end"));
    expect(container.textContent).toContain(`Event ${TOTAL_EVENTS} of ${TOTAL_EVENTS}`);
  });

  it("Skip to End reveals all previous events in history", () => {
    const { getByTestId, getAllByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-skip-end"));
    const historyItems = getAllByTestId("rgfv-history-item");
    expect(historyItems.length).toBe(TOTAL_EVENTS - 1);
  });

  it("Skip to End shows final score badge", () => {
    const { getByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-skip-end"));
    const fs = getByTestId("rgfv-final-score");
    expect(fs.textContent).toContain("24");
    expect(fs.textContent).toContain("28");
  });

  it("Skip to End shows Complete status", () => {
    const { getByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-skip-end"));
    expect(getByTestId("rgfv-progress").textContent).toBe("Complete");
  });
});

describe("ReplayableGameFlowViewer – Restart control", () => {
  afterEach(cleanup);

  it("Restart resets to first event after advancing", () => {
    const { getByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-skip-end"));
    fireEvent.click(getByTestId("rgfv-btn-restart"));
    expect(getByTestId("rgfv-current-label").textContent).toContain("Q1");
    expect(getByTestId("rgfv-current-label").textContent).toContain("Touchdown");
  });

  it("Restart resets progress counter to Event 1 of N", () => {
    const { getByTestId, container } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-step"));
    fireEvent.click(getByTestId("rgfv-btn-restart"));
    expect(container.textContent).toContain(`Event 1 of ${TOTAL_EVENTS}`);
  });

  it("Restart clears the history list", () => {
    const { getByTestId, queryByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-step"));
    fireEvent.click(getByTestId("rgfv-btn-restart"));
    expect(queryByTestId("rgfv-history")).toBeNull();
  });

  it("Restart hides the final score badge", () => {
    const { getByTestId, queryByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-skip-end"));
    fireEvent.click(getByTestId("rgfv-btn-restart"));
    expect(queryByTestId("rgfv-final-score")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Timer-based tests — fake timers
// ---------------------------------------------------------------------------

describe("ReplayableGameFlowViewer – Play / Pause (fake timers)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("Play button switches control to Pause button", () => {
    const { getByTestId, queryByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-play"));
    expect(queryByTestId("rgfv-btn-pause")).toBeTruthy();
    expect(queryByTestId("rgfv-btn-play")).toBeNull();
  });

  it("Play advances to next event after one interval tick", () => {
    const { getByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-play"));
    act(() => {
      vi.advanceTimersByTime(REPLAY_INTERVAL_MS);
    });
    expect(getByTestId("rgfv-current-label").textContent).toContain("Q2");
  });

  it("Play advances through multiple events over multiple ticks", () => {
    const { getByTestId, container } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-play"));
    act(() => {
      vi.advanceTimersByTime(REPLAY_INTERVAL_MS * 3);
    });
    expect(container.textContent).toContain(`Event 4 of ${TOTAL_EVENTS}`);
  });

  it("Pause stops advancement after one tick", () => {
    const { getByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-play"));
    act(() => {
      vi.advanceTimersByTime(REPLAY_INTERVAL_MS);
    });
    const labelAfterOneTick = getByTestId("rgfv-current-label").textContent;

    fireEvent.click(getByTestId("rgfv-btn-pause"));
    act(() => {
      vi.advanceTimersByTime(REPLAY_INTERVAL_MS * 10);
    });
    // Label should not have changed after pause
    expect(getByTestId("rgfv-current-label").textContent).toBe(labelAfterOneTick);
  });

  it("Pause restores Play button", () => {
    const { getByTestId, queryByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-play"));
    fireEvent.click(getByTestId("rgfv-btn-pause"));
    expect(queryByTestId("rgfv-btn-play")).toBeTruthy();
    expect(queryByTestId("rgfv-btn-pause")).toBeNull();
  });

  it("Play auto-stops at the last event and disables Play button", () => {
    const { getByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-play"));
    act(() => {
      // Advance well past the end
      vi.advanceTimersByTime(REPLAY_INTERVAL_MS * (TOTAL_EVENTS + 5));
    });
    expect(getByTestId("rgfv-btn-play").disabled).toBe(true);
    expect(getByTestId("rgfv-progress").textContent).toBe("Complete");
  });

  it("Step Next stops active playback and advances by one", () => {
    const { getByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-play"));
    act(() => {
      vi.advanceTimersByTime(REPLAY_INTERVAL_MS);
    });
    // Now at event 2, playing
    fireEvent.click(getByTestId("rgfv-btn-step"));
    // Should have stepped to event 3 and be paused
    act(() => {
      vi.advanceTimersByTime(REPLAY_INTERVAL_MS * 5);
    });
    // Still at event 3 — timer was stopped
    const label = getByTestId("rgfv-current-label").textContent;
    expect(label).toContain("Q2"); // third event (index 2) is Q2 · Turnover
  });
});

// ---------------------------------------------------------------------------
// Unmount safety
// ---------------------------------------------------------------------------

describe("ReplayableGameFlowViewer – unmount safety", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("unmounting while playing does not throw and clears the interval", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const { getByTestId, unmount } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-play"));
    act(() => {
      vi.advanceTimersByTime(REPLAY_INTERVAL_MS);
    });
    expect(() => unmount()).not.toThrow();
    expect(clearSpy).toHaveBeenCalled();
    // Advancing timers after unmount should not throw
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(REPLAY_INTERVAL_MS * 10);
      });
    }).not.toThrow();
    clearSpy.mockRestore();
  });

  it("unmounting while paused does not throw", () => {
    const { unmount } = renderViewer();
    expect(() => unmount()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe("ReplayableGameFlowViewer – input immutability", () => {
  afterEach(cleanup);

  it("does not mutate the gameFlowSummary prop during render", () => {
    const snapshot = JSON.stringify(MOCK_GFS);
    renderViewer();
    expect(JSON.stringify(MOCK_GFS)).toBe(snapshot);
  });

  it("does not mutate the gameFlowSummary prop after Step Next", () => {
    const snapshot = JSON.stringify(MOCK_GFS);
    const { getByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-step"));
    fireEvent.click(getByTestId("rgfv-btn-step"));
    expect(JSON.stringify(MOCK_GFS)).toBe(snapshot);
  });

  it("does not mutate the gameFlowSummary prop after Skip to End", () => {
    const snapshot = JSON.stringify(MOCK_GFS);
    const { getByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-skip-end"));
    expect(JSON.stringify(MOCK_GFS)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// BoxScore integration smoke — ensure viewer renders inside BoxScore's gfs block
// ---------------------------------------------------------------------------

describe("ReplayableGameFlowViewer – integration smoke with BoxScore data shape", () => {
  afterEach(cleanup);

  it("renders with a gameFlowSummary shaped like BoxScore view-model output", () => {
    const gfs = {
      version: 1,
      scoringTimeline: [
        { quarter: 1, teamId: 1, points: 7, scoreAfter: { home: 7, away: 0 }, label: "Touchdown", description: "QB sneak" },
        { quarter: 4, teamId: 2, points: 24, scoreAfter: { home: 7, away: 24 }, label: "Touchdown", description: "Hail Mary" },
      ],
      turningPoints: [
        { quarter: 3, teamId: 2, type: "lead_change", label: "Lead Change", description: "INT return", scoreContext: { home: 7, away: 14 } },
      ],
      teamFlow: {
        "1": { scoringDrives: 1, turnovers: 2, redZoneTrips: 2, redZoneScores: 1, explosivePlays: 1 },
        "2": { scoringDrives: 3, turnovers: 0, redZoneTrips: 3, redZoneScores: 3, explosivePlays: 5 },
      },
    };
    const { getByTestId, container } = render(
      <ReplayableGameFlowViewer
        gameFlowSummary={gfs}
        homeTeam={{ id: 1, abbr: "NE" }}
        awayTeam={{ id: 2, abbr: "MIA" }}
        finalScore={{ home: 7, away: 24 }}
      />,
    );
    expect(getByTestId("rgfv-root")).toBeTruthy();
    expect(container.textContent).toContain("Event 1 of 3");
    expect(getByTestId("rgfv-current-label").textContent).toContain("Q1");
  });
});

// ---------------------------------------------------------------------------
// MatchMomentumTracker integration — tracker renders and updates with RGFV
// ---------------------------------------------------------------------------

describe("ReplayableGameFlowViewer – MatchMomentumTracker integration", () => {
  afterEach(cleanup);

  it("renders mmt-root when replayable events exist", () => {
    const { getByTestId } = renderViewer();
    expect(getByTestId("mmt-root")).toBeTruthy();
  });

  it("does not render mmt-root when gameFlowSummary is null", () => {
    const { queryByTestId } = render(<ReplayableGameFlowViewer gameFlowSummary={null} />);
    expect(queryByTestId("mmt-root")).toBeNull();
  });

  it("first tick is current and remaining are future on initial render", () => {
    const { getAllByTestId } = renderViewer();
    const ticks = getAllByTestId("mmt-tick");
    expect(ticks[0].dataset.reveal).toBe("current");
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].dataset.reveal).toBe("future");
    }
  });

  it("tracker updates: Step Next advances current tick by one", () => {
    const { getByTestId, getAllByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-step"));
    const ticks = getAllByTestId("mmt-tick");
    expect(ticks[0].dataset.reveal).toBe("past");
    expect(ticks[1].dataset.reveal).toBe("current");
    expect(ticks[2].dataset.reveal).toBe("future");
  });

  it("tracker updates: Skip to End marks last tick as current", () => {
    const { getByTestId, getAllByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-skip-end"));
    const ticks = getAllByTestId("mmt-tick");
    const last = ticks[ticks.length - 1];
    expect(last.dataset.reveal).toBe("current");
    for (let i = 0; i < ticks.length - 1; i++) {
      expect(ticks[i].dataset.reveal).toBe("past");
    }
  });

  it("tracker updates: Restart resets to first tick as current", () => {
    const { getByTestId, getAllByTestId } = renderViewer();
    fireEvent.click(getByTestId("rgfv-btn-skip-end"));
    fireEvent.click(getByTestId("rgfv-btn-restart"));
    const ticks = getAllByTestId("mmt-tick");
    expect(ticks[0].dataset.reveal).toBe("current");
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].dataset.reveal).toBe("future");
    }
  });

  it("tracker shows team abbreviations from homeTeam/awayTeam props", () => {
    const { getByTestId } = renderViewer();
    expect(getByTestId("mmt-home-label").textContent).toBe("KC");
    expect(getByTestId("mmt-away-label").textContent).toBe("BUF");
  });

  it("tracker renders the correct total number of ticks (5 for MOCK_GFS)", () => {
    const { getAllByTestId } = renderViewer();
    expect(getAllByTestId("mmt-tick").length).toBe(TOTAL_EVENTS);
  });
});
