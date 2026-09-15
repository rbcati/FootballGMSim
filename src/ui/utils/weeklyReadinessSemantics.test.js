import { describe, expect, it } from 'vitest';
import { buildCommandCenterSummary, getProgressionCtaCopy } from './weeklyHubLayout.js';

describe('weekly readiness semantics', () => {
  it('keeps optional game-plan, scouting, and training recommendations non-blocking', () => {
    const summary = buildCommandCenterSummary({
      gate: { severity: 'warning', shouldWarn: true, riskItems: [
        { label: 'Game plan has not been reviewed.', severity: 'warning' },
        { label: 'Opponent has not been scouted.', severity: 'info' },
      ] },
      weeklyContext: { urgentItems: [{ label: 'Set training focus', tone: 'warning', level: 'recommendation' }] },
    });
    expect(summary).toMatchObject({ hasDanger: false, criticalCount: 0, blockerCount: 0, readinessLabel: 'Advance with open prep items?' });
    expect(summary.recommendationCount).toBeGreaterThan(0);
  });

  it('is blocked only when a true danger/blocker exists', () => {
    const summary = buildCommandCenterSummary({
      gate: { severity: 'danger', shouldWarn: true, riskItems: [{ label: 'Depth chart blocker', severity: 'danger' }] },
      weeklyContext: { urgentItems: [] },
    });
    expect(summary).toMatchObject({ hasDanger: true, criticalCount: 1, blockerCount: 1 });
  });

  it('counts every blocker before limiting visible primary actions', () => {
    const summary = buildCommandCenterSummary({
      gate: { shouldWarn: true, riskItems: [
        { label: 'Recommendation A', severity: 'warning' },
        { label: 'Recommendation B', severity: 'warning' },
        { label: 'Blocker A', severity: 'danger' },
      ] },
      weeklyContext: { urgentItems: [
        { label: 'Blocker B', tone: 'danger', level: 'blocker' },
        { label: 'Blocker C', tone: 'danger', level: 'blocker' },
      ] },
    });
    expect(summary.primaryActions).toHaveLength(3);
    expect(summary.blockerCount).toBe(3);
    expect(getProgressionCtaCopy({ blockerCount: summary.blockerCount })).toEqual({
      label: 'Resolve 3 blockers',
      ariaLabel: 'Resolve 3 blockers before advancing',
    });
  });

  it('uses singular blocker and unblocked progression copy', () => {
    expect(getProgressionCtaCopy({ blockerCount: 1 }).label).toBe('Resolve 1 blocker');
    expect(getProgressionCtaCopy({ blockerCount: 0, hasNextGame: true })).toEqual({
      label: 'Advance to Game', ariaLabel: 'Advance to Game',
    });
  });
});
