let fallbackSequence = 0;

export function createFranchiseGenerationId() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return `franchise_${globalThis.crypto.randomUUID()}`;
  }
  fallbackSequence += 1;
  return `franchise_${Date.now().toString(36)}_${fallbackSequence.toString(36)}`;
}

export function ensureFranchiseGenerationId(meta = {}, createId = createFranchiseGenerationId) {
  const existing = typeof meta?.franchiseGenerationId === 'string'
    ? meta.franchiseGenerationId.trim()
    : '';
  if (existing) return { meta, franchiseGenerationId: existing, created: false };
  const franchiseGenerationId = createId();
  return {
    meta: { ...meta, franchiseGenerationId },
    franchiseGenerationId,
    created: true,
  };
}

export function prepareCopiedLeagueSnapshot(snapshot = {}, generationMode, createId = createFranchiseGenerationId) {
  if (!['preserve', 'mint'].includes(generationMode)) {
    throw new Error('A franchise generation copy mode is required.');
  }
  if (generationMode === 'preserve' || !Array.isArray(snapshot.meta)) return snapshot;
  return {
    ...snapshot,
    meta: snapshot.meta.map((row) => row?.id === 'league'
      ? { ...row, franchiseGenerationId: createId() }
      : row),
  };
}

export function shouldCopyLeagueForSave(sourceLeagueId, targetLeagueId) {
  return String(sourceLeagueId) !== String(targetLeagueId);
}
