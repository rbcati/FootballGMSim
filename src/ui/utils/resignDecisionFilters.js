/**
 * Shared triage-tab config for expiring-contract list surfaces (Financials +
 * Roster). Filters operate on the already-computed recommendation fields
 * (tier/negotiationRisk/replacementDifficulty) — never re-derives them.
 *
 * Rows may carry the recommendation inline under `_resignMeta` (Roster
 * enriched rows; the default) or anywhere reachable through a custom
 * accessor (Financials passes `(row) => row.rec`).
 *
 * Tiers 'resign_if_price' and 'replaceable_depth' intentionally have no
 * dedicated tab — those rows surface under All only.
 */

function normalizeLevel(value) {
  return String(value ?? '').trim().toLowerCase();
}

function getMeta(row) {
  return row?._resignMeta ?? {};
}

export const RESIGN_DECISION_TAB_DEFS = [
  { id: 'all', key: 'all', label: 'All', test: () => true },
  { id: 'priority', key: 'priority', label: 'Priority', test: (d) => d?.tier === 'priority_resign' },
  { id: 'high-risk', key: 'high_risk', label: 'High Risk', test: (d) => normalizeLevel(d?.negotiationRisk) === 'high' },
  { id: 'hard-to-replace', key: 'hard_to_replace', label: 'Hard to Replace', test: (d) => normalizeLevel(d?.replacementDifficulty) === 'high' },
  { id: 'let-walk', key: 'let_walk', label: 'Let Walk', test: (d) => d?.tier === 'let_walk' },
  { id: 'trade-tag', key: 'trade_or_tag', label: 'Trade / Tag', test: (d) => d?.tier === 'trade_or_tag' },
];

export const RESIGN_DECISION_DEFAULT_TAB = RESIGN_DECISION_TAB_DEFS[0].key;

/**
 * Builds { id, key, label, count } tabs. Counts always come from the full
 * (unfiltered) row set, regardless of which tab is active.
 */
export function buildResignDecisionTabs(rows = [], getDecision = getMeta) {
  return RESIGN_DECISION_TAB_DEFS.map(({ id, key, label, test }) => ({
    id,
    key,
    label,
    count: rows.filter((row) => test(getDecision(row))).length,
  }));
}

/**
 * Returns the rows matching the active tab, preserving insertion order and
 * never mutating the source. The 'all' tab — and any unknown tab id — returns
 * the original array reference unchanged.
 *
 * Callable as (rows, activeTab) for `_resignMeta` rows, or as
 * (rows, getDecision, activeTab) with a custom accessor. Tabs match by
 * either `id` ('high-risk') or `key` ('high_risk').
 */
export function filterResignDecisionRows(rows = [], getDecisionOrTab, maybeTab) {
  const usesAccessor = typeof getDecisionOrTab === 'function';
  const getDecision = usesAccessor ? getDecisionOrTab : getMeta;
  const activeTab = usesAccessor ? maybeTab : getDecisionOrTab;
  const def = RESIGN_DECISION_TAB_DEFS.find((t) => t.id === activeTab || t.key === activeTab);
  if (!def || def.id === 'all') return rows;
  return rows.filter((row) => def.test(getDecision(row)));
}
