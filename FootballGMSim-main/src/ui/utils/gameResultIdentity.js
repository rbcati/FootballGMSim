import { resolveBoxScoreGameId } from './boxScoreAccess.js';

export function resolveCompletedGameId(result, context = {}) {
  return resolveBoxScoreGameId(result, context);
}
