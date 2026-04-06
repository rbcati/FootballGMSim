function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export function classifyTeamDirection(team, week = 1) {
  const wins = safeNum(team?.wins);
  const losses = safeNum(team?.losses);
  const ties = safeNum(team?.ties);
  const games = wins + losses + ties;
  const pct = games > 0 ? (wins + ties * 0.5) / games : 0.5;
  if (week <= 4) {
    if (pct >= 0.68) return 'contender';
    if (pct <= 0.32) return 'rebuilding';
    return 'middling';
  }
  if (pct >= 0.6) return 'contender';
  if (pct <= 0.38) return 'rebuilding';
  return 'middling';
}

function replacementDifficulty(pos, roster = []) {
  const samePos = roster.filter((p) => p?.pos === pos).length;
  if (samePos <= 2) return 'high';
  if (samePos <= 4) return 'medium';
  return 'low';
}

function toTone(tier) {
  if (tier === 'priority_resign') return 'var(--success)';
  if (tier === 'resign_if_price') return '#64D2FF';
  if (tier === 'trade_or_tag') return '#BF5AF2';
  if (tier === 'let_walk') return 'var(--danger)';
  return 'var(--warning)';
}

function toLabel(tier) {
  if (tier === 'priority_resign') return 'Priority Re-sign';
  if (tier === 'resign_if_price') return 'Re-sign if Price Holds';
  if (tier === 'trade_or_tag') return 'Trade/Tag Candidate';
  if (tier === 'let_walk') return 'Let Walk';
  return 'Replaceable Depth';
}

export function evaluateResignRecommendation(player, context = {}) {
  const ovr = safeNum(player?.ovr, 65);
  const pot = safeNum(player?.potential, ovr);
  const age = safeNum(player?.age, 26);
  const morale = safeNum(player?.morale, 70);
  const schemeFit = safeNum(player?.schemeFit, 65);
  const ask = safeNum(player?.extensionAsk?.baseAnnual, safeNum(player?.contract?.baseAnnual, 4));
  const capRoom = safeNum(context?.team?.capRoom, 0);
  const direction = context?.direction ?? 'middling';
  const depthDiff = replacementDifficulty(player?.pos, context?.roster ?? []);

  let score = (ovr * 1.25) + ((pot - ovr) * 0.45) + ((morale - 65) * 0.14) + ((schemeFit - 60) * 0.22);
  score -= Math.max(0, age - 30) * 5;
  score -= Math.max(0, ask - Math.max(4, safeNum(player?.contract?.baseAnnual, 4) * 1.25)) * 3.2;

  if (direction === 'contender' && ovr >= 78) score += 8;
  if (direction === 'rebuilding' && age >= 30) score -= 8;
  if (depthDiff === 'high') score += 10;

  let tier = 'replaceable_depth';
  let reason = 'Replaceable depth: keep only if market is soft';
  if (score >= 96) {
    tier = 'priority_resign';
    reason = depthDiff === 'high'
      ? 'Priority Re-sign: productive starter at a thin position'
      : 'Priority Re-sign: core player worth protecting';
  } else if (score >= 76) {
    tier = 'resign_if_price';
    reason = 'Re-sign if price holds: useful role player, avoid overpay';
  } else if (score <= 44) {
    tier = 'let_walk';
    reason = 'Let walk: age and contract demands outpace value';
  }

  if (ovr >= 84 && ask >= Math.max(16, capRoom * 0.6) && direction !== 'contender') {
    tier = 'trade_or_tag';
    reason = 'Trade/Tag candidate: valuable player, difficult extension path';
  }

  const urgency = tier === 'priority_resign' ? 'High' : tier === 'resign_if_price' ? 'Medium' : 'Low';
  const risk = morale < 58 || ask > Math.max(18, capRoom) ? 'High' : morale >= 76 ? 'Low' : 'Medium';

  return {
    tier,
    label: toLabel(tier),
    tone: toTone(tier),
    reason,
    urgency,
    negotiationRisk: risk,
    replacementDifficulty: depthDiff[0].toUpperCase() + depthDiff.slice(1),
  };
}

export function summarizeExpiring(players = [], context = {}) {
  const summary = {
    priority_resign: 0,
    resign_if_price: 0,
    replaceable_depth: 0,
    let_walk: 0,
    trade_or_tag: 0,
  };
  players.forEach((p) => {
    const yearsLeft = p?.contract?.years ?? p?.contract?.yearsLeft ?? p?.contract?.yearsRemaining ?? 0;
    if (yearsLeft > 1) return;
    const rec = evaluateResignRecommendation(p, context);
    summary[rec.tier] = (summary[rec.tier] ?? 0) + 1;
  });
  return summary;
}
