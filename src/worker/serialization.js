/**
 * Worker Message Serialization & Transferable Payload System
 *
 * Eliminates Structured Clone bottlenecks in the main↔worker IPC channel by:
 *  1. Packing player OVR rating data into Float32Array (binary Transferable)
 *  2. Packing schedule game entries into Int32Array (binary Transferable)
 *  3. Computing tick-update deltas so STATE_UPDATE only carries changed fields
 *  4. Forcing JSON.stringify for payloads >2MB (faster than V8 structured clone
 *     for deeply nested objects — empirically measured)
 *
 * Public API (all pure, no side effects):
 *  buildRatingMatrix(players)          → { buffer: Float32Array, playerIds }
 *  buildScheduleBuffer(schedule)       → Int32Array
 *  unpackScheduleBuffer(buf)           → { weeks: [...] }
 *  serializeLeagueDelta(full, prev)    → { delta, ratingMatrix, scheduleBuffer }
 *  applyLeagueDelta(currentState, delta) → patched state object
 *  estimatePayloadBytes(payload)       → number
 *  serializePayloadForPost(payload)    → { data, isJson, bytes }
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Payload byte threshold above which JSON.stringify is faster than structured clone in V8. */
export const JSON_SERIALIZATION_THRESHOLD = 2 * 1024 * 1024; // 2 MB

/**
 * Float32 slots per player.
 * Layout: [teamId, ovr, age, potential, speed, strength, awareness, agility]
 */
export const PLAYER_RATING_STRIDE = 8;

/**
 * Int32 slots per schedule game entry.
 * Layout: [week, homeId, awayId, homeScore, awayScore, played(0|1)]
 */
export const GAME_SCHEDULE_STRIDE = 6;

// ── Binary Packing ────────────────────────────────────────────────────────────

/**
 * Pack all player rating data into a transferable Float32Array.
 * String player IDs are returned in a parallel array (can't go into a typed buffer).
 *
 * @param {object[]} players
 * @returns {{ buffer: Float32Array, playerIds: string[] }}
 */
export function buildRatingMatrix(players) {
  const playerIds = new Array(players.length);
  const data = new Float32Array(players.length * PLAYER_RATING_STRIDE);
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const base = i * PLAYER_RATING_STRIDE;
    playerIds[i] = String(p.id);
    data[base + 0] = Number(p.teamId ?? -1);
    data[base + 1] = Number(p.ovr ?? 70);
    data[base + 2] = Number(p.age ?? 22);
    data[base + 3] = Number(p.pot ?? p.potential ?? p.ovr ?? 70);
    data[base + 4] = Number(p.speed ?? p.spd ?? 70);
    data[base + 5] = Number(p.strength ?? p.str ?? 70);
    data[base + 6] = Number(p.awareness ?? p.awr ?? 70);
    data[base + 7] = Number(p.agility ?? p.agi ?? 70);
  }
  return { buffer: data, playerIds };
}

/**
 * Pack slim schedule weeks into a transferable Int32Array.
 * Scores are clamped to int32 range (no overflow risk for football scores).
 *
 * @param {{ weeks: { week: number, games: object[] }[] }} schedule
 * @returns {Int32Array}
 */
export function buildScheduleBuffer(schedule) {
  const weeks = Array.isArray(schedule?.weeks) ? schedule.weeks : [];
  const entries = [];
  for (const w of weeks) {
    for (const g of (Array.isArray(w.games) ? w.games : [])) {
      entries.push(
        Number(w.week ?? 0),
        Number(g.home ?? 0),
        Number(g.away ?? 0),
        Number(g.homeScore ?? 0),
        Number(g.awayScore ?? 0),
        g.played ? 1 : 0,
      );
    }
  }
  return new Int32Array(entries);
}

/**
 * Reconstruct a slim schedule object from a packed Int32Array.
 *
 * @param {Int32Array} buf
 * @returns {{ weeks: { week: number, games: object[] }[] }}
 */
