import { describe, it, expect, vi } from 'vitest';

vi.mock('../../depthChart.js', () => ({
  DEPTH_CHART_ROWS: [
    { key: 'QB', label: 'Quarterback', match: ['QB'], slots: 1, min: 1 },
    { key: 'RB', label: 'Running Back', match: ['RB'], slots: 2, min: 2 },
    { key: 'WR', label: 'Wide Receiver', match: ['WR'], slots: 2, min: 2 },
  ]
}));

import * as Manager from '../depthChartManager';

describe('DepthChartManager', () => {
  const mockRoster = [
    { id: '1', name: 'QB1', pos: 'QB', ovr: 85, teamId: 1 },
    { id: '2', name: 'RB1', pos: 'RB', ovr: 80, teamId: 1 },
    { id: '3', name: 'WR1', pos: 'WR', ovr: 75, teamId: 1, secondaryPositions: ['RB'] },
    { id: '4', name: 'WR2', pos: 'WR', ovr: 70, teamId: 1 },
    { id: '5', name: 'FB1', pos: 'FB', ovr: 65, teamId: 1 },
  ];

  const mockTeam = {
    id: 1,
    roster: mockRoster as any,
    depthChart: {
      'QB': ['1'],
      'RB': ['2'],
      'WR': ['3', '4']
    }
  };

  it('validates a correct depth chart', () => {
    const result = Manager.validateDepthChart(mockTeam as any);
    expect(result.isValid).toBe(true);
    expect(result.missingRows).toHaveLength(0);
  });

  it('detects missing required assignments', () => {
    const brokenTeam = { ...mockTeam, depthChart: { 'QB': ['1'] } };
    const result = Manager.validateDepthChart(brokenTeam as any);
    expect(result.missingRows).toContain('RB');
    expect(result.missingRows).toContain('WR');
    expect(result.isValid).toBe(false);
  });

  it('repairs missing RB assignment using natural backup', () => {
    const brokenTeam = { ...mockTeam, depthChart: { 'QB': ['1'], 'WR': ['3', '4'] } };
    const repair = Manager.repairDepthChart(brokenTeam as any);
    expect(repair.modified).toBe(true);
    expect(repair.repairedAssignments['RB']).toContain('2');
  });

  it('uses secondary position when natural backup is missing', () => {
    const rosterNoRB = mockRoster.filter(p => p.pos !== 'RB');
    const brokenTeam = { id: 1, roster: rosterNoRB as any, depthChart: { 'QB': ['1'], 'WR': ['4'] } };
    const repair = Manager.repairDepthChart(brokenTeam as any);

    expect(repair.repairedAssignments['RB']).toContain('3');
    expect(repair.repairedAssignments['RB']).toContain('5');
  });

  it('uses emergency fallback when no natural or secondary backups exist', () => {
    const rosterVeryThin = [
        { id: '1', name: 'QB1', pos: 'QB', ovr: 85, teamId: 1 },
        { id: '5', name: 'FB1', pos: 'FB', ovr: 65, teamId: 1 },
    ];
    const brokenTeam = { id: 1, roster: rosterVeryThin as any, depthChart: { 'QB': ['1'] } };
    const repair = Manager.repairDepthChart(brokenTeam as any);

    // FB is emergency fallback for RB
    expect(repair.repairedAssignments['RB']).toContain('5');
  });

  it('promotes healthy backup for AI/pre-sim if starter is injured', () => {
    const injuredRoster = [
        { id: '1', name: 'QB1', pos: 'QB', ovr: 85, teamId: 1, injuryWeeksRemaining: 2 },
        { id: '10', name: 'QB2', pos: 'QB', ovr: 70, teamId: 1, injuryWeeksRemaining: 0 },
    ];
    const team = { id: 1, roster: injuredRoster as any, depthChart: { 'QB': ['1', '10'] } };
    const repair = Manager.repairDepthChart(team as any, { isAI: true });

    expect(repair.modified).toBe(true);
    expect(repair.repairedAssignments['QB'][0]).toBe('10'); // QB2 promoted
    expect(repair.repairedAssignments['QB'][1]).toBe('1');  // QB1 moved down
  });

  it('preserves valid user lineup', () => {
    const repair = Manager.repairDepthChart(mockTeam as any, { isAI: false });
    expect(repair.modified).toBe(false);
  });

  it('optimizes for plan', () => {
    const team = {
        ...mockTeam,
        weeklyGamePlan: { offPlanId: 'AGGRESSIVE_PASSING' }
    };
    const repair = Manager.optimizeDepthChartForPlan(team as any);
    expect(repair.modified).toBe(true);
    expect(repair.repairedAssignments['QB']).toBeDefined();
  });
});
