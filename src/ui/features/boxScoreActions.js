import { openResolvedBoxScore } from '../utils/boxScoreAccess.js';

export function openBoxScore(gameOrId, onOpen) {
  if (typeof onOpen !== 'function') return false;
  if (typeof gameOrId === 'string' || typeof gameOrId === 'number') {
    onOpen(String(gameOrId));
    return true;
  }
  return openResolvedBoxScore(gameOrId, { source: 'openBoxScore' }, onOpen);
}
