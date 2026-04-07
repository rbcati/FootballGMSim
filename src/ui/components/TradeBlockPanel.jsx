import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { normalizeManagement } from "../utils/playerManagement.js";

export default function TradeBlockPanel({ roster, onRemove }) {
  if (!roster || !Array.isArray(roster)) {
    return null;
  }

  const [open, setOpen] = useState(true);
  const blockPlayers = useMemo(
    () => roster.filter((player) => {
      const m = normalizeManagement(player);
      return player?.onTradeBlock === true || m.tradeStatus === 'actively_shopping' || m.contractPlan.includes('trade_candidate');
    }),
    [roster],
  );

  return (
    <div className="card" style={{ marginBottom: "var(--space-4)", padding: "var(--space-4) var(--space-5)" }}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "transparent",
          border: "none",
          color: "var(--text)",
          cursor: "pointer",
          padding: 0,
          fontWeight: 700,
          fontSize: "var(--text-sm)",
        }}
      >
        <span>Trade Block ({blockPlayers.length})</span>
        <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div style={{ marginTop: "var(--space-3)" }}>
          {blockPlayers.length === 0 ? (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>No players on the trade block.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {blockPlayers.map((player) => (
                <div
                  key={player?.id ?? `${player?.name ?? "unknown"}-${player?.pos ?? "na"}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto auto",
                    gap: "var(--space-3)",
                    alignItems: "center",
                    border: "1px solid var(--hairline)",
                    borderRadius: "var(--radius-md)",
                    padding: "var(--space-2) var(--space-3)",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{player?.name ?? "Unknown"}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>{player?.pos ?? "—"}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>OVR {player?.ovr ?? "—"} · Age {player?.age ?? "—"}</span>
                  <Button className="btn" onClick={() => player?.id && onRemove?.(player.id)} style={{ fontSize: "var(--text-xs)", padding: "2px 8px" }}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
