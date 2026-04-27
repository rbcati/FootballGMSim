import { DEPTH_CHART_ROWS, autoBuildDepthChart, depthWarnings } from '../../core/depthChart.js';

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isInjured(player) {
  return toNumber(player?.injury?.weeksRemaining ?? player?.injuryWeeksRemaining ?? player?.injury?.gamesRemaining ?? 0) > 0
    || ['injured', 'ir'].includes(String(player?.status ?? '').toLowerCase());
}

function buildExistingAssignments(players = []) {
  const assignments = {};
  for (const row of DEPTH_CHART_ROWS) assignments[row.key] = [];
  for (const player of players) {
    const rowKey = player?.depthChart?.rowKey;
    if (!rowKey || !assignments[rowKey]) continue;
    assignments[rowKey].push(Number(player.id));
  }
  for (const row of DEPTH_CHART_ROWS) {
    assignments[row.key] = assignments[row.key]
      .filter((id) => Number.isFinite(id))
      .sort((a, b) => {
        const playerA = players.find((player) => Number(player?.id) === Number(a));
        const playerB = players.find((player) => Number(player?.id) === Number(b));
        return toNumber(playerA?.depthChart?.order ?? playerA?.depthOrder, 999) - toNumber(playerB?.depthChart?.order ?? playerB?.depthOrder, 999);
      });
  }
  return assignments;
}

function topRiskGroups(rows = []) {
  return rows
    .sort((a, b) => b.riskScore - a.riskScore || a.label.localeCompare(b.label))
    .slice(0, 3)
    .map((row) => ({
      rowKey: row.rowKey,
      label: row.label,
      riskScore: row.riskScore,
      reason: row.reason,
    }));
}

export function deriveRosterReadinessModel({
  league = null,
  team = null,
  roster = [],
  source = null,
  assignments = null,
} = {}) {
  const safeRoster = Array.isArray(roster) ? roster.filter(Boolean) : [];

  if (!team) {
    return {
      status: 'blocked',
      statusLabel: 'Blocked',
      rosterCount: 0,
      starterReadiness: 'No team context',
      missingStarterCount: DEPTH_CHART_ROWS.length,
      injuryReplacementConcerns: 0,
      topRiskyPositionGroups: [],
      recommendedNextAction: 'Return to HQ and select a controlled team.',
      safeToMarkLineupChecked: false,
      routeHints: { showBackToWeeklyPrep: true, showBackToHQ: true, source: source ?? 'unknown' },
      warnings: [],
      assignments: {},
    };
  }

  if (safeRoster.length === 0) {
    return {
      status: 'blocked',
      statusLabel: 'Blocked',
      rosterCount: 0,
      starterReadiness: '0 staffed groups',
      missingStarterCount: DEPTH_CHART_ROWS.length,
      injuryReplacementConcerns: 0,
      topRiskyPositionGroups: [],
      recommendedNextAction: 'Sign players before setting the depth chart.',
      safeToMarkLineupChecked: false,
      routeHints: { showBackToWeeklyPrep: true, showBackToHQ: true, source: source ?? 'unknown' },
      warnings: [],
      assignments: {},
    };
  }

  const resolvedAssignments = assignments && typeof assignments === 'object'
    ? assignments
    : autoBuildDepthChart(safeRoster, buildExistingAssignments(safeRoster));
  const warnings = depthWarnings(resolvedAssignments, safeRoster);
  const byId = new Map(safeRoster.map((player) => [Number(player.id), player]));

  const perRowRisk = DEPTH_CHART_ROWS.map((row) => {
    const ids = Array.isArray(resolvedAssignments?.[row.key]) ? resolvedAssignments[row.key] : [];
    const starter = byId.get(Number(ids[0]));
    const injuredInRow = ids
      .map((id) => byId.get(Number(id)))
      .filter(Boolean)
      .filter((player) => isInjured(player)).length;
    const missing = ids.length === 0 ? 1 : 0;
    const thin = ids.length < row.min ? 1 : 0;
    const injuredStarter = starter && isInjured(starter) ? 1 : 0;
    const riskScore = (missing * 100) + (injuredStarter * 45) + (thin * 20) + (injuredInRow * 8);
    let reason = 'Stable';
    if (missing) reason = 'No assigned starter';
    else if (injuredStarter) reason = 'Starter injured';
    else if (thin) reason = `Depth thin (${ids.length}/${row.min})`;
    else if (injuredInRow > 1) reason = `${injuredInRow} injured in group`;

    return {
      rowKey: row.key,
      label: row.label,
      riskScore,
      reason,
      missing,
      thin,
      injuredStarter,
    };
  });

  const missingStarterCount = perRowRisk.reduce((sum, row) => sum + row.missing, 0);
  const injuryReplacementConcerns = perRowRisk.reduce((sum, row) => sum + row.injuredStarter + (row.thin && row.injuredStarter ? 1 : 0), 0);
  const riskyGroups = topRiskGroups(perRowRisk.filter((row) => row.riskScore > 0));
  const staffedGroups = DEPTH_CHART_ROWS.length - missingStarterCount;

  const status = missingStarterCount > 0
    ? 'blocked'
    : injuryReplacementConcerns > 0 || riskyGroups.length > 0
      ? 'needs_attention'
      : 'ready';
  const statusLabel = status === 'ready' ? 'Ready' : status === 'blocked' ? 'Blocked' : 'Needs Attention';

  const recommendedNextAction = missingStarterCount > 0
    ? 'Auto-build depth chart and fill missing starter slots.'
    : injuryReplacementConcerns > 0
      ? 'Review injuries and promote healthy backups.'
      : riskyGroups.length > 0
        ? `Review ${riskyGroups[0].label} depth order for stability.`
        : 'Lineup is stable. Return to Weekly Prep and advance readiness.';

  const safeToMarkLineupChecked = missingStarterCount === 0 && injuryReplacementConcerns === 0;

  return {
    status,
    statusLabel,
    rosterCount: safeRoster.length,
    starterReadiness: `${staffedGroups}/${DEPTH_CHART_ROWS.length} staffed groups`,
    missingStarterCount,
    injuryReplacementConcerns,
    topRiskyPositionGroups: riskyGroups,
    recommendedNextAction,
    safeToMarkLineupChecked,
    routeHints: {
      showBackToWeeklyPrep: String(league?.phase ?? '').toLowerCase() === 'regular' || source === 'weekly-prep',
      showBackToHQ: true,
      source: source ?? 'roster',
    },
    warnings,
    assignments: resolvedAssignments,
  };
}
