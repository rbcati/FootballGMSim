import { buildDefaultLeague } from '../data/defaultLeague';

const DEFAULT_TIMEOUT_MS = 5000;

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
    if (!league || !league.phase || typeof league.week !== 'number' || !Array.isArray(league.teams) || league.teams.length === 0) {
      throw new Error('No league state received');
    }

    return { league, source: 'api' as const };
  } catch (error) {
    return {
      league: buildDefaultLeague(),
      source: 'fallback' as const,
      error: error instanceof Error ? error.message : 'Unknown league init error',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
