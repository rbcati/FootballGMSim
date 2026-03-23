/**
 * PostGameScreen.jsx — Post-game results summary
 *
 * Shown after a game simulation completes (or after advancing week).
 * Displays:
 *  - Final score hero
 *  - W/L/T result for the user team
 *  - Game MVP using PlayerCard (hero variant)
 *  - Key stat highlights
 *  - Continue button
 */

import React, { useMemo } from "react";
import PlayerCard from "./PlayerCard.jsx";

function teamColor(abbr = "") {
  const palette = [
    "#0A84FF","#34C759","#FF9F0A","#FF453A","#5E5CE6",
    "#64D2FF","#FFD60A","#30D158","#FF6961","#AEC6CF",
    "#FF6B35","#B4A0E5",
  ];
  let h = 0;
  for (let i = 0; i < abbr.length; i++) h = abbr.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

function StatPill({ label, value, color = "var(--text-muted)" }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "10px 16px",
      background: "var(--surface)",
      border: "1px solid var(--hairline)",
      borderRadius: 10,
      minWidth: 80,
    }}>
      <div style={{ fontSize: "1.2rem", fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-subtle)",
        textTransform: "uppercase", letterSpacing: "0.8px", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

// Simple confetti
function Confetti({ colors }) {
  const particles = useMemo(() => Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 2.5,
    color: colors[i % colors.length],
    size: 5 + Math.random() * 7,
    duration: 2 + Math.random() * 2,
  })), []); // eslint-disable-line

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 9800 }}>
      <style>{`
        @keyframes pgConfetti {
          from { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          to   { transform: translateY(110vh) rotate(540deg); opacity: 0; }
        }
      `}</style>
      {particles.map(p => (
        <div key={p.id} style={{
          position: "absolute", top: 0, left: `${p.x}%`,
          width: p.size, height: p.size * 0.55,
          background: p.color, borderRadius: 2,
          animation: `pgConfetti ${p.duration}s ${p.delay}s linear forwards`,
        }} />
      ))}
    </div>
  );
}

