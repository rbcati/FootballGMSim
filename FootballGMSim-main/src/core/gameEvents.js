const SCORE_TYPES = {
  touchdown: 'touchdown',
  field_goal: 'field_goal',
  safety: 'safety',
  extra_point: 'extra_point',
  two_point: 'two_point',
};

const PLAY_TYPE_ALIASES = {
  play: 'play',
  pass: 'pass',
  run: 'run',
  sack: 'sack',
  punt: 'punt',
  touchdown: 'touchdown',
  field_goal: 'field_goal',
  interception: 'interception',
  fumble: 'fumble',
  safety: 'safety',
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

export function inferPlayType(log = {}) {
  const raw = String(log?.playType ?? log?.type ?? '').toLowerCase();
  if (raw && PLAY_TYPE_ALIASES[raw]) return raw;
  const text = String(log?.text ?? '').toLowerCase();
  if (text.includes('field goal')) return 'field_goal';
  if (text.includes('touchdown')) return 'touchdown';
  if (text.includes('interception')) return 'interception';
  if (text.includes('fumble')) return 'fumble';
  if (text.includes('safety')) return 'safety';
  if (text.includes('punt')) return 'punt';
  if (text.includes('sack')) return 'sack';
  if (text.includes('pass') || text.includes('incomplete')) return 'pass';
  if (text.includes('rush') || text.includes('runs') || text.includes('carries')) return 'run';
  return 'play';
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

function toPlayerRef(player) {
  if (!player || typeof player !== 'object') return null;
  const id = toNumber(player.id);
  return {
    id: id ?? null,
    name: player.name ?? null,
    pos: player.pos ?? null,
  };
}

export function normalizePlayLogEntry(log = {}, index = 0, context = {}) {
  const homeAfter = toNumber(log?.scoreHomeAfter ?? log?.homeScore ?? log?.scoreHome);
  const awayAfter = toNumber(log?.scoreAwayAfter ?? log?.awayScore ?? log?.scoreAway);
  const teamId = resolveLogTeamId(log, context);
  const homeId = toNumber(context?.homeId);
  const awayId = toNumber(context?.awayId);
  const offenseTeamId = toNumber(log?.offenseTeamId ?? (log?.possession === 'home' ? homeId : (log?.possession === 'away' ? awayId : teamId)));
  const defenseTeamId = toNumber(log?.defenseTeamId ?? (
    offenseTeamId === homeId ? awayId : (offenseTeamId === awayId ? homeId : null)
  ));
  return {
    ...log,
    id: log?.id ?? `play_${index}`,
    quarter: Number(log?.quarter ?? 1),
    clock: log?.clock ?? log?.timeLeft ?? log?.time ?? '',
    offenseTeamId: offenseTeamId ?? null,
    defenseTeamId: defenseTeamId ?? null,
    playType: inferPlayType(log),
    yards: toNumber(log?.yards) ?? 0,
    result: log?.result ?? log?.text ?? 'Play',
    scoreHomeAfter: homeAfter,
    scoreAwayAfter: awayAfter,
    fieldPosition: toNumber(log?.fieldPosition ?? log?.yardLine),
    teamId: teamId ?? offenseTeamId ?? null,
    text: log?.text ?? log?.playText ?? 'Play',
    passer: toPlayerRef(log?.passer),
    rusher: toPlayerRef(log?.rusher ?? log?.player),
    receiver: toPlayerRef(log?.receiver ?? (log?.playType === 'pass' ? log?.player : null)),
    defender: toPlayerRef(log?.defender ?? log?.tackler ?? log?.forcedFumble),
    kicker: toPlayerRef(log?.kicker),
  };
}

export function normalizePlayLogs(playLogs = [], context = {}) {
  const logs = Array.isArray(playLogs) ? playLogs : [];
  return logs.map((log, idx) => normalizePlayLogEntry(log, idx, context));
}
