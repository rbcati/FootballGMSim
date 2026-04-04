import React, { useEffect, useMemo } from "react";
import { getTeamIdentity } from "../../data/team-utils.js";

function fmtNumber(value) {
  return Number(value || 0).toLocaleString();
}

export default function PlayerDetailModal({ player, teams = [], onClose }) {
  useEffect(() => {
    if (!player) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [player, onClose]);

  const rows = useMemo(() => {
    if (!Array.isArray(player?.careerStats)) return [];
    return [...player.careerStats].sort(
      (a, b) => Number(b?.season ?? 0) - Number(a?.season ?? 0),
    );
  }, [player]);

  if (!player) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: 9000,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          inset: "10% auto auto 50%",
          transform: "translateX(-50%)",
          width: "min(960px, 94vw)",
          maxHeight: "80vh",
          overflow: "auto",
          border: "1px solid var(--hairline)",
          background: "var(--surface)",
          borderRadius: "var(--radius-lg)",
          zIndex: 9001,
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ padding: "var(--space-4)", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>{player.name}</div>
            <div style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
              {player.pos} · Age {player.age ?? "—"} · OVR {player.ovr ?? "—"}
            </div>
          </div>
          <button className="btn" onClick={onClose} aria-label="Close player detail modal">✕</button>
        </div>

        <div style={{ padding: "var(--space-4)" }}>
          <div style={{ fontWeight: 700, marginBottom: "var(--space-3)" }}>Career Stats by Season</div>
          {rows.length === 0 ? (
            <div style={{ color: "var(--text-muted)" }}>No career stats available yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="standings-table" style={{ width: "100%", fontSize: "var(--text-xs)" }}>
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