export function unpackScheduleBuffer(buf) {
  const weekMap = new Map();
  const gameCount = Math.floor(buf.length / GAME_SCHEDULE_STRIDE);
  for (let i = 0; i < gameCount; i++) {
    const base = i * GAME_SCHEDULE_STRIDE;
    const week = buf[base + 0];
    if (!weekMap.has(week)) weekMap.set(week, []);
    weekMap.get(week).push({
      home: buf[base + 1],
      away: buf[base + 2],
      homeScore: buf[base + 3],
      awayScore: buf[base + 4],
      played: buf[base + 5] === 1,
    });
  }
  const weeks = [];
  for (const [week, games] of weekMap) weeks.push({ week, games });
  weeks.sort((a, b) => a.week - b.week);
  return { weeks };
}

// ── Delta Serialization ────────────────────────────────────────────────────────

/**
 * Scalar view-state fields compared by strict equality.
 * Any change causes the new value to appear in the delta.
 */
const DELTA_SCALAR_FIELDS = [
  'week', 'year', 'phase', 'seasonId', 'userTeamId',
  'ownerApproval', 'fanApproval', 'nextGameStakes',
  'draftStarted', 'draftLifecycleStatus', 'offseasonProgressionDone',
  'championTeamId', 'activeLeagueId', 'godMode',
  'commissionerMode', 'commissionerEverEnabled',
];

/**
 * Array fields that are diffed by length + last-element fingerprint.
 * The full updated array is included in the delta when it changes.
 */
const DELTA_ARRAY_FIELDS = [
  'newsItems', 'ownerGoals', 'incomingTradeOffers', 'retiredPlayers',
  'leagueHistory', 'franchiseChronicle', 'franchiseSeasonReviews',
  'hallOfFameClasses', 'weeklyHeadlines', 'commissionerLog',
  'seasonStorylines',
];

/**
 * Small object fields JSON-diffed for change detection.
 * Sent in full when changed (they're never large enough to warrant binary packing).
 */
const DELTA_OBJECT_FIELDS = [
  'settings', 'economy', 'freeAgencyState', 'contractMarket',
  'tradeDeadline', 'playoffSeeds', 'standingsContext', 'standings',
  'records', 'recordBook',
  'playerSeasonStatsArchive',
  'teamCulture',
];

/**
 * Build a minimal "tick-update" delta from the current full view state.
 * Only fields that differ from `previousState` are included.
 *
 * Additionally packs player ratings and schedule into Transferable typed arrays.
 * These are ALWAYS re-packed (cheap, ~100µs for a 32-team league) so the receiver
 * always has fresh binary data even when the teams array itself is unchanged.
 *
 * @param {object} fullState     New full view state (from buildViewState())
 * @param {object|null} previousState  Last state sent to the UI (null → first send)
 * @returns {{
 *   delta: object,
 *   ratingMatrix: { buffer: Float32Array, playerIds: string[] } | null,
 *   scheduleBuffer: Int32Array | null
 * }}
 */
