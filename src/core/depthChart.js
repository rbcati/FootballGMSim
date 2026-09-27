export const DEPTH_CHART_ROWS = [
  { group: 'OFFENSE', key: 'QB', label: 'Quarterback', match: ['QB'], slots: 3, min: 2 },
  { group: 'OFFENSE', key: 'RB', label: 'Running Back', match: ['RB', 'HB', 'FB'], slots: 4, min: 3 },
  { group: 'OFFENSE', key: 'WR', label: 'Wide Receiver', match: ['WR', 'FL', 'SE'], slots: 6, min: 4 },
  { group: 'OFFENSE', key: 'TE', label: 'Tight End', match: ['TE'], slots: 3, min: 2 },
  { group: 'OFFENSE', key: 'OL', label: 'Offensive Line', match: ['OL', 'OT', 'LT', 'RT', 'OG', 'LG', 'RG', 'C'], slots: 8, min: 6 },
  { group: 'DEFENSE', key: 'EDGE', label: 'Edge', match: ['DE', 'EDGE', 'DL'], slots: 4, min: 3 },
  { group: 'DEFENSE', key: 'IDL', label: 'Interior DL', match: ['DT', 'NT', 'IDL', 'DL'], slots: 4, min: 3 },
  { group: 'DEFENSE', key: 'LB', label: 'Linebacker', match: ['LB', 'MLB', 'OLB', 'ILB'], slots: 5, min: 4 },
  { group: 'DEFENSE', key: 'CB', label: 'Cornerback', match: ['CB', 'DB', 'NCB'], slots: 5, min: 4 },
  { group: 'DEFENSE', key: 'S', label: 'Safety', match: ['S', 'SS', 'FS'], slots: 4, min: 3 },
  { group: 'SPECIAL', key: 'K', label: 'Kicker', match: ['K', 'PK'], slots: 1, min: 1 },
  { group: 'SPECIAL', key: 'P', label: 'Punter', match: ['P'], slots: 1, min: 1 },
  { group: 'SPECIAL', key: 'RS', label: 'Return Specialist', match: ['WR', 'RB', 'CB', 'S'], slots: 2, min: 1 },
];

import { getPositionalPenaltyProfile } from './sim/positionalMultipliers.js';

const SLOT_ROLES = ['starter', 'backup', 'rotation', 'specialist'];

export function getDepthRows() {
  return DEPTH_CHART_ROWS;
}

function rowForPosition(pos, preferredRowKey = null) {
  if (preferredRowKey) {
    const preferred = DEPTH_CHART_ROWS.find((r) => r.key === preferredRowKey);
    if (preferred?.match?.includes(pos)) return preferred;
  }
  return DEPTH_CHART_ROWS.find((r) => r.match.includes(pos));
}

export function getPlayerFallbackPositions(player = {}) {
  if (Array.isArray(player?.secondaryPositions)) return player.secondaryPositions;
  if (Array.isArray(player?.positions)) return player.positions.slice(1);
  return [];
}

export function isPlayerEligibleForDepthRow(player, row) {
  if (!row) return false;
  const positions = [player?.pos, ...getPlayerFallbackPositions(player)]
    .map((pos) => String(pos ?? '').toUpperCase());
  return positions.some((pos) => row.match.includes(pos));
}

/** Existing scrimmage row identity, regardless of eligibility for starter authority. */
export function getScrimmageDepthRow(player, group = null) {
  const rowKey = String(player?.depthChart?.rowKey ?? '');
  const row = DEPTH_CHART_ROWS.find((entry) => entry.key === rowKey);
  if (!row || row.group === 'SPECIAL' || (group && row.group !== group)) return null;
  return row;
}

/** Return a position-compatible scrimmage assignment that may grant depth authority. */
export function getCanonicalScrimmageAssignment(player) {
  const rowKey = String(player?.depthChart?.rowKey ?? player?.depthRowKey ?? '');
  const row = DEPTH_CHART_ROWS.find((entry) => entry.key === rowKey);
  const order = Number(player?.depthChart?.order ?? player?.depthOrder);
  if (!row || !isPlayerEligibleForDepthRow(player, row) || !Number.isFinite(order) || order <= 0) return null;
  if (row.group === 'SPECIAL') return null;
  return { rowKey: row.key, order };
}

