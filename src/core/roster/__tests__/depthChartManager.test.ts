import { describe, it, expect, vi } from 'vitest';

vi.mock('../../depthChart.js', () => ({
  DEPTH_CHART_ROWS: [
    { key: 'QB', label: 'Quarterback', match: ['QB'], slots: 2, min: 1 },
    { key: 'RB', label: 'Running Back', match: ['RB', 'HB'], slots: 2, min: 1 },
    { key: 'WR', label: 'Wide Receiver', match: ['WR'], slots: 3, min: 2 },
    { key: 'OL', label: 'Offensive Line', match: ['OL', 'LT', 'RT', 'LG', 'RG', 'C'], slots: 3, min: 2 },
    { key: 'CB', label: 'Cornerback', match: ['CB'], slots: 2, min: 1 },
    { key: 'S', label: 'Safety', match: ['S'], slots: 2, min: 1 },
  ]
}));

import * as Manager from '../depthChartManager';

const makeTeam = (overrides: Partial<any> = {}) => ({
  id: 1,
  roster: [
    { id: '1', name: 'QB1', pos: 'QB', ovr: 85, teamId: 1, injuryWeeksRemaining: 0 },
    { id: '2', name: 'RB1', pos: 'RB', ovr: 79, teamId: 1, injuryWeeksRemaining: 0, awr: 80, btk: 82 },
    { id: '3', name: 'RB2', pos: 'RB', ovr: 74, teamId: 1, injuryWeeksRemaining: 0, awr: 77, btk: 70 },
    { id: '4', name: 'WR1', pos: 'WR', ovr: 83, teamId: 1, injuryWeeksRemaining: 0, secondaryPositions: ['RB'] },
    { id: '5', name: 'WR2', pos: 'WR', ovr: 81, teamId: 1, injuryWeeksRemaining: 0 },
    { id: '6', name: 'FB1', pos: 'FB', ovr: 67, teamId: 1, injuryWeeksRemaining: 0 },
    { id: '7', name: 'OL1', pos: 'OL', ovr: 75, teamId: 1, injuryWeeksRemaining: 0, rbk: 79, pbk: 66 },
    { id: '8', name: 'OL2', pos: 'OL', ovr: 72, teamId: 1, injuryWeeksRemaining: 0, rbk: 73, pbk: 72 },
    { id: '9', name: 'CB1', pos: 'CB', ovr: 76, teamId: 1, injuryWeeksRemaining: 0 },
    { id: '10', name: 'S1', pos: 'S', ovr: 78, teamId: 1, injuryWeeksRemaining: 0 },
  ],
  depthChart: {
    QB: ['1'],
    RB: ['2', '3'],
    WR: ['4', '5'],
    OL: ['7', '8'],
    CB: ['9'],
    S: ['10'],
  },
  weeklyGamePlan: {
    offPlanId: 'POWER_RUN',
    defPlanId: 'PRESSURE_FRONT',
  },
  ...overrides,
});

