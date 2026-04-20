const DEFAULT_CATEGORY = 'passing';

export function getCategoryKeys(categories = {}) {
  return Object.keys(categories).filter((key) => {
    const stats = categories[key] ?? {};
    return Object.values(stats).some((rows) => Array.isArray(rows) && rows.length > 0);
  });
}

export function getStatKeysForCategory(categories = {}, category) {
  return Object.keys(categories?.[category] ?? {}).filter((statKey) => {
    const rows = categories?.[category]?.[statKey];
    return Array.isArray(rows) && rows.length > 0;
  });
}

export function coerceLeaderboardSelection({ categories = {}, selection = {} }) {
  const categoryKeys = getCategoryKeys(categories);
  const category = categoryKeys.includes(selection?.category) ? selection.category : (categoryKeys[0] ?? DEFAULT_CATEGORY);
  const statKeys = getStatKeysForCategory(categories, category);
  const statKey = statKeys.includes(selection?.statKey) ? selection.statKey : (statKeys[0] ?? null);
  return { category, statKey, categoryKeys, statKeys };
}
