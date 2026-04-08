import React, { useEffect, useMemo } from "react";
import { getTeamIdentity } from "../../data/team-utils.js";
import { ScreenHeader, EmptyState } from "./ScreenSystem.jsx";

function fmtNumber(value) {
  return Number(value || 0).toLocaleString();
}

export default function PlayerDetailModal({ player, teams = [], onClose, onNavigate, onTradeAction, onCompare }) {
  if (!player) return null;

  const careerStats = player?.careerStats ?? [];
  const playerName = player?.name ?? "Unknown Player";
  const position = player?.pos ?? player?.position ?? "—";

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const rows = useMemo(() => {
    if (!Array.isArray(careerStats)) return [];
    return [...careerStats].sort(
      (a, b) => Number(b?.season ?? 0) - Number(a?.season ?? 0),
    );
  }, [careerStats]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.72)",
          backdropFilter: "blur(4px)",
          zIndex: 9000,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          inset: "6% auto auto 50%",
          transform: "translateX(-50%)",
          width: "min(960px, 94vw)",
          maxHeight: "88vh",
          overflow: "auto",
          border: "1px solid var(--hairline-strong)",
          background: "linear-gradient(180deg, var(--surface-elevated), var(--surface))",
          borderRadius: "var(--radius-lg)",
          zIndex: 9001,
          boxShadow: "0 28px 80px rgba(0,0,0,0.55)",
        }}
      >
        <div style={{ padding: "var(--space-4) var(--space-5)", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "flex-start", background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ScreenHeader
              compact
              eyebrow="Player profile"
              title={playerName}
              subtitle={`${position} · Age ${player?.age ?? "—"} · ${player?.teamAbbr || player?.team || "Team N/A"}`}
              metadata={[
                { label: "OVR", value: player?.ovr ?? "—" },
                { label: "POT", value: player?.potential ?? player?.pot ?? "—" },
              ]}
            />
            {player?.onTradeBlock && (
              <span className="trade-block-badge">🔴 On Trade Block</span>
            )}
            <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)", flexWrap: "wrap" }}>
              <button className="btn" onClick={() => onCompare?.(player.id)}>Compare</button>
              <button className="btn" onClick={() => onNavigate?.("Trades")}>Open Trade Workspace</button>
              <button className="btn" onClick={() => onTradeAction?.("toggle_trade_block", player.id)}>{player?.onTradeBlock ? "Remove Trade Block" : "Add Trade Block"}</button>
              <button className="btn btn-primary" onClick={() => onNavigate?.("Free Agency")}>Negotiate Extension</button>
            </div>
          </div>
          <button className="btn" onClick={onClose} aria-label="Close player detail modal" style={{ borderRadius: "999px", minWidth: 40, minHeight: 40, padding: 0, fontSize: "1.1rem", fontWeight: 800 }}>✕</button>
        </div>

        <div style={{ padding: "var(--space-4) var(--space-5) var(--space-5)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
            <div style={{ fontWeight: 800, fontSize: "var(--text-base)" }}>Career Stats by Season</div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.6px" }}>{rows.length} seasons</div>
          </div>
          {careerStats.length === 0 ? (
            <EmptyState title="No career stats yet" body="Career stat rows will appear once the player has logged games." />
          ) : (
            <div style={{ overflowX: "auto", border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", background: "rgba(255,255,255,0.02)" }}>
              <table className="standings-table" style={{ width: "100%", fontSize: "0.76rem", lineHeight: 1.35 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Season</th>
                    <th style={{ textAlign: "left" }}>Team</th>
                    <th>GP</th>
                    <th>Pass Yds</th>
                    <th>Rush Yds</th>
                    <th>Rec Yds</th>
                    <th>Pass TD</th>
                    <th>Rush TD</th>
                    <th>Rec TD</th>
                    <th>Tackles</th>
                    <th>Sacks</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((line, idx) => {
                    const team = getTeamIdentity(line.teamId ?? line.team ?? line.tid, teams);
                    return (
                      <tr key={`${line.season ?? idx}-${idx}`}>
                        <td>{line.season ?? "—"}</td>
                        <td>{team.abbr} · {team.name}</td>
                        <td style={{ textAlign: "right" }}>{fmtNumber(line.gamesPlayed)}</td>
                        <td style={{ textAlign: "right" }}>{fmtNumber(line.passYds)}</td>
                        <td style={{ textAlign: "right" }}>{fmtNumber(line.rushYds)}</td>
                        <td style={{ textAlign: "right" }}>{fmtNumber(line.recYds)}</td>
                        <td style={{ textAlign: "right" }}>{fmtNumber(line.passTDs)}</td>
                        <td style={{ textAlign: "right" }}>{fmtNumber(line.rushTDs)}</td>
                        <td style={{ textAlign: "right" }}>{fmtNumber(line.recTDs)}</td>
                        <td style={{ textAlign: "right" }}>{fmtNumber(line.tackles)}</td>
                        <td style={{ textAlign: "right" }}>{fmtNumber(line.sacks)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
