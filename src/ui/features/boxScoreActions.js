import { canOpenBoxScore } from '../../state/selectors.js';

export function openBoxScore(gameOrId, onOpen) {
  if (typeof onOpen !== 'function') return false;
  if (typeof gameOrId === 'string' || typeof gameOrId === 'number') {
    onOpen(String(gameOrId));
    return true;
  }
  if (!canOpenBoxScore(gameOrId)) return false;
  onOpen(String(gameOrId.gameId ?? gameOrId.id));
  return true;
}
