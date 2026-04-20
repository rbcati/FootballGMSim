import React, { useRef, useEffect } from "react";

/**
 * PlayerRadarChart — Canvas-based radar chart for player attributes.
 * Zero external dependencies — uses native Canvas API for max performance.
 *
 * Props:
 *  - attributes: Array of { label, value, max? } objects
 *  - size: number (width & height, default 220)
 *  - color: string (hex color, default accent blue)
 *  - compareAttributes: optional second dataset for comparison overlay
 *  - compareColor: string for comparison color
 */

const DEFAULTS = {
  size: 220,
  color: "#0A84FF",
  compareColor: "#FF9F0A",
  maxValue: 99,
  rings: 4,
  bgColor: "rgba(255, 255, 255, 0.03)",
  gridColor: "rgba(255, 255, 255, 0.08)",
  labelColor: "#9FB0C2",
  fontSize: 10,
};

export default function PlayerRadarChart({
  attributes = [],
  size = DEFAULTS.size,
  color = DEFAULTS.color,
  compareAttributes,
  compareColor = DEFAULTS.compareColor,
  className = "",
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || attributes.length < 3) return;

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const radius = (size / 2) - 30; // Leave room for labels
    const count = attributes.length;
    const angleStep = (Math.PI * 2) / count;
    const startAngle = -Math.PI / 2; // Start from top

    // Clear
    ctx.clearRect(0, 0, size, size);

    // Draw background rings
    for (let ring = 1; ring <= DEFAULTS.rings; ring++) {
      const r = (radius * ring) / DEFAULTS.rings;
      ctx.beginPath();
      for (let i = 0; i <= count; i++) {
        const angle = startAngle + i * angleStep;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = DEFAULTS.gridColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (ring === DEFAULTS.rings) {
        ctx.fillStyle = DEFAULTS.bgColor;
        ctx.fill();
      }
    }

    // Draw spokes
    for (let i = 0; i < count; i++) {
      const angle = startAngle + i * angleStep;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.strokeStyle = DEFAULTS.gridColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw data polygon helper
    const drawDataPolygon = (attrs, fillColor, strokeColor, fillAlpha) => {
      ctx.beginPath();
      attrs.forEach((attr, i) => {
        const maxVal = attr.max || DEFAULTS.maxValue;
        const val = Math.min(attr.value, maxVal);
        const pct = val / maxVal;
        const angle = startAngle + i * angleStep;
        const r = radius * pct;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();

      // Fill
      ctx.globalAlpha = fillAlpha;
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Stroke
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Dots at vertices
      attrs.forEach((attr, i) => {
        const maxVal = attr.max || DEFAULTS.maxValue;
        const val = Math.min(attr.value, maxVal);
        const pct = val / maxVal;
        const angle = startAngle + i * angleStep;
        const r = radius * pct;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = strokeColor;
        ctx.fill();
      });
    };

    // Draw comparison data first (underneath)
    if (compareAttributes && compareAttributes.length === count) {
      drawDataPolygon(compareAttributes, compareColor, compareColor, 0.1);
    }

    // Draw primary data
    drawDataPolygon(attributes, color, color, 0.2);

    // Draw labels
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${DEFAULTS.fontSize}px Inter, system-ui, sans-serif`;

    attributes.forEach((attr, i) => {
      const angle = startAngle + i * angleStep;
      const labelRadius = radius + 18;
      const x = cx + Math.cos(angle) * labelRadius;
      const y = cy + Math.sin(angle) * labelRadius;

      // Label text
      ctx.fillStyle = DEFAULTS.labelColor;
      ctx.fillText(attr.label, x, y - 6);

      // Value below label
      const valColor = attr.value >= 85 ? "#FFD700" :
                        attr.value >= 75 ? "#34C759" :
                        attr.value >= 60 ? "#0A84FF" :
                        attr.value >= 50 ? "#FF9F0A" : "#FF453A";
      ctx.fillStyle = valColor;
      ctx.fillText(String(Math.round(attr.value)), x, y + 6);
    });

  }, [attributes, compareAttributes, size, color, compareColor]);

  if (attributes.length < 3) {
    return <div style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>Not enough data</div>;
  }

  return (
    <div className={`chart-container ${className}`} style={{ display: "flex", justifyContent: "center", padding: "var(--space-3)" }}>
      <canvas
        ref={canvasRef}
        style={{ maxWidth: "100%", height: "auto" }}
      />
    </div>
  );
}

/**
 * Returns radar chart attributes for a player based on position.
 * Maps internal player stats to display-friendly labels.
 */
export function getPlayerRadarAttributes(player) {
  if (!player) return [];

  const pos = player.position || player.pos;
  const stats = player.stats || player;

  const safeGet = (key, fallback = 50) => {
    const val = stats[key] ?? player[key] ?? fallback;
    return Math.min(99, Math.max(1, Number(val) || fallback));
  };

  switch (pos) {
    case "QB":
      return [
        { label: "ARM", value: safeGet("throwPower") },
        { label: "ACC", value: safeGet("throwAccuracy") },
        { label: "AWR", value: safeGet("awareness") },
        { label: "SPD", value: safeGet("speed") },
        { label: "AGI", value: safeGet("agility") },
        { label: "IQ", value: safeGet("intelligence") },
      ];
    case "RB":
      return [
        { label: "SPD", value: safeGet("speed") },
        { label: "AGI", value: safeGet("agility") },
        { label: "TRK", value: safeGet("trucking") },
        { label: "JUK", value: safeGet("juking") },
        { label: "CTH", value: safeGet("catching") },
        { label: "ACC", value: safeGet("acceleration") },
      ];
    case "WR":
      return [
        { label: "SPD", value: safeGet("speed") },
        { label: "CTH", value: safeGet("catching") },
        { label: "CIT", value: safeGet("catchInTraffic") },
        { label: "AGI", value: safeGet("agility") },
        { label: "AWR", value: safeGet("awareness") },
        { label: "ACC", value: safeGet("acceleration") },
      ];
    case "TE":
      return [
        { label: "CTH", value: safeGet("catching") },
        { label: "RBK", value: safeGet("runBlock") },
        { label: "PBK", value: safeGet("passBlock") },
        { label: "SPD", value: safeGet("speed") },
        { label: "AGI", value: safeGet("agility") },
        { label: "AWR", value: safeGet("awareness") },
      ];
    case "OL":
      return [
        { label: "PBK", value: safeGet("passBlock") },
        { label: "RBK", value: safeGet("runBlock") },
        { label: "AWR", value: safeGet("awareness") },
        { label: "STR", value: safeGet("strength", safeGet("weight", 70)) },
        { label: "IQ", value: safeGet("intelligence") },
      ];
    case "DL":
      return [
        { label: "PRS", value: safeGet("passRushSpeed") },
        { label: "PRP", value: safeGet("passRushPower") },
        { label: "RST", value: safeGet("runStop") },
        { label: "SPD", value: safeGet("speed") },
        { label: "AWR", value: safeGet("awareness") },
      ];
    case "LB":
      return [
        { label: "COV", value: safeGet("coverage") },
        { label: "RST", value: safeGet("runStop") },
        { label: "PRS", value: safeGet("passRushSpeed") },
        { label: "SPD", value: safeGet("speed") },
        { label: "AWR", value: safeGet("awareness") },
      ];
    case "CB":
      return [
        { label: "COV", value: safeGet("coverage") },
        { label: "SPD", value: safeGet("speed") },
        { label: "AWR", value: safeGet("awareness") },
        { label: "AGI", value: safeGet("agility") },
        { label: "ACC", value: safeGet("acceleration") },
      ];
    case "S":
      return [
        { label: "COV", value: safeGet("coverage") },
        { label: "RST", value: safeGet("runStop") },
        { label: "SPD", value: safeGet("speed") },
        { label: "AWR", value: safeGet("awareness") },
        { label: "AGI", value: safeGet("agility") },
      ];
    case "K":
    case "P":
      return [
        { label: "POW", value: safeGet("kickPower") },
        { label: "ACC", value: safeGet("kickAccuracy") },
        { label: "AWR", value: safeGet("awareness") },
      ];
    default:
      return [
        { label: "OVR", value: safeGet("ovr") },
        { label: "SPD", value: safeGet("speed") },
        { label: "AWR", value: safeGet("awareness") },
      ];
  }
}
