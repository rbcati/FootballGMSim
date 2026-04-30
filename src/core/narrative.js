function firstNonEmpty(values = []) {
  return values.find((value) => typeof value === 'string' && value.trim()) ?? '';
}

function parseReasonTone(reason = '') {
  const lower = String(reason).toLowerCase();
  if (lower.includes('advantage') || lower.includes('edge') || lower.includes('synergy') || lower.includes('active')) return 'positive';
  if (lower.includes('penalty') || lower.includes('risk') || lower.includes('missing') || lower.includes('gap') || lower.includes('no scouting support')) return 'negative';
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
  const rushYards = Number(stats?.topRusher?.yards ?? stats?.topRusher?.rushYd ?? stats?.rushingYards);
  const passYards = Number(stats?.topPasser?.yards ?? stats?.topPasser?.passYd ?? stats?.passingYards);

  const reasonText = reasons.join(' ').toLowerCase();
  const positiveReason = reasons.find((reason) => parseReasonTone(reason) === 'positive') ?? '';
  const warningReason = reasons.find((reason) => parseReasonTone(reason) === 'negative') ?? '';

  let planSentence = `Final score ${scoreLine}.`;
  if (reasonText.includes('run matchup advantage')) {
    const yardText = Number.isFinite(rushYards) ? `${Math.round(rushYards)} rushing yards` : 'consistent rushing production';
    planSentence = `Our run-heavy plan attacked a weak run defense and produced ${yardText}.`;
  } else if (reasonText.includes('pass attack edge')) {
    const yardText = Number.isFinite(passYards) ? `${Math.round(passYards)} passing yards` : 'chunk passing gains';
    planSentence = `Our pass-heavy script exploited the opponent secondary and generated ${yardText}.`;
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
