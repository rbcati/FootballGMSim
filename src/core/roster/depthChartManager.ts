/**
 * depthChartManager.ts
 *
 * Central logic layer for depth chart validation, repair, and optimization.
 * Separates conservative "Repair" (integrity) from opinionated "Optimization" (strategy).
 */

import { DEPTH_CHART_ROWS } from '../depthChart.js';

export interface DepthChartRow {
  key: string;
  label: string;
  match: string[];
  slots: number;
  min: number;
}

export interface Player {
  id: number | string;
  name: string;
  pos: string;
  secondaryPositions?: string[];
  positions?: string[];
  ovr: number;
  injuryWeeksRemaining?: number;
  teamId: number | null;
  status?: string;
  depthChart?: {
    rowKey: string;
    order: number;
    role: string;
  };
  // Ratings for optimization
  tha?: number;
  thp?: number;
  spd?: number;
  acc?: number;
  awr?: number;
  cth?: number;
  rbk?: number;
  pbk?: number;
}

export interface Team {
  id: number;
  roster: Player[];
  depthChart?: Record<string, (number | string)[]>;
  weeklyGamePlan?: {
    offPlanId: string;
    defPlanId: string;
    riskId: string;
  };
}

export interface ValidationContext {
  phase?: string;
  isAI?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  missingRows: string[];
  thinRows: string[];
  injuredStarters: string[];
  issues: string[];
}

export interface RepairResult {
  modified: boolean;
  repairedAssignments: Record<string, (number | string)[]>;
  changes: string[];
}

/**
 * Emergency Fallback Rules
 * Centralized mapping for position group overflows.
 */
export const EMERGENCY_FALLBACKS: Record<string, string[]> = {
  'QB': ['P', 'WR'], // Emergency: Punter or WR can try to throw if literally everyone is dead
  'RB': ['FB', 'WR', 'TE'],
  'WR': ['TE', 'RB', 'CB'],
  'TE': ['FB', 'WR', 'OL'],
  'LT': ['RT', 'LG', 'RG', 'TE'],
  'LG': ['RG', 'C', 'LT', 'RT'],
  'C': ['LG', 'RG', 'LT', 'RT'],
  'RG': ['LG', 'C', 'RT', 'LT'],
  'RT': ['LT', 'RG', 'LG', 'TE'],
  'EDGE': ['DE', 'LB', 'DT'],
  'IDL': ['DT', 'DE', 'EDGE'],
  'LB': ['S', 'EDGE', 'CB'],
  'CB': ['S', 'WR'],
  'S': ['CB', 'LB'],
  'K': ['P'],
  'P': ['K'],
};

/**
 * Validates a team's depth chart integrity.
 */
export function validateDepthChart(team: Team, context: ValidationContext = {}): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    missingRows: [],
    thinRows: [],
    injuredStarters: [],
    issues: []
  };

  const assignments = team.depthChart || {};
  const rosterMap = new Map(team.roster.map(p => [String(p.id), p]));

  for (const row of DEPTH_CHART_ROWS as DepthChartRow[]) {
    const ids = assignments[row.key] ?? [];

    // 1. Missing required core assignments
    if (ids.length === 0 && row.min > 0) {
      result.missingRows.push(row.key);
      result.isValid = false;
      result.issues.push(`Missing required assignment for ${row.label}`);
    }

    // 2. Thin depth
    if (ids.length < row.min && ids.length > 0) {
      result.thinRows.push(row.key);
      result.issues.push(`Thin depth for ${row.label} (${ids.length}/${row.min})`);
    }

    // 3. Injured starters
    if (ids.length > 0) {
      const starter = rosterMap.get(String(ids[0]));
      if (starter && (starter.injuryWeeksRemaining ?? 0) > 0) {
        result.injuredStarters.push(row.key);
      }
    }

    // 4. Invalid player references
    for (const pid of ids) {
      if (!rosterMap.has(String(pid))) {
        result.isValid = false;
        result.issues.push(`Invalid player reference ${pid} in ${row.key}`);
      }
    }
  }

  return result;
}

