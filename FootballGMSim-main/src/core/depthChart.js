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

function getPlayerFallbackPositions(player = {}) {
  if (Array.isArray(player?.secondaryPositions)) return player.secondaryPositions;
  if (Array.isArray(player?.positions)) return player.positions.slice(1);
  return [];
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

    const injuredStarter = byId.get(Number(ids[0]));
    if (injuredStarter && (injuredStarter?.injuryWeeksRemaining ?? 0) > 0) {
      warnings.push({ rowKey: row.key, severity: 'warn', message: `${row.label} starter is injured.` });
    }
  }

  return warnings;
}
