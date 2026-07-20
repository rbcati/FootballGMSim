/**
 * Schedule / standings / game-integrity invariants.
 *
 * Phase-aware: regular-season record reconciliation only runs once a regular
 * season has been played (regular/playoffs/offseason/preseason checkpoints).
 * Playoff games are evaluated separately and NEVER folded into per-team
 * regular-season game-count expectations (a first-round loser and a champion
 * play a different number of total games).
 */
import { pass, fail, skip, isFiniteNumber, isUnsafeNumber, hasId, gamePhase } from './helpers.js';
import { viewTeams, teamIdSet } from './derive.js';
import { canonicalIdKey, sameEntityId } from '../../../src/core/referenceIntegrity.js';

/**
 * A schedule entry is a "bye marker" (not a real game) when it explicitly
 * carries a `bye` field, or — for legacy slim schedules written before the
 * canonical bye fix — when it lacks BOTH a home and an away reference. Such
 * entries are validated as byes, never as team-reference games or self-games.
 */
function isByeEntry(g) {
  if (g && g.bye != null) return true;
  return canonicalIdKey(g?.home) === null && canonicalIdKey(g?.away) === null;
}

export const id = 'schedule';

export function check(ctx) {
  const out = [];
  const teams = viewTeams(ctx);
  if (!teams.length) {
    out.push(skip(ctx, 'schedule.present', 'No teams in view state at this checkpoint'));
    return out;
  }
  const validTeamIds = teamIdSet(ctx);

  // ── standings numbers are finite ─────────────────────────────────────────
  const stdFields = ['wins', 'losses', 'ties', 'ptsFor', 'ptsAgainst'];
  const badStd = [];
  for (const team of teams) {
    for (const f of stdFields) {
      const v = team[f];
      if (v == null) continue;
      if (isUnsafeNumber(v) || (typeof v === 'number' && v < 0)) {
        badStd.push({ teamId: team.id, field: f, value: String(v) });
      }
    }
  }
  if (badStd.length) {
    for (const b of badStd.slice(0, 12)) {
      out.push(fail(ctx, 'schedule.standings-finite', {
        entityType: 'team', entityId: b.teamId,
        message: `Team ${b.teamId} ${b.field}=${b.value} is not a valid standings value`,
        details: b,
      }));
    }
  } else {
    out.push(pass(ctx, 'schedule.standings-finite', 'All standings win/loss/tie/points values finite & non-negative'));
  }

  // ── schedule references valid teams; no self-games ───────────────────────
  const schedule = ctx?.view?.schedule;
  const weeks = Array.isArray(schedule?.weeks) ? schedule.weeks : null;
  const knownIds = [...validTeamIds];
  const scheduleMetaType = schedule == null ? 'null' : (Array.isArray(schedule) ? 'array' : typeof schedule);
  if (weeks) {
    const badGames = [];
    const selfGamesDetail = [];
    const badByeRefs = [];
    const playAndByeConflicts = [];
    let selfGames = 0;
    let completedNoResult = 0;
    let played = 0;
    for (const wk of weeks) {
      const gamesArr = Array.isArray(wk?.games) ? wk.games : [];
      const playingKeys = new Set();
      for (let gi = 0; gi < gamesArr.length; gi++) {
        const g = gamesArr[gi];
        if (isByeEntry(g)) continue; // byes validated below, never as games
        const home = g?.home;
        const away = g?.away;
        const homeKey = canonicalIdKey(home);
        const awayKey = canonicalIdKey(away);
        if (homeKey === null || awayKey === null || !validTeamIds.has(homeKey) || !validTeamIds.has(awayKey)) {
          badGames.push({
            week: wk.week, gameIndex: gi,
            home, homeType: typeof home, homeKey,
            away, awayType: typeof away, awayKey,
            reason: 'invalid-team-ref',
          });
        }
        if (homeKey !== null) playingKeys.add(homeKey);
        if (awayKey !== null) playingKeys.add(awayKey);
        if (sameEntityId(home, away)) {
          selfGames += 1;
          if (selfGamesDetail.length < 5) {
            selfGamesDetail.push({ week: wk.week, gameIndex: gi, home, homeKey, away, awayKey });
          }
        }
        if (g?.played) {
          played += 1;
          const hasResult = g.homeScore != null && g.awayScore != null;
          if (!hasResult) completedNoResult += 1;
        }
      }
      // Bye references must resolve to a valid team and must not also play.
      const byes = Array.isArray(wk?.teamsWithBye) ? wk.teamsWithBye : [];
      for (const b of byes) {
        const bk = canonicalIdKey(b);
        if (bk === null || !validTeamIds.has(bk)) {
          badByeRefs.push({ week: wk.week, bye: b, byeType: typeof b, byeKey: bk });
        } else if (playingKeys.has(bk)) {
          playAndByeConflicts.push({ week: wk.week, team: bk });
        }
      }
    }
    if (badGames.length) {
      out.push(fail(ctx, 'schedule.games-reference-valid-teams', {
        entityType: 'game', entityId: null,
        message: `${badGames.length} scheduled games reference an unknown team`,
        details: { count: badGames.length, sample: badGames.slice(0, 5), knownIds, scheduleMetaType },
      }));
    } else {
      out.push(pass(ctx, 'schedule.games-reference-valid-teams', 'All scheduled games reference valid teams'));
    }
    if (selfGames) {
      out.push(fail(ctx, 'schedule.no-self-games', {
        entityType: 'game', entityId: null,
        message: `${selfGames} games list the same team as home and away`,
        details: { count: selfGames, sample: selfGamesDetail },
      }));
    } else {
      out.push(pass(ctx, 'schedule.no-self-games', 'No game has identical home & away team'));
    }
    if (badByeRefs.length) {
      out.push(fail(ctx, 'schedule.bye-refs-valid', {
        entityType: 'game', entityId: null,
        message: `${badByeRefs.length} bye entries reference an unknown team`,
        details: { count: badByeRefs.length, sample: badByeRefs.slice(0, 5), knownIds },
      }));
    } else {
      out.push(pass(ctx, 'schedule.bye-refs-valid', 'All bye entries reference valid teams'));
    }
    if (playAndByeConflicts.length) {
      out.push(fail(ctx, 'schedule.no-play-and-bye', {
        entityType: 'game', entityId: null,
        message: `${playAndByeConflicts.length} teams both play and have a bye in the same week`,
        details: { count: playAndByeConflicts.length, sample: playAndByeConflicts.slice(0, 5) },
      }));
    } else {
      out.push(pass(ctx, 'schedule.no-play-and-bye', 'No team both plays and has a bye in the same week'));
    }
    if (completedNoResult) {
      out.push(fail(ctx, 'schedule.completed-games-have-result', {
        entityType: 'game', entityId: null,
        message: `${completedNoResult} games marked played but missing a final score`,
        details: { count: completedNoResult, played },
      }));
    } else {
      out.push(pass(ctx, 'schedule.completed-games-have-result', `All ${played} played games carry a final score`));
    }
  } else {
    out.push(skip(ctx, 'schedule.games-reference-valid-teams', 'No expanded schedule weeks in view at this checkpoint'));
  }

  // ── champion (offseason/preseason checkpoints) references a valid team ────
  const phase = gamePhase(ctx);
  const phaseAfterPlayoffs = phase === 'offseason' || phase === 'offseason_resign' || phase === 'preseason' || ctx.phase === 'afterPlayoffs' || ctx.phase === 'afterSeasonRollover';
  const champ = ctx?.view?.championTeamId;
  if (phaseAfterPlayoffs) {
    if (champ == null) {
      // Champion may legitimately be cleared right after rollover into a new year.
      out.push(skip(ctx, 'schedule.champion-valid', 'No champion set at this checkpoint (post-rollover clears it)'));
    } else if (!validTeamIds.has(String(champ))) {
      out.push(fail(ctx, 'schedule.champion-valid', {
        entityType: 'team', entityId: champ,
        message: `championTeamId ${champ} does not reference a valid team`,
        details: { championTeamId: champ },
      }));
    } else {
      out.push(pass(ctx, 'schedule.champion-valid', `Champion team ${champ} is valid`));
    }
  } else {
    out.push(skip(ctx, 'schedule.champion-valid', `Champion not expected during phase "${ctx.phase}"`));
  }

  return out;
}