/**
 * Conservative repair of a broken or incomplete depth chart.
 */
export function repairDepthChart(team: Team, context: ValidationContext = {}): RepairResult {
  const result: RepairResult = {
    modified: false,
    repairedAssignments: { ...(team.depthChart || {}) },
    changes: []
  };

  const validation = validateDepthChart({ ...team, depthChart: result.repairedAssignments }, context);
  if (validation.isValid && validation.injuredStarters.length === 0 && !context.isAI) {
    return result;
  }

  const rosterMap = new Map(team.roster.map(p => [String(p.id), p]));
  const assignedIds = new Set<string>();

  Object.values(result.repairedAssignments).forEach(ids => {
    ids.forEach(id => assignedIds.add(String(id)));
  });

  for (const rowKey of Object.keys(result.repairedAssignments)) {
    let ids = result.repairedAssignments[rowKey].map(id => String(id));

    const validIds = ids.filter(id => rosterMap.has(id));
    if (validIds.length !== ids.length) {
      result.repairedAssignments[rowKey] = validIds;
      result.modified = true;
      result.changes.push(`Removed invalid references from ${rowKey}`);
      ids = validIds;
    }

    if ((context.isAI || context.phase === 'regular') && ids.length > 0) {
      const starter = rosterMap.get(ids[0]);
      if (starter && (starter.injuryWeeksRemaining ?? 0) > 0) {
        const healthyOnes = ids.filter(id => (rosterMap.get(id)?.injuryWeeksRemaining ?? 0) === 0);
        const injuredOnes = ids.filter(id => (rosterMap.get(id)?.injuryWeeksRemaining ?? 0) > 0);
        const newOrder = [...healthyOnes, ...injuredOnes];

        if (newOrder[0] !== ids[0]) {
          result.repairedAssignments[rowKey] = newOrder;
          result.modified = true;
          result.changes.push(`Promoted healthy backup for ${rowKey}`);
        }
      }
    }
  }

  for (const row of DEPTH_CHART_ROWS as DepthChartRow[]) {
    const currentIds = result.repairedAssignments[row.key] ?? [];
    if (currentIds.length < row.min) {
      const needed = row.min - currentIds.length;
      for (let i = 0; i < needed; i++) {
        const replacement = getNextManUp(row.key, team.roster, {
          assignedIds,
          ignoreInjured: true
        });

        if (replacement) {
          result.repairedAssignments[row.key] = [...(result.repairedAssignments[row.key] ?? []), replacement.id];
          assignedIds.add(String(replacement.id));
          result.modified = true;
          result.changes.push(`Filled ${row.key} with ${replacement.name} (${replacement.pos})`);
        } else {
          const emergency = findEmergencyPositionFallback(row.key, team.roster, { assignedIds });
          if (emergency) {
            result.repairedAssignments[row.key] = [...(result.repairedAssignments[row.key] ?? []), emergency.id];
            assignedIds.add(String(emergency.id));
            result.modified = true;
            result.changes.push(`Emergency fallback: ${emergency.name} (${emergency.pos}) to ${row.key}`);
          }
        }
      }
    }
  }

  return result;
}

export function getNextManUp(
  rowKey: string,
  roster: Player[],
  context: { assignedIds?: Set<string>, ignoreInjured?: boolean } = {}
): Player | null {
  const row = (DEPTH_CHART_ROWS as DepthChartRow[]).find(r => r.key === rowKey);
  if (!row) return null;

  const available = roster.filter(p => {
    if (context.assignedIds?.has(String(p.id))) return false;
    if (context.ignoreInjured && (p.injuryWeeksRemaining ?? 0) > 0) return false;
    return true;
  });

  const naturalMatches = available.filter(p => row.match.includes(p.pos));
  if (naturalMatches.length > 0) {
    return naturalMatches.sort((a, b) => (b.ovr || 0) - (a.ovr || 0))[0];
  }

  const secondaryMatches = available.filter(p => {
    const secondary = p.secondaryPositions || p.positions?.slice(1) || [];
    return secondary.some(pos => row.match.includes(pos));
  });
  if (secondaryMatches.length > 0) {
    return secondaryMatches.sort((a, b) => (b.ovr || 0) - (a.ovr || 0))[0];
  }

  return null;
}

