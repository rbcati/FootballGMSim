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
  if (weeks) {
    const badGames = [];
    let selfGames = 0;
    let completedNoResult = 0;
    let played = 0;
    for (const wk of weeks) {
      for (const g of Array.isArray(wk?.games) ? wk.games : []) {
        const home = g?.home;
        const away = g?.away;
        if (!validTeamIds.has(String(home)) || !validTeamIds.has(String(away))) {
          badGames.push({ week: wk.week, home, away, reason: 'invalid-team-ref' });
        }
        if (String(home) === String(away)) selfGames += 1;
        if (g?.played) {
          played += 1;
          const hasResult = g.homeScore != null && g.awayScore != null;
          if (!hasResult) completedNoResult += 1;
        }
      }
    }
    if (badGames.length) {
      out.push(fail(ctx, 'schedule.games-reference-valid-teams', {
        entityType: 'game', entityId: null,
        message: `${badGames.length} scheduled games reference an unknown team`,
        details: { count: badGames.length, sample: badGames.slice(0, 5) },
      }));
    } else {
      out.push(pass(ctx, 'schedule.games-reference-valid-teams', 'All scheduled games reference valid teams'));
    }
    if (selfGames) {
      out.push(fail(ctx, 'schedule.no-self-games', {
        entityType: 'game', entityId: null,
        message: `${selfGames} games list the same team as home and away`,
        details: { count: selfGames },
      }));
    } else {
      out.push(pass(ctx, 'schedule.no-self-games', 'No game has identical home & away team'));
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
