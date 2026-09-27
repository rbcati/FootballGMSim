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