/** Return a canonical assignment only when it belongs to the requested unit. */
export function getScrimmageDepthAssignment(player, group = null) {
  const assignment = getCanonicalScrimmageAssignment(player);
  if (!assignment) return null;
  const row = DEPTH_CHART_ROWS.find((entry) => entry.key === assignment.rowKey);
  return group && row?.group !== group ? null : assignment;
}

/** Canonical row used to place a player in a scrimmage unit. */
export function getPlayerScrimmageUnitRow(player, group) {
  const assignment = getCanonicalScrimmageAssignment(player);
  if (assignment) {
    const row = DEPTH_CHART_ROWS.find((entry) => entry.key === assignment.rowKey) ?? null;
    return row?.group === group ? row : null;
  }
  const primaryPos = String(player?.pos ?? '').toUpperCase();
  return DEPTH_CHART_ROWS.find((row) => row.group === group && row.match.includes(primaryPos)) ?? null;
}

/** Canonical persisted row for a player, including special teams rows. */
export function getCanonicalDepthRow(player) {
  const preferredRowKey = String(player?.depthChart?.rowKey ?? player?.depthRowKey ?? '');
  return rowForPosition(String(player?.pos ?? '').toUpperCase(), preferredRowKey);
}

/**
 * Convert presentation-group ordering into canonical per-row worker updates.
 * Composite groups (DL/DB/ST) preserve each player's existing canonical row;
 * they never become durable row keys themselves.
 */
export function buildCanonicalDepthUpdates(groupedOrder = {}, roster = []) {
  const byId = new Map(roster.map((player) => [String(player?.id), player]));
  const orderedByRow = new Map();
  for (const ids of Object.values(groupedOrder ?? {})) {
    for (const playerId of Array.isArray(ids) ? ids : []) {
      const player = byId.get(String(playerId));
      const row = getCanonicalDepthRow(player);
      if (!player || !row || !isPlayerEligibleForDepthRow(player, row)) continue;
      if (!orderedByRow.has(row.key)) orderedByRow.set(row.key, []);
      orderedByRow.get(row.key).push(player.id);
    }
  }
  return [...orderedByRow].flatMap(([rowKey, ids]) => ids.map((playerId, index) => ({
    playerId,
    rowKey,
    newOrder: index + 1,
  })));
}

function playerMatchTier(player, row) {
  const primary = String(player?.pos ?? '');
  if (row.match.includes(primary)) return 0;
  const secondary = getPlayerFallbackPositions(player).map((p) => String(p));
  if (secondary.some((pos) => row.match.includes(pos))) return 1;
  return 2;
}

function scorePlayerForRow(player, rowKey, scheme = {}) {
  const injuryPenalty = (player?.injuryWeeksRemaining ?? 0) > 0 ? 18 : 0;
  const fatiguePenalty = Math.max(0, Math.min(12, Math.round((player?.fatigue ?? 0) / 9)));
  const schemeFitBonus = Math.round((player?.schemeFit ?? 60) / 8);
  const archetype = String(player?.archetype ?? '').toLowerCase();

  let archetypeBonus = 0;
  if ((rowKey === 'RS') && /speed|return|elusive|slot/.test(archetype)) archetypeBonus = 6;
  if ((rowKey === 'EDGE') && /rush|power/.test(archetype)) archetypeBonus = 5;
  if ((rowKey === 'IDL') && /run|anchor/.test(archetype)) archetypeBonus = 5;

  const roleFit = Number(player?.roleFit?.[rowKey] ?? player?.roleFitScore ?? 0);
  const row = DEPTH_CHART_ROWS.find((entry) => entry.key === rowKey);
  const tier = row ? playerMatchTier(player, row) : 2;
  const tierPenalty = tier === 0 ? 0 : tier === 1 ? 7 : 24;

  return (player?.ovr ?? 0) + schemeFitBonus + archetypeBonus + Math.round(roleFit / 12) - injuryPenalty - fatiguePenalty - tierPenalty;
}

