import { Constants } from './constants.js';
import { DEPTH_CHART_ROWS } from './depthChart.js';
import { normalizeContractDetails, calculateContractCapHit } from './contracts/realisticContracts.js';

export function normalizeContract(player = {}) {
  return normalizeContractDetails(player?.contract ?? {}, player);
}

export function getPlayerCapHit(player = {}) {
  return calculateContractCapHit(player?.contract ?? player);
}

export function getRosterLimitForPhase(phase) {
  return ['offseason_resign', 'free_agency', 'draft', 'offseason', 'preseason'].includes(phase)
    ? Constants.ROSTER_LIMITS.OFFSEASON
    : Constants.ROSTER_LIMITS.REGULAR_SEASON;
}

function buildTeamPlayerMap(players = []) {
  const byTeam = new Map();
  for (const player of players) {
    if (player?.teamId == null || player?.status === 'free_agent') continue;
    const teamId = Number(player.teamId);
    if (!Number.isFinite(teamId)) continue;
    if (!byTeam.has(teamId)) byTeam.set(teamId, []);
    byTeam.get(teamId).push(player);
  }
  return byTeam;
}

export function validateLeagueTeamLegality({
  teams = [],
  players = [],
  phase = 'regular',
  hardCap = Constants.SALARY_CAP.HARD_CAP,
  capViolationSeverity = 'error',
} = {}) {
  const byTeam = buildTeamPlayerMap(players);
  const rosterLimit = getRosterLimitForPhase(phase);
  const issues = [];

  for (const team of teams) {
    const teamId = Number(team?.id);
    const roster = byTeam.get(teamId) ?? [];
    const rosterIds = roster.map((p) => Number(p?.id)).filter(Number.isFinite);
    const uniqueIds = new Set(rosterIds);

    if (roster.length > rosterLimit) {
      issues.push({ severity: 'error', teamId, code: 'roster_limit', message: `${team?.abbr ?? team?.name ?? `Team ${teamId}`} has ${roster.length}/${rosterLimit} players. Cut roster before continuing.` });
    }

    const projectedCap = roster.reduce((sum, p) => sum + getPlayerCapHit(p), 0) + Number(team?.deadCap ?? 0);
    if (projectedCap > Number(hardCap)) {
      issues.push({
        severity: capViolationSeverity === 'warn' ? 'warn' : 'error',
        teamId,
        code: 'cap_limit',
        message: `${team?.abbr ?? team?.name ?? `Team ${teamId}`} is over cap (${projectedCap.toFixed(1)}M / ${Number(hardCap).toFixed(1)}M).`,
      });
    }

    if (uniqueIds.size !== rosterIds.length) {
      issues.push({ severity: 'error', teamId, code: 'duplicate_player_refs', message: `${team?.abbr ?? team?.name ?? `Team ${teamId}`} has duplicate player references.` });
    }

    for (const player of roster) {
      const hasContract = !!player?.contract || Number.isFinite(Number(player?.baseAnnual));
      if (!hasContract) {
        issues.push({ severity: 'error', teamId, code: 'missing_contract', message: `${team?.abbr ?? team?.name ?? `Team ${teamId}`} has active player ${player?.name ?? player?.id} without a contract.` });
        break;
      }
    }

    const depthByRow = new Map();
    for (const p of roster) {
      const rowKey = p?.depthChart?.rowKey;
      if (!rowKey) continue;
      if (!depthByRow.has(rowKey)) depthByRow.set(rowKey, []);
      depthByRow.get(rowKey).push(p);
    }

    for (const p of roster) {
      const rowKey = p?.depthChart?.rowKey;
      if (!rowKey) continue;
      const row = DEPTH_CHART_ROWS.find((r) => r.key === rowKey);
      if (!row) {
        issues.push({ severity: 'warn', teamId, code: 'invalid_depth_row', message: `${team?.abbr ?? team?.name ?? `Team ${teamId}`} has unknown depth row ${rowKey}.` });
      }
    }

    for (const row of DEPTH_CHART_ROWS) {
      const assigned = depthByRow.get(row.key) ?? [];
      const eligible = roster.filter((p) => row.match.includes(p?.pos));
      if (assigned.length > 0 && assigned.some((p) => Number(p?.teamId) !== teamId)) {
        issues.push({ severity: 'error', teamId, code: 'depth_non_roster', message: `${team?.abbr ?? team?.name ?? `Team ${teamId}`} depth chart references non-roster players.` });
      }
      if (eligible.length > 0 && assigned.length === 0) {
        issues.push({ severity: 'warn', teamId, code: 'invalid_starter_counts', message: `${team?.abbr ?? team?.name ?? `Team ${teamId}`} has no ${row.label} assignments.` });
      }
    }
  }

  return { issues, rosterLimit };
}
