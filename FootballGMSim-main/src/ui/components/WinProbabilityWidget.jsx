import React, { useRef, useEffect } from "react";

/**
 * WinProbabilityWidget — Real-time win probability chart for live games.
 * Renders a smooth probability curve as plays happen.
 *
 * Props:
 *  - events: Array of { play, homeWinProb, quarter, time } objects
 *  - homeTeam: { abbr, color }
 *  - awayTeam: { abbr, color }
 *  - height: number (default 120)
 */

export default function WinProbabilityWidget({
  events = [],
  homeTeam = { abbr: "HOME" },
  awayTeam = { abbr: "AWAY" },
  homeColor = "#0A84FF",
  awayColor = "#FF453A",
  height = 120,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const pad = { top: 8, right: 8, bottom: 20, left: 8 };
    const cW = width - pad.left - pad.right;
    const cH = height - pad.top - pad.bottom;
    const midY = pad.top + cH / 2;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
    ctx.fillRect(pad.left, pad.top, cW, cH);

    // 50% line
    ctx.beginPath();
    ctx.moveTo(pad.left, midY);
    ctx.lineTo(pad.left + cW, midY);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    // 50% label
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.font = "600 8px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("50%", pad.left + cW / 2, midY - 4);

    if (events.length === 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.font = "600 11px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Waiting for plays...", width / 2, height / 2);
      return;
    }

    // Map probabilities to canvas
    const xStep = cW / Math.max(events.length - 1, 1);
    const toX = (i) => pad.left + i * xStep;
    const toY = (prob) => pad.top + (1 - prob) * cH; // prob 1.0 = top, 0 = bottom

    // Home area fill
    ctx.beginPath();
    ctx.moveTo(toX(0), midY);
    events.forEach((e, i) => {
      const prob = e.homeWinProb ?? 0.5;
      ctx.lineTo(toX(i), toY(prob));
    });
    ctx.lineTo(toX(events.length - 1), midY);
    ctx.closePath();

    const homeGradient = ctx.createLinearGradient(0, pad.top, 0, midY);
    homeGradient.addColorStop(0, homeColor + "40");
    homeGradient.addColorStop(1, homeColor + "05");
    ctx.fillStyle = homeGradient;
    ctx.fill();

    // Away area fill (below 50%)
    ctx.beginPath();
    ctx.moveTo(toX(0), midY);
    events.forEach((e, i) => {
      const prob = e.homeWinProb ?? 0.5;
      ctx.lineTo(toX(i), toY(prob));
    });
    ctx.lineTo(toX(events.length - 1), midY);
    ctx.closePath();

    const awayGradient = ctx.createLinearGradient(0, midY, 0, pad.top + cH);
    awayGradient.addColorStop(0, awayColor + "05");
    awayGradient.addColorStop(1, awayColor + "40");
    ctx.fillStyle = awayGradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    events.forEach((e, i) => {
      const prob = e.homeWinProb ?? 0.5;
      if (i === 0) ctx.moveTo(toX(i), toY(prob));
      else ctx.lineTo(toX(i), toY(prob));
    });
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    // Current point (last event)
    const lastEvent = events[events.length - 1];
    const lastProb = lastEvent.homeWinProb ?? 0.5;
    const lastX = toX(events.length - 1);
    const lastY = toY(lastProb);

    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = lastProb > 0.5 ? homeColor : awayColor;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    // Team labels
    ctx.font = "800 9px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = homeColor;
    ctx.fillText(homeTeam.abbr, pad.left + 4, pad.top + 12);
    ctx.fillStyle = awayColor;
    ctx.fillText(awayTeam.abbr, pad.left + 4, pad.top + cH - 4);

    // Quarter markers
    if (events.length > 10) {
      ctx.font = "600 8px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      const quarters = [0.25, 0.5, 0.75];
      quarters.forEach((q, qi) => {
        const x = pad.left + cW * q;
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, pad.top + cH);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillText(`Q${qi + 2}`, x, pad.top + cH + 12);
      });
      ctx.fillText("Q1", pad.left, pad.top + cH + 12);
      ctx.fillText("END", pad.left + cW, pad.top + cH + 12);
    }

  }, [events, homeTeam, awayTeam, homeColor, awayColor, height]);

  const lastProb = events.length > 0 ? (events[events.length - 1].homeWinProb ?? 0.5) : 0.5;
  const homePct = Math.round(lastProb * 100);

  return (
    <div className="chart-container" style={{ padding: "var(--space-3)" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: "var(--space-2)", padding: "0 var(--space-1)",
      }}>
        <span style={{
          fontSize: "var(--text-xs)", fontWeight: 700,
          color: "var(--text-muted)", textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}>
          Win Probability
        </span>
        <span style={{
          fontSize: "var(--text-xs)", fontWeight: 800,
          color: homePct >= 50 ? homeColor : awayColor,
        }}>
          {homePct >= 50 ? homeTeam.abbr : awayTeam.abbr} {Math.max(homePct, 100 - homePct)}%
        </span>
      </div>
      <div ref={containerRef} style={{ width: "100%" }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
