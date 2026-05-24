/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import MatchMomentumTracker, { buildTrackerEvents } from "../MatchMomentumTracker.jsx";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const HOME_TEAM = { id: 20, abbr: "KC" };
const AWAY_TEAM = { id: 10, abbr: "BUF" };

// 4 scoring events + 1 turning point → 5 total tracker events
// Sorted by quarter, scores before turns within same quarter:
//   idx 0: Q1 TD (BUF/away)
//   idx 1: Q2 FG (KC/home)
//   idx 2: Q2 Turnover (neutral, teamId=null)
//   idx 3: Q3 TD (BUF/away)
//   idx 4: Q4 TD (KC/home)
const MOCK_GFS = {
  version: 1,
  scoringTimeline: [
    { quarter: 1, teamId: 10, points: 7, scoreAfter: { home: 0, away: 7 }, label: "Touchdown", description: "Pass to WR" },
    { quarter: 2, teamId: 20, points: 3, scoreAfter: { home: 3, away: 7 }, label: "Field Goal", description: "47-yard FG" },
    { quarter: 3, teamId: 10, points: 7, scoreAfter: { home: 3, away: 14 }, label: "Touchdown", description: "Rush TD" },
    { quarter: 4, teamId: 20, points: 28, scoreAfter: { home: 28, away: 24 }, label: "Touchdown", description: "Game-winning score" },
  ],
  turningPoints: [
    { quarter: 2, teamId: null, type: "turnover", label: "Turnover", description: "Fumble recovery", scoreContext: { home: 0, away: 7 } },
  ],
  teamFlow: {
    "10": { scoringDrives: 2, turnovers: 1, redZoneTrips: 3, redZoneScores: 2, explosivePlays: 4 },
    "20": { scoringDrives: 3, turnovers: 2, redZoneTrips: 4, redZoneScores: 3, explosivePlays: 2 },
  },
};

const TOTAL_EVENTS = 5;

function renderTracker(props = {}) {
  const defaults = { gameFlowSummary: MOCK_GFS, homeTeam: HOME_TEAM, awayTeam: AWAY_TEAM };
  return render(<MatchMomentumTracker {...defaults} {...props} />);
}

// ── Null / fallback cases ─────────────────────────────────────────────────────

describe("MatchMomentumTracker – null/fallback", () => {
  afterEach(cleanup);

  it("renders null when gameFlowSummary is null", () => {
    const html = renderToString(<MatchMomentumTracker gameFlowSummary={null} />);
    expect(html).toBe("");
  });

  it("renders null when gameFlowSummary is undefined", () => {
    const html = renderToString(<MatchMomentumTracker />);
    expect(html).toBe("");
  });

  it("renders null when both timelines are empty arrays", () => {
    const gfs = { version: 1, scoringTimeline: [], turningPoints: [], teamFlow: null };
    const html = renderToString(<MatchMomentumTracker gameFlowSummary={gfs} />);
    expect(html).toBe("");
  });

  it("renders null when summary lacks timeline arrays", () => {
    const html = renderToString(<MatchMomentumTracker gameFlowSummary={{ version: 1 }} />);
    expect(html).toBe("");
  });
});

// ── Scoring timeline rendering ─────────────────────────────────────────────

describe("MatchMomentumTracker – scoring timeline events", () => {
  afterEach(cleanup);

  it("renders mmt-root when summary has scoring events", () => {
    const { getByTestId } = renderTracker();
    expect(getByTestId("mmt-root")).toBeTruthy();
  });

  it("renders one tick per scoring event (4 scoring + 1 turning = 5 ticks)", () => {
    const { getAllByTestId } = renderTracker();
    expect(getAllByTestId("mmt-tick").length).toBe(TOTAL_EVENTS);
  });

  it("renders TD ticks for touchdown events", () => {
    const { getAllByTestId } = renderTracker();
    const ticks = getAllByTestId("mmt-tick");
    const tdTicks = ticks.filter((t) => t.textContent === "TD");
    expect(tdTicks.length).toBe(3);
  });

  it("renders FG tick for field goal event", () => {
    const { getAllByTestId } = renderTracker();
    const ticks = getAllByTestId("mmt-tick");
    const fgTicks = ticks.filter((t) => t.textContent === "FG");
    expect(fgTicks.length).toBe(1);
  });

  it("renders quarter labels for each unique quarter", () => {
    const { getByTestId } = renderTracker();
    expect(getByTestId("mmt-q-label-1")).toBeTruthy();
    expect(getByTestId("mmt-q-label-2")).toBeTruthy();
    expect(getByTestId("mmt-q-label-3")).toBeTruthy();
    expect(getByTestId("mmt-q-label-4")).toBeTruthy();
  });

  it("labels score ticks with data-kind=score", () => {
    const { getAllByTestId } = renderTracker();
    const scoreTicks = getAllByTestId("mmt-tick").filter((t) => t.dataset.kind === "score");
    expect(scoreTicks.length).toBe(4);
  });
});

