/**
 * Stable metadata for completed games (migration + UI consumers).
 * Player/team counting stats come from the simulator / box score — not invented here.
 */

import { buildGameBookVmFromBoxMaps, buildGameBookStory } from './gameBookNarrative.js';
import { snapshotTopPerformers } from './gameBookPerformers.js';

export const COMPLETED_GAME_RESULT_SCHEMA_VERSION = 1;

export function resolveWinnerTeamId(homeTeamId, awayTeamId, homeScore, awayScore) {
  const h = Number(homeScore);
  const a = Number(awayScore);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  if (h > a) return homeTeamId ?? null;
  if (a > h) return awayTeamId ?? null;
  return null;
}

/**
 * @param {object} params
 * @returns {object} Fields to merge onto commitGameResult output
 */
export function buildCompletedGameEnrichment({
  league,
  gameData,
  homeTeamId,
  awayTeamId,
  homeScore,
  awayScore,
  homeAbbr,
  awayAbbr,
  isPlayoff,
  teamStats,
  homeBox,
  awayBox,
  scoringSummary,
}) {
  const seasonId = league?.seasonId ?? (league?.year != null ? String(league.year) : null);
  const week = league?.week ?? gameData?.week ?? null;
  const phase = gameData?.phase ?? league?.phase ?? (isPlayoff ? 'playoffs' : 'regular');

  const vm = buildGameBookVmFromBoxMaps({
    homeAbbr,
    awayAbbr,
    homeScore,
    awayScore,
    teamStats,
    homeBox,
    awayBox,
    scoringSummary,
  });

  const gameNarrative = buildGameBookStory(vm);
  const topPerformers = snapshotTopPerformers(vm);

  return {
    seasonId,
    week,
    phase,
    winnerTeamId: resolveWinnerTeamId(homeTeamId, awayTeamId, homeScore, awayScore),
    topPerformers,
    gameNarrative,
    resultSchemaVersion: COMPLETED_GAME_RESULT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
  };
}
