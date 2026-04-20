import { describe, it, expect } from 'vitest';
import { autoBuildDepthChart, applyDepthChartToPlayers, depthWarnings } from '../depthChart.js';

describe('depth chart auto population', () => {
  it('assigns eligible players into position rooms and preserves manual order', () => {
    const players = [
      { id: 1, pos: 'QB', ovr: 88, teamId: 1, status: 'active' },
      { id: 2, pos: 'QB', ovr: 75, teamId: 1, status: 'active' },
      { id: 3, pos: 'WR', ovr: 82, teamId: 1, status: 'active' },
      { id: 4, pos: 'WR', ovr: 70, teamId: 1, status: 'active' },
      { id: 5, pos: 'K', ovr: 69, teamId: 1, status: 'active' },
    ];
    const assignments = autoBuildDepthChart(players, { QB: [2, 1] });
    expect(assignments.QB[0]).toBe(2);
    expect(assignments.WR.length).toBe(2);

    const withDepth = applyDepthChartToPlayers(players, assignments);
    const qb2 = withDepth.find((p) => p.id === 2);
    expect(qb2.depthChart.rowKey).toBe('QB');
    expect(qb2.depthChart.order).toBe(1);
  });

  it('emits warnings for thin groups', () => {
    const players = [{ id: 10, pos: 'QB', ovr: 80, teamId: 1, status: 'active' }];
    const assignments = autoBuildDepthChart(players, {});
    const warnings = depthWarnings(assignments, players);
    expect(warnings.some((w) => w.rowKey === 'RB')).toBe(true);
  });
});