// ── Turning points rendering ──────────────────────────────────────────────

describe("MatchMomentumTracker – turning points", () => {
  afterEach(cleanup);

  it("renders turning-point-only summary", () => {
    const gfs = {
      version: 1,
      scoringTimeline: [],
      turningPoints: [
        { quarter: 2, type: "lead_change", label: "Lead Change", description: "INT return", scoreContext: { home: 10, away: 7 } },
        { quarter: 3, type: "turnover", label: "Turnover", description: "Fumble lost", scoreContext: { home: 10, away: 14 } },
      ],
      teamFlow: null,
    };
    const { getAllByTestId } = render(<MatchMomentumTracker gameFlowSummary={gfs} />);
    expect(getAllByTestId("mmt-tick").length).toBe(2);
  });

  it("labels turning point ticks with data-kind=turning_point", () => {
    const { getAllByTestId } = renderTracker();
    const tpTicks = getAllByTestId("mmt-tick").filter((t) => t.dataset.kind === "turning_point");
    expect(tpTicks.length).toBe(1);
    expect(tpTicks[0].textContent).toBe("TO");
  });

  it("renders TO short label for turnover type", () => {
    const gfs = {
      version: 1,
      scoringTimeline: [],
      turningPoints: [{ quarter: 1, type: "turnover", label: "Turnover", description: "INT" }],
    };
    const { getAllByTestId } = render(<MatchMomentumTracker gameFlowSummary={gfs} />);
    expect(getAllByTestId("mmt-tick")[0].textContent).toBe("TO");
  });

  it("renders LC short label for lead_change type", () => {
    const gfs = {
      version: 1,
      scoringTimeline: [],
      turningPoints: [{ quarter: 2, type: "lead_change", label: "Lead Change", description: "" }],
    };
    const { getAllByTestId } = render(<MatchMomentumTracker gameFlowSummary={gfs} />);
    expect(getAllByTestId("mmt-tick")[0].textContent).toBe("LC");
  });
});

// ── Input immutability ────────────────────────────────────────────────────

describe("MatchMomentumTracker – does not mutate input summary", () => {
  afterEach(cleanup);

  it("does not mutate gameFlowSummary on render", () => {
    const snapshot = JSON.stringify(MOCK_GFS);
    renderTracker();
    expect(JSON.stringify(MOCK_GFS)).toBe(snapshot);
  });

  it("does not mutate gameFlowSummary when re-rendered with index props", () => {
    const snapshot = JSON.stringify(MOCK_GFS);
    const { rerender } = renderTracker({ currentEventIndex: 0 });
    rerender(
      <MatchMomentumTracker
        gameFlowSummary={MOCK_GFS}
        homeTeam={HOME_TEAM}
        awayTeam={AWAY_TEAM}
        currentEventIndex={3}
      />,
    );
    expect(JSON.stringify(MOCK_GFS)).toBe(snapshot);
  });
});

// ── Missing team labels ────────────────────────────────────────────────────

