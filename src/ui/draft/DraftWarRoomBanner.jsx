import React from "react";
import { POS_COLORS } from "../constants/positionColors.js";

export function DraftWarRoomBanner({ isUserPick, currentPick, isDraftComplete }) {
  if (isDraftComplete) return null;

  return (
    <div
      style={{
        marginBottom: "var(--space-4)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        background: isUserPick
          ? "linear-gradient(135deg, #0f0c29 0%, #302b63 60%, #24243e 100%)"
          : "var(--surface-strong)",
        border: `1px solid ${isUserPick ? "var(--accent)" : "var(--hairline)"}`,
        padding: "var(--space-3) var(--space-5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-4)",
      }}
    >
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", color: isUserPick ? "var(--accent)" : "var(--text-muted)", marginBottom: 2 }}>
          {isUserPick ? "★ You Are On The Clock" : "War Room — AI Picking"}
        </div>
        <div style={{ fontWeight: 800, fontSize: "var(--text-lg)", color: "var(--text)" }}>
          {currentPick?.teamName ?? "—"}
          <span style={{ marginLeft: 10, fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 400 }}>
            Round {currentPick?.round} · Pick #{currentPick?.overall}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "flex-end" }}>
        {Object.entries(POS_COLORS)
          .filter(([pos]) => !["default", "DB", "CB", "S"].includes(pos))
          .map(([pos, color]) => (
            <span
              key={pos}
              style={{ padding: "1px 6px", borderRadius: "var(--radius-pill)", background: `${color}22`, color, fontSize: 10, fontWeight: 700, border: `1px solid ${color}44`, fontFamily: "var(--font-mono)" }}
            >
              {pos}
            </span>
          ))}
      </div>
    </div>
  );
}

export default DraftWarRoomBanner;