export function autoBuildDepthChart(players = [], existingAssignments = {}) {
  const assignments = {};
  const availablePlayers = players.filter((player) => player && player.teamId != null && player.status !== 'free_agent');
  const assignedPlayerIds = new Set();

  for (const row of DEPTH_CHART_ROWS) {
    const currentIds = Array.isArray(existingAssignments?.[row.key])
      ? existingAssignments[row.key].map((x) => Number(x)).filter(Number.isFinite)
      : [];

    const pool = availablePlayers.filter((player) => {
      if (assignedPlayerIds.has(Number(player.id))) return false;
      const tier = playerMatchTier(player, row);
      return tier <= 1;
    });

    const ranked = [...pool].sort((a, b) => {
      const idxA = currentIds.indexOf(Number(a.id));
      const idxB = currentIds.indexOf(Number(b.id));
      if (idxA >= 0 && idxB >= 0) return idxA - idxB;
      if (idxA >= 0) return -1;
      if (idxB >= 0) return 1;
      return scorePlayerForRow(b, row.key) - scorePlayerForRow(a, row.key);
    });

    const chosen = ranked.slice(0, row.slots).map((p) => Number(p.id));
    assignments[row.key] = chosen;
    chosen.forEach((id) => assignedPlayerIds.add(id));
  }

  // Fill any still-empty rows with best available fallback player to keep chart complete.
  for (const row of DEPTH_CHART_ROWS) {
    if ((assignments[row.key] ?? []).length > 0) continue;
    const fallback = availablePlayers
      .filter((player) => !assignedPlayerIds.has(Number(player.id)))
      .sort((a, b) => scorePlayerForRow(b, row.key) - scorePlayerForRow(a, row.key))[0];
    if (fallback) {
      assignments[row.key] = [Number(fallback.id)];
      assignedPlayerIds.add(Number(fallback.id));
    }
  }

  return assignments;
}

export function applyDepthChartToPlayers(players = [], assignments = {}) {
  const placement = new Map();
  for (const [rowKey, ids] of Object.entries(assignments || {})) {
    (ids || []).forEach((id, idx) => {
      placement.set(Number(id), { rowKey, order: idx + 1, role: SLOT_ROLES[Math.min(idx, SLOT_ROLES.length - 1)] });
    });
  }

  return players.map((player) => {
    const p = placement.get(Number(player.id));
    if (!p) return player;
    return {
      ...player,
      depthOrder: p.order,
      depthChart: { rowKey: p.rowKey, order: p.order, role: p.role },
    };
  });
}

export function depthWarnings(assignments = {}, players = []) {
  const byId = new Map(players.map((p) => [Number(p.id), p]));
  const warnings = [];

  for (const row of DEPTH_CHART_ROWS) {
    const ids = assignments[row.key] ?? [];
    if (ids.length < row.min) {
      warnings.push({ rowKey: row.key, severity: 'warn', message: `${row.label} is thin (${ids.length}/${row.min})` });
    }
    if (ids.length === 0) {
      const eligible = players.some((p) => row.match.includes(p?.pos));
      if (eligible) warnings.push({ rowKey: row.key, severity: 'error', message: `${row.label} has no assignment despite eligible players.` });
    }

    ids.forEach((id, idx) => {
      const assigned = byId.get(Number(id));
      if (!assigned) return;
      const profile = getPositionalPenaltyProfile(assigned?.pos, row.key);
      if (profile.compatibility === 'cross') {
        warnings.push({ rowKey: row.key, severity: 'warn', message: `${assigned?.name ?? 'Player'} has a severe out-of-position assignment at ${row.label}${idx === 0 ? ' (starter)' : ''}.` });
      } else if (idx === 0 && (profile.compatibility === 'minor' || profile.compatibility === 'family')) {
        warnings.push({ rowKey: row.key, severity: 'info', message: `${assigned?.name ?? 'Player'} has a moderate role fit penalty at ${row.label}.` });
      }
    });

    const injuredStarter = byId.get(Number(ids[0]));
    if (injuredStarter && (injuredStarter?.injuryWeeksRemaining ?? 0) > 0) {
      warnings.push({ rowKey: row.key, severity: 'warn', message: `${row.label} starter is injured.` });
    }
  }

  return warnings;
}