describe("MatchMomentumTracker – missing team labels", () => {
  afterEach(cleanup);

  it("renders HOME/AWAY fallback labels when teams are not provided", () => {
    const { getByTestId } = render(<MatchMomentumTracker gameFlowSummary={MOCK_GFS} />);
    expect(getByTestId("mmt-home-label").textContent).toBe("HOME");
    expect(getByTestId("mmt-away-label").textContent).toBe("AWAY");
  });

  it("renders provided abbr labels when teams are supplied", () => {
    const { getByTestId } = renderTracker();
    expect(getByTestId("mmt-home-label").textContent).toBe("KC");
    expect(getByTestId("mmt-away-label").textContent).toBe("BUF");
  });

  it("renders safely with homeTeam missing abbr", () => {
    const { getByTestId } = render(
      <MatchMomentumTracker
        gameFlowSummary={MOCK_GFS}
        homeTeam={{ id: 20 }}
        awayTeam={AWAY_TEAM}
      />,
    );
    expect(getByTestId("mmt-home-label").textContent).toBe("HOME");
  });
});

// ── currentEventIndex highlighting ────────────────────────────────────────

describe("MatchMomentumTracker – currentEventIndex highlighting", () => {
  afterEach(cleanup);

  it("marks event 0 as current and rest as future at index 0", () => {
    const { getAllByTestId } = renderTracker({ currentEventIndex: 0 });
    const ticks = getAllByTestId("mmt-tick");
    expect(ticks[0].dataset.reveal).toBe("current");
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].dataset.reveal).toBe("future");
    }
  });

  it("marks event 1 as current, event 0 as past, rest as future at index 1", () => {
    const { getAllByTestId } = renderTracker({ currentEventIndex: 1 });
    const ticks = getAllByTestId("mmt-tick");
    expect(ticks[0].dataset.reveal).toBe("past");
    expect(ticks[1].dataset.reveal).toBe("current");
    for (let i = 2; i < ticks.length; i++) {
      expect(ticks[i].dataset.reveal).toBe("future");
    }
  });

  it("marks last event as current and all others as past at max index", () => {
    const { getAllByTestId } = renderTracker({ currentEventIndex: TOTAL_EVENTS - 1 });
    const ticks = getAllByTestId("mmt-tick");
    for (let i = 0; i < ticks.length - 1; i++) {
      expect(ticks[i].dataset.reveal).toBe("past");
    }
    expect(ticks[ticks.length - 1].dataset.reveal).toBe("current");
  });
});

// ── revealedCount highlighting ────────────────────────────────────────────

describe("MatchMomentumTracker – revealedCount highlighting", () => {
  afterEach(cleanup);

  it("uses revealedCount as threshold when currentEventIndex is absent", () => {
    const { getAllByTestId } = renderTracker({ revealedCount: 2 });
    const ticks = getAllByTestId("mmt-tick");
    expect(ticks[0].dataset.reveal).toBe("past");
    expect(ticks[1].dataset.reveal).toBe("past");
    expect(ticks[2].dataset.reveal).toBe("current");
    expect(ticks[3].dataset.reveal).toBe("future");
  });

  it("currentEventIndex takes precedence over revealedCount", () => {
    // revealedCount=4 would set all as revealed, but currentEventIndex=0 wins
    const { getAllByTestId } = renderTracker({ currentEventIndex: 0, revealedCount: 4 });
    const ticks = getAllByTestId("mmt-tick");
    expect(ticks[0].dataset.reveal).toBe("current");
    expect(ticks[1].dataset.reveal).toBe("future");
  });
});

// ── Static mode (no replay props) ─────────────────────────────────────────

describe("MatchMomentumTracker – static mode", () => {
  afterEach(cleanup);

  it("shows all events as static when no index/count props provided", () => {
    const { getAllByTestId } = renderTracker();
    const ticks = getAllByTestId("mmt-tick");
    expect(ticks.length).toBe(TOTAL_EVENTS);
    for (const tick of ticks) {
      expect(tick.dataset.reveal).toBe("static");
    }
  });
});

// ── Mobile-safe layout ────────────────────────────────────────────────────

