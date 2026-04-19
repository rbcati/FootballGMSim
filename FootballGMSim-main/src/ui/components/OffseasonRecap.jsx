/**
 * OffseasonRecap.jsx — End-of-Season Offseason Recap Screen
 *
 * Shown after the final playoff game. Displays:
 *  - Champion banner
 *  - Previous-year retirements (8-12 named players)
 *  - Hall of Fame induction carousel
 *  - Draft order reveal
 *  - Free agency preview
 *  - "Begin New Season" button
 *
 * Props:
 *   champion       { name, abbr, color }  – championship team
 *   retirements    Player[]               – players retiring (name, pos, ovr, age, teamAbbr)
 *   hofClass       Player[]               – Hall of Fame inductees
 *   draftOrder     { pick, teamName, abbr }[] – draft picks 1-32
 *   topFreeAgents  Player[]               – notable free agents
 *   year           number                 – the season year just completed
 *   onBeginSeason  fn                     – callback to start new season
 */

import React, { useState, useMemo } from "react";

function Section({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--hairline)",
      borderRadius: 14, overflow: "hidden", marginBottom: 12,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", padding: "13px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text)" }}>{title}</span>
        <span style={{ fontSize: "0.7rem", color: "var(--text-subtle)" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--hairline)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function PlayerRow({ player, badge, badgeColor }) {
  const pos = player?.pos || "?";
  const name = player?.name || "Unknown Player";
  const ovr  = player?.ovr ?? player?.overall ?? player?.ratings?.[0]?.ovr ?? null;
  const age  = player?.age ?? null;
  const team = player?.teamAbbr || player?.abbr || "";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
        background: `${badgeColor || "var(--accent)"}18`,
        border: `1px solid ${badgeColor || "var(--accent)"}40`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.72rem", fontWeight: 900,
        color: badgeColor || "var(--accent)",
      }}>
        {pos}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
          {team && <span style={{ marginLeft: 6, fontSize: "0.65rem", color: "var(--text-subtle)" }}>{team}</span>}
        </div>
        <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 1 }}>
          {ovr != null ? `OVR ${ovr}` : ""}
          {age != null ? (ovr != null ? ` · Age ${age}` : `Age ${age}`) : ""}
        </div>
      </div>
      {badge && (
        <div style={{
          fontSize: "0.6rem", fontWeight: 800,
          color: badgeColor || "var(--accent)",
          background: `${badgeColor || "var(--accent)"}18`,
          border: `1px solid ${badgeColor || "var(--accent)"}30`,
          borderRadius: 5, padding: "2px 7px", flexShrink: 0,
        }}>
          {badge}
        </div>
      )}
    </div>
  );
}

function HOFCarousel({ inductees }) {
  const [idx, setIdx] = useState(0);
  if (!inductees?.length) return (
    <div style={{ textAlign: "center", padding: 16, color: "var(--text-muted)", fontSize: "0.82rem" }}>
      No Hall of Fame inductees this year.
    </div>
  );
  const p = inductees[idx];

  return (
    <div style={{ textAlign: "center" }}>
      {/* Bust card */}
      <div style={{
        margin: "12px auto",
        background: "linear-gradient(135deg,#FFD60A22,#FF9F0A11)",
        border: "2px solid #FFD60A66",
        borderRadius: 16, padding: "16px 20px",
        maxWidth: 280,
      }}>
        <div style={{ fontSize: "2.5rem", marginBottom: 6 }}>🏆</div>
        <div style={{
          fontSize: "1.1rem", fontWeight: 900, color: "#FFD60A",
          marginBottom: 4,
        }}>
          {p?.name || "?"}
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 8 }}>
          {p?.pos || ""} · {p?.age != null ? `Retired age ${p.age}` : ""}
          {p?.teamAbbr ? ` · ${p.teamAbbr}` : ""}
        </div>
        {p?.careerStats && (
          <div style={{ fontSize: "0.68rem", color: "var(--text-subtle)" }}>
            {p.careerStats}
          </div>
        )}
        <div style={{
          marginTop: 10,
          fontSize: "0.65rem", fontWeight: 800, color: "#FFD60A",
          textTransform: "uppercase", letterSpacing: "1px",
        }}>
          Hall of Fame Class of {p?.year || new Date().getFullYear()}
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <button
          onClick={() => setIdx(i => Math.max(0, i - 1))}
          disabled={idx === 0}
          style={{
            width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--hairline)",
            background: "var(--surface)", color: "var(--text-muted)", cursor: "pointer",
            fontSize: "0.9rem", opacity: idx === 0 ? 0.3 : 1,
          }}
        >◀</button>
        <span style={{ fontSize: "0.68rem", color: "var(--text-subtle)" }}>
          {idx + 1} / {inductees.length}
        </span>
        <button
          onClick={() => setIdx(i => Math.min(inductees.length - 1, i + 1))}
          disabled={idx === inductees.length - 1}
          style={{
            width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--hairline)",
            background: "var(--surface)", color: "var(--text-muted)", cursor: "pointer",
            fontSize: "0.9rem", opacity: idx === inductees.length - 1 ? 0.3 : 1,
          }}
        >▶</button>
      </div>
    </div>
  );
}