export default function PostGameScreen({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  userTeamId,
  mvpPlayer,          // optional player object
  stats = {},         // { totalYards, passYards, rushYards, turnovers }
  onContinue,
  week,
  phase,
}) {
  const hColor = teamColor(homeTeam?.abbr || "HME");
  const aColor = teamColor(awayTeam?.abbr || "AWY");

  const homeWon = homeScore > awayScore;
  const tied = homeScore === awayScore;
  const userIsHome = homeTeam?.id === userTeamId;
  const userIsAway = awayTeam?.id === userTeamId;
  const userWon = (userIsHome && homeWon) || (userIsAway && !homeWon && !tied);
  const userLost = (userIsHome && !homeWon && !tied) || (userIsAway && homeWon);

  const resultColor = userWon ? "#34C759" : userLost ? "#FF453A" : "#FFD60A";
  const resultEmoji = userWon ? "🏆" : userLost ? "😔" : tied ? "🤝" : "🏈";
  const resultLabel = userWon ? "VICTORY!" : userLost ? "DEFEAT" : tied ? "TIE" : "FINAL";

  const winnerAbbr = homeWon ? homeTeam?.abbr : awayTeam?.abbr;
  const winnerScore = homeWon ? homeScore : awayScore;
  const loserScore = homeWon ? awayScore : homeScore;

  return (
    <>
      {userWon && <Confetti colors={[hColor, aColor, "#FFD700", "#fff"]} />}

      <div style={{
        position: "fixed", inset: 0, zIndex: 9700,
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(16px)",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "24px 16px 80px",
      }}>
        <div style={{ width: "100%", maxWidth: 420 }}>

          {/* Result banner */}
          <div style={{
            textAlign: "center", marginBottom: 24,
            animation: "fadeSlideIn 0.4s ease-out",
          }}>
            <style>{`
              @keyframes fadeSlideIn {
                from { opacity: 0; transform: translateY(16px); }
                to   { opacity: 1; transform: translateY(0); }
              }
            `}</style>
            <div style={{ fontSize: "3.5rem", lineHeight: 1, marginBottom: 10 }}>{resultEmoji}</div>
            <div style={{
              fontSize: "2rem", fontWeight: 900, letterSpacing: "2px",
              color: resultColor, marginBottom: 4,
            }}>
              {resultLabel}
            </div>
            {week && (
              <div style={{ fontSize: "0.72rem", color: "var(--text-subtle)", fontWeight: 600 }}>
                Week {week} · {phase === "playoffs" ? "Playoffs" : "Regular Season"}
              </div>
            )}
          </div>

          {/* Score card */}
          <div style={{
            background: "var(--surface)",
            border: "1.5px solid var(--hairline)",
            borderRadius: 16,
            padding: "20px 24px",
            marginBottom: 16,
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              {/* Away */}
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{
                  width: 52, height: 52, borderRadius: "50%", margin: "0 auto 8px",
                  background: `${aColor}20`, border: `2.5px solid ${aColor}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: 14, color: aColor,
                }}>
                  {awayTeam?.abbr?.slice(0, 3) ?? "AWY"}
                </div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 4 }}>
                  {awayTeam?.name ?? awayTeam?.abbr ?? "Away"}
                </div>
                <div style={{
                  fontSize: "2.8rem", fontWeight: 900,
                  color: !homeWon && !tied ? aColor : "var(--text-muted)",
                  fontVariantNumeric: "tabular-nums", lineHeight: 1,
                }}>
                  {awayScore}
                </div>
              </div>

              <div style={{ textAlign: "center", padding: "0 12px" }}>
                <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--text-subtle)",
                  letterSpacing: "1px", textTransform: "uppercase" }}>
                  FINAL
                </div>
              </div>

              {/* Home */}
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{
                  width: 52, height: 52, borderRadius: "50%", margin: "0 auto 8px",
                  background: `${hColor}20`, border: `2.5px solid ${hColor}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: 14, color: hColor,
                }}>
                  {homeTeam?.abbr?.slice(0, 3) ?? "HME"}
                </div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 4 }}>
                  {homeTeam?.name ?? homeTeam?.abbr ?? "Home"}
                </div>
                <div style={{
                  fontSize: "2.8rem", fontWeight: 900,
                  color: homeWon ? hColor : "var(--text-muted)",
                  fontVariantNumeric: "tabular-nums", lineHeight: 1,
                }}>
                  {homeScore}
                </div>
              </div>
            </div>
          </div>

          {/* Stats grid */}
          {(stats.totalYards != null || stats.passYards != null || stats.turnovers != null) && (
            <div style={{
              display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center",
              marginBottom: 16,
            }}>
              {stats.totalYards != null && (
                <StatPill label="Total Yds" value={stats.totalYards} color="var(--accent)" />
              )}
              {stats.passYards != null && (
                <StatPill label="Pass Yds" value={stats.passYards} color="#0A84FF" />
              )}
              {stats.rushYards != null && (
                <StatPill label="Rush Yds" value={stats.rushYards} color="#34C759" />
              )}
              {stats.turnovers != null && (
                <StatPill label="Turnovers" value={stats.turnovers}
                  color={stats.turnovers > 2 ? "#FF453A" : "var(--text-muted)"} />
              )}
            </div>
          )}

          {/* MVP card */}
          {mvpPlayer && (
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: "0.65rem", fontWeight: 800, color: "var(--text-subtle)",
                textTransform: "uppercase", letterSpacing: "1px",
                textAlign: "center", marginBottom: 8,
              }}>
                ⭐ Game MVP
              </div>
              <PlayerCard player={mvpPlayer} variant="standard" />
            </div>
          )}

          {/* Continue button */}
          <button
            onClick={onContinue}
            style={{
              width: "100%", padding: "16px",
              background: resultColor,
              color: resultColor === "#FFD60A" ? "#000" : "#fff",
              border: "none", borderRadius: 12,
              fontWeight: 900, fontSize: "1rem", cursor: "pointer",
              letterSpacing: "0.5px",
              boxShadow: `0 4px 20px ${resultColor}44`,
            }}
          >
            Back to Hub →
          </button>
        </div>
      </div>
    </>
  );
}
