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

function toFiniteScore(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Canonical-data policy for the live feed.
 *
 * The play logs emitted by the narration engine carry per-play
 * `homeScore`/`awayScore` snapshots, but those values are NOT canonical:
 * the league-recorded final comes from a separate drive engine
 * (see `src/core/simulation/index.js` — `buildDriveBasedSummary` overrides
 * `homeScore`/`awayScore` after the narration loop runs), so the narrated
 * running score routinely contradicts the real result. Rather than stamp a
 * score on every event card that can contradict the recorded final, events
 * carry `score: null` and only the appended `game_end` marker is stamped with
 * the canonical final passed in via `context.finalScore`.
 *
 * The per-play `clock` value is likewise drive-granular (every play in a
 * drive shares one clock string, and the seconds are randomized), so the feed
 * exposes `sequence` (a real event-order indicator) instead of pretending to
 * have a trustworthy per-play game clock. The raw log stays on `raw` for
 * data-level consumers (jump filters), which never display it.
 */
export function buildLiveGameEvent(log = {}, index = 0, context = {}) {
  const eventType = normalizeEventType(log);
  return {
    id: `${context.gameId || 'game'}-${index}`,
    gameId: context.gameId || 'game',
    quarter: Number(log.quarter || 1),
    clock: log.clock || log.timeLeft || null,
    sequence: index + 1,
    offenseTeamId: log.possession === 'home' ? context.homeTeamId : context.awayTeamId,
    defenseTeamId: log.possession === 'home' ? context.awayTeamId : context.homeTeamId,
    eventType,
    headline: String(log.text || log.playText || 'Drive develops').trim(),
    detail: log.description || undefined,
    // Untrusted per-play score snapshots are intentionally omitted — see note above.
    score: null,
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

  // The final marker is the only event stamped with a score, and only when the
  // caller supplies the canonical league-recorded final. Never reconstructed
  // from the narration stream.
  const finalHome = toFiniteScore(context.finalScore?.home);
  const finalAway = toFiniteScore(context.finalScore?.away);
  const canonicalFinal = finalHome != null && finalAway != null
    ? { home: finalHome, away: finalAway }
    : null;

  const last = withMarkers[withMarkers.length - 1];
  withMarkers.push({
    ...last,
    id: `${last.id}-final`,
    eventType: 'game_end',
    headline: 'Final whistle. Game Book is ready.',
    impactTag: 'swing',
    score: canonicalFinal,
  });

  return withMarkers;
}

/**
 * Map the CANONICAL drive-level event ledger (#1700) to the live-feed shape the
 * viewer renders. Every canonical event carries a `scoreAfter` derived from the
 * drive engine's outcomes, so the scorebug and feed show a monotonic score
 * progression toward the official final — no narration score is ever consulted.
 * The possession ORDER (and thus the intermediate running score) is a
 * deterministic reconstruction, not a recorded chronology; the viewer labels it
 * "Reconstructed order" and only the final total is official.
 *
 * The sim owns no chronological quarters, so the feed does NOT insert fabricated
 * quarter/halftime markers. Drives are labeled by their `periodLabel`
 * ("Drive 8"); the one period boundary the sim tracks — the start of overtime —
 * is marked explicitly.
 */
export function mapCanonicalEventsToLiveFeed(canonicalEvents = [], context = {}) {
  const list = Array.isArray(canonicalEvents) ? canonicalEvents : [];
  if (!list.length) return [];

  const toFeed = (event) => {
    const eventType = event.eventType || 'routine';
    const isScore = Boolean(event.isScore);
    const impactTag = EVENT_TYPE_TO_TAG[eventType]
      || (event.isOvertime ? 'swing' : 'routine');
    const scoreAfter = event.scoreAfter && Number.isFinite(Number(event.scoreAfter.home))
      ? { home: Number(event.scoreAfter.home), away: Number(event.scoreAfter.away) }
      : null;
    return {
      id: event.eventId,
      gameId: event.gameId || context.gameId || 'game',
      // No fabricated quarter — regulation carries `quarter: null` and the honest
      // `periodLabel` ("Drive 8"); OT carries isOvertime + periodLabel 'OT'.
      quarter: null,
      periodLabel: event.periodLabel ?? (event.isOvertime ? 'OT' : null),
      driveNumber: event.driveNumber ?? null,
      clock: null,
      sequence: event.sequence,
      eventType,
      headline: String(event.text || 'Drive').trim(),
      possessionTeamId: event.possessionTeamId ?? null,
      scoringTeamId: event.scoringTeamId ?? null,
      // Canonical running score after this event — the ONLY score the scorebug
      // and feed ever read. On non-scoring events it carries the unchanged
      // running total so the scorebug can display live progress at any index.
      scoreAfter,
      // Score chip renders on scoring events and the final marker.
      score: (isScore || eventType === 'game_end') ? scoreAfter : null,
      fieldPosition: null,
      plays: event.plays ?? 0,
      yards: event.yards ?? 0,
      isScore,
      isOvertime: Boolean(event.isOvertime),
      impactTag,
      raw: event,
    };
  };

  const feed = [];
  for (let i = 0; i < list.length; i += 1) {
    const event = list[i];
    feed.push(toFeed(event));
    const next = list[i + 1];
    // The only honest period boundary is the start of overtime.
    if (next && next.isOvertime && !event.isOvertime && event.eventType !== 'game_end') {
      feed.push({
        ...toFeed(event),
        id: `${event.eventId}-ot-start`,
        eventType: 'overtime_start',
        periodLabel: 'OT',
        headline: 'Overtime',
        impactTag: 'swing',
        score: null,
        isScore: false,
      });
    }
  }
  return feed;
}

/**
 * Count the real regulation DRIVES in a canonical feed/ledger. The terminal
 * `game_end` marker and the `overtime_start` divider are NOT drives, and OT
 * possessions are counted separately — so a game with 24 regulation drives plus
 * a final marker returns 24, never 25 (#1700 review defect #4). Pure; never
 * mutates the event package.
 */
export function countCanonicalRegulationDrives(events = []) {
  const list = Array.isArray(events) ? events : [];
  let max = 0;
  for (const e of list) {
    if (!e || e.isOvertime) continue;
    if (e.eventType === 'game_end' || e.eventType === 'overtime_start') continue;
    const n = Number(e.driveNumber);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
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
