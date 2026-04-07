function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const POSITION_STARTERS = {
  QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 2, S: 2,
};

const POSITION_ALIAS = {
  HB: 'RB', FB: 'RB', FL: 'WR', SE: 'WR',
  OT: 'OL', LT: 'OL', RT: 'OL', OG: 'OL', LG: 'OL', RG: 'OL', C: 'OL',
  DE: 'DL', DT: 'DL', NT: 'DL', IDL: 'DL', EDGE: 'DL',
  MLB: 'LB', OLB: 'LB', ILB: 'LB', DB: 'CB', NCB: 'CB', FS: 'S', SS: 'S',
};

function canonicalPos(player) {
  const raw = String(player?.pos ?? player?.position ?? '').toUpperCase();
  return POSITION_ALIAS[raw] ?? raw;
}

function computeStreak(recentResults = []) {
  if (!Array.isArray(recentResults) || recentResults.length === 0) return null;
  let type = null;
  let count = 0;
  for (let i = recentResults.length - 1; i >= 0; i -= 1) {
    const r = recentResults[i];
    if (r !== 'W' && r !== 'L') continue;
    if (!type) {
      type = r;
      count = 1;
      continue;
    }
    if (r === type) count += 1;
    else break;
  }
  return type ? { type, count } : null;
}

function ageMixScore(roster = []) {
  if (!roster.length) return { score: 0, youngCount: 0, vetCount: 0 };
  const youngCount = roster.filter((p) => safeNum(p?.age, 99) <= 24).length;
  const vetCount = roster.filter((p) => safeNum(p?.age, 0) >= 30).length;
  const ratio = youngCount / Math.max(1, vetCount);
  const score = ratio >= 0.45 && ratio <= 2.5 ? 4 : ratio < 0.2 || ratio > 3.8 ? -5 : -1;
  return { score, youngCount, vetCount };
}

function getLeadershipTier(player) {
  const morale = safeNum(player?.morale, 72);
  const age = safeNum(player?.age, 26);
  const ovr = safeNum(player?.ovr, 70);
  const traits = Array.isArray(player?.traits) ? player.traits.map((t) => String(t).toLowerCase()) : [];
  const leaderTrait = traits.some((t) => ['leader', 'captain', 'mentor', 'high_motor', 'professional', 'loyal'].includes(t));
  const mentorAge = age >= 30 ? 7 : age >= 27 ? 3 : 0;
  const coreTalent = Math.max(0, (ovr - 72) * 0.5);
  const moraleSignal = (morale - 65) * 0.35;
  const traitSignal = leaderTrait ? 8 : 0;
  const score = mentorAge + coreTalent + moraleSignal + traitSignal;
  return { score, leaderTrait };
}

function deriveLeaders(roster = []) {
  const ranked = roster
    .map((p) => ({ ...p, _lead: getLeadershipTier(p) }))
    .sort((a, b) => b._lead.score - a._lead.score)
    .slice(0, 4);
  return ranked.map((p, idx) => {
    const age = safeNum(p?.age, 26);
    const role = idx === 0 && age >= 29
      ? 'Veteran leader'
      : age <= 25 && safeNum(p?.ovr, 0) >= 76
        ? 'Rising cornerstone'
        : 'Emotional heartbeat';
    return {
      playerId: p?.id,
      name: p?.name,
      pos: canonicalPos(p),
      role,
      influenceScore: Math.round(p._lead.score),
    };
  });
}

function groupByPos(roster = []) {
  const map = new Map();
  for (const p of roster) {
    const pos = canonicalPos(p);
    if (!map.has(pos)) map.set(pos, []);
    map.get(pos).push(p);
  }
  for (const [, list] of map) list.sort((a, b) => safeNum(b?.ovr) - safeNum(a?.ovr));
  return map;
}

