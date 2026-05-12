export function normalizeSearchText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function rowMatchesSearch(row, query, fields = []) {
  const needle = normalizeSearchText(query);
  if (!needle) return true;
  const haystack = fields
    .map((field) => (typeof field === "function" ? field(row) : row?.[field]))
    .filter((value) => value != null)
    .join(" ");
  return normalizeSearchText(haystack).includes(needle);
}

export function compareValues(aValue, bValue, direction = "asc") {
  const dir = direction === "desc" ? -1 : 1;
  const aNum = Number(aValue);
  const bNum = Number(bValue);
  const bothNumeric = Number.isFinite(aNum) && Number.isFinite(bNum) && String(aValue ?? "").trim() !== "" && String(bValue ?? "").trim() !== "";
  if (bothNumeric) {
    if (aNum === bNum) return 0;
    return aNum > bNum ? dir : -dir;
  }
  const textCompare = String(aValue ?? "").localeCompare(String(bValue ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return textCompare * dir;
}

export function stableSortRows(rows = [], getValue, direction = "asc", fallbackGetValue = null) {
  return [...(Array.isArray(rows) ? rows : [])]
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const primary = compareValues(getValue?.(a.row), getValue?.(b.row), direction);
      if (primary !== 0) return primary;
      if (fallbackGetValue) {
        const fallback = compareValues(fallbackGetValue(a.row), fallbackGetValue(b.row), "asc");
        if (fallback !== 0) return fallback;
      }
      return a.index - b.index;
    })
    .map(({ row }) => row);
}

export function uniqueFilterOptions(rows = [], getValue) {
  return Array.from(new Set((Array.isArray(rows) ? rows : []).map(getValue).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

export function buildShowingLabel(visibleCount, totalCount, noun = "row") {
  const safeVisible = Number.isFinite(Number(visibleCount)) ? Number(visibleCount) : 0;
  const safeTotal = Number.isFinite(Number(totalCount)) ? Number(totalCount) : 0;
  const label = safeTotal === 1 ? noun : `${noun}s`;
  return `Showing ${safeVisible} of ${safeTotal} ${label}`;
}
