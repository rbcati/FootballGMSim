/**
 * History, records & awards invariants.
 *
 * Phase-aware: a completed-season archive & awards only exist AFTER a season is
 * finalized. At the afterSeasonRollover checkpoint for season N (N>=2), the
 * league history must have accumulated (never overwritten) prior seasons.
 * Optional awards that the production system legitimately omits are not required.
 */
import { pass, fail, skip, findDuplicateIds, hasId } from './helpers.js';
import { leagueHistory, teamIdSet } from './derive.js';

export const id = 'history';

export function check(ctx) {
  const out = [];
  const history = leagueHistory(ctx);
  const validTeamIds = teamIdSet(ctx);
  // A completed-season archive is expected once we have rolled past a full season.
  const expectHistory = ctx.phase === 'afterSeasonRollover' && Number(ctx.season) >= 2;

  // ── completed-season history exists & accumulates ────────────────────────
  if (expectHistory) {
    if (!history.length) {
      out.push(fail(ctx, 'history.season-archive-exists', {
        entityType: 'league', entityId: null,
        message: `No completed-season history after rolling past season ${ctx.season}`,
        details: { season: ctx.season, historyLen: 0 },
      }));
    } else {
      out.push(pass(ctx, 'history.season-archive-exists', `${history.length} completed seasons archived`));
      // accumulation: at least (season-1) completed seasons should be present
      const expectedMin = Number(ctx.season) - 1;
      if (history.length < expectedMin) {
        out.push(fail(ctx, 'history.accumulates', {
          entityType: 'league', entityId: null,
          message: `History has ${history.length} seasons, expected >= ${expectedMin} (overwrite suspected)`,
          details: { historyLen: history.length, expectedMin },
        }));
      } else {
        out.push(pass(ctx, 'history.accumulates', `History accumulates (>= ${expectedMin} seasons)`));
      }
    }
  } else {
    out.push(skip(ctx, 'history.season-archive-exists', `Completed-season archive not expected at phase "${ctx.phase}" season ${ctx.season}`));
  }

  // ── history entries structurally valid (ids, team refs, no NaN) ──────────
  if (history.length) {
    const badTeamRef = [];
    const dupSeasons = findDuplicateIds(history, (h) => h?.id ?? h?.seasonId ?? h?.year);
    for (const h of history) {
      const champ = h?.championTeamId ?? h?.champion ?? h?.champTeamId;
      if (champ != null && !validTeamIds.has(String(champ))) {
        badTeamRef.push({ seasonId: h?.id ?? h?.year, champ });
      }
    }
    if (badTeamRef.length) {
      out.push(fail(ctx, 'history.champion-refs-valid', {
        entityType: 'season', entityId: badTeamRef[0].seasonId,
        message: `${badTeamRef.length} archived seasons reference an unknown champion team`,
        details: { count: badTeamRef.length, sample: badTeamRef.slice(0, 5) },
      }));
    } else {
      out.push(pass(ctx, 'history.champion-refs-valid', 'Archived-season champion references resolve to valid teams'));
    }
    if (dupSeasons.length) {
      out.push(fail(ctx, 'history.no-duplicate-seasons', {
        entityType: 'season', entityId: dupSeasons[0].id,
        message: `${dupSeasons.length} duplicated season ids in history`,
        details: { sample: dupSeasons.slice(0, 5) },
      }));
    } else {
      out.push(pass(ctx, 'history.no-duplicate-seasons', 'No duplicated season ids in league history'));
    }
  } else {
    out.push(skip(ctx, 'history.champion-refs-valid', 'No archived seasons to validate at this checkpoint'));
  }

  // ── award ledgers structurally valid (present but not required) ──────────
  const awardHistory = Array.isArray(ctx?.view?.awardHistory) ? ctx.view.awardHistory : [];
  const franchiseAwards = Array.isArray(ctx?.view?.franchiseAwards) ? ctx.view.franchiseAwards : [];
  const awards = [...awardHistory, ...franchiseAwards];
  if (awards.length) {
    const badAward = awards.filter((a) => {
      const pid = a?.playerId ?? a?.winnerId ?? a?.player?.id;
      const tid = a?.teamId ?? a?.team?.id;
      // an award should resolve to at least one of player/team when it names one
      if (tid != null && !validTeamIds.has(String(tid))) return true;
      return false;
    });
    if (badAward.length) {
      out.push(fail(ctx, 'history.award-refs-valid', {
        entityType: 'award', entityId: null,
        message: `${badAward.length} awards reference an unknown team`,
        details: { count: badAward.length, sample: badAward.slice(0, 3) },
      }));
    } else {
      out.push(pass(ctx, 'history.award-refs-valid', `${awards.length} award records; team references valid`));
    }
  } else {
    out.push(skip(ctx, 'history.award-refs-valid', 'No award ledger populated at this checkpoint'));
  }

  return out;
}