function deriveRoleTensions(roster = []) {
  const byPos = groupByPos(roster);
  const tensions = [];
  for (const [pos, players] of byPos.entries()) {
    if (!POSITION_STARTERS[pos]) continue;
    const starters = POSITION_STARTERS[pos];
    const crowded = players.filter((p) => safeNum(p?.ovr, 0) >= 74);
    if (crowded.length >= starters + 2) {
      tensions.push({ type: 'crowded_room', pos, text: `${pos} room overcrowded with starter-level talent` });
    }
    if (players.length > starters) {
      const backup = players[starters];
      if (backup && safeNum(backup?.ovr, 0) >= 73 && safeNum(backup?.morale, 75) <= 62) {
        tensions.push({ type: 'unhappy_backup', pos, playerId: backup.id, text: `${backup.name} wants a larger ${pos} role` });
      }
      const young = players.find((p, idx) => idx >= starters && safeNum(p?.age, 99) <= 24 && safeNum(p?.ovr, 0) >= 70);
      const veteran = players.find((p, idx) => idx < starters && safeNum(p?.age, 0) >= 30);
      if (young && veteran) {
        tensions.push({ type: 'blocked_youth', pos, playerId: young.id, text: `${young.name} is blocked behind veteran ${veteran.name}` });
      }
    }
  }
  return tensions.slice(0, 5);
}

function deriveMoveConsequences(league, teamId) {
  const items = Array.isArray(league?.newsItems) ? league.newsItems : [];
  const scoped = items
    .filter((item) => Number(item?.teamId ?? item?.meta?.teamId) === Number(teamId))
    .slice(0, 12);
  const out = [];
  for (const item of scoped) {
    const key = String(item?.category ?? item?.type ?? '').toLowerCase();
    const text = `${item?.headline ?? ''} ${item?.body ?? ''}`.toLowerCase();
    if (key.includes('trade') && (text.includes('veteran') || text.includes('captain') || text.includes('popular'))) {
      out.push({ tone: 'warning', impact: -6, short: 'Uneasy after trading a respected veteran' });
      continue;
    }
    if ((key.includes('free_agent') || key.includes('trade')) && (text.includes('star') || text.includes('all-pro') || text.includes('franchise'))) {
      out.push({ tone: 'positive', impact: 5, short: 'Major acquisition boosted locker-room optimism' });
      continue;
    }
    if ((key.includes('free_agent') || key.includes('trade')) && text.includes('rookie qb')) {
      out.push({ tone: 'mixed', impact: 2, short: 'Rookie QB move energized youth but added short-term volatility' });
    }
  }
  return out.slice(0, 3);
}

function classifyChemistry(score) {
  if (score >= 76) return 'Strong locker room';
  if (score >= 60) return 'Stable';
  if (score >= 44) return 'Uneasy';
  return 'Fragmented';
}