export function findEmergencyPositionFallback(
  rowKey: string,
  roster: Player[],
  context: { assignedIds?: Set<string> } = {}
): Player | null {
  const fallbacks = EMERGENCY_FALLBACKS[rowKey] || [];
  if (fallbacks.length === 0) return null;

  const available = roster.filter(p => {
    if (context.assignedIds?.has(String(p.id))) return false;
    if ((p.injuryWeeksRemaining ?? 0) > 0) return false;
    return true;
  });

  for (const fallbackPos of fallbacks) {
    const matches = available.filter(p => p.pos === fallbackPos);
    if (matches.length > 0) {
      return matches.sort((a, b) => (b.ovr || 0) - (a.ovr || 0))[0];
    }
  }

  const anyHealthy = available.sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
  return anyHealthy[0] || null;
}

export function optimizeDepthChartForPlan(team: Team, context: ValidationContext = {}): RepairResult {
  const result: RepairResult = {
    modified: true,
    repairedAssignments: {},
    changes: [`Optimized for ${team.weeklyGamePlan?.offPlanId || 'Balanced'}`]
  };

  const assignedIds = new Set<string>();
  const roster = [...team.roster];

  for (const row of DEPTH_CHART_ROWS as DepthChartRow[]) {
    const scoredPlayers = roster
      .filter(p => !assignedIds.has(String(p.id)))
      .map(p => ({
        player: p,
        score: calculatePlanScore(p, row, team.weeklyGamePlan)
      }))
      .sort((a, b) => b.score - a.score);

    const chosen = scoredPlayers.slice(0, row.slots).map(s => s.player.id);
    result.repairedAssignments[row.key] = chosen;
    chosen.forEach(id => assignedIds.add(String(id)));
  }

  return result;
}

function calculatePlanScore(player: Player, row: DepthChartRow, plan?: Team['weeklyGamePlan']): number {
  let score = player.ovr || 0;

  if (row.match.includes(player.pos)) {
    score += 15;
  } else {
    const secondary = player.secondaryPositions || player.positions?.slice(1) || [];
    if (secondary.some(pos => row.match.includes(pos))) {
      score += 5;
    } else {
      score -= 20;
    }
  }

  if ((player.injuryWeeksRemaining ?? 0) > 0) {
    score -= 50;
  }

  const offPlan = plan?.offPlanId || 'BALANCED';

  if (row.key === 'QB') {
    if (offPlan === 'AGGRESSIVE_PASSING') score += (player.thp || 60) * 0.1;
    if (offPlan === 'BALL_CONTROL') score += (player.tha || 60) * 0.1 + (player.awr || 60) * 0.05;
  }

  if (row.key === 'RB') {
    if (offPlan === 'BALL_CONTROL') score += (player.awr || 60) * 0.1;
    if (offPlan === 'AGGRESSIVE_PASSING') score += (player.cth || 60) * 0.1;
  }

  if (row.key === 'WR') {
    if (offPlan === 'AGGRESSIVE_PASSING') score += (player.spd || 60) * 0.1;
  }

  if (row.key === 'OL' || row.key === 'LT' || row.key === 'RT') {
    if (offPlan === 'AGGRESSIVE_PASSING') score += (player.pbk || 60) * 0.1;
    if (offPlan === 'BALL_CONTROL') score += (player.rbk || 60) * 0.1;
  }

  return score;
}
