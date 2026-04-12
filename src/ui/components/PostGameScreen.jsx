/**
 * PostGameScreen.jsx — Post-game results summary
 *
 * Shown after a game simulation completes (or after advancing week).
 * Displays:
 *  - Final score hero
 *  - W/L/T result for the user team
 *  - Game Leaders (QB stat line, top receiver, top rusher) via PlayerCards
 *  - Key stat highlights
 *  - Continue button
 */

import React, { useMemo, useState, Component } from "react";
import PlayerCard from "./PlayerCard.jsx";
import AdvancedStats from "./AdvancedStats.jsx";

// ── Error boundary so a crash here never freezes the whole app ────────────────
class PostGameErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { crashed: false }; }
  static getDerivedStateFromError() { return { crashed: true }; }
  componentDidCatch(err) { console.error('[PostGameScreen] render crash:', err); }
  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9700,
        background: "rgba(0,0,0,0.92)", display: "flex",
        alignItems: "center", justifyContent: "center", flexDirection: "column",
        gap: 16, padding: 24,
      }}>
        <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#FF453A" }}>
          Game recap failed
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", textAlign: "center" }}>
          Returning you to the Weekly Hub…
        </div>
        <button
          onClick={this.props.onContinue}
          style={{
            padding: "12px 28px", background: "#0A84FF", color: "#fff",
            border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer",
          }}
        >
          Back to Hub →
        </button>
      </div>
    );
  }
}

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

// Derive game leaders from play logs (accumulated stats per player)
function useGameLeaders(logs) {
  return useMemo(() => {
    const empty = { qb: null, receiver: null, rusher: null, defender: null };
    try {
      if (!Array.isArray(logs) || !logs.length) return empty;
      const acc = {};
      const addP = (p, key, val = 1) => {
        if (!p || typeof p !== "object") return;
        const id = String(p.id ?? p.name ?? "?");
        if (!acc[id]) acc[id] = { ref: p, passAtt: 0, passComp: 0, passYds: 0, passTDs: 0, rushAtt: 0, rushYds: 0, rushTDs: 0, receptions: 0, recYds: 0, recTDs: 0, sacks: 0, ints: 0, tackles: 0, passDefls: 0, forcedFumbles: 0 };
        acc[id][key] = (acc[id][key] || 0) + (Number(val) || 0);
      };
      for (const l of logs) {
        if (!l || typeof l !== "object") continue;
        if (l.passer) {
          addP(l.passer, "passAtt");
          if (l.completed) { addP(l.passer, "passComp"); addP(l.passer, "passYds", l.passYds || l.yards || 0); }
          if (l.isTouchdown && l.tdType === "pass") addP(l.passer, "passTDs");
        }
        if (l.rushYds != null && l.player && (l.type === "run" || l.tdType === "rush")) {
          addP(l.player, "rushAtt");
          addP(l.player, "rushYds", l.rushYds || l.yards || 0);
          if (l.isTouchdown) addP(l.player, "rushTDs");
        }
        if (l.recYds != null && l.player && l.completed) {
          addP(l.player, "receptions");
          addP(l.player, "recYds", l.recYds || l.yards || 0);
          if (l.isTouchdown && l.tdType === "pass") addP(l.player, "recTDs");
        }
        if (l.type === "sack" && l.player) addP(l.player, "sacks");
        if (l.type === "interception" && l.player) addP(l.player, "ints");
        if (l.tackler) addP(l.tackler, "tackles");
        if (l.defender) addP(l.defender, "passDefls");
        if (l.forcedFumble) addP(l.forcedFumble, "forcedFumbles");
      }
      const players = Object.values(acc);
      const qb = players.filter(p => p.ref?.pos === "QB").sort((a, b) => b.passYds - a.passYds)[0] || null;
      const receiver = players.filter(p => p.ref?.pos !== "QB" && p.recYds > 0).sort((a, b) => b.recYds - a.recYds)[0] || null;
      const rusher = players.filter(p => p.ref?.pos !== "QB" && p.rushYds > 0 && p !== receiver).sort((a, b) => b.rushYds - a.rushYds)[0] || null;
      const defender = players
        .filter(p => p.sacks > 0 || p.ints > 0 || p.tackles > 0 || p.passDefls > 0 || p.forcedFumbles > 0)
        .sort((a, b) => (b.sacks * 4 + b.ints * 5 + b.tackles * 1 + b.passDefls * 2 + b.forcedFumbles * 3)
                      - (a.sacks * 4 + a.ints * 5 + a.tackles * 1 + a.passDefls * 2 + a.forcedFumbles * 3))[0] || null;
      return { qb, receiver, rusher, defender };
    } catch (err) {
      console.error('[useGameLeaders] error:', err);
      return empty;
    }
  }, [logs]);
}

