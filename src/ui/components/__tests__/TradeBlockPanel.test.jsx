/** @vitest-environment jsdom */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import TradeBlockPanel from "../TradeBlockPanel.jsx";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayer(id, teamId, pos, ovr, age = 26, baseAnnual = 3, extra = {}) {
  return {
    id,
    teamId,
    name: `${pos}${id}`,
    pos,
    ovr,
    age,
    potential: ovr,
    contract: { baseAnnual, yearsTotal: 2, yearsRemaining: 1 },
    ...extra,
  };
}

function makeLeague({ userTeamId = 1, aiTeams = [], players = [] } = {}) {
  const userTeam = {
    id: userTeamId,
    name: "Bears",
    abbr: "CHI",
    wins: 6, losses: 4,
    capRoom: 20,
    picks: [],
    roster: [],
  };
  return {
    year: 2027,
    season: 2027,
    phase: "regular",
    userTeamId,
    teams: [userTeam, ...aiTeams],
    players,
  };
}

// AI team designed to produce a cap-burden trade block entry:
// capRoom < 0 (cap-restricted) + player with high contract, age >= 28, OVR < 88
const capStrappedTeam = {
  id: 2,
  name: "Lions",
  abbr: "DET",
  wins: 2, losses: 8,
  capRoom: -3,
  picks: [],
  roster: [],
};

const capBurdenPlayer = makePlayer(201, 2, "WR", 80, 31, 15);
const youngPlayer = makePlayer(202, 2, "WR", 74, 24, 2);

const leagueWithAIBlock = makeLeague({
  aiTeams: [capStrappedTeam],
  players: [
    makePlayer(101, 1, "QB", 82, 27, 10),
    capBurdenPlayer,
    youngPlayer,
  ],
});

// ── User block tests ──────────────────────────────────────────────────────────

describe("TradeBlockPanel — user block", () => {
  afterEach(cleanup);

  it("renders null when roster is not an array", () => {
    const html = renderToString(<TradeBlockPanel roster={null} onRemove={() => {}} />);
    expect(html).toBe("");
  });

  it("shows 'No players on the trade block' when no players qualify", () => {
    const roster = [makePlayer(1, 1, "QB", 82)];
    render(<TradeBlockPanel roster={roster} onRemove={() => {}} />);
    expect(screen.getByText(/no players on the trade block/i)).toBeTruthy();
  });

  it("renders players flagged onTradeBlock", () => {
    const roster = [makePlayer(1, 1, "QB", 82, 27, 5, { onTradeBlock: true })];
    render(<TradeBlockPanel roster={roster} onRemove={() => {}} />);
    expect(screen.getByText("QB1")).toBeTruthy();
  });

  it("calls onRemove with correct player id when Remove is clicked", () => {
    const onRemove = vi.fn();
    const player = makePlayer(42, 1, "WR", 76, 30, 4, { onTradeBlock: true });
    render(<TradeBlockPanel roster={[player]} onRemove={onRemove} />);
    fireEvent.click(screen.getByText("Remove"));
    expect(onRemove).toHaveBeenCalledWith(42);
  });
});

// ── League block tests ────────────────────────────────────────────────────────

describe("TradeBlockPanel — league block", () => {
  afterEach(cleanup);

  it("does not render league block toggle when league prop is absent", () => {
    const roster = [makePlayer(1, 1, "QB", 82)];
    render(<TradeBlockPanel roster={roster} onRemove={() => {}} />);
    expect(screen.queryByTestId("league-block-toggle")).toBeNull();
  });

  it("renders league block toggle when league prop is provided", () => {
    const roster = [makePlayer(101, 1, "QB", 82)];
    render(
      <TradeBlockPanel
        roster={roster}
        onRemove={() => {}}
        league={leagueWithAIBlock}
        userTeamId={1}
      />,
    );
    expect(screen.getByTestId("league-block-toggle")).toBeTruthy();
    expect(screen.getByText("League Block")).toBeTruthy();
  });

  it("league block content is hidden by default", () => {
    const roster = [makePlayer(101, 1, "QB", 82)];
    render(
      <TradeBlockPanel
        roster={roster}
        onRemove={() => {}}
        league={leagueWithAIBlock}
        userTeamId={1}
      />,
    );
    expect(screen.queryByTestId("league-block-content")).toBeNull();
  });

  it("reveals league block content after clicking the toggle", () => {
    const roster = [makePlayer(101, 1, "QB", 82)];
    render(
      <TradeBlockPanel
        roster={roster}
        onRemove={() => {}}
        league={leagueWithAIBlock}
        userTeamId={1}
      />,
    );
    fireEvent.click(screen.getByTestId("league-block-toggle"));
    expect(screen.getByTestId("league-block-content")).toBeTruthy();
  });

  it("renders AI team name when generator returns block assets", () => {
    const roster = [makePlayer(101, 1, "QB", 82)];
    render(
      <TradeBlockPanel
        roster={roster}
        onRemove={() => {}}
        league={leagueWithAIBlock}
        userTeamId={1}
      />,
    );
    fireEvent.click(screen.getByTestId("league-block-toggle"));
    // The cap-strapped Lions should appear with the cap-burden WR
    expect(screen.getByText("Lions")).toBeTruthy();
  });

  it("shows cap-strapped posture label for cap-restricted AI team", () => {
    const roster = [makePlayer(101, 1, "QB", 82)];
    render(
      <TradeBlockPanel
        roster={roster}
        onRemove={() => {}}
        league={leagueWithAIBlock}
        userTeamId={1}
      />,
    );
    fireEvent.click(screen.getByTestId("league-block-toggle"));
    expect(screen.getByText(/cap strapped/i)).toBeTruthy();
  });

  it("displays player OVR for AI block assets", () => {
    const roster = [makePlayer(101, 1, "QB", 82)];
    render(
      <TradeBlockPanel
        roster={roster}
        onRemove={() => {}}
        league={leagueWithAIBlock}
        userTeamId={1}
      />,
    );
    fireEvent.click(screen.getByTestId("league-block-toggle"));
    // capBurdenPlayer has OVR 80
    expect(screen.getByText("80")).toBeTruthy();
  });

  it("shows empty message when no AI teams produce block assets", () => {
    const emptyLeague = makeLeague({
      aiTeams: [{ id: 2, name: "Lions", abbr: "DET", wins: 8, losses: 2, capRoom: 30, picks: [], roster: [] }],
      players: [makePlayer(201, 2, "QB", 88, 26, 12)], // cornerstone, not on block
    });
    const roster = [makePlayer(101, 1, "QB", 82)];
    render(
      <TradeBlockPanel
        roster={roster}
        onRemove={() => {}}
        league={emptyLeague}
        userTeamId={1}
      />,
    );
    fireEvent.click(screen.getByTestId("league-block-toggle"));
    expect(screen.getByText(/no ai teams have assets/i)).toBeTruthy();
  });

  it("excludes the user's own team from the league block", () => {
    const roster = [makePlayer(101, 1, "QB", 82)];
    render(
      <TradeBlockPanel
        roster={roster}
        onRemove={() => {}}
        league={leagueWithAIBlock}
        userTeamId={1}
      />,
    );
    fireEvent.click(screen.getByTestId("league-block-toggle"));
    // Bears (user team id=1) should not appear in league block
    expect(screen.queryByText("Bears")).toBeNull();
  });
});
