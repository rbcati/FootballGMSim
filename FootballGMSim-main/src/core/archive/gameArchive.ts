import { buildCanonicalGameId } from "../gameIdentity.js";

export const GAME_ARCHIVE_STORAGE_KEY = "footballgm_game_archive_v1";

type AnyObject = Record<string, any>;

export type ArchivedGame = {
  id: string;
  season: string | number | null;
  week: number | null;
  homeId: number | null;
  awayId: number | null;
  homeAbbr: string;
  awayAbbr: string;
  score: { home: number | null; away: number | null };
  teamStats: AnyObject | null;
  playerStats: AnyObject | null;
  scoringSummary: AnyObject[];
  driveSummary?: AnyObject[];
  quarterScores?: { home?: Array<number | null>; away?: Array<number | null> } | null;
  recapText: string | null;
  logs: AnyObject[];
  timestamp: number;
  summary?: AnyObject | null;
};

function toNumberOrNull(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeRead(): Record<string, ArchivedGame> {
  try {
    const raw = localStorage.getItem(GAME_ARCHIVE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    if (parsed.games && typeof parsed.games === "object") return parsed.games;
    return parsed;
  } catch {
    return {};
  }
}

function safeWrite(games: Record<string, ArchivedGame>) {
  try {
    localStorage.setItem(
      GAME_ARCHIVE_STORAGE_KEY,
      JSON.stringify({ version: 1, games }),
    );
  } catch {
    // non-fatal
  }
}

export function saveGame(gameId: string | null | undefined, payload: AnyObject) {
  const season = payload?.season ?? payload?.seasonId ?? null;
  const week = toNumberOrNull(payload?.week);
  const homeId = toNumberOrNull(payload?.homeId ?? payload?.home);
  const awayId = toNumberOrNull(payload?.awayId ?? payload?.away);
  const resolvedId = String(
    gameId
      || payload?.id
      || payload?.gameId
      || buildCanonicalGameId({ seasonId: season, week, homeId, awayId }),
  );

  if (!resolvedId || resolvedId === "null") return null;
  const games = safeRead();
  const existing = games[resolvedId] ?? {};
  const next: ArchivedGame = {
    id: resolvedId,
    season,
    week,
    homeId,
    awayId,
    homeAbbr: String(payload?.homeAbbr ?? payload?.homeTeam?.abbr ?? existing?.homeAbbr ?? "HME"),
    awayAbbr: String(payload?.awayAbbr ?? payload?.awayTeam?.abbr ?? existing?.awayAbbr ?? "AWY"),
    score: {
      home: toNumberOrNull(payload?.homeScore ?? payload?.score?.home ?? existing?.score?.home),
      away: toNumberOrNull(payload?.awayScore ?? payload?.score?.away ?? existing?.score?.away),
    },
    teamStats: payload?.teamStats ?? existing?.teamStats ?? null,
    playerStats: payload?.playerStats ?? existing?.playerStats ?? null,
    scoringSummary: Array.isArray(payload?.scoringSummary) ? payload.scoringSummary : (existing?.scoringSummary ?? []),
    driveSummary: Array.isArray(payload?.driveSummary) ? payload.driveSummary : (existing?.driveSummary ?? []),
    quarterScores: payload?.quarterScores ?? existing?.quarterScores ?? null,
    recapText: payload?.recapText ?? payload?.recap ?? existing?.recapText ?? null,
    logs: Array.isArray(payload?.logs) ? payload.logs : (existing?.logs ?? []),
    summary: payload?.summary ?? existing?.summary ?? null,
    timestamp: Number(payload?.timestamp ?? Date.now()),
  };

  games[resolvedId] = next;
  safeWrite(games);
  return next;
}

export function getGame(gameId: string | null | undefined): ArchivedGame | null {
  if (!gameId) return null;
  const games = safeRead();
  return games[String(gameId)] ?? null;
}

export function getRecentGames(limit = 10): ArchivedGame[] {
  const items = Object.values(safeRead());
  return items
    .sort((a, b) => {
      const seasonDiff = Number(b?.season ?? 0) - Number(a?.season ?? 0);
      if (seasonDiff) return seasonDiff;
      const weekDiff = Number(b?.week ?? 0) - Number(a?.week ?? 0);
      if (weekDiff) return weekDiff;
      return Number(b?.timestamp ?? 0) - Number(a?.timestamp ?? 0);
    })
    .slice(0, Math.max(0, Number(limit) || 10));
}

export function getGamesByWeek(season: string | number, week: number): ArchivedGame[] {
  const seasonKey = String(season ?? "");
  const weekNum = Number(week);
  return Object.values(safeRead())
    .filter((game) => String(game?.season ?? "") === seasonKey && Number(game?.week) === weekNum)
    .sort((a, b) => Number(a?.timestamp ?? 0) - Number(b?.timestamp ?? 0));
}
