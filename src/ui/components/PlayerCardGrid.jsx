/**
 * PlayerCardGrid.jsx — Responsive grid of position-styled player cards.
 *
 * Features:
 *  - Position-colored TOP border on each card (distinct from PlayerCard's left strip)
 *  - Large OVR badge: gold ≥90, green ≥80, blue ≥70, amber ≥60, red <60
 *  - 3 position-specific attribute bars (4 px height, same colour scale)
 *  - INJ / EXPIRING / ELITE POT status badges
 *  - Smooth hover lift + colour glow on each card
 *  - Position filter pills (colour-coded per position group)
 *  - Sort bar: OVR | Salary | Age | Name (toggles asc/desc)
 *  - Result count label + empty-state message
 *  - Card click → onPlayerSelect(id)
 */

import React, { useState, useMemo } from "react";

// ── Colour maps ────────────────────────────────────────────────────────────────

const POS_COLORS = {
  QB: "#ef4444", RB: "#22c55e", WR: "#3b82f6", TE: "#a855f7",
  OL: "#f59e0b", DL: "#ec4899", LB: "#0ea5e9", CB: "#14b8a6",
  S: "#6366f1", K: "#9ca3af", P: "#6b7280",
};

// ── getCardKeyAttrs — 3 most representative attrs per position ─────────────────

