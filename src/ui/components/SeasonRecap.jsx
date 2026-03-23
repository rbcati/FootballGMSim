/**
 * SeasonRecap.jsx — Animated season summary with awards, stats, and highlights
 *
 * Provides a broadcast-style recap of the completed season with sequential
 * slide-in animations for each section.
 */

import React, { useState, useEffect, useMemo } from "react";

function AnimatedSection({ delay = 0, children, title, icon }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  if (!visible) return null;

  return (
    <div className="fade-in" style={{
      marginBottom: 16,
      animation: `slideInUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards`,
    }}>
      {title && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--hairline)",
        }}>
          {icon && <span style={{ fontSize: 20 }}>{icon}</span>}
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: "var(--surface-strong, #1a1a2e)", borderRadius: "var(--radius-md, 8px)",
      padding: "12px", textAlign: "center",
    }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: color || "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-subtle)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function PlayerAwardCard({ name, pos, team, ovr, stat, awardName, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
      background: "var(--surface-strong, #1a1a2e)", borderRadius: "var(--radius-md, 8px)",
      cursor: "pointer", border: "1px solid var(--hairline)",
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: "50%",
        background: "linear-gradient(135deg, #FFD700, #FFA500)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, fontWeight: 900, color: "#1a1a2e",
      }}>
        {pos}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{name}</div>
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{team} · {awardName}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <span className="ovr-pill" style={{ fontWeight: 800 }}>{ovr}</span>
        {stat && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{stat}</div>}
      </div>
    </div>
  );
}

function ConfettiOverlay() {
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, height: 200,
      overflow: "hidden", pointerEvents: "none", zIndex: 10,
    }}>
      {Array.from({ length: 30 }, (_, i) => {
        const colors = ["#FFD700", "#FF6B35", "#0A84FF", "#34C759", "#FF453A", "#5E5CE6"];
        const color = colors[i % colors.length];
        const left = Math.random() * 100;
        const delay = Math.random() * 2;
        const size = 4 + Math.random() * 6;
        return (
          <div key={i} style={{
            position: "absolute",
            left: `${left}%`,
            top: -10,
            width: size, height: size * 0.6,
            background: color,
            borderRadius: 1,
            animation: `confettiFall ${2 + Math.random()}s ${delay}s ease-in forwards`,
            transform: `rotate(${Math.random() * 360}deg)`,
          }} />
        );
      })}
    </div>
  );
}

