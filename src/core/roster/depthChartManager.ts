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
  fatigue?: number;
  depthChart?: {
    rowKey: string;
    order: number;
    role: string;
  };
  // ratings/traits for plan-aware scoring
  tha?: number;
  thp?: number;
  spd?: number;
  acc?: number;
  awr?: number;
  cth?: number;
  rbk?: number;
  pbk?: number;
  btk?: number;
  tkl?: number;
  zcv?: number;
  mcv?: number;
}

export interface Team {
  id: number;
  roster: Player[];
  depthChart?: Record<string, (number | string)[]>;
  weeklyGamePlan?: {
    offPlanId?: string;
    defPlanId?: string;
    riskId?: string;
  };
}

export interface ValidationContext {
  phase?: string;
  isAI?: boolean;
  mode?: 'repair' | 'optimize' | 'best_available';
}

export interface ValidationIssue {
  rowKey: string;
  severity: 'warn' | 'error';
  code:
    | 'missing_required'
    | 'thin_depth'
    | 'injured_starter'
    | 'invalid_reference'
    | 'duplicate_reference'
    | 'unresolved';
  message: string;
  repaired?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  missingRows: string[];
  thinRows: string[];
  injuredStarters: string[];
  issues: string[];
  detailedIssues: ValidationIssue[];
}

export interface RepairOutcome {
  rowKey: string;
  playerId: number | string;
  playerName: string;
  reason: 'natural' | 'secondary' | 'emergency';
  confidencePenalty: number;
  explanation: string;
}

export interface RepairResult {
  modified: boolean;
  repairedAssignments: Record<string, (number | string)[]>;
  changes: string[];
  promotedPlayers: RepairOutcome[];
  unresolvedIssues: ValidationIssue[];
  usedEmergencyFallback: boolean;
  summary: string;
}

interface FallbackRule {
  target: string;
  penalty: number;
  reason: string;
  allowSecondary?: boolean;
}

interface CandidateScore {
  player: Player;
  score: number;
  reason: 'natural' | 'secondary' | 'emergency';
  confidencePenalty: number;
  explanation: string;
}

const POSITION_ALIAS: Record<string, string[]> = {
  RB: ['RB', 'HB'],
  FB: ['FB'],
  WR: ['WR', 'FL', 'SE'],
  TE: ['TE'],
  QB: ['QB'],
  OL: ['OL', 'OT', 'LT', 'RT', 'OG', 'LG', 'RG', 'C'],
  EDGE: ['EDGE', 'DE', 'DL'],
  IDL: ['IDL', 'DT', 'NT', 'DL'],
  LB: ['LB', 'MLB', 'OLB', 'ILB'],
  CB: ['CB', 'DB', 'NCB'],
  S: ['S', 'SS', 'FS'],
  K: ['K', 'PK'],
  P: ['P'],
  RS: ['WR', 'RB', 'CB', 'S'],
};

/**
 * Centralized emergency fallback rules with deterministic ordering and role penalty.
 */
