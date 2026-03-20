import React, { useRef, useEffect } from "react";

/**
 * SeasonChart — Canvas-based line chart showing team performance over the season.
 * Supports win/loss record progression, point differential trend, etc.
 *
 * Props:
 *  - data: Array of { week, value, label? } objects
 *  - title: string
 *  - color: hex color
 *  - height: number (default 160)
 *  - showArea: boolean (fill under line)
 *  - yLabel: string (y-axis label)
 *  - baseline: number (optional horizontal baseline, e.g. 0 for +/- charts)
 */

export default function SeasonChart({
  data = [],
  title = "",
  color = "#0A84FF",
  height = 160,
  showArea = true,
  yLabel = "",
  baseline,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || data.length === 0) return;

    const width = container.clientWidth;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const padding = { top: 12, right: 12, bottom: 24, left: 36 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Calculate bounds
    const values = data.map(d => d.value);
    let minVal = Math.min(...values, baseline ?? Infinity);
    let maxVal = Math.max(...values, baseline ?? -Infinity);

    // Add some padding to bounds
    const range = maxVal - minVal || 1;
    minVal -= range * 0.1;
    maxVal += range * 0.1;

    const xScale = chartW / Math.max(data.length - 1, 1);
    const yScale = chartH / (maxVal - minVal);

    const toX = (i) => padding.left + i * xScale;
    const toY = (v) => padding.top + (maxVal - v) * yScale;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Grid lines (horizontal)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Y-axis labels
      const val = maxVal - (maxVal - minVal) * (i / gridLines);
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.font = "600 9px Inter, system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(val.toFixed(val % 1 === 0 ? 0 : 1), padding.left - 6, y);
    }

    // Baseline
    if (baseline !== undefined) {
      const baseY = toY(baseline);
      ctx.beginPath();
      ctx.moveTo(padding.left, baseY);
      ctx.lineTo(width - padding.right, baseY);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Area fill
    if (showArea && data.length > 1) {
      ctx.beginPath();
      ctx.moveTo(toX(0), toY(data[0].value));
      data.forEach((d, i) => ctx.lineTo(toX(i), toY(d.value)));
      ctx.lineTo(toX(data.length - 1), padding.top + chartH);
      ctx.lineTo(toX(0), padding.top + chartH);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
      gradient.addColorStop(0, color + "30");
      gradient.addColorStop(1, color + "05");
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Line
    if (data.length > 1) {
      ctx.beginPath();
      ctx.moveTo(toX(0), toY(data[0].value));
      data.forEach((d, i) => {
        if (i === 0) return;
        ctx.lineTo(toX(i), toY(d.value));
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    }

    // Dots
    data.forEach((d, i) => {
      const x = toX(i);
      const y = toY(d.value);

      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
    });

    // X-axis labels (every few weeks)
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.font = "600 9px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const labelInterval = data.length <= 10 ? 1 : data.length <= 20 ? 2 : 3;
    data.forEach((d, i) => {
      if (i % labelInterval === 0 || i === data.length - 1) {
        ctx.fillText(d.label || `W${d.week || i + 1}`, toX(i), height - 14);
      }
    });

  }, [data, color, height, showArea, baseline]);

  if (data.length === 0) return null;

  return (
    <div className="chart-container">
      {title && <div className="chart-title">{title}</div>}
      <div ref={containerRef} style={{ width: "100%" }}>
        <canvas ref={canvasRef} />
      </div>
      {yLabel && (
        <div style={{
          textAlign: "center", fontSize: 10, color: "var(--text-subtle)",
          marginTop: "var(--space-2)",
        }}>
          {yLabel}
        </div>
      )}
    </div>
  );
}

/**
 * Builds win percentage data from a team's schedule results.
 */
export function buildWinPctData(results = []) {
  let wins = 0;
  let games = 0;
  return results.map((r, i) => {
    games++;
    if (r.won || r.result === "W") wins++;
    return {
      week: i + 1,
      value: games > 0 ? (wins / games) * 100 : 50,
      label: `W${i + 1}`,
    };
  });
}

/**
 * Builds point differential progression data.
 */
export function buildPointDiffData(results = []) {
  let cumDiff = 0;
  return results.map((r, i) => {
    const diff = (r.pointsFor || r.ptsFor || 0) - (r.pointsAgainst || r.ptsAgainst || 0);
    cumDiff += diff;
    return {
      week: i + 1,
      value: cumDiff,
      label: `W${i + 1}`,
    };
  });
}
