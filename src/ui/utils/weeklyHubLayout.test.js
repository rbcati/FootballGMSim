import { describe, expect, it } from 'vitest';
import { buildNeedsAttentionItems, buildPrimaryAction, getDefaultExpandedSections, buildCommandCenterSummary } from './weeklyHubLayout.js';

describe('weeklyHubLayout helpers', () => {
  it('limits needs-attention list to max items and prioritizes blockers', () => {
    const items = buildNeedsAttentionItems({
      urgentItems: [
        { label: 'info one', level: 'recommendation', tone: 'info', rank: 40 },
        { label: 'blocker one', level: 'blocker', tone: 'warning', rank: 20 },
        { label: 'danger two', level: 'recommendation', tone: 'danger', rank: 90 },
        { label: 'warning three', level: 'recommendation', tone: 'warning', rank: 80 },
        { label: 'warning four', level: 'recommendation', tone: 'warning', rank: 70 },
        { label: 'info five', level: 'recommendation', tone: 'info', rank: 60 },
      ],
    }, { limit: 5 });

    expect(items).toHaveLength(5);
    expect(items[0].label).toBe('blocker one');
  });

  it('builds a navigate primary action from blocker items', () => {
    const action = buildPrimaryAction({
      topNeeds: [{ label: 'Bid Risk', detail: 'Offer may expire', level: 'blocker', tab: 'FA Hub' }],
    });

    expect(action.type).toBe('navigate');
    expect(action.cta).toBe('Resolve now');
    expect(action.tab).toBe('FA Hub');
  });

  it('keeps lower-priority sections collapsed by default', () => {
    const defaults = getDefaultExpandedSections();
    expect(defaults.frontOffice).toBe(false);
    expect(defaults.insights).toBe(false);
  });
});

describe('buildCommandCenterSummary', () => {
  it('returns safe defaults when no gate or context is provided', () => {
    const summary = buildCommandCenterSummary({});
    expect(summary.primaryActions).toHaveLength(0);
    expect(summary.criticalCount).toBe(0);
    expect(summary.canAdvanceSafely).toBe(true);
    expect(summary.readinessTone).toBe('ok');
  });

  it('reflects danger tone when gate has danger severity', () => {
    const gate = {
      shouldWarn: true,
      severity: 'danger',
      riskItems: [
        { label: 'Depth chart blocker', detail: 'A starter slot is empty.', severity: 'danger', fixDestination: 'Team:Roster / Depth' },
      ],
    };
    const summary = buildCommandCenterSummary({ gate, weeklyContext: { urgentItems: [] } });
    expect(summary.readinessTone).toBe('danger');
    expect(summary.canAdvanceSafely).toBe(false);
    expect(summary.primaryActions.length).toBeGreaterThan(0);
    expect(summary.primaryActions[0].label).toBe('Depth chart blocker');
  });

  it('caps primary actions to 3', () => {
    const gate = { shouldWarn: true, severity: 'danger', riskItems: [] };
    const weeklyContext = {
      urgentItems: [
        { label: 'A', detail: '', tone: 'danger', level: 'blocker', rank: 100 },
        { label: 'B', detail: '', tone: 'danger', level: 'blocker', rank: 90 },
        { label: 'C', detail: '', tone: 'danger', level: 'blocker', rank: 80 },
        { label: 'D', detail: '', tone: 'danger', level: 'blocker', rank: 70 },
        { label: 'E', detail: '', tone: 'danger', level: 'blocker', rank: 60 },
      ],
    };
    const summary = buildCommandCenterSummary({ gate, weeklyContext });
    expect(summary.primaryActions.length).toBeLessThanOrEqual(3);
  });

  it('deduplicates items with the same label from gate and context', () => {
    const gate = {
      shouldWarn: true,
      severity: 'warning',
      riskItems: [
        { label: 'Injuries pending', detail: 'Check the injury report.', severity: 'warning', fixDestination: 'Team:Injuries' },
      ],
    };
    const weeklyContext = {
      urgentItems: [
        { label: 'Injuries pending', detail: 'Check the injury report.', tone: 'danger', level: 'blocker', rank: 80 },
      ],
    };
    const summary = buildCommandCenterSummary({ gate, weeklyContext });
    const injuryItems = summary.primaryActions.filter((i) => i.label === 'Injuries pending');
    expect(injuryItems).toHaveLength(1);
  });

  it('returns ok readiness when gate has no warnings and no urgent context items', () => {
    const gate = { shouldWarn: false, severity: 'info', riskItems: [] };
    const weeklyContext = { urgentItems: [{ label: 'No blockers', tone: 'ok', level: 'recommendation', rank: 0 }] };
    const summary = buildCommandCenterSummary({ gate, weeklyContext });
    expect(summary.readinessTone).toBe('ok');
    expect(summary.canAdvanceSafely).toBe(true);
    expect(summary.readinessLabel).toBe('Ready to advance');
  });
});
