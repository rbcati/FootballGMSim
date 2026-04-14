export function buildDraftOrder(teams = [], settings = {}, championTeamId = null, rng = Math.random) {
  const method = String(settings?.draftOrderLogic ?? 'reverse_standings');
  const sorted = [...teams].sort((a, b) => {
    const wDiff = Number(a?.wins ?? 0) - Number(b?.wins ?? 0);
    if (wDiff !== 0) return wDiff;
    const diffA = Number(a?.ptsFor ?? 0) - Number(a?.ptsAgainst ?? 0);
    const diffB = Number(b?.ptsFor ?? 0) - Number(b?.ptsAgainst ?? 0);
    return diffA - diffB;
  });

  if (method === 'random') {
    const ids = sorted.map((t) => t.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  }

  if (method === 'lottery') {
    const bottom = sorted.slice(0, Math.min(14, sorted.length));
    const rest = sorted.slice(bottom.length);
    const tickets = bottom.flatMap((team, idx) => {
      const count = Math.max(1, 14 - idx);
      return Array.from({ length: count }, () => team.id);
    });
    const picked = [];
    const used = new Set();
    while (picked.length < bottom.length) {
      const id = tickets[Math.floor(rng() * tickets.length)];
      if (used.has(id)) continue;
      used.add(id);
      picked.push(id);
    }
    return [...picked, ...rest.map((t) => t.id)];
  }

  let draftOrder = sorted.map((t) => t.id);
  if (championTeamId != null) {
    draftOrder = draftOrder.filter((id) => Number(id) !== Number(championTeamId));
    draftOrder.push(championTeamId);
  }
  return draftOrder;
}

export function getSuspensionProbabilityMultiplier(settings = {}) {
  const freq = Number(settings?.suspensionFrequency ?? 50);
  return Math.max(0, Math.min(2, freq / 50));
}
