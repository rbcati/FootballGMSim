const EVENT_TYPE_TO_TAG = {
  kickoff: 'routine',
  first_down: 'key_play',
  explosive_play: 'key_play',
  touchdown: 'score',
  field_goal: 'score',
  turnover: 'turnover',
  sack: 'key_play',
  red_zone_entry: 'red_zone',
  failed_conversion: 'key_play',
  injury: 'key_play',
  quarter_end: 'routine',
  halftime: 'swing',
  game_end: 'swing',
  turning_point: 'swing',
};

function normalizeEventType(log = {}) {
  const text = String(log.text || log.playText || '').toLowerCase();
  if (log.type === 'touchdown' || text.includes('touchdown')) return 'touchdown';
  if (log.type === 'field_goal' || text.includes('field goal')) return 'field_goal';
  if (log.type === 'interception' || log.type === 'fumble' || text.includes('interception') || text.includes('fumble')) return 'turnover';
  if (log.type === 'sack' || text.includes('sack')) return 'sack';
  if (text.includes('first down')) return 'first_down';
  if (text.includes('injur')) return 'injury';
  if ((log.yards || 0) >= 20) return 'explosive_play';
  if ((log.fieldPosition || log.yardLine || 50) >= 80) return 'red_zone_entry';
  return 'routine';
}

export function buildLiveGameEvent(log = {}, index = 0, context = {}) {
  const eventType = normalizeEventType(log);
  const home = Number(log.homeScore ?? log.scoreHome ?? 0);
  const away = Number(log.awayScore ?? log.scoreAway ?? 0);
  return {
    id: `${context.gameId || 'game'}-${index}`,
    gameId: context.gameId || 'game',
    quarter: Number(log.quarter || 1),
    clock: log.clock || log.timeLeft || '15:00',
    offenseTeamId: log.possession === 'home' ? context.homeTeamId : context.awayTeamId,
    defenseTeamId: log.possession === 'home' ? context.awayTeamId : context.homeTeamId,
    eventType,
    headline: String(log.text || log.playText || 'Drive develops').trim(),
    detail: log.description || undefined,
    score: { home, away },
    possessionTeamId: log.possession === 'home' ? context.homeTeamId : context.awayTeamId,
    fieldPosition: log.fieldPosition ?? log.yardLine,
    down: log.down,
    distance: log.distance,
    raw: log,
    impactTag: EVENT_TYPE_TO_TAG[eventType] || 'routine',
  };
}

export function mapArchiveEventsToLiveFeed(playLogs = [], context = {}) {
  const base = Array.isArray(playLogs) ? playLogs : [];
  const events = base.map((log, index) => buildLiveGameEvent(log, index, context));
  if (!events.length) return [];

  const withMarkers = [];
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    withMarkers.push(event);
    const next = events[i + 1];
    if (next && next.quarter !== event.quarter) {
      withMarkers.push({
        ...event,
        id: `${event.id}-q-end`,
        eventType: event.quarter === 2 ? 'halftime' : 'quarter_end',
        headline: event.quarter === 2 ? 'Halftime adjustments on deck.' : `End of Q${event.quarter}`,
        impactTag: event.quarter === 2 ? 'swing' : 'routine',
      });
    }
  }

  const last = withMarkers[withMarkers.length - 1];
  withMarkers.push({
    ...last,
    id: `${last.id}-final`,
    eventType: 'game_end',
    headline: 'Final whistle. Game Book is ready.',
    impactTag: 'swing',
  });

  return withMarkers;
}

export function getNextImportantEvent(events = [], startIndex = 0, filter = 'score') {
  const important = {
    score: (event) => event.eventType === 'touchdown' || event.eventType === 'field_goal',
    redZone: (event) => event.eventType === 'red_zone_entry',
    turnover: (event) => event.eventType === 'turnover',
    keyPlay: (event) => ['turnover', 'touchdown', 'field_goal', 'sack', 'explosive_play', 'turning_point'].includes(event.eventType),
    finalMinutes: (event) => event.quarter >= 4 && /^([0-4]):/.test(String(event.clock || '')),
    end: (event) => event.eventType === 'game_end',
  };
  const matcher = important[filter] || important.keyPlay;
  for (let i = Math.max(0, startIndex + 1); i < events.length; i += 1) {
    if (matcher(events[i])) return i;
  }
  return events.length - 1;
}
