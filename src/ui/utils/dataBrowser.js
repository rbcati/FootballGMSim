/**
 * dataBrowser.js — Reusable data-browsing helpers for search, sort, filter,
 * and presentation across history/archive surfaces.
 *
 * Used by Team History, Player Profile, League History, League Activity, etc.
 */

/**
 * Lowercase + trim for search comparison. Returns '' for nullish input.
 * @param {*} text
 * @returns {string}
 */
export function normalizeSearchText(text) {
  if (text == null) return '';
  return String(text).trim().toLowerCase();
}

/**
 * Returns true when `row` matches a search query.
 * Checks every field listed in `keys` against the normalized query.
 *
 * @param {object} row
 * @param {string} query — raw user input (will be normalized)
 * @param {string[]} keys — property names to match against
 * @returns {boolean}
 */
export function rowMatchesSearch(row, query, keys) {
  const q = normalizeSearchText(query);
  if (!q) return true;
  if (!row || !keys?.length) return false;
  return keys.some((k) => {
    const v = row[k];
    if (v == null) return false;
    return normalizeSearchText(v).includes(q);
  });
}

/**
 * Compare two values for sorting (numbers compared numerically,
 * strings compared with localeCompare, nullish pushed to the end).
 *
 * @param {*} a
 * @param {*} b
 * @param {'asc'|'desc'} dir
 * @returns {number}
 */
export function compareValues(a, b, dir = 'asc') {
  const aNull = a == null || a === '';
  const bNull = b == null || b === '';
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;

  const aNum = Number(a);
  const bNum = Number(b);
  const bothNumeric = Number.isFinite(aNum) && Number.isFinite(bNum);

  let cmp;
  if (bothNumeric) {
    cmp = aNum - bNum;
  } else {
    cmp = String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
  }
  return dir === 'desc' ? -cmp : cmp;
}

/**
 * Stable sort that preserves original order for equal elements.
 *
 * @param {Array} rows
 * @param {string} key — property to sort by
 * @param {'asc'|'desc'} dir
 * @returns {Array} — new sorted array
 */
export function stableSortRows(rows, key, dir = 'asc') {
  if (!rows?.length || !key) return rows ?? [];
  const indexed = rows.map((row, i) => ({ row, i }));
  indexed.sort((a, b) => {
    const cmp = compareValues(a.row[key], b.row[key], dir);
    return cmp !== 0 ? cmp : a.i - b.i;
  });
  return indexed.map((e) => e.row);
}

/**
 * Extract unique non-empty string values for a given key from rows.
 * Useful for building filter dropdowns.
 *
 * @param {Array} rows
 * @param {string} key
 * @returns {string[]}
 */
export function uniqueFilterOptions(rows, key) {
  if (!rows?.length || !key) return [];
  const set = new Set();
  for (const row of rows) {
    const v = row[key];
    if (v != null && v !== '') set.add(String(v));
  }
  return [...set].sort();
}

/**
 * Build a "Showing X of Y items" label.
 *
 * @param {number} visible
 * @param {number} total
 * @param {string} [noun='items']
 * @returns {string}
 */
export function buildShowingLabel(visible, total, noun = 'items') {
  if (total === 0) return `No ${noun}`;
  if (visible === total) return `${total} ${noun}`;
  return `Showing ${visible} of ${total} ${noun}`;
}