export const EMERGENCY_FALLBACKS: Record<string, FallbackRule[]> = {
  QB: [
    { target: 'WR', penalty: 34, reason: 'Athletic skill player can emergency throw.' },
    { target: 'P', penalty: 48, reason: 'Punter as last-resort passer.' },
  ],
  RB: [
    { target: 'FB', penalty: 8, reason: 'Fullback is closest downhill run fit.' },
    { target: 'WR', penalty: 18, reason: 'Receiving skill set can flex to RB in emergency.' },
    { target: 'TE', penalty: 24, reason: 'Tight end can handle emergency backfield snaps.' },
  ],
  WR: [
    { target: 'TE', penalty: 14, reason: 'TE can fill possession-receiver role.' },
    { target: 'RB', penalty: 20, reason: 'RB can run short-area receiving duties.' },
    { target: 'CB', penalty: 28, reason: 'CB athletic profile can survive in emergency sets.' },
  ],
  TE: [
    { target: 'FB', penalty: 10, reason: 'FB blocking role translates best to TE.' },
    { target: 'WR', penalty: 16, reason: 'Big receiver can flex to TE.' },
    { target: 'OL', penalty: 26, reason: 'Extra blocker jumbo package fallback.' },
  ],
  OL: [
    { target: 'TE', penalty: 28, reason: 'Blocking TE can emergency fill OL depth.' },
  ],
  EDGE: [
    { target: 'IDL', penalty: 12, reason: 'Interior lineman can slide to edge in heavy fronts.' },
    { target: 'LB', penalty: 18, reason: 'Rush linebacker can emergency play edge.' },
  ],
  IDL: [
    { target: 'EDGE', penalty: 12, reason: 'Edge defender can reduce inside.' },
    { target: 'LB', penalty: 24, reason: 'LB can survive sub-package interior snaps.' },
  ],
  LB: [
    { target: 'S', penalty: 16, reason: 'Box safety can fill LB run fits.' },
    { target: 'EDGE', penalty: 18, reason: 'Edge can stand up as LB.' },
    { target: 'CB', penalty: 30, reason: 'CB as coverage linebacker emergency only.' },
  ],
  CB: [
    { target: 'S', penalty: 12, reason: 'Safety can rotate down to corner.' },
    { target: 'WR', penalty: 24, reason: 'WR athletic traits can emergency play CB.' },
  ],
  S: [
    { target: 'CB', penalty: 12, reason: 'Corner can slide to safety.' },
    { target: 'LB', penalty: 22, reason: 'LB as box safety in emergency fronts.' },
  ],
  K: [{ target: 'P', penalty: 18, reason: 'Punter can emergency kick.' }],
  P: [{ target: 'K', penalty: 18, reason: 'Kicker can emergency punt.' }],
};

function normalizePos(pos: string): string {
  const value = String(pos ?? '').toUpperCase();
  for (const [canonical, aliases] of Object.entries(POSITION_ALIAS)) {
    if (aliases.includes(value)) return canonical;
  }
  return value;
}

function getRow(rowKey: string): DepthChartRow | null {
  return ((DEPTH_CHART_ROWS as DepthChartRow[]).find((row) => row.key === rowKey) ?? null);
}

function getPlayerPositions(player: Player): string[] {
  const primary = normalizePos(player.pos);
  const secondary = Array.isArray(player.secondaryPositions)
    ? player.secondaryPositions
    : Array.isArray(player.positions)
      ? player.positions.slice(1)
      : [];
  return [primary, ...secondary.map((pos) => normalizePos(pos))];
}

function isUnavailable(player: Player): boolean {
  return (player.injuryWeeksRemaining ?? 0) > 0 || String(player.status ?? '').toLowerCase() === 'injured';
}

function isNaturalFit(player: Player, row: DepthChartRow): boolean {
  const rowMatches = row.match.map(normalizePos);
  return rowMatches.includes(normalizePos(player.pos));
}

function isSecondaryFit(player: Player, row: DepthChartRow): boolean {
  const rowMatches = new Set(row.match.map(normalizePos));
  return getPlayerPositions(player).slice(1).some((pos) => rowMatches.has(pos));
}

function deterministicSort(a: CandidateScore, b: CandidateScore): number {
  if (b.score !== a.score) return b.score - a.score;
  const idA = String(a.player.id);
  const idB = String(b.player.id);
  return idA.localeCompare(idB);
}

