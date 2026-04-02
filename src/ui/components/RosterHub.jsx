/**
 * RosterHub.jsx — Premium roster grid with search, filter, sort.
 * Uses stadium-theme glassmorphism cards, position badges, animated progress bars.
 * Replaces the simpler Roster tab with a full GM command center.
 *
 * Props:
 *  - league: league view-model from worker
 *  - actions: worker action dispatchers
 *  - onPlayerSelect: (playerId) => void
 *  - teamId: optional override (defaults to userTeamId)
 */

import React, { useState, useMemo, useCallback } from "react";
import { OvrPill } from "./LeagueDashboard.jsx";
import PlayerCardGrid from "./PlayerCardGrid.jsx";
import DragAndDropDepthChart from "./DragAndDropDepthChart.jsx";

// ── Position color map (matches stadium-theme.css pos-badge classes) ──
const POS_COLORS = {
  QB: "#ef4444", RB: "#22c55e", WR: "#3b82f6", TE: "#a855f7",
  OL: "#f59e0b", DL: "#ec4899", LB: "#0ea5e9", CB: "#14b8a6",
  S: "#6366f1", K: "#9ca3af", P: "#6b7280",
};

const POSITION_GROUPS = [
  { label: "ALL", positions: null },
  { label: "OFF", positions: ["QB", "RB", "WR", "TE", "OL"] },
  { label: "DEF", positions: ["DL", "LB", "CB", "S"] },
  { label: "ST", positions: ["K", "P"] },
  { label: "QB", positions: ["QB"] },
  { label: "RB", positions: ["RB"] },
  { label: "WR", positions: ["WR"] },
  { label: "TE", positions: ["TE"] },
  { label: "OL", positions: ["OL"] },
  { label: "DL", positions: ["DL"] },
  { label: "LB", positions: ["LB"] },
  { label: "CB", positions: ["CB"] },
  { label: "S", positions: ["S"] },
];

const SORT_OPTIONS = [
  { key: "ovr", label: "OVR", desc: true },
  { key: "age", label: "Age", desc: false },
  { key: "salary", label: "Salary", desc: true },
  { key: "name", label: "Name", desc: false },
  { key: "potential", label: "POT", desc: true },
];

function getDevTraitBadge(trait) {
  switch (trait) {
    case "X-Factor": return { label: "X", color: "#FFD700", bg: "rgba(255,215,0,0.15)" };
    case "Superstar": return { label: "SS", color: "#a855f7", bg: "rgba(168,85,247,0.15)" };
    case "Star": return { label: "S", color: "#3b82f6", bg: "rgba(59,130,246,0.15)" };
    default: return null;
  }
}

function ProgressBar({ value, max = 99, color, height = 4, animated = true }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{
      width: "100%", height, borderRadius: height,
      background: "var(--hairline)", overflow: "hidden",
    }}>
      <div style={{
        height: "100%", borderRadius: height,
        background: color || (pct >= 85 ? "#FFD700" : pct >= 70 ? "var(--success)" : pct >= 55 ? "var(--accent)" : "var(--warning)"),
        width: `${pct}%`,
        transition: animated ? "width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)" : "none",
      }} />
    </div>
  );
}

// Compute scheme fit 0–100 from player ratings vs. scheme demands
function computeSchemeFit(player, schemeName = "") {
  if (!schemeName) return null;
  const r = player.ratings || player.attrs || {};
  const pos = player.pos || player.position || "";
  const s = schemeName.toLowerCase();

  let score = 70; // baseline
  if (pos === "QB") {
    if (s.includes("air_raid") || s.includes("spread")) {
      score += (r.arm || r.throwPower || 70) * 0.15 + (r.acc || r.throwAccuracy || 70) * 0.15 - 70 * 0.3;
    } else if (s.includes("smash") || s.includes("pro")) {
      score += (r.mob || r.speed || 60) * (-0.05) + (r.arm || 70) * 0.1;
    }
  } else if (pos === "RB") {
    if (s.includes("smash") || s.includes("power")) {
      score += (r.pow || r.strength || 70) * 0.2 - 70 * 0.2;
    } else if (s.includes("spread") || s.includes("west")) {
      score += (r.spd || r.speed || 70) * 0.15 + (r.ctch || 70) * 0.1 - 70 * 0.25;
    }
  } else if (pos === "WR" || pos === "TE") {
    if (s.includes("air_raid")) {
      score += (r.spd || 70) * 0.15 + (r.ctch || r.catching || 70) * 0.15 - 70 * 0.3;
    }
  }

  // Scheme fit bonus from schemeFit field if worker already computed it
  if (player.schemeFit != null) return Math.round(player.schemeFit);
  return Math.min(99, Math.max(40, Math.round(score)));
}

