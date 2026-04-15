const safeNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeDepthOrder = (player) => safeNumber(player?.depthChart?.order ?? player?.depthOrder ?? 99, 99);

export function classifyDevelopmentTrend(player) {
  const age = safeNumber(player?.age, 30);
  const delta = safeNumber(player?.progressionDelta, 0);
  const potential = safeNumber(player?.potential, safeNumber(player?.ovr, 70));
  const ovr = safeNumber(player?.ovr, 70);
  const upsideGap = potential - ovr;
  const injuryWeeks = safeNumber(player?.injuryWeeksRemaining ?? player?.injury?.weeksRemaining, 0);

  if (delta >= 3 && age <= 26) {
    return { key: 'breakout_candidate', label: 'Breakout candidate', tone: 'good', icon: '🚀' };
  }
  if (delta >= 1) {
    return { key: 'trending_up', label: 'Trending up', tone: 'good', icon: '📈' };
  }
  if (delta <= -2 && age >= 29) {
    return { key: 'regression_risk', label: 'Regression risk', tone: 'bad', icon: '⚠️' };
  }
  if (age >= 30 && Math.abs(delta) <= 1) {
    return { key: 'stable_veteran', label: 'Stable veteran', tone: 'neutral', icon: '🧭' };
  }
  if (age <= 24 && delta <= 0 && upsideGap >= 6) {
    return {
      key: injuryWeeks > 0 ? 'slowed_prospect' : 'stagnating_prospect',
      label: injuryWeeks > 0 ? 'Slowed prospect' : 'Stagnating prospect',
      tone: 'warn',
      icon: injuryWeeks > 0 ? '🩹' : '⏳',
    };
  }
  if (delta <= -1) {
    return { key: 'trending_down', label: 'Trending down', tone: 'bad', icon: '📉' };
  }
  return { key: 'holding_pattern', label: 'Holding pattern', tone: 'neutral', icon: '➖' };
}

export function getPlayerReadiness(player) {
  const age = safeNumber(player?.age, 30);
  const ovr = safeNumber(player?.ovr, 0);
  const injuryWeeks = safeNumber(player?.injuryWeeksRemaining ?? player?.injury?.weeksRemaining, 0);
  const depthOrder = normalizeDepthOrder(player);

  if (injuryWeeks > 0) {
    return {
      key: 'injured',
      label: `Injured (${injuryWeeks}w)`,
      detail: 'Short-term readiness is limited by injury recovery.',
      tone: 'bad',
    };
  }
  if (depthOrder >= 3 && age <= 25 && ovr >= 68) {
    return {
      key: 'blocked',
      label: 'Blocked by depth',
      detail: 'Long-term upside exists, but current role limits snaps.',
      tone: 'warn',
    };
  }
  if (ovr >= 75 || depthOrder <= 2) {
    return {
      key: 'game_ready',
      label: 'Game ready',
      detail: 'Can contribute now in current rotation.',
      tone: 'good',
    };
  }
  return {
    key: 'developing',
    label: 'Developing',
    detail: 'Needs reps to translate upside into week-to-week impact.',
    tone: 'neutral',
  };
}

export function getSchemeFitSignal(player) {
  const fit = safeNumber(player?.schemeFit, 50);
  if (fit >= 75) return { key: 'strong_fit', label: 'Strong fit', tone: 'good' };
  if (fit <= 45) return { key: 'weak_fit', label: 'Weak fit', tone: 'bad' };
  return { key: 'neutral_fit', label: 'Neutral fit', tone: 'neutral' };
}

export function buildDevelopmentNotes(player, moraleContext = null) {
  const trend = classifyDevelopmentTrend(player);
  const readiness = getPlayerReadiness(player);
  const fit = getSchemeFitSignal(player);
  const notes = [
    `${trend.icon} ${trend.label}`,
    `${fit.label} (${safeNumber(player?.schemeFit, 50)})`,
    readiness.label,
  ];
  if (moraleContext?.state) {
    notes.push(`Morale: ${moraleContext.state}`);
  }
  const topReason = moraleContext?.reasons?.[0];
  if (topReason) notes.push(topReason);
  return { trend, readiness, fit, notes };
}

export function summarizeRosterDevelopment(players = [], moraleById = new Map()) {
  const list = Array.isArray(players) ? players : [];
  const rising = [];
  const slipping = [];
  const moraleRisk = [];
  const mismatch = [];
  const rookiesWatch = [];

  for (const player of list) {
    const trend = classifyDevelopmentTrend(player);
    const moraleState = moraleById.get(player?.id)?.state ?? '';
    const moraleScore = safeNumber(player?.morale, 70);
    const fit = safeNumber(player?.schemeFit, 50);
    const age = safeNumber(player?.age, 30);

    if (['breakout_candidate', 'trending_up'].includes(trend.key)) rising.push(player);
    if (['regression_risk', 'trending_down'].includes(trend.key)) slipping.push(player);
    if (moraleScore <= 62 || String(moraleState).toLowerCase().includes('friction') || String(moraleState).toLowerCase().includes('frustrated')) moraleRisk.push(player);
    if (fit <= 45) mismatch.push(player);
    if (age <= 24) rookiesWatch.push(player);
  }

  const sortByDelta = (a, b) => safeNumber(b?.progressionDelta, 0) - safeNumber(a?.progressionDelta, 0);
  const sortByNegativeDelta = (a, b) => safeNumber(a?.progressionDelta, 0) - safeNumber(b?.progressionDelta, 0);

  return {
    rising: rising.sort(sortByDelta),
    slipping: slipping.sort(sortByNegativeDelta),
    moraleRisk: moraleRisk.sort((a, b) => safeNumber(a?.morale, 100) - safeNumber(b?.morale, 100)),
    mismatch: mismatch.sort((a, b) => safeNumber(a?.schemeFit, 100) - safeNumber(b?.schemeFit, 100)),
    rookieWatch: rookiesWatch.sort((a, b) => safeNumber(a?.age, 99) - safeNumber(b?.age, 99)),
  };
}
