import { describe, expect, it, beforeEach, vi } from "vitest";
import { GAME_ARCHIVE_STORAGE_KEY, getGame, getGamesByWeek, getRecentGames, saveGame } from "./gameArchive";

describe("gameArchive local store", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    });
    localStorage.clear();
    vi.useRealTimers();
  });

  it("saves and fetches an archived game by id", () => {
    saveGame("2026_w7_15_20", {
      season: 2026,
      week: 7,
      homeId: 15,
      awayId: 20,
      homeAbbr: "MIA",
      awayAbbr: "PIT",
      homeScore: 30,
      awayScore: 23,
      recapText: "MIA closed strong in the fourth quarter.",
      logs: [{ quarter: 4, text: "Drive sealed by interception." }],
    });

    const loaded = getGame("2026_w7_15_20");
    expect(loaded?.homeAbbr).toBe("MIA");
    expect(loaded?.awayAbbr).toBe("PIT");
    expect(loaded?.score?.home).toBe(30);
    expect(loaded?.recapText).toContain("closed strong");
    expect(localStorage.getItem(GAME_ARCHIVE_STORAGE_KEY)).toContain("2026_w7_15_20");
  });

  it("returns recent games and week filtering", () => {
    saveGame("2026_w6_1_2", { season: 2026, week: 6, homeId: 1, awayId: 2, homeAbbr: "BUF", awayAbbr: "NYJ", homeScore: 28, awayScore: 17, timestamp: 1000 });
    saveGame("2026_w7_3_4", { season: 2026, week: 7, homeId: 3, awayId: 4, homeAbbr: "MIA", awayAbbr: "PIT", homeScore: 30, awayScore: 23, timestamp: 2000 });
    saveGame("2026_w7_5_6", { season: 2026, week: 7, homeId: 5, awayId: 6, homeAbbr: "KC", awayAbbr: "LV", homeScore: 24, awayScore: 10, timestamp: 3000 });

    const recent = getRecentGames(2);
    expect(recent).toHaveLength(2);
    expect(recent[0]?.id).toBe("2026_w7_5_6");
    expect(recent[1]?.id).toBe("2026_w7_3_4");

    const weekGames = getGamesByWeek(2026, 7);
    expect(weekGames.map((g) => g.id)).toEqual(["2026_w7_3_4", "2026_w7_5_6"]);
  });
});