function schemeFitColor(fit) {
  if (fit == null) return "var(--text-subtle)";
  if (fit >= 80) return "#34C759";
  if (fit >= 65) return "#FF9F0A";
  return "#FF453A";
}

function PlayerRow({ player, isUser, onSelect, schemeName }) {
  const devBadge = getDevTraitBadge(player.devTrait);
  const pos = player.pos || player.position;
  const posColor = POS_COLORS[pos] || "#9ca3af";
  const salary = player.baseAnnual || player.contract?.baseAnnual || 0;
  const yearsLeft = player.years ?? player.contract?.years ?? 0;
  const isInjured = (player.injuryWeeksRemaining || 0) > 0;
  const isExpiring = yearsLeft <= 1;
  const fit = computeSchemeFit(player, schemeName);
  const fitColor = schemeFitColor(fit);

  return (
    <div
      className="card-premium hover-lift fade-in"
      onClick={() => onSelect?.(player.id)}
      style={{
        padding: "var(--space-3) var(--space-4)",
        cursor: "pointer",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto auto",
        alignItems: "center",
        gap: "var(--space-3)",
        borderLeft: `3px solid ${posColor}`,
        marginBottom: "var(--space-2)",
        minHeight: 56,
      }}
    >
      {/* Position badge + OVR */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <span className={`pos-badge pos-${pos?.toLowerCase()}`}>{pos}</span>
        <OvrPill ovr={player.ovr || player.displayOvr || 50} />
      </div>

      {/* Name + meta */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "var(--space-2)",
          fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {player.name}
          {devBadge && (
            <span style={{
              fontSize: 9, fontWeight: 900, padding: "1px 4px",
              borderRadius: "var(--radius-sm)", background: devBadge.bg,
              color: devBadge.color, letterSpacing: "0.3px",
            }}>
              {devBadge.label}
            </span>
          )}
          {isInjured && (
            <span style={{ fontSize: 10, color: "var(--danger)" }} title={`Out ${player.injuryWeeksRemaining}w`}>
              INJ
            </span>
          )}
          {isExpiring && !isInjured && (
            <span style={{ fontSize: 10, color: "var(--warning)" }} title="Contract expiring">
              EXP
            </span>
          )}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: "var(--space-3)",
          fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2,
        }}>
          <span>Age {player.age}</span>
          <span style={{ width: 1, height: 10, background: "var(--hairline)" }} />
          <span>{player.college || "—"}</span>
          {player.personality?.traits?.length > 0 && (
            <>
              <span style={{ width: 1, height: 10, background: "var(--hairline)" }} />
              <span style={{ color: "var(--accent)" }}>{player.personality.traits[0]}</span>
            </>
          )}
        </div>
        {/* Mini progress bar showing OVR vs Potential */}
        {player.potential && player.potential > (player.ovr || 0) && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: 4, maxWidth: 120 }}>
            <ProgressBar value={player.ovr || 50} max={player.potential} color={posColor} height={3} />
            <span style={{ fontSize: 9, color: "var(--text-subtle)", fontWeight: 600 }}>
              {player.potential}
            </span>
          </div>
        )}
      </div>

      {/* Scheme fit + Contract */}
      <div style={{ textAlign: "right", minWidth: 70 }}>
        {fit != null && (
          <div style={{
            fontSize: "0.65rem", fontWeight: 800, color: fitColor,
            background: `${fitColor}18`, border: `1px solid ${fitColor}40`,
            borderRadius: 4, padding: "1px 5px", marginBottom: 3,
            display: "inline-block",
          }}>
            FIT {fit}
          </div>
        )}
        <div style={{
          fontSize: "var(--text-sm)", fontWeight: 700,
          color: salary > 15 ? "var(--warning)" : "var(--text)",
          fontVariantNumeric: "tabular-nums",
        }}>
          ${salary.toFixed(1)}M
        </div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          {yearsLeft}yr
        </div>
      </div>

      {/* Chevron */}
      <div style={{ color: "var(--text-subtle)", fontSize: 16 }}>
        ›
      </div>
    </div>
  );
}

// ── View-mode toggle ─────────────────────────────────────────────────────────

