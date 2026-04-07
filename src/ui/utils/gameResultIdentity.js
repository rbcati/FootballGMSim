import { buildCanonicalGameId } from '../../core/gameIdentity.js';

export function resolveCompletedGameId(result, context = {}) {
  if (result?.gameId) return result.gameId;
  return buildCanonicalGameId({
    seasonId: result?.seasonId ?? context?.seasonId,
    week: result?.week ?? context?.week,
    homeId: result?.homeId ?? result?.home,
    awayId: result?.awayId ?? result?.away,
  });
}
