const IN_SEASON_PHASES = new Set(['regular', 'playoffs', 'preseason']);

function isPlayerInjured(player) {
  return (
    Number(player?.injuryWeeksRemaining ?? player?.injuredWeeks ?? player?.injuryDuration ?? 0) > 0 ||
    ['injured', 'ir'].includes(String(player?.status ?? '').toLowerCase())
  );
}

/**
 * Builds a readiness gate view model for the Advance Week action.
 *
 * @param {{ league: object, prep: object, weeklyContext?: object }} input
 * @returns {{ shouldWarn: boolean, severity: 'info'|'warning'|'danger', title: string,
 *             summary: string, riskItems: Array, primaryFixDestination: string,
 *             advanceAnywayLabel: string }}
 */
export function buildAdvanceReadinessGate({ league, prep, weeklyContext } = {}) {
  const emptyResult = {
    shouldWarn: false,
    severity: 'info',
    title: 'Advance to next week?',
    summary: 'No prep blockers detected.',
    riskItems: [],
    primaryFixDestination: 'Weekly Prep',
    advanceAnywayLabel: 'Advance anyway',
  };

  if (!IN_SEASON_PHASES.has(String(league?.phase ?? ''))) return emptyResult;

  const riskItems = [];

  // 1. Depth chart blocker (urgent-level lineup issue)
  const depthBlocker = (prep?.lineupIssues ?? []).find(
    (issue) => issue.level === 'urgent' && String(issue.label).toLowerCase().includes('depth chart blocker'),
  );
  if (depthBlocker) {
    riskItems.push({
      id: 'depth-blocker',
      label: 'Depth chart blocker is still active.',
      detail: depthBlocker.detail ?? 'A starter slot has no assigned player.',
      severity: 'danger',
      fixDestination: 'Team:Roster / Depth',
    });
  }

  // 2. Injuries exist but have not been reviewed
  const roster = Array.isArray(prep?.userTeam?.roster) ? prep.userTeam.roster : [];
  const hasInjuries =
    roster.some(isPlayerInjured) ||
    (prep?.lineupIssues ?? []).some((issue) => issue.actionTab === 'Injuries');
  const injuriesReviewed = prep?.completion?.injuriesReviewed ?? false;
  if (hasInjuries && !injuriesReviewed) {
    riskItems.push({
      id: 'injuries-pending',
      label: 'Injuries have not been reviewed.',
      detail: 'Active injuries may affect depth chart readiness.',
      severity: 'warning',
      fixDestination: 'Team:Injuries',
    });
  }

  // 3. Game plan not reviewed (only when an upcoming game exists)
  const planReviewed = prep?.completion?.planReviewed ?? false;
  if (prep?.nextGame && !planReviewed) {
    riskItems.push({
      id: 'plan-not-reviewed',
      label: 'Game plan has not been reviewed.',
      detail: 'Review and confirm your tactical script before kickoff.',
      severity: 'warning',
      fixDestination: 'Game Plan',
    });
  }

  // 4. Opponent not scouted — info only; does not trigger shouldWarn alone
  const opponentScouted = prep?.completion?.opponentScouted ?? false;
  if (prep?.nextGame && !opponentScouted) {
    riskItems.push({
      id: 'opponent-not-scouted',
      label: 'Opponent has not been scouted.',
      detail: 'Review matchup intel before advancing.',
      severity: 'info',
      fixDestination: 'Weekly Prep',
    });
  }

  // 5. Major negative prep impact from game plan / synergy evaluation
  const prepSeverity = prep?.prepSummary?.severity ?? prep?.readinessTier;
  if (prepSeverity === 'major_risk') {
    riskItems.push({
      id: 'major-prep-risk',
      label: 'Projected prep impact is negative.',
      detail:
        prep?.prepSummary?.reasons?.[0] ??
        'Game plan and prep state are working against this matchup.',
      severity: 'danger',
      fixDestination: 'Weekly Prep',
    });
  }

  // 6. Cap/roster issue already flagged as danger-level by weeklyContext
  const capIssueItem = (weeklyContext?.urgentItems ?? []).find(
    (item) => item?.tab === 'Financials' && item?.tone === 'danger',
  );
  if (capIssueItem) {
    riskItems.push({
      id: 'cap-issue',
      label: capIssueItem.label ?? 'Cap issue requires attention.',
      detail: capIssueItem.detail ?? 'Review your cap situation before advancing.',
      severity: 'danger',
      fixDestination: 'Financials',
    });
  }

  // Only warning/danger items trigger shouldWarn
  const shouldWarn = riskItems.some(
    (item) => item.severity === 'warning' || item.severity === 'danger',
  );

  const hasDanger = riskItems.some((item) => item.severity === 'danger');
  const hasWarning = riskItems.some((item) => item.severity === 'warning');
  const gateSeverity = hasDanger ? 'danger' : hasWarning ? 'warning' : 'info';

  const title = shouldWarn ? 'Advance with unresolved prep?' : 'Advance to next week?';
  const summary = shouldWarn
    ? "You can still advance, but this week's setup is not clean."
    : 'No prep blockers detected. Ready to advance.';

  // primaryFixDestination: most critical item first
  const primaryItem =
    riskItems.find((item) => item.severity === 'danger') ??
    riskItems.find((item) => item.severity === 'warning') ??
    riskItems[0];
  const primaryFixDestination = primaryItem?.fixDestination ?? 'Weekly Prep';

  return {
    shouldWarn,
    severity: gateSeverity,
    title,
    summary,
    riskItems,
    primaryFixDestination,
    advanceAnywayLabel: 'Advance anyway',
  };
}
