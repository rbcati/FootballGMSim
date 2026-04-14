import React, { useEffect, useMemo, useState } from 'react';
import { Line, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import {
  buildCapAllocationConfig,
  buildEpaChartConfig,
  buildFinancialTrendConfig,
  buildHeatmapRows,
  buildWinProbabilityChartConfig,
  normalizeAnalyticsData,
} from '../utils/analyticsDashboard.ts';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend);

const ABBR_HELP = {
  EPA: 'Expected Points Added. Positive values indicate efficient, drive-sustaining play.',
  WP: 'Win Probability. This estimates your in-season chance to win based on record trajectory.',
  USG: 'Usage Rate. Share of team touches/targets/attempts handled by a player.',
};

function Hint({ abbr }) {
  return (
    <abbr title={ABBR_HELP[abbr]} style={{ textDecoration: 'underline dotted', cursor: 'help' }}>
      {abbr}
    </abbr>
  );
}

export default function AnalyticsDashboard({ league, actions }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!actions?.getAnalyticsDashboard) return undefined;
    setLoading(true);
    actions.getAnalyticsDashboard()
      .then((res) => {
        if (!cancelled) setAnalytics(normalizeAnalyticsData(res?.payload?.analytics));
      })
      .catch(() => {
        if (!cancelled) setAnalytics(normalizeAnalyticsData(null));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [actions, league?.week, league?.seasonId]);

  const data = useMemo(() => normalizeAnalyticsData(analytics), [analytics]);
  const epaConfig = useMemo(() => buildEpaChartConfig(data), [data]);
  const wpConfig = useMemo(() => buildWinProbabilityChartConfig(data), [data]);
  const capConfig = useMemo(() => buildCapAllocationConfig(data), [data]);
  const financialConfig = useMemo(() => buildFinancialTrendConfig(data), [data]);
  const heatmapRows = useMemo(() => buildHeatmapRows(data), [data]);

  if (loading) return <div className="card" style={{ padding: 16 }}>Loading dashboard analytics…</div>;

  return (
    <div style={{ display: 'grid', gap: 12 }} aria-label="Analytics dashboard">
      <section className="card" style={{ padding: 12 }}>
        <h3 style={{ marginTop: 0, marginBottom: 6 }}>Expected Points & Win Projection</h3>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          Tracks weekly <Hint abbr="EPA" /> and <Hint abbr="WP" /> for your team.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 10 }}>
          <Line data={epaConfig} options={{ responsive: true, plugins: { legend: { display: false }, tooltip: { enabled: true } } }} aria-label="EPA trend chart" />
          <Line data={wpConfig} options={{ responsive: true, plugins: { legend: { display: false }, tooltip: { enabled: true } }, scales: { y: { suggestedMin: 0, suggestedMax: 100 } } }} aria-label="Win probability chart" />
        </div>
      </section>

      <section className="card" style={{ padding: 12 }}>
        <h3 style={{ marginTop: 0, marginBottom: 6 }}>Player Usage & Playcalling Tendencies</h3>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          <Hint abbr="USG" /> is normalized among your top 8 touched players.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
          <div style={{ maxHeight: 220, overflow: 'auto' }}>
            {data.usageRates.map((entry) => (
              <div key={entry.playerId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--hairline)' }}>
                <span>{entry.name} ({entry.pos})</span>
                <span title="Usage share">{entry.usageRate.toFixed(1)}%</span>
              </div>
            ))}
            {data.usageRates.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No usage data yet.</div> : null}
          </div>
          <div role="table" aria-label="Playcalling heat map" style={{ display: 'grid', gap: 4 }}>
            {heatmapRows.map((row) => (
              <div key={row.label} style={{ border: '1px solid var(--hairline)', borderRadius: 6, padding: 8 }}>
                <strong style={{ fontSize: 12 }}>{row.label}</strong>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginTop: 4, fontSize: 11 }}>
                  <span title="Pass tendency">Pass {row.passPct}%</span>
                  <span title="Run tendency">Run {row.runPct}%</span>
                  <span title="Balanced or misc calls">Other {row.neutralPct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card" style={{ padding: 12 }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Cap Allocation & Financial Trend</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(210px,1fr) 2fr', gap: 10 }}>
          <Pie data={capConfig} options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }} aria-label="Salary cap allocation chart" />
          <Line data={financialConfig} options={{ responsive: true, plugins: { tooltip: { enabled: true } } }} aria-label="Financial trend chart" />
        </div>
      </section>
    </div>
  );
}