function planAwareBonus(player: Player, rowKey: string, plan?: Team['weeklyGamePlan']): number {
  const offPlan = String(plan?.offPlanId ?? 'BALANCED').toUpperCase();
  const defPlan = String(plan?.defPlanId ?? 'BALANCED').toUpperCase();

  if (rowKey === 'RB') {
    if (offPlan.includes('POWER') || offPlan.includes('BALL_CONTROL')) {
      return (player.awr ?? 60) * 0.12 + (player.btk ?? 60) * 0.1 + (player.rbk ?? 55) * 0.05;
    }
    if (offPlan.includes('PASS') || offPlan.includes('SPREAD')) {
      return (player.cth ?? 60) * 0.12 + (player.acc ?? 60) * 0.08;
    }
  }

  if (rowKey === 'OL') {
    if (offPlan.includes('PASS') || offPlan.includes('DEEP')) return (player.pbk ?? 60) * 0.14;
    if (offPlan.includes('POWER') || offPlan.includes('BALL_CONTROL')) return (player.rbk ?? 60) * 0.14;
  }

  if (rowKey === 'WR') {
    if (offPlan.includes('DEEP') || offPlan.includes('PASS')) return (player.spd ?? 60) * 0.12 + (player.acc ?? 60) * 0.08;
    return (player.cth ?? 60) * 0.08 + (player.awr ?? 60) * 0.05;
  }

  if (rowKey === 'QB') {
    if (offPlan.includes('DEEP') || offPlan.includes('AGGRESSIVE')) return (player.thp ?? 60) * 0.12;
    return (player.tha ?? 60) * 0.12 + (player.awr ?? 60) * 0.08;
  }

  if (['EDGE', 'IDL'].includes(rowKey)) {
    if (defPlan.includes('BLITZ') || defPlan.includes('PRESSURE')) return (player.tkl ?? 60) * 0.1 + (player.awr ?? 60) * 0.05;
    return (player.awr ?? 60) * 0.08;
  }

  if (['CB', 'S', 'LB'].includes(rowKey)) {
    if (defPlan.includes('COVER') || defPlan.includes('ZONE')) return (player.zcv ?? player.mcv ?? 60) * 0.12;
    return (player.tkl ?? 60) * 0.1;
  }

  return 0;
}

function scoreCandidate(
  player: Player,
  row: DepthChartRow,
  context: ValidationContext,
  reason: 'natural' | 'secondary' | 'emergency',
  confidencePenalty: number,
): CandidateScore {
  const injuryPenalty = isUnavailable(player) ? 60 : 0;
  const fatiguePenalty = Math.min(12, Math.max(0, Math.round(Number(player.fatigue ?? 0) / 8)));
  const base = Number(player.ovr ?? 0);
  const fitBonus = reason === 'natural' ? 20 : reason === 'secondary' ? 10 : 0;
  const planBonus = planAwareBonus(player, row.key, (context as any).weeklyGamePlan);
  const score = base + fitBonus + planBonus - confidencePenalty - injuryPenalty - fatiguePenalty;

  return {
    player,
    score,
    reason,
    confidencePenalty,
    explanation: `${reason} fit, base ${base}, plan ${Math.round(planBonus)}, penalty ${confidencePenalty}`,
  };
}

function cloneAssignments(depthChart: Team['depthChart'] = {}): Record<string, (number | string)[]> {
  const clone: Record<string, (number | string)[]> = {};
  for (const [key, value] of Object.entries(depthChart ?? {})) {
    clone[key] = Array.isArray(value) ? [...value] : [];
  }
  return clone;
}

function collectAssignedIds(assignments: Record<string, (number | string)[]>): Set<string> {
  const assignedIds = new Set<string>();
  for (const ids of Object.values(assignments)) {
    for (const id of ids ?? []) assignedIds.add(String(id));
  }
  return assignedIds;
}

/**
 * Validates a team's depth chart integrity.
 */
