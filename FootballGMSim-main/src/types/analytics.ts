export interface AnalyticsPoint {
  week?: number;
  year?: number;
  value?: number;
  capTotal?: number;
  capUsed?: number;
  capRoom?: number;
}

export interface UsageRate {
  playerId: number | string;
  name: string;
  pos: string;
  usageRate: number;
}

export interface HeatmapRow {
  label: string;
  passPct: number;
  runPct: number;
  neutralPct: number;
}

export interface AnalyticsData {
  generatedAt: number;
  teamId: number;
  season: number;
  week: number;
  epaTrend: AnalyticsPoint[];
  winProbability: AnalyticsPoint[];
  usageRates: UsageRate[];
  playcallingHeatmap: HeatmapRow[];
  capAllocation: {
    offense: number;
    defense: number;
    specialTeams: number;
  };
  financialTrend: AnalyticsPoint[];
}

export interface ChartConfig {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string | string[];
    fill?: boolean;
    tension?: number;
  }>;
}