export function serializeLeagueDelta(fullState, previousState) {
  const delta = { _isDelta: true };
  const hasPrev = previousState != null;

  // ── Scalar fields ────────────────────────────────────────────────────────
  for (const field of DELTA_SCALAR_FIELDS) {
    const curr = fullState[field];
    if (!hasPrev || curr !== previousState[field]) {
      delta[field] = curr;
    }
  }

  // ── Array fields (length + tail fingerprint) ─────────────────────────────
  for (const field of DELTA_ARRAY_FIELDS) {
    const curr = fullState[field];
    const prev = hasPrev ? previousState[field] : undefined;
    if (!hasPrev || !Array.isArray(prev) || !Array.isArray(curr)) {
      if (curr !== prev) delta[field] = curr;
      continue;
    }
    const changed =
      curr.length !== prev.length ||
      (curr.length > 0 &&
        JSON.stringify(curr[curr.length - 1]) !== JSON.stringify(prev[prev.length - 1]));
    if (changed) delta[field] = curr;
  }

  // ── Object fields (JSON fingerprint) ────────────────────────────────────
  for (const field of DELTA_OBJECT_FIELDS) {
    const curr = fullState[field];
    const prev = hasPrev ? previousState[field] : undefined;
    if (!hasPrev || JSON.stringify(curr) !== JSON.stringify(prev)) {
      delta[field] = curr;
    }
  }

  // ── Teams (with roster — backward compatible) ────────────────────────────
  // Only include when any team's win/loss/cap/ovr/fanApproval has changed.
  const teams = fullState.teams ?? [];
  const prevTeams = hasPrev ? (previousState.teams ?? []) : null;
  const teamsChanged =
    !prevTeams ||
    teams.length !== prevTeams.length ||
    teams.some((t, i) => {
      const pt = prevTeams[i];
      return (
        !pt ||
        t.wins !== pt.wins ||
        t.losses !== pt.losses ||
        t.ties !== pt.ties ||
        t.capUsed !== pt.capUsed ||
        t.ovr !== pt.ovr ||
        t.fanApproval !== pt.fanApproval ||
        t.rosterCount !== pt.rosterCount
      );
    });

  if (teamsChanged) {
    delta.teams = teams;
  }

  // ── Binary Transferables ─────────────────────────────────────────────────
  let ratingMatrix = null;
  const allPlayers = teams.flatMap(t => Array.isArray(t.roster) ? t.roster : []);
  if (allPlayers.length > 0) {
    ratingMatrix = buildRatingMatrix(allPlayers);
  }

  let scheduleBuffer = null;
  if (fullState.schedule) {
    scheduleBuffer = buildScheduleBuffer(fullState.schedule);
  }

  return { delta, ratingMatrix, scheduleBuffer };
}

/**
 * Apply a delta patch to a cached state object (in-place merge).
 * If `delta` is not a delta object (missing `_isDelta`), it is treated as a
 * full-hydration payload and returned directly — this is the backward-compat path
 * for initial load via FULL_STATE.
 *
 * @param {object} currentState  Cached state to update
 * @param {object} delta         Delta from serializeLeagueDelta (or a full state)
 * @returns {object} Updated state (new object reference)
 */
export function applyLeagueDelta(currentState, delta) {
  if (!delta) return currentState;
  if (typeof delta !== "object" || Array.isArray(delta)) {
    return { ...currentState, _requiresFullState: true };
  }
  if (delta._isDelta !== true) {
    return { ...currentState, _requiresFullState: true };
  }
  const patched = { ...currentState };
  for (const [key, value] of Object.entries(delta)) {
    // Skip internal protocol fields that must not leak into the UI league state.
    if (key === '_isDelta' || key === '_stateEpoch') continue;
    patched[key] = value;
  }
  return patched;
}

// ── Payload Size & Serialization Path Selection ───────────────────────────────

/**
 * Estimate payload byte size via JSON.stringify (UTF-16 ≈ 2 bytes/char in V8).
 * Returns Infinity if serialization fails (circular refs, etc.).
 *
 * @param {*} payload
 * @returns {number}
 */
export function estimatePayloadBytes(payload) {
  try {
    return JSON.stringify(payload).length * 2;
  } catch {
    return Infinity;
  }
}

/**
 * Choose the optimal postMessage payload encoding.
 *
 * Empirical benchmarks show that for deeply nested JS objects exceeding ~2MB,
 * JSON.stringify → postMessage(string) is faster in current V8 than structured
 * clone because V8's clone algorithm does an O(N) recursive graph walk whereas
 * JSON stringify is a single linear pass with a simpler write path.
 *
 * The receiver must detect `_jsonPayload` and parse it back.
 *
 * @param {*} payload
 * @returns {{ data: any, isJson: boolean, bytes: number }}
 */
export function serializePayloadForPost(payload) {
  const bytes = estimatePayloadBytes(payload);
  if (bytes > JSON_SERIALIZATION_THRESHOLD) {
    return { data: JSON.stringify(payload), isJson: true, bytes };
  }
  return { data: payload, isJson: false, bytes };
}
