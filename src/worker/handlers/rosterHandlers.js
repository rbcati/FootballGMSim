/**
 * rosterHandlers.js — GET_ROSTER.
 *
 * Extracted from worker.js (Worker Handler Registry V1); behavior unchanged.
 * Produces the ROSTER_DATA view-model slice for one team.
 */
import { toUI } from '../protocol.js';
import { Constants } from '../../core/constants.js';
import { calculateMorale } from '../../core/player.js';
import {
  calculateOffensiveSchemeFit,
  calculateDefensiveSchemeFit,
} from '../../core/scheme-core.js';
import { buildRosterBuildingAnalysis } from '../../core/rosterBuildingAnalysis.js';

// ── Handler: GET_ROSTER ───────────────────────────────────────────────────────

export async function handleGetRoster({ teamId }, id, ctx) {
  const { cache, post } = ctx;
  const numId = Number(teamId);
  const team  = cache.getTeam(numId);
  if (!team) { post(toUI.ERROR, { message: `Team ${teamId} not found` }, id); return; }

  const players = cache.getPlayersByTeam(numId).map(p => {
      let fit = 50;
      if (team && team.staff && team.staff.headCoach) {
          const hc = team.staff.headCoach;
          const isOff = ['QB','RB','WR','TE','OL','K'].includes(p.pos);
          const isDef = ['DL','LB','CB','S','P'].includes(p.pos);

          if (isOff) fit = calculateOffensiveSchemeFit(p, hc.offScheme || 'Balanced');
          else if (isDef) fit = calculateDefensiveSchemeFit(p, hc.defScheme || '4-3');
      }

      // Normalise contract: handle both nested p.contract and legacy flat fields.
      const contract = p.contract ?? (
        p.baseAnnual != null ? {
          years:         p.years        ?? 1,
          yearsTotal:    p.yearsTotal   ?? p.years ?? 1,
          yearsRemaining:p.years        ?? 1,
          baseAnnual:    p.baseAnnual,
          signingBonus:  p.signingBonus ?? 0,
          guaranteedPct: p.guaranteedPct ?? 0.5,
        } : null
      );

      return {
        id:               p.id,
        name:             p.name,
        pos:              p.pos,
        age:              p.age,
        ovr:              p.ovr,
        progressionDelta: p.progressionDelta ?? null,
        potential:        p.potential ?? null,
        status:           p.status ?? 'active',
        onTradeBlock:     p?.onTradeBlock ?? false,
        contract,
        traits:           p.traits ?? [],
        schemeFit:        fit,
        morale:           calculateMorale(p, team, true)
      };
  });

  const analysis = buildRosterBuildingAnalysis({
    team,
    roster: players,
    cap: { capRoom: team?.capRoom, capUsed: team?.capUsed, deadCap: team?.deadCap },
    freeAgents: cache.getAllPlayers().filter((p) => !p?.teamId || p?.status === 'free_agent'),
    draftPicks: Array.isArray(team?.picks) ? team.picks : [],
  });

  post(toUI.ROSTER_DATA, {
    teamId: numId,
    team: {
      id:                team.id,
      name:              team.name,
      abbr:              team.abbr,
      capUsed:           team.capUsed           ?? 0,
      capRoom:           team.capRoom           ?? 0,
      capTotal:          team.capTotal          ?? Constants.SALARY_CAP.HARD_CAP,
      deadCap:           team.deadCap           ?? 0,
      deadMoneyNextYear: team.deadMoneyNextYear  ?? 0,
      staff:             team.staff,
    },
    players,
    analysis,
  }, id);
}
