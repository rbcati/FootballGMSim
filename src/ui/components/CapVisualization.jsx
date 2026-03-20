import React, { useMemo } from "react";

/**
 * CapVisualization — Salary cap breakdown with animated donut chart
 * and positional spending bars. Pure CSS + SVG, no external deps.
 *
 * Props:
 *  - team: { capTotal, capUsed, capRoom, roster/players }
 *  - players: Array of player objects with position and contract info
 *  - compact: boolean for minimal view
 */

const POSITION_GROUPS = [
  { key: "QB", label: "QB", color: "#ef4444" },
  { key: "RB", label: "RB", color: "#22c55e" },
  { key: "WR", label: "WR", color: "#3b82f6" },
  { key: "TE", label: "TE", color: "#a855f7" },
  { key: "OL", label: "OL", color: "#f59e0b" },
  { key: "DL", label: "DL", color: "#ec4899" },
  { key: "LB", label: "LB", color: "#0ea5e9" },
  { key: "CB", label: "CB", color: "#14b8a6" },
  { key: "S", label: "S", color: "#6366f1" },
  { key: "K", label: "K", color: "#9ca3af" },
  { key: "P", label: "P", color: "#6b7280" },
];

export default function CapVisualization({ team, players = [], compact = false }) {
  const capTotal = team?.capTotal || 301.2;
  const capUsed = team?.capUsed || 0;
  const capRoom = capTotal - capUsed;
  const capPct = Math.min(100, (capUsed / capTotal) * 100);

  const posBreakdown = useMemo(() => {
    const breakdown = {};
    POSITION_GROUPS.forEach(g => { breakdown[g.key] = 0; });

    (players || []).forEach(p => {
      const pos = p.position || p.pos;
      const salary = p.contract?.baseAnnual || p.salary || 0;
      if (breakdown[pos] !== undefined) {
        breakdown[pos] += salary;
      }
    });

    return POSITION_GROUPS.map(g => ({
      ...g,
      value: Math.round(breakdown[g.key] * 100) / 100,
      pct: capTotal > 0 ? (breakdown[g.key] / capTotal) * 100 : 0,
    })).filter(g => g.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [players, capTotal]);

  // SVG donut chart parameters
  const donutSize = compact ? 100 : 140;
  const strokeWidth = compact ? 10 : 14;
  const r = (donutSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const usedStroke = circumference * (capPct / 100);
  const freeStroke = circumference - usedStroke;

  const capColor = capRoom < 0 ? "var(--danger)" :
                   capPct > 90 ? "var(--warning)" :
                   capPct > 75 ? "var(--accent)" : "var(--success)";

  return (
    <div className="card-premium" style={{ padding: compact ? "var(--space-4)" : "var(--space-6)" }}>
      <div style={{
        display: "flex",
        flexDirection: compact ? "row" : "column",
        alignItems: "center",
        gap: compact ? "var(--space-4)" : "var(--space-5)",
      }}>
        {/* Donut chart */}
        <div style={{ position: "relative", width: donutSize, height: donutSize, flexShrink: 0 }}>
          <svg width={donutSize} height={donutSize} style={{ transform: "rotate(-90deg)" }}>
            {/* Background ring */}
            <circle
              cx={donutSize / 2} cy={donutSize / 2} r={r}
              fill="none" stroke="var(--hairline)"
              strokeWidth={strokeWidth}
            />
            {/* Used cap arc */}
            <circle
              cx={donutSize / 2} cy={donutSize / 2} r={r}
              fill="none" stroke={capColor}
              strokeWidth={strokeWidth}
              strokeDasharray={`${usedStroke} ${freeStroke}`}
              strokeLinecap="round"
              style={{
                transition: "stroke-dasharray 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)",
              }}
            />
          </svg>
          {/* Center text */}
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              fontSize: compact ? "var(--text-lg)" : "var(--text-xl)",
              fontWeight: 900, color: capColor,
              lineHeight: 1, letterSpacing: "-0.5px",
            }}>
              {Math.round(capPct)}%
            </div>
            <div style={{
              fontSize: "var(--text-xs)", color: "var(--text-muted)",
              marginTop: 2,
            }}>
              used
            </div>
          </div>
        </div>

        {/* Cap summary */}
        <div style={{ flex: 1, width: "100%", minWidth: 0 }}>
          {!compact && (
            <div style={{ marginBottom: "var(--space-4)" }}>
              <div style={{
                fontSize: "var(--text-sm)", fontWeight: 700,
                color: "var(--text)", marginBottom: "var(--space-2)",
                textTransform: "uppercase", letterSpacing: "0.5px",
              }}>
                Salary Cap
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                gap: "var(--space-3)",
              }}>
                <CapStat label="Total" value={`$${formatMoney(capTotal)}M`} />
                <CapStat label="Used" value={`$${formatMoney(capUsed)}M`} color={capColor} />
                <CapStat label="Room" value={`$${formatMoney(Math.abs(capRoom))}M`}
                  color={capRoom < 0 ? "var(--danger)" : "var(--success)"}
                  prefix={capRoom < 0 ? "-" : ""}
                />
              </div>
            </div>
          )}

          {/* Compact summary */}
          {compact && (
            <div>
              <div style={{ fontWeight: 800, fontSize: "var(--text-base)", color: "var(--text)" }}>
                ${formatMoney(capRoom)}M
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                cap room
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Positional spending breakdown */}
      {!compact && posBreakdown.length > 0 && (
        <div style={{ marginTop: "var(--space-5)" }}>
          <div style={{
            fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--text-muted)",
            textTransform: "uppercase", letterSpacing: "0.5px",
            marginBottom: "var(--space-3)",
          }}>
            Spending by Position
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {posBreakdown.map(group => (
              <div key={group.key} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <span style={{
                  width: 28, fontSize: 11, fontWeight: 800,
                  color: group.color, textAlign: "right",
                }}>
                  {group.label}
                </span>
                <div style={{
                  flex: 1, height: 6, borderRadius: 3,
                  background: "var(--hairline)",
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%", borderRadius: 3,
                    background: group.color,
                    width: `${Math.min(100, group.pct * (100 / Math.max(...posBreakdown.map(g => g.pct), 1)))}%`,
                    transition: "width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)",
                  }} />
                </div>
                <span style={{
                  width: 52, fontSize: 11, fontWeight: 700,
                  color: "var(--text-muted)", textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  ${formatMoney(group.value)}M
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CapStat({ label, value, color = "var(--text)", prefix = "" }) {
  return (
    <div style={{
      background: "var(--bg)", borderRadius: "var(--radius-md)",
      padding: "var(--space-2) var(--space-3)",
      textAlign: "center",
    }}>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{
        fontSize: "var(--text-sm)", fontWeight: 800, color,
        fontVariantNumeric: "tabular-nums",
      }}>
        {prefix}{value}
      </div>
    </div>
  );
}

function formatMoney(val) {
  return Math.abs(val).toFixed(1);
}
