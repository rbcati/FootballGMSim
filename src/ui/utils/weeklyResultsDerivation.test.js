import { describe, it, expect } from "vitest";
import {
  getGameLifecycleBucket,
  selectWeekGames,
  resolveDefaultResultsWeek,
} from "./gameCenterResults.js";

/**
 * Weekly Results derivation regression (Priority 3).
 *
 * Weekly Results, standings, and the schedule all read from ONE canonical
 * store: the slim schedule on the league view-model. After the user plays a
 * game, the worker writes `played: true` + scores into that slim schedule game.
 * These tests pin the contract so Weekly Results can never drift from standings
 * (e.g. standings 1-0 while Weekly Results shows 0 completed games).
 */

// A week-1 slim schedule where the user (team 1) game has been played and the
// rest of the week is still upcoming — exactly the post-user-game state.
function scheduleAfterUserGame() {
  return {
    weeks: [
      {
        week: 1,
        games: [
          { id: "g1", week: 1, home: 1, away: 2, played: true, homeScore: 27, awayScore: 20 },
          { id: "g2", week: 1, home: 3, away: 4, played: false },
          { id: "g3", week: 1, home: 5, away: 6, played: false },
        ],
      },
    ],
  };
}

describe("Weekly Results derivation after one user game", () => {
  const schedule = scheduleAfterUserGame();
  const games = selectWeekGames(schedule, 1);
  const buckets = games.map(getGameLifecycleBucket);

  it("buckets the played user game as completed and the rest as upcoming", () => {
    expect(buckets).toEqual(["completed", "upcoming", "upcoming"]);
  });

  it("reports exactly 1 completed game (matches a 1-0/0-1 standings change)", () => {
    const completed = buckets.filter((b) => b === "completed").length;
    expect(completed).toBe(1);
  });

  it("decrements the upcoming count for the week", () => {
    const upcoming = buckets.filter((b) => b === "upcoming").length;
    expect(upcoming).toBe(games.length - 1);
    expect(upcoming).toBe(2);
  });

  it("exposes the SAME final score that standings derive their W/L from", () => {
    const userGame = games.find((g) => Number(g.home) === 1);
    expect(userGame.homeScore).toBe(27);
    expect(userGame.awayScore).toBe(20);
    // Standings derive the home win from the identical score fields.
    const homeWon = Number(userGame.homeScore) > Number(userGame.awayScore);
    expect(homeWon).toBe(true);
  });

  it("defaults the Weekly Results view to the week that has the completed game", () => {
    // currentWeek is still 1 (week not fully advanced); the completed game lives there.
    expect(resolveDefaultResultsWeek(schedule, { currentWeek: 1 })).toBe(1);
  });

  it("treats an unplayed game with no scores as upcoming (no false completion)", () => {
    expect(getGameLifecycleBucket({ home: 1, away: 2, played: false })).toBe("upcoming");
    expect(getGameLifecycleBucket({ home: 1, away: 2 })).toBe("upcoming");
  });
});