export default function SeasonRecap({ league, onPlayerSelect, onTeamSelect }) {
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(t);
  }, []);

  const teams = league?.teams || [];
  const userTeam = teams.find(t => t.id === league?.userTeamId);
  const year = league?.year ?? 2025;

  // Find champion
  const champion = league?.championTeamId
    ? teams.find(t => t.id === league.championTeamId)
    : teams.sort((a, b) => b.wins - a.wins)[0];

  // Generate mock awards from team data
  const awards = useMemo(() => {
    if (!teams.length) return {};

    // Simplified award generation from available data
    const sorted = [...teams].sort((a, b) => b.ptsFor - a.ptsFor);
    const bestOffense = sorted[0];
    const bestDefense = [...teams].sort((a, b) => a.ptsAgainst - b.ptsAgainst)[0];
    const mostImproved = teams[Math.floor(Math.random() * teams.length)];

    return { bestOffense, bestDefense, mostImproved };
  }, [teams]);

  // Standing rankings
  const standings = useMemo(() => {
    return [...teams].sort((a, b) => {
      const aWp = (a.wins + 0.5 * (a.ties || 0)) / Math.max(1, a.wins + a.losses + (a.ties || 0));
      const bWp = (b.wins + 0.5 * (b.ties || 0)) / Math.max(1, b.wins + b.losses + (b.ties || 0));
      return bWp - aWp;
    });
  }, [teams]);

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", position: "relative" }}>
      <style>{`
        @keyframes slideInUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(250px) rotate(720deg); opacity: 0; }
        }
        @keyframes trophyBounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>

      {showConfetti && <ConfettiOverlay />}

      {/* Champion Banner */}
      <AnimatedSection delay={0}>
        <div style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #2d1f4e 50%, #1a1a2e 100%)",
          borderRadius: "var(--radius-lg, 12px)", padding: 24, textAlign: "center",
          border: "2px solid #FFD700", position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            background: "radial-gradient(circle at 50% 0%, rgba(255,215,0,0.15), transparent 70%)",
          }} />
          <div style={{
            fontSize: 48, marginBottom: 8,
            animation: "trophyBounce 2s ease-in-out infinite",
          }}>🏆</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#FFD700", textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>
            {year} Season Champion
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "white", marginBottom: 4 }}>
            {champion?.name || "TBD"}
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", fontVariantNumeric: "tabular-nums" }}>
            {champion?.wins ?? 0}-{champion?.losses ?? 0} · Pts For: {champion?.ptsFor ?? 0}
          </div>
        </div>
      </AnimatedSection>

      {/* Your Team Summary */}
      {userTeam && (
        <AnimatedSection delay={500} title="Your Season" icon="🏈">
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
          }}>
            <StatCard
              label="Record"
              value={`${userTeam.wins}-${userTeam.losses}`}
              color={userTeam.wins > userTeam.losses ? "var(--success)" : "var(--danger)"}
            />
            <StatCard
              label="Points For"
              value={userTeam.ptsFor ?? 0}
              sub={`${Math.round((userTeam.ptsFor ?? 0) / Math.max(1, userTeam.wins + userTeam.losses))} PPG`}
            />
            <StatCard
              label="Points Against"
              value={userTeam.ptsAgainst ?? 0}
              sub={`${Math.round((userTeam.ptsAgainst ?? 0) / Math.max(1, userTeam.wins + userTeam.losses))} PPG`}
            />
          </div>
          <div style={{
            marginTop: 8, padding: 10, borderRadius: "var(--radius-md, 8px)",
            background: "var(--surface-strong, #1a1a2e)", fontSize: 12, color: "var(--text-muted)",
          }}>
            <strong style={{ color: "var(--text)" }}>{userTeam.name}</strong> finished the season ranked{" "}
            <strong style={{ color: "var(--accent)" }}>
              #{standings.findIndex(t => t.id === userTeam.id) + 1}
            </strong>{" "}
            overall with a team OVR of {userTeam.ovr}.
          </div>
        </AnimatedSection>
      )}

      {/* Team Superlatives */}
      <AnimatedSection delay={1000} title="Team Superlatives" icon="⭐">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {awards.bestOffense && (
            <div onClick={() => onTeamSelect?.(awards.bestOffense.id)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              background: "var(--surface-strong, #1a1a2e)", borderRadius: "var(--radius-md, 8px)",
              cursor: "pointer",
            }}>
              <span style={{ fontSize: 20 }}>⚔️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Best Offense</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{awards.bestOffense.name}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--success)", fontVariantNumeric: "tabular-nums" }}>
                {awards.bestOffense.ptsFor} pts
              </div>
            </div>
          )}
          {awards.bestDefense && (
            <div onClick={() => onTeamSelect?.(awards.bestDefense.id)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              background: "var(--surface-strong, #1a1a2e)", borderRadius: "var(--radius-md, 8px)",
              cursor: "pointer",
            }}>
              <span style={{ fontSize: 20 }}>🛡️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Best Defense</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{awards.bestDefense.name}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>
                {awards.bestDefense.ptsAgainst} pts allowed
              </div>
            </div>
          )}
        </div>
      </AnimatedSection>

      {/* Final Standings */}
      <AnimatedSection delay={1500} title="Final Standings" icon="📊">
        <div className="stat-box" style={{ overflow: "hidden" }}>
          {standings.slice(0, 16).map((team, i) => {
            const isUser = team.id === league?.userTeamId;
            const isChamp = team.id === champion?.id;
            const wp = ((team.wins + 0.5 * (team.ties || 0)) / Math.max(1, team.wins + team.losses + (team.ties || 0))).toFixed(3);
            return (
              <div key={team.id} onClick={() => onTeamSelect?.(team.id)} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                borderBottom: "1px solid var(--hairline)", cursor: "pointer",
                background: isUser ? "var(--accent)" + "0d" : isChamp ? "rgba(255,215,0,0.05)" : "transparent",
              }}>
                <div style={{ width: 20, fontSize: 11, fontWeight: 800, color: "var(--text-subtle)", textAlign: "center" }}>
                  {i + 1}
                </div>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: isChamp ? "rgba(255,215,0,0.15)" : "var(--surface-strong, #1a1a2e)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 900, color: isChamp ? "#FFD700" : "var(--text-muted)",
                }}>
                  {team.abbr?.slice(0, 3)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                    {team.name}
                    {isChamp && <span style={{ marginLeft: 4, fontSize: 10 }}>🏆</span>}
                    {isUser && <span style={{ marginLeft: 4, fontSize: 9, color: "var(--accent)" }}>(You)</span>}
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                  {team.wins}-{team.losses}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", width: 35, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {wp}
                </div>
              </div>
            );
          })}
        </div>
      </AnimatedSection>

      {/* League Stats */}
      <AnimatedSection delay={2000} title="League Stats" icon="📈">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          <StatCard
            label="Total Points"
            value={teams.reduce((s, t) => s + (t.ptsFor ?? 0), 0)}
          />
          <StatCard
            label="Avg Team OVR"
            value={teams.length ? Math.round(teams.reduce((s, t) => s + t.ovr, 0) / teams.length) : 0}
          />
          <StatCard
            label="Games Played"
            value={Math.round(teams.reduce((s, t) => s + t.wins + t.losses + (t.ties || 0), 0) / 2)}
          />
          <StatCard
            label="Avg PPG"
            value={(() => {
              const totalGames = teams.reduce((s, t) => s + t.wins + t.losses + (t.ties || 0), 0) / 2;
              const totalPts = teams.reduce((s, t) => s + (t.ptsFor ?? 0), 0);
              return totalGames > 0 ? Math.round(totalPts / totalGames / 2) : 0;
            })()}
            sub="per team"
          />
        </div>
      </AnimatedSection>

      {/* Share Button */}
      <AnimatedSection delay={2500}>
        <button
          onClick={() => {
            const text = `${year} Season Recap\n🏆 Champion: ${champion?.name || "TBD"} (${champion?.wins}-${champion?.losses})\n${userTeam ? `My team: ${userTeam.name} (${userTeam.wins}-${userTeam.losses})` : ""}\n#FootballGMSim`;
            navigator.clipboard?.writeText(text);
          }}
          style={{
            width: "100%", padding: 12, fontSize: 13, fontWeight: 700,
            background: "var(--surface-strong, #1a1a2e)", color: "var(--text)",
            border: "1px solid var(--hairline)", borderRadius: "var(--radius-md, 8px)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          📋 Copy Season Summary
        </button>
      </AnimatedSection>
    </div>
  );
}
