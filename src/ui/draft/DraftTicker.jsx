import React, { useMemo } from "react";
import { ovrColor } from "./draftShared.js";

export function DraftTicker({ completedPicks, tradeUpTicker = null }) {
  const lastPicks = useMemo(
    () => [...completedPicks].reverse().slice(0, 5),
    [completedPicks],
  );

  const showTicker = lastPicks.length > 0 || tradeUpTicker;
  if (!showTicker) return null;

  return (
    <div
      className="draft-ticker"
      style={{ background: "var(--surface-strong)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "var(--space-2) var(--space-3)", marginBottom: "var(--space-4)", overflow: "hidden" }}
    >
      {tradeUpTicker && (
        <div style={{ marginBottom: lastPicks.length > 0 ? "var(--space-2)" : 0 }}>
          <span
            className="inline-flex items-center px-2 py-1 rounded text-sm font-semibold bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800 animate-bounce"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 8px",
              borderRadius: 6,
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              background: "rgba(251,191,36,0.15)",
              color: "#92400e",
              border: "1px solid rgba(251,191,36,0.4)",
              animation: "var(--motion-safe, tradeUpBounce 1s infinite)",
            }}
            aria-live="polite"
          >
            {tradeUpTicker.text}
          </span>
        </div>
      )}

      {lastPicks.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "1px", flexShrink: 0, marginRight: "var(--space-2)" }}>
            LATEST
          </span>
          <div style={{ display: "flex", gap: "var(--space-4)", overflowX: "auto", whiteSpace: "nowrap", flex: 1, scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {lastPicks.map((pk) => (
              <span
                key={pk.overall}
                style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--text)", animation: "tickerSlideIn 0.4s ease-out" }}
              >
                <span style={{ fontWeight: 800, color: "var(--text-muted)", fontSize: 10, minWidth: 18 }}>#{pk.overall}</span>
                <span style={{ fontWeight: 700, color: "var(--accent)" }}>{pk.teamAbbr}</span>
                <span style={{ color: "var(--text-muted)" }}>{pk.playerPos}</span>
                <span style={{ fontWeight: 600 }}>{pk.playerName}</span>
                <span style={{ padding: "0 4px", borderRadius: "var(--radius-pill)", background: `${ovrColor(pk.playerOvr ?? 0)}22`, color: ovrColor(pk.playerOvr ?? 0), fontWeight: 700, fontSize: 10 }}>
                  {pk.playerOvr}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes tickerSlideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes tradeUpBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @media (prefers-reduced-motion: reduce) { .animate-bounce, [style*="tradeUpBounce"] { animation: none !important; } }
      `}</style>
    </div>
  );
}

export default DraftTicker;
