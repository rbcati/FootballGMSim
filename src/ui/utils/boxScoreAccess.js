import { buildCanonicalGameId, toTeamId } from "../../core/gameIdentity.js";
import { normalizeArchivedGamePayload, readStrictFinalScore, recoverArchivedGameFromSchedule } from "../../core/gameArchive.js";
import { buildBoxScoreViewModel } from "./boxScoreViewModel.js";

const ARCHIVE_QUALITY_LABELS = {
  full: "Full detail",
  partial: "Partial detail",
  score: "Score only",
  missing: "Missing detail",
};

function archiveQualityKey(label) {
  if (label === "Full detail") return "full";
  if (label === "Partial detail") return "partial";
  if (label === "Score only") return "score";
  return "missing";
}

function hasFinalScore(game) {
  return readStrictFinalScore(game) != null;
}

export function inferCompletedGameIdentity(game, context = {}) {
  if (!game || typeof game !== "object") return null;
  if (typeof game.gameId === "string" && game.gameId) return game.gameId;
  if (typeof game.id === "string" && /_w\d+_\d+_\d+/.test(game.id)) return game.id;
  return buildCanonicalGameId({
    seasonId: game?.seasonId ?? context?.seasonId,
    week: game?.week ?? context?.week,
    homeId: game?.homeId ?? game?.home,
    awayId: game?.awayId ?? game?.away,
  });
}

export function normalizeCompletedGameRecord(game, context = {}) {
  if (!game || typeof game !== "object") return null;
  return {
    ...game,
    homeId: toTeamId(game?.homeId ?? game?.home),
    awayId: toTeamId(game?.awayId ?? game?.away),
    seasonId: game?.seasonId ?? context?.seasonId ?? null,
    week: (game?.week ?? context?.week) == null ? null : Number(game?.week ?? context?.week),
  };
}

export function resolveBoxScoreGameId(game, context = {}) {
  const normalized = normalizeCompletedGameRecord(game, context);
  if (!normalized) return null;
  return inferCompletedGameIdentity(normalized, context);
}

export function getBoxScoreAvailability(game, context = {}) {
  const normalized = normalizeArchivedGamePayload(normalizeCompletedGameRecord(game, context) ?? game);
  const resolvedGameId = resolveBoxScoreGameId(normalized, context);
  const isCompleted = hasFinalScore(normalized);
  const vm = buildBoxScoreViewModel({
    league: { teams: Object.values(context?.teamById ?? {}) },
    game: normalized,
    gameId: resolvedGameId,
    context,
  });
  const archiveQuality = archiveQualityKey(vm?.archiveQuality);
  const canOpen = Boolean(isCompleted && resolvedGameId);
  let fallbackReason = null;
  if (!isCompleted) fallbackReason = "Game not completed";
  else if (!resolvedGameId) fallbackReason = "Missing game identity";
  else if (!canOpen) fallbackReason = "Archive unavailable";
  return { resolvedGameId, archiveQuality, archiveQualityLabel: vm?.archiveQuality ?? ARCHIVE_QUALITY_LABELS.missing, canOpen, fallbackReason, isCompleted };
}

export function getArchiveQualityLabel(archiveQuality) {
  return ARCHIVE_QUALITY_LABELS[archiveQuality] ?? ARCHIVE_QUALITY_LABELS.missing;
}

export function buildCompletedGamePresentation(game, context = {}) {
  const availability = getBoxScoreAvailability(game, context);
  const finalScore = readStrictFinalScore(game);
  const away = context?.teamById?.[toTeamId(game?.awayId ?? game?.away)] ?? null;
  const home = context?.teamById?.[toTeamId(game?.homeId ?? game?.home)] ?? null;
  const displayScoreLine = `${away?.abbr ?? "AWY"} ${finalScore?.away ?? "—"} - ${finalScore?.home ?? "—"} ${home?.abbr ?? "HME"}`;
  return {
    ...availability,
    ctaLabel: availability.canOpen
      ? (availability.archiveQuality === "full"
        ? "Open full Game Book"
        : availability.archiveQuality === "partial"
          ? "Open partial Game Book"
          : "Open score-only Game Book")
      : "View result",
    statusLabel: getArchiveQualityLabel(availability.archiveQuality),
    displayScoreLine,
    away,
    home,
  };
}

export function openResolvedBoxScore(game, context = {}, onOpen) {
  const presentation = buildCompletedGamePresentation(game, context);
  if (!presentation.canOpen || typeof onOpen !== "function") {
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[boxscore] open blocked", {
        source: context?.source ?? "unknown",
        resolvedGameId: presentation.resolvedGameId,
        archiveQuality: presentation.archiveQuality,
        fallbackReason: presentation.fallbackReason,
        game,
      });
    }
    return false;
  }
  onOpen(String(presentation.resolvedGameId));
  return true;
}

export function getGameDetailPayload(gameId, leagueState) {
  if (!gameId || !leagueState?.schedule?.weeks) return null;
  const recovered = recoverArchivedGameFromSchedule(gameId, leagueState);
  if (recovered) return recovered;
  const [seasonPart, weekPart, homePart, awayPart] = String(gameId).split("_");
  const week = Number((weekPart ?? "").replace("w", ""));
  const awayId = Number(awayPart);
  const homeId = Number(homePart);
  for (const weekRow of leagueState.schedule.weeks) {
    for (const game of weekRow?.games ?? []) {
      const normalized = normalizeArchivedGamePayload(normalizeCompletedGameRecord(game, { seasonId: seasonPart, week: Number(weekRow?.week ?? week) }));
      if (inferCompletedGameIdentity(normalized, { seasonId: seasonPart, week: weekRow?.week }) === gameId) return normalized;
      if (
        Number(weekRow?.week) === week
        && Number(normalized?.homeId) === homeId
        && Number(normalized?.awayId) === awayId
      ) return normalized;
    }
  }
  return null;
}