function ViewToggle({ mode, onChange }) {
  const modes = [
    { key: "cards", label: "Cards" },
    { key: "table", label: "Table" },
    { key: "depth", label: "Depth" },
  ];
  return (
    <div style={{
      display: "flex", gap: 2,
      background: "var(--surface)", border: "1px solid var(--hairline)",
      borderRadius: "var(--radius-md)", padding: 2,
      flexShrink: 0,
    }}>
      {modes.map(m => (
        <button
          key={m.key}
          onClick={() => onChange(m.key)}
          style={{
            padding: "5px 14px",
            borderRadius: "var(--radius-sm)",
            border: "none",
            background: mode === m.key ? "var(--accent)" : "transparent",
            color: mode === m.key ? "#fff" : "var(--text-muted)",
            fontSize: "0.72rem", fontWeight: 700,
            cursor: "pointer",
            transition: "background 0.12s, color 0.12s",
            whiteSpace: "nowrap",
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export default function RosterHub({ league, actions, onPlayerSelect, teamId }) {
  const [viewMode, setViewMode] = useState("cards"); // default to cards view
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState("ovr");
  const [sortDesc, setSortDesc] = useState(true);

  const activeTeamId = teamId ?? league?.userTeamId;
  const team = league?.teams?.find(t => t.id === activeTeamId);
  const roster = team?.roster || [];
  const isUserTeam = activeTeamId === league?.userTeamId;

  const filtered = useMemo(() => {
    let players = [...roster];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      players = players.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        (p.pos || p.position || "").toLowerCase().includes(q) ||
        (p.college || "").toLowerCase().includes(q)
      );
    }

    // Position filter
    const group = POSITION_GROUPS.find(g => g.label === posFilter);
    if (group?.positions) {
      players = players.filter(p => group.positions.includes(p.pos || p.position));
    }

    // Sort
    players.sort((a, b) => {
      let va, vb;
      switch (sortKey) {
        case "ovr":
          va = a.ovr || a.displayOvr || 0;
          vb = b.ovr || b.displayOvr || 0;
          break;
        case "age":
          va = a.age || 0;
          vb = b.age || 0;
          break;
        case "salary":
          va = a.baseAnnual || a.contract?.baseAnnual || 0;
          vb = b.baseAnnual || b.contract?.baseAnnual || 0;
          break;
        case "name":
          va = (a.name || "").toLowerCase();
          vb = (b.name || "").toLowerCase();
          return sortDesc ? vb.localeCompare(va) : va.localeCompare(vb);
        case "potential":
          va = a.potential || 0;
          vb = b.potential || 0;
          break;
        default:
          va = 0; vb = 0;
      }
      return sortDesc ? vb - va : va - vb;
    });

    return players;
  }, [roster, search, posFilter, sortKey, sortDesc]);

  const handleSortToggle = useCallback((key) => {
    if (sortKey === key) {
      setSortDesc(d => !d);
    } else {
      const opt = SORT_OPTIONS.find(o => o.key === key);
      setSortKey(key);
      setSortDesc(opt?.desc ?? true);
    }
  }, [sortKey]);

  // Roster summary stats
  const rosterSize = roster.length;
  const avgOvr = rosterSize > 0 ? Math.round(roster.reduce((s, p) => s + (p.ovr || 0), 0) / rosterSize) : 0;
  const totalSalary = roster.reduce((s, p) => s + (p.baseAnnual || p.contract?.baseAnnual || 0), 0);
  const injuredCount = roster.filter(p => (p.injuryWeeksRemaining || 0) > 0).length;
  const schemeName = team?.strategies?.offScheme || team?.strategies?.offPlanId || "";
  const avgFit = rosterSize > 0
    ? Math.round(roster.reduce((s, p) => s + computeSchemeFit(p, schemeName), 0) / rosterSize)
    : null;

  return (
    <div className="fade-in">
      {/* ── Scheme banner ── */}
      {schemeName && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "var(--surface)",
          border: "1.5px solid var(--hairline)",
          borderRadius: 10, padding: "8px 14px", marginBottom: 12,
        }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)" }}>
            🗂️ Scheme: <span style={{ color: "var(--text)", fontWeight: 800 }}>{schemeName.replace(/_/g, " ").toUpperCase()}</span>
          </div>
          {avgFit != null && (
            <div style={{
              fontSize: "0.72rem", fontWeight: 800,
              color: schemeFitColor(avgFit),
            }}>
              Avg Fit: {avgFit}%
            </div>
          )}
        </div>
      )}

      {/* ── Header Stats + View Toggle ── */}
      <div style={{
        display: "flex", alignItems: "flex-start",
        gap: "var(--space-3)", marginBottom: "var(--space-4)",
        flexWrap: "wrap",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
          gap: "var(--space-2)",
          flex: 1, minWidth: 0,
        }}>
          <StatCard label="Players" value={rosterSize} sub="/53" />
          <StatCard label="Avg OVR" value={avgOvr} color={avgOvr >= 78 ? "var(--success)" : avgOvr >= 68 ? "var(--accent)" : "var(--warning)"} />
          <StatCard label="Payroll" value={`$${totalSalary.toFixed(1)}M`} />
          <StatCard label="Injured" value={injuredCount} color={injuredCount > 3 ? "var(--danger)" : "var(--text)"} />
        </div>
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </div>

      {/* ── Cards view ── */}
      {viewMode === "cards" && (
        <PlayerCardGrid roster={roster} onPlayerSelect={onPlayerSelect} />
      )}

      {/* ── Depth Chart view ── */}
      {viewMode === "depth" && (
        <DragAndDropDepthChart
          league={league}
          actions={actions}
          onPlayerSelect={onPlayerSelect}
        />
      )}

      {/* ── Table view (existing list with search/filter/sort) ── */}
      {viewMode === "table" && (
        <>
          {/* Search + Sort */}
          <div style={{
            display: "flex", gap: "var(--space-2)",
            marginBottom: "var(--space-3)", alignItems: "center",
          }}>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="settings-input"
              style={{ flex: 1, minWidth: 0 }}
            />
            <div style={{
              display: "flex", gap: "var(--space-1)",
              overflowX: "auto", flexShrink: 0,
              scrollbarWidth: "none",
            }}>
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  className={`division-tab${sortKey === opt.key ? " active" : ""}`}
                  onClick={() => handleSortToggle(opt.key)}
                  style={{ fontSize: 11, flexShrink: 0 }}
                >
                  {opt.label}
                  {sortKey === opt.key && (
                    <span style={{ marginLeft: 2 }}>{sortDesc ? "↓" : "↑"}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Position Filter Pills */}
          <div
            className="division-tabs"
            style={{
              marginBottom: "var(--space-3)",
              flexWrap: "nowrap",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {POSITION_GROUPS.map(g => (
              <button
                key={g.label}
                className={`division-tab${posFilter === g.label ? " active" : ""}`}
                onClick={() => setPosFilter(g.label)}
                style={{
                  flexShrink: 0,
                  ...(g.label !== "ALL" && g.label !== "OFF" && g.label !== "DEF" && g.label !== "ST"
                    ? { borderColor: POS_COLORS[g.label] + "40", color: posFilter === g.label ? "#fff" : POS_COLORS[g.label] }
                    : {}),
                }}
              >
                {g.label}
                {g.positions && (
                  <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>
                    {roster.filter(p => g.positions.includes(p.pos || p.position)).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Player list */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "var(--space-2)",
          }}>
            {filtered.length === 0 && (
              <div style={{
                gridColumn: "1 / -1",
                textAlign: "center", padding: "var(--space-8)",
                color: "var(--text-muted)", fontSize: "var(--text-sm)",
              }}>
                {search ? `No players matching "${search}"` : "No players found"}
              </div>
            )}
            {filtered.map((player, i) => (
              <div key={player.id} className={`stagger-${Math.min(i + 1, 8)}`}>
                <PlayerRow
                  player={player}
                  isUser={isUserTeam}
                  onSelect={onPlayerSelect}
                  schemeName={schemeName}
                />
              </div>
            ))}
          </div>

          {/* Summary Footer */}
          <div style={{
            marginTop: "var(--space-4)", padding: "var(--space-3)",
            fontSize: "var(--text-xs)", color: "var(--text-subtle)",
            textAlign: "center", fontVariantNumeric: "tabular-nums",
          }}>
            Showing {filtered.length} of {rosterSize} players
            {team && ` · Cap Room: $${(team.capRoom ?? 0).toFixed(1)}M`}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub = "", color = "var(--text)" }) {
  return (
    <div className="card-premium" style={{
      padding: "var(--space-3) var(--space-4)",
      textAlign: "center",
    }}>
      <div style={{
        fontSize: "var(--text-xs)", fontWeight: 700,
        color: "var(--text-muted)", textTransform: "uppercase",
        letterSpacing: "0.5px", marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: "var(--text-lg)", fontWeight: 900, color,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}{sub && <span style={{ fontSize: "var(--text-xs)", fontWeight: 400, color: "var(--text-muted)" }}>{sub}</span>}
      </div>
    </div>
  );
}
