import { describe, expect, it } from 'vitest';
import {
  buildCapAllocationConfig,
  buildEpaChartConfig,
  buildFinancialTrendConfig,
  buildHeatmapRows,
  buildWinProbabilityChartConfig,
  normalizeAnalyticsData,
} from '../../src/ui/utils/analyticsDashboard';

const sample = normalizeAnalyticsData({
  generatedAt: Date.now(),
  teamId: 1,
  season: 2030,
  week: 5,
  epaTrend: [{ week: 1, value: 1.2 }, { week: 2, value: -0.5 }],
  winProbability: [{ week: 1, value: 0.5 }, { week: 2, value: 0.625 }],
  usageRates: [{ playerId: 1, name: 'QB One', pos: 'QB', usageRate: 34.4 }],
  playcallingHeatmap: [{ label: 'Early Downs', passPct: 58, runPct: 36, neutralPct: 6 }],
  capAllocation: { offense: 120, defense: 98, specialTeams: 8 },
  financialTrend: [{ year: 2030, capTotal: 260, capUsed: 230, capRoom: 30 }],
});

describe('analytics dashboard chart config builders', () => {
  it('builds epa and win-probability configs', () => {
    const epa = buildEpaChartConfig(sample);
    const wp = buildWinProbabilityChartConfig(sample);
    expect(epa.labels).toEqual(['W1', 'W2']);
    expect(epa.datasets[0].data).toEqual([1.2, -0.5]);
    expect(wp.datasets[0].data).toEqual([50, 62.5]);
  });

  it('builds cap + financial config and heatmap rows', () => {
    const cap = buildCapAllocationConfig(sample);
    const financial = buildFinancialTrendConfig(sample);
    const heat = buildHeatmapRows(sample);
    expect(cap.datasets[0].data).toEqual([120, 98, 8]);
    expect(financial.labels).toEqual(['2030']);
    expect(heat[0].label).toBe('Early Downs');
  });
});
