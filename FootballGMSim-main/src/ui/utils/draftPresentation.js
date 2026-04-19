function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function estimateProspectPickWindow(boardRank, totalProspects = 224) {
  const rank = Math.max(1, safeNum(boardRank, 999));
  const clampedTotal = Math.max(32, safeNum(totalProspects, 224));
  const base = Math.min(clampedTotal, rank);
  const spread = base <= 12 ? 5 : base <= 40 ? 9 : base <= 90 ? 14 : 20;
  const start = Math.max(1, base - Math.round(spread * 0.55));
  const end = Math.min(clampedTotal, base + spread);
  return {
    start,
    end,
    label: start === end ? `#${start}` : `#${start}–#${end}`,
  };
}

export function classifyPickValue({ boardRank, currentPick }) {
  const rank = safeNum(boardRank, 999);
  const pick = safeNum(currentPick, rank);
  const delta = pick - rank;
  if (delta <= -10) return { bucket: 'Reach', tone: 'risk', detail: `~${Math.abs(delta)} spots early` };
  if (delta >= 12) return { bucket: 'Value', tone: 'win', detail: `~${delta} spots of value` };
  return { bucket: 'Fair value', tone: 'neutral', detail: 'Aligned with market board' };
}

export function summarizeDraftClassIdentity(prospects = []) {
  if (!Array.isArray(prospects) || prospects.length === 0) {
    return {
      headline: 'Class board not loaded',
      strengths: [],
      thinSpots: [],
    };
  }

  const byPos = new Map();
  prospects.forEach((prospect) => {
    const pos = String(prospect?.pos ?? prospect?.position ?? 'UNK').toUpperCase();
    if (!byPos.has(pos)) byPos.set(pos, []);
    byPos.get(pos).push(safeNum(prospect?.ovr, 0));
  });

  const scored = [...byPos.entries()].map(([pos, ovrs]) => {
    const quality = ovrs.sort((a, b) => b - a).slice(0, 8);
    const topEnd = quality.length ? quality.reduce((sum, value) => sum + value, 0) / quality.length : 0;
    return { pos, count: ovrs.length, topEnd };
  }).sort((a, b) => (b.topEnd * 0.7 + b.count * 0.9) - (a.topEnd * 0.7 + a.count * 0.9));

  const strengths = scored.slice(0, 3).map((entry) => `${entry.pos} (${entry.count})`);
  const thinSpots = [...scored].reverse().slice(0, 2).map((entry) => `${entry.pos} (${entry.count})`);
  const topPos = scored[0]?.pos ?? 'top-end';
  const headline = `This class leans ${topPos}-heavy with ${prospects.length} draftable prospects on board.`;

  return { headline, strengths, thinSpots };
}

export function getProspectWorkflowTags({
  prospect,
  boardRank,
  teamIntel,
  fitBucket,
  valueBucket,
  upcomingUserPicks = [],
}) {
  const tags = [];
  const age = safeNum(prospect?.age, 23);
  const ovr = safeNum(prospect?.ovr, 60);
  const pot = safeNum(prospect?.potential ?? prospect?.pot ?? prospect?.ovr, ovr);
  const gap = pot - ovr;
  const teamDirection = teamIntel?.direction ?? 'middling';

  if (boardRank <= 5) tags.push('BPA');
  if (fitBucket === 'Immediate need') tags.push('Need fit');
  if (fitBucket === 'Future starter') tags.push('Scheme fit');
  if (fitBucket === 'Developmental need') tags.push('Depth plan');
  if (gap >= 10 || age <= 21) tags.push('Developmental');
  if (teamDirection === 'contender' && ovr >= 74) tags.push('Early target');
  if (teamDirection === 'rebuilding' && gap >= 8) tags.push('Timeline fit');
  if (boardRank >= 40 && boardRank <= 105) tags.push('Day 2 target');
  if (boardRank >= 130) tags.push('Late flier');
  if (valueBucket === 'Reach') tags.push('Reach risk');
  if (valueBucket === 'Value') tags.push('Value pocket');

  if (upcomingUserPicks.length > 0) {
    const nearest = safeNum(upcomingUserPicks[0]?.overall, 999);
    if (nearest <= boardRank + 4 && nearest >= boardRank - 6) tags.push('Pick-range realistic');
  }

  return [...new Set(tags)].slice(0, 4);
}