export function validateDepthChart(team: Team, context: ValidationContext = {}): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    missingRows: [],
    thinRows: [],
    injuredStarters: [],
    issues: [],
    detailedIssues: [],
  };

  const assignments = team.depthChart || {};
  const rosterMap = new Map(team.roster.map((p) => [String(p.id), p]));

  for (const row of DEPTH_CHART_ROWS as DepthChartRow[]) {
    const ids = assignments[row.key] ?? [];

    if (ids.length === 0 && row.min > 0) {
      result.missingRows.push(row.key);
      result.isValid = false;
      const message = `Missing required assignment for ${row.label}`;
      result.issues.push(message);
      result.detailedIssues.push({ rowKey: row.key, severity: 'error', code: 'missing_required', message });
    }

    if (ids.length > 0 && ids.length < row.min) {
      result.thinRows.push(row.key);
      const message = `Thin depth for ${row.label} (${ids.length}/${row.min})`;
      result.issues.push(message);
      result.detailedIssues.push({ rowKey: row.key, severity: 'warn', code: 'thin_depth', message });
    }

    if (ids.length > 0) {
      const starter = rosterMap.get(String(ids[0]));
      if (starter && isUnavailable(starter)) {
        result.injuredStarters.push(row.key);
        const message = `${row.label} starter unavailable`;
        result.issues.push(message);
        result.detailedIssues.push({ rowKey: row.key, severity: context.isAI ? 'error' : 'warn', code: 'injured_starter', message });
      }
    }

    const dedupe = new Set<string>();
    for (const pid of ids) {
      const key = String(pid);
      if (dedupe.has(key)) {
        const message = `Duplicate player reference ${key} in ${row.key}`;
        result.isValid = false;
        result.issues.push(message);
        result.detailedIssues.push({ rowKey: row.key, severity: 'error', code: 'duplicate_reference', message });
      }
      dedupe.add(key);
      if (!rosterMap.has(key)) {
        const message = `Invalid player reference ${key} in ${row.key}`;
        result.isValid = false;
        result.issues.push(message);
        result.detailedIssues.push({ rowKey: row.key, severity: 'error', code: 'invalid_reference', message });
      }
    }
  }

  return result;
}

export function getNextManUp(
  rowKey: string,
  roster: Player[],
  context: ValidationContext & { assignedIds?: Set<string>; ignoreInjured?: boolean; weeklyGamePlan?: Team['weeklyGamePlan'] } = {},
): Player | null {
  const row = getRow(rowKey);
  if (!row) return null;

  const available = roster.filter((player) => {
    if (context.assignedIds?.has(String(player.id))) return false;
    if (context.ignoreInjured && isUnavailable(player)) return false;
    return true;
  });

  const natural = available
    .filter((player) => isNaturalFit(player, row))
    .map((player) => scoreCandidate(player, row, context, 'natural', 0))
    .sort(deterministicSort);
  if (natural.length > 0) return natural[0].player;

  const secondary = available
    .filter((player) => isSecondaryFit(player, row))
    .map((player) => scoreCandidate(player, row, context, 'secondary', 8))
    .sort(deterministicSort);
  if (secondary.length > 0) return secondary[0].player;

  return null;
}

export function findEmergencyPositionFallback(
  rowKey: string,
  roster: Player[],
  context: ValidationContext & { assignedIds?: Set<string>; weeklyGamePlan?: Team['weeklyGamePlan'] } = {},
): Player | null {
  const row = getRow(rowKey);
  if (!row) return null;

  const fallbackRules = EMERGENCY_FALLBACKS[rowKey] ?? [];
  const available = roster.filter((player) => !context.assignedIds?.has(String(player.id)) && !isUnavailable(player));

  for (const rule of fallbackRules) {
    const matches = available
      .filter((player) => normalizePos(player.pos) === normalizePos(rule.target))
      .map((player) => scoreCandidate(player, row, context, 'emergency', rule.penalty))
      .sort(deterministicSort);

    if (matches.length > 0) {
      return matches[0].player;
    }
  }

  return null;
}

function chooseCandidate(
  row: DepthChartRow,
  roster: Player[],
  context: ValidationContext & { assignedIds: Set<string>; weeklyGamePlan?: Team['weeklyGamePlan'] },
): CandidateScore | null {
  const natural = getNextManUp(row.key, roster, { ...context, ignoreInjured: true });
  if (natural) {
    return scoreCandidate(natural, row, context, isNaturalFit(natural, row) ? 'natural' : 'secondary', isNaturalFit(natural, row) ? 0 : 8);
  }

  const fallbackRules = EMERGENCY_FALLBACKS[row.key] ?? [];
  const available = roster.filter((p) => !context.assignedIds.has(String(p.id)) && !isUnavailable(p));
  for (const rule of fallbackRules) {
    const match = available
      .filter((player) => normalizePos(player.pos) === normalizePos(rule.target))
      .map((player) => scoreCandidate(player, row, context, 'emergency', rule.penalty))
      .sort(deterministicSort)[0];
    if (match) return match;
  }

  return null;
}