function LeaderCard({ label, statLine, player, color }) {
  if (!player) return null;
  const p = player.ref;
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--hairline)",
      borderRadius: 12, padding: "12px 14px",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
        background: `${color}20`, border: `2px solid ${color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.68rem", fontWeight: 900, color,
      }}>
        {p?.pos || "?"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p?.name || "?"}
        </div>
        <div style={{ fontSize: "0.72rem", color, fontWeight: 700, marginTop: 1 }}>
          {statLine}
        </div>
      </div>
    </div>
  );
}

function PostGameScreenInner({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  userTeamId,
  mvpPlayer,          // optional player object (legacy)
  stats = {},         // { totalYards, passYards, rushYards, turnovers }
  logs = [],          // play-by-play logs for deriving leaders
  boxScoreGameId,
  onOpenBoxScore,
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

  const [activeTab, setActiveTab] = useState("leaders"); // "leaders" | "grades"
  // Show "Game Saved ✓" for 3 seconds on mount to confirm the auto-save happened
  const [showSaved, setShowSaved] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setShowSaved(false), 3000);
    return () => clearTimeout(t);
  }, []);

  const { qb, receiver, rusher, defender } = useGameLeaders(logs);
  const notableMoments = (logs || [])
    .filter((l) => l?.isTouchdown || l?.turnover || /field goal|sack|interception|fumble/i.test(l?.text ?? ""))
    .slice(-5)
    .reverse();

  // Build leader stat lines
  const qbLine = qb
    ? `${qb.passComp}/${qb.passAtt} · ${qb.passYds} yds${qb.passTDs > 0 ? ` · ${qb.passTDs} TD` : ""}`
    : null;
  const recLine = receiver
    ? `${receiver.receptions} rec · ${receiver.recYds} yds${receiver.recTDs > 0 ? ` · ${receiver.recTDs} TD` : ""}`
    : null;
  const rushLine = rusher
    ? `${rusher.rushAtt} car · ${rusher.rushYds} yds${rusher.rushTDs > 0 ? ` · ${rusher.rushTDs} TD` : ""}`
    : null;
  const defLine = defender
    ? [
        defender.tackles > 0 ? `${defender.tackles} tkl` : "",
        defender.sacks > 0 ? `${defender.sacks} sack${defender.sacks > 1 ? "s" : ""}` : "",
        defender.ints > 0 ? `${defender.ints} INT` : "",
        defender.passDefls > 0 ? `${defender.passDefls} PD` : "",
        defender.forcedFumbles > 0 ? `${defender.forcedFumbles} FF` : "",
      ].filter(Boolean).join(" · ")
    : null;

  const showLeaders = qb || receiver || rusher || defender;

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
            {/* Auto-save confirmation toast */}
            <div style={{
              marginTop: 10,
              height: 22,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {showSaved && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 10px",
                  background: "#34C75918",
                  border: "1px solid #34C75940",
                  borderRadius: 20,
                  fontSize: "0.65rem", fontWeight: 700, color: "#34C759",
                  animation: "fadeSlideIn 0.3s ease-out",
                }}>
                  ✓ Game saved
                </div>
              )}
            </div>
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
            <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
              <button
                className="btn-link"
                type="button"
                onClick={() => boxScoreGameId && onOpenBoxScore?.(boxScoreGameId)}
                disabled={!boxScoreGameId}
                style={{ cursor: boxScoreGameId ? "pointer" : "not-allowed", fontWeight: 700 }}
              >
                {boxScoreGameId ? "View Box Score ›" : "Box score unavailable"}
              </button>
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

          <div style={{ marginBottom: 12, background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <strong style={{ fontSize: "0.8rem" }}>Game Center recap</strong>
              <button className="btn" style={{ padding: "6px 10px", fontSize: "0.72rem" }} onClick={() => setShowDetails((v) => !v)}>
                {showDetails ? "Hide details" : "Expand details"}
              </button>
            </div>
            {showDetails && (
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                {notableMoments.length === 0 ? (
                  <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>No notable moments logged for this game.</div>
                ) : notableMoments.map((m, i) => (
                  <div key={i} style={{ fontSize: "0.74rem", color: "var(--text-muted)", padding: "6px 8px", background: "var(--surface-strong)", borderRadius: 8 }}>
                    Q{m.quarter ?? "?"} {m.clock ?? ""} · {m.text ?? "Momentum swing"}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Tab switcher (Leaders / Grades) ── */}
          {(showLeaders || logs.length > 0) && (
            <div style={{
              display: "flex", background: "var(--surface)",
              border: "1px solid var(--hairline)", borderRadius: 10,
              padding: 3, marginBottom: 12, gap: 3,
            }}>
              {[["leaders","🎖 Leaders"], ["grades","📊 Grades"]].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  style={{
                    flex: 1, padding: "7px 0",
                    background: activeTab === key ? resultColor : "transparent",
                    color: activeTab === key ? (resultColor === "#FFD60A" ? "#000" : "#fff") : "var(--text-muted)",
                    border: "none", borderRadius: 8,
                    fontWeight: 800, fontSize: "0.75rem", cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* ── Game Leaders ── */}
          {activeTab === "leaders" && showLeaders && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {qb && qbLine && (
                  <LeaderCard label="Passing" statLine={qbLine} player={qb} color="#FF9F0A" />
                )}
                {receiver && recLine && (
                  <LeaderCard label="Receiving" statLine={recLine} player={receiver} color="#0A84FF" />
                )}
                {rusher && rushLine && (
                  <LeaderCard label="Rushing" statLine={rushLine} player={rusher} color="#34C759" />
                )}
                {defender && defLine && (
                  <LeaderCard label="Defense" statLine={defLine} player={defender} color="#FF453A" />
                )}
              </div>
            </div>
          )}

          {/* ── PFF Grades tab ── */}
          {activeTab === "grades" && logs.length > 0 && (
            <div style={{ marginBottom: 16, background: "var(--surface)", borderRadius: 12, overflow: "hidden", border: "1px solid var(--hairline)" }}>
              <AdvancedStats logs={logs} homeTeam={homeTeam} awayTeam={awayTeam} />
            </div>
          )}

          {/* Legacy MVP card (fallback when no logs) */}
          {!showLeaders && mvpPlayer && (
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

// Wrap with error boundary so a crash here returns user to hub gracefully
export default function PostGameScreen(props) {
  return (
    <PostGameErrorBoundary onContinue={props.onContinue}>
      <PostGameScreenInner {...props} />
    </PostGameErrorBoundary>
  );
}