export function buildTeamChemistrySummary(team, { week = 1, direction = 'balanced', league = null } = {}) {
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  if (!roster.length) {
    return {
      score: 60,
      state: 'Stable',
      reasons: ['Roster not loaded yet; chemistry defaults to neutral.'],
      leaders: [],
      tensions: [],
      moveConsequences: [],
      moraleBand: 'steady',
      freeAgencyAppeal: 0,
    };
  }

  const moraleAvg = roster.reduce((sum, p) => sum + safeNum(p?.morale, 72), 0) / roster.length;
  const lowMoraleCount = roster.filter((p) => safeNum(p?.morale, 72) < 58).length;
  const highMoraleCount = roster.filter((p) => safeNum(p?.morale, 72) >= 80).length;
  const streak = computeStreak(team?.recentResults ?? []);
  const tensions = deriveRoleTensions(roster);
  const leaders = deriveLeaders(roster);
  const ageMix = ageMixScore(roster);
  const churn = safeNum(team?.recentTransactions ?? team?.transactionCount ?? 0, 0);
  const moveConsequences = league ? deriveMoveConsequences(league, team?.id) : [];

  let score = 62;
  score += (moraleAvg - 70) * 0.9;
  score -= Math.min(10, lowMoraleCount * 1.7);
  score += Math.min(8, highMoraleCount * 0.9);
  score += ageMix.score;
  score -= Math.min(8, tensions.length * 2.4);
  if (streak?.type === 'W' && streak.count >= 2) score += Math.min(8, streak.count * 1.5);
  if (streak?.type === 'L' && streak.count >= 2) score -= Math.min(10, streak.count * 2);
  if (direction === 'rebuilding' && ageMix.youngCount >= 11) score += 3;
  if (direction === 'contender' && moraleAvg < 66 && week >= 8) score -= 4;
  score -= Math.min(6, churn * 0.7);
  score += moveConsequences.reduce((sum, c) => sum + safeNum(c?.impact, 0), 0);
  score = Math.max(15, Math.min(95, Math.round(score)));

  const reasons = [];
  reasons.push(moraleAvg >= 75 ? 'Winning confidence is lifting morale' : moraleAvg <= 62 ? 'Morale strain is visible across the roster' : 'Morale is mostly neutral this week');
  if (streak?.type === 'W' && streak.count >= 3) reasons.push(`Room rallied during a ${streak.count}-game surge`);
  if (streak?.type === 'L' && streak.count >= 3) reasons.push(`Frustration rose during a ${streak.count}-game skid`);
  if (ageMix.score < 0) reasons.push('Age curve is top-heavy or too inexperienced for full stability');
  if (tensions[0]) reasons.push(tensions[0].text);
  if (direction === 'rebuilding' && ageMix.youngCount >= 10) reasons.push('Young core is buying into the rebuild timeline');
  if (moveConsequences[0]) reasons.push(moveConsequences[0].short);

  const freeAgencyAppeal = Math.round((score - 58) / 8);

  return {
    score,
    state: classifyChemistry(score),
    reasons: reasons.filter(Boolean).slice(0, 4),
    leaders,
    tensions,
    moveConsequences,
    moraleBand: moraleAvg >= 75 ? 'high' : moraleAvg <= 62 ? 'low' : 'steady',
    freeAgencyAppeal: Math.max(-3, Math.min(5, freeAgencyAppeal)),
    moraleAverage: Math.round(moraleAvg),
  };
}

export function describePlayerMoraleContext(player, { team, chemistry = null, week = 1 } = {}) {
  const morale = safeNum(player?.morale, 72);
  const reasons = [];
  if (morale >= 82) reasons.push('Confident in current environment');
  else if (morale <= 56) reasons.push('Frustrated with current situation');
  else reasons.push('Steady day-to-day morale');

  const yearsLeft = safeNum(player?.contract?.yearsRemaining ?? player?.contract?.years ?? player?.years, 2);
  if (yearsLeft <= 1) reasons.push('Contract uncertainty is in play');
  if (safeNum(player?.schemeFit, 65) >= 80) reasons.push('Excited by scheme fit');
  if (safeNum(player?.schemeFit, 65) <= 56) reasons.push('Scheme fit is a concern');

  const streak = computeStreak(team?.recentResults ?? []);
  if (streak?.type === 'W' && streak.count >= 2) reasons.push('Winning is boosting confidence');
  if (streak?.type === 'L' && streak.count >= 3) reasons.push('Losing stretch is weighing on morale');

  const teamTensions = chemistry?.tensions ?? [];
  const inTension = teamTensions.find((t) => Number(t?.playerId) === Number(player?.id));
  if (inTension?.type === 'unhappy_backup') reasons.push('Unhappy with role expectations');
  if (inTension?.type === 'blocked_youth') reasons.push('Development path is blocked by current depth chart');

  if ((chemistry?.moveConsequences ?? [])[0]?.short?.toLowerCase().includes('veteran')) reasons.push('Room is still settling after a major veteran move');
  if (week <= 3 && safeNum(player?.age, 40) <= 24) reasons.push('Early-season youth energy is high');

  return {
    score: Math.round(morale),
    state: morale >= 80 ? 'High' : morale >= 62 ? 'Steady' : 'Low',
    reasons: reasons.slice(0, 3),
  };
}
