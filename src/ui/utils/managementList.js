export function applyRangeFilter(value, [min, max]) {
  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  return n >= min && n <= max;
}

export function inTier(value, tier = 'all') {
  const n = Number(value ?? 0);
  if (tier === 'all') return true;
  if (tier === 'elite') return n >= 85;
  if (tier === 'starter') return n >= 75 && n < 85;
  if (tier === 'depth') return n >= 65 && n < 75;
  if (tier === 'fringe') return n < 65;
  return true;
}

export function normalizeViewMode(mode, options = ['cards', 'table']) {
  return options.includes(mode) ? mode : options[0];
}

export function cycleSort(currentKey, currentDir, nextKey, defaultDescKeys = []) {
  if (currentKey === nextKey) {
    return { key: nextKey, dir: currentDir === 'asc' ? 'desc' : 'asc' };
  }
  return { key: nextKey, dir: defaultDescKeys.includes(nextKey) ? 'desc' : 'asc' };
}

export function createQuickActionState(initialId = null) {
  return { openForId: initialId };
}

export function toggleQuickAction(state, id) {
  return { openForId: state?.openForId === id ? null : id };
}
