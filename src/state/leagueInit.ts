import { buildDefaultLeague } from '../data/defaultLeague';

const DEFAULT_TIMEOUT_MS = 5000;

export function getPlayableLeagueValidation(league: any) {
  const reasons: string[] = [];
  if (!league || typeof league !== 'object') {
    return { valid: false, reasons: ['No league state received'] };
  }
  if (!league.phase) reasons.push('Missing phase');
  if (typeof league.week !== 'number') reasons.push('Missing week number');
  if (typeof league.year !== 'number' && typeof league.seasonId !== 'number' && typeof league.season !== 'number') reasons.push('Missing season/year');
  if (!Array.isArray(league.teams) || league.teams.length < 2) reasons.push('Teams unavailable');
  const inferredUserTeamId = league.userTeamId ?? league.teams?.[0]?.id;
  const hasUserTeam = inferredUserTeamId != null && league.teams.some((t: any) => Number(t?.id) === Number(inferredUserTeamId));
  if (!hasUserTeam) reasons.push('User team missing');
  const hasRosterData = league.teams.some((team: any) => Array.isArray(team?.roster) ? team.roster.length > 0 : Array.isArray(team?.players) && team.players.length > 0);
  if (!hasRosterData && Array.isArray(league.players) && league.players.length > 0) {
    // valid roster fallback via flattened player pool
  } else if (!hasRosterData) {
    reasons.push('No roster/player data');
  }
  const weeks = league?.schedule?.weeks;
  if (!Array.isArray(weeks) || weeks.length === 0) reasons.push('Schedule missing');
  const hasGames = weeks.some((w: any) => Array.isArray(w?.games) && w.games.length > 0);
  if (!hasGames) reasons.push('No games available');

  return {
    valid: reasons.length === 0,
    reasons,
  };
}

export function isPlayableLeagueState(league: any) {
  return getPlayableLeagueValidation(league).valid;
}

export async function requestPlayableLeagueState(payload: unknown, fetchImpl: typeof fetch = fetch) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetchImpl('/.netlify/functions/createPlayableLeague', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`League API failed with status ${response.status}`);
    }

    const data = await response.json();
    const league = data?.league ?? data;
    if (!isPlayableLeagueState(league)) {
      throw new Error('No league state received');
    }

    return { league, source: 'api' as const };
  } catch (error) {
    if (typeof console !== 'undefined') {
      console.warn('[leagueInit] Falling back to offline league bootstrap.', error);
    }
    const fallbackLeague = buildDefaultLeague();
    return {
      league: fallbackLeague,
      source: 'fallback' as const,
      error: error instanceof Error ? error.message : 'Unknown league init error',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
