const SCORE_TYPES = {
  touchdown: 'touchdown',
  field_goal: 'field_goal',
  safety: 'safety',
  extra_point: 'extra_point',
  two_point: 'two_point',
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function resolveLogTeamId(log, context = {}) {
  const explicit = toNumber(log?.teamId ?? log?.scoringTeamId ?? log?.team?.id);
  if (explicit != null) return explicit;
  if (log?.possession === 'home') return toNumber(context?.homeId);
  if (log?.possession === 'away') return toNumber(context?.awayId);
  return null;
}

export function classifyScoringEvent(log = {}) {
  const text = String(log?.text ?? '').toLowerCase();
  const tdType = String(log?.tdType ?? '').toLowerCase();

  if (text.includes('two-point') || text.includes('2-point')) return { type: SCORE_TYPES.two_point, label: 'Two-Point Conversion', points: 2 };
  if (text.includes('extra point')) return { type: SCORE_TYPES.extra_point, label: 'Extra Point', points: 1 };
  if (text.includes('safety')) return { type: SCORE_TYPES.safety, label: 'Safety', points: 2 };
  if (text.includes('field goal')) return { type: SCORE_TYPES.field_goal, label: 'Field Goal', points: 3 };

  if (tdType.includes('pass') || /pass/.test(text)) return { type: SCORE_TYPES.touchdown, label: 'Passing TD', points: 6 };
  if (tdType.includes('rush') || /rush|runs|run/.test(text)) return { type: SCORE_TYPES.touchdown, label: 'Rushing TD', points: 6 };
  if (tdType.includes('int') || tdType.includes('fumble') || /interception.*touchdown|fumble.*touchdown/.test(text)) {
    return { type: SCORE_TYPES.touchdown, label: 'Defensive TD', points: 6 };
  }
  if (text.includes('touchdown')) return { type: SCORE_TYPES.touchdown, label: 'Touchdown', points: 6 };

  return { type: 'score', label: 'Score', points: toNumber(log?.points) ?? 0 };
}

export function isScoringLikeLog(log = {}) {
  if (log?.isScore || log?.isTouchdown) return true;
  const text = String(log?.text ?? '').toLowerCase();
  return /touchdown|field goal|safety|extra point|two-point|2-point/.test(text);
}

export function parseClock(clockText) {
  if (!clockText || typeof clockText !== 'string') return null;
  const match = clockText.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return (Number(match[1]) * 60) + Number(match[2]);
}

export function describeDriveResult(lastLog = {}) {
  const text = String(lastLog?.text ?? '').toLowerCase();
  if (text.includes('touchdown')) return 'TD';
  if (text.includes('field goal') && text.includes('good')) return 'FG';
  if (text.includes('field goal') && text.includes('miss')) return 'Missed FG';
  if (text.includes('interception')) return 'Interception';
  if (text.includes('fumble')) return 'Fumble';
  if (text.includes('safety')) return 'Safety';
  if (text.includes('turnover on downs') || text.includes('downs')) return 'Turnover on Downs';
  if (text.includes('punt')) return 'Punt';
  return 'Drive End';
}