describe('depthChartManager', () => {
  it('repairs missing RB assignment with natural backup first', () => {
    const team = makeTeam({ depthChart: { QB: ['1'], WR: ['4', '5'], OL: ['7', '8'], CB: ['9'], S: ['10'] } });
    const result = Manager.repairDepthChart(team as any, { phase: 'regular' });

    expect(result.modified).toBe(true);
    expect(result.repairedAssignments.RB[0]).toBe('2');
    expect(result.promotedPlayers[0]?.reason).toBe('natural');
    expect(result.summary).toContain('Roster validated');
  });

  it('replaces injured starter with best natural backup during AI/pre-sim repair', () => {
    const team = makeTeam({
      roster: [
        { id: '1', name: 'QB1', pos: 'QB', ovr: 90, teamId: 1, injuryWeeksRemaining: 2 },
        { id: '11', name: 'QB2', pos: 'QB', ovr: 74, teamId: 1, injuryWeeksRemaining: 0 },
      ],
      depthChart: { QB: ['1', '11'] },
    });

    const result = Manager.repairDepthChart(team as any, { isAI: true, phase: 'regular' });
    expect(result.repairedAssignments.QB[0]).toBe('11');
    expect(result.changes.join(' ')).toContain('Promoted healthy backup');
  });

  it('uses emergency fallback only when natural and secondary options are unavailable', () => {
    const thinTeam = makeTeam({
      roster: [
        { id: '1', name: 'QB1', pos: 'QB', ovr: 85, teamId: 1, injuryWeeksRemaining: 0 },
        { id: '6', name: 'FB1', pos: 'FB', ovr: 67, teamId: 1, injuryWeeksRemaining: 0 },
        { id: '4', name: 'WR1', pos: 'WR', ovr: 83, teamId: 1, injuryWeeksRemaining: 2 },
      ],
      depthChart: { QB: ['1'] },
    });

    const result = Manager.repairDepthChart(thinTeam as any, { phase: 'regular' });
    expect(result.usedEmergencyFallback).toBe(true);
    expect(result.repairedAssignments.RB).toContain('6');
    expect(result.promotedPlayers.some((p) => p.reason === 'emergency')).toBe(true);
  });

  it('handles multiple injured starters in the same position group', () => {
    const team = makeTeam({
      roster: [
        { id: '1', name: 'QB1', pos: 'QB', ovr: 85, teamId: 1, injuryWeeksRemaining: 0 },
        { id: '2', name: 'RB1', pos: 'RB', ovr: 79, teamId: 1, injuryWeeksRemaining: 3 },
        { id: '3', name: 'RB2', pos: 'RB', ovr: 74, teamId: 1, injuryWeeksRemaining: 2 },
        { id: '6', name: 'FB1', pos: 'FB', ovr: 67, teamId: 1, injuryWeeksRemaining: 0 },
        { id: '4', name: 'WR1', pos: 'WR', ovr: 83, teamId: 1, injuryWeeksRemaining: 0, secondaryPositions: ['RB'] },
        { id: '5', name: 'WR2', pos: 'WR', ovr: 81, teamId: 1, injuryWeeksRemaining: 0 },
        { id: '7', name: 'OL1', pos: 'OL', ovr: 75, teamId: 1, injuryWeeksRemaining: 0 },
        { id: '8', name: 'OL2', pos: 'OL', ovr: 72, teamId: 1, injuryWeeksRemaining: 0 },
        { id: '9', name: 'CB1', pos: 'CB', ovr: 76, teamId: 1, injuryWeeksRemaining: 0 },
        { id: '10', name: 'S1', pos: 'S', ovr: 78, teamId: 1, injuryWeeksRemaining: 0 },
      ],
      depthChart: { QB: ['1'], RB: ['2', '3'], WR: ['4', '5'], OL: ['7', '8'], CB: ['9'], S: ['10'] },
    });

    const result = Manager.repairDepthChart(team as any, { isAI: true, phase: 'regular' });
    expect(result.repairedAssignments.RB[0]).not.toBe('2');
    expect(result.repairedAssignments.RB[0]).not.toBe('3');
    expect(result.repairedAssignments.RB).toContain('6');
  });

  it('preserves valid custom user lineup during load-time repair', () => {
    const team = makeTeam();
    const result = Manager.repairDepthChart(team as any, { isAI: false, phase: 'offseason' });

    expect(result.modified).toBe(false);
    expect(result.repairedAssignments).toEqual(team.depthChart);
  });

  it('keeps deterministic output for same roster/context', () => {
    const team = makeTeam({ depthChart: { QB: ['1'], WR: ['4', '5'], OL: ['7', '8'], CB: ['9'], S: ['10'] } });
    const a = Manager.repairDepthChart(team as any, { phase: 'regular' });
    const b = Manager.repairDepthChart(team as any, { phase: 'regular' });

    expect(a.repairedAssignments).toEqual(b.repairedAssignments);
    expect(a.changes).toEqual(b.changes);
  });

  it('handles partial/older saves safely with invalid references', () => {
    const team = makeTeam({
      depthChart: {
        QB: ['999', '1'],
        RB: ['2', '2'],
        WR: ['4'],
      },
    });

    const result = Manager.repairDepthChart(team as any, { phase: 'regular' });
    expect(result.modified).toBe(true);
    expect(result.repairedAssignments.QB).not.toContain('999');
    expect(new Set(result.repairedAssignments.RB).size).toBe(result.repairedAssignments.RB.length);
  });

  it('optimizes with plan-aware bias better than naive OVR for power run', () => {
    const team = makeTeam({
      roster: [
        { id: '20', name: 'RB Power', pos: 'RB', ovr: 80, teamId: 1, injuryWeeksRemaining: 0, awr: 82, btk: 90 },
        { id: '21', name: 'RB Speed', pos: 'RB', ovr: 81, teamId: 1, injuryWeeksRemaining: 0, awr: 65, btk: 60, cth: 88, acc: 92 },
        { id: '1', name: 'QB1', pos: 'QB', ovr: 85, teamId: 1, injuryWeeksRemaining: 0 },
        { id: '4', name: 'WR1', pos: 'WR', ovr: 83, teamId: 1, injuryWeeksRemaining: 0 },
        { id: '5', name: 'WR2', pos: 'WR', ovr: 81, teamId: 1, injuryWeeksRemaining: 0 },
        { id: '7', name: 'OL1', pos: 'OL', ovr: 75, teamId: 1, injuryWeeksRemaining: 0, rbk: 89, pbk: 62 },
        { id: '8', name: 'OL2', pos: 'OL', ovr: 72, teamId: 1, injuryWeeksRemaining: 0, rbk: 77, pbk: 74 },
        { id: '9', name: 'CB1', pos: 'CB', ovr: 76, teamId: 1, injuryWeeksRemaining: 0 },
        { id: '10', name: 'S1', pos: 'S', ovr: 78, teamId: 1, injuryWeeksRemaining: 0 },
      ],
    });

    const result = Manager.optimizeDepthChartForPlan(team as any, { mode: 'optimize' });
    expect(result.repairedAssignments.RB[0]).toBe('20');
  });

  it('findEmergencyPositionFallback prioritizes deterministic fallback order (CB -> S)', () => {
    const team = makeTeam({
      roster: [
        { id: '9', name: 'CB1', pos: 'CB', ovr: 70, teamId: 1, injuryWeeksRemaining: 0 },
        { id: '10', name: 'S1', pos: 'S', ovr: 69, teamId: 1, injuryWeeksRemaining: 0 },
      ],
    });

    const fallback = Manager.findEmergencyPositionFallback('CB', team.roster as any, {});
    expect(fallback?.id).toBe('10');
  });
});