/**
 * Conservative repair of a broken or incomplete depth chart.
 */
export function repairDepthChart(team: Team, context: ValidationContext = {}): RepairResult {
  const repairedAssignments = cloneAssignments(team.depthChart || {});
  const result: RepairResult = {
    modified: false,
    repairedAssignments,
    changes: [],
    promotedPlayers: [],
    unresolvedIssues: [],
    usedEmergencyFallback: false,
    summary: 'Roster validated: no changes required.',
  };

  const rosterMap = new Map(team.roster.map((p) => [String(p.id), p]));
  const assignedIds = collectAssignedIds(repairedAssignments);

  // Step 1: sanitize invalid/duplicate references while preserving order.
  for (const [rowKey, ids] of Object.entries(repairedAssignments)) {
    const deduped: (number | string)[] = [];
    const seen = new Set<string>();
    for (const id of ids ?? []) {
      const key = String(id);
      if (!rosterMap.has(key) || seen.has(key)) {
        result.modified = true;
        continue;
      }
      seen.add(key);
      deduped.push(id);
    }
    if (deduped.length !== ids.length) {
      repairedAssignments[rowKey] = deduped;
      result.changes.push(`Cleaned invalid references in ${rowKey}`);
    }
  }

  // Rebuild assigned IDs after cleanup.
  const cleanAssigned = collectAssignedIds(repairedAssignments);
  assignedIds.clear();
  for (const id of cleanAssigned) assignedIds.add(id);

  // Step 2: starter availability repair (AI/pre-sim only).
  const shouldRepairAvailability = context.isAI || context.phase === 'regular' || context.phase === 'playoffs';
  if (shouldRepairAvailability) {
    for (const row of DEPTH_CHART_ROWS as DepthChartRow[]) {
      const ids = [...(repairedAssignments[row.key] ?? [])];
      if (ids.length === 0) continue;

      const starter = rosterMap.get(String(ids[0]));
      if (!starter || !isUnavailable(starter)) continue;

      const healthyExisting = ids.filter((id) => !isUnavailable(rosterMap.get(String(id)) as Player));
      if (healthyExisting.length > 0) {
        const target = String(healthyExisting[0]);
        if (target !== String(ids[0])) {
          repairedAssignments[row.key] = [target, ...ids.filter((id) => String(id) !== target)];
          result.modified = true;
          result.changes.push(`Promoted healthy backup for ${row.key}`);
        }
      } else {
        const replacement = chooseCandidate(row, team.roster, {
          ...context,
          assignedIds,
          weeklyGamePlan: team.weeklyGamePlan,
        });
        if (replacement) {
          const replacementId = String(replacement.player.id);
          repairedAssignments[row.key] = [replacementId, ...ids.filter((id) => String(id) !== replacementId)];
          assignedIds.add(replacementId);
          result.modified = true;
          if (replacement.reason === 'emergency') result.usedEmergencyFallback = true;
          result.changes.push(`Starter unavailable in ${row.key}; promoted ${replacement.player.name}`);
          result.promotedPlayers.push({
            rowKey: row.key,
            playerId: replacement.player.id,
            playerName: replacement.player.name,
            reason: replacement.reason,
            confidencePenalty: replacement.confidencePenalty,
            explanation: replacement.explanation,
          });
        }
      }
    }
  }

  // Step 3: fill missing required slots conservatively.
  for (const row of DEPTH_CHART_ROWS as DepthChartRow[]) {
    const current = [...(repairedAssignments[row.key] ?? [])];
    while (current.length < row.min) {
      const candidate = chooseCandidate(row, team.roster, {
        ...context,
        assignedIds,
        weeklyGamePlan: team.weeklyGamePlan,
      });

      if (!candidate) {
        const issue: ValidationIssue = {
          rowKey: row.key,
          severity: 'error',
          code: 'unresolved',
          message: `No eligible replacement available for ${row.label}`,
        };
        result.unresolvedIssues.push(issue);
        break;
      }

      const id = candidate.player.id;
      current.push(id);
      assignedIds.add(String(id));
      result.modified = true;

      if (candidate.reason === 'emergency') result.usedEmergencyFallback = true;

      const fallbackLabel = candidate.reason === 'natural'
        ? 'natural backup'
        : candidate.reason === 'secondary'
          ? 'secondary-position fallback'
          : 'emergency fallback';
      result.changes.push(`Filled ${row.key} with ${candidate.player.name} (${fallbackLabel})`);
      result.promotedPlayers.push({
        rowKey: row.key,
        playerId: candidate.player.id,
        playerName: candidate.player.name,
        reason: candidate.reason,
        confidencePenalty: candidate.confidencePenalty,
        explanation: candidate.explanation,
      });
    }

    repairedAssignments[row.key] = current;
  }

  const finalValidation = validateDepthChart({ ...team, depthChart: repairedAssignments }, context);
  result.unresolvedIssues.push(...finalValidation.detailedIssues.filter((issue) => issue.severity === 'error'));

  if (result.modified) {
    if (result.promotedPlayers.length > 0) {
      result.summary = `Roster validated: ${result.promotedPlayers.length} player${result.promotedPlayers.length === 1 ? '' : 's'} promoted.`;
    } else {
      result.summary = 'Depth chart repaired: assignments restored.';
    }
  } else if (result.unresolvedIssues.length > 0) {
    result.summary = 'Depth chart still has unresolved issues.';
  }

  return result;
}

