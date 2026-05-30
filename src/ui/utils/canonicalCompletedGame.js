/**
 * resolveCanonicalCompletedGame
 *
 * Archive-first canonical resolution for any completed-game display surface.
 *
 * Priority rule:
 *  1. archivedGame with valid final score wins absolutely for homeScore/awayScore.
 *  2. scheduleGame fills only missing metadata (abbr, week, ids); never overrides archived scores.
 *  3. league.gameById[gameId] is last resort with the same merge rules.
 *
 * Guarantees:
 *  - Never returns 0-0 when the archive has a real final score.
 *  - Never surfaces "finished tied" if the archive shows a winner.
 *  - Side-effect free; does not mutate any input object.
 *
 * Returns null only when no game reference is available at all.
 */

function extractScoreFields(game) {
  const home = Number(game?.homeScore ?? game?.scoreHome ?? game?.score?.home);
  const away = Number(game?.awayScore ?? game?.scoreAway ?? game?.score?.away);
  return { home, away };
}

function hasValidFinalScore(game) {
  if (!game || typeof game !== 'object') return false;
  const { home, away } = extractScoreFields(game);
  return Number.isFinite(home) && Number.isFinite(away);
}

export function resolveCanonicalCompletedGame({ league, gameId, scheduleGame, archivedGame } = {}) {
  const archived = archivedGame ?? null;
  const schedule = scheduleGame ?? null;
  const byId = (gameId != null && league?.gameById)
    ? (league.gameById[String(gameId)] ?? null)
    : null;

  if (archived && hasValidFinalScore(archived)) {
    // Archive has a valid final score — it wins absolutely for score fields.
    // Always normalize homeScore/awayScore so callers get consistent field names
    // regardless of whether the archive used scoreHome, score.home, etc.
    const { home: archivedHome, away: archivedAway } = extractScoreFields(archived);
    const meta = schedule ?? byId;
    if (!meta) {
      return { ...archived, homeScore: archivedHome, awayScore: archivedAway };
    }
    return {
      ...meta,
      ...archived,
      homeScore: archivedHome,
      awayScore: archivedAway,
      homeAbbr: archived.homeAbbr ?? meta.homeAbbr,
      awayAbbr: archived.awayAbbr ?? meta.awayAbbr,
      id: archived.id ?? archived.gameId ?? meta.id ?? meta.gameId,
      gameId: archived.gameId ?? archived.id ?? meta.gameId ?? meta.id,
    };
  }

  // No archived score — fall through to schedule, then league.gameById
  if (schedule && hasValidFinalScore(schedule)) return schedule;
  if (byId && hasValidFinalScore(byId)) return byId;

  // Return best available reference even if score is incomplete
  return archived ?? schedule ?? byId ?? null;
}

export function isValidGameId(gameId) {
  if (gameId == null) return false;
  const s = String(gameId).trim();
  return s !== '' && s !== 'undefined' && s !== 'null';
}
