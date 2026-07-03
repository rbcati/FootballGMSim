/**
 * Shared triage-tab config for expiring-contract list surfaces (Financials +
 * Roster). Filters operate on the already-computed recommendation fields
 * (tier/negotiationRisk/replacementDifficulty) — never re-derives them.
 */

function normalizeLevel(value) {
  return String(value ?? '').trim().toLowerCase();
}

export const RESIGN_DECISION_TAB_DEFS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'priority', label: 'Priority', test: (d) => d?.tier === 'priority_resign' },
  { key: 'high_risk', label: 'High Risk', test: (d) => normalizeLevel(d?.negotiationRisk) === 'high' },
  { key: 'hard_to_replace', label: 'Hard to Replace', test: (d) => normalizeLevel(d?.replacementDifficulty) === 'high' },
  { key: 'let_walk', label: 'Let Walk', test: (d) => d?.tier === 'let_walk' },
  { key: 'trade_or_tag', label: 'Trade / Tag', test: (d) => d?.tier === 'trade_or_tag' },
];

export const RESIGN_DECISION_DEFAULT_TAB = RESIGN_DECISION_TAB_DEFS[0].key;

/** Builds { key, label, count } tabs from an unfiltered row set. */
export function buildResignDecisionTabs(rows = [], getDecision) {
  return RESIGN_DECISION_TAB_DEFS.map(({ key, label, test }) => ({
    key,
    label,
    count: rows.filter((row) => test(getDecision(row))).length,
  }));
}

/** Returns a new filtered array; never mutates or reorders the source rows. */
export function filterResignDecisionRows(rows = [], getDecision, activeTabKey) {
  const def = RESIGN_DECISION_TAB_DEFS.find((t) => t.key === activeTabKey) ?? RESIGN_DECISION_TAB_DEFS[0];
  return rows.filter((row) => def.test(getDecision(row)));
}