describe("MatchMomentumTracker – mobile-safe layout", () => {
  afterEach(cleanup);

  it("mmt-root has overflowX hidden (no horizontal body overflow)", () => {
    const { getByTestId } = renderTracker();
    const root = getByTestId("mmt-root");
    expect(root.style.overflowX).toBe("hidden");
  });

  it("mmt-grid has overflowX hidden", () => {
    const { getByTestId } = renderTracker();
    const grid = getByTestId("mmt-grid");
    expect(grid.style.overflowX).toBe("hidden");
  });

  it("does not render any element with fixed width wider than viewport", () => {
    const { container } = renderTracker();
    // No inline style should set a fixed width > 430px
    const allEls = container.querySelectorAll("[style]");
    for (const el of allEls) {
      const w = el.style.width;
      if (w && w.endsWith("px")) {
        expect(parseFloat(w)).toBeLessThanOrEqual(430);
      }
    }
  });

  it("quarter columns use flex:1 for equal distribution", () => {
    const { getByTestId } = renderTracker();
    const q1 = getByTestId("mmt-quarter-1");
    // jsdom expands flex shorthand: "1" → "1 1 0%" or keeps "1" depending on version
    expect(q1.style.flexGrow === "1" || q1.style.flex.startsWith("1")).toBe(true);
  });
});

// ── buildTrackerEvents unit tests ─────────────────────────────────────────

describe("buildTrackerEvents", () => {
  it("returns empty array for null input", () => {
    expect(buildTrackerEvents(null)).toEqual([]);
  });

  it("returns empty array for undefined input", () => {
    expect(buildTrackerEvents(undefined)).toEqual([]);
  });

  it("returns empty array for empty timelines", () => {
    expect(buildTrackerEvents({ scoringTimeline: [], turningPoints: [] })).toEqual([]);
  });

  it("maps scoring events with correct fields", () => {
    const gfs = {
      scoringTimeline: [{ quarter: 2, teamId: 5, label: "Touchdown", description: "QB sneak" }],
    };
    const events = buildTrackerEvents(gfs);
    expect(events.length).toBe(1);
    expect(events[0].kind).toBe("score");
    expect(events[0].quarter).toBe(2);
    expect(events[0].teamId).toBe(5);
    expect(events[0].shortLabel).toBe("TD");
  });

  it("maps turning point events with correct fields", () => {
    const gfs = {
      turningPoints: [{ quarter: 3, teamId: null, type: "lead_change", label: "Lead Change" }],
    };
    const events = buildTrackerEvents(gfs);
    expect(events.length).toBe(1);
    expect(events[0].kind).toBe("turning_point");
    expect(events[0].shortLabel).toBe("LC");
  });

  it("sorts mixed events by quarter (scores before turns within same quarter)", () => {
    const gfs = {
      scoringTimeline: [
        { quarter: 2, teamId: 1, label: "Field Goal" },
        { quarter: 1, teamId: 2, label: "Touchdown" },
      ],
      turningPoints: [
        { quarter: 2, type: "turnover", label: "Turnover" },
        { quarter: 1, type: "swing", label: "Momentum Swing" },
      ],
    };
    const events = buildTrackerEvents(gfs);
    // Expected order: Q1 FG(score), Q1 Swing(turn), Q2 FG(score), Q2 TO(turn)
    expect(events[0].quarter).toBe(1);
    expect(events[0].kind).toBe("score");
    expect(events[1].quarter).toBe(1);
    expect(events[1].kind).toBe("turning_point");
    expect(events[2].quarter).toBe(2);
    expect(events[2].kind).toBe("score");
    expect(events[3].quarter).toBe(2);
    expect(events[3].kind).toBe("turning_point");
  });

  it("defaults invalid quarter to 1", () => {
    const gfs = {
      scoringTimeline: [{ quarter: null, label: "Touchdown" }],
    };
    const events = buildTrackerEvents(gfs);
    expect(events[0].quarter).toBe(1);
  });

  it("does not mutate input", () => {
    const snapshot = JSON.stringify(MOCK_GFS);
    buildTrackerEvents(MOCK_GFS);
    expect(JSON.stringify(MOCK_GFS)).toBe(snapshot);
  });

  it("skips non-object entries in scoringTimeline", () => {
    const gfs = {
      scoringTimeline: [null, undefined, "bad", { quarter: 1, label: "TD" }],
    };
    expect(buildTrackerEvents(gfs).length).toBe(1);
  });

  it("skips non-object entries in turningPoints", () => {
    const gfs = {
      turningPoints: [42, null, { quarter: 2, label: "Turnover" }],
    };
    expect(buildTrackerEvents(gfs).length).toBe(1);
  });
});