export function getCardKeyAttrs(pos) {
  const MAP = {
    QB:  [{ key: "acc",  label: "ACC" }, { key: "arm",  label: "ARM" }, { key: "awa",  label: "AWA" }],
    RB:  [{ key: "spd",  label: "SPD" }, { key: "pow",  label: "POW" }, { key: "elu",  label: "ELU" }],
    WR:  [{ key: "spd",  label: "SPD" }, { key: "ctch", label: "CTH" }, { key: "rou",  label: "RTE" }],
    TE:  [{ key: "ctch", label: "CTH" }, { key: "blk",  label: "BLK" }, { key: "spd",  label: "SPD" }],
    OL:  [{ key: "str",  label: "STR" }, { key: "blk",  label: "BLK" }, { key: "awa",  label: "AWA" }],
    DL:  [{ key: "str",  label: "STR" }, { key: "pas",  label: "PRS" }, { key: "run",  label: "RDF" }],
    LB:  [{ key: "tck",  label: "TKL" }, { key: "cov",  label: "COV" }, { key: "spd",  label: "SPD" }],
    CB:  [{ key: "cov",  label: "COV" }, { key: "spd",  label: "SPD" }, { key: "awa",  label: "AWA" }],
    S:   [{ key: "cov",  label: "COV" }, { key: "tck",  label: "TKL" }, { key: "spd",  label: "SPD" }],
    K:   [{ key: "kpw",  label: "KPW" }, { key: "kac",  label: "KAC" }, { key: "acc",  label: "ACC" }],
    P:   [{ key: "ppw",  label: "PPW" }, { key: "pac",  label: "PAC" }, { key: "kpw",  label: "KPW" }],
  };
  return MAP[pos] || MAP.QB;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Deterministic attr value: reads from player.ratings / player.attrs, or synthesises from OVR. */
function getAttrValue(player, key) {
  const src = player.ratings || player.attrs || {};
  if (src[key] != null) return Math.round(src[key]);
  // Deterministic fallback using OVR + key seed so cards look consistent
  const ovr  = player.ovr ?? 70;
  const base = (player.id ?? "x").split("").reduce((h, c) => h * 31 + c.charCodeAt(0), 0) & 0xffff;
  const seed = (base + key.charCodeAt(0) * 17) & 0xffff;
  const norm = ((seed * 1664525 + 1013904223) & 0xffff) / 0xffff;
  return Math.round(Math.min(99, Math.max(40, ovr + (norm - 0.5) * 20)));
}

function attrBarColor(v) {
  if (v >= 90) return "#FFD700";
  if (v >= 80) return "#34C759";
  if (v >= 70) return "#0A84FF";
  if (v >= 60) return "#FF9F0A";
  return "#636366";
}

function ovrStyle(ovr) {
  if (ovr >= 90) return { color: "#FFD700", bg: "rgba(255,215,0,0.15)",  glow: "#FFD70044" };
  if (ovr >= 80) return { color: "#34C759", bg: "rgba(52,199,89,0.15)",  glow: "#34C75944" };
  if (ovr >= 70) return { color: "#0A84FF", bg: "rgba(10,132,255,0.15)", glow: "#0A84FF44" };
  if (ovr >= 60) return { color: "#FF9F0A", bg: "rgba(255,159,10,0.15)", glow: "#FF9F0A33" };
  return          { color: "#636366", bg: "rgba(99,99,102,0.15)",  glow: "#63636622" };
}

// ── Position filter groups ────────────────────────────────────────────────────

const POSITION_GROUPS = [
  { label: "ALL", positions: null },
  { label: "OFF", positions: ["QB", "RB", "WR", "TE", "OL"] },
  { label: "DEF", positions: ["DL", "LB", "CB", "S"] },
  { label: "ST",  positions: ["K", "P"] },
  { label: "QB",  positions: ["QB"] },
  { label: "RB",  positions: ["RB"] },
  { label: "WR",  positions: ["WR"] },
  { label: "TE",  positions: ["TE"] },
  { label: "OL",  positions: ["OL"] },
  { label: "DL",  positions: ["DL"] },
  { label: "LB",  positions: ["LB"] },
  { label: "CB",  positions: ["CB"] },
  { label: "S",   positions: ["S"] },
];

const SORT_OPTIONS = [
  { key: "ovr",    label: "OVR",    defaultDesc: true  },
  { key: "salary", label: "Salary", defaultDesc: true  },
  { key: "age",    label: "Age",    defaultDesc: false },
  { key: "name",   label: "Name",   defaultDesc: false },
];

// ── CardAttrBar ───────────────────────────────────────────────────────────────

function CardAttrBar({ label, value }) {
  if (value == null) return null;
  const pct   = Math.min(100, Math.max(0, ((value - 40) / 59) * 100));
  const color = attrBarColor(value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{
        fontSize: "0.6rem", fontWeight: 700, color: "var(--text-muted)",
        width: 24, flexShrink: 0, letterSpacing: "0.2px",
      }}>
        {label}
      </span>
      <div style={{
        flex: 1, height: 4, background: "rgba(255,255,255,0.08)",
        borderRadius: 2, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${pct}%`, background: color, borderRadius: 2,
          transition: "width 0.5s cubic-bezier(0.2,0.8,0.2,1)",
        }} />
      </div>
      <span style={{
        fontSize: "0.64rem", fontWeight: 800, color,
        width: 20, textAlign: "right", flexShrink: 0,
      }}>
        {value}
      </span>
    </div>
  );
}

// ── RosterCard ────────────────────────────────────────────────────────────────

function RosterCard({ player, onSelect }) {
  const [hovered, setHovered] = useState(false);

  const pos       = player.pos || player.position || "??";
  const posColor  = POS_COLORS[pos] || "#9ca3af";
  const ovr       = player.ovr ?? player.displayOvr ?? 50;
  const { color: ovrColor, bg: ovrBg, glow: ovrGlow } = ovrStyle(ovr);

  const salary    = player.baseAnnual ?? player.contract?.baseAnnual ?? player.contract?.salary ?? 0;
  const years     = player.years ?? player.contract?.years ?? 0;
  const isInjured = (player.injuryWeeksRemaining ?? 0) > 0 || !!player.injury;
  const isExpiring = years <= 1 && years > 0;
  const isElitePot = (player.potential ?? 0) >= 88 && (player.potential ?? 0) > ovr + 5;

  const attrs = getCardKeyAttrs(pos);

  const salaryStr = salary >= 1
    ? `$${salary.toFixed(1)}M`
    : salary > 0
      ? `$${Math.round(salary * 1000)}K`
      : "—";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(player.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect?.(player.id); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--surface)",
        border: `1.5px solid ${hovered ? posColor + "55" : "var(--hairline)"}`,
        borderTop: `3px solid ${posColor}`,
        borderRadius: "var(--radius-lg)",
        padding: "11px 13px 10px",
        cursor: "pointer",
        transition: "transform 0.15s, box-shadow 0.15s, border-color 0.15s",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hovered
          ? `0 8px 24px ${posColor}28, 0 2px 8px rgba(0,0,0,0.3)`
          : "var(--shadow-sm)",
        outline: "none",
      }}
    >
      {/* ── Top row: pos badge + status badges ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
        <span style={{
          fontSize: "0.62rem", fontWeight: 800, padding: "2px 7px",
          background: `${posColor}20`, border: `1px solid ${posColor}44`,
          color: posColor, borderRadius: 5, letterSpacing: "0.4px",
        }}>
          {pos}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {isInjured && (
            <span style={{
              fontSize: "0.58rem", fontWeight: 800, padding: "1px 5px",
              background: "rgba(255,69,58,0.15)", border: "1px solid rgba(255,69,58,0.35)",
              color: "#FF453A", borderRadius: 4,
            }}>INJ</span>
          )}
          {isExpiring && !isInjured && (
            <span style={{
              fontSize: "0.58rem", fontWeight: 800, padding: "1px 5px",
              background: "rgba(255,159,10,0.15)", border: "1px solid rgba(255,159,10,0.35)",
              color: "#FF9F0A", borderRadius: 4,
            }}>EXP</span>
          )}
          {isElitePot && (
            <span style={{
              fontSize: "0.58rem", fontWeight: 800, padding: "1px 5px",
              background: "rgba(191,90,242,0.15)", border: "1px solid rgba(191,90,242,0.35)",
              color: "#BF5AF2", borderRadius: 4,
            }}>POT</span>
          )}
        </div>
      </div>

      {/* ── OVR badge + name / contract ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
          background: ovrBg, border: `2px solid ${ovrColor}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1rem", fontWeight: 900, color: ovrColor,
          boxShadow: ovr >= 88 ? `0 0 12px ${ovrGlow}` : "none",
        }}>
          {ovr}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 800, fontSize: "0.875rem", color: "var(--text)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            lineHeight: 1.2,
          }}>
            {player.name ?? "Unknown"}
          </div>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>
            Age {player.age ?? "?"}
            {salary > 0 && <> · {salaryStr}/{years > 0 ? `${years}yr` : "FA"}</>}
          </div>
        </div>
      </div>

      {/* ── 3 attribute bars ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {attrs.map(({ key, label }) => (
          <CardAttrBar key={key} label={label} value={getAttrValue(player, key)} />
        ))}
      </div>
    </div>
  );
}

// ── PlayerCardGrid ─────────────────────────────────────────────────────────────

/**
 * Props:
 *  - roster: Player[]
 *  - onPlayerSelect: (playerId: string) => void
 */
export default function PlayerCardGrid({ roster = [], onPlayerSelect }) {
  const [posFilter, setPosFilter] = useState("ALL");
  const [sortKey,   setSortKey]   = useState("ovr");
  const [sortDesc,  setSortDesc]  = useState(true);

  const filtered = useMemo(() => {
    let players = [...roster];

    // Position filter
    const group = POSITION_GROUPS.find(g => g.label === posFilter);
    if (group?.positions) {
      players = players.filter(p => group.positions.includes(p.pos ?? p.position));
    }

    // Sort
    players.sort((a, b) => {
      if (sortKey === "name") {
        const cmp = (a.name ?? "").localeCompare(b.name ?? "");
        return sortDesc ? -cmp : cmp;
      }
      let va, vb;
      switch (sortKey) {
        case "ovr":
          va = a.ovr ?? a.displayOvr ?? 0;
          vb = b.ovr ?? b.displayOvr ?? 0;
          break;
        case "salary":
          va = a.baseAnnual ?? a.contract?.baseAnnual ?? a.contract?.salary ?? 0;
          vb = b.baseAnnual ?? b.contract?.baseAnnual ?? b.contract?.salary ?? 0;
          break;
        case "age":
          va = a.age ?? 0;
          vb = b.age ?? 0;
          break;
        default:
          va = 0; vb = 0;
      }
      return sortDesc ? vb - va : va - vb;
    });

    return players;
  }, [roster, posFilter, sortKey, sortDesc]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDesc(d => !d);
    } else {
      const opt = SORT_OPTIONS.find(o => o.key === key);
      setSortKey(key);
      setSortDesc(opt?.defaultDesc ?? true);
    }
  }

  return (
    <div>
      {/* ── Position filter pills ── */}
      <div style={{
        display: "flex", gap: 6, overflowX: "auto", flexWrap: "nowrap",
        scrollbarWidth: "none", msOverflowStyle: "none",
        marginBottom: 10, paddingBottom: 2,
        WebkitOverflowScrolling: "touch",
      }}>
        {POSITION_GROUPS.map(g => {
          const isActive  = posFilter === g.label;
          const posClr    = POS_COLORS[g.label];
          const count     = g.positions
            ? roster.filter(p => g.positions.includes(p.pos ?? p.position)).length
            : roster.length;

          return (
            <button
              key={g.label}
              onClick={() => setPosFilter(g.label)}
              style={{
                flexShrink: 0,
                padding: "5px 11px",
                borderRadius: 20,
                border: `1.5px solid ${isActive
                  ? (posClr || "var(--accent)")
                  : (posClr ? `${posClr}38` : "var(--hairline)")}`,
                background: isActive
                  ? (posClr ? `${posClr}22` : "rgba(10,132,255,0.15)")
                  : "var(--surface)",
                color: isActive
                  ? (posClr || "var(--accent)")
                  : (posClr || "var(--text-muted)"),
                fontSize: "0.7rem", fontWeight: 800,
                cursor: "pointer",
                transition: "all 0.12s",
                display: "flex", alignItems: "center", gap: 4,
                whiteSpace: "nowrap",
              }}
            >
              {g.label}
              <span style={{ fontSize: "0.6rem", opacity: 0.65 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Sort bar + result count ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        marginBottom: 14, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-subtle)" }}>
          {filtered.length} player{filtered.length !== 1 ? "s" : ""}
        </span>
        <div style={{ flex: 1 }} />
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => toggleSort(opt.key)}
            style={{
              padding: "4px 9px",
              borderRadius: 6,
              border: "none",
              background: sortKey === opt.key ? "var(--accent)" : "var(--surface)",
              color: sortKey === opt.key ? "#fff" : "var(--text-muted)",
              fontSize: "0.68rem", fontWeight: 700,
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 2,
              transition: "background 0.12s",
            }}
          >
            {opt.label}
            {sortKey === opt.key && <span style={{ opacity: 0.8 }}>{sortDesc ? "↓" : "↑"}</span>}
          </button>
        ))}
      </div>

      {/* ── Card grid or empty state ── */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "var(--space-10, 40px) var(--space-4)",
          color: "var(--text-muted)", fontSize: "var(--text-sm)",
        }}>
          No players match this filter.
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(196px, 1fr))",
          gap: "var(--space-3)",
        }}>
          {filtered.map((player, i) => (
            <div
              key={player.id}
              className={`stagger-${Math.min(i + 1, 8)}`}
              style={{ animationDelay: `${Math.min(i, 7) * 30}ms` }}
            >
              <RosterCard player={player} onSelect={onPlayerSelect} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
