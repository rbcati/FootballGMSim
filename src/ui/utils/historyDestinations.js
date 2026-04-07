export function resolveHistoryDestination(tab) {
  if (tab === 'Team History') return 'team';
  if (tab === 'Hall of Fame') return 'hof';
  if (tab === 'Awards & Records') return 'awards_records';
  return 'league';
}

export function filterAwardRows(rows = [], scope = 'all') {
  if (scope === 'recent') return rows.slice(-24).reverse();
  if (scope === 'mvp') return rows.filter((r) => r.award === 'MVP');
  return rows;
}
