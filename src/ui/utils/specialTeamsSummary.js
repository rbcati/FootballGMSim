/**
 * specialTeamsSummary.js — presentation-only special-teams rollup for the
 * Game Book / post-game summary.
 *
 * Reads the special-teams counters added to buildDriveBasedSummary()
 * (punts, fgAttempts, fgMade, twoPointAttempts, twoPointMade — surfaced to
 * the UI as teamDriveStats.home/away) with safe fallbacks for legacy game
 * objects that predate those fields.
 */

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Punt totals at or above this read as a field-position battle.
const PUNT_HEAVY_THRESHOLD = 6;

function sideSources(game = {}, side) {
  const rawDrive = game?.teamDriveStats?.[side]
    ?? (side === 'home' ? game?.homeStats : game?.awayStats);
  const driveStats = (rawDrive && typeof rawDrive === 'object') ? rawDrive : {};
  const rawTeam = game?.teamStats?.[side];
  const teamStats = (rawTeam && typeof rawTeam === 'object') ? rawTeam : {};
  // Legacy scalar counters from the drive summary (FGs made, XPs made).
  const legacyFGs = toNum(game?.[`${side}FGs`]);
  const legacyXPs = toNum(game?.[`${side}XPs`]);
  return { driveStats, teamStats, legacyFGs, legacyXPs };
}

function buildSide(game, side) {
  const { driveStats, teamStats, legacyFGs, legacyXPs } = sideSources(game, side);

  const fgMade = toNum(driveStats.fgMade) ?? toNum(teamStats.fieldGoalsMade) ?? legacyFGs ?? 0;
  // Legacy records only counted made FGs, so attempts fall back to made.
  const fgAttempts = Math.max(
    toNum(driveStats.fgAttempts) ?? toNum(teamStats.fieldGoalsAttempted) ?? legacyFGs ?? 0,
    fgMade,
  );
  const punts = toNum(driveStats.punts) ?? toNum(teamStats.punts) ?? 0;
  const twoPointMade = toNum(driveStats.twoPointMade) ?? 0;
  const twoPointAttempts = Math.max(toNum(driveStats.twoPointAttempts) ?? 0, twoPointMade);
  const xpMade = legacyXPs ?? toNum(driveStats.xpMade) ?? toNum(teamStats.extraPointsMade) ?? null;

  // Any drive-level team stats mean a simulated game — show the section with
  // safe zero defaults even if the record predates the special-teams counters.
  // Only score-only games (no team stats of any kind) hide the section.
  const hasData = Object.keys(driveStats).length > 0
    || toNum(teamStats.fieldGoalsMade) != null
    || toNum(teamStats.fieldGoalsAttempted) != null
    || toNum(teamStats.punts) != null
    || toNum(teamStats.extraPointsMade) != null
    || legacyFGs != null
    || legacyXPs != null;

  return { fgMade, fgAttempts, punts, twoPointMade, twoPointAttempts, xpMade, hasData };
}

function buildNotes(home, away) {
  const notes = [];
  const push = (side, text) => notes.push({ id: `${side}-${notes.length}`, side, text });

  for (const [side, stats] of [['away', away], ['home', home]]) {
    if (stats.twoPointAttempts > 0) push(side, '2-point attempt changed the scoring math.');
    if (stats.fgAttempts > stats.fgMade) push(side, 'Missed field goal opportunity.');
  }
  if (home.punts >= PUNT_HEAVY_THRESHOLD && away.punts >= PUNT_HEAVY_THRESHOLD) {
    push('game', 'Field-position game.');
  } else {
    if (away.punts >= PUNT_HEAVY_THRESHOLD) push('away', 'Field-position game.');
    if (home.punts >= PUNT_HEAVY_THRESHOLD) push('home', 'Field-position game.');
  }
  return notes;
}

/**
 * Builds the special-teams section model from any game-shaped payload
 * (archived, normalized, or raw sim result). Never throws on missing data.
 *
 * @returns {{ hasData: boolean,
 *             home: object, away: object,
 *             rows: Array<{key, label, home: string, away: string}>,
 *             notes: Array<{id, side, text}> }}
 */
export function buildSpecialTeamsSummary(game) {
  const safeGame = (game && typeof game === 'object') ? game : {};
  const home = buildSide(safeGame, 'home');
  const away = buildSide(safeGame, 'away');
  const hasData = home.hasData || away.hasData;

  const fmtRatio = (made, att) => `${made}/${att}`;
  const fmtCount = (value) => (value == null ? '—' : String(value));

  const rows = [
    { key: 'fg', label: 'FG Made/Att', away: fmtRatio(away.fgMade, away.fgAttempts), home: fmtRatio(home.fgMade, home.fgAttempts) },
    { key: 'xp', label: 'XP Made', away: fmtCount(away.xpMade), home: fmtCount(home.xpMade) },
    { key: 'punts', label: 'Punts', away: fmtCount(away.punts), home: fmtCount(home.punts) },
    { key: 'twoPoint', label: '2PT Made/Att', away: fmtRatio(away.twoPointMade, away.twoPointAttempts), home: fmtRatio(home.twoPointMade, home.twoPointAttempts) },
  ];

  return { hasData, home, away, rows, notes: hasData ? buildNotes(home, away) : [] };
}

export default buildSpecialTeamsSummary;
