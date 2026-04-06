const SAVE_ID_PATTERN = /^[a-zA-Z0-9_-]{3,128}$/;

export function isValidSaveId(id) {
  if (typeof id !== 'string') return false;
  return SAVE_ID_PATTERN.test(id.trim());
}

export function normalizeSaveEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const id = String(entry.id ?? '').trim();
  if (!isValidSaveId(id)) return null;

  const normalized = {
    id,
    name: String(entry.name || `League ${id}`).trim(),
    year: Number.isFinite(Number(entry.year)) ? Number(entry.year) : null,
    teamId: entry.teamId ?? null,
    teamAbbr: String(entry.teamAbbr || '???').trim() || '???',
    lastPlayed: Number.isFinite(Number(entry.lastPlayed)) ? Number(entry.lastPlayed) : 0,
  };

  return normalized;
}

export function sanitizeSaveList(rawSaves = []) {
  const deduped = new Map();
  const dropped = [];

  for (const raw of rawSaves) {
    const normalized = normalizeSaveEntry(raw);
    if (!normalized) {
      dropped.push(raw);
      continue;
    }
    const existing = deduped.get(normalized.id);
    if (!existing || normalized.lastPlayed > existing.lastPlayed) {
      deduped.set(normalized.id, normalized);
    }
  }

  const saves = [...deduped.values()].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  return { saves, dropped };
}
