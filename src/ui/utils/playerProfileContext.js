const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0)));

export function buildFreeAgencyProfileContext(row = {}) {
  return clean({
    source: 'free_agency',
    sourceLabel: 'Free Agency fit',
    action: 'sign_candidate',
    reason: row.reason ?? row.roleFit ?? row.recommendation,
    comparisonReceipt: row.comparisonReceipt ?? row.upgradeReceipt,
    recommendation: row.recommendation,
    roleFit: row.roleFit,
    needFit: row.needFit,
    fitScore: row.fitScore,
    capImpactLabel: row.capImpactLabel ?? row.projectedCapLabel,
    valueLabel: row.valueLabel ?? row.valueMatch,
    riskFlags: Array.isArray(row.riskFlags) ? row.riskFlags : undefined,
    warnings: Array.isArray(row.warnings) ? row.warnings : undefined,
  });
}

export function buildTradeFinderProfileContext(idea = {}, playerRole = 'target') {
  return clean({
    source: 'trade_finder',
    sourceLabel: playerRole === 'outgoing' ? 'Trade package context' : 'Trade Finder target',
    action: playerRole === 'outgoing' ? 'package_candidate' : 'trade_target',
    reason: idea.reason,
    comparisonReceipt: idea.comparisonReceipt ?? idea.outgoingSummary,
    recommendation: idea.recommendation ? `${idea.recommendation} (possible framework, AI acceptance not guaranteed)` : 'Possible framework, AI acceptance not guaranteed',
    roleFit: idea.roleFit,
    needFit: idea.targetPos,
    fitScore: idea.fitScore,
    capImpactLabel: idea.capImpactLabel,
    valueLabel: idea.valueMatch,
    riskFlags: Array.isArray(idea.riskFlags) ? idea.riskFlags : undefined,
    warnings: Array.isArray(idea.warnings) ? idea.warnings : undefined,
  });
}

export function buildDraftProfileContext(row = {}) {
  return clean({
    source: 'draft_board',
    sourceLabel: 'Draft Board target',
    action: 'draft_fit',
    reason: row.reason,
    comparisonReceipt: row.comparisonReceipt,
    recommendation: row.recommendation,
    roleFit: row.roleProjection,
    needFit: row.currentTeamNeedLevel,
    fitScore: row.fitScore,
    valueLabel: row.pickValueFit,
    riskFlags: Array.isArray(row.riskFlags) ? row.riskFlags : undefined,
  });
}

export function buildRosterProfileContext(player = {}, row = {}) {
  return clean({
    source: 'roster',
    sourceLabel: 'Current roster role',
    action: 'roster_evaluation',
    reason: row.reason ?? player.role,
    roleFit: player.role,
    fitScore: row.fitScore,
  });
}
