import type { AnalyticsData, ChartConfig, HeatmapRow } from '../../types/analytics';

const FALLBACK_DATA: AnalyticsData = {
  generatedAt: 0,
  teamId: 0,
  season: 0,
  week: 1,
  epaTrend: [],
  winProbability: [],
  usageRates: [],
  playcallingHeatmap: [],
  capAllocation: { offense: 0, defense: 0, specialTeams: 0 },
  financialTrend: [],
};

export function normalizeAnalyticsData(input: Partial<AnalyticsData> | null | undefined): AnalyticsData {
  return {
    ...FALLBACK_DATA,
    ...(input ?? {}),
    epaTrend: Array.isArray(input?.epaTrend) ? input.epaTrend : [],
    winProbability: Array.isArray(input?.winProbability) ? input.winProbability : [],
    usageRates: Array.isArray(input?.usageRates) ? input.usageRates : [],
    playcallingHeatmap: Array.isArray(input?.playcallingHeatmap) ? input.playcallingHeatmap : [],
    financialTrend: Array.isArray(input?.financialTrend) ? input.financialTrend : [],
    capAllocation: {
      offense: Number(input?.capAllocation?.offense ?? 0),
      defense: Number(input?.capAllocation?.defense ?? 0),
      specialTeams: Number(input?.capAllocation?.specialTeams ?? 0),
    },
  };
}

export function buildEpaChartConfig(data: AnalyticsData): ChartConfig {
  return {
    labels: data.epaTrend.map((point) => `W${point.week ?? 0}`),
    datasets: [{
      label: 'EPA / game',
      data: data.epaTrend.map((point) => Number(point.value ?? 0)),
      borderColor: '#0A84FF',
      backgroundColor: 'rgba(10,132,255,0.22)',
      fill: true,
      tension: 0.3,
    }],
  };
}

export function buildWinProbabilityChartConfig(data: AnalyticsData): ChartConfig {
  return {
    labels: data.winProbability.map((point) => `W${point.week ?? 0}`),
    datasets: [{
      label: 'Win probability',
      data: data.winProbability.map((point) => Number(point.value ?? 0) * 100),
      borderColor: '#34C759',
      backgroundColor: 'rgba(52,199,89,0.2)',
      fill: true,
      tension: 0.25,
    }],
  };
}

export function buildCapAllocationConfig(data: AnalyticsData): ChartConfig {
  return {
    labels: ['Offense', 'Defense', 'Special Teams'],
    datasets: [{
      label: 'Cap allocation ($M)',
      data: [
        Number(data.capAllocation.offense ?? 0),
        Number(data.capAllocation.defense ?? 0),
        Number(data.capAllocation.specialTeams ?? 0),
      ],
      backgroundColor: ['#0A84FF', '#FF9F0A', '#5E5CE6'],
    }],
  };
}

export function buildFinancialTrendConfig(data: AnalyticsData): ChartConfig {
  return {
    labels: data.financialTrend.map((point) => `${point.year ?? ''}`),
    datasets: [
      {
        label: 'Cap total',
        data: data.financialTrend.map((point) => Number(point.capTotal ?? 0)),
        borderColor: '#64D2FF',
        backgroundColor: 'rgba(100,210,255,0.16)',
        fill: false,
      },
      {
        label: 'Cap used',
        data: data.financialTrend.map((point) => Number(point.capUsed ?? 0)),
        borderColor: '#FF453A',
        backgroundColor: 'rgba(255,69,58,0.2)',
        fill: false,
      },
    ],
  };
}

export function buildHeatmapRows(data: AnalyticsData): HeatmapRow[] {
  return data.playcallingHeatmap.map((row) => ({
    label: row.label,
    passPct: Number(row.passPct ?? 0),
    runPct: Number(row.runPct ?? 0),
    neutralPct: Number(row.neutralPct ?? 0),
  }));
}
