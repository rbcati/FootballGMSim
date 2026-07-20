/*
 * Canonical Game Event Ledger (#1700)
 * ───────────────────────────────────
 * The drive engine (`buildDriveBasedSummary`) owns the official final score and
 * now also emits an ordered per-drive outcome log for each team. This module
 * turns those two drive logs into ONE canonical, deterministic event ledger —
 * the single authority for:
 *   - the scoring summary,
 *   - the quarter scores,
 *   - the live scorebug's running score (scoreAfter), and
 *   - the drive-by-drive gamecast feed.
 *
 * LANE B (canonical drive-level gamecast). The authoritative engine owns drives
 * and drive outcomes but NOT individual plays, a trustworthy clock, or per-play
 * player attribution. Accordingly this ledger:
 *   - represents each possession as one drive event (plays + yards + result),
 *   - never invents a game clock (clock is always null; sequence + quarter are
 *     the honest ordering signal),
 *   - never invents player attribution (primary/secondary player ids are null).
 *
 * DETERMINISM. Everything here is a pure transform of already-drawn values plus
 * the seed. No RNG is consumed, so the same seed yields an identical event
 * fingerprint (id / sequence / quarter / team / type / points / scoreAfter).
 *
 * RECONCILIATION (guaranteed by construction, verified by tests):
 *   sum(scoring-event points, per side) === final score
 *   last scoreAfter                     === final score
 *   sum(quarter scores, per side)       === final score
 *   scoreAfter is monotonic and changes only on a scoring event
 *   event sequence is strictly ordered and event ids are unique
 */

const SCORING_RESULTS = new Set(['TOUCHDOWN', 'FIELD_GOAL']);

const RESULT_TO_EVENT_TYPE = {
  TOUCHDOWN: 'touchdown',
  FIELD_GOAL: 'field_goal',
  MISSED_FG: 'missed_fg',
  TURNOVER: 'turnover',
  PUNT: 'punt',
  DOWNS: 'downs',
};

function touchdownLabel(points) {
  if (points >= 8) return 'Touchdown (2-PT good)';
  if (points === 6) return 'Touchdown (PAT no good)';
  return 'Touchdown';
}

function resultLabel(result, points) {
  switch (result) {
    case 'TOUCHDOWN': return touchdownLabel(points);
    case 'FIELD_GOAL': return 'Field Goal';
    case 'MISSED_FG': return 'Missed FG';
    case 'TURNOVER': return 'Turnover';
    case 'PUNT': return 'Punt';
    case 'DOWNS': return 'Turnover on downs';
    default: return 'Drive';
  }
}

function scoreTypeFor(result) {
  if (result === 'TOUCHDOWN') return 'touchdown';
  if (result === 'FIELD_GOAL') return 'field_goal';
  return null;
}

function abbrFor(side, homeAbbr, awayAbbr) {
  return side === 'home' ? homeAbbr : awayAbbr;
}

/**
 * Interleave the two teams' regulation drive logs into a single plausible
 * possession order. Football alternates possessions, so we alternate starting
 * from a seed-derived first possession; when one team has more drives the extra
 * drives append in order. Deterministic (seed-driven), consumes no RNG.
 */
function interleaveDrives(homeDriveLog, awayDriveLog, homeFirst) {
  const seq = [];
  let hi = 0;
  let ai = 0;
  let turn = homeFirst ? 'home' : 'away';
  while (hi < homeDriveLog.length || ai < awayDriveLog.length) {
    if (turn === 'home' && hi < homeDriveLog.length) {
      seq.push({ side: 'home', drive: homeDriveLog[hi++] });
    } else if (turn === 'away' && ai < awayDriveLog.length) {
      seq.push({ side: 'away', drive: awayDriveLog[ai++] });
    } else if (hi < homeDriveLog.length) {
      seq.push({ side: 'home', drive: homeDriveLog[hi++] });
    } else if (ai < awayDriveLog.length) {
      seq.push({ side: 'away', drive: awayDriveLog[ai++] });
    }
    turn = turn === 'home' ? 'away' : 'home';
  }
  return seq;
}

