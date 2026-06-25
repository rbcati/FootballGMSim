import { describe, it, expect } from "vitest";
import { buildLeagueStatsHubModel } from "./leagueStatsHub.js";
import { attachSeasonStatsToRoster } from "../../worker/viewStateStats.js";

/**
 * Stats pipeline regression (Priority 2).
 *
 * Proves the full contract that was broken: recorded per-game totals (in the
 * cache's singular-key shape produced by statAccumulator + updateSeasonStat)
 * surface as NON-ZERO leaders in the League Stats hub once they are attached to
 * the view-model roster via attachSeasonStatsToRoster — exactly what
 * buildViewState now does.
 */

// One completed game's worth of recorded season totals, keyed by player id,
// using the SAME singular keys the worker writes (passYd, rushYd, recYd, ...).
const recordedTotals = {
  "qb1": { passYd: 305, passTD: 3, passComp: 24, passAtt: 33, interceptions: 1, gamesPlayed: 1 },
  "rb1": { rushYd: 128, rushTD: 2, rushAtt: 21, gamesPlayed: 1 },
  "wr1": { recYd: 142, recTD: 1, receptions: 8, targets: 11, gamesPlayed: 1 },
  "lb1": { tackles: 12, sacks: 1.5, tacklesForLoss: 2, gamesPlayed: 1 },
};

function buildLeagueWithRecordedGame() {
  const rawRoster = [
    { id: "qb1", name: "Test QB", pos: "QB", teamId: 1 },
    { id: "rb1", name: "Test RB", pos: "RB", teamId: 1 },
    { id: "wr1", name: "Test WR", pos: "WR", teamId: 1 },
    { id: "lb1", name: "Test LB", pos: "LB", teamId: 1 },
  ];
  const roster = attachSeasonStatsToRoster(rawRoster, (pid) => recordedTotals[String(pid)] ?? null);

  return {
    seasonId: 2026,
    week: 2,
    userTeamId: 1,
    teams: [
      { id: 1, abbr: "AAA", name: "Alphas", roster },
      { id: 2, abbr: "BBB", name: "Betas", roster: [] },
    ],
    // Slim schedule: one completed game with scores (no box score / teamStats,
    // matching what the worker writes into the slim schedule).
    schedule: {
      weeks: [
        { week: 1, games: [{ id: "g1", week: 1, home: 1, away: 2, played: true, homeScore: 24, awayScore: 17 }] },
      ],
    },
  };
}

describe("League Stats pipeline after one completed game", () => {
  const model = buildLeagueStatsHubModel(buildLeagueWithRecordedGame());

  it("sources player stats from season totals (not the empty fallback)", () => {
    expect(model.statSources.playerStats).toBe("seasonStats");
  });

  it("shows the correct NON-ZERO passing leader", () => {
    const top = model.playerLeaders.passing[0];
    expect(top.name).toBe("Test QB");
    expect(top.passYds).toBe(305);
    expect(top.passTd).toBe(3);
  });

  it("shows the correct NON-ZERO rushing leader", () => {
    const top = model.playerLeaders.rushing[0];
    expect(top.name).toBe("Test RB");
    expect(top.rushYds).toBe(128);
    expect(top.rushTd).toBe(2);
  });

  it("shows the correct NON-ZERO receiving leader", () => {
    const top = model.playerLeaders.receiving[0];
    expect(top.name).toBe("Test WR");
    expect(top.recYds).toBe(142);
  });

  it("shows the correct NON-ZERO defensive leader", () => {
    const top = model.playerLeaders.defense[0];
    expect(top.name).toBe("Test LB");
    expect(top.tkl).toBe(12);
    expect(top.sack).toBe(1.5);
  });

  it("derives team scoring from the completed game (score-only at minimum)", () => {
    expect(["scoreOnly", "gameTeamStats", "partial"]).toContain(model.statSources.teamStats);
    const alphas = model.teamRankings.offense.find((r) => r.team === "AAA");
    expect(alphas.pf).toBe(24);
    expect(alphas.pa).toBe(17);
    // Team rankings are NOT flagged unavailable when a completed game exists.
    expect(model.warnings.join(" ")).not.toMatch(/did not record team stats or scores/i);
  });

  it("renders all-zero placeholders ONLY when nothing has been recorded", () => {
    const empty = buildLeagueStatsHubModel({
      seasonId: 2026,
      teams: [{ id: 1, abbr: "AAA", roster: [{ id: "x", name: "Nobody", pos: "QB" }] }],
      schedule: { weeks: [{ week: 1, games: [{ home: 1, away: 2, played: false }] }] },
    });
    expect(empty.playerLeaders.passing.every((r) => r.passYds === 0)).toBe(true);
    expect(empty.statSources.teamStats).toBe("unavailable");
  });
});