export default function OffseasonRecap({
  champion,
  retirements = [],
  hofClass = [],
  draftOrder = [],
  topFreeAgents = [],
  year,
  onBeginSeason,
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9600,
      background: "rgba(0,0,0,0.92)",
      backdropFilter: "blur(14px)",
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "24px 16px 100px",
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>

        {/* Champion banner */}
        {champion && (
          <div style={{
            textAlign: "center", marginBottom: 24,
            animation: "fadeSlideIn 0.5s ease-out",
          }}>
            <style>{`
              @keyframes fadeSlideIn {
                from { opacity: 0; transform: translateY(16px); }
                to   { opacity: 1; transform: translateY(0); }
              }
            `}</style>
            <div style={{ fontSize: "3rem", lineHeight: 1, marginBottom: 8 }}>🏆</div>
            <div style={{
              fontSize: "0.65rem", fontWeight: 700, color: "var(--text-subtle)",
              textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6,
            }}>
              {year || ""} Season Champions
            </div>
            <div style={{
              fontSize: "2rem", fontWeight: 900, letterSpacing: "1px",
              color: champion.color || "#FFD60A",
            }}>
              {champion.name || champion.abbr}
            </div>
          </div>
        )}

        {/* Offseason header */}
        <div style={{
          background: "linear-gradient(135deg,rgba(255,215,10,0.08),transparent)",
          border: "1px solid rgba(255,215,10,0.2)",
          borderRadius: 14, padding: "14px 16px", marginBottom: 16,
          textAlign: "center",
        }}>
          <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "var(--text)", marginBottom: 4 }}>
            Offseason Central
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {retirements.length} retirements · {hofClass.length} HOF inductees ·{" "}
            {draftOrder.length > 0 ? `${draftOrder.length}-round draft` : "Draft TBD"}
          </div>
        </div>

        {/* Retirements */}
        {retirements.length > 0 && (
          <Section title={`🏁 Retirements (${retirements.length})`} defaultOpen={true}>
            {retirements.map((p, i) => (
              <PlayerRow key={i} player={p} badge="Retired" badgeColor="#9FB0C2" />
            ))}
          </Section>
        )}

        {/* Hall of Fame */}
        <Section title={`⭐ Hall of Fame Class`} defaultOpen={hofClass.length > 0}>
          <HOFCarousel inductees={hofClass} />
        </Section>

        {/* Draft order */}
        {draftOrder.length > 0 && (
          <Section title="📋 Draft Order Preview">
            <div style={{ paddingTop: 8 }}>
              {draftOrder.slice(0, 10).map((pick, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: i < 3 ? "rgba(255,214,10,0.15)" : "rgba(255,255,255,0.05)",
                    border: `1px solid ${i < 3 ? "rgba(255,214,10,0.3)" : "var(--hairline)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.7rem", fontWeight: 800,
                    color: i < 3 ? "#FFD60A" : "var(--text-muted)",
                    flexShrink: 0,
                  }}>
                    {pick.pick || i + 1}
                  </div>
                  <div style={{ flex: 1, fontSize: "0.8rem", fontWeight: 600, color: "var(--text)" }}>
                    {pick.teamName || pick.abbr || `Team ${i + 1}`}
                  </div>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-subtle)" }}>
                    {pick.abbr || ""}
                  </div>
                </div>
              ))}
              {draftOrder.length > 10 && (
                <div style={{ textAlign: "center", padding: "8px 0",
                  fontSize: "0.65rem", color: "var(--text-subtle)" }}>
                  +{draftOrder.length - 10} more picks…
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Top Free Agents */}
        {topFreeAgents.length > 0 && (
          <Section title="💸 Notable Free Agents">
            {topFreeAgents.slice(0, 8).map((p, i) => (
              <PlayerRow key={i} player={p} badge="UFA" badgeColor="#0A84FF" />
            ))}
          </Section>
        )}

        {/* Begin new season CTA */}
        <button
          onClick={onBeginSeason}
          style={{
            width: "100%", padding: "16px",
            background: "linear-gradient(135deg,#0A84FF,#5E5CE6)",
            color: "#fff", border: "none", borderRadius: 14,
            fontWeight: 900, fontSize: "1rem", cursor: "pointer",
            boxShadow: "0 6px 24px rgba(10,132,255,0.4)",
            letterSpacing: "0.4px",
            marginTop: 8,
          }}
        >
          🚀 Begin New Season
        </button>
      </div>
    </div>
  );
}