/**
 * Build the canonical event ledger from drive logs.
 *
 * @param {Object} params
 * @param {string} params.gameId
 * @param {number} params.homeId
 * @param {number} params.awayId
 * @param {string} [params.homeAbbr]
 * @param {string} [params.awayAbbr]
 * @param {Array}  params.homeDriveLog  ordered regulation drives (home)
 * @param {Array}  params.awayDriveLog  ordered regulation drives (away)
 * @param {Array}  [params.overtimeEvents]  [{ side:'home'|'away', points, result, isPassTD }]
 * @param {number} [params.seed]        drive-engine seed (first-possession + ids)
 * @returns {{ events:Array, scoringSummary:Array, quarterScores:{home:number[],away:number[]} }}
 */
export function buildCanonicalGameEvents({
  gameId = 'game',
  homeId = null,
  awayId = null,
  homeAbbr = null,
  awayAbbr = null,
  homeDriveLog = [],
  awayDriveLog = [],
  overtimeEvents = [],
  seed = 0,
} = {}) {
  const home = Array.isArray(homeDriveLog) ? homeDriveLog : [];
  const away = Array.isArray(awayDriveLog) ? awayDriveLog : [];
  const ot = Array.isArray(overtimeEvents) ? overtimeEvents : [];

  const homeFirst = (Number(seed) >>> 0) % 2 === 0;
  const seq = interleaveDrives(home, away, homeFirst);

  const totalReg = seq.length;
  const drivesPerQuarter = Math.max(1, Math.ceil(totalReg / 4));
  const hasOt = ot.length > 0;
  const numQuarters = 4 + (hasOt ? 1 : 0);

  const quarterHome = Array.from({ length: numQuarters }, () => 0);
  const quarterAway = Array.from({ length: numQuarters }, () => 0);

  const events = [];
  const scoringSummary = [];
  let runHome = 0;
  let runAway = 0;
  let sequence = 0;

  const teamIdFor = (side) => (side === 'home' ? homeId : awayId);

  const pushEvent = ({ side, drive, quarter, isOt = false }) => {
    sequence += 1;
    const result = drive?.result ?? 'PUNT';
    const points = Math.max(0, Number(drive?.points) || 0);
    const isScore = SCORING_RESULTS.has(result) && points > 0;
    if (side === 'home') runHome += points;
    else runAway += points;
    const qIdx = quarter - 1;
    if (isScore) {
      if (side === 'home') quarterHome[qIdx] += points;
      else quarterAway[qIdx] += points;
    }
    const eventType = RESULT_TO_EVENT_TYPE[result] || 'punt';
    const label = resultLabel(result, points);
    const teamId = teamIdFor(side);
    const abbr = abbrFor(side, homeAbbr, awayAbbr);
    const scoreAfter = { home: runHome, away: runAway };
    const plays = Math.max(0, Number(drive?.plays) || 0);
    const yards = Math.max(0, Number(drive?.yards) || 0);
    const driveId = `${gameId}-drv-${sequence}`;
    const text = isScore
      ? `${abbr ?? 'Offense'} ${label} — ${plays} plays, ${yards} yards`
      : `${abbr ?? 'Offense'} drive: ${label} (${plays} plays, ${yards} yards)`;
    const event = {
      eventId: `${gameId}-evt-${sequence}`,
      gameId,
      driveId,
      sequence,
      quarter,
      clock: null,
      possessionTeamId: teamId,
      scoringTeamId: isScore ? teamId : null,
      eventType,
      driveResult: result,
      points: isScore ? points : 0,
      scoreAfter,
      plays,
      yards,
      isScore,
      isOvertime: isOt,
      primaryPlayerId: null,
      secondaryPlayerId: null,
      teamAbbr: abbr,
      text,
    };
    events.push(event);
    if (isScore) {
      scoringSummary.push({
        id: event.eventId,
        quarter,
        clock: null,
        teamId,
        teamAbbr: abbr,
        scoreType: scoreTypeFor(result),
        type: label,
        points,
        text,
        description: text,
        scoreAfter: { ...scoreAfter },
        // Lane B: drive-level ledger cannot prove per-play attribution.
        passerId: null,
        rusherId: null,
        receiverId: null,
        defenderId: null,
        kickerId: null,
      });
    }
  };

  seq.forEach((entry, i) => {
    const quarter = Math.min(4, Math.floor(i / drivesPerQuarter) + 1);
    pushEvent({ side: entry.side, drive: entry.drive, quarter });
  });

  // Overtime: extend the quarter array (Q5 = OT) rather than folding OT points
  // into the fourth quarter.
  ot.forEach((otEvent) => {
    const side = otEvent?.side === 'home' ? 'home' : 'away';
    const points = Math.max(0, Number(otEvent?.points) || 0);
    if (points <= 0) return;
    const result = otEvent?.result === 'FIELD_GOAL' ? 'FIELD_GOAL' : 'TOUCHDOWN';
    pushEvent({ side, drive: { result, points, plays: 0, yards: 0 }, quarter: 5, isOt: true });
  });

  // Terminal game-end marker carries the final scoreAfter so the last canonical
  // scoreAfter always equals the official final, even for a 0-0 game.
  sequence += 1;
  events.push({
    eventId: `${gameId}-evt-${sequence}`,
    gameId,
    driveId: null,
    sequence,
    quarter: hasOt ? 5 : 4,
    clock: null,
    possessionTeamId: null,
    scoringTeamId: null,
    eventType: 'game_end',
    driveResult: 'GAME_END',
    points: 0,
    scoreAfter: { home: runHome, away: runAway },
    plays: 0,
    yards: 0,
    isScore: false,
    isOvertime: hasOt,
    primaryPlayerId: null,
    secondaryPlayerId: null,
    teamAbbr: null,
    text: 'Final whistle.',
  });

  return {
    events,
    scoringSummary,
    quarterScores: { home: quarterHome, away: quarterAway },
  };
}

