export function getPlayerProfileId(playerOrId) {
  if (playerOrId == null) return null;
  if (typeof playerOrId === 'object') return playerOrId.id ?? playerOrId.playerId ?? playerOrId.prospectId ?? null;
  return playerOrId;
}

export function hasValidPlayerProfileId(playerOrId) {
  const id = getPlayerProfileId(playerOrId);
  return id != null && String(id).trim() !== '' && String(id) !== 'NaN';
}

export function buildPlayerProfileContext(source, context = {}) {
  return {
    source: source ?? context?.source ?? 'unknown',
    ...context,
  };
}

export function openPlayerProfile(playerOrId, onOpen, context = {}) {
  const playerId = getPlayerProfileId(playerOrId);
  if (!hasValidPlayerProfileId(playerId) || typeof onOpen !== 'function') return false;
  onOpen(playerId, buildPlayerProfileContext(context?.source, context));
  return true;
}
