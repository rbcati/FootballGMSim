/**
 * SchemeSelection.jsx — Weekly Scheme Picker
 *
 * Lets the user choose an Offensive Scheme and a Defensive Scheme each week.
 * Scheme fit bonuses are applied at game simulation time via scheme-core.js.
 *
 * Props:
 *   currentOffense   string  – current offense scheme id (e.g. "WEST_COAST")
 *   currentDefense   string  – current defense scheme id (e.g. "COVER_2")
 *   onSave(off, def) fn      – called with (offenseId, defenseId) when user confirms
 *   onClose          fn      – closes without saving
 */

import React, { useState } from "react";
import { OFFENSIVE_SCHEMES, DEFENSIVE_SCHEMES } from "../../core/scheme-core.js";

const OFF_ICON = { WEST_COAST: "🎯", VERTICAL: "🚀", SMASHMOUTH: "💪" };
const DEF_ICON = { COVER_2: "🛡️", BLITZ_34: "⚡", MAN_COVERAGE: "🔒" };

const OFF_COLOR = {
  WEST_COAST:   "#0A84FF",
  VERTICAL:     "#BF5AF2",
  SMASHMOUTH:   "#FF9F0A",
};
const DEF_COLOR = {
  COVER_2:      "#34C759",
  BLITZ_34:     "#FF453A",
  MAN_COVERAGE: "#FFD60A",
};

function SchemeCard({ scheme, selected, onClick, color, icon }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left",
        padding: "12px 14px",
        background: selected ? `${color}18` : "var(--surface)",
        border: `1.5px solid ${selected ? color : "var(--hairline)"}`,
        borderRadius: 12, cursor: "pointer",
        transition: "all 0.18s ease",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {selected && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: color,
        }} />
      )}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: `${color}22`, border: `1px solid ${color}44`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.2rem",
        }}>
          {icon || "🏈"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: "0.85rem", fontWeight: 800,
            color: selected ? color : "var(--text)",
            marginBottom: 3,
          }}>
            {scheme.name}
            {selected && (
              <span style={{
                marginLeft: 8, fontSize: "0.6rem", fontWeight: 700,
                background: color, color: "#000",
                borderRadius: 4, padding: "1px 6px",
              }}>
                ACTIVE
              </span>
            )}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.4, marginBottom: 6 }}>
            {scheme.description}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {scheme.bonus && (
              <span style={{
                fontSize: "0.6rem", fontWeight: 700, color: "#34C759",
                background: "#34C75914", border: "1px solid #34C75930",
                borderRadius: 4, padding: "2px 7px",
              }}>
                {scheme.bonus}
              </span>
            )}
            {scheme.penalty && (
              <span style={{
                fontSize: "0.6rem", fontWeight: 700, color: "#FF453A",
                background: "#FF453A14", border: "1px solid #FF453A30",
                borderRadius: 4, padding: "2px 7px",
              }}>
                {scheme.penalty}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function SchemeSelection({
  currentOffense,
  currentDefense,
  onSave,
  onClose,
}) {
  const [selOff, setSelOff] = useState(currentOffense || "WEST_COAST");
  const [selDef, setSelDef] = useState(currentDefense || "COVER_2");
  const [tab, setTab] = useState("offense"); // "offense" | "defense"

  const handleSave = () => {
    onSave?.(selOff, selDef);
    onClose?.();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9600,
      background: "rgba(0,0,0,0.85)",
      backdropFilter: "blur(12px)",
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: "24px 16px 80px",
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: "1.15rem", fontWeight: 900, color: "var(--text)" }}>
              Weekly Scheme
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>
              Choose your game plan for this week
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "var(--surface)", border: "1px solid var(--hairline)",
              color: "var(--text-muted)", fontSize: "1.1rem", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", background: "var(--surface)",
          border: "1px solid var(--hairline)", borderRadius: 10,
          padding: 3, marginBottom: 16, gap: 3,
        }}>
          {["offense", "defense"].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "8px 0",
                background: tab === t ? "var(--accent, #0A84FF)" : "transparent",
                color: tab === t ? "#fff" : "var(--text-muted)",
                border: "none", borderRadius: 8,
                fontWeight: 800, fontSize: "0.8rem", cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {t === "offense" ? "⚔️ Offense" : "🛡️ Defense"}
            </button>
          ))}
        </div>

        {/* Scheme cards */}
        {tab === "offense" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-subtle)",
              textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>
              Select Offensive Scheme
            </div>
            {Object.values(OFFENSIVE_SCHEMES).map(scheme => (
              <SchemeCard
                key={scheme.id}
                scheme={scheme}
                selected={selOff === scheme.id}
                onClick={() => setSelOff(scheme.id)}
                color={OFF_COLOR[scheme.id] || "#0A84FF"}
                icon={OFF_ICON[scheme.id] || "🏈"}
              />
            ))}
          </div>
        )}

        {tab === "defense" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-subtle)",
              textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>
              Select Defensive Scheme
            </div>
            {Object.values(DEFENSIVE_SCHEMES).map(scheme => (
              <SchemeCard
                key={scheme.id}
                scheme={scheme}
                selected={selDef === scheme.id}
                onClick={() => setSelDef(scheme.id)}
                color={DEF_COLOR[scheme.id] || "#34C759"}
                icon={DEF_ICON[scheme.id] || "🛡️"}
              />
            ))}
          </div>
        )}

        {/* Summary + Save */}
        <div style={{
          background: "var(--surface)", border: "1px solid var(--hairline)",
          borderRadius: 12, padding: "12px 14px", marginBottom: 16,
          display: "flex", gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "var(--text-subtle)",
              textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4 }}>
              Offense
            </div>
            <div style={{ fontSize: "0.82rem", fontWeight: 800, color: OFF_COLOR[selOff] || "#0A84FF" }}>
              {OFF_ICON[selOff]} {OFFENSIVE_SCHEMES[selOff]?.name || selOff}
            </div>
          </div>
          <div style={{ width: 1, background: "var(--hairline)", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "var(--text-subtle)",
              textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4 }}>
              Defense
            </div>
            <div style={{ fontSize: "0.82rem", fontWeight: 800, color: DEF_COLOR[selDef] || "#34C759" }}>
              {DEF_ICON[selDef]} {DEFENSIVE_SCHEMES[selDef]?.name || selDef}
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          style={{
            width: "100%", padding: "14px",
            background: "var(--accent, #0A84FF)",
            color: "#fff", border: "none", borderRadius: 12,
            fontWeight: 900, fontSize: "0.95rem", cursor: "pointer",
            boxShadow: "0 4px 16px rgba(10,132,255,0.4)",
          }}
        >
          Confirm Game Plan →
        </button>
      </div>
    </div>
  );
}