/**
 * Pure reconciliation checker used by the regression suite (and available to
 * runtime asserts). Returns a structured report; never throws.
 */
export function reconcileCanonicalEvents(events = [], finalScore = {}) {
  const list = Array.isArray(events) ? events : [];
  const scoring = list.filter((e) => e && e.isScore);
  // Per-side point totals are recomputed from the monotonic scoreAfter steps so
  // the checker verifies the ledger's own running score rather than trusting the
  // raw points field.
  let home = 0;
  let away = 0;
  const finalHome = Number(finalScore?.home);
  const finalAway = Number(finalScore?.away);
  const last = list[list.length - 1] || null;
  const lastAfter = last?.scoreAfter ?? null;
  let prevHome = 0;
  let prevAway = 0;
  let monotonic = true;
  let scoreOnlyOnScore = true;
  let strictlyOrdered = true;
  const ids = new Set();
  let uniqueIds = true;
  let prevSeq = -Infinity;
  for (const e of list) {
    if (!e) continue;
    if (ids.has(e.eventId)) uniqueIds = false;
    ids.add(e.eventId);
    if (!(e.sequence > prevSeq)) strictlyOrdered = false;
    prevSeq = e.sequence;
    const after = e.scoreAfter ?? { home: prevHome, away: prevAway };
    const dHome = Number(after.home) - prevHome;
    const dAway = Number(after.away) - prevAway;
    if (dHome < 0 || dAway < 0) monotonic = false;
    if ((dHome > 0 || dAway > 0) && !e.isScore) scoreOnlyOnScore = false;
    home += Math.max(0, dHome);
    away += Math.max(0, dAway);
    prevHome = Number(after.home);
    prevAway = Number(after.away);
  }
  return {
    pointsHome: home,
    pointsAway: away,
    lastAfter,
    finalMatchesLast: lastAfter != null
      && Number(lastAfter.home) === finalHome
      && Number(lastAfter.away) === finalAway,
    finalMatchesSum: home === finalHome && away === finalAway,
    monotonic,
    scoreOnlyOnScore,
    strictlyOrdered,
    uniqueIds,
    scoringEventCount: scoring.length,
  };
}
