import { buildDefaultLeague } from '../data/defaultLeague';

const DEFAULT_TIMEOUT_MS = 5000;

export function getBootViewStateValidation(viewState: any) {
  const reasons: string[] = [];
  if (!viewState || typeof viewState !== 'object') {
    return { valid: false, reasons: ['No league state received'] };
  }

  if (!viewState.phase) reasons.push('Missing phase');
  if (typeof viewState.week !== 'number') reasons.push('Missing week number');
  if (typeof viewState.year !== 'number' && typeof viewState.seasonId !== 'number' && typeof viewState.season !== 'number') {
    reasons.push('Missing season/year');
  }

  const teams = Array.isArray(viewState.teams) ? viewState.teams : [];
  if (teams.length < 2) reasons.push('Teams unavailable');
  const inferredUserTeamId = viewState.userTeamId ?? teams[0]?.id;
  const hasUserTeam = inferredUserTeamId != null && teams.some((t: any) => Number(t?.id) === Number(inferredUserTeamId));
  if (!hasUserTeam) reasons.push('User team missing');

  return {
    valid: reasons.length === 0,
    reasons,
    inferredUserTeamId,
  };
}

export function isBootViewStateReady(viewState: any) {
  return getBootViewStateValidation(viewState).valid;
}

export function getPlayableLeagueValidation(league: any) {
  const bootValidation = getBootViewStateValidation(league);
  const reasons: string[] = [...bootValidation.reasons];
  if (!league || typeof league !== 'object') {
    return { valid: false, reasons };
  }

  const teams = Array.isArray(league.teams) ? league.teams : [];
  const flattenedPlayers = Array.isArray(league.players) ? league.players : [];
  const teamsMissingRoster = teams.filter((team: any) => {
    if (Array.isArray(team?.roster) && team.roster.length > 0) return false;
    if (Array.isArray(team?.players) && team.players.length > 0) return false;
    return !flattenedPlayers.some((player: any) => Number(player?.teamId) === Number(team?.id));
  });
  const hasRosterData = teams.some((team: any) => Array.isArray(team?.roster) ? team.roster.length > 0 : Array.isArray(team?.players) && team.players.length > 0);
  if (teamsMissingRoster.length > 0) {
    reasons.push('No roster/player data');
  } else if (!hasRosterData && flattenedPlayers.length === 0) {
    reasons.push('No roster/player data');
  }

  const weeks = Array.isArray(league?.schedule?.weeks) ? league.schedule.weeks : [];
  if (weeks.length === 0) reasons.push('Schedule missing');
  const hasGames = weeks.some((w: any) => Array.isArray(w?.games) && w.games.length > 0);
  if (!hasGames) reasons.push('No games available');
  const hasScheduledMatchup = weeks.some((w: any) => (w?.games ?? []).some((game: any) => {
    const home = game?.home?.id ?? game?.home ?? game?.homeId;
    const away = game?.away?.id ?? game?.away ?? game?.awayId;
    return home != null && away != null;
  }));
  if (hasGames && !hasScheduledMatchup) reasons.push('No scheduled matchups');

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