/**
 * Opinionated lineup optimization for scheme/game plan.
 */
export function optimizeDepthChartForPlan(team: Team, context: ValidationContext = {}): RepairResult {
  const mode = context.mode ?? 'optimize';
  const result: RepairResult = {
    modified: true,
    repairedAssignments: {},
    changes: [],
    promotedPlayers: [],
    unresolvedIssues: [],
    usedEmergencyFallback: false,
    summary: mode === 'best_available' ? 'Auto-set complete: best available starters selected.' : 'Optimization complete for current plan.',
  };

  const assignedIds = new Set<string>();
  for (const row of DEPTH_CHART_ROWS as DepthChartRow[]) {
    const scored = team.roster
      .filter((player) => !assignedIds.has(String(player.id)) && !isUnavailable(player))
      .map((player) => {
        const reason = isNaturalFit(player, row) ? 'natural' : isSecondaryFit(player, row) ? 'secondary' : 'emergency';
        const basePenalty = reason === 'natural' ? 0 : reason === 'secondary' ? 8 : 30;
        const planPenalty = mode === 'best_available' ? 0 : basePenalty;
        return scoreCandidate(player, row, { ...context, weeklyGamePlan: team.weeklyGamePlan }, reason, planPenalty);
      })
      .sort(deterministicSort);

    const chosen: (number | string)[] = [];
    for (const entry of scored) {
      if (chosen.length >= row.slots) break;
      if (assignedIds.has(String(entry.player.id))) continue;
      chosen.push(entry.player.id);
      assignedIds.add(String(entry.player.id));
    }

    // keep required rows legal even when roster is very thin
    while (chosen.length < row.min) {
      const emergency = findEmergencyPositionFallback(row.key, team.roster, {
        ...context,
        assignedIds,
        weeklyGamePlan: team.weeklyGamePlan,
      });
      if (!emergency) {
        result.unresolvedIssues.push({
          rowKey: row.key,
          severity: 'error',
          code: 'unresolved',
          message: `Unable to optimize ${row.label}: no available fallback.`,
        });
        break;
      }
      chosen.push(emergency.id);
      assignedIds.add(String(emergency.id));
      result.usedEmergencyFallback = true;
    }

    result.repairedAssignments[row.key] = chosen;
  }

  result.changes.push(mode === 'best_available' ? 'Auto-set best available depth chart.' : `Optimized lineup for ${team.weeklyGamePlan?.offPlanId ?? 'balanced'} / ${team.weeklyGamePlan?.defPlanId ?? 'balanced'} plan.`);
  return result;
}
