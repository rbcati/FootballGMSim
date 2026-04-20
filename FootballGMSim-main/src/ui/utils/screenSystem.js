export function buildHeaderMetadata(items = []) {
  return items
    .filter((item) => item && item.label && item.value != null && String(item.value).trim() !== '')
    .map((item) => ({ label: String(item.label), value: String(item.value) }));
}

export function getStickyTopOffset(mode = 'default') {
  if (mode === 'compact') return 'calc(env(safe-area-inset-top) + 52px)';
  if (mode === 'detail') return 'calc(env(safe-area-inset-top) + 60px)';
  return 'calc(env(safe-area-inset-top) + 56px)';
}
