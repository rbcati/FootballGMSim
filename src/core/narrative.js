function firstNonEmpty(values = []) {
  return values.find((value) => typeof value === 'string' && value.trim()) ?? '';
}

function parseReasonTone(reason = '') {
  const lower = String(reason).toLowerCase();
  if (
    lower.includes('penalty')
    || lower.includes('risk')
    || lower.includes('missing')
    || lower.includes('gap')
    || lower.includes('no scouting support')
    || lower.includes('injury stress')
    || lower.includes('readiness penalty')
  ) return 'negative';
  if (lower.includes('advantage') || lower.includes('edge') || lower.includes('synergy')) return 'positive';
  return 'neutral';
}

export function buildGamePlanNarrative(multipliers, stats = {}) {
  if (!multipliers || typeof multipliers !== 'object') return '';
  const reasons = Array.isArray(multipliers?.activeReasons) ? multipliers.activeReasons.filter(Boolean) : [];
  const homeScore = Number(stats?.homeScore);
  const awayScore = Number(stats?.awayScore);
  const scoreLine = Number.isFinite(homeScore) && Number.isFinite(awayScore)
    ? `${homeScore}-${awayScore}`
    : 'final score unavailable';

  const topRusher = firstNonEmpty([stats?.topRusher?.name, stats?.topRusher?.player, stats?.topRusher?.displayName]);
  const topReceiver = firstNonEmpty([stats?.topReceiver?.name, stats?.topReceiver?.player, stats?.topReceiver?.displayName]);
  const topPasser = firstNonEmpty([stats?.topPasser?.name, stats?.topPasser?.player, stats?.topPasser?.displayName]);
  const rushAttempts = Number(stats?.topRusher?.attempts ?? stats?.topRusher?.rushAtt);
  const rushYpc = Number(stats?.topRusher?.ypc ?? stats?.topRusher?.rushYpc);
  const rushYards = Number(stats?.topRusher?.yards ?? stats?.topRusher?.rushYd ?? stats?.rushingYards);
  const passTds = Number(stats?.topPasser?.tds ?? stats?.topPasser?.passTD);
  const passInts = Number(stats?.topPasser?.ints ?? stats?.topPasser?.interceptions);
  const passYards = Number(stats?.topPasser?.yards ?? stats?.topPasser?.passYd ?? stats?.passingYards);
  const sacksAllowed = Number(stats?.sacksAllowed ?? stats?.sacks ?? stats?.teamStats?.sacks);
  const turnovers = Number(stats?.turnovers ?? stats?.teamStats?.turnovers);

  const reasonText = reasons.join(' ').toLowerCase();
  const positiveReason = reasons.find((reason) => parseReasonTone(reason) === 'positive') ?? '';
  const warningReason = reasons.find((reason) => parseReasonTone(reason) === 'negative') ?? '';

  let planSentence = `Final score ${scoreLine}.`;
  if (reasonText.includes('run matchup advantage')) {
    const receipts = [
      Number.isFinite(rushAttempts) ? `${Math.round(rushAttempts)} rush attempts` : '',
      Number.isFinite(rushYards) ? `${Math.round(rushYards)} rushing yards` : '',
      Number.isFinite(rushYpc) ? `${rushYpc.toFixed(1)} YPC` : '',
    ].filter(Boolean).join(', ');
    planSentence = `Our run-heavy plan aligned with a weak run-defense look and helped create ${receipts || 'steady rushing production'}.`;
  } else if (reasonText.includes('pass attack edge')) {
    const receipts = [
      Number.isFinite(passYards) ? `${Math.round(passYards)} passing yards` : '',
      Number.isFinite(passTds) ? `${Math.round(passTds)} pass TD` : '',
      Number.isFinite(passInts) ? `${Math.round(passInts)} INT` : '',
    ].filter(Boolean).join(', ');
    planSentence = `Our pass-heavy script aligned with the coverage matchup and helped generate ${receipts || 'chunk passing gains'}.`;
  } else if (reasonText.includes('quick-game') || reasonText.includes('protection')) {
    const receipts = [
      Number.isFinite(sacksAllowed) ? `${Math.round(sacksAllowed)} sacks allowed` : '',
      Number.isFinite(turnovers) ? `${Math.round(turnovers)} turnovers` : '',
    ].filter(Boolean).join(', ');
    planSentence = `Our protection-oriented calls aligned with pressure looks${receipts ? `, with ${receipts}.` : '.'}`;
  } else if (positiveReason) {
    planSentence = `Game-plan alignment helped execution: ${positiveReason}`;
  }

  const leaders = [topPasser, topRusher, topReceiver].filter(Boolean);
  const leaderSentence = leaders.length
    ? `Leaders: ${leaders.join(', ')} kept the offense on schedule.`
    : '';

  const hasChemistryPenalty = Number(multipliers?.chemistryPenalty ?? 0) < 0;
  const warningSentence = warningReason
    ? `Warning: ${warningReason}${hasChemistryPenalty ? ' Chemistry took a hit.' : ''}`
    : (hasChemistryPenalty ? 'Warning: chemistry penalties showed up from prep gaps.' : '');

  return [planSentence, leaderSentence, warningSentence].filter(Boolean).join(' ');
}
