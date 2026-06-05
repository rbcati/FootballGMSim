// Pure, stateless helper that derives a compact game-flow summary from a
// completed game/box-score object. Consumes only fields that exist in
// RichGameSummary and the legacy adapter output — never fabricates values.
//
// Emitted when the source game provides it (richGameSimulator):
//   driveSummary    — per-drive result/yards/plays/time-of-possession
//
// Deferred (not supported by current sim output):
//   longestDriveYards
//   down/distance context per play
//   win probability chart data
//   full play-by-play with formation/personnel
//   SVG drive field visualization
//   true live simulation mode

export const GAME_FLOW_VERSION = 1;

const TURNING_POINT_TYPES = new Set([
  'lead_change', 'turnover', 'swing', 'final_takeaway',
]);

const TURNING_POINT_LABEL = {
  lead_change: 'Lead Change',
  turnover: 'Turnover',
  swing: 'Momentum Swing',
  final_takeaway: 'Final Takeaway',
  touchdown: 'Touchdown',
  field_goal: 'Field Goal',
  sack: 'Sack',
  explosive_play: 'Explosive Play',
};

function safeInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function safeArr(v) {
  return Array.isArray(v) ? v : [];
}

function resolveTeamIds(game) {
  return {
    homeTeamId: game?.homeTeamId ?? game?.homeId ?? null,
    awayTeamId: game?.awayTeamId ?? game?.awayId ?? null,
  };
}

function deriveScoringTimeline(game) {
  return safeArr(game?.scoringSummary)
    .filter((e) => e && typeof e === 'object')
    .map((e) => ({
      quarter: safeInt(e.quarter) || 1,
      teamId: e.teamId ?? null,
      points: safeInt(e.points),
      scoreAfter: {
        home: safeInt(e.scoreAfter?.home ?? e.scoreHomeAfter),
        away: safeInt(e.scoreAfter?.away ?? e.scoreAwayAfter),
      },
      label: String(e.type ?? e.scoreType ?? 'score'),
      description: String(e.text ?? e.description ?? ''),
    }));
}

function deriveTurningPoints(game) {
  const { homeTeamId, awayTeamId } = resolveTeamIds(game);
  return safeArr(game?.playDigest)
    .filter((e) => e && typeof e === 'object' && TURNING_POINT_TYPES.has(e.type))
    .map((e) => ({
      quarter: safeInt(e.quarter) || 1,
      teamId: e.team === 'home' ? homeTeamId : e.team === 'away' ? awayTeamId : null,
      type: String(e.type ?? 'unknown'),
      label: TURNING_POINT_LABEL[e.type] ?? String(e.type ?? 'Key Play'),
      description: String(e.text ?? ''),
      scoreContext: {
        home: safeInt(e.homeScore),
        away: safeInt(e.awayScore),
      },
    }));
}

const DRIVE_RESULTS = new Set(['TD', 'FG', 'Punt', 'INT', 'Fumble', 'Downs']);

function deriveDriveSummary(game) {
  const drives = safeArr(game?.driveSummary)
    .filter((d) => d && typeof d === 'object')
    .map((d, idx) => ({
      drive: safeInt(d.drive) || idx + 1,
      team: d.team === 'home' || d.team === 'away' ? d.team : String(d.team ?? ''),
      result: DRIVE_RESULTS.has(d.result) ? d.result : String(d.result ?? 'Downs'),
      yards: safeInt(d.yards),
      plays: safeInt(d.plays),
      topSeconds: safeInt(d.topSeconds),
    }));
  return drives.length ? drives : null;
}

function buildTeamFlowEntry(stats) {
  if (!stats || typeof stats !== 'object') return null;
  return {
    scoringDrives: safeInt(stats.passTD) + safeInt(stats.rushTD) + safeInt(stats.fieldGoalsMade),
    turnovers: safeInt(stats.turnovers),
    redZoneTrips: safeInt(stats.redZoneTrips),
    redZoneScores: safeInt(stats.redZoneScores),
    explosivePlays: safeInt(stats.explosivePlays),
  };
}

function deriveTeamFlow(game) {
  const { homeTeamId, awayTeamId } = resolveTeamIds(game);
  const homeEntry = buildTeamFlowEntry(game?.teamStats?.home);
  const awayEntry = buildTeamFlowEntry(game?.teamStats?.away);

  if (!homeEntry && !awayEntry) return null;

  const result = {};
  if (homeTeamId != null && homeEntry) result[String(homeTeamId)] = homeEntry;
  if (awayTeamId != null && awayEntry) result[String(awayTeamId)] = awayEntry;
  return Object.keys(result).length ? result : null;
}

/**
 * buildGameFlowSummary(game) → GameFlowSummary | null
 *
 * Accepts a completed RichGameSummary or legacy game/box-score object.
 * Returns a compact deterministic summary, or null if data is insufficient.
 *
 * Properties:
 *   - Deterministic: same input always produces identical output.
 *   - Non-mutating: the input object is never modified.
 *   - Safe: missing or legacy game data returns null rather than crashing.
 *   - Serializable: no functions, classes, or circular refs in output.
 */
export function buildGameFlowSummary(game) {
  if (!game || typeof game !== 'object') return null;

  // Require at least one score value to consider the game completed.
  const homeScore = game?.homeScore ?? game?.finalScore?.home ?? null;
  const awayScore = game?.awayScore ?? game?.finalScore?.away ?? null;
  if (homeScore == null && awayScore == null) return null;

  const scoringTimeline = deriveScoringTimeline(game);
  const turningPoints = deriveTurningPoints(game);
  const teamFlow = deriveTeamFlow(game);
  const driveSummary = deriveDriveSummary(game);

  if (!scoringTimeline.length && !turningPoints.length && !teamFlow && !driveSummary) return null;

  const out = {
    version: GAME_FLOW_VERSION,
    scoringTimeline,
    turningPoints,
    teamFlow,
  };
  // Only present when the sim supplied per-drive data (richGameSimulator). Legacy
  // games omit it so the drive chart can fall back gracefully.
  if (driveSummary) out.driveSummary = driveSummary;
  return out;
}
