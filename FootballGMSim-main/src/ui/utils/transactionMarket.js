function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function getBudgetLabel({ askAnnual = 0, capRoom = 0 }) {
  const ask = safeNum(askAnnual);
  const cap = safeNum(capRoom);
  if (ask <= Math.max(0, cap) * 0.45) return { label: 'Affordable', tone: 'ok' };
  if (ask <= cap) return { label: 'Stretch', tone: 'warning' };
  return { label: 'Over budget', tone: 'danger' };
}

export function getMarketPlayerTags(player, { capRoom = 0, needs = [], surplus = [] } = {}) {
  const tags = [];
  const yearsLeft = safeNum(player?.contract?.yearsRemaining ?? player?.contract?.years ?? player?.years ?? 0);
  const askAnnual = safeNum(player?.demandProfile?.askAnnual ?? player?._ask ?? player?.contract?.baseAnnual ?? 0);
  const budgetTag = getBudgetLabel({ askAnnual, capRoom });
  tags.push({ label: budgetTag.label, tone: budgetTag.tone });

  if (yearsLeft > 0 && yearsLeft <= 1) tags.push({ label: 'Expiring', tone: 'warning' });
  if (askAnnual >= 18) tags.push({ label: 'Expensive', tone: 'danger' });
  if (safeNum(player?.ovr) >= 78) tags.push({ label: 'Starter upgrade', tone: 'ok' });
  else if (safeNum(player?.ovr) >= 68) tags.push({ label: 'Depth upgrade', tone: 'league' });

  const pos = player?.pos ?? player?.position;
  if (pos && needs.includes(pos)) tags.push({ label: 'Need fit', tone: 'ok' });
  if (pos && surplus.includes(pos)) tags.push({ label: 'Low priority', tone: 'neutral' });

  return tags.slice(0, 4);
}

export function toneToCssColor(tone) {
  if (tone === 'ok') return 'var(--success)';
  if (tone === 'warning') return 'var(--warning)';
  if (tone === 'danger') return 'var(--danger)';
  if (tone === 'league') return 'var(--accent)';
  return 'var(--text-subtle)';
}
