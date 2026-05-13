/**
 * dataBrowser.js — Reusable data-browsing helpers for search, sort, filter,
 * and presentation across history/archive surfaces.
 */

export function normalizeSearchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function readField(row, field) {
  if (typeof field === 'function') return field(row);
  return row?.[field];
}

export function rowMatchesSearch(row, query, fields = []) {
  const needle = normalizeSearchText(query);
  if (!needle) return true;
  if (!row || !fields?.length) return false;
  const haystack = fields
    .map((field) => readField(row, field))
    .filter((value) => value != null && value !== '')
    .join(' ');
  return normalizeSearchText(haystack).includes(needle);
}

export function compareValues(aValue, bValue, direction = 'asc') {
  const dir = direction === 'desc' ? -1 : 1;
  const aEmpty = aValue == null || aValue === '';
  const bEmpty = bValue == null || bValue === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const aNum = Number(aValue);
  const bNum = Number(bValue);
  const bothNumeric = Number.isFinite(aNum) && Number.isFinite(bNum);
  if (bothNumeric) {
    if (aNum === bNum) return 0;
    return aNum > bNum ? dir : -dir;
  }

  return String(aValue).localeCompare(String(bValue), undefined, {
    numeric: true,
    sensitivity: 'base',
  }) * dir;
}

export function stableSortRows(rows = [], keyOrGetter, direction = 'asc', fallbackKeyOrGetter = null) {
  const list = Array.isArray(rows) ? rows : [];
  if (!keyOrGetter) return [...list];
  return list
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const primary = compareValues(readField(a.row, keyOrGetter), readField(b.row, keyOrGetter), direction);
      if (primary !== 0) return primary;
      if (fallbackKeyOrGetter) {
        const fallback = compareValues(readField(a.row, fallbackKeyOrGetter), readField(b.row, fallbackKeyOrGetter), 'asc');
        if (fallback !== 0) return fallback;
      }
      return a.index - b.index;
    })
    .map(({ row }) => row);
}

export function uniqueFilterOptions(rows = [], keyOrGetter) {
  const list = Array.isArray(rows) ? rows : [];
  if (!keyOrGetter) return [];
  return [...new Set(
    list
      .map((row) => readField(row, keyOrGetter))
      .filter((value) => value != null && value !== '')
      .map((value) => String(value)),
  )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

export function buildShowingLabel(visible, total, noun = 'items') {
  const safeVisible = Number.isFinite(Number(visible)) ? Number(visible) : 0;
  const safeTotal = Number.isFinite(Number(total)) ? Number(total) : 0;
  const labelNoun = safeTotal === 1 || noun.endsWith('s') ? noun : `${noun}s`;
  return `Showing ${safeVisible} of ${safeTotal} ${labelNoun}`;
}
