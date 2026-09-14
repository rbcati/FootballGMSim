import { describe, expect, it } from 'vitest';
import { buildCommandCenterSummary } from './weeklyHubLayout.js';

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
});
